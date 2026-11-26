import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/lifecycle_source_gateway.dart';
import 'package:shoutout/main.dart';
import 'package:shoutout/l10n/app_localizations.dart';

final epoch = DateTime.now().millisecondsSinceEpoch;
Map<String, dynamic> row(
  int index, {
  String author = 'owner',
  String? comment,
}) => {
  'id': 'root$index',
  'distanceKm': 0,
  'data': {
    'authorId': author,
    'authorNickname': 'Synthetic',
    'title': 'row$index',
    'text': 'Body',
    'categories': ['Dotaz'],
    'status': 'active',
    'createdAt': epoch - index,
    'expiresAt': epoch + 86400000,
    'publicUntil': epoch + 86400000,
    'historyUntil': epoch + 8 * 86400000,
    'likesCount': 0,
    'dislikesCount': 0,
    'commentsCount': 0,
    'savesCount': 0,
  },
  if (comment != null)
    'comment': {'id': comment, 'text': 'Comment', 'createdAt': epoch},
};
Map<String, dynamic> cursor(
  LifecycleSourceGateway g, {
  String path = 'shouts/root49',
}) => {
  'v': 1,
  'userId': 'owner',
  'view': g.view,
  'selection': g.selection,
  'path': path,
  'createdAt': [1795520000, 0],
};
Map<String, dynamic> packet(
  LifecycleSourceGateway g,
  List<Map<String, dynamic>> items, {
  Map<String, dynamic>? next,
}) => {
  'version': 1,
  'userId': 'owner',
  'view': g.view,
  'selection': g.selection,
  'items': items,
  'next': next,
};
Widget library(LifecycleSourceGateway g, {int Function()? nowMillis}) =>
    MaterialApp(
      locale: const Locale('cs'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        body: LifecycleSourceLibrary(
          key: const ValueKey('library'),
          gateway: g,
          emptyText: 'Empty',
          nowMillis: nowMillis,
          itemBuilder: (_, row, remove) => SizedBox(
            height: 90,
            child: Text((row['data'] as Map)['title'] as String),
          ),
        ),
      ),
    );

