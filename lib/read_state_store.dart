import 'dart:convert';
import 'dart:collection';

import 'package:crypto/crypto.dart';

class ReadScope {
  ReadScope(this.projectId, this.userId) {
    if (projectId.isEmpty || userId.isEmpty) throw ArgumentError('Read scope');
  }
  final String projectId, userId;
  String get databaseSuffix =>
      sha256.convert(utf8.encode(jsonEncode([projectId, userId]))).toString();
}

class ReadContent {
  ReadContent({
    required this.shoutId,
    required String title,
    required String text,
    required this.expiresAt,
  }) : contentHash = sha256
           .convert(utf8.encode(jsonEncode([title, text])))
           .toString() {
    if (shoutId.isEmpty || shoutId.length > 256) {
      throw ArgumentError('Read content');
    }
  }
  final String shoutId, contentHash;
  ReadContent.fromHash({
    required this.shoutId,
    required this.contentHash,
    required this.expiresAt,
  }) {
    if (shoutId.isEmpty ||
        shoutId.length > 256 ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(contentHash)) {
      throw ArgumentError('Read content');
    }
  }
  final DateTime expiresAt;
  String get key => jsonEncode([shoutId, contentHash]);
  DateTime get retainUntil => expiresAt.add(const Duration(days: 7));
}

class ReadMarker {
  ReadMarker(this.scope, this.content, this.readAt);
  final ReadScope scope;
  final ReadContent content;
  final DateTime readAt;
  Map<String, dynamic> toJson() => {
    'key': content.key,
    'schemaVersion': 1,
    'projectId': scope.projectId,
    'userId': scope.userId,
    'shoutId': content.shoutId,
    'contentHash': content.contentHash,
    'readAtLocal': readAt.millisecondsSinceEpoch,
    'expiresAt': content.expiresAt.millisecondsSinceEpoch,
    'retainUntil': content.retainUntil.millisecondsSinceEpoch,
    'pendingSync': true,
  };

  static bool matches(
    Object? raw,
    ReadScope scope,
    ReadContent content,
    DateTime now,
  ) {
    if (raw is! Map) return false;
    return raw['schemaVersion'] == 1 &&
        raw['projectId'] == scope.projectId &&
        raw['userId'] == scope.userId &&
        raw['key'] == content.key &&
        raw['shoutId'] == content.shoutId &&
        raw['contentHash'] == content.contentHash &&
        raw['expiresAt'] == content.expiresAt.millisecondsSinceEpoch &&
        raw['retainUntil'] == content.retainUntil.millisecondsSinceEpoch &&
        raw['readAtLocal'] is int &&
        (raw['readAtLocal'] as int) >= 0 &&
        raw['pendingSync'] is bool &&
        now.isBefore(content.retainUntil);
  }
}

class ReadUpload {
  const ReadUpload(this.content, this.readAtLocal, {this.sequence});
  final ReadContent content;
  final int readAtLocal;
  final int? sequence;
  Map<String, Object> toPayload() => {
    'shoutId': content.shoutId,
    'contentHash': content.contentHash,
    'expiresAt': content.expiresAt.millisecondsSinceEpoch,
  };
  static ReadUpload? parse(Object? raw, ReadScope scope, DateTime now) {
    if (raw is! Map ||
        raw['shoutId'] is! String ||
        raw['contentHash'] is! String ||
        raw['expiresAt'] is! int) {
      return null;
    }
    try {
      final content = ReadContent.fromHash(
        shoutId: raw['shoutId'] as String,
        contentHash: raw['contentHash'] as String,
        expiresAt: DateTime.fromMillisecondsSinceEpoch(raw['expiresAt'] as int),
      );
      return ReadMarker.matches(raw, scope, content, now)
          ? ReadUpload(content, raw['readAtLocal'] as int)
          : null;
    } catch (_) {
      return null;
    }
  }
}

abstract interface class ReadSyncStore implements ReadStateStore {
  Future<List<ReadUpload>> pending(DateTime now, {int limit = 32});
  Future<void> acknowledge(List<ReadUpload> rows, DateTime now);
  Future<void> merge(List<ReadUpload> rows, DateTime now);
  Future<void> defer(List<ReadUpload> rows, DateTime until);
  Future<ReadSyncCheckpoint> beginSync({int? knownRevision});
  Future<ReadQueuePage> queuePage(
    ReadSyncCheckpoint checkpoint,
    DateTime now, {
    int limit = 32,
  });
  Future<void> commitSync(
    ReadSyncCheckpoint expected,
    ReadSyncCheckpoint next,
    DateTime now, {
    List<ReadUpload> acknowledged = const [],
    List<ReadUpload> deferred = const [],
    List<ReadUpload> imported = const [],
  });
}

