import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/account_role.dart';
import 'package:shoutout/main.dart';

void main() {
  for (final escalated in [false, true]) {
    testWidgets(
      'web can select plain closure for ${escalated ? 'escalated' : 'open'} reports',
      (tester) async {
        String? selected;
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: DropdownButtonFormField<String>(
                items: staffReportDecisionItems(
                  serverDecisions: true,
                  isEscalated: escalated,
                  role: escalated
                      ? AccountRole.administrator
                      : AccountRole.moderator,
                ),
                onChanged: (value) => selected = value,
              ),
            ),
          ),
        );
        await tester.tap(find.byType(DropdownButtonFormField<String>));
        await tester.pumpAndSettle();
        expect(find.text('Označit jako vyřešené'), findsOneWidget);
        await tester.tap(find.text('Označit jako vyřešené'));
        await tester.pumpAndSettle();
        expect(selected, 'resolve');
      },
    );
  }
  test(
    'inactive compatibility and pending retries preserve existing available choices',
    () {
      List<String?> values({
        bool active = false,
        bool escalated = false,
        String? pending,
      }) => staffReportDecisionItems(
        serverDecisions: active,
        isEscalated: escalated,
        role: AccountRole.moderator,
        pendingDecision: pending,
      ).map((item) => item.value).toList();
      expect(values(), isNot(contains('resolve')));
      expect(values(pending: 'resolve'), contains('resolve'));
      expect(values(active: true).where((v) => v == 'resolve'), hasLength(1));
      expect(
        values(active: true, escalated: true),
        isNot(contains('escalate')),
      );
      expect(
        values(active: true, escalated: true, pending: 'escalate'),
        contains('escalate'),
      );
      expect(values(active: true), isNot(contains('banPermanent')));
    },
  );
}
