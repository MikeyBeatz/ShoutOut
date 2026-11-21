import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_news_runtime.dart';
import 'package:shoutout/feed_delta_client.dart';
import 'package:shoutout/feed_body_cache.dart';

FeedNewsSignals snapshot({
  String baseline = 'base',
  Map<String, String?>? heads = const {'_control': null},
  bool fallback = false,
}) => FeedNewsSignals.fromWire({
  'v': 1,
  'baseline': baseline,
  'generation': 'feed-v3',
  'incarnation': [1, 2],
  'heads': fallback ? null : heads,
});

class Harness {
  Harness() {
    runtime = FeedNewsRuntime(
      check: () async {
        calls++;
        if (failure != null) throw failure!;
        await blocked?.future;
        runtime.observedCountReads(30);
      },
      readHeads: () async {
        polls++;
        return snapshot(heads: {'_control': token})..readUnits = 25;
      },
      watch: (_, _) => changes.stream,
      pendingCount: () => pending,
      invalidate: () => invalidations++,
      clock: () => now,
      jitter: () => 1,
      retryAfter: (_) => const Duration(seconds: 60),
      onError: (_) => errors++,
    );
    runtime.configure(snapshot());
  }
  late final FeedNewsRuntime runtime;
  final changes = StreamController<FeedNewsSignal>.broadcast(sync: true);
  int now = 0, calls = 0, polls = 0, pending = 0, invalidations = 0, errors = 0;
  String? token;
  Object? failure;
  Completer<void>? blocked;
  Future<void> tick(WidgetTester tester, int milliseconds) async {
    now += milliseconds;
    await tester.pump(Duration(milliseconds: milliseconds));
  }

  void change(int i) {
    token = i.toRadixString(16).padLeft(36, '0');
    changes.add(FeedNewsSignal(token));
  }

  Future<void> close() async {
    runtime.dispose();
    await changes.close();
  }
}

