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
}) => MaterialApp(
  locale: const Locale('cs'),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: Scaffold(
    body: FeedRefreshOverlay(onRefresh: onRefresh, child: child),
    floatingActionButton: floatingActions,
  ),
);

void main() {
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
    'floating refresh stays reachable after paging, preserves failed position and returns to top on success',
    (tester) async {
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      StateSetter? update;
      var calls = 0;
      var failRefresh = false;
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
      expect(filters.radius, 5);
      expect(tester.takeException(), isNull);
    },
  );
}
