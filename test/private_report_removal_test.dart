import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/private_report_action_menu.dart';
import 'package:shoutout/private_report_removal_gateway.dart';
import 'package:shoutout/timed_operation_gateway.dart';
import 'package:shoutout/web_environment.dart';

void main() {
  test(
    'uncertain decision survives dismissal, freezes note/key and replays exactly once confirmed',
    () async {
      final payloads = <Map<String, dynamic>>[];
      final timed = TimedOperationGateway(
        currentUserId: () => 'mod',
        newNonce: () => 'a' * 32,
        issuedAt: (_) async => DateTime.utc(2026, 11, 23),
        send: (operation, data) async {
          expect(operation, 'removeReportedPrivateReply');
          payloads.add(data);
          if (payloads.length == 1) {
            throw FirebaseFunctionsException(
              code: 'unavailable',
              message: 'lost response',
            );
          }
        },
      );
      final gateway = PrivateReportRemovalGateway(
        currentUserId: () => 'mod',
        send: (r) => timed.call(
          attempt: r.timedAttempt,
          userId: r.userId,
          operation: 'removeReportedPrivateReply',
          payload: r.toPayload(),
        ),
      );
      Future<void> remove(String note) =>
          gateway.remove(userId: 'mod', reportId: 'report', note: note);
      await expectLater(
        remove(' original '),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      final original = gateway.pending('mod', 'report');
      expect(original?.note, 'original');
      await expectLater(
        remove('changed'),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(payloads.length, 1);
      expect(gateway.pending('mod', 'report'), same(original));
      await remove('original');
      expect(payloads.length, 2);
      expect(payloads[1], payloads[0]);
      expect(payloads[0].keys.toSet(), {
        'expectedUserId',
        'reportId',
        'note',
        'idempotencyKey',
      });
      expect(gateway.pending('mod', 'report'), isNull);
    },
  );

  test(
    'duplicates share one flight; changed account and late response cannot become a new-account decision',
    () async {
      String? uid = 'mod';
      final complete = Completer<void>();
      var calls = 0;
      final gateway = PrivateReportRemovalGateway(
        currentUserId: () => uid,
        send: (_) {
          calls++;
          return complete.future;
        },
      );
      Future<void> remove() =>
          gateway.remove(userId: 'mod', reportId: 'r', note: '');
      final first = remove(), second = remove();
      expect(second, same(first));
      expect(calls, 1);
      final late = expectLater(
        first,
        throwsA(isA<FirebaseFunctionsException>()),
      );
      uid = 'other';
      await expectLater(remove(), throwsA(isA<FirebaseFunctionsException>()));
      complete.complete();
      await late;
      expect(calls, 1);
      expect(gateway.pending('other', 'r'), isNull);
    },
  );

  test(
    'definitive denial clears the pending request and permits a corrected new decision',
    () async {
      var calls = 0;
      final gateway = PrivateReportRemovalGateway(
        currentUserId: () => 'mod',
        send: (_) async {
          if (++calls == 1) {
            throw FirebaseFunctionsException(
              code: 'permission-denied',
              message: 'scope',
            );
          }
        },
      );
      await expectLater(
        gateway.remove(userId: 'mod', reportId: 'r', note: 'a'),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(gateway.pending('mod', 'r'), isNull);
      await gateway.remove(userId: 'mod', reportId: 'r', note: 'corrected');
      expect(calls, 2);
    },
  );

  test(
    'account changes while obtaining server-issued time stop transport',
    () async {
      String? uid = 'mod';
      final issued = Completer<DateTime>();
      var sends = 0;
      final timed = TimedOperationGateway(
        currentUserId: () => uid,
        issuedAt: (_) => issued.future,
        send: (_, _) async {
          sends++;
        },
      );
      final gateway = PrivateReportRemovalGateway(
        currentUserId: () => uid,
        send: (r) => timed.call(
          attempt: r.timedAttempt,
          userId: r.userId,
          operation: 'removeReportedPrivateReply',
          payload: r.toPayload(),
        ),
      );
      final rejected = expectLater(
        gateway.remove(userId: 'mod', reportId: 'r', note: ''),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      uid = null;
      issued.complete(DateTime.utc(2026, 11, 23));
      await rejected;
      expect(sends, 0);
    },
  );

  testWidgets(
    'legacy row shows progress, surfaces failure and only offers retry of pending removal',
    (tester) async {
      var pending = false, failures = 0, calls = 0;
      final complete = Completer<void>();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PrivateReportActionMenu(
              isCurrent: () => true,
              hasPendingRemoval: () => pending,
              resolveLabel: 'Resolve',
              removeLabel: 'Remove',
              onError: (_) => failures++,
              onDecision: (_) {
                calls++;
                pending = true;
                return complete.future;
              },
            ),
          ),
        ),
      );
      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(calls, 1);
      complete.completeError(
        FirebaseFunctionsException(code: 'unavailable', message: 'uncertain'),
      );
      await tester.pumpAndSettle();
      expect(failures, 1);
      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();
      expect(find.text('Resolve'), findsNothing);
      expect(find.text('Remove'), findsOneWidget);
    },
  );

  testWidgets(
    'disposed or changed-account row never reports an old failure in the current UI',
    (tester) async {
      var current = true, errors = 0;
      final done = Completer<void>();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PrivateReportActionMenu(
              isCurrent: () => current,
              hasPendingRemoval: () => false,
              resolveLabel: 'Resolve',
              removeLabel: 'Remove',
              onError: (_) => errors++,
              onDecision: (_) => done.future,
            ),
          ),
        ),
      );
      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove'));
      await tester.pump();
      current = false;
      await tester.pumpWidget(const SizedBox());
      done.completeError(Exception('late'));
      await tester.pumpAndSettle();
      expect(errors, 0);
      expect(tester.takeException(), isNull);
    },
  );

  test(
    'DEV activates the separate App Check gate; missing flag and production remain inactive',
    () {
      final dev =
          jsonDecode(File('config/dev.json').readAsStringSync())
              as Map<String, dynamic>;
      expect(WebEnvironment.fromJson(dev).serverPrivateReportRemoval, true);
      expect(
        WebEnvironment.fromJson(
          jsonDecode(File('config/prod.json').readAsStringSync())
              as Map<String, dynamic>,
        ).serverPrivateReportRemoval,
        false,
      );
      final without = {...dev}..remove('serverPrivateReportRemoval');
      expect(
        WebEnvironment.fromJson(without).serverPrivateReportRemoval,
        false,
      );
      for (final invalid in [null, 'true', 1, {}, []]) {
        expect(
          () => WebEnvironment.fromJson({
            ...dev,
            'serverPrivateReportRemoval': invalid,
          }),
          throwsStateError,
        );
      }
      final disabled = {
        ...dev,
        for (final key in dev.keys.where((k) => k.startsWith('server')))
          key: false,
      }..remove('appCheckSiteKey');
      expect(
        WebEnvironment.fromJson(disabled).serverPrivateReportRemoval,
        false,
      );
      expect(
        () => WebEnvironment.fromJson({
          ...disabled,
          'serverPrivateReportRemoval': true,
        }),
        throwsStateError,
      );
    },
  );
}
