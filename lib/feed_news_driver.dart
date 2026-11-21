import 'dart:async';

/// Inactive policy adapter. All timing must be explicitly chosen by its host;
/// no global timer or production polling interval is installed by this module.
class FeedNewsDriver {
  FeedNewsDriver({
    required this.check,
    required this.settleDelay,
    this.maximumInterval,
    this.onInvalidate,
    this.onError,
  }) {
    if (settleDelay.isNegative ||
        maximumInterval != null && maximumInterval! <= Duration.zero) {
      throw ArgumentError('Invalid news detection timing');
    }
  }
  final Future<void> Function() check;
  final Duration settleDelay;
  final Duration? maximumInterval;
  final void Function()? onInvalidate;
  final void Function(Object, StackTrace)? onError;
  Timer? _pending, _periodic;
  Future<void>? _flight;
  bool _active = false, _disposed = false, _dirty = false;

  void setActive(bool value) {
    if (_disposed || value == _active) return;
    _active = value;
    if (!value) {
      _pending?.cancel();
      _pending = null;
      _periodic?.cancel();
      _periodic = null;
      _dirty = false;
      return;
    }
    pulse();
    _armPeriodic();
  }

  void _armPeriodic() {
    if (!_active || _disposed || maximumInterval == null) return;
    _periodic = Timer(maximumInterval!, () {
      _periodic = null;
      pulse();
      _armPeriodic();
    });
  }

  void pulse() {
    if (!_active || _disposed) return;
    final firstPulse = !_dirty;
    _dirty = true;
    if (firstPulse) onInvalidate?.call();
    // Do not slide this deadline on every pulse: continuous publishing must
    // not postpone verification forever. Pulses during a flight survive it.
    if (_flight != null || _pending != null) return;
    _pending = Timer(settleDelay, () {
      _pending = null;
      if (!_active || _disposed || !_dirty) return;
      _dirty = false;
      late final Future<void> flight;
      flight = Future.sync(check)
          .catchError((Object error, StackTrace stack) {
            if (_active && !_disposed) onError?.call(error, stack);
          })
          .whenComplete(() {
            if (identical(_flight, flight)) _flight = null;
            if (_active && !_disposed && _dirty) pulse();
          });
      _flight = flight;
    });
  }

  void dispose() {
    _disposed = true;
    _active = false;
    _pending?.cancel();
    _periodic?.cancel();
  }
}
