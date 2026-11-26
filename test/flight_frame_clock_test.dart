import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/flight_frame_clock.dart';

void main() {
  test('30, 60 and 120 Hz advance the same original 16ms simulation', () {
    for (final hz in [30, 60, 120]) {
      final clock = FlightFrameClock();
      var steps = 0;
      for (var i = 0; i <= hz; i++) {
        steps += clock.advance(
          Duration(microseconds: (i * 1000000 / hz).round()),
        );
        expect(clock.interpolation, inInclusiveRange(0, 1));
      }
      expect(steps, 62);
      expect(clock.interpolation, .5);
    }
  });

  test('long stalls stay bounded and pause/reset discards background time', () {
    final clock = FlightFrameClock();
    expect(clock.advance(Duration.zero), 0);
    expect(clock.advance(const Duration(seconds: 5)), 3);
    clock.reset();
    expect(clock.advance(const Duration(minutes: 2)), 0);
    expect(clock.advance(const Duration(minutes: 2, milliseconds: 16)), 1);
  });

  test(
    'measures observed cadence and slow frames, not a configured FPS target',
    () {
      for (final hz in [30, 60, 120]) {
        final stats = FlightFrameStats();
        FlightFrameSample? sample;
        for (var i = 0; i <= hz; i++) {
          sample =
              stats.add(Duration(microseconds: (i * 1000000 / hz).round())) ??
              sample;
        }
        expect(sample!.fps, closeTo(hz, .01));
        expect(sample.p95Milliseconds, closeTo(1000 / hz, .01));
        stats.reset();
        expect(stats.add(const Duration(hours: 1)), isNull);
      }
      final stats = FlightFrameStats();
      stats.add(Duration.zero);
      final sample = stats.add(const Duration(seconds: 1));
      expect(sample!.fps, 1);
      expect(sample.p95Milliseconds, 1000);
    },
  );
}
