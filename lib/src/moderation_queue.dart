part of '../main.dart';

class _ServerStaffReports extends StatefulWidget {
  const _ServerStaffReports({required this.role});
  final AccountRole role;
  @override
  State<_ServerStaffReports> createState() => _ServerStaffReportsState();
}

class _ServerStaffReportsState extends State<_ServerStaffReports> {
  late final _actor = FirebaseAuth.instance.currentUser?.uid;
  late final _controller = ModerationQueueController(
    send: _moderationQueueTransport,
    currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  );
  @override
  void initState() {
    super.initState();
    unawaited(_controller.refresh());
  }

  @override
  void didUpdateWidget(_ServerStaffReports oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.role != widget.role) unawaited(_controller.refresh());
  }

  @override
  void dispose() {
    if (_actor != null && FirebaseAuth.instance.currentUser?.uid != _actor) {
      _moderationCaseDecisions.forgetUser(_actor);
    }
    _controller.dispose();
    super.dispose();
  }

  Future<void> _open(ModerationCaseRecord record) async {
    final actor = FirebaseAuth.instance.currentUser?.uid;
    if (actor == null) return;
    try {
      final collection = switch (record.targetType) {
        'shout' => 'reports',
        'comment' => 'commentReports',
        _ => 'privateReplyReports',
      };
      Query<Map<String, dynamic>> query = FirebaseFirestore.instance
          .collection(collection)
          .where('shoutId', isEqualTo: record.shoutId);
      if (record.targetType != 'shout') {
        query = query.where(
          record.targetType == 'comment' ? 'commentId' : 'privateReplyId',
          isEqualTo: record.targetId,
        );
      }
      final rows = await query
          .where('status', whereIn: const ['open', 'escalated'])
          .limit(50)
          .get();
      if (!mounted || actor != FirebaseAuth.instance.currentUser?.uid) return;
      if (rows.docs.isEmpty) {
        await _controller.refresh();
        return;
      }
      final representative = rows.docs.firstWhere(
        (r) => r.id == record.representative['id'],
        orElse: () => rows.docs.first,
      );
      final completed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => _ReportDetailDialog(
          report: representative,
          collection: collection,
          decisionBuilder: (_) => ModerationCaseDecisionPanel(
            record: record,
            isSenior: widget.role.isAtLeast(AccountRole.seniorModerator),
            client: _moderationCaseDecisions,
            currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
            decisionItems: (pending) => staffReportDecisionItems(
              serverDecisions: true,
              isEscalated: record.escalatedCount > 0,
              role: widget.role,
              pendingDecision: pending,
            ),
            failureText: (context, error) => _serverWriteFailureText(
              context,
              error,
              fallback: 'Rozhodnutí se nepodařilo dokončit.',
            ),
            onComplete: () => Navigator.pop(dialogContext, true),
          ),
        ),
      );
      if (completed == true &&
          mounted &&
          actor == FirebaseAuth.instance.currentUser?.uid) {
        await _controller.refresh();
      }
    } catch (e) {
      if (mounted && actor == FirebaseAuth.instance.currentUser?.uid) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _serverWriteFailureText(
                context,
                e,
                fallback: 'Případ se nepodařilo otevřít.',
              ),
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => ModerationQueueView(
    controller: _controller,
    onOpen: _open,
    locationFilter: _ModerationQueueLocationFilter(
      onApply: (area) => _controller.refresh(
        nextQuery: ModerationQueueQuery(
          category: _controller.query.category,
          order: _controller.query.order,
          area: area,
        ),
      ),
    ),
  );
}

class _PagedGlobalStaffSanctions extends StatelessWidget {
  const _PagedGlobalStaffSanctions();
  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return const SizedBox.shrink();
    return StreamBuilder<AccountRole>(
      stream: _watchAccountRole(uid),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        return _PagedStaffSanctions(key: ValueKey(uid), role: snapshot.data!);
      },
    );
  }
}

class _PagedStaffSanctions extends StatefulWidget {
  const _PagedStaffSanctions({
    super.key,
    required this.role,
    this.userId,
    this.enforcement,
    this.currentSanctionIds = const {},
    this.header,
    this.onRevoked,
  });
  final AccountRole role;
  final String? userId;
  final StaffEnforcementState? enforcement;
  final Set<String> currentSanctionIds;
  final Widget? header;
  final VoidCallback? onRevoked;
  @override
  State<_PagedStaffSanctions> createState() => _PagedStaffSanctionsState();
}

