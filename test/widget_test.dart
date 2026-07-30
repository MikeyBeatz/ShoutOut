import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:shoutout/avatar_style.dart';
import 'package:shoutout/main.dart';

void main() {
  testWidgets('shows the ShoutOut feed', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(locale: Locale('cs'), home: ShoutOutHome()),
    );

    expect(find.text('ShoutOut'), findsOneWidget);
    expect(find.byType(DropdownButton<double>), findsOneWidget);
  });

  testWidgets('replaces the avatar placeholder with the stored avatar', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(home: AvatarImage(avatarId: null)),
    );

    expect(find.byIcon(Icons.person_outline), findsOneWidget);
    expect(find.byType(Image), findsNothing);

    await tester.pumpWidget(
      const MaterialApp(home: AvatarImage(avatarId: 'owl')),
    );
    await tester.pump();

    expect(find.byIcon(Icons.person_outline), findsNothing);
    expect(find.byType(Image), findsOneWidget);
  });

  testWidgets('change password validates mismatch and toggles visibility', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        locale: Locale('cs'),
        home: Scaffold(body: ChangePasswordDialog()),
      ),
    );

    expect(find.byIcon(Icons.visibility_off_outlined), findsNWidgets(2));

    final passwordFields = find.byType(TextFormField);
    await tester.enterText(passwordFields.at(0), 'abcdefghij');
    await tester.enterText(passwordFields.at(1), 'abcdefghik');
    await tester.tap(find.byType(FilledButton));
    await tester.pump();

    final newPasswordState = tester.state<FormFieldState<String>>(
      passwordFields.at(0),
    );
    final confirmationState = tester.state<FormFieldState<String>>(
      passwordFields.at(1),
    );
    expect(newPasswordState.errorText, 'Passwords do not match.');
    expect(confirmationState.errorText, 'Passwords do not match.');

    await tester.tap(find.byIcon(Icons.visibility_off_outlined).first);
    await tester.pump();

    expect(find.byIcon(Icons.visibility_outlined), findsOneWidget);
    expect(find.byIcon(Icons.visibility_off_outlined), findsOneWidget);
  });
}
