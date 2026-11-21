import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_session.dart';
import 'package:shoutout/feed_body_cache.dart';
import 'package:shoutout/feed_delta_client.dart';
import 'package:shoutout/main.dart';

Map<String, Object?> confirmed(int count, {String baseline = 'feed'}) => {
  'version': 1,
  'state': 'ready',
  'count': count,
  'capped': count == 100,
  'baseline': baseline,
  'checkpoint': 'confirmed',
  'validForMillis': 1000,
  'checkedAt': 100,
};
FeedBatch<String> batch(String baseline) => FeedBatch(
  items: ['one', 'two'],
  next: null,
  baseline: baseline,
  newsCheckpoint: 'signed-$baseline',
);
void main() {
  testWidgets(
    'known news expiry invalidates the badge and wakes only an active view',
    (tester) async {
      var wakes = 0;
      var failRefresh = false;
      final c = FeedSessionController<String, String>(
        idOf: (x) => x,
        load: (ctx, _) async {
          if (failRefresh) throw StateError('offline');
          return batch(ctx);
        },
        onNewsExpired: () => wakes++,
        loadNews: (_, _) async => FeedNewsDelta.confirmed(
          checkpoint: 'confirmed',
          baseline: 'feed',
          count: 1,
          validFor: const Duration(seconds: 1),
        ),
      );
      await c.refresh('feed');
      await c.checkNews();
      expect(c.newsIsCurrent, true);
      failRefresh = true;
      await expectLater(c.refresh('other'), throwsStateError);
      await tester.pump(const Duration(seconds: 1));
      expect(c.newsIsCurrent, false);
      expect(wakes, 1);
      await c.checkNews();
      c.setActive(false);
      await tester.pump(const Duration(seconds: 1));
      expect(wakes, 1);
      c.dispose();
    },
  );
  test(
    'count uses signed news baseline, never changes cards and decreases after expiry/deletion',
    () async {
      final checkpoints = <String>[];
      var count = 100;
      final c = FeedSessionController<String, String>(
        idOf: (x) => x,
        load: (ctx, _) async => batch(ctx),
        loadNews: (_, checkpoint) async {
          checkpoints.add(checkpoint);
          return FeedNewsDelta.confirmed(
            checkpoint: 'signed-feed',
            baseline: 'feed',
            count: count,
            validFor: const Duration(seconds: 1),
          );
        },
      );
      await c.refresh('feed');
      await c.checkNews();
      expect(checkpoints, ['signed-feed']);
      expect(c.newsLabel, '99+');
      expect(c.items, ['one', 'two']);
      count = 99;
      await c.checkNews();
      expect(c.newsLabel, '99');
      count = 0;
      await c.checkNews();
      expect(c.newsCount, 0);
      expect(c.items, ['one', 'two']);
      c.dispose();
    },
  );
  test(
    'failed refresh/transport preserve count/checkpoint; old async result cannot cross successful refresh',
    () async {
      var fail = false;
      Completer<FeedNewsDelta>? pending;
      final c = FeedSessionController<String, String>(
        idOf: (x) => x,
        load: (ctx, _) async {
          if (fail) throw StateError('offline');
          return batch(ctx);
        },
        loadNews: (_, _) =>
            pending?.future ??
            Future.value(
              FeedNewsDelta.confirmed(
                checkpoint: 'confirmed',
                baseline: 'feed',
                count: 3,
                validFor: const Duration(seconds: 1),
              ),
            ),
      );
      await c.refresh('feed');
      await c.checkNews();
      fail = true;
      await expectLater(c.refresh('other'), throwsStateError);
      expect(c.newsCount, 3);
      expect(c.checkpoint, 'confirmed');
      expect(c.newsIsCurrent, false);
      pending = Completer();
      final request = c.checkNews();
      fail = false;
      await c.refresh('next');
      pending.complete(
        FeedNewsDelta.confirmed(
          checkpoint: 'late',
          baseline: 'feed',
          count: 80,
          validFor: const Duration(seconds: 1),
        ),
      );
      await request;
      expect(c.newsCount, 0);
      expect(c.checkpoint, 'signed-next');
      expect(c.context, 'next');
      c.dispose();
    },
  );
  test(
    'monotonic expiry and failed news never present old count as verified current',
    () async {
      var elapsed = Duration.zero, fail = false;
      final c = FeedSessionController<String, String>(
        idOf: (x) => x,
        elapsedClock: () => elapsed,
        load: (ctx, _) async => batch(ctx),
        loadNews: (_, _) async {
          if (fail) throw StateError('offline');
          return FeedNewsDelta.confirmed(
            checkpoint: 'checked',
            baseline: 'feed',
            count: 8,
            validFor: const Duration(seconds: 1),
          );
        },
      );
      await c.refresh('feed');
      await c.checkNews();
      expect(c.newsIsCurrent, true);
      elapsed = const Duration(seconds: 1);
      expect(c.newsIsCurrent, false);
      fail = true;
      await expectLater(c.checkNews(), throwsStateError);
      expect(c.newsCount, 8);
      expect(c.checkpoint, 'checked');
      expect(c.newsIsCurrent, false);
      c.dispose();
    },
  );
  test('foreign baseline is rejected without importing count', () async {
    final c = FeedSessionController<String, String>(
      idOf: (x) => x,
      load: (ctx, _) async => batch(ctx),
      loadNews: (_, _) async => FeedNewsDelta.confirmed(
        checkpoint: 'wrong',
        baseline: 'other',
        count: 4,
        validFor: Duration.zero,
      ),
    );
    await c.refresh('feed');
    await expectLater(c.checkNews(), throwsStateError);
    expect(c.checkpoint, 'signed-feed');
    expect(c.newsCount, 0);
    c.dispose();
  });
  test(
    'transport completes bounded work, never loads a body or changes body cache',
    () async {
      final sent = <Map<String, Object?>>[];
      final client = FeedDeltaClient(
        project: 'project',
        currentUserId: () => 'viewer',
        cache: FeedBodyCache(clock: () => 0),
        send: (request) async {
          sent.add(request);
          return sent.length == 1
              ? {'version': 1, 'state': 'preparing', 'checkpoint': 'part'}
              : confirmed(100);
        },
      );
      final result = await client.news('baseline');
      expect(result.count, 100);
      expect(sent.map((r) => r['checkpoint']), ['baseline', 'part']);
      expect(
        sent.every(
          (r) =>
              r['mode'] == 'news' &&
              !r.containsKey('cold') &&
              !r.containsKey('missing'),
        ),
        true,
      );
      expect(client.cache.isEmpty, true);
    },
  );
  test(
    'transport fences account change, deletion and malformed/unbounded replies',
    () async {
      String? uid = 'first';
      final response = Completer<Object?>();
      final client = FeedDeltaClient(
        project: 'project',
        currentUserId: () => uid,
        cache: FeedBodyCache(clock: () => 0),
        send: (_) => response.future,
      );
      final request = client.news('baseline');
      uid = 'second';
      response.complete(confirmed(3));
      await expectLater(request, throwsStateError);
      client.eraseAccount('second');
      await expectLater(client.news('baseline'), throwsStateError);
      for (final wire in [
        confirmed(101),
        {...confirmed(3), 'capped': true},
        {
          'version': 1,
          'state': 'preparing',
          'checkpoint': 'baseline',
          'count': 3,
        },
      ]) {
        final bad = FeedDeltaClient(
          project: 'project',
          currentUserId: () => 'viewer',
          cache: FeedBodyCache(clock: () => 0),
          send: (_) async => wire,
        );
        await expectLater(bad.news('baseline'), throwsFormatException);
      }
    },
  );
  for (final brightness in Brightness.values) {
    testWidgets('floating news count and unavailable state in $brightness', (
      tester,
    ) async {
      Future<void> view(int count, {bool current = true}) => tester.pumpWidget(
        MaterialApp(
          theme: ThemeData(brightness: brightness),
          home: Scaffold(
            body: FeedRefreshOverlay(
              newsCount: count,
              newsCurrent: current,
              onRefresh: () {},
              child: const SizedBox.expand(),
            ),
          ),
        ),
      );
      await view(0);
      expect(find.text('0'), findsNothing);
      await view(1);
      expect(find.text('1'), findsOneWidget);
      await view(100);
      expect(find.text('99+'), findsOneWidget);
      await view(100, current: false);
      expect(find.text('99+'), findsNothing);
      expect(find.text('…'), findsOneWidget);
      expect(
        tester.getRect(find.byKey(const ValueKey('spatial-feed-refresh'))).top,
        lessThan(30),
      );
    });
  }
}
