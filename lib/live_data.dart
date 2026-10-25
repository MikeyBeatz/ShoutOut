import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Shares only active subscriptions. Late listeners receive the latest event;
/// the last cancellation releases both the source and its in-memory value.
class SharedLiveStreams {
  final _entries = <Object, Object>{};

  Stream<T> watch<T>(Object key, Stream<T> Function() create) {
    final existing = _entries[key];
    if (existing != null) return (existing as _SharedLiveStream<T>).stream;
    late final _SharedLiveStream<T> entry;
    entry = _SharedLiveStream<T>(create, () {
      if (identical(_entries[key], entry)) _entries.remove(key);
    }, () => _entries.putIfAbsent(key, () => entry) as _SharedLiveStream<T>);
    _entries[key] = entry;
    // Creating a stream does not guarantee a widget will subscribe to it.
    scheduleMicrotask(() {
      if (entry._listeners.isEmpty && identical(_entries[key], entry)) {
        _entries.remove(key);
      }
    });
    return entry.stream;
  }
}

class _SharedLiveStream<T> {
  _SharedLiveStream(this.create, this.release, this.resolve);

  final Stream<T> Function() create;
  final void Function() release;
  final _SharedLiveStream<T> Function() resolve;
  final _listeners = <MultiStreamController<T>>{};
  StreamSubscription<T>? _subscription;
  Object? _lastEvent;
  StackTrace? _lastErrorStack;
  bool _hasEvent = false;
  bool _done = false;
  int _generation = 0;

  late final Stream<T> stream = Stream<T>.multi((listener) {
    if (_done) {
      listener.close();
      return;
    }
    // A widget may retain a stream after its last listener has gone away.
    // Join any newer active entry rather than opening a duplicate source.
    final active = resolve();
    if (!identical(active, this)) {
      final subscription = active.stream.listen(
        listener.add,
        onError: listener.addError,
        onDone: listener.close,
      );
      listener.onCancel = subscription.cancel;
      return;
    }
    _listeners.add(listener);
    if (_hasEvent) {
      if (_lastErrorStack != null) {
        listener.addError(_lastEvent!, _lastErrorStack);
      } else {
        listener.add(_lastEvent as T);
      }
    }
    listener.onCancel = () async {
      _listeners.remove(listener);
      if (_listeners.isNotEmpty) return;
      _generation++;
      final subscription = _subscription;
      _subscription = null;
      _hasEvent = false;
      _lastEvent = null;
      _lastErrorStack = null;
      release();
      await subscription?.cancel();
    };
    if (_subscription != null) return;
    final generation = ++_generation;
    try {
      _subscription = create().listen(
        (value) {
          if (generation != _generation) return;
          _hasEvent = true;
          _lastEvent = value;
          _lastErrorStack = null;
          for (final target in _listeners.toList()) {
            target.add(value);
          }
        },
        onError: (Object error, StackTrace stack) {
          if (generation != _generation) return;
          _hasEvent = true;
          _lastEvent = error;
          _lastErrorStack = stack;
          for (final target in _listeners.toList()) {
            target.addError(error, stack);
          }
        },
        onDone: () {
          if (generation != _generation) return;
          _done = true;
          for (final target in _listeners.toList()) {
            target.close();
          }
          release();
        },
      );
    } catch (error, stack) {
      _done = true;
      for (final target in _listeners.toList()) {
        target.addError(error, stack);
        target.close();
      }
      release();
    }
  }, isBroadcast: true);
}

final liveStreams = SharedLiveStreams();

// Scope explicitly: SDK reference equality can omit the database ID. The
// viewer also prevents a new account from replaying the previous user's data.
Object liveDataKey(Object source) {
  final firestore = switch (source) {
    Query query => query.firestore,
    DocumentReference reference => reference.firestore,
    _ => FirebaseFirestore.instance,
  };
  return (
    FirebaseAuth.instanceFor(app: firestore.app).currentUser?.uid,
    firestore.app.name,
    firestore.databaseId,
    source,
  );
}

extension LiveDocument on DocumentReference<Map<String, dynamic>> {
  Stream<DocumentSnapshot<Map<String, dynamic>>> liveSnapshots() =>
      liveStreams.watch(liveDataKey(this), snapshots);
}

extension LiveQuery on Query<Map<String, dynamic>> {
  Stream<QuerySnapshot<Map<String, dynamic>>> liveSnapshots() =>
      liveStreams.watch(liveDataKey(this), snapshots);
}

/// Keeps per-item realtime state while a query replaces its model instances.
/// Updating a count/title never restarts the item's secondary subscriptions.
class KeyedLiveState<T, S> {
  KeyedLiveState({
    required this.keyOf,
    required this.watch,
    required this.apply,
    required this.onChanged,
    required this.onError,
  });

  final String Function(T) keyOf;
  final Stream<S> Function(String) watch;
  final void Function(T, S) apply;
  final void Function() onChanged;
  final void Function(Object, StackTrace) onError;
  final _slots = <String, _LiveStateSlot<T, S>>{};
  bool _disposed = false;

  void update(Iterable<T> items) {
    if (_disposed) return;
    final next = {for (final item in items) keyOf(item): item};
    for (final key in _slots.keys.toList()) {
      if (!next.containsKey(key)) {
        unawaited(_slots.remove(key)!.subscription?.cancel());
      }
    }
    for (final entry in next.entries) {
      var slot = _slots[entry.key];
      if (slot != null) {
        slot.item = entry.value;
        if (slot.hasState) apply(slot.item, slot.state as S);
        continue;
      }
      slot = _LiveStateSlot<T, S>(entry.value);
      _slots[entry.key] = slot;
      final current = slot;
      slot.subscription = watch(entry.key).listen(
        (state) {
          if (_disposed || !identical(_slots[entry.key], current)) return;
          current
            ..state = state
            ..hasState = true;
          apply(current.item, state);
          onChanged();
        },
        onError: (Object error, StackTrace stack) {
          if (!_disposed && identical(_slots[entry.key], current)) {
            onError(error, stack);
          }
        },
      );
    }
  }

  Future<void> dispose() async {
    _disposed = true;
    final subscriptions = _slots.values
        .map((slot) => slot.subscription?.cancel())
        .whereType<Future<void>>()
        .toList();
    _slots.clear();
    await Future.wait(subscriptions);
  }
}

class _LiveStateSlot<T, S> {
  _LiveStateSlot(this.item);
  T item;
  S? state;
  bool hasState = false;
  StreamSubscription<S>? subscription;
}

Stream<R> combineLatestValues<A, B, R>(
  Stream<A> first,
  Stream<B> second,
  R Function(A, B) combine,
) => Stream<R>.multi((output) {
  A? a;
  B? b;
  var hasA = false;
  var hasB = false;
  var done = 0;
  void emit() {
    if (hasA && hasB) output.add(combine(a as A, b as B));
  }

  void complete() {
    if (++done == 2) output.close();
  }

  final firstSubscription = first.listen(
    (value) {
      a = value;
      hasA = true;
      emit();
    },
    onError: output.addError,
    onDone: complete,
  );
  final secondSubscription = second.listen(
    (value) {
      b = value;
      hasB = true;
      emit();
    },
    onError: output.addError,
    onDone: complete,
  );
  output.onCancel = () async {
    await Future.wait([
      firstSubscription.cancel(),
      secondSubscription.cancel(),
    ]);
  };
});
