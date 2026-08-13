import 'package:web/web.dart' as web;

const flightBestScoreKey = 'shout_flight_best_score';

Future<int> loadFlightBestScore() async =>
    int.tryParse(web.window.localStorage.getItem(flightBestScoreKey) ?? '') ??
    0;

Future<void> saveFlightBestScore(int score) async {
  final storedScore = await loadFlightBestScore();
  if (score > storedScore) {
    web.window.localStorage.setItem(flightBestScoreKey, '$score');
  }
}
