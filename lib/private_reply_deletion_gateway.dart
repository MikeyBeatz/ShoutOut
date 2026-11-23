import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';

import 'reaction_gateway.dart';
import 'timed_operation_gateway.dart';

class PrivateReplyDeletionRequest {
  PrivateReplyDeletionRequest({
    required this.userId,
    required this.shoutId,
    required this.privateReplyId,
    required this.idempotencyKey,
  });

  final String userId, shoutId, privateReplyId, idempotencyKey;
  final timedAttempt = TimedOperationAttempt();

  Map<String, dynamic> toPayload() => {
    'expectedUserId': userId,
    'shoutId': shoutId,
    'privateReplyId': privateReplyId,
    'idempotencyKey': idempotencyKey,
  };
}

/// Session-scoped so disposal of a realtime-removed tile cannot lose an
/// uncertain operation. Only a confirmed reply or definitive rejection clears it.
class PrivateReplyDeletionGateway {
  PrivateReplyDeletionGateway({
    required this.send,
    required this.currentUserId,
    String Function()? newKey,
  }) : newKey = newKey ?? _randomKey;

  final Future<void> Function(PrivateReplyDeletionRequest) send;
  final String? Function() currentUserId;
  final String Function() newKey;
  final _pending = <(String, String, String), PrivateReplyDeletionRequest>{};
  final _running = <(String, String, String), Future<void>>{};

  static String _randomKey() {
    final random = Random.secure();
    return List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  Future<void> delete({
    required String userId,
    required String shoutId,
    required String privateReplyId,
  }) {
    final scope = (userId, shoutId, privateReplyId);
    final running = _running[scope];
    if (running != null) return running;
    late final Future<void> flight;
    flight = _attempt(scope).whenComplete(() {
      if (identical(_running[scope], flight)) _running.remove(scope);
    });
    _running[scope] = flight;
    return flight;
  }

  Future<void> _attempt((String, String, String) scope) async {
    if (currentUserId() != scope.$1) {
      _pending.remove(scope);
      throw _accountChanged();
    }
    final request = _pending.putIfAbsent(
      scope,
      () => PrivateReplyDeletionRequest(
        userId: scope.$1,
        shoutId: scope.$2,
        privateReplyId: scope.$3,
        idempotencyKey: newKey(),
      ),
    );
    try {
      await send(request);
      _pending.remove(scope);
      if (currentUserId() != scope.$1) throw _accountChanged();
    } catch (error) {
      if (isDefinitiveReactionFailure(error)) _pending.remove(scope);
      rethrow;
    }
  }

  static FirebaseFunctionsException _accountChanged() =>
      FirebaseFunctionsException(
        code: 'unauthenticated',
        message: 'The signed-in account changed.',
      );
}
