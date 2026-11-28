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
    await FirebaseFirestore.instance
        .collection('technicalLogAccessAudits')
        .add({
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

String _serverWriteFailureText(
  BuildContext context,
  Object? error, {
  String fallback = 'Akci se nepodařilo dokončit. Zkus to znovu.',
}) =>
    expiredOperationText(error, Localizations.localeOf(context).languageCode) ??
    tr(context, fallback);

bool get _useInteractionFeedback =>
    kIsWeb && WebEnvironment.current.name == 'dev';

Stream<void> get _interactionSnapshotBarrier {
  final key = liveDataKey('shout-interaction-barrier');
  return liveStreams.watch(
    key,
    FirebaseFirestore.instance.snapshotsInSync,
    isCurrent: () => FirebaseAuth.instance.currentUser?.uid == key.$1,
  );
}

LiveShoutState _interactionState(Shout shout) => LiveShoutState(
  likes: shout.likes,
  dislikes: shout.dislikes,
  comments: shout.comments,
  reaction: shout.isLiked
      ? 'like'
      : shout.isDisliked
      ? 'dislike'
      : null,
  saves: shout.saves,
  saved: shout.isSaved,
);

/// Only used if acknowledged writes outpace the live channel. Atomic, read-only,
/// two documents; no new endpoint, listener, polling or receipt counters.
Future<LiveShoutState> _reconcileInteraction(
  String uid,
  String id,
  InteractionKind kind,
) async {
  if (FirebaseAuth.instance.currentUser?.uid != uid) {
    throw FirebaseFunctionsException(
      code: 'unauthenticated',
      message: 'The signed-in account changed.',
    );
  }
  final delta = feedDeltaRuntime;
  if (delta != null) {
    return delta.reconcile(uid, id, save: kind == InteractionKind.save);
  }
  final ref = FirebaseFirestore.instance.collection('shouts').doc(id);
  final result = await FirebaseFirestore.instance.runTransaction(
    (tx) async {
      final parent = await tx.get(ref);
      final own = await tx.get(
        ref
            .collection(kind == InteractionKind.save ? 'saves' : 'reactions')
            .doc(uid),
      );
      final data = parent.data();
      return LiveShoutState(
        likes: (data?['likesCount'] as num?)?.toInt() ?? 0,
        dislikes: (data?['dislikesCount'] as num?)?.toInt() ?? 0,
        comments: (data?['commentsCount'] as num?)?.toInt() ?? 0,
        reaction: kind == InteractionKind.reaction
            ? (own.data()?['type'] as String?)
            : null,
        saves: (data?['savesCount'] as num?)?.toInt() ?? 0,
        saved: kind == InteractionKind.save && own.exists,
        contentPurged:
            data == null ||
            data['status'] == 'deleted' ||
            data['contentPurged'] == true,
      );
    },
    maxAttempts: 1,
    timeout: const Duration(seconds: 15),
  );
  if (FirebaseAuth.instance.currentUser?.uid != uid) {
    throw FirebaseFunctionsException(
      code: 'unauthenticated',
      message: 'The signed-in account changed.',
    );
  }
  return result;
}

final _serverContentOperations = TimedOperationGateway(
  onTiming: (operation, stage, elapsed) {
    if (_useInteractionFeedback) {
      debugPrint(
        'Interaction timing: operation=$operation stage=$stage elapsedMs=${elapsed.inMilliseconds}',
      );
    }
  },
  currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  issuedAt: (userId) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null || user.uid != userId) {
      throw FirebaseFunctionsException(
        code: 'unauthenticated',
        message: 'The signed-in account changed.',
      );
    }
    final metadata = await user.getIdTokenResult().timeout(
      const Duration(seconds: 20),
      onTimeout: () => throw FirebaseFunctionsException(
        code: 'unavailable',
        message: 'operation-clock-unavailable',
      ),
    );
    final issuedAt = metadata.issuedAtTime;
    if (issuedAt == null) {
      throw FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'operation-clock-unavailable',
      );
    }
    return issuedAt;
  },
  send: (operation, payload) async {
    await FirebaseFunctions.instanceFor(
      region: 'europe-west3',
    ).httpsCallable(operation).call(payload);
  },
);

