import 'package:cloud_firestore/cloud_firestore.dart';

/// Decode only the reported-comment view, never a general archive document.
Map<String, dynamic> decodeArchivedCommentTarget(Object? response) {
  if (response is! Map || response['archived'] != true) {
    throw StateError('Invalid archived report response.');
  }
  final target = response['targetData'];
  if (target is! Map ||
      target['authorId'] is! String ||
      target['text'] is! String ||
      target['createdAtMillis'] is! num ||
      !(target['createdAtMillis'] as num).isFinite ||
      (target['createdAtMillis'] as num) !=
          (target['createdAtMillis'] as num).truncateToDouble() ||
      (target['authorNickname'] != null &&
          target['authorNickname'] is! String)) {
    throw StateError('Invalid archived comment target.');
  }
  return {
    'authorId': target['authorId'],
    'text': target['text'],
    'createdAt': Timestamp.fromMillisecondsSinceEpoch(
      (target['createdAtMillis'] as num).toInt(),
    ),
    if (target['authorNickname'] != null)
      'authorNickname': target['authorNickname'],
  };
}
