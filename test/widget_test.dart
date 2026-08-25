import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:shoutout/avatar_style.dart';
import 'package:shoutout/auth_gate.dart';
import 'package:shoutout/easter_egg_game.dart';
import 'package:shoutout/l10n/app_localizations.dart';
import 'package:shoutout/main.dart';
import 'package:shoutout/public_profile.dart';

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

  testWidgets('minute wheel never formats minute values as days', (
    WidgetTester tester,
  ) async {
    late BuildContext context;
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('cs'),
        home: Builder(
          builder: (builderContext) {
            context = builderContext;
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    expect(
      [0, 15, 30, 45].map(
        (value) => durationWheelValueLabel(
          context,
          value: value,
          suffix: 'min',
          twoDigits: true,
        ),
      ),
      ['00 min', '15 min', '30 min', '45 min'],
    );
  });

  testWidgets('comment author identity opens the public profile action', (
    WidgetTester tester,
  ) async {
    var opened = false;
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('cs'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: Scaffold(
          body: CommentAuthorIdentity(
            identity: PublicIdentity(
              nickname: 'Sousedka',
              avatarStyle: AvatarStyle.fallback,
              publicRole: 'seniorModerator',
            ),
            isShoutAuthor: true,
            onTap: () => opened = true,
          ),
        ),
      ),
    );

    await tester.tap(find.text('Sousedka'));

    expect(opened, isTrue);
    expect(find.byType(Chip), findsOneWidget);
    expect(find.text('Moderátor'), findsOneWidget);
  });

  testWidgets('public profile card keeps public identity and actions compact', (
    WidgetTester tester,
  ) async {
    var opened = false;
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('cs'),
        home: Scaffold(
          body: SizedBox(
            width: 360,
            child: PublicProfileCard(
              identity: PublicIdentity(
                nickname: 'VelmiDlouhýNázevBusinessProfilu',
                avatarStyle: AvatarStyle.fallback,
                publicRole: 'business',
              ),
              subtitle: 'Sledováno',
              trailing: const Icon(Icons.chevron_right),
              onTap: () => opened = true,
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.byType(PublicProfileCard));

    expect(opened, isTrue);
    expect(find.text('Business'), findsOneWidget);
    expect(find.text('Sledováno'), findsOneWidget);
    expect(tester.takeException(), isNull);
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
      categories: const ['Ostatní'],
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

  testWidgets(
    'feed Shout card limits preview text and keeps compact categories',
    (WidgetTester tester) async {
      final now = DateTime.now();
      final shout = Shout(
        id: 'compact-card',
        author: 'Soused',
        title: 'Dlouhý nadpis Shoutu pro kontrolu omezení řádků v kartě',
        text: List.filled(
          12,
          'Dlouhý text náhledu, který se v detailu zobrazí celý.',
        ).join(' '),
        categories: const ['Událost', 'Ztráty a nálezy'],
        distanceKm: 1.2,
        createdAt: now,
        expiresAt: now.add(const Duration(hours: 2)),
      );

      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('cs'),
          home: Scaffold(
            body: SizedBox(
              width: 360,
              child: ShoutCard(
                shout: shout,
                onSave: () {},
                onReaction: (_) async {},
              ),
            ),
          ),
        ),
      );

      final body = tester.widget<Text>(
        find.byKey(const Key('shout-card-body')),
      );
      final title = tester.widget<Text>(find.text(shout.title));
      final chips = tester.widgetList<Chip>(find.byType(Chip)).toList();

      expect(body.maxLines, 3);
      expect(body.overflow, TextOverflow.ellipsis);
      expect(title.maxLines, 2);
      expect(title.overflow, TextOverflow.ellipsis);
      expect(chips, hasLength(2));
      expect(
        chips.every(
          (chip) =>
              chip.materialTapTargetSize == MaterialTapTargetSize.shrinkWrap,
        ),
        isTrue,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Business promo carousel can move back and forward', (
    WidgetTester tester,
  ) async {
    final now = DateTime.now();
    Shout promo(String id, String title) => Shout(
      id: id,
      author: 'Centrum',
      title: title,
      text: 'Detail',
      categories: const ['Ostatní'],
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

    final startsWithFirst = find.text('První nabídka').evaluate().isNotEmpty;
    final initialTitle = startsWithFirst ? 'První nabídka' : 'Druhá nabídka';
    final nextTitle = startsWithFirst ? 'Druhá nabídka' : 'První nabídka';
    expect(find.text(initialTitle), findsOneWidget);
    await tester.drag(find.byType(PageView), const Offset(-300, 0));
    await tester.pumpAndSettle();
    expect(find.text(nextTitle), findsOneWidget);
    await tester.drag(find.byType(PageView), const Offset(300, 0));
    await tester.pumpAndSettle();
    expect(find.text(initialTitle), findsOneWidget);
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

  testWidgets('bug report offers a cost-limited image attachment', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('cs'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: const BugReportPage(),
      ),
    );

    expect(find.text('Co se stalo?'), findsOneWidget);
    expect(find.text('Přidat obrázek'), findsOneWidget);
    expect(
      find.text(
        'Povolené formáty: JPG, PNG a WebP. Maximum 2 MB. Hlášení a obrázek se uchovávají nejvýše 60 dní.',
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
