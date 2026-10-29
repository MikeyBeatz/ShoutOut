import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/save_gateway.dart';

void main() {
  late List<SaveRequest> sent;
  late String? uid;
  late int sequence;
  late Future<void> Function(SaveRequest) transport;
  late SaveGateway gateway;

  setUp(() {
    sent = [];
    uid = 'alice';
    sequence = 0;
    transport = (_) async {};
    gateway = SaveGateway(
      currentUserId: () => uid,
      newKey: () => 'key-${++sequence}',
      send: (request) async {
        sent.add(request);
        await transport(request);
      },
    );
  });

  Future<void> click([String shout = 'target', String user = 'alice']) =>
      gateway.toggle(userId: user, shoutId: shout);

  test(
    'lost acknowledgements retry the immutable toggle; next click is new',
    () async {
      transport = (_) async => throw FirebaseFunctionsException(
        code: 'unavailable',
        message: 'offline',
      );
      await expectLater(click(), throwsA(isA<FirebaseFunctionsException>()));
      transport = (_) async {};
      await click();
      await click();
      expect(identical(sent[0], sent[1]), isTrue);
      expect(sent.map((r) => r.idempotencyKey), ['key-1', 'key-1', 'key-2']);
      expect(sent.first.toPayload(), {
        'expectedUserId': 'alice',
        'shoutId': 'target',
        'idempotencyKey': 'key-1',
      });
    },
  );

  test(
    'ambiguous errors retain the key and server rejections release it',
    () async {
      for (final code in [
        'deadline-exceeded',
        'internal',
        'unknown',
        'resource-exhausted',
      ]) {
        transport = (_) async =>
            throw FirebaseFunctionsException(code: code, message: 'test');
        await expectLater(click(), throwsA(isA<FirebaseFunctionsException>()));
      }
      transport = (_) async {};
      await click();
      expect(sent.map((r) => r.idempotencyKey), [
        'key-1',
        'key-1',
        'key-1',
        'key-1',
        'key-2',
      ]);
    },
  );

  test(
    'rapid clicks share one toggle; different Shouts remain independent',
    () async {
      final response = Completer<void>();
      transport = (_) => response.future;
      final first = click();
      final duplicate = click();
      final other = click('other');
      expect(sent.map((r) => r.shoutId), ['target', 'other']);
      response.complete();
      await Future.wait([first, duplicate, other]);
      await click();
      expect(sent.map((r) => r.idempotencyKey), ['key-1', 'key-2', 'key-3']);
    },
  );

  test('a different account never inherits an ambiguous attempt', () async {
    transport = (_) async => throw FirebaseFunctionsException(
      code: 'unavailable',
      message: 'offline',
    );
    await expectLater(click(), throwsA(isA<FirebaseFunctionsException>()));
    uid = 'bob';
    transport = (_) async {};
    await click('target', 'bob');
    expect(sent.last.userId, 'bob');
    expect(sent.last.idempotencyKey, 'key-2');
    await expectLater(click(), throwsA(isA<SaveAccountChanged>()));
    expect(sent.length, 2);
  });

  test('a signed-out attempt sends nothing', () async {
    uid = null;
    await expectLater(click(), throwsA(isA<SaveAccountChanged>()));
    expect(sent, isEmpty);
  });

  test('a rejection releases in-flight state for both rapid callers', () async {
    final response = Completer<void>();
    transport = (_) => response.future;
    final first = expectLater(
      click(),
      throwsA(isA<FirebaseFunctionsException>()),
    );
    final duplicate = expectLater(
      click(),
      throwsA(isA<FirebaseFunctionsException>()),
    );
    response.completeError(
      FirebaseFunctionsException(code: 'permission-denied', message: 'test'),
    );
    await Future.wait([first, duplicate]);
    transport = (_) async {};
    await click();
    expect(sent.map((r) => r.idempotencyKey), ['key-1', 'key-2']);
  });
}
