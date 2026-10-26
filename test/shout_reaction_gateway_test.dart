import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/shout_reaction_gateway.dart';

void main() {
  late List<ShoutReactionRequest> sent;
  late String? uid;
  late int sequence;
  late Future<void> Function(ShoutReactionRequest) transport;
  late ShoutReactionGateway gateway;

  setUp(() {
    sent = [];
    uid = 'alice';
    sequence = 0;
    transport = (_) async {};
    gateway = ShoutReactionGateway(
      currentUserId: () => uid,
      newKey: () => 'key-${++sequence}',
      isDefinitiveFailure: (error) => error == 'rejected',
      send: (request) async {
        sent.add(request);
        await transport(request);
      },
    );
  });

  Future<void> toggle([bool like = true, String shout = 'target']) =>
      gateway.toggle(userId: 'alice', shoutId: shout, like: like);

  test(
    'ambiguous retry keeps immutable payload; next successful click gets a new key',
    () async {
      transport = (_) async => throw 'offline';
      await expectLater(toggle(), throwsA('offline'));
      transport = (_) async {};
      await toggle();
      await toggle();
      expect(identical(sent[0], sent[1]), isTrue);
      expect(sent.map((r) => r.idempotencyKey), ['key-1', 'key-1', 'key-2']);
      expect(sent.first.toPayload(), {
        'expectedUserId': 'alice',
        'shoutId': 'target',
        'button': 'like',
        'idempotencyKey': 'key-1',
      });
    },
  );

  test(
    'definitive rejection clears the attempt for a fresh later click',
    () async {
      transport = (_) async => throw 'rejected';
      await expectLater(toggle(), throwsA('rejected'));
      transport = (_) async {};
      await toggle();
      expect(sent.map((r) => r.idempotencyKey), ['key-1', 'key-2']);
    },
  );

  test(
    'opposite click resolves the ambiguous old toggle before creating a new one',
    () async {
      transport = (_) async => throw 'offline';
      await expectLater(toggle(), throwsA('offline'));
      final resolving = Completer<void>();
      transport = (request) =>
          request.idempotencyKey == 'key-1' ? resolving.future : Future.value();
      final next = toggle(false);
      expect(sent.length, 2);
      expect(sent.last.button, 'like');
      resolving.complete();
      await next;
      expect(sent.map((r) => r.button), ['like', 'like', 'dislike']);
      expect(sent.last.idempotencyKey, 'key-2');
    },
  );

  test('another ambiguous failure prevents the opposite toggle', () async {
    transport = (_) async => throw 'offline';
    await expectLater(toggle(), throwsA('offline'));
    await expectLater(toggle(false), throwsA('offline'));
    expect(sent.map((r) => r.button), ['like', 'like']);
    expect(sequence, 1);
  });

  test(
    'rapid clicks share one in-flight mutation for the same account and Shout',
    () async {
      final response = Completer<void>();
      transport = (_) => response.future;
      final first = toggle();
      final second = toggle(false);
      expect(sent.length, 1);
      response.complete();
      await Future.wait([first, second]);
      await toggle(false);
      expect(sent.map((r) => r.button), ['like', 'dislike']);
    },
  );

  test('independent targets and accounts do not reuse pending keys', () async {
    transport = (_) async => throw 'offline';
    await expectLater(toggle(), throwsA('offline'));
    transport = (_) async {};
    await toggle(true, 'other');
    uid = 'bob';
    await gateway.toggle(userId: 'bob', shoutId: 'target', like: true);
    expect(sent.map((r) => r.idempotencyKey), ['key-1', 'key-2', 'key-3']);
    expect(sent.last.userId, 'bob');
  });

  test('account switch stops a pending retry before sending', () async {
    transport = (_) async => throw 'offline';
    await expectLater(toggle(), throwsA('offline'));
    uid = 'bob';
    await expectLater(toggle(), throwsA(isA<ReactionAccountChanged>()));
    expect(sent.length, 1);
  });

  test(
    'account switch during resolution stops the subsequent opposite toggle',
    () async {
      transport = (_) async => throw 'offline';
      await expectLater(toggle(), throwsA('offline'));
      final response = Completer<void>();
      transport = (_) => response.future;
      final next = toggle(false);
      final check = expectLater(next, throwsA(isA<ReactionAccountChanged>()));
      uid = 'bob';
      response.complete();
      await check;
      expect(sent.length, 2);
    },
  );
}
