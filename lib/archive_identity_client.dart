import 'dart:math';
import 'dart:async';
import 'package:flutter/foundation.dart';

typedef ArchiveIdentitySend = Future<Object?> Function(Map<String, dynamic>);

/// One page flow; errors preserve rows and retry exactly the same request.
/// No archive/contact data enters persistent client storage or diagnostics.
class ArchiveIdentityController extends ChangeNotifier {
  ArchiveIdentityController({
    required this.userId,
    required this.currentUserId,
    required this.send,
  });
  final String userId;
  final String? Function() currentUserId;
  final ArchiveIdentitySend send;
  List<Map<String, dynamic>> items = [];
  Map<String, dynamic>? next;
  Map<String, dynamic>? _selection, _pending;
  bool loading = false, failed = false, _disposed = false;
  bool expired = false;
  final Stopwatch _lifetime = Stopwatch()..start();
  Timer? _expiryTimer;
  int? _validUntil;
  int _generation = 0;
  bool _append = false;
  static String requestId() => _randomId();
  static String _randomId() {
    final random = Random.secure();
    return List.generate(
      24,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  Future<void> open(Map<String, dynamic> selection) async {
    _selection = Map.of(selection);
    _pending = {
      ...selection,
      'expectedUserId': userId,
      'requestId': requestId(),
    };
    _append = false;
    await _load(++_generation);
  }

  Future<void> more() async {
    if (loading || next == null || _selection == null) return;
    _pending = {
      ..._selection!,
      'expectedUserId': userId,
      'requestId': requestId(),
      'cursor': next,
    };
    _append = true;
    await _load(++_generation);
  }

  Future<void> retry() async {
    if (!loading && _pending != null) await _load(++_generation);
  }

  void invalidate() {
    if (_disposed) return;
    _generation++;
    _expiryTimer?.cancel();
    _validUntil = null;
    items = [];
    next = null;
    _pending = null;
    _selection = null;
    loading = false;
    failed = false;
    notifyListeners();
  }

  Future<void> _load(int generation) async {
    if (_disposed) return;
    if (currentUserId() != userId) {
      invalidate();
      return;
    }
    loading = true;
    expired = false;
    failed = false;
    notifyListeners();
    final started = _lifetime.elapsedMilliseconds;
    try {
      final raw = await send(Map.of(_pending!));
      if (_disposed || generation != _generation) return;
      if (currentUserId() != userId) {
        invalidate();
        return;
      }
      if (raw is! Map ||
          raw['version'] != 1 ||
          raw['userId'] != userId ||
          raw['action'] != _selection?['action'] ||
          raw['items'] is! List ||
          (raw['items'] as List).length > 50 ||
          (raw['items'] as List).any((e) => e is! Map) ||
          raw['next'] != null && raw['next'] is! Map) {
        throw const FormatException('Invalid archive page');
      }
      final validity = raw['validForMillis'];
      if (validity != null && (validity is! int || validity < 0) ||
          (raw['items'] as List).isNotEmpty && validity == null) {
        throw const FormatException('Invalid archive validity');
      }
      final rows = (raw['items'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      items = _append ? [...items, ...rows] : rows;
      next = raw['next'] == null
          ? null
          : Map<String, dynamic>.from(raw['next'] as Map);
      final deadline = validity is int ? started + validity : null;
      _validUntil = _append && _validUntil != null && deadline != null
          ? min(_validUntil!, deadline)
          : deadline ?? (_append ? _validUntil : null);
      _armExpiry();
    } catch (_) {
      if (!_disposed && generation == _generation) failed = true;
    } finally {
      if (!_disposed && generation == _generation) {
        loading = false;
        notifyListeners();
      }
    }
  }

  void _armExpiry() {
    _expiryTimer?.cancel();
    final end = _validUntil;
    if (_disposed || end == null) return;
    final remaining = end - _lifetime.elapsedMilliseconds;
    if (remaining <= 0) {
      expired = true;
      invalidate();
      return;
    }
    // Local timers only; never poll the archive. Cap browser timeout duration.
    _expiryTimer = Timer(
      Duration(milliseconds: min(remaining, 86400000)),
      _armExpiry,
    );
  }

  @override
  void dispose() {
    _expiryTimer?.cancel();
    _lifetime.stop();
    _disposed = true;
    _generation++;
    items = [];
    _pending = null;
    _selection = null;
    super.dispose();
  }
}
