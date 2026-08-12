part of '../main.dart';

class ModerationPage extends StatelessWidget {
  const ModerationPage({super.key});
  @override
  Widget build(BuildContext context) => StreamBuilder<AccountRole>(
    stream: _watchAccountRole(FirebaseAuth.instance.currentUser!.uid),
    builder: (context, snapshot) {
      if (!snapshot.hasData) {
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      return _ModerationContent(role: snapshot.data!);
    },
  );
}

class _ModerationContent extends StatelessWidget {
  const _ModerationContent({required this.role});

  final AccountRole role;

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 4,
    child: Scaffold(
      appBar: AppBar(
        title: Text(tr(context, 'Moderace')),
        bottom: TabBar(
          isScrollable: true,
          tabs: [
            Tab(text: tr(context, 'Shouty')),
            Tab(text: tr(context, 'Komentáře')),
            Tab(text: tr(context, 'Soukromé')),
            const Tab(text: 'Postihy'),
          ],
        ),
      ),
      body: TabBarView(
        children: [
          _ReportList(collection: 'reports', role: role),
          _ReportList(collection: 'commentReports', role: role),
          const _PrivateReplyReportList(),
          const _SanctionHistoryList(),
        ],
      ),
    ),
  );
}

class _PrivateReplyReportList extends StatelessWidget {
  const _PrivateReplyReportList();