const readSequenceMaximum = 9007199254740991;
bool validReadSequence(Object? value) =>
    value is int && value >= 0 && value <= readSequenceMaximum;

class ReadSyncConflict extends StateError {
  ReadSyncConflict() : super('Read synchronization was superseded');
}

/// A local CAS token, never an authorization token or a server payload.
class ReadSyncCheckpoint {
  const ReadSyncCheckpoint({
    required this.epoch,
    required this.boundary,
    this.after = 0,
    this.uploading = true,
    this.deferred = false,
    this.cursor,
    this.revision,
    this.fromRevision,
    this.catchUp = false,
    this.finished = false,
  });
  final int epoch, boundary, after;
  final bool uploading, deferred, catchUp, finished;
  final String? cursor;
  final int? revision, fromRevision;
  Map<String, Object?> toJson(ReadScope scope) => {
    'v': 1,
    'projectId': scope.projectId,
    'userId': scope.userId,
    'epoch': epoch,
    'boundary': boundary,
    'after': after,
    'uploading': uploading,
    'deferred': deferred,
    'cursor': cursor,
    'revision': revision,
    'fromRevision': fromRevision,
    'catchUp': catchUp,
    'finished': finished,
  };

  static ReadSyncCheckpoint? parse(Object? raw, ReadScope scope) {
    if (raw is! Map ||
        raw['v'] != 1 ||
        raw['projectId'] != scope.projectId ||
        raw['userId'] != scope.userId ||
        !validReadSequence(raw['epoch']) ||
        raw['epoch'] == 0 ||
        !validReadSequence(raw['boundary']) ||
        !validReadSequence(raw['after']) ||
        (raw['after'] as int) > (raw['boundary'] as int) ||
        raw['uploading'] is! bool ||
        raw['deferred'] is! bool ||
        raw['catchUp'] is! bool ||
        raw['finished'] is! bool ||
        raw['uploading'] == false && raw['after'] != raw['boundary'] ||
        raw['catchUp'] == true &&
            (raw['uploading'] == true || raw['finished'] == true) ||
        !(raw['cursor'] == null ||
            raw['cursor'] is String && (raw['cursor'] as String).isNotEmpty) ||
        !(raw['revision'] == null || validReadSequence(raw['revision'])) ||
        !(raw['fromRevision'] == null ||
            validReadSequence(raw['fromRevision'])) ||
        raw['cursor'] != null && raw['revision'] == null ||
        raw['uploading'] == true &&
            (raw['cursor'] != null ||
                raw['revision'] != null ||
                raw['finished'] == true) ||
        raw['finished'] == true &&
            (raw['cursor'] != null || raw['revision'] == null)) {
      return null;
    }
    return ReadSyncCheckpoint(
      epoch: raw['epoch'] as int,
      boundary: raw['boundary'] as int,
      after: raw['after'] as int,
      uploading: raw['uploading'] as bool,
      deferred: raw['deferred'] as bool,
      cursor: raw['cursor'] as String?,
      revision: raw['revision'] as int?,
      fromRevision: raw['fromRevision'] as int?,
      catchUp: raw['catchUp'] as bool,
      finished: raw['finished'] as bool,
    );
  }

  bool same(ReadSyncCheckpoint? other) =>
      other != null &&
      epoch == other.epoch &&
      boundary == other.boundary &&
      after == other.after &&
      uploading == other.uploading &&
      deferred == other.deferred &&
      cursor == other.cursor &&
      revision == other.revision &&
      fromRevision == other.fromRevision &&
      catchUp == other.catchUp &&
      finished == other.finished;

  ReadSyncCheckpoint advanceUpload(ReadQueuePage page) => ReadSyncCheckpoint(
    epoch: epoch,
    boundary: boundary,
    after: page.after,
    uploading: !page.done,
    deferred: deferred || page.deferred,
    fromRevision: fromRevision,
  );

  ReadSyncCheckpoint page(String? next, int targetRevision) {
    final catchingUp = next == null && catchUp;
    return ReadSyncCheckpoint(
      epoch: epoch,
      boundary: boundary,
      after: after,
      uploading: false,
      deferred: deferred,
      cursor: next,
      revision: catchingUp ? null : targetRevision,
      fromRevision: catchingUp ? targetRevision : fromRevision,
      catchUp: next != null && catchUp,
      finished: next == null && !catchingUp,
    );
  }

