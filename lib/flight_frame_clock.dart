import 'dart:math' as math;

/// Keeps the original 16 ms simulation step independent of display refresh rate.
/// Rendering interpolates the last two states instead of quantizing motion to
/// that step. Long stalls are bounded; background time is never replayed.
class FlightFrameClock {
  static const stepMicroseconds = 16000;
  static const stepSeconds = stepMicroseconds / Duration.microsecondsPerSecond;
  int? _last;
  int _remainder = 0;

  double get interpolation => _remainder / stepMicroseconds;

  int advance(Duration elapsed) {
    final now = elapsed.inMicroseconds;
    final previous = _last;
    _last = now;
    if (previous == null || now <= previous) return 0;
    _remainder += math.min(now - previous, 50000);
    final steps = _remainder ~/ stepMicroseconds;
    _remainder %= stepMicroseconds;
    return steps;
  }

  void reset() {
    _last = null;
    _remainder = 0;
  }
}

class FlightFrameSample {
  const FlightFrameSample(this.fps, this.p95Milliseconds);
  final double fps;
  final double p95Milliseconds;
}

/// Optional, bounded local measurement of animation callback cadence. This is
/// not GPU/presentation timing and sends no telemetry. Stop/resume starts a new
/// window so background gaps cannot be mistaken for slow gameplay frames.
class FlightFrameStats {
  int? _last;
  final List<int> _intervals = [];
  int _total = 0;

  FlightFrameSample? add(Duration elapsed) {
    final now = elapsed.inMicroseconds;
    final previous = _last;
    _last = now;
    if (previous == null || now <= previous) return null;
    final interval = now - previous;
    _intervals.add(interval);
    _total += interval;
    if (_total < 1000000 && _intervals.length < 240) return null;
    final sorted = List<int>.of(_intervals)..sort();
    final result = FlightFrameSample(
      _intervals.length * 1000000 / _total,
      sorted[(sorted.length * .95).ceil() - 1] / 1000,
    );
    _intervals.clear();
    _total = 0;
    return result;
  }

  void reset() {
    _last = null;
    _intervals.clear();
    _total = 0;
  }
}
