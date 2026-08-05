part of '../main.dart';

class ShoutDetailPage extends StatefulWidget {
  const ShoutDetailPage({
    super.key,
    required this.shout,
    required this.onSave,
    required this.onReaction,
    this.focusCommentId,
    this.focusCommentCreatedAt,
  });

  final Shout shout;
  final VoidCallback onSave;
  final ValueChanged<bool> onReaction;
  final String? focusCommentId;
  final Timestamp? focusCommentCreatedAt;

  @override
  State<ShoutDetailPage> createState() => _ShoutDetailPageState();
}

class _ShoutDetailPageState extends State<ShoutDetailPage> {
  final _commentController = TextEditingController();
  final _commentFocusNode = FocusNode();
  final _commentsScrollController = ScrollController();
  final Map<String, GlobalKey<_CommentTileState>> _commentKeys = {};
  List<String> _commentIds = const [];
  String? _replyToCommentId;
  String? _replyToNickname;
  String? _privateRecipientId;
  String? _privateRecipientNickname;
  String? _privateTargetType;
  bool _initialFocusScheduled = false;

  @override
  void dispose() {
    _commentController.dispose();
    _commentFocusNode.dispose();
    _commentsScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    resizeToAvoidBottomInset: true,
    appBar: AppBar(
      title: Text(tr(context, 'Shout')),
      actions: [
        if (widget.shout.authorId != FirebaseAuth.instance.currentUser?.uid)
          StreamBuilder<AccountRole>(
            stream: _watchAccountRole(FirebaseAuth.instance.currentUser!.uid),
            builder: (context, snapshot) {
              final role = snapshot.data ?? AccountRole.user;
              if (!role.isAtLeast(AccountRole.moderator)) {
                return const SizedBox.shrink();
              }
              return IconButton(
                onPressed: () => _showDirectModerationDialog(
                  context,
                  role: role,
                  userId: widget.shout.authorId,
                  sourceContentType: 'shout',
                  sourceContentId: widget.shout.id,
                  contentSnapshot: {
                    'authorId': widget.shout.authorId,
                    'authorNickname': widget.shout.author,
                    'title': widget.shout.title,
                    'text': widget.shout.text,
                    'categories': widget.shout.categories,
                    'createdAt': Timestamp.fromDate(widget.shout.createdAt),
                    'geography': {
                      'countryCode': widget.shout.geography.countryCode,
                      'subdivisionCode': widget.shout.geography.subdivisionCode,
                      'localityName': widget.shout.geography.localityName,
                    },
                  },
                ),
                tooltip: 'Moderovat',
                icon: const Icon(Icons.security_outlined),
              );
            },
          ),
        if (widget.shout.authorId != FirebaseAuth.instance.currentUser?.uid)
          IconButton(
            onPressed: _blockAuthor,
            tooltip: tr(context, 'Blokovat autora'),
            icon: const Icon(Icons.person_off_outlined),
          ),
        if (widget.shout.authorId == FirebaseAuth.instance.currentUser?.uid)
          IconButton(
            onPressed: _deleteShout,
            tooltip: tr(context, 'Smazat shout'),
            icon: const Icon(Icons.delete_outline),
          ),
        if (widget.shout.authorId != FirebaseAuth.instance.currentUser?.uid)
          IconButton(
            onPressed: _reportShout,
            tooltip: tr(context, 'Nahlásit'),
            icon: const Icon(Icons.flag_outlined),
          ),
      ],
    ),
    body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _commentsQuery().snapshots(),
      builder: (context, snapshot) {
        final comments = snapshot.data?.docs ?? [];
        _commentIds = comments.map((comment) => comment.id).toList();
        if (!_initialFocusScheduled &&
            widget.focusCommentId != null &&
            comments.any((comment) => comment.id == widget.focusCommentId)) {
          _initialFocusScheduled = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _jumpToComment(widget.focusCommentId!);
          });
        }
        return ListView(
          controller: _commentsScrollController,
          padding: const EdgeInsets.all(16),
          children: [
            ShoutCard(
              shout: widget.shout,
              onSave: () {
                widget.onSave();
                setState(() {});
              },
              onReaction: (like) {
                widget.onReaction(like);
                setState(() {});
              },
              openOnTap: false,
              onPrivateReply:
                  widget.shout.authorId !=
                      FirebaseAuth.instance.currentUser?.uid
                  ? () => _replyPrivately(
                      recipientId: widget.shout.authorId,
                      recipientNickname: widget.shout.author,
                      targetType: 'shout',
                    )
                  : null,
            ),
            const SizedBox(height: 16),
            Text(
              '${tr(context, 'Komentáře')} (${comments.length})',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            ...comments.map((comment) {
              return CommentTile(
                key: _commentKey(comment.id),
                comment: comment,
                shoutAuthorId: widget.shout.authorId,
                onReply: _replyTo,
                onPrivateReply: (recipientId, nickname, commentId) =>
                    _replyPrivately(
                      recipientId: recipientId,
                      recipientNickname: nickname,
                      targetType: 'comment',
                      parentCommentId: commentId,
                    ),
                onReport: () => _reportComment(comment),
                onJumpToReply: _jumpToComment,
              );
            }),
            PrivateReplyList(
              shoutId: widget.shout.id,
              onReply: _replyPrivately,
              onReport: _reportPrivateReply,
              onJumpToComment: _jumpToComment,
            ),
          ],
        );
      },
    ),
    bottomNavigationBar: Builder(
      builder: (context) => AnimatedPadding(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_privateRecipientNickname != null ||
                    _replyToNickname != null)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: InputChip(
                      label: Text(
                        _privateRecipientNickname != null
                            ? '${tr(context, 'Soukromá odpověď')} · @$_privateRecipientNickname'
                            : '${tr(context, 'Odpovídáš')} @$_replyToNickname',
                      ),
                      onDeleted: () => setState(() {
                        _replyToCommentId = null;
                        _replyToNickname = null;
                        _privateRecipientId = null;
                        _privateRecipientNickname = null;
                        _privateTargetType = null;
                        _commentController.clear();
                      }),
                    ),
                  ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _commentController,
                        focusNode: _commentFocusNode,
                        keyboardType: TextInputType.text,
                        textInputAction: TextInputAction.send,
                        onTap: _openCommentKeyboard,
                        onSubmitted: (_) => _sendComment(),
                        maxLines: 1,
                        maxLength: 220,
                        decoration: InputDecoration(
                          hintText: _privateRecipientId == null
                              ? tr(context, 'Napiš veřejný komentář')
                              : tr(context, 'Napiš soukromou odpověď'),
                          border: const OutlineInputBorder(),
                          counterText: '',
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );

  Query<Map<String, dynamic>> _commentsQuery() {
    Query<Map<String, dynamic>> query = FirebaseFirestore.instance
        .collection('shouts')
        .doc(widget.shout.id)
        .collection('comments')
        .orderBy('createdAt');
    final focusedAt = widget.focusCommentCreatedAt;
    if (focusedAt != null) {
      return query.startAt([focusedAt]).limit(_commentPageSize);
    }
    return query.limitToLast(_commentPageSize);
  }

  GlobalKey<_CommentTileState> _commentKey(String commentId) =>
      _commentKeys.putIfAbsent(commentId, GlobalKey<_CommentTileState>.new);

  void _replyTo(String commentId, String nickname) {
    setState(() {
      _replyToCommentId = commentId;
      _replyToNickname = nickname;
    });
    _commentController
      ..text = '@$nickname '
      ..selection = TextSelection.collapsed(offset: nickname.length + 2);
    FocusScope.of(context).requestFocus(_commentFocusNode);
  }

  void _replyPrivately({
    required String recipientId,
    required String recipientNickname,
    required String targetType,
    String? parentCommentId,
  }) {
    setState(() {
      _privateRecipientId = recipientId;
      _privateRecipientNickname = recipientNickname;
      _privateTargetType = targetType;
      _replyToCommentId = parentCommentId;
      _replyToNickname = null;
      _commentController.clear();
    });
    FocusScope.of(context).requestFocus(_commentFocusNode);
  }

  void _openCommentKeyboard() {
    FocusScope.of(context).requestFocus(_commentFocusNode);
    Future<void>.delayed(const Duration(milliseconds: 80), () {
      if (mounted && _commentFocusNode.hasFocus) {
        SystemChannels.textInput.invokeMethod<void>('TextInput.show');
      }
    });
  }

  Future<void> _jumpToComment(String commentId) async {
    final visibleTarget = _commentKeys[commentId]?.currentContext;
    if (visibleTarget != null) {
      await Scrollable.ensureVisible(
        visibleTarget,
        duration: const Duration(milliseconds: 350),
        curve: Curves.easeInOut,
        alignment: .25,
      );
      if (mounted) {
        _commentKeys[commentId]?.currentState?.highlight();
      }
      return;
    }

    if (_commentsScrollController.hasClients) {
      final commentIndex = _commentIds.indexOf(commentId);
      if (commentIndex >= 0) {
        // The target may be outside ListView's currently built area. Move to
        // its estimated position first; then ensureVisible provides the exact
        // final placement once its widget exists.
        final estimate = 360.0 + (commentIndex * 190.0);
        final maxExtent = _commentsScrollController.position.maxScrollExtent;
        await _commentsScrollController.animateTo(
          estimate.clamp(0.0, maxExtent),
          duration: const Duration(milliseconds: 360),
          curve: Curves.easeInOut,
        );
        if (!mounted) return;
        await Future<void>.delayed(const Duration(milliseconds: 80));
        if (!mounted) return;
      }
    }

    if (!mounted) return;
    final target = _commentKeys[commentId]?.currentContext;
    if (target == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(tr(context, 'Odkazovaný komentář už není dostupný.')),
        ),
      );
      return;
    }
    if (!target.mounted) return;
    await Scrollable.ensureVisible(
      target,
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeInOut,
      alignment: .25,
    );
    _commentKeys[commentId]?.currentState?.highlight();
  }

  Future<void> _sendComment() async {
    final comment = _commentController.text.trim();
    if (comment.isEmpty) return;
    final user = FirebaseAuth.instance.currentUser!;
    final firestore = FirebaseFirestore.instance;
    final profileRef = firestore.collection('users').doc(user.uid);
    final shoutRef = firestore.collection('shouts').doc(widget.shout.id);
    try {
      if (_privateRecipientId != null) {
        final recipientId = _privateRecipientId!;
        final recipientNickname = _privateRecipientNickname!;
        final targetType = _privateTargetType!;
        final replyRef = shoutRef.collection('privateReplies').doc();
        final rateRef = _rateLimitReference('privateReply');
        await firestore.runTransaction((transaction) async {
          final profile = await transaction.get(profileRef);
          final rateSnapshot = await transaction.get(rateRef);
          await transaction.get(shoutRef);
          final authorNickname = profile.data()!['nickname'] as String;
          transaction
            ..set(replyRef, {
              'authorId': user.uid,
              'authorNickname': authorNickname,
              'recipientId': recipientId,
              'recipientNickname': recipientNickname,
              'participants': [user.uid, recipientId],
              'text': comment,
              'createdAt': FieldValue.serverTimestamp(),
              'targetType': targetType,
              if (_replyToCommentId != null)
                'parentCommentId': _replyToCommentId,
            })
            ..set(
              rateRef,
              _nextRateLimitData(
                snapshot: rateSnapshot,
                eventId: replyRef.id,
                window: _privateReplyRateWindow,
              ),
            );
        });
      } else {
        final commentRef = shoutRef.collection('comments').doc();
        final rateRef = _rateLimitReference('comment');
        await firestore.runTransaction((transaction) async {
          final profile = await transaction.get(profileRef);
          final rateSnapshot = await transaction.get(rateRef);
          final shoutSnapshot = await transaction.get(shoutRef);
          final authorNickname = profile.data()!['nickname'] as String;
          final commentsCount =
              shoutSnapshot.data()?['commentsCount'] as int? ?? 0;
          transaction
            ..set(commentRef, {
              'authorId': user.uid,
              'authorNickname': authorNickname,
              'text': comment,
              'createdAt': FieldValue.serverTimestamp(),
              'likesCount': 0,
              'dislikesCount': 0,
              if (_replyToCommentId != null)
                'replyToCommentId': _replyToCommentId,
              if (_replyToNickname != null) 'replyToNickname': _replyToNickname,
            })
            ..update(shoutRef, {'commentsCount': commentsCount + 1})
            ..set(
              rateRef,
              _nextRateLimitData(
                snapshot: rateSnapshot,
                eventId: commentRef.id,
                window: _commentRateWindow,
              ),
            );
        });
        widget.shout.comments++;
      }
    } on FirebaseException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'Akci se nepodařilo dokončit. Zkus to znovu.'),
            ),
          ),
        );
      }
      return;
    }
    if (!mounted) return;
    setState(() {
      _commentController.clear();
      _replyToCommentId = null;
      _replyToNickname = null;
      _privateRecipientId = null;
      _privateRecipientNickname = null;
      _privateTargetType = null;
    });
  }

  Future<void> _deleteShout() async {
    await FirebaseFirestore.instance
        .collection('shouts')
        .doc(widget.shout.id)
        .update({'status': 'deleted'});
    widget.shout.status = ShoutStatus.deleted;
    if (mounted) Navigator.pop(context, true);
  }

  Future<void> _blockAuthor() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr(context, 'Blokovat autora?')),
        content: Text(
          tr(context, 'Jeho Shouty se přestanou zobrazovat ve tvém feedu.'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(tr(context, 'Zrušit')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(tr(context, 'Blokovat')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await FirebaseFirestore.instance
        .collection('users')
        .doc(FirebaseAuth.instance.currentUser!.uid)
        .collection('blocked')
        .doc(widget.shout.authorId)
        .set({'createdAt': FieldValue.serverTimestamp()});
    if (mounted) Navigator.pop(context, true);
  }

  Future<void> _reportShout() async {
    final reason = await _askReportReason('Nahlásit Shout');
    if (reason == null) return;
    final uid = FirebaseAuth.instance.currentUser!.uid;
    final reportId = '${uid}_${widget.shout.id}';
    if (!await _createReport('reports', reportId, {
      'reporterId': FirebaseAuth.instance.currentUser!.uid,
      'shoutId': widget.shout.id,
      'reason': reason,
      'status': 'open',
    })) {
      return;
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr(context, 'Hlášení bylo odesláno.'))),
      );
    }
  }

  Future<void> _reportComment(
    QueryDocumentSnapshot<Map<String, dynamic>> comment,
  ) async {
    final reason = await _askReportReason('Nahlásit komentář');
    if (reason == null) return;
    final uid = FirebaseAuth.instance.currentUser!.uid;
    final reportId = '${uid}_${widget.shout.id}_${comment.id}';
    if (!await _createReport('commentReports', reportId, {
      'reporterId': FirebaseAuth.instance.currentUser!.uid,
      'shoutId': widget.shout.id,
      'commentId': comment.id,
      'reason': reason,
      'status': 'open',
    })) {
      return;
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr(context, 'Hlášení bylo odesláno.'))),
      );
    }
  }

  Future<void> _reportPrivateReply(
    QueryDocumentSnapshot<Map<String, dynamic>> reply,
  ) async {
    final reason = await _askReportReason('Nahlásit soukromou odpověď');
    if (reason == null) return;
    final data = reply.data();
    final uid = FirebaseAuth.instance.currentUser!.uid;
    final reportId = '${uid}_${widget.shout.id}_${reply.id}';
    if (!await _createReport('privateReplyReports', reportId, {
      'reporterId': FirebaseAuth.instance.currentUser!.uid,
      'shoutId': widget.shout.id,
      'privateReplyId': reply.id,
      'authorId': data['authorId'],
      'text': data['text'],
      'reason': reason,
      'status': 'open',
      'priority': 'high',
    })) {
      return;
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr(context, 'Hlášení bylo odesláno.'))),
      );
    }
  }

  Future<bool> _createReport(
    String collection,
    String reportId,
    Map<String, Object?> data,
  ) async {
    final firestore = FirebaseFirestore.instance;
    final reportRef = firestore.collection(collection).doc(reportId);
    final rateRef = _rateLimitReference('report');
    try {
      await firestore.runTransaction((transaction) async {
        final rateSnapshot = await transaction.get(rateRef);
        transaction
          ..set(reportRef, {...data, 'createdAt': FieldValue.serverTimestamp()})
          ..set(
            rateRef,
            _nextRateLimitData(
              snapshot: rateSnapshot,
              eventId: reportId,
              window: _reportRateWindow,
            ),
          );
      });
      return true;
    } on FirebaseException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'Akci se nepodařilo dokončit. Zkus to znovu.'),
            ),
          ),
        );
      }
      return false;
    }
  }

  Future<String?> _askReportReason(String title) async {
    const reasons = [
      'Nelegální obsah nebo drogy',
      'Obtěžování, nenávist nebo vyhrožování',
      'Osobní údaje nebo soukromí',
      'Spam, podvod nebo manipulace',
      'Explicitní nebo nevhodný obsah',
      'Jiné',
    ];
    final detail = TextEditingController();
    var selected = reasons.first;
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(tr(context, title)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: selected,
                items: reasons
                    .map(
                      (reason) => DropdownMenuItem(
                        value: reason,
                        child: Text(tr(context, reason)),
                      ),
                    )
                    .toList(),
                onChanged: (value) => setDialogState(() => selected = value!),
                decoration: InputDecoration(
                  labelText: tr(context, 'Důvod hlášení'),
                ),
              ),
              TextField(
                controller: detail,
                maxLength: 400,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: tr(context, 'Volitelně doplň podrobnosti'),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(tr(context, 'Zrušit')),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(
                context,
                detail.text.trim().isEmpty
                    ? selected
                    : '$selected: ${detail.text.trim()}',
              ),
              child: Text(tr(context, 'Odeslat')),
            ),
          ],
        ),
      ),
    );
    detail.dispose();
    return result;
  }
}

// Comment and private-reply widgets are organized in their own part files.
