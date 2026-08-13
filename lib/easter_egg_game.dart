import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'flight_score_store.dart';

double flightVelocityAfterTap(double velocity) => -.66;

double flightVelocityAfterGravity(double velocity, double delta) =>
    velocity + 1.65 * delta;

class FlightObstacle {
  const FlightObstacle({
    required this.x,
    required this.topHeight,
    required this.bottomHeight,
    required this.bonus,
    required this.style,
    this.passed = false,
  });

  final double x;
  final double topHeight;
  final double bottomHeight;
  final int bonus;
  final int style;
  final bool passed;

  double get gapSize => 1 - topHeight - bottomHeight;

  FlightObstacle copyWith({double? x, bool? passed}) => FlightObstacle(
    x: x ?? this.x,
    topHeight: topHeight,
    bottomHeight: bottomHeight,
    bonus: bonus,
    style: style,
    passed: passed ?? this.passed,
  );
}

class FlightGameState {
  const FlightGameState({
    this.playerY = .5,
    this.velocity = 0,
    this.rotation = 0,
    this.angularVelocity = 0,
    this.elapsed = 0,
    this.obstacleScore = 0,
    this.score = 0,
    this.running = false,
    this.gameOver = false,
    this.obstacles = const [],
  });

  final double playerY;
  final double velocity;
  final double rotation;
  final double angularVelocity;
  final double elapsed;
  final int obstacleScore;
  final int score;
  final bool running;
  final bool gameOver;
  final List<FlightObstacle> obstacles;

  FlightGameState copyWith({
    double? playerY,
    double? velocity,
    double? rotation,
    double? angularVelocity,
    double? elapsed,
    int? obstacleScore,
    int? score,
    bool? running,
    bool? gameOver,
    List<FlightObstacle>? obstacles,
  }) => FlightGameState(
    playerY: playerY ?? this.playerY,
    velocity: velocity ?? this.velocity,
    rotation: rotation ?? this.rotation,
    angularVelocity: angularVelocity ?? this.angularVelocity,
    elapsed: elapsed ?? this.elapsed,
    obstacleScore: obstacleScore ?? this.obstacleScore,
    score: score ?? this.score,
    running: running ?? this.running,
    gameOver: gameOver ?? this.gameOver,
    obstacles: obstacles ?? this.obstacles,
  );
}

class ShoutFlightPage extends StatefulWidget {
  const ShoutFlightPage({super.key});

  @override
  State<ShoutFlightPage> createState() => _ShoutFlightPageState();
}

class _ShoutFlightPageState extends State<ShoutFlightPage> {
  static const _frame = Duration(milliseconds: 16);
  static const _playerX = .25;
  final _random = math.Random();
  final _focusNode = FocusNode();
  Timer? _timer;
  FlightGameState _game = const FlightGameState();
  int _bestScore = 0;
  bool _newRecord = false;
  double _spawnCountdown = .6;
  int _lastTimerTick = 0;

  @override
  void initState() {
    super.initState();
    _loadBestScore();
  }

