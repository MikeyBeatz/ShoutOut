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
  final Future<void> Function(bool like) onReaction;

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
  final Future<void> Function(bool like) onReaction;
  final bool showSaveCount;
  final bool showDeleteButton;
  final Future<void> Function()? onDelete;
  final bool openOnTap;
  final VoidCallback? onPrivateReply;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
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

    final highlighted = shout.businessHighlighted;
    return Card(
      color: highlighted
          ? theme.colorScheme.secondaryContainer.withValues(alpha: .55)
          : null,
      shape: highlighted
          ? RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(22),
              side: BorderSide(color: theme.colorScheme.secondary, width: 1.5),
            )
          : null,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: openOnTap ? openComments : null,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (highlighted) ...[
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.auto_awesome,
                      size: 16,
                      color: theme.colorScheme.primary,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      businessTr(context, 'Zvýrazněný Shout'),
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
              ],
              Row(
                children: [
                  Expanded(
                    child: PublicIdentityBuilder(
                      userId: shout.authorId,
                      fallbackNickname: shout.author,
                      fallbackAvatarStyle: shout.authorAvatarStyle,
                      builder: (context, identity) => InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: shout.authorId.isEmpty
                            ? null
                            : () => showPublicProfileSheet(
                                context,
                                userId: shout.authorId,
                                fallbackNickname: identity.nickname,
                                fallbackAvatarStyle: identity.avatarStyle,
                                onSave: (_) => onSave(),
                                onReaction: (_, {required like}) async =>
                                    onReaction(like),
                              ),
                        child: Row(
                          children: [
                            AvatarImage(
                              avatarId: identity.avatarStyle.avatarId,
                              style: identity.avatarStyle,
                              radius: 20,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    shout.displayedAuthor(identity.nickname),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  Text(
                                    '${shout.distanceLabel} · ${shout.createdDateLabel(context)} · ${shout.expiryLabel(context)}',
                                    style: theme.textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
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
                              onPressed: () => unawaited(onReaction(true)),
                            ),
                            const SizedBox(width: 4),
                            ReactionButton(
                              icon: Icons.thumb_down_outlined,
                              value: shout.dislikes,
                              selected: shout.isDisliked,
                              onPressed: () => unawaited(onReaction(false)),
                            ),
                            const SizedBox(width: 8),
                            ReactionButton(
                              icon: Icons.chat_bubble_outline,
                              value: shout.comments,
                              onPressed: openComments,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (onPrivateReply != null)
                    IconButton(
                      onPressed: onPrivateReply,
                      tooltip: tr(context, 'Soukromě odpovědět'),
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

class BusinessSpotlightCard extends StatelessWidget {
  const BusinessSpotlightCard({
    super.key,
    required this.shout,
    required this.onSave,
    required this.onReaction,
  });

  final Shout shout;
  final VoidCallback onSave;
  final Future<void> Function(bool like) onReaction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    void openDetail() => Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ShoutDetailPage(
          shout: shout,
          onSave: onSave,
          onReaction: onReaction,
        ),
      ),
    );

    return Card(
      clipBehavior: Clip.antiAlias,
      color: theme.colorScheme.secondaryContainer.withValues(alpha: .7),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: BorderSide(color: theme.colorScheme.secondary, width: 1.5),
      ),
      child: InkWell(
        onTap: openDetail,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: PublicIdentityBuilder(
            userId: shout.authorId,
            fallbackNickname: shout.author,
            fallbackAvatarStyle: shout.authorAvatarStyle,
            builder: (context, identity) => Row(
              children: [
                AvatarImage(
                  avatarId: identity.avatarStyle.avatarId,
                  style: identity.avatarStyle,
                  radius: 25,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        businessTr(context, 'Propagováno'),
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        shout.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        businessTr(
                          context,
                          'Vzdálenost od podniku: {distance}',
                        ).replaceFirst('{distance}', shout.distanceLabel),
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(Icons.chevron_right, color: theme.colorScheme.primary),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class BusinessSpotlightCarousel extends StatefulWidget {
  const BusinessSpotlightCarousel({
    super.key,
    required this.shouts,
    required this.onSave,
    required this.onReaction,
  });

  final List<Shout> shouts;
  final ValueChanged<Shout> onSave;
  final Future<void> Function(Shout shout, {required bool like}) onReaction;

  @override
  State<BusinessSpotlightCarousel> createState() =>
      _BusinessSpotlightCarouselState();
}

class _BusinessSpotlightCarouselState extends State<BusinessSpotlightCarousel> {
  static const _rotationInterval = Duration(seconds: 6);
  late final PageController _controller;
  late final int _shuffleSeed;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _shuffleSeed = DateTime.now().microsecondsSinceEpoch;
    _controller = PageController(
      initialPage: widget.shouts.length > 1 ? 1000 : 0,
    );
    _restartTimer();
  }

  @override
  void didUpdateWidget(covariant BusinessSpotlightCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.shouts.length != widget.shouts.length) _restartTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _restartTimer() {
    _timer?.cancel();
    if (widget.shouts.length < 2) return;
    _timer = Timer.periodic(_rotationInterval, (_) {
      if (!mounted || !_controller.hasClients) return;
      _controller.nextPage(
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeInOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) => PageView.builder(
    controller: _controller,
    onPageChanged: (_) => _restartTimer(),
    itemBuilder: (context, index) {
      final length = widget.shouts.length;
      final cycle = index ~/ length;
      final position = index % length;
      final shout = shuffledPromotionCycle(
        widget.shouts,
        cycle,
        _shuffleSeed,
      )[position];
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
        child: BusinessSpotlightCard(
          shout: shout,
          onSave: () => widget.onSave(shout),
          onReaction: (like) => widget.onReaction(shout, like: like),
        ),
      );
    },
  );
}

class SpotlightHeaderDelegate extends SliverPersistentHeaderDelegate {
  const SpotlightHeaderDelegate({required this.child});

  final Widget child;

  @override
  double get minExtent => 140;

  @override
  double get maxExtent => 140;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return Material(
      color: Theme.of(context).scaffoldBackgroundColor,
      elevation: overlapsContent ? 3 : 0,
      child: child,
    );
  }

  @override
  bool shouldRebuild(covariant SpotlightHeaderDelegate oldDelegate) =>
      oldDelegate.child != child;
}
