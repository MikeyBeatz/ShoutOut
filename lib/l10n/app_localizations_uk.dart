// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Ukrainian (`uk`).
class AppLocalizationsUk extends AppLocalizations {
  AppLocalizationsUk([String locale = 'uk']) : super(locale);

  @override
  String get appTitle => 'ShoutOut';

  @override
  String get profile => 'Профіль';

  @override
  String get language => 'Мова';

  @override
  String get czech => 'Чеська';

  @override
  String get english => 'Англійська';

  @override
  String get german => 'Німецька';

  @override
  String get polish => 'Польська';

  @override
  String get slovak => 'Словацька';

  @override
  String get ukrainian => 'Українська';

  @override
  String get vietnamese => 'В’єтнамська';

  @override
  String get changeNickname => 'Змінити псевдонім';

  @override
  String get nicknameChangeHint =>
      'Псевдонім можна буде знову змінити через 30 днів.';

  @override
  String get logout => 'Вийти';

  @override
  String get deleteAccount => 'Видалити обліковий запис';
}
