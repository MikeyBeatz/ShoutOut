part of '../main.dart';

const _feedPageSize = 50;
const _commentPageSize = 50;
const _privateReplyPageSize = 50;
const _profileHistoryPageSize = 50;
const _moderationPageSize = 50;
const _blockedUsersPageSize = 200;
const _followedProfilesPageSize = 200;

const _shoutRateWindow = Duration(days: 1);
const _commentRateWindow = Duration(hours: 1);
const _privateReplyRateWindow = Duration(hours: 1);
const _reportRateWindow = Duration(days: 1);
const _interactionRateWindow = Duration(hours: 1);
const _deleteRateWindow = Duration(hours: 1);
const _shoutCooldown = Duration(minutes: 2);
const _businessShoutCooldown = Duration(seconds: 1);
const _shoutDailyMaximum = 50;
const _businessShoutDailyMaximum = 500;

Future<void> _recordClientError({
  required String action,
  required Object error,
}) async {
  final user = FirebaseAuth.instance.currentUser;
  if (user == null) return;
  final code = error is FirebaseException
      ? error.code
      : error is StateError
      ? error.message.toString()
      : error.runtimeType.toString();
  try {
    final expiresAt = Timestamp.fromDate(
      DateTime.now().toUtc().add(const Duration(days: 60)),
    );
    await FirebaseFirestore.instance.collection('clientErrorLogs').add({
      'userId': user.uid,
      'action': action,
      'code': code.substring(0, code.length.clamp(0, 120)),
      'message': error.toString().substring(
        0,
        error.toString().length.clamp(0, 500),
      ),
      'createdAt': FieldValue.serverTimestamp(),
      'expiresAt': expiresAt,
    });
  } catch (_) {
    // Logging must never replace the original user-facing error.
  }
}

Future<void> _recordTechnicalLogAccess(AccountRole role) async {
  final user = FirebaseAuth.instance.currentUser;
  if (user == null || !role.isAtLeast(AccountRole.administrator)) return;
  try {
    await FirebaseFirestore.instance.collection('technicalLogAccessAudits').add({
      'userId': user.uid,
      'role': role.name,
      'action': 'view_client_error_logs',
      'createdAt': FieldValue.serverTimestamp(),
      'expiresAt': Timestamp.fromDate(
        DateTime.now().toUtc().add(const Duration(days: 60)),
      ),
    });
  } catch (_) {
    // The diagnostic screen remains usable if its secondary audit write fails.
  }
}

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
