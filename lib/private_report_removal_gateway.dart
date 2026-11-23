import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';

import 'reaction_gateway.dart';
import 'timed_operation_gateway.dart';

class PrivateReportRemovalRequest {
  PrivateReportRemovalRequest({
    required this.userId,
    required this.reportId,
    required this.note,
    required this.idempotencyKey,
  });

  final String userId, reportId, note, idempotencyKey;
  final timedAttempt = TimedOperationAttempt();

  Map<String, dynamic> toPayload() => {
    'expectedUserId': userId,
    'reportId': reportId,
    'note': note,
    'idempotencyKey': idempotencyKey,
  };
}

/// One immutable decision per account/report, retained across dismissed dialogs.
/// An uncertain result must be retried before another decision can be submitted.
class PrivateReportRemovalGateway {
  PrivateReportRemovalGateway({
    required this.send,
    required this.currentUserId,
    String Function()? newKey,
  }) : newKey = newKey ?? _randomKey;

  final Future<void> Function(PrivateReportRemovalRequest) send;
  final String? Function() currentUserId;
  final String Function() newKey;
  final _pending = <(String, String), PrivateReportRemovalRequest>{};
  final _running = <(String, String), Future<void>>{};

  PrivateReportRemovalRequest? pending(String userId, String reportId) =>
      _pending[(userId, reportId)];

  static String _randomKey() {
    final random = Random.secure();
    return List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  Future<void> remove({
    required String userId,
    required String reportId,
    required String note,
  }) {
    final scope = (userId, reportId);
    if (currentUserId() != userId) {
      _pending.remove(scope);
      return Future.error(_changed());
    }
    final previous = _pending[scope];
    if (previous != null && previous.note != note.trim()) {
      return Future.error(
        FirebaseFunctionsException(
          code: 'already-exists',
          message: 'Retry the original pending decision first.',
        ),
      );
    }
    final running = _running[scope];
    if (running != null) return running;
    final request = _pending.putIfAbsent(
      scope,
      () => PrivateReportRemovalRequest(
        userId: userId,
        reportId: reportId,
        note: note.trim(),
        idempotencyKey: newKey(),
      ),
    );
    late final Future<void> flight;
    flight = _attempt(scope, request).whenComplete(() {
      if (identical(_running[scope], flight)) _running.remove(scope);
    });
    _running[scope] = flight;
    return flight;
  }

  Future<void> _attempt(
    (String, String) scope,
    PrivateReportRemovalRequest request,
  ) async {
    try {
      await send(request);
      _pending.remove(scope);
      if (currentUserId() != scope.$1) throw _changed();
    } catch (error) {
      if (isDefinitiveReactionFailure(error)) _pending.remove(scope);
      rethrow;
    }
  }

  static FirebaseFunctionsException _changed() => FirebaseFunctionsException(
    code: 'unauthenticated',
    message: 'The signed-in account changed.',
  );
}
