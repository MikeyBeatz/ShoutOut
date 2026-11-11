import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/l10n/app_localizations.dart';
import 'package:shoutout/main.dart';
import 'package:shoutout/saved_shouts_gateway.dart';

Map<String, dynamic> item(int index, {String owner = 'owner'}) => {
  'id': 'saved$index',
  'distanceKm': 0,
  'data': {
    'authorId': '$owner-author',
    'authorNickname': 'Owner',
    'title': 'Saved $index',
    'text': 'Full body',
    'categories': ['Dotaz'],
    'status': 'expired',
    'createdAt': 1794000000000,
    'expiresAt': 1794000060000,
    'likesCount': 0,
    'dislikesCount': 0,
    'commentsCount': 0,
    'savesCount': 0,
  },
};
String cursor(int index, {String owner = 'owner'}) =>
    'shouts/saved$index/saves/$owner';
Map<String, dynamic> page(Iterable<int> ids, {String? next}) => {
  'version': 1,
  'items': ids.map(item).toList(),
  'next': next,
};
Widget view(
  SavedShoutsGateway<Shout> gateway, {
  ValueChanged<Shout>? onSave,
  Map<String, VoidCallback>? unavailable,
}) => MaterialApp(
  locale: const Locale('cs'),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: Scaffold(
    body: SavedShoutsLibrary(
      key: const ValueKey('own-library'),
      gateway: gateway,
      onSave: onSave ?? (_) {},
      onReaction: (_, {required bool like}) async {},
      cardBuilder: (shout, hidden) {
        unavailable?[shout.id] = hidden;
        return SizedBox(
          height: 72,
          child: Row(
            children: [
              Text(shout.title),
              IconButton(
                key: ValueKey('save-${shout.id}'),
                onPressed: () => onSave?.call(shout),
                icon: const Icon(Icons.bookmark),
              ),
            ],
          ),
        );
      },
    ),
  ),
);

