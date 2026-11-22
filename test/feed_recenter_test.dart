import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_session.dart';
import 'package:shoutout/feed_page_gateway.dart';
import 'package:shoutout/feed_body_cache.dart';
import 'package:shoutout/feed_delta_client.dart';

import 'feed_delta_client_test.dart' as fixtures;

FeedBatch<String> batch(List<String> items, String at, {Object? next}) =>
    FeedBatch(
      items: items,
      baseline: at,
      next: next,
      newsCheckpoint: '$at-news',
    );
bool read(String id) => id.startsWith('r');

void main() {
  test(
    'movement commits a complete page, retains groups, news and fixed expiry',
    () async {
      var elapsed = Duration.zero;
      final delayedPage = Completer<FeedBatch<String>>();
      final stalePage = Completer<FeedBatch<String>>();
      final session = FeedSessionController<String, String>(
        idOf: (id) => id,
        elapsedClock: () => elapsed,
        load: (_, cursor) async => cursor == null
            ? batch(['u1', 'gone', 'r1'], 'a', next: 'old-next')
            : stalePage.future,
        loadNews: (_, checkpoint) async => FeedNewsDelta.confirmed(
          checkpoint: checkpoint,
          baseline: 'a',
          count: 2,
          validFor: const Duration(minutes: 30),
        ),
      );
      addTearDown(session.dispose);
      await session.refresh('old');
      await session.checkNews();
      final prefetch = session.prefetch();
      elapsed = const Duration(minutes: 59);
      final movement = session.recenter(
        'new',
        loadMoved: (_) => delayedPage.future,
        retain: (id, _) => id != 'gone',
        isRead: read,
        relocate: (id, _) => id,
      );
      expect(session.context, 'old');
      expect(session.items, ['u1', 'gone', 'r1']);
      session.removeConfirmed('u1');
      delayedPage.complete(batch(['u1', 'u2', 'r2'], 'b', next: 'new-next'));
      await movement;
      stalePage.complete(batch(['stale'], 'a'));
      await prefetch;
      expect(session.context, 'new');
      expect(session.items, ['u2', 'r1', 'r2']);
      expect(session.newsCount, 2);
      expect(session.newsIsCurrent, false);
      expect(session.checkpoint, 'b-news');
      expect(session.hasPreparedPage, false);
      elapsed = const Duration(hours: 1);
      expect(session.needsRefresh, true);
      expect(session.hasMore, false);
    },
  );

  test(
    'offline, malformed reply, cancellation and disposal preserve committed scope',
    () async {
      final pending = Completer<FeedBatch<String>>();
      final session = FeedSessionController<String, String>(
        idOf: (id) => id,
        load: (context, _) async => batch([context], context),
      );
      await session.refresh('old');
      Future<void> move(Future<FeedBatch<String>> Function(String) load) =>
          session.recenter(
            'new',
            loadMoved: load,
            retain: (_, _) => true,
            isRead: read,
            relocate: (id, _) => id,
          );
      await expectLater(
        move((_) async => throw StateError('offline')),
        throwsStateError,
      );
      expect(session.context, 'old');
      expect(session.items, ['old']);
      expect(session.checkpoint, 'old-news');
      await expectLater(
        move(
          (_) async => FeedBatch(items: ['bad'], baseline: 'bad', next: null),
        ),
        throwsStateError,
      );
      expect(session.context, 'old');
      final canceled = move((_) => pending.future);
      session.cancelPending();
      await session.refresh('replacement');
      pending.complete(batch(['late'], 'late'));
      await canceled;
      expect(session.items, ['replacement']);
      final disposed = Completer<FeedBatch<String>>();
      final flight = move((_) => disposed.future);
      session.dispose();
      disposed.complete(batch(['late'], 'late'));
      await flight;
      expect(session.items, isEmpty);
    },
  );

  test(
    'scoped delta proof uses cache, completes preparation and fences old cursors/accounts',
    () async {
      var uid = 'viewer';
      final requests = <Map<String, Object?>>[];
      final client = FeedDeltaClient(
        project: 'project',
        currentUserId: () => uid,
        cache: FeedBodyCache(clock: () => 1000),
        send: (payload) async {
          requests.add(payload);
          if (payload['mode'] == 'recenter') {
            return {
              'version': 2,
              'state': 'preparing',
              'baseline': 'moved',
              'expiresAt': fixtures.deadline,
              'next': 'preparing',
              'items': [],
            };
          }
          final result = fixtures.reply(body: requests.length == 1);
          (result['bodyPage'] as Map)['movementToken'] = 'movement-proof';
          result['baseline'] = requests.length == 1 ? 'base' : 'moved';
          result['next'] = requests.length == 1 ? 'old-cursor' : null;
          return result;
        },
      );
      final gateway = FeedPageGateway<Map<String, dynamic>>(
        currentUserId: () => uid,
        send: client.load,
        decodeItem: (item) => item,
      );
      addTearDown(gateway.dispose);
      const old = SpatialFeedContext(
        latitude: 50,
        longitude: 14,
        radiusKm: 5,
        order: 'nearest',
      );
      const moved = SpatialFeedContext(
        latitude: 50.01,
        longitude: 14,
        radiusKm: 5,
        order: 'nearest',
      );
      final first = await gateway.load(old, null);
      final proof = client.movementProofFor(first.baseline)!;
      final second = await gateway.recenter(moved, proof, previous: old);
      expect(second.items.single['data']['text'], 'Body');
      expect(requests.length, 3); // no body refill; no B2 endpoint involved
      expect(requests[1]['mode'], 'recenter');
      expect(requests[1]['cold'], false);
      expect(requests[2]['cursor'], 'preparing');
      expect(requests[2].containsKey('point'), false);
      await expectLater(gateway.load(moved, first.next), throwsStateError);
      uid = 'other';
      expect(client.movementProofFor(first.baseline), isNull);
      client.retainViewer(uid);
      expect(client.movementProofFor(second.baseline), isNull);
      client.eraseAccount(uid);
      expect(client.movementProofFor(second.baseline), isNull);
    },
  );
}
