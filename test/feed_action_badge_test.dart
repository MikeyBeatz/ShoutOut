import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/main.dart';
import 'package:shoutout/l10n/app_localizations.dart';

void main() {
  for (final brightness in Brightness.values) {
    testWidgets('floating badges share outer corner in $brightness', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(320, 600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var notifications = 0, refreshes = 0;
      Future<void> show(int count, {bool current = true}) async {
        await tester.pumpWidget(
          MaterialApp(
            locale: const Locale('cs'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: ThemeData(brightness: brightness),
            home: Scaffold(
              body: Stack(
                children: [
                  FeedRefreshOverlay(
                    onRefresh: () => refreshes++,
                    newsCount: count,
                    newsCurrent: current,
                    child: const SizedBox.expand(),
                  ),
                  Positioned(
                    top: 6,
                    right: 68,
                    child: NotificationButton(
                      floating: true,
                      unread: count,
                      onPressed: () => notifications++,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
      }

      for (final count in [1, 100]) {
        await show(count);
        final label = count == 1 ? '1' : '99+';
        final refresh = find.byKey(const ValueKey('spatial-feed-refresh'));
        final bell = find.byKey(const ValueKey('feed-notifications'));
        final refreshLabel = find.descendant(
          of: find.ancestor(of: refresh, matching: find.byType(Badge)).first,
          matching: find.text(label),
        );
        final bellLabel = find.descendant(
          of: find.ancestor(of: bell, matching: find.byType(Badge)).first,
          matching: find.text(label),
        );
        final refreshOffset =
            tester.getTopRight(refreshLabel) - tester.getTopRight(refresh);
        final bellOffset =
            tester.getTopRight(bellLabel) - tester.getTopRight(bell);
        expect(refreshOffset, bellOffset);
        expect(tester.getRect(bellLabel).left, greaterThan(0));
        expect(tester.getRect(refreshLabel).right, lessThan(320));
        await tester.tap(refresh);
        await tester.tap(bell);
      }
      expect(refreshes, 2);
      expect(notifications, 2);
      await show(1, current: false);
      expect(find.text('…'), findsOneWidget);
      await show(0);
      expect(find.text('0'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
