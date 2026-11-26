import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shoutout/easter_egg_game.dart';
import 'package:shoutout/flight_music.dart';

class FakePlayback implements FlightMusicPlayback {
  Completer<void>? loading;
  int attempts = 0;
  int starts = 0;
  int pauses = 0;
  int disposals = 0;
  bool failNext = false;
  bool disposed = false;

  @override
  Future<bool> playLoop(bool Function() isAllowed) async {
    attempts++;
    if (loading != null) await loading!.future;
    if (failNext) {
      failNext = false;
      throw StateError('autoplay rejected');
    }
    if (disposed || !isAllowed()) return false;
    starts++;
    return true;
  }

  @override
  Future<void> pause() async => pauses++;

  @override
  Future<void> dispose() async {
    disposed = true;
    disposals++;
  }
}

void main() {
  test(
    'one loop survives repeated game inputs and mute resumes the same player',
    () async {
      final backend = FakePlayback();
      final music = FlightMusicController(playback: backend);
      await music.setForeground(true);
      await Future.wait(List.generate(20, (_) => music.retry()));
      expect(backend.starts, 1);
      await music.toggle();
      expect(music.muted, isTrue);
      expect(backend.pauses, 1);
      await music.toggle();
      expect(backend.starts, 2);
      music.dispose();
      expect(backend.disposals, 1);
    },
  );

  test(
    'hidden applications pause and a muted game stays silent on return',
    () async {
      final backend = FakePlayback();
      final music = FlightMusicController(playback: backend);
      await music.setForeground(true);
      await music.setForeground(false);
      expect(backend.pauses, 1);
      await music.setForeground(true);
      expect(backend.starts, 2);
      await music.toggle();
      await music.setForeground(false);
      await music.setForeground(true);
      expect(backend.starts, 2);
      expect(music.muted, isTrue);
      music.dispose();
    },
  );

  test('muting while an asset loads prevents a late start', () async {
    final backend = FakePlayback()..loading = Completer<void>();
    final music = FlightMusicController(playback: backend);
    final first = music.setForeground(true);
    await Future<void>.delayed(Duration.zero);
    final muted = music.toggle();
    backend.loading!.complete();
    await Future.wait([first, muted]);
    expect(backend.attempts, 1);
    expect(backend.starts, 0);
    expect(music.playing, isFalse);
    music.dispose();
  });

  test(
    'leaving during preparation releases immediately and never starts later',
    () async {
      final backend = FakePlayback()..loading = Completer<void>();
      final music = FlightMusicController(playback: backend);
      final first = music.setForeground(true);
      await Future<void>.delayed(Duration.zero);
      music.dispose();
      music.dispose();
      expect(backend.disposals, 1);
      backend.loading!.complete();
      await first;
      expect(backend.starts, 0);
    },
  );

  test(
    'a failed autoplay is contained and the next real input can retry',
    () async {
      final backend = FakePlayback()..failNext = true;
      final music = FlightMusicController(playback: backend);
      await music.setForeground(true);
      expect(music.unavailable, isTrue);
      expect(music.playing, isFalse);
      await music.toggle();
      expect(music.muted, isFalse);
      expect(music.unavailable, isFalse);
      expect(backend.starts, 1);
      music.dispose();
    },
  );

  testWidgets(
    'game exposes mute, observes lifecycle and disposes on navigation',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      final backend = FakePlayback();
      final music = FlightMusicController(playback: backend);
      final navigator = GlobalKey<NavigatorState>();
      await tester.pumpWidget(
        MaterialApp(
          navigatorKey: navigator,
          home: ShoutFlightPage(music: music),
        ),
      );
      await tester.pumpAndSettle();
      expect(backend.starts, 1);
      expect(find.byIcon(Icons.volume_up_rounded), findsOneWidget);
      await tester.tap(find.byKey(const Key('flight-music-toggle')));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.volume_off_rounded), findsOneWidget);
      await tester.tap(find.byKey(const Key('flight-music-toggle')));
      await tester.pumpAndSettle();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      await tester.pump();
      await music.settled;
      expect(music.playing, isFalse);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(music.playing, isTrue);
      unawaited(
        navigator.currentState!.push(
          MaterialPageRoute<void>(
            builder: (_) => const Scaffold(body: Text('Another page')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(music.playing, isFalse);
      navigator.currentState!.pop();
      await tester.pumpAndSettle();
      expect(music.playing, isTrue);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      expect(backend.disposals, 1);
      expect(tester.takeException(), isNull);
    },
  );
}