  ReadSyncCheckpoint restartDownload() => ReadSyncCheckpoint(
    epoch: epoch,
    boundary: boundary,
    after: after,
    uploading: false,
    deferred: deferred,
    fromRevision: fromRevision,
  );
}

class ReadQueuePage {
  const ReadQueuePage(
    this.items, {
    required this.after,
    required this.done,
    required this.deferred,
    required this.scanned,
  });
  final List<ReadUpload> items;
  final int after, scanned;
  final bool done, deferred;
}

ReadSyncCheckpoint nextReadSync(
  ReadSyncCheckpoint? previous,
  int epoch,
  int boundary,
  int? knownRevision,
) {
  if (epoch >= readSequenceMaximum ||
      !validReadSequence(boundary) ||
      !(knownRevision == null || validReadSequence(knownRevision))) {
    throw StateError('Invalid local read synchronization state');
  }
  if (previous != null &&
      !previous.finished &&
      !previous.deferred &&
      previous.boundary == boundary) {
    return ReadSyncCheckpoint(
      epoch: epoch + 1,
      boundary: boundary,
      after: previous.after,
      uploading: previous.uploading,
      deferred: previous.deferred,
      cursor: previous.cursor,
      revision: previous.revision,
      fromRevision: previous.fromRevision,
      catchUp: previous.catchUp || previous.cursor != null,
    );
  }
  return ReadSyncCheckpoint(
    epoch: epoch + 1,
    boundary: boundary,
    fromRevision: knownRevision,
  );
}

abstract interface class ReadStateStore {
  Future<bool> contains(ReadContent content, DateTime now);
  Future<void> put(ReadContent content, DateTime now);
  Future<int> prune(DateTime now, {int limit = 100});

  /// A persistent local fence prevents another open tab from recreating rows.
  Future<void> erase();
  Future<void> close();
}

class MemoryReadStateStore implements ReadSyncStore {
  MemoryReadStateStore(this.scope);
  final ReadScope scope;
  final rows = <String, Map<String, dynamic>>{};
  final _deferred = <String, DateTime>{};
  final _outbox = SplayTreeMap<int, String>();
  final _sequences = <String, int>{};
  int _sequence = 0, _epoch = 0;
  ReadSyncCheckpoint? _checkpoint;
  bool _closed = false, _erased = false;
  void _guard() {
    if (_closed || _erased) throw StateError('Read store unavailable');
  }

  @override
  Future<bool> contains(ReadContent content, DateTime now) async {
    _guard();
    return ReadMarker.matches(rows[content.key], scope, content, now);
  }

  @override
  Future<void> put(ReadContent content, DateTime now) async {
    _guard();
    if (!now.isBefore(content.retainUntil)) return;
    if (!ReadMarker.matches(rows[content.key], scope, content, now)) {
      if (_sequence >= readSequenceMaximum) {
        throw StateError('Read sequence exhausted');
      }
      _removeQueue(content.key);
      rows[content.key] = ReadMarker(scope, content, now).toJson();
      _sequences[content.key] = ++_sequence;
      _outbox[_sequence] = content.key;
    }
  }

  @override
  Future<int> prune(DateTime now, {int limit = 100}) async {
    _guard();
    final keys = rows.entries
        .where(
          (e) =>
              e.value['retainUntil'] is! int ||
              (e.value['retainUntil'] as int) <= now.millisecondsSinceEpoch,
        )
        .take(limit)
        .map((e) => e.key)
        .toList();
    for (final key in keys) {
      rows.remove(key);
      _removeQueue(key);
    }
    return keys.length;
  }

  @override
  Future<List<ReadUpload>> pending(DateTime now, {int limit = 32}) async {
    _guard();
    if (limit < 1 || limit > 32) throw ArgumentError('Read batch limit');
    return rows.values
        .where(
          (r) =>
              r['pendingSync'] == true &&
              !now.isBefore(_deferred[r['key']] ?? now),
        )
        .map((r) => ReadUpload.parse(r, scope, now))
        .whereType<ReadUpload>()
        .take(limit)
        .toList();
  }

  @override
  Future<void> defer(List<ReadUpload> batch, DateTime until) async {
    _guard();
    for (final row in batch) {
      _deferred[row.content.key] = until;
    }
  }

  @override
  Future<void> acknowledge(List<ReadUpload> batch, DateTime now) async {
    _guard();
    for (final row in batch) {
      final existing = rows[row.content.key];
      if (ReadMarker.matches(existing, scope, row.content, now) &&
          existing!['readAtLocal'] == row.readAtLocal) {
        rows[row.content.key] = {...existing, 'pendingSync': false};
        _removeQueue(row.content.key);
      }
    }
  }

