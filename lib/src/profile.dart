part of '../main.dart';

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .snapshots(),
      builder: (context, snapshot) {
        final profile = snapshot.data?.data();
        final nickname = profile?['nickname'] as String? ?? 'Načítání…';
        final avatarId = profile?['avatarId'] as String?;
        final createdAt = (profile?['createdAt'] as Timestamp?)?.toDate();
        final avatarStyle = profile == null
            ? null
            : AvatarStyle.fromProfile(profile);
        final l10n = AppLocalizations.of(context)!;
        return Column(
          children: [
            ProfileHeader(
              nickname: nickname,
              avatarId: avatarId,
              avatarStyle: avatarStyle,
              createdAt: createdAt,
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 2, 16, 28),
                children: [
                  ProfileTileGrid(userId: uid),
                  const SizedBox(height: 18),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                child: _ProfileWideAction(
                  icon: Icons.logout_rounded,
                  title: l10n.logout,
                  color: _shoutPrimary,
                  onTap: FirebaseAuth.instance.signOut,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class ProfileHeader extends StatelessWidget {
  const ProfileHeader({
    super.key,
    required this.nickname,
    required this.avatarId,
    required this.avatarStyle,
    required this.createdAt,
  });

  final String nickname;
  final String? avatarId;
  final AvatarStyle? avatarStyle;
  final DateTime? createdAt;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF1496A8), _shoutPrimary, _shoutPrimaryDark],
              stops: [0, .4, 1],
            ),
          ),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 38),
              child: Row(
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white,
                      border: Border.all(color: Colors.white70, width: 2),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(5),
                      child: AvatarImage(
                        avatarId: avatarId,
                        style: avatarStyle,
                        radius: 34,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          nickname,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: 'Urbanist',
                            color: Colors.white,
                            fontWeight: FontWeight.w500,
                            fontSize: 24,
                            letterSpacing: -.2,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          _profileCreatedLabel(context, createdAt),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      Positioned(
        left: 0,
        right: 0,
        bottom: 0,
        child: SizedBox(
          height: 36,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Theme.of(context).scaffoldBackgroundColor,
              borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            ),
          ),
        ),
      ),
      Positioned(
        left: 0,
        right: 0,
        bottom: 24,
        child: IgnorePointer(
          child: Container(
            height: 12,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0x40074B57), Colors.transparent],
              ),
            ),
          ),
        ),
      ),
    ],
  );
}

String _profileCreatedLabel(BuildContext context, DateTime? createdAt) {
  final languageCode = Localizations.localeOf(context).languageCode;
  if (createdAt == null) {
    return switch (languageCode) {
      'cs' => 'Datum založení profilu není dostupné',
      'de' => 'Profilerstellungsdatum nicht verfügbar',
      'pl' => 'Data utworzenia profilu jest niedostępna',
      'sk' => 'Dátum vytvorenia profilu nie je dostupný',
      'uk' => 'Дата створення профілю недоступна',
      'vi' => 'Không có ngày tạo hồ sơ',
      _ => 'Profile creation date unavailable',
    };
  }

  final date = MaterialLocalizations.of(
    context,
  ).formatCompactDate(createdAt.toLocal());
  return switch (languageCode) {
    'cs' => 'Členem od $date',
    'de' => 'Mitglied seit $date',
    'pl' => 'Użytkownik od $date',
    'sk' => 'Členom od $date',
    'uk' => 'Учасник із $date',
    'vi' => 'Thành viên từ $date',
    _ => 'Member since $date',
  };
}

