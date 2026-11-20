import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/main.dart';
import 'package:shoutout/read_state_store.dart';
import 'package:shoutout/read_tracking_controller.dart';
import 'package:shoutout/read_tracking_widgets.dart';
import 'package:shoutout/feed_page_gateway.dart';
import 'package:shoutout/read_sync_controller.dart';

void main() {
  testWidgets(
    'full detail exposure persists, uploads at refresh and changes only the next feed snapshot',
    (tester) async {
      final now = DateTime.now(), serverReadIds = <String>{};
      late ReadSessions sessions;
      sessions = ReadSessions(
        storeFactory: MemoryReadStateStore.new,
        syncFactory: (scope, store, accept) => ReadSyncController(
          scope: scope,
          store: store,
          currentScope: () => sessions.value?.scope,
          upload: (payload) async {
            final rows = payload['items'] as List;
            serverReadIds.addAll(
              rows.map((item) => (item as Map)['shoutId'] as String),
            );
            return {
              'version': 1,
              'revision': serverReadIds.length,
              'items': rows
                  .map((item) => {...item as Map, 'status': 'accepted'})
                  .toList(),
            };
          },
          download: (_) async => {
            'version': 1,
            'revision': serverReadIds.length,
            'items': [],
            'next': null,
          },
          onMerged: accept,
        ),
      );
      sessions.configure('dev');
      sessions.retainViewer('reader');
      addTearDown(sessions.dispose);
      await sessions.synchronizeForFeed('reader');
      final content = ReadContent(
        shoutId: 'pilot-070',
        title: 'MVP B3 070',
        text: 'Synthetic DEV B3 pilot.',
        expiresAt: now.add(const Duration(days: 1)),
      );
      final gateway = FeedPageGateway<Shout>(
        currentUserId: () => 'reader',
        unreadFirst: true,
        decodeItem: decodeSpatialFeedItem,
        send: (_) async => {
          'version': 1,
          'state': 'ready',
          'baseline': 'snapshot-${serverReadIds.length}',
          'expiresAt': now.add(const Duration(hours: 1)).millisecondsSinceEpoch,
          'readOrdering': 'unread-first',
          'next': null,
          'items': [
            {
              'id': content.shoutId,
              'distanceKm': 1,
              'read': serverReadIds.contains(content.shoutId),
              'data': {
                'authorId': 'author',
                'authorNickname': 'Fixture',
                'title': 'MVP B3 070',
                'text': 'Synthetic DEV B3 pilot.',
                'categories': ['Dotaz'],
                'createdAt': now.millisecondsSinceEpoch,
                'expiresAt': content.expiresAt.millisecondsSinceEpoch,
                'status': 'active',
                'likesCount': 0,
                'dislikesCount': 0,
                'commentsCount': 0,
                'savesCount': 0,
              },
            },
          ],
        },
      );
      addTearDown(gateway.dispose);
      const context = SpatialFeedContext(
        latitude: 50,
        longitude: 14,
        radiusKm: 5,
        order: 'nearest',
      );
      final original = await gateway.load(context, null);
      expect(original.items.single.feedRead, isFalse);
      final epoch = tester.binding.clock.now();
      await tester.pumpWidget(
        MaterialApp(
          home: ReadTrackingScope(
            controller: sessions.value,
            child: Scaffold(
              body: ReadTrackedContent(
                content: content,
                title: Text('MVP B3 070'),
                body: Text('Synthetic DEV B3 pilot.'),
                clock: () => tester.binding.clock.now().difference(epoch),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      expect(sessions.value!.contains(content), isTrue);
      expect(
        serverReadIds,
        isEmpty,
        reason: 'Rendering never starts a network upload',
      );
      await sessions.synchronizeForFeed('reader');
      expect(serverReadIds, contains(content.shoutId));
      expect(original.items.single.feedRead, isFalse);
      final refreshed = await gateway.load(context, null);
      expect(refreshed.items.single.feedRead, isTrue);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  for (final brightness in Brightness.values) {
    testWidgets(
      'reading changes the real card surface without moving it ($brightness)',
      (tester) async {
        final scope = ReadScope('dev', 'viewer');
        final controller = ReadTrackingController(
          scope,
          MemoryReadStateStore(scope),
        );
        addTearDown(controller.dispose);
        final now = DateTime.now();
        final shout = Shout(
          id: '070',
          feedRead: false,
          author: 'Fixture',
          title: 'MVP B3 070',
          text: 'Synthetic DEV B3 pilot. Remove after approved verification.',
          categories: const ['Dotaz'],
          distanceKm: 1,
          createdAt: now,
          expiresAt: now.add(const Duration(days: 1)),
        );
        final content = ReadContent(
          shoutId: shout.id,
          title: shout.title,
          text: shout.text,
          expiresAt: shout.expiresAt,
        );
        final theme = ThemeData(brightness: brightness);
        var saves = 0;
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            home: ReadTrackingScope(
              controller: controller,
              child: Scaffold(
                body: SingleChildScrollView(
                  child: ShoutCard(
                    shout: shout,
                    onSave: () => saves++,
                    onReaction: (_) async {},
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pump();
        Card card() => tester.widget<Card>(find.byType(Card).first);
        final before = tester.getRect(find.byType(Card).first),
            oldColor = card().color;
        controller.mark(content);
        await tester.pump();
        final color = card().color!;
        expect(color, isNot(oldColor));
        expect(tester.getRect(find.byType(Card).first), before);
        expect(
          shout.feedRead,
          isFalse,
          reason: 'Local feedback must not mutate the frozen server group',
        );
        final foreground = theme.colorScheme.onSurface.computeLuminance(),
            background = color.computeLuminance();
        final contrast = foreground > background
            ? (foreground + .05) / (background + .05)
            : (background + .05) / (foreground + .05);
        expect(contrast, greaterThanOrEqualTo(4.5));
        await tester.tap(
          find.widgetWithIcon(IconButton, Icons.bookmark_outline),
        );
        expect(
          saves,
          1,
          reason: 'Read state does not disable ordinary interactions',
        );
        await controller.flushBoundary();
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets(
    'reading feedback ignores unrelated marks and detaches on viewer change',
    (tester) async {
      final scope = ReadScope('dev', 'alice'),
          otherScope = ReadScope('dev', 'bob');
      final alice = ReadTrackingController(scope, MemoryReadStateStore(scope));
      final bob = ReadTrackingController(
        otherScope,
        MemoryReadStateStore(otherScope),
      );
      addTearDown(alice.dispose);
      addTearDown(bob.dispose);
      ReadContent content(String id) => ReadContent(
        shoutId: id,
        title: id,
        text: 'Body',
        expiresAt: DateTime.now().add(const Duration(days: 1)),
      );
      final target = content('target');
      var builds = 0;
      Widget view(ReadTrackingController controller) => MaterialApp(
        home: ReadTrackingScope(
          controller: controller,
          child: ReadStatusBuilder(
            content: target,
            builder: (_, read) {
              builds++;
              return Text(read ? 'read' : 'unread');
            },
          ),
        ),
      );
      await tester.pumpWidget(view(alice));
      await tester.pump();
      final initial = builds;
      alice.mark(content('unrelated'));
      await tester.pump();
      expect(builds, initial);
      alice.mark(target);
      await tester.pump();
      expect(find.text('read'), findsOneWidget);
      expect(builds, initial + 1);
      await tester.pumpWidget(view(bob));
      await tester.pump();
      expect(find.text('unread'), findsOneWidget);
      final switched = builds;
      alice.acceptRemote([
        ReadUpload(content('another'), DateTime.now().millisecondsSinceEpoch),
      ]);
      await tester.pump();
      expect(builds, switched);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