  @override
  Future<void> merge(List<ReadUpload> batch, DateTime now) async {
    _guard();
    for (final row in batch) {
      if (!now.isBefore(row.content.retainUntil)) continue;
      final existing = rows[row.content.key];
      if (ReadMarker.matches(existing, scope, row.content, now)) continue;
      _removeQueue(row.content.key);
      rows[row.content.key] = {
        ...ReadMarker(
          scope,
          row.content,
          DateTime.fromMillisecondsSinceEpoch(row.readAtLocal),
        ).toJson(),
        'pendingSync': false,
      };
    }
  }

  @override
  Future<void> erase() async {
    _erased = true;
    rows.clear();
    _deferred.clear();
    _outbox.clear();
    _sequences.clear();
    _checkpoint = null;
  }

  @override
  Future<void> close() async {
    _closed = true;
  }

  void _removeQueue(String key) {
    final sequence = _sequences.remove(key);
    if (sequence != null) _outbox.remove(sequence);
    _deferred.remove(key);
  }

  @override
  Future<ReadSyncCheckpoint> beginSync({int? knownRevision}) async {
    _guard();
    final next = nextReadSync(_checkpoint, _epoch, _sequence, knownRevision);
    _epoch = next.epoch;
    return _checkpoint = next;
  }

  @override
  Future<ReadQueuePage> queuePage(
    ReadSyncCheckpoint checkpoint,
    DateTime now, {
    int limit = 32,
  }) async {
    _guard();
    if (!checkpoint.same(_checkpoint)) throw ReadSyncConflict();
    if (limit < 1 || limit > 32) throw ArgumentError('Read batch limit');
    final result = <ReadUpload>[];
    var after = checkpoint.after, scanned = 0, deferred = false;
    var sequence = _outbox.firstKeyAfter(after);
    while (sequence != null &&
        sequence <= checkpoint.boundary &&
        scanned < limit) {
      final key = _outbox[sequence]!, raw = rows[key];
      final row = ReadUpload.parse(raw, scope, now);
      after = sequence;
      scanned++;
      if (row == null || raw?['pendingSync'] != true) {
        _removeQueue(key);
      } else if (now.isBefore(_deferred[key] ?? now)) {
        deferred = true;
      } else {
        result.add(
          ReadUpload(row.content, row.readAtLocal, sequence: sequence),
        );
      }
      sequence = _outbox.firstKeyAfter(after);
    }
    final done = sequence == null || sequence > checkpoint.boundary;
    return ReadQueuePage(
      result,
      after: done ? checkpoint.boundary : after,
      done: done,
      deferred: deferred,
      scanned: scanned,
    );
  }

  @override
  Future<void> commitSync(
    ReadSyncCheckpoint expected,
    ReadSyncCheckpoint next,
    DateTime now, {
    List<ReadUpload> acknowledged = const [],
    List<ReadUpload> deferred = const [],
    List<ReadUpload> imported = const [],
  }) async {
    _guard();
    if (!expected.same(_checkpoint) ||
        next.epoch != expected.epoch ||
        next.boundary != expected.boundary ||
        next.after < expected.after ||
        ReadSyncCheckpoint.parse(next.toJson(scope), scope) == null) {
      throw ReadSyncConflict();
    }
    // No await inside the atomic in-memory commit.
    for (final row in acknowledged) {
      final existing = rows[row.content.key];
      if (_sequences[row.content.key] == row.sequence &&
          ReadMarker.matches(existing, scope, row.content, now) &&
          existing!['readAtLocal'] == row.readAtLocal) {
        rows[row.content.key] = {...existing, 'pendingSync': false};
        _removeQueue(row.content.key);
      }
    }
    for (final row in deferred) {
      if (_sequences[row.content.key] == row.sequence) {
        _deferred[row.content.key] = now.add(const Duration(minutes: 1));
      }
    }
    for (final row in imported) {
      if (!now.isBefore(row.content.retainUntil) ||
          ReadMarker.matches(rows[row.content.key], scope, row.content, now)) {
        continue;
      }
      _removeQueue(row.content.key);
      rows[row.content.key] = {
        ...ReadMarker(
          scope,
          row.content,
          DateTime.fromMillisecondsSinceEpoch(row.readAtLocal),
        ).toJson(),
        'pendingSync': false,
      };
    }
    _checkpoint = next.finished ? null : next;
  }
}
