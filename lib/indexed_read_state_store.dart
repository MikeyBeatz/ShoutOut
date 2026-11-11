import 'dart:async';
import 'dart:js_interop';
import 'package:web/web.dart' as web;
import 'read_state_store.dart';

/// Expired metadata also needs cleanup when its former owner does not log in
/// again. Never return another namespace's rows to the active viewer.
Future<int> pruneIndexedReadNamespaces(DateTime now) async {
  final names = await web.window.indexedDB.databases().toDart;
  var total = 0;
  for (final info in names.toDart) {
    final name = info.name;
    if (!RegExp(r'^shoutout-read-v1-[a-f0-9]{64}$').hasMatch(name)) {
      continue;
    }
    final opened = Completer<web.IDBDatabase>();
    final request = web.window.indexedDB.open(name);
    request.onupgradeneeded = ((web.Event _) {
      request.transaction?.abort();
    }).toJS;
    request.onsuccess = ((web.Event _) {
      opened.complete(request.result as web.IDBDatabase);
    }).toJS;
    request.onerror = ((web.Event _) {
      opened.completeError(StateError('Read maintenance open failed'));
    }).toJS;
    web.IDBDatabase? db;
    try {
      db = await opened.future;
      if (!db.objectStoreNames.contains('records')) continue;
      int removed;
      do {
        removed = 0;
        final hasQueue = db.objectStoreNames.contains('outbox');
        final tx = db.transaction(
              (hasQueue ? ['records', 'outbox'] : ['records']).jsify()!,
              'readwrite',
            ),
            done = Completer<void>();
        tx.oncomplete = ((web.Event _) {
          done.complete();
        }).toJS;
        void failed(web.Event _) {
          if (!done.isCompleted) {
            done.completeError(StateError('Read maintenance failed'));
          }
        }

        tx.onabort = failed.toJS;
        tx.onerror = failed.toJS;
        final cursor = tx
            .objectStore('records')
            .index('retainUntil')
            .openCursor(
              web.IDBKeyRange.upperBound(now.millisecondsSinceEpoch.toJS),
            );
        cursor.onsuccess = ((web.Event _) {
          if (cursor.result == null || removed >= 100) return;
          final row = cursor.result as web.IDBCursorWithValue;
          if (hasQueue) tx.objectStore('outbox').delete(row.primaryKey);
          row.delete();
          removed++;
          if (removed < 100) row.continue_();
        }).toJS;
        await done.future;
        total += removed;
        if (removed == 100) await Future<void>.delayed(Duration.zero);
      } while (removed == 100);
    } catch (_) {
      // A concurrently removed/upgraded namespace must not block startup.
    } finally {
      db?.close();
    }
  }
  return total;
}