void main() {
  test(
    'selection digest matches the server contract without carrying body/identity grants',
    () {
      final g = LifecycleSourceGateway(
        currentUserId: () => 'owner',
        view: 'comments',
        send: (_) async => {},
      );
      expect(
        g.selection,
        '8e2bc2c8717402eb54e3599c8ffbe7bd05ac982c18b67a9c8f2045d77e062bed',
      );
    },
  );
  test('late replies are rejected after account change or disposal', () async {
    for (final dispose in [false, true]) {
      var uid = 'owner';
      final pending = Completer<Map<String, dynamic>>();
      final g = LifecycleSourceGateway(
        currentUserId: () => uid,
        view: 'home',
        send: (_) => pending.future,
      );
      final future = g.load();
      final assertion = expectLater(future, throwsStateError);
      if (dispose) {
        g.dispose();
      } else {
        uid = 'other';
      }
      pending.complete(packet(g, [row(0)]));
      await assertion;
    }
  });
  test(
    'cursors bind view, selector and account; duplicate or malformed rows fail the whole page',
    () async {
      late LifecycleSourceGateway g;
      Map<String, dynamic>? response;
      g = LifecycleSourceGateway(
        currentUserId: () => 'owner',
        view: 'profile',
        authorId: 'owner',
        send: (_) async => response!,
      );
      for (final bad in [
        {...cursor(g), 'userId': 'other'},
        {...cursor(g), 'selection': 'other'},
        {...cursor(g), 'view': 'business'},
        {
          ...cursor(g),
          'createdAt': [1, 1000000000],
        },
      ]) {
        await expectLater(g.load(after: bad), throwsStateError);
      }
      for (final items in [
        [row(0), row(0)],
        [row(0, author: 'other')],
        [
          {...row(0), 'distanceKm': double.nan},
        ],
        [
          {
            ...row(0),
            'data': {...row(0)['data'] as Map, 'historyUntil': null},
          },
        ],
      ]) {
        response = packet(g, items);
        await expectLater(g.load(), throwsStateError);
      }
      final c = cursor(g);
      response = packet(g, [], next: c);
      await expectLater(g.load(after: c), throwsStateError);
    },
  );
  test(
    'comment identities include their parent and do not collide across Shouts',
    () async {
      late LifecycleSourceGateway g;
      g = LifecycleSourceGateway(
        currentUserId: () => 'owner',
        view: 'comments',
        send: (_) async =>
            packet(g, [row(0, comment: 'same'), row(1, comment: 'same')]),
      );
      final result = await g.load();
      expect(
        result.items.map(LifecycleSourceGateway.itemKey).toSet().length,
        2,
      );
    },
  );
  test(
    'point signals reject replaced bodies and expired/foreign deleted content, and retain only public fields',
    () {
      final original = row(0),
          body = Map<String, dynamic>.from(original['data'] as Map);
      final deleted = {
        ...body,
        'status': 'deleted',
        'publicUntil': epoch,
        'historyUntil': epoch + 7 * 86400000,
        'secret': 'never',
      };
      final own = mergeLifecycleSourceSignal(
        original,
        deleted,
        view: 'business',
        viewer: 'owner',
        nowMillis: epoch,
      )!;
      expect((own['data'] as Map)['readOnlyHistory'], isTrue);
      expect((own['data'] as Map).containsKey('secret'), isFalse);
      expect(
        mergeLifecycleSourceSignal(
          original,
          deleted,
          view: 'profile',
          viewer: 'owner',
          nowMillis: epoch,
        ),
        isNull,
      );
      expect(
        mergeLifecycleSourceSignal(
          original,
          deleted,
          view: 'business',
          viewer: 'foreign',
          nowMillis: epoch,
        ),
        isNull,
      );
      expect(
        mergeLifecycleSourceSignal(
          original,
          deleted,
          view: 'business',
          viewer: 'owner',
          nowMillis: epoch + 7 * 86400000,
        ),
        isNull,
      );
      for (final patch in [
        {'createdAt': epoch + 1},
        {'createdAt': double.nan},
        {'likesCount': -1},
        {'text': 12},
        {'expiresAt': 'broken'},
        {'contentPurged': true},
      ]) {
        expect(
          mergeLifecycleSourceSignal(
            original,
            {...body, ...patch},
            view: 'business',
            viewer: 'owner',
            nowMillis: epoch,
          ),
          isNull,
        );
      }
      final comment = row(0, comment: 'one');
      final updated = mergeLifecycleSourceSignal(
        comment,
        {'authorId': 'owner', 'createdAt': epoch, 'text': 'Scrubbed'},
        view: 'comments',
        viewer: 'owner',
        nowMillis: epoch,
        comment: true,
      )!;
      expect((updated['comment'] as Map)['text'], 'Scrubbed');
      expect(
        mergeLifecycleSourceSignal(
          comment,
          null,
          view: 'comments',
          viewer: 'owner',
          nowMillis: epoch,
          comment: true,
        ),
        isNull,
      );
    },
  );
  testWidgets(
    'append preserves scroll and retry repeats the exact failed page',
    (tester) async {
      late LifecycleSourceGateway g;
      final requests = <Map<String, dynamic>>[];
      g = LifecycleSourceGateway(
        currentUserId: () => 'owner',
        view: 'home',
        send: (payload) async {
          requests.add(payload);
          if (requests.length == 1) {
            return packet(g, List.generate(50, row), next: cursor(g));
          }
          if (requests.length == 2) {
            throw StateError('Synthetic transport failure');
          }
          return packet(g, List.generate(11, (n) => row(n + 50)));
        },
      );
      await tester.pumpWidget(library(g));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('lifecycle-more')),
        500,
      );
      await tester.pumpAndSettle();
      final state = tester.state<ScrollableState>(find.byType(Scrollable));
      final offset = state.position.pixels;
      await tester.tap(find.byKey(const ValueKey('lifecycle-more')));
      await tester.pumpAndSettle();
      expect(state.position.pixels, offset);
      await tester.tap(find.byKey(const ValueKey('lifecycle-retry')));
      await tester.pumpAndSettle();
      expect(requests[1]['after'], requests[2]['after']);
      expect(state.position.pixels, offset);
      await tester.scrollUntilVisible(find.text('row60'), 500);
      expect(find.text('row60'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'an empty non-final page offers continuation without automatic refill',
    (tester) async {
      late LifecycleSourceGateway g;
      var calls = 0;
      g = LifecycleSourceGateway(
        currentUserId: () => 'owner',
        view: 'home',
        send: (_) async {
          calls++;
          return packet(g, [], next: cursor(g));
        },
      );
      await tester.pumpWidget(library(g));
      await tester.pumpAndSettle();
      expect(calls, 1);
      expect(find.byKey(const ValueKey('lifecycle-more')), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'failed refresh keeps rows and scroll; successful retry returns to the beginning',
    (tester) async {
      late LifecycleSourceGateway g;
      var calls = 0;
      g = LifecycleSourceGateway(
        currentUserId: () => 'owner',
        view: 'home',
        send: (payload) async {
          expect(payload['after'], isNull);
          calls++;
          if (calls == 1) return packet(g, List.generate(50, row));
          if (calls == 2) throw StateError('Synthetic refresh failure');
          return packet(g, [row(99)]);
        },
      );
      await tester.pumpWidget(library(g));
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, -600));
      await tester.pumpAndSettle();
      final state = tester.state<ScrollableState>(find.byType(Scrollable)),
          offset = state.position.pixels;
      await tester.tap(find.byKey(const ValueKey('lifecycle-refresh')));
      await tester.pumpAndSettle();
      expect(state.position.pixels, offset);
      await tester.tap(find.byKey(const ValueKey('lifecycle-retry')));
      await tester.pumpAndSettle();
      expect(state.position.pixels, 0);
      expect(find.text('row99'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'a replaced list and a disposed screen ignore their late responses',
    (tester) async {
      final pending = Completer<Map<String, dynamic>>();
      late LifecycleSourceGateway first, second;
      first = LifecycleSourceGateway(
        currentUserId: () => 'owner',
        view: 'home',
        send: (_) => pending.future,
      );
      second = LifecycleSourceGateway(
        currentUserId: () => 'owner',
        view: 'business',
        send: (_) async => packet(second, [row(99)]),
      );
      await tester.pumpWidget(library(first));
      await tester.pump();
      await tester.pumpWidget(library(second));
      await tester.pumpAndSettle();
      pending.complete(packet(first, [row(0)]));
      await tester.pumpAndSettle();
      expect(find.text('row99'), findsOneWidget);
      expect(find.text('row0'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'the list drops a loaded body at its exact deadline without a new request',
    (tester) async {
      var now = epoch;
      late LifecycleSourceGateway g;
      final data = row(0);
      (data['data'] as Map)['publicUntil'] = epoch + 1000;
      (data['data'] as Map)['historyUntil'] = epoch + 1000 + 7 * 86400000;
      g = LifecycleSourceGateway(
        currentUserId: () => 'owner',
        view: 'home',
        send: (_) async => packet(g, [data]),
      );
      await tester.pumpWidget(library(g, nowMillis: () => now));
      await tester.pumpAndSettle();
      expect(find.text('row0'), findsOneWidget);
      now = epoch + 1001;
      await tester.pump(const Duration(milliseconds: 1002));
      await tester.pumpAndSettle();
      expect(find.text('row0'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'the same list transport resets on account change and rejects the former pending page',
    (tester) async {
      var uid = 'owner';
      final pending = Completer<Map<String, dynamic>>();
      late LifecycleSourceGateway g;
      g = LifecycleSourceGateway(
        currentUserId: () => uid,
        view: 'business',
        send: (payload) async {
          if (payload['expectedUserId'] == 'owner') return pending.future;
          return {
            ...packet(g, [row(99, author: 'other')]),
            'userId': 'other',
          };
        },
      );
      await tester.pumpWidget(library(g));
      await tester.pump();
      uid = 'other';
      await tester.pumpWidget(library(g));
      await tester.pumpAndSettle();
      expect(find.text('row99'), findsOneWidget);
      pending.complete(packet(g, [row(0)]));
      await tester.pumpAndSettle();
      expect(find.text('row0'), findsNothing);
      expect(find.text('row99'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
