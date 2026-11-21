import 'feed_body_cache.dart';

/// Existing gateway adapter: V2 transport is assembled into its V1 page model.
/// Cache and state belong to one project/viewer; no persistent body storage.
class FeedDeltaClient {
  FeedDeltaClient({
    required this.project,
    required this.currentUserId,
    required this.send,
    required this.cache,
    this.onContext,
    this.onBaseline,
    this.currentState,
  });
  final String project;
  final String? Function() currentUserId;
  final Future<Object?> Function(Map<String, Object?>) send;
  final FeedBodyCache cache;
  final void Function(Map<String, dynamic>)? onContext;
  final void Function(String, Map<String, dynamic>, String)? onBaseline;
  final Map<String, dynamic>? Function(String, String)? currentState;
  int _epoch = 0;
  String? _viewer;
  final _erased = <String>{};

  void retainViewer(String? uid) {
    if (uid == _viewer) return;
    _viewer = uid;
    _epoch++;
    cache.bind(
      uid == null || _erased.contains(uid) ? null : FeedBodyScope(project, uid),
    );
  }

  void eraseAccount(String uid) {
    _erased.add(uid);
    if (_viewer == uid) {
      _epoch++;
      cache.bind(null);
    }
  }

  Future<Map<String, dynamic>> load(Map<String, Object?> payload) async {
    final uid = currentUserId();
    retainViewer(uid);
    if (uid == null || _erased.contains(uid)) {
      throw StateError('No delta viewer');
    }
    final epoch = _epoch, scope = FeedBodyScope(project, uid);
    void guard() {
      if (currentUserId() != uid ||
          _viewer != uid ||
          _erased.contains(uid) ||
          epoch != _epoch) {
        throw StateError('Stale delta viewer');
      }
    }

    final response = await send({
      ...payload,
      'format': 'delta-v1',
      'expectedUserId': uid,
      'cold': cache.isEmpty,
    });
    guard();
    if (response is! Map) throw const FormatException('Invalid delta reply');
    final wire = Map<String, dynamic>.from(response);
    if (wire['version'] != 2 ||
        !['preparing', 'ready'].contains(wire['state'])) {
      throw const FormatException('Invalid delta protocol');
    }
    if (wire['state'] == 'preparing') return {...wire, 'version': 1};
    final page = await _assemble(wire, scope, guard);
    return {
      ...wire,
      'version': 1,
      'items': [
        for (final card in page)
          {
            'id': card.descriptor.id,
            'distanceKm': card.descriptor.distanceKm,
            'read': card.descriptor.read,
            'data': {...card.payload.body, ...card.descriptor.stateData},
          },
      ],
    };
  }

  Future<List<FeedBodyCard>> presentation(
    List<Map<String, String>> routes,
    Map<String, double> point,
  ) async {
    final uid = currentUserId();
    retainViewer(uid);
    if (uid == null || _erased.contains(uid)) {
      throw StateError('No delta viewer');
    }
    final epoch = _epoch, scope = FeedBodyScope(project, uid);
    void guard() {
      if (currentUserId() != uid ||
          _viewer != uid ||
          _erased.contains(uid) ||
          _epoch != epoch) {
        throw StateError('Stale promo reply');
      }
    }

    final response = await send({
      'format': 'delta-v1',
      'expectedUserId': uid,
      'mode': 'presentation',
      'routes': routes,
      'point': point,
      'cold': cache.isEmpty,
    });
    guard();
    if (response is! Map ||
        response['version'] != 2 ||
        response['state'] != 'ready') {
      throw const FormatException('Invalid promo reply');
    }
    return _assemble(Map<String, dynamic>.from(response), scope, guard);
  }

  Future<List<FeedBodyCard>> _assemble(
    Map<String, dynamic> wire,
    FeedBodyScope scope,
    void Function() guard,
  ) async {
    if (wire['bodyPage'] is! Map) {
      throw const FormatException('Missing body manifest');
    }
    var page = FeedBodyPage.fromWire(
      Map<String, dynamic>.from(wire['bodyPage'] as Map),
    );
    if (page.scope != scope) throw const FormatException('Foreign manifest');
    final stamp = '${page.generation}:${page.incarnation}';
    final raw = Map<String, dynamic>.from(wire['bodyPage'] as Map);
    if (raw['live'] is! Map) {
      throw const FormatException('Missing live context');
    }
    onContext?.call(Map<String, dynamic>.from(raw['live'] as Map));
    Map<String, dynamic>? fullState(FeedBodyDescriptor row) {
      final state = row.stateData;
      if (_completeState(state)) return {...state, '_generation': stamp};
      final previous = cache.state(scope, row.id, row.version);
      if (previous != null &&
          _completeState(previous) &&
          previous['_generation'] == stamp &&
          [
            'authorId',
            'status',
            'expiresAt',
            'selectionVersion',
          ].every((key) => previous[key] == state[key])) {
        return previous;
      }
      cache.evict(row.id);
      return null;
    }

    final confirmed = <String, Map<String, dynamic>>{};
    for (final row in page.rows) {
      final state = fullState(row);
      if (state != null) confirmed[row.id] = state;
    }
    final assembler = FeedBodyPageAssembler(cache);
    final cards = await assembler.assemble(
      page,
      complete: (token, missing) async {
        guard();
        final response = await send({
          'format': 'delta-v1',
          'expectedUserId': scope.uid,
          'mode': 'complete',
          'token': token,
          'missing': missing,
        });
        guard();
        if (response is! Map ||
            response['version'] != 2 ||
            response['bodyPage'] is! Map) {
          throw const FormatException('Invalid delta completion');
        }
        final completed = FeedBodyPage.fromWire(
          Map<String, dynamic>.from(response['bodyPage'] as Map),
        );
        for (final row in completed.rows) {
          if (_completeState(row.stateData)) {
            confirmed[row.id] = {...row.stateData, '_generation': stamp};
          }
        }
        return completed;
      },
    );
    guard();
    final result = <FeedBodyCard>[];
    for (final card in cards) {
      var state = confirmed[card.descriptor.id];
      if (state == null) {
        throw const FormatException('Missing confirmed counters');
      }
      final latest = currentState?.call(card.descriptor.id, stamp);
      if (latest?['status'] == 'deleted') {
        throw StateError('Feed removed during assembly');
      }
      if (latest != null &&
          _completeState(latest) &&
          (latest['revision'] as int) > (state['revision'] as int)) {
        if (latest['bodyVersion'] != card.descriptor.version ||
            latest['status'] != 'active') {
          throw StateError('Feed changed during assembly');
        }
        state = {...latest, '_generation': stamp};
      }
      final row = card.descriptor;
      cache.put(scope, card.payload, page.deadline, state: state);
      onBaseline?.call(row.id, state, stamp);
      result.add(
        FeedBodyCard(
          FeedBodyDescriptor(
            id: row.id,
            version: row.version,
            read: row.read,
            distanceKm: row.distanceKm,
            selectionVersion: row.selectionVersion,
            frozenContentHash: row.frozenContentHash,
            state: state,
          ),
          card.payload,
        ),
      );
    }
    return List.unmodifiable(result);
  }

  bool _completeState(Map<String, dynamic> state) =>
      state['revision'] is int &&
      (state['revision'] as int) >= 0 &&
      [
        'likesCount',
        'dislikesCount',
        'commentsCount',
        'savesCount',
      ].every((key) => state[key] is int && (state[key] as int) >= 0);
}