class IndexedReadStateStore implements ReadSyncStore {
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
    final request = web.window.indexedDB.open(name, 2);
    request.onupgradeneeded = ((web.Event _) {
      final db = request.result as web.IDBDatabase;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('records')) {
        db
            .createObjectStore(
              'records',
              web.IDBObjectStoreParameters(keyPath: 'key'.toJS),
            )
            .createIndex('retainUntil', 'retainUntil'.toJS);
      }
      final queue = db.createObjectStore(
        'outbox',
        web.IDBObjectStoreParameters(keyPath: 'key'.toJS),
      );
      queue.createIndex('nextAttemptAt', 'nextAttemptAt'.toJS);
      // The upgrade and backfill are one transaction; interrupted upgrades
      // cannot leave v1 pending records without their persistent queue.
      final cursor = request.transaction!.objectStore('records').openCursor();
      cursor.onsuccess = ((web.Event _) {
        if (cursor.result == null) return;
        final row = cursor.result as web.IDBCursorWithValue;
        final data = row.value.dartify();
        if (data is Map && data['pendingSync'] == true) {
          queue.put({...data, 'nextAttemptAt': 0}.jsify()!);
        }
        row.continue_();
      }).toJS;
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
    final tx = db.transaction(['meta', 'records', 'outbox'].jsify()!, mode);
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
          final row = ReadMarker(scope, content, now).toJson().jsify()!;
          store.put(row);
          tx
              .objectStore('outbox')
              .put(
                {
                  ...ReadMarker(scope, content, now).toJson(),
                  'nextAttemptAt': 0,
                }.jsify()!,
              );
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
        tx.objectStore('outbox').delete(cursor.primaryKey);
        cursor.delete();
        removed++;
        if (removed < limit) cursor.continue_();
      }).toJS;
    });
    return removed;
  }

  @override
  Future<List<ReadUpload>> pending(DateTime now, {int limit = 32}) async {
    if (limit < 1 || limit > 32) throw ArgumentError('Read batch limit');
    final found = <ReadUpload>[];
    await _transaction('readwrite', (tx) {
      final request = tx
          .objectStore('outbox')
          .index('nextAttemptAt')
          .openCursor(
            web.IDBKeyRange.upperBound(now.millisecondsSinceEpoch.toJS),
          );
      request.onsuccess = ((web.Event _) {
        if (request.result == null || found.length >= limit) return;
        final cursor = request.result as web.IDBCursorWithValue;
        final get = tx.objectStore('records').get(cursor.primaryKey);
        get.onsuccess = ((web.Event _) {
          final data = get.result?.dartify();
          final row = ReadUpload.parse(data, scope, now);
          if (row != null && data is Map && data['pendingSync'] == true) {
            found.add(row);
          } else {
            cursor.delete();
          }
          if (found.length < limit) cursor.continue_();
        }).toJS;
      }).toJS;
    });
    return found;
  }

  @override
  Future<void> defer(List<ReadUpload> rows, DateTime until) async {
    await _transaction('readwrite', (tx) {
      for (final row in rows) {
        final request = tx.objectStore('outbox').get(row.content.key.toJS);
        request.onsuccess = ((web.Event _) {
          final data = request.result?.dartify();
          if (data is Map && data['readAtLocal'] == row.readAtLocal) {
            tx
                .objectStore('outbox')
                .put(
                  {
                    ...data,
                    'nextAttemptAt': until.millisecondsSinceEpoch,
                  }.jsify()!,
                );
          }
        }).toJS;
      }
    });
  }

  @override
  Future<void> acknowledge(List<ReadUpload> rows, DateTime now) async {
    await _transaction('readwrite', (tx) {
      for (final row in rows) {
        final request = tx.objectStore('records').get(row.content.key.toJS);
        request.onsuccess = ((web.Event _) {
          final data = request.result?.dartify();
          if (ReadMarker.matches(data, scope, row.content, now) &&
              (data as Map)['readAtLocal'] == row.readAtLocal) {
            tx
                .objectStore('records')
                .put({...data, 'pendingSync': false}.jsify()!);
            tx.objectStore('outbox').delete(row.content.key.toJS);
          }
        }).toJS;
      }
    });
  }

  @override
  Future<void> merge(List<ReadUpload> rows, DateTime now) async {
    await _transaction('readwrite', (tx) {
      for (final row in rows) {
        if (!now.isBefore(row.content.retainUntil)) continue;
        final request = tx.objectStore('records').get(row.content.key.toJS);
        request.onsuccess = ((web.Event _) {
          if (ReadMarker.matches(
            request.result?.dartify(),
            scope,
            row.content,
            now,
          )) {
            return;
          }
          tx
              .objectStore('records')
              .put(
                {
                  ...ReadMarker(
                    scope,
                    row.content,
                    DateTime.fromMillisecondsSinceEpoch(row.readAtLocal),
                  ).toJson(),
                  'pendingSync': false,
                }.jsify()!,
              );
        }).toJS;
      }
    });
  }

  @override
  Future<void> erase() async {
    // Unlike ordinary transactions, repeated erasure must accept its own fence.
    final db = await _open(),
        tx = db.transaction(
          ['meta', 'records', 'outbox'].jsify()!,
          'readwrite',
        );
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
    tx.objectStore('records').clear();
    tx.objectStore('outbox').clear();
    tx.objectStore('meta').put(true.toJS, 'erased'.toJS);
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
