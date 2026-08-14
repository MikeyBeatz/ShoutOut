import 'package:flutter/foundation.dart';

/// Debug-only timing for the complete registration critical path.
///
/// No e-mail address, UID, or other personal data is collected.
class RegistrationTiming {
  RegistrationTiming._();

  static Stopwatch? _total;
  static int _lastElapsedMilliseconds = 0;

  static void start(String flow) {
    if (!kDebugMode) return;
    _total = Stopwatch()..start();
    _lastElapsedMilliseconds = 0;
    debugPrint('Registration timing: start flow=$flow');
  }

  static void checkpoint(String step) {
    if (!kDebugMode) return;
    final total = _total;
    if (total == null) return;
    final elapsed = total.elapsedMilliseconds;
    debugPrint(
      'Registration timing: $step '
      'step=${elapsed - _lastElapsedMilliseconds} ms total=$elapsed ms',
    );
    _lastElapsedMilliseconds = elapsed;
  }

  static void finish(String step) {
    checkpoint(step);
    _total?.stop();
    _total = null;
    _lastElapsedMilliseconds = 0;
  }

  static void cancel(String reason) {
    if (!kDebugMode || _total == null) return;
    debugPrint('Registration timing: cancelled reason=$reason');
    _total?.stop();
    _total = null;
    _lastElapsedMilliseconds = 0;
  }

  @visibleForTesting
  static bool get isRunning => _total != null;
}
