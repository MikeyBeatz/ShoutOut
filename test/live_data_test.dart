import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/live_data.dart';

Future<void> flush() => Future<void>.delayed(Duration.zero);

class _Item {
  _Item(this.id);
  final String id;
  String? reaction;
  bool saved = false;
}

void main() {
  test(
    'SDK query and document keys share equal requests and distinguish filters',
    () async {
      TestWidgetsFlutterBinding.ensureInitialized();
      setupFirebaseCoreMocks();
      final app = await Firebase.initializeApp();
      final firestore = FirebaseFirestore.instanceFor(app: app);
      final document = firestore.doc('users/test/legal/acceptance_2026_07_25');
      expect(
        identical(document.liveSnapshots(), document.liveSnapshots()),
        isTrue,
      );
      expect(
        identical(
          document.liveSnapshots(),
          document.liveSnapshots(includeMetadataChanges: true),
        ),
        isFalse,
      );
      Query<Map<String, dynamic>> feed({
        int limit = 50,
        String status = 'active',
      }) => firestore
          .collection('shouts')
          .where('status', isEqualTo: status)
          .orderBy('createdAt', descending: true)
          .limit(limit);
      final cache = SharedLiveStreams();
      final source = StreamController<int>.broadcast();
      final stream = cache.watch(feed(), () => source.stream);
      final subscription = stream.listen((_) {});
      expect(
        identical(stream, cache.watch(feed(), () => source.stream)),
        isTrue,
      );
      expect(
        identical(stream, cache.watch(feed(limit: 49), () => source.stream)),
        isFalse,
      );
      expect(
        identical(
          stream,
          cache.watch(feed(status: 'expired'), () => source.stream),
        ),
        isFalse,
      );
      expect(
        firestore.doc('publicProfiles/a'),
        firestore.doc('publicProfiles/a'),
      );
      expect(
        firestore.doc('publicProfiles/a'),
        isNot(firestore.doc('publicProfiles/b')),
      );
      expect(
        liveDataKey(firestore.doc('publicProfiles/a')),
        isNot(
          liveDataKey(
            FirebaseFirestore.instanceFor(
              app: app,
              databaseId: 'secondary',
            ).doc('publicProfiles/a'),
          ),
        ),
      );
      await subscription.cancel();
      await source.close();
    },
  );

  testWidgets('rebuilding and another view share one live source and replay', (
    tester,
  ) async {
    final cache = SharedLiveStreams();
    var starts = 0;
    var stops = 0;
    final source = StreamController<String>.broadcast(
      onListen: () => starts++,
      onCancel: () => stops++,
    );
    Widget view(bool second) => MaterialApp(
      home: Column(
        children: [
          for (var i = 0; i < (second ? 2 : 1); i++)
            StreamBuilder<String>(
              stream: cache.watch('profile', () => source.stream),
              builder: (_, snapshot) => Text(snapshot.data ?? 'loading'),
            ),
        ],
      ),
    );
    await tester.pumpWidget(view(false));
    source.add('old nickname');
    await tester.pump();
    for (var i = 0; i < 20; i++) {
      await tester.pumpWidget(view(false));
    }
    await tester.pumpWidget(view(true));
    await tester.pump();
    expect(find.text('old nickname'), findsNWidgets(2));
    source.add('new nickname');
    await tester.pumpAndSettle();
    expect(find.text('new nickname'), findsNWidgets(2));
    expect(starts, 1);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    expect(stops, 1);
    await source.close();
  });

  test(
    'last cancellation clears data; a later visit opens a fresh source',
    () async {
      final cache = SharedLiveStreams();
      var starts = 0;
      final controllers = <StreamController<int>>[];
      Stream<int> create() {
        starts++;
        final controller = StreamController<int>();
        controllers.add(controller);
        return controller.stream;
      }

      final first = cache.watch('profile', create).listen((_) {});
      controllers.first.add(7);
      await flush();
      await first.cancel();
      final values = <int>[];
      final next = cache.watch('profile', create).listen(values.add);
      await flush();
      expect(values, isEmpty);
      expect(starts, 2);
      controllers.last.add(9);
      await flush();
      expect(values, [9]);
      await next.cancel();
      for (final controller in controllers) {
        await controller.close();
      }
    },
  );

  test('a retained idle stream joins a newer active source', () async {
    final cache = SharedLiveStreams();
    var starts = 0;
    final source = StreamController<int>.broadcast();
    Stream<int> create() {
      starts++;
      return source.stream;
    }

    final old = cache.watch('x', create);
    final a = old.listen((_) {});
    await a.cancel();
    final b = cache.watch('x', create).listen((_) {});
    final values = <int>[];
    final c = old.listen(values.add);
    source.add(3);
    await flush();
    expect(starts, 2);
    expect(values, [3]);
    await b.cancel();
    await c.cancel();
    await source.close();
  });

  test('viewer, database and query parameters isolate subscriptions', () async {
    final cache = SharedLiveStreams();
    final a = StreamController<int>.broadcast();
    final b = StreamController<int>.broadcast();
    final values = <int>[];
    final first = cache
        .watch(('alice', 'db', 'q'), () => a.stream)
        .listen((_) {});
    a.add(1);
    await flush();
    final second = cache
        .watch(('bob', 'db', 'q'), () => b.stream)
        .listen(values.add);
    await flush();
    expect(values, isEmpty);
    expect(
      identical(
        cache.watch<int>(('bob', 'other-db', 'q'), () => b.stream),
        cache.watch<int>(('bob', 'db', 'q'), () => b.stream),
      ),
      isFalse,
    );
    expect(
      identical(
        cache.watch<int>(('bob', 'db', 'q2'), () => b.stream),
        cache.watch<int>(('bob', 'db', 'q'), () => b.stream),
      ),
      isFalse,
    );
    b.add(2);
    await flush();
    expect(values, [2]);
    await first.cancel();
    await second.cancel();
    await a.close();
    await b.close();
  });

  test('errors reach all viewers and a subsequent event recovers', () async {
    final cache = SharedLiveStreams();
    final source = StreamController<int>.broadcast();
    final errors = <Object>[];
    final values = <int>[];
    final a = cache
        .watch('x', () => source.stream)
        .listen((_) {}, onError: errors.add);
    source.addError(StateError('network'));
    await flush();
    final b = cache
        .watch('x', () => source.stream)
        .listen(values.add, onError: errors.add);
    await flush();
    expect(errors, hasLength(2));
    source.add(8);
    await flush();
    expect(values, [8]);
    await a.cancel();
    await b.cancel();
    await source.close();
  });

  test('a failing source factory releases the entry for retry', () async {
    final cache = SharedLiveStreams();
    await expectLater(
      cache.watch<int>('x', () => throw StateError('failed')),
      emitsError(isA<StateError>()),
    );
    await expectLater(cache.watch('x', () => Stream.value(4)), emits(4));
  });

  test(
    'source completion closes every subscriber and permits a fresh visit',
    () async {
      final cache = SharedLiveStreams();
      final source = StreamController<int>.broadcast();
      final stream = cache.watch('x', () => source.stream);
      final first = expectLater(stream, emitsInOrder([1, emitsDone]));
      final second = expectLater(stream, emitsInOrder([1, emitsDone]));
      source.add(1);
      await source.close();
      await Future.wait([first, second]);
      await expectLater(stream, emitsDone);
      await expectLater(cache.watch('x', () => Stream.value(2)), emits(2));
    },
  );

  test(
    '50 items hydrate once and keep live interaction state across feed updates',
    () async {
      var starts = 0;
      var stops = 0;
      var changes = 0;
      final reactions = <String, StreamController<String?>>{};
      final saves = <String, StreamController<bool>>{};
      StreamController<V> source<V>() => StreamController<V>.broadcast(
        onListen: () => starts++,
        onCancel: () => stops++,
      );
      final state = KeyedLiveState<_Item, (String?, bool)>(
        keyOf: (item) => item.id,
        watch: (id) {
          final reaction = reactions[id] = source<String?>();
          final save = saves[id] = source<bool>();
          return combineLatestValues(
            reaction.stream,
            save.stream,
            (a, b) => (a, b),
          );
        },
        apply: (item, state) {
          item.reaction = state.$1;
          item.saved = state.$2;
        },
        onChanged: () => changes++,
        onError: (error, stack) => fail('$error'),
      );
      List<_Item> batch() => List.generate(50, (i) => _Item('$i'));
      var items = batch();
      state.update(items);
      for (var i = 0; i < 50; i++) {
        reactions['$i']!.add(i == 0 ? 'like' : null);
        saves['$i']!.add(i == 0);
      }
      await flush();
      expect(starts, 100);
      expect(changes, 50);
      for (var i = 0; i < 20; i++) {
        items = batch();
        state.update(items);
        expect(items.first.reaction, 'like');
        expect(items.first.saved, isTrue);
      }
      expect(starts, 100);
      // A change on another device reaches the latest model, not a stale one.
      reactions['0']!.add('dislike');
      saves['0']!.add(false);
      await flush();
      expect(items.first.reaction, 'dislike');
      expect(items.first.saved, isFalse);
      state.update(items.skip(1));
      await flush();
      expect(stops, 2);
      state.update([...items.skip(1), _Item('new')]);
      expect(starts, 102);
      await state.dispose();
      expect(stops, 102);
      for (final controller in [...reactions.values, ...saves.values]) {
        await controller.close();
      }
    },
  );

  test('removed and disposed items ignore queued state updates', () async {
    final source = StreamController<int>.broadcast();
    var applied = 0;
    final state = KeyedLiveState<_Item, int>(
      keyOf: (item) => item.id,
      watch: (_) => source.stream,
      apply: (_, _) => applied++,
      onChanged: () {},
      onError: (_, _) => fail('unexpected error'),
    );
    state.update([_Item('x')]);
    source.add(1);
    state.update([]);
    await flush();
    expect(applied, 0);
    state.update([_Item('x')]);
    source.add(2);
    await state.dispose();
    state.update([_Item('x')]);
    await flush();
    expect(applied, 0);
    expect(source.hasListener, isFalse);
    await source.close();
  });
}
