part of '../main.dart';

class StaffWorkspace extends StatelessWidget {
  const StaffWorkspace({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return StreamBuilder<AccountRole>(
      stream: _watchAccountRole(user.uid),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _StaffLoadError(
            message: 'Roli se nepodařilo načíst. Obnovte stránku.',
            onRetry: () => Navigator.pushReplacementNamed(context, '/admin'),
          );
        }
        if (!snapshot.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        final role = snapshot.data!;
        if (!role.isAtLeast(AccountRole.moderator)) {
          return Scaffold(
            appBar: AppBar(title: const Text('ShoutOut')),
            body: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.lock_outline, size: 56),
                  const SizedBox(height: 12),
                  const Text('Pro tuto část nemáte oprávnění.'),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () =>
                        Navigator.pushReplacementNamed(context, '/'),
                    child: const Text('Zpět do aplikace'),
                  ),
                ],
              ),
            ),
          );
        }
        return _StaffShell(role: role);
      },
    );
  }
}

class _StaffLoadError extends StatelessWidget {
  const _StaffLoadError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('ShoutOut')),
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_outlined, size: 52),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(onPressed: onRetry, child: const Text('Zkusit znovu')),
          ],
        ),
      ),
    ),
  );
}

class _StaffDestination {
  const _StaffDestination({
    required this.label,
    required this.icon,
    required this.page,
  });

  final String label;
  final IconData icon;
  final Widget page;
}

class _StaffShell extends StatefulWidget {
  const _StaffShell({required this.role});

  final AccountRole role;

  @override
  State<_StaffShell> createState() => _StaffShellState();
}

class _StaffShellState extends State<_StaffShell> {
  var _selectedIndex = 0;

  void _openDestination(String label) {
    final index = _destinations.indexWhere(
      (destination) => destination.label == label,
    );
    if (index >= 0) setState(() => _selectedIndex = index);
  }

  List<_StaffDestination> get _destinations => [
    _StaffDestination(
      label: 'Přehled',
      icon: Icons.dashboard_outlined,
      page: _StaffOverview(
        role: widget.role,
        onOpenReports: () => _openDestination('Hlášení'),
      ),
    ),
    _StaffDestination(
      label: 'Shouty',
      icon: Icons.public_outlined,
      page: _StaffShouts(role: widget.role),
    ),
    _StaffDestination(
      label: 'Hlášení',
      icon: Icons.flag_outlined,
      page: _StaffReports(role: widget.role),
    ),
    const _StaffDestination(
      label: 'Postihy',
      icon: Icons.gavel_outlined,
      page: _SanctionHistoryList(),
    ),
    _StaffDestination(
      label: 'Uživatelé',
      icon: Icons.people_outline,
      page: _StaffUserSearch(role: widget.role),
    ),
    if (widget.role.isAtLeast(AccountRole.administrator))
      _StaffDestination(
        label: 'Systém',
        icon: Icons.settings_suggest_outlined,
        page: _SystemOversight(role: widget.role),
      ),
  ];

  @override
  Widget build(BuildContext context) {
    final destinations = _destinations;
    if (_selectedIndex >= destinations.length) _selectedIndex = 0;
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final content = IndexedStack(
      index: _selectedIndex,
      children: destinations.map((destination) => destination.page).toList(),
    );
    return Scaffold(
      appBar: AppBar(
        title: Text('ShoutOut – ${destinations[_selectedIndex].label}'),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Center(child: Text(_staffRoleLabel(widget.role))),
          ),
          IconButton(
            tooltip: 'Běžná aplikace',
            onPressed: () => Navigator.pushReplacementNamed(context, '/'),
            icon: const Icon(Icons.campaign_outlined),
          ),
        ],
      ),
      body: wide
          ? Row(
              children: [
                NavigationRail(
                  selectedIndex: _selectedIndex,
                  labelType: NavigationRailLabelType.all,
                  onDestinationSelected: (index) =>
                      setState(() => _selectedIndex = index),
                  destinations: destinations
                      .map(
                        (destination) => NavigationRailDestination(
                          icon: Icon(destination.icon),
                          label: Text(destination.label),
                        ),
                      )
                      .toList(),
                ),
                const VerticalDivider(width: 1),
                Expanded(child: content),
              ],
            )
          : content,
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: _selectedIndex,
              onDestinationSelected: (index) =>
                  setState(() => _selectedIndex = index),
              destinations: destinations
                  .map(
                    (destination) => NavigationDestination(
                      icon: Icon(destination.icon),
                      label: destination.label,
                    ),
                  )
                  .toList(),
            ),
    );
  }
}

