import 'dart:convert';

/// Keeps one operation key across retries, until the user edits the draft.
class PublicationAttempt {
  PublicationAttempt({DateTime Function()? clock})
    : _clock = clock ?? DateTime.now;

  final DateTime Function() _clock;
  String? _signature;
  String? _key;
  int _sequence = 0;

  String keyFor(List<Object?> draft) {
    final signature = jsonEncode(draft);
    if (_signature != signature) {
      _signature = signature;
      _key = '${_clock().microsecondsSinceEpoch}_${_sequence++}';
    }
    return _key!;
  }
}
