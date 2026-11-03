import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';

import 'account_deletion_attempt.dart';
import 'reaction_gateway.dart';
import 'timed_operation_gateway.dart';

class AccountDeletionPreparationRequest {
  AccountDeletionPreparationRequest(this.userId, this.logicalKey);
  final String userId;
  final String logicalKey;
  final timedAttempt = TimedOperationAttempt();
  Map<String, dynamic> toPayload() => {
    'expectedUserId': userId,
    'idempotencyKey': logicalKey,
  };
}

/// One request per page, retained across uncertain responses. Never retries a
/// failed page automatically, and never accepts a response for another account.
class AccountDeletionPreparationGateway {
  AccountDeletionPreparationGateway({
    required this.currentUserId,
    required this.send,
    String Function()? newKey,
  }) : newKey = newKey ?? _newKey;

  final String? Function() currentUserId;
  final Future<Object?> Function(AccountDeletionPreparationRequest) send;
  final String Function() newKey;
  final _pending = <String, AccountDeletionPreparationRequest>{};
  final _running = <String, Future<void>>{};

  static String _newKey() {
    final random = Random.secure();
    return List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  void _guard(String userId) {
    if (currentUserId() != userId) {
      _pending.remove(userId);
      throw AccountDeletionIdentityChanged();
    }
  }

  Future<void> prepare(String userId) {
    _guard(userId);
    final running = _running[userId];
    if (running != null) return running;
    final future = _prepare(userId);
    _running[userId] = future;
    return future.whenComplete(() => _running.remove(userId));
  }

  Future<void> _prepare(String userId) async {
    while (true) {
      _guard(userId);
      final request = _pending.putIfAbsent(
        userId,
        () => AccountDeletionPreparationRequest(userId, newKey()),
      );
      Object? response;
      try {
        response = await send(request);
      } catch (error) {
        if (isDefinitiveReactionFailure(error)) _pending.remove(userId);
        rethrow;
      }
      _guard(userId);
      if (response is! Map ||
          response['hidden'] is! int ||
          (response['hidden'] as int) < 0 ||
          (response['hidden'] as int) > 50 ||
          response['hasMore'] is! bool ||
          response['hasMore'] != (response['hidden'] == 50)) {
        throw FirebaseFunctionsException(
          code: 'data-loss',
          message: 'Invalid account deletion preparation result.',
        );
      }
      _pending.remove(userId);
      if (response['hasMore'] == false) return;
    }
  }
}
