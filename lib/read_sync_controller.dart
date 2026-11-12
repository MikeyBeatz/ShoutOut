import 'dart:async';
import 'read_state_store.dart';

/// The future callable adapter distinguishes work budget from rate limiting.
class ReadSyncBatchTooLarge implements Exception {}

/// Only a rejected continuation maps here, never an Auth/App Check failure.
class ReadSyncSnapshotExpired implements Exception {}

/// Local B2 coordinator. Only startup/manual refresh initiates network work.
/// Continuations belong to that captured boundary; there is no dirty timer.
class ReadSyncController {
  ReadSyncController({
    required this.scope,
    required this.store,
    required this.currentScope,
    required this.upload,
    required this.download,
    DateTime Function()? clock,
    this.onMerged,
  }) : clock = clock ?? DateTime.now;
  final ReadScope scope;
  final ReadSyncStore store;
  final ReadScope? Function() currentScope;
  final Future<Object?> Function(Map<String, Object?>) upload, download;
  final DateTime Function() clock;
  final void Function(List<ReadUpload>)? onMerged;
  Future<void>? _flight, _queuedRefresh;
  var _active = false, _disposed = false, _generation = 0;
  Object? lastError;
  bool snapshotComplete = false, uploadComplete = false;
  bool get synchronizationComplete => snapshotComplete && uploadComplete;
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
  }

  Future<void> synchronize({Future<void> Function()? beforeCapture}) {
    if (_disposed || !_active) return Future.value();
    if (_flight != null) {
      // At most one follow-up, capturing marks added after the first boundary.
      return _queuedRefresh ??= _flight!.then((_) {
        _queuedRefresh = null;
        return synchronize(beforeCapture: beforeCapture);
      });
    }
    final generation = _generation;
    return _flight = _run(generation, beforeCapture).whenComplete(() {
      _flight = null;
    });
  }

  Future<void> _run(
    int generation,
    Future<void> Function()? beforeCapture,
  ) async {
    snapshotComplete = false;
    uploadComplete = false;
    lastError = null;
    try {
      _guard(generation);
      if (beforeCapture != null) await beforeCapture();
      _guard(generation);
      var checkpoint = await store.beginSync(knownRevision: _confirmedRevision);
      _guard(generation);
      while (_active && checkpoint.uploading) {
        final page = await store.queuePage(
          checkpoint,
          clock(),
          limit: _batchLimit,
        );
        _guard(generation);
        if (!page.done && page.scanned == 0) {
          throw StateError('Read queue did not advance');
        }
        final accepted = <ReadUpload>[], deferred = <ReadUpload>[];
        if (page.items.isNotEmpty) {
          Object? response;
          try {
            response = await upload({
              'expectedUserId': scope.userId,
              'items': page.items.map((row) => row.toPayload()).toList(),
            });
          } on ReadSyncBatchTooLarge {
            _guard(generation);
            if (_batchLimit == 1) rethrow;
            _batchLimit = (_batchLimit / 2).ceil();
            continue;
          }
          _guard(generation);
          final body = _body(response), results = body['items'];
          if (results is! List || results.length != page.items.length) {
            throw StateError('Invalid read acknowledgement');
          }
          final byKey = {for (final row in page.items) row.content.key: row},
              seen = <String>{};
          for (final raw in results) {
            if (raw is! Map ||
                raw['shoutId'] is! String ||
                raw['contentHash'] is! String ||
                raw['expiresAt'] is! int) {
              throw StateError('Invalid read acknowledgement');
            }
            final content = ReadContent.fromHash(
              shoutId: raw['shoutId'] as String,
              contentHash: raw['contentHash'] as String,
              expiresAt: DateTime.fromMillisecondsSinceEpoch(
                raw['expiresAt'] as int,
              ),
            );
            final row = byKey[content.key];
            if (row == null ||
                row.content.expiresAt != content.expiresAt ||
                !seen.add(content.key)) {
              throw StateError('Invalid read acknowledgement');
            }
            switch (raw['status']) {
              case 'accepted':
              case 'obsolete':
                accepted.add(row);
              case 'deferred':
                deferred.add(row);
              default:
                throw StateError('Invalid read acknowledgement');
            }
          }
        }
        final next = checkpoint.advanceUpload(
          ReadQueuePage(
            page.items,
            after: page.after,
            done: page.done,
            deferred: page.deferred || deferred.isNotEmpty,
            scanned: page.scanned,
          ),
        );
        await store.commitSync(
          checkpoint,
          next,
          clock(),
          acknowledged: accepted,
          deferred: deferred,
        );
        _guard(generation);
        checkpoint = next;
      }
      uploadComplete = !checkpoint.uploading && !checkpoint.deferred;
      var restarted = false;
      final seen = <String>{if (checkpoint.cursor != null) checkpoint.cursor!};
      while (_active && !checkpoint.uploading && !checkpoint.finished) {
        Object? response;
        try {
          response = await download({
            'expectedUserId': scope.userId,
            if (checkpoint.cursor != null) 'cursor': checkpoint.cursor,
            if (checkpoint.cursor == null && checkpoint.fromRevision != null)
              'knownRevision': checkpoint.fromRevision,
          });
        } on ReadSyncSnapshotExpired {
          _guard(generation);
          if (checkpoint.cursor == null || restarted) rethrow;
          final next = checkpoint.restartDownload();
          await store.commitSync(checkpoint, next, clock());
          _guard(generation);
          checkpoint = next;
          restarted = true;
          seen.clear();
          continue;
        }
        _guard(generation);
        final body = _body(response),
            rawItems = body['items'],
            next = body['next'];
        final revision = body['revision'] as int;
        if (rawItems is! List ||
            rawItems.length > 4096 ||
            !(next == null || next is String && next.isNotEmpty) ||
            checkpoint.revision != null && checkpoint.revision != revision ||
            checkpoint.fromRevision != null &&
                revision < checkpoint.fromRevision! ||
            next is String && !seen.add(next)) {
          throw StateError('Invalid read page');
        }
        final rows = <ReadUpload>[];
        for (final raw in rawItems) {
          if (raw is! Map ||
              raw['shoutId'] is! String ||
              raw['contentHash'] is! String ||
              raw['expiresAt'] is! int ||
              !validReadSequence(raw['confirmedAt']) ||
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
                  content.retainUntil.millisecondsSinceEpoch ||
              (raw['confirmedAt'] as int) >=
                  content.retainUntil.millisecondsSinceEpoch) {
            throw StateError('Invalid read retention');
          }
          if (clock().isBefore(content.retainUntil)) {
            rows.add(ReadUpload(content, raw['confirmedAt'] as int));
          }
        }
        final progress = checkpoint.page(next as String?, revision);
        await store.commitSync(checkpoint, progress, clock(), imported: rows);
        _guard(generation);
        checkpoint = progress;
        onMerged?.call(rows);
        if (next == null && !progress.finished) seen.clear();
      }
      _guard(generation);
      snapshotComplete = checkpoint.finished;
      if (snapshotComplete) _confirmedRevision = checkpoint.revision;
    } catch (error) {
      if (_scopeAlive(generation)) lastError = error;
      // Queue/checkpoint remain durable. Only the next explicit trigger retries.
    }
  }

  Map _body(Object? response) {
    if (response is! Map ||
        response['version'] != 1 ||
        !validReadSequence(response['revision'])) {
      throw StateError('Invalid read response');
    }
    return response;
  }

  void dispose() {
    _disposed = true;
    _active = false;
    _generation++;
  }
}
