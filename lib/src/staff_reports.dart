part of '../main.dart';

enum _StaffReportCategory { all, shout, comment, privateReply }

enum _StaffReportOrder { mostReported, newest, oldest }

class _StaffReportGroup {
  _StaffReportGroup({required this.collection, required this.targetKey});

  final String collection;
  final String targetKey;
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> reports = [];

  QueryDocumentSnapshot<Map<String, dynamic>> get representative {
    final sorted = [...reports]
      ..sort((a, b) => _reportCreatedAt(b).compareTo(_reportCreatedAt(a)));
    return sorted.first;
  }

  DateTime get newestAt => _reportCreatedAt(representative);

  bool get isEscalated =>
      reports.any((report) => report.data()['status'] == 'escalated');

  _StaffReportCategory get category => switch (collection) {
    'reports' => _StaffReportCategory.shout,
    'commentReports' => _StaffReportCategory.comment,
    _ => _StaffReportCategory.privateReply,
  };
}

DateTime _reportCreatedAt(QueryDocumentSnapshot<Map<String, dynamic>> report) =>
    (report.data()['createdAt'] as Timestamp?)?.toDate() ?? DateTime(1970);

class _StaffReports extends StatefulWidget {
  const _StaffReports({required this.role});

  final AccountRole role;

  @override
  State<_StaffReports> createState() => _StaffReportsState();
}

class _StaffReportsState extends State<_StaffReports> {
  static const _collections = [
    'reports',
    'commentReports',
    'privateReplyReports',
  ];

  final _documents =
      <String, List<QueryDocumentSnapshot<Map<String, dynamic>>>>{};
  final _subscriptions =
      <StreamSubscription<QuerySnapshot<Map<String, dynamic>>>>[];
  final _loadedCollections = <String>{};
  _StaffReportCategory _category = _StaffReportCategory.all;
  _StaffReportOrder _order = _StaffReportOrder.mostReported;
  String? _error;

  @override
  void initState() {
    super.initState();
    for (final collection in _collections) {
      Query<Map<String, dynamic>> query = FirebaseFirestore.instance.collection(
        collection,
      );
      query = widget.role.isAtLeast(AccountRole.seniorModerator)
          ? query.where('status', whereIn: ['open', 'escalated'])
          : query.where('status', isEqualTo: 'open');
      query = query.limit(_moderationPageSize);
      final subscription = query.snapshots().listen(
        (snapshot) {
          if (!mounted) return;
          setState(() {
            _documents[collection] = snapshot.docs;
            _loadedCollections.add(collection);
            _error = null;
          });
        },
        onError: (_) {
          if (!mounted) return;
          setState(() {
            _loadedCollections.add(collection);
            _error = 'Některá hlášení se nepodařilo načíst.';
          });
        },
      );
      _subscriptions.add(subscription);
    }
  }

  @override
  void dispose() {
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
    super.dispose();
  }

  List<_StaffReportGroup> get _groups {
    final grouped = <String, _StaffReportGroup>{};
    for (final entry in _documents.entries) {
      for (final report in entry.value) {
        final data = report.data();
        final target = switch (entry.key) {
          'reports' => data['shoutId'],
          'commentReports' => '${data['shoutId']}/${data['commentId']}',
          _ => '${data['shoutId']}/${data['privateReplyId']}',
        };
        final key = '${entry.key}:$target';
        grouped
            .putIfAbsent(
              key,
              () => _StaffReportGroup(
                collection: entry.key,
                targetKey: target.toString(),
              ),
            )
            .reports
            .add(report);
      }
    }
    final groups = grouped.values
        .where(
          (group) =>
              _category == _StaffReportCategory.all ||
              group.category == _category,
        )
        .toList();
    groups.sort(
      (a, b) => switch (_order) {
        _StaffReportOrder.mostReported =>
          b.reports.length.compareTo(a.reports.length) != 0
              ? b.reports.length.compareTo(a.reports.length)
              : b.newestAt.compareTo(a.newestAt),
        _StaffReportOrder.newest => b.newestAt.compareTo(a.newestAt),
        _StaffReportOrder.oldest => a.newestAt.compareTo(b.newestAt),
      },
    );
    return groups;
  }

