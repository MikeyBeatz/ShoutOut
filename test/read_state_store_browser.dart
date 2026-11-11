// Explicit Chrome suite; excluded from the native *_test.dart discovery.
import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';

import 'package:test/test.dart';
import 'package:web/web.dart' as web;
import 'package:shoutout/indexed_read_state_store.dart';
import 'package:shoutout/read_state_store.dart';

Future<web.IDBDatabase> open(String name) {
  final done = Completer<web.IDBDatabase>(),
      request = web.window.indexedDB.open(name);
  request.onsuccess = ((web.Event _) {
    done.complete(request.result as web.IDBDatabase);
  }).toJS;
  request.onerror = ((web.Event _) {
    done.completeError(StateError('Test database open'));
  }).toJS;
  return done.future;
}

Future<void> mutate(
  String name,
  void Function(web.IDBObjectStore) action,
) async {
  final db = await open(name),
      tx = db.transaction('records'.toJS, 'readwrite'),
      done = Completer<void>();
  tx.oncomplete = ((web.Event _) {
    done.complete();
  }).toJS;
  tx.onabort = ((web.Event _) {
    if (!done.isCompleted) done.completeError(StateError('Test transaction'));
  }).toJS;
  action(tx.objectStore('records'));
  await done.future;
  db.close();
}

Future<void> drop(String name) async {
  final done = Completer<void>(),
      request = web.window.indexedDB.deleteDatabase(name);
  request.onsuccess = ((web.Event _) {
    done.complete();
  }).toJS;
  request.onerror = ((web.Event _) {
    done.completeError(StateError('Test database cleanup'));
  }).toJS;
  await done.future;
}

