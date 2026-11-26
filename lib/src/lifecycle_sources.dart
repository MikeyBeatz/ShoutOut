part of '../main.dart';

bool get _useLifecycleSources =>
    kIsWeb && WebEnvironment.current.serverContentLifecycle;

// The surrounding row is keyed by its server payload. Preserve the mutable
// interaction model during parent/list rebuilds; a real refresh replaces it.
class _LifecycleProfileCard extends StatefulWidget {
  const _LifecycleProfileCard({
    required this.row,
    required this.onSave,
    required this.onReaction,
  });
  final Map<String, dynamic> row;
  final ValueChanged<Shout> onSave;
  final Future<void> Function(Shout, {required bool like}) onReaction;
  @override
  State<_LifecycleProfileCard> createState() => _LifecycleProfileCardState();
}

class _LifecycleProfileCardState extends State<_LifecycleProfileCard> {
  late final Shout _shout;
  @override
  void initState() {
    super.initState();
    _shout = decodeSpatialFeedItem(widget.row);
  }

  @override
  Widget build(BuildContext context) => _SpatialShoutCard(
    shout: _shout,
    blocked: false,
    heightOf: () => null,
    recordHeight: (_) {},
    onSave: () => widget.onSave(_shout),
    onReaction: (like) => widget.onReaction(_shout, like: like),
  );
}

LifecycleSourceGateway _lifecycleGateway(
  String view, {
  String? authorId,
  String? countryCode,
  String? subdivisionCode,
  Map<String, double>? point,
}) => LifecycleSourceGateway(
  view: view,
  authorId: authorId,
  countryCode: countryCode,
  subdivisionCode: subdivisionCode,
  point: point,
  validateItem: (row) {
    decodeSpatialFeedItem(row);
  },
  currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  send: (payload) async =>
      (await FirebaseFunctions.instanceFor(region: 'europe-west3')
              .httpsCallable('getLifecycleSourcePage')
              .call<Map<String, dynamic>>(payload))
          .data,
);

class _LifecycleSources extends StatefulWidget {
  const _LifecycleSources({
    required this.view,
    required this.emptyText,
    required this.itemBuilder,
    this.authorId,
    this.countryCode,
    this.subdivisionCode,
    this.point,
    this.retain,
  });
  final String view, emptyText;
  final String? authorId, countryCode, subdivisionCode;
  final Map<String, double>? point;
  final bool Function(Map<String, dynamic>)? retain;
  final Widget Function(BuildContext, Map<String, dynamic>) itemBuilder;
  @override
  State<_LifecycleSources> createState() => _LifecycleSourcesState();
}

class _LifecycleSourcesState extends State<_LifecycleSources> {
  late LifecycleSourceGateway _gateway;
  void _connect() => _gateway = _lifecycleGateway(
    widget.view,
    authorId: widget.authorId,
    countryCode: widget.countryCode,
    subdivisionCode: widget.subdivisionCode,
    point: widget.point,
  );
  @override
  void initState() {
    super.initState();
    _connect();
  }

  @override
  void didUpdateWidget(covariant _LifecycleSources oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.view != widget.view ||
        oldWidget.authorId != widget.authorId ||
        oldWidget.countryCode != widget.countryCode ||
        oldWidget.subdivisionCode != widget.subdivisionCode ||
        !mapEquals(oldWidget.point, widget.point)) {
      _connect();
    }
  }

  @override
  Widget build(BuildContext context) => LifecycleSourceLibrary(
    gateway: _gateway,
    emptyText: widget.emptyText,
    itemBuilder: (context, row, remove) => _LifecycleLiveSourceRow(
      key: ObjectKey(row),
      view: widget.view,
      row: row,
      onUnavailable: remove,
      retain: widget.retain,
      point: widget.point,
      itemBuilder: widget.itemBuilder,
    ),
    retain: widget.retain,
  );
}

/// Shared bounded lists keep existing rows/scroll during failure and retry the
/// same page. Empty non-final pages expose continuation rather than auto-scans.
class LifecycleSourceLibrary extends StatefulWidget {
  const LifecycleSourceLibrary({
    super.key,
    required this.gateway,
    required this.emptyText,
    required this.itemBuilder,
    this.retain,
    this.nowMillis,
  });
  final LifecycleSourceGateway gateway;
  final String emptyText;
  final Widget Function(BuildContext, Map<String, dynamic>, VoidCallback)
  itemBuilder;
  final bool Function(Map<String, dynamic>)? retain;
  final int Function()? nowMillis;
  @override
  State<LifecycleSourceLibrary> createState() => _LifecycleSourceLibraryState();
}

class _LifecycleSourceLibraryState extends State<LifecycleSourceLibrary> {
  final _items = <Map<String, dynamic>>[], _scroll = ScrollController();
  Map<String, dynamic>? _next;
  late String? _uid;
  bool _loading = false, _failed = false, _retryRefresh = true;
  int _attempt = 0;
  Timer? _expiry;
  bool get _current => _uid != null && widget.gateway.currentUserId() == _uid;
  @override
  void initState() {
    super.initState();
    _uid = widget.gateway.currentUserId();
    unawaited(_load(true));
  }

