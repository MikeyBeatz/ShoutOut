import 'dart:async';

class FeedSessionExpired implements Exception {
  const FeedSessionExpired();
}

/// An ordered page from one immutable server view. A null cursor means end.
class FeedBatch<T> {
  FeedBatch({
    required List<T> items,
    required this.next,
    required this.baseline,
    this.newsCheckpoint,
  }) : items = List.unmodifiable(items);

  final List<T> items;
  final Object? next;
  final String baseline;
  final String? newsCheckpoint;
}

/// Backend-confirmed changes after a checkpoint, restricted to this context.
class FeedNewsDelta {
  FeedNewsDelta({
    required this.checkpoint,
    Set<String> available = const {},
    Set<String> withdrawn = const {},
  }) : available = Set.unmodifiable(available),
       withdrawn = Set.unmodifiable(withdrawn),
       count = null,
       baseline = null,
       validFor = null;

  FeedNewsDelta.confirmed({
    required this.checkpoint,
    required this.baseline,
    required int this.count,
    required Duration this.validFor,
  }) : assert(count >= 0 && count <= 100),
       assert(!validFor.isNegative),
       available = const {},
       withdrawn = const {};

  final String checkpoint;
  final Set<String> available;
  final Set<String> withdrawn;
  final int? count;
  final String? baseline;
  final Duration? validFor;
}

/// Coordinates the managed feed and one prefetched page. Refresh commits
/// atomically; an optional canonical comparator also orders movement merges.
class FeedSessionController<T, C extends Object> {
  FeedSessionController({
    required this.load,
    required this.idOf,
    this.loadNews,
    this.onNewsExpired,
    this.onChanged,
    this.compareFor,
    Duration Function()? elapsedClock,
  }) : _elapsed = elapsedClock ?? _monotonicClock();

  static Duration Function() _monotonicClock() {
    final clock = Stopwatch()..start();
    return () => clock.elapsed;
  }

  static const lifetime = Duration(hours: 1);
  final Duration Function() _elapsed;

  final Future<FeedBatch<T>> Function(C context, Object? cursor) load;
  final String Function(T item) idOf;
  final Future<FeedNewsDelta> Function(C context, String checkpoint)? loadNews;
  final void Function()? onNewsExpired;
  final void Function()? onChanged;
  // Selection keys must remain frozen between confirmed geographical changes.
  final Comparator<T>? Function(C context)? compareFor;

  C? _context;
  C? _refreshContext;
  List<T> _items = const [];
  final Map<String, T> _itemsById = {};
  Object? _next;
  String? _checkpoint;
  String? _baseline;
  T? _frontier;
  FeedBatch<T>? _prepared;
  final Set<String> _news = {};
  int? _confirmedNewsCount;
  Duration? _newsDeadline;
  bool _newsCurrent = true;
  Timer? _newsExpiryTimer;
  // A successful explicit deletion cannot reappear from a frozen/prefetched page.
  final Set<String> _removed = {};
  Future<void>? _refreshFlight;
  Future<void>? _prefetchFlight;
  Future<void>? _appendFlight;
  Future<void>? _newsFlight;
  int _generation = 0;
  bool _active = true;
  bool _disposed = false;
  bool _expired = false;
  Duration? _deadline;

  List<T> get items => List.unmodifiable(_items);
  C? get context => _context;
  bool get needsRefresh =>
      _expired || (_deadline != null && _elapsed() >= _deadline!);
  bool get hasMore => _context != null && _next != null && !needsRefresh;
  bool get isRefreshing => _refreshFlight != null;
  bool get hasPreparedPage => _prepared != null && !needsRefresh;
  int get newsCount => _confirmedNewsCount ?? _news.length;
  String get newsLabel => newsCount > 99 ? '99+' : '$newsCount';
  bool get newsIsCurrent =>
      _newsCurrent && (_newsDeadline == null || _elapsed() < _newsDeadline!);
  String? get checkpoint => _checkpoint;
  String? get baseline => _baseline;

  /// Retained cards may lie beyond the new cursor's confirmed prefix. Catch
  /// that cursor up to the viewport rather than waiting for the old list end.
  bool needsCoverageFor(String id) {
    if (_disposed || !_active || isRefreshing || !hasMore || _context == null) {
      return false;
    }
    final compare = compareFor?.call(_context!);
    if (compare == null) return false;
    final item = _itemsById[id];
    if (item == null) return false;
    return _frontier == null || compare(item, _frontier as T) > 0;
  }

  void _commitItems(List<T> items) {
    _items = items;
    _itemsById
      ..clear()
      ..addEntries(items.map((item) => MapEntry(idOf(item), item)));
  }

  List<T> _mergeItems(Iterable<T> values, C context) {
    final compare = compareFor?.call(context);
    if (compare == null) return _unique(values);
    final latest = <String, T>{};
    for (final item in values) {
      final id = idOf(item);
      if (!_removed.contains(id)) latest[id] = item;
    }
    return latest.values.toList()..sort(compare);
  }

