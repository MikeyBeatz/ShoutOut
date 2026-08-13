import 'package:shared_preferences/shared_preferences.dart';

const flightBestScoreKey = 'shout_flight_best_score';

Future<int> loadFlightBestScore() async {
  final preferences = await SharedPreferences.getInstance();
  return preferences.getInt(flightBestScoreKey) ?? 0;
}

Future<void> saveFlightBestScore(int score) async {
  final preferences = await SharedPreferences.getInstance();
  final storedScore = preferences.getInt(flightBestScoreKey) ?? 0;
  if (score > storedScore) await preferences.setInt(flightBestScoreKey, score);
}
