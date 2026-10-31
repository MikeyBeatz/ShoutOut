import 'dart:async';

/// An ordered page from one immutable server view. A null cursor means end.
class FeedBatch<T> {
  FeedBatch({
    required List<T> items,
    required this.next,
    required this.baseline,
  }) : items = List.unmodifiable(items);

  final List<T> items;
  final Object? next;
  final String baseline;
}

/// Backend-confirmed changes after a checkpoint, restricted to this context.
class FeedNewsDelta {
  FeedNewsDelta({
    required this.checkpoint,
    Set<String> available = const {},
    Set<String> withdrawn = const {},
  }) : available = Set.unmodifiable(available),
       withdrawn = Set.unmodifiable(withdrawn);

  final String checkpoint;
  final Set<String> available;
  final Set<String> withdrawn;
}

/// Transport-independent coordination; not yet wired to the legacy Home feed.
/// Keeps one prefetched page, freezes order and commits refresh atomically.
class FeedSessionController<T, C extends Object> {
  FeedSessionController({
    required this.load,
    required this.idOf,
    this.loadNews,
    this.onChanged,
  });

  final Future<FeedBatch<T>> Function(C context, Object? cursor) load;
  final String Function(T item) idOf;
  final Future<FeedNewsDelta> Function(C context, String checkpoint)? loadNews;
  final void Function()? onChanged;

  C? _context;
  C? _refreshContext;
  List<T> _items = const [];
  Object? _next;
  String? _checkpoint;
  String? _baseline;
  FeedBatch<T>? _prepared;
  final Set<String> _news = {};
  Future<void>? _refreshFlight;
  Future<void>? _prefetchFlight;
  Future<void>? _appendFlight;
  Future<void>? _newsFlight;
  int _generation = 0;
  bool _active = true;
  bool _disposed = false;

  List<T> get items => List.unmodifiable(_items);
  C? get context => _context;
  bool get hasMore => _context != null && _next != null;
  bool get isRefreshing => _refreshFlight != null;
  bool get hasPreparedPage => _prepared != null;
  int get newsCount => _news.length;
  String get newsLabel => newsCount > 99 ? '99+' : '$newsCount';
  String? get checkpoint => _checkpoint;

  void setActive(bool active) => _active = active;

  List<T> _unique(Iterable<T> values) {
    final ids = <String>{};
    return values.where((value) => ids.add(idOf(value))).toList();
  }

  Future<void> refresh(C requested) {
    if (_disposed) return Future.value();
    if (_refreshFlight != null && _refreshContext == requested) {
      return _refreshFlight!;
    }
    final generation = ++_generation;
    _refreshContext = requested;
    _prefetchFlight = null;
    _appendFlight = null;
    _newsFlight = null;
    late final Future<void> flight;
    flight = Future.sync(() => load(requested, null))
        .then((batch) {
          if (_disposed || generation != _generation) return;
          if (batch.baseline.isEmpty) throw StateError('Missing feed baseline');
          _context = requested;
          _items = _unique(batch.items);
          _next = batch.next;
          _checkpoint = batch.baseline;
          _baseline = batch.baseline;
          _prepared = null;
          _news.clear();
          onChanged?.call();
        })
        .whenComplete(() {
          if (identical(_refreshFlight, flight)) {
            _refreshFlight = null;
            _refreshContext = null;
          }
        });
    _refreshFlight = flight;
    return flight;
  }

  Future<void> prefetch() {
    if (_disposed ||
        !_active ||
        isRefreshing ||
        !hasMore ||
        _prepared != null) {
      return Future.value();
    }
    if (_prefetchFlight != null) return _prefetchFlight!;
    final generation = _generation;
    final cursor = _next;
    late final Future<void> flight;
    flight = Future.sync(() => load(_context!, cursor))
        .then((batch) {
          if (_disposed || generation != _generation) return;
          if (batch.baseline != _baseline) {
            throw StateError('Feed page belongs to another snapshot');
          }
          if (batch.next != null && batch.next == cursor) {
            throw StateError('Feed cursor did not advance');
          }
          _prepared = batch;
        })
        .whenComplete(() {
          if (identical(_prefetchFlight, flight)) _prefetchFlight = null;
        });
    _prefetchFlight = flight;
    return flight;
  }

  Future<void> loadMore() {
    if (_disposed || !_active || isRefreshing || !hasMore) {
      return Future.value();
    }
    if (_appendFlight != null) return _appendFlight!;
    final generation = _generation;
    late final Future<void> flight;
    flight = prefetch()
        .then((_) {
          if (_disposed || generation != _generation || _prepared == null) {
            return;
          }
          final batch = _prepared!;
          _items = _unique([..._items, ...batch.items]);
          _next = batch.next;
          _prepared = null;
          onChanged?.call();
        })
        .whenComplete(() {
          if (identical(_appendFlight, flight)) _appendFlight = null;
        });
    _appendFlight = flight;
    return flight;
  }

  /// Caller supplies lifecycle/timing. No unapproved polling interval is set.
  Future<void> checkNews() {
    if (_disposed ||
        !_active ||
        isRefreshing ||
        _context == null ||
        loadNews == null ||
        _checkpoint == null) {
      return Future.value();
    }
    if (_newsFlight != null) return _newsFlight!;
    final generation = _generation;
    late final Future<void> flight;
    flight = Future.sync(() => loadNews!(_context!, _checkpoint!))
        .then((delta) {
          if (_disposed || generation != _generation) return;
          if (delta.checkpoint.isEmpty) {
            throw StateError('Missing news checkpoint');
          }
          _news.addAll(delta.available);
          _news.removeAll(delta.withdrawn);
          _checkpoint = delta.checkpoint;
          onChanged?.call();
        })
        .whenComplete(() {
          if (identical(_newsFlight, flight)) _newsFlight = null;
        });
    _newsFlight = flight;
    return flight;
  }

  void dispose() {
    _disposed = true;
    ++_generation;
    _items = const [];
    _context = null;
    _next = null;
    _prepared = null;
    _checkpoint = null;
    _baseline = null;
    _news.clear();
  }
}