  void _checkOrder(FeedBatch<T> batch, C context, {T? previous}) {
    final compare = compareFor?.call(context);
    if (compare == null) return;
    var last = previous;
    for (final item in batch.items) {
      if (last != null && compare(last, item) > 0) {
        throw StateError('Unordered server feed page');
      }
      last = item;
    }
  }

  void setActive(bool active) => _active = active;

  /// Cancel in-flight work when leaving the feed, preserving committed cards,
  /// scroll context and an already prepared page. Late responses cannot commit.
  void cancelPending() {
    ++_generation;
    _refreshFlight = null;
    _refreshContext = null;
    _prefetchFlight = null;
    _appendFlight = null;
    _newsFlight = null;
  }

  List<T> _unique(Iterable<T> values) {
    final ids = <String>{};
    return values
        .where(
          (value) => !_removed.contains(idOf(value)) && ids.add(idOf(value)),
        )
        .toList();
  }

  void removeConfirmed(String id) {
    if (_disposed || !_removed.add(id)) return;
    _items = _items.where((item) => idOf(item) != id).toList();
    _itemsById.remove(id);
    _news.remove(id);
    if (_confirmedNewsCount != null) _newsCurrent = false;
    onChanged?.call();
  }

  void invalidateNews() {
    if (_disposed || !_newsCurrent) return;
    _newsCurrent = false;
    onChanged?.call();
  }

  Future<void> refresh(C requested) {
    if (_disposed) return Future.value();
    if (_refreshFlight != null && _refreshContext == requested) {
      return _refreshFlight!;
    }
    final generation = ++_generation;
    final deadline = _elapsed() + lifetime;
    _refreshContext = requested;
    _prefetchFlight = null;
    _appendFlight = null;
    _newsFlight = null;
    late final Future<void> flight;
    flight = Future.sync(() => load(requested, null))
        .then((batch) {
          if (_disposed || generation != _generation) return;
          if (_elapsed() >= deadline) throw const FeedSessionExpired();
          if (batch.baseline.isEmpty) throw StateError('Missing feed baseline');
          _checkOrder(batch, requested);
          _context = requested;
          _commitItems(_mergeItems(batch.items, requested));
          _frontier = batch.items.isEmpty ? null : batch.items.last;
          _next = batch.next;
          _checkpoint = batch.newsCheckpoint ?? batch.baseline;
          _baseline = batch.baseline;
          _prepared = null;
          _deadline = deadline;
          _expired = false;
          _news.clear();
          _confirmedNewsCount = null;
          _newsDeadline = null;
          _newsExpiryTimer?.cancel();
          _newsCurrent = true;
          onChanged?.call();
        })
        .whenComplete(() {
          if (identical(_refreshFlight, flight)) {
            _refreshFlight = null;
            _refreshContext = null;
          }
        });
    _refreshFlight = flight;
    invalidateNews();
    return flight;
  }