  @override
  Widget build(BuildContext context) =>
      StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection('privateReplyReports')
            .where('status', isEqualTo: 'open')
            .limit(_moderationPageSize)
            .snapshots(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final reports = snapshot.data!.docs;
          if (reports.isEmpty) {
            return Center(child: Text(tr(context, 'Žádná otevřená hlášení.')));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: reports.length,
            itemBuilder: (context, index) {
              final report = reports[index];
              final data = report.data();
              return Card(
                color: const Color(0xFFFFF4E5),
                child: ListTile(
                  leading: const Icon(Icons.priority_high_rounded),
                  title: Text(data['reason'] as String? ?? ''),
                  subtitle: Text(
                    '${tr(context, 'Soukromá odpověď')}: ${data['text'] ?? ''}',
                  ),
                  trailing: PopupMenuButton<String>(
                    onSelected: (action) async {
                      if (action == 'remove') {
                        await FirebaseFirestore.instance
                            .collection('shouts')
                            .doc(data['shoutId'] as String)
                            .collection('privateReplies')
                            .doc(data['privateReplyId'] as String)
                            .delete();
                      }
                      await report.reference.update({
                        'status': 'resolved',
                        'resolvedAt': FieldValue.serverTimestamp(),
                      });
                    },
                    itemBuilder: (_) => [
                      PopupMenuItem(
                        value: 'resolve',
                        child: Text(tr(context, 'Označit jako vyřešené')),
                      ),
                      PopupMenuItem(
                        value: 'remove',
                        child: Text(tr(context, 'Odstranit z veřejnosti')),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      );
}

class _ReportList extends StatelessWidget {
  const _ReportList({required this.collection, required this.role});
  final String collection;
  final AccountRole role;
  @override
  Widget build(
    BuildContext context,
  ) => StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
    stream: FirebaseFirestore.instance
        .collection(collection)
        .where('status', isEqualTo: 'open')
        .limit(_moderationPageSize)
        .snapshots(),
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return Center(
          child: Text(tr(context, 'Hlášení se nepodařilo načíst.')),
        );
      }
      if (!snapshot.hasData) {
        return const Center(child: CircularProgressIndicator());
      }
      final reports = snapshot.data!.docs;
      if (reports.isEmpty) {
        return Center(child: Text(tr(context, 'Žádná otevřená hlášení.')));
      }
      return ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: reports.length,
        itemBuilder: (context, index) {
          final report = reports[index];
          final data = report.data();
          return Card(
            child: ListTile(
              title: Text(data['reason'] as String? ?? ''),
              subtitle: Text(
                '${tr(context, 'Nahlásil/a')}: ${data['reporterId'] ?? ''}\n'
                'Kliknutím zobrazíte obsah a podrobnosti.',
              ),
              isThreeLine: true,
              onTap: () => showDialog<void>(
                context: context,
                builder: (_) =>
                    _ReportDetailDialog(report: report, collection: collection),
              ),
              trailing: PopupMenuButton<String>(
                onSelected: (action) => _act(context, report, action),
                itemBuilder: (context) => [
                  PopupMenuItem(
                    value: 'resolve',
                    child: Text(tr(context, 'Označit jako vyřešené')),
                  ),
                  PopupMenuItem(
                    value: 'remove',
                    child: Text(tr(context, 'Odstranit z veřejnosti')),
                  ),
                  PopupMenuItem(
                    value: 'warning',
                    child: Text(tr(context, 'Udělit varování')),
                  ),
                  const PopupMenuDivider(),
                  const PopupMenuItem(
                    value: 'restrict1d',
                    child: Text('Omezit tvorbu na 1 den'),
                  ),
                  const PopupMenuItem(
                    value: 'restrict7d',
                    child: Text('Omezit tvorbu na 7 dnů'),
                  ),
                  const PopupMenuItem(
                    value: 'restrict30d',
                    child: Text('Omezit tvorbu na 30 dnů'),
                  ),
                  const PopupMenuDivider(),
                  PopupMenuItem(
                    value: 'ban1d',
                    child: Text(tr(context, 'Ban na 1 den')),
                  ),
                  const PopupMenuItem(
                    value: 'ban7d',
                    child: Text('Ban na 7 dnů'),
                  ),
                  const PopupMenuItem(
                    value: 'ban30d',
                    child: Text('Ban na 30 dnů'),
                  ),
                  if (role.isAtLeast(AccountRole.seniorModerator))
                    const PopupMenuItem(
                      value: 'ban90d',
                      child: Text('Ban na 90 dnů'),
                    ),
                  if (role.isAtLeast(AccountRole.seniorModerator))
                    PopupMenuItem(
                      value: 'banPermanent',
                      child: Text(tr(context, 'Trvalý ban')),
                    ),
                ],
              ),
            ),
          );
        },
      );
    },
  );

  Future<bool> _act(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> report,
    String action,
  ) async {
    final data = report.data();
    final shoutRef = FirebaseFirestore.instance
        .collection('shouts')
        .doc(data['shoutId'] as String);
    final target = collection == 'reports'
        ? shoutRef
        : shoutRef.collection('comments').doc(data['commentId'] as String);
    final targetSnapshot = await target.get();
    final authorId = targetSnapshot.data()?['authorId'] as String?;
    if (action == 'remove') {
      if (collection == 'reports') {
        await target.update({'status': 'deleted'});
      } else {
        await _deleteCommentWithCounter(target);
      }
    }
    if (authorId != null &&
        (action == 'warning' ||
            action.startsWith('restrict') ||
            action.startsWith('ban'))) {
      if (!context.mounted) return false;
      final confirmed = await _confirmSanction(
        context: context,
        userId: authorId,
        reason: data['reason'] as String? ?? action,
        action: action,
      );
      if (!confirmed) return false;
      await _recordSanction(
        report: report,
        userId: authorId,
        reason: data['reason'] as String? ?? action,
        action: action,
        sourceContentType: collection == 'reports' ? 'shout' : 'comment',
        sourceContentId: target.id,
        contentSnapshot: {
          ...?targetSnapshot.data(),
          if (collection == 'commentReports')
            'shoutId': data['shoutId'] as String,
        },
      );
      return true;
    }
    await report.reference.update({
      'status': 'resolved',
      'resolvedAt': FieldValue.serverTimestamp(),
    });
    return true;
  }

  Future<bool> _confirmSanction({
    required BuildContext context,
    required String userId,
    required String reason,
    required String action,
  }) async {
    final previous = await FirebaseFirestore.instance
        .collection('sanctions')
        .where('userId', isEqualTo: userId)
        .limit(_moderationPageSize)
        .get();
    if (!context.mounted) return false;
    final description = _sanctionActionLabel(action);
    return await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Potvrdit postih'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(description),
                const SizedBox(height: 8),
                Text('Uživatel: $userId'),
                Text('Dřívější postihy: ${previous.size}'),
                const SizedBox(height: 8),
                Text('Důvod: $reason'),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Zrušit'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Potvrdit'),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _recordSanction({
    required QueryDocumentSnapshot<Map<String, dynamic>> report,
    required String userId,
    required String reason,
    required String action,
    required String sourceContentType,
    required String sourceContentId,
    required Map<String, dynamic> contentSnapshot,
  }) async {
    final firestore = FirebaseFirestore.instance;
    final moderatorId = FirebaseAuth.instance.currentUser!.uid;
    final previous = await firestore
        .collection('sanctions')
        .where('userId', isEqualTo: userId)
        .limit(_moderationPageSize)
        .get();
    final sanctionRef = firestore.collection('sanctions').doc();
    final now = DateTime.now();
    final days = switch (action) {
      'restrict1d' || 'ban1d' => 1,
      'restrict7d' || 'ban7d' => 7,
      'restrict30d' || 'ban30d' => 30,
      'ban90d' => 90,
      _ => null,
    };
    final type = action == 'warning'
        ? 'warning'
        : action.startsWith('restrict')
        ? 'contentRestriction'
        : 'accountBan';
    final permanent = action == 'banPermanent';
    final expiresAt = days == null
        ? null
        : Timestamp.fromDate(now.add(Duration(days: days)));
    final purgeAt = permanent
        ? Timestamp.fromDate(DateTime(9999, 12, 31))
        : Timestamp.fromDate(
            (expiresAt?.toDate() ?? now).add(
              Duration(
                days: type == 'warning'
                    ? 180
                    : type == 'accountBan'
                    ? 730
                    : 365,
              ),
            ),
          );
    final batch = firestore.batch();

    batch.set(sanctionRef, {
      'userId': userId,
      'type': type,
      'reason': reason,
      'createdAt': FieldValue.serverTimestamp(),
      'expiresAt': expiresAt,
      'permanent': permanent,
      'moderatorId': moderatorId,
      'status': 'active',
      'sourceReportId': report.id,
      'previousSanctionsCount': previous.size,
      'purgeAt': purgeAt,
      'sourceType': 'report',
      'sourceContentType': sourceContentType,
      'sourceContentId': sourceContentId,
      'contentSnapshot': contentSnapshot,
    });

    if (type == 'warning') {
      batch.set(firestore.collection('warnings').doc(), {
        'userId': userId,
        'reason': reason,
        'createdAt': FieldValue.serverTimestamp(),
        'moderatorId': moderatorId,
        'sanctionId': sanctionRef.id,
      });
    } else {
      final activeCollection = type == 'accountBan'
          ? 'bans'
          : 'contentRestrictions';
      batch.set(firestore.collection(activeCollection).doc(userId), {
        'userId': userId,
        'reason': reason,
        'createdAt': FieldValue.serverTimestamp(),
        'expiresAt': expiresAt,
        'moderatorId': moderatorId,
        'sanctionId': sanctionRef.id,
      });
    }
    batch.update(report.reference, {
      'status': 'resolved',
      'resolvedAt': FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }
}

class _ReportTargetDetails {
  const _ReportTargetDetails({
    required this.shout,
    required this.targetData,
    this.focusCommentId,
    this.focusCommentCreatedAt,
  });

  final Shout shout;
  final Map<String, dynamic>? targetData;
  final String? focusCommentId;
  final Timestamp? focusCommentCreatedAt;
}

class _ReportDetailDialog extends StatelessWidget {
  const _ReportDetailDialog({
    required this.report,
    required this.collection,
    this.decisionBuilder,
  });

  final QueryDocumentSnapshot<Map<String, dynamic>> report;
  final String collection;
  final WidgetBuilder? decisionBuilder;

  Future<_ReportTargetDetails> _load() async {
    final data = report.data();
    final shoutDocument = await FirebaseFirestore.instance
        .collection('shouts')
        .doc(data['shoutId'] as String)
        .get();
    if (!shoutDocument.exists) {
      throw StateError('shout-not-found');
    }
    Map<String, dynamic>? targetData = shoutDocument.data();
    String? focusCommentId;
    Timestamp? focusCommentCreatedAt;
    if (collection == 'commentReports') {
      final commentDocument = await shoutDocument.reference
          .collection('comments')
          .doc(data['commentId'] as String)
          .get();
      targetData = commentDocument.data();
      focusCommentId = commentDocument.id;
      focusCommentCreatedAt = targetData?['createdAt'] as Timestamp?;
    } else if (collection == 'privateReplyReports') {
      // Private replies are not readable by unrelated moderators. The report
      // contains the immutable text and author snapshot needed for review.
      targetData = data;
      focusCommentId = data['parentCommentId'] as String?;
      if (focusCommentId != null) {
        final parentComment = await shoutDocument.reference
            .collection('comments')
            .doc(focusCommentId)
            .get();
        focusCommentCreatedAt =
            parentComment.data()?['createdAt'] as Timestamp?;
      }
    }
    return _ReportTargetDetails(
      shout: Shout.fromDocument(shoutDocument),
      targetData: targetData,
      focusCommentId: focusCommentId,
      focusCommentCreatedAt: focusCommentCreatedAt,
    );
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(
      collection == 'commentReports' ? 'Detail komentáře' : 'Detail Shoutu',
    ),
    content: SizedBox(
      width: 560,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: FutureBuilder<_ReportTargetDetails>(
              future: _load(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return const Text(
                    'Původní obsah už není dostupný. Hlášení lze stále uzavřít.',
                  );
                }
                if (!snapshot.hasData) {
                  return const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                final details = snapshot.data!;
                final target = details.targetData;
                final createdAt = (target?['createdAt'] as Timestamp?)
                    ?.toDate();
                final reportData = report.data();
                return SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _ReportDetailRow(
                        label: 'Obsah',
                        value:
                            target?['text'] as String? ??
                            'Obsah byl odstraněn.',
                      ),
                      _ReportDetailRow(
                        label: 'Autor',
                        value:
                            '${target?['authorNickname'] ?? 'Neznámý'} (${target?['authorId'] ?? 'bez ID'})',
                      ),
                      if (createdAt != null)
                        _ReportDetailRow(
                          label: 'Vytvořeno',
                          value:
                              '${MaterialLocalizations.of(context).formatMediumDate(createdAt)} '
                              '${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(createdAt))}',
                        ),
                      _ReportDetailRow(
                        label: 'Důvod hlášení',
                        value: reportData['reason'] as String? ?? '',
                      ),
                      _ReportDetailRow(
                        label: 'Nahlásil',
                        value: reportData['reporterId'] as String? ?? '',
                      ),
                      _ReportDetailRow(
                        label: 'Region',
                        value: details.shout.geography.regionLabel.isEmpty
                            ? 'Region není doplněný'
                            : details.shout.geography.regionLabel,
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          if (decisionBuilder != null) ...[
            const Divider(height: 28),
            decisionBuilder!(context),
          ],
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Zavřít'),
      ),
      FutureBuilder<_ReportTargetDetails>(
        future: _load(),
        builder: (context, snapshot) => FilledButton.icon(
          onPressed: snapshot.hasData
              ? () {
                  final shout = snapshot.data!.shout;
                  Navigator.pop(context);
                  Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => ShoutDetailPage(
                        shout: shout,
                        onSave: () {},
                        onReaction: (_) async {},
                        focusCommentId: snapshot.data!.focusCommentId,
                        focusCommentCreatedAt:
                            snapshot.data!.focusCommentCreatedAt,
                      ),
                    ),
                  );
                }
              : null,
          icon: const Icon(Icons.open_in_new),
          label: Text(
            collection == 'commentReports'
                ? 'Otevřít u komentáře'
                : collection == 'privateReplyReports'
                ? 'Otevřít související místo'
                : 'Otevřít celý Shout',
          ),
        ),
      ),
    ],
  );
}

class _ReportDetailRow extends StatelessWidget {
  const _ReportDetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 3),
        SelectableText(value),
      ],
    ),
  );
}

String _sanctionActionLabel(String action) => switch (action) {
  'warning' => 'Varování',
  'restrict1d' => 'Omezení tvorby na 1 den',
  'restrict7d' => 'Omezení tvorby na 7 dnů',
  'restrict30d' => 'Omezení tvorby na 30 dnů',
  'ban1d' => 'Ban na 1 den',
  'ban7d' => 'Ban na 7 dnů',
  'ban30d' => 'Ban na 30 dnů',
  'ban90d' => 'Ban na 90 dnů',
  'banPermanent' => 'Trvalý ban',
  _ => action,
};

Future<void> _showDirectModerationDialog(
  BuildContext context, {
  required AccountRole role,
  required String userId,
  required String sourceContentType,
  required String sourceContentId,
  required Map<String, dynamic> contentSnapshot,
}) async {
  final previous = await FirebaseFirestore.instance
      .collection('sanctions')
      .where('userId', isEqualTo: userId)
      .limit(_moderationPageSize)
      .get();
  if (!context.mounted) return;
  final actions = <String>[
    'warning',
    'restrict1d',
    'restrict7d',
    'restrict30d',
    'ban1d',
    'ban7d',
    'ban30d',
    if (role.isAtLeast(AccountRole.seniorModerator)) 'ban90d',
    if (role.isAtLeast(AccountRole.seniorModerator)) 'banPermanent',
  ];
  var action = actions.first;
  final reasonController = TextEditingController();
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setDialogState) => AlertDialog(
        title: const Text('Moderovat obsah'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Předchozí postihy uživatele: ${previous.size}'),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: action,
                decoration: const InputDecoration(labelText: 'Druh postihu'),
                items: actions
                    .map(
                      (value) => DropdownMenuItem(
                        value: value,
                        child: Text(_sanctionActionLabel(value)),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value != null) setDialogState(() => action = value);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: reasonController,
                maxLength: 500,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Důvod postihu',
                  hintText: 'Popište konkrétní porušení pravidel.',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Zrušit'),
          ),
          FilledButton(
            onPressed: () {
              if (reasonController.text.trim().isNotEmpty) {
                Navigator.pop(dialogContext, true);
              }
            },
            child: const Text('Potvrdit postih'),
          ),
        ],
      ),
    ),
  );
  final reason = reasonController.text.trim();
  reasonController.dispose();
  if (confirmed != true || reason.isEmpty || !context.mounted) return;
  try {
    await _recordDirectSanction(
      userId: userId,
      reason: reason,
      action: action,
      previousSanctionsCount: previous.size,
      sourceContentType: sourceContentType,
      sourceContentId: sourceContentId,
      contentSnapshot: contentSnapshot,
    );
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Postih byl zaznamenán.')));
    }
  } on FirebaseException {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Postih se nepodařilo uložit.')),
      );
    }
  }
}

