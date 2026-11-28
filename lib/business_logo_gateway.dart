import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:cloud_functions/cloud_functions.dart';
import 'timed_operation_gateway.dart';

class BusinessLogoRequest {
  BusinessLogoRequest({
    required this.userId,
    required this.key,
    Uint8List? png,
    Map<String, String>? avatar,
  }) : pngBase64 = png == null ? null : base64Encode(Uint8List.fromList(png)),
       avatar = avatar == null ? null : Map.unmodifiable(avatar);
  final String userId, key;
  final String? pngBase64;
  final Map<String, String>? avatar;
  final attempt = TimedOperationAttempt();
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
    String Function()? newKey,
  }) : newKey =
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
  final _pending = <String, BusinessLogoRequest>{};
  final _running = <String, Future<void>>{};
  bool hasPending(String uid) => _pending.containsKey(uid);
  void forgetUser(String uid) => _pending.remove(uid);

  Future<void> update(
    String uid, {
    Uint8List? png,
    Map<String, String>? avatar,
  }) {
    if (currentUserId() != uid) return Future.error(_changed());
    final candidate = BusinessLogoRequest(
          userId: uid,
          key: '',
          png: png,
          avatar: avatar,
        ),
        old = _pending[uid];
    if (old != null &&
        (candidate.pngBase64 != old.pngBase64 ||
            jsonEncode(candidate.avatar) != jsonEncode(old.avatar))) {
      return Future.error(
        FirebaseFunctionsException(
          code: 'already-exists',
          message: 'Retry the pending logo operation first.',
        ),
      );
    }
    _pending.putIfAbsent(
      uid,
      () => BusinessLogoRequest(
        userId: uid,
        key: newKey(),
        png: png,
        avatar: avatar,
      ),
    );
    return retry(uid);
  }

  Future<void> retry(String uid) {
    if (currentUserId() != uid) {
      forgetUser(uid);
      return Future.error(_changed());
    }
    if (_running[uid] case final task?) return task;
    final request = _pending[uid];
    if (request == null) return Future.value();
    late final Future<void> task;
    task = _attempt(uid, request).whenComplete(() {
      if (identical(_running[uid], task)) _running.remove(uid);
    });
    _running[uid] = task;
    return task;
  }

  Future<void> _attempt(String uid, BusinessLogoRequest request) async {
    try {
      await send(request);
      if (identical(_pending[uid], request)) _pending.remove(uid);
      if (currentUserId() != uid) throw _changed();
    } catch (e) {
      // Permission/precondition failures can follow a Storage side effect.
      if (currentUserId() != uid ||
          e is FirebaseFunctionsException && e.code == 'invalid-argument') {
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
