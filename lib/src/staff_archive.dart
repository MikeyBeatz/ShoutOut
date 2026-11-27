part of '../main.dart';

class _StaffArchive extends StatefulWidget {
  const _StaffArchive({this.selection, this.caseReference});
  final Map<String, dynamic>? selection;
  final String? caseReference;
  @override
  State<_StaffArchive> createState() => _StaffArchiveState();
}

class _StaffArchiveState extends State<_StaffArchive> {
  final _contact = TextEditingController(), _case = TextEditingController();
  late final ArchiveIdentityController _controller;
  StreamSubscription<User?>? _authScope;
  StreamSubscription<AccountRole>? _roleScope;
  bool _scopeClosed = false;
  String _type = 'email';
  @override
  void initState() {
    super.initState();
    _case.text = widget.caseReference ?? '';
    final uid = FirebaseAuth.instance.currentUser!.uid;
    _controller = ArchiveIdentityController(
      userId: uid,
      currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
      send: (data) async => (await FirebaseFunctions.instanceFor(
        region: 'europe-west3',
      ).httpsCallable('getArchiveIdentityPage').call<Object?>(data)).data,
    );
    void closeScope() {
      if (!mounted || _scopeClosed) return;
      _scopeClosed = true;
      _contact.clear();
      _case.clear();
      _controller.invalidate();
    }

    _authScope = FirebaseAuth.instance.userChanges().listen((user) {
      if (user?.uid != uid) closeScope();
    });
    _roleScope = _watchAccountRole(uid).listen((role) {
      if (!role.isAtLeast(AccountRole.administrator)) closeScope();
    }, onError: (Object _) => closeScope());
    if (widget.selection != null) {
      unawaited(
        _controller.open({...widget.selection!, 'caseReference': _case.text}),
      );
    }
  }

  @override
  void dispose() {
    unawaited(_authScope?.cancel());
    unawaited(_roleScope?.cancel());
    _controller.dispose();
    _contact.dispose();
    _case.dispose();
    super.dispose();
  }

  void _open(Map<String, dynamic> selection) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Neveřejný archiv')),
          body: _StaffArchive(selection: selection, caseReference: _case.text),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _controller,
    builder: (context, _) {
      if (_scopeClosed ||
          FirebaseAuth.instance.currentUser?.uid != _controller.userId) {
        return const SizedBox.shrink();
      }
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Doložené kontaktní vazby nejsou důkazem totožnosti. Nezachycenou minulost ani definitivně smazaný obsah nelze dohledat. Každý přístup se audituje.',
          ),
          const Text(
            'Seznam obsahuje jen archivní záznamy s doloženou vazbou na konkrétní účet; starší dosud nepřevedené záznamy mohou chybět.',
          ),
          if (widget.selection == null) ...[
            TextField(
              controller: _case,
              maxLength: 200,
              decoration: const InputDecoration(
                labelText: 'Identifikátor případu (bez osobních údajů)',
              ),
            ),
            DropdownButton<String>(
              value: _type,
              items: const [
                DropdownMenuItem(value: 'email', child: Text('E-mail')),
                DropdownMenuItem(
                  value: 'phone',
                  child: Text('Telefon včetně + a předvolby'),
                ),
              ],
              onChanged: _controller.loading
                  ? null
                  : (v) => setState(() => _type = v!),
            ),
            TextField(
              controller: _contact,
              maxLength: 320,
              decoration: const InputDecoration(
                labelText: 'Přesný ověřený kontakt',
              ),
            ),
            FilledButton(
              onPressed: _controller.loading
                  ? null
                  : () {
                      if (_case.text.trim().isEmpty ||
                          _contact.text.trim().isEmpty) {
                        return;
                      }
                      unawaited(
                        _controller.open({
                          'action': 'lookup',
                          'type': _type,
                          'value': _contact.text.trim(),
                          'caseReference': _case.text.trim(),
                        }),
                      );
                    },
              child: const Text('Dohledat účty'),
            ),
          ],
          if (_controller.loading) const LinearProgressIndicator(),
          if (_controller.expired)
            const Text('Platnost načteného archivního podkladu skončila.'),
          if (_controller.failed)
            TextButton(
              onPressed: _controller.loading ? null : _controller.retry,
              child: const Text('Archiv se nepodařilo načíst. Zkusit znovu'),
            ),
          for (final row in _controller.items) _row(row),
          if (_controller.next != null)
            Align(
              alignment: Alignment.center,
              child: OutlinedButton(
                onPressed: _controller.loading ? null : _controller.more,
                child: const Text('Načíst další'),
              ),
            ),
        ],
      );
    },
  );
  Widget _row(Map<String, dynamic> row) {
    final selection = widget.selection;
    if (selection == null) {
      return ListTile(
        title: Text(row['userId'] as String? ?? ''),
        subtitle: Text('Doloženo: ${_date(row['observedAtMillis'])}'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () =>
            _open({'action': 'shouts', 'accountKey': row['accountKey']}),
      );
    }
    if (row['content'] is Map) {
      final content = row['content'] as Map;
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Archivní podklad',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              Text(
                'Publikováno: ${_date(row['createdAtMillis'])}\nZachyceno: ${_date(row['capturedAtMillis'])}\nVýmaz: ${_date(row['retainUntilMillis'])}',
              ),
              if (row['captureMode'] == 'transition')
                const Text('Pozdější doložený záchyt původního obsahu.'),
              if (row['privacyRedacted'] == true)
                const Text('Osobní reference byly odstraněny.'),
              if (content['title'] is String)
                SelectableText(content['title'] as String),
              SelectableText(content['text'] as String? ?? ''),
              Text('Autor: ${content['authorId'] ?? ''}'),
              if (row['kind'] == 'shout')
                TextButton(
                  onPressed: () => _open({
                    'action': 'comments',
                    'accountKey': selection['accountKey'],
                    'archiveKey': row['archiveKey'],
                  }),
                  child: const Text('Veřejné komentáře'),
                ),
            ],
          ),
        ),
      );
    }
    return ListTile(
      title: Text(
        '${row['kind'] == 'shout' ? 'Shout' : 'Komentář'} — ${_date(row['createdAtMillis'])}',
      ),
      subtitle: Text(row['threadId'] as String? ?? ''),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => _open({
        'action': 'detail',
        'accountKey': selection['accountKey'],
        'archiveKey': row['archiveKey'],
        if (selection['action'] == 'comments')
          'threadArchiveKey': selection['archiveKey'],
      }),
    );
  }

  String _date(Object? value) => value is num
      ? DateTime.fromMillisecondsSinceEpoch(value.toInt()).toLocal().toString()
      : 'Neznámé';
}