void main() {
  testWidgets(
    'an empty nonfinal page keeps continuation instead of claiming an empty history',
    (tester) async {
      final gateway = SavedShoutsGateway<Shout>(
        currentUserId: () => 'owner',
        decodeItem: decodeSpatialFeedItem,
        send: (payload) async =>
            payload['after'] == null ? page([], next: cursor(49)) : page([50]),
      );
      await tester.pumpWidget(view(gateway));
      await tester.pumpAndSettle();
      expect(find.text('Zatím nemáš uložené žádné shouty.'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('saved-shouts-more')));
      await tester.pumpAndSettle();
      expect(find.text('Saved 50'), findsOneWidget);
    },
  );
  test('gateway validates owned cursor while allowing other authors', () async {
    var calls = 0;
    final gateway = SavedShoutsGateway<Shout>(
      currentUserId: () => 'owner',
      decodeItem: decodeSpatialFeedItem,
      send: (_) async {
        calls++;
        return page([0]);
      },
    );
    for (final after in [
      cursor(49, owner: 'other'),
      'invalid',
      'shouts/x/likes/owner',
    ]) {
      await expectLater(gateway.load(after: after), throwsStateError);
    }
    expect(calls, 0);
    expect((await gateway.load()).items.single.authorId, 'owner-author');
  });

  test(
    'gateway rejects duplicate/oversized pages and a repeated continuation',
    () async {
      for (final data in [
        page([0, 0]),
        page(List.generate(51, (i) => i)),
        page([50], next: cursor(49)),
      ]) {
        final gateway = SavedShoutsGateway<Shout>(
          currentUserId: () => 'owner',
          decodeItem: decodeSpatialFeedItem,
          send: (_) async => data,
        );
        await expectLater(gateway.load(after: cursor(49)), throwsStateError);
      }
    },
  );

  test('gateway ignores responses after account change or disposal', () async {
    for (final dispose in [false, true]) {
      var uid = 'owner';
      final response = Completer<Map<String, dynamic>>();
      final gateway = SavedShoutsGateway<Shout>(
        currentUserId: () => uid,
        decodeItem: decodeSpatialFeedItem,
        send: (_) => response.future,
      );
      final pending = gateway.load();
      final expectation = expectLater(pending, throwsStateError);
      if (dispose) {
        gateway.dispose();
      } else {
        uid = 'other';
      }
      response.complete(page([0]));
      await expectation;
    }
  });

  testWidgets(
    'saved list pages beyond 50; failed continuation preserves scroll and retries the same boundary',
    (tester) async {
      final calls = <Map<String, dynamic>>[];
      var fail = true;
      final gateway = SavedShoutsGateway<Shout>(
        currentUserId: () => 'owner',
        decodeItem: decodeSpatialFeedItem,
        send: (payload) async {
          calls.add(payload);
          if (payload['after'] == null) {
            return page(List.generate(50, (i) => i), next: cursor(49));
          }
          if (fail) throw StateError('network');
          return page(List.generate(11, (i) => i + 49));
        },
      );
      await tester.pumpWidget(view(gateway));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('saved-shouts-more')), findsNothing);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('saved-shouts-more')),
        500,
      );
      await tester.pumpAndSettle();
      final scroll = tester.state<ScrollableState>(find.byType(Scrollable));
      final before = scroll.position.pixels;
      await tester.tap(find.byKey(const ValueKey('saved-shouts-more')));
      await tester.pumpAndSettle();
      expect(scroll.position.pixels, before);
      expect(find.byKey(const ValueKey('saved-shouts-retry')), findsOneWidget);
      fail = false;
      await tester.tap(find.byKey(const ValueKey('saved-shouts-retry')));
      await tester.pumpAndSettle();
      expect(calls.length, 3);
      expect(calls[1]['after'], calls[2]['after']);
      expect(scroll.position.pixels, before);
      await tester.scrollUntilVisible(find.text('Saved 59'), 500);
      await tester.pumpAndSettle();
      expect(find.text('Saved 59'), findsOneWidget);
      expect(find.byKey(const ValueKey('saved-shouts-more')), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'a pending continuation keeps the mounted list and bottom scroll until the page arrives',
    (tester) async {
      final continuation = Completer<Map<String, dynamic>>();
      final gateway = SavedShoutsGateway<Shout>(
        currentUserId: () => 'owner',
        decodeItem: decodeSpatialFeedItem,
        send: (payload) async => payload['after'] == null
            ? page(List.generate(50, (i) => i), next: cursor(49))
            : continuation.future,
      );
      await tester.pumpWidget(view(gateway));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Saved 49'), 500);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('saved-shouts-more')),
        100,
      );
      await tester.pumpAndSettle();
      final scroll = tester.state<ScrollableState>(find.byType(Scrollable));
      final position = scroll.position, before = position.pixels;
      expect(before, greaterThan(0));
      expect(
        tester.getSize(find.byKey(const ValueKey('saved-shouts-more'))).width,
        lessThan(
          tester
                  .getSize(find.byKey(const ValueKey('saved-shouts-list')))
                  .width /
              2,
        ),
      );
      await tester.tap(find.byKey(const ValueKey('saved-shouts-more')));
      await tester.pump();
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      final pending = tester.state<ScrollableState>(find.byType(Scrollable));
      expect(pending.position, same(position));
      expect(pending.position.pixels, before);
      expect(find.text('Saved 49').hitTestable(), findsOneWidget);
      continuation.complete(page(List.generate(10, (i) => i + 50)));
      await tester.pumpAndSettle();
      final completed = tester.state<ScrollableState>(find.byType(Scrollable));
      expect(completed.position, same(position));
      expect(completed.position.pixels, before);
      expect(find.byKey(const ValueKey('saved-shouts-more')), findsNothing);
      await tester.scrollUntilVisible(find.text('Saved 59'), 500);
      expect(find.text('Saved 59').hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'refresh failure keeps loaded rows; a successful retry returns to the first page',
    (tester) async {
      var calls = 0, fail = false;
      final gateway = SavedShoutsGateway<Shout>(
        currentUserId: () => 'owner',
        decodeItem: decodeSpatialFeedItem,
        send: (payload) async {
          calls++;
          if (fail) throw StateError('network');
          return page(List.generate(20, (i) => i));
        },
      );
      await tester.pumpWidget(view(gateway));
      await tester.pumpAndSettle();
      await tester.drag(
        find.byKey(const ValueKey('saved-shouts-list')),
        const Offset(0, -500),
      );
      await tester.pumpAndSettle();
      final scroll = tester.state<ScrollableState>(find.byType(Scrollable)),
          before = scroll.position.pixels;
      fail = true;
      await tester.tap(find.byKey(const ValueKey('saved-shouts-refresh')));
      await tester.pumpAndSettle();
      expect(scroll.position.pixels, before);
      fail = false;
      await tester.tap(find.byKey(const ValueKey('saved-shouts-retry')));
      await tester.pumpAndSettle();
      expect(calls, 3);
      expect(scroll.position.pixels, 0);
      expect(find.text('Saved 0').hitTestable(), findsOneWidget);
    },
  );

  testWidgets(
    'unsave waits for live acknowledgement; a stale page cannot restore a removed row',
    (tester) async {
      final unavailable = <String, VoidCallback>{};
      final delayed = Completer<Map<String, dynamic>>();
      var saves = 0;
      final gateway = SavedShoutsGateway<Shout>(
        currentUserId: () => 'owner',
        decodeItem: decodeSpatialFeedItem,
        send: (p) async =>
            p['after'] == null ? page([0, 1], next: cursor(1)) : delayed.future,
      );
      await tester.pumpWidget(
        view(gateway, unavailable: unavailable, onSave: (_) => saves++),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('save-saved0')));
      await tester.pumpAndSettle();
      expect(saves, 1);
      expect(find.text('Saved 0'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('saved-shouts-more')));
      await tester.pump();
      unavailable['saved0']!();
      await tester.pump();
      expect(find.text('Saved 0'), findsNothing);
      delayed.complete(page([0, 2]));
      await tester.pumpAndSettle();
      expect(find.text('Saved 0'), findsNothing);
      expect(find.text('Saved 1'), findsOneWidget);
      expect(find.text('Saved 2'), findsOneWidget);
    },
  );

  testWidgets(
    'refresh preserves removals made during its request and ignores previous generation callbacks',
    (tester) async {
      final unavailable = <String, VoidCallback>{};
      final delayed = Completer<Map<String, dynamic>>();
      var calls = 0;
      final gateway = SavedShoutsGateway<Shout>(
        currentUserId: () => 'owner',
        decodeItem: decodeSpatialFeedItem,
        send: (_) async => ++calls == 1 ? page([0, 1]) : delayed.future,
      );
      await tester.pumpWidget(view(gateway, unavailable: unavailable));
      await tester.pumpAndSettle();
      final stale = unavailable['saved1']!;
      await tester.tap(find.byKey(const ValueKey('saved-shouts-refresh')));
      await tester.pump();
      unavailable['saved0']!();
      delayed.complete(page([0, 1]));
      await tester.pumpAndSettle();
      expect(find.text('Saved 0'), findsNothing);
      stale();
      await tester.pumpAndSettle();
      expect(find.text('Saved 1'), findsOneWidget);
    },
  );

  testWidgets(
    'late responses cannot cross gateway/account changes or disposed view',
    (tester) async {
      final delayed = Completer<Map<String, dynamic>>();
      var uid = 'owner';
      final gateway = SavedShoutsGateway<Shout>(
        currentUserId: () => uid,
        decodeItem: decodeSpatialFeedItem,
        send: (_) => delayed.future,
      );
      await tester.pumpWidget(view(gateway));
      await tester.pump();
      final replacement = SavedShoutsGateway<Shout>(
        currentUserId: () => uid,
        decodeItem: decodeSpatialFeedItem,
        send: (_) async => page([1]),
      );
      await tester.pumpWidget(view(replacement));
      await tester.pumpAndSettle();
      delayed.complete(page([0]));
      await tester.pumpAndSettle();
      expect(find.text('Saved 0'), findsNothing);
      expect(find.text('Saved 1'), findsOneWidget);
      uid = 'other';
      await tester.pumpWidget(view(replacement));
      await tester.pumpAndSettle();
      expect(find.text('Saved 1'), findsNothing);
      final pending = Completer<Map<String, dynamic>>();
      final second = SavedShoutsGateway<Shout>(
        currentUserId: () => 'owner',
        decodeItem: decodeSpatialFeedItem,
        send: (_) => pending.future,
      );
      await tester.pumpWidget(view(second));
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
      pending.complete(page([0]));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('first-load retry coalesces duplicate clicks while pending', (
    tester,
  ) async {
    var calls = 0;
    final pending = Completer<Map<String, dynamic>>();
    final gateway = SavedShoutsGateway<Shout>(
      currentUserId: () => 'owner',
      decodeItem: decodeSpatialFeedItem,
      send: (_) async {
        if (++calls == 1) throw StateError('offline');
        return pending.future;
      },
    );
    await tester.pumpWidget(view(gateway));
    await tester.pumpAndSettle();
    final retry = find.byKey(const ValueKey('saved-shouts-retry'));
    await tester.tap(retry);
    await tester.tap(retry);
    await tester.pump();
    expect(calls, 2);
    pending.complete(page([0]));
    await tester.pumpAndSettle();
    expect(find.text('Saved 0'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
