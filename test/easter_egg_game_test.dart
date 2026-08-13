import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/easter_egg_game.dart';

void main() {
  test('gravity accelerates a fall over time', () {
    final first = flightVelocityAfterGravity(0, .1);
    final second = flightVelocityAfterGravity(first, .1);

    expect(first, greaterThan(0));
    expect(second, greaterThan(first));
    expect(flightVelocityAfterGravity(.97, 1), greaterThan(.97));
  });

  test('every tap restores the same predictable climb', () {
    expect(flightVelocityAfterTap(0), -.66);
    expect(flightVelocityAfterTap(.8), -.66);
    expect(flightVelocityAfterTap(-.4), -.66);
  });
}
