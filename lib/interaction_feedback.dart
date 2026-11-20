import 'dart:async';

import 'package:flutter/foundation.dart';
import 'live_shout_state.dart';

enum InteractionKind { reaction, save }

typedef InteractionKey = (String, InteractionKind);

/// A tentative view, never written into a Shout or used as server evidence.
class InteractionPreview {
  InteractionPreview(this.base, this.targetReaction, this.targetSaved);
  final LiveShoutState base;
  final String? targetReaction;
  final bool targetSaved;

  int get likes =>
      (base.likes +
              (targetReaction == 'like' ? 1 : 0) -
              (base.reaction == 'like' ? 1 : 0))
          .clamp(0, 0x7fffffff);
  int get dislikes =>
      (base.dislikes +
              (targetReaction == 'dislike' ? 1 : 0) -
              (base.reaction == 'dislike' ? 1 : 0))
          .clamp(0, 0x7fffffff);
  int get saves => (base.saves + (targetSaved ? 1 : 0) - (base.saved ? 1 : 0))
      .clamp(0, 0x7fffffff);
}

class InteractionFeedback extends ChangeNotifier {
  InteractionFeedback({
    this.onTiming,
    this.reconcileDelay = const Duration(seconds: 2),
  });
  final void Function(InteractionKind, String, Duration)? onTiming;
  final Duration reconcileDelay;
  String? _viewer;
  final _pending = <InteractionKey, _PendingInteraction>{};
  final _deleted = <String>{};
  final _confirmed = <InteractionKey, LiveShoutState>{};
  bool _disposed = false;
  bool _notificationQueued = false;
  LiveShoutState? confirmed(String id, InteractionKind kind) =>
      _confirmed[(id, kind)];
  Set<String> get deleted => Set.unmodifiable(_deleted);
  String? get viewer => _viewer;

  void retainViewer(String? viewer) {
    if (_viewer == viewer) return;
    for (final pending in _pending.values) {
      pending.timer?.cancel();
    }
    _pending.clear();
    _deleted.clear();
    _confirmed.clear();
    _viewer = viewer;
    notifyListeners();
  }

  bool busy(String id, InteractionKind kind) {
    final pending = _pending[(id, kind)];
    return pending != null &&
        (pending.running || (pending.acknowledged && !pending.uncertain));
  }

  bool pending(String id, InteractionKind kind) =>
      _pending.containsKey((id, kind));
  bool uncertain(String id, InteractionKind kind) =>
      _pending[(id, kind)]?.uncertain ?? false;
  InteractionPreview? preview(String id, InteractionKind kind) {
    final pending = _pending[(id, kind)];
    return pending == null || pending.liveApplied ? null : pending.preview;
  }

  /// All source listeners affected by the same Firestore change are in sync.
  /// We replace a frozen preview, never add a delta to incoming counters.
  void observe(String viewer, String id, LiveShoutState state) {
    if (_viewer != viewer) return;
    var changed = false;
    for (final kind in InteractionKind.values) {
      final key = (id, kind), pending = _pending[key];
      if (pending == null) {
        changed = _confirmed.remove(key) != null || changed;
        continue;
      }
      // Also update other mounted copies of the card, whose own listener may
      // deliver the same SDK event later. Never restore a captured old count.
      _confirmed[key] = state;
      pending.liveRevision++;
      changed = true;
      final matches = kind == InteractionKind.reaction
          ? state.reaction == pending.preview.targetReaction
          : state.saved == pending.preview.targetSaved;
      if (state.contentPurged || matches) {
        if (!pending.liveApplied) {
          onTiming?.call(kind, 'live-observed', pending.clock.elapsed);
        }
        pending.liveApplied = true;
        if (pending.acknowledged) _finish(key, pending);
      }
    }
    // Observers update their own authoritative model before this callback.
    // Defer widget notification: a detail's StreamBuilder can call observe.
    if (changed) _notifyLater();
  }

