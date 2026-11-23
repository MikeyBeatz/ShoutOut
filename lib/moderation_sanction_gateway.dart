import 'dart:collection';
import 'dart:convert';
import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';

import 'reaction_gateway.dart';
import 'timed_operation_gateway.dart';

const moderationSanctionActions = [
  'warning',
  'restrict1d',
  'restrict7d',
  'restrict30d',
  'restrict90d',
  'ban1d',
  'ban7d',
  'ban30d',
  'ban90d',
  'banPermanent',
];

class ModerationSanctionRequest {
  ModerationSanctionRequest({
    required this.userId,
    required this.scope,
    required this.operation,
    required Map<String, dynamic> payload,
    required this.idempotencyKey,
  }) : payload = Map.unmodifiable({
         ...payload,
         if (payload['reportIds'] is List)
           'reportIds': List.unmodifiable(payload['reportIds'] as List),
       });

  final String userId, scope, operation, idempotencyKey;
  final Map<String, dynamic> payload;
  final timedAttempt = TimedOperationAttempt();

  Map<String, dynamic> toPayload() => {
    ...payload,
    'expectedUserId': userId,
    'idempotencyKey': idempotencyKey,
  };
}

/// One uncertain decision owns its target until confirmed or definitively denied.
/// Report decisions, direct decisions and their retries share the same scope.
class ModerationSanctionGateway {
  ModerationSanctionGateway({
    required this.currentUserId,
    required this.send,
    String Function()? newKey,
  }) : newKey = newKey ?? _key;

  final String? Function() currentUserId;
  final Future<void> Function(ModerationSanctionRequest) send;
  final String Function() newKey;
  final _pending = <(String, String), ModerationSanctionRequest>{};
  final _running = <(String, String), Future<void>>{};

  static String contentScope(String type, String shoutId, String? targetId) =>
      'content:$type:$shoutId:${targetId ?? ''}';
  static String revocationScope(String sanctionId) => 'revoke:$sanctionId';
  ModerationSanctionRequest? pending(String userId, String scope) =>
      _pending[(userId, scope)];

  static String _key() {
    final random = Random.secure();
    return List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  static Map<String, dynamic> _canonical(Map<String, dynamic> input) {
    final result = SplayTreeMap<String, dynamic>.from(input);
    if (result['reportIds'] is List) {
      result['reportIds'] = List<String>.from(result['reportIds'] as List)
        ..sort();
    }
    if (result['note'] is String) {
      result['note'] = (result['note'] as String).trim();
    }
    return result;
  }

  Future<void> execute({
    required String userId,
    required String scope,
    required String operation,
    required Map<String, dynamic> payload,
  }) {
    final key = (userId, scope);
    if (currentUserId() != userId) {
      _pending.remove(key);
      return Future.error(
        _error('unauthenticated', 'The signed-in account changed.'),
      );
    }
    if (!['sanctionContent', 'revokeSanction'].contains(operation) ||
        payload.containsKey('expectedUserId') ||
        payload.containsKey('idempotencyKey') ||
        payload['note'] is! String ||
        (payload['note'] as String).trim().isEmpty ||
        (payload['note'] as String).runes.length > 500) {
      return Future.error(
        _error('invalid-argument', 'Invalid sanction request.'),
      );
    }
    final frozen = _canonical(payload), previous = _pending[key];
    if (previous != null &&
        (previous.operation != operation ||
            jsonEncode(_canonical(previous.payload)) != jsonEncode(frozen))) {
      return Future.error(
        _error('already-exists', 'Retry the original pending decision first.'),
      );
    }
    final running = _running[key];
    if (running != null) return running;
    final request = _pending.putIfAbsent(
      key,
      () => ModerationSanctionRequest(
        userId: userId,
        scope: scope,
        operation: operation,
        payload: frozen,
        idempotencyKey: newKey(),
      ),
    );
    late final Future<void> flight;
    flight = _attempt(key, request).whenComplete(() {
      if (identical(_running[key], flight)) _running.remove(key);
    });
    _running[key] = flight;
    return flight;
  }

  Future<void> retry(ModerationSanctionRequest request) => execute(
    userId: request.userId,
    scope: request.scope,
    operation: request.operation,
    payload: request.payload,
  );

  Future<void> _attempt(
    (String, String) key,
    ModerationSanctionRequest request,
  ) async {
    try {
      await send(request);
      _pending.remove(key);
      if (currentUserId() != key.$1) {
        throw _error('unauthenticated', 'The signed-in account changed.');
      }
    } catch (error) {
      if (isDefinitiveReactionFailure(error)) _pending.remove(key);
      rethrow;
    }
  }

  static FirebaseFunctionsException _error(String code, String message) =>
      FirebaseFunctionsException(code: code, message: message);
}