  /// Local movement path; the host must authorize/pace location changes.
  /// Re-rank the retained/current union when a comparator is configured. Its
  /// next cursor still belongs to the canonical server stream at the new point.
  Future<void> recenter(
    C requested, {
    required Future<FeedBatch<T>> Function(C context) loadMoved,
    required bool Function(T item, C context) retain,
    required bool Function(T item) isRead,
    required T Function(T item, C context) relocate,
  }) {
    if (_disposed || !_active || _context == null || isRefreshing) {
      return Future.value();
    }
    if (needsRefresh) return Future.error(const FeedSessionExpired());
    final generation = ++_generation;
    _refreshContext = requested;
    _prefetchFlight = null;
    _appendFlight = null;
    _newsFlight = null;
    late final Future<void> flight;
    flight = Future.sync(() => loadMoved(requested))
        .then((batch) {
          if (_disposed || generation != _generation) return;
          if (needsRefresh) throw const FeedSessionExpired();
          if (batch.baseline.isEmpty || batch.newsCheckpoint == null) {
            throw StateError('Unconfirmed feed movement');
          }
          _checkOrder(batch, requested);
          final fresh = {for (final item in batch.items) idOf(item): item};
          final remaining = _items
              .where((item) => retain(item, requested))
              .map((item) => fresh[idOf(item)] ?? relocate(item, requested));
          final combined = _unique([...remaining, ...batch.items]);
          final committed = compareFor?.call(requested) != null
              ? _mergeItems(combined, requested)
              : [
                  ...combined.where((item) => !isRead(item)),
                  ...combined.where(isRead),
                ];
          _context = requested;
          _commitItems(committed);
          _frontier = batch.items.isEmpty ? null : batch.items.last;
          _next = batch.next;
          _baseline = batch.baseline;
          _checkpoint = batch.newsCheckpoint;
          _prepared = null;
          // Counts from the old area are retained as unverified until checked
          // against the new area; the original publication boundary survives.
          _newsCurrent = false;
          _newsDeadline = null;
          _newsExpiryTimer?.cancel();
          onChanged?.call();
        })
        .catchError((Object error) {
          _handleExpiry(error, generation);
          throw error;
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
    if (_disposed || !_active || isRefreshing) return Future.value();
    if (needsRefresh) {
      return Future.error(const FeedSessionExpired());
    }
    if (!hasMore || _prepared != null) {
      return Future.value();
    }
    if (_prefetchFlight != null) return _prefetchFlight!;
    final generation = _generation;
    final cursor = _next;
    late final Future<void> flight;
    flight = Future.sync(() => load(_context!, cursor))
        .then((batch) {
          if (_disposed || generation != _generation) return;
          if (needsRefresh) throw const FeedSessionExpired();
          if (batch.baseline != _baseline) {
            throw StateError('Feed page belongs to another snapshot');
          }
          if (batch.next != null && batch.next == cursor) {
            throw StateError('Feed cursor did not advance');
          }
          _checkOrder(batch, _context!, previous: _frontier);
          _prepared = batch;
        })
        .catchError((Object error) {
          _handleExpiry(error, generation);
          throw error;
        })
        .whenComplete(() {
          if (identical(_prefetchFlight, flight)) _prefetchFlight = null;
        });
    _prefetchFlight = flight;
    return flight;
  }

  Future<void> loadMore() {
    if (_disposed || !_active || isRefreshing) return Future.value();
    if (needsRefresh) {
      return Future.error(const FeedSessionExpired());
    }
    if (!hasMore) {
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
          if (needsRefresh) throw const FeedSessionExpired();
          final batch = _prepared!;
          _commitItems(_mergeItems([..._items, ...batch.items], _context!));
          if (batch.items.isNotEmpty) _frontier = batch.items.last;
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
    if (_disposed || !_active || isRefreshing) return Future.value();
    if (needsRefresh) {
      return Future.error(const FeedSessionExpired());
    }
    if (_context == null || loadNews == null || _checkpoint == null) {
      return Future.value();
    }
    if (_newsFlight != null) return _newsFlight!;
    final generation = _generation;
    final requestedAt = _elapsed();
    _newsCurrent = false;
    onChanged?.call();
    late final Future<void> flight;
    flight = Future.sync(() => loadNews!(_context!, _checkpoint!))
        .then((delta) {
          if (_disposed || generation != _generation) return;
          if (needsRefresh) throw const FeedSessionExpired();
          if (delta.checkpoint.isEmpty) {
            throw StateError('Missing news checkpoint');
          }
          if (delta.baseline != null && delta.baseline != _baseline) {
            throw StateError('News belongs to another feed baseline');
          }
          if (delta.count case final count?) {
            _confirmedNewsCount = count;
            _news.clear();
          } else {
            _news.addAll(delta.available);
            _news.removeAll(delta.withdrawn);
          }
          _newsDeadline = delta.validFor == null
              ? null
              : requestedAt + delta.validFor!;
          _newsCurrent = true;
          _checkpoint = delta.checkpoint;
          _newsExpiryTimer?.cancel();
          if (newsCount > 0 && _newsDeadline != null) {
            final remaining = _newsDeadline! - _elapsed();
            final confirmedCheckpoint = _checkpoint;
            final confirmedBaseline = _baseline;
            _newsExpiryTimer = Timer(
              remaining.isNegative ? Duration.zero : remaining,
              () {
                if (_disposed ||
                    _checkpoint != confirmedCheckpoint ||
                    _baseline != confirmedBaseline) {
                  return;
                }
                _newsCurrent = false;
                onChanged?.call();
                if (_active) onNewsExpired?.call();
              },
            );
          }
          onChanged?.call();
        })
        .catchError((Object error) {
          _handleExpiry(error, generation);
          throw error;
        })
        .whenComplete(() {
          if (identical(_newsFlight, flight)) _newsFlight = null;
        });
    _newsFlight = flight;
    return flight;
  }

  void _handleExpiry(Object error, int generation) {
    if (error is FeedSessionExpired &&
        !_disposed &&
        generation == _generation) {
      _expired = true;
      _prepared = null;
      onChanged?.call();
    }
  }

  void dispose() {
    _disposed = true;
    _newsExpiryTimer?.cancel();
    ++_generation;
    _items = const [];
    _itemsById.clear();
    _context = null;
    _next = null;
    _prepared = null;
    _checkpoint = null;
    _frontier = null;
    _baseline = null;
    _deadline = null;
    _expired = false;
    _news.clear();
    _confirmedNewsCount = null;
    _newsDeadline = null;
    _newsCurrent = true;
    _removed.clear();
  }
}
