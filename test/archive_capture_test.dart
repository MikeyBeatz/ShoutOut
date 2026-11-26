import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/archive_capture.dart';

void main() {
  test('account capture remains distinct from publication and transition', () {
    final info = ArchiveCaptureInfo.decode({
      'archived': true,
      'captureMode': 'account-archive',
      'capturedAtMillis': 1795700000000,
    });
    expect(info.label('cs'), 'Zachováno při úklidu účtu');
    for (final language in ['cs', 'en', 'de', 'pl', 'sk', 'uk', 'vi']) {
      expect(
        info.label(language),
        isNot(const ArchiveCaptureInfo(mode: 'atomic-write').label(language)),
      );
      expect(
        info.label(language),
        isNot(const ArchiveCaptureInfo(mode: 'transition').label(language)),
      );
      expect(
        info.label(language),
        isNot(const ArchiveCaptureInfo().label(language)),
      );
    }
  });
  test(
    'legacy response stays generic instead of claiming publication capture',
    () {
      final info = ArchiveCaptureInfo.decode({'archived': true});
      expect(info.mode, isNull);
      expect(info.label('cs'), 'Archivní kopie');
      expect(info.label('en'), 'Archived copy');
    },
  );

  test(
    'later capture is explicit in every supported language and survives redaction',
    () {
      final info = ArchiveCaptureInfo.decode({
        'archived': true,
        'captureMode': 'transition',
        'capturedAtMillis': 1795700000000,
        'participants': ['private data is ignored'],
      });
      expect(info.capturedAtMillis, 1795700000000);
      expect(info.label('cs'), 'Zachováno při přechodu systému');
      expect(info.label('en'), 'Preserved during the system transition');
      for (final language in ['cs', 'en', 'de', 'pl', 'sk', 'uk', 'vi']) {
        final ordinary = const ArchiveCaptureInfo(
          mode: 'atomic-write',
        ).label(language);
        final later = info.label(language);
        expect(later, isNot(ordinary));
        expect(
          info.label(language, privacyRedacted: true),
          startsWith('$later · '),
        );
      }
    },
  );

  test(
    'unrecognized provenance and invalid times fail instead of displaying a false origin',
    () {
      for (final invalid in [
        null,
        double.nan,
        -1,
        1.5,
        'later',
        253402300800000,
      ]) {
        expect(
          () => ArchiveCaptureInfo.decode({
            'archived': true,
            'captureMode': 'transition',
            'capturedAtMillis': invalid,
          }),
          throwsStateError,
        );
      }
      expect(
        () => ArchiveCaptureInfo.decode({
          'archived': true,
          'captureMode': 'assumed-original',
          'capturedAtMillis': 1,
        }),
        throwsStateError,
      );
    },
  );
}
