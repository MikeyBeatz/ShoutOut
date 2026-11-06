part of '../main.dart';

/// Bookmarks are loaded by their owner, independently of any nearby/recent
/// feed window. Only explicit navigation, refresh and next-page load call the
/// server. The visible card retains the existing live detail/interactions.
class _SavedShoutsLibrary extends StatefulWidget {
  const _SavedShoutsLibrary({
    required this.onSave,
    required this.onReaction,
    this.position,
  });
  final ValueChanged<Shout> onSave;
  final Future<void> Function(Shout shout, {required bool like}) onReaction;
  final Position? position;
  @override
  State<_SavedShoutsLibrary> createState() => _SavedShoutsLibraryState();
}

class _SavedShoutsLibraryState extends State<_SavedShoutsLibrary> {
  final List<Shout> _items = [];
  final Map<String, double> _heights = {};
  late final String? _uid;
  String? _next;
  bool _loading = false, _failed = false;
  @override
  void initState() {
    super.initState();
    _uid = FirebaseAuth.instance.currentUser?.uid;
    unawaited(_load(refresh: true));
  }

  Future<void> _load({bool refresh = false}) async {
    if (_loading ||
        _uid == null ||
        FirebaseAuth.instance.currentUser?.uid != _uid) {
      return;
    }
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final response =
          await FirebaseFunctions.instanceFor(
            region: 'europe-west3',
          ).httpsCallable('getSavedShouts').call<Map<String, dynamic>>({
            'expectedUserId': _uid,
            if (widget.position case final position?)
              'point': {
                'latitude': position.latitude,
                'longitude': position.longitude,
              },
            if (!refresh && _next != null) 'after': _next,
          });
      if (!mounted || FirebaseAuth.instance.currentUser?.uid != _uid) return;
      final data = response.data, rows = data['items'], next = data['next'];
      if (data['version'] != 1 ||
          rows is! List ||
          rows.length > 50 ||
          !(next == null || next is String) ||
          !refresh && next != null && next == _next) {
        throw StateError('Invalid saved Shout page');
      }
      final items = rows
          .map(
            (item) =>
                decodeSpatialFeedItem(Map<String, dynamic>.from(item as Map)),
          )
          .toList();
      setState(() {
        if (refresh) {
          _items.clear();
          _heights.clear();
        }
        final ids = _items.map((item) => item.id).toSet();
        _items.addAll(items.where((item) => ids.add(item.id)));
        _next = next as String?;
      });
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Align(
        alignment: Alignment.centerRight,
        child: TextButton.icon(
          onPressed: _loading ? null : () => unawaited(_load(refresh: true)),
          icon: const Icon(Icons.refresh),
          label: Text(tr(context, 'Obnovit')),
        ),
      ),
      if (_loading) const LinearProgressIndicator(),
      if (_failed)
        Text(tr(context, 'Feed se nepodařilo načíst. Zkus to znovu.')),
      Expanded(
        child: _loading && _items.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : _items.isEmpty
            ? EmptyState(
                icon: Icons.bookmark_border,
                title: tr(context, 'Zatím nemáš uložené žádné shouty.'),
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                itemCount: _items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (_, index) {
                  final shout = _items[index];
                  return _SpatialShoutCard(
                    key: ValueKey(shout.id),
                    shout: shout,
                    blocked: false,
                    onSave: () => widget.onSave(shout),
                    onReaction: (like) => widget.onReaction(shout, like: like),
                    heightOf: () => _heights[shout.id],
                    recordHeight: (height) => _heights[shout.id] = height,
                  );
                },
              ),
      ),
      if (_next != null)
        TextButton(
          onPressed: _loading ? null : () => unawaited(_load()),
          child: Text(tr(context, 'Načíst další')),
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
  });
  final Shout shout;
  final bool blocked;
  final VoidCallback onSave;
  final Future<void> Function(bool) onReaction;
  final double? Function() heightOf;
  final ValueChanged<double> recordHeight;
  @override
  State<_SpatialShoutCard> createState() => _SpatialShoutCardState();
}

class _SpatialShoutCardState extends State<_SpatialShoutCard> {
  final _measure = GlobalKey();
  StreamSubscription<LiveShoutState>? _subscription;
  bool _unavailable = false;

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
              .where((doc) => doc.exists || !doc.metadata.isFromCache)
              .map((doc) {
                final data = doc.data();
                if (data == null ||
                    data['status'] != 'active' ||
                    data['contentPurged'] == true) {
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
              .liveSnapshots()
              .map((doc) => doc.exists),
        ).listen(
          (value) {
            if (!mounted) return;
            setState(() {
              _unavailable = value.contentPurged;
              widget.shout
                ..likes = value.likes
                ..dislikes = value.dislikes
                ..comments = value.comments
                ..saves = value.saves
                ..isLiked = value.reaction == 'like'
                ..isDisliked = value.reaction == 'dislike'
                ..isSaved = value.saved;
            });
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
    if (_unavailable || widget.blocked || !widget.shout.isActive) {
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
      child: RatedShoutCard(
        shout: widget.shout,
        onSave: widget.onSave,
        onReaction: widget.onReaction,
      ),
    );
  }
}
