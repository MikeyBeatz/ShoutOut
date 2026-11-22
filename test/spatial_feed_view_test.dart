import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_page_gateway.dart';
import 'package:shoutout/feed_session.dart';
import 'package:shoutout/l10n/app_localizations.dart';
import 'package:shoutout/main.dart';

Map<String, dynamic> item(int index, {double? distance}) => {
  'id': 'shout-$index',
  'distanceKm': distance ?? index / 100,
  'data': {
    'authorId': 'author',
    'authorNickname': 'Fixture',
    'title': 'Card $index',
    'text': 'Full body $index',
    'categories': ['Dotaz'],
    'createdAt': 1794000000000,
    'expiresAt': 1994000000000,
    'status': 'active',
    'likesCount': index,
    'dislikesCount': 0,
    'commentsCount': 0,
    'savesCount': 0,
  },
};
Map<String, Object?> reply(List<Map<String, dynamic>> items, {String? next}) =>
    {
      'version': 1,
      'state': 'ready',
      'baseline': 'fixture',
      'expiresAt': 1994000000000,
      'items': items,
      'next': next,
    };

Widget harness(
  Widget child, {
  Widget? floatingActions,
  VoidCallback? onRefresh,
  VoidCallback? onNotifications,
}) => MaterialApp(
  locale: const Locale('cs'),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: Scaffold(
    body: FeedRefreshOverlay(
      onRefresh: onRefresh,
      onNotifications: onNotifications,
      child: child,
    ),
    floatingActionButton: floatingActions,
  ),
);

