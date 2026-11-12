import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/read_state_store.dart';
import 'package:shoutout/read_sync_controller.dart';
import 'package:shoutout/read_tracking_controller.dart';

void main() {
  final now = DateTime.utc(2030, 1, 1), scope = ReadScope('dev', 'alice');
  ReadContent item(int i) => ReadContent(
    shoutId: 'item-$i',
    title: 'Title $i',
    text: 'Body',
    expiresAt: now.add(const Duration(days: 1)),
  );
  Map<String, Object?> ack(
    Map<String, Object?> request, {
    String status = 'accepted',
  }) => {
    'version': 1,
    'revision': 1,
    'items': (request['items'] as List)
        .map((r) => {...r as Map, 'status': status})
        .toList(),
  };
  Map<String, Object?> remote(ReadContent c) => {
    ...ReadUpload(c, now.millisecondsSinceEpoch).toPayload(),
    'retainUntil': c.retainUntil.millisecondsSinceEpoch,
    'confirmedAt': now.millisecondsSinceEpoch,
  };
  const empty = {'version': 1, 'revision': 1, 'items': [], 'next': null};

  test(
    'overlapping foreground and refresh events coalesce into one follow-up pull',
    () async {
      final store = MemoryReadStateStore(scope), gate = Completer<Object?>();
      var pulls = 0;
      final sync = ReadSyncController(
        scope: scope,
        store: store,
        currentScope: () => scope,
        clock: () => now,
        upload: (r) async => ack(r),
        download: (_) {
          pulls++;
          return pulls == 1 ? gate.future : Future.value(empty);
        },
      )..setActive(true);
      addTearDown(sync.dispose);
      final first = sync.synchronize();
      await Future<void>.delayed(Duration.zero);
      final more = [sync.synchronize(), sync.synchronize(), sync.synchronize()];
      gate.complete(empty);
      await Future.wait([first, ...more]);
      expect(pulls, 2);
    },
  );

  test(
    'bounded server work shrinks a batch without acknowledging or losing queued marks',
    () async {
      final store = MemoryReadStateStore(scope);
      for (var i = 0; i < 32; i++) {
        await store.put(item(i), now);
      }
      final sizes = <int>[];
      final sync = ReadSyncController(
        scope: scope,
        store: store,
        currentScope: () => scope,
        clock: () => now,
        upload: (request) async {
          final length = (request['items'] as List).length;
          sizes.add(length);
          if (length > 16) throw ReadSyncBatchTooLarge();
          return ack(request);
        },
        download: (_) async => empty,
      )..setActive(true);
      addTearDown(sync.dispose);
      await sync.synchronize();
      expect(sync.lastError, isNull);
      expect(sizes, [32, 16, 16]);
      expect(await store.pending(now), isEmpty);
      expect(sync.synchronizationComplete, isTrue);
    },
  );

  test(
    'only complete consistent downloads authorize a known-revision shortcut',
    () async {
      final store = MemoryReadStateStore(scope);
      var count = 0;
      final payloads = <Map<String, Object?>>[];
      final sync = ReadSyncController(
        scope: scope,
        store: store,
        currentScope: () => scope,
        clock: () => now,
        upload: (r) async => ack(r),
        download: (request) async {
          payloads.add(request);
          count++;
          if (count == 1) {
            return {
              ...empty,
              'items': [remote(item(1))],
            };
          }
          if (count == 2) return {...empty, 'unchanged': true};
          if (count == 3) return {...empty, 'revision': 2, 'next': 'progress'};
          return {...empty, 'revision': 3};
        },
      )..setActive(true);
      addTearDown(sync.dispose);
      await sync.synchronize();
      expect(sync.snapshotComplete, isTrue);
      expect(payloads.first.containsKey('knownRevision'), isFalse);
      await sync.synchronize();
      expect(payloads[1]['knownRevision'], 1);
      await sync.synchronize();
      expect(sync.lastError, isNotNull);
      expect(sync.snapshotComplete, isFalse);
    },
  );

  test(
    'prepared session binding stays dormant by default; injected sync runs at startup or refresh, not resume',
    () async {
      final dormant = ReadSessions(storeFactory: MemoryReadStateStore.new)
        ..configure('dev');
      dormant.retainViewer('alice');
      expect(dormant.value!.sync, isNull);
      dormant.dispose();
      late ReadSessions sessions;
      var uploads = 0, downloads = 0;
      sessions = ReadSessions(
        storeFactory: MemoryReadStateStore.new,
        syncFactory: (owner, store, merged) => ReadSyncController(
          scope: owner,
          store: store,
          currentScope: () => sessions.value?.scope,
          clock: () => now,
          onMerged: merged,
          upload: (request) async {
            uploads++;
            return ack(request);
          },
          download: (_) async {
            downloads++;
            return {
              ...empty,
              'items': [remote(item(5))],
            };
          },
        ),
      )..configure('dev');
      addTearDown(sessions.dispose);
      sessions.retainViewer('alice');
      await sessions.synchronize();
      expect(downloads, greaterThanOrEqualTo(1));
      expect(sessions.value!.contains(item(5)), isTrue);
      sessions.value!.mark(item(1));
      await sessions.value!.retry();
      await sessions.synchronize();
      expect(uploads, 1);
      sessions.setForeground(false);
      final oldCount = downloads;
      await sessions.synchronize();
      expect(downloads, oldCount);
      sessions.setForeground(true);
      await Future<void>.delayed(Duration.zero);
      expect(downloads, oldCount);
      await sessions.synchronize();
      expect(downloads, greaterThan(oldCount));
    },
  );

  test('acknowledged markers stay read without becoming dirty again', () async {
    final store = MemoryReadStateStore(scope), c = item(1);
    await store.put(c, now);
    final before = store.rows[c.key]!['readAtLocal'];
    final batch = await store.pending(now);
    await store.acknowledge(batch, now);
    expect(await store.contains(c, now), isTrue);
    expect(await store.pending(now), isEmpty);
    await store.put(c, now.add(const Duration(hours: 1)));
    expect(store.rows[c.key]!['readAtLocal'], before);
    expect(await store.pending(now), isEmpty);
  });
  test(
    'lost reply preserves durable queue; retry settles exact old keys',
    () async {
      final store = MemoryReadStateStore(scope);
      await store.put(item(1), now);
      var attempts = 0;
      final sync = ReadSyncController(
        scope: scope,
        store: store,
        currentScope: () => scope,
        clock: () => now,
        upload: (request) async {
          if (++attempts == 1) throw StateError('lost reply after commit');
          return ack(request);
        },
        download: (_) async => empty,
      )..setActive(true);
      addTearDown(sync.dispose);
      await sync.synchronize();
      expect(sync.lastError, isNotNull);
      expect((await store.pending(now)).length, 1);
      await sync.synchronize();
      expect(sync.lastError, isNull);
      expect(await store.pending(now), isEmpty);
      expect(await store.contains(item(1), now), isTrue);
    },
  );
  test(
    'download handles empty nonfinal pages, >50 records and preserves source key versions',
    () async {
      final store = MemoryReadStateStore(scope);
      var page = 0;
      final sync = ReadSyncController(
        scope: scope,
        store: store,
        currentScope: () => scope,
        clock: () => now,
        upload: (request) async => ack(request),
        download: (_) async {
          page++;
          return page == 1
              ? {...empty, 'next': 'next'}
              : {...empty, 'items': List.generate(70, (i) => remote(item(i)))};
        },
      )..setActive(true);
      addTearDown(sync.dispose);
      await sync.synchronize();
      expect(sync.lastError, isNull);
      expect(page, 2);
      expect(store.rows.length, 70);
      expect(await store.pending(now), isEmpty);
      expect(await store.contains(item(69), now), isTrue);
      final edited = ReadContent(
        shoutId: item(69).shoutId,
        title: 'Edited',
        text: 'Body',
        expiresAt: item(69).expiresAt,
      );
      expect(await store.contains(edited, now), isFalse);
    },
  );
  test(
    'UID change, erasure and disposal fence delayed replies before local acknowledgement',
    () async {
      for (final mode in ['uid', 'erase', 'dispose']) {
        final store = MemoryReadStateStore(scope);
        await store.put(item(1), now);
        final delayed = Completer<Object?>();
        ReadScope? current = scope;
        Map<String, Object?>? sent;
        final sync = ReadSyncController(
          scope: scope,
          store: store,
          currentScope: () => current,
          clock: () => now,
          upload: (request) {
            sent = request;
            return delayed.future;
          },
          download: (_) async => empty,
        )..setActive(true);
        final result = sync.synchronize();
        await Future<void>.delayed(Duration.zero);
        if (mode == 'uid') current = ReadScope('dev', 'bob');
        if (mode == 'erase') await store.erase();
        if (mode == 'dispose') sync.dispose();
        delayed.complete(ack(sent!));
        await result;
        if (mode != 'erase') expect((await store.pending(now)).length, 1);
        sync.dispose();
      }
    },
  );
  test(
    'invalid partial acknowledgement settles nothing, deferred rows do not starve later rows',
    () async {
      final store = MemoryReadStateStore(scope);
      for (var i = 0; i < 35; i++) {
        await store.put(item(i), now);
      }
      var broken = true;
      final sync = ReadSyncController(
        scope: scope,
        store: store,
        currentScope: () => scope,
        clock: () => now,
        upload: (request) async => broken
            ? {...ack(request), 'items': []}
            : {
                ...ack(request),
                'items': (request['items'] as List)
                    .map(
                      (raw) => {
                        ...raw as Map,
                        'status':
                            int.parse(
                                  (raw['shoutId'] as String).split('-').last,
                                ) <
                                32
                            ? 'deferred'
                            : 'accepted',
                      },
                    )
                    .toList(),
              },
        download: (_) async => empty,
      )..setActive(true);
      addTearDown(sync.dispose);
      await sync.synchronize();
      expect((await store.pending(now)).length, 32);
      broken = false;
      await sync.synchronize();
      expect(await store.pending(now), isEmpty);
      expect(sync.uploadComplete, isFalse);
      expect(sync.snapshotComplete, isTrue);
      expect(sync.synchronizationComplete, isFalse);
      expect(
        (await store.pending(now.add(const Duration(minutes: 1)))).length,
        32,
      );
    },
  );
  test(
    'two independent local devices merge cloud marks without re-uploading downloaded history',
    () async {
      final cloud = <String, Map<String, Object?>>{};
      final stores = [MemoryReadStateStore(scope), MemoryReadStateStore(scope)];
      final clients = stores
          .map(
            (store) => ReadSyncController(
              scope: scope,
              store: store,
              currentScope: () => scope,
              clock: () => now,
              upload: (request) async {
                for (final row in request['items'] as List) {
                  final r = row as Map;
                  cloud.putIfAbsent(
                    r['shoutId'] as String,
                    () => {
                      ...Map<String, Object?>.from(r),
                      'retainUntil':
                          (r['expiresAt'] as int) +
                          const Duration(days: 7).inMilliseconds,
                      'confirmedAt': now.millisecondsSinceEpoch,
                    },
                  );
                }
                return ack(request);
              },
              download: (_) async => {...empty, 'items': cloud.values.toList()},
            )..setActive(true),
          )
          .toList();
      addTearDown(() {
        for (final c in clients) {
          c.dispose();
        }
      });
      await stores[0].put(item(0), now);
      await stores[1].put(item(1), now);
      await clients[0].synchronize();
      await clients[1].synchronize();
      await clients[0].synchronize();
      for (final store in stores) {
        expect(store.rows.length, 2);
        expect(await store.pending(now), isEmpty);
      }
    },
  );
  testWidgets(
    'local marks and foreground changes never initiate network synchronization',
    (tester) async {
      final store = MemoryReadStateStore(scope);
      await store.put(item(1), now);
      var uploads = 0;
      final sync = ReadSyncController(
        scope: scope,
        store: store,
        currentScope: () => scope,
        clock: () => now,
        upload: (request) async {
          uploads++;
          return ack(request);
        },
        download: (_) async => empty,
      )..setActive(true);
      addTearDown(sync.dispose);
      await tester.pump(const Duration(seconds: 9));
      expect(uploads, 0);
      await tester.pump(const Duration(seconds: 1));
      expect(uploads, 0);
      await sync.synchronize();
      expect(uploads, 1);
      await store.put(item(2), now);
      sync.setActive(false);
      sync.setActive(true);
      await tester.pump(const Duration(minutes: 2));
      expect(uploads, 1);
      await sync.synchronize();
      expect(uploads, 2);
    },
  );
}
