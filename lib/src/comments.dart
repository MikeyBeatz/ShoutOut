part of '../main.dart';

class CommentTile extends StatefulWidget {
  const CommentTile({
    super.key,
    required this.comment,
    required this.shoutAuthorId,
    required this.onReply,
    required this.onPrivateReply,
    required this.onReport,
    required this.onJumpToReply,
  });

  final QueryDocumentSnapshot<Map<String, dynamic>> comment;
  final String shoutAuthorId;
  final void Function(String commentId, String nickname) onReply;
  final void Function(String recipientId, String nickname, String commentId)
  onPrivateReply;
  final VoidCallback onReport;
  final ValueChanged<String> onJumpToReply;

  @override
  State<CommentTile> createState() => _CommentTileState();
}

class _CommentTileState extends State<CommentTile> {
  bool _revealed = false;
  bool _highlighted = false;

  void highlight() {
    setState(() {
      _revealed = true;
      _highlighted = true;
    });
    Future<void>.delayed(const Duration(milliseconds: 1200), () {
      if (mounted) setState(() => _highlighted = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.comment.data();
    final ownComment =
        data['authorId'] == FirebaseAuth.instance.currentUser?.uid;
    final reactions = widget.comment.reference.collection('reactions');
    final ownReaction = reactions.doc(FirebaseAuth.instance.currentUser!.uid);
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: ownReaction.snapshots(),
      builder: (context, snapshot) {
        final likes = data['likesCount'] as int? ?? 0;
        final dislikes = data['dislikesCount'] as int? ?? 0;
        final ownType = snapshot.data?.data()?['type'] as String?;
        final total = likes + dislikes;
        final hidden = !ownComment && total >= 10 && dislikes / total >= .7;
        if (hidden && !_revealed) {
          return Card(
            child: ListTile(
              leading: const Icon(Icons.visibility_off_outlined),
              title: Text(tr(context, 'Skrytý komentář')),
              subtitle: Text(
                tr(context, 'Komentář byl skryt kvůli negativnímu hodnocení.'),
              ),
              trailing: TextButton(
                onPressed: () => setState(() => _revealed = true),
                child: Text(tr(context, 'Zobrazit')),
              ),
            ),
          );
        }
        return Card(
          color: _highlighted
              ? Theme.of(context).colorScheme.primaryContainer
              : null,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: PublicIdentityBuilder(
                        userId: data['authorId'] as String,
                        fallbackNickname: data['authorNickname'] as String,
                        fallbackAvatarStyle: AvatarStyle.fallback,
                        builder: (context, identity) => Row(
                          children: [
                            AvatarImage(
                              avatarId: identity.avatarStyle.avatarId,
                              style: identity.avatarStyle,
                              radius: 16,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Wrap(
                                crossAxisAlignment: WrapCrossAlignment.center,
                                spacing: 6,
                                children: [
                                  Text(
                                    identity.nickname,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  if (data['authorId'] == widget.shoutAuthorId)
                                    Chip(
                                      label: Text(tr(context, 'Autor')),
                                      visualDensity: VisualDensity.compact,
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (ownComment)
                      IconButton(
                        tooltip: tr(context, 'Smazat komentář'),
                        icon: const Icon(Icons.delete_outline),
                        onPressed: _deleteComment,
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                _commentText(context, data),
                const SizedBox(height: 4),
                Row(
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          ReactionButton(
                            icon: Icons.thumb_up_outlined,
                            value: likes,
                            selected: ownType == 'like',
                            onPressed: () => _toggleReaction('like'),
                          ),
                          const SizedBox(width: 4),
                          ReactionButton(
                            icon: Icons.thumb_down_outlined,
                            value: dislikes,
                            selected: ownType == 'dislike',
                            onPressed: () => _toggleReaction('dislike'),
                          ),
                        ],
                      ),
                    ),
                    const Spacer(),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerRight,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            tooltip: tr(context, 'Odpovědět'),
                            visualDensity: VisualDensity.compact,
                            onPressed: () => widget.onReply(
                              widget.comment.id,
                              data['authorNickname'] as String,
                            ),
                            icon: const Icon(Icons.reply_outlined, size: 20),
                          ),
                          if (!ownComment)
                            IconButton(
                              tooltip: tr(context, 'Soukromě'),
                              visualDensity: VisualDensity.compact,
                              onPressed: () => widget.onPrivateReply(
                                data['authorId'] as String,
                                data['authorNickname'] as String,
                                widget.comment.id,
                              ),
                              icon: const Icon(Icons.lock_outline, size: 20),
                            ),
                          if (!ownComment)
                            IconButton(
                              tooltip: tr(context, 'Nahlásit'),
                              visualDensity: VisualDensity.compact,
                              onPressed: widget.onReport,
                              icon: const Icon(Icons.flag_outlined, size: 20),
                            ),
                          if (!ownComment)
                            StreamBuilder<AccountRole>(
                              stream: _watchAccountRole(
                                FirebaseAuth.instance.currentUser!.uid,
                              ),
                              builder: (context, snapshot) {
                                final role = snapshot.data ?? AccountRole.user;
                                if (!role.isAtLeast(AccountRole.moderator)) {
                                  return const SizedBox.shrink();
                                }
                                return IconButton(
                                  tooltip: 'Moderovat',
                                  visualDensity: VisualDensity.compact,
                                  onPressed: () => _showDirectModerationDialog(
                                    context,
                                    role: role,
                                    userId: data['authorId'] as String,
                                    sourceContentType: 'comment',
                                    sourceContentId: widget.comment.id,
                                    contentSnapshot: {
                                      ...data,
                                      'shoutId': widget
                                          .comment
                                          .reference
                                          .parent
                                          .parent!
                                          .id,
                                    },
                                  ),
                                  icon: const Icon(
                                    Icons.security_outlined,
                                    size: 20,
                                  ),
                                );
                              },
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _toggleReaction(String type) async {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    final firestore = FirebaseFirestore.instance;
    final reference = widget.comment.reference.collection('reactions').doc(uid);
    final shoutReference = widget.comment.reference.parent.parent!;
    final commentAuthorId = widget.comment.data()['authorId'] as String;
    final actorProfileReference = firestore
        .collection('publicProfiles')
        .doc(uid);
    final notificationSettingsReference = firestore
        .collection('users')
        .doc(commentAuthorId)
        .collection('settings')
        .doc('notifications');
    final notificationReference = firestore
        .collection('users')
        .doc(commentAuthorId)
        .collection('notifications')
        .doc(
          'commentReaction_${type}_${shoutReference.id}_${widget.comment.id}',
        );
    final rateReference = _rateLimitReference('interaction');
    final eventId = _commentReactionEventId(
      shoutReference.id,
      widget.comment.id,
    );
    try {
      await firestore.runTransaction((transaction) async {
        final rateSnapshot = await transaction.get(rateReference);
        final commentSnapshot = await transaction.get(widget.comment.reference);
        final shoutSnapshot = await transaction.get(shoutReference);
        final reactionSnapshot = await transaction.get(reference);
        final actorProfileSnapshot = commentAuthorId == uid
            ? null
            : await transaction.get(actorProfileReference);
        final notificationSettingsSnapshot = commentAuthorId == uid
            ? null
            : await transaction.get(notificationSettingsReference);
        final currentType = reactionSnapshot.data()?['type'] as String?;
        var likes = commentSnapshot.data()?['likesCount'] as int? ?? 0;
        var dislikes = commentSnapshot.data()?['dislikesCount'] as int? ?? 0;
        if (currentType == type) {
          if (currentType == 'like' && likes > 0) likes--;
          if (currentType == 'dislike' && dislikes > 0) dislikes--;
          transaction.delete(reference);
        } else {
          if (currentType == 'like' && likes > 0) likes--;
          if (currentType == 'dislike' && dislikes > 0) dislikes--;
          if (type == 'like') likes++;
          if (type == 'dislike') dislikes++;
          transaction.set(reference, {
            'type': type,
            'updatedAt': FieldValue.serverTimestamp(),
          });
        }
        transaction
          ..update(widget.comment.reference, {
            'likesCount': likes,
            'dislikesCount': dislikes,
          })
          ..set(
            rateReference,
            _nextRateLimitData(
              snapshot: rateSnapshot,
              eventId: eventId,
              window: _interactionRateWindow,
            ),
          );
        if (currentType != type &&
            commentAuthorId != uid &&
            actorProfileSnapshot?.exists == true &&
            (notificationSettingsSnapshot?.data()?['reactions'] as bool? ??
                true)) {
          transaction.set(notificationReference, {
            'kind': 'commentReaction',
            'actorId': uid,
            'actorNickname': actorProfileSnapshot!.data()!['nickname'],
            'targetShoutId': shoutReference.id,
            'targetTitle': shoutSnapshot.data()!['title'],
            'targetCommentId': widget.comment.id,
            'reactionType': type,
            'eventCount': FieldValue.increment(1),
            'createdAt': FieldValue.serverTimestamp(),
            'readAt': null,
          }, SetOptions(merge: true));
        }
      });
    } on FirebaseException {
      _showWriteFailure();
    }
  }

  Future<void> _deleteComment() async {
    try {
      await _deleteCommentWithCounter(widget.comment.reference);
    } on FirebaseException {
      _showWriteFailure();
    }
  }

  void _showWriteFailure() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          tr(context, 'Akci se nepodařilo dokončit. Zkus to znovu.'),
        ),
      ),
    );
  }

  Widget _commentText(BuildContext context, Map<String, dynamic> data) {
    final text = data['text'] as String;
    final replyToNickname = data['replyToNickname'] as String?;
    final replyToCommentId = data['replyToCommentId'] as String?;
    if (replyToNickname == null || replyToCommentId == null) {
      return Text(text);
    }
    final prefix = '@$replyToNickname';
    final remainingText = text.startsWith(prefix)
        ? text.substring(prefix.length).trimLeft()
        : text;
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        InkWell(
          onTap: () => widget.onJumpToReply(replyToCommentId),
          borderRadius: BorderRadius.circular(4),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 1),
            child: Text(
              prefix,
              style: TextStyle(
                color: Theme.of(context).colorScheme.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        if (remainingText.isNotEmpty) Text(' $remainingText'),
      ],
    );
  }
}
