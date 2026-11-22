import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_movement_view.dart';
import 'package:shoutout/feed_session.dart';

void main() {
  testWidgets(
    'reordering and canonical catch-up preserve the first frame and visible anchor',
    (tester) async {
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      var revision = 0;
      void Function()? rebuild;
      final requests = <int>[];
      final original = List.generate(200, (i) => i);
      final canonical = original.reversed.toList();
      final session = FeedSessionController<int, bool>(
        idOf: (i) => '$i',
        compareFor: (moved) =>
            moved ? (a, b) => b.compareTo(a) : (a, b) => a.compareTo(b),
        onChanged: () => rebuild?.call(),
        load: (moved, cursor) async {
          final offset = cursor as int? ?? 0;
          if (moved) requests.add(offset);
          final rows = moved ? canonical : original;
          return FeedBatch(
            items: rows.sublist(offset, offset + 50),
            baseline: '$moved',
            next: offset + 50 == 200 ? null : offset + 50,
          );
        },
      );
      addTearDown(session.dispose);
      await session.refresh(false);
      await session.loadMore();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) {
                rebuild = () => setState(() {});
                return FeedMovementView<int>(
                  items: session.items,
                  idOf: (i) => '$i',
                  revision: revision,
                  controller: scroll,
                  onVisibleItem: (id) {
                    if (id != null && session.needsCoverageFor(id)) {
                      session.loadMore();
                    }
                  },
                  card: (id) => SizedBox(
                    key: ValueKey('ordered-$id'),
                    height: 80 + id % 3 * 30.0,
                    child: Text('Ordered $id'),
                  ),
                );
              },
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      scroll.jumpTo(2200);
      await tester.pumpAndSettle();
      final anchor = original.firstWhere((id) {
        final f = find.byKey(ValueKey('ordered-$id'));
        return f.evaluate().isNotEmpty &&
            tester.getRect(f).bottom > 0 &&
            tester.getTopLeft(f).dy < 300;
      });
      final finder = find.byKey(ValueKey('ordered-$anchor')),
          y = tester.getTopLeft(find.byKey(ValueKey('ordered-$anchor'))).dy;
      revision++;
      await session.recenter(
        true,
        loadMoved: (_) async => FeedBatch(
          items: canonical.sublist(0, 50),
          baseline: 'true',
          newsCheckpoint: 'news',
          next: 50,
        ),
        retain: (_, _) => true,
        isRead: (_) => false,
        relocate: (id, _) => id,
      );
      await tester.pump();
      expect(
        tester.getTopLeft(finder).dy,
        closeTo(y, .5),
        reason: 'first frame after reordering',
      );
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(finder).dy,
        closeTo(y, .5),
        reason: 'after inserting pages above the anchor',
      );
      expect(
        requests,
        [50, 100, 150],
        reason: 'catch-up must advance even across fully duplicated pages',
      );
      expect(session.items, canonical);
      expect(session.hasMore, false);
      expect(tester.takeException(), isNull);
      // The logical order changed throughout both off-screen and visible rows.
      await tester.scrollUntilVisible(
        find.text('Ordered 199'),
        -500,
        maxScrolls: 60,
      );
      await tester.pumpAndSettle();
      expect(find.text('Ordered 199'), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Ordered 199')).dy,
        lessThan(tester.getTopLeft(find.text('Ordered 198')).dy),
      );
      rebuild = null;
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'large insertion/removal keeps visible variable-height card anchor',
    (tester) async {
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      var revision = 0;
      Future<void> show(List<int> rows) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: FeedMovementView<int>(
                items: rows,
                idOf: (id) => '$id',
                revision: revision++,
                controller: scroll,
                card: (id) => SizedBox(
                  key: ValueKey('card-$id'),
                  height: 80 + id.abs() % 3 * 30.0,
                  child: Text('Card $id'),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
      }

      final original = List.generate(100, (i) => i);
      await show(original);
      scroll.jumpTo(2200);
      await tester.pumpAndSettle();
      final anchor = original.firstWhere((id) {
        final finder = find.byKey(ValueKey('card-$id'));
        return finder.evaluate().isNotEmpty &&
            tester.getRect(finder).bottom > 0 &&
            tester.getTopLeft(finder).dy < 300;
      });
      final y = tester.getTopLeft(find.byKey(ValueKey('card-$anchor'))).dy;
      final expanded = [
        ...List.generate(80, (i) => -80 + i),
        ...original.where((id) => id >= 5),
      ];
      await show(expanded);
      expect(
        tester.getTopLeft(find.byKey(ValueKey('card-$anchor'))).dy,
        closeTo(y, .5),
      );
      await show(original);
      expect(
        tester.getTopLeft(find.byKey(ValueKey('card-$anchor'))).dy,
        closeTo(y, .5),
      );
      // If that card leaves the radius, the next surviving visible card anchors.
      final next = anchor + 1;
      final nextY = tester.getTopLeft(find.byKey(ValueKey('card-$next'))).dy;
      await show(original.where((id) => id != anchor).toList());
      expect(
        tester.getTopLeft(find.byKey(ValueKey('card-$next'))).dy,
        closeTo(nextY, .5),
      );
      await show([]);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
