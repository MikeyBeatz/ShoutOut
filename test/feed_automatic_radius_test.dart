import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_page_gateway.dart';
import 'package:shoutout/feed_session.dart';
import 'package:shoutout/l10n/app_localizations.dart';
import 'package:shoutout/main.dart';

Map<String, dynamic> row(int id, double distance) => {
  'id': 'auto-$id',
  'distanceKm': distance,
  'data': {
    'authorId': 'fixture',
    'authorNickname': 'Fixture',
    'title': 'Auto $id',
    'text': 'Body',
    'categories': ['Dotaz'],
    'createdAt': 1794000000000,
    'expiresAt': 1994000000000,
    'status': 'active',
  },
};

void main() {
  testWidgets(
    'manual range and expansion fit a narrow view in every supported language',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      for (final locale in AppLocalizations.supportedLocales) {
        for (final automatic in [true, false]) {
          await tester.pumpWidget(
            MaterialApp(
              locale: locale,
              theme: ThemeData.light(),
              darkTheme: ThemeData.dark(),
              themeMode: automatic ? ThemeMode.dark : ThemeMode.light,
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              home: Scaffold(
                body: FeedPage(
                  shouts: automatic
                      ? [decodeSpatialFeedItem(row(1, 15))]
                      : const [],
                  isLoading: false,
                  onSave: (_) {},
                  onReaction: (_, {required bool like}) async {},
                  onNotifications: () {},
                  filters: FeedFilters()..radius = automatic ? 50 : 5,
                  followedUserIds: const {},
                  showNotifications: false,
                  spatial: SpatialFeedPresentation(
                    scrollController: scroll,
                    refresh: () {},
                    changeFilters: (_) {},
                    prefetch: () {},
                    loadMore: () {},
                    card: (shout) => Text(shout.title),
                    hasMore: false,
                    loadingMore: false,
                    refreshing: false,
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(
            tester.takeException(),
            isNull,
            reason: '${locale.languageCode}/$automatic',
          );
        }
      }
    },
  );
  test('default is 50 km; manual copies preserve category and ordering', () {
    expect(FeedFilters().radius, 50);
    final manual = FeedFilters()
      ..radius = 5
      ..selectedCategory = 'Dotaz'
      ..order = FeedOrder.popular;
    final automatic = manual.copy()..radius = 50;
    expect(manual.searchRadius, 5);
    expect(automatic.searchRadius, 50);
    expect(
      automatic.radius,
      50,
    ); // The copied radius is the actual server scope.
    expect(automatic.selectedCategory, 'Dotaz');
    expect(automatic.order, FeedOrder.popular);
    expect((automatic.copy()..radius = 5).searchRadius, 5);
  });

  test('one 50 km selection pages without repeated radius searches', () async {
    final payloads = <Map<String, Object?>>[];
    final candidates = [
      for (var i = 0; i < 25; i++) row(i, 10 + i / 3),
      for (var i = 25; i < 200; i++) row(i, 21 + (i - 25) / 7),
    ];
    final gateway = FeedPageGateway<Shout>(
      currentUserId: () => 'reader',
      decodeItem: decodeSpatialFeedItem,
      send: (payload) async {
        payloads.add(payload);
        final first = payload['cursor'] == null;
        return {
          'version': 1,
          'state': 'ready',
          'baseline': 'auto-baseline',
          'expiresAt': 1994000000000,
          'items': first
              ? candidates.take(50).toList()
              : candidates.skip(50).take(50).toList(),
          'next': first ? 'next-50' : null,
        };
      },
    );
    final session = FeedSessionController<Shout, SpatialFeedContext>(
      load: gateway.load,
      idOf: (shout) => shout.id,
    );
    addTearDown(session.dispose);
    addTearDown(gateway.dispose);
    final filters = FeedFilters()..radius = 50;
    await session.refresh(
      SpatialFeedContext(
        latitude: 50,
        longitude: 14,
        radiusKm: filters.searchRadius,
        order: 'nearest',
      ),
    );
    expect(payloads, hasLength(1));
    expect((payloads.single['context'] as Map)['radiusKm'], 50);
    expect(session.items, hasLength(50));
    expect(session.items.where((item) => item.distanceKm <= 20), hasLength(25));
    expect(session.items.where((item) => item.distanceKm > 20), hasLength(25));
    await session.prefetch();
    expect(session.items, hasLength(50));
    expect(payloads, hasLength(2));
    expect(payloads.last['cursor'], 'next-50');
    expect(payloads.last.containsKey('context'), isFalse);
    await session.loadMore();
    expect(payloads, hasLength(2));
    expect(session.items, hasLength(100));
    expect(session.items.first.id, 'auto-0');
  });

  testWidgets(
    'manual empty radius expands only on consent, preserving other filters',
    (tester) async {
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      final filters = FeedFilters()
        ..radius = 5
        ..selectedCategory = 'Dotaz'
        ..order = FeedOrder.popular;
      FeedFilters? requested;
      Widget view({
        bool more = false,
        String? message,
        bool loading = false,
        bool automatic = false,
      }) => MaterialApp(
        locale: const Locale('cs'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: FeedPage(
            shouts: const [],
            isLoading: loading,
            onSave: (_) {},
            onReaction: (_, {required bool like}) async {},
            onNotifications: () {},
            filters: automatic ? (filters.copy()..radius = 50) : filters,
            followedUserIds: const {},
            showNotifications: false,
            spatial: SpatialFeedPresentation(
              scrollController: scroll,
              refresh: () {},
              changeFilters: (next) => requested = next,
              prefetch: () {},
              loadMore: () {},
              card: (_) => const SizedBox(),
              hasMore: more,
              loadingMore: false,
              refreshing: loading,
              message: message,
            ),
          ),
        ),
      );
      final expand = find.byKey(const ValueKey('feed-expand-radius'));
      await tester.pumpWidget(view());
      await tester.pumpAndSettle();
      expect(expand, findsOneWidget);
      expect(requested, isNull);
      await tester.ensureVisible(expand);
      await tester.tap(expand);
      expect(requested?.radius, 50);
      expect(requested?.searchRadius, 50);
      expect(requested?.selectedCategory, 'Dotaz');
      expect(requested?.order, FeedOrder.popular);
      expect(filters.radius, 5); // Commit only after successful load.
      for (final child in [
        view(more: true),
        view(message: 'Feed se nepodařilo načíst. Zkus to znovu.'),
        view(automatic: true),
      ]) {
        await tester.pumpWidget(child);
        await tester.pumpAndSettle();
        expect(expand, findsNothing);
      }
      filters.radius = 50;
      await tester.pumpWidget(view());
      await tester.pumpAndSettle();
      expect(expand, findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'coverage banner and duplicate Auto are absent; manual choice is committed later',
    (tester) async {
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      final filters = FeedFilters()..radius = 50;
      FeedFilters? requested;
      Widget view(List<Shout> rows) => MaterialApp(
        locale: const Locale('cs'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: FeedPage(
            shouts: rows,
            isLoading: false,
            onSave: (_) {},
            onReaction: (_, {required bool like}) async {},
            onNotifications: () {},
            filters: filters,
            followedUserIds: const {},
            showNotifications: false,
            spatial: SpatialFeedPresentation(
              scrollController: scroll,
              refresh: () {},
              changeFilters: (next) => requested = next,
              prefetch: () {},
              loadMore: () {},
              card: (shout) => SizedBox(height: 40, child: Text(shout.title)),
              hasMore: false,
              loadingMore: false,
              refreshing: false,
            ),
          ),
        ),
      );
      await tester.pumpWidget(view([decodeSpatialFeedItem(row(1, 15))]));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('feed-automatic-coverage')),
        findsNothing,
      );
      await tester.pumpWidget(
        view([
          decodeSpatialFeedItem(row(1, 15)),
          decodeSpatialFeedItem(row(2, 35)),
        ]),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('feed-automatic-coverage')),
        findsNothing,
      );
      await tester.tap(find.byType(DropdownButton<double>));
      await tester.pumpAndSettle();
      expect(find.text('Auto'), findsNothing);
      expect(find.text('Auto (max. 50 km)'), findsNothing);
      await tester.tap(find.text('3 km').last);
      await tester.pumpAndSettle();
      expect(requested?.radius, 3);
      expect(requested?.searchRadius, 3);
      expect(filters.radius, 50);
      expect(tester.takeException(), isNull);
    },
  );
}
