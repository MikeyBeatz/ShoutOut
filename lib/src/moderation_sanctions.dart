part of '../main.dart';

bool get _useServerContentSanctions =>
    kIsWeb && WebEnvironment.current.serverContentSanctions;

class _ModerationDecisionCancelled implements Exception {}

final _moderationSanctions = ModerationSanctionGateway(
  currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  send: (request) => _serverContentOperations.call(
    attempt: request.timedAttempt,
    userId: request.userId,
    operation: request.operation,
    payload: request.toPayload(),
  ),
);

String _sanctionScope(ContentReportTarget target) =>
    ModerationSanctionGateway.contentScope(
      target.type,
      target.shoutId,
      target.targetId,
    );
ModerationSanctionRequest? _pendingContentSanction(ContentReportTarget target) {
  final uid = FirebaseAuth.instance.currentUser?.uid;
  return !_useServerContentSanctions || uid == null
      ? null
      : _moderationSanctions.pending(uid, _sanctionScope(target));
}

void _checkPendingContentSanction(ContentReportTarget target, String action) {
  final pending = _pendingContentSanction(target);
  if (pending != null && pending.payload['decision'] != action) {
    throw FirebaseFunctionsException(
      code: 'already-exists',
      message: 'Retry the original pending decision first.',
    );
  }
}

Future<bool> _showServerContentSanction(
  BuildContext context, {
  required AccountRole role,
  required ContentReportTarget target,
  required String expectedTargetUserId,
  DocumentSnapshot<Map<String, dynamic>>? sourceSnapshot,
  int? expectedCreatedAt,
  List<String>? reportIds,
  String? sourceReportId,
  String? action,
  String reasonHint = '',
}) async {
  final actor = FirebaseAuth.instance.currentUser?.uid;
  if (actor == null) {
    throw FirebaseFunctionsException(
      code: 'unauthenticated',
      message: 'The signed-in account changed.',
    );
  }
  final pending = _pendingContentSanction(target),
      scope = _sanctionScope(target);
  if (_pendingContentReportDecision(target) != null) {
    throw FirebaseFunctionsException(
      code: 'already-exists',
      message: 'Complete the pending report decision first.',
    );
  }
  final sourceRef = FirebaseFirestore.instance
      .collection('shouts')
      .doc(target.shoutId);
  final source = pending == null
      ? sourceSnapshot ??
            await (target.type == 'shout'
                    ? sourceRef
                    : sourceRef
                          .collection(
                            target.type == 'comment'
                                ? 'comments'
                                : 'privateReplies',
                          )
                          .doc(target.targetId))
                .get(const GetOptions(source: Source.server))
      : null;
  final sourceData = source?.data();
  if (pending == null &&
      (source?.exists != true ||
          sourceData?['authorId'] != expectedTargetUserId ||
          sourceData?['createdAt'] is! Timestamp)) {
    throw FirebaseFunctionsException(
      code: 'failed-precondition',
      message: 'The sanction target changed.',
    );
  }
  if (pending == null &&
      expectedCreatedAt != null &&
      (source!.get('createdAt') as Timestamp).millisecondsSinceEpoch !=
          expectedCreatedAt) {
    throw FirebaseFunctionsException(
      code: 'failed-precondition',
      message: 'The sanction target changed.',
    );
  }
  final previousCount = pending == null
      ? (await FirebaseFirestore.instance
                    .collection('sanctions')
                    .where('userId', isEqualTo: expectedTargetUserId)
                    .limit(50)
                    .count()
                    .get())
                .count ??
            0
      : null;
  if (!context.mounted || FirebaseAuth.instance.currentUser?.uid != actor) {
    return false;
  }
  final choices = pending != null
      ? [pending.payload['decision'] as String]
      : action != null
      ? [action]
      : [
          for (final value in moderationSanctionActions)
            if (role.isAtLeast(AccountRole.seniorModerator) ||
                !['restrict90d', 'ban90d', 'banPermanent'].contains(value))
              value,
        ];
  return await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (_) => ModerationSanctionDialog(
          title: 'Potvrdit postih',
          userId: expectedTargetUserId,
          previousCount: previousCount,
          actions: choices,
          label: _sanctionActionLabel,
          initialReason: pending?.payload['note'] as String? ?? reasonHint,
          initialAction: pending?.payload['decision'] as String? ?? action,
          isCurrent: () => FirebaseAuth.instance.currentUser?.uid == actor,
          hasPending: () => _moderationSanctions.pending(actor, scope) != null,
          onSubmit: (decision, note) => pending != null
              ? _moderationSanctions.retry(pending)
              : _moderationSanctions.execute(
                  userId: actor,
                  scope: scope,
                  operation: 'sanctionContent',
                  payload: {
                    'mode': reportIds == null ? 'observation' : 'report',
                    'expectedTargetUserId': expectedTargetUserId,
                    'targetType': target.type,
                    'shoutId': target.shoutId,
                    if (target.targetId != null) 'targetId': target.targetId,
                    if (reportIds != null) 'sourceReportId': sourceReportId,
                    if (reportIds != null)
                      'reportIds': reportIds
                    else
                      'expectedCreatedAt':
                          (source!.get('createdAt') as Timestamp)
                              .millisecondsSinceEpoch,
                    'decision': decision,
                    'note': note,
                  },
                ),
        ),
      ) ??
      false;
}

