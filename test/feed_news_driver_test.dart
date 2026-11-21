import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_news_driver.dart';

void main() {
  testWidgets(
    'bursts coalesce without starvation and a pulse during a flight is retained',
    (tester) async {
      var calls = 0;
      var flight = Completer<void>();
      final driver = FeedNewsDriver(
        check: () {
          calls++;
          return flight.future;
        },
        settleDelay: const Duration(seconds: 2),
      );
      driver.setActive(true);
      for (var i = 0; i < 20; i++) {
        driver.pulse();
      }
      await tester.pump(const Duration(seconds: 1));
      driver.pulse();
      await tester.pump(const Duration(seconds: 1));
      expect(calls, 1);
      driver.pulse();
      flight.complete();
      await tester.pump(const Duration(milliseconds: 1));
      flight = Completer();
      await tester.pump(const Duration(seconds: 2));
      expect(calls, 2);
      flight.complete();
      await tester.pump(const Duration(milliseconds: 1));
      driver.dispose();
    },
  );
  testWidgets(
    'hidden/disposed view does no work and failure has no implicit retry loop',
    (tester) async {
      var calls = 0, errors = 0;
      final driver = FeedNewsDriver(
        check: () async {
          calls++;
          throw StateError('offline');
        },
        onError: (_, _) => errors++,
        settleDelay: Duration.zero,
      );
      driver.pulse();
      await tester.pump(const Duration(milliseconds: 1));
      expect(calls, 0);
      driver.setActive(true);
      await tester.pump(const Duration(milliseconds: 1));
      expect(calls, 1);
      expect(errors, 1);
      await tester.pump(const Duration(minutes: 1));
      expect(calls, 1);
      driver.pulse();
      await tester.pump(const Duration(milliseconds: 1));
      expect(calls, 2);
      driver.setActive(false);
      driver.pulse();
      await tester.pump(const Duration(minutes: 1));
      expect(calls, 2);
      driver.dispose();
      final pending = Completer<void>();
      var lateErrors = 0;
      final lateDriver = FeedNewsDriver(
        check: () => pending.future,
        settleDelay: Duration.zero,
        onError: (_, _) => lateErrors++,
      );
      lateDriver.setActive(true);
      await tester.pump(const Duration(milliseconds: 1));
      lateDriver.dispose();
      pending.completeError(StateError('late offline reply'));
      await tester.pump(const Duration(milliseconds: 1));
      expect(lateErrors, 0);
    },
  );
  testWidgets('fallback timing is explicit and pauses with lifecycle', (
    tester,
  ) async {
    var calls = 0;
    final driver = FeedNewsDriver(
      check: () async {
        calls++;
      },
      settleDelay: Duration.zero,
      maximumInterval: const Duration(seconds: 15),
    );
    driver.setActive(true);
    await tester.pump(const Duration(milliseconds: 1));
    expect(calls, 1);
    await tester.pump(const Duration(seconds: 15));
    await tester.pump(const Duration(milliseconds: 1));
    expect(calls, 2);
    driver.setActive(false);
    await tester.pump(const Duration(minutes: 1));
    expect(calls, 2);
    driver.dispose();
  });
}