void main() {
  testWidgets(
    'cache/disconnection invalidates and an unchanged server head checks immediately on reconnect',
    (tester) async {
      final f = Harness();
      f.runtime.setActive(true, freshBaseline: true);
      f.changes.add(const FeedNewsSignal(null));
      await f.tick(tester, 0);
      expect(f.calls, 0);
      final invalidations = f.invalidations;
      f.changes.add(const FeedNewsSignal(null, confirmed: false));
      expect(f.invalidations, greaterThan(invalidations));
      f.changes.add(const FeedNewsSignal(null));
      await f.tick(tester, 0);
      expect(f.calls, 1);
      await f.close();
    },
  );
  testWidgets(
    'synchronous subscription errors are contained, and pulses during a flight survive',
    (tester) async {
      final f = Harness()..blocked = Completer<void>();
      f.runtime.setActive(true);
      await f.tick(tester, 0);
      f.change(1);
      f.blocked!.complete();
      f.blocked = null;
      await f.tick(tester, 0);
      await f.tick(tester, 2000);
      expect(f.calls, 2);
      await f.close();
      var errors = 0;
      final runtime = FeedNewsRuntime(
        check: () async {},
        readHeads: () async => snapshot(),
        watch: (_, _) => throw StateError('no transport'),
        pendingCount: () => 0,
        invalidate: () {},
        onError: (_) => errors++,
      );
      runtime.configure(snapshot());
      runtime.setActive(true);
      expect(errors, 1);
      expect(runtime.batching, isTrue);
      runtime.dispose();
    },
  );
  testWidgets(
    'fresh baseline avoids redundant count; initial changed server head closes the connection gap',
    (tester) async {
      final f = Harness();
      f.runtime.setActive(true, freshBaseline: true);
      await f.tick(tester, 60000);
      expect(f.calls, 0);
      f.change(1);
      await f.tick(tester, 2000);
      expect(f.calls, 1);
      f.runtime.clear();
      f.change(2);
      await f.tick(tester, 60000);
      expect(f.calls, 1);
      await f.close();
    },
  );
  test(
    'signal transport only accepts its viewer and structured reply, with no body transfer',
    () async {
      var uid = 'actor';
      final response = Completer<Object?>();
      final client = FeedDeltaClient(
        project: 'project',
        currentUserId: () => uid,
        cache: FeedBodyCache(clock: () => 0),
        send: (payload) {
          expect(payload.keys.toSet(), {
            'format',
            'mode',
            'expectedUserId',
            'checkpoint',
          });
          expect(payload['mode'], 'news-signals');
          return response.future;
        },
      );
      final first = client.signals('signed');
      uid = 'other';
      response.complete({
        'version': 1,
        'state': 'signals',
        'signals': {
          'v': 1,
          'baseline': 'base',
          'generation': 'feed-v3',
          'incarnation': [1, 2],
          'heads': {'_control': null},
        },
        'readUnits': 30,
      });
      await expectLater(first, throwsStateError);
      final result = await client.signals('signed');
      expect(result.heads, {'_control': null});
      expect(result.readUnits, 30);
      client.eraseAccount(uid);
      await expectLater(client.signals('signed'), throwsStateError);
    },
  );
  testWidgets(
    'quiet zero has no periodic count; fixed coalescing and no background work',
    (tester) async {
      final f = Harness();
      f.runtime.setActive(true);
      await f.tick(tester, 0);
      expect(f.calls, 1);
      await f.tick(tester, 60000);
      expect(f.calls, 1);
      expect(f.polls, 0);
      f.change(1);
      await f.tick(tester, 1000);
      f.change(2);
      await f.tick(tester, 1000);
      expect(f.calls, 2);
      f.runtime.setActive(false);
      f.change(3);
      await f.tick(tester, 60000);
      expect(f.calls, 2);
      f.runtime.setActive(true);
      await f.tick(tester, 0);
      expect(f.calls, 3);
      await f.close();
    },
  );
  testWidgets(
    '15 second pending deadline cannot be postponed by two second coalescing',
    (tester) async {
      final f = Harness()..pending = 1;
      f.runtime.setActive(true);
      await f.tick(tester, 0);
      await f.tick(tester, 14000);
      f.change(1);
      await f.tick(tester, 1000);
      expect(f.calls, 2);
      f.pending = 0;
      await f.tick(tester, 2000);
      expect(f.calls, 2);
      await f.close();
    },
  );
  testWidgets(
    'burst stops listeners, unchanged batched heads do not run count, quiet trials recover',
    (tester) async {
      final f = Harness();
      f.runtime.setActive(true);
      await f.tick(tester, 0);
      for (var i = 0; i < 32; i++) {
        f.change(i);
      }
      expect(f.runtime.batching, isTrue);
      await f.tick(tester, 5000);
      expect(f.calls, 2);
      await f.tick(tester, 5000);
      expect(f.polls, 2);
      expect(f.calls, 2);
      await f.tick(tester, 50000);
      await f.tick(tester, 5000);
      expect(f.runtime.batching, isTrue);
      await f.tick(tester, 60000);
      await f.tick(tester, 5000);
      expect(f.runtime.batching, isFalse);
      await f.close();
    },
  );
  testWidgets(
    'retryAfter survives pulses and reconnect, failure never causes a zero-delay loop',
    (tester) async {
      final f = Harness()..failure = StateError('quota');
      f.runtime.setActive(true);
      await f.tick(tester, 0);
      expect(f.errors, 1);
      f.runtime.pulse(immediate: true);
      f.runtime.setActive(false);
      f.runtime.setActive(true);
      await f.tick(tester, 59999);
      expect(f.calls, 1);
      f.failure = null;
      await f.tick(tester, 1);
      expect(f.calls, 2);
      await f.close();
    },
  );
  testWidgets(
    'foreign context and disposal fence late work; no overlapping count',
    (tester) async {
      final f = Harness()..blocked = Completer<void>();
      f.runtime.setActive(true);
      await f.tick(tester, 0);
      f.runtime.configure(snapshot(baseline: 'new'));
      f.runtime.pulse(immediate: true);
      await f.tick(tester, 5000);
      expect(f.calls, 1);
      f.blocked!.complete();
      f.blocked = null;
      await f.tick(tester, 0);
      await f.tick(tester, 0);
      expect(f.calls, 2);
      await f.close();
      await f.tick(tester, 60000);
      expect(f.calls, 2);
    },
  );
  testWidgets(
    'large coverage uses complete count fallback without subscriptions or partial heads',
    (tester) async {
      final f = Harness();
      f.runtime.configure(snapshot(baseline: 'wide', fallback: true));
      f.runtime.setActive(true);
      await f.tick(tester, 0);
      expect(f.changes.hasListener, isFalse);
      expect(f.calls, 1);
      await f.tick(tester, 5000);
      expect(f.calls, 2);
      expect(f.polls, 0);
      await f.close();
    },
  );
  test('signal schema rejects oversized and foreign routes', () {
    expect(snapshot(heads: {'_control': null, 'u2fk': null}).heads!.length, 2);
    expect(
      () => snapshot(heads: {'arbitrary/path': null}),
      throwsFormatException,
    );
    expect(
      () => snapshot(heads: {'u2fk': 'source-text'}),
      throwsFormatException,
    );
    expect(() => snapshot(heads: {}), throwsFormatException);
  });
}
