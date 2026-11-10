import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/l10n/app_localizations.dart';
import 'package:shoutout/main.dart';
import 'package:shoutout/own_shouts_gateway.dart';

Map<String, dynamic> item(int index, {String owner = 'owner'}) => {
  'id': 'owned$index',
  'distanceKm': 0,
  'data': {
    'authorId': owner,
    'authorNickname': 'Owner',
    'title': 'Owned $index',
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
Map<String, dynamic> cursor(
  int index, {
  String owner = 'owner',
  String section = 'expired',
}) => {
  'userId': owner,
  'section': section,
  'id': 'owned$index',
  'createdAt': [1794000000, 123456000],
  'expiresAt': [1794000060, 0],
};
Map<String, dynamic> page(Iterable<int> ids, {Map<String, dynamic>? next}) => {
  'version': 1,
  'items': ids.map(item).toList(),
  'next': next,
};
Widget view(
  OwnShoutsGateway<Shout> gateway, {
  OwnShoutsSection section = OwnShoutsSection.expired,
  Future<void> Function(Shout)? onDelete,
  Map<String, VoidCallback>? unavailable,
}) => MaterialApp(
  locale: const Locale('cs'),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: Scaffold(
    body: OwnShoutsLibrary(
      key: const ValueKey('own-library'),
      gateway: gateway,
      section: section,
      onSave: (_) {},
      onReaction: (_, {required bool like}) async {},
      onDelete: onDelete ?? (_) async {},
      cardBuilder: (shout, remove, hidden) {
        unavailable?[shout.id] = hidden;
        return SizedBox(
          height: 72,
          child: Row(
            children: [
              Text(shout.title),
              IconButton(
                key: ValueKey('delete-${shout.id}'),
                onPressed: () => unawaited(remove()),
                icon: const Icon(Icons.delete),
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
      final gateway = OwnShoutsGateway<Shout>(
        currentUserId: () => 'owner',
        decodeItem: decodeSpatialFeedItem,
        send: (payload) async =>
            payload['after'] == null ? page([], next: cursor(49)) : page([50]),
      );
      await tester.pumpWidget(view(gateway));
      await tester.pumpAndSettle();
      expect(find.text('V této části zatím nemáš žádné shouty.'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('own-shouts-more')));
      await tester.pumpAndSettle();
      expect(find.text('Owned 50'), findsOneWidget);
    },
  );
  test(
    'gateway binds rank cursors and response bodies to account and section',
    () async {
      var calls = 0;
      final gateway = OwnShoutsGateway<Shout>(
        currentUserId: () => 'owner',
        decodeItem: decodeSpatialFeedItem,
        send: (_) async {
          calls++;
          return page([0]);
        },
      );
      for (final after in [
        cursor(49, owner: 'other'),
        cursor(49, section: 'active'),
        {
          ...cursor(49),
          'createdAt': [1, 1000000000],
        },
        {...cursor(49), 'extra': true},
      ]) {
        await expectLater(
          gateway.load(OwnShoutsSection.expired, after: after),
          throwsStateError,
        );
      }
      expect(calls, 0);
      final response = await gateway.load(OwnShoutsSection.expired);
      expect(response.items.single.authorId, 'owner');
      final bad = OwnShoutsGateway<Shout>(
        currentUserId: () => 'owner',
        decodeItem: decodeSpatialFeedItem,
        send: (_) async => {
          'version': 1,
          'items': [item(0, owner: 'other')],
          'next': null,
        },
      );
      await expectLater(bad.load(OwnShoutsSection.active), throwsStateError);
    },
  );

  test(
    'gateway rejects duplicate/oversized pages and a repeated continuation',
    () async {
      for (final data in [
        page([0, 0]),
        page(List.generate(51, (i) => i)),
        page([50], next: cursor(49)),
      ]) {
        final gateway = OwnShoutsGateway<Shout>(
          currentUserId: () => 'owner',
          decodeItem: decodeSpatialFeedItem,
          send: (_) async => data,
        );
        await expectLater(
          gateway.load(OwnShoutsSection.expired, after: cursor(49)),
          throwsStateError,
        );
      }
    },
  );

  test('gateway ignores responses after account change or disposal', () async {
    for (final dispose in [false, true]) {
      var uid = 'owner';
      final response = Completer<Map<String, dynamic>>();
      final gateway = OwnShoutsGateway<Shout>(
        currentUserId: () => uid,
        decodeItem: decodeSpatialFeedItem,
        send: (_) => response.future,
      );
      final pending = gateway.load(OwnShoutsSection.expired);
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
    'own list pages beyond 50; failed continuation preserves scroll and retries the same boundary',
    (tester) async {
      final calls = <Map<String, dynamic>>[];
      var fail = true;
      final gateway = OwnShoutsGateway<Shout>(
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
      await tester.drag(
        find.byKey(const ValueKey('own-shouts-list')),
        const Offset(0, -500),
      );
      await tester.pumpAndSettle();
      final scroll = tester.state<ScrollableState>(find.byType(Scrollable));
      final before = scroll.position.pixels;
      await tester.tap(find.byKey(const ValueKey('own-shouts-more')));
      await tester.pumpAndSettle();
      expect(scroll.position.pixels, before);
      expect(find.byKey(const ValueKey('own-shouts-retry')), findsOneWidget);
      fail = false;
      await tester.tap(find.byKey(const ValueKey('own-shouts-retry')));
      await tester.pumpAndSettle();
      expect(calls.length, 3);
      expect(calls[1]['after'], calls[2]['after']);
      expect(scroll.position.pixels, before);
      await tester.scrollUntilVisible(find.text('Owned 59'), 500);
      await tester.pumpAndSettle();
      expect(find.text('Owned 59'), findsOneWidget);
      expect(find.byKey(const ValueKey('own-shouts-more')), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'refresh failure keeps loaded rows; a successful retry returns to the first page',
    (tester) async {
      var calls = 0, fail = false;
      final gateway = OwnShoutsGateway<Shout>(
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
        find.byKey(const ValueKey('own-shouts-list')),
        const Offset(0, -500),
      );
      await tester.pumpAndSettle();
      final scroll = tester.state<ScrollableState>(find.byType(Scrollable)),
          before = scroll.position.pixels;
      fail = true;
      await tester.tap(find.byKey(const ValueKey('own-shouts-refresh')));
      await tester.pumpAndSettle();
      expect(scroll.position.pixels, before);
      fail = false;
      await tester.tap(find.byKey(const ValueKey('own-shouts-retry')));
      await tester.pumpAndSettle();
      expect(calls, 3);
      expect(scroll.position.pixels, 0);
      expect(find.text('Owned 0').hitTestable(), findsOneWidget);
    },
  );

  testWidgets(
    'failed deletion keeps the row; acknowledgement and live removal affect only their own cards',
    (tester) async {
      var fail = true;
      final unavailable = <String, VoidCallback>{};
      final gateway = OwnShoutsGateway<Shout>(
        currentUserId: () => 'owner',
        decodeItem: decodeSpatialFeedItem,
        send: (_) async => page([0, 1]),
      );
      await tester.pumpWidget(
        view(
          gateway,
          unavailable: unavailable,
          onDelete: (_) async {
            if (fail) throw StateError('failure');
          },
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('delete-owned0')));
      await tester.pumpAndSettle();
      expect(find.text('Owned 0'), findsOneWidget);
      expect(find.text('Owned 1'), findsOneWidget);
      fail = false;
      await tester.tap(find.byKey(const ValueKey('delete-owned0')));
      await tester.pumpAndSettle();
      expect(find.text('Owned 0'), findsNothing);
      expect(find.text('Owned 1'), findsOneWidget);
      unavailable['owned1']!();
      await tester.pumpAndSettle();
      expect(find.text('Owned 1'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'late responses cannot cross a section change, account switch or disposed view',
    (tester) async {
      final delayed = Completer<Map<String, dynamic>>();
      var uid = 'owner';
      final gateway = OwnShoutsGateway<Shout>(
        currentUserId: () => uid,
        decodeItem: decodeSpatialFeedItem,
        send: (payload) => payload['section'] == 'active'
            ? delayed.future
            : Future.value(page([1])),
      );
      await tester.pumpWidget(view(gateway, section: OwnShoutsSection.active));
      await tester.pump();
      await tester.pumpWidget(view(gateway));
      await tester.pumpAndSettle();
      expect(find.text('Owned 1'), findsOneWidget);
      delayed.complete(page([0]));
      await tester.pumpAndSettle();
      expect(find.text('Owned 0'), findsNothing);
      uid = 'other';
      await tester.pumpWidget(view(gateway));
      await tester.pumpAndSettle();
      expect(find.text('Owned 1'), findsNothing);
      final pending = Completer<Map<String, dynamic>>();
      final second = OwnShoutsGateway<Shout>(
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
}
