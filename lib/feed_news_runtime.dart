import 'dart:async';
import 'dart:math' as math;

class FeedNewsSignal {
  const FeedNewsSignal(this.token, {this.confirmed = true});
  final String? token;
  final bool confirmed;
}

/// Bounded, non-personal signal coverage supplied by the signed feed context.
class FeedNewsSignals {
  FeedNewsSignals.fromWire(Map value)
    : baseline = value['baseline'] as String,
      generation = value['generation'] as String,
      incarnation = List<int>.from(value['incarnation'] as List),
      heads = value['heads'] == null
          ? null
          : Map<String, String?>.from(value['heads'] as Map) {
    if (value['v'] != 1 ||
        baseline.isEmpty ||
        !RegExp(r'^[a-z][a-z0-9-]{0,39}$').hasMatch(generation) ||
        incarnation.length != 2 ||
        incarnation[0] < 0 ||
        incarnation[1] < 0 ||
        incarnation[1] >= 1000000000 ||
        heads != null &&
            (!heads!.containsKey('_control') ||
                heads!.length > 64 ||
                heads!.entries.any(
                  (e) =>
                      e.key != '_control' &&
                          !RegExp(
                            r'^[0123456789bcdefghjkmnpqrstuvwxyz]{4}$',
                          ).hasMatch(e.key) ||
                      e.value != null &&
                          !RegExp(r'^[a-f0-9-]{36}$').hasMatch(e.value!),
                ))) {
      throw const FormatException('Invalid feed news signals');
    }
  }
  final String baseline, generation;
  final List<int> incarnation;
  final Map<String, String?>? heads;
  int? readUnits;
  String get stamp => '$baseline:$generation:${incarnation.join(':')}';
}

/// Host-controlled, active-view-only runtime. No transport, timers or listeners
/// exist until a host explicitly supplies a committed baseline and activates it.
class FeedNewsRuntime {
  FeedNewsRuntime({
    required this.check,
    required this.readHeads,
    required this.watch,
    required this.pendingCount,
    required this.invalidate,
    this.onError,
    this.retryAfter,
    int Function()? clock,
    double Function()? jitter,
  }) : _now = clock ?? (() => DateTime.now().millisecondsSinceEpoch),
       _jitter = jitter ?? math.Random().nextDouble;
  final Future<void> Function() check;
  final Future<FeedNewsSignals> Function() readHeads;
  final Stream<FeedNewsSignal> Function(String generation, String cell) watch;
  final int Function() pendingCount;
  final void Function() invalidate;
  final void Function(Object error)? onError;
  final Duration? Function(Object error)? retryAfter;
  final int Function() _now;
  final double Function() _jitter;
  final _subscriptions = <StreamSubscription<FeedNewsSignal>>[];
  final _seenCells = <String>{}, _unconfirmedCells = <String>{};
  bool _reconnect = false;
  FeedNewsSignals? _context;
  Map<String, String?> _heads = {};
  Timer? _timer;
  bool _active = false, _disposed = false, _flight = false, _dirty = false;
  bool _batch = false, _trial = false;
  int _epoch = 0, _due = 0, _nextBatch = 0, _nextVerify = 0;
  int _retryAt = 0, _failures = 0, _batchSince = 0, _nextTrial = 0;
  int _windowAt = 0, _signals = 0, _burstAt = 0, _burst = 0;
  int _expensiveWindows = 0, _cheapTrials = 0, _trialEnd = 0;
  int _countWork = 30; // Replaced by observed work when the host has metrics.
  int _windowCountReads = 0, _windowChecks = 0;
  int? _batchReadUnits;
  int signalReads = 0, headReads = 0, countRequests = 0;
  bool get batching => _batch;

  void clear() {
    _stop();
    _epoch++;
    _context = null;
    _heads.clear();
  }