class _PagedStaffSanctionsState extends State<_PagedStaffSanctions> {
  late final _pager = StaffHistoryPager(
    loadPage: _loadPage,
    currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
    activeIds: widget.enforcement?.activeSanctionIds ?? const {},
  );
  @override
  void initState() {
    super.initState();
    unawaited(_pager.loadMore());
  }

  @override
  void dispose() {
    _pager.dispose();
    super.dispose();
  }

  Future<StaffHistoryPage> _loadPage(Object? cursor) async {
    final actor = FirebaseAuth.instance.currentUser?.uid;
    final db = FirebaseFirestore.instance;
    Query<Map<String, dynamic>> query = db.collection('sanctions');
    if (widget.userId != null) {
      query = query.where('userId', isEqualTo: widget.userId);
    }
    query = query
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true);
    if (cursor != null) {
      query = query.startAfterDocument(
        cursor as DocumentSnapshot<Map<String, dynamic>>,
      );
    }
    final page = await query
        .limit(50)
        .get(const GetOptions(source: Source.server));
    final documents = {for (final d in page.docs) d.id: d.data()};
    // Existing active pointers stay at the top even outside the loaded page.
    // Supplement by exact IDs; never scan or silently truncate the full history.
    if (cursor == null) {
      final ids = (widget.enforcement?.activeSanctionIds ?? const <String>{})
          .where((id) => !documents.containsKey(id))
          .toList();
      if (ids.isNotEmpty) {
        final active = await db
            .collection('sanctions')
            .where(FieldPath.documentId, whereIn: ids)
            .limit(ids.length)
            .get(const GetOptions(source: Source.server));
        for (final row in active.docs) {
          if (row.data()['userId'] == widget.userId) {
            documents[row.id] = row.data();
          }
        }
      }
    }
    final ids = documents.keys.toList(),
        revocations = <String, Map<String, dynamic>>{};
    // Firestore's IN query limit is30. Two bounded lookups replace up to52
    // individual missing-document reads for a page plus current active pointers.
    for (var offset = 0; offset < ids.length; offset += 30) {
      final chunk = ids.sublist(offset, (offset + 30).clamp(0, ids.length));
      final rows = await db
          .collection('sanctionRevocations')
          .where(FieldPath.documentId, whereIn: chunk)
          .limit(chunk.length)
          .get(const GetOptions(source: Source.server));
      for (final row in rows.docs) {
        revocations[row.id] = row.data();
      }
    }
    if (actor == null || FirebaseAuth.instance.currentUser?.uid != actor) {
      throw StateError('The signed-in account changed.');
    }
    return StaffHistoryPage([
      for (final e in documents.entries)
        StaffSanctionRecord(
          id: e.key,
          data: e.value,
          revocation: revocations[e.key],
        ),
    ], page.docs.length == 50 ? page.docs.last : null);
  }

  @override
  Widget build(BuildContext context) => PagedStaffHistory(
    pager: _pager,
    header: widget.header,
    cardBuilder: (record) {
      if (widget.userId != null) {
        return _UserSanctionCard(
          sanction: record,
          currentRole: widget.role,
          activeSanctionIds: widget.enforcement?.activeSanctionIds ?? const {},
          currentSanctionIds: widget.currentSanctionIds,
          onRevoked: widget.onRevoked ?? () {},
        );
      }
      return StaffSanctionHistoryCard(
        record: record,
        active: false,
        sourceText:
            'Uživatel: ${record.data['userId'] ?? ''}\n${_snapshotText(record.data['contentSnapshot'])}',
        revokeButton: record.data['userId'] is String
            ? TextButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => _StaffUserDetail(
                      userId: record.data['userId'] as String,
                      role: widget.role,
                    ),
                  ),
                ),
                child: const Text('Otevřít uživatele'),
              )
            : null,
      );
    },
  );
}

class _ModerationQueueLocationFilter extends StatefulWidget {
  const _ModerationQueueLocationFilter({required this.onApply});
  final Future<void> Function(Map<String, dynamic>) onApply;
  @override
  State<_ModerationQueueLocationFilter> createState() =>
      _ModerationQueueLocationFilterState();
}