Future<void> _recordDirectSanction({
  required String userId,
  required String reason,
  required String action,
  required int previousSanctionsCount,
  required String sourceContentType,
  required String sourceContentId,
  required Map<String, dynamic> contentSnapshot,
}) async {
  final firestore = FirebaseFirestore.instance;
  final moderatorId = FirebaseAuth.instance.currentUser!.uid;
  final sanctionRef = firestore.collection('sanctions').doc();
  final now = DateTime.now();
  final days = switch (action) {
    'restrict1d' || 'ban1d' => 1,
    'restrict7d' || 'ban7d' => 7,
    'restrict30d' || 'ban30d' => 30,
    'ban90d' => 90,
    _ => null,
  };
  final type = action == 'warning'
      ? 'warning'
      : action.startsWith('restrict')
      ? 'contentRestriction'
      : 'accountBan';
  final permanent = action == 'banPermanent';
  final expiresAt = days == null
      ? null
      : Timestamp.fromDate(now.add(Duration(days: days)));
  final retentionDays = type == 'warning'
      ? 180
      : type == 'accountBan'
      ? 730
      : 365;
  final purgeAt = permanent
      ? Timestamp.fromDate(DateTime(9999, 12, 31))
      : Timestamp.fromDate(
          (expiresAt?.toDate() ?? now).add(Duration(days: retentionDays)),
        );
  final batch = firestore.batch();
  batch.set(sanctionRef, {
    'userId': userId,
    'type': type,
    'reason': reason,
    'createdAt': FieldValue.serverTimestamp(),
    'expiresAt': expiresAt,
    'permanent': permanent,
    'moderatorId': moderatorId,
    'status': 'active',
    'sourceReportId': '',
    'previousSanctionsCount': previousSanctionsCount,
    'purgeAt': purgeAt,
    'sourceType': 'moderatorObservation',
    'sourceContentType': sourceContentType,
    'sourceContentId': sourceContentId,
    'contentSnapshot': contentSnapshot,
  });
  if (type == 'warning') {
    batch.set(firestore.collection('warnings').doc(), {
      'userId': userId,
      'reason': reason,
      'createdAt': FieldValue.serverTimestamp(),
      'moderatorId': moderatorId,
      'sanctionId': sanctionRef.id,
    });
  } else {
    final activeCollection = type == 'accountBan'
        ? 'bans'
        : 'contentRestrictions';
    batch.set(firestore.collection(activeCollection).doc(userId), {
      'userId': userId,
      'reason': reason,
      'createdAt': FieldValue.serverTimestamp(),
      'expiresAt': expiresAt,
      'moderatorId': moderatorId,
      'sanctionId': sanctionRef.id,
    });
  }
  await batch.commit();
}

