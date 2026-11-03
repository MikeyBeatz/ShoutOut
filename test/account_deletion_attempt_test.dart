import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/account_deletion_attempt.dart';

class Transport implements AccountDeletionTransport {
  @override
  String? currentUserId = 'original';
  int reauthCalls = 0, intentCalls = 0, deleteCalls = 0, writes = 0;
  bool hasIntent = false, confirmed = false;
  final originalDeadline = DateTime.utc(2026, 12, 1);
  DateTime? deadline;
  Future<void> Function()? onReauth, onIntent, onDelete;

  @override
  Future<void> reauthenticate(String password) async {
    reauthCalls++;
    await onReauth?.call();
  }

  @override
  Future<AccountDeletionIntent> ensureIntent() async {
    intentCalls++;
    if (!hasIntent) {
      hasIntent = true;
      deadline = originalDeadline;
      writes++;
    }
    await onIntent?.call();
    return AccountDeletionIntent(userId: 'original', confirmed: confirmed);
  }

  @override
  Future<void> deleteAuthentication() async {
    deleteCalls++;
    await onDelete?.call();
    currentUserId = null;
  }
}

void main() {
  test(
    'diagnostics distinguish reauthentication, intent and Auth failures while preserving their outcomes',
    () async {
      for (final stage in ['reauthenticate', 'ensure-request', 'delete-auth']) {
        final t = Transport();
        final stages = <String>[];
        Future<void> fail() async => throw StateError('injected');
        if (stage == 'reauthenticate') t.onReauth = fail;
        if (stage == 'ensure-request') t.onIntent = fail;
        if (stage == 'delete-auth') t.onDelete = fail;
        final attempt = AccountDeletionAttempt(
          'original',
          t,
          onFailure: (value, _) => stages.add(value),
        );
        if (stage == 'reauthenticate') {
          await expectLater(attempt.run('secret'), throwsStateError);
          expect(t.writes, 0);
        } else {
          expect(await attempt.run('secret'), AccountDeletionOutcome.pending);
          expect(t.hasIntent, isTrue);
          expect(t.deadline, t.originalDeadline);
        }
        expect(stages, [stage]);
        expect(t.deleteCalls, stage == 'delete-auth' ? 1 : 0);
      }
    },
  );
  test(
    'a failing diagnostic observer cannot block recovery or renew the original request',
    () async {
      final t = Transport();
      t.onDelete = () async => throw StateError('lost acknowledgement');
      final attempt = AccountDeletionAttempt(
        'original',
        t,
        onFailure: (_, _) => throw StateError('observer failed'),
      );
      expect(await attempt.run('secret'), AccountDeletionOutcome.pending);
      t.onDelete = null;
      expect(await attempt.run('secret'), AccountDeletionOutcome.completed);
      expect(t.writes, 1);
      expect(t.deadline, t.originalDeadline);
    },
  );
  test(
    'an already switched account cannot start any part of an old attempt',
    () {
      final t = Transport()..currentUserId = 'another';
      expect(
        () => AccountDeletionAttempt('original', t).run('secret'),
        throwsA(isA<AccountDeletionIdentityChanged>()),
      );
      expect(t.reauthCalls, 0);
      expect(t.intentCalls, 0);
      expect(t.deleteCalls, 0);
    },
  );

  test(
    'Auth removal with a lost reply preserves the request even after local sign-out',
    () async {
      final t = Transport();
      t.onDelete = () async {
        t.currentUserId = null;
        throw StateError('server committed but reply was lost');
      };
      expect(
        await AccountDeletionAttempt('original', t).run('secret'),
        AccountDeletionOutcome.pending,
      );
      expect(t.hasIntent, isTrue);
      expect(t.writes, 1);
      expect(t.deadline, t.originalDeadline);
    },
  );

  test(
    'lost Auth acknowledgement keeps the original intent and deadline on retry',
    () async {
      final t = Transport();
      final attempt = AccountDeletionAttempt('original', t);
      t.onDelete = () async => throw StateError('lost acknowledgement');
      expect(await attempt.run('secret'), AccountDeletionOutcome.pending);
      expect(t.hasIntent, isTrue);
      t.onDelete = null;
      expect(await attempt.run('secret'), AccountDeletionOutcome.completed);
      expect(t.writes, 1);
      expect(t.deadline, t.originalDeadline);
    },
  );

  test(
    'a lost request acknowledgement never proceeds to Auth deletion blindly',
    () async {
      final t = Transport();
      final attempt = AccountDeletionAttempt('original', t);
      t.onIntent = () async => throw StateError('lost request acknowledgement');
      expect(await attempt.run('secret'), AccountDeletionOutcome.pending);
      expect(t.deleteCalls, 0);
      t.onIntent = null;
      expect(await attempt.run('secret'), AccountDeletionOutcome.completed);
      expect(t.writes, 1);
    },
  );

  test(
    'reauthentication failure does not create an intent or delete anything',
    () async {
      final t = Transport()
        ..onReauth = (() async => throw StateError('wrong password'));
      await expectLater(
        AccountDeletionAttempt('original', t).run('secret'),
        throwsStateError,
      );
      expect(t.intentCalls, 0);
      expect(t.deleteCalls, 0);
    },
  );

  test(
    'account changes during reauthentication or request acknowledgement fence the next action',
    () async {
      for (final stage in ['reauth', 'intent']) {
        final t = Transport();
        Future<void> switchAccount() async {
          t.currentUserId = 'another';
        }

        if (stage == 'reauth') {
          t.onReauth = switchAccount;
        } else {
          t.onIntent = switchAccount;
        }
        await expectLater(
          AccountDeletionAttempt('original', t).run('secret'),
          throwsA(isA<AccountDeletionIdentityChanged>()),
        );
        expect(t.deleteCalls, 0);
        if (stage == 'reauth') expect(t.intentCalls, 0);
      }
    },
  );

  test('double clicks share the same in-flight operation', () async {
    final gate = Completer<void>(),
        t = Transport()..onReauth = (() => gate.future);
    final attempt = AccountDeletionAttempt('original', t);
    final first = attempt.run('secret'), second = attempt.run('secret');
    gate.complete();
    expect(await first, AccountDeletionOutcome.completed);
    expect(await second, AccountDeletionOutcome.completed);
    expect(t.reauthCalls, 1);
    expect(t.intentCalls, 1);
    expect(t.deleteCalls, 1);
  });

  test(
    'server-confirmed requests are never reissued or sent to Auth again',
    () async {
      final t = Transport()
        ..hasIntent = true
        ..confirmed = true
        ..deadline = DateTime.utc(2026, 12, 1);
      expect(
        await AccountDeletionAttempt('original', t).run('secret'),
        AccountDeletionOutcome.confirmedByServer,
      );
      expect(t.writes, 0);
      expect(t.deleteCalls, 0);
    },
  );
}
