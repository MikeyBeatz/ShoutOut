import 'dart:async';

import 'package:flutter/foundation.dart';
import 'read_state_store.dart';
import 'read_state_platform.dart';
import 'read_sync_controller.dart';

class ReadTrackingController extends ChangeNotifier {
  ReadTrackingController(
    this.scope,
    this.store, {
    DateTime Function()? clock,
    this.sync,
  }) : clock = clock ?? DateTime.now;
  final ReadScope scope;
  final ReadStateStore store;
  final ReadSyncController? sync;
  final DateTime Function() clock;
  final _read = <String, ReadContent>{}, _pending = <String, ReadContent>{};
  final _loading = <String, Future<void>>{};
  bool _disposed = false, _erased = false, _writing = false, _pruning = false;
  bool storageFailed = false;
  bool get enabled => !_disposed && !_erased;
  bool contains(ReadContent content) =>
      enabled &&
      _read.containsKey(content.key) &&
      clock().isBefore(content.retainUntil);

  Future<void> load(ReadContent content) =>
      _loading[content.key] ??= _load(content).whenComplete(() {
        _loading.remove(content.key);
      });
  Future<void> _load(ReadContent content) async {
    if (!enabled) return;
    try {
      final found = await store
          .contains(content, clock())
          .timeout(const Duration(seconds: 10));
      if (enabled && found) {
        _read.putIfAbsent(content.key, () => content);
      }
    } catch (_) {
      _failure();
    }
  }

  void mark(ReadContent content) {
    if (!enabled ||
        !clock().isBefore(content.retainUntil) ||
        contains(content)) {
      return;
    }
    _read[content.key] = content;
    _pending[content.key] = content;
    unawaited(retry());
  }

  void _failure() {
    if (!enabled || storageFailed) return;
    storageFailed = true;
    notifyListeners();
  }

  Future<void> retry() async {
    if (!enabled || _writing) return;
    _writing = true;
    try {
      while (enabled && _pending.isNotEmpty) {
        final content = _pending.values.first;
        await store.put(content, clock()).timeout(const Duration(seconds: 10));
        if (enabled) {
          _pending.remove(content.key);
          sync?.dirty();
        }
      }
      if (enabled && storageFailed) {
        storageFailed = false;
        notifyListeners();
      }
    } catch (_) {
      _failure();
    } finally {
      _writing = false;
    }
  }

  Future<void> prune() async {
    if (!enabled || _pruning) return;
    _pruning = true;
    try {
      while (enabled &&
          await store.prune(clock()).timeout(const Duration(seconds: 10)) ==
              100) {
        await Future<void>.delayed(Duration.zero);
      }
      if (enabled) {
        _read.removeWhere(
          (_, content) => !clock().isBefore(content.retainUntil),
        );
        _pending.removeWhere(
          (_, content) => !clock().isBefore(content.retainUntil),
        );
      }
    } catch (_) {
      _failure();
    } finally {
      _pruning = false;
    }
  }

  Future<void> erase() async {
    if (_disposed) return;
    _erased = true;
    sync?.dispose();
    _read.clear();
    _pending.clear();
    await store.erase().timeout(const Duration(seconds: 10));
  }

  @override
  void dispose() {
    _disposed = true;
    sync?.dispose();
    _read.clear();
    _pending.clear();
    unawaited(store.close().catchError((_) {}));
    super.dispose();
  }

  void acceptRemote(List<ReadUpload> rows) {
    if (!enabled) return;
    for (final row in rows) {
      if (clock().isBefore(row.content.retainUntil)) {
        _read.putIfAbsent(row.content.key, () => row.content);
      }
    }
  }
}

class ReadSessions extends ValueNotifier<ReadTrackingController?> {
  ReadSessions({this.storeFactory = createReadStateStore, this.syncFactory})
    : super(null);
  final ReadStateStore Function(ReadScope) storeFactory;
  // Null until a separately approved live transport/rollout is installed.
  final ReadSyncController Function(
    ReadScope,
    ReadSyncStore,
    void Function(List<ReadUpload>),
  )?
  syncFactory;
  bool _foreground = true;
  String? _project;
  bool get configured => _project != null;
  final _erasing = <String, Future<void>>{}, _erased = <String>{};
  void configure(String? projectId) {
    retainViewer(null);
    _project = projectId;
    if (projectId != null) {
      unawaited(
        maintainReadNamespaces().catchError((_) {
          debugPrint('Local read-state maintenance unavailable.');
        }),
      );
    }
  }

  void retainViewer(String? uid) {
    if (_project == null || uid == null) {
      final old = value;
      value = null;
      old?.dispose();
      return;
    }
    if (value?.scope.userId == uid && value?.scope.projectId == _project) {
      return;
    }
    final old = value, scope = ReadScope(_project!, uid);
    value = _erased.contains(scope.databaseSuffix)
        ? null
        : _createController(scope);
    old?.dispose();
    if (value case final controller?) {
      unawaited(controller.prune());
      controller.sync?.setActive(_foreground);
      if (_foreground) unawaited(controller.sync?.synchronize());
    }
  }

  ReadTrackingController _createController(ReadScope scope) {
    final store = storeFactory(scope);
    ReadTrackingController? controller;
    final sync = store is ReadSyncStore
        ? syncFactory?.call(
            scope,
            store,
            (rows) => controller?.acceptRemote(rows),
          )
        : null;
    return controller = ReadTrackingController(scope, store, sync: sync);
  }

  void setForeground(bool active) {
    final resumed = active && !_foreground;
    _foreground = active;
    value?.sync?.setActive(active);
    if (resumed) unawaited(value?.sync?.synchronize());
  }

  Future<void> synchronize() async {
    await value?.sync?.synchronize();
  }

  Future<void> eraseAccount(String uid) async {
    if (_project == null) return;
    final scope = ReadScope(_project!, uid), key = scope.databaseSuffix;
    if (_erased.contains(key)) return;
    return _erasing[key] ??= _erase(scope).whenComplete(() {
      _erasing.remove(key);
    });
  }

  Future<void> _erase(ReadScope scope) async {
    final current = value;
    ReadStateStore? temporary;
    try {
      if (current != null &&
          current.scope.databaseSuffix == scope.databaseSuffix) {
        await current.erase();
      } else {
        temporary = storeFactory(scope);
        await temporary.erase().timeout(const Duration(seconds: 10));
      }
      _erased.add(scope.databaseSuffix);
    } catch (_) {
      // Local metadata failure must never change the existing Auth deletion
      // protocol. A confirmed pending gate calls this again on the next visit.
      debugPrint('Local read-state erasure failed.');
    } finally {
      try {
        await temporary?.close();
      } catch (_) {
        debugPrint('Local read-state close failed.');
      }
    }
  }

  @override
  void dispose() {
    value?.dispose();
    super.dispose();
  }
}

final readSessions = ReadSessions();
