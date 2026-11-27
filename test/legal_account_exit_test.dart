import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/legal.dart';

void main() {
  testWidgets('account exits stay available without accepting new terms', (
    tester,
  ) async {
    var deletes = 0, logouts = 0;
    Future<void> show({bool busy = false, bool allow = true}) =>
        tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: LegalAccountExitActions(
                busy: busy,
                allowDeletion: allow,
                onSignOut: () => logouts++,
                onDelete: () => deletes++,
              ),
            ),
          ),
        );
    await show();
    final buttons = find.byType(TextButton);
    expect(buttons, findsNWidgets(2));
    await tester.tap(buttons.first);
    await tester.tap(buttons.last);
    expect(logouts, 1);
    expect(deletes, 1);
    await show(busy: true);
    for (final button in tester.widgetList<TextButton>(buttons)) {
      expect(button.onPressed, isNull);
    }
    await show(allow: false);
    expect(buttons, findsOneWidget);
    await tester.tap(buttons.first);
    expect(logouts, 2);
    expect(deletes, 1);
    expect(tester.takeException(), isNull);
  });
}
