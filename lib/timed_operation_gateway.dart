import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:crypto/crypto.dart';

/// Caller-owned retry binding. Keep this object while an action can be retried;
/// release it with the pending request. It never retains the request body.
class TimedOperationAttempt {
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
    String Function()? newNonce,
  }) : newNonce = newNonce ?? _randomNonce;

  final String? Function() currentUserId;
  final Future<DateTime> Function(String userId) issuedAt;
  final Future<void> Function(String operation, Map<String, dynamic> payload)
  send;
  final String Function() newNonce;

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
    if (attempt._timedKey == null) {
      final serverTime = await issuedAt(userId);
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
    if (currentUserId() != userId) throw _accountChanged();
    final request = jsonDecode(frozenPayload) as Map<String, dynamic>;
    request['idempotencyKey'] = attempt._timedKey;
    request['expectedUserId'] = userId;
    await send(operation, request);
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
