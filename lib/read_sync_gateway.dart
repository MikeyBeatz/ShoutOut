import 'package:cloud_functions/cloud_functions.dart';

import 'read_state_store.dart';
import 'read_sync_controller.dart';

class ReadSyncUnavailable implements Exception {
  const ReadSyncUnavailable(this.reason);
  final String reason;
}

/// Callable transport. No autonomous timer; the controller may wait once on
/// server backpressure within the already captured startup/refresh boundary.
class ReadSyncGateway {
  ReadSyncGateway({
    required this.scope,
    required this.currentUserId,
    required this.invoke,
    DateTime Function()? clock,
  }) : clock = clock ?? DateTime.now;

  final ReadScope scope;
  final String? Function() currentUserId;
  final Future<Object?> Function(String, Map<String, Object?>) invoke;
  final DateTime Function() clock;
  final _retryAt = <String, DateTime>{};

  Future<Object?> upload(Map<String, Object?> data) =>
      _send('syncReadBatch', data);
  Future<Object?> download(Map<String, Object?> data) =>
      _send('getReadStatePage', data);

  void _guard(Map<String, Object?> data) {
    if (currentUserId() != scope.userId ||
        data['expectedUserId'] != scope.userId) {
      throw StateError('Read synchronization account changed');
    }
  }

  Future<Object?> _send(String name, Map<String, Object?> data) async {
    _guard(data);
    final retry = _retryAt[name];
    if (retry != null && clock().isBefore(retry)) {
      throw ReadSyncRateLimited(retry.difference(clock()));
    }
    try {
      final result = await invoke(name, data);
      _guard(data);
      _retryAt.remove(name);
      return result;
    } on FirebaseFunctionsException catch (error) {
      _guard(data);
      final details = error.details;
      final reason = details is Map ? details['reason'] : null;
      if (error.code == 'resource-exhausted') {
        if (reason == 'read-sync-work-budget' && name == 'syncReadBatch') {
          throw ReadSyncBatchTooLarge();
        }
        final retry = details is Map ? details['retryAfterMs'] : null;
        if (reason == 'read-sync-rate-limit' &&
            retry is int &&
            retry > 0 &&
            validReadSequence(retry)) {
          final duration = Duration(milliseconds: retry);
          _retryAt[name] = clock().add(duration);
          throw ReadSyncRateLimited(duration);
        }
      }
      if (error.code == 'failed-precondition') {
        if (reason == 'read-sync-snapshot-expired' &&
            name == 'getReadStatePage' &&
            data['cursor'] is String) {
          throw ReadSyncSnapshotExpired();
        }
        if (const [
          'read-sync-disabled',
          'read-sync-paused',
          'read-sync-control-changed',
        ].contains(reason)) {
          throw ReadSyncUnavailable(reason as String);
        }
      }
      // Auth/App Check, network, untyped quota errors and corrupted state must
      // never be interpreted as permission to reset history or split a batch.
      rethrow;
    }
  }
}
