import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/archive_identity_client.dart';

void main() {
  Map<String, dynamic> page(List<Object> rows, {Map<String, dynamic>? next}) =>
      {
        'version': 1,
        'userId': 'admin',
        'action': 'lookup',
        'items': rows,
        'validForMillis': 60000,
        'next': next,
      };
  test(
    'failed later page preserves rows, cursor and exact retry; sparse page can continue',
    () async {
      final sent = <Map<String, dynamic>>[];
      var count = 0;
      final c = ArchiveIdentityController(
        userId: 'admin',
        currentUserId: () => 'admin',
        send: (data) async {
          sent.add(data);
          count++;
          if (count == 1) {
            return page(
              [
                {'accountKey': 'first'},
              ],
              next: {'id': 'one'},
            );
          }
          if (count == 2) throw StateError('lost response');
          if (count == 3) return page([], next: {'id': 'two'});
          return page([
            {'accountKey': 'last'},
          ]);
        },
      );
      addTearDown(c.dispose);
      await c.open({'action': 'lookup'});
      await c.more();
      expect(c.failed, isTrue);
      expect(c.items.single['accountKey'], 'first');
      await c.retry();
      expect(sent[1], sent[2]);
      expect(c.next?['id'], 'two');
      await c.more();
      expect(c.items.map((r) => r['accountKey']), ['first', 'last']);
      expect(c.next, isNull);
    },
  );
  test(
    'account switch, disposal and delayed prior selection cannot apply stale data',
    () async {
      String? user = 'admin';
      final replies = <Completer<Object?>>[];
      final c = ArchiveIdentityController(
        userId: 'admin',
        currentUserId: () => user,
        send: (_) {
          final reply = Completer<Object?>();
          replies.add(reply);
          return reply.future;
        },
      );
      final first = c.open({'action': 'lookup', 'value': 'first'});
      final second = c.open({'action': 'lookup', 'value': 'second'});
      replies[1].complete(
        page([
          {'accountKey': 'second'},
        ]),
      );
      await second;
      replies[0].complete(
        page([
          {'accountKey': 'first'},
        ]),
      );
      await first;
      expect(c.items.single['accountKey'], 'second');
      final third = c.open({'action': 'lookup'});
      user = 'other';
      replies[2].complete(
        page([
          {'accountKey': 'secret'},
        ]),
      );
      await third;
      expect(c.items, isEmpty);
      user = 'admin';
      final fourth = c.open({'action': 'lookup'});
      c.dispose();
      replies[3].complete(
        page([
          {'accountKey': 'secret'},
        ]),
      );
      await fourth;
      expect(c.items, isEmpty);
    },
  );
  test('oversized or mismatched responses are rejected', () async {
    final c = ArchiveIdentityController(
      userId: 'admin',
      currentUserId: () => 'admin',
      send: (_) async => page(List.generate(51, (_) => {'accountKey': 'x'})),
    );
    addTearDown(c.dispose);
    await c.open({'action': 'lookup'});
    expect(c.failed, isTrue);
    expect(c.items, isEmpty);
  });
  test(
    'an expired archive response clears local content without a new request',
    () async {
      var calls = 0;
      final c = ArchiveIdentityController(
        userId: 'admin',
        currentUserId: () => 'admin',
        send: (_) async {
          calls++;
          return {
            ...page([
              {'accountKey': 'expired'},
            ]),
            'validForMillis': 0,
          };
        },
      );
      addTearDown(c.dispose);
      await c.open({'action': 'lookup'});
      expect(c.items, isEmpty);
      expect(c.expired, isTrue);
      expect(c.loading, isFalse);
      await c.retry();
      expect(calls, 1);
    },
  );
}
