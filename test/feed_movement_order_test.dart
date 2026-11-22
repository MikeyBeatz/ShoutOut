import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_session.dart';
import 'package:shoutout/main.dart';

import 'spatial_feed_view_test.dart' as fixtures;

class Ranked {
  const Ranked(this.id, this.distance, {this.read = false});
  final int id;
  final double distance;
  final bool read;
}

int compare(Ranked a, Ranked b) {
  final group = (a.read ? 1 : 0).compareTo(b.read ? 1 : 0);
  return group != 0 ? group : a.distance.compareTo(b.distance);
}

FeedBatch<Ranked> page(List<Ranked> rows, String baseline, Object? next) =>
    FeedBatch(
      items: rows,
      baseline: baseline,
      newsCheckpoint: '$baseline-news',
      next: next,
    );

void main() {
  test(
    'nearest comparator matches frozen group, distance, precise time and binary ID',
    () {
      Shout shout(
        String id, {
        bool read = false,
        double distance = .1,
        num time = 1794000000000,
      }) {
        final data = fixtures.item(1, distance: distance);
        data['id'] = id;
        data['read'] = read;
        (data['data'] as Map)['createdAt'] = time;
        return decodeSpatialFeedItem(data);
      }

      final a = shout('A'), z = shout('Z'), lower = shout('a');
      final recent = shout('recent', time: 1794000000000.125);
      final farther = shout('farther', distance: .2),
          read = shout('read', read: true, distance: 0);
      final rows = [read, farther, lower, z, a, recent]
        ..sort(compareNearestSpatialShouts);
      expect(rows.map((s) => s.id), [
        'recent',
        'A',
        'Z',
        'a',
        'farther',
        'read',
      ]);
      expect(recent.feedCreatedAtMillis, 1794000000000.125);
      // Live counters never move a card or change its frozen unread/read group.
      a.dislikes = 100;
      expect(a.isHiddenByRating, true);
      rows.sort(compareNearestSpatialShouts);
      expect(rows.map((s) => s.id), [
        'recent',
        'A',
        'Z',
        'a',
        'farther',
        'read',
      ]);
    },
  );

  test(
    'reversed movement catches up canonical pages even when a page adds no IDs',
    () async {
      var elapsed = Duration.zero;
      final old = List.generate(
        200,
        (i) => Ranked(i, i.toDouble(), read: i >= 140),
      );
      final moved = List.generate(
        200,
        (i) => Ranked(i, (199 - i).toDouble(), read: i >= 140),
      )..sort(compare);
      final calls = <Object?>[];
      final session = FeedSessionController<Ranked, String>(
        idOf: (row) => '${row.id}',
        elapsedClock: () => elapsed,
        compareFor: (context) => context == 'other-order' ? null : compare,
        load: (context, cursor) async {
          calls.add(cursor);
          final rows = context == 'old' ? old : moved;
          final offset = cursor as int? ?? 0;
          return page(
            rows.sublist(offset, offset + 50),
            context,
            offset + 50 == rows.length ? null : offset + 50,
          );
        },
        loadNews: (_, checkpoint) async => FeedNewsDelta.confirmed(
          checkpoint: checkpoint,
          baseline: 'old',
          count: 2,
          validFor: const Duration(minutes: 40),
        ),
      );
      addTearDown(session.dispose);
      await session.refresh('old');
      await session.loadMore();
      await session.checkNews();
      elapsed = const Duration(minutes: 20);
      await session.recenter(
        'new',
        loadMoved: (_) async => page(moved.sublist(0, 50), 'new', 50),
        retain: (_, _) => true,
        isRead: (row) => row.read,
        relocate: (row, _) => moved.singleWhere((r) => r.id == row.id),
      );
      expect(session.items.length, 140);
      expect(
        session.items.map((r) => r.id),
        List.generate(140, (i) => 139 - i),
      );
      expect(session.needsCoverageFor('0'), true);
      expect(session.needsCoverageFor('139'), false);
      expect(session.needsCoverageFor('absent'), false);
      expect(session.newsCount, 2);
      expect(session.newsIsCurrent, false);
      expect(session.checkpoint, 'new-news');
      session.setActive(false);
      expect(session.needsCoverageFor('0'), false);
      session.setActive(true);
      await session.loadMore();
      expect(
        session.items.length,
        140,
        reason: 'cursor advances through duplicate retained IDs',
      );
      expect(session.needsCoverageFor('0'), true);
      await session.loadMore();
      expect(session.needsCoverageFor('0'), false);
      expect(session.items.length, 150);
      await session.loadMore();
      expect(session.items, moved);
      expect(session.hasMore, false);
      expect(session.needsCoverageFor('140'), false);
      expect(calls, [null, 50, 50, 100, 150]);
      elapsed = const Duration(hours: 1);
      expect(
        session.needsRefresh,
        true,
        reason: 'movement never renews the original deadline',
      );
    },
  );

  test(
    'page replacement preserves canonical keys; failure and stale prefetched rows cannot commit',
    () async {
      final delayed = Completer<FeedBatch<Ranked>>();
      var fail = true;
      final old = [const Ranked(1, 1), const Ranked(2, 2)];
      final moved = [
        const Ranked(2, 1),
        const Ranked(1, 2),
        const Ranked(3, 3),
      ];
      final session = FeedSessionController<Ranked, String>(
        idOf: (row) => '${row.id}',
        compareFor: (_) => compare,
        load: (context, cursor) async {
          if (cursor == null) return page(old, 'old', 'old-page');
          if (context == 'old') return delayed.future;
          if (fail) throw StateError('offline');
          return page(moved.sublist(1), 'new', null);
        },
      );
      addTearDown(session.dispose);
      await session.refresh('old');
      final stale = session.prefetch();
      await session.recenter(
        'new',
        loadMoved: (_) async => page(moved.sublist(0, 1), 'new', 'new-page'),
        retain: (_, _) => true,
        isRead: (r) => r.read,
        relocate: (r, _) => moved.singleWhere((m) => m.id == r.id),
      );
      delayed.complete(page([const Ranked(99, 99)], 'old', null));
      await stale;
      await expectLater(session.loadMore(), throwsStateError);
      expect(session.items.map((r) => r.id), [2, 1]);
      expect(session.needsCoverageFor('1'), true);
      fail = false;
      await session.loadMore();
      expect(identical(session.items[1], moved[1]), true);
      expect(session.items, moved);
      expect(session.needsCoverageFor('3'), false);
    },
  );

  test(
    'invalid order rejects atomically; optional comparator leaves other modes stable',
    () async {
      var invalid = false;
      final session = FeedSessionController<Ranked, String>(
        idOf: (r) => '${r.id}',
        compareFor: (c) => c == 'nearest' ? compare : null,
        load: (_, cursor) async => cursor == null
            ? page([const Ranked(1, 1)], 'base', 'page')
            : page([Ranked(2, invalid ? .5 : 2)], 'base', null),
      );
      addTearDown(session.dispose);
      await session.refresh('nearest');
      invalid = true;
      await expectLater(session.loadMore(), throwsStateError);
      expect(session.items.map((r) => r.id), [1]);
      expect(session.hasMore, true);
      await expectLater(
        session.recenter(
          'nearest',
          loadMoved: (_) async =>
              page([const Ranked(3, 3), const Ranked(2, 2)], 'new', null),
          retain: (_, _) => true,
          isRead: (r) => r.read,
          relocate: (r, _) => r,
        ),
        throwsStateError,
      );
      expect(session.baseline, 'base');
      await session.refresh('top');
      await session.loadMore();
      expect(session.items.map((r) => r.id), [1, 2]);
      expect(session.needsCoverageFor('2'), false);
    },
  );
}
