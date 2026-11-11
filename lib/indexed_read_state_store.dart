import 'dart:async';
import 'dart:js_interop';
import 'package:web/web.dart' as web;
import 'read_state_store.dart';

class IndexedReadStateStore implements ReadStateStore {
  IndexedReadStateStore(this.scope, {String prefix = 'shoutout-read-v1'})
    : name = '$prefix-${scope.databaseSuffix}';
  final ReadScope scope;
  final String name;
  Future<web.IDBDatabase>? _opening;
  bool _closed = false;
  Future<web.IDBDatabase> _open() {
    if (_closed) throw StateError('Read store closed');
    return _opening ??= _openDatabase().catchError((Object error) {
      _opening = null;
      throw error;
    });
  }

  Future<web.IDBDatabase> _openDatabase() {
    final done = Completer<web.IDBDatabase>();
    final request = web.window.indexedDB.open(name, 1);
    request.onupgradeneeded = ((web.Event _) {
      final db = request.result as web.IDBDatabase;
      db.createObjectStore('meta');
      db
          .createObjectStore(
            'records',
            web.IDBObjectStoreParameters(keyPath: 'key'.toJS),
          )
          .createIndex('retainUntil', 'retainUntil'.toJS);
    }).toJS;
    request.onsuccess = ((web.Event _) {
      final db = request.result as web.IDBDatabase;
      db.onversionchange = ((web.Event _) {
        db.close();
        _opening = null;
      }).toJS;
      if (_closed) {
        db.close();
        done.completeError(StateError('Read store closed'));
      } else {
        done.complete(db);
      }
    }).toJS;
    request.onerror = ((web.Event _) {
      done.completeError(StateError('Read database open failed'));
    }).toJS;
    request.onblocked = ((web.Event _) {
      // No schema migration is currently requested. Existing connections close
      // on versionchange; the request remains pending rather than corrupting data.
    }).toJS;
    return done.future;
  }

  Future<void> _transaction(
    String mode,
    void Function(web.IDBTransaction tx) body,
  ) async {
    final db = await _open();
    if (_closed) throw StateError('Read store closed');
    final tx = db.transaction(['meta', 'records'].jsify()!, mode);
    final done = Completer<void>();
    Object? failure;
    tx.oncomplete = ((web.Event _) {
      if (!done.isCompleted) done.complete();
    }).toJS;
    void failed(web.Event _) {
      if (!done.isCompleted) {
        done.completeError(failure ?? StateError('Read transaction failed'));
      }
    }

    tx.onabort = failed.toJS;
    tx.onerror = failed.toJS;
    // Callback bodies stay inside IndexedDB events; no await can make this
    // transaction inactive before its dependent write is scheduled.
    void guarded(void Function() callback) {
      try {
        callback();
      } catch (error) {
        failure = error;
        tx.abort();
      }
    }

    final meta = tx.objectStore('meta').get('erased'.toJS);
    meta.onsuccess = ((web.Event _) {
      guarded(() {
        if (meta.result?.dartify() == true) {
          throw StateError('Read scope erased');
        }
        body(tx);
      });
    }).toJS;
    await done.future;
  }

  @override
  Future<bool> contains(ReadContent content, DateTime now) async {
    var found = false;
    await _transaction('readonly', (tx) {
      final request = tx.objectStore('records').get(content.key.toJS);
      request.onsuccess = ((web.Event _) {
        found = ReadMarker.matches(
          request.result?.dartify(),
          scope,
          content,
          now,
        );
      }).toJS;
    });
    return found;
  }

  @override
  Future<void> put(ReadContent content, DateTime now) async {
    if (!now.isBefore(content.retainUntil)) return;
    await _transaction('readwrite', (tx) {
      final store = tx.objectStore('records'),
          request = store.get(content.key.toJS);
      request.onsuccess = ((web.Event _) {
        if (!ReadMarker.matches(
          request.result?.dartify(),
          scope,
          content,
          now,
        )) {
          store.put(ReadMarker(scope, content, now).toJson().jsify()!);
        }
      }).toJS;
    });
  }

  @override
  Future<int> prune(DateTime now, {int limit = 100}) async {
    if (limit <= 0) throw ArgumentError('Read prune limit');
    var removed = 0;
    await _transaction('readwrite', (tx) {
      final request = tx
          .objectStore('records')
          .index('retainUntil')
          .openCursor(
            web.IDBKeyRange.upperBound(now.millisecondsSinceEpoch.toJS),
          );
      request.onsuccess = ((web.Event _) {
        if (request.result == null || removed >= limit) return;
        final cursor = request.result as web.IDBCursorWithValue;
        cursor.delete();
        removed++;
        if (removed < limit) cursor.continue_();
      }).toJS;
    });
    return removed;
  }

  @override
  Future<void> erase() async {
    // Unlike ordinary transactions, repeated erasure must accept its own fence.
    final db = await _open(),
        tx = db.transaction(['meta', 'records'].jsify()!, 'readwrite');
    final done = Completer<void>();
    tx.oncomplete = ((web.Event _) {
      done.complete();
    }).toJS;
    tx.onabort = ((web.Event _) {
      if (!done.isCompleted) {
        done.completeError(StateError('Read erasure failed'));
      }
    }).toJS;
    tx.onerror = ((web.Event _) {
      if (!done.isCompleted) {
        done.completeError(StateError('Read erasure failed'));
      }
    }).toJS;
    tx.objectStore('meta').put(true.toJS, 'erased'.toJS);
    tx.objectStore('records').clear();
    await done.future;
  }

  @override
  Future<void> close() async {
    _closed = true;
    if (_opening != null) {
      try {
        (await _opening!).close();
      } catch (_) {}
    }
  }
}
