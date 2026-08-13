import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/l10n/app_localizations.dart';
import 'package:shoutout/l10n/legal_translations.dart';
import 'package:shoutout/l10n/text.dart';
import 'package:shoutout/l10n/business_text.dart';

void main() {
  test('supports all configured languages', () {
    expect(
      AppLocalizations.supportedLocales.map((locale) => locale.languageCode),
      containsAll(<String>['cs', 'de', 'en', 'pl', 'sk', 'uk', 'vi']),
    );
  });

  for (final expectation in <(String, String)>[
    ('cs', 'Pobočky'),
    ('en', 'Branches'),
    ('de', 'Filialen'),
    ('pl', 'Oddziały'),
    ('sk', 'Pobočky'),
    ('uk', 'Філії'),
    ('vi', 'Chi nhánh'),
  ]) {
    testWidgets('translates Business UI to ${expectation.$1}', (tester) async {
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
      expect(businessTr(localizedContext, 'Pobočky'), expectation.$2);
      expect(businessTr(localizedContext, 'Až 48 hodin'), isNotEmpty);
      expect(
        businessTr(localizedContext, 'Business žádost čeká na ověření'),
        isNotEmpty,
      );
      expect(
        businessTr(localizedContext, 'Zkontrolovat stav znovu'),
        isNotEmpty,
      );
      expect(businessTr(localizedContext, 'Nahrát vlastní logo'), isNotEmpty);
      expect(
        businessTr(
          localizedContext,
          'Vlastní logo připravujeme. Zatím můžeš použít některý z našich avatarů.',
        ),
        isNotEmpty,
      );
    });
  }

  for (final expectation in <(String, String)>[
    ('cs', 'Upravit business logo'),
    ('en', 'Edit business logo'),
    ('de', 'Unternehmenslogo bearbeiten'),
    ('pl', 'Edytuj logo firmy'),
    ('sk', 'Upraviť firemné logo'),
    ('uk', 'Редагувати логотип компанії'),
    ('vi', 'Chỉnh sửa logo doanh nghiệp'),
  ]) {
    testWidgets('translates Business logo editor to ${expectation.$1}', (
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
      expect(
        businessTr(localizedContext, 'Upravit business logo'),
        expectation.$2,
      );
    });
  }

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