class _ModerationQueueLocationFilterState
    extends State<_ModerationQueueLocationFilter> {
  final _text = TextEditingController();
  String _kind = 'all';
  String? _error;
  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _selected(AddressSelection selection) async {
    Map<String, dynamic>? area;
    if (_kind == 'country' &&
        RegExp(r'^[A-Z]{2}$').hasMatch(selection.countryCode)) {
      area = {'kind': 'country', 'value': selection.countryCode};
    }
    if (_kind == 'state') {
      final code = selection.stateCode?.toUpperCase() ?? '';
      final iso = code.startsWith('${selection.countryCode}-')
          ? code
          : '${selection.countryCode}-$code';
      if (RegExp(r'^[A-Z]{2}-[A-Z0-9-]{1,8}$').hasMatch(iso)) {
        area = {'kind': 'subdivision', 'value': iso};
      }
    }
    area ??= selection.bounds == null
        ? null
        : {'kind': 'bounds', 'value': selection.bounds};
    if (area == null) {
      setState(
        () => _error =
            'Pro vybrané místo chybí hranice. Použij kód země/oblasti nebo geohash.',
      );
      return;
    }
    setState(() => _error = null);
    await widget.onApply(area);
  }

  Future<void> _manual() async {
    final value = _text.text.trim(), normalized = value.toUpperCase();
    final area =
        _kind == 'geohash' &&
            RegExp(
              r'^[0123456789bcdefghjkmnpqrstuvwxyz]{1,7}$',
            ).hasMatch(value.toLowerCase())
        ? {'kind': 'geohash', 'value': value.toLowerCase()}
        : _kind == 'code' && RegExp(r'^[A-Z]{2}$').hasMatch(normalized)
        ? {'kind': 'country', 'value': normalized}
        : _kind == 'code' &&
              RegExp(r'^[A-Z]{2}-[A-Z0-9-]{1,8}$').hasMatch(normalized)
        ? {'kind': 'subdivision', 'value': normalized}
        : null;
    if (area == null) {
      setState(() => _error = 'Zadej platný geohash nebo kód země/oblasti.');
      return;
    }
    setState(() => _error = null);
    await widget.onApply(area);
  }

  @override
  Widget build(BuildContext context) => ExpansionTile(
    title: const Text('Filtr místa'),
    children: [
      ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 260),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              DropdownButton<String>(
                value: _kind,
                isExpanded: true,
                items: const [
                  DropdownMenuItem(value: 'all', child: Text('Celý svět')),
                  DropdownMenuItem(value: 'city', child: Text('Město')),
                  DropdownMenuItem(
                    value: 'state',
                    child: Text('Kraj / oblast'),
                  ),
                  DropdownMenuItem(value: 'country', child: Text('Stát')),
                  DropdownMenuItem(
                    value: 'code',
                    child: Text('Kód země / oblasti'),
                  ),
                  DropdownMenuItem(value: 'geohash', child: Text('Geohash')),
                ],
                onChanged: (value) {
                  if (value == null) return;
                  setState(() {
                    _kind = value;
                    _error = null;
                    _text.clear();
                  });
                  if (value == 'all') {
                    unawaited(widget.onApply({'kind': 'all', 'value': ''}));
                  }
                },
              ),
              if (['city', 'state', 'country'].contains(_kind))
                AddressAutocompleteField(
                  key: ValueKey(_kind),
                  controller: _text,
                  countryCode: '',
                  searchType: _kind,
                  label: 'Vyhledat místo',
                  onSelected: (selection) => unawaited(_selected(selection)),
                ),
              if (['code', 'geohash'].contains(_kind))
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _text,
                        decoration: InputDecoration(
                          labelText: _kind == 'code'
                              ? 'Např. CZ nebo CZ-42'
                              : 'Geohash oblasti',
                        ),
                      ),
                    ),
                    TextButton(onPressed: _manual, child: const Text('Použít')),
                  ],
                ),
              if (['city', 'state'].contains(_kind))
                const Text(
                  'Filtr okolí podle geohashů může zahrnout i okraj sousední obce. Pro přesnou správní oblast použij její kód.',
                ),
              if (_error != null)
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
            ],
          ),
        ),
      ),
    ],
  );
}
