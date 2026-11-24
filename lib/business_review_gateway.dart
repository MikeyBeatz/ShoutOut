import 'dart:collection';
import 'dart:convert';
import 'dart:math';
import 'package:cloud_functions/cloud_functions.dart';
import 'reaction_gateway.dart';
import 'timed_operation_gateway.dart';

const businessReviewDecisions = [
  'approve',
  'reject',
  'suspend',
  'reactivate',
  'resubmit',
];
Object? _freezeBusinessValue(Object? value) {
  if (value is Map) {
    return Map<String, dynamic>.unmodifiable(
      SplayTreeMap<String, dynamic>.from({
        for (final entry in value.entries)
          entry.key as String: _freezeBusinessValue(entry.value),
      }),
    );
  }
  if (value is List) return List.unmodifiable(value.map(_freezeBusinessValue));
  return value;
}

class BusinessReviewRequest {
  BusinessReviewRequest({
    required this.userId,
    required this.applicationId,
    required Map<String, dynamic> payload,
    required this.idempotencyKey,
    required this.generation,
  }) : payload = _freezeBusinessValue(payload) as Map<String, dynamic>;
  final String userId, applicationId, idempotencyKey;
  final int generation;
  final Map<String, dynamic> payload;
  final timedAttempt = TimedOperationAttempt();
  Map<String, dynamic> toPayload() => {
    ...payload,
    'applicationId': applicationId,
    'expectedUserId': userId,
    'idempotencyKey': idempotencyKey,
  };
}

class BusinessReviewGateway {
  BusinessReviewGateway({
    required this.currentUserId,
    required this.send,
    String Function()? newKey,
  }) : newKey = newKey ?? _key;
  final String? Function() currentUserId;
  final Future<void> Function(BusinessReviewRequest request) send;
  final String Function() newKey;
  final _pending = <(String, String), BusinessReviewRequest>{};
  final _running = <(String, String), Future<void>>{};
  String? _viewer;
  int _generation = 0;
  void retainViewer(String? viewer) {
    if (_viewer == viewer) return;
    _generation++;
    _viewer = viewer;
    _pending.clear();
    _running.clear();
  }

  void _retainViewer() => retainViewer(currentUserId());

  BusinessReviewRequest? pending(String userId, String applicationId) {
    _retainViewer();
    return userId == _viewer ? _pending[(userId, applicationId)] : null;
  }

  static String _key() {
    final random = Random.secure();
    return List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  Future<void> execute({
    required String userId,
    required String applicationId,
    required Map<String, dynamic> payload,
  }) {
    _retainViewer();
    if (_viewer != userId) {
      return Future.error(
        _error('unauthenticated', 'The signed-in account changed.'),
      );
    }
    final decision = payload['decision'],
        revision = payload['expectedRevision'],
        note = payload['note'] ?? '';
    if (!businessReviewDecisions.contains(decision) ||
        revision is! int ||
        revision < 0 ||
        note is! String ||
        note.runes.length > 500 ||
        (['reject', 'suspend'].contains(decision) && note.trim().isEmpty) ||
        payload.containsKey('expectedUserId') ||
        payload.containsKey('idempotencyKey') ||
        payload.containsKey('applicationId')) {
      return Future.error(
        _error('invalid-argument', 'Invalid Business decision.'),
      );
    }
    final frozen =
        _freezeBusinessValue({...payload, 'note': note.trim()})
            as Map<String, dynamic>;
    final key = (userId, applicationId), previous = _pending[key];
    if (previous != null &&
        jsonEncode(previous.payload) != jsonEncode(frozen)) {
      return Future.error(
        _error('already-exists', 'Retry the original pending decision first.'),
      );
    }
    final running = _running[key];
    if (running != null) return running;
    final request = _pending.putIfAbsent(
      key,
      () => BusinessReviewRequest(
        userId: userId,
        applicationId: applicationId,
        payload: frozen,
        idempotencyKey: newKey(),
        generation: _generation,
      ),
    );
    late final Future<void> flight;
    flight = _attempt(key, request).whenComplete(() {
      if (identical(_running[key], flight)) _running.remove(key);
    });
    _running[key] = flight;
    return flight;
  }

  Future<void> retry(BusinessReviewRequest request) {
    _retainViewer();
    if (!identical(
      _pending[(request.userId, request.applicationId)],
      request,
    )) {
      return Future.error(
        _error(
          'unauthenticated',
          'The pending Business request is no longer available.',
        ),
      );
    }
    return execute(
      userId: request.userId,
      applicationId: request.applicationId,
      payload: request.payload,
    );
  }

  Future<void> _attempt(
    (String, String) key,
    BusinessReviewRequest request,
  ) async {
    try {
      await send(request);
      _retainViewer();
      if (identical(_pending[key], request)) _pending.remove(key);
      if (currentUserId() != request.userId ||
          request.generation != _generation) {
        throw _error('unauthenticated', 'The signed-in account changed.');
      }
    } catch (error) {
      if (isDefinitiveReactionFailure(error) &&
          identical(_pending[key], request)) {
        _pending.remove(key);
      }
      rethrow;
    }
  }

  static FirebaseFunctionsException _error(String code, String message) =>
      FirebaseFunctionsException(code: code, message: message);
}
