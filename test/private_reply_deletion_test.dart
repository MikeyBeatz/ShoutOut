import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/private_reply_delete_button.dart';
import 'package:shoutout/private_reply_deletion_gateway.dart';
import 'package:shoutout/timed_operation_gateway.dart';
import 'package:shoutout/web_environment.dart';

void main() {
  test(
    'uncertain retry keeps the same timed request across a disposed/reopened tile',
    () async {
      final sent = <Map<String, dynamic>>[];
      final logical = <PrivateReplyDeletionRequest>[];
      var keys = 0, clocks = 0;
      final timed = TimedOperationGateway(
        currentUserId: () => 'author',
        newNonce: () => 'a' * 32,
        issuedAt: (_) async {
          clocks++;
          return DateTime.utc(2026, 11, 23);
        },
        send: (operation, payload) async {
          expect(operation, 'deletePrivateReply');
          sent.add(payload);
          if (sent.length == 1) {
            throw FirebaseFunctionsException(
              code: 'deadline-exceeded',
              message: 'Lost acknowledgement',
            );
          }
        },
      );
      final gateway = PrivateReplyDeletionGateway(
        currentUserId: () => 'author',
        newKey: () => 'logical-${++keys}',
        send: (request) {
          logical.add(request);
          return timed.call(
            attempt: request.timedAttempt,
            userId: request.userId,
            operation: 'deletePrivateReply',
            payload: request.toPayload(),
          );
        },
      );
      Future<void> remove() =>
          gateway.delete(userId: 'author', shoutId: 's', privateReplyId: 'r');
      await expectLater(remove(), throwsA(isA<FirebaseFunctionsException>()));
      await remove();
      expect(logical[1], same(logical[0]));
      expect(sent[1], sent[0]);
      expect(keys, 1);
      expect(clocks, 1);
      expect(sent[0].keys.toSet(), {
        'expectedUserId',
        'shoutId',
        'privateReplyId',
        'idempotencyKey',
      });
      expect(sent[0]['idempotencyKey'], matches(r'^op1_[1-9][0-9]*_a{32}$'));
    },
  );
  test(
    'parallel clicks share one flight while other targets remain separate',
    () async {
      final done = Completer<void>(), sent = <PrivateReplyDeletionRequest>[];
      final gateway = PrivateReplyDeletionGateway(
        currentUserId: () => 'author',
        send: (r) {
          sent.add(r);
          return done.future;
        },
      );
      final a = gateway.delete(
        userId: 'author',
        shoutId: 's',
        privateReplyId: 'a',
      );
      final duplicate = gateway.delete(
        userId: 'author',
        shoutId: 's',
        privateReplyId: 'a',
      );
      final b = gateway.delete(
        userId: 'author',
        shoutId: 's',
        privateReplyId: 'b',
      );
      expect(a, same(duplicate));
      expect(sent.length, 2);
      expect(sent[0].idempotencyKey, isNot(sent[1].idempotencyKey));
      done.complete();
      await Future.wait([a, duplicate, b]);
    },
  );
  test(
    'definitive refusal releases the attempt; account change cannot send a retained request',
    () async {
      String? uid = 'author';
      var keys = 0;
      final sent = <PrivateReplyDeletionRequest>[];
      final gateway = PrivateReplyDeletionGateway(
        currentUserId: () => uid,
        newKey: () => 'key-${++keys}',
        send: (r) async {
          sent.add(r);
          throw FirebaseFunctionsException(
            code: sent.length == 1 ? 'resource-exhausted' : 'unavailable',
            message: 'Test refusal',
          );
        },
      );
      Future<void> remove() =>
          gateway.delete(userId: 'author', shoutId: 's', privateReplyId: 'r');
      await expectLater(remove(), throwsA(isA<FirebaseFunctionsException>()));
      await expectLater(remove(), throwsA(isA<FirebaseFunctionsException>()));
      expect(sent[0].idempotencyKey, isNot(sent[1].idempotencyKey));
      uid = 'other';
      await expectLater(remove(), throwsA(isA<FirebaseFunctionsException>()));
      uid = null;
      await expectLater(remove(), throwsA(isA<FirebaseFunctionsException>()));
      expect(sent.length, 2);
    },
  );
  test(
    'account change during auth metadata prevents transport; a late success cannot become new-account success',
    () async {
      String? uid = 'author';
      final clock = Completer<DateTime>();
      var sends = 0;
      final timed = TimedOperationGateway(
        currentUserId: () => uid,
        issuedAt: (_) => clock.future,
        send: (_, _) async {
          sends++;
        },
      );
      final gateway = PrivateReplyDeletionGateway(
        currentUserId: () => uid,
        send: (r) => timed.call(
          attempt: r.timedAttempt,
          userId: r.userId,
          operation: 'deletePrivateReply',
          payload: r.toPayload(),
        ),
      );
      final first = gateway.delete(
        userId: 'author',
        shoutId: 's',
        privateReplyId: 'r',
      );
      final rejected = expectLater(
        first,
        throwsA(isA<FirebaseFunctionsException>()),
      );
      uid = 'other';
      clock.complete(DateTime.utc(2026, 11, 23));
      await rejected;
      expect(sends, 0);
      uid = 'author';
      final done = Completer<void>();
      final delayed = PrivateReplyDeletionGateway(
        currentUserId: () => uid,
        send: (_) => done.future,
      );
      final second = delayed.delete(
        userId: 'author',
        shoutId: 's',
        privateReplyId: 'r',
      );
      final late = expectLater(
        second,
        throwsA(isA<FirebaseFunctionsException>()),
      );
      uid = 'other';
      done.complete();
      await late;
    },
  );
  test(
    'private deletion is active only in DEV, strictly boolean and independently requires App Check',
    () {
      for (final path in ['config/dev.json', 'config/prod.json']) {
        final config =
            jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;
        expect(
          WebEnvironment.fromJson(config).serverPrivateReplyDeletion,
          path == 'config/dev.json',
        );
      }
      final config =
          jsonDecode(File('config/dev.json').readAsStringSync())
              as Map<String, dynamic>;
      config.remove('serverPrivateReplyDeletion');
      expect(WebEnvironment.fromJson(config).serverPrivateReplyDeletion, false);
      expect(
        WebEnvironment.fromJson({
          ...config,
          'serverPrivateReplyDeletion': true,
        }).serverPrivateReplyDeletion,
        true,
      );
      for (final invalid in [null, 'true', 1, {}, []]) {
        expect(
          () => WebEnvironment.fromJson({
            ...config,
            'serverPrivateReplyDeletion': invalid,
          }),
          throwsStateError,
        );
      }
      final disabled = {
        ...config,
        for (final key in config.keys.where((k) => k.startsWith('server')))
          key: false,
      }..remove('appCheckSiteKey');
      expect(
        WebEnvironment.fromJson(disabled).serverPrivateReplyDeletion,
        false,
      );
      expect(
        () => WebEnvironment.fromJson({
          ...disabled,
          'serverPrivateReplyDeletion': true,
        }),
        throwsStateError,
      );
    },
  );
  testWidgets(
    'delete button shows immediate progress, blocks duplicate taps and recovers after a refusal',
    (tester) async {
      var done = Completer<void>(), calls = 0;
      final errors = <Object>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PrivateReplyDeleteButton(
              tooltip: 'Smazat',
              isCurrent: () => true,
              onDelete: () {
                calls++;
                return done.future;
              },
              onError: errors.add,
            ),
          ),
        ),
      );
      await tester.tap(find.byType(IconButton));
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(
        tester.widget<IconButton>(find.byType(IconButton)).onPressed,
        isNull,
      );
      await tester.tap(find.byType(IconButton));
      expect(calls, 1);
      done.completeError(StateError('offline'));
      await tester.pump();
      expect(errors.length, 1);
      expect(find.byIcon(Icons.delete_outline), findsOneWidget);
      done = Completer<void>();
      await tester.tap(find.byType(IconButton));
      done.complete();
      await tester.pump();
      expect(calls, 2);
      expect(errors.length, 1);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    },
  );
  testWidgets('disposal or changed account suppresses stale UI errors', (
    tester,
  ) async {
    var current = true, done = Completer<void>();
    final errors = <Object>[];
    Widget view() => MaterialApp(
      home: Scaffold(
        body: PrivateReplyDeleteButton(
          tooltip: 'Smazat',
          isCurrent: () => current,
          onDelete: () => done.future,
          onError: errors.add,
        ),
      ),
    );
    await tester.pumpWidget(view());
    await tester.tap(find.byType(IconButton));
    current = false;
    done.completeError(StateError('old account'));
    await tester.pump();
    expect(errors, isEmpty);
    current = true;
    done = Completer<void>();
    await tester.tap(find.byType(IconButton));
    await tester.pumpWidget(const SizedBox.shrink());
    done.completeError(StateError('removed tile'));
    await tester.pump();
    expect(errors, isEmpty);
    expect(tester.takeException(), isNull);
  });
}
