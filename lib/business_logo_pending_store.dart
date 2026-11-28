import 'dart:convert';

/// Atomic compare-and-set operations. One immutable request per account.
abstract class BusinessLogoPendingStore {
  Future<Map<String, dynamic>?> read(String uid);
  Future<Map<String, dynamic>> insert(String uid, Map<String, dynamic> row);
  Future<Map<String, dynamic>> bind(
    String uid,
    String key,
    Map<String, dynamic> binding,
  );
  Future<void> remove(String uid, String key);
  Future<void> erase(String uid);
  Future<void> prune(int nowMillis);
}

Map<String, dynamic> copyLogoRow(Map<String, dynamic> row) =>
    Map<String, dynamic>.from(jsonDecode(jsonEncode(row)) as Map);

class MemoryBusinessLogoPendingStore implements BusinessLogoPendingStore {
  final rows = <String, Map<String, dynamic>>{};
  final erased = <String>{};
  @override
  Future<Map<String, dynamic>?> read(String uid) async =>
      rows[uid] == null ? null : copyLogoRow(rows[uid]!);
  @override
  Future<Map<String, dynamic>> insert(
    String uid,
    Map<String, dynamic> row,
  ) async {
    if (erased.contains(uid)) throw StateError('Logo account erased');
    return copyLogoRow(rows.putIfAbsent(uid, () => copyLogoRow(row)));
  }

  @override
  Future<Map<String, dynamic>> bind(
    String uid,
    String key,
    Map<String, dynamic> binding,
  ) async {
    final row = rows[uid];
    if (erased.contains(uid) || row == null || row['key'] != key) {
      throw StateError('Logo request retired');
    }
    row['binding'] ??= copyLogoRow(binding);
    return copyLogoRow(row['binding'] as Map<String, dynamic>);
  }

  @override
  Future<void> remove(String uid, String key) async {
    if (rows[uid]?['key'] == key) rows.remove(uid);
  }

  @override
  Future<void> erase(String uid) async {
    erased.add(uid);
    rows.remove(uid);
  }

  @override
  Future<void> prune(int nowMillis) async {
    rows.removeWhere((_, row) => (row['expiresAt'] as int) <= nowMillis);
  }
}
