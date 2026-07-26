part of '../main.dart';

class RatedShoutCard extends StatefulWidget {
  const RatedShoutCard({
    super.key,
    required this.shout,
    required this.onSave,
    required this.onReaction,
  });

  final Shout shout;
  final VoidCallback onSave;
  final ValueChanged<bool> onReaction;

  @override
  State<RatedShoutCard> createState() => _RatedShoutCardState();
}

class _RatedShoutCardState extends State<RatedShoutCard> {
  bool _revealed = false;

  @override
  Widget build(BuildContext context) {
    final isAuthor =
        widget.shout.authorId == FirebaseAuth.instance.currentUser?.uid;
    if (widget.shout.isHiddenByRating && !isAuthor && !_revealed) {
      return Card(
        child: ListTile(
          leading: const Icon(Icons.visibility_off_outlined),
          title: Text(tr(context, 'Shout s nízkým hodnocením')),
          subtitle: Text(
            tr(
              context,
              'Tento Shout byl sbalen kvůli výrazně negativnímu hodnocení.',
            ),
          ),
          trailing: TextButton(
            onPressed: () => setState(() => _revealed = true),
            child: Text(tr(context, 'Zobrazit')),
          ),
        ),
      );
    }
    return ShoutCard(
      shout: widget.shout,
      onSave: widget.onSave,
      onReaction: widget.onReaction,
    );
  }
}

class ShoutCard extends StatelessWidget {
  const ShoutCard({
    super.key,
    required this.shout,
    required this.onSave,
    required this.onReaction,
    this.showSaveCount = false,
    this.showDeleteButton = false,
    this.onDelete,
    this.openOnTap = true,
    this.onPrivateReply,
  });

  final Shout shout;
  final VoidCallback onSave;
  final ValueChanged<bool> onReaction;
  final bool showSaveCount;
  final bool showDeleteButton;
  final Future<void> Function()? onDelete;
  final bool openOnTap;
  final VoidCallback? onPrivateReply;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    void openComments() {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ShoutDetailPage(
            shout: shout,
            onSave: onSave,
            onReaction: onReaction,
          ),
        ),
      );
    }

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: openOnTap ? openComments : null,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    backgroundColor: accent.withValues(alpha: .14),
                    child: Icon(Icons.person_outline, color: accent),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          shout.author,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          '${shout.distanceLabel} · ${shout.ageLabel} · ${shout.expiryLabel(context)}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: onSave,
                    tooltip: shout.isSaved
                        ? tr(context, 'Odebrat z uložených')
                        : tr(context, 'Uložit shout'),
                    icon: Icon(
                      shout.isSaved ? Icons.bookmark : Icons.bookmark_outline,
                    ),
                  ),
                  if (showDeleteButton)
                    IconButton(
                      onPressed: () async {
                        final confirmed = await showDialog<bool>(
                          context: context,
                          builder: (context) => AlertDialog(
                            title: Text(tr(context, 'Smazat shout?')),
                            content: Text(
                              tr(context, 'Shout zmizí z veřejného feedu.'),
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(context, false),
                                child: Text(tr(context, 'Zrušit')),
                              ),
                              FilledButton(
                                onPressed: () => Navigator.pop(context, true),
                                child: Text(tr(context, 'Smazat')),
                              ),
                            ],
                          ),
                        );
                        if (confirmed == true) await onDelete?.call();
                      },
                      tooltip: tr(context, 'Smazat shout'),
                      icon: const Icon(Icons.delete_outline),
                    ),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                shout.title,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              Text(shout.text, style: theme.textTheme.bodyLarge),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: shout.categories
                    .map(
                      (category) => Chip(
                        label: Text(tr(context, category)),
                        visualDensity: VisualDensity.compact,
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            ReactionButton(
                              icon: Icons.thumb_up_outlined,
                              value: shout.likes,
                              selected: shout.isLiked,
                              onPressed: () => onReaction(true),
                            ),
                            const SizedBox(width: 4),
                            ReactionButton(
                              icon: Icons.thumb_down_outlined,
                              value: shout.dislikes,
                              selected: shout.isDisliked,
                              onPressed: () => onReaction(false),
                            ),
                            const SizedBox(width: 8),
                            StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                              stream: FirebaseFirestore.instance
                                  .collection('shouts')
                                  .doc(shout.id)
                                  .collection('comments')
                                  .snapshots(),
                              builder: (context, snapshot) => ReactionButton(
                                icon: Icons.chat_bubble_outline,
                                value:
                                    snapshot.data?.docs.length ??
                                    shout.comments,
                                onPressed: openComments,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (onPrivateReply != null)
                    IconButton(
                      onPressed: onPrivateReply,
                      tooltip: tr(context, 'SoukromÄ› odpovÄ›dÄ›t'),
                      icon: const Icon(Icons.lock_outline, size: 18),
                      visualDensity: VisualDensity.compact,
                    ),
                  if (showSaveCount)
                    Text(
                      '${shout.saves} ${tr(context, 'Uložené')}',
                      style: theme.textTheme.bodySmall,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
