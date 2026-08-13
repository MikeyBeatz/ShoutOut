import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/geography.dart';

void main() {
  test('geohash is deterministic and respects precision', () {
    expect(encodeGeohash(50.0755, 14.4378), 'u2fkbec');
    expect(encodeGeohash(50.0755, 14.4378, precision: 5), 'u2fkb');
  });

  test('geohash supports locations across Czechia and Europe', () {
    final locations = {
      'Litoměřice': (50.534, 14.132),
      'Lovosice': (50.515, 14.051),
      'Ústí nad Labem': (50.661, 14.040),
      'Praha': (50.076, 14.438),
      'Bratislava': (48.148, 17.107),
      'Varšava': (52.230, 21.012),
      'Berlín': (52.520, 13.405),
      'Řím': (41.903, 12.496),
    };
    final hashes = locations.map(
      (name, point) => MapEntry(name, encodeGeohash(point.$1, point.$2)),
    );

    expect(hashes.values, everyElement(matches(r'^[0-9b-hjkmnp-z]{7}$')));
    expect(hashes.values.toSet(), hasLength(locations.length));
    expect(hashes['Litoměřice'], isNot(hashes['Lovosice']));
  });

  test('geohash accepts world boundaries and rejects invalid coordinates', () {
    expect(encodeGeohash(-90, -180), hasLength(7));
    expect(encodeGeohash(90, 180), hasLength(7));
    expect(() => encodeGeohash(90.01, 0), throwsRangeError);
    expect(() => encodeGeohash(0, -180.01), throwsRangeError);
    expect(() => encodeGeohash(double.nan, 0), throwsRangeError);
    expect(() => encodeGeohash(0, 0, precision: 0), throwsRangeError);
  });

  test('public Shout location is rounded consistently outside Litoměřice', () {
    expect(publicLocationCoordinate(50.6605659), 50.66);
    expect(publicLocationCoordinate(14.0402374), 14.04);
    expect(publicLocationCoordinate(-33.8688), -33.87);
    expect(
      () => publicLocationCoordinate(double.infinity),
      throwsArgumentError,
    );
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
