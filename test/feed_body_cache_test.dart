import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_body_cache.dart';

const scope = FeedBodyScope('shoutout-rules-test', 'reader');
FeedBodyPayload payload(String id, {String text = 'body'}) {
  final body = <String, dynamic>{'title': id, 'text': text};
  return FeedBodyPayload(id, feedBodyVersion(body), body);
}

FeedBodyPage page(
  List<FeedBodyPayload> bodies, {
  bool inline = false,
  int deadline = 2000,
  FeedBodyScope account = scope,
}) => FeedBodyPage(
  scope: account,
  context: 'nearest',
  deadline: deadline,
  token: 'signed',
  rows: bodies
      .map(
        (body) => FeedBodyDescriptor(
          id: body.id,
          version: body.version,
          read: false,
          state: {
            'bodyVersion': body.version,
            'status': 'active',
            'expiresAt': 4000,
          },
        ),
      )
      .toList(),
  bodies: inline ? bodies : [],
);

void main() {
  test(
    'actual server wire fixture decodes and assembles cold, warm and missing-body paths',
    () async {
      final fixture =
          jsonDecode(
                File('test/fixtures/feed_body_page.json').readAsStringSync(),
              )
              as Map<String, dynamic>;
      final cold = FeedBodyPage.fromWire(
        fixture['cold'] as Map<String, dynamic>,
      );
      final manifest = FeedBodyPage.fromWire(
        fixture['manifest'] as Map<String, dynamic>,
      );
      final completed = FeedBodyPage.fromWire(
        fixture['completed'] as Map<String, dynamic>,
      );
      final cache = FeedBodyCache(clock: () => 100)..bind(cold.scope);
      final assembler = FeedBodyPageAssembler(cache);
      final cards = await assembler.assemble(
        cold,
        complete: (_, _) async => throw StateError('unused'),
      );
      expect(cards.single.payload.body['title'], 'Shout český');
      await assembler.assemble(
        manifest,
        complete: (_, _) async => throw StateError('warm sends nothing'),
      );
      cache.clear();
      await assembler.assemble(
        manifest,
        complete: (token, missing) async {
          expect(token, manifest.token);
          expect(missing, ['wire']);
          return completed;
        },
      );
      expect(() => FeedBodyPage.fromWire({'schema': 1}), throwsFormatException);
    },
  );
  test(
    '200 bodies across four pages keep frozen cards while bounded cache evicts',
    () async {
      final cache = FeedBodyCache(clock: () => 100, maximumBytes: 16000)
        ..bind(scope);
      final assembler = FeedBodyPageAssembler(cache);
      final frozen = <FeedBodyCard>[];
      for (var p = 0; p < 4; p++) {
        final bodies = List.generate(
          50,
          (i) => payload('row-${p * 50 + i}', text: 'x' * 200),
        );
        frozen.addAll(
          await assembler.assemble(
            page(bodies, inline: true),
            complete: (_, _) async => throw StateError('unused'),
          ),
        );
        expect(cache.bytes, lessThanOrEqualTo(16000));
      }
      expect(frozen.length, 200);
      expect(frozen.first.payload.body['text'], 'x' * 200);
      expect(
        cache.get(
          scope,
          frozen.first.descriptor.id,
          frozen.first.descriptor.version,
        ),
        isNull,
      );
    },
  );
  test(
    'shared JS/Dart version vectors agree, including fractional timestamps',
    () {
      final vectors =
          jsonDecode(
                File('test/fixtures/feed_body_vectors.json').readAsStringSync(),
              )
              as List;
      for (final vector in vectors) {
        expect(
          feedBodyVersion(Map<String, dynamic>.from(vector['body'] as Map)),
          vector['version'],
        );
      }
    },
  );
  test(
    'cold inline page is atomic; warm page needs no body transfer, changed body only refills miss',
    () async {
      var now = 100;
      final cache = FeedBodyCache(clock: () => now)..bind(scope);
      final assembler = FeedBodyPageAssembler(cache);
      final bodies = List.generate(50, (i) => payload('row-$i'));
      var requests = 0;
      Future<FeedBodyPage> noSend(String token, List<String> missing) async {
        requests++;
        throw StateError('Unexpected transfer');
      }

      final first = await assembler.assemble(
        page(bodies, inline: true),
        complete: noSend,
      );
      expect(first.length, 50);
      expect(
        (await assembler.assemble(page(bodies), complete: noSend)).length,
        50,
      );
      expect(requests, 0);
      final changed = [...bodies]..[12] = payload('row-12', text: 'edited');
      await assembler.assemble(
        page(changed),
        complete: (token, missing) async {
          expect(missing, ['row-12']);
          final selected = page(changed);
          return FeedBodyPage(
            scope: scope,
            context: selected.context,
            deadline: selected.deadline,
            token: token,
            rows: selected.rows,
            bodies: [changed[12]],
          );
        },
      );
      now = 2000;
      await expectLater(
        assembler.assemble(page(bodies), complete: noSend),
        throwsStateError,
      );
      expect(
        first[12].payload.body['text'],
        'body',
      ); // Eviction/refill never rewrites frozen cards.
    },
  );
  test(
    'failed/poisoned/partial responses never commit page or cache',
    () async {
      final cache = FeedBodyCache(clock: () => 100)..bind(scope);
      final assembler = FeedBodyPageAssembler(cache), body = payload('a');
      await expectLater(
        assembler.assemble(
          page([body]),
          complete: (_, missing) async => page([body]),
        ),
        throwsFormatException,
      );
      expect(cache.bytes, 0);
      await expectLater(
        assembler.assemble(
          page([body]),
          complete: (_, missing) async {
            throw StateError('offline');
          },
        ),
        throwsStateError,
      );
      expect(cache.bytes, 0);
      final poison = FeedBodyPayload('a', body.version, {'title': 'tampered'});
      await expectLater(
        assembler.assemble(
          page([poison], inline: true),
          complete: (_, _) async => throw StateError('unused'),
        ),
        throwsFormatException,
      );
      expect(cache.bytes, 0);
    },
  );
  test(
    'account switch, project switch, deletion clear, disposal and lost response fence late completion',
    () async {
      for (final action in [
        'account',
        'project',
        'delete',
        'dispose',
        'cancel',
      ]) {
        final cache = FeedBodyCache(clock: () => 100)..bind(scope);
        final assembler = FeedBodyPageAssembler(cache), body = payload('a');
        final reply = Completer<FeedBodyPage>();
        final result = assembler.assemble(
          page([body]),
          complete: (_, _) => reply.future,
        );
        final expected = expectLater(result, throwsStateError);
        switch (action) {
          case 'account':
            cache.bind(const FeedBodyScope('shoutout-rules-test', 'other'));
          case 'project':
            cache.bind(const FeedBodyScope('another-project', 'reader'));
          case 'delete':
            cache.clear();
          case 'dispose':
            assembler.dispose();
          default:
            assembler.cancel();
        }
        reply.complete(page([body], inline: true));
        await expected;
        expect(cache.bytes, 0);
      }
    },
  );
  test('bounded LRU, original deadline, clock rollback and oversized body', () {
    var now = 100;
    final a = payload('a'), b = payload('b');
    final cache = FeedBodyCache(clock: () => now, maximumBytes: 130)
      ..bind(scope);
    cache.put(scope, a, 2000);
    cache.put(scope, b, 2000);
    expect(cache.bytes, lessThanOrEqualTo(130));
    expect(cache.get(scope, 'a', a.version), isNull);
    expect(cache.get(scope, 'b', b.version), isNotNull);
    now = 90;
    expect(cache.get(scope, 'b', b.version), isNull);
    cache.put(scope, a, 120);
    now = 120;
    expect(cache.get(scope, 'a', a.version), isNull);
    cache.put(scope, payload('big', text: 'x' * 1000), 2000);
    expect(cache.bytes, 0);
  });
  test(
    'selection validation rejects changed ordering/deadline and more than fifty cards',
    () async {
      final cache = FeedBodyCache(clock: () => 100)..bind(scope);
      final assembler = FeedBodyPageAssembler(cache),
          a = payload('a'),
          b = payload('b');
      await expectLater(
        assembler.assemble(
          page([a, b]),
          complete: (_, _) async => page([b, a], inline: true),
        ),
        throwsFormatException,
      );
      await expectLater(
        assembler.assemble(
          page([a]),
          complete: (_, _) async => page([a], inline: true, deadline: 2100),
        ),
        throwsFormatException,
      );
      await expectLater(
        assembler.assemble(
          page(List.generate(51, (i) => payload('r-$i')), inline: true),
          complete: (_, _) async => page([]),
        ),
        throwsFormatException,
      );
    },
  );
}
