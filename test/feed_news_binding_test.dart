import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_body_cache.dart';
import 'package:shoutout/feed_delta_client.dart';
import 'package:shoutout/feed_news_binding.dart';
import 'package:shoutout/feed_news_runtime.dart';
import 'package:shoutout/feed_page_gateway.dart';
import 'package:shoutout/feed_session.dart';

import 'feed_delta_client_test.dart' as fixture;

class Host {
  Host() {
    client = FeedDeltaClient(
      project: 'project',
      currentUserId: () => uid,
      cache: FeedBodyCache(clock: () => now),
      send: (payload) async {
        if (payload['mode'] == 'news') {
          newsCalls++;
          if (pendingNews != null) return pendingNews!.future;
          return countReply();
        }
        if (failPage) throw StateError('offline');
        final reply = fixture.reply();
        reply['newsCheckpoint'] = 'signed-start';
        final body = reply['bodyPage'] as Map;
        body['uid'] = uid;
        (body['live'] as Map)['uid'] = uid;
        body['newsSignals'] = {
          'v': 1,
          'baseline': 'base',
          'generation': 'g',
          'incarnation': [1, 0],
          'heads': {'_control': null},
        };
        return reply;
      },
    );
    gateway = FeedPageGateway<String>(
      currentUserId: () => uid,
      send: client.load,
      decodeItem: (row) => row['id'] as String,
    );
    session = FeedSessionController<String, SpatialFeedContext>(
      idOf: (id) => id,
      elapsedClock: () => Duration(milliseconds: now),
      load: gateway.load,
      loadNews: (_, token) => client.news(token),
      onChanged: () {
        bind();
        if (interruptCommit && session.context != null) {
          interruptCommit = false;
          foreground(false);
        }
      },
    );
    runtime = FeedNewsRuntime(
      check: session.checkNews,
      readHeads: () => client.signals(session.checkpoint!),
      watch: (_, _) {
        watches++;
        return signals.stream;
      },
      pendingCount: () => session.newsCount,
      invalidate: session.invalidateNews,
      clock: () => now,
      jitter: () => 1,
    );
    binding = FeedNewsBinding(
      runtime: runtime,
      signalsFor: client.newsSignalsFor,
    );
  }
  String? uid = 'viewer';
  int now = 0, request = 0, newsCalls = 0, watches = 0;
  bool active = true,
      loading = false,
      interruptCommit = false,
      failPage = false;
  Completer<Object?>? pendingNews;
  final signals = StreamController<FeedNewsSignal>.broadcast(sync: true);
  late final FeedDeltaClient client;
  late final FeedPageGateway<String> gateway;
  late final FeedSessionController<String, SpatialFeedContext> session;
  late final FeedNewsRuntime runtime;
  late final FeedNewsBinding binding;
  Map<String, Object?> countReply() => {
    'version': 1,
    'state': 'ready',
    'checkpoint': 'signed-next',
    'count': 1,
    'capped': false,
    'baseline': 'base',
    'checkedAt': now,
    'validForMillis': 60000,
  };
  void bind({bool fresh = false}) => binding.update(
    baseline: session.baseline,
    active: active,
    loading: loading || session.isRefreshing,
    expired: session.needsRefresh,
    freshBaseline: fresh,
  );
  Future<void> refresh() async {
    runtime.setActive(false);
    loading = true;
    final attempt = ++request;
    var success = false;
    try {
      await session.refresh(
        const SpatialFeedContext(
          latitude: 50.53,
          longitude: 14.13,
          radiusKm: 50,
          order: 'nearest',
        ),
      );
      success = true;
    } finally {
      if (attempt == request) {
        loading = false;
        bind(fresh: success);
      }
    }
  }

  void foreground(bool value) {
    active = value;
    session.setActive(value);
    if (!value) {
      gateway.cancelPending();
      session.cancelPending();
      request++;
      loading = false;
    }
    bind();
    if (value) runtime.pulse(immediate: true);
  }

  Future<void> tick(WidgetTester tester, int ms) async {
    now += ms;
    await tester.pump(Duration(milliseconds: ms));
    await tester.pump();
  }

  Future<void> close() async {
    runtime.dispose();
    session.dispose();
    gateway.dispose();
    await signals.close();
  }
}

void main() {
  testWidgets(
    'committed page interrupted before host finalization resumes news without reloading cards',
    (tester) async {
      final h = Host()..interruptCommit = true;
      await h.refresh();
      expect(h.session.items, ['one']);
      expect(h.watches, 0);
      h.foreground(true);
      await h.tick(tester, 1);
      expect(h.watches, 1);
      expect(h.newsCalls, 1);
      expect(h.session.newsCount, 1);
      expect(h.session.items, ['one']);
      await h.close();
    },
  );
  testWidgets(
    'fresh baseline is quiet; a publication counts once and repeated binding adds no subscriptions',
    (tester) async {
      final h = Host();
      await h.refresh();
      await h.tick(tester, 1);
      expect(h.newsCalls, 0);
      expect(h.watches, 1);
      for (var n = 0; n < 20; n++) {
        h.bind();
      }
      expect(h.watches, 1);
      h.signals.add(FeedNewsSignal('a' * 36));
      await h.tick(tester, 2000);
      expect(h.newsCalls, 1);
      expect(h.session.newsCount, 1);
      expect(h.session.items, ['one']);
      await h.close();
    },
  );
  testWidgets(
    'background and tab suspension have no work; returning catches up on the same baseline',
    (tester) async {
      final h = Host();
      await h.refresh();
      h.foreground(false);
      h.signals.add(FeedNewsSignal('b' * 36));
      await h.tick(tester, 20000);
      expect(h.newsCalls, 0);
      expect(h.signals.hasListener, false);
      h.foreground(true);
      await h.tick(tester, 1);
      expect(h.newsCalls, 1);
      expect(h.watches, 2);
      expect(h.session.baseline, 'base');
      expect(h.session.items, ['one']);
      await h.close();
    },
  );
  testWidgets(
    'failed refresh restores the prior committed news context without clearing cards',
    (tester) async {
      final h = Host();
      await h.refresh();
      h.failPage = true;
      await expectLater(h.refresh(), throwsStateError);
      await h.tick(tester, 1);
      expect(h.session.items, ['one']);
      expect(h.newsCalls, 1);
      expect(h.session.newsCount, 1);
      await h.close();
    },
  );
  testWidgets(
    'switching accounts or signing out cannot expose prior news context or commit an old response',
    (tester) async {
      final h = Host();
      await h.refresh();
      h.pendingNews = Completer<Object?>();
      h.runtime.pulse(immediate: true);
      await h.tick(tester, 1);
      expect(h.newsCalls, 1);
      h.uid = 'another-viewer';
      expect(h.client.newsSignalsFor('base'), isNull);
      h.bind();
      expect(h.signals.hasListener, false);
      h.pendingNews!.complete(h.countReply());
      await h.tick(tester, 1);
      expect(h.session.newsCount, 0);
      h.uid = null;
      h.bind();
      expect(h.client.newsSignalsFor('base'), isNull);
      await h.close();
    },
  );
  testWidgets('expired page and disposed view cannot restart polling', (
    tester,
  ) async {
    final h = Host();
    await h.refresh();
    h.now += 3600001;
    h.bind();
    h.runtime.pulse(immediate: true);
    await h.tick(tester, 1);
    expect(h.newsCalls, 0);
    expect(h.signals.hasListener, false);
    await h.close();
    await h.tick(tester, 20000);
    expect(h.newsCalls, 0);
  });
}