  @override
  Widget build(BuildContext context) {
    final groups = _groups;
    final loading = _loadedCollections.length < _collections.length;
    return Column(
      children: [
        Material(
          color: Theme.of(context).colorScheme.surfaceContainerLowest,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Wrap(
              spacing: 8,
              runSpacing: 10,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                for (final category in _StaffReportCategory.values)
                  FilterChip(
                    selected: _category == category,
                    label: Text(_categoryLabel(category)),
                    onSelected: (_) => setState(() => _category = category),
                  ),
                const SizedBox(width: 12),
                DropdownButton<_StaffReportOrder>(
                  value: _order,
                  onChanged: (value) {
                    if (value != null) setState(() => _order = value);
                  },
                  items: _StaffReportOrder.values
                      .map(
                        (order) => DropdownMenuItem(
                          value: order,
                          child: Text(_orderLabel(order)),
                        ),
                      )
                      .toList(),
                ),
              ],
            ),
          ),
        ),
        if (loading) const LinearProgressIndicator(),
        if (_error != null)
          MaterialBanner(
            content: Text(_error!),
            actions: [
              TextButton(
                onPressed: () => setState(() => _error = null),
                child: const Text('Skrýt'),
              ),
            ],
          ),
        Expanded(
          child: loading && groups.isEmpty
              ? const Center(child: Text('Načítám moderátorskou frontu…'))
              : groups.isEmpty
              ? const Center(child: Text('Žádná otevřená hlášení.'))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: groups.length,
                  itemBuilder: (context, index) =>
                      _StaffReportCard(group: groups[index], role: widget.role),
                ),
        ),
      ],
    );
  }
}

class _StaffReportCard extends StatelessWidget {
  const _StaffReportCard({required this.group, required this.role});

  final _StaffReportGroup group;
  final AccountRole role;

  @override
  Widget build(BuildContext context) {
    final report = group.representative;
    final data = report.data();
    return Card(
      child: ListTile(
        leading: Badge(
          label: Text('${group.reports.length}'),
          child: Icon(_categoryIcon(group.category), size: 30),
        ),
        title: Text(data['reason'] as String? ?? 'Bez uvedeného důvodu'),
        subtitle: Text(
          '${_categoryLabel(group.category)} · ${group.reports.length}× nahlášeno\n'
          '${group.isEscalated ? 'Předáno senior moderátorovi' : 'Poslední hlášení: ${_reportDateLabel(context, group.newestAt)}'}',
        ),
        isThreeLine: true,
        onTap: () => showDialog<void>(
          context: context,
          builder: (dialogContext) => _ReportDetailDialog(
            report: report,
            collection: group.collection,
            decisionBuilder: (_) => _ReportDecisionPanel(
              group: group,
              role: role,
              onDecision: (action, note) =>
                  _actOnGroup(dialogContext, action, note),
              onCompleted: () => Navigator.pop(dialogContext),
            ),
          ),
        ),
        trailing: Icon(
          group.isEscalated ? Icons.upgrade_outlined : Icons.chevron_right,
        ),
      ),
    );
  }

  Future<void> _actOnGroup(
    BuildContext context,
    String action,
    String note,
  ) async {
    final representative = group.representative;
    if (action == 'approve') return _approveReports(note);
    if (action == 'escalate') return _escalateReports(note);

    if (group.category == _StaffReportCategory.privateReply) {
      final data = representative.data();
      if (action == 'remove') {
        await FirebaseFirestore.instance
            .collection('shouts')
            .doc(data['shoutId'] as String)
            .collection('privateReplies')
            .doc(data['privateReplyId'] as String)
            .delete();
        await _resolveRemainingReports(null, resolution: 'contentRemoved');
        return;
      }
      final helper = _ReportList(collection: 'commentReports', role: role);
      final confirmed = await helper._confirmSanction(
        context: context,
        userId: data['authorId'] as String,
        reason: data['reason'] as String? ?? action,
        action: action,
      );
      if (!confirmed) return;
      await helper._recordSanction(
        report: representative,
        userId: data['authorId'] as String,
        reason: data['reason'] as String? ?? action,
        action: action,
        sourceContentType: 'privateReply',
        sourceContentId: data['privateReplyId'] as String,
        contentSnapshot: data,
      );
      await _resolveRemainingReports(representative.id);
      return;
    }

    final completed = await _ReportList(
      collection: group.collection,
      role: role,
    )._act(context, representative, action);
    if (completed) await _resolveRemainingReports(representative.id);
  }

