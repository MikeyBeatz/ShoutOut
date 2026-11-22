import 'feed_session.dart';
import 'feed_body_cache.dart';
import 'feed_news_runtime.dart';

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
  int _capabilityRevision = -1;
  String? _capabilityStamp;
  bool _legacy = false;
  final _erased = <String>{};
  final _newsBaselines = <String, FeedNewsSignals>{};
  final _movementProofs = <String, String>{};
  // RAM only, scoped like body cache. No Home/GPS caller enables movement yet.
  String? movementProofFor(String? baseline) {
    final uid = currentUserId();
    if (uid == null || uid != _viewer || _erased.contains(uid)) return null;
    return _movementProofs[baseline];
  }

  int lastNewsReadUnits = 0;
  FeedNewsSignals? newsSignalsFor(String? baseline) {
    final uid = currentUserId();
    if (uid == null || uid != _viewer || _erased.contains(uid)) return null;
    return _newsBaselines[baseline];
  }

  void retainViewer(String? uid) {
    if (uid == _viewer) return;
    _viewer = uid;
    _newsBaselines.clear();
    _movementProofs.clear();
    _capabilityRevision = -1;
    _capabilityStamp = null;
    _legacy = false;
    _epoch++;
    cache.bind(
      uid == null || _erased.contains(uid) ? null : FeedBodyScope(project, uid),
    );
  }

  void eraseAccount(String uid) {
    _erased.add(uid);
    _newsBaselines.clear();
    _movementProofs.clear();
    if (_viewer == uid) {
      _epoch++;
      cache.bind(null);
    }
  }

  void _acceptCapability(Map<String, dynamic> capability, FeedBodyScope scope) {
    final revision = capability['revision'] ?? 0;
    final mode = capability['mode'] ?? 'card-v1';
    if (capability['project'] != scope.project ||
        capability['uid'] != scope.uid ||
        capability['generation'] is! String ||
        capability['incarnation'] is! String ||
        !['card-v1', 'source-v1'].contains(mode) ||
        revision is! int ||
        revision < 0) {
      throw const FormatException('Invalid feed capability');
    }
    final stamp =
        '${capability['generation']}:${capability['incarnation']}:$mode';
    if (revision < _capabilityRevision ||
        revision == _capabilityRevision &&
            _capabilityStamp != null &&
            stamp != _capabilityStamp) {
      throw const FeedSessionExpired();
    }
    if (_capabilityStamp != stamp) {
      cache.clear();
      _movementProofs.clear();
    }
    _capabilityRevision = revision;
    _capabilityStamp = stamp;
    _legacy = mode == 'source-v1';
    onContext?.call(capability);
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
    if (wire['state'] == 'reset' && wire['capability'] is Map) {
      _acceptCapability(
        Map<String, dynamic>.from(wire['capability'] as Map),
        scope,
      );
      throw const FeedSessionExpired();
    }
    if (wire['version'] == 1 &&
        wire['capability'] is Map &&
        (wire['capability'] as Map)['mode'] == 'source-v1' &&
        ['preparing', 'ready'].contains(wire['state'])) {
      _acceptCapability(
        Map<String, dynamic>.from(wire['capability'] as Map),
        scope,
      );
      return wire;
    }
    if (wire['version'] != 2 ||
        !['preparing', 'ready'].contains(wire['state'])) {
      throw const FormatException('Invalid delta protocol');
    }
    if (wire['state'] == 'preparing') return {...wire, 'version': 1};
    final page = await _assemble(wire, scope, guard);
    final body = wire['bodyPage'];
    if (body is Map &&
        body['movementToken'] is String &&
        wire['baseline'] is String) {
      final proof = body['movementToken'] as String;
      if (proof.isEmpty || proof.length > 262144) {
        throw const FormatException('Invalid feed movement proof');
      }
      _movementProofs[wire['baseline'] as String] = proof;
      while (_movementProofs.length > 2) {
        _movementProofs.remove(_movementProofs.keys.first);
      }
    }
    if (body is Map && body['newsSignals'] is Map) {
      final signals = FeedNewsSignals.fromWire(body['newsSignals'] as Map);
      if (signals.baseline != wire['baseline']) {
        throw const FormatException('Foreign news baseline');
      }
      _newsBaselines[signals.baseline] = signals;
      while (_newsBaselines.length > 2) {
        _newsBaselines.remove(_newsBaselines.keys.first);
      }
    }
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

  Future<FeedNewsDelta> news(String checkpoint) async {
    lastNewsReadUnits = 0;
    final uid = currentUserId();
    retainViewer(uid);
    if (uid == null || _erased.contains(uid)) {
      throw StateError('No news viewer');
    }
    final epoch = _epoch;
    var cursor = checkpoint;
    for (var work = 0; work < 32; work++) {
      final response = await send({
        'format': 'delta-v1',
        'expectedUserId': uid,
        'mode': 'news',
        'checkpoint': cursor,
      });
      if (_epoch != epoch ||
          _viewer != uid ||
          currentUserId() != uid ||
          _erased.contains(uid)) {
        throw StateError('Stale news viewer');
      }
      if (response is! Map ||
          response['version'] != 1 ||
          response['checkpoint'] is! String ||
          (response['checkpoint'] as String).isEmpty ||
          (response['checkpoint'] as String).length > 262144) {
        throw const FormatException('Invalid news response');
      }
      final next = response['checkpoint'] as String;
      final units = response['readUnits'];
      if (units != null) {
        if (units is! int || units < 0) {
          throw const FormatException('Invalid news work');
        }
        lastNewsReadUnits += units;
      }
      if (response['state'] == 'preparing') {
        if (next == cursor || response.containsKey('count')) {
          throw const FormatException('Invalid partial news response');
        }
        cursor = next;
        continue;
      }
      final count = response['count'], validFor = response['validForMillis'];
      if (response['state'] != 'ready' ||
          count is! int ||
          count < 0 ||
          count > 100 ||
          response['capped'] != (count == 100) ||
          response['baseline'] is! String ||
          (response['baseline'] as String).isEmpty ||
          validFor is! int ||
          validFor < 0 ||
          count > 0 && validFor == 0 ||
          validFor > const Duration(hours: 1).inMilliseconds ||
          response['checkedAt'] is! int) {
        throw const FormatException('Invalid confirmed news count');
      }
      return FeedNewsDelta.confirmed(
        checkpoint: next,
        baseline: response['baseline'] as String,
        count: count,
        validFor: Duration(milliseconds: validFor),
      );
    }
    throw StateError('News preparation work budget exhausted');
  }

  Future<FeedNewsSignals> signals(String checkpoint) async {
    final uid = currentUserId();
    retainViewer(uid);
    if (uid == null || _erased.contains(uid)) {
      throw StateError('No news viewer');
    }
    final epoch = _epoch;
    final value = await send({
      'format': 'delta-v1',
      'mode': 'news-signals',
      'expectedUserId': uid,
      'checkpoint': checkpoint,
    });
    if (_epoch != epoch || currentUserId() != uid || _erased.contains(uid)) {
      throw StateError('Stale news viewer');
    }
    if (value is! Map ||
        value['version'] != 1 ||
        value['state'] != 'signals' ||
        value['signals'] is! Map) {
      throw const FormatException('Invalid signal response');
    }
    final result = FeedNewsSignals.fromWire(value['signals'] as Map);
    final reads = value['readUnits'];
    if (reads is! int || reads < 0) {
      throw const FormatException('Invalid signal work');
    }
    result.readUnits = reads;
    return result;
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
    if (response is Map &&
        response['state'] == 'reset' &&
        response['capability'] is Map) {
      _acceptCapability(
        Map<String, dynamic>.from(response['capability'] as Map),
        scope,
      );
      throw const FeedSessionExpired();
    }
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
    _acceptCapability(Map<String, dynamic>.from(raw['live'] as Map), scope);
    if (_legacy) throw const FeedSessionExpired();
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
        if (response is Map &&
            response['state'] == 'reset' &&
            response['capability'] is Map) {
          _acceptCapability(
            Map<String, dynamic>.from(response['capability'] as Map),
            scope,
          );
          throw const FeedSessionExpired();
        }
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
