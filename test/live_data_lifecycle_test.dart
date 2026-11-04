import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/live_data.dart';

Future<void> flush() => Future<void>.delayed(Duration.zero);

void main() {
  test('late query and document errors retire the signed-out viewer', () async {
    String? viewer = 'alice';
    final cache = SharedLiveStreams();
    final sources = <StreamController<String>>[];
    final subscriptions = <StreamSubscription<String>>[];
    final values = <String>[];
    var stops = 0, done = 0;
    for (final kind in ['blocked', 'following', 'profile']) {
      final source = StreamController<String>.broadcast(
        onCancel: () => stops++,
      );
      sources.add(source);
      final key = ('alice', 'app', 'db', kind);
      final stream = cache.watch(
        kind == 'profile' ? (key, true) : key,
        () => source.stream,
        isCurrent: () => viewer == 'alice',
      );
      // Deliberately no consumer onError: stale errors must never reach it.
      subscriptions.add(stream.listen(values.add, onDone: () => done++));
      source.add('initial $kind');
    }
    await flush();
    expect(values, hasLength(3));
    viewer = null; // Auth changed before the next widget frame.
    for (final source in sources) {
      source.addError(
        FirebaseException(plugin: 'cloud_firestore', code: 'permission-denied'),
      );
      source.add('late private value');
    }
    await flush();
    await flush();
    expect(values, hasLength(3));
    expect(done, 3);
    expect(stops, 3);
    for (final subscription in subscriptions) {
      await subscription.cancel();
    }
    for (final source in sources) {
      await source.close();
    }
  });

  test('paused data and errors cannot cross a viewer change', () async {
    var viewer = 'alice';
    final cache = SharedLiveStreams();
    final source = StreamController<String>.broadcast();
    final values = <String>[];
    var done = false;
    final subscription = cache
        .watch(
          ('alice', 'app', 'db', 'profile'),
          () => source.stream,
          isCurrent: () => viewer == 'alice',
        )
        .listen(values.add, onDone: () => done = true);
    subscription.pause();
    source.add('queued private value');
    source.addError(
      FirebaseException(plugin: 'cloud_firestore', code: 'permission-denied'),
    );
    await flush();
    viewer = 'bob';
    subscription.resume();
    await flush();
    await flush();
    expect(values, isEmpty);
    expect(done, isTrue);
    await subscription.cancel();
    await source.close();
  });

  test(
    'current-viewer errors remain visible and same-UID reauth keeps its source',
    () async {
      final cache = SharedLiveStreams();
      final source = StreamController<int>.broadcast();
      final values = <int>[], errors = <Object>[];
      var stops = 0;
      source.onCancel = () => stops++;
      final subscription = cache
          .watch(
            ('alice', 'app', 'db', 'profile'),
            () => source.stream,
            isCurrent: () => true,
          )
          .listen(values.add, onError: errors.add);
      final denied = FirebaseException(
        plugin: 'cloud_firestore',
        code: 'permission-denied',
      );
      source.addError(denied);
      await flush();
      cache.retainViewer('app', 'alice');
      source.add(7);
      await flush();
      expect(errors, [denied]);
      expect(values, [7]);
      expect(stops, 0);
      await subscription.cancel();
      await source.close();
    },
  );

  test('Auth invalidation closes only old scopes of its own app', () async {
    final cache = SharedLiveStreams();
    final closed = <String>[], values = <String>[];
    final sources = <StreamController<String>>[];
    final subscriptions = <StreamSubscription<String>>[];
    for (final entry in <String, Object>{
      'old query': ('alice', 'app', 'db', 'query'),
      'old metadata': (('alice', 'app', 'db', 'document'), true),
      'new viewer': ('bob', 'app', 'db', 'query'),
      'other app': ('alice', 'other', 'db', 'query'),
      'auth': ('auth', Object()),
    }.entries) {
      final source = StreamController<String>.broadcast(
        onCancel: () => closed.add(entry.key),
      );
      sources.add(source);
      subscriptions.add(
        cache.watch(entry.value, () => source.stream).listen(values.add),
      );
    }
    cache.retainViewer('app', 'bob');
    await flush();
    expect(closed, unorderedEquals(['old query', 'old metadata']));
    for (var i = 0; i < sources.length; i++) {
      sources[i].add('source $i');
    }
    await flush();
    expect(values, ['source 2', 'source 3', 'source 4']);
    for (final subscription in subscriptions) {
      await subscription.cancel();
    }
    for (final source in sources) {
      await source.close();
    }
  });

  test(
    'a retained stream cannot start a source for an obsolete viewer',
    () async {
      var viewer = 'alice', starts = 0;
      final cache = SharedLiveStreams();
      final old = cache.watch<int>(('alice', 'app', 'db', 'profile'), () {
        starts++;
        return Stream.value(3);
      }, isCurrent: () => viewer == 'alice');
      viewer = 'bob';
      await expectLater(old, emitsDone);
      expect(starts, 0);
    },
  );

  test(
    'delayed cancellation cannot release a later visit of the same UID',
    () async {
      final cancellation = Completer<void>();
      final cache = SharedLiveStreams();
      final first = StreamController<int>.broadcast(
        onCancel: () => cancellation.future,
      );
      const key = ('alice', 'app', 'db', 'profile');
      final old = cache.watch(key, () => first.stream).listen((_) {});
      cache.retainViewer('app', null);
      final nextSource = StreamController<int>.broadcast();
      final nextStream = cache.watch(key, () => nextSource.stream);
      final values = <int>[];
      final next = nextStream.listen(values.add);
      cancellation.complete();
      await flush();
      expect(
        identical(cache.watch(key, () => nextSource.stream), nextStream),
        isTrue,
      );
      nextSource.add(5);
      await flush();
      expect(values, [5]);
      await old.cancel();
      await next.cancel();
      await first.close();
      await nextSource.close();
    },
  );

  test(
    'widget teardown handles and reports a source cancellation failure once',
    () async {
      final errors = <Object>[];
      final cache = SharedLiveStreams(
        onCleanupError: (error, _) => errors.add(error),
      );
      final denied = FirebaseException(
        plugin: 'cloud_firestore',
        code: 'permission-denied',
      );
      final source = StreamController<int>(
        onCancel: () => Future<void>.error(denied),
      );
      final subscription = cache
          .watch('profile', () => source.stream)
          .listen((_) {});
      await subscription.cancel();
      expect(errors, [denied]);
      await expectLater(
        cache.watch('profile', () => Stream.value(4)),
        emits(4),
      );
      await source.close();
    },
  );

  testWidgets(
    'document revocation and screen removal leave no uncaught errors',
    (tester) async {
      var viewer = 'alice';
      final source = StreamController<String>.broadcast();
      final cache = SharedLiveStreams();
      final stream = cache.watch(
        ('alice', 'app', 'db', 'profile'),
        () => source.stream,
        isCurrent: () => viewer == 'alice',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: StreamBuilder<String>(
            stream: stream,
            builder: (_, snapshot) => Text(
              snapshot.hasError ? 'access error' : snapshot.data ?? 'loading',
            ),
          ),
        ),
      );
      source.addError(
        FirebaseException(plugin: 'cloud_firestore', code: 'permission-denied'),
      );
      await tester.pump();
      expect(find.text('access error'), findsOneWidget);
      viewer = 'bob';
      cache.retainViewer('app', viewer);
      source.addError(
        FirebaseException(plugin: 'cloud_firestore', code: 'permission-denied'),
      );
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      expect(tester.takeException(), isNull);
      await source.close();
    },
  );

  test('live diagnostics contain codes only', () {
    expect(
      liveDataFailureCode(
        FirebaseException(
          plugin: 'cloud_firestore',
          code: 'permission-denied',
          message: 'private payload',
        ),
      ),
      'permission-denied',
    );
    expect(
      liveDataFailureCode(
        FirebaseException(
          plugin: 'cloud_firestore',
          code: 'uid/private\nsecret',
          message: 'token',
        ),
      ),
      'unknown',
    );
    expect(liveDataFailureCode(StateError('private text')), 'unknown');
  });
}
