import 'dart:convert';

enum OwnShoutsSection { active, expired }

class OwnShoutsBatch<T> {
  OwnShoutsBatch(Iterable<T> items, this.next)
    : items = List.unmodifiable(items);
  final List<T> items;
  final Map<String, dynamic>? next;
}

/// Own-list cursors are rank boundaries, not access grants or feed snapshots.
/// Both sides bind them to the current account and selected section.
class OwnShoutsGateway<T> {
  OwnShoutsGateway({
    required this.currentUserId,
    required this.send,
    required this.decodeItem,
  });
  final String? Function() currentUserId;
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>) send;
  final T Function(Map<String, dynamic>) decodeItem;
  bool _disposed = false;

  Never _invalid() => throw StateError('Invalid own Shout page');
  List<int> _stamp(dynamic value) {
    if (value is! List || value.length != 2) _invalid();
    final result = <int>[];
    for (final part in value) {
      if (part is! num || !part.isFinite || part != part.truncateToDouble()) {
        _invalid();
      }
      result.add(part.toInt());
    }
    if (result[0] < 0 ||
        result[0] > 253402300799 ||
        result[1] < 0 ||
        result[1] >= 1000000000) {
      _invalid();
    }
    return List.unmodifiable(result);
  }

  Map<String, dynamic> _cursor(
    dynamic value,
    String uid,
    OwnShoutsSection section,
  ) {
    if (value is! Map ||
        value.length != 5 ||
        value['userId'] != uid ||
        value['section'] != section.name ||
        value['id'] is! String ||
        !RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(value['id'] as String)) {
      _invalid();
    }
    return Map.unmodifiable({
      'userId': uid,
      'section': section.name,
      'id': value['id'],
      'createdAt': _stamp(value['createdAt']),
      'expiresAt': _stamp(value['expiresAt']),
    });
  }

  Future<OwnShoutsBatch<T>> load(
    OwnShoutsSection section, {
    Map<String, dynamic>? after,
    Map<String, double>? point,
  }) async {
    final uid = currentUserId();
    if (_disposed || uid == null) throw StateError('Sign-in required');
    final cursor = after == null ? null : _cursor(after, uid, section);
    final data = await send({
      'expectedUserId': uid,
      'section': section.name,
      'after': ?cursor,
      'point': ?point,
    });
    if (_disposed || currentUserId() != uid) {
      throw StateError('The signed-in account changed');
    }
    final rows = data['items'];
    if (data['version'] != 1 || rows is! List || rows.length > 50) _invalid();
    final next = data['next'] == null
        ? null
        : _cursor(data['next'], uid, section);
    if (next != null &&
        cursor != null &&
        jsonEncode(next) == jsonEncode(cursor)) {
      _invalid();
    }
    final seen = <String>{}, items = <T>[];
    for (final row in rows) {
      if (row is! Map ||
          row['id'] is! String ||
          !seen.add(row['id'] as String) ||
          row['data'] is! Map ||
          (row['data'] as Map)['authorId'] != uid) {
        _invalid();
      }
      items.add(decodeItem(Map<String, dynamic>.from(row)));
    }
    return OwnShoutsBatch(items, next);
  }

  void dispose() => _disposed = true;
}
