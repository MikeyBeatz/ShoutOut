import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/l10n/app_localizations.dart';
import 'package:shoutout/l10n/text.dart';

void main() {
  test('supports all configured languages', () {
    expect(
      AppLocalizations.supportedLocales.map((locale) => locale.languageCode),
      containsAll(<String>['cs', 'de', 'en', 'pl', 'sk', 'uk', 'vi']),
    );
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
