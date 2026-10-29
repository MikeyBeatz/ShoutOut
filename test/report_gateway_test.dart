import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/report_gateway.dart';

void main() {
  late List<ContentReportRequest> sent;
  late String? uid;
  late int sequence;
  late Future<void> Function(ContentReportRequest) transport;
  late ReportGateway gateway;
  setUp(() {
    sent = [];
    uid = 'alice';
    sequence = 0;
    transport = (_) async {};
    gateway = ReportGateway(
      currentUserId: () => uid,
      newKey: () => 'key-${++sequence}',
      send: (r) async {
        sent.add(r);
        await transport(r);
      },
    );
  });
  Future<void> report({
    String user = 'alice',
    String type = 'shout',
    String shout = 'target',
    String? child,
    String reason = 'Spam',
  }) => gateway.submit(
    userId: user,
    shoutId: shout,
    targetType: type,
    targetId: child,
    reason: reason,
  );
  FirebaseFunctionsException failure(String code) =>
      FirebaseFunctionsException(code: code, message: 'Test failure');

  test(
    'lost acknowledgement retries the exact report without client snapshots',
    () async {
      transport = (_) async => throw failure('unavailable');
      await expectLater(
        report(type: 'privateReply', child: 'private'),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      transport = (_) async {};
      await report(type: 'privateReply', child: 'private');
      expect(identical(sent[0], sent[1]), isTrue);
      expect(sent.last.toPayload(), {
        'expectedUserId': 'alice',
        'shoutId': 'target',
        'targetType': 'privateReply',
        'targetId': 'private',
        'reason': 'Spam',
        'idempotencyKey': 'key-1',
      });
    },
  );

  test(
    'changed reasons have independent immutable keys; original draft still retries its own request',
    () async {
      transport = (_) async => throw failure('deadline-exceeded');
      await expectLater(report(), throwsA(isA<FirebaseFunctionsException>()));
      await expectLater(
        report(reason: 'Other reason'),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      transport = (_) async {};
      await report();
      expect(sent.map((r) => r.idempotencyKey), ['key-1', 'key-2', 'key-1']);
      expect(sent.last.reason, 'Spam');
    },
  );

  test(
    'definitive rejections release a draft; transport/internal failures retain it',
    () async {
      for (final code in [
        'unavailable',
        'internal',
        'unknown',
        'resource-exhausted',
      ]) {
        transport = (_) async => throw failure(code);
        await expectLater(report(), throwsA(isA<FirebaseFunctionsException>()));
      }
      transport = (_) async {};
      await report();
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
    'rapid submissions of the same target share one attempt even while reason changes',
    () async {
      final response = Completer<void>();
      transport = (_) => response.future;
      final first = report();
      final duplicate = report(reason: 'Changed during flight');
      expect(sent.length, 1);
      response.complete();
      await Future.wait([first, duplicate]);
      await report();
      expect(sent.map((r) => r.idempotencyKey), ['key-1', 'key-2']);
    },
  );

  test('target kinds, child IDs and accounts never collide', () async {
    transport = (_) async => throw failure('unavailable');
    await expectLater(report(), throwsA(isA<FirebaseFunctionsException>()));
    transport = (_) async {};
    await report(type: 'comment', child: 'first');
    await report(type: 'privateReply', child: 'first');
    await report(type: 'comment', child: 'second');
    uid = 'bob';
    await report(user: 'bob');
    expect(sent.map((r) => r.idempotencyKey), [
      'key-1',
      'key-2',
      'key-3',
      'key-4',
      'key-5',
    ]);
    expect(sent.first.toPayload().containsKey('targetId'), isFalse);
  });

  test(
    'account change or logout stops a pending retry before sending',
    () async {
      transport = (_) async => throw failure('unavailable');
      await expectLater(report(), throwsA(isA<FirebaseFunctionsException>()));
      uid = 'bob';
      await expectLater(report(), throwsA(isA<ReportAccountChanged>()));
      uid = null;
      await expectLater(report(), throwsA(isA<ReportAccountChanged>()));
      expect(sent.length, 1);
    },
  );

  test(
    'in-flight rejection reaches rapid callers and permits a fresh later attempt',
    () async {
      final response = Completer<void>();
      transport = (_) => response.future;
      final first = expectLater(
        report(),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      final duplicate = expectLater(
        report(),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      response.completeError(failure('already-exists'));
      await Future.wait([first, duplicate]);
      transport = (_) async {};
      await report();
      expect(sent.map((r) => r.idempotencyKey), ['key-1', 'key-2']);
    },
  );
}
