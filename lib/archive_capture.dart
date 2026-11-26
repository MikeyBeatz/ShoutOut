/// Public report-view metadata only; never decodes the private archive body.
class ArchiveCaptureInfo {
  const ArchiveCaptureInfo({this.mode, this.capturedAtMillis});

  factory ArchiveCaptureInfo.decode(Object? response) {
    if (response is! Map || response['archived'] != true) {
      throw StateError('Invalid archive capture response.');
    }
    final mode = response['captureMode'];
    final time = response['capturedAtMillis'];
    if ((mode != null && mode != 'atomic-write' && mode != 'transition') ||
        (time != null &&
            (time is! num ||
                !time.isFinite ||
                time != time.truncateToDouble() ||
                time < 0 ||
                time > 253402300799999)) ||
        (mode != null && time == null)) {
      throw StateError('Invalid archive capture metadata.');
    }
    return ArchiveCaptureInfo(
      mode: mode as String?,
      capturedAtMillis: (time as num?)?.toInt(),
    );
  }

  final String? mode;
  final int? capturedAtMillis;

  String dateLabel(String language) => switch (language) {
    'en' => 'Preserved',
    'de' => 'Gesichert',
    'pl' => 'Zachowano',
    'sk' => 'Uchované',
    'uk' => 'Збережено',
    'vi' => 'Đã lưu',
    _ => 'Zachováno',
  };

  String label(String language, {bool privacyRedacted = false}) {
    final labels = switch (language) {
      'en' => (
        'Archived copy',
        'Archived when the content was written',
        'Preserved during the system transition',
        'reference anonymized',
      ),
      'de' => (
        'Archivkopie',
        'Beim Schreiben des Inhalts archiviert',
        'Beim Systemübergang gesichert',
        'Verweis anonymisiert',
      ),
      'pl' => (
        'Kopia archiwalna',
        'Zarchiwizowano przy zapisie treści',
        'Zachowano podczas przejścia systemu',
        'odnośnik zanonimizowany',
      ),
      'sk' => (
        'Archívna kópia',
        'Uchované pri zápise obsahu',
        'Uchované pri prechode systému',
        'odkaz anonymizovaný',
      ),
      'uk' => (
        'Архівна копія',
        'Збережено під час запису вмісту',
        'Збережено під час переходу системи',
        'посилання анонімізовано',
      ),
      'vi' => (
        'Bản sao lưu trữ',
        'Lưu trữ khi ghi nội dung',
        'Được lưu trong quá trình chuyển đổi hệ thống',
        'liên kết đã được ẩn danh',
      ),
      _ => (
        'Archivní kopie',
        'Zachováno při zápisu obsahu',
        'Zachováno při přechodu systému',
        'odkaz anonymizován',
      ),
    };
    final origin = switch (mode) {
      'atomic-write' => labels.$2,
      'transition' => labels.$3,
      _ => labels.$1,
    };
    return privacyRedacted ? '$origin · ${labels.$4}' : origin;
  }
}
