import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';

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
  final _attempts = <(String, String, String), _TimedAttempt>{};
  final _running = <(String, String, String), Future<void>>{};

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
    final attempt = _attempts.putIfAbsent(
      scope,
      () => _TimedAttempt(signature),
    );
    if (attempt.signature != signature) {
      return Future.error(
        FirebaseFunctionsException(
          code: 'already-exists',
          message: 'Operation payload changed under the same key.',
        ),
      );
    }
    final running = _running[scope];
    if (running != null) return running;
    final future = _send(userId, operation, attempt);
    _running[scope] = future;
    return future.whenComplete(() => _running.remove(scope));
  }

  Future<void> _send(
    String userId,
    String operation,
    _TimedAttempt attempt,
  ) async {
    if (attempt.request == null) {
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
      final request = jsonDecode(attempt.signature) as Map<String, dynamic>;
      request['idempotencyKey'] = 'op1_${seconds}_$nonce';
      request['expectedUserId'] = userId;
      attempt.request = jsonEncode(request);
    }
    if (currentUserId() != userId) throw _accountChanged();
    await send(operation, jsonDecode(attempt.request!) as Map<String, dynamic>);
    // Keep the binding for the lifetime of this session, including after an
    // acknowledgement. A caller retry after a later UI failure must still be
    // the original request. Expiry never silently mints a replacement key.
  }

  static FirebaseFunctionsException _accountChanged() =>
      FirebaseFunctionsException(
        code: 'unauthenticated',
        message: 'The signed-in account changed.',
      );
}

class _TimedAttempt {
  _TimedAttempt(this.signature);

  final String signature;
  String? request;
}
