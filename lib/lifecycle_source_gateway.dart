import 'dart:convert';
import 'package:crypto/crypto.dart';

/// Merge only a point-read signal for the already selected incarnation.
/// Unknown fields cannot enter the list through the live SDK channel.
Map<String, dynamic>? mergeLifecycleSourceSignal(
  Map<String, dynamic> row,
  Map<String, dynamic>? signal, {
  required String view,
  required String viewer,
  required int nowMillis,
  bool comment = false,
}) {
  if (signal == null) return null;
  final body = row['data'] as Map;
  if (comment) {
    final before = row['comment'] as Map;
    if (signal['authorId'] != viewer ||
        signal['text'] is! String ||
        signal['createdAt'] is! num ||
        !(signal['createdAt'] as num).isFinite ||
        (signal['createdAt'] as num).toInt() !=
            (before['createdAt'] as num).toInt()) {
      return null;
    }
    return {
      ...row,
      'comment': {...before, 'text': signal['text']},
    };
  }
  if (['createdAt', 'expiresAt', 'publicUntil', 'historyUntil'].any(
    (key) =>
        signal[key] is! num ||
        !(signal[key] as num).isFinite ||
        signal[key] < 0,
  )) {
    return null;
  }
  final end = signal['publicUntil'] as num,
      history = signal['historyUntil'] as num;
  if (signal['contentPurged'] == true ||
      signal['authorId'] != body['authorId'] ||
      signal['createdAt'] is! num ||
      (signal['createdAt'] as num).toInt() !=
          (body['createdAt'] as num).toInt() ||
      history - end != 7 * 86400000 ||
      end > signal['expiresAt'] ||
      history <= nowMillis ||
      !['active', 'expired', 'deleted'].contains(signal['status']) ||
      signal['status'] == 'deleted' && signal['authorId'] != viewer ||
      ['profile', 'staff', 'home'].contains(view) &&
          (signal['status'] != 'active' || end <= nowMillis)) {
    return null;
  }
  final next = Map<String, dynamic>.from(body);
  if (body['geography'] is Map &&
      signal.containsKey('geography') &&
      signal['geography'] is! Map) {
    return null;
  }
  for (final key in body.keys) {
    if (key != 'readOnlyHistory' && signal.containsKey(key)) {
      if (body[key] is String && signal[key] is! String ||
          body[key] is bool && signal[key] is! bool ||
          [
                'likesCount',
                'dislikesCount',
                'commentsCount',
                'savesCount',
              ].contains(key) &&
              (signal[key] is! num ||
                  !(signal[key] as num).isFinite ||
                  signal[key] < 0 ||
                  signal[key] != (signal[key] as num).truncateToDouble()) ||
          key == 'categories' &&
              (signal[key] is! List ||
                  (signal[key] as List).any((v) => v is! String))) {
        return null;
      }
      next[key as String] = signal[key];
    }
  }
  final geography = next['geography'];
  if (geography is Map) {
    next['geography'] = {
      for (final key in [
        'countryCode',
        'subdivisionCode',
        'localityName',
        'providerPlaceId',
      ])
        if (geography[key] is String) key: geography[key],
    };
  }
  next['readOnlyHistory'] = end <= nowMillis;
  return {...row, 'data': next};
}

class LifecycleSourceBatch {
  const LifecycleSourceBatch(this.items, this.next);
  final List<Map<String, dynamic>> items;
  final Map<String, dynamic>? next;
}

