import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/moderation_queue_client.dart';
import 'package:shoutout/moderation_queue_view.dart';
import 'package:shoutout/moderation_case_decision_panel.dart';
import 'moderation_queue_client_test.dart' as fixture;

void main() {
  testWidgets(
    'a partly escalated case can finish its original decision without offering another effect',
    (tester) async {
      var completed = 0;
      final data = fixture.row(1)
        ..addAll({
          'pendingCount': 3,
          'openCount': 1,
          'escalatedCount': 2,
          'appliedDecision': 'escalate',
        });
      final client = ModerationCaseDecisionClient(
        currentUserId: () => 'a',
        issuedAt: (_) async => DateTime.utc(2026),
        newNonce: () => 'b' * 32,
        send: (_, payload) async {
          expect(payload['decision'], 'escalate');
          return {'status': 'complete'};
        },
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ModerationCaseDecisionPanel(
              record: ModerationCaseRecord.fromJson(data),
              isSenior: false,
              currentUserId: () => 'a',
              client: client,
              failureText: (_, _) => 'Synthetic failure',
              onComplete: () => completed++,
              decisionItems: (_) => const [],
            ),
          ),
        ),
      );
      expect(find.byType(DropdownButtonFormField<String>), findsNothing);
      expect(find.text('Původní rozhodnutí'), findsOneWidget);
      await tester.tap(find.text('Pokračovat v rozhodnutí'));
      await tester.pumpAndSettle();
      expect(completed, 1);
      expect(tester.takeException(), null);
    },
  );
  testWidgets(
    'case footer follows all50 cards, append preserves position and open errors stay handled',
    (tester) async {
      var calls = 0;
      final controller = ModerationQueueController(
        currentUserId: () => 'a',
        send: (_, p) async {
          calls++;
          return p['cursor'] == null
              ? fixture.page(List.generate(50, (n) => n + 1), 1)
              : fixture.page([51]);
        },
      );
      await controller.refresh();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ModerationQueueView(
              controller: controller,
              onOpen: (_) async => throw StateError('Synthetic open failure'),
            ),
          ),
        ),
      );
      expect(find.text('Načíst další'), findsNothing);
      await tester.drag(find.byType(ListView), const Offset(0, -20000));
      await tester.pumpAndSettle();
      final position = tester
          .state<ScrollableState>(find.byType(Scrollable))
          .position;
      final before = position.pixels;
      await tester.tap(find.text('Načíst další'));
      await tester.pumpAndSettle();
      expect(calls, 2);
      expect(position.pixels, before);
      expect(controller.items.length, 51);
      await tester.tap(find.byType(ListTile).last);
      await tester.pumpAndSettle();
      expect(find.text('Případ se nepodařilo otevřít.'), findsOneWidget);
      expect(tester.takeException(), null);
      await tester.pumpWidget(const SizedBox());
      controller.dispose();
    },
  );

  testWidgets(
    'sanction validates reason, confirms once and retries one frozen intent with progress',
    (tester) async {
      var starts = 0, completed = 0;
      final step = Completer<Map<String, dynamic>>();
      final payloads = <Map<String, dynamic>>[];
      final client = ModerationCaseDecisionClient(
        currentUserId: () => 'a',
        issuedAt: (_) async => DateTime.utc(2026),
        newNonce: () => 'b' * 32,
        send: (operation, payload) async {
          if (operation == 'startModerationCaseDecision') {
            payloads.add(Map.from(payload));
            if (++starts == 1) {
              throw FirebaseFunctionsException(
                code: 'unavailable',
                message: 'Synthetic',
              );
            }
            return {'status': 'processing', 'jobId': 'c' * 64};
          }
          return step.future;
        },
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ModerationCaseDecisionPanel(
              record: ModerationCaseRecord.fromJson(fixture.row(1)),
              isSenior: true,
              currentUserId: () => 'a',
              client: client,
              failureText: (_, _) => 'Synthetic failure',
              onComplete: () => completed++,
              decisionItems: (_) => const [
                DropdownMenuItem(value: 'warning', child: Text('Varování')),
              ],
            ),
          ),
        ),
      );
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Varování').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Uložit rozhodnutí'));
      await tester.pumpAndSettle();
      expect(find.text('Vyplň důvod postihu.'), findsOneWidget);
      expect(starts, 0);
      await tester.enterText(find.byType(TextField), 'Synthetic reason');
      await tester.tap(find.text('Uložit rozhodnutí'));
      await tester.pumpAndSettle();
      expect(find.text('Potvrdit postih'), findsOneWidget);
      await tester.tap(find.text('Potvrdit rozhodnutí'));
      await tester.pumpAndSettle();
      expect(find.text('Synthetic failure'), findsOneWidget);
      await tester.tap(find.text('Pokračovat v rozhodnutí'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 20));
      expect(find.text('Potvrdit postih'), findsNothing);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      expect(payloads[0], payloads[1]);
      step.complete({'status': 'complete'});
      await tester.pumpAndSettle();
      expect(completed, 1);
      expect(starts, 2);
      expect(tester.takeException(), null);
    },
  );
}
