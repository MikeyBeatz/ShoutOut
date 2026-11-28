import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:crypto/crypto.dart';

/// Caller-owned retry binding. Keep this object while an action can be retried;
/// release it with the pending request. It never retains the request body.
class TimedOperationAttempt {
  TimedOperationAttempt({this.persistBinding});

  /// Called before any transport. A durable CAS may return another tab's
  /// binding for the same immutable payload. Never persists Auth/App Check.
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>)?
  persistBinding;
  Map<String, dynamic> exportBinding() => {
    'scope': _scope == null ? null : [_scope!.$1, _scope!.$2, _scope!.$3],
    'fingerprint': _fingerprint,
    'timedKey': _timedKey,
  };
  void restoreBinding(Map<String, dynamic> data) {
    final s = data['scope'], f = data['fingerprint'], k = data['timedKey'];
    if (data.length != 3 ||
        s is! List ||
        s.length != 3 ||
        s.any((v) => v is! String || v.isEmpty) ||
        f is! String ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(f) ||
        k is! String ||
        !RegExp(r'^op1_[1-9][0-9]{0,12}_[a-f0-9]{32}$').hasMatch(k)) {
      throw StateError('Invalid saved operation binding');
    }
    final scope = (s[0] as String, s[1] as String, s[2] as String);
    if ((_scope != null && scope != _scope) ||
        (_fingerprint != null && f != _fingerprint)) {
      throw StateError('Saved operation payload changed');
    }
    _scope = scope;
    _fingerprint = f;
    _timedKey = k;
  }

  (String, String, String)? _scope;
  String? _fingerprint;
  String? _timedKey;
  Future<void>? _running;
}

/// Binds a caller's existing logical request ID to one immutable timed request.
/// The timestamp provider must use server-issued Auth metadata, never the
/// device clock. No Auth or App Check token is stored here.
class TimedOperationGateway {
  TimedOperationGateway({
    required this.currentUserId,
    required this.issuedAt,
    required this.send,
    this.onTiming,
    String Function()? newNonce,
  }) : newNonce = newNonce ?? _randomNonce;

  final String? Function() currentUserId;
  final Future<DateTime> Function(String userId) issuedAt;
  final Future<void> Function(String operation, Map<String, dynamic> payload)
  send;
  final String Function() newNonce;
  final void Function(String operation, String stage, Duration elapsed)?
  onTiming;

  static String _randomNonce() {
    final random = Random.secure();
    return List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  static Object? _canonical(Object? value) {
    if (value is Map) {
      final sorted = SplayTreeMap<String, Object?>();
      for (final entry in value.entries) {
        sorted[entry.key as String] = _canonical(entry.value);
      }
      return sorted;
    }
    if (value is List) return value.map(_canonical).toList();
    return value;
  }

  Future<void> call({
    required TimedOperationAttempt attempt,
    required String userId,
    required String operation,
    required Map<String, dynamic> payload,
  }) {
    if (currentUserId() != userId ||
        (payload.containsKey('expectedUserId') &&
            payload['expectedUserId'] != userId)) {
      return Future.error(_accountChanged());
    }
    final logicalKey = payload['idempotencyKey'];
    if (logicalKey is! String || logicalKey.isEmpty) {
      return Future.error(
        FirebaseFunctionsException(
          code: 'invalid-argument',
          message: 'Missing logical operation key.',
        ),
      );
    }
    final scope = (userId, operation, logicalKey);
    final signature = jsonEncode(_canonical(payload));
    final fingerprint = sha256.convert(utf8.encode(signature)).toString();
    if ((attempt._scope != null && attempt._scope != scope) ||
        (attempt._fingerprint != null && attempt._fingerprint != fingerprint)) {
      return Future.error(
        FirebaseFunctionsException(
          code: 'already-exists',
          message: 'Operation payload changed under the same key.',
        ),
      );
    }
    attempt._scope ??= scope;
    attempt._fingerprint ??= fingerprint;
    final running = attempt._running;
    if (running != null) return running;
    final future = _send(userId, operation, attempt, signature);
    attempt._running = future;
    return future.whenComplete(() => attempt._running = null);
  }

  Future<void> _send(
    String userId,
    String operation,
    TimedOperationAttempt attempt,
    String frozenPayload,
  ) async {
    final clock = Stopwatch()..start();
    if (attempt._timedKey == null) {
      late final DateTime serverTime;
      try {
        serverTime = await issuedAt(userId);
      } finally {
        onTiming?.call(operation, 'auth-metadata', clock.elapsed);
      }
      if (currentUserId() != userId) throw _accountChanged();
      final seconds = serverTime.toUtc().millisecondsSinceEpoch ~/ 1000;
      final nonce = newNonce();
      if (seconds <= 0 || !RegExp(r'^[a-f0-9]{32}$').hasMatch(nonce)) {
        throw FirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'operation-clock-unavailable',
        );
      }
      attempt._timedKey = 'op1_${seconds}_$nonce';
    }
    if (attempt.persistBinding case final persist?) {
      attempt.restoreBinding(await persist(attempt.exportBinding()));
    }
    if (currentUserId() != userId) throw _accountChanged();
    final request = jsonDecode(frozenPayload) as Map<String, dynamic>;
    request['idempotencyKey'] = attempt._timedKey;
    request['expectedUserId'] = userId;
    final callableClock = Stopwatch()..start();
    try {
      await send(operation, request);
    } finally {
      onTiming?.call(operation, 'callable', callableClock.elapsed);
    }
    // The caller retains only the fingerprint/key binding, including after an
    // acknowledgement. A caller retry after a later UI failure must still be
    // the original request. Expiry never silently mints a replacement key.
  }

  static FirebaseFunctionsException _accountChanged() =>
      FirebaseFunctionsException(
        code: 'unauthenticated',
        message: 'The signed-in account changed.',
      );
}