/// Per-view page transport. Cursors skip only within a freshly authorized
/// query; neither cursors nor cached rows grant access to an archive.
class LifecycleSourceGateway {
  LifecycleSourceGateway({
    required this.currentUserId,
    required this.send,
    required this.view,
    this.authorId,
    this.countryCode,
    this.subdivisionCode,
    this.point,
    this.validateItem,
  });
  final String? Function() currentUserId;
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>) send;
  final String view;
  final String? authorId, countryCode, subdivisionCode;
  final Map<String, double>? point;
  final void Function(Map<String, dynamic>)? validateItem;
  bool _disposed = false;
  String get selection => sha256
      .convert(
        utf8.encode(jsonEncode([view, authorId, countryCode, subdivisionCode])),
      )
      .toString();
  static final _id = RegExp(r'^[A-Za-z0-9_-]{1,128}$');
  Never _invalid() => throw StateError('Invalid content source page');
  Map<String, dynamic> _cursor(dynamic value, String uid) {
    if (value is! Map ||
        value.length != 6 ||
        value['v'] != 1 ||
        value['userId'] != uid ||
        value['view'] != view ||
        value['selection'] != selection ||
        value['path'] is! String) {
      _invalid();
    }
    final parts = (value['path'] as String).split('/');
    if (parts.length != (view == 'comments' ? 4 : 2) ||
        parts[0] != 'shouts' ||
        !_id.hasMatch(parts[1]) ||
        view == 'comments' &&
            (parts[2] != 'comments' || !_id.hasMatch(parts[3]))) {
      _invalid();
    }
    final time = value['createdAt'];
    if (time is! List ||
        time.length != 2 ||
        time.any(
          (v) => v is! num || !v.isFinite || v != v.truncateToDouble(),
        ) ||
        time[0] < 0 ||
        time[0] > 253402300799 ||
        time[1] < 0 ||
        time[1] >= 1000000000) {
      _invalid();
    }
    return Map.unmodifiable({
      ...Map<String, dynamic>.from(value),
      'createdAt': List<int>.unmodifiable(time.map((v) => (v as num).toInt())),
    });
  }

  static String itemKey(Map<String, dynamic> row) => row['comment'] is Map
      ? '${row['id']}/comments/${(row['comment'] as Map)['id']}'
      : row['id'] as String;
  num visibleUntil(Map<String, dynamic> row) =>
      (row['data'] as Map)[['profile', 'staff', 'home'].contains(view)
              ? 'publicUntil'
              : 'historyUntil']
          as num;

  Future<LifecycleSourceBatch> load({
    Map<String, dynamic>? after,
    Map<String, double>? point,
  }) async {
    final uid = currentUserId();
    if (_disposed || uid == null) throw StateError('Sign-in required');
    final cursor = after == null ? null : _cursor(after, uid);
    final result = await send({
      'expectedUserId': uid,
      'view': view,
      'authorId': ?authorId,
      'countryCode': ?countryCode,
      'subdivisionCode': ?subdivisionCode,
      'point': ?(point ?? this.point),
      'after': ?cursor,
    });
    if (_disposed || currentUserId() != uid) {
      throw StateError('The signed-in account changed');
    }
    final rows = result['items'];
    if (result['version'] != 1 ||
        result['userId'] != uid ||
        result['view'] != view ||
        result['selection'] != selection ||
        rows is! List ||
        rows.length > 50) {
      _invalid();
    }
    final next = result['next'] == null ? null : _cursor(result['next'], uid);
    if (next != null &&
        cursor != null &&
        jsonEncode(next) == jsonEncode(cursor)) {
      _invalid();
    }
    final items = <Map<String, dynamic>>[], seen = <String>{};
    for (final raw in rows) {
      if (raw is! Map ||
          raw['id'] is! String ||
          !_id.hasMatch(raw['id']) ||
          raw['data'] is! Map ||
          raw['distanceKm'] is! num ||
          !(raw['distanceKm'] as num).isFinite ||
          raw['distanceKm'] < 0) {
        _invalid();
      }
      final row = Map<String, dynamic>.from(raw), body = row['data'] as Map;
      final end = body['publicUntil'], history = body['historyUntil'];
      if (end is! num ||
          !end.isFinite ||
          end < 0 ||
          history is! num ||
          !history.isFinite ||
          history > 253402300799999 ||
          history - end != 7 * 86400000 ||
          view == 'profile' && body['authorId'] != authorId ||
          view == 'business' && body['authorId'] != uid ||
          ['profile', 'staff', 'home'].contains(view) &&
              body['status'] != 'active' ||
          body['status'] == 'deleted' && body['authorId'] != uid) {
        _invalid();
      }
      if (view == 'comments') {
        final comment = row['comment'];
        if (comment is! Map ||
            comment['id'] is! String ||
            !_id.hasMatch(comment['id']) ||
            comment['text'] is! String ||
            comment['createdAt'] is! num ||
            !(comment['createdAt'] as num).isFinite ||
            comment['createdAt'] < 0) {
          _invalid();
        }
      } else if (row.containsKey('comment')) {
        _invalid();
      }
      if (!seen.add(itemKey(row))) _invalid();
      validateItem?.call(row);
      items.add(Map.unmodifiable(row));
    }
    return LifecycleSourceBatch(List.unmodifiable(items), next);
  }

  void dispose() => _disposed = true;
}