  void configure(FeedNewsSignals context) {
    if (_disposed || _context?.stamp == context.stamp) return;
    _stop();
    _epoch++;
    _context = context;
    _batchReadUnits = null;
    _windowCountReads = 0;
    _windowChecks = 0;
    _heads = {...?context.heads};
    _batch = context.heads == null;
    _trial = false;
    _dirty = true;
    _retryAt = 0;
    _failures = 0;
    _cheapTrials = 0;
    _expensiveWindows = 0;
    _signals = 0;
    _burst = 0;
    _windowAt = _burstAt = _now();
    _due = _nextBatch = _nextVerify = _now();
    _batchSince = _now();
    _nextTrial = _now() + 60000;
    if (_active) {
      _subscribe();
      _arm();
    }
  }

  void setActive(bool value, {bool freshBaseline = false}) {
    if (_disposed || value == _active) return;
    _active = value;
    _epoch++;
    _stop();
    if (value && _context != null) {
      _dirty = !freshBaseline || _context!.heads == null;
      _due = _nextBatch = _nextVerify = _now();
      if (_dirty) invalidate();
      _subscribe();
      _arm();
    }
  }

  void pulse({bool immediate = false}) {
    if (!_active || _disposed || _context == null) return;
    invalidate();
    final due = _now() + (immediate ? 0 : _spread(2000));
    if (!_dirty || due < _due) _due = due;
    _dirty = true;
    _arm();
  }

  void observedCountReads(int reads) {
    if (reads > 0) {
      _countWork = reads;
      _windowCountReads += reads;
    }
  }

  int _spread(int millis) =>
      (millis * (.9 + .1 * _jitter().clamp(0, 1))).floor();
  void _subscribe() {
    if (!_active || _context?.heads == null || _batch && !_trial) return;
    final epoch = _epoch, context = _context!;
    _seenCells.clear();
    _unconfirmedCells.clear();
    _reconnect = false;
    try {
      for (final cell in context.heads!.keys) {
        _subscriptions.add(
          watch(context.generation, cell).listen(
            (event) {
              if (epoch != _epoch || !_active || _disposed) return;
              if (!event.confirmed) {
                if (_seenCells.contains(cell)) {
                  _unconfirmedCells.add(cell);
                  _reconnect = true;
                  invalidate();
                }
                return;
              }
              _seenCells.add(cell);
              _unconfirmedCells.remove(cell);
              if (_reconnect &&
                  _unconfirmedCells.isEmpty &&
                  _seenCells.length == context.heads!.length) {
                _reconnect = false;
                pulse(immediate: true);
              }
              final token = event.token;
              signalReads++;
              _signals++;
              if (_now() - _burstAt >= 5000) {
                _burstAt = _now();
                _burst = 0;
              }
              if (_heads[cell] != token) {
                _heads[cell] = token;
                _burst++;
                pulse();
              }
              if (_burst >= 32) _enterBatch();
            },
            onError: (Object error, StackTrace stack) {
              if (epoch != _epoch || !_active || _disposed) return;
              _failure(error);
              _enterBatch();
            },
          ),
        );
      }
    } catch (error) {
      _failure(error);
      _enterBatch();
    }
  }

  void _cancelSubscriptions() {
    final old = [..._subscriptions];
    _subscriptions.clear();
    for (final subscription in old) {
      unawaited(
        Future<void>.sync(subscription.cancel).catchError((Object error) {
          if (!_disposed) onError?.call(error);
        }),
      );
    }
  }

  void _stop() {
    _timer?.cancel();
    _timer = null;
    _cancelSubscriptions();
  }

  void _enterBatch() {
    if (!_batch) {
      _batchSince = _now();
      _nextTrial = _now() + 60000;
    }
    _batch = true;
    _trial = false;
    _nextTrial = math.max(_nextTrial, _now() + 60000);
    _cancelSubscriptions();
    _nextBatch = _now() + _spread(5000);
    _arm();
  }

  void _failure(Object error) {
    invalidate();
    _dirty = true;
    final backoff = math.min(60000, 5000 * (1 << math.min(_failures++, 4)));
    final server = retryAfter?.call(error)?.inMilliseconds ?? 0;
    _retryAt =
        _now() + math.max(server, backoff + (backoff * .1 * _jitter()).floor());
    _due = _retryAt;
    onError?.call(error);
  }