Future<bool> _sanctionReportedContent(
  BuildContext context, {
  required AccountRole role,
  required ContentReportTarget target,
  required List<String> reportIds,
  required String sourceReportId,
  required String action,
  required String reasonHint,
}) async {
  final pending = _pendingContentSanction(target);
  if (pending != null) {
    return _showServerContentSanction(
      context,
      role: role,
      target: target,
      expectedTargetUserId: pending.payload['expectedTargetUserId'] as String,
      reportIds: List<String>.from(pending.payload['reportIds'] as List),
      sourceReportId: pending.payload['sourceReportId'] as String,
      action: action,
    );
  }
  final root = FirebaseFirestore.instance
      .collection('shouts')
      .doc(target.shoutId);
  final source =
      await (target.type == 'shout'
              ? root
              : root
                    .collection(
                      target.type == 'comment' ? 'comments' : 'privateReplies',
                    )
                    .doc(target.targetId))
          .get(const GetOptions(source: Source.server));
  final author = source.data()?['authorId'];
  if (author is! String) {
    throw FirebaseFunctionsException(
      code: 'not-found',
      message: 'The sanction target is unavailable.',
    );
  }
  if (!context.mounted) return false;
  return _showServerContentSanction(
    context,
    role: role,
    target: target,
    expectedTargetUserId: author,
    sourceSnapshot: source,
    reportIds: reportIds,
    sourceReportId: sourceReportId,
    action: action,
    reasonHint: reasonHint,
  );
}

Future<bool> _showServerSanctionRevocation(
  BuildContext context,
  String sanctionId,
  String userId,
) async {
  final actor = FirebaseAuth.instance.currentUser?.uid;
  if (actor == null) return false;
  final scope = ModerationSanctionGateway.revocationScope(sanctionId),
      pending = _moderationSanctions.pending(actor, scope);
  return await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (_) => ModerationSanctionDialog(
          title: 'Zrušit postih',
          userId: userId,
          actions: const ['revoke'],
          label: (_) => 'Zrušit aktivní postih',
          initialReason: pending?.payload['note'] as String? ?? '',
          isCurrent: () => FirebaseAuth.instance.currentUser?.uid == actor,
          hasPending: () => _moderationSanctions.pending(actor, scope) != null,
          onSubmit: (_, note) => pending != null
              ? _moderationSanctions.retry(pending)
              : _moderationSanctions.execute(
                  userId: actor,
                  scope: scope,
                  operation: 'revokeSanction',
                  payload: {'sanctionId': sanctionId, 'note': note},
                ),
        ),
      ) ??
      false;
}
