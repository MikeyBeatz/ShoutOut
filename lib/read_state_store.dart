import 'dart:convert';

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
        raw['pendingSync'] == true &&
        now.isBefore(content.retainUntil);
  }
}

abstract interface class ReadStateStore {
  Future<bool> contains(ReadContent content, DateTime now);
  Future<void> put(ReadContent content, DateTime now);
  Future<int> prune(DateTime now, {int limit = 100});

  /// A persistent local fence prevents another open tab from recreating rows.
  Future<void> erase();
  Future<void> close();
}

class MemoryReadStateStore implements ReadStateStore {
  MemoryReadStateStore(this.scope);
  final ReadScope scope;
  final rows = <String, Map<String, dynamic>>{};
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
      rows[content.key] = ReadMarker(scope, content, now).toJson();
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
    }
    return keys.length;
  }

  @override
  Future<void> erase() async {
    _erased = true;
    rows.clear();
  }

  @override
  Future<void> close() async {
    _closed = true;
  }
}
