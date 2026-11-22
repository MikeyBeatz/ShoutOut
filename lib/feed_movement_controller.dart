import 'dart:async';
import 'dart:math' as math;

class FeedLocationFix {
  const FeedLocationFix(this.latitude, this.longitude, this.accuracy, this.at);
  final double latitude, longitude, accuracy;
  final int at;
  bool get valid =>
      latitude.isFinite &&
      latitude.abs() <= 90 &&
      longitude.isFinite &&
      longitude.abs() <= 180 &&
      accuracy.isFinite &&
      accuracy >= 0;
}

double feedDistanceMeters(FeedLocationFix a, FeedLocationFix b) {
  final radians = math.pi / 180;
  final x =
      math.pow(math.sin((b.latitude - a.latitude) * radians / 2), 2) +
      math.cos(a.latitude * radians) *
          math.cos(b.latitude * radians) *
          math.pow(math.sin((b.longitude - a.longitude) * radians / 2), 2);
  return 6371000 * 2 * math.asin(math.sqrt(x.clamp(0, 1)));
}

/// Approved DEV policy. GPS events never synchronize B2 or refresh the feed.
class FeedMovementController {
  FeedMovementController({
    required this.clock,
    required this.move,
    this.onError,
  });
  final int Function() clock;
  final Future<bool> Function(FeedLocationFix) move;
  final void Function(Object)? onError;
  FeedLocationFix? _center, _latest;
  int? _lastSeen, _lastTried;
  int _lastAttempt = 0, _epoch = 0;
  bool _active = false, _flight = false, _disposed = false;
  Timer? _timer;

  void seed(FeedLocationFix fix) {
    if (!fix.valid || _disposed) return;
    _epoch++;
    _center = fix;
    _latest = null;
    _lastSeen = null;
    _lastTried = null;
    _lastAttempt = clock();
    _timer?.cancel();
  }

  void setActive(bool value) {
    if (_disposed || _active == value) return;
    _active = value;
    _epoch++;
    _timer?.cancel();
    if (!value) _latest = null;
    if (value) _arm();
  }

  void accept(FeedLocationFix fix) {
    final age = clock() - fix.at;
    if (_disposed ||
        !_active ||
        !fix.valid ||
        fix.accuracy > 100 ||
        age < 0 ||
        age > 30000 ||
        _lastSeen != null && fix.at <= _lastSeen!) {
      return;
    }
    _lastSeen = fix.at;
    _latest = fix;
    _arm();
  }

  void _arm() {
    _timer?.cancel();
    final fix = _latest, center = _center;
    if (_disposed ||
        !_active ||
        _flight ||
        fix == null ||
        center == null ||
        fix.at == _lastTried ||
        clock() - fix.at > 30000 ||
        feedDistanceMeters(center, fix) <=
            250 + center.accuracy + fix.accuracy) {
      return;
    }
    final delay = math.max(0, 30000 - (clock() - _lastAttempt));
    _timer = Timer(Duration(milliseconds: delay), () => unawaited(_run()));
  }

  Future<void> _run() async {
    final fix = _latest;
    if (_disposed ||
        !_active ||
        _flight ||
        fix == null ||
        clock() - fix.at > 30000) {
      return;
    }
    final epoch = _epoch;
    _flight = true;
    _lastTried = fix.at;
    _lastAttempt = clock();
    try {
      if (await move(fix) && epoch == _epoch && _active && !_disposed) {
        _center = fix;
      }
    } catch (error) {
      if (epoch == _epoch && !_disposed) onError?.call(error);
    } finally {
      _flight = false;
      _arm();
    }
  }

  void dispose() {
    _disposed = true;
    _epoch++;
    _timer?.cancel();
  }
}
