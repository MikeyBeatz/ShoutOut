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
  final _persisted = <String, Completer<bool>>{};
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
    _prepareWrite(content.key);
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
      for (final key in _pending.keys) {
        _prepareWrite(key);
      }
      while (enabled && _pending.isNotEmpty) {
        final content = _pending.values.first;
        final persisted = _persisted[content.key];
        await store.put(content, clock()).timeout(const Duration(seconds: 10));
        if (enabled &&
            identical(_pending[content.key], content) &&
            identical(_persisted[content.key], persisted)) {
          _pending.remove(content.key);
          _persisted.remove(content.key);
          if (persisted != null && !persisted.isCompleted) {
            persisted.complete(true);
          }
        }
      }
      if (enabled && storageFailed) {
        storageFailed = false;
        notifyListeners();
      }
    } catch (_) {
      for (final pending in _persisted.values) {
        if (!pending.isCompleted) pending.complete(false);
      }
      _failure();
    } finally {
      _writing = false;
    }
  }

  void _prepareWrite(String key) {
    if (_persisted[key] == null || _persisted[key]!.isCompleted) {
      _persisted[key] = Completer<bool>();
    }
  }

  /// Wait only for marks already in RAM at this boundary, not future reading.
  Future<void> flushBoundary() async {
    if (!enabled) throw StateError('Read controller unavailable');
    final waits = <Future<bool>>[];
    for (final key in _pending.keys) {
      _prepareWrite(key);
      waits.add(_persisted[key]!.future);
    }
    unawaited(retry());
    final saved = await Future.wait(waits).timeout(const Duration(seconds: 10));
    if (!enabled || saved.any((value) => !value)) {
      throw StateError('Local read persistence failed');
    }
  }

  void _cancelWrites() {
    for (final pending in _persisted.values) {
      if (!pending.isCompleted) pending.complete(false);
    }
    _persisted.clear();
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
        final expired = _pending.entries
            .where((entry) => !clock().isBefore(entry.value.retainUntil))
            .map((entry) => entry.key)
            .toList();
        for (final key in expired) {
          _pending.remove(key);
          final persisted = _persisted.remove(key);
          if (persisted != null && !persisted.isCompleted) {
            persisted.complete(true);
          }
        }
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
    _cancelWrites();
    await store.erase().timeout(const Duration(seconds: 10));
  }

  @override
  void dispose() {
    _disposed = true;
    sync?.dispose();
    _read.clear();
    _pending.clear();
    _cancelWrites();
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
  bool _startupPending = false;
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
      _startupPending = false;
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
    _startupPending = value != null;
    if (value case final controller?) {
      unawaited(controller.prune());
      controller.sync?.setActive(_foreground);
      _startViewerSync();
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
    _foreground = active;
    value?.sync?.setActive(active);
    if (active) _startViewerSync();
  }

  void _startViewerSync() {
    if (!_foreground || !_startupPending) return;
    _startupPending = false;
    unawaited(synchronize());
  }

  Future<void> synchronize() async {
    if (!_foreground) return;
    _startupPending = false;
    final controller = value;
    if (controller != null) {
      await controller.sync?.synchronize(
        beforeCapture: controller.flushBoundary,
      );
    }
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
