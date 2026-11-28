import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';
import 'package:crypto/crypto.dart';
import 'package:web/web.dart' as web;
import 'business_logo_pending_store.dart';

/// Separate from read-state DB: no schema migration of existing user marks.
class IndexedBusinessLogoStore implements BusinessLogoPendingStore {
  IndexedBusinessLogoStore(String project)
    : name =
          'shoutout-business-logo-v1-${sha256.convert(utf8.encode(project))}';
  final String name;
  Future<web.IDBDatabase> _open() async {
    final done = Completer<web.IDBDatabase>();
    final r = web.window.indexedDB.open(name, 1);
    r.onupgradeneeded = ((web.Event _) {
      final db = r.result as web.IDBDatabase;
      db
          .createObjectStore('pending')
          .createIndex('expiresAt', 'expiresAt'.toJS);
      db.createObjectStore('erased');
    }).toJS;
    r.onsuccess = ((web.Event _) {
      if (done.isCompleted) {
        (r.result as web.IDBDatabase).close();
      } else {
        done.complete(r.result as web.IDBDatabase);
      }
    }).toJS;
    r.onerror = ((web.Event _) {
      if (!done.isCompleted) {
        done.completeError(StateError('Logo database unavailable'));
      }
    }).toJS;
    r.onblocked = ((web.Event _) {
      if (!done.isCompleted) {
        done.completeError(StateError('Logo database blocked'));
      }
    }).toJS;
    return done.future;
  }

  // Every mutation and its returned binding commit in one IndexedDB transaction.
  Future<T> _access<T>(
    String uid,
    T Function(web.IDBObjectStore, JSAny?) action, {
    bool allowErased = false,
  }) async {
    final db = await _open();
    final done = Completer<T>();
    final tx = db.transaction(['pending', 'erased'].jsify()!, 'readwrite');
    T? result;
    Object? error;
    tx.oncomplete = ((web.Event _) {
      if (!done.isCompleted) done.complete(result as T);
    }).toJS;
    void failed(web.Event _) {
      if (!done.isCompleted) {
        done.completeError(error ?? StateError('Logo transaction failed'));
      }
    }

    tx.onabort = failed.toJS;
    tx.onerror = failed.toJS;
    final erased = tx.objectStore('erased').get(uid.toJS);
    erased.onsuccess = ((web.Event _) {
      if (!allowErased && erased.result?.dartify() == true) {
        error = StateError('Logo account erased');
        tx.abort();
        return;
      }
      final store = tx.objectStore('pending'), r = store.get(uid.toJS);
      r.onsuccess = ((web.Event _) {
        try {
          result = action(store, r.result);
        } catch (e) {
          error = e;
          tx.abort();
        }
      }).toJS;
    }).toJS;
    try {
      return await done.future;
    } finally {
      db.close();
    }
  }

  Map<String, dynamic>? _row(JSAny? value) =>
      value == null ? null : Map<String, dynamic>.from(value.dartify() as Map);
  @override
  Future<Map<String, dynamic>?> read(String uid) =>
      _access(uid, (_, raw) => _row(raw));
  @override
  Future<Map<String, dynamic>> insert(String uid, Map<String, dynamic> row) =>
      _access(uid, (store, raw) {
        final result = _row(raw) ?? row;
        if (raw == null) store.put(result.jsify(), uid.toJS);
        return result;
      });
  @override
  Future<Map<String, dynamic>> bind(
    String uid,
    String key,
    Map<String, dynamic> binding,
  ) => _access(uid, (store, raw) {
    final row = _row(raw);
    if (row == null || row['key'] != key) {
      throw StateError('Logo request retired');
    }
    row['binding'] ??= binding;
    store.put(row.jsify(), uid.toJS);
    return Map<String, dynamic>.from(row['binding'] as Map);
  });
  @override
  Future<void> remove(String uid, String key) =>
      _access<void>(uid, (store, raw) {
        if (_row(raw)?['key'] == key) store.delete(uid.toJS);
      }, allowErased: true);
  @override
  Future<void> erase(String uid) async {
    final db = await _open(), done = Completer<void>();
    final tx = db.transaction(['pending', 'erased'].jsify()!, 'readwrite');
    tx.oncomplete = ((web.Event _) {
      done.complete();
    }).toJS;
    void failed(web.Event _) {
      if (!done.isCompleted) {
        done.completeError(StateError('Logo erase failed'));
      }
    }

    tx.onabort = failed.toJS;
    tx.onerror = failed.toJS;
    tx.objectStore('pending').delete(uid.toJS);
    tx.objectStore('erased').put(true.toJS, uid.toJS);
    try {
      await done.future;
    } finally {
      db.close();
    }
  }

  @override
  Future<void> prune(int nowMillis) async {
    final db = await _open(), done = Completer<void>();
    final tx = db.transaction('pending'.toJS, 'readwrite');
    tx.oncomplete = ((web.Event _) {
      done.complete();
    }).toJS;
    void failed(web.Event _) {
      if (!done.isCompleted) {
        done.completeError(StateError('Logo prune failed'));
      }
    }

    tx.onabort = failed.toJS;
    tx.onerror = failed.toJS;
    final r = tx
        .objectStore('pending')
        .index('expiresAt')
        .openCursor(web.IDBKeyRange.upperBound(nowMillis.toJS));
    var removed = 0;
    r.onsuccess = ((web.Event _) {
      if (r.result == null) return;
      final cursor = r.result as web.IDBCursorWithValue;
      final row = _row(cursor.value), until = row?['expiresAt'];
      if (until is! int || until <= nowMillis) {
        cursor.delete();
        removed++;
      }
      if (removed < 50) cursor.continue_();
    }).toJS;
    try {
      await done.future;
    } finally {
      db.close();
    }
  }
}
