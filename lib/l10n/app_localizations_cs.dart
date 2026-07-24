// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Czech (`cs`).
class AppLocalizationsCs extends AppLocalizations {
  AppLocalizationsCs([String locale = 'cs']) : super(locale);

  @override
  String get appTitle => 'ShoutOut';

  @override
  String get profile => 'Profil';

  @override
  String get language => 'Jazyk';

  @override
  String get czech => 'Čeština';

  @override
  String get english => 'Angličtina';

  @override
  String get german => 'Němčina';

  @override
  String get polish => 'Polština';

  @override
  String get changeNickname => 'Změnit přezdívku';

  @override
  String get nicknameChangeHint => 'Přezdívku lze změnit znovu za 30 dní.';

  @override
  String get logout => 'Odhlásit se';

  @override
  String get deleteAccount => 'Smazat účet';
}
