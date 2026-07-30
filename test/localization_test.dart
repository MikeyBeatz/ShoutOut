import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/l10n/app_localizations.dart';
import 'package:shoutout/l10n/legal_translations.dart';
import 'package:shoutout/l10n/text.dart';

void main() {
  test('supports all configured languages', () {
    expect(
      AppLocalizations.supportedLocales.map((locale) => locale.languageCode),
      containsAll(<String>['cs', 'de', 'en', 'pl', 'sk', 'uk', 'vi']),
    );
  });

  test('new languages have complete legal documents', () {
    for (final document in <List<(String, String)>>[
      legalSkTerms,
      legalUkTerms,
      legalViTerms,
    ]) {
      expect(document, hasLength(5));
      expect(document.every((section) => section.$2.isNotEmpty), isTrue);
      expect(document.first.$1, isNot('1. Service and age'));
    }
    for (final document in <List<(String, String)>>[
      legalSkPrivacy,
      legalUkPrivacy,
      legalViPrivacy,
    ]) {
      expect(document, hasLength(4));
      expect(document.every((section) => section.$2.isNotEmpty), isTrue);
      expect(document.first.$1, isNot('1. Who processes the data'));
    }
  });

  for (final expectation in <(String, String)>[
    ('sk', 'Upozornenia'),
    ('uk', 'Сповіщення'),
    ('vi', 'Thông báo'),
  ]) {
    testWidgets('translates transitional text to ${expectation.$1}', (
      tester,
    ) async {
      late BuildContext localizedContext;
      await tester.pumpWidget(
        MaterialApp(
          locale: Locale(expectation.$1),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          home: Builder(
            builder: (context) {
              localizedContext = context;
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(tr(localizedContext, 'Oznámení'), expectation.$2);
    });
  }

  for (final expectation in <(String, (String, String, String))>[
    ('cs', ('Nejblíž', 'Top', 'Končící')),
    ('en', ('Nearby', 'Top', 'Ending')),
    ('de', ('Nähe', 'Top', 'Endet')),
    ('pl', ('Blisko', 'Top', 'Koniec')),
    ('sk', ('Blízko', 'Top', 'Končí')),
    ('uk', ('Поруч', 'Топ', 'Кінець')),
    ('vi', ('Gần', 'Top', 'Sắp hết')),
  ]) {
    testWidgets('uses compact feed filters in ${expectation.$1}', (
      tester,
    ) async {
      late BuildContext localizedContext;
      await tester.pumpWidget(
        MaterialApp(
          locale: Locale(expectation.$1),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          home: Builder(
            builder: (context) {
              localizedContext = context;
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect((
        tr(localizedContext, 'Nejblíž'),
        tr(localizedContext, 'Top'),
        tr(localizedContext, 'Končící'),
      ), expectation.$2);
    });
  }

  testWidgets('falls back to Czech for an unsupported language', (
    tester,
  ) async {
    late BuildContext localizedContext;
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('fr'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: Builder(
          builder: (context) {
            localizedContext = context;
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    expect(tr(localizedContext, 'Oznámení'), 'Oznámení');
  });
}