class _SanctionHistoryList extends StatelessWidget {
  const _SanctionHistoryList();

  @override
  Widget build(
    BuildContext context,
  ) => StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
    stream: FirebaseFirestore.instance
        .collection('sanctions')
        .orderBy('createdAt', descending: true)
        .limit(_moderationPageSize)
        .snapshots(),
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return const Center(child: Text('Postihy se nepodařilo načíst.'));
      }
      if (!snapshot.hasData) {
        return const Center(child: CircularProgressIndicator());
      }
      final sanctions = snapshot.data!.docs;
      if (sanctions.isEmpty) {
        return const Center(child: Text('Zatím nejsou zaznamenané postihy.'));
      }
      return ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: sanctions.length,
        itemBuilder: (context, index) {
          final sanction = sanctions[index];
          final data = sanction.data();
          final expiresAt = (data['expiresAt'] as Timestamp?)?.toDate();
          final type = switch (data['type']) {
            'warning' => 'Varování',
            'contentRestriction' => 'Omezení tvorby',
            'accountBan' =>
              data['permanent'] == true ? 'Trvalý ban' : 'Dočasný ban',
            _ => data['type']?.toString() ?? 'Postih',
          };
          final validity = data['permanent'] == true
              ? 'trvale'
              : expiresAt == null
              ? 'bez časového omezení'
              : 'do ${MaterialLocalizations.of(context).formatMediumDate(expiresAt)}';
          return Card(
            child: ListTile(
              leading: Icon(
                data['type'] == 'accountBan'
                    ? Icons.block
                    : data['type'] == 'contentRestriction'
                    ? Icons.edit_off_outlined
                    : Icons.warning_amber_outlined,
              ),
              title: Text('$type – $validity'),
              subtitle: Text(
                'Uživatel: ${data['userId'] ?? ''}\n'
                '${data['reason'] ?? ''}\n'
                'Předchozí postihy: ${data['previousSanctionsCount'] ?? 0}',
              ),
              isThreeLine: true,
            ),
          );
        },
      );
    },
  );
}

class WarningHistoryPage extends StatelessWidget {
  const WarningHistoryPage({super.key, required this.userId});
  final String userId;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(tr(context, 'Moje varování'))),
    body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('warnings')
          .where('userId', isEqualTo: userId)
          .limit(_moderationPageSize)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final warnings = snapshot.data!.docs;
        if (warnings.isEmpty) {
          return Center(child: Text(tr(context, 'Nemáš žádná varování.')));
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: warnings.length,
          itemBuilder: (context, index) {
            final warning = warnings[index].data();
            return Card(
              child: ListTile(
                leading: const Icon(Icons.warning_amber_outlined),
                title: Text(warning['reason'] as String? ?? ''),
                subtitle: Text(tr(context, 'Varování od moderace')),
              ),
            );
          },
        );
      },
    ),
  );
}
