import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:shoutout/main.dart';

void main() {
  testWidgets('shows the ShoutOut feed', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(locale: Locale('cs'), home: ShoutOutHome()),
    );

    expect(find.text('ShoutOut'), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<double>), findsOneWidget);
  });
}
