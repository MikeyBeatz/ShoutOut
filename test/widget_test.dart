import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:shoutout/avatar_style.dart';
import 'package:shoutout/auth_gate.dart';
import 'package:shoutout/l10n/app_localizations.dart';
import 'package:shoutout/main.dart';

void main() {
  testWidgets('shows the ShoutOut feed', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(locale: Locale('cs'), home: ShoutOutHome()),
    );

    expect(find.text('ShoutOut'), findsOneWidget);
    expect(find.byType(DropdownButton<double>), findsOneWidget);
  });

  testWidgets('keeps feed filters while switching tabs', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(locale: Locale('cs'), home: ShoutOutHome()),
    );

    await tester.tap(find.byType(DropdownButton<double>));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.text('20 km').last);
    await tester.pump(const Duration(milliseconds: 500));

    expect(
      tester
          .widget<DropdownButton<double>>(find.byType(DropdownButton<double>))
          .value,
      20,
    );

    await tester.tap(find.byIcon(Icons.bookmark_outline));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.byIcon(Icons.campaign_outlined).first);
    await tester.pump(const Duration(milliseconds: 500));

    expect(
      tester
          .widget<DropdownButton<double>>(find.byType(DropdownButton<double>))
          .value,
      20,
    );
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

  testWidgets('shows the profile creation date below the nickname', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('cs'),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('cs')],
        home: Scaffold(
          body: ProfileHeader(
            nickname: 'Tester',
            avatarId: null,
            avatarStyle: null,
            createdAt: DateTime(2026, 1, 2),
          ),
        ),
      ),
    );

    expect(find.textContaining('Členem od'), findsOneWidget);
    expect(find.textContaining('2026'), findsOneWidget);
  });

  testWidgets('onboarding reaches its dismissal choice', (
    WidgetTester tester,
  ) async {
    bool? neverShowAgain;
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('cs'),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('cs')],
        home: OnboardingHelpPage(
          onFinished: (value) async => neverShowAgain = value,
        ),
      ),
    );

    expect(find.text('Tvoje okolí'), findsOneWidget);
    for (var index = 0; index < 4; index++) {
      await tester.tap(find.text('Další'));
      await tester.pumpAndSettle();
    }
    expect(find.text('Znovu nezobrazovat'), findsOneWidget);
    await tester.tap(find.byType(Checkbox));
    await tester.tap(find.text('Dokončit'));
    await tester.pump();
    expect(neverShowAgain, isTrue);
  });

  testWidgets('help does not duplicate legal documents', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: HelpPage()));

    expect(find.text('How do shouts work?'), findsOneWidget);
    expect(find.byIcon(Icons.article_outlined), findsNothing);
    expect(find.byIcon(Icons.privacy_tip_outlined), findsNothing);
    expect(find.byIcon(Icons.gavel_outlined), findsNothing);
  });

  testWidgets('system settings contains the appearance setting', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        locale: Locale('cs'),
        localizationsDelegates: [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: [Locale('cs')],
        home: SystemSettingsPage(userId: 'test-user'),
      ),
    );

    expect(find.text('Systém'), findsOneWidget);
    expect(find.text('Jazyk'), findsOneWidget);
    expect(find.text('Změnit heslo'), findsNothing);
    expect(find.text('Notifikace'), findsOneWidget);
    expect(find.text('Vzhled aplikace'), findsOneWidget);
    expect(find.byIcon(Icons.dark_mode_outlined), findsOneWidget);
  });

  testWidgets('bug report keeps image attachment disabled without Storage', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: BugReportPage()));

    expect(find.text('Co se stalo?'), findsOneWidget);
    expect(find.text('Přidat obrázek'), findsNothing);
    expect(
      find.text(
        'Přiložení obrázku připravujeme. Textové hlášení můžeš odeslat už nyní.',
      ),
      findsOneWidget,
    );
    expect(find.text('Odeslat hlášení'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
    expect(find.byType(Checkbox), findsNothing);
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