class ProfileTileGrid extends StatelessWidget {
  const ProfileTileGrid({super.key, required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context) => StreamBuilder<AccountRole>(
    stream: _watchAccountRole(userId),
    builder: (context, snapshot) {
      final tiles = <Widget>[
        ProfileActionTile(
          icon: Icons.manage_accounts_outlined,
          title: tr(context, 'Upravit profil'),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => EditProfilePage(userId: userId)),
          ),
        ),
        ProfileActionTile(
          icon: Icons.help_outline,
          title: tr(context, 'Nápověda'),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const HelpPage()),
          ),
        ),
        ProfileActionTile(
          icon: Icons.bug_report_outlined,
          title: tr(context, 'Nahlásit chybu'),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const BugReportPage()),
          ),
        ),
        ProfileActionTile(
          icon: Icons.warning_amber_outlined,
          title: tr(context, 'Varování'),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => WarningHistoryPage(userId: userId),
            ),
          ),
        ),
        ProfileActionTile(
          icon: Icons.policy_outlined,
          title: tr(context, 'Právní info'),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const LegalHubPage()),
          ),
        ),
        ProfileActionTile(
          icon: Icons.settings_outlined,
          title: _systemSettingsTitle(context),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => SystemSettingsPage(userId: userId),
            ),
          ),
        ),
      ];
      final role = snapshot.data ?? AccountRole.user;
      if (role == AccountRole.business) {
        tiles.add(
          ProfileActionTile(
            icon: Icons.storefront_outlined,
            title: 'Business',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => BusinessPage(userId: userId)),
            ),
          ),
        );
      }
      if (role.isAtLeast(AccountRole.moderator)) {
        tiles.add(
          ProfileActionTile(
            icon: Icons.admin_panel_settings_outlined,
            title: tr(context, 'Moderace'),
            onTap: () => kIsWeb
                ? Navigator.pushNamed(context, '/admin')
                : Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const ModerationPage()),
                  ),
          ),
        );
      }
      final arrangedTiles = arrangeProfileTiles(
        tiles,
      ).map((tile) => tile ?? const SizedBox.shrink()).toList();
      return LayoutBuilder(
        builder: (context, constraints) => Center(
          child: SizedBox(
            width: constraints.maxWidth > 317 ? 317 : constraints.maxWidth,
            child: GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              mainAxisExtent: 92,
              children: arrangedTiles,
            ),
          ),
        ),
      );
    },
  );
}

class SystemSettingsPage extends StatelessWidget {
  const SystemSettingsPage({super.key, required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(_systemSettingsTitle(context))),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: ListTile(
            leading: const Icon(Icons.language_outlined),
            title: Text(AppLocalizations.of(context)!.language),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => _selectProfileLanguage(context, userId),
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.notifications_outlined),
            title: Text(tr(context, 'Notifikace')),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => NotificationSettingsPage(userId: userId),
              ),
            ),
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.dark_mode_outlined),
            title: Text(_themeSettingsTitle(context)),
            subtitle: ValueListenableBuilder<ThemeMode>(
              valueListenable: appThemeMode,
              builder: (context, mode, _) =>
                  Text(_themeModeLabel(context, mode)),
            ),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => _selectThemeMode(context, userId),
          ),
        ),
      ],
    ),
  );
}

String _systemSettingsTitle(BuildContext context) =>
    switch (Localizations.localeOf(context).languageCode) {
      'cs' => 'Systém',
      'de' => 'System',
      'pl' => 'System',
      'sk' => 'Systém',
      'uk' => 'Система',
      'vi' => 'Hệ thống',
      _ => 'System',
    };

Future<void> _selectThemeMode(BuildContext context, String userId) async {
  final selected = await showDialog<ThemeMode>(
    context: context,
    builder: (dialogContext) => SimpleDialog(
      title: Text(_themeSettingsTitle(context)),
      children: ThemeMode.values
          .map(
            (mode) => ListTile(
              title: Text(_themeModeLabel(context, mode)),
              trailing: appThemeMode.value == mode
                  ? const Icon(Icons.check_rounded)
                  : null,
              onTap: () => Navigator.pop(dialogContext, mode),
            ),
          )
          .toList(),
    ),
  );
  if (selected == null) return;
  final previous = appThemeMode.value;
  appThemeMode.value = selected;
  try {
    await FirebaseFirestore.instance.collection('users').doc(userId).update({
      'themeMode': profileValueFromThemeMode(selected),
    });
  } catch (_) {
    appThemeMode.value = previous;
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(_themeSaveFailed(context))));
    }
  }
}

String _themeSettingsTitle(BuildContext context) =>
    switch (Localizations.localeOf(context).languageCode) {
      'cs' => 'Vzhled aplikace',
      'de' => 'Erscheinungsbild',
      'pl' => 'Wygląd aplikacji',
      'sk' => 'Vzhľad aplikácie',
      'uk' => 'Вигляд застосунку',
      'vi' => 'Giao diện ứng dụng',
      _ => 'App appearance',
    };