void main() {
  var serial = 0;
  final now = DateTime.utc(2030, 1, 1),
      scope = ReadScope('local-test', 'reader');
  ReadContent item(int i) => ReadContent(
    shoutId: 'synthetic-$i',
    title: 'Title $i',
    text: 'Body',
    expiresAt: now.add(const Duration(days: 1)),
  );
  IndexedReadStateStore store({ReadScope? owner, String? prefix}) {
    final s = IndexedReadStateStore(
      owner ?? scope,
      prefix:
          prefix ??
          'b1-test-${DateTime.now().microsecondsSinceEpoch}-${serial++}',
    );
    addTearDown(() async {
      await s.close();
      await drop(s.name);
    });
    return s;
  }

  test(
    'IndexedDB persists completed markers across a closed and reopened connection',
    () async {
      final first = store();
      await first.put(item(0), now);
      await first.close();
      final second = IndexedReadStateStore(
        scope,
        prefix: first.name.substring(
          0,
          first.name.length - scope.databaseSuffix.length - 1,
        ),
      );
      addTearDown(second.close);
      expect(await second.contains(item(0), now), isTrue);
      expect(
        await second.contains(
          ReadContent(
            shoutId: 'synthetic-0',
            title: 'Changed',
            text: 'Body',
            expiresAt: item(0).expiresAt,
          ),
          now,
        ),
        isFalse,
      );
    },
  );
  test(
    'two IndexedDB connections merge concurrent marks and cannot write past an erasure fence',
    () async {
      final first = store(),
          prefix = first.name.substring(
            0,
            first.name.length - scope.databaseSuffix.length - 1,
          );
      final second = IndexedReadStateStore(scope, prefix: prefix);
      addTearDown(second.close);
      await Future.wait([
        first.put(item(0), now),
        second.put(item(1), now),
        first.put(item(1), now),
      ]);
      expect(await first.contains(item(1), now), isTrue);
      expect(await second.contains(item(0), now), isTrue);
      await Future.wait([
        first.erase(),
        second.put(item(2), now).catchError((_) {}),
      ]);
      await expectLater(second.put(item(3), now), throwsStateError);
      await first.erase(); // Idempotent even after the persistent fence.
    },
  );
  test(
    'UID/project namespaces remain independent even with the same source ID',
    () async {
      final prefix = 'b1-scope-${DateTime.now().microsecondsSinceEpoch}';
      final alice = store(prefix: prefix),
          bob = store(prefix: prefix, owner: ReadScope('local-test', 'bob'));
      final prod = store(
        prefix: prefix,
        owner: ReadScope('other-project', 'reader'),
      );
      await alice.put(item(0), now);
      expect(await bob.contains(item(0), now), isFalse);
      expect(await prod.contains(item(0), now), isFalse);
      await bob.erase();
      expect(await alice.contains(item(0), now), isTrue);
    },
  );
  test(
    'retention is logical at the deadline and physical cleanup uses bounded transactions',
    () async {
      final s = store();
      await Future.wait([s.put(item(0), now), s.put(item(1), now)]);
      final end = item(0).retainUntil;
      expect(
        await s.contains(
          item(0),
          end.subtract(const Duration(milliseconds: 1)),
        ),
        isTrue,
      );
      expect(await s.contains(item(0), end), isFalse);
      expect(await s.prune(end, limit: 1), 1);
      expect(await s.prune(end, limit: 1), 1);
      expect(await s.prune(end), 0);
    },
  );
  test(
    'a corrupt browser record is a miss and completion replaces it with a valid marker',
    () async {
      final s = store();
      await s.put(item(0), now);
      await mutate(
        s.name,
        (records) => records.put(
          {
            ...ReadMarker(scope, item(0), now).toJson(),
            'userId': 'wrong',
          }.jsify()!,
        ),
      );
      expect(await s.contains(item(0), now), isFalse);
      await s.put(item(0), now);
      expect(await s.contains(item(0), now), isTrue);
    },
  );
  test(
    'closing during database open cannot create an acknowledged late write',
    () async {
      final s = store(), pending = s.put(item(0), now);
      final rejection = expectLater(pending, throwsStateError);
      await s.close();
      await rejection;
    },
  );
  test(
    'startup cleans signed-out namespaces but preserves live data and erasure fences',
    () async {
      final suffix = '${DateTime.now().microsecondsSinceEpoch}';
      final firstScope = ReadScope('maintenance-test', 'expired-$suffix');
      final first = IndexedReadStateStore(firstScope);
      final second = IndexedReadStateStore(
        ReadScope('maintenance-test', 'active-$suffix'),
      );
      final erased = IndexedReadStateStore(
        ReadScope('maintenance-test', 'erased-$suffix'),
      );
      for (final s in [first, second, erased]) {
        addTearDown(() async {
          await s.close();
          await drop(s.name);
        });
      }
      final active = ReadContent(
        shoutId: 'active',
        title: 'Title',
        text: 'Body',
        expiresAt: now.add(const Duration(days: 4)),
      );
      await first.put(item(0), now);
      await second.put(active, now);
      await erased.put(item(0), now);
      await erased.erase();
      await first.close();
      final at = now.add(const Duration(days: 9));
      expect(await pruneIndexedReadNamespaces(at), 1);
      expect(await second.contains(active, at), isTrue);
      await expectLater(erased.put(active, now), throwsStateError);
      final reopened = IndexedReadStateStore(firstScope);
      addTearDown(reopened.close);
      expect(await reopened.prune(at), 0);
    },
  );

  test(
    'local-only metadata measurements at 100, 1000 and 10000 rows',
    () async {
      final measurements = <Map<String, Object>>[];
      for (final count in [100, 1000, 10000]) {
        final s = store();
        await s.prune(now);
        final rows = List.generate(
          count,
          (i) => ReadMarker(scope, item(i), now).toJson(),
        );
        final watch = Stopwatch()..start();
        await mutate(s.name, (records) {
          for (final row in rows) {
            records.put(row.jsify()!);
          }
        });
        final writeMs = watch.elapsedMilliseconds;
        watch.reset();
        expect(await s.contains(item(0), now), isTrue);
        expect(await s.contains(item(count - 1), now), isTrue);
        final lookupMs = watch.elapsedMilliseconds;
        watch.reset();
        var removed = 0, batch = 0;
        do {
          batch = await s.prune(item(0).retainUntil);
          removed += batch;
        } while (batch == 100);
        expect(removed, count);
        measurements.add({
          'rows': count,
          'jsonBytes': utf8.encode(jsonEncode(rows)).length,
          'seedMs': writeMs,
          'twoLookupsMs': lookupMs,
          'boundedPruneMs': watch.elapsedMilliseconds,
          'firestoreReads': 0,
          'firestoreWrites': 0,
        });
      }
      // Reproducible local evidence; not a cloud price estimate or disk-size guarantee.
      // ignore: avoid_print
      print('B1_LOCAL_METADATA ${jsonEncode(measurements)}');
    },
    timeout: const Timeout(Duration(minutes: 2)),
  );
  test(
    'B2 upgrade preserves v1 markers and durable queue after close/reopen',
    () async {
      final prefix = 'b2-migration-${serial++}';
      final name = '$prefix-${scope.databaseSuffix}';
      final ready = Completer<web.IDBDatabase>();
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
        ready.complete(request.result as web.IDBDatabase);
      }).toJS;
      final original = await ready.future;
      final tx = original.transaction('records'.toJS, 'readwrite'),
          saved = Completer<void>();
      tx.oncomplete = ((web.Event _) {
        saved.complete();
      }).toJS;
      tx
          .objectStore('records')
          .put(ReadMarker(scope, item(1), now).toJson().jsify()!);
      await saved.future;
      original.close();
      final s = IndexedReadStateStore(scope, prefix: prefix);
      expect((await s.pending(now)).length, 1);
      final batch = await s.pending(now);
      await s.close();
      final reopened = IndexedReadStateStore(scope, prefix: prefix);
      expect(
        (await reopened.pending(now)).single.readAtLocal,
        now.millisecondsSinceEpoch,
      );
      await reopened.acknowledge(batch, now);
      expect(await reopened.pending(now), isEmpty);
      expect(await reopened.contains(item(1), now), isTrue);
      await reopened.close();
      final finalStore = IndexedReadStateStore(scope, prefix: prefix);
      expect(await finalStore.contains(item(1), now), isTrue);
      expect(await finalStore.pending(now), isEmpty);
      await finalStore.close();
      await drop(name);
    },
  );
  test(
    'B2 downloaded history is clean, deferred entries do not starve queue, erasure fences all stores',
    () async {
      final s = store(), other = store(prefix: 'other-${serial++}');
      await s.put(item(1), now);
      await s.put(item(2), now);
      final batch = await s.pending(now);
      await s.defer([batch.first], now.add(const Duration(minutes: 1)));
      expect((await s.pending(now)).length, 1);
      await other.merge(batch, now);
      expect(await other.pending(now), isEmpty);
      expect(await other.contains(batch.first.content, now), isTrue);
      expect((await s.pending(now.add(const Duration(minutes: 1)))).length, 2);
      await s.erase();
      await expectLater(s.merge(batch, now), throwsStateError);
      await expectLater(s.pending(now), throwsStateError);
      expect(await other.contains(batch.first.content, now), isTrue);
    },
  );
}