  Future<void> _loadBestScore() async {
    final storedScore = await loadFlightBestScore();
    if (!mounted) return;
    if (storedScore > _bestScore) {
      setState(() => _bestScore = storedScore);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _focusNode.dispose();
    super.dispose();
  }

  void _tap() {
    _focusNode.requestFocus();
    if (_game.gameOver) {
      _prepareGame();
      return;
    }
    if (!_game.running) _startGame();
    setState(
      () => _game = _game.copyWith(
        velocity: flightVelocityAfterTap(_game.velocity),
        angularVelocity: (_game.angularVelocity + 5.4).clamp(0, 13),
      ),
    );
  }

  void _prepareGame() {
    _timer?.cancel();
    setState(() {
      _game = const FlightGameState();
      _newRecord = false;
      _spawnCountdown = .45;
    });
  }

  void _startGame() {
    _timer?.cancel();
    _lastTimerTick = 0;
    setState(() {
      _game = const FlightGameState(running: true);
      _newRecord = false;
      _spawnCountdown = .45;
    });
    _timer = Timer.periodic(_frame, _onFrame);
  }

  void _onFrame(Timer timer) {
    final elapsedTicks = timer.tick - _lastTimerTick;
    _lastTimerTick = timer.tick;
    final delta =
        (elapsedTicks * _frame.inMicroseconds / Duration.microsecondsPerSecond)
            .clamp(0.001, 0.05);
    _tick(delta);
  }

  void _tick(double delta) {
    if (!mounted || !_game.running) return;
    var velocity = flightVelocityAfterGravity(_game.velocity, delta);
    var playerY = _game.playerY + velocity * delta;
    final elapsed = _game.elapsed + delta;
    var obstacleScore = _game.obstacleScore;
    var angularVelocity = _game.angularVelocity * math.exp(-1.65 * delta);
    final rotation = _game.rotation + angularVelocity * delta;
    _spawnCountdown -= delta;
    final obstacles = _game.obstacles
        .map((obstacle) => obstacle.copyWith(x: obstacle.x - .42 * delta))
        .where((obstacle) => obstacle.x > -.14)
        .toList();
    if (_spawnCountdown <= 0) {
      obstacles.add(_createObstacle());
      _spawnCountdown = 1.3 + _random.nextDouble() * .22;
    }
    for (var index = 0; index < obstacles.length; index++) {
      final obstacle = obstacles[index];
      if (!obstacle.passed && obstacle.x + .115 < _playerX - .035) {
        obstacleScore += obstacle.bonus;
        obstacles[index] = obstacle.copyWith(passed: true);
      }
    }
    final score = (elapsed * 10).floor() + obstacleScore;
    final hitBoundary = playerY < .032 || playerY > .968;
    final hitObstacle = obstacles.any((obstacle) {
      final overlapsX =
          obstacle.x + .008 < _playerX + .034 &&
          obstacle.x + .107 > _playerX - .034;
      final gapTop = obstacle.topHeight;
      final gapBottom = 1 - obstacle.bottomHeight;
      return overlapsX &&
          (playerY - .032 < gapTop || playerY + .032 > gapBottom);
    });
    if (hitBoundary || hitObstacle) {
      _timer?.cancel();
      _newRecord = score > _bestScore;
      if (_newRecord) {
        _bestScore = score;
        unawaited(_saveBestScore(score));
      }
      setState(
        () => _game = _game.copyWith(
          playerY: playerY.clamp(.032, .968),
          velocity: velocity,
          rotation: rotation,
          angularVelocity: angularVelocity,
          elapsed: elapsed,
          obstacleScore: obstacleScore,
          score: score,
          running: false,
          gameOver: true,
          obstacles: obstacles,
        ),
      );
      return;
    }
    setState(
      () => _game = _game.copyWith(
        playerY: playerY,
        velocity: velocity,
        rotation: rotation,
        angularVelocity: angularVelocity,
        elapsed: elapsed,
        obstacleScore: obstacleScore,
        score: score,
        obstacles: obstacles,
      ),
    );
  }

  Future<void> _saveBestScore(int score) async {
    await saveFlightBestScore(score);
  }

  FlightObstacle _createObstacle() {
    final single = _random.nextDouble() < .38;
    if (single) {
      final fromBottom = _random.nextBool();
      final height = .38 + _random.nextDouble() * .2;
      final gap = 1 - height;
      return FlightObstacle(
        x: 1.08,
        topHeight: fromBottom ? 0 : height,
        bottomHeight: fromBottom ? height : 0,
        bonus: (28 + (1 - gap) * 45).round(),
        style: _random.nextInt(5),
      );
    }
    final gap = .23 + _random.nextDouble() * .13;
    final top = .11 + _random.nextDouble() * (1 - gap - .22);
    return FlightObstacle(
      x: 1.08,
      topHeight: top,
      bottomHeight: 1 - top - gap,
      bonus: (35 + (.36 - gap) * 350).round(),
      style: _random.nextInt(5),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(_flightText(context, _FlightText.title))),
    body: SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(
              '${_game.score}',
              key: const Key('flight-score'),
              style: Theme.of(context).textTheme.displayMedium?.copyWith(
                fontWeight: FontWeight.w900,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            Text(
              '${_flightText(context, _FlightText.best)}: $_bestScore',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 8),
            Expanded(
              child: Semantics(
                label: _flightText(context, _FlightText.semantics),
                button: true,
                child: KeyboardListener(
                  focusNode: _focusNode,
                  autofocus: true,
                  onKeyEvent: (event) {
                    if (event is KeyDownEvent &&
                        (event.logicalKey == LogicalKeyboardKey.space ||
                            event.logicalKey == LogicalKeyboardKey.arrowUp)) {
                      _tap();
                    }
                  },
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: _tap,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(22),
                      child: RepaintBoundary(
                        child: CustomPaint(
                          painter: _FlightPainter(
                            game: _game,
                            playerX: _playerX,
                            colors: Theme.of(context).colorScheme,
                          ),
                          child: Center(
                            child: AnimatedOpacity(
                              opacity: _game.running ? 0 : 1,
                              duration: const Duration(milliseconds: 160),
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.surface.withValues(alpha: .9),
                                  borderRadius: BorderRadius.circular(18),
                                  border: Border.all(
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.outlineVariant,
                                  ),
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 24,
                                    vertical: 18,
                                  ),
                                  child: Text(
                                    _game.gameOver
                                        ? '${_newRecord ? '${_flightText(context, _FlightText.newRecord)}!\n' : ''}${_flightText(context, _FlightText.gameOver)}\n${_flightText(context, _FlightText.score)}: ${_game.score}\n${_flightText(context, _FlightText.restart)}'
                                        : _flightText(
                                            context,
                                            _FlightText.start,
                                          ),
                                    textAlign: TextAlign.center,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium
                                        ?.copyWith(fontWeight: FontWeight.w800),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              _flightText(context, _FlightText.instructions),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    ),
  );
}

enum _FlightText {
  title,
  score,
  best,
  semantics,
  gameOver,
  restart,
  start,
  instructions,
  newRecord,
}

String _flightText(BuildContext context, _FlightText key) {
  final language = Localizations.localeOf(context).languageCode;
  const values = <String, Map<_FlightText, String>>{
    'cs': {
      _FlightText.title: 'Shout Flight',
      _FlightText.score: 'Skóre',
      _FlightText.best: 'Nejlepší',
      _FlightText.semantics: 'Shout Flight. Klepnutím nebo mezerníkem vzlétni.',
      _FlightText.gameOver: 'Konec letu',
      _FlightText.restart: 'Klepni pro nový pokus',
      _FlightText.start: 'Klepni pro vzlet',
      _FlightText.instructions:
          'Klepni do hry nebo stiskni mezerník. Proleť mezerami a nedotkni se okrajů.',
      _FlightText.newRecord: 'Nový rekord',
    },
    'en': {
      _FlightText.title: 'Shout Flight',
      _FlightText.score: 'Score',
      _FlightText.best: 'Best',
      _FlightText.semantics: 'Shout Flight. Tap or press Space to fly.',
      _FlightText.gameOver: 'Flight over',
      _FlightText.restart: 'Tap to try again',
      _FlightText.start: 'Tap to take off',
      _FlightText.instructions:
          'Tap the game or press Space. Fly through the gaps without touching the edges.',
      _FlightText.newRecord: 'New record',
    },
    'de': {
      _FlightText.title: 'Shout Flight',
      _FlightText.score: 'Punkte',
      _FlightText.best: 'Bestwert',
      _FlightText.semantics:
          'Shout Flight. Tippe oder drücke die Leertaste zum Fliegen.',
      _FlightText.gameOver: 'Flug beendet',
      _FlightText.restart: 'Tippe für einen neuen Versuch',
      _FlightText.start: 'Tippe zum Abheben',
      _FlightText.instructions:
          'Tippe ins Spiel oder drücke die Leertaste. Fliege durch die Lücken, ohne die Ränder zu berühren.',
      _FlightText.newRecord: 'Neuer Rekord',
    },
    'pl': {
      _FlightText.title: 'Shout Flight',
      _FlightText.score: 'Wynik',
      _FlightText.best: 'Najlepszy',
      _FlightText.semantics:
          'Shout Flight. Dotknij lub naciśnij spację, aby lecieć.',
      _FlightText.gameOver: 'Koniec lotu',
      _FlightText.restart: 'Dotknij, aby spróbować ponownie',
      _FlightText.start: 'Dotknij, aby wystartować',
      _FlightText.instructions:
          'Dotknij gry lub naciśnij spację. Przelatuj przez luki bez dotykania krawędzi.',
      _FlightText.newRecord: 'Nowy rekord',
    },
    'sk': {
      _FlightText.title: 'Shout Flight',
      _FlightText.score: 'Skóre',
      _FlightText.best: 'Najlepšie',
      _FlightText.semantics:
          'Shout Flight. Ťuknutím alebo medzerníkom vzlietni.',
      _FlightText.gameOver: 'Koniec letu',
      _FlightText.restart: 'Ťukni pre nový pokus',
      _FlightText.start: 'Ťukni pre vzlet',
      _FlightText.instructions:
          'Ťukni do hry alebo stlač medzerník. Preleť medzerami a nedotkni sa okrajov.',
      _FlightText.newRecord: 'Nový rekord',
    },
    'uk': {
      _FlightText.title: 'Shout Flight',
      _FlightText.score: 'Рахунок',
      _FlightText.best: 'Найкращий',
      _FlightText.semantics:
          'Shout Flight. Торкніться або натисніть пробіл, щоб летіти.',
      _FlightText.gameOver: 'Політ завершено',
      _FlightText.restart: 'Торкніться, щоб спробувати ще раз',
      _FlightText.start: 'Торкніться для зльоту',
      _FlightText.instructions:
          'Торкніться гри або натисніть пробіл. Пролітайте крізь отвори, не торкаючись країв.',
      _FlightText.newRecord: 'Новий рекорд',
    },
    'vi': {
      _FlightText.title: 'Shout Flight',
      _FlightText.score: 'Điểm',
      _FlightText.best: 'Cao nhất',
      _FlightText.semantics: 'Shout Flight. Chạm hoặc nhấn phím cách để bay.',
      _FlightText.gameOver: 'Kết thúc chuyến bay',
      _FlightText.restart: 'Chạm để thử lại',
      _FlightText.start: 'Chạm để cất cánh',
      _FlightText.instructions:
          'Chạm vào trò chơi hoặc nhấn phím cách. Bay qua các khoảng trống và tránh chạm mép.',
      _FlightText.newRecord: 'Kỷ lục mới',
    },
  };
  return (values[language] ?? values['en']!)[key]!;
}

class _FlightPainter extends CustomPainter {
  const _FlightPainter({
    required this.game,
    required this.playerX,
    required this.colors,
  });

  final FlightGameState game;
  final double playerX;
  final ColorScheme colors;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = colors.surfaceContainerLowest,
    );
    _drawMovingBackground(canvas, size);
    final linePaint = Paint()
      ..color = colors.outlineVariant.withValues(alpha: .55)
      ..strokeWidth = 1;
    for (var index = 1; index < 8; index += 1) {
      final y = size.height * index / 8;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), linePaint);
    }
    for (final obstacle in game.obstacles) {
      final left = obstacle.x * size.width;
      final width = .115 * size.width;
      if (obstacle.topHeight > 0) {
        _drawSkyscraper(
          canvas,
          Rect.fromLTWH(left, 0, width, obstacle.topHeight * size.height),
          upsideDown: true,
          style: obstacle.style,
        );
      }
      if (obstacle.bottomHeight > 0) {
        final top = (1 - obstacle.bottomHeight) * size.height;
        _drawSkyscraper(
          canvas,
          Rect.fromLTWH(left, top, width, size.height - top),
          style: obstacle.style,
        );
      }
    }
    final player = Offset(playerX * size.width, game.playerY * size.height);
    canvas.save();
    canvas.translate(player.dx, player.dy);
    canvas.rotate(game.rotation);
    final iconSize = (math.min(size.width, size.height) * .105).clamp(
      34.0,
      54.0,
    );
    final iconPainter = TextPainter(
      text: TextSpan(
        text: String.fromCharCode(Icons.campaign_rounded.codePoint),
        style: TextStyle(
          fontSize: iconSize,
          fontFamily: Icons.campaign_rounded.fontFamily,
          package: Icons.campaign_rounded.fontPackage,
          color: colors.primary,
          shadows: [
            Shadow(
              color: colors.onSurface.withValues(alpha: .25),
              blurRadius: 3,
              offset: const Offset(1, 2),
            ),
          ],
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    iconPainter.paint(
      canvas,
      Offset(-iconPainter.width / 2, -iconPainter.height / 2),
    );
    canvas.restore();
  }

  void _drawMovingBackground(Canvas canvas, Size size) {
    final cloudPaint = Paint()
      ..color = colors.primaryContainer.withValues(alpha: .32);
    const cloudData = <(double, double, double)>[
      (.12, .18, .13),
      (.56, .31, .1),
      (.86, .12, .08),
      (.38, .48, .07),
    ];
    for (var index = 0; index < cloudData.length; index++) {
      final cloud = cloudData[index];
      final travel = (game.elapsed * (.018 + index * .003)) % 1.3;
      final x = ((cloud.$1 - travel + 1.3) % 1.3 - .15) * size.width;
      final y = cloud.$2 * size.height;
      final width = cloud.$3 * size.width;
      _drawCloud(canvas, Offset(x, y), width, cloudPaint);
    }

    _drawSkylineLayer(
      canvas,
      size,
      baseline: .92,
      speed: .018,
      buildingWidth: .075,
      color: colors.primary.withValues(alpha: .1),
      seed: 3,
    );
    _drawSkylineLayer(
      canvas,
      size,
      baseline: 1,
      speed: .038,
      buildingWidth: .095,
      color: colors.primary.withValues(alpha: .17),
      seed: 11,
    );
  }

  void _drawCloud(Canvas canvas, Offset center, double width, Paint paint) {
    final height = width * .34;
    canvas.drawOval(
      Rect.fromCenter(center: center, width: width, height: height),
      paint,
    );
    canvas.drawCircle(
      center + Offset(-width * .2, -height * .22),
      height * .48,
      paint,
    );
    canvas.drawCircle(
      center + Offset(width * .14, -height * .3),
      height * .58,
      paint,
    );
  }

  void _drawSkylineLayer(
    Canvas canvas,
    Size size, {
    required double baseline,
    required double speed,
    required double buildingWidth,
    required Color color,
    required int seed,
  }) {
    final width = buildingWidth * size.width;
    const pattern = <double>[.48, .76, .57, .92, .64, .81, .52, .69, .88];
    final cycleWidth = width * pattern.length;
    final offset = (game.elapsed * speed * size.width) % cycleWidth;
    final paint = Paint()..color = color;
    final cycles = (size.width / cycleWidth).ceil() + 2;
    for (var cycle = -1; cycle < cycles; cycle++) {
      final cycleLeft = cycle * cycleWidth - offset;
      for (var index = 0; index < pattern.length; index++) {
        final patternIndex = (index + seed) % pattern.length;
        final height = size.height * (.055 + pattern[patternIndex] * .085);
        final left = cycleLeft + index * width;
        final buildingRect = Rect.fromLTWH(
          left,
          baseline * size.height - height,
          width * .78,
          height,
        );
        canvas.drawRRect(
          RRect.fromRectAndRadius(buildingRect, const Radius.circular(2)),
          paint,
        );
        if (patternIndex == 3 || patternIndex == 7) {
          canvas.drawRect(
            Rect.fromLTWH(
              buildingRect.left + buildingRect.width * .44,
              buildingRect.top - size.height * .012,
              buildingRect.width * .12,
              size.height * .012,
            ),
            paint,
          );
        }
      }
    }
  }

  void _drawSkyscraper(
    Canvas canvas,
    Rect rect, {
    bool upsideDown = false,
    required int style,
  }) {
    if (rect.height <= 0) return;
    final building = Paint()..color = colors.primary.withValues(alpha: .78);
    final edge = Paint()..color = colors.primaryContainer;
    final window = Paint()..color = colors.onPrimary.withValues(alpha: .55);
    final inset = style == 1 ? rect.width * .1 : 0.0;
    final bodyRect = Rect.fromLTRB(
      rect.left + inset,
      rect.top,
      rect.right - inset,
      rect.bottom,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(bodyRect, Radius.circular(style == 3 ? 10 : 3)),
      building,
    );
    final roofY = upsideDown ? rect.bottom - 5 : rect.top;
    if (style == 2) {
      final roof = Path()
        ..moveTo(bodyRect.left - 2, upsideDown ? roofY : roofY + 5)
        ..lineTo(bodyRect.center.dx, upsideDown ? roofY + 10 : roofY - 10)
        ..lineTo(bodyRect.right + 2, upsideDown ? roofY : roofY + 5)
        ..close();
      canvas.drawPath(roof, edge);
    } else {
      canvas.drawRect(
        Rect.fromLTWH(bodyRect.left - 2, roofY, bodyRect.width + 4, 5),
        edge,
      );
    }
    if (style == 4) {
      final antennaX = bodyRect.center.dx;
      canvas.drawLine(
        Offset(antennaX, upsideDown ? rect.bottom : rect.top),
        Offset(antennaX, upsideDown ? rect.bottom + 11 : rect.top - 11),
        edge..strokeWidth = 3,
      );
    }
    const columns = 3;
    final windowWidth = rect.width / 8;
    final rowStep = (rect.width / 3.2).clamp(10, 18);
    for (var y = rect.top + 11; y < rect.bottom - 8; y += rowStep) {
      for (var column = 0; column < columns; column++) {
        final x = bodyRect.left + bodyRect.width * (column + 1) / (columns + 1);
        canvas.drawRect(
          Rect.fromCenter(
            center: Offset(x, y),
            width: windowWidth,
            height: windowWidth * .72,
          ),
          window,
        );
      }
      if (style == 3 && y + rowStep < rect.bottom - 8) {
        canvas.drawRect(
          Rect.fromLTWH(bodyRect.left, y + rowStep * .45, bodyRect.width, 2),
          edge,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_FlightPainter oldDelegate) =>
      oldDelegate.game != game || oldDelegate.colors != colors;
}
