part of '../main.dart';

class SavedPage extends StatelessWidget {
  const SavedPage({
    super.key,
    required this.shouts,
    required this.onSave,
    required this.onReaction,
  });

  final List<Shout> shouts;
  final ValueChanged<Shout> onSave;
  final void Function(Shout shout, {required bool like}) onReaction;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      TealSectionHeader(
        title: tr(context, 'Uložené shouty'),
        icon: Icons.bookmark_rounded,
      ),
      Expanded(
        child: ShoutListPage(
          title: null,
          emptyText: tr(context, 'Zatím nemáš uložené žádné shouty.'),
          emptyIcon: Icons.bookmark_border,
          shouts: shouts,
          onSave: onSave,
          onReaction: onReaction,
        ),
      ),
    ],
  );
}

class MyShoutsPage extends StatefulWidget {
  const MyShoutsPage({
    super.key,
    required this.shouts,
    required this.onSave,
    required this.onReaction,
    required this.onDelete,
  });

  final List<Shout> shouts;
  final ValueChanged<Shout> onSave;
  final void Function(Shout shout, {required bool like}) onReaction;
  final Future<void> Function(Shout shout) onDelete;

  @override
  State<MyShoutsPage> createState() => _MyShoutsPageState();
}

class _MyShoutsPageState extends State<MyShoutsPage> {
  _MyShoutsSection _section = _MyShoutsSection.active;

  @override
  Widget build(BuildContext context) {
    final activeShouts = widget.shouts
        .where((shout) => shout.effectiveStatus == ShoutStatus.active)
        .toList();
    final expiredShouts = widget.shouts
        .where((shout) => shout.isRetainedExpired)
        .toList();
    return Column(
      children: [
        TealSectionHeader(
          title: tr(context, 'Mé shouty'),
          icon: Icons.campaign_rounded,
          controls: SegmentedButton<_MyShoutsSection>(
            expandedInsets: EdgeInsets.zero,
            style: ButtonStyle(
              foregroundColor: WidgetStateProperty.resolveWith(
                (states) => states.contains(WidgetState.selected)
                    ? _shoutPrimaryDark
                    : Colors.white,
              ),
              backgroundColor: WidgetStateProperty.resolveWith(
                (states) => states.contains(WidgetState.selected)
                    ? Colors.white
                    : Colors.white.withValues(alpha: .08),
              ),
              side: const WidgetStatePropertyAll(
                BorderSide(color: Color(0x99FFFFFF)),
              ),
            ),
            segments: [
              ButtonSegment(
                value: _MyShoutsSection.active,
                label: Text(tr(context, 'Aktivní')),
              ),
              ButtonSegment(
                value: _MyShoutsSection.expired,
                label: Text(tr(context, 'Expirované')),
              ),
              ButtonSegment(
                value: _MyShoutsSection.comments,
                label: Text(tr(context, 'Komentáře')),
              ),
            ],
            selected: {_section},
            onSelectionChanged: (values) =>
                setState(() => _section = values.first),
          ),
        ),
        Expanded(
          child: switch (_section) {
            _MyShoutsSection.comments => MyCommentsPage(
              onSave: widget.onSave,
              onReaction: widget.onReaction,
              showTitle: false,
            ),
            _ => ShoutListPage(
              title: null,
              emptyText: tr(context, 'V této části zatím nemáš žádné shouty.'),
              emptyIcon: Icons.campaign_outlined,
              shouts: _section == _MyShoutsSection.active
                  ? activeShouts
                  : expiredShouts,
              onSave: widget.onSave,
              onReaction: widget.onReaction,
              showSaveCount: true,
              showDeleteButton: true,
              onDelete: widget.onDelete,
            ),
          },
        ),
      ],
    );
  }
}

enum _MyShoutsSection { active, expired, comments }

class MyCommentsPage extends StatelessWidget {
  const MyCommentsPage({
    super.key,
    required this.onSave,
    required this.onReaction,
    this.showTitle = true,
  });