void main() {
  testWidgets(
    'integrated movement preserves visible card through large insertion and refresh restores header',
    (tester) async {
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      var revision = 0, refresh = 0;
      final rows = List.generate(90, (i) => decodeSpatialFeedItem(item(i)));
      Widget view(List<Shout> values) => harness(
        FeedPage(
          shouts: values,
          isLoading: false,
          onSave: (_) {},
          onReaction: (_, {required bool like}) async {},
          onNotifications: () {},
          filters: FeedFilters(),
          followedUserIds: {},
          spatial: SpatialFeedPresentation(
            scrollController: scroll,
            refresh: () {},
            changeFilters: (_) {},
            prefetch: () {},
            loadMore: () {},
            hasMore: false,
            loadingMore: false,
            refreshing: false,
            movementEnabled: true,
            movementRevision: revision,
            refreshRevision: refresh,
            card: (shout) => SizedBox(
              height: 100 + shout.id.hashCode % 3 * 20.0,
              child: Text(shout.title),
            ),
          ),
        ),
      );
      await tester.pumpWidget(view(rows));
      await tester.pumpAndSettle();
      scroll.jumpTo(2000);
      await tester.pumpAndSettle();
      final visible = rows.firstWhere((row) {
        final f = find.text(row.title);
        return f.evaluate().isNotEmpty &&
            tester.getTopLeft(f).dy >= 0 &&
            tester.getTopLeft(f).dy < 400;
      });
      final y = tester.getTopLeft(find.text(visible.title)).dy;
      final inserted = List.generate(
        70,
        (i) => decodeSpatialFeedItem(item(-i - 1, distance: .1)),
      );
      revision++;
      await tester.pumpWidget(
        view([...inserted, ...rows.where((row) => row.id != 'shout-2')]),
      );
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(find.text(visible.title)).dy, closeTo(y, .5));
      // Own deletion changes membership without a geographic revision.
      await tester.pumpWidget(
        view([
          ...inserted,
          ...rows.where((row) => row.id != 'shout-2' && row.id != 'shout-3'),
        ]),
      );
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(find.text(visible.title)).dy, closeTo(y, .5));
      refresh++;
      await tester.pumpWidget(view(rows));
      scroll.jumpTo(0);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('50 km'), findsWidgets);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'confirmed removal above the viewport preserves the next visible card anchor',
    (tester) async {
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      final rows = List.generate(
        25,
        (index) => decodeSpatialFeedItem(item(index)),
      );
      Widget view(List<Shout> values) => harness(
        FeedPage(
          shouts: values,
          isLoading: false,
          onSave: (_) {},
          onReaction: (_, {required bool like}) async {},
          onNotifications: () {},
          filters: FeedFilters(),
          followedUserIds: {},
          spatial: SpatialFeedPresentation(
            scrollController: scroll,
            refresh: () {},
            changeFilters: (_) {},
            prefetch: () {},
            loadMore: () {},
            hasMore: false,
            loadingMore: false,
            refreshing: false,
            card: (shout) => SizedBox(
              height: 100 + int.parse(shout.id.split('-').last) % 3 * 20.0,
              child: Text(shout.title),
            ),
          ),
        ),
      );
      await tester.pumpWidget(view(rows));
      await tester.pumpAndSettle();
      scroll.jumpTo(1000);
      await tester.pumpAndSettle();
      final visible = rows.where((row) {
        final found = find.text(row.title);
        if (found.evaluate().isEmpty) return false;
        final y = tester.getTopLeft(found).dy;
        return y >= 0 && y < 400;
      }).first;
      final before = tester.getTopLeft(find.text(visible.title)).dy;
      await tester.pumpWidget(
        view(rows.where((row) => row.id != 'shout-2').toList()),
      );
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.text(visible.title)).dy,
        closeTo(before, .5),
      );
      expect(find.text('Card 2'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'only a confirmed empty unread group shows the no-unread message',
    (tester) async {
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      Widget view(
        List<Shout> rows, {
        FeedOrder order = FeedOrder.nearest,
        bool loading = false,
      }) => harness(
        FeedPage(
          shouts: rows,
          isLoading: loading,
          onSave: (_) {},
          onReaction: (_, {required bool like}) async {},
          onNotifications: () {},
          filters: FeedFilters()..order = order,
          followedUserIds: {},
          spatial: SpatialFeedPresentation(
            scrollController: scroll,
            refresh: () {},
            changeFilters: (_) {},
            prefetch: () {},
            loadMore: () {},
            hasMore: true,
            loadingMore: false,
            refreshing: false,
            card: (shout) => SizedBox(height: 40, child: Text(shout.title)),
          ),
        ),
      );
      final read = decodeSpatialFeedItem({...item(1), 'read': true});
      await tester.pumpWidget(view([read]));
      await tester.pump();
      expect(find.text('Žádné nepřečtené Shouty'), findsOneWidget);
      expect(find.text('Přečtené'), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Žádné nepřečtené Shouty')).dy,
        lessThan(tester.getTopLeft(find.text('Přečtené')).dy),
      );
      for (final other in [
        view([]),
        view([read], loading: true),
        view([read], order: FeedOrder.popular),
        view([
          decodeSpatialFeedItem({...item(1), 'read': false}),
        ]),
      ]) {
        await tester.pumpWidget(other);
        await tester.pump();
        expect(find.byKey(const ValueKey('feed-no-unread')), findsNothing);
      }
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('B3 renders one frozen read separator at a page boundary', (
    tester,
  ) async {
    final scroll = ScrollController();
    addTearDown(scroll.dispose);
    final shouts = [
      decodeSpatialFeedItem({...item(1), 'read': false}),
    ];
    Widget view() => harness(
      FeedPage(
        shouts: List.of(shouts),
        isLoading: false,
        onSave: (_) {},
        onReaction: (_, {required bool like}) async {},
        onNotifications: () {},
        filters: FeedFilters(),
        followedUserIds: {},
        spatial: SpatialFeedPresentation(
          scrollController: scroll,
          refresh: () {},
          changeFilters: (_) {},
          prefetch: () {},
          loadMore: () {},
          hasMore: false,
          loadingMore: false,
          refreshing: false,
          card: (shout) => SizedBox(height: 40, child: Text(shout.title)),
        ),
      ),
    );
    await tester.pumpWidget(view());
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('feed-read-separator')), findsNothing);
    shouts.addAll([
      decodeSpatialFeedItem({...item(2), 'read': true}),
      decodeSpatialFeedItem({...item(3), 'read': true}),
    ]);
    await tester.pumpWidget(view());
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('feed-read-separator')), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Card 1')).dy,
      lessThan(tester.getTopLeft(find.text('Přečtené')).dy),
    );
    expect(
      tester.getTopLeft(find.text('Přečtené')).dy,
      lessThan(tester.getTopLeft(find.text('Card 2')).dy),
    );
    shouts.first.likes = 999;
    await tester.pumpWidget(view());
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('feed-read-separator')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test(
    'server DTO carries full content and timestamps into the existing Shout model',
    () {
      final shout = decodeSpatialFeedItem(item(1));
      expect(shout.id, 'shout-1');
      expect(shout.title, 'Card 1');
      expect(shout.text, 'Full body 1');
      expect(shout.createdAt.millisecondsSinceEpoch, 1794000000000);
      expect(shout.distanceKm, .01);
      for (final invalid in [
        {...item(1), 'distanceKm': -1},
        {...item(1), 'data': {}},
        {...item(1), 'id': null},
      ]) {
        expect(() => decodeSpatialFeedItem(invalid), throwsA(anything));
      }
    },
  );

  testWidgets('server ordering stays fixed when live counters change', (
    tester,
  ) async {
    final scroll = ScrollController();
    addTearDown(scroll.dispose);
    final shouts = [
      decodeSpatialFeedItem(item(1, distance: 4)),
      decodeSpatialFeedItem(item(2, distance: 1)),
    ];
    Widget view() => harness(
      FeedPage(
        shouts: shouts,
        isLoading: false,
        onSave: (_) {},
        onReaction: (_, {required bool like}) async {},
        onNotifications: () {},
        filters: FeedFilters(),
        followedUserIds: {},
        spatial: SpatialFeedPresentation(
          scrollController: scroll,
          refresh: () {},
          changeFilters: (_) {},
          prefetch: () {},
          loadMore: () {},
          hasMore: false,
          loadingMore: false,
          refreshing: false,
          card: (shout) => SizedBox(
            height: 60,
            child: Text('${shout.title}: ${shout.likes}'),
          ),
        ),
      ),
    );
    await tester.pumpWidget(view());
    await tester.pumpAndSettle();
    expect(
      tester.getTopLeft(find.text('Card 1: 1')).dy,
      lessThan(tester.getTopLeft(find.text('Card 2: 2')).dy),
    );
    shouts.first.likes = 100;
    await tester.pumpWidget(view());
    await tester.pumpAndSettle();
    expect(
      tester.getTopLeft(find.text('Card 1: 100')).dy,
      lessThan(tester.getTopLeft(find.text('Card 2: 2')).dy),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'floating feed actions stay reachable after paging; refresh preserves failure and returns to top on success',
    (tester) async {
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      StateSetter? update;
      var calls = 0;
      var failRefresh = false;
      var notificationsOpened = 0;
      String? error;
      final gateway = FeedPageGateway<Shout>(
        currentUserId: () => 'reader',
        decodeItem: decodeSpatialFeedItem,
        send: (payload) async {
          calls++;
          if (failRefresh) throw StateError('fixture network failure');
          return payload['cursor'] == null
              ? reply(List.generate(50, item), next: 'second')
              : reply(List.generate(20, (i) => item(i + 50)));
        },
      );
      const context = SpatialFeedContext(
        latitude: 50,
        longitude: 14,
        radiusKm: 5,
        order: 'nearest',
      );
      final session = FeedSessionController<Shout, SpatialFeedContext>(
        load: gateway.load,
        idOf: (shout) => shout.id,
        onChanged: () => update?.call(() {}),
      );
      addTearDown(() {
        session.dispose();
        gateway.dispose();
      });
      await session.refresh(context);
      Future<void> refresh() async {
        try {
          await session.refresh(context);
          error = null;
          if (scroll.hasClients) scroll.jumpTo(0);
        } catch (_) {
          error = 'Feed se nepodařilo načíst. Zkus to znovu.';
        }
        update?.call(() {});
      }

      await tester.pumpWidget(
        harness(
          StatefulBuilder(
            builder: (_, setState) {
              update = setState;
              return FeedPage(
                shouts: session.items,
                isLoading: false,
                onSave: (_) {},
                onReaction: (_, {required bool like}) async {},
                onNotifications: () {},
                showNotifications: false,
                filters: FeedFilters(),
                followedUserIds: {},
                spatial: SpatialFeedPresentation(
                  scrollController: scroll,
                  refresh: () => unawaited(refresh()),
                  changeFilters: (_) {},
                  prefetch: () => unawaited(session.prefetch()),
                  loadMore: () => unawaited(session.loadMore()),
                  hasMore: session.hasMore,
                  loadingMore: false,
                  refreshing: false,
                  message: error,
                  card: (shout) => SizedBox(
                    height: 80,
                    child: Text(shout.title, key: ValueKey('test-${shout.id}')),
                  ),
                ),
              );
            },
          ),
          onRefresh: () => unawaited(refresh()),
          onNotifications: () => notificationsOpened++,
          floatingActions: FloatingActionButton.extended(
            heroTag: 'create-shout',
            onPressed: () {},
            icon: const Icon(Icons.campaign_outlined),
            label: const Text('Přidat shout'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final refreshButton = find.byKey(const ValueKey('spatial-feed-refresh'));
      final refreshPosition = tester.getRect(refreshButton);
      final notificationsButton = find.byKey(
        const ValueKey('feed-notifications'),
      );
      final notificationsPosition = tester.getRect(notificationsButton);
      expect(notificationsPosition.size, refreshPosition.size);
      expect(notificationsPosition.top, refreshPosition.top);
      expect(notificationsPosition.right, lessThan(refreshPosition.left));
      expect(refreshPosition.top, lessThan(24));
      expect(refreshPosition.right, greaterThan(700));
      expect(
        refreshPosition.overlaps(
          tester.getRect(find.byType(NotificationBellButton)),
        ),
        isFalse,
      );
      expect(
        find.descendant(of: refreshButton, matching: find.byType(Text)),
        findsNothing,
      );
      expect(session.items.length, 50);
      expect(calls, 1);
      expect(
        find
            .byWidgetPredicate(
              (widget) =>
                  widget.key is ValueKey<String> &&
                  (widget.key as ValueKey<String>).value.startsWith(
                    'test-shout',
                  ),
            )
            .evaluate()
            .length,
        lessThan(15),
      );
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -10000));
      await tester.pumpAndSettle();
      expect(session.items.length, 70);
      expect(calls, 2);
      expect(scroll.offset, greaterThan(1000));
      expect(session.items.map((shout) => shout.id).toSet().length, 70);
      expect(refreshButton.hitTestable(), findsOneWidget);
      expect(tester.getRect(refreshButton), refreshPosition);
      expect(notificationsButton.hitTestable(), findsOneWidget);
      expect(tester.getRect(notificationsButton), notificationsPosition);
      await tester.tap(notificationsButton);
      await tester.pumpAndSettle();
      expect(notificationsOpened, 1);
      expect(calls, 2);
      expect(
        tester.getRect(refreshButton).bottom,
        lessThan(tester.getRect(find.text('Přidat shout')).top),
      );
      final before = scroll.offset;
      failRefresh = true;
      await tester.tap(find.byKey(const ValueKey('spatial-feed-refresh')));
      await tester.pumpAndSettle();
      expect(session.items.length, 70);
      expect(scroll.offset, before);
      expect(error, 'Feed se nepodařilo načíst. Zkus to znovu.');
      scroll.jumpTo(0);
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('spatial-feed-message')),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      scroll.jumpTo(before);
      await tester.pumpAndSettle();
      failRefresh = false;
      await tester.tap(refreshButton);
      await tester.pumpAndSettle();
      expect(session.items.length, 50);
      expect(scroll.offset, 0);
      expect(tester.takeException(), isNull);
      tester.view.physicalSize = Size(
        320 * tester.view.devicePixelRatio,
        740 * tester.view.devicePixelRatio,
      );
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpAndSettle();
      expect(refreshButton.hitTestable(), findsOneWidget);
      expect(notificationsButton.hitTestable(), findsOneWidget);
      expect(tester.getRect(refreshButton).right, lessThanOrEqualTo(320));
      expect(
        tester
            .getRect(refreshButton)
            .overlaps(tester.getRect(find.byType(NotificationBellButton))),
        isFalse,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'a requested filter does not relabel the committed page before success',
    (tester) async {
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      final filters = FeedFilters();
      FeedFilters? requested;
      await tester.pumpWidget(
        harness(
          FeedPage(
            shouts: const [],
            isLoading: false,
            onSave: (_) {},
            onReaction: (_, {required bool like}) async {},
            onNotifications: () {},
            filters: filters,
            followedUserIds: {},
            spatial: SpatialFeedPresentation(
              scrollController: scroll,
              refresh: () {},
              changeFilters: (next) => requested = next,
              prefetch: () {},
              loadMore: () {},
              hasMore: false,
              loadingMore: false,
              refreshing: false,
              card: (_) => const SizedBox(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byWidgetPredicate((widget) => widget is DropdownButton<double>),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('10 km').last);
      await tester.pumpAndSettle();
      expect(requested?.radius, 10);
      expect(filters.radius, 50);
      expect(tester.takeException(), isNull);
    },
  );
}
