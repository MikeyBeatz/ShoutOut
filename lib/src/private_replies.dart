part of '../main.dart';

class PrivateReplyList extends StatelessWidget {
  const PrivateReplyList({
    super.key,
    required this.shoutId,
    required this.onReply,
    required this.onReport,
    required this.onJumpToComment,
  });

  final String shoutId;
  final void Function({
    required String recipientId,
    required String recipientNickname,
    required String targetType,
    String? parentCommentId,
  })
  onReply;
  final Future<void> Function(QueryDocumentSnapshot<Map<String, dynamic>> reply)
  onReport;
  final ValueChanged<String> onJumpToComment;

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    final replies = FirebaseFirestore.instance
        .collection('shouts')
        .doc(shoutId)
        .collection('privateReplies');
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: replies.where('authorId', isEqualTo: uid).snapshots(),
      builder: (context, authoredSnapshot) =>
          StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: replies.where('recipientId', isEqualTo: uid).snapshots(),
            builder: (context, receivedSnapshot) {
              final replyById =
                  <String, QueryDocumentSnapshot<Map<String, dynamic>>>{
                    for (final reply in authoredSnapshot.data?.docs ?? [])
                      reply.id: reply,
                    for (final reply in receivedSnapshot.data?.docs ?? [])
                      reply.id: reply,
                  };
              final privateReplies = replyById.values.toList();
              privateReplies.sort((a, b) {
                final aTime = a.data()['createdAt'] as Timestamp?;
                final bTime = b.data()['createdAt'] as Timestamp?;
                return (aTime?.millisecondsSinceEpoch ?? 0).compareTo(
                  bTime?.millisecondsSinceEpoch ?? 0,
                );
              });
              return Column(
                children: privateReplies
                    .map(
                      (reply) => PrivateReplyTile(
                        reply: reply,
                        onReply: () {
                          final data = reply.data();
                          if (data['authorId'] == uid) return;
                          onReply(
                            recipientId: data['authorId'] as String,
                            recipientNickname: data['authorNickname'] as String,
                            targetType: 'privateReply',
                            parentCommentId: data['parentCommentId'] as String?,
                          );
                        },
                        onReport: () => onReport(reply),
                        onJumpToComment: onJumpToComment,
                      ),
                    )
                    .toList(),
              );
            },
          ),
    );
  }
}

class PrivateReplyTile extends StatelessWidget {
  const PrivateReplyTile({
    super.key,
    required this.reply,
    required this.onReply,
    required this.onReport,
    required this.onJumpToComment,
  });

  final QueryDocumentSnapshot<Map<String, dynamic>> reply;
  final VoidCallback onReply;
  final VoidCallback onReport;
  final ValueChanged<String> onJumpToComment;

  @override
  Widget build(BuildContext context) {
    final data = reply.data();
    final uid = FirebaseAuth.instance.currentUser!.uid;
    final own = data['authorId'] == uid;
    final recipient = data['recipientId'] == uid;
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
      decoration: BoxDecoration(
        color: _shoutAccentLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFCDE7E7)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.lock_outline, color: _shoutPrimary, size: 16),
              const SizedBox(width: 6),
              Text(
                tr(context, 'Soukromá odpověď'),
                style: const TextStyle(
                  color: _shoutPrimary,
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
              const Spacer(),
              if (own)
                IconButton(
                  tooltip: tr(context, 'Smazat'),
                  visualDensity: VisualDensity.compact,
                  onPressed: () => reply.reference.delete(),
                  icon: const Icon(Icons.delete_outline, size: 19),
                ),
            ],
          ),
          _privateReplyText(context, data),
          if (!own || recipient)
            Wrap(
              spacing: 8,
              children: [
                if (!own)
                  TextButton.icon(
                    onPressed: onReply,
                    icon: const Icon(Icons.lock_outline, size: 17),
                    label: Text(tr(context, 'Odpovědět soukromě')),
                  ),
                if (recipient)
                  TextButton.icon(
                    onPressed: onReport,
                    icon: const Icon(Icons.flag_outlined, size: 17),
                    label: Text(tr(context, 'Nahlásit')),
                  ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _privateReplyText(BuildContext context, Map<String, dynamic> data) {
    final text = data['text'] as String;
    final nickname = data['recipientNickname'] as String?;
    final parentCommentId = data['parentCommentId'] as String?;
    if (data['targetType'] == 'shout' ||
        nickname == null ||
        parentCommentId == null) {
      return Text(text, style: const TextStyle(color: _shoutText));
    }
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        InkWell(
          onTap: () => onJumpToComment(parentCommentId),
          borderRadius: BorderRadius.circular(4),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 1),
            child: Text(
              '@$nickname',
              style: const TextStyle(
                color: _shoutPrimary,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
        if (text.isNotEmpty) Text(' $text'),
      ],
    );
  }
}
