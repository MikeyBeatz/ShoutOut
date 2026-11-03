import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/account_deletion_attempt.dart';
import 'package:shoutout/account_deletion_preparation.dart';
import 'package:shoutout/timed_operation_gateway.dart';

class PreparingTransport implements AccountDeletionTransport {
  @override
  String? currentUserId = 'owner';
  AccountDeletionIntent? intent;
  final events = <String>[];
  DateTime? deadline;
  int writes = 0;
  Future<void> Function()? onRead, onPrepare, onCreate;
  void guard() {
    if (currentUserId != 'owner') throw AccountDeletionIdentityChanged();
  }

  @override
  Future<void> reauthenticate(String password) async => events.add('reauth');
  @override
  Future<void> deleteAuthentication() async {
    events.add('auth-delete');
    currentUserId = null;
  }

  @override
  Future<AccountDeletionIntent> ensureIntent() =>
      ensurePreparedAccountDeletionIntent(
        guardIdentity: guard,
        readExisting: () async {
          events.add('read');
          await onRead?.call();
          return intent;
        },
        prepare: () async {
          events.add('prepare');
          await onPrepare?.call();
        },
        createIfMissing: () async {
          events.add('create');
          if (intent == null) {
            writes++;
            deadline = DateTime.utc(2027, 1, 2);
            intent = const AccountDeletionIntent(
              userId: 'owner',
              confirmed: false,
            );
          }
          await onCreate?.call();
          return intent!;
        },
      );
}

void main() {
  test(
    'initial deletion prepares all pages before recording the intent and deleting Auth',
    () async {
      final t = PreparingTransport();
      expect(
        await AccountDeletionAttempt('owner', t).run('password'),
        AccountDeletionOutcome.completed,
      );
      expect(t.events, ['reauth', 'read', 'prepare', 'create', 'auth-delete']);
      expect(t.writes, 1);
    },
  );

  test(
    'unknown request state or failed preparation never creates an intent or deletes Auth',
    () async {
      for (final read in [true, false]) {
        final t = PreparingTransport();
        Future<void> fail() async => throw StateError('lost acknowledgement');
        if (read) {
          t.onRead = fail;
        } else {
          t.onPrepare = fail;
        }
        expect(
          await AccountDeletionAttempt('owner', t).run('password'),
          AccountDeletionOutcome.pending,
        );
        expect(t.writes, 0);
        expect(t.events, isNot(contains('auth-delete')));
        if (read) expect(t.events, isNot(contains('prepare')));
      }
    },
  );

  test(
    'lost intent acknowledgement resumes the original request without repeating preparation or renewing retention',
    () async {
      final t = PreparingTransport()
        ..onCreate = (() async =>
            throw StateError('lost intent acknowledgement'));
      final attempt = AccountDeletionAttempt('owner', t);
      expect(await attempt.run('password'), AccountDeletionOutcome.pending);
      final deadline = t.deadline;
      t.onCreate = null;
      expect(await attempt.run('password'), AccountDeletionOutcome.completed);
      expect(t.events.where((event) => event == 'prepare'), hasLength(1));
      expect(t.writes, 1);
      expect(t.deadline, deadline);
    },
  );

  test(
    'account changes during preparation fence intent creation and Auth deletion',
    () async {
      final t = PreparingTransport();
      t.onPrepare = () async {
        t.currentUserId = 'another';
      };
      await expectLater(
        AccountDeletionAttempt('owner', t).run('password'),
        throwsA(isA<AccountDeletionIdentityChanged>()),
      );
      expect(t.events, isNot(contains('create')));
      expect(t.events, isNot(contains('auth-delete')));
    },
  );

  test(
    'an intent appearing during preparation is reused rather than replaced',
    () async {
      final t = PreparingTransport();
      final originalDeadline = DateTime.utc(2026, 12, 10);
      t.onPrepare = () async {
        t.intent = const AccountDeletionIntent(
          userId: 'owner',
          confirmed: false,
        );
        t.deadline = originalDeadline;
      };
      expect(
        await AccountDeletionAttempt('owner', t).run('password'),
        AccountDeletionOutcome.completed,
      );
      expect(t.writes, 0);
      expect(t.deadline, originalDeadline);
    },
  );

  test(
    'preparation double clicks share pages; each acknowledged page gets a new key',
    () async {
      final gate = Completer<void>(),
          requests = <AccountDeletionPreparationRequest>[];
      var keys = 0;
      final gateway = AccountDeletionPreparationGateway(
        currentUserId: () => 'owner',
        newKey: () => 'page-${++keys}',
        send: (request) async {
          requests.add(request);
          if (requests.length == 1) await gate.future;
          return {
            'hidden': requests.length == 1 ? 50 : 1,
            'hasMore': requests.length == 1,
          };
        },
      );
      final first = gateway.prepare('owner'), second = gateway.prepare('owner');
      gate.complete();
      await Future.wait([first, second]);
      expect(requests.map((request) => request.logicalKey), [
        'page-1',
        'page-2',
      ]);
    },
  );

  test(
    'a page retry retains the actual timed key after an uncertain callable response',
    () async {
      final keys = <String>[], requests = <AccountDeletionPreparationRequest>[];
      var nonces = 0, fail = true;
      final gateway = AccountDeletionPreparationGateway(
        currentUserId: () => 'owner',
        newKey: () => 'logical',
        send: (request) async {
          requests.add(request);
          final timed = TimedOperationGateway(
            currentUserId: () => 'owner',
            issuedAt: (_) async => DateTime.utc(2026, 11, 3),
            newNonce: () => (++nonces).toRadixString(16).padLeft(32, '0'),
            send: (_, payload) async {
              keys.add(payload['idempotencyKey'] as String);
              if (fail) throw StateError('response lost');
            },
          );
          await timed.call(
            attempt: request.timedAttempt,
            userId: request.userId,
            operation: 'prepareAccountDeletion',
            payload: request.toPayload(),
          );
          return {'hidden': 0, 'hasMore': false};
        },
      );
      await expectLater(gateway.prepare('owner'), throwsStateError);
      fail = false;
      await gateway.prepare('owner');
      expect(identical(requests[0], requests[1]), isTrue);
      expect(keys[0], keys[1]);
      expect(nonces, 1);
    },
  );

  test(
    'malformed page response or account switch never advances to another page',
    () async {
      for (final switched in [false, true]) {
        String? uid = 'owner';
        var calls = 0;
        final gateway = AccountDeletionPreparationGateway(
          currentUserId: () => uid,
          send: (_) async {
            calls++;
            if (switched) uid = 'another';
            return {'hidden': 51, 'hasMore': true};
          },
        );
        await expectLater(gateway.prepare('owner'), throwsA(anything));
        expect(calls, 1);
      }
    },
  );
}
