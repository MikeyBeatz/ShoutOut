part of '../main.dart';

const _feedPageSize = 50;
const _commentPageSize = 50;
const _privateReplyPageSize = 50;
const _profileHistoryPageSize = 50;
const _moderationPageSize = 50;
const _blockedUsersPageSize = 200;

const _shoutRateWindow = Duration(days: 1);
const _commentRateWindow = Duration(hours: 1);
const _privateReplyRateWindow = Duration(hours: 1);
const _reportRateWindow = Duration(days: 1);
const _interactionRateWindow = Duration(hours: 1);
const _deleteRateWindow = Duration(hours: 1);

DocumentReference<Map<String, dynamic>> _rateLimitReference(String action) {
  final uid = FirebaseAuth.instance.currentUser!.uid;
  return FirebaseFirestore.instance
      .collection('rateLimits')
      .doc(uid)
      .collection('actions')
      .doc(action);
}

Map<String, Object> _nextRateLimitData({
  required DocumentSnapshot<Map<String, dynamic>> snapshot,
  required String eventId,
  required Duration window,
}) {
  final data = snapshot.data();
  final previousStart = data?['windowStartedAt'] as Timestamp?;
  final previousCount = data?['count'] as int? ?? 0;
  final now = DateTime.now().toUtc();
  final resetWindow =
      previousStart == null ||
      !now.isBefore(previousStart.toDate().toUtc().add(window));

  return {
    'lastAt': FieldValue.serverTimestamp(),
    'lastEventId': eventId,
    'windowStartedAt': resetWindow
        ? FieldValue.serverTimestamp()
        : previousStart,
    'count': resetWindow ? 1 : previousCount + 1,
  };
}

String _shoutReactionEventId(String shoutId) => 'shoutReaction_$shoutId';
String _saveEventId(String shoutId) => 'save_$shoutId';
String _commentReactionEventId(String shoutId, String commentId) =>
    'commentReaction_${shoutId}_$commentId';
String _commentDeleteEventId(String commentId) => commentId;

Future<void> _deleteCommentWithCounter(
  DocumentReference<Map<String, dynamic>> commentReference,
) async {
  final shoutReference = commentReference.parent.parent!;
  final rateReference = _rateLimitReference('delete');
  final eventId = _commentDeleteEventId(commentReference.id);

  await FirebaseFirestore.instance.runTransaction((transaction) async {
    final rateSnapshot = await transaction.get(rateReference);
    final shoutSnapshot = await transaction.get(shoutReference);
    final currentComments = shoutSnapshot.data()?['commentsCount'] as int? ?? 0;

    transaction
      ..delete(commentReference)
      ..update(shoutReference, {
        'commentsCount': currentComments > 0 ? currentComments - 1 : 0,
      })
      ..set(
        rateReference,
        _nextRateLimitData(
          snapshot: rateSnapshot,
          eventId: eventId,
          window: _deleteRateWindow,
        ),
      );
  });
}