  String get _clearanceId {
    final data = group.representative.data();
    return switch (group.category) {
      _StaffReportCategory.shout => 'shout_${data['shoutId']}',
      _StaffReportCategory.comment =>
        'comment_${data['shoutId']}_${data['commentId']}',
      _StaffReportCategory.privateReply =>
        'privateReply_${data['shoutId']}_${data['privateReplyId']}',
      _StaffReportCategory.all => throw StateError('invalid-category'),
    };
  }

  Future<void> _approveReports(String note) async {
    final firestore = FirebaseFirestore.instance;
    final data = group.representative.data();
    final batch = firestore.batch();
    batch.set(firestore.collection('moderationClearances').doc(_clearanceId), {
      'targetType': switch (group.category) {
        _StaffReportCategory.shout => 'shout',
        _StaffReportCategory.comment => 'comment',
        _StaffReportCategory.privateReply => 'privateReply',
        _StaffReportCategory.all => throw StateError('invalid-category'),
      },
      'shoutId': data['shoutId'],
      'contentId': switch (group.category) {
        _StaffReportCategory.shout => data['shoutId'],
        _StaffReportCategory.comment => data['commentId'],
        _StaffReportCategory.privateReply => data['privateReplyId'],
        _StaffReportCategory.all => throw StateError('invalid-category'),
      },
      'createdAt': FieldValue.serverTimestamp(),
      'moderatorId': FirebaseAuth.instance.currentUser!.uid,
      'reason': note.isEmpty ? 'Obsah byl zkontrolován a je v pořádku.' : note,
      'sourceReportIds': group.reports.map((report) => report.id).toList(),
    });
    for (final report in group.reports) {
      batch.update(report.reference, {
        'status': 'resolved',
        'resolution': 'contentApproved',
        'resolvedAt': FieldValue.serverTimestamp(),
        if (note.isNotEmpty) 'moderatorNote': note,
      });
    }
    await batch.commit();
  }

  Future<void> _escalateReports(String note) async {
    final openReports = group.reports.where(
      (report) => report.data()['status'] == 'open',
    );
    final batch = FirebaseFirestore.instance.batch();
    for (final report in openReports) {
      batch.update(report.reference, {
        'status': 'escalated',
        'assignedRole': 'seniorModerator',
        'escalatedAt': FieldValue.serverTimestamp(),
        'escalatedBy': FirebaseAuth.instance.currentUser!.uid,
        if (note.isNotEmpty) 'escalationNote': note,
      });
    }
    await batch.commit();
  }

  Future<void> _resolveRemainingReports(
    String? exceptId, {
    String? resolution,
  }) async {
    final remaining = group.reports
        .where((report) => report.id != exceptId)
        .toList();
    if (remaining.isEmpty) return;
    final batch = FirebaseFirestore.instance.batch();
    for (final report in remaining) {
      final update = <String, dynamic>{
        'status': 'resolved',
        'resolvedAt': FieldValue.serverTimestamp(),
      };
      if (resolution != null) update['resolution'] = resolution;
      batch.update(report.reference, update);
    }
    await batch.commit();
  }
}

class _ReportDecisionOption {
  const _ReportDecisionOption(this.value, this.label);
  final String value;
  final String label;
}

class _ReportDecisionPanel extends StatefulWidget {
  const _ReportDecisionPanel({
    required this.group,
    required this.role,
    required this.onDecision,
    required this.onCompleted,
  });

