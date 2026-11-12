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
    final request = web.window.indexedDB.open(name, 3);
    request.onupgradeneeded = ((web.Event _) {
      try {
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
        final tx = request.transaction!;
        final queue = db.objectStoreNames.contains('outbox')
            ? tx.objectStore('outbox')
            : db.createObjectStore(
                'outbox',
                web.IDBObjectStoreParameters(keyPath: 'key'.toJS),
              );
        if (!queue.indexNames.contains('nextAttemptAt')) {
          queue.createIndex('nextAttemptAt', 'nextAttemptAt'.toJS);
        }
        queue.createIndex(
          'sequence',
          'sequence'.toJS,
          web.IDBIndexParameters(unique: true),
        );
        // Every migration write is in this version-change transaction. Preserve
        // old deferred times, rebuild the queue from canonical pending records.
        void guard(void Function() action) {
          try {
            action();
          } catch (_) {
            tx.abort();
          }
        }

        final meta = tx.objectStore('meta'),
            records = tx.objectStore('records');
        final erased = meta.get('erased'.toJS);
        _success(erased, guard, () {
          if (erased.result?.dartify() == true) {
            records.clear();
            queue.clear();
            meta.clear();
            meta.put(true.toJS, 'erased'.toJS);
            return;
          }
          final oldQueue = queue.getAll();
          _success(oldQueue, guard, () {
            final deferred = <String, int>{};
            final old = oldQueue.result.dartify();
            if (old is List) {
              for (final raw in old) {
                if (raw is Map &&
                    raw['key'] is String &&
                    validReadSequence(raw['nextAttemptAt'])) {
                  deferred[raw['key'] as String] = raw['nextAttemptAt'] as int;
                }
              }
            }
            queue.clear();
            meta.clear();
            var sequence = 0;
            final cursor = records.openCursor();
            _success(cursor, guard, () {
              if (cursor.result == null) {
                meta.put(sequence.toJS, 'sequence'.toJS);
                meta.put(0.toJS, 'syncEpoch'.toJS);
                return;
              }
              final row = cursor.result as web.IDBCursorWithValue;
              final data = row.value.dartify();
              if (data is Map && data['pendingSync'] == true) {
                if (sequence >= readSequenceMaximum) {
                  throw StateError('Read sequence exhausted');
                }
                queue.put(
                  {
                    ...data,
                    'sequence': ++sequence,
                    'nextAttemptAt': deferred[data['key']] ?? 0,
                  }.jsify()!,
                );
              }
              row.continue_();
            });
          });
        });
      } catch (_) {
        request.transaction?.abort();
      }
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
      // Older connections must close on versionchange. Never drop their data
      // merely because an upgrade is temporarily blocked.
    }).toJS;
    return done.future;
  }

  Future<void> _transaction(
    String mode,
    void Function(web.IDBTransaction tx) body,
  ) => _guardedTransaction(mode, (tx, _) => body(tx));

  static void _success(
    web.IDBRequest request,
    void Function(void Function()) guard,
    void Function() body,
  ) {
    request.onsuccess = ((web.Event _) {
      guard(body);
    }).toJS;
  }

  Future<void> _guardedTransaction(
    String mode,
    void Function(web.IDBTransaction tx, void Function(void Function()) guard)
    body,
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
        body(tx, guarded);
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
    await _guardedTransaction('readwrite', (tx, guard) {
      final store = tx.objectStore('records'),
          request = store.get(content.key.toJS);
      _success(request, guard, () {
        if (!ReadMarker.matches(
          request.result?.dartify(),
          scope,
          content,
          now,
        )) {
          final meta = tx.objectStore('meta'), get = meta.get('sequence'.toJS);
          _success(get, guard, () {
            final sequence = _counter(get.result.dartify());
            if (sequence >= readSequenceMaximum) {
              throw StateError('Read sequence exhausted');
            }
            final row = ReadMarker(scope, content, now).toJson();
            store.put(row.jsify()!);
            tx
                .objectStore('outbox')
                .put(
                  {
                    ...row,
                    'nextAttemptAt': 0,
                    'sequence': sequence + 1,
                  }.jsify()!,
                );
            meta.put((sequence + 1).toJS, 'sequence'.toJS);
          });
        }
      });
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
    tx.objectStore('meta').clear();
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

  static int _counter(Object? raw) {
    if (!validReadSequence(raw)) throw StateError('Invalid local read counter');
    return raw as int;
  }

  @override
  Future<ReadSyncCheckpoint> beginSync({int? knownRevision}) async {
    late ReadSyncCheckpoint result;
    await _guardedTransaction('readwrite', (tx, guard) {
      final meta = tx.objectStore('meta'), sequence = meta.get('sequence'.toJS);
      _success(sequence, guard, () {
        final boundary = _counter(sequence.result.dartify()),
            epoch = meta.get('syncEpoch'.toJS);
        _success(epoch, guard, () {
          final version = _counter(epoch.result.dartify()),
              get = meta.get('syncCheckpoint'.toJS);
          _success(get, guard, () {
            final previous = ReadSyncCheckpoint.parse(
              get.result?.dartify(),
              scope,
            );
            result = nextReadSync(previous, version, boundary, knownRevision);
            meta.put(result.epoch.toJS, 'syncEpoch'.toJS);
            meta.put(result.toJson(scope).jsify()!, 'syncCheckpoint'.toJS);
          });
        });
      });
    });
    return result;
  }

  void _checkCheckpoint(
    web.IDBTransaction tx,
    void Function(void Function()) guard,
    ReadSyncCheckpoint expected,
    void Function() body,
  ) {
    final request = tx.objectStore('meta').get('syncCheckpoint'.toJS);
    _success(request, guard, () {
      if (!expected.same(
        ReadSyncCheckpoint.parse(request.result?.dartify(), scope),
      )) {
        throw ReadSyncConflict();
      }
      body();
    });
  }

  @override
  Future<ReadQueuePage> queuePage(
    ReadSyncCheckpoint checkpoint,
    DateTime now, {
    int limit = 32,
  }) async {
    if (limit < 1 || limit > 32) throw ArgumentError('Read batch limit');
    final items = <ReadUpload>[];
    var after = checkpoint.after, scanned = 0, deferred = false, done = false;
    await _guardedTransaction('readwrite', (tx, guard) {
      _checkCheckpoint(tx, guard, checkpoint, () {
        if (after >= checkpoint.boundary) {
          done = true;
          return;
        }
        final request = tx
            .objectStore('outbox')
            .index('sequence')
            .openCursor(
              web.IDBKeyRange.bound(after.toJS, checkpoint.boundary.toJS, true),
            );
        _success(request, guard, () {
          if (request.result == null) {
            done = true;
            after = checkpoint.boundary;
            return;
          }
          if (scanned >= limit) return;
          final cursor = request.result as web.IDBCursorWithValue;
          final raw = cursor.value.dartify();
          if (raw is! Map ||
              !validReadSequence(raw['sequence']) ||
              raw['sequence'] == 0) {
            throw StateError('Invalid read outbox sequence');
          }
          after = raw['sequence'] as int;
          scanned++;
          final get = tx.objectStore('records').get(cursor.primaryKey);
          _success(get, guard, () {
            final data = get.result?.dartify(),
                row = ReadUpload.parse(data, scope, now);
            if (row == null || data is! Map || data['pendingSync'] != true) {
              cursor.delete();
            } else if (!validReadSequence(raw['nextAttemptAt'])) {
              throw StateError('Invalid read outbox delay');
            } else if (now.millisecondsSinceEpoch <
                (raw['nextAttemptAt'] as int)) {
              deferred = true;
            } else {
              items.add(
                ReadUpload(row.content, row.readAtLocal, sequence: after),
              );
            }
            if (scanned < limit) {
              cursor.continue_();
            } else if (after == checkpoint.boundary) {
              done = true;
            }
          });
        });
      });
    });
    return ReadQueuePage(
      items,
      after: after,
      done: done,
      deferred: deferred,
      scanned: scanned,
    );
  }

  @override
  Future<void> commitSync(
    ReadSyncCheckpoint expected,
    ReadSyncCheckpoint next,
    DateTime now, {
    List<ReadUpload> acknowledged = const [],
    List<ReadUpload> deferred = const [],
    List<ReadUpload> imported = const [],
  }) async {
    if (next.epoch != expected.epoch ||
        next.boundary != expected.boundary ||
        next.after < expected.after ||
        ReadSyncCheckpoint.parse(next.toJson(scope), scope) == null) {
      throw ReadSyncConflict();
    }
    await _guardedTransaction('readwrite', (tx, guard) {
      _checkCheckpoint(tx, guard, expected, () {
        final records = tx.objectStore('records'),
            queue = tx.objectStore('outbox');
        for (final row in acknowledged) {
          final get = queue.get(row.content.key.toJS);
          _success(get, guard, () {
            final queued = get.result?.dartify();
            if (queued is! Map || queued['sequence'] != row.sequence) return;
            final read = records.get(row.content.key.toJS);
            _success(read, guard, () {
              final data = read.result?.dartify();
              if (ReadMarker.matches(data, scope, row.content, now) &&
                  (data as Map)['readAtLocal'] == row.readAtLocal) {
                records.put({...data, 'pendingSync': false}.jsify()!);
                queue.delete(row.content.key.toJS);
              }
            });
          });
        }
        for (final row in deferred) {
          final get = queue.get(row.content.key.toJS);
          _success(get, guard, () {
            final data = get.result?.dartify();
            if (data is Map && data['sequence'] == row.sequence) {
              queue.put(
                {
                  ...data,
                  'nextAttemptAt': now
                      .add(const Duration(minutes: 1))
                      .millisecondsSinceEpoch,
                }.jsify()!,
              );
            }
          });
        }
        for (final row in imported) {
          if (!now.isBefore(row.content.retainUntil)) continue;
          final get = records.get(row.content.key.toJS);
          _success(get, guard, () {
            if (ReadMarker.matches(
              get.result?.dartify(),
              scope,
              row.content,
              now,
            )) {
              return;
            }
            records.put(
              {
                ...ReadMarker(
                  scope,
                  row.content,
                  DateTime.fromMillisecondsSinceEpoch(row.readAtLocal),
                ).toJson(),
                'pendingSync': false,
              }.jsify()!,
            );
            queue.delete(row.content.key.toJS);
          });
        }
        if (next.finished) {
          tx.objectStore('meta').delete('syncCheckpoint'.toJS);
        } else {
          tx
              .objectStore('meta')
              .put(next.toJson(scope).jsify()!, 'syncCheckpoint'.toJS);
        }
      });
    });
  }
}