class _StaffOverview extends StatelessWidget {
  const _StaffOverview({required this.role, required this.onOpenReports});

  final AccountRole role;
  final VoidCallback onOpenReports;

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      Text(
        'Pracovní prostředí',
        style: Theme.of(context).textTheme.headlineMedium,
      ),
      const SizedBox(height: 8),
      Text(
        role.isAtLeast(AccountRole.administrator)
            ? 'Systémový dohled, audit a správa provozu.'
            : role.isAtLeast(AccountRole.seniorModerator)
            ? 'Vedení moderace, dlouhé postihy a kontrola rozhodnutí.'
            : 'Zpracování hlášení a každodenní ochrana komunity.',
      ),
      const SizedBox(height: 24),
      Wrap(
        spacing: 16,
        runSpacing: 16,
        children: [
          _StaffInfoCard(
            icon: Icons.flag_outlined,
            title: 'Hlášení',
            description: role.isAtLeast(AccountRole.administrator)
                ? 'Dohled nad moderátorskou frontou.'
                : 'Otevřená hlášení Shoutů, komentářů a soukromých odpovědí.',
            onTap: onOpenReports,
          ),
          const _StaffInfoCard(
            icon: Icons.gavel_outlined,
            title: 'Postihy',
            description: 'Historie rozhodnutí, důvody a uložené snímky obsahu.',
          ),
          if (role.isAtLeast(AccountRole.administrator))
            const _StaffInfoCard(
              icon: Icons.admin_panel_settings_outlined,
              title: 'Systém',
              description: 'Role, business účty a bezpečnostní dohled.',
            ),
        ],
      ),
    ],
  );
}

class _StaffInfoCard extends StatelessWidget {
  const _StaffInfoCard({
    required this.icon,
    required this.title,
    required this.description,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String description;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 300,
    child: Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(icon, size: 32),
                  const Spacer(),
                  if (onTap != null) const Icon(Icons.chevron_right),
                ],
              ),
              const SizedBox(height: 12),
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 6),
              Text(description),
            ],
          ),
        ),
      ),
    ),
  );
}

class _SystemOversight extends StatefulWidget {
  const _SystemOversight({required this.role});

  final AccountRole role;

  @override
  State<_SystemOversight> createState() => _SystemOversightState();
}

class _SystemOversightState extends State<_SystemOversight> {
  static const _pageSize = 25;
  final _searchController = TextEditingController();
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> _logs = [];
  bool _loading = false;
  bool _hasMore = true;
  Object? _loadError;

