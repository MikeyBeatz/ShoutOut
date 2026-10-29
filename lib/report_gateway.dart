import 'dart:convert';
import 'dart:math';

import 'reaction_gateway.dart';

class ReportAccountChanged implements Exception {}

class ContentReportRequest {
  const ContentReportRequest({
    required this.userId,
    required this.shoutId,
    required this.targetType,
    required this.reason,
    required this.idempotencyKey,
    this.targetId,
  });

  final String userId;
  final String shoutId;
  final String targetType;
  final String? targetId;
  final String reason;
  final String idempotencyKey;

  Map<String, dynamic> toPayload() => {
    'expectedUserId': userId,
    'shoutId': shoutId,
    'targetType': targetType,
    if (targetId != null) 'targetId': targetId,
    'reason': reason,
    'idempotencyKey': idempotencyKey,
  };
}

/// Retries of an unchanged report retain the original key. The server's
/// deterministic report ID prevents changed drafts from overwriting an earlier
/// report, including after moderation. Keys last only for the open detail.
class ReportGateway {
  ReportGateway({
    required this.send,
    required this.currentUserId,
    String Function()? newKey,
  }) : newKey = newKey ?? _randomKey;

  final Future<void> Function(ContentReportRequest) send;
  final String? Function() currentUserId;
  final String Function() newKey;
  final _pending = <String, ContentReportRequest>{};
  final _running = <(String, String, String, String?), Future<void>>{};

  static String _randomKey() {
    final random = Random.secure();
    return List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  Future<void> submit({
    required String userId,
    required String shoutId,
    required String targetType,
    required String reason,
    String? targetId,
  }) {
    final scope = (userId, shoutId, targetType, targetId);
    final running = _running[scope];
    if (running != null) return running;
    final signature = jsonEncode([
      userId,
      shoutId,
      targetType,
      targetId,
      reason,
    ]);
    final future = _attempt(
      signature,
      userId,
      () => ContentReportRequest(
        userId: userId,
        shoutId: shoutId,
        targetType: targetType,
        targetId: targetId,
        reason: reason,
        idempotencyKey: newKey(),
      ),
    );
    _running[scope] = future;
    return future.whenComplete(() => _running.remove(scope));
  }

  Future<void> _attempt(
    String signature,
    String userId,
    ContentReportRequest Function() create,
  ) async {
    if (currentUserId() != userId) {
      _pending.remove(signature);
      throw ReportAccountChanged();
    }
    final request = _pending.putIfAbsent(signature, create);
    try {
      await send(request);
      _pending.remove(signature);
    } catch (error) {
      if (isDefinitiveReactionFailure(error)) _pending.remove(signature);
      rethrow;
    }
  }
}
