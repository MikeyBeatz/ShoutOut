import 'package:cloud_functions/cloud_functions.dart';

/// Recovery instruction for an expired immutable request; never suggest an
/// automatic replacement operation when the original outcome is uncertain.
String? expiredOperationText(Object? error, String languageCode) {
  if (error is! FirebaseFunctionsException ||
      error.code != 'failed-precondition' ||
      !{
        'operation-expired',
        'operation-key-upgrade-required',
      }.contains(error.message)) {
    return null;
  }
  return _expired[languageCode] ?? _expired['cs']!;
}

const _expired = {
  'cs':
      'Tento pokus vypršel. Obnov aplikaci a zkontroluj, zda se akce provedla.',
  'en':
      'This attempt has expired. Reload the app and check whether the action completed.',
  'de':
      'Dieser Versuch ist abgelaufen. Lade die App neu und prüfe, ob die Aktion ausgeführt wurde.',
  'pl':
      'Ta próba wygasła. Odśwież aplikację i sprawdź, czy działanie zostało wykonane.',
  'sk':
      'Tento pokus vypršal. Obnov aplikáciu a skontroluj, či sa akcia vykonala.',
  'uk':
      'Термін цієї спроби минув. Перезавантаж застосунок і перевір, чи дію виконано.',
  'vi':
      'Lần thử này đã hết hạn. Hãy tải lại ứng dụng và kiểm tra xem thao tác đã hoàn tất chưa.',
};