  final ValueChanged<Shout> onSave;
  final void Function(Shout shout, {required bool like}) onReaction;
  final bool showTitle;

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collectionGroup('comments')
          .where('authorId', isEqualTo: uid)
          .snapshots(),
      builder: (context, snapshot) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (showTitle)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                child: Text(
                  tr(context, 'Komentáře'),
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            Expanded(
              child: snapshot.hasError
                  ? EmptyState(
                      icon: Icons.comment_outlined,
                      title: tr(
                        context,
                        'Komentáře se nepodařilo načíst. Zkus to prosím znovu.',
                      ),
                    )
                  : !snapshot.hasData
                  ? const Center(child: CircularProgressIndicator())
                  : FutureBuilder<List<_CommentWithShout>>(
                      future: _loadComments(snapshot.data!.docs),
                      builder: (context, commentsSnapshot) {
                        if (commentsSnapshot.hasError) {
                          return EmptyState(
                            icon: Icons.comment_outlined,
                            title: tr(
                              context,
                              'Komentáře se nepodařilo načíst. Zkus to prosím znovu.',
                            ),
                          );
                        }
                        if (!commentsSnapshot.hasData) {
                          return const Center(
                            child: CircularProgressIndicator(),
                          );
                        }
                        final comments = commentsSnapshot.data!;
                        if (comments.isEmpty) {
                          return EmptyState(
                            icon: Icons.comment_outlined,
                            title: tr(
                              context,
                              'Zatím jsi nenapsal/a žádný komentář.',
                            ),
                          );
                        }
                        return ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                          itemCount: comments.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(height: 10),
                          itemBuilder: (context, index) {
                            final item = comments[index];
                            return Card(
                              child: ListTile(
                                leading: const Icon(Icons.comment_outlined),
                                title: Text(
                                  item.shout.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                subtitle: Text(
                                  item.comment.data()['text'] as String,
                                ),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => ShoutDetailPage(
                                      shout: item.shout,
                                      onSave: () => onSave(item.shout),
                                      onReaction: (like) =>
                                          onReaction(item.shout, like: like),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }

  Future<List<_CommentWithShout>> _loadComments(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> comments,
  ) async {
    final items = await Future.wait(
      comments.map((comment) async {
        final shoutDocument = await comment.reference.parent.parent!.get();
        if (!shoutDocument.exists) return null;
        final shout = Shout.fromDocument(shoutDocument);
        if (shout.effectiveStatus == ShoutStatus.deleted ||
            shout.isExpiredBeyondRetention) {
          return null;
        }
        return _CommentWithShout(comment: comment, shout: shout);
      }),
    );
    final visibleItems = items.whereType<_CommentWithShout>().toList()
      ..sort((a, b) {
        final aTime = a.comment.data()['createdAt'] as Timestamp?;
        final bTime = b.comment.data()['createdAt'] as Timestamp?;
        return (bTime?.millisecondsSinceEpoch ?? 0).compareTo(
          aTime?.millisecondsSinceEpoch ?? 0,
        );
      });
    return visibleItems;
  }
}

class _CommentWithShout {
  const _CommentWithShout({required this.comment, required this.shout});

  final QueryDocumentSnapshot<Map<String, dynamic>> comment;
  final Shout shout;
}

class ShoutListPage extends StatelessWidget {
  const ShoutListPage({
    super.key,
    this.title,
    required this.emptyText,
    required this.emptyIcon,
    required this.shouts,
    required this.onSave,
    required this.onReaction,
    this.showSaveCount = false,
    this.showDeleteButton = false,
    this.onDelete,
  });

  final String? title;
  final String emptyText;
  final IconData emptyIcon;
  final List<Shout> shouts;
  final ValueChanged<Shout> onSave;
  final void Function(Shout shout, {required bool like}) onReaction;
  final bool showSaveCount;
  final bool showDeleteButton;
  final Future<void> Function(Shout shout)? onDelete;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      if (title != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
          child: Text(
            title!,
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
      Expanded(
        child: shouts.isEmpty
            ? EmptyState(icon: emptyIcon, title: emptyText)
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                itemCount: shouts.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (context, index) => ShoutCard(
                  shout: shouts[index],
                  onSave: () => onSave(shouts[index]),
                  onReaction: (like) => onReaction(shouts[index], like: like),
                  showSaveCount: showSaveCount,
                  showDeleteButton: showDeleteButton,
                  onDelete: onDelete == null
                      ? null
                      : () => onDelete!(shouts[index]),
                ),
              ),
      ),
    ],
  );
}