bool get _useServerBusinessLogo => kIsWeb
    ? WebEnvironment.current.serverBusinessLogo
    : const bool.fromEnvironment('SERVER_BUSINESS_LOGO');

final _businessLogos = BusinessLogoGateway(
  currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  store: createBusinessLogoPendingStore(Firebase.app().options.projectId),
  send: (request) => _serverContentOperations.call(
    attempt: request.attempt,
    userId: request.userId,
    operation: 'updateBusinessLogo',
    payload: request.toPayload(),
  ),
);

bool get _useServerModerationQueue => kIsWeb
    ? WebEnvironment.current.serverModerationQueue
    : const bool.fromEnvironment('SERVER_MODERATION_QUEUE');

Future<Map<String, dynamic>> _moderationQueueTransport(
  String operation,
  Map<String, dynamic> payload,
) async {
  final result = await FirebaseFunctions.instanceFor(
    region: 'europe-west3',
  ).httpsCallable(operation).call(payload);
  return Map<String, dynamic>.from(result.data as Map);
}

final _moderationCaseDecisions = ModerationCaseDecisionClient(
  send: _moderationQueueTransport,
  currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  issuedAt: _serverContentOperations.issuedAt,
);

final _commentDeletionGateway = CommentDeletionGateway(
  currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  send: (request) async {
    await _serverContentOperations.call(
      attempt: request.timedAttempt,
      userId: request.userId,
      operation: 'deleteComment',
      payload: request.toPayload(),
    );
  },
);

bool get _useServerPrivateReportRemoval =>
    _useLifecycleSources ||
    kIsWeb && WebEnvironment.current.serverPrivateReportRemoval;

bool get _useServerContentReportDecisions =>
    _useLifecycleSources ||
    kIsWeb && WebEnvironment.current.serverContentReportDecisions;

bool get _useServerPublicReportRemoval =>
    _useLifecycleSources ||
    kIsWeb && WebEnvironment.current.serverPublicReportRemoval;

ContentReportTarget _contentReportTarget(
  String collection,
  Map<String, dynamic> data,
) => (
  type: switch (collection) {
    'reports' => 'shout',
    'commentReports' => 'comment',
    'privateReplyReports' => 'privateReply',
    _ => throw StateError('Unknown report collection.'),
  },
  shoutId: data['shoutId'] as String,
  targetId: collection == 'reports'
      ? null
      : data[collection == 'commentReports' ? 'commentId' : 'privateReplyId']
            as String,
);

final _contentReportDecisionGateway = ContentReportDecisionGateway(
  currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  send: (request) => _serverContentOperations.call(
    attempt: request.timedAttempt,
    userId: request.userId,
    operation: request.operation,
    payload: request.toPayload(),
  ),
);

ContentReportDecisionRequest? _pendingContentReportDecision(
  ContentReportTarget target,
) {
  final uid = FirebaseAuth.instance.currentUser?.uid;
  return uid == null ||
          !(_useServerContentReportDecisions || _useServerPublicReportRemoval)
      ? null
      : _contentReportDecisionGateway.pending(uid, target);
}

Future<void> _decideContentReports(
  ContentReportTarget target,
  List<String> reportIds,
  String decision, {
  String? note,
}) async {
  _checkPendingContentSanction(target, decision);
  if (!usesServerContentReportDecision(
    decision: decision,
    targetType: target.type,
    decisionsEnabled: _useServerContentReportDecisions,
    publicRemovalEnabled: _useServerPublicReportRemoval,
  )) {
    throw StateError('Server report operation is disabled.');
  }
  final uid = FirebaseAuth.instance.currentUser?.uid;
  if (uid == null) {
    throw FirebaseFunctionsException(
      code: 'unauthenticated',
      message: 'The signed-in account changed.',
    );
  }
  final pending = _pendingContentReportDecision(target);
  await _contentReportDecisionGateway.decide(
    userId: uid,
    target: target,
    reportIds: pending?.reportIds ?? reportIds,
    decision: decision,
    note: note ?? pending?.note ?? '',
  );
}