String _themeModeLabel(BuildContext context, ThemeMode mode) {
  final language = Localizations.localeOf(context).languageCode;
  return switch ((language, mode)) {
    ('cs', ThemeMode.system) => 'Podle systému',
    ('cs', ThemeMode.light) => 'Světlý',
    ('cs', ThemeMode.dark) => 'Tmavý',
    ('de', ThemeMode.system) => 'Systemeinstellung',
    ('de', ThemeMode.light) => 'Hell',
    ('de', ThemeMode.dark) => 'Dunkel',
    ('pl', ThemeMode.system) => 'Ustawienie systemowe',
    ('pl', ThemeMode.light) => 'Jasny',
    ('pl', ThemeMode.dark) => 'Ciemny',
    ('sk', ThemeMode.system) => 'Podľa systému',
    ('sk', ThemeMode.light) => 'Svetlý',
    ('sk', ThemeMode.dark) => 'Tmavý',
    ('uk', ThemeMode.system) => 'Як у системі',
    ('uk', ThemeMode.light) => 'Світла',
    ('uk', ThemeMode.dark) => 'Темна',
    ('vi', ThemeMode.system) => 'Theo hệ thống',
    ('vi', ThemeMode.light) => 'Sáng',
    ('vi', ThemeMode.dark) => 'Tối',
    (_, ThemeMode.system) => 'System default',
    (_, ThemeMode.light) => 'Light',
    (_, ThemeMode.dark) => 'Dark',
  };
}

String _themeSaveFailed(BuildContext context) =>
    Localizations.localeOf(context).languageCode == 'cs'
    ? 'Nastavení vzhledu se nepodařilo uložit.'
    : 'The appearance setting could not be saved.';

class ProfileActionTile extends StatelessWidget {
  const ProfileActionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).colorScheme.surface,
    borderRadius: BorderRadius.circular(18),
    child: InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: _shoutBorder),
        ),
        padding: const EdgeInsets.all(8),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Icon(icon, color: _shoutPrimary, size: 22),
            const SizedBox(height: 7),
            Text(
              title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                height: 1.1,
                fontSize: 12,
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 3),
              Text(
                subtitle!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: _shoutSecondaryText,
                  fontSize: 10,
                ),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}

class _ProfileWideAction extends StatelessWidget {
  const _ProfileWideAction({
    required this.icon,
    required this.title,
    required this.color,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).colorScheme.surface,
    borderRadius: BorderRadius.circular(18),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: _shoutBorder),
        ),
        child: Row(
          children: [
            Icon(icon, color: color),
            const SizedBox(width: 14),
            Text(
              title,
              style: TextStyle(color: color, fontWeight: FontWeight.w700),
            ),
            const Spacer(),
            Icon(Icons.chevron_right_rounded, color: color),
          ],
        ),
      ),
    ),
  );
}

class EditProfilePage extends StatelessWidget {
  const EditProfilePage({super.key, required this.userId});
  final String userId;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(tr(context, 'Upravit profil'))),
    body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .snapshots(),
      builder: (context, snapshot) {
        final profile = snapshot.data?.data();
        final nickname = profile?['nickname'] as String? ?? 'Načítání…';
        final avatarId = profile?['avatarId'] as String?;
        final avatarStyle = profile == null
            ? null
            : AvatarStyle.fromProfile(profile);
        return Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Center(
                    child: AvatarImage(
                      avatarId: avatarId,
                      style: avatarStyle,
                      radius: 58,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    nickname,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Card(
                    child: StreamBuilder<AccountRole>(
                      stream: _watchAccountRole(userId),
                      builder: (context, roleSnapshot) => ListTile(
                        leading: const Icon(
                          Icons.face_retouching_natural_outlined,
                        ),
                        title: Text(tr(context, 'Změnit avatar')),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: profile == null || !roleSnapshot.hasData
                            ? null
                            : () async {
                                final selected =
                                    await showModalBottomSheet<AvatarStyle>(
                                      context: context,
                                      isScrollControlled: true,
                                      builder: (_) => AvatarPickerSheet(
                                        initialStyle: avatarStyle!,
                                        showBusinessLogoAction:
                                            roleSnapshot.data ==
                                            AccountRole.business,
                                      ),
                                    );
                                if (selected == null) return;
                                try {
                                  final db = FirebaseFirestore.instance;
                                  final batch = db.batch()
                                    ..update(
                                      db.collection('users').doc(userId),
                                      selected.toFirestore(),
                                    )
                                    ..set(
                                      db
                                          .collection('publicProfiles')
                                          .doc(userId),
                                      selected.publicProfileData(nickname),
                                    );
                                  await batch.commit();
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(
                                          tr(context, 'Avatar byl uložen.'),
                                        ),
                                      ),
                                    );
                                  }
                                } on FirebaseException catch (error) {
                                  if (!context.mounted) return;
                                  final message =
                                      error.code == 'permission-denied'
                                      ? 'Avatar se nepodařilo uložit kvůli oprávnění. Aktualizuj aplikaci a zkus to znovu.'
                                      : 'Avatar se nepodařilo uložit. Zkontroluj připojení a zkus to znovu.';
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(tr(context, message)),
                                    ),
                                  );
                                }
                              },
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.edit_outlined),
                      title: Text(AppLocalizations.of(context)!.changeNickname),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: profile == null
                          ? null
                          : () => _showNicknameChange(
                              context,
                              profile,
                              nickname,
                              userId,
                            ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.lock_outline),
                      title: Text(tr(context, 'Změnit heslo')),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => showDialog<void>(
                        context: context,
                        builder: (_) => const ChangePasswordDialog(),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
                child: _ProfileWideAction(
                  icon: Icons.delete_outline,
                  title: AppLocalizations.of(context)!.deleteAccount,
                  color: Colors.red.shade700,
                  onTap: () => _requestAccountDeletion(context),
                ),
              ),
            ),
          ],
        );
      },
    ),
  );
}

