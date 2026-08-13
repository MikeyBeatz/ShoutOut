part of '../main.dart';

class ChangePasswordDialog extends StatefulWidget {
  const ChangePasswordDialog({super.key});

  @override
  State<ChangePasswordDialog> createState() => _ChangePasswordDialogState();
}

class _ChangePasswordDialogState extends State<ChangePasswordDialog> {
  final _formKey = GlobalKey<FormState>();
  final _currentPassword = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirmPassword = TextEditingController();
  final _newPasswordFocus = FocusNode();
  final _confirmPasswordFocus = FocusNode();
  String? _error;
  bool _saving = false;
  bool _validationActive = false;
  bool _submitted = false;
  bool _obscureNewPassword = true;
  bool _obscureConfirmPassword = true;

  @override
  void initState() {
    super.initState();
    _newPasswordFocus.addListener(_handleNewPasswordFocusChange);
    _confirmPasswordFocus.addListener(_handleConfirmPasswordFocusChange);
  }

  @override
  void dispose() {
    _newPasswordFocus.removeListener(_handleNewPasswordFocusChange);
    _confirmPasswordFocus.removeListener(_handleConfirmPasswordFocusChange);
    _currentPassword.dispose();
    _newPassword.dispose();
    _confirmPassword.dispose();
    _newPasswordFocus.dispose();
    _confirmPasswordFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(tr(context, 'Změnit heslo')),
    content: Form(
      key: _formKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _currentPassword,
            obscureText: true,
            decoration: _passwordDecoration(tr(context, 'Aktuální heslo')),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _newPassword,
            focusNode: _newPasswordFocus,
            obscureText: _obscureNewPassword,
            obscuringCharacter: '•',
            autofillHints: const [AutofillHints.newPassword],
            textInputAction: TextInputAction.next,
            validator: _validateNewPassword,
            onChanged: (_) => _validateActiveFields(),
            decoration: _passwordDecoration(
              tr(context, 'Nové heslo'),
              obscure: _obscureNewPassword,
              onToggleVisibility: () =>
                  setState(() => _obscureNewPassword = !_obscureNewPassword),
              helperText: tr(context, 'Alespoň 10 znaků'),
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _confirmPassword,
            focusNode: _confirmPasswordFocus,
            obscureText: _obscureConfirmPassword,
            obscuringCharacter: '•',
            autofillHints: const [AutofillHints.newPassword],
            textInputAction: TextInputAction.done,
            validator: _validateConfirmedPassword,
            onChanged: (_) => _validateActiveFields(),
            onFieldSubmitted: _saving ? null : (_) => _changePassword(),
            decoration: _passwordDecoration(
              tr(context, 'Potvrdit nové heslo'),
              obscure: _obscureConfirmPassword,
              onToggleVisibility: () => setState(
                () => _obscureConfirmPassword = !_obscureConfirmPassword,
              ),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: _saving ? null : () => Navigator.pop(context),
        child: Text(tr(context, 'Zrušit')),
      ),
      FilledButton(
        onPressed: _saving ? null : _changePassword,
        child: Text(tr(context, 'Uložit')),
      ),
    ],
  );

  InputDecoration _passwordDecoration(
    String label, {
    bool? obscure,
    VoidCallback? onToggleVisibility,
    String? helperText,
  }) => InputDecoration(
    labelText: label,
    helperText: helperText,
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
    suffixIcon: onToggleVisibility == null
        ? null
        : IconButton(
            tooltip: tr(context, obscure! ? 'Zobrazit heslo' : 'Skrýt heslo'),
            onPressed: onToggleVisibility,
            icon: Icon(
              obscure
                  ? Icons.visibility_off_outlined
                  : Icons.visibility_outlined,
            ),
          ),
  );

  String? _validateNewPassword(String? value) {
    final password = value ?? '';
    if (password.length < 10) {
      return tr(context, 'Heslo musí mít alespoň 10 znaků.');
    }
    if (_shouldShowMismatch) return tr(context, 'Hesla se neshodují.');
    return null;
  }

  String? _validateConfirmedPassword(String? value) {
    if (_shouldShowMismatch) return tr(context, 'Hesla se neshodují.');
    return null;
  }

  bool get _shouldShowMismatch =>
      (_submitted || _confirmPassword.text.isNotEmpty) &&
      _newPassword.text != _confirmPassword.text;

  void _handleNewPasswordFocusChange() {
    if (_newPasswordFocus.hasFocus) return;
    _activateValidation();
  }

  void _handleConfirmPasswordFocusChange() {
    if (_confirmPasswordFocus.hasFocus) return;
    _activateValidation();
  }

  void _activateValidation() {
    _validationActive = true;
    _formKey.currentState?.validate();
  }

  void _validateActiveFields() {
    if (_validationActive) _formKey.currentState?.validate();
  }

  Future<void> _changePassword() async {
    _submitted = true;
    _validationActive = true;
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final user = FirebaseAuth.instance.currentUser!;
    final hasPasswordProvider = user.providerData.any(
      (provider) => provider.providerId == 'password',
    );
    if (!hasPasswordProvider || user.email == null) {
      setState(
        () => _error = tr(context, 'Heslo účtu Google změň přímo u Google.'),
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final credential = EmailAuthProvider.credential(
        email: user.email!,
        password: _currentPassword.text,
      );
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(_newPassword.text);
      if (mounted) Navigator.pop(context);
    } on FirebaseAuthException {
      if (mounted) {
        setState(
          () => _error = tr(
            context,
            'Heslo se nepodařilo změnit. Zkontroluj aktuální heslo.',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class NotificationSettingsPage extends StatelessWidget {
  const NotificationSettingsPage({super.key, required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context) {
    final reference = FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection('settings')
        .doc('notifications');
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'Nastavení notifikací'))),
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: reference.snapshots(),
        builder: (context, snapshot) {
          final settings = snapshot.data?.data();
          final replies = settings?['replies'] as bool? ?? true;
          final reactions = settings?['reactions'] as bool? ?? true;
          final privateReplies = settings?['privateReplies'] as bool? ?? true;
          final followedProfiles =
              settings?['followedProfiles'] as bool? ?? true;
          final nearbyShouts = settings?['nearbyShouts'] as bool? ?? true;
          Future<void> save({
            bool? nextReplies,
            bool? nextReactions,
            bool? nextPrivateReplies,
            bool? nextFollowedProfiles,
            bool? nextNearby,
          }) => reference.set({
            'replies': nextReplies ?? replies,
            'reactions': nextReactions ?? reactions,
            'privateReplies': nextPrivateReplies ?? privateReplies,
            'followedProfiles': nextFollowedProfiles ?? followedProfiles,
            'nearbyShouts': nextNearby ?? nearbyShouts,
          });
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                tr(
                  context,
                  'Uložené preference se použijí po zapnutí oznámení.',
                ),
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              SwitchListTile(
                value: replies,
                onChanged: (value) => save(nextReplies: value),
                title: Text(tr(context, 'Odpovědi na komentáře')),
              ),
              SwitchListTile(
                value: reactions,
                onChanged: (value) => save(nextReactions: value),
                title: Text(tr(context, 'Reakce na mé Shouty')),
              ),
              SwitchListTile(
                value: privateReplies,
                onChanged: (value) => save(nextPrivateReplies: value),
                title: Text(tr(context, 'Soukromé odpovědi')),
              ),
              SwitchListTile(
                value: followedProfiles,
                onChanged: (value) => save(nextFollowedProfiles: value),
                title: Text(tr(context, 'Nové Shouty sledovaných profilů')),
              ),
              SwitchListTile(
                value: nearbyShouts,
                onChanged: (value) => save(nextNearby: value),
                title: Text(tr(context, 'Nové Shouty v okolí')),
              ),
            ],
          );
        },
      ),
    );
  }
}

class HelpPage extends StatelessWidget {
  const HelpPage({super.key});

  @override
  Widget build(BuildContext context) {
    final topics = helpTopics(context);
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'Nápověda'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: const Icon(Icons.explore_outlined),
              title: Text(tr(context, 'Průvodce aplikací')),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const OnboardingHelpPage()),
              ),
            ),
          ),
          ...topics.map(
            (topic) => Card(
              child: ListTile(
                title: Text(topic.title),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => showDialog<void>(
                  context: context,
                  builder: (dialogContext) => AlertDialog(
                    title: Text(topic.title),
                    content: SingleChildScrollView(child: Text(topic.body)),
                    actions: [
                      FilledButton(
                        onPressed: () => Navigator.pop(dialogContext),
                        child: Text(
                          MaterialLocalizations.of(context).closeButtonLabel,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class CommunityRulesPage extends StatelessWidget {
  const CommunityRulesPage({super.key});

  @override
  Widget build(BuildContext context) {
    final rules = [
      (
        Icons.people_outline,
        'Respektuj ostatní',
        'Neobtěžuj, nevyhrožuj, neponižuj ani nediskriminuj jiné lidi.',
      ),
      (
        Icons.no_accounts_outlined,
        'Chraň soukromí',
        'Nezveřejňuj cizí osobní údaje, kontakty, přesnou adresu ani soukromé zprávy.',
      ),
      (
        Icons.block_outlined,
        'Žádný nelegální obsah',
        'Nezveřejňuj nabídky drog, zbraní, podvodů ani jinou nezákonnou činnost.',
      ),
      (
        Icons.favorite_border,
        '16+ bez explicitního obsahu',
        'Flirt a neexplicitní debata jsou v pořádku. Pornografie, nahota, sexuální nabídky, obtěžování a obsah týkající se nezletilých jsou zakázané.',
      ),
      (
        Icons.forum_outlined,
        'Piš veřejně a férově',
        'Shouty a komentáře jsou veřejné. Neposílej spam, manipuluj s hodnocením ani neobcházej blokování a bany.',
      ),
      (
        Icons.flag_outlined,
        'Nahlaš problém',
        'Nevhodný Shout nebo komentář nahlas. Autora můžeš také zablokovat. Závažné či opakované porušení může vést k omezení nebo trvalému zablokování účtu.',
      ),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'Pravidla komunity'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            tr(
              context,
              'ShoutOut je komunitní prostor pro lidi od 16 let. Pomoz udržet feed užitečný a bezpečný.',
            ),
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: 12),
          ...rules.map(
            (rule) => Card(
              child: ListTile(
                leading: Icon(rule.$1),
                title: Text(tr(context, rule.$2)),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(tr(context, rule.$3)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

bool _nicknameChangeAvailable(Map<String, dynamic> profile) {
  final count = profile['nicknameChangeCount'] as int? ?? 0;
  if (count == 0) return true;
  final changedAt = (profile['nicknameChangedAt'] as Timestamp?)?.toDate();
  return changedAt != null &&
      !DateTime.now().isBefore(changedAt.add(const Duration(days: 30)));
}

String _shortDate(DateTime date) =>
    '${date.day.toString().padLeft(2, '0')}.${date.month.toString().padLeft(2, '0')}.${date.year}';

class ChangeNicknameDialog extends StatefulWidget {
  const ChangeNicknameDialog({
    super.key,
    required this.currentNickname,
    required this.userId,
  });

  final String currentNickname;
  final String userId;

  @override
  State<ChangeNicknameDialog> createState() => _ChangeNicknameDialogState();
}

class _ChangeNicknameDialogState extends State<ChangeNicknameDialog> {
  final _controller = TextEditingController();
  Timer? _availabilityTimer;
  bool? _isAvailable;
  bool _saving = false;

  @override
  void dispose() {
    _availabilityTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(AppLocalizations.of(context)!.changeNickname),
    content: TextField(
      controller: _controller,
      autofocus: true,
      maxLength: 24,
      onChanged: _checkAvailabilityLater,
      decoration: InputDecoration(
        labelText: tr(context, 'Přezdívka'),
        border: const OutlineInputBorder(),
        helperText: _isAvailable == null
            ? null
            : _isAvailable!
            ? tr(context, 'Přezdívka je volná')
            : tr(context, 'Tato přezdívka je obsazená'),
        helperStyle: TextStyle(
          color: _isAvailable == false ? Colors.red : Colors.green,
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _saving ? null : () => Navigator.pop(context),
        child: Text(tr(context, 'Zrušit')),
      ),
      FilledButton(
        onPressed: _saving ? null : _save,
        child: Text(tr(context, 'Uložit')),
      ),
    ],
  );

  void _checkAvailabilityLater(String value) {
    _availabilityTimer?.cancel();
    final normalized = value.trim().toLowerCase();
    if (!_isValidNickname(value.trim()) ||
        normalized == widget.currentNickname.toLowerCase()) {
      setState(() => _isAvailable = null);
      return;
    }
    _availabilityTimer = Timer(const Duration(milliseconds: 350), () async {
      final exists = await FirebaseFirestore.instance
          .collection('nicknames')
          .doc(normalized)
          .get();
      if (mounted && _controller.text.trim().toLowerCase() == normalized) {
        setState(() => _isAvailable = !exists.exists);
      }
    });
  }

  Future<void> _save() async {
    final nickname = _controller.text.trim();
    if (!_isValidNickname(nickname)) {
      _showError(
        tr(
          context,
          'Použij 3–24 znaků. Pomlčka a podtržítko mohou být jen mezi částmi přezdívky.',
        ),
      );
      return;
    }
    final nicknameLower = nickname.toLowerCase();
    if (nicknameLower == widget.currentNickname.toLowerCase()) {
      _showError(tr(context, 'Zadej jinou přezdívku.'));
      return;
    }

    setState(() => _saving = true);
    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final db = FirebaseFirestore.instance;
        final userRef = db.collection('users').doc(widget.userId);
        final publicProfileRef = db
            .collection('publicProfiles')
            .doc(widget.userId);
        final newNicknameRef = db.collection('nicknames').doc(nicknameLower);
        final oldNicknameRef = db
            .collection('nicknames')
            .doc(widget.currentNickname.toLowerCase());
        final newNickname = await transaction.get(newNicknameRef);
        final currentProfile = await transaction.get(userRef);
        if (newNickname.exists) {
          throw StateError('taken');
        }
        transaction.set(newNicknameRef, {
          'uid': widget.userId,
          'nickname': nickname,
          'nicknameLower': nicknameLower,
          'createdAt': FieldValue.serverTimestamp(),
        });
        transaction.delete(oldNicknameRef);
        transaction.update(userRef, {
          'nickname': nickname,
          'nicknameLower': nicknameLower,
          'nicknameChangedAt': FieldValue.serverTimestamp(),
          'nicknameChangeCount': FieldValue.increment(1),
        });
        transaction.set(publicProfileRef, {
          'nickname': nickname,
          'avatarId': currentProfile.data()!['avatarId'],
          'avatarBackgroundStart': currentProfile
              .data()!['avatarBackgroundStart'],
          'avatarBackgroundEnd': currentProfile.data()!['avatarBackgroundEnd'],
          'avatarGradientDirection': currentProfile
              .data()!['avatarGradientDirection'],
        });
      });
      if (!mounted) return;
      Navigator.pop(context);
    } on StateError catch (error) {
      if (!mounted) return;
      if (error.message == 'taken') {
        _showError(tr(context, 'Tato přezdívka už je obsazená.'));
      } else {
        _showError(tr(context, 'Přezdívku se nepodařilo změnit.'));
      }
    } catch (_) {
      if (!mounted) return;
      _showError(tr(context, 'Přezdívku se nepodařilo změnit.'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }
}

bool _isValidNickname(String nickname) => RegExp(
  r'^(?=.{3,24}$)[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*$',
).hasMatch(nickname);
