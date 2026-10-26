import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';

bool isDefinitiveReactionFailure(Object error) =>
    error is FirebaseFunctionsException &&
    const {
      'invalid-argument',
      'permission-denied',
      'unauthenticated',
      'failed-precondition',
      'not-found',
      'already-exists',
      'resource-exhausted',
      'unimplemented',
    }.contains(error.code);

class ReactionAccountChanged implements Exception {}

/// An immutable toggle: retries must never become a second toggle.
class ReactionRequest {
  const ReactionRequest({
    required this.userId,
    required this.shoutId,
    required this.button,
    required this.idempotencyKey,
    this.commentId,
  });

  final String userId;
  final String shoutId;
  final String button;
  final String idempotencyKey;
  final String? commentId;

  Map<String, dynamic> toPayload() => {
    'expectedUserId': userId,
    'shoutId': shoutId,
    'button': button,
    'idempotencyKey': idempotencyKey,
    if (commentId != null) 'commentId': commentId,
  };
}

/// Keeps ambiguous attempts in memory for this session. Server responses contain
/// historical counters; only realtime Firestore data should update the UI.
class ReactionGateway {
  ReactionGateway({
    required this.send,
    required this.currentUserId,
    required this.isDefinitiveFailure,
    String Function()? newKey,
  }) : newKey = newKey ?? _randomKey;

  final Future<void> Function(ReactionRequest) send;
  final String? Function() currentUserId;
  final bool Function(Object) isDefinitiveFailure;
  final String Function() newKey;
  final _pending = <(String, String, String?), ReactionRequest>{};
  final _running = <(String, String, String?), Future<void>>{};

  static String _randomKey() {
    final random = Random.secure();
    return List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  Future<void> toggle({
    required String userId,
    required String shoutId,
    required bool like,
    String? commentId,
  }) {
    final scope = (userId, shoutId, commentId);
    final running = _running[scope];
    if (running != null) return running;
    final future = _toggle(scope, like ? 'like' : 'dislike');
    _running[scope] = future;
    return future.whenComplete(() => _running.remove(scope));
  }

  Future<void> _toggle((String, String, String?) scope, String button) async {
    final previous = _pending[scope];
    if (previous != null) {
      await _attempt(scope, previous);
      if (previous.button == button) return;
    }
    final request = ReactionRequest(
      userId: scope.$1,
      shoutId: scope.$2,
      button: button,
      idempotencyKey: newKey(),
      commentId: scope.$3,
    );
    _pending[scope] = request;
    await _attempt(scope, request);
  }

  Future<void> _attempt(
    (String, String, String?) scope,
    ReactionRequest request,
  ) async {
    if (currentUserId() != request.userId) {
      _pending.remove(scope);
      throw ReactionAccountChanged();
    }
    try {
      await send(request);
      _pending.remove(scope);
    } catch (error) {
      if (isDefinitiveFailure(error)) _pending.remove(scope);
      rethrow;
    }
  }
}
