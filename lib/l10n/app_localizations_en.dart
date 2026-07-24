// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'ShoutOut';

  @override
  String get profile => 'Profile';

  @override
  String get language => 'Language';

  @override
  String get czech => 'Czech';

  @override
  String get english => 'English';

  @override
  String get german => 'German';

  @override
  String get polish => 'Polish';

  @override
  String get changeNickname => 'Change nickname';

  @override
  String get nicknameChangeHint =>
      'You can change your nickname again in 30 days.';

  @override
  String get logout => 'Log out';

  @override
  String get deleteAccount => 'Delete account';
}
