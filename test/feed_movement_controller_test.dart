import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_movement_controller.dart';

void main() {
  testWidgets(
    'GPS noise, accuracy, timestamp and cooldown bound network work',
    (tester) async {
      var now = 100000;
      final moved = <FeedLocationFix>[];
      final controller = FeedMovementController(
        clock: () => now,
        move: (fix) async {
          moved.add(fix);
          return true;
        },
      );
      addTearDown(controller.dispose);
      controller.seed(FeedLocationFix(50, 14, 25, now));
      controller.setActive(true);
      Future<void> tick(int ms) async {
        now += ms;
        await tester.pump(Duration(milliseconds: ms));
      }

      for (var n = 0; n < 20; n++) {
        controller.accept(FeedLocationFix(50 + .00001 * n, 14, 25, now));
        await tick(1000);
      }
      expect(moved, isEmpty);
      controller.accept(FeedLocationFix(50.01, 14, 101, now));
      controller.accept(FeedLocationFix(50.01, 14, 25, now - 30001));
      controller.accept(FeedLocationFix(50.01, 14, 25, now + 1));
      await tick(1);
      expect(moved, isEmpty);
      controller.accept(FeedLocationFix(50.01, 14, 25, now));
      await tick(9999);
      expect(moved.length, 1);
      controller.accept(FeedLocationFix(50.02, 14, 25, now));
      await tick(10000);
      controller.accept(FeedLocationFix(50.03, 14, 25, now));
      await tick(20000);
      expect(moved.length, 2);
      expect(moved.last.latitude, 50.03);
    },
  );
  testWidgets(
    'only one flight; background, seed and disposal fence late results',
    (tester) async {
      var now = 100000, calls = 0;
      final flight = Completer<bool>();
      final controller = FeedMovementController(
        clock: () => now,
        move: (_) {
          calls++;
          return flight.future;
        },
      );
      controller.seed(FeedLocationFix(50, 14, 25, now));
      controller.setActive(true);
      now += 30000;
      controller.accept(FeedLocationFix(50.01, 14, 25, now));
      await tester.pump(const Duration(milliseconds: 1));
      now += 30000;
      controller.accept(FeedLocationFix(50.02, 14, 25, now));
      await tester.pump(const Duration(seconds: 30));
      expect(calls, 1);
      controller.setActive(false);
      flight.complete(true);
      await tester.pump();
      await tester.pump(const Duration(minutes: 2));
      expect(calls, 1);
      controller.seed(FeedLocationFix(49, 14, 10, now));
      controller.setActive(true);
      controller.dispose();
      controller.accept(FeedLocationFix(51, 14, 10, now));
      await tester.pump(const Duration(minutes: 1));
      expect(calls, 1);
    },
  );
  testWidgets(
    'failed update keeps last confirmed center and waits for a new fix',
    (tester) async {
      var now = 100000, calls = 0;
      final controller = FeedMovementController(
        clock: () => now,
        move: (_) async {
          calls++;
          return false;
        },
      );
      addTearDown(controller.dispose);
      controller.seed(FeedLocationFix(50, 14, 25, now));
      controller.setActive(true);
      now += 30000;
      controller.accept(FeedLocationFix(50.01, 14, 25, now));
      await tester.pump(const Duration(milliseconds: 1));
      now += 30000;
      await tester.pump(const Duration(seconds: 30));
      expect(calls, 1);
      controller.accept(FeedLocationFix(50.01, 14, 25, now));
      await tester.pump(const Duration(milliseconds: 1));
      expect(calls, 2);
      controller.accept(FeedLocationFix(double.nan, 14, 25, now + 1));
      await tester.pump();
      expect(calls, 2);
    },
  );
  test('distance is geographical across the date line', () {
    expect(
      feedDistanceMeters(
        const FeedLocationFix(0, 179.999, 0, 0),
        const FeedLocationFix(0, -179.999, 0, 0),
      ),
      closeTo(222.39, .1),
    );
  });
}
