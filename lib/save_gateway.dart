import 'dart:math';

import 'reaction_gateway.dart';

class SaveAccountChanged implements Exception {}

class SaveRequest {
  const SaveRequest({
    required this.userId,
    required this.shoutId,
    required this.idempotencyKey,
  });

  final String userId;
  final String shoutId;
  final String idempotencyKey;

  Map<String, dynamic> toPayload() => {
    'expectedUserId': userId,
    'shoutId': shoutId,
    'idempotencyKey': idempotencyKey,
  };
}

/// A retry acknowledges the original toggle rather than toggling again.
/// Historical callable results must never replace live bookmark/counter state.
class SaveGateway {
  SaveGateway({
    required this.send,
    required this.currentUserId,
    String Function()? newKey,
  }) : newKey = newKey ?? _randomKey;

  final Future<void> Function(SaveRequest) send;
  final String? Function() currentUserId;
  final String Function() newKey;
  final _pending = <(String, String), SaveRequest>{};
  final _running = <(String, String), Future<void>>{};

  static String _randomKey() {
    final random = Random.secure();
    return List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  Future<void> toggle({required String userId, required String shoutId}) {
    final scope = (userId, shoutId);
    final running = _running[scope];
    if (running != null) return running;
    final future = _attempt(scope);
    _running[scope] = future;
    return future.whenComplete(() => _running.remove(scope));
  }

  Future<void> _attempt((String, String) scope) async {
    if (currentUserId() != scope.$1) {
      _pending.remove(scope);
      throw SaveAccountChanged();
    }
    final request = _pending.putIfAbsent(
      scope,
      () => SaveRequest(
        userId: scope.$1,
        shoutId: scope.$2,
        idempotencyKey: newKey(),
      ),
    );
    try {
      await send(request);
      _pending.remove(scope);
    } catch (error) {
      if (isDefinitiveReactionFailure(error)) _pending.remove(scope);
      rethrow;
    }
  }
}
