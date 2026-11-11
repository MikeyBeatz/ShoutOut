part of '../main.dart';

class FeedRefreshOverlay extends StatelessWidget {
  const FeedRefreshOverlay({
    super.key,
    required this.child,
    this.onRefresh,
    this.onNotifications,
    this.refreshing = false,
  });

  final Widget child;
  final VoidCallback? onRefresh;
  final VoidCallback? onNotifications;
  final bool refreshing;

  @override
  Widget build(BuildContext context) =>
      onRefresh == null && onNotifications == null
      ? child
      : Stack(
          fit: StackFit.expand,
          children: [
            child,
            Positioned(
              top: 6,
              right: 20,
              child: SafeArea(
                bottom: false,
                child: ReadOccluder(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (onNotifications case final openNotifications?) ...[
                        NotificationBellButton(
                          floating: true,
                          onPressed: openNotifications,
                        ),
                        if (onRefresh != null) const SizedBox(width: 8),
                      ],
                      if (onRefresh != null)
                        FloatingActionButton.small(
                          key: const ValueKey('spatial-feed-refresh'),
                          heroTag: 'refresh-feed',
                          tooltip: MaterialLocalizations.of(
                            context,
                          ).refreshIndicatorSemanticLabel,
                          onPressed: refreshing ? null : onRefresh,
                          child: refreshing
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.refresh),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
}

/// One feed view over the shared page/session controller. It does not re-sort
/// server pages when counters, private interactions or location change.
class SpatialFeedPresentation {
  const SpatialFeedPresentation({
    required this.scrollController,
    required this.refresh,
    required this.changeFilters,
    required this.prefetch,
    required this.loadMore,
    required this.card,
    required this.hasMore,
    required this.loadingMore,
    required this.refreshing,
    this.message,
  });
  final ScrollController scrollController;
  final VoidCallback refresh;
  final ValueChanged<FeedFilters> changeFilters;
  final VoidCallback prefetch;
  final VoidCallback loadMore;
  final Widget Function(Shout) card;
  final bool hasMore;
  final bool loadingMore;
  final bool refreshing;
  final String? message;
}

Shout decodeSpatialFeedItem(Map<String, dynamic> item) {
  final id = item['id'], distance = item['distanceKm'], body = item['data'];
  if (id is! String ||
      id.isEmpty ||
      distance is! num ||
      !distance.isFinite ||
      distance < 0 ||
      body is! Map) {
    throw StateError('Invalid spatial feed item');
  }
  final data = Map<String, dynamic>.from(body);
  for (final field in ['createdAt', 'expiresAt']) {
    final millis = data[field];
    if (millis is! num || !millis.isFinite || millis < 0) {
      throw StateError('Invalid feed timestamp');
    }
    data[field] = Timestamp.fromMillisecondsSinceEpoch(millis.toInt());
  }
  return Shout.fromData(id, data, distanceKm: distance.toDouble());
}

class _SpatialShoutCard extends StatefulWidget {
  const _SpatialShoutCard({
    super.key,
    required this.shout,
    required this.blocked,
    required this.onSave,
    required this.onReaction,
    required this.heightOf,
    required this.recordHeight,
    this.ownSection,
    this.onDelete,
    this.onUnavailable,
    this.requireSaved = false,
  });
  final Shout shout;
  final bool blocked;
  final VoidCallback onSave;
  final Future<void> Function(bool) onReaction;
  final double? Function() heightOf;
  final ValueChanged<double> recordHeight;
  final OwnShoutsSection? ownSection;
  final Future<void> Function()? onDelete;
  final VoidCallback? onUnavailable;
  final bool requireSaved;
  @override
  State<_SpatialShoutCard> createState() => _SpatialShoutCardState();
}

class _SpatialShoutCardState extends State<_SpatialShoutCard> {
  final _measure = GlobalKey();
  StreamSubscription<LiveShoutState>? _subscription;
  bool _unavailable = false;

  bool get _visible => switch (widget.ownSection) {
    OwnShoutsSection.expired => widget.shout.isRetainedExpired,
    _ => widget.shout.isActive,
  };

  bool _accepts(Map<String, dynamic> data) {
    if (data['contentPurged'] == true) return false;
    if (widget.ownSection == null) return data['status'] == 'active';
    if (!['active', 'expired'].contains(data['status']) ||
        data['expiresAt'] is! Timestamp) {
      return false;
    }
    final expiry = (data['expiresAt'] as Timestamp).toDate(),
        now = DateTime.now();
    return widget.ownSection == OwnShoutsSection.active
        ? expiry.isAfter(now)
        : !expiry.isAfter(now) &&
              !now.isAfter(expiry.add(_expiredShoutRetention));
  }

  void _notifyUnavailable() {
    if (widget.onUnavailable == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onUnavailable?.call();
    });
  }

  @override
  void initState() {
    super.initState();
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    final ref = FirebaseFirestore.instance
        .collection('shouts')
        .doc(widget.shout.id);
    _subscription =
        watchLiveShoutState(
          ref
              .liveSnapshots(includeMetadataChanges: true)
              .where(
                (doc) =>
                    (doc.exists || !doc.metadata.isFromCache) &&
                    (!widget.requireSaved ||
                        (!doc.metadata.isFromCache &&
                            !doc.metadata.hasPendingWrites)),
              )
              .map((doc) {
                final data = doc.data();
                if (data == null || !_accepts(data)) {
                  return null;
                }
                return data;
              }),
          ref
              .collection('reactions')
              .doc(uid)
              .liveSnapshots()
              .map((doc) => doc.data()),
          ownSave: ref
              .collection('saves')
              .doc(uid)
              .liveSnapshots(includeMetadataChanges: widget.requireSaved)
              .where(
                (doc) =>
                    !widget.requireSaved ||
                    (!doc.metadata.isFromCache &&
                        !doc.metadata.hasPendingWrites),
              )
              .map((doc) => doc.exists),
        ).listen(
          (value) {
            if (!mounted) return;
            setState(() {
              _unavailable =
                  value.contentPurged || (widget.requireSaved && !value.saved);
              widget.shout
                ..likes = value.likes
                ..dislikes = value.dislikes
                ..comments = value.comments
                ..saves = value.saves
                ..isLiked = value.reaction == 'like'
                ..isDisliked = value.reaction == 'dislike'
                ..isSaved = value.saved;
            });
            if (_unavailable) _notifyUnavailable();
          },
          onError: (Object error, StackTrace stack) {
            if (!mounted) return;
            if (error is FirebaseException &&
                [
                  'permission-denied',
                  'not-found',
                  'unauthenticated',
                ].contains(error.code)) {
              setState(() => _unavailable = true);
              _notifyUnavailable();
            }
            debugPrint(
              'Feed card subscription failed: code=${liveDataFailureCode(error)}',
            );
          },
        );
  }

  @override
  void dispose() {
    unawaited(_subscription?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.requireSaved) {
      return ShoutInteractionGate(
        expiresAt: widget.shout.expiresAt,
        enabled: widget.shout.status == ShoutStatus.active,
        builder: (context, open) {
          if (!open || widget.blocked) {
            _notifyUnavailable();
            return const SizedBox.shrink();
          }
          return _buildCard(context);
        },
      );
    }
    return _buildCard(context);
  }

  Widget _buildCard(BuildContext context) {
    if (_unavailable || widget.blocked || !_visible) {
      return SizedBox(
        height: widget.heightOf(),
        child: Card(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(tr(context, 'Tento Shout už není dostupný.')),
            ),
          ),
        ),
      );
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final size = _measure.currentContext?.size;
      if (mounted && size != null) widget.recordHeight(size.height);
    });
    return SizedBox(
      key: _measure,
      child: widget.ownSection == null
          ? RatedShoutCard(
              shout: widget.shout,
              onSave: widget.onSave,
              onReaction: widget.onReaction,
            )
          : ShoutCard(
              shout: widget.shout,
              onSave: widget.onSave,
              onReaction: widget.onReaction,
              showSaveCount: true,
              showDeleteButton: widget.onDelete != null,
              onDelete: widget.onDelete,
            ),
    );
  }
}
