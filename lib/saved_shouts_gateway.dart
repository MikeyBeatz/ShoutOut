class SavedShoutsBatch<T> {
  SavedShoutsBatch(Iterable<T> items, this.next)
    : items = List.unmodifiable(items);
  final List<T> items;
  final String? next;
}

/// A bookmark cursor belongs to its reader; the Shout may have any author.
class SavedShoutsGateway<T> {
  SavedShoutsGateway({
    required this.currentUserId,
    required this.send,
    required this.decodeItem,
  });
  final String? Function() currentUserId;
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>) send;
  final T Function(Map<String, dynamic>) decodeItem;
  bool _disposed = false;

  Never _invalid() => throw StateError('Invalid saved Shout page');

  String _cursor(dynamic value, String uid) {
    if (value is! String ||
        !RegExp(r'^shouts/[^/]{1,256}/saves/[^/]{1,128}$').hasMatch(value) ||
        value.split('/')[3] != uid) {
      _invalid();
    }
    return value;
  }

  Future<SavedShoutsBatch<T>> load({
    String? after,
    Map<String, double>? point,
  }) async {
    final uid = currentUserId();
    if (_disposed || uid == null) throw StateError('Sign-in required');
    final cursor = after == null ? null : _cursor(after, uid);
    final data = await send({
      'expectedUserId': uid,
      'after': ?cursor,
      'point': ?point,
    });
    if (_disposed || currentUserId() != uid) {
      throw StateError('The signed-in account changed');
    }
    final rows = data['items'];
    if (data['version'] != 1 || rows is! List || rows.length > 50) _invalid();
    final next = data['next'] == null ? null : _cursor(data['next'], uid);
    if (next != null && next == cursor) _invalid();
    final seen = <String>{}, items = <T>[];
    for (final row in rows) {
      if (row is! Map ||
          row['id'] is! String ||
          !RegExp(r'^[^/]{1,256}$').hasMatch(row['id'] as String) ||
          !seen.add(row['id'] as String) ||
          row['data'] is! Map) {
        _invalid();
      }
      items.add(decodeItem(Map<String, dynamic>.from(row)));
    }
    return SavedShoutsBatch(items, next);
  }

  void dispose() => _disposed = true;
}
