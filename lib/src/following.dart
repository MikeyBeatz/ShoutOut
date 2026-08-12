part of '../main.dart';

DocumentReference<Map<String, dynamic>> _followingReference(String targetId) {
  final uid = FirebaseAuth.instance.currentUser!.uid;
  return FirebaseFirestore.instance
      .collection('users')
      .doc(uid)
      .collection('following')
      .doc(targetId);
}

Future<void> _setFollowing(String targetId, bool follow) async {
  final reference = _followingReference(targetId);
  if (follow) {
    await reference.set({
      'targetUserId': targetId,
      'createdAt': FieldValue.serverTimestamp(),
    });
  } else {
    await reference.delete();
  }
}

Future<void> showPublicProfileSheet(
  BuildContext context, {
  required String userId,
  required String fallbackNickname,
  required AvatarStyle fallbackAvatarStyle,
  required ValueChanged<Shout> onSave,
  required Future<void> Function(Shout shout, {required bool like}) onReaction,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => FractionallySizedBox(
    heightFactor: .86,
    child: _PublicProfileSheet(
      userId: userId,
      fallbackNickname: fallbackNickname,
      fallbackAvatarStyle: fallbackAvatarStyle,
      onSave: onSave,
      onReaction: onReaction,
    ),
  ),
);

class _PublicProfileSheet extends StatefulWidget {
  const _PublicProfileSheet({
    required this.userId,
    required this.fallbackNickname,
    required this.fallbackAvatarStyle,
    required this.onSave,
    required this.onReaction,
  });

  final String userId;
  final String fallbackNickname;
  final AvatarStyle fallbackAvatarStyle;
  final ValueChanged<Shout> onSave;
  final Future<void> Function(Shout shout, {required bool like}) onReaction;

  @override
  State<_PublicProfileSheet> createState() => _PublicProfileSheetState();
}

class _PublicProfileSheetState extends State<_PublicProfileSheet> {
  late Stream<List<Shout>> _shoutsStream;

  @override
  void initState() {
    super.initState();
    _shoutsStream = _watchActiveProfileShouts(widget.userId);
  }

  @override
  void didUpdateWidget(covariant _PublicProfileSheet oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.userId != widget.userId) {
      _shoutsStream = _watchActiveProfileShouts(widget.userId);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ownProfile = widget.userId == FirebaseAuth.instance.currentUser?.uid;
    return PublicIdentityBuilder(
      userId: widget.userId,
      fallbackNickname: widget.fallbackNickname,
      fallbackAvatarStyle: widget.fallbackAvatarStyle,
      builder: (context, identity) => Column(
        children: [
          const SizedBox(height: 8),
          Container(
            width: 42,
            height: 4,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.outlineVariant,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 12, 12),
            child: Row(
              children: [
                AvatarImage(
                  avatarId: identity.avatarStyle.avatarId,
                  style: identity.avatarStyle,
                  radius: 32,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    identity.nickname,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                if (!ownProfile)
                  StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                    stream: _followingReference(widget.userId).snapshots(),
                    builder: (context, snapshot) {
                      final followed = snapshot.data?.exists == true;
                      return FilledButton.tonalIcon(
                        onPressed: () =>
                            _setFollowing(widget.userId, !followed),
                        icon: Icon(
                          followed ? Icons.check : Icons.person_add_outlined,
                        ),
                        label: Text(
                          tr(context, followed ? 'Sledováno' : 'Sledovat'),
                        ),
                      );
                    },
                  ),
                if (!ownProfile)
                  PopupMenuButton<String>(
                    onSelected: (action) async {
                      if (action == 'block') {
                        await _blockProfile(context, widget.userId);
                      } else {
                        await _reportProfile(context, widget.userId);
                      }
                    },
                    itemBuilder: (context) => [
                      PopupMenuItem(
                        value: 'block',
                        child: Text(tr(context, 'Blokovat')),
                      ),
                      PopupMenuItem(
                        value: 'report',
                        child: Text(tr(context, 'Nahlásit účet')),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                tr(context, 'Aktivní Shouty'),
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
            ),
          ),
          Expanded(
            child: StreamBuilder<List<Shout>>(
              stream: _shoutsStream,
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return EmptyState(
                    icon: Icons.cloud_off_outlined,
                    title: tr(context, 'Shouty se nepodařilo načíst.'),
                  );
                }
                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }
                final shouts = snapshot.data!;
                if (shouts.isEmpty) {
                  return EmptyState(
                    icon: Icons.campaign_outlined,
                    title: tr(
                      context,
                      'Tento účet nyní nemá žádné aktivní Shouty.',
                    ),
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                  itemCount: shouts.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, index) => ShoutCard(
                    shout: shouts[index],
                    onSave: () => widget.onSave(shouts[index]),
                    onReaction: (like) async {
                      await widget.onReaction(shouts[index], like: like);
                      if (mounted) setState(() {});
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

Stream<List<Shout>> _watchActiveProfileShouts(String userId) =>
    FirebaseFirestore.instance
        .collection('shouts')
        .where('authorId', isEqualTo: userId)
        .limit(_feedPageSize)
        .snapshots()
        .asyncMap(_hydrateProfileShouts);

Future<List<Shout>> _hydrateProfileShouts(
  QuerySnapshot<Map<String, dynamic>> snapshot,
) async {
  final shouts = snapshot.docs
      .map(Shout.fromDocument)
      .where((shout) => shout.isActive)
      .toList();
  final viewerId = FirebaseAuth.instance.currentUser?.uid;
  if (viewerId != null) {
    await Future.wait(
      shouts.map((shout) async {
        final reference = FirebaseFirestore.instance
            .collection('shouts')
            .doc(shout.id);
        final interactions = await Future.wait([
          reference.collection('reactions').doc(viewerId).get(),
          reference.collection('saves').doc(viewerId).get(),
        ]);
        final reaction = interactions[0].data()?['type'] as String?;
        shout
          ..isLiked = reaction == 'like'
          ..isDisliked = reaction == 'dislike'
          ..isSaved = interactions[1].exists;
      }),
    );
  }
  shouts.sort((a, b) => b.createdAt.compareTo(a.createdAt));
  return shouts;
}

class FollowedProfilesList extends StatelessWidget {
  const FollowedProfilesList({
    super.key,
    required this.followedUserIds,
    required this.onSave,
    required this.onReaction,
  });

  final Set<String> followedUserIds;
  final ValueChanged<Shout> onSave;
  final Future<void> Function(Shout shout, {required bool like}) onReaction;

  @override
  Widget build(BuildContext context) {
    if (followedUserIds.isEmpty) {
      return EmptyState(
        icon: Icons.person_add_alt_1_outlined,
        title: tr(context, 'Zatím nesleduješ žádné profily.'),
      );
    }
    final ids = followedUserIds.toList()..sort();
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: ids.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, index) => PublicIdentityBuilder(
        userId: ids[index],
        fallbackNickname: tr(context, 'Profil'),
        fallbackAvatarStyle: AvatarStyle.fallback,
        builder: (context, identity) => Card(
          child: ListTile(
            leading: AvatarImage(
              avatarId: identity.avatarStyle.avatarId,
              style: identity.avatarStyle,
              radius: 22,
            ),
            title: Text(identity.nickname),
            subtitle: Text(tr(context, 'Sledováno')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => showPublicProfileSheet(
              context,
              userId: ids[index],
              fallbackNickname: identity.nickname,
              fallbackAvatarStyle: identity.avatarStyle,
              onSave: onSave,
              onReaction: onReaction,
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> _blockProfile(BuildContext context, String targetId) async {
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
  final uid = FirebaseAuth.instance.currentUser!.uid;
  final batch = FirebaseFirestore.instance.batch();
  batch.set(
    FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('blocked')
        .doc(targetId),
    {'createdAt': FieldValue.serverTimestamp()},
  );
  batch.delete(_followingReference(targetId));
  await batch.commit();
  if (context.mounted) Navigator.pop(context);
}

Future<void> _reportProfile(BuildContext context, String targetId) async {
  final controller = TextEditingController();
  final reason = await showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(tr(context, 'Nahlásit účet')),
      content: TextField(
        controller: controller,
        maxLength: 300,
        maxLines: 4,
        decoration: InputDecoration(labelText: tr(context, 'Důvod')),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(tr(context, 'Zrušit')),
        ),
        FilledButton(
          onPressed: () {
            final value = controller.text.trim();
            if (value.isNotEmpty) Navigator.pop(context, value);
          },
          child: Text(tr(context, 'Nahlásit')),
        ),
      ],
    ),
  );
  controller.dispose();
  if (reason == null) return;
  final uid = FirebaseAuth.instance.currentUser!.uid;
  await FirebaseFirestore.instance
      .collection('accountReports')
      .doc('${uid}_$targetId')
      .set({
        'reporterId': uid,
        'targetUserId': targetId,
        'reason': reason,
        'status': 'open',
        'createdAt': FieldValue.serverTimestamp(),
      });
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(tr(context, 'Hlášení bylo odesláno.'))),
    );
  }
}
