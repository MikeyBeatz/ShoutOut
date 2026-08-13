import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/profile_tile_layout.dart';

void main() {
  test('centres a single tile in each row', () {
    expect(arrangeProfileTiles(['A']), [null, 'A', null]);
    expect(arrangeProfileTiles(['A', 'B', 'C', 'D']), [
      'A',
      'B',
      'C',
      null,
      'D',
      null,
    ]);
  });

  test('places two tiles from the left through the centre', () {
    expect(arrangeProfileTiles(['A', 'B']), ['A', 'B', null]);
    expect(arrangeProfileTiles(['A', 'B', 'C', 'D', 'E']), [
      'A',
      'B',
      'C',
      'D',
      'E',
      null,
    ]);
  });

  test('fills complete rows without placeholders', () {
    expect(arrangeProfileTiles(['A', 'B', 'C']), ['A', 'B', 'C']);
    expect(arrangeProfileTiles(<String>[]), isEmpty);
  });
}