  @override
  void initState() {
    super.initState();
    _recordTechnicalLogAccess(widget.role);
    _loadNextPage();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadNextPage({bool refresh = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _loadError = null;
      if (refresh) {
        _logs.clear();
        _hasMore = true;
      }
    });
    try {
      Query<Map<String, dynamic>> query = FirebaseFirestore.instance
          .collection('clientErrorLogs')
          .where(
            'createdAt',
            isGreaterThanOrEqualTo: Timestamp.fromDate(
              DateTime.now().toUtc().subtract(const Duration(days: 60)),
            ),
          )
          .orderBy('createdAt', descending: true)
          .limit(_pageSize);
      if (_logs.isNotEmpty) query = query.startAfterDocument(_logs.last);
      final page = await query.get();
      if (!mounted) return;
      setState(() {
        _logs.addAll(page.docs);
        _hasMore = page.docs.length == _pageSize;
      });
    } catch (error) {
      if (mounted) setState(() => _loadError = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<QueryDocumentSnapshot<Map<String, dynamic>>> get _visibleLogs {
    final search = _searchController.text.trim().toLowerCase();
    if (search.isEmpty) return _logs;
    return _logs.where((document) {
      final data = document.data();
      return ['action', 'code', 'message', 'userId'].any(
        (field) =>
            (data[field] ?? '').toString().toLowerCase().contains(search),
      );
    }).toList();
  }

  String _formatTimestamp(BuildContext context, Timestamp? timestamp) {
    if (timestamp == null) return '—';
    final local = timestamp.toDate().toLocal();
    final material = MaterialLocalizations.of(context);
    return '${material.formatMediumDate(local)} '
        '${material.formatTimeOfDay(TimeOfDay.fromDateTime(local))}';
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      Text(
        'Systémový dohled',
        style: Theme.of(context).textTheme.headlineMedium,
      ),
      const SizedBox(height: 16),
      const ListTile(
        leading: Icon(Icons.manage_accounts_outlined),
        title: Text('Role pracovníků'),
        subtitle: Text('Zápis rolí čeká na chráněnou serverovou operaci.'),
      ),
      const ListTile(
        leading: Icon(Icons.business_outlined),
        title: Text('Business účty'),
        subtitle: Text('Schvalovací proces zatím není implementovaný.'),
      ),
      const ListTile(
        leading: Icon(Icons.policy_outlined),
        title: Text('Audit a monitoring'),
        subtitle: Text('Přístupy se auditují a záznamy mají 60denní retenci.'),
      ),
      const Divider(height: 32),
      Text(
        'Poslední technické chyby',
        style: Theme.of(context).textTheme.titleLarge,
      ),
      const SizedBox(height: 8),
      TextField(
        controller: _searchController,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(
          labelText: 'Filtrovat načtené záznamy',
          hintText: 'Akce, kód, zpráva nebo UID',
          prefixIcon: const Icon(Icons.search),
          suffixIcon: _searchController.text.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Vymazat filtr',
                  onPressed: () {
                    _searchController.clear();
                    setState(() {});
                  },
                  icon: const Icon(Icons.clear),
                ),
        ),
      ),
      const SizedBox(height: 8),
      if (_loadError != null)
        ListTile(
          leading: const Icon(Icons.error_outline),
          title: const Text('Technické chyby se nepodařilo načíst.'),
          trailing: TextButton(
            onPressed: _loading ? null : _loadNextPage,
            child: const Text('Zkusit znovu'),
          ),
        )
      else if (!_loading && _logs.isEmpty)
        const ListTile(title: Text('Žádné zaznamenané technické chyby.'))
      else if (_visibleLogs.isEmpty)
        const ListTile(title: Text('Filtru neodpovídá žádný načtený záznam.'))
      else
        ..._visibleLogs.map((document) {
          final data = document.data();
          return ExpansionTile(
            leading: const Icon(Icons.bug_report_outlined),
            title: Text(
              '${data['action'] ?? 'unknown'} · ${data['code'] ?? 'unknown'}',
            ),
            subtitle: Text(
              _formatTimestamp(context, data['createdAt'] as Timestamp?),
            ),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: SelectableText(data['message'] as String? ?? '—'),
              ),
              const SizedBox(height: 6),
              Align(
                alignment: Alignment.centerLeft,
                child: SelectableText('UID: ${data['userId'] ?? '—'}'),
              ),
            ],
          );
        }),
      if (_loading)
        const Padding(
          padding: EdgeInsets.all(16),
          child: Center(child: CircularProgressIndicator()),
        )
      else if (_hasMore)
        Center(
          child: OutlinedButton.icon(
            onPressed: _loadNextPage,
            icon: const Icon(Icons.expand_more),
            label: const Text('Načíst dalších 25'),
          ),
        ),
      Align(
        alignment: Alignment.centerRight,
        child: TextButton.icon(
          onPressed: _loading ? null : () => _loadNextPage(refresh: true),
          icon: const Icon(Icons.refresh),
          label: const Text('Obnovit'),
        ),
      ),
      if (widget.role == AccountRole.owner)
        const ListTile(
          leading: Icon(Icons.security_outlined),
          title: Text('Bezpečnost vlastníka'),
          subtitle: Text('Citlivé operace budou vyžadovat nové ověření a 2FA.'),
        ),
    ],
  );
}

String _staffRoleLabel(AccountRole role) => switch (role) {
  AccountRole.moderator => 'Moderátor',
  AccountRole.seniorModerator => 'Senior moderátor',
  AccountRole.administrator => 'Administrátor',
  AccountRole.owner => 'Vlastník',
  AccountRole.business => 'Business',
  AccountRole.user => 'Uživatel',
};
