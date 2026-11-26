// Explicit real-media Chrome smoke test, separate from VM widget discovery.
import 'dart:async';
import 'dart:js_interop';

import 'package:test/test.dart';
import 'package:web/web.dart' as web;

void main() {
  test(
    'the bundled MP3 decodes and loops in the real Chrome media element',
    () async {
      final audio = web.HTMLAudioElement()
        ..src = Uri.base
            .resolve('../assets/audio/shout_flight_music.mp3')
            .toString()
        ..loop = true
        ..muted = true;
      try {
        expect(audio.canPlayType('audio/mpeg'), isNotEmpty);
        await audio.play().toDart.timeout(const Duration(seconds: 15));
        expect(audio.duration, inInclusiveRange(165, 168));
        audio.currentTime = audio.duration - .3;
        await Future<void>.delayed(const Duration(seconds: 2));
        expect(audio.paused, isFalse);
        expect(audio.currentTime, inInclusiveRange(.1, 5));
        audio.pause();
        expect(audio.paused, isTrue);
      } finally {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
    },
  );
}
