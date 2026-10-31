import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_session.dart';

FeedBatch<String> batch(
  List<String> rows,
  Object? next, [
  String at = 'start',
]) => FeedBatch(items: rows, next: next, baseline: at);

void main() {
  test(
    'wrong snapshot page is rejected without advancing the cursor',
    () async {
      var baseline = 'wrong';
      final controller = FeedSessionController<String, String>(
        idOf: (id) => id,
        load: (_, cursor) async => cursor == null
            ? batch(['a'], 'next', 'original')
            : batch(['b'], null, baseline),
      );
      await controller.refresh('near');
      await expectLater(controller.loadMore(), throwsStateError);
      expect(controller.items, ['a']);
      expect(controller.hasMore, isTrue);
      baseline = 'original';
      await controller.loadMore();
      expect(controller.items, ['a', 'b']);
    },
  );

  test('failed news request keeps its checkpoint and can be retried', () async {
    var fail = true;
    final checked = <String>[];
    final controller = FeedSessionController<String, String>(
      idOf: (id) => id,
      load: (_, _) async => batch(['a'], null),
      loadNews: (_, checkpoint) async {
        checked.add(checkpoint);
        if (fail) throw StateError('offline');
        return FeedNewsDelta(checkpoint: 'new', available: {'b'});
      },
    );
    await controller.refresh('near');
    await expectLater(controller.checkNews(), throwsStateError);
    expect(controller.checkpoint, 'start');
    fail = false;
    await controller.checkNews();
    expect(checked, ['start', 'start']);
    expect(controller.newsCount, 1);
  });
  test(
    'one prefetch stays hidden until append; retries do not duplicate rows',
    () async {
      var calls = 0;
      final controller = FeedSessionController<String, String>(
        idOf: (id) => id,
        load: (context, cursor) async {
          calls++;
          return cursor == null
              ? batch(['a', 'b'], 'page2')
              : batch(['b', 'c'], null);
        },
      );
      await controller.refresh('near');
      await Future.wait([controller.prefetch(), controller.prefetch()]);
      await controller.prefetch();
      expect(calls, 2);
      expect(controller.items, ['a', 'b']);
      expect(controller.hasPreparedPage, isTrue);
      await Future.wait([controller.loadMore(), controller.loadMore()]);
      expect(controller.items, ['a', 'b', 'c']);
      expect(controller.hasMore, isFalse);
      await controller.loadMore();
      expect(calls, 2);
    },
  );

  test(
    'refresh failure preserves old context, items, next page and news',
    () async {
      var fail = false;
      final controller = FeedSessionController<String, String>(
        idOf: (id) => id,
        load: (context, cursor) async {
          if (fail) throw StateError('offline');
          return cursor == null ? batch(['a'], 'page2') : batch(['b'], null);
        },
        loadNews: (_, checkpoint) async =>
            FeedNewsDelta(checkpoint: 'checked', available: {'new'}),
      );
      await controller.refresh('old');
      await controller.prefetch();
      await controller.checkNews();
      fail = true;
      await expectLater(controller.refresh('new'), throwsStateError);
      expect(controller.context, 'old');
      expect(controller.items, ['a']);
      expect(controller.newsCount, 1);
      expect(controller.checkpoint, 'checked');
      expect(controller.hasPreparedPage, isTrue);
      await controller.loadMore();
      expect(controller.items, ['a', 'b']);
    },
  );

  test(
    'same refresh shares request; later context wins over slow earlier result',
    () async {
      final old = Completer<FeedBatch<String>>();
      var calls = 0;
      final controller = FeedSessionController<String, String>(
        idOf: (id) => id,
        load: (context, _) {
          calls++;
          return context == 'old'
              ? old.future
              : Future.value(batch(['new'], null));
        },
      );
      final first = controller.refresh('old');
      expect(identical(first, controller.refresh('old')), isTrue);
      await controller.refresh('new');
      old.complete(batch(['old'], null));
      await first;
      expect(controller.context, 'new');
      expect(controller.items, ['new']);
      expect(calls, 2);
    },
  );

  test('stale prefetch cannot append into refreshed feed', () async {
    final stale = Completer<FeedBatch<String>>();
    final controller = FeedSessionController<String, String>(
      idOf: (id) => id,
      load: (context, cursor) => cursor != null
          ? stale.future
          : Future.value(batch([context], 'next')),
    );
    await controller.refresh('old');
    final pending = controller.loadMore();
    await controller.refresh('new');
    stale.complete(batch(['stale'], null));
    await pending;
    expect(controller.items, ['new']);
    expect(controller.hasPreparedPage, isFalse);
  });

  test(
    'incremental news uses last successful checkpoint, never inserts/reorders feed',
    () async {
      final checkpoints = <String>[];
      final controller = FeedSessionController<String, String>(
        idOf: (id) => id,
        load: (_, _) async => batch(['old'], null, 'refresh'),
        loadNews: (_, checkpoint) async {
          checkpoints.add(checkpoint);
          return FeedNewsDelta(
            checkpoint: 'step${checkpoints.length}',
            available: {'n1', 'n2'},
            withdrawn: checkpoints.length > 1 ? {'n1'} : {},
          );
        },
      );
      await controller.refresh('near');
      await Future.wait([controller.checkNews(), controller.checkNews()]);
      expect(controller.newsCount, 2);
      await controller.checkNews();
      expect(checkpoints, ['refresh', 'step1']);
      expect(controller.newsCount, 1);
      expect(controller.items, ['old']);
      await controller.refresh('near');
      expect(controller.newsCount, 0);
      expect(controller.checkpoint, 'refresh');
    },
  );

  test(
    'inactive and disposed sessions start no prefetch or news work',
    () async {
      var calls = 0;
      final controller = FeedSessionController<String, String>(
        idOf: (id) => id,
        load: (_, _) async {
          calls++;
          return batch(['old'], 'next');
        },
        loadNews: (_, _) async {
          calls++;
          return FeedNewsDelta(checkpoint: 'later');
        },
      );
      await controller.refresh('near');
      controller.setActive(false);
      await controller.prefetch();
      await controller.loadMore();
      await controller.checkNews();
      expect(calls, 1);
      controller.dispose();
      expect(controller.items, isEmpty);
      expect(controller.context, isNull);
      controller.setActive(true);
      await controller.refresh('other');
      await controller.prefetch();
      await controller.checkNews();
      expect(calls, 1);
    },
  );
}
