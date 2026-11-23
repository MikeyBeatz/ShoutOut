import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';

import 'reaction_gateway.dart';
import 'timed_operation_gateway.dart';

typedef ContentReportTarget = ({String type, String shoutId, String? targetId});

bool usesServerContentReportDecision({
  required String decision,
  required String targetType,
  required bool decisionsEnabled,
  required bool publicRemovalEnabled,
}) =>
    (decisionsEnabled &&
        ['shout', 'comment', 'privateReply'].contains(targetType) &&
        ['approve', 'escalate', 'resolve'].contains(decision)) ||
    (publicRemovalEnabled &&
        ['shout', 'comment'].contains(targetType) &&
        decision == 'remove');

class ContentReportDecisionRequest {
  ContentReportDecisionRequest({
    required this.userId,
    required this.target,
    required List<String> reportIds,
    required this.decision,
    required this.note,
    required this.idempotencyKey,
  }) : reportIds = List.unmodifiable([...reportIds]..sort());

  final String userId, decision, note, idempotencyKey;
  final ContentReportTarget target;
  final List<String> reportIds;
  final timedAttempt = TimedOperationAttempt();

  String get operation => decision == 'remove'
      ? 'removeReportedPublicContent'
      : 'decideContentReports';

  Map<String, dynamic> toPayload() => {
    'expectedUserId': userId,
    'targetType': target.type,
    'shoutId': target.shoutId,
    if (target.targetId != null) 'targetId': target.targetId,
    'reportIds': reportIds,
    'decision': decision,
    'note': note,
    'idempotencyKey': idempotencyKey,
  };
}

/// Freeze a complete decision for the target, including the original report IDs.
/// A refreshed list must not silently turn an uncertain request into a new one.
class ContentReportDecisionGateway {
  ContentReportDecisionGateway({
    required this.send,
    required this.currentUserId,
    String Function()? newKey,
  }) : newKey = newKey ?? _randomKey;

  final Future<void> Function(ContentReportDecisionRequest) send;
  final String? Function() currentUserId;
  final String Function() newKey;
  final _pending =
      <(String, ContentReportTarget), ContentReportDecisionRequest>{};
  final _running = <(String, ContentReportTarget), Future<void>>{};

  ContentReportDecisionRequest? pending(
    String userId,
    ContentReportTarget target,
  ) => _pending[(userId, target)];

  static String _randomKey() {
    final random = Random.secure();
    return List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  Future<void> decide({
    required String userId,
    required ContentReportTarget target,
    required List<String> reportIds,
    required String decision,
    required String note,
  }) {
    final scope = (userId, target);
    if (currentUserId() != userId) {
      _pending.remove(scope);
      return Future.error(_changed());
    }
    final ids = [...reportIds]..sort();
    if (ids.isEmpty ||
        ids.length > 50 ||
        ids.toSet().length != ids.length ||
        !(['approve', 'escalate', 'resolve'].contains(decision) ||
            decision == 'remove' &&
                ['shout', 'comment'].contains(target.type))) {
      return Future.error(
        FirebaseFunctionsException(
          code: 'invalid-argument',
          message: 'Invalid report decision.',
        ),
      );
    }
    final previous = _pending[scope];
    if (previous != null &&
        (previous.decision != decision ||
            previous.note != note.trim() ||
            previous.reportIds.length != ids.length ||
            !Iterable.generate(
              ids.length,
            ).every((i) => previous.reportIds[i] == ids[i]))) {
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
      () => ContentReportDecisionRequest(
        userId: userId,
        target: target,
        reportIds: ids,
        decision: decision,
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
    (String, ContentReportTarget) scope,
    ContentReportDecisionRequest request,
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
