import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:cloud_functions/cloud_functions.dart';
import 'timed_operation_gateway.dart';
import 'business_logo_pending_store.dart';

class BusinessLogoRequest {
  BusinessLogoRequest({
    required this.userId,
    required this.key,
    Uint8List? png,
    Map<String, String>? avatar,
    TimedOperationAttempt? attempt,
  }) : pngBase64 = png == null ? null : base64Encode(Uint8List.fromList(png)),
       avatar = avatar == null ? null : Map.unmodifiable(avatar),
       attempt = attempt ?? TimedOperationAttempt();
  final String userId, key;
  final String? pngBase64;
  final Map<String, String>? avatar;
  final TimedOperationAttempt attempt;
  Map<String, dynamic> toPayload() => {
    'expectedUserId': userId,
    'idempotencyKey': key,
    'mode': pngBase64 == null ? 'remove' : 'replace',
    if (pngBase64 != null) 'pngBase64': pngBase64,
    if (avatar != null) 'avatar': avatar,
  };
}

/// One immutable pending action per account, including Profile recreation.
class BusinessLogoGateway {
  BusinessLogoGateway({
    required this.currentUserId,
    required this.send,
    BusinessLogoPendingStore? store,
    DateTime Function()? clock,
    String Function()? newKey,
  }) : store = store ?? MemoryBusinessLogoPendingStore(),
       clock = clock ?? DateTime.now,
       newKey =
           newKey ??
           (() {
             final r = Random.secure();
             return List.generate(
               16,
               (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0'),
             ).join();
           });
  final String? Function() currentUserId;
  final Future<void> Function(BusinessLogoRequest) send;
  final String Function() newKey;
  final BusinessLogoPendingStore store;
  final DateTime Function() clock;
  final _pending = <String, BusinessLogoRequest>{};
  final _running = <String, Future<void>>{};
  bool hasPending(String uid) => _pending.containsKey(uid);
  void forgetUser(String uid) => _pending.remove(uid);
  final _erased = <String>{};
  Future<void> eraseUser(String uid) async {
    _erased.add(uid);
    forgetUser(uid);
    await store.erase(uid);
  }

  Future<void> update(
    String uid, {
    Uint8List? png,
    Map<String, String>? avatar,
  }) async {
    if (currentUserId() != uid) return Future.error(_changed());
    // Validate before encoding or durable storage, including non-editor callers.
    if (png != null && (png.isEmpty || png.length > 2 * 1024 * 1024) ||
        avatar != null && jsonEncode(avatar).length > 1024) {
      throw FirebaseFunctionsException(
        code: 'invalid-argument',
        message: 'Invalid local logo payload.',
      );
    }
    final candidate = BusinessLogoRequest(
      userId: uid,
      key: '',
      png: png,
      avatar: avatar,
    );
    await store.prune(clock().millisecondsSinceEpoch);
    if (_erased.contains(uid) || currentUserId() != uid) throw _changed();
    final row = await store.insert(uid, {
      'key': newKey(),
      'pngBase64': candidate.pngBase64,
      'avatar': candidate.avatar,
      'expiresAt': clock().add(const Duration(days: 7)).millisecondsSinceEpoch,
    });
    final old = _restore(uid, row);
    _pending[uid] = old;
    if (candidate.pngBase64 != old.pngBase64 ||
        !_sameAvatar(candidate.avatar, old.avatar)) {
      return Future.error(
        FirebaseFunctionsException(
          code: 'already-exists',
          message: 'Retry the pending logo operation first.',
        ),
      );
    }
    return retry(uid);
  }

  static bool _sameAvatar(Map<String, String>? a, Map<String, String>? b) =>
      a == null
      ? b == null
      : b != null &&
            a.length == b.length &&
            a.entries.every((e) => b[e.key] == e.value);

  BusinessLogoRequest _restore(String uid, Map<String, dynamic> row) {
    final key = row['key'], encoded = row['pngBase64'], avatar = row['avatar'];
    if (key is! String ||
        key.isEmpty ||
        key.length > 128 ||
        encoded != null && (encoded is! String || encoded.length > 2796204) ||
        avatar != null && avatar is! Map ||
        row['expiresAt'] is! int ||
        row['binding'] != null && row['binding'] is! Map) {
      throw StateError('Invalid saved logo');
    }
    final attempt = TimedOperationAttempt(
      persistBinding: (binding) async {
        if (currentUserId() != uid || _erased.contains(uid)) throw _changed();
        return store.bind(uid, key, binding);
      },
    );
    if (row['binding'] case final Map binding) {
      attempt.restoreBinding(Map<String, dynamic>.from(binding));
    }
    return BusinessLogoRequest(
      userId: uid,
      key: key,
      attempt: attempt,
      png: encoded == null ? null : base64Decode(encoded as String),
      avatar: avatar == null ? null : Map<String, String>.from(avatar as Map),
    );
  }

  Future<void> retry(String uid) {
    if (currentUserId() != uid) {
      return Future.error(_changed());
    }
    if (_running[uid] case final task?) return task;
    late final Future<void> task;
    task = _resume(uid).whenComplete(() {
      if (identical(_running[uid], task)) _running.remove(uid);
    });
    _running[uid] = task;
    return task;
  }

  Future<void> _resume(String uid) async {
    await store.prune(clock().millisecondsSinceEpoch);
    final row = await store.read(uid);
    if (row == null) {
      forgetUser(uid);
      return;
    }
    if (currentUserId() != uid || _erased.contains(uid)) throw _changed();
    // Keep a running in-memory attempt, including its original nonce.
    final request = _pending[uid]?.key == row['key']
        ? _pending[uid]!
        : _restore(uid, row);
    _pending[uid] = request;
    await _attempt(uid, request);
  }

  Future<void> _attempt(String uid, BusinessLogoRequest request) async {
    try {
      await send(request);
      await store.remove(uid, request.key);
      if (identical(_pending[uid], request)) _pending.remove(uid);
      if (currentUserId() != uid) throw _changed();
    } catch (e) {
      // Permission/precondition failures can follow a Storage side effect.
      if (e is FirebaseFunctionsException &&
          (e.code == 'invalid-argument' ||
              e.code == 'failed-precondition' &&
                  [
                    'operation-expired',
                    'logo-operation-cancelled',
                  ].contains(e.message))) {
        await store.remove(uid, request.key);
        forgetUser(uid);
      }
      rethrow;
    }
  }

  static FirebaseFunctionsException _changed() => FirebaseFunctionsException(
    code: 'unauthenticated',
    message: 'The signed-in account changed.',
  );
}
