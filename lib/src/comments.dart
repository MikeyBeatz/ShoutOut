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
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: reactions.snapshots(),
      builder: (context, snapshot) {
        final reactionDocs = snapshot.data?.docs ?? [];
        final likes = reactionDocs
            .where((doc) => doc.data()['type'] == 'like')
            .length;
        final dislikes = reactionDocs
            .where((doc) => doc.data()['type'] == 'dislike')
            .length;
        String? ownType;
        for (final doc in reactionDocs) {
          if (doc.id == FirebaseAuth.instance.currentUser?.uid) {
            ownType = doc.data()['type'] as String?;
            break;
          }
        }
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
                    const CircleAvatar(
                      radius: 16,
                      child: Icon(Icons.person_outline),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 6,
                        children: [
                          Text(
                            data['authorNickname'] as String,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          if (data['authorId'] == widget.shoutAuthorId)
                            Chip(
                              label: Text(tr(context, 'Autor')),
                              visualDensity: VisualDensity.compact,
                            ),
                        ],
                      ),
                    ),
                    if (ownComment)
                      IconButton(
                        tooltip: tr(context, 'Smazat komentář'),
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => widget.comment.reference.delete(),
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
                          IconButton(
                            tooltip: tr(context, 'Nahlásit'),
                            visualDensity: VisualDensity.compact,
                            onPressed: widget.onReport,
                            icon: const Icon(Icons.flag_outlined, size: 20),
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
    final reference = widget.comment.reference.collection('reactions').doc(uid);
    final current = await reference.get();
    if (current.data()?['type'] == type) {
      await reference.delete();
    } else {
      await reference.set({
        'type': type,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }
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
