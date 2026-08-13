import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:shoutout/avatar_style.dart';
import 'package:shoutout/auth_gate.dart';
import 'package:shoutout/easter_egg_game.dart';
import 'package:shoutout/l10n/app_localizations.dart';
import 'package:shoutout/main.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

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

  testWidgets('Business promo window hides the full Shout body', (
    WidgetTester tester,
  ) async {
    final now = DateTime.now();
    final shout = Shout(
      id: 'promo',
      author: 'Centrum',
      title: 'Dnešní nabídka',
      text: 'Tento celý text patří až do detailu.',
      categories: const ['Obecné'],
      distanceKm: 1.3,
      createdAt: now,
      expiresAt: now.add(const Duration(hours: 2)),
      businessLocationId: 'centrum',
      businessSpotlight: true,
    );

    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('cs'),
        supportedLocales: const [Locale('cs')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: Scaffold(
          body: BusinessSpotlightCard(
            shout: shout,
            onSave: () {},
            onReaction: (_) async {},
          ),
        ),
      ),
    );

    expect(find.text('Dnešní nabídka'), findsOneWidget);
    expect(find.text('Vzdálenost od podniku: 1.3 km'), findsOneWidget);
    expect(find.text('Tento celý text patří až do detailu.'), findsNothing);
  });

  testWidgets('Business promo carousel can move back and forward', (
    WidgetTester tester,
  ) async {
    final now = DateTime.now();
    Shout promo(String id, String title) => Shout(
      id: id,
      author: 'Centrum',
      title: title,
      text: 'Detail',
      categories: const ['Obecné'],
      distanceKm: 2,
      createdAt: now,
      expiresAt: now.add(const Duration(hours: 2)),
      businessSpotlight: true,
    );
    final shouts = [
      promo('one', 'První nabídka'),
      promo('two', 'Druhá nabídka'),
    ];

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 400,
              height: 140,
              child: BusinessSpotlightCarousel(
                shouts: shouts,
                onSave: (_) {},
                onReaction: (_, {required like}) async {},
              ),
            ),
          ),
        ),
      ),
    );

    expect(find.text('První nabídka'), findsOneWidget);
    await tester.drag(find.byType(PageView), const Offset(-300, 0));
    await tester.pumpAndSettle();
    expect(find.text('Druhá nabídka'), findsOneWidget);
    await tester.drag(find.byType(PageView), const Offset(300, 0));
    await tester.pumpAndSettle();
    expect(find.text('První nabídka'), findsOneWidget);
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

    expect(find.text('Location and privacy'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Business account'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Business account'), findsOneWidget);
    expect(find.text('Report a bug'), findsNothing);
    expect(find.byIcon(Icons.article_outlined), findsNothing);
    expect(find.byIcon(Icons.privacy_tip_outlined), findsNothing);
    expect(find.byIcon(Icons.gavel_outlined), findsNothing);

    await tester.scrollUntilVisible(
      find.text('Location and privacy'),
      -300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Location and privacy'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('ShoutOut uses your device location'),
      findsOneWidget,
    );
    expect(find.byType(AlertDialog), findsOneWidget);
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

  testWidgets('help offers Shout Flight as a regular card', (
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
        home: HelpPage(),
      ),
    );

    await tester.scrollUntilVisible(
      find.text('Shout Flight'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Shout Flight'), findsOneWidget);
    await tester.tap(find.text('Shout Flight'));
    await tester.pumpAndSettle();

    expect(find.text('Shout Flight'), findsOneWidget);
    expect(find.text('Klepni pro vzlet'), findsOneWidget);
  });

  testWidgets('Shout Flight starts after a tap', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({'shout_flight_best_score': 123});
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
        home: ShoutFlightPage(),
      ),
    );

    expect(find.text('Klepni pro vzlet'), findsOneWidget);
    await tester.pump();
    expect(find.text('Nejlepší: 123'), findsOneWidget);
    await tester.tap(find.text('Klepni pro vzlet'));
    await tester.pump(const Duration(milliseconds: 200));

    expect(
      tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
      0,
    );
    expect(find.byKey(const Key('flight-score')), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Shout Flight keeps a new record after reopening', (
    WidgetTester tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    const game = MaterialApp(
      locale: Locale('cs'),
      localizationsDelegates: [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: [Locale('cs')],
      home: ShoutFlightPage(),
    );

    await tester.pumpWidget(game);
    await tester.pump();
    await tester.tap(find.text('Klepni pro vzlet'));
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();

    final preferences = await SharedPreferences.getInstance();
    final stored = preferences.getInt('shout_flight_best_score');
    expect(stored, isNotNull);
    expect(stored, greaterThan(0));

    await tester.pumpWidget(game);
    await tester.pump();
    expect(find.text('Nejlepší: $stored'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Shout Flight requires a separate restart confirmation', (
    WidgetTester tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
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
        home: ShoutFlightPage(),
      ),
    );
    await tester.pump();
    await tester.tap(find.text('Klepni pro vzlet'));
    await tester.pump(const Duration(seconds: 3));

    expect(find.textContaining('Konec letu'), findsOneWidget);
    await tester.tap(find.textContaining('Konec letu'));
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('Klepni pro vzlet'), findsOneWidget);
    expect(
      tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
      1,
    );

    await tester.tap(find.text('Klepni pro vzlet'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(
      tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
      0,
    );
    await tester.pumpWidget(const SizedBox.shrink());
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
