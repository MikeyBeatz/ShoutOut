part of '../main.dart';

class _StaffUserSearch extends StatefulWidget {
  const _StaffUserSearch({required this.role});

  final AccountRole role;

  @override
  State<_StaffUserSearch> createState() => _StaffUserSearchState();
}

class _StaffUserSearchState extends State<_StaffUserSearch> {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final input = _controller.text.trim();
    if (input.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final firestore = FirebaseFirestore.instance;
      var userId = input;
      var profile = await firestore.collection('users').doc(userId).get();
      if (!profile.exists) {
        final nickname = await firestore
            .collection('nicknames')
            .doc(input.toLowerCase())
            .get();
        final resolvedUserId = nickname.data()?['uid'] as String?;
        if (resolvedUserId != null) {
          userId = resolvedUserId;
          profile = await firestore.collection('users').doc(userId).get();
        }
      }
      if (!profile.exists) {
        throw StateError('Uživatel nebyl nalezen.');
      }
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => _StaffUserDetail(userId: userId, role: widget.role),
        ),
      );
    } on FirebaseException {
      if (mounted) setState(() => _error = 'Vyhledávání se nepodařilo.');
    } on StateError catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      Text(
        'Vyhledat uživatele',
        style: Theme.of(context).textTheme.headlineMedium,
      ),
      const SizedBox(height: 8),
      const Text('Zadejte přesné UID nebo přesnou přezdívku.'),
      const SizedBox(height: 20),
      ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 620),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                onSubmitted: (_) => _search(),
                decoration: const InputDecoration(
                  labelText: 'UID nebo přezdívka',
                  prefixIcon: Icon(Icons.search),
                ),
              ),
            ),
            const SizedBox(width: 12),
            FilledButton.icon(
              onPressed: _loading ? null : _search,
              icon: _loading
                  ? const SizedBox.square(
                      dimension: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.search),
              label: const Text('Vyhledat'),
            ),
          ],
        ),
      ),
      if (_error != null) ...[
        const SizedBox(height: 12),
        Text(
          _error!,
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      ],
    ],
  );
}

class _StaffUserDetail extends StatefulWidget {
  const _StaffUserDetail({required this.userId, required this.role});

  final String userId;
  final AccountRole role;

  @override
  State<_StaffUserDetail> createState() => _StaffUserDetailState();
}

class _StaffUserDetailState extends State<_StaffUserDetail> {
  late Future<_StaffUserData> _data = _load();

  Future<_StaffUserData> _load() async {
    final firestore = FirebaseFirestore.instance;
    final results = await Future.wait([
      firestore.collection('users').doc(widget.userId).get(),
      firestore.collection('accountRoles').doc(widget.userId).get(),
      firestore.collection('bans').doc(widget.userId).get(),
      firestore.collection('contentRestrictions').doc(widget.userId).get(),
      firestore
          .collection('sanctions')
          .where('userId', isEqualTo: widget.userId)
          .limit(_moderationPageSize)
          .get(),
      firestore
          .collection('sanctionRevocations')
          .where('userId', isEqualTo: widget.userId)
          .limit(_moderationPageSize)
          .get(),
    ]);
    final sanctions =
        (results[4] as QuerySnapshot<Map<String, dynamic>>).docs.toList()
          ..sort((a, b) {
            final aTime = a.data()['createdAt'] as Timestamp?;
            final bTime = b.data()['createdAt'] as Timestamp?;
            return (bTime?.millisecondsSinceEpoch ?? 0).compareTo(
              aTime?.millisecondsSinceEpoch ?? 0,
            );
          });
    final revocations = {
      for (final document
          in (results[5] as QuerySnapshot<Map<String, dynamic>>).docs)
        document.id: document.data(),
    };
    return _StaffUserData(
      profile: (results[0] as DocumentSnapshot<Map<String, dynamic>>).data(),
      role: AccountRole.fromData(
        (results[1] as DocumentSnapshot<Map<String, dynamic>>).data(),
      ),
      ban: (results[2] as DocumentSnapshot<Map<String, dynamic>>).data(),
      restriction: (results[3] as DocumentSnapshot<Map<String, dynamic>>)
          .data(),
      sanctions: sanctions,
      revocations: revocations,
    );
  }

  void _reload() => setState(() => _data = _load());

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Detail uživatele')),
    body: FutureBuilder<_StaffUserData>(
      future: _data,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return const Center(child: Text('Detail se nepodařilo načíst.'));
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final data = snapshot.data!;
        return ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(
              data.profile?['nickname'] as String? ?? widget.userId,
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            Text('UID: ${widget.userId}'),
            Text('Role: ${_staffRoleLabel(data.role)}'),
            const SizedBox(height: 20),
            _ActiveEnforcementCard(title: 'Aktivní ban', active: data.ban),
            _ActiveEnforcementCard(
              title: 'Aktivní omezení tvorby',
              active: data.restriction,
            ),
            const SizedBox(height: 20),
            Text(
              'Historie postihů (${data.sanctions.length})',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            if (data.sanctions.isEmpty)
              const Text('Uživatel nemá zaznamenané postihy.'),
            for (final sanction in data.sanctions)
              _UserSanctionCard(
                sanction: sanction,
                revocation: data.revocations[sanction.id],
                currentRole: widget.role,
                activeSanctionIds: {
                  if (data.ban?['sanctionId'] is String)
                    data.ban!['sanctionId'] as String,
                  if (data.restriction?['sanctionId'] is String)
                    data.restriction!['sanctionId'] as String,
                },
                onRevoked: _reload,
              ),
          ],
        );
      },
    ),
  );
}

