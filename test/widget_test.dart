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
    expect(find.byType(DropdownButtonFormField<double>), findsOneWidget);
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
}
