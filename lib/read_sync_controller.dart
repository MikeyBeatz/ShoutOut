import 'dart:async';
import 'read_state_store.dart';

/// The future callable adapter maps resource-exhausted to this local signal.
class ReadSyncBatchTooLarge implements Exception {}

/// Prepared local B2 coordinator. No global instance or live Firebase binding.
/// Foreground/login/manual-refresh call synchronize(); marks call dirty().
class ReadSyncController {
  ReadSyncController({
    required this.scope,
    required this.store,
    required this.currentScope,
    required this.upload,
    required this.download,
    DateTime Function()? clock,
    this.onMerged,
    this.scheduleDelay = const Duration(seconds: 10),
  }) : clock = clock ?? DateTime.now;
  final ReadScope scope;
  final ReadSyncStore store;
  final ReadScope? Function() currentScope;
  final Future<Object?> Function(Map<String, Object?>) upload, download;
  final DateTime Function() clock;
  final void Function(List<ReadUpload>)? onMerged;
  final Duration scheduleDelay;
  Timer? _timer;
  Future<void>? _flight;
  Future<void>? _queuedPull;
  var _active = false, _disposed = false, _generation = 0;
  Object? lastError;
  bool snapshotComplete = false;
  int? _confirmedRevision;
  int _batchLimit = 32;
  bool _scopeAlive(int generation) =>
      !_disposed &&
      generation == _generation &&
      currentScope()?.databaseSuffix == scope.databaseSuffix;
  void _guard(int generation) {
    if (!_scopeAlive(generation)) throw StateError('Read sync scope changed');
  }

  void setActive(bool active) {
    _active = active;
    if (!active) {
      _timer?.cancel();
      _timer = null;
    }
  }

  void dirty() {
    if (!_active || _disposed || _timer != null) return;
    _timer = Timer(scheduleDelay, () {
      _timer = null;
      unawaited(synchronize(pull: false));
    });
  }

  Future<void> synchronize({bool pull = true}) {
    if (_disposed || !_active) return Future.value();
    if (_flight != null) {
      // A refresh arriving during an upload still needs its own download.
      if (!pull) return _flight!;
      return _queuedPull ??= _flight!.then((_) {
        _queuedPull = null;
        return synchronize();
      });
    }
    _timer?.cancel();
    _timer = null;
    final generation = _generation;
    return _flight = _run(generation, pull).whenComplete(() {
      _flight = null;
    });
  }

  Future<void> _run(int generation, bool pull) async {
    try {
      if (pull) snapshotComplete = false;
      _guard(generation);
      final batch = await store.pending(clock(), limit: _batchLimit);
      _guard(generation);
      if (batch.isNotEmpty) {
        final response = await upload({
          'expectedUserId': scope.userId,
          'items': batch.map((r) => r.toPayload()).toList(),
        });
        _guard(generation);
        final body = _body(response), results = body['items'];
        if (results is! List || results.length != batch.length) {
          throw StateError('Invalid read acknowledgement');
        }
        final accepted = <ReadUpload>[],
            deferred = <ReadUpload>[],
            seen = <String>{};
        for (final raw in results) {
          if (raw is! Map) throw StateError('Invalid read acknowledgement');
          final matching = batch
              .where(
                (row) =>
                    row.content.shoutId == raw['shoutId'] &&
                    row.content.contentHash == raw['contentHash'] &&
                    row.content.expiresAt.millisecondsSinceEpoch ==
                        raw['expiresAt'],
              )
              .toList();
          if (matching.length != 1 || !seen.add(matching.single.content.key)) {
            throw StateError('Invalid read acknowledgement');
          }
          switch (raw['status']) {
            case 'accepted':
            case 'obsolete':
              accepted.add(matching.single);
            case 'deferred':
              deferred.add(matching.single);
            default:
              throw StateError('Invalid read acknowledgement');
          }
        }
        // Full validation precedes the first local acknowledgement.
        await store.acknowledge(accepted, clock());
        _guard(generation);
        if (deferred.isNotEmpty) {
          // Local laboratory retry cooldown, not a new polling scheduler.
          await store.defer(deferred, clock().add(const Duration(minutes: 1)));
          _guard(generation);
        }
      }
      if (pull && _active) {
        String? cursor;
        final seen = <String>{};
        int? revision;
        do {
          final response = await download({
            'expectedUserId': scope.userId,
            'cursor': ?cursor,
            if (cursor == null && _confirmedRevision != null)
              'knownRevision': _confirmedRevision,
          });
          _guard(generation);
          final body = _body(response),
              rawItems = body['items'],
              next = body['next'];
          if (rawItems is! List ||
              rawItems.length > 4096 ||
              !(next == null || next is String && next.isNotEmpty) ||
              revision != null && revision != body['revision']) {
            throw StateError('Invalid read page');
          }
          revision = body['revision'] as int;
          final rows = <ReadUpload>[];
          for (final raw in rawItems) {
            if (raw is! Map ||
                raw['shoutId'] is! String ||
                raw['contentHash'] is! String ||
                raw['expiresAt'] is! int ||
                raw['confirmedAt'] is! int ||
                (raw['confirmedAt'] as int) < 0 ||
                raw['retainUntil'] is! int) {
              throw StateError('Invalid read record');
            }
            final content = ReadContent.fromHash(
              shoutId: raw['shoutId'] as String,
              contentHash: raw['contentHash'] as String,
              expiresAt: DateTime.fromMillisecondsSinceEpoch(
                raw['expiresAt'] as int,
              ),
            );
            if (raw['retainUntil'] !=
                content.retainUntil.millisecondsSinceEpoch) {
              throw StateError('Invalid read retention');
            }
            if (clock().isBefore(content.retainUntil)) {
              rows.add(ReadUpload(content, raw['confirmedAt'] as int));
            }
          }
          await store.merge(rows, clock());
          _guard(generation);
          onMerged?.call(rows);
          if (next is String && !seen.add(next)) {
            throw StateError('Repeated read cursor');
          }
          cursor = next as String?;
          // Empty non-final pages are progress, not an exhausted snapshot.
        } while (cursor != null && _active);
        snapshotComplete = cursor == null;
        if (snapshotComplete) _confirmedRevision = revision;
      }
      _guard(generation);
      lastError = null;
      // Continue full queues without a timer polling an empty cloud state.
      if (_active && (await store.pending(clock())).isNotEmpty) {
        dirty();
      }
    } catch (error) {
      if (_scopeAlive(generation)) lastError = error;
      if (_scopeAlive(generation) &&
          error is ReadSyncBatchTooLarge &&
          _batchLimit > 1) {
        _batchLimit = (_batchLimit / 2).ceil();
        dirty();
      }
      // Durable queue remains. Retry on next login/resume/refresh/new mark;
      // a failing network must not create an endless billable polling loop.
    }
  }

  Map _body(Object? response) {
    if (response is! Map ||
        response['version'] != 1 ||
        response['revision'] is! int ||
        (response['revision'] as int) < 0) {
      throw StateError('Invalid read response');
    }
    return response;
  }

  void dispose() {
    _disposed = true;
    _active = false;
    _generation++;
    _timer?.cancel();
    _timer = null;
  }
}