  @override
  void didUpdateWidget(covariant LifecycleSourceLibrary oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.gateway == widget.gateway &&
        _uid == widget.gateway.currentUserId()) {
      return;
    }
    if (oldWidget.gateway != widget.gateway) oldWidget.gateway.dispose();
    _attempt++;
    _expiry?.cancel();
    _uid = widget.gateway.currentUserId();
    _items.clear();
    _next = null;
    _loading = false;
    _failed = false;
    unawaited(_load(true));
  }

  void _expire() {
    _expiry?.cancel();
    final now =
        widget.nowMillis?.call() ?? DateTime.now().millisecondsSinceEpoch;
    _items.removeWhere((row) => widget.gateway.visibleUntil(row) <= now);
    if (_items.isEmpty) return;
    final end = _items
        .map(widget.gateway.visibleUntil)
        .reduce((a, b) => a < b ? a : b);
    _expiry = Timer(Duration(milliseconds: (end - now).ceil() + 1), () {
      if (mounted && _current) setState(_expire);
    });
  }

  Future<void> _load(bool refresh) async {
    if (_loading || !_current) return;
    final attempt = ++_attempt;
    setState(() {
      _loading = true;
      _failed = false;
      _retryRefresh = refresh;
    });
    try {
      final batch = await widget.gateway.load(after: refresh ? null : _next);
      if (!mounted || !_current || attempt != _attempt) return;
      setState(() {
        if (refresh) _items.clear();
        final keys = _items.map(LifecycleSourceGateway.itemKey).toSet();
        _items.addAll(
          batch.items.where(
            (row) => keys.add(LifecycleSourceGateway.itemKey(row)),
          ),
        );
        _next = batch.next;
        _expire();
      });
      if (refresh && _scroll.hasClients) _scroll.jumpTo(0);
    } catch (_) {
      if (mounted && _current && attempt == _attempt) {
        setState(() => _failed = true);
      }
    } finally {
      if (mounted && _current && attempt == _attempt) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  void dispose() {
    _attempt++;
    _expiry?.cancel();
    widget.gateway.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_current) return const SizedBox.shrink();
    final items = _items
        .where((row) => widget.retain?.call(row) ?? true)
        .toList();
    return Column(
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: IconButton(
            key: const ValueKey('lifecycle-refresh'),
            icon: const Icon(Icons.refresh),
            tooltip: MaterialLocalizations.of(
              context,
            ).refreshIndicatorSemanticLabel,
            onPressed: _loading ? null : () => unawaited(_load(true)),
          ),
        ),
        if (_loading) const LinearProgressIndicator(),
        if (_failed)
          TextButton(
            key: const ValueKey('lifecycle-retry'),
            onPressed: _loading ? null : () => unawaited(_load(_retryRefresh)),
            child: Text(
              tr(context, 'Feed se nepodařilo načíst. Zkus to znovu.'),
            ),
          ),
        Expanded(
          child: items.isEmpty && _loading
              ? const Center(child: CircularProgressIndicator())
              : items.isEmpty && _next == null
              ? (_failed
                    ? const SizedBox.shrink()
                    : EmptyState(
                        icon: Icons.campaign_outlined,
                        title: tr(context, widget.emptyText),
                      ))
              : ListView.separated(
                  key: const ValueKey('lifecycle-list'),
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: items.length + (_next == null ? 0 : 1),
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, index) => index == items.length
                      ? Center(
                          child: FilledButton.tonalIcon(
                            key: const ValueKey('lifecycle-more'),
                            onPressed: _loading
                                ? null
                                : () => unawaited(_load(false)),
                            icon: const Icon(Icons.expand_more),
                            label: Text(tr(context, 'Načíst další')),
                          ),
                        )
                      : KeyedSubtree(
                          key: ValueKey(
                            LifecycleSourceGateway.itemKey(items[index]),
                          ),
                          child: widget.itemBuilder(context, items[index], () {
                            if (!mounted || !_current) return;
                            setState(() {
                              _items.removeWhere(
                                (row) =>
                                    LifecycleSourceGateway.itemKey(row) ==
                                    LifecycleSourceGateway.itemKey(
                                      items[index],
                                    ),
                              );
                              _expire();
                            });
                          }),
                        ),
                ),
        ),
      ],
    );
  }
}

class _LifecycleLiveSourceRow extends StatefulWidget {
  const _LifecycleLiveSourceRow({
    super.key,
    required this.view,
    required this.row,
    required this.onUnavailable,
    required this.itemBuilder,
    this.retain,
    this.point,
  });
  final String view;
  final Map<String, dynamic> row;
  final VoidCallback onUnavailable;
  final bool Function(Map<String, dynamic>)? retain;
  final Map<String, double>? point;
  final Widget Function(BuildContext, Map<String, dynamic>) itemBuilder;
  @override
  State<_LifecycleLiveSourceRow> createState() =>
      _LifecycleLiveSourceRowState();
}

