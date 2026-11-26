import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shoutout/easter_egg_game.dart';
import 'package:shoutout/flight_music.dart';
import 'package:shoutout/main.dart';
import 'package:shoutout/flight_sound_icon.dart';

import 'flight_music_test.dart' show FakePlayback;

// Reuse the actual application's themes without mounting Firebase's AuthGate.
Widget flightApp(BuildContext context, ThemeMode mode) {
  final locales =
      const ShoutOutApp().build(context) as ValueListenableBuilder<Locale?>;
  final modes =
      locales.builder(context, const Locale('cs'), null)
          as ValueListenableBuilder<ThemeMode>;
  final app = modes.builder(context, mode, null) as MaterialApp;
  return RepaintBoundary(
    key: const Key('flight-test-capture'),
    child: MaterialApp(
      theme: app.theme,
      darkTheme: app.darkTheme,
      themeMode: mode,
      builder: app.builder,
      home: ShoutFlightPage(
        music: FlightMusicController(playback: FakePlayback()),
      ),
    ),
  );
}

void main() {
  for (final mode in [ThemeMode.light, ThemeMode.dark]) {
    testWidgets('actual $mode music icon has visible contrast', (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(Builder(builder: (c) => flightApp(c, mode)));
      await tester.pumpAndSettle();
      for (var state = 0; state < 2; state++) {
        final button = find.byKey(const Key('flight-music-toggle'));
        final icon = find.descendant(
          of: button,
          matching: find.byType(FlightSoundIcon),
        );
        final color = tester.widget<FlightSoundIcon>(icon).color;
        final theme = Theme.of(tester.element(button));
        final background = theme.colorScheme.secondaryContainer;
        final style = tester.widget<IconButton>(button).style!;
        expect(style.backgroundColor!.resolve({}), background);
        final rect = tester.getRect(button);
        expect(rect.left, greaterThanOrEqualTo(0));
        expect(rect.right, lessThanOrEqualTo(390));
        expect(button.hitTestable(), findsOneWidget);
        final a = color.computeLuminance();
        final b = background.computeLuminance();
        final contrast = ((a > b ? a : b) + .05) / ((a > b ? b : a) + .05);
        // Printed diagnostics distinguish a wrong palette from missing glyphs.
        debugPrint(
          '$mode muted=$state icon=$color background=$background contrast=$contrast',
        );
        expect(contrast, greaterThanOrEqualTo(3));
        expect(tester.widget<FlightSoundIcon>(icon).muted, state == 1);
        expect(
          find.descendant(of: icon, matching: find.byType(RichText)),
          findsNothing,
        );
        await tester.tap(button);
        await tester.pumpAndSettle();
      }
      await tester.pumpWidget(const SizedBox());
    });
  }

  testWidgets('animation repaints without rebuilding the page or its painter', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(
      Builder(builder: (c) => flightApp(c, ThemeMode.light)),
    );
    await tester.pumpAndSettle();
    var pageRebuilds = 0;
    final original = debugOnRebuildDirtyWidget;
    debugOnRebuildDirtyWidget = (element, builtOnce) {
      original?.call(element, builtOnce);
      if (element.widget is ShoutFlightPage) pageRebuilds++;
    };
    addTearDown(() => debugOnRebuildDirtyWidget = original);
    await tester.tap(find.text('Tap to take off'));
    await tester.pump();
    final paint = find.byWidgetPredicate(
      (w) =>
          w is CustomPaint &&
          w.painter.runtimeType.toString() == '_FlightPainter',
    );
    final delegate = tester.widget<CustomPaint>(paint).painter;
    pageRebuilds = 0;
    for (var frame = 0; frame < 30; frame++) {
      await tester.pump(const Duration(microseconds: 16667));
    }
    debugPrint('30 frames: whole page rebuilds=$pageRebuilds');
    expect(pageRebuilds, 0);
    expect(
      identical(tester.widget<CustomPaint>(paint).painter, delegate),
      isTrue,
    );
    expect(find.text('0'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'pause freezes simulation; returning does not replay background time',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(
        Builder(builder: (c) => flightApp(c, ThemeMode.light)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Tap to take off'));
      await tester.pump();
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 16));
      }
      final score = tester
          .widget<Text>(find.byKey(const Key('flight-score')))
          .data;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      await tester.pump(const Duration(seconds: 20));
      expect(
        tester.widget<Text>(find.byKey(const Key('flight-score'))).data,
        score,
      );
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(find.textContaining('Flight over'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('FPS measurement is optional and updates during play', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(
      Builder(builder: (c) => flightApp(c, ThemeMode.light)),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('flight-fps-reading')), findsNothing);
    await tester.tap(find.byKey(const Key('flight-fps-toggle')));
    await tester.pump();
    expect(find.text('FPS: \u2014'), findsOneWidget);
    await tester.tap(find.text('Tap to take off'));
    await tester.pump();
    for (var i = 0; i < 70; i++) {
      if (i == 30 || i == 60) {
        await tester.tap(find.byType(GestureDetector).last);
      }
      await tester.pump(const Duration(microseconds: 16667));
    }
    expect(find.textContaining('60 FPS'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'covered game freezes and resumes without replaying hidden frames',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      await tester.pumpWidget(
        Builder(builder: (c) => flightApp(c, ThemeMode.light)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Tap to take off'));
      await tester.pump();
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 16));
      }
      final score = tester
          .widget<Text>(find.byKey(const Key('flight-score')))
          .data;
      final navigator = Navigator.of(
        tester.element(find.byKey(const Key('flight-score'))),
      );
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Covered')),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 20));
      navigator.pop();
      await tester.pump();
      await tester.pump();
      expect(
        tester.widget<Text>(find.byKey(const Key('flight-score'))).data,
        score,
      );
      expect(find.textContaining('Flight over'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