  void _arm() {
    _timer?.cancel();
    _timer = null;
    if (!_active || _disposed || _context == null || _flight) return;
    final deadlines = <int>[
      if (_dirty) _due,
      if (pendingCount() > 0) _nextVerify,
      if (_batch && !_trial) _nextBatch,
      if (_batch && _context!.heads != null && !_trial) _nextTrial,
      if (_trial) _trialEnd,
      if (!_batch) _windowAt + 60000,
    ];
    if (deadlines.isEmpty) return;
    final at = math.max(_retryAt, deadlines.reduce(math.min));
    _timer = Timer(
      Duration(milliseconds: math.max(0, at - _now())),
      () => unawaited(_run()),
    );
  }

  Future<void> _run() async {
    if (_disposed || !_active || _context == null || _flight) return;
    final epoch = _epoch, context = _context!;
    _flight = true;
    try {
      if (_trial && _now() >= _trialEnd) {
        // Include initial subscription reads, seven Rules dependencies and a
        // projection of subsequent updates over the same 60-second window.
        final initial = math.min(_signals, context.heads!.length);
        final signalCost =
            (initial + (_signals - initial) * 12) * 8 + _windowCountReads * 12;
        final batchCost =
            (_batchReadUnits ?? context.heads!.length + 32) * 12 +
            math.min(12, _windowChecks * 12) * _countWork;
        _cheapTrials = signalCost < .75 * batchCost ? _cheapTrials + 1 : 0;
        _trial = false;
        if (_cheapTrials >= 2) {
          _batch = false;
          _signals = 0;
          _windowAt = _now();
        } else {
          _cancelSubscriptions();
          _nextTrial = _now() + 60000;
        }
      }
      if (!_batch && _now() - _windowAt >= 60000) {
        final signalCost = _signals * 8 + _windowCountReads;
        final batchCost =
            (_batchReadUnits ?? context.heads!.length + 32) * 12 +
            math.min(12, _windowChecks) * _countWork;
        _expensiveWindows = signalCost > 1.25 * batchCost
            ? _expensiveWindows + 1
            : 0;
        _signals = 0;
        _windowAt = _now();
        _windowCountReads = 0;
        _windowChecks = 0;
        if (_expensiveWindows >= 2) _enterBatch();
      }
      if (_batch &&
          !_trial &&
          context.heads != null &&
          _now() >= _nextTrial &&
          _now() - _batchSince >= 60000) {
        _trial = true;
        _trialEnd = _now() + 5000;
        _signals = 0;
        _windowCountReads = 0;
        _windowChecks = 0;
        _subscribe();
      }
      if (_batch && !_trial && _now() >= _nextBatch && context.heads != null) {
        final result = await readHeads();
        if (epoch != _epoch || !_active || _disposed) return;
        if (result.stamp != context.stamp ||
            result.heads == null ||
            result.heads!.length != _heads.length ||
            !result.heads!.keys.every(_heads.containsKey)) {
          throw const FormatException('Foreign news coverage');
        }
        headReads += result.heads!.length;
        _batchReadUnits = result.readUnits;
        if (_reconnect) {
          _reconnect = false;
          pulse(immediate: true);
        }
        for (final entry in result.heads!.entries) {
          if (_heads[entry.key] != entry.value) {
            _heads[entry.key] = entry.value;
            pulse(immediate: true);
          }
        }
        _nextBatch = _now() + _spread(5000);
      }
      final needsCheck =
          _dirty && _now() >= _due ||
          pendingCount() > 0 && _now() >= _nextVerify ||
          _batch && context.heads == null && _now() >= _nextBatch;
      if (needsCheck) {
        _dirty = false;
        countRequests++;
        _windowChecks++;
        _nextVerify = _now() + _spread(15000);
        if (context.heads == null) _nextBatch = _now() + _spread(5000);
        await check();
        if (epoch != _epoch || !_active || _disposed) return;
      }
      _retryAt = 0;
      _failures = 0;
    } catch (error) {
      if (epoch == _epoch && _active && !_disposed) _failure(error);
    } finally {
      _flight = false;
      _arm();
    }
  }

  void dispose() {
    _disposed = true;
    _active = false;
    _epoch++;
    _stop();
  }
}
