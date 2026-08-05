import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/geography.dart';

void main() {
  test('geohash is deterministic and respects precision', () {
    expect(encodeGeohash(50.0755, 14.4378), 'u2fkbec');
    expect(encodeGeohash(50.0755, 14.4378, precision: 5), 'u2fkb');
  });

  test('geography builds a useful region label', () {
    final geography = ShoutGeography.fromData({
      'geohash': 'u2fkbnh',
      'countryCode': 'CZ',
      'subdivisionCode': 'CZ-10',
      'localityName': 'Praha',
    });
    expect(geography.regionLabel, 'Praha · CZ-10 · CZ');
  });
}
