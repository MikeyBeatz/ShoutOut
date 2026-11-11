import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/read_state_store.dart';
import 'package:shoutout/read_tracking_controller.dart';

ReadContent content({String title = 'Title', String id = 'shout'}) =>
    ReadContent(
      shoutId: id,
      title: title,
      text: 'Body',
      expiresAt: DateTime.utc(2030, 1, 2),
    );

class FaultStore extends MemoryReadStateStore {
  FaultStore(super.scope);
  bool fail = false;
  Completer<bool>? delayed;
  @override
  Future<void> put(ReadContent content, DateTime now) async {
    if (fail) throw StateError('disk unavailable');
    await super.put(content, now);
  }

  @override
  Future<bool> contains(ReadContent content, DateTime now) =>
      delayed?.future ?? super.contains(content, now);
}

void main() {
  final now = DateTime.utc(2030, 1, 1), scope = ReadScope('dev', 'alice');
  test(
    'read markers bind exact content and keep no source text, location or credentials',
    () async {
      final store = MemoryReadStateStore(scope), c = content();
      await store.put(c, now);
      expect(await store.contains(c, now), isTrue);
      expect(await store.contains(content(title: 'Edited'), now), isFalse);
      expect(
        ReadMarker.matches(
          store.rows[c.key],
          ReadScope('prod', 'alice'),
          c,
          now,
        ),
        isFalse,
      );
      expect(
        ReadMarker.matches(store.rows[c.key], ReadScope('dev', 'bob'), c, now),
        isFalse,
      );
      expect(
        store.rows[c.key]!.keys,
        unorderedEquals([
          'key',
          'schemaVersion',
          'projectId',
          'userId',
          'shoutId',
          'contentHash',
          'readAtLocal',
          'expiresAt',
          'retainUntil',
          'pendingSync',
        ]),
      );
      expect(
        ReadScope('prod', 'alice').databaseSuffix,
        isNot(scope.databaseSuffix),
      );
    },
  );
  test(
    'retention ends exactly seven days after source expiry; prune is bounded',
    () async {
      final store = MemoryReadStateStore(scope), c = content();
      await store.put(c, now);
      await store.put(content(id: 'other'), now);
      expect(
        await store.contains(
          c,
          c.retainUntil.subtract(const Duration(milliseconds: 1)),
        ),
        isTrue,
      );
      expect(await store.contains(c, c.retainUntil), isFalse);
      expect(await store.prune(c.retainUntil, limit: 1), 1);
      expect(store.rows.length, 1);
      expect(await store.prune(c.retainUntil), 1);
      await store.put(c, c.retainUntil);
      expect(store.rows, isEmpty);
    },
  );
  test(
    'corrupt rows are not read acknowledgements; a fresh completion repairs only that key',
    () async {
      final store = MemoryReadStateStore(scope), c = content();
      await store.put(c, now);
      store.rows[c.key]!['retainUntil'] = 0;
      expect(await store.contains(c, now), isFalse);
      await store.put(c, now);
      expect(await store.contains(c, now), isTrue);
    },
  );
  test('erasure fences recreation and closes off earlier writes', () async {
    final store = MemoryReadStateStore(scope);
    await store.put(content(), now);
    await store.erase();
    expect(store.rows, isEmpty);
    await expectLater(store.put(content(), now), throwsStateError);
  });
  test(
    'failed persistence keeps immediate state and retries without an automatic loop',
    () async {
      final store = FaultStore(scope)..fail = true;
      final controller = ReadTrackingController(scope, store, clock: () => now);
      addTearDown(controller.dispose);
      controller.mark(content());
      await Future<void>.delayed(Duration.zero);
      expect(controller.contains(content()), isTrue);
      expect(controller.storageFailed, isTrue);
      expect(store.rows, isEmpty);
      store.fail = false;
      await controller.retry();
      expect(controller.storageFailed, isFalse);
      expect(store.rows.length, 1);
      controller.mark(content());
      await controller.retry();
      expect(store.rows.length, 1);
    },
  );
  test(
    'slow hydration cannot overwrite a new completion or mutate a disposed controller',
    () async {
      final store = FaultStore(scope)..delayed = Completer<bool>();
      final controller = ReadTrackingController(scope, store, clock: () => now);
      final pending = controller.load(content());
      controller.mark(content());
      store.delayed!.complete(false);
      await pending;
      expect(controller.contains(content()), isTrue);
      controller.dispose();
      expect(controller.contains(content()), isFalse);
      controller.mark(content(id: 'late'));
      expect(store.rows.containsKey(content(id: 'late').key), isFalse);
    },
  );
  test(
    'logout closes access; another viewer never receives the prior viewer controller',
    () async {
      final stores = <String, MemoryReadStateStore>{};
      final sessions = ReadSessions(
        storeFactory: (s) => stores[s.userId] = MemoryReadStateStore(s),
      );
      sessions.configure('dev');
      sessions.retainViewer('alice');
      final alice = sessions.value!;
      alice.mark(content());
      await alice.retry();
      sessions.retainViewer('bob');
      expect(alice.enabled, isFalse);
      expect(sessions.value!.contains(content()), isFalse);
      sessions.retainViewer(null);
      expect(sessions.value, isNull);
      expect(stores['alice']!.rows.length, 1);
    },
  );

  test(
    'confirmed account erasure coalesces and fences only the selected namespace',
    () async {
      final stores = <String, MemoryReadStateStore>{};
      final sessions = ReadSessions(
        storeFactory: (s) => stores[s.userId] = MemoryReadStateStore(s),
      );
      addTearDown(sessions.dispose);
      sessions.configure('dev');
      sessions.retainViewer('alice');
      final alice = sessions.value!;
      alice.mark(content());
      await alice.retry();
      await Future.wait([
        sessions.eraseAccount('alice'),
        sessions.eraseAccount('alice'),
      ]);
      expect(alice.enabled, isFalse);
      expect(stores['alice']!.rows, isEmpty);
      sessions.retainViewer('bob');
      sessions.value!.mark(content());
      await sessions.value!.retry();
      expect(stores['bob']!.rows.length, 1);
      sessions.retainViewer('alice');
      expect(sessions.value, isNull);
      expect(stores['bob']!.rows.length, 1);
    },
  );
}
