import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_movement_view.dart';

void main() {
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
