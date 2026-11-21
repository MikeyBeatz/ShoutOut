import 'dart:async';
import 'feed_body_cache.dart';

import 'live_data.dart';
import 'live_shout_state.dart';

/// One active combination per viewer/ID, shared by feed, library and detail.
/// Context retirement replaces subscriptions, never the displayed card order.
class FeedDeltaLive {
  FeedDeltaLive({
    required this.project,
    required this.currentUserId,
    required this.resolveContext,
    required this.publicState,
    required this.reaction,
    required this.saved,
    this.synchronized,
    this.onState,
  });
  final String project;
  final String? Function() currentUserId;
  final Future<Map<String, dynamic>> Function() resolveContext;
  final Stream<Map<String, dynamic>?> Function(Map<String, dynamic>, String)
  publicState;
  final Stream<Map<String, dynamic>?> Function(String, String) reaction;
  final Stream<bool> Function(String, String) saved;
  final Stream<void>? synchronized;
  final void Function(String, Map<String, dynamic>, String)? onState;
  final _shared = SharedLiveStreams();
  final _changes = StreamController<void>.broadcast(sync: true);
  final _baselines = <String, (String, Map<String, dynamic>)>{};
  final _active = <String>{};
  final _latest = <String, (String, Map<String, dynamic>?)>{};
  Map<String, dynamic>? latest(String id, String generation) =>
      _latest[id]?.$1 == generation
      ? _latest[id]?.$2 ?? {'status': 'deleted'}
      : null;
  Map<String, dynamic>? _context;
  Future<Map<String, dynamic>>? _flight;
  final _retired = <String, Future<Map<String, dynamic>>>{};
  String? _viewer;
  int _epoch = 0;
  final _erased = <String>{};
  Stream<void> get changes => _changes.stream;
  String stamp(Map<String, dynamic> value) =>
      '${value['generation']}:${value['incarnation']}';
  void retainViewer(String? uid) {
    if (_viewer == uid) return;
    _viewer = uid;
    _epoch++;
    _context = null;
    _flight = null;
    _retired.clear();
    _baselines.clear();
    _active.clear();
    _latest.clear();
    _shared.retainViewer(project, uid);
    _changes.add(null);
  }

  void eraseAccount(String uid) {
    _erased.add(uid);
    if (_viewer == uid) {
      retainViewer(null);
      _shared.retainViewer(project, null);
    }
  }

  void adopt(Map<String, dynamic> value) {
    final uid = currentUserId();
    retainViewer(uid);
    if (uid == null ||
        _erased.contains(uid) ||
        value['uid'] != uid ||
        value['project'] != project ||
        value['generation'] is! String ||
        value['incarnation'] is! String) {
      throw const FormatException('Foreign live context');
    }
    if (_context != null && stamp(_context!) == stamp(value)) return;
    _context = Map.unmodifiable(value);
    _retired.clear();
    _baselines.clear();
    _latest.clear();
    _changes.add(null);
  }

  void baseline(String id, Map<String, dynamic> value, String generation) {
    if (!_active.contains(id) ||
        _context == null ||
        stamp(_context!) != generation) {
      return;
    }
    final old = _baselines[id];
    if (old != null &&
        old.$1 == generation &&
        (old.$2['revision'] as int) > (value['revision'] as int)) {
      return;
    }
    _baselines[id] = (generation, Map.unmodifiable(value));
    // Inactive bodies belong to the bounded cache, never a second state index.
  }

  Future<Map<String, dynamic>> context({String? retired}) async {
    final uid = currentUserId();
    retainViewer(uid);
    if (uid == null || _erased.contains(uid)) {
      throw StateError('No live viewer');
    }
    if (_context != null && (retired == null || stamp(_context!) != retired)) {
      return _context!;
    }
    if (retired != null && _retired.containsKey(retired)) {
      return _retired[retired]!;
    }
    if (_flight != null) return _flight!;
    final epoch = _epoch;
    final flight = resolveContext().then((value) {
      if (epoch != _epoch || currentUserId() != uid) {
        throw StateError('Stale live context');
      }
      adopt(value);
      return value;
    });
    _flight = flight;
    if (retired != null) _retired[retired] = flight;
    try {
      return await flight;
    } finally {
      if (identical(_flight, flight)) _flight = null;
    }
  }

  Stream<LiveShoutState> watch(String id) {
    final uid = currentUserId();
    retainViewer(uid);
    final viewerEpoch = _epoch;
    return _shared.watch(
      (uid, project, 'card-live', id),
      () => Stream<LiveShoutState>.multi((output) {
        _active.add(id);
        StreamSubscription<LiveShoutState>? source;
        var cancelled = false, binding = 0, recovered = false;
        String? bound;
        Future<void> bind() async {
          final value = _context;
          if (cancelled || value == null || uid != currentUserId()) return;
          final generation = stamp(value);
          if (bound == generation) return;
          bound = generation;
          final attempt = ++binding;
          await source?.cancel();
          if (cancelled || attempt != binding) return;
          int minimum = -1;
          String? last;
          final states = publicState(value, id).where((state) {
            if (cancelled || attempt != binding) return false;
            if (state == null) {
              _latest[id] = (generation, null);
              return true;
            }
            final revision = state['revision'];
            if (revision is! int || revision < 0) {
              throw const FormatException('Invalid live revision');
            }
            final baseline = _baselines[id];
            final floor = baseline?.$1 == generation
                ? baseline!.$2['revision'] as int
                : -1;
            if (revision < minimum || revision < floor) return false;
            final encoded = canonicalFeedBody(state);
            if (revision == minimum && last != encoded) {
              throw const FormatException('Conflicting live revision');
            }
            minimum = revision;
            last = encoded;
            _latest[id] = (generation, Map.unmodifiable(state));
            onState?.call(id, state, generation);
            return true;
          });
          source =
              watchLiveShoutState(
                states,
                reaction(uid!, id),
                ownSave: saved(uid, id),
                synchronized: synchronized,
              ).listen(
                (value) {
                  if (!cancelled && attempt == binding) output.add(value);
                },
                onError: (Object error, StackTrace stack) async {
                  if (cancelled || attempt != binding) return;
                  if (!recovered &&
                      liveDataFailureCode(error) == 'permission-denied') {
                    recovered = true;
                    try {
                      final current = await context(retired: generation);
                      if (stamp(current) == generation) {
                        if (!cancelled) output.addError(error, stack);
                      } else {
                        await bind();
                      }
                    } catch (failure, trace) {
                      if (!cancelled) output.addError(failure, trace);
                    }
                  } else {
                    output.addError(error, stack);
                  }
                },
              );
        }

        final changes = _changes.stream.listen((_) {
          unawaited(
            bind().catchError((Object error, StackTrace stack) {
              if (!cancelled) output.addError(error, stack);
            }),
          );
        });
        unawaited(
          context().then((_) => bind()).catchError((
            Object error,
            StackTrace stack,
          ) {
            if (!cancelled) output.addError(error, stack);
          }),
        );
        output.onCancel = () async {
          cancelled = true;
          binding++;
          if (viewerEpoch == _epoch) {
            _baselines.remove(id);
            _active.remove(id);
            _latest.remove(id);
          }
          await changes.cancel();
          await source?.cancel();
        };
      }),
      isCurrent: () =>
          uid != null && currentUserId() == uid && !_erased.contains(uid),
    );
  }
}
