import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/account_deletion.dart';
import 'package:shoutout/account_deletion_progress.dart';

void main() {
  testWidgets(
    'warning precedes deletion; progress blocks input and the pending gate',
    (tester) async {
      final identities = StreamController<String?>.broadcast();
      final operation = Completer<void>();
      var started = false, taps = 0;
      var page = 'profile';
      late StateSetter update;
      Future<void>? flow;
      await tester.pumpWidget(
        MaterialApp(
          home: StatefulBuilder(
            builder: (context, setState) {
              update = setState;
              return Scaffold(
                body: Column(
                  children: [
                    Text(page),
                    TextButton(
                      onPressed: () => taps++,
                      child: const Text('Other action'),
                    ),
                    FilledButton(
                      onPressed: () {
                        flow = () async {
                          final password = await confirmAccountDeletionPassword(
                            context,
                          );
                          if (password == null) return;
                          await runAccountDeletionWithProgress(
                            context,
                            userId: 'fixture',
                            identities: identities.stream,
                            operation: () {
                              started = true;
                              return operation.future;
                            },
                          );
                        }();
                      },
                      child: const Text('Delete account'),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      );
      await tester.tap(find.text('Delete account'));
      await tester.pumpAndSettle();
      expect(
        find.text('This step will permanently delete your account.'),
        findsOneWidget,
      );
      expect(started, isFalse);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      await flow;
      expect(started, isFalse);
      await tester.tap(find.text('Delete account'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'synthetic password');
      await tester.tap(find.text('Request deletion'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(started, isTrue);
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Deleting your account…'), findsOneWidget);
      update(() => page = 'pending request');
      await tester.pump();
      await tester.tap(find.text('Other action'), warnIfMissed: false);
      await tester.tapAt(const Offset(5, 5));
      await tester.binding.handlePopRoute();
      await tester.pump(const Duration(milliseconds: 400));
      expect(taps, 0);
      expect(find.text('Deleting your account…'), findsOneWidget);

      update(() => page = 'login');
      identities.add(null);
      await tester.pumpAndSettle();
      expect(find.text('login'), findsOneWidget);
      expect(find.text('Deleting your account…'), findsNothing);
      operation.complete();
      await tester.pump();
      await flow;
      await tester.pumpAndSettle();
      expect(find.text('login'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await identities.close();
    },
  );

  testWidgets(
    'failure releases the modal and preserves the error for the caller',
    (tester) async {
      final identities = StreamController<String?>.broadcast();
      final operation = Completer<void>();
      late BuildContext context;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (value) {
              context = value;
              return const Scaffold(body: Text('profile'));
            },
          ),
        ),
      );
      final flow = runAccountDeletionWithProgress(
        context,
        userId: 'fixture',
        identities: identities.stream,
        operation: () => operation.future,
      );
      final result = expectLater(flow, throwsStateError);
      await tester.pump();
      expect(find.text('Deleting your account…'), findsOneWidget);
      operation.completeError(StateError('network failure'));
      await tester.pump();
      await result;
      await tester.pumpAndSettle();
      expect(find.text('profile'), findsOneWidget);
      expect(find.byType(AlertDialog), findsNothing);
      await identities.close();
    },
  );

  testWidgets(
    'old operation cannot close a new account dialog after a UID switch',
    (tester) async {
      final identities = StreamController<String?>.broadcast();
      final operation = Completer<void>();
      late BuildContext context;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (value) {
              context = value;
              return const Scaffold(body: Text('app'));
            },
          ),
        ),
      );
      final flow = runAccountDeletionWithProgress(
        context,
        userId: 'old',
        identities: identities.stream,
        operation: () => operation.future,
      );
      await tester.pump();
      identities.add('new');
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      final other = showDialog<void>(
        context: context,
        builder: (_) => const AlertDialog(content: Text('New account dialog')),
      );
      await tester.pumpAndSettle();
      operation.complete();
      await tester.pump();
      await flow;
      await tester.pumpAndSettle();
      expect(find.text('New account dialog'), findsOneWidget);
      Navigator.of(context).pop();
      await other;
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await identities.close();
    },
  );

  testWidgets('operation can settle after its navigator is disposed', (
    tester,
  ) async {
    final identities = StreamController<String?>.broadcast();
    final operation = Completer<void>();
    late BuildContext context;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (value) {
            context = value;
            return const Scaffold();
          },
        ),
      ),
    );
    final flow = runAccountDeletionWithProgress(
      context,
      userId: 'old',
      identities: identities.stream,
      operation: () => operation.future,
    );
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    operation.complete();
    await tester.pump();
    await flow;
    await tester.pump();
    expect(tester.takeException(), isNull);
    await identities.close();
  });
}