class _LifecycleLiveSourceRowState extends State<_LifecycleLiveSourceRow> {
  late Map<String, dynamic> _row;
  late String? _uid;
  bool _gone = false;
  Timer? _expiry;
  final _subscriptions = <StreamSubscription<dynamic>>[];
  @override
  void initState() {
    super.initState();
    _row = widget.row;
    _uid = FirebaseAuth.instance.currentUser?.uid;
    if (widget.view == 'profile' && feedDeltaRuntime != null) {
      // Share the existing small live-state subscription with the card; no
      // second full-body bootstrap for an active public-profile list.
      _subscriptions.add(
        feedDeltaRuntime!.live
            .watch(_row['id'] as String)
            .listen(
              (state) {
                if (!mounted ||
                    _uid != FirebaseAuth.instance.currentUser?.uid) {
                  return;
                }
                if (state.contentPurged || state.status != 'active') {
                  _unavailable();
                  return;
                }
                setState(
                  () => _row = {
                    ..._row,
                    'data': {
                      ...(_row['data'] as Map),
                      'likesCount': state.likes,
                      'dislikesCount': state.dislikes,
                      'commentsCount': state.comments,
                      'savesCount': state.saves,
                    },
                  },
                );
              },
              onError: (Object error) {
                if ([
                  'permission-denied',
                  'not-found',
                  'unauthenticated',
                ].contains(liveDataFailureCode(error))) {
                  _unavailable();
                }
                debugPrint(
                  'Source list subscription failed: code=${liveDataFailureCode(error)}',
                );
              },
            ),
      );
      _schedule();
      return;
    }
    final root = FirebaseFirestore.instance.doc('shouts/${_row['id']}');
    void listen(DocumentReference<Map<String, dynamic>> ref, bool comment) {
      _subscriptions.add(
        ref
            .liveSnapshots(includeMetadataChanges: true)
            .where(
              (doc) =>
                  !doc.metadata.isFromCache && !doc.metadata.hasPendingWrites,
            )
            .listen(
              (doc) {
                if (!mounted ||
                    _uid == null ||
                    FirebaseAuth.instance.currentUser?.uid != _uid) {
                  return;
                }
                final data = doc.data();
                final signal = data == null
                    ? null
                    : <String, dynamic>{
                        ...data,
                        for (final key in [
                          'createdAt',
                          'expiresAt',
                          'publicUntil',
                          'historyUntil',
                        ])
                          if (data[key] is Timestamp)
                            key:
                                (data[key] as Timestamp).millisecondsSinceEpoch,
                      };
                var next = mergeLifecycleSourceSignal(
                  _row,
                  signal,
                  view: widget.view,
                  viewer: _uid!,
                  nowMillis: DateTime.now().millisecondsSinceEpoch,
                  comment: comment,
                );
                if (!comment && next != null && widget.point != null) {
                  final location = data?['location'];
                  if (location is! GeoPoint) {
                    _unavailable();
                    return;
                  }
                  next = {
                    ...next,
                    'distanceKm':
                        Geolocator.distanceBetween(
                          widget.point!['latitude']!,
                          widget.point!['longitude']!,
                          location.latitude,
                          location.longitude,
                        ) /
                        1000,
                  };
                }
                if (next == null || !(widget.retain?.call(next) ?? true)) {
                  _unavailable();
                  return;
                }
                final confirmed = next;
                setState(() => _row = confirmed);
                _schedule();
              },
              onError: (Object error) {
                if ([
                  'permission-denied',
                  'not-found',
                  'unauthenticated',
                ].contains(liveDataFailureCode(error))) {
                  _unavailable();
                }
                debugPrint(
                  'Source list subscription failed: code=${liveDataFailureCode(error)}',
                );
              },
            ),
      );
    }

    listen(root, false);
    if (_row['comment'] case final Map comment) {
      listen(root.collection('comments').doc(comment['id'] as String), true);
    }
    _schedule();
  }

  void _unavailable() {
    if (!mounted || _gone) return;
    setState(() => _gone = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onUnavailable();
    });
  }

  void _schedule() {
    _expiry?.cancel();
    final body = _row['data'] as Map;
    final end =
        body[['profile', 'staff', 'home'].contains(widget.view)
                ? 'publicUntil'
                : 'historyUntil']
            as num;
    final wait = (end - DateTime.now().millisecondsSinceEpoch).ceil();
    _expiry = Timer(
      Duration(milliseconds: wait < 0 ? 0 : wait + 1),
      _unavailable,
    );
  }

  @override
  void dispose() {
    _expiry?.cancel();
    for (final sub in _subscriptions) {
      unawaited(sub.cancel());
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      _gone || _uid != FirebaseAuth.instance.currentUser?.uid
      ? const SizedBox.shrink()
      : widget.itemBuilder(context, _row);
}
