import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/auth_gate.dart';
import 'package:shoutout/account_deletion.dart';

class TestUser implements User {
  TestUser(this.uid);
  @override
  final String uid;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

AccountDeletionStatus status(
  String id,
  Map<String, dynamic>? values, {
  bool cached = false,
  bool pendingWrites = false,
}) => (
  userId: id,
  data: values,
  isFromCache: cached,
  hasPendingWrites: pendingWrites,
);

Widget view(String uid, Stream<AccountDeletionStatus> events) => MaterialApp(
  home: DeletionRequestGate(
    user: TestUser(uid),
    requestStream: events,
    child: const Text('app content'),
  ),
);

void main() {
  testWidgets(
    'cancelling the password dialog releases the busy gate without accessing Auth',
    (tester) async {
      final events = StreamController<AccountDeletionStatus>.broadcast();
      await tester.pumpWidget(view('first', events.stream));
      events.add(status('first', {'status': 'pending'}));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue deleting the account'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'synthetic password');
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.text('Continue deleting the account'), findsOneWidget);
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNotNull,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await events.close();
    },
  );
  testWidgets(
    'a pending request followed immediately by a stream error never reopens the app',
    (tester) async {
      final events = StreamController<AccountDeletionStatus>.broadcast();
      await tester.pumpWidget(view('first', events.stream));
      events.add(status('first', {'userId': 'first', 'status': 'pending'}));
      events.addError(StateError('lost connection before next frame'));
      await tester.pumpAndSettle();
      expect(find.text('app content'), findsNothing);
      expect(find.text('Continue deleting the account'), findsOneWidget);
      events.add(status('first', null, cached: true));
      await tester.pumpAndSettle();
      expect(find.text('app content'), findsNothing);
      events.add(status('first', null, pendingWrites: true));
      await tester.pumpAndSettle();
      expect(find.text('app content'), findsNothing);
      events.add(status('first', null));
      await tester.pumpAndSettle();
      expect(find.text('app content'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      await events.close();
    },
  );

  testWidgets(
    'server confirmation removes resume even through errors and another UID resets the latch',
    (tester) async {
      final first = StreamController<AccountDeletionStatus>.broadcast();
      final second = StreamController<AccountDeletionStatus>.broadcast();
      await tester.pumpWidget(view('first', first.stream));
      first.add(
        status('first', {
          'userId': 'first',
          'status': 'pending',
          'authDeletionConfirmedAt': Timestamp.now(),
        }),
      );
      first.addError(StateError('network unavailable'));
      await tester.pumpAndSettle();
      expect(find.text('Sign-in has been deleted'), findsOneWidget);
      expect(find.text('Continue deleting the account'), findsNothing);
      await tester.pumpWidget(view('second', second.stream));
      await tester.pumpAndSettle();
      expect(find.text('app content'), findsOneWidget);
      // A stale event tagged with the first UID must not block the second account.
      second.add(status('first', {'status': 'pending'}));
      await tester.pumpAndSettle();
      expect(find.text('app content'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      await first.close();
      await second.close();
    },
  );
}
