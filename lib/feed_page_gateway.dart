import 'feed_session.dart';

class SpatialFeedContext {
  const SpatialFeedContext({
    required this.latitude,
    required this.longitude,
    required this.radiusKm,
    required this.order,
    this.category,
  });

  final double latitude;
  final double longitude;
  final double radiusKm;
  final String order;
  final String? category;

  Map<String, Object?> toPayload() => {
    'point': {'latitude': latitude, 'longitude': longitude},
    'radiusKm': radiusKm,
    'order': order,
    'category': category,
  };

  @override
  bool operator ==(Object other) =>
      other is SpatialFeedContext &&
      latitude == other.latitude &&
      longitude == other.longitude &&
      radiusKm == other.radiusKm &&
      order == other.order &&
      category == other.category;

  @override
  int get hashCode =>
      Object.hash(latitude, longitude, radiusKm, order, category);
}

class FeedPageCursor {
  const FeedPageCursor._(this.token, this.uid, this.context);
  final String token;
  final String uid;
  final SpatialFeedContext context;

  @override
  bool operator ==(Object other) =>
      other is FeedPageCursor &&
      token == other.token &&
      uid == other.uid &&
      context == other.context;
  @override
  int get hashCode => Object.hash(token, uid, context);
}

/// Bounded transport for the existing session controller. Preparing checkpoints
/// are internal work, never an empty completed page or a false end of feed.
class FeedPageGateway<T> {
  FeedPageGateway({
    required this.currentUserId,
    required this.send,
    required this.decodeItem,
    this.maxPreparationRequests = 32,
  }) {
    if (maxPreparationRequests < 1) {
      throw ArgumentError('Invalid feed work budget');
    }
  }

  final String? Function() currentUserId;
  final Future<Object?> Function(Map<String, Object?>) send;
  final T Function(Map<String, dynamic>) decodeItem;
  // Local integration safety budget. Live activation must validate costs and
  // latency for the whole preparation, not merely one callable request.
  final int maxPreparationRequests;
  int _generation = 0;
  bool _disposed = false;

  void cancelPending() => ++_generation;
  void dispose() {
    _disposed = true;
    cancelPending();
  }

  Future<FeedBatch<T>> load(SpatialFeedContext context, Object? cursor) async {
    final uid = currentUserId();
    if (_disposed || uid == null) throw StateError('No active feed account');
    if (cursor != null &&
        (cursor is! FeedPageCursor ||
            cursor.uid != uid ||
            cursor.context != context)) {
      throw StateError('Feed cursor belongs to another context');
    }
    final generation = cursor == null ? ++_generation : _generation;
    void guard() {
      if (_disposed || generation != _generation || currentUserId() != uid) {
        throw StateError('Feed request is no longer active');
      }
    }

    var token = (cursor as FeedPageCursor?)?.token;
    String? baseline;
    for (var work = 0; work < maxPreparationRequests; work++) {
      guard();
      final response = await send({
        'expectedUserId': uid,
        if (token == null) 'context': context.toPayload() else 'cursor': token,
      });
      guard();
      if (response is! Map) throw StateError('Invalid feed response');
      final value = Map<String, dynamic>.from(response);
      final items = value['items'],
          next = value['next'],
          state = value['state'];
      if (value['version'] != 1 ||
          !['preparing', 'ready'].contains(state) ||
          value['baseline'] is! String ||
          (value['baseline'] as String).isEmpty ||
          value['expiresAt'] is! num ||
          items is! List ||
          items.length > 50 ||
          !(next == null ||
              next is String && next.isNotEmpty && next.length <= 262144) ||
          baseline != null && baseline != value['baseline'] ||
          next != null && next == token) {
        throw StateError('Invalid feed page');
      }
      baseline = value['baseline'] as String;
      if (state == 'preparing') {
        if (items.isNotEmpty || next == null) {
          throw StateError('Invalid feed preparation');
        }
        token = next as String;
        continue;
      }
      final decoded = items.map((item) {
        if (item is! Map) throw StateError('Invalid feed item');
        return decodeItem(Map<String, dynamic>.from(item));
      }).toList();
      return FeedBatch(
        items: decoded,
        baseline: baseline,
        next: next == null
            ? null
            : FeedPageCursor._(next as String, uid, context),
      );
    }
    throw StateError('Feed preparation work budget exhausted');
  }
}
