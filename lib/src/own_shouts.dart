part of '../main.dart';

typedef OwnShoutCardBuilder =
    Widget Function(
      Shout shout,
      Future<void> Function() onDelete,
      VoidCallback onUnavailable,
    );

class OwnShoutsLibrary extends StatefulWidget {
  const OwnShoutsLibrary({
    super.key,
    required this.section,
    required this.onSave,
    required this.onReaction,
    required this.onDelete,
    this.position,
    this.gateway,
    this.cardBuilder,
  });
  final OwnShoutsSection section;
  final ValueChanged<Shout> onSave;
  final Future<void> Function(Shout shout, {required bool like}) onReaction;
  final Future<void> Function(Shout shout) onDelete;
  final Position? position;
  final OwnShoutsGateway<Shout>? gateway;
  final OwnShoutCardBuilder? cardBuilder;

  @override
  State<OwnShoutsLibrary> createState() => _OwnShoutsLibraryState();
}

class _OwnShoutsLibraryState extends State<OwnShoutsLibrary> {
  late OwnShoutsGateway<Shout> _gateway;
  String? _uid;
  final _items = <Shout>[], _heights = <String, double>{};
  final _scroll = ScrollController();
  Map<String, dynamic>? _next;
  bool _loading = false, _failed = false, _retryRefresh = true;
  int _request = 0;
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
        OwnShoutsGateway(
          currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
          decodeItem: decodeSpatialFeedItem,
          send: (payload) async =>
              (await FirebaseFunctions.instanceFor(region: 'europe-west3')
                      .httpsCallable('getOwnShouts')
                      .call<Map<String, dynamic>>(payload))
                  .data,
        );
    _uid = _gateway.currentUserId();
  }

  @override
  void didUpdateWidget(covariant OwnShoutsLibrary oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.section == widget.section &&
        oldWidget.gateway == widget.gateway) {
      return;
    }
    _request++;
    if (oldWidget.gateway != widget.gateway) {
      _gateway.dispose();
      _connect();
    }
    _items.clear();
    _heights.clear();
    _next = null;
    _loading = false;
    _failed = false;
    unawaited(_load(refresh: true));
  }

  Future<void> _load({bool refresh = false}) async {
    if (_loading || !_current) return;
    final ticket = ++_request, section = widget.section;
    setState(() {
      _loading = true;
      _failed = false;
      _retryRefresh = refresh;
    });
    try {
      final position = widget.position;
      final page = await _gateway.load(
        section,
        after: refresh ? null : _next,
        point: position == null
            ? null
            : {'latitude': position.latitude, 'longitude': position.longitude},
      );
      if (!mounted || !_current || ticket != _request) return;
      setState(() {
        if (refresh) {
          _items.clear();
          _heights.clear();
        }
        final ids = _items.map((item) => item.id).toSet();
        _items.addAll(page.items.where((item) => ids.add(item.id)));
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
      if (mounted && ticket == _request) setState(() => _loading = false);
    }
  }

  void _remove(String id) {
    if (!mounted || !_current) return;
    setState(() {
      _items.removeWhere((item) => item.id == id);
      _heights.remove(id);
    });
  }

  Future<void> _delete(Shout shout) async {
    final uid = _uid;
    try {
      await widget.onDelete(shout);
      if (_uid == uid && _current) _remove(shout.id);
    } catch (error) {
      if (mounted && _current && _uid == uid) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_serverWriteFailureText(context, error))),
        );
      }
    }
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
            key: const ValueKey('own-shouts-refresh'),
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
            key: const ValueKey('own-shouts-retry'),
            onPressed: _loading
                ? null
                : () => unawaited(_load(refresh: _retryRefresh)),
            child: Text(
              tr(context, 'Feed se nepodařilo načíst. Zkus to znovu.'),
            ),
          ),
        Expanded(
          key: const ValueKey('own-shouts-content'),
          child: _loading && _items.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : _items.isEmpty && (_next != null || _failed)
              ? const SizedBox.shrink()
              : _items.isEmpty
              ? EmptyState(
                  icon: Icons.campaign_outlined,
                  title: tr(context, 'V této části zatím nemáš žádné shouty.'),
                )
              : ListView.separated(
                  controller: _scroll,
                  key: const ValueKey('own-shouts-list'),
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: _items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (_, index) {
                    final shout = _items[index];
                    return KeyedSubtree(
                      key: ValueKey(shout.id),
                      child:
                          widget.cardBuilder?.call(
                            shout,
                            () => _delete(shout),
                            () => _remove(shout.id),
                          ) ??
                          _SpatialShoutCard(
                            key: ValueKey(shout.id),
                            shout: shout,
                            blocked: false,
                            ownSection: widget.section,
                            onUnavailable: () => _remove(shout.id),
                            onDelete: () => _delete(shout),
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
        if (_next != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.tonalIcon(
                key: const ValueKey('own-shouts-more'),
                onPressed: _loading ? null : () => unawaited(_load()),
                icon: const Icon(Icons.expand_more),
                label: Text(tr(context, 'Načíst další')),
              ),
            ),
          ),
      ],
    );
  }
}
