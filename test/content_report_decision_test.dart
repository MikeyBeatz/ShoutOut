import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/content_report_decision_gateway.dart';
import 'package:shoutout/private_report_action_menu.dart';
import 'package:shoutout/report_decision_action_menu.dart';
import 'package:shoutout/timed_operation_gateway.dart';
import 'package:shoutout/web_environment.dart';

const target = (type: 'comment', shoutId: 'root', targetId: 'child');

void main() {
  test(
    'uncertain decisions freeze all IDs, note, decision and server-issued key across retries',
    () async {
      final sent = <Map<String, dynamic>>[];
      final timed = TimedOperationGateway(
        currentUserId: () => 'mod',
        newNonce: () => 'a' * 32,
        issuedAt: (_) async => DateTime.utc(2026, 11, 23),
        send: (operation, payload) async {
          expect(operation, 'decideContentReports');
          sent.add(payload);
          if (sent.length == 1) {
            throw FirebaseFunctionsException(
              code: 'unavailable',
              message: 'Lost response',
            );
          }
        },
      );
      final gateway = ContentReportDecisionGateway(
        currentUserId: () => 'mod',
        send: (r) => timed.call(
          attempt: r.timedAttempt,
          userId: r.userId,
          operation: 'decideContentReports',
          payload: r.toPayload(),
        ),
      );
      final ids = ['b', 'a'];
      Future<void> call({
        List<String>? reports,
        String decision = 'approve',
        String note = ' note ',
      }) => gateway.decide(
        userId: 'mod',
        target: target,
        reportIds: reports ?? ids,
        decision: decision,
        note: note,
      );
      await expectLater(call(), throwsA(isA<FirebaseFunctionsException>()));
      final pending = gateway.pending('mod', target)!;
      ids.add('new-report');
      expect(pending.reportIds, ['a', 'b']);
      expect(() => pending.reportIds.add('x'), throwsUnsupportedError);
      for (final changed in [
        call(),
        call(reports: ['a', 'b'], decision: 'resolve'),
        call(reports: ['a', 'b'], note: 'other'),
      ]) {
        await expectLater(changed, throwsA(isA<FirebaseFunctionsException>()));
      }
      expect(sent.length, 1);
      await call(
        reports: pending.reportIds,
        note: pending.note,
        decision: pending.decision,
      );
      expect(sent.length, 2);
      expect(sent[0], sent[1]);
      expect(sent[0]['reportIds'], ['a', 'b']);
      expect(sent[0]['idempotencyKey'], startsWith('op1_'));
      expect(gateway.pending('mod', target), isNull);
    },
  );
  test(
    'duplicate calls coalesce; a different account or target cannot reuse the request',
    () async {
      String? uid = 'mod';
      final done = Completer<void>();
      var calls = 0;
      final gateway = ContentReportDecisionGateway(
        currentUserId: () => uid,
        send: (_) {
          calls++;
          return done.future;
        },
      );
      Future<void> call() => gateway.decide(
        userId: 'mod',
        target: target,
        reportIds: ['a'],
        decision: 'resolve',
        note: '',
      );
      final first = call(), second = call();
      expect(first, same(second));
      expect(calls, 1);
      final changed = expectLater(
        first,
        throwsA(isA<FirebaseFunctionsException>()),
      );
      uid = 'other';
      await expectLater(call(), throwsA(isA<FirebaseFunctionsException>()));
      done.complete();
      await changed;
      expect(gateway.pending('other', target), isNull);
      expect(calls, 1);
      expect(
        gateway.pending('mod', (
          type: 'shout',
          shoutId: 'root',
          targetId: null,
        )),
        isNull,
      );
    },
  );
  test(
    'stale-group denial clears the request, while offline retains it for safe retry',
    () async {
      var count = 0;
      final gateway = ContentReportDecisionGateway(
        currentUserId: () => 'mod',
        send: (_) async {
          if (++count == 1) {
            throw FirebaseFunctionsException(
              code: 'failed-precondition',
              message: 'Group changed',
            );
          }
          if (count == 2) {
            throw FirebaseFunctionsException(
              code: 'deadline-exceeded',
              message: 'Unknown result',
            );
          }
        },
      );
      Future<void> call(List<String> ids) => gateway.decide(
        userId: 'mod',
        target: target,
        reportIds: ids,
        decision: 'approve',
        note: '',
      );
      await expectLater(
        call(['a']),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(gateway.pending('mod', target), isNull);
      await expectLater(
        call(['a', 'b']),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(gateway.pending('mod', target)?.reportIds, ['a', 'b']);
      await call(['b', 'a']);
      expect(gateway.pending('mod', target), isNull);
    },
  );
  test('account change during token time lookup sends nothing', () async {
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
    final gateway = ContentReportDecisionGateway(
      currentUserId: () => uid,
      send: (r) => timed.call(
        attempt: r.timedAttempt,
        userId: r.userId,
        operation: 'decideContentReports',
        payload: r.toPayload(),
      ),
    );
    final failed = expectLater(
      gateway.decide(
        userId: 'mod',
        target: target,
        reportIds: ['a'],
        decision: 'escalate',
        note: '',
      ),
      throwsA(isA<FirebaseFunctionsException>()),
    );
    uid = null;
    issued.complete(DateTime.utc(2026, 11, 23));
    await failed;
    expect(sends, 0);
  });
  test(
    'empty, duplicate and oversized lists never reach transport; root payload omits child ID',
    () async {
      var calls = 0;
      final gateway = ContentReportDecisionGateway(
        currentUserId: () => 'mod',
        send: (r) async {
          calls++;
          expect(r.toPayload().containsKey('targetId'), false);
        },
      );
      for (final ids in <List<String>>[
        [],
        ['a', 'a'],
        List.generate(51, (i) => '$i'),
      ]) {
        await expectLater(
          gateway.decide(
            userId: 'mod',
            target: target,
            reportIds: ids,
            decision: 'approve',
            note: '',
          ),
          throwsA(isA<FirebaseFunctionsException>()),
        );
      }
      expect(calls, 0);
      await gateway.decide(
        userId: 'mod',
        target: (type: 'shout', shoutId: 's', targetId: null),
        reportIds: ['a'],
        decision: 'approve',
        note: '',
      );
      expect(calls, 1);
    },
  );
  testWidgets(
    'public legacy menu shows progress and only offers the pending decision after a lost response',
    (tester) async {
      String? pending;
      var errors = 0;
      final done = Completer<void>();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ReportDecisionActionMenu(
              isCurrent: () => true,
              pendingAction: () => pending,
              onError: (_) => errors++,
              onDecision: (_) async {
                pending = 'resolve';
                await done.future;
                throw StateError('offline');
              },
              items: () => const [
                PopupMenuItem(value: 'resolve', child: Text('Resolve')),
                PopupMenuItem(value: 'remove', child: Text('Remove')),
              ],
            ),
          ),
        ),
      );
      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Resolve'));
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      done.complete();
      await tester.pumpAndSettle();
      expect(errors, 1);
      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();
      expect(find.text('Zopakovat původní rozhodnutí'), findsOneWidget);
      expect(find.text('Remove'), findsNothing);
    },
  );
  testWidgets(
    'late failure after account change or disposal does not reach the new account UI',
    (tester) async {
      var current = true, errors = 0;
      final done = Completer<void>();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ReportDecisionActionMenu(
              isCurrent: () => current,
              pendingAction: () => null,
              onError: (_) => errors++,
              onDecision: (_) async {
                await done.future;
                throw StateError('late');
              },
              items: () => const [
                PopupMenuItem(value: 'resolve', child: Text('Resolve')),
              ],
            ),
          ),
        ),
      );
      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Resolve'));
      await tester.pump();
      current = false;
      await tester.pumpWidget(const SizedBox());
      done.complete();
      await tester.pumpAndSettle();
      expect(errors, 0);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'private legacy pending resolution hides deletion and other decisions require the main report screen',
    (tester) async {
      String? pending = 'resolve';
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PrivateReportActionMenu(
              isCurrent: () => true,
              hasPendingRemoval: () => false,
              pendingDecision: () => pending,
              resolveLabel: 'Resolve',
              removeLabel: 'Remove',
              onDecision: (_) async {},
              onError: (_) {},
            ),
          ),
        ),
      );
      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();
      expect(find.text('Zopakovat původní rozhodnutí'), findsOneWidget);
      expect(find.text('Remove'), findsNothing);
      await tester.tap(find.text('Zopakovat původní rozhodnutí'));
      await tester.pumpAndSettle();
      pending = 'approve';
      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();
      expect(
        find.text('Dokonči původní rozhodnutí v Hlášení.'),
        findsOneWidget,
      );
      expect(find.text('Remove'), findsNothing);
    },
  );
  test(
    'new transport is strictly boolean, defaults off in both environments and requires App Check',
    () {
      final dev =
          jsonDecode(File('config/dev.json').readAsStringSync())
              as Map<String, dynamic>;
      final prod =
          jsonDecode(File('config/prod.json').readAsStringSync())
              as Map<String, dynamic>;
      expect(WebEnvironment.fromJson(dev).serverContentReportDecisions, false);
      expect(WebEnvironment.fromJson(prod).serverContentReportDecisions, false);
      expect(
        WebEnvironment.fromJson({
          ...dev,
          'serverContentReportDecisions': true,
        }).serverContentReportDecisions,
        true,
      );
      for (final invalid in [null, 'true', 1, {}, []]) {
        expect(
          () => WebEnvironment.fromJson({
            ...dev,
            'serverContentReportDecisions': invalid,
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
        () => WebEnvironment.fromJson({
          ...disabled,
          'serverContentReportDecisions': true,
        }),
        throwsStateError,
      );
    },
  );
}
