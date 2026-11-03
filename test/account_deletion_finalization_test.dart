import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/account_deletion_attempt.dart';

class FinalizationTransport implements AccountDeletionTransport {
  @override
  String? currentUserId = 'fixture';
  AccountDeletionIntent? saved;
  int preparations = 0, finalizations = 0, deletions = 0;
  Future<Object?> Function()? onFinalize;
  Future<void> Function()? onPrepare;

  @override
  Future<void> reauthenticate(String password) async {}
  @override
  Future<void> deleteAuthentication() async {
    deletions++;
    currentUserId = null;
  }

  @override
  Future<AccountDeletionIntent> ensureIntent() =>
      ensureServerAccountDeletionIntent(
        userId: 'fixture',
        guardIdentity: () {
          if (currentUserId != 'fixture') {
            throw AccountDeletionIdentityChanged();
          }
        },
        readExisting: () async => saved,
        prepare: () async {
          preparations++;
          await onPrepare?.call();
        },
        finalize: () async {
          finalizations++;
          if (onFinalize != null) return onFinalize!();
          saved = const AccountDeletionIntent(
            userId: 'fixture',
            confirmed: false,
          );
          return {'userId': 'fixture', 'ready': true, 'confirmed': false};
        },
      );
}

void main() {
  test(
    'an intervening publication requires a fresh preparation before Auth deletion',
    () async {
      final t = FinalizationTransport();
      t.onFinalize = () async {
        if (t.finalizations == 1) {
          return {'userId': 'fixture', 'ready': false, 'confirmed': false};
        }
        t.saved = const AccountDeletionIntent(
          userId: 'fixture',
          confirmed: false,
        );
        return {'userId': 'fixture', 'ready': true, 'confirmed': false};
      };
      expect(
        await AccountDeletionAttempt('fixture', t).run('password'),
        AccountDeletionOutcome.completed,
      );
      expect(t.preparations, 2);
      expect(t.finalizations, 2);
      expect(t.deletions, 1);
    },
  );

  test(
    'lost finalization acknowledgement never deletes Auth and retry reuses the committed intent',
    () async {
      final t = FinalizationTransport();
      t.onFinalize = () async {
        t.saved = const AccountDeletionIntent(
          userId: 'fixture',
          confirmed: false,
        );
        throw StateError('acknowledgement lost');
      };
      final attempt = AccountDeletionAttempt('fixture', t);
      expect(await attempt.run('password'), AccountDeletionOutcome.pending);
      expect(t.deletions, 0);
      expect(t.finalizations, 1);
      expect(t.preparations, 1);
      final original = t.saved;
      expect(await attempt.run('password'), AccountDeletionOutcome.completed);
      expect(identical(t.saved, original), isTrue);
      expect(t.finalizations, 1);
      expect(t.preparations, 1);
      expect(t.deletions, 1);
    },
  );

  test(
    'a positive reply without a committed request is insufficient to delete Auth',
    () async {
      final t = FinalizationTransport();
      t.onFinalize = () async => {
        'userId': 'fixture',
        'ready': true,
        'confirmed': false,
      };
      expect(
        await AccountDeletionAttempt('fixture', t).run('password'),
        AccountDeletionOutcome.pending,
      );
      expect(t.deletions, 0);
      expect(t.finalizations, 1);
    },
  );

  test(
    'existing confirmed request skips preparation, finalization and Auth deletion',
    () async {
      final t = FinalizationTransport()
        ..saved = const AccountDeletionIntent(
          userId: 'fixture',
          confirmed: true,
        );
      expect(
        await AccountDeletionAttempt('fixture', t).run('password'),
        AccountDeletionOutcome.confirmedByServer,
      );
      expect(t.preparations, 0);
      expect(t.finalizations, 0);
      expect(t.deletions, 0);
    },
  );

  test(
    'identity change during preparation prevents finalization or Auth deletion',
    () async {
      final t = FinalizationTransport(), release = Completer<void>();
      t.onPrepare = () => release.future;
      final result = AccountDeletionAttempt('fixture', t).run('password');
      await Future<void>.delayed(Duration.zero);
      final assertion = expectLater(
        result,
        throwsA(isA<AccountDeletionIdentityChanged>()),
      );
      t.currentUserId = 'other';
      release.complete();
      await assertion;
      expect(t.finalizations, 0);
      expect(t.deletions, 0);
    },
  );

  test(
    'malformed or foreign replies fail closed without automatic retry',
    () async {
      for (final response in [
        null,
        {'userId': 'other', 'ready': true, 'confirmed': false},
        {'userId': 'fixture', 'ready': 'true', 'confirmed': false},
        {'userId': 'fixture', 'ready': false, 'confirmed': true},
      ]) {
        final t = FinalizationTransport();
        t.onFinalize = () async => response;
        expect(
          await AccountDeletionAttempt('fixture', t).run('password'),
          AccountDeletionOutcome.pending,
        );
        expect(t.deletions, 0);
        expect(t.finalizations, 1);
        expect(t.preparations, 1);
      }
    },
  );
}