final _privateReportRemovalGateway = PrivateReportRemovalGateway(
  currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  send: (request) => _serverContentOperations.call(
    attempt: request.timedAttempt,
    userId: request.userId,
    operation: 'removeReportedPrivateReply',
    payload: request.toPayload(),
  ),
);

PrivateReportRemovalRequest? _pendingPrivateReportRemoval(String reportId) {
  final uid = FirebaseAuth.instance.currentUser?.uid;
  return uid == null || !_useServerPrivateReportRemoval
      ? null
      : _privateReportRemovalGateway.pending(uid, reportId);
}

Future<void> _removeReportedPrivateReply(
  String reportId, {
  String? note,
}) async {
  final uid = FirebaseAuth.instance.currentUser?.uid;
  if (uid == null) {
    throw FirebaseFunctionsException(
      code: 'unauthenticated',
      message: 'The signed-in account changed.',
    );
  }
  await _privateReportRemovalGateway.remove(
    userId: uid,
    reportId: reportId,
    note: note ?? _pendingPrivateReportRemoval(reportId)?.note ?? '',
  );
}

final _privateReplyDeletionGateway = PrivateReplyDeletionGateway(
  currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  send: (request) => _serverContentOperations.call(
    attempt: request.timedAttempt,
    userId: request.userId,
    operation: 'deletePrivateReply',
    payload: request.toPayload(),
  ),
);

Future<void> _deleteOwnPrivateReply(
  DocumentReference<Map<String, dynamic>> reference,
  String userId,
) async {
  if (kIsWeb && WebEnvironment.current.serverPrivateReplyDeletion) {
    await _privateReplyDeletionGateway.delete(
      userId: userId,
      shoutId: reference.parent.parent!.id,
      privateReplyId: reference.id,
    );
    return;
  }
  if (FirebaseAuth.instance.currentUser?.uid != userId) {
    throw FirebaseFunctionsException(
      code: 'unauthenticated',
      message: 'The signed-in account changed.',
    );
  }
  await reference.delete();
}

final _shoutDeletionGateway = ShoutDeletionGateway(
  currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  send: (request) async {
    await _serverContentOperations.call(
      attempt: request.timedAttempt,
      userId: request.userId,
      operation: 'deleteShout',
      payload: request.toPayload(),
    );
  },
);

Future<void> _deleteShoutContent(String shoutId, {String? ownAuthor}) async {
  final uid = FirebaseAuth.instance.currentUser?.uid;
  if (DeletionWritePolicy.current.shoutDeletion) {
    await _shoutDeletionGateway.delete(
      userId: FirebaseAuth.instance.currentUser?.uid ?? '',
      shoutId: shoutId,
    );
    if (_useInteractionFeedback && uid != null && ownAuthor == uid) {
      interactionFeedback.confirmOwnDeletion(uid, shoutId);
    }
    return;
  }
  await FirebaseFirestore.instance.collection('shouts').doc(shoutId).update({
    'status': 'deleted',
  });
}

Future<int?> _deleteCommentWithCounter(
  DocumentReference<Map<String, dynamic>> commentReference,
) async {
  final shoutReference = commentReference.parent.parent!;
  if (kIsWeb && WebEnvironment.current.serverCommentDeletion) {
    await _commentDeletionGateway.delete(
      userId: FirebaseAuth.instance.currentUser?.uid ?? '',
      shoutId: shoutReference.id,
      commentId: commentReference.id,
    );
    return null; // The parent stream supplies the current count.
  }
  final rateReference = _rateLimitReference('delete');
  final eventId = _commentDeleteEventId(commentReference.id);

  return FirebaseFirestore.instance.runTransaction<int>((transaction) async {
    final rateSnapshot = await transaction.get(rateReference);
    final shoutSnapshot = await transaction.get(shoutReference);
    final currentComments = shoutSnapshot.data()?['commentsCount'] as int? ?? 0;
    final remainingComments = currentComments > 0 ? currentComments - 1 : 0;

    transaction
      ..delete(commentReference)
      ..update(shoutReference, {'commentsCount': remainingComments})
      ..set(
        rateReference,
        _nextRateLimitData(
          snapshot: rateSnapshot,
          eventId: eventId,
          window: _deleteRateWindow,
        ),
      );
    return remainingComments;
  });
}