  Future<void> run({
    required String viewer,
    required String id,
    required InteractionKind kind,
    required LiveShoutState base,
    required Future<void> Function() send,
    required bool Function(Object) definitive,
    required Future<LiveShoutState> Function() reconcile,
    bool like = true,
  }) {
    if (_viewer != viewer) return Future.value();
    final key = (id, kind);
    final existing = _pending[key];
    if (existing?.flight case final flight?) return flight;
    final effectiveBase = _confirmed[key] ?? base;
    final button = like ? 'like' : 'dislike';
    final pending =
        existing ??
        _PendingInteraction(
          InteractionPreview(
            effectiveBase,
            effectiveBase.reaction == button ? null : button,
            !effectiveBase.saved,
          ),
          send,
          reconcile,
        );
    _pending[key] = pending;
    pending.timer?.cancel();
    pending.running = true;
    pending.uncertain = false;
    notifyListeners();
    late final Future<void> flight;
    flight = Future<void>.sync(() async {
      try {
        if (!pending.acknowledged) {
          await pending.send(); // A retry retains the original button/key.
          if (!_current(viewer, key, pending)) return;
          pending.acknowledged = true;
          onTiming?.call(kind, 'acknowledged', pending.clock.elapsed);
        } else {
          final readClock = Stopwatch()..start();
          final liveRevision = pending.liveRevision;
          late final LiveShoutState state;
          try {
            state = await pending.reconcile(); // No second toggle after ack.
          } finally {
            onTiming?.call(kind, 'current-server-read', readClock.elapsed);
          }
          if (!_current(viewer, key, pending)) return;
          // A slower read must not replace live data delivered during that read.
          if (pending.liveRevision == liveRevision) _confirmed[key] = state;
          _finish(key, pending);
        }
        if (pending.liveApplied) _finish(key, pending);
      } catch (error) {
        if (_current(viewer, key, pending)) {
          if (!pending.acknowledged && definitive(error)) {
            _finish(key, pending);
          } else {
            pending.uncertain = true;
          }
        }
        rethrow;
      } finally {
        pending.running = false;
        pending.flight = null;
        if (_current(viewer, key, pending)) {
          if (pending.acknowledged && !pending.uncertain) {
            pending.timer = Timer(reconcileDelay, () {
              if (!_current(viewer, key, pending)) return;
              unawaited(
                run(
                  viewer: viewer,
                  id: id,
                  kind: kind,
                  base: base,
                  send: pending.send,
                  reconcile: pending.reconcile,
                  definitive: definitive,
                ).catchError((Object _) {}),
              );
            });
          }
          notifyListeners();
        }
      }
    });
    pending.flight = flight;
    return flight;
  }

  bool _current(
    String viewer,
    InteractionKey key,
    _PendingInteraction pending,
  ) => _viewer == viewer && identical(_pending[key], pending);
  void _finish(InteractionKey key, _PendingInteraction pending) {
    if (!identical(_pending[key], pending)) return;
    pending.timer?.cancel();
    _pending.remove(key);
    onTiming?.call(key.$2, 'live-settled', pending.clock.elapsed);
    _notifyLater();
  }

  void _notifyLater() {
    if (_notificationQueued || _disposed) return;
    _notificationQueued = true;
    scheduleMicrotask(() {
      _notificationQueued = false;
      if (!_disposed) notifyListeners();
    });
  }

  void confirmOwnDeletion(String viewer, String id) {
    if (_viewer != viewer) return;
    _deleted.add(id);
    for (final kind in InteractionKind.values) {
      _confirmed.remove((id, kind));
      final pending = _pending.remove((id, kind));
      pending?.timer?.cancel();
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    for (final pending in _pending.values) {
      pending.timer?.cancel();
    }
    _pending.clear();
    super.dispose();
  }
}

class _PendingInteraction {
  _PendingInteraction(this.preview, this.send, this.reconcile);
  final InteractionPreview preview;
  final Future<void> Function() send;
  final Future<LiveShoutState> Function() reconcile;
  final clock = Stopwatch()..start();
  Future<void>? flight;
  Timer? timer;
  int liveRevision = 0;
  bool running = false,
      acknowledged = false,
      liveApplied = false,
      uncertain = false;
}

final interactionFeedback = InteractionFeedback(
  onTiming: (kind, stage, elapsed) {
    debugPrint(
      'Interaction timing: kind=${kind.name} stage=$stage elapsedMs=${elapsed.inMilliseconds}',
    );
  },
);
