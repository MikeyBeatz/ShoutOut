import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/moderation_sanction_gateway.dart';
import 'package:shoutout/moderation_sanction_dialog.dart';
import 'package:shoutout/web_environment.dart';

Map<String, dynamic> payload() => {
  'mode': 'report',
  'expectedTargetUserId': 'author',
  'targetType': 'comment',
  'shoutId': 'root',
  'targetId': 'child',
  'reportIds': ['b', 'a'],
  'sourceReportId': 'b',
  'decision': 'warning',
  'note': ' Concrete reason ',
};
const scope = 'content:comment:root:child';
Matcher code(String expected) =>
    isA<FirebaseFunctionsException>().having((e) => e.code, 'code', expected);

void main() {
  test(
    'private report uses its snapshot without reading a foreign conversation',
    () async {
      var reads = 0;
      final subject = await loadModerationSanctionSubject(
        targetType: 'privateReply',
        fromReport: true,
        reportedPrivateAuthorId: 'reported-author',
        loadSource: () async {
          reads++;
          throw StateError('private-conversation-must-not-be-read');
        },
      );
      expect(subject.authorId, 'reported-author');
      expect(subject.createdAtMillis, isNull);
      expect(reads, 0);
    },
  );
  test(
    'missing or malformed private report identity fails without widening private reads',
    () async {
      for (final author in [null, '', 'foreign/path']) {
        var reads = 0;
        await expectLater(
          loadModerationSanctionSubject(
            targetType: 'privateReply',
            fromReport: true,
            reportedPrivateAuthorId: author,
            loadSource: () async {
              reads++;
              throw StateError('must-not-read');
            },
          ),
          throwsA(code('failed-precondition')),
        );
        expect(reads, 0);
      }
    },
  );
  test(
    'public reports and direct observations load the actual subject once',
    () async {
      for (final target in ['shout', 'comment', 'privateReply']) {
        for (final fromReport in [false, true]) {
          if (target == 'privateReply' && fromReport) continue;
          var reads = 0;
          final subject = await loadModerationSanctionSubject(
            targetType: target,
            fromReport: fromReport,
            reportedPrivateAuthorId: 'unused-client-hint',
            loadSource: () async {
              reads++;
              return const ModerationSanctionSubject('actual-author', 1234);
            },
          );
          expect(subject.authorId, 'actual-author');
          expect(subject.createdAtMillis, 1234);
          expect(reads, 1);
        }
      }
    },
  );
  test(
    'unavailable public subjects and revoked access propagate before any sanction request',
    () async {
      await expectLater(
        loadModerationSanctionSubject(
          targetType: 'comment',
          fromReport: true,
          loadSource: () async => const ModerationSanctionSubject('', null),
        ),
        throwsA(code('failed-precondition')),
      );
      await expectLater(
        loadModerationSanctionSubject(
          targetType: 'comment',
          fromReport: true,
          loadSource: () async => throw FirebaseFunctionsException(
            code: 'permission-denied',
            message: 'Access revoked',
          ),
        ),
        throwsA(code('permission-denied')),
      );
    },
  );
  test(
    'one target coalesces double clicks and deeply freezes report identities',
    () async {
      final done = Completer<void>(), sent = <ModerationSanctionRequest>[];
      final gateway = ModerationSanctionGateway(
        currentUserId: () => 'mod',
        newKey: () => 'logical',
        send: (r) {
          sent.add(r);
          return done.future;
        },
      );
      final original = payload();
      final one = gateway.execute(
        userId: 'mod',
        scope: scope,
        operation: 'sanctionContent',
        payload: original,
      );
      (original['reportIds'] as List)[0] = 'changed';
      original['note'] = 'Changed reason';
      final two = gateway.execute(
        userId: 'mod',
        scope: scope,
        operation: 'sanctionContent',
        payload: payload(),
      );
      expect(sent, hasLength(1));
      expect(identical(one, two), true);
      expect(sent.single.toPayload()['reportIds'], ['a', 'b']);
      expect(sent.single.payload['note'], 'Concrete reason');
      expect(
        () => sent.single.payload['note'] = 'mutated',
        throwsUnsupportedError,
      );
      expect(
        () => (sent.single.payload['reportIds'] as List)[0] = 'mutated',
        throwsUnsupportedError,
      );
      done.complete();
      await Future.wait([one, two]);
      expect(gateway.pending('mod', scope), null);
    },
  );
  test(
    'lost response keeps the same request, key and timed attempt; changed action and reason are blocked',
    () async {
      final sent = <ModerationSanctionRequest>[];
      final gateway = ModerationSanctionGateway(
        currentUserId: () => 'mod',
        send: (r) async {
          sent.add(r);
          if (sent.length == 1) {
            throw FirebaseFunctionsException(
              code: 'unavailable',
              message: 'Lost response',
            );
          }
        },
      );
      await expectLater(
        gateway.execute(
          userId: 'mod',
          scope: scope,
          operation: 'sanctionContent',
          payload: payload(),
        ),
        throwsA(code('unavailable')),
      );
      final pending = gateway.pending('mod', scope)!;
      for (final patch in [
        {'decision': 'ban1d'},
        {'note': 'Different'},
        {
          'reportIds': ['a'],
        },
      ]) {
        await expectLater(
          gateway.execute(
            userId: 'mod',
            scope: scope,
            operation: 'sanctionContent',
            payload: {...payload(), ...patch},
          ),
          throwsA(code('already-exists')),
        );
      }
      await gateway.retry(pending);
      expect(sent, hasLength(2));
      expect(identical(sent[0], sent[1]), true);
      expect(identical(sent[0].timedAttempt, sent[1].timedAttempt), true);
      expect(gateway.pending('mod', scope), null);
    },
  );
  test(
    'definitive rejection clears pending work, and account changes cannot report success or reuse another account request',
    () async {
      var user = 'mod';
      final done = Completer<void>();
      var rejected = true;
      final gateway = ModerationSanctionGateway(
        currentUserId: () => user,
        send: (_) async {
          if (rejected) {
            throw FirebaseFunctionsException(
              code: 'permission-denied',
              message: 'Denied',
            );
          }
          await done.future;
        },
      );
      await expectLater(
        gateway.execute(
          userId: 'mod',
          scope: scope,
          operation: 'sanctionContent',
          payload: payload(),
        ),
        throwsA(code('permission-denied')),
      );
      expect(gateway.pending('mod', scope), null);
      rejected = false;
      final flight = gateway.execute(
        userId: 'mod',
        scope: scope,
        operation: 'sanctionContent',
        payload: payload(),
      );
      final assertion = expectLater(flight, throwsA(code('unauthenticated')));
      user = 'another';
      done.complete();
      await assertion;
      expect(gateway.pending('mod', scope), null);
      await expectLater(
        gateway.execute(
          userId: 'mod',
          scope: scope,
          operation: 'sanctionContent',
          payload: payload(),
        ),
        throwsA(code('unauthenticated')),
      );
    },
  );
  test(
    'account scopes and revocations remain separate and invalid input never sends',
    () async {
      var sends = 0;
      final gateway = ModerationSanctionGateway(
        currentUserId: () => 'mod',
        send: (_) async {
          sends++;
        },
      );
      for (final patch in [
        {'note': ''},
        {'note': 'x' * 501},
        {'expectedUserId': 'other'},
        {'idempotencyKey': 'forged'},
      ]) {
        await expectLater(
          gateway.execute(
            userId: 'mod',
            scope: scope,
            operation: 'sanctionContent',
            payload: {...payload(), ...patch},
          ),
          throwsA(code('invalid-argument')),
        );
      }
      expect(sends, 0);
      await gateway.execute(
        userId: 'mod',
        scope: ModerationSanctionGateway.revocationScope('decision'),
        operation: 'revokeSanction',
        payload: {'sanctionId': 'decision', 'note': 'Reviewed'},
      );
      expect(sends, 1);
    },
  );
  test(
    'server sanction flag is enabled only in DEV and strictly requires App Check',
    () {
      for (final environment in ['dev', 'prod']) {
        final json =
            jsonDecode(File('config/$environment.json').readAsStringSync())
                as Map<String, dynamic>;
        expect(
          WebEnvironment.fromJson(json).serverContentSanctions,
          environment == 'dev',
        );
        for (final invalid in [null, 'true', 1]) {
          expect(
            () => WebEnvironment.fromJson({
              ...json,
              'serverContentSanctions': invalid,
            }),
            throwsStateError,
          );
        }
        expect(
          () => WebEnvironment.fromJson({
            ...json,
            'serverContentSanctions': true,
            'appCheckSiteKey': null,
          }),
          throwsStateError,
        );
      }
    },
  );

  Future<void> open(
    WidgetTester tester, {
    required Future<void> Function(String, String) submit,
    required bool Function() pending,
    bool Function()? current,
    String reason = 'Concrete reason',
    void Function(bool?)? result,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async {
                final value = await showDialog<bool>(
                  context: context,
                  barrierDismissible: false,
                  builder: (_) => ModerationSanctionDialog(
                    title: 'Potvrdit postih',
                    userId: 'author',
                    actions: const ['warning'],
                    label: (_) => 'Varování',
                    initialReason: reason,
                    isCurrent: current ?? () => true,
                    hasPending: pending,
                    onSubmit: submit,
                  ),
                );
                result?.call(value);
              },
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'confirmation remains busy and blocks cancellation until the result arrives',
    (tester) async {
      final done = Completer<void>();
      bool? result;
      await open(
        tester,
        submit: (_, _) => done.future,
        pending: () => false,
        result: (v) => result = v,
      );
      await tester.tap(find.text('Potvrdit rozhodnutí'));
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(tester.widget<TextField>(find.byType(TextField)).enabled, false);
      expect(
        tester
            .widget<TextButton>(find.widgetWithText(TextButton, 'Zrušit'))
            .onPressed,
        null,
      );
      done.complete();
      await tester.pumpAndSettle();
      expect(result, true);
      expect(find.byType(ModerationSanctionDialog), findsNothing);
    },
  );
  testWidgets(
    'unknown result freezes reason and retries the actual original gateway request',
    (tester) async {
      final sent = <ModerationSanctionRequest>[];
      final gateway = ModerationSanctionGateway(
        currentUserId: () => 'mod',
        send: (r) async {
          sent.add(r);
          if (sent.length == 1) {
            throw FirebaseFunctionsException(
              code: 'unavailable',
              message: 'Lost response',
            );
          }
        },
      );
      await open(
        tester,
        pending: () => gateway.pending('mod', scope) != null,
        submit: (action, reason) => gateway.execute(
          userId: 'mod',
          scope: scope,
          operation: 'sanctionContent',
          payload: {...payload(), 'decision': action, 'note': reason},
        ),
      );
      await tester.tap(find.text('Potvrdit rozhodnutí'));
      await tester.pumpAndSettle();
      expect(find.text('Zopakovat původní rozhodnutí'), findsOneWidget);
      expect(tester.widget<TextField>(find.byType(TextField)).enabled, false);
      await tester.tap(find.text('Zopakovat původní rozhodnutí'));
      await tester.pumpAndSettle();
      expect(sent, hasLength(2));
      expect(identical(sent[0], sent[1]), true);
      expect(find.byType(ModerationSanctionDialog), findsNothing);
    },
  );
  testWidgets('empty reason and explicit cancellation never submit', (
    tester,
  ) async {
    var sends = 0;
    bool? result;
    await open(
      tester,
      reason: '',
      pending: () => false,
      submit: (_, _) async {
        sends++;
      },
      result: (v) => result = v,
    );
    await tester.tap(find.text('Potvrdit rozhodnutí'));
    await tester.pumpAndSettle();
    expect(sends, 0);
    await tester.tap(find.text('Zrušit'));
    await tester.pumpAndSettle();
    expect(result, false);
    expect(sends, 0);
  });
  testWidgets(
    'account change during completion cannot return a successful decision',
    (tester) async {
      var current = true;
      final done = Completer<void>();
      bool? result;
      await open(
        tester,
        pending: () => false,
        current: () => current,
        submit: (_, _) => done.future,
        result: (v) => result = v,
      );
      await tester.tap(find.text('Potvrdit rozhodnutí'));
      await tester.pump();
      current = false;
      done.complete();
      await tester.pumpAndSettle();
      expect(result, false);
    },
  );
}
