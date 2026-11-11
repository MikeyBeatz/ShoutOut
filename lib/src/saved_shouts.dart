part of '../main.dart';

typedef SavedShoutCardBuilder =
    Widget Function(Shout shout, VoidCallback onUnavailable);

class SavedShoutsLibrary extends StatefulWidget {
  const SavedShoutsLibrary({
    super.key,
    required this.onSave,
    required this.onReaction,
    this.position,
    this.blockedUserIds = const {},
    this.gateway,
    this.cardBuilder,
  });
  final ValueChanged<Shout> onSave;
  final Future<void> Function(Shout shout, {required bool like}) onReaction;
  final Position? position;
  final Set<String> blockedUserIds;
  final SavedShoutsGateway<Shout>? gateway;
  final SavedShoutCardBuilder? cardBuilder;

  @override
  State<SavedShoutsLibrary> createState() => _SavedShoutsLibraryState();
}

class _SavedShoutsLibraryState extends State<SavedShoutsLibrary> {
  late SavedShoutsGateway<Shout> _gateway;
  String? _uid;
  final _items = <Shout>[], _heights = <String, double>{};
  final _scroll = ScrollController();
  String? _next;
  bool _loading = false, _failed = false, _retryRefresh = true;
  int _request = 0, _generation = 0;
  final _removed = <String>{};
  Map<String, double>? _retryPoint;
  bool get _current => _gateway.currentUserId() == _uid && _uid != null;

  @override
  void initState() {
    super.initState();
    _connect();
    unawaited(_load(refresh: true));
  }

  void _connect() {
    _gateway =
        widget.gateway ??
        SavedShoutsGateway(
          currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
          decodeItem: (item) => decodeSpatialFeedItem(item)..isSaved = true,
          send: (payload) async =>
              (await FirebaseFunctions.instanceFor(region: 'europe-west3')
                      .httpsCallable('getSavedShouts')
                      .call<Map<String, dynamic>>(payload))
                  .data,
        );
    _uid = _gateway.currentUserId();
  }

  @override
  void didUpdateWidget(covariant SavedShoutsLibrary oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.gateway == widget.gateway) {
      return;
    }
    _request++;
    _generation++;
    _removed.clear();
    _gateway.dispose();
    _connect();
    _items.clear();
    _heights.clear();
    _next = null;
    _loading = false;
    _failed = false;
    unawaited(_load(refresh: true));
  }

  Future<void> _load({bool refresh = false, bool retry = false}) async {
    if (_loading || !_current) return;
    final ticket = ++_request;
    final removedBefore = Set<String>.of(_removed);
    if (!retry) {
      final position = widget.position;
      _retryPoint = position == null
          ? null
          : {'latitude': position.latitude, 'longitude': position.longitude};
    }
    setState(() {
      _loading = true;
      _failed = false;
      _retryRefresh = refresh;
    });
    try {
      final page = await _gateway.load(
        after: refresh ? null : _next,
        point: _retryPoint,
      );
      if (!mounted || !_current || ticket != _request) return;
      setState(() {
        if (refresh) {
          _generation++;
          _removed.removeAll(removedBefore);
          _items.clear();
          _heights.clear();
        }
        final ids = _items.map((item) => item.id).toSet();
        _items.addAll(
          page.items.where(
            (item) => !_removed.contains(item.id) && ids.add(item.id),
          ),
        );
        _next = page.next;
      });
      if (refresh) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && _current && ticket == _request && _scroll.hasClients) {
            _scroll.jumpTo(0);
          }
        });
      }
    } catch (_) {
      if (mounted && _current && ticket == _request) {
        setState(() => _failed = true);
      }
    } finally {
      if (mounted && _current && ticket == _request) {
        setState(() => _loading = false);
      }
    }
  }

  void _remove(String id, int generation) {
    if (!mounted || !_current || generation != _generation) return;
    _removed.add(id);
    if (!_items.any((item) => item.id == id)) return;
    setState(() {
      _items.removeWhere((item) => item.id == id);
      _heights.remove(id);
    });
  }

  @override
  void dispose() {
    _gateway.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_current) return const SizedBox.shrink();
    return Column(
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: IconButton(
            key: const ValueKey('saved-shouts-refresh'),
            tooltip: MaterialLocalizations.of(
              context,
            ).refreshIndicatorSemanticLabel,
            onPressed: _loading ? null : () => unawaited(_load(refresh: true)),
            icon: const Icon(Icons.refresh),
          ),
        ),
        if (_loading) const LinearProgressIndicator(),
        if (_failed)
          TextButton(
            key: const ValueKey('saved-shouts-retry'),
            onPressed: _loading
                ? null
                : () => unawaited(_load(refresh: _retryRefresh, retry: true)),
            child: Text(
              tr(context, 'Feed se nepodařilo načíst. Zkus to znovu.'),
            ),
          ),
        Expanded(
          key: const ValueKey('saved-shouts-content'),
          child: _loading && _items.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : _items.isEmpty && _failed
              ? const SizedBox.shrink()
              : _items.isEmpty && _next == null
              ? EmptyState(
                  icon: Icons.bookmark_border,
                  title: tr(context, 'Zatím nemáš uložené žádné shouty.'),
                )
              : ListView.separated(
                  controller: _scroll,
                  key: const ValueKey('saved-shouts-list'),
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: _items.length + (_next == null ? 0 : 1),
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (_, index) {
                    if (index == _items.length) {
                      return Center(
                        child: FilledButton.tonalIcon(
                          key: const ValueKey('saved-shouts-more'),
                          onPressed: _loading ? null : () => unawaited(_load()),
                          icon: const Icon(Icons.expand_more),
                          label: Text(tr(context, 'Načíst další')),
                        ),
                      );
                    }
                    final shout = _items[index], generation = _generation;
                    return KeyedSubtree(
                      key: ValueKey('saved-$generation-${shout.id}'),
                      child:
                          widget.cardBuilder?.call(
                            shout,
                            () => _remove(shout.id, generation),
                          ) ??
                          _SpatialShoutCard(
                            key: ValueKey('saved-$generation-${shout.id}'),
                            shout: shout,
                            blocked: widget.blockedUserIds.contains(
                              shout.authorId,
                            ),
                            requireSaved: true,
                            onUnavailable: () => _remove(shout.id, generation),
                            onSave: () => widget.onSave(shout),
                            onReaction: (like) =>
                                widget.onReaction(shout, like: like),
                            heightOf: () => _heights[shout.id],
                            recordHeight: (height) =>
                                _heights[shout.id] = height,
                          ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
