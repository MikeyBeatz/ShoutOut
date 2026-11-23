import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/content_report_decision_gateway.dart';
import 'package:shoutout/report_decision_action_menu.dart';
import 'package:shoutout/timed_operation_gateway.dart';
import 'package:shoutout/web_environment.dart';

const target = (type: 'comment', shoutId: 'root', targetId: 'child');

void main() {
  test(
    'shared screen routing keeps public removal independent of basic/private decisions',
    () {
      for (final type in ['shout', 'comment', 'privateReply']) {
        expect(
          usesServerContentReportDecision(
            decision: 'remove',
            targetType: type,
            decisionsEnabled: true,
            publicRemovalEnabled: false,
          ),
          false,
        );
        expect(
          usesServerContentReportDecision(
            decision: 'remove',
            targetType: type,
            decisionsEnabled: false,
            publicRemovalEnabled: true,
          ),
          type != 'privateReply',
        );
        expect(
          usesServerContentReportDecision(
            decision: 'resolve',
            targetType: type,
            decisionsEnabled: true,
            publicRemovalEnabled: false,
          ),
          true,
        );
        expect(
          usesServerContentReportDecision(
            decision: 'ban1d',
            targetType: type,
            decisionsEnabled: true,
            publicRemovalEnabled: true,
          ),
          false,
        );
      }
    },
  );
  test(
    'public removal is isolated from existing decisions and rejects private targets',
    () async {
      final sent = <ContentReportDecisionRequest>[];
      final gateway = ContentReportDecisionGateway(
        currentUserId: () => 'mod',
        send: (r) async => sent.add(r),
      );
      for (final type in ['shout', 'comment']) {
        await gateway.decide(
          userId: 'mod',
          target: (
            type: type,
            shoutId: 'root',
            targetId: type == 'shout' ? null : 'child',
          ),
          reportIds: ['a'],
          decision: 'remove',
          note: ' note ',
        );
        expect(sent.last.operation, 'removeReportedPublicContent');
        expect(sent.last.toPayload()['decision'], 'remove');
        expect(
          sent.last.toPayload().containsKey('targetId'),
          type == 'comment',
        );
      }
      await expectLater(
        gateway.decide(
          userId: 'mod',
          target: (type: 'privateReply', shoutId: 'root', targetId: 'child'),
          reportIds: ['a'],
          decision: 'remove',
          note: '',
        ),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(sent.length, 2);
      await gateway.decide(
        userId: 'mod',
        target: target,
        reportIds: ['a'],
        decision: 'approve',
        note: '',
      );
      expect(sent.last.operation, 'decideContentReports');
    },
  );

  test(
    'lost removal response freezes the original group, note and timed key across retries',
    () async {
      final sent = <Map<String, dynamic>>[];
      final timed = TimedOperationGateway(
        currentUserId: () => 'mod',
        issuedAt: (_) async => DateTime.utc(2026, 11, 23),
        send: (operation, payload) async {
          expect(operation, 'removeReportedPublicContent');
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
          operation: r.operation,
          payload: r.toPayload(),
        ),
      );
      Future<void> call(
        List<String> ids, {
        String decision = 'remove',
        String note = ' original ',
      }) => gateway.decide(
        userId: 'mod',
        target: target,
        reportIds: ids,
        decision: decision,
        note: note,
      );
      await expectLater(
        call(['b', 'a']),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      final pending = gateway.pending('mod', target)!;
      for (final next in [
        call(['a', 'b', 'new']),
        call(['a', 'b'], decision: 'resolve'),
        call(['a', 'b'], note: 'changed'),
      ]) {
        await expectLater(next, throwsA(isA<FirebaseFunctionsException>()));
      }
      expect(sent.length, 1);
      expect(pending.reportIds, ['a', 'b']);
      await call(pending.reportIds, note: pending.note);
      expect(sent.length, 2);
      expect(sent.first, sent.last);
      expect(sent.last['idempotencyKey'], startsWith('op1_'));
      expect(gateway.pending('mod', target), isNull);
    },
  );

  test(
    'duplicate removals coalesce and another account cannot inherit a pending request',
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
      Future<void> call(String actor) => gateway.decide(
        userId: actor,
        target: target,
        reportIds: ['a'],
        decision: 'remove',
        note: '',
      );
      final first = call('mod'), second = call('mod');
      expect(identical(first, second), true);
      expect(calls, 1);
      final result = expectLater(
        first,
        throwsA(isA<FirebaseFunctionsException>()),
      );
      uid = 'other';
      done.complete();
      await result;
      expect(gateway.pending('mod', target), isNull);
      expect(gateway.pending('other', target), isNull);
      await expectLater(
        call('mod'),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(calls, 1);
    },
  );

  testWidgets(
    'removal menu shows progress, freezes the choice and ignores completion after unmount',
    (tester) async {
      final done = Completer<void>();
      var errors = 0, calls = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ReportDecisionActionMenu(
              isCurrent: () => true,
              onDecision: (_) {
                calls++;
                return done.future;
              },
              onError: (_) => errors++,
              pendingAction: () => null,
              items: () => [
                const PopupMenuItem(value: 'remove', child: Text('Remove')),
              ],
            ),
          ),
        ),
      );
      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove'));
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(calls, 1);
      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      done.completeError(
        FirebaseFunctionsException(
          code: 'unavailable',
          message: 'Lost response',
        ),
      );
      await tester.pumpAndSettle();
      expect(errors, 0);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'reopened removal menu only retries the original action; changed account suppresses old errors',
    (tester) async {
      var active = true, errors = 0;
      final done = Completer<void>();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ReportDecisionActionMenu(
              isCurrent: () => active,
              pendingAction: () => 'remove',
              onDecision: (value) {
                expect(value, 'remove');
                return done.future;
              },
              onError: (_) => errors++,
              items: () => [
                const PopupMenuItem(value: 'resolve', child: Text('Resolve')),
                const PopupMenuItem(value: 'remove', child: Text('Remove')),
              ],
            ),
          ),
        ),
      );
      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();
      expect(find.text('Zopakovat původní rozhodnutí'), findsOneWidget);
      expect(find.text('Resolve'), findsNothing);
      await tester.tap(find.text('Zopakovat původní rozhodnutí'));
      await tester.pump();
      active = false;
      done.completeError(
        FirebaseFunctionsException(
          code: 'permission-denied',
          message: 'Changed role',
        ),
      );
      await tester.pumpAndSettle();
      expect(errors, 0);
    },
  );

  test(
    'transport remains off in both environments and strictly requires a boolean and App Check',
    () {
      final dev =
          jsonDecode(File('config/dev.json').readAsStringSync())
              as Map<String, dynamic>;
      final prod =
          jsonDecode(File('config/prod.json').readAsStringSync())
              as Map<String, dynamic>;
      expect(WebEnvironment.fromJson(dev).serverPublicReportRemoval, false);
      expect(WebEnvironment.fromJson(prod).serverPublicReportRemoval, false);
      expect(
        WebEnvironment.fromJson({
          ...dev,
          'serverPublicReportRemoval': true,
        }).serverPublicReportRemoval,
        true,
      );
      for (final bad in [null, 'true', 1, [], {}]) {
        expect(
          () => WebEnvironment.fromJson({
            ...dev,
            'serverPublicReportRemoval': bad,
          }),
          throwsStateError,
        );
      }
      final disabled = {
        ...dev,
        for (final key in dev.keys.where((key) => key.startsWith('server')))
          key: false,
      }..remove('appCheckSiteKey');
      expect(
        () => WebEnvironment.fromJson({
          ...disabled,
          'serverPublicReportRemoval': true,
        }),
        throwsStateError,
      );
    },
  );
}
