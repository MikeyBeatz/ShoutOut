import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

abstract interface class FlightMusicPlayback {
  Future<bool> playLoop(bool Function() isAllowed);
  Future<void> pause();
  Future<void> dispose();
}

class AssetFlightMusicPlayback implements FlightMusicPlayback {
  final AudioPlayer _player = AudioPlayer();
  bool _prepared = false;
  bool _disposed = false;

  @override
  Future<bool> playLoop(bool Function() isAllowed) async {
    bool allowed() => !_disposed && isAllowed();
    if (!allowed()) return false;
    if (!_prepared) {
      await _player.setReleaseMode(ReleaseMode.loop);
      if (!allowed()) return false;
      await _player.setVolume(.3);
      if (!allowed()) return false;
      await _player.setSource(
        AssetSource('audio/shout_flight_music.mp3', mimeType: 'audio/mpeg'),
      );
      if (_disposed) return false;
      _prepared = true;
    }
    if (!allowed()) return false;
    await _player.resume();
    if (_disposed) return false;
    if (!isAllowed()) {
      await _player.pause();
      return false;
    }
    return true;
  }

  @override
  Future<void> pause() async {
    if (!_disposed) await _player.pause();
  }

  @override
  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    await _player.dispose();
  }
}

/// One player per game page. Requests are serialized, while each awaited
/// preparation step observes the latest mute/visibility/disposal decision.
class FlightMusicController extends ChangeNotifier {
  FlightMusicController({FlightMusicPlayback? playback})
    : _playback = playback ?? AssetFlightMusicPlayback();

  final FlightMusicPlayback _playback;
  Future<void> _pending = Future<void>.value();
  bool _disposed = false;
  bool _foreground = false;
  bool _muted = false;
  bool _playing = false;
  bool _unavailable = false;

  bool get muted => _muted;
  bool get unavailable => _unavailable;
  bool get playing => _playing;
  bool get _wanted => !_disposed && _foreground && !_muted;
  Future<void> get settled => _pending;

  Future<void> setForeground(bool value) {
    if (_disposed) return Future<void>.value();
    _foreground = value;
    return _synchronize();
  }

  Future<void> toggle() {
    if (_disposed) return Future<void>.value();
    // A rejected browser autoplay or a failed load can be retried by a real
    // click, without first requiring an extra mute/unmute cycle.
    if (_unavailable && !_muted) return retry();
    _muted = !_muted;
    notifyListeners();
    return _synchronize();
  }

  Future<void> retry() {
    if (!_wanted || _playing) return _pending;
    return _synchronize();
  }

  Future<void> _synchronize() {
    _pending = _pending.then((_) async {
      if (_disposed) return;
      try {
        if (_wanted && !_playing) {
          _playing = await _playback.playLoop(() => _wanted);
          if (_disposed) return;
          _unavailable = false;
        } else if (!_wanted && _playing) {
          await _playback.pause();
          _playing = false;
        }
      } catch (_) {
        // Sound is optional; a decoder/autoplay/device error must not break
        // the game or escape as an unhandled asynchronous exception.
        _playing = false;
        _unavailable = true;
      }
      if (!_disposed) notifyListeners();
    });
    return _pending;
  }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    // Release immediately, including while asset preparation is in flight.
    unawaited(_playback.dispose().catchError((Object _) {}));
    super.dispose();
  }
}