class _ActiveEnforcementCard extends StatelessWidget {
  const _ActiveEnforcementCard({required this.title, required this.active});

  final String title;
  final Map<String, dynamic>? active;

  @override
  Widget build(BuildContext context) {
    final expiry = (active?['expiresAt'] as Timestamp?)?.toDate();
    final isActive =
        active != null && (expiry == null || expiry.isAfter(DateTime.now()));
    return Card(
      child: ListTile(
        leading: Icon(
          isActive ? Icons.warning_amber : Icons.check_circle_outline,
        ),
        title: Text(title),
        subtitle: Text(
          isActive
              ? '${active?['reason'] ?? ''}${expiry == null ? ' – trvale' : ' – do ${MaterialLocalizations.of(context).formatMediumDate(expiry)}'}'
              : 'Není aktivní',
        ),
      ),
    );
  }
}

class _UserSanctionCard extends StatelessWidget {
  const _UserSanctionCard({
    required this.sanction,
    required this.revocation,
    required this.currentRole,
    required this.activeSanctionIds,
    required this.onRevoked,
  });

  final QueryDocumentSnapshot<Map<String, dynamic>> sanction;
  final Map<String, dynamic>? revocation;
  final AccountRole currentRole;
  final Set<String> activeSanctionIds;
  final VoidCallback onRevoked;

  @override
  Widget build(BuildContext context) {
    final data = sanction.data();
    final currentUserId = FirebaseAuth.instance.currentUser!.uid;
    final canRevoke =
        revocation == null &&
        activeSanctionIds.contains(sanction.id) &&
        (currentRole.isAtLeast(AccountRole.seniorModerator) ||
            (data['moderatorId'] == currentUserId &&
                data['permanent'] == false));
    return Card(
      child: ExpansionTile(
        leading: Icon(revocation == null ? Icons.gavel_outlined : Icons.undo),
        title: Text(_sanctionTypeLabel(data)),
        subtitle: Text(
          revocation == null
              ? data['reason'] as String? ?? ''
              : 'Zrušeno: ${revocation?['reason'] ?? ''}',
        ),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: SelectableText('Rozhodnutí: ${sanction.id}'),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: Text('Zdroj: ${data['sourceType'] ?? ''}'),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(_snapshotText(data['contentSnapshot'])),
          ),
          if (canRevoke) ...[
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: OutlinedButton.icon(
                onPressed: () => _revoke(context),
                icon: const Icon(Icons.undo),
                label: const Text('Zrušit postih'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _revoke(BuildContext context) async {
    final reasonController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Zrušit postih'),
        content: TextField(
          controller: reasonController,
          maxLength: 500,
          maxLines: 3,
          decoration: const InputDecoration(labelText: 'Důvod zrušení'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Zpět'),
          ),
          FilledButton(
            onPressed: () {
              if (reasonController.text.trim().isNotEmpty) {
                Navigator.pop(dialogContext, true);
              }
            },
            child: const Text('Potvrdit zrušení'),
          ),
        ],
      ),
    );
    final reason = reasonController.text.trim();
    reasonController.dispose();
    if (confirmed != true || reason.isEmpty) return;
    final data = sanction.data();
    final firestore = FirebaseFirestore.instance;
    final batch = firestore.batch();
    batch.set(firestore.collection('sanctionRevocations').doc(sanction.id), {
      'userId': data['userId'],
      'sanctionId': sanction.id,
      'originalType': data['type'],
      'reason': reason,
      'createdAt': FieldValue.serverTimestamp(),
      'revokedBy': FirebaseAuth.instance.currentUser!.uid,
      'purgeAt': data['purgeAt'],
    });
    final activeCollection = data['type'] == 'accountBan'
        ? 'bans'
        : 'contentRestrictions';
    batch.delete(firestore.collection(activeCollection).doc(data['userId']));
    try {
      await batch.commit();
      onRevoked();
    } on FirebaseException {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Postih se nepodařilo zrušit.')),
        );
      }
    }
  }
}

class _StaffUserData {
  const _StaffUserData({
    required this.profile,
    required this.role,
    required this.ban,
    required this.restriction,
    required this.sanctions,
    required this.revocations,
  });

  final Map<String, dynamic>? profile;
  final AccountRole role;
  final Map<String, dynamic>? ban;
  final Map<String, dynamic>? restriction;
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> sanctions;
  final Map<String, Map<String, dynamic>> revocations;
}

String _sanctionTypeLabel(Map<String, dynamic> data) => switch (data['type']) {
  'warning' => 'Varování',
  'contentRestriction' => 'Omezení tvorby',
  'accountBan' => data['permanent'] == true ? 'Trvalý ban' : 'Dočasný ban',
  _ => 'Postih',
};

String _snapshotText(Object? snapshot) {
  if (snapshot is! Map) return 'Snímek obsahu není dostupný.';
  final title = snapshot['title']?.toString();
  final text = snapshot['text']?.toString() ?? '';
  return title == null ? 'Snímek: $text' : 'Snímek: $title\n$text';
}
