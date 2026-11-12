import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/read_state_store.dart';
import 'package:shoutout/read_sync_controller.dart';
import 'package:shoutout/read_tracking_controller.dart';

class CountingReadStore extends MemoryReadStateStore {
  CountingReadStore(super.scope);
  int scanned = 0, pages = 0;
  @override
  Future<ReadQueuePage> queuePage(
    ReadSyncCheckpoint checkpoint,
    DateTime now, {
    int limit = 32,
  }) async {
    final page = await super.queuePage(checkpoint, now, limit: limit);
    scanned += page.scanned;
    pages++;
    return page;
  }
}

class GatedReadStore extends MemoryReadStateStore {
  GatedReadStore(super.scope);
  final gate = Completer<void>();
  bool fail = false;
  @override
  Future<void> put(ReadContent content, DateTime now) async {
    await gate.future;
    if (fail) throw StateError('Disk unavailable');
    await super.put(content, now);
  }
}

void main() {
  final now = DateTime.utc(2030), scope = ReadScope('dev', 'alice');
  ReadContent item(int i) => ReadContent(
    shoutId: 'row-$i',
    title: 'Title $i',
    text: 'Text',
    expiresAt: now.add(const Duration(days: 1)),
  );
  Map<String, Object?> ack(Map<String, Object?> request) => {
    'version': 1,
    'revision': 1,
    'items': (request['items'] as List)
        .map((r) => {...r as Map, 'status': 'accepted'})
        .toList(),
  };
  Map<String, Object?> page(
    int revision, {
    String? next,
    List<ReadContent> rows = const [],
  }) => {
    'version': 1,
    'revision': revision,
    'next': next,
    'items': rows
        .map(
          (r) => {
            ...ReadUpload(r, now.millisecondsSinceEpoch).toPayload(),
            'retainUntil': r.retainUntil.millisecondsSinceEpoch,
            'confirmedAt': now.millisecondsSinceEpoch,
          },
        )
        .toList(),
  };
  ReadSyncController controller(
    ReadSyncStore store, {
    Future<Object?> Function(Map<String, Object?>)? upload,
    Future<Object?> Function(Map<String, Object?>)? download,
    DateTime Function()? clock,
  }) => ReadSyncController(
    scope: scope,
    store: store,
    currentScope: () => scope,
    clock: clock ?? () => now,
    upload: upload ?? (r) async => ack(r),
    download: download ?? (_) async => page(1),
  )..setActive(true);

  test(
    'capture waits for already observed RAM marks, and disk failure stops the boundary before network work',
    () async {
      for (final fail in [false, true]) {
        final store = GatedReadStore(scope)..fail = fail;
        final tracker = ReadTrackingController(scope, store, clock: () => now);
        tracker.mark(item(1));
        tracker.mark(item(2));
        var uploads = 0, downloads = 0;
        final sync = controller(
          store,
          upload: (request) async {
            uploads++;
            expect((request['items'] as List).length, 2);
            return ack(request);
          },
          download: (_) async {
            downloads++;
            return page(1);
          },
        );
        final running = sync.synchronize(beforeCapture: tracker.flushBoundary);
        await Future<void>.delayed(Duration.zero);
        expect(uploads, 0);
        expect(downloads, 0);
        store.gate.complete();
        await running;
        if (fail) {
          expect(sync.lastError, isStateError);
          expect(uploads, 0);
          expect(downloads, 0);
          expect(tracker.contains(item(2)), isTrue);
          store.fail = false;
          await sync.synchronize(beforeCapture: tracker.flushBoundary);
        }
        expect(sync.synchronizationComplete, isTrue);
        expect(uploads, 1);
        expect(downloads, 1);
        sync.dispose();
        tracker.dispose();
      }
    },
  );

  test(
    '1025 marks drain once in bounded pages; later marks wait even with the same or backwards device clock',
    () async {
      for (final delta in [Duration.zero, const Duration(hours: -1)]) {
        final store = CountingReadStore(scope);
        for (var i = 0; i < 1025; i++) {
          await store.put(item(i), now);
        }
        var calls = 0;
        final sync = controller(
          store,
          upload: (request) async {
            calls++;
            expect((request['items'] as List).length, lessThanOrEqualTo(32));
            if (calls == 1) await store.put(item(9999), now.add(delta));
            return ack(request);
          },
        );
        await sync.synchronize();
        expect(sync.lastError, isNull);
        expect(sync.synchronizationComplete, isTrue);
        expect(calls, 33);
        expect(store.scanned, 1025);
        expect(store.pages, 33);
        expect((await store.pending(now)).single.content.shoutId, 'row-9999');
        await sync.synchronize();
        expect(await store.pending(now), isEmpty);
        expect(calls, 34);
        sync.dispose();
      }
    },
  );

  test(
    'download checkpoint survives a new controller and catches up after the pinned snapshot',
    () async {
      final store = MemoryReadStateStore(scope),
          requests = <Map<String, Object?>>[];
      final first = controller(
        store,
        download: (r) async {
          requests.add(r);
          if (r['cursor'] == 'page-2') throw StateError('offline');
          return page(2, next: 'page-2', rows: [item(1)]);
        },
      );
      await first.synchronize();
      expect(first.snapshotComplete, isFalse);
      expect(await store.contains(item(1), now), isTrue);
      first.dispose();
      final resumed = controller(
        store,
        download: (r) async {
          requests.add(r);
          if (r['cursor'] == 'page-2') return page(2, rows: [item(2)]);
          expect(r['knownRevision'], 2);
          return page(3, rows: [item(3)]);
        },
      );
      await resumed.synchronize();
      expect(resumed.lastError, isNull);
      expect(resumed.synchronizationComplete, isTrue);
      expect(requests[2]['cursor'], 'page-2');
      expect(requests.length, 4);
      for (var i = 1; i <= 3; i++) {
        expect(await store.contains(item(i), now), isTrue);
      }
      expect(await store.pending(now), isEmpty);
      resumed.dispose();
    },
  );

  test(
    'a new boundary with new uploads discards an incompatible old download cursor',
    () async {
      final store = MemoryReadStateStore(scope);
      final first = controller(
        store,
        download: (r) async {
          if (r['cursor'] != null) throw StateError('offline');
          return page(1, next: 'old', rows: [item(1)]);
        },
      );
      await first.synchronize();
      first.dispose();
      await store.put(item(2), now);
      final resumed = controller(
        store,
        download: (r) async {
          expect(r.containsKey('cursor'), isFalse);
          return page(2);
        },
      );
      await resumed.synchronize();
      expect(resumed.synchronizationComplete, isTrue);
      expect(await store.pending(now), isEmpty);
      resumed.dispose();
    },
  );

  test(
    'expired continuation restarts once and keeps imported marks; Auth/network errors do not loop',
    () async {
      final store = MemoryReadStateStore(scope);
      final first = controller(
        store,
        download: (r) async {
          if (r['cursor'] != null) throw StateError('offline');
          return page(1, next: 'expired', rows: [item(1)]);
        },
      );
      await first.synchronize();
      first.dispose();
      var calls = 0;
      final resumed = controller(
        store,
        download: (r) async {
          calls++;
          if (r['cursor'] != null) throw ReadSyncSnapshotExpired();
          return page(2, rows: [item(2)]);
        },
      );
      await resumed.synchronize();
      expect(calls, 2);
      expect(resumed.synchronizationComplete, isTrue);
      expect(await store.contains(item(1), now), isTrue);
      resumed.dispose();
      final failed = controller(
        store,
        download: (_) async {
          calls++;
          throw StateError('unauthenticated');
        },
      );
      await failed.synchronize();
      expect(calls, 3);
      expect(failed.snapshotComplete, isFalse);
      failed.dispose();
    },
  );

  test(
    'newer local epoch rejects stale ack and imported page atomically',
    () async {
      final store = MemoryReadStateStore(scope);
      await store.put(item(0), now);
      final old = await store.beginSync(),
          queued = await store.queuePage(old, now);
      final current = await store.beginSync();
      await expectLater(
        store.commitSync(
          old,
          old.advanceUpload(queued),
          now,
          acknowledged: queued.items,
          imported: [ReadUpload(item(1), now.millisecondsSinceEpoch)],
        ),
        throwsA(isA<ReadSyncConflict>()),
      );
      expect(await store.contains(item(1), now), isFalse);
      expect((await store.pending(now)).length, 1);
      expect((await store.queuePage(current, now)).items.length, 1);
    },
  );

  test(
    'late reply from another same-account controller cannot overwrite a newer checkpoint',
    () async {
      final store = MemoryReadStateStore(scope),
          started = Completer<void>(),
          reply = Completer<Object?>();
      final old = controller(
        store,
        download: (_) {
          started.complete();
          return reply.future;
        },
      );
      final running = old.synchronize();
      await started.future;
      final newer = controller(store);
      await newer.synchronize();
      reply.complete(page(1, rows: [item(10)]));
      await running;
      expect(old.lastError, isA<ReadSyncConflict>());
      expect(await store.contains(item(10), now), isFalse);
      expect(newer.synchronizationComplete, isTrue);
      old.dispose();
      newer.dispose();
    },
  );

  test(
    'startup delayed by hidden app happens once; subsequent resume is silent',
    () async {
      late ReadSessions sessions;
      var calls = 0;
      sessions = ReadSessions(
        storeFactory: MemoryReadStateStore.new,
        syncFactory: (s, store, merged) => ReadSyncController(
          scope: s,
          store: store,
          currentScope: () => sessions.value?.scope,
          upload: (r) async => ack(r),
          download: (_) async {
            calls++;
            return page(1);
          },
        ),
      )..configure('dev');
      sessions.setForeground(false);
      sessions.retainViewer('alice');
      await Future<void>.delayed(Duration.zero);
      expect(calls, 0);
      sessions.setForeground(true);
      await Future<void>.delayed(const Duration(milliseconds: 1));
      expect(calls, 1);
      sessions.setForeground(false);
      sessions.setForeground(true);
      await Future<void>.delayed(Duration.zero);
      expect(calls, 1);
      sessions.dispose();
    },
  );
}