  final _StaffReportGroup group;
  final AccountRole role;
  final Future<void> Function(String action, String note) onDecision;
  final VoidCallback onCompleted;

  @override
  State<_ReportDecisionPanel> createState() => _ReportDecisionPanelState();
}

class _ReportDecisionPanelState extends State<_ReportDecisionPanel> {
  final _noteController = TextEditingController();
  String? _decision;
  bool _saving = false;
  String? _error;

  List<_ReportDecisionOption> get _options => [
    const _ReportDecisionOption('approve', 'Bez postihu – obsah je v pořádku'),
    if (!widget.group.isEscalated)
      const _ReportDecisionOption('escalate', 'Odeslat senior moderátorovi'),
    const _ReportDecisionOption('remove', 'Skrýt obsah bez postihu'),
    const _ReportDecisionOption('warning', 'Udělit varování'),
    const _ReportDecisionOption('restrict1d', 'Omezit tvorbu na 1 den'),
    const _ReportDecisionOption('restrict7d', 'Omezit tvorbu na 7 dnů'),
    const _ReportDecisionOption('restrict30d', 'Omezit tvorbu na 30 dnů'),
    const _ReportDecisionOption('ban1d', 'Ban na 1 den'),
    const _ReportDecisionOption('ban7d', 'Ban na 7 dnů'),
    const _ReportDecisionOption('ban30d', 'Ban na 30 dnů'),
    if (widget.role.isAtLeast(AccountRole.seniorModerator))
      const _ReportDecisionOption('ban90d', 'Ban na 90 dnů'),
    if (widget.role.isAtLeast(AccountRole.seniorModerator))
      const _ReportDecisionOption('banPermanent', 'Trvalý ban'),
  ];

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final decision = _decision;
    if (decision == null || _saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.onDecision(decision, _noteController.text.trim());
      if (mounted) widget.onCompleted();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Rozhodnutí se nepodařilo uložit.';
      });
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    mainAxisSize: MainAxisSize.min,
    children: [
      DropdownButtonFormField<String>(
        initialValue: _decision,
        decoration: const InputDecoration(labelText: 'Rozhodnutí'),
        items: _options
            .map(
              (option) => DropdownMenuItem(
                value: option.value,
                child: Text(option.label),
              ),
            )
            .toList(),
        onChanged: _saving
            ? null
            : (value) => setState(() => _decision = value),
      ),
      const SizedBox(height: 10),
      TextField(
        controller: _noteController,
        enabled: !_saving,
        maxLength: 500,
        maxLines: 2,
        decoration: const InputDecoration(
          labelText: 'Interní poznámka nebo důvod předání',
        ),
      ),
      if (_error != null)
        Text(
          _error!,
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      Align(
        alignment: Alignment.centerRight,
        child: FilledButton.icon(
          onPressed: _decision == null || _saving ? null : _submit,
          icon: _saving
              ? const SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.check),
          label: const Text('Uložit rozhodnutí'),
        ),
      ),
    ],
  );
}

String _categoryLabel(_StaffReportCategory category) => switch (category) {
  _StaffReportCategory.all => 'Všechna',
  _StaffReportCategory.shout => 'Shouty',
  _StaffReportCategory.comment => 'Komentáře',
  _StaffReportCategory.privateReply => 'Soukromé odpovědi',
};

IconData _categoryIcon(_StaffReportCategory category) => switch (category) {
  _StaffReportCategory.all => Icons.flag_outlined,
  _StaffReportCategory.shout => Icons.campaign_outlined,
  _StaffReportCategory.comment => Icons.chat_bubble_outline,
  _StaffReportCategory.privateReply => Icons.lock_outline,
};

String _orderLabel(_StaffReportOrder order) => switch (order) {
  _StaffReportOrder.mostReported => 'Nejvíce hlášení',
  _StaffReportOrder.newest => 'Nejnovější',
  _StaffReportOrder.oldest => 'Nejstarší',
};

String _reportDateLabel(BuildContext context, DateTime date) =>
    '${MaterialLocalizations.of(context).formatMediumDate(date)} '
    '${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(date))}';
