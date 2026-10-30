import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/timed_operation_gateway.dart';

void main() {
  final serverTime = DateTime.utc(2026, 10, 30, 12);
  Map<String, dynamic> payload() => {
    'idempotencyKey': 'logical-key',
    'shoutId': 'shout',
    'location': {'latitude': 50, 'longitude': 14},
  };

  test(
    'lost response and Auth refresh retain the same immutable timed payload',
    () async {
      var clockReads = 0;
      final sent = <Map<String, dynamic>>[];
      final gateway = TimedOperationGateway(
        currentUserId: () => 'author',
        issuedAt: (_) async => serverTime.add(Duration(hours: clockReads++)),
        newNonce: () => 'a' * 32,
        send: (_, data) async {
          sent.add(data);
          if (sent.length == 1) {
            throw FirebaseFunctionsException(
              code: 'unavailable',
              message: 'Lost response',
            );
          }
        },
      );
      Future<void> call() => gateway.call(
        userId: 'author',
        operation: 'createShout',
        payload: payload(),
      );
      await expectLater(call(), throwsA(isA<FirebaseFunctionsException>()));
      await call();
      await call(); // A retry after a later UI failure also retains its key.
      expect(clockReads, 1);
      expect(sent[1], sent[0]);
      expect(sent[2], sent[0]);
      expect(sent[0]['expectedUserId'], 'author');
      expect(
        sent[0]['idempotencyKey'],
        'op1_${serverTime.millisecondsSinceEpoch ~/ 1000}_${'a' * 32}',
      );
    },
  );

  test(
    'concurrent calls share clock acquisition and one outbound operation',
    () async {
      final clock = Completer<DateTime>();
      var reads = 0, sends = 0;
      final gateway = TimedOperationGateway(
        currentUserId: () => 'author',
        issuedAt: (_) {
          reads++;
          return clock.future;
        },
        send: (_, _) async {
          sends++;
        },
      );
      final first = gateway.call(
        userId: 'author',
        operation: 'createShout',
        payload: payload(),
      );
      final second = gateway.call(
        userId: 'author',
        operation: 'createShout',
        payload: payload(),
      );
      expect(reads, 1);
      clock.complete(serverTime);
      await Future.wait([first, second]);
      expect(sends, 1);
    },
  );

  test(
    'account switch during clock acquisition never sends under the new account',
    () async {
      String? user = 'author';
      final clock = Completer<DateTime>();
      var sends = 0;
      final gateway = TimedOperationGateway(
        currentUserId: () => user,
        issuedAt: (_) => clock.future,
        send: (_, _) async {
          sends++;
        },
      );
      final first = gateway.call(
        userId: 'author',
        operation: 'createShout',
        payload: payload(),
      );
      final assertion = expectLater(
        first,
        throwsA(
          isA<FirebaseFunctionsException>().having(
            (error) => error.code,
            'code',
            'unauthenticated',
          ),
        ),
      );
      user = 'business';
      clock.complete(serverTime);
      await assertion;
      user = null;
      await expectLater(
        gateway.call(
          userId: 'author',
          operation: 'createShout',
          payload: payload(),
        ),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(sends, 0);
    },
  );

  test(
    'changing a payload under a pending key is rejected and caller mutation cannot alter the frozen request',
    () async {
      final clock = Completer<DateTime>();
      final sent = <Map<String, dynamic>>[];
      final original = payload();
      final gateway = TimedOperationGateway(
        currentUserId: () => 'author',
        issuedAt: (_) => clock.future,
        send: (_, data) async {
          sent.add(data);
        },
      );
      final first = gateway.call(
        userId: 'author',
        operation: 'createShout',
        payload: original,
      );
      (original['location'] as Map)['latitude'] = 0;
      await expectLater(
        gateway.call(
          userId: 'author',
          operation: 'createShout',
          payload: original,
        ),
        throwsA(
          isA<FirebaseFunctionsException>().having(
            (error) => error.code,
            'code',
            'already-exists',
          ),
        ),
      );
      clock.complete(serverTime);
      await first;
      expect((sent.single['location'] as Map)['latitude'], 50);
      // Equivalent map insertion order must not look like a changed request.
      await gateway.call(
        userId: 'author',
        operation: 'createShout',
        payload: {
          'location': {'longitude': 14, 'latitude': 50},
          'shoutId': 'shout',
          'idempotencyKey': 'logical-key',
        },
      );
      expect(sent[1], sent[0]);
    },
  );

  test(
    'an expired uncertain attempt never fetches a new time or replaces its key',
    () async {
      var clockReads = 0;
      final sent = <Map<String, dynamic>>[];
      final gateway = TimedOperationGateway(
        currentUserId: () => 'author',
        issuedAt: (_) async {
          clockReads++;
          return serverTime;
        },
        send: (_, data) async {
          sent.add(data);
          throw FirebaseFunctionsException(
            code: 'failed-precondition',
            message: 'operation-expired',
          );
        },
      );
      for (var attempt = 0; attempt < 2; attempt++) {
        await expectLater(
          gateway.call(
            userId: 'author',
            operation: 'toggleShoutSave',
            payload: payload(),
          ),
          throwsA(isA<FirebaseFunctionsException>()),
        );
      }
      expect(clockReads, 1);
      expect(sent[1], sent[0]);
    },
  );

  test(
    'operation and account namespaces are independent and forged expected identity is rejected',
    () async {
      String? user = 'author';
      final sent = <Map<String, dynamic>>[];
      final gateway = TimedOperationGateway(
        currentUserId: () => user,
        issuedAt: (_) async => serverTime,
        send: (_, data) async {
          sent.add(data);
        },
      );
      await gateway.call(
        userId: 'author',
        operation: 'toggleShoutSave',
        payload: payload(),
      );
      await gateway.call(
        userId: 'author',
        operation: 'toggleShoutReaction',
        payload: payload(),
      );
      user = 'business';
      await gateway.call(
        userId: 'business',
        operation: 'toggleShoutSave',
        payload: payload(),
      );
      expect(sent.map((data) => data['idempotencyKey']).toSet().length, 3);
      await expectLater(
        gateway.call(
          userId: 'business',
          operation: 'createShout',
          payload: {...payload(), 'expectedUserId': 'author'},
        ),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(sent.length, 3);
    },
  );
}