Future<void> _selectProfileLanguage(BuildContext context, String userId) async {
  final l10n = AppLocalizations.of(context)!;
  final language = await showModalBottomSheet<String>(
    context: context,
    builder: (sheetContext) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            title: Text(l10n.czech),
            trailing: const Text('CS'),
            onTap: () => Navigator.pop(sheetContext, 'cs'),
          ),
          ListTile(
            title: Text(l10n.english),
            trailing: const Text('EN'),
            onTap: () => Navigator.pop(sheetContext, 'en'),
          ),
          ListTile(
            title: Text(l10n.german),
            trailing: const Text('DE'),
            onTap: () => Navigator.pop(sheetContext, 'de'),
          ),
          ListTile(
            title: Text(l10n.polish),
            trailing: const Text('PL'),
            onTap: () => Navigator.pop(sheetContext, 'pl'),
          ),
          ListTile(
            title: Text(l10n.slovak),
            trailing: const Text('SK'),
            onTap: () => Navigator.pop(sheetContext, 'sk'),
          ),
          ListTile(
            title: Text(l10n.ukrainian),
            trailing: const Text('UK'),
            onTap: () => Navigator.pop(sheetContext, 'uk'),
          ),
          ListTile(
            title: Text(l10n.vietnamese),
            trailing: const Text('VI'),
            onTap: () => Navigator.pop(sheetContext, 'vi'),
          ),
        ],
      ),
    ),
  );
  if (language == null) return;
  try {
    await FirebaseFirestore.instance.collection('users').doc(userId).update({
      'language': language,
    });
    appLocale.value = Locale(language);
  } on FirebaseException {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          tr(context, 'Akci se nepodařilo dokončit. Zkus to znovu.'),
        ),
      ),
    );
  }
}

Future<void> _showNicknameChange(
  BuildContext context,
  Map<String, dynamic> profile,
  String nickname,
  String userId,
) async {
  if (!_nicknameChangeAvailable(profile)) {
    final changedAt = (profile['nicknameChangedAt'] as Timestamp?)?.toDate();
    final nextDate = changedAt?.add(const Duration(days: 30));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          nextDate == null
              ? tr(context, 'Přezdívku zatím nelze změnit.')
              : '${tr(context, 'Další změna přezdívky bude možná')} ${_shortDate(nextDate)}.',
        ),
      ),
    );
    return;
  }
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(AppLocalizations.of(dialogContext)!.changeNickname),
      content: Text(
        tr(
          dialogContext,
          'Tuto změnu je možné provést pouze jednou za 30 dní. Chceš pokračovat?',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: Text(tr(dialogContext, 'Zrušit')),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          child: Text(tr(dialogContext, 'Ano')),
        ),
      ],
    ),
  );
  if (confirmed == true && context.mounted) {
    await showDialog<void>(
      context: context,
      builder: (_) =>
          ChangeNicknameDialog(currentNickname: nickname, userId: userId),
    );
  }
}

Future<void> _requestAccountDeletion(BuildContext context) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(tr(dialogContext, 'Smazat účet?')),
      content: Text(
        tr(
          dialogContext,
          'Veřejný obsah bude při serverovém zpracování skryt. Potřebné bezpečnostní záznamy zůstanou 60 dní, potom budou odstraněny nebo anonymizovány.',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: Text(tr(dialogContext, 'Zrušit')),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          child: Text(tr(dialogContext, 'Požádat o smazání')),
        ),
      ],
    ),
  );
  if (confirmed != true || !context.mounted) return;
  final user = FirebaseAuth.instance.currentUser!;
  await FirebaseFirestore.instance
      .collection('accountDeletionRequests')
      .doc(user.uid)
      .set({
        'userId': user.uid,
        'email': user.email,
        'requestedAt': FieldValue.serverTimestamp(),
        'retainUntil': Timestamp.fromDate(
          DateTime.now().add(const Duration(days: 60)),
        ),
        'status': 'pending',
      });
  await FirebaseAuth.instance.signOut();
}
