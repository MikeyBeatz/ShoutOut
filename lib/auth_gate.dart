import 'dart:async';
import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_locale.dart';
import 'app_theme.dart';
import 'account_deletion.dart';
import 'avatar_style.dart';
import 'business_application_state.dart';
import 'business_registration.dart';
import 'email_verification.dart';
import 'legal.dart';
import 'l10n/business_text.dart';
import 'l10n/text.dart';
import 'nickname_validation.dart';

class AuthGate extends StatelessWidget {
  const AuthGate({super.key, required this.signedInChild});
  final Widget signedInChild;

  @override
  Widget build(BuildContext context) => StreamBuilder<User?>(
    stream: FirebaseAuth.instance.userChanges(),
    builder: (context, snapshot) {
      if (snapshot.connectionState == ConnectionState.waiting) {
        return const _LoadingPage();
      }
      final user = snapshot.data;
      if (user == null) {
        if (appLocale.value != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (FirebaseAuth.instance.currentUser == null) {
              appLocale.value = null;
            }
          });
        }
        return const SignInPage();
      }
      if (!user.emailVerified) {
        return VerifyEmailPage(user: user);
      }
      return AccountBanGate(
        user: user,
        child: BusinessApplicationGate(
          user: user,
          child: ProfileGate(user: user, child: signedInChild),
        ),
      );
    },
  );
}

class AccountBanGate extends StatelessWidget {
  const AccountBanGate({super.key, required this.user, required this.child});

  final User user;
  final Widget child;

  @override
  Widget build(BuildContext context) =>
      StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection('bans')
            .doc(user.uid)
            .snapshots(),
        builder: (context, snapshot) {
          if (!snapshot.hasData && !snapshot.hasError) {
            return const _LoadingPage();
          }
          if (snapshot.hasError) {
            return _BanStatusLoadFailedPage(user: user);
          }
          final ban = snapshot.data!.data();
          if (ban == null || !isAccountBanActive(ban, DateTime.now())) {
            return child;
          }
          return _BannedAccountPage(user: user, ban: ban);
        },
      );
}

@visibleForTesting
bool isAccountBanActive(Map<String, dynamic> ban, DateTime now) {
  final expiresAt = ban['expiresAt'];
  if (ban['permanent'] == true || expiresAt == null) return true;
  return expiresAt is Timestamp && expiresAt.toDate().isAfter(now);
}

class _BannedAccountPage extends StatelessWidget {
  const _BannedAccountPage({required this.user, required this.ban});

  final User user;
  final Map<String, dynamic> ban;

  @override
  Widget build(BuildContext context) {
    final expiresAt = ban['expiresAt'];
    final permanent = ban['permanent'] == true || expiresAt == null;
    final end = expiresAt is Timestamp ? expiresAt.toDate().toLocal() : null;
    final decisionId = ban['sanctionId'] as String? ?? '';
    final reason = ban['reason'] as String? ?? 'Porušení pravidel komunity.';
    final localizations = MaterialLocalizations.of(context);
    final endLabel = end == null
        ? null
        : '${localizations.formatMediumDate(end)} '
              '${localizations.formatTimeOfDay(TimeOfDay.fromDateTime(end))}';

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.block_outlined,
                        size: 64,
                        color: Theme.of(context).colorScheme.error,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Účet je zablokován',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 10),
                      Text(reason, textAlign: TextAlign.center),
                      const SizedBox(height: 20),
                      ListTile(
                        leading: const Icon(Icons.schedule_outlined),
                        title: Text(
                          permanent
                              ? 'Trvalý ban'
                              : endLabel == null
                              ? 'Dočasný ban'
                              : 'Ban platí do $endLabel',
                        ),
                      ),
                      if (decisionId.isNotEmpty)
                        ListTile(
                          leading: const Icon(Icons.gavel_outlined),
                          title: const Text('Číslo rozhodnutí'),
                          subtitle: SelectableText(decisionId),
                        ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: () => FirebaseAuth.instance.signOut(),
                          icon: const Icon(Icons.logout),
                          label: const Text('Odhlásit se'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BanStatusLoadFailedPage extends StatelessWidget {
  const _BanStatusLoadFailedPage({required this.user});

  final User user;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.cloud_off_outlined, size: 56),
                    const SizedBox(height: 16),
                    const Text(
                      'Stav účtu se nepodařilo ověřit.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: () => FirebaseAuth.instance.signOut(),
                      icon: const Icon(Icons.logout),
                      label: const Text('Odhlásit se'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class BusinessApplicationGate extends StatelessWidget {
  const BusinessApplicationGate({
    super.key,
    required this.user,
    required this.child,
  });

  final User user;
  final Widget child;

  @override
  Widget build(
    BuildContext context,
  ) => StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
    stream: FirebaseFirestore.instance
        .collection('businessApplications')
        .doc(user.uid)
        .snapshots(),
    builder: (context, applicationSnapshot) {
      if (applicationSnapshot.hasError) {
        return _BusinessApplicationStatusPage(
          user: user,
          application: const {},
          loadFailed: true,
        );
      }
      if (!applicationSnapshot.hasData) return const _LoadingPage();
      if (!applicationSnapshot.data!.exists) {
        return child;
      }
      final application = applicationSnapshot.data!.data() ?? const {};

      // A newly registered Business account cannot have an active role yet.
      // Show its known application state immediately instead of adding another
      // network round trip to the registration critical path. Once the trusted
      // activation tool changes the application to active, the role and
      // Business profile checks below still remain mandatory.
      final applicationStatus = application['status'] as String?;
      if (applicationStatus == 'pending_email' && user.emailVerified) {
        WidgetsBinding.instance.addPostFrameCallback((_) async {
          try {
            await applicationSnapshot.data!.reference.update({
              'status': 'checking',
              'emailVerifiedAt': FieldValue.serverTimestamp(),
            });
          } on FirebaseException {
            // The status page remains usable and its refresh action retries the
            // authenticated reads if this best-effort transition fails.
          }
        });
      }
      if (!requiresBusinessActivationChecks(applicationStatus)) {
        return _BusinessApplicationStatusPage(
          user: user,
          application: application,
          profileStatus: applicationStatus,
        );
      }

      return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection('accountRoles')
            .doc(user.uid)
            .snapshots(),
        builder: (context, roleSnapshot) {
          if (roleSnapshot.hasError) {
            return _BusinessApplicationStatusPage(
              user: user,
              application: application,
              loadFailed: true,
            );
          }
          if (!roleSnapshot.hasData) return const _LoadingPage();
          final role = roleSnapshot.data!.data();
          final isBusiness = role?['role'] == 'business' || role?['level'] == 2;
          if (!isBusiness) {
            return _BusinessApplicationStatusPage(
              user: user,
              application: application,
              profileStatus: application['status'] as String?,
            );
          }

          return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
            stream: FirebaseFirestore.instance
                .collection('businessProfiles')
                .doc(user.uid)
                .snapshots(),
            builder: (context, profileSnapshot) {
              if (profileSnapshot.hasError) {
                return _BusinessApplicationStatusPage(
                  user: user,
                  application: application,
                  loadFailed: true,
                );
              }
              if (!profileSnapshot.hasData) return const _LoadingPage();
              final profile = profileSnapshot.data!.data();
              final gateState = resolveBusinessApplicationGateState(
                applicationExists: true,
                role: role,
                businessProfileExists: profileSnapshot.data!.exists,
                businessProfile: profile,
              );
              if (gateState == BusinessApplicationGateState.activeBusiness) {
                return child;
              }
              return _BusinessApplicationStatusPage(
                user: user,
                application: application,
                profileStatus: profile?['status'] as String?,
              );
            },
          );
        },
      );
    },
  );
}

class _BusinessApplicationStatusPage extends StatefulWidget {
  const _BusinessApplicationStatusPage({
    required this.user,
    required this.application,
    this.profileStatus,
    this.loadFailed = false,
  });

  final User user;
  final Map<String, dynamic> application;
  final String? profileStatus;
  final bool loadFailed;

  @override
  State<_BusinessApplicationStatusPage> createState() =>
      _BusinessApplicationStatusPageState();
}

class _BusinessApplicationStatusPageState
    extends State<_BusinessApplicationStatusPage> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final companyName =
        widget.application['submittedCompanyName'] as String? ?? '';
    final registrationNumber =
        widget.application['registrationNumber'] as String? ?? '';
    final rejected = widget.profileStatus == 'rejected';
    final suspended = widget.profileStatus == 'suspended';
    final title = widget.loadFailed
        ? 'Stav žádosti se nepodařilo načíst'
        : rejected
        ? 'Business žádost byla zamítnuta'
        : suspended
        ? 'Business účet je pozastavený'
        : 'Business žádost čeká na ověření';
    final description = widget.loadFailed
        ? 'Zkontroluj připojení a zkus stav načíst znovu.'
        : rejected
        ? 'Žádost nyní nelze aktivovat. Pokud potřebuješ vysvětlení, kontaktuj podporu.'
        : suspended
        ? 'Business funkce jsou dočasně nedostupné. Pro další informace kontaktuj podporu.'
        : 'Kontaktní e-mail je potvrzený. Údaje firmy a první pobočku nyní ověřujeme.';

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        widget.loadFailed
                            ? Icons.cloud_off_outlined
                            : rejected || suspended
                            ? Icons.pause_circle_outline
                            : Icons.verified_user_outlined,
                        size: 64,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        businessTr(context, title),
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        businessTr(context, description),
                        textAlign: TextAlign.center,
                      ),
                      if (companyName.isNotEmpty) ...[
                        const SizedBox(height: 20),
                        ListTile(
                          leading: const Icon(Icons.business_outlined),
                          title: Text(companyName),
                          subtitle: registrationNumber.isEmpty
                              ? null
                              : Text(
                                  '${businessTr(context, 'Registrační číslo / IČO')}: $registrationNumber',
                                ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: _busy ? null : _refresh,
                          icon: _busy
                              ? const SizedBox.square(
                                  dimension: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.refresh),
                          label: Text(
                            businessTr(context, 'Zkontrolovat stav znovu'),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () => FirebaseAuth.instance.signOut(),
                        child: Text(tr(context, 'Odhlásit se')),
                      ),
                      if (!rejected && !suspended)
                        TextButton(
                          onPressed: _busy ? null : _cancelRegistration,
                          child: Text(
                            businessTr(
                              context,
                              'Zrušit registraci a začít znovu',
                            ),
                          ),
                        ),
                      const SizedBox(height: 12),
                      SelectableText(
                        '${businessTr(context, 'V případě potíží kontaktujte podporu:')} $businessSupportEmail',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _refresh() async {
    setState(() => _busy = true);
    try {
      await widget.user.reload().timeout(const Duration(seconds: 20));
      await FirebaseAuth.instance.currentUser
          ?.getIdToken(true)
          .timeout(const Duration(seconds: 20));
      final currentUser = FirebaseAuth.instance.currentUser;
      if (currentUser?.emailVerified == true &&
          widget.application['status'] == 'pending_email') {
        await FirebaseFirestore.instance
            .collection('businessApplications')
            .doc(widget.user.uid)
            .update({
              'status': 'checking',
              'emailVerifiedAt': FieldValue.serverTimestamp(),
            })
            .timeout(const Duration(seconds: 20));
      }
      await Future.wait([
        FirebaseFirestore.instance
            .collection('businessApplications')
            .doc(widget.user.uid)
            .get(const GetOptions(source: Source.server)),
        FirebaseFirestore.instance
            .collection('accountRoles')
            .doc(widget.user.uid)
            .get(const GetOptions(source: Source.server)),
        FirebaseFirestore.instance
            .collection('businessProfiles')
            .doc(widget.user.uid)
            .get(const GetOptions(source: Source.server)),
      ]).timeout(const Duration(seconds: 20));
    } on TimeoutException {
      _showRefreshError();
    } on FirebaseException {
      _showRefreshError();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancelRegistration() async {
    final password = await _requestRegistrationPassword(context);
    if (password == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await _cancelIncompleteRegistration(widget.user, password);
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    } on FirebaseAuthException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'Registraci se nepodařilo zrušit. Zkontroluj heslo.'),
            ),
          ),
        );
      }
    } on FirebaseException {
      _showRefreshError();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showRefreshError() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          businessTr(
            context,
            'Stav žádosti se nepodařilo načíst. Zkus to prosím znovu.',
          ),
        ),
      ),
    );
  }
}

class ProfileGate extends StatelessWidget {
  const ProfileGate({super.key, required this.user, required this.child});
  final User user;
  final Widget child;

  @override
  Widget build(BuildContext context) =>
      StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection('users')
            .doc(user.uid)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const _GateLoadError();
          }
          if (!snapshot.hasData) {
            return const _LoadingPage();
          }
          if (!snapshot.data!.exists) {
            return LegalAcceptanceGate(
              user: user,
              child: NicknamePage(user: user),
            );
          }
          final language = snapshot.data!.data()?['language'] as String?;
          if (language != null && appLocale.value?.languageCode != language) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              appLocale.value = Locale(language);
            });
          }
          final themeMode = themeModeFromProfile(
            snapshot.data!.data()?['themeMode'] as String?,
          );
          if (appThemeMode.value != themeMode) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              appThemeMode.value = themeMode;
            });
          }
          return DeletionRequestGate(
            user: user,
            child: BanGate(
              user: user,
              child: ContentRestrictionGate(
                user: user,
                child: LegalAcceptanceGate(
                  user: user,
                  child: OnboardingHelpGate(
                    userId: user.uid,
                    showInitially:
                        snapshot.data!.data()?['showOnboardingHelp'] == true,
                    child: child,
                  ),
                ),
              ),
            ),
          );
        },
      );
}

class OnboardingHelpGate extends StatefulWidget {
  const OnboardingHelpGate({
    super.key,
    required this.userId,
    required this.showInitially,
    required this.child,
  });

  final String userId;
  final bool showInitially;
  final Widget child;

  @override
  State<OnboardingHelpGate> createState() => _OnboardingHelpGateState();
}

class _OnboardingHelpGateState extends State<OnboardingHelpGate> {
  bool _finishedForSession = false;

  @override
  Widget build(BuildContext context) {
    if (_finishedForSession || !widget.showInitially) return widget.child;
    return OnboardingHelpPage(
      onFinished: (neverShowAgain) async {
        if (neverShowAgain) {
          await FirebaseFirestore.instance
              .collection('users')
              .doc(widget.userId)
              .update({'showOnboardingHelp': false});
        }
        if (mounted) setState(() => _finishedForSession = true);
      },
    );
  }
}

class OnboardingHelpPage extends StatefulWidget {
  const OnboardingHelpPage({super.key, this.onFinished});

  final Future<void> Function(bool neverShowAgain)? onFinished;

  @override
  State<OnboardingHelpPage> createState() => _OnboardingHelpPageState();
}

class _OnboardingHelpPageState extends State<OnboardingHelpPage> {
  final _controller = PageController();
  int _page = 0;
  bool _neverShowAgain = false;
  bool _saving = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = _onboardingPages(
      Localizations.localeOf(context).languageCode,
    );
    final lastPage = _page == pages.length - 1;
    return Scaffold(
      appBar: AppBar(
        title: Text(tr(context, 'Nápověda')),
        automaticallyImplyLeading: widget.onFinished == null,
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: pages.length,
                onPageChanged: (value) => setState(() => _page = value),
                itemBuilder: (context, index) {
                  final page = pages[index];
                  return Padding(
                    padding: const EdgeInsets.all(28),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(page.$1, size: 72, color: const Color(0xFF0A6371)),
                        const SizedBox(height: 28),
                        Text(
                          page.$2,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 14),
                        Text(
                          page.$3,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyLarge,
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                pages.length,
                (index) => Container(
                  width: index == _page ? 22 : 8,
                  height: 8,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  decoration: BoxDecoration(
                    color: index == _page
                        ? const Color(0xFF0A6371)
                        : Colors.black26,
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ),
            if (lastPage && widget.onFinished != null)
              CheckboxListTile(
                value: _neverShowAgain,
                onChanged: _saving
                    ? null
                    : (value) =>
                          setState(() => _neverShowAgain = value ?? false),
                title: Text(_onboardingNeverAgain(context)),
                controlAffinity: ListTileControlAffinity.leading,
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
              child: Row(
                children: [
                  if (_page > 0)
                    TextButton(
                      onPressed: _saving
                          ? null
                          : () => _controller.previousPage(
                              duration: const Duration(milliseconds: 250),
                              curve: Curves.easeOut,
                            ),
                      child: Text(_onboardingBack(context)),
                    ),
                  const Spacer(),
                  FilledButton(
                    onPressed: _saving
                        ? null
                        : () async {
                            if (!lastPage) {
                              await _controller.nextPage(
                                duration: const Duration(milliseconds: 250),
                                curve: Curves.easeOut,
                              );
                              return;
                            }
                            if (widget.onFinished == null) {
                              if (mounted) Navigator.pop(context);
                              return;
                            }
                            setState(() => _saving = true);
                            try {
                              await widget.onFinished!(_neverShowAgain);
                            } finally {
                              if (mounted) setState(() => _saving = false);
                            }
                          },
                    child: Text(
                      lastPage
                          ? _onboardingFinish(context)
                          : _onboardingNext(context),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

List<(IconData, String, String)> _onboardingPages(String language) {
  final english = [
    (
      Icons.location_on_outlined,
      'Your surroundings',
      'ShoutOut uses your location to show nearby posts. Your exact position is not displayed publicly.',
    ),
    (
      Icons.tune_rounded,
      'Filters',
      'Adjust distance and categories to see what matters to you. Your filters remain selected while you use the app.',
    ),
    (
      Icons.campaign_outlined,
      'Create a Shout',
      'Write a short local post, choose its category and publish it from your actual location.',
    ),
    (
      Icons.lock_outline,
      'Privacy',
      'Use comments or private replies. Your nickname and current avatar represent you throughout the app.',
    ),
    (
      Icons.flag_outlined,
      'Keep the community safe',
      'Report harmful content from its menu. Moderators review reports without revealing who submitted them.',
    ),
  ];
  if (language != 'cs') return english;
  return [
    (
      Icons.location_on_outlined,
      'Tvoje okolí',
      'ShoutOut používá polohu k zobrazení příspěvků v okolí. Přesná poloha se veřejně nezobrazuje.',
    ),
    (
      Icons.tune_rounded,
      'Filtry',
      'Nastav si vzdálenost a kategorie podle toho, co tě zajímá. Během používání aplikace zůstávají filtry zachované.',
    ),
    (
      Icons.campaign_outlined,
      'Vytvoření Shoutu',
      'Napiš krátký místní příspěvek, vyber kategorii a publikuj ho ze své skutečné polohy.',
    ),
    (
      Icons.lock_outline,
      'Soukromí',
      'Používej komentáře nebo soukromé odpovědi. V celé aplikaci tě zastupuje přezdívka a aktuální avatar.',
    ),
    (
      Icons.flag_outlined,
      'Bezpečná komunita',
      'Škodlivý obsah nahlásíš z jeho nabídky. Moderátoři hlášení prověří, aniž by zveřejnili autora hlášení.',
    ),
  ];
}

String _onboardingNeverAgain(BuildContext context) =>
    Localizations.localeOf(context).languageCode == 'cs'
    ? 'Znovu nezobrazovat'
    : 'Do not show again';

String _onboardingBack(BuildContext context) =>
    Localizations.localeOf(context).languageCode == 'cs' ? 'Zpět' : 'Back';

String _onboardingNext(BuildContext context) =>
    Localizations.localeOf(context).languageCode == 'cs' ? 'Další' : 'Next';

String _onboardingFinish(BuildContext context) =>
    Localizations.localeOf(context).languageCode == 'cs'
    ? 'Dokončit'
    : 'Finish';

class DeletionRequestGate extends StatelessWidget {
  const DeletionRequestGate({
    super.key,
    required this.user,
    required this.child,
  });
  final User user;
  final Widget child;
  @override
  Widget build(
    BuildContext context,
  ) => StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
    stream: FirebaseFirestore.instance
        .collection('accountDeletionRequests')
        .doc(user.uid)
        .snapshots(),
    builder: (context, snapshot) {
      if (snapshot.data?.exists != true) return child;
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.delete_forever_outlined, size: 56),
                const SizedBox(height: 12),
                Text(
                  tr(context, 'Účet čeká na smazání'),
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Text(
                  tr(
                    context,
                    'Žádost byla přijata. Účet nelze používat a bude zpracován serverovou automatizací.',
                  ),
                  textAlign: TextAlign.center,
                ),
                TextButton(
                  onPressed: FirebaseAuth.instance.signOut,
                  child: Text(tr(context, 'Odhlásit se')),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class BanGate extends StatelessWidget {
  const BanGate({super.key, required this.user, required this.child});
  final User user;
  final Widget child;
  @override
  Widget build(
    BuildContext context,
  ) => StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
    stream: FirebaseFirestore.instance
        .collection('bans')
        .doc(user.uid)
        .snapshots(),
    builder: (context, snapshot) {
      final ban = snapshot.data?.data();
      final expiry = (ban?['expiresAt'] as Timestamp?)?.toDate();
      final active =
          ban != null && (expiry == null || expiry.isAfter(DateTime.now()));
      if (!active) return child;
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.block, size: 56),
                const SizedBox(height: 12),
                Text(
                  'Účet byl zablokován',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Text(
                  ban['reason'] as String? ?? '',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  expiry == null
                      ? 'Blokace je trvalá.'
                      : 'Blokace končí ${MaterialLocalizations.of(context).formatMediumDate(expiry)} '
                            'v ${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(expiry))}.',
                  textAlign: TextAlign.center,
                ),
                if (ban['sanctionId'] is String) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Číslo rozhodnutí: ${ban['sanctionId']}',
                    style: Theme.of(context).textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ],
                TextButton(
                  onPressed: FirebaseAuth.instance.signOut,
                  child: Text(tr(context, 'Odhlásit se')),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class ContentRestrictionGate extends StatelessWidget {
  const ContentRestrictionGate({
    super.key,
    required this.user,
    required this.child,
  });

  final User user;
  final Widget child;

  @override
  Widget build(
    BuildContext context,
  ) => StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
    stream: FirebaseFirestore.instance
        .collection('contentRestrictions')
        .doc(user.uid)
        .snapshots(),
    builder: (context, snapshot) {
      final restriction = snapshot.data?.data();
      final expiry = (restriction?['expiresAt'] as Timestamp?)?.toDate();
      if (restriction == null ||
          expiry == null ||
          !expiry.isAfter(DateTime.now())) {
        return child;
      }
      return Column(
        children: [
          Material(
            color: Theme.of(context).colorScheme.errorContainer,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    const Icon(Icons.edit_off_outlined),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Tvorba Shoutů, komentářů a soukromých odpovědí '
                        'je omezena do '
                        '${MaterialLocalizations.of(context).formatMediumDate(expiry)}. '
                        'Důvod: ${restriction['reason'] ?? ''}',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Expanded(child: child),
        ],
      );
    },
  );
}

class SignInPage extends StatefulWidget {
  const SignInPage({super.key});
  @override
  State<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends State<SignInPage> {
  final _formKey = GlobalKey<FormState>();
  final _emailFieldKey = GlobalKey<FormFieldState<String>>();
  final _passwordFieldKey = GlobalKey<FormFieldState<String>>();
  final _confirmPasswordFieldKey = GlobalKey<FormFieldState<String>>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirmPassword = TextEditingController();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();
  final _confirmPasswordFocus = FocusNode();
  bool _emailValidationActive = false;
  bool _passwordValidationActive = false;
  bool _confirmPasswordValidationActive = false;
  bool _register = false;
  bool _busy = false;
  String? _authProgress;
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;

  @override
  void initState() {
    super.initState();
    _emailFocus.addListener(_handleEmailFocusChange);
    _passwordFocus.addListener(_handlePasswordFocusChange);
    _confirmPasswordFocus.addListener(_handleConfirmPasswordFocusChange);
  }

  @override
  void dispose() {
    _emailFocus.removeListener(_handleEmailFocusChange);
    _passwordFocus.removeListener(_handlePasswordFocusChange);
    _confirmPasswordFocus.removeListener(_handleConfirmPasswordFocusChange);
    _email.dispose();
    _password.dispose();
    _confirmPassword.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    _confirmPasswordFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Container(
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(30),
                border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x1F074B57),
                    blurRadius: 15,
                    offset: Offset(0, 6),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Stack(
                    children: [
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.fromLTRB(18, 18, 18, 38),
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              Color(0xFF1496A8),
                              Color(0xFF0A6371),
                              Color(0xFF074B57),
                            ],
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Image.asset(
                                  'assets/branding/feed_mark.png',
                                  width: 44,
                                  height: 44,
                                  fit: BoxFit.contain,
                                  cacheWidth: 160,
                                  filterQuality: FilterQuality.high,
                                  semanticLabel: 'ShoutOut',
                                ),
                                const SizedBox(width: 7),
                                const Text(
                                  'ShoutOut',
                                  style: TextStyle(
                                    fontFamily: 'Urbanist',
                                    fontWeight: FontWeight.w500,
                                    fontSize: 28,
                                    letterSpacing: -.8,
                                    color: Colors.white,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Text(
                              _register
                                  ? tr(
                                      context,
                                      'Vytvoř si účet pro dění v okolí.',
                                    )
                                  : tr(
                                      context,
                                      'Přihlas se a zjisti, co se děje v okolí.',
                                    ),
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(
                                    color: Colors.white.withValues(alpha: .84),
                                    height: 1.3,
                                  ),
                            ),
                          ],
                        ),
                      ),
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: 0,
                        child: SizedBox(
                          height: 32,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.surface,
                              borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(28),
                              ),
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: 25,
                        child: IgnorePointer(
                          child: Container(
                            height: 5,
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [Color(0x30074B57), Colors.transparent],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
                    child: Form(
                      key: _formKey,
                      child: AutofillGroup(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              tr(
                                context,
                                _register ? 'Registrace' : 'Přihlášení',
                              ),
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.headlineSmall
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 20),
                            TextFormField(
                              key: _emailFieldKey,
                              controller: _email,
                              focusNode: _emailFocus,
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.next,
                              autofillHints: const [AutofillHints.email],
                              validator: _validateEmail,
                              onChanged: (_) {
                                if (_emailValidationActive) {
                                  _emailFieldKey.currentState?.validate();
                                }
                              },
                              decoration: InputDecoration(
                                labelText: tr(context, 'E-mail'),
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              key: _passwordFieldKey,
                              controller: _password,
                              focusNode: _passwordFocus,
                              obscureText: _obscurePassword,
                              obscuringCharacter: '•',
                              textInputAction: _register
                                  ? TextInputAction.next
                                  : TextInputAction.done,
                              autofillHints: [
                                _register
                                    ? AutofillHints.newPassword
                                    : AutofillHints.password,
                              ],
                              validator: _validatePassword,
                              onChanged: (_) {
                                if (_passwordValidationActive) {
                                  _passwordFieldKey.currentState?.validate();
                                }
                                if (_confirmPasswordValidationActive) {
                                  _confirmPasswordFieldKey.currentState
                                      ?.validate();
                                }
                              },
                              onFieldSubmitted: _register || _busy
                                  ? null
                                  : (_) => _emailAuth(),
                              decoration: InputDecoration(
                                labelText: tr(context, 'Heslo'),
                                helperText: _register
                                    ? tr(context, 'Alespoň 10 znaků')
                                    : null,
                                border: OutlineInputBorder(),
                                suffixIcon: IconButton(
                                  tooltip: tr(
                                    context,
                                    _obscurePassword
                                        ? 'Zobrazit heslo'
                                        : 'Skrýt heslo',
                                  ),
                                  onPressed: () => setState(
                                    () => _obscurePassword = !_obscurePassword,
                                  ),
                                  icon: Icon(
                                    _obscurePassword
                                        ? Icons.visibility_off_outlined
                                        : Icons.visibility_outlined,
                                  ),
                                ),
                              ),
                            ),
                            if (_register) ...[
                              const SizedBox(height: 12),
                              TextFormField(
                                key: _confirmPasswordFieldKey,
                                controller: _confirmPassword,
                                focusNode: _confirmPasswordFocus,
                                obscureText: _obscureConfirmPassword,
                                obscuringCharacter: '•',
                                textInputAction: TextInputAction.done,
                                autofillHints: const [
                                  AutofillHints.newPassword,
                                ],
                                validator: _validateConfirmedPassword,
                                onChanged: (_) {
                                  if (_confirmPasswordValidationActive) {
                                    _confirmPasswordFieldKey.currentState
                                        ?.validate();
                                  }
                                },
                                onFieldSubmitted: _busy
                                    ? null
                                    : (_) => _emailAuth(),
                                decoration: InputDecoration(
                                  labelText: tr(context, 'Zopakovat heslo'),
                                  border: const OutlineInputBorder(),
                                  suffixIcon: IconButton(
                                    tooltip: tr(
                                      context,
                                      _obscureConfirmPassword
                                          ? 'Zobrazit heslo'
                                          : 'Skrýt heslo',
                                    ),
                                    onPressed: () => setState(
                                      () => _obscureConfirmPassword =
                                          !_obscureConfirmPassword,
                                    ),
                                    icon: Icon(
                                      _obscureConfirmPassword
                                          ? Icons.visibility_off_outlined
                                          : Icons.visibility_outlined,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                            if (!_register)
                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton(
                                  onPressed: _busy ? null : _sendPasswordReset,
                                  child: Text(tr(context, 'Zapomenuté heslo?')),
                                ),
                              ),
                            const SizedBox(height: 16),
                            FilledButton(
                              style: FilledButton.styleFrom(
                                alignment: Alignment.center,
                                minimumSize: const Size.fromHeight(48),
                              ),
                              onPressed: _busy ? null : _emailAuth,
                              child: Text(
                                tr(
                                  context,
                                  _register ? 'Vytvořit účet' : 'Přihlásit se',
                                ),
                              ),
                            ),
                            if (_busy && _authProgress != null) ...[
                              const SizedBox(height: 8),
                              Semantics(
                                liveRegion: true,
                                child: Text(
                                  tr(context, _authProgress!),
                                  textAlign: TextAlign.center,
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ),
                            ],
                            TextButton(
                              onPressed: _busy ? null : _toggleRegistration,
                              child: Text(
                                tr(
                                  context,
                                  _register
                                      ? 'Už účet mám'
                                      : 'Vytvořit nový účet',
                                ),
                              ),
                            ),
                            if (_register)
                              OutlinedButton.icon(
                                onPressed: _busy
                                    ? null
                                    : () => Navigator.of(context).push(
                                        MaterialPageRoute<void>(
                                          builder: (_) =>
                                              const BusinessRegistrationPage(),
                                        ),
                                      ),
                                icon: const Icon(Icons.storefront_outlined),
                                label: Text(
                                  tr(context, 'Vytvořit business účet'),
                                ),
                              ),
                            Row(
                              children: [
                                Expanded(child: Divider()),
                                Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 12),
                                  child: Text(tr(context, 'nebo')),
                                ),
                                Expanded(child: Divider()),
                              ],
                            ),
                            const SizedBox(height: 12),
                            OutlinedButton.icon(
                              onPressed: _busy ? null : _googleAuth,
                              icon: const Icon(Icons.g_mobiledata),
                              label: Text(
                                tr(context, 'Pokračovat přes Google'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );

  String? _validateEmail(String? value) {
    final email = value?.trim() ?? '';
    if (email.isEmpty) return null;
    if (!RegExp(
      r'^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$',
    ).hasMatch(email)) {
      return tr(context, 'Zadej platný e-mail.');
    }
    return null;
  }

  String? _validatePassword(String? value) {
    final password = value ?? '';
    if (password.isEmpty) return null;
    if (_register && password.length < 10) {
      return tr(context, 'Heslo musí mít alespoň 10 znaků.');
    }
    return null;
  }

  String? _validateConfirmedPassword(String? value) {
    if (!_register) return null;
    if ((value ?? '').isEmpty) return null;
    if (value != _password.text) return tr(context, 'Hesla se neshodují.');
    return null;
  }

  void _handleEmailFocusChange() {
    if (_emailFocus.hasFocus) return;
    _emailValidationActive = true;
    _emailFieldKey.currentState?.validate();
  }

  void _handlePasswordFocusChange() {
    if (_passwordFocus.hasFocus) return;
    _passwordValidationActive = true;
    _passwordFieldKey.currentState?.validate();
    if (_confirmPassword.text.isNotEmpty) {
      _confirmPasswordValidationActive = true;
      _confirmPasswordFieldKey.currentState?.validate();
    }
  }

  void _handleConfirmPasswordFocusChange() {
    if (_confirmPasswordFocus.hasFocus) return;
    _confirmPasswordValidationActive = true;
    _confirmPasswordFieldKey.currentState?.validate();
  }

  void _toggleRegistration() {
    setState(() {
      _register = !_register;
      _confirmPassword.clear();
      _passwordValidationActive = false;
      _confirmPasswordValidationActive = false;
      _obscurePassword = true;
      _obscureConfirmPassword = true;
    });
  }

  Future<void> _emailAuth() async {
    final isValid = _formKey.currentState?.validate() ?? false;
    if (!isValid) {
      _focusFirstInvalidField();
      return;
    }
    if (_focusFirstMissingField()) return;
    setState(() {
      _busy = true;
      _authProgress = _register ? 'Vytvářím účet…' : 'Přihlašuji…';
    });
    final stopwatch = Stopwatch()..start();
    try {
      if (_register) {
        final credential = await FirebaseAuth.instance
            .createUserWithEmailAndPassword(
              email: _email.text.trim(),
              password: _password.text,
            )
            .timeout(const Duration(seconds: 20));
        _logAuthTiming('create-account', stopwatch);
        TextInput.finishAutofillContext(shouldSave: true);
        stopwatch.reset();
        if (mounted) {
          setState(() => _authProgress = 'Odesílám ověřovací e-mail…');
        }
        await credential.user
            ?.sendEmailVerification(emailVerificationActionSettings)
            .timeout(const Duration(seconds: 20));
        _logAuthTiming('send-verification-email', stopwatch);
      } else {
        await FirebaseAuth.instance
            .signInWithEmailAndPassword(
              email: _email.text.trim(),
              password: _password.text,
            )
            .timeout(const Duration(seconds: 20));
        _logAuthTiming('sign-in', stopwatch);
        TextInput.finishAutofillContext(shouldSave: true);
      }
    } on TimeoutException {
      if (mounted) {
        _message(
          tr(
            context,
            'Připojení k přihlášení trvá příliš dlouho. Zkontroluj internet a zkus to znovu.',
          ),
        );
      }
    } on FirebaseAuthException catch (error) {
      if (mounted) _message(_authMessage(error.code));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _authProgress = null;
        });
      }
    }
  }

  Future<void> _sendPasswordReset() async {
    final isValid = _formKey.currentState?.validate() ?? false;
    if (_email.text.trim().isEmpty) {
      _emailFocus.requestFocus();
      return;
    }
    if (!isValid) {
      _emailFocus.requestFocus();
      return;
    }
    setState(() => _busy = true);
    final stopwatch = Stopwatch()..start();
    try {
      await FirebaseAuth.instance
          .sendPasswordResetEmail(email: _email.text.trim())
          .timeout(const Duration(seconds: 20));
      _logAuthTiming('send-password-reset', stopwatch);
      if (mounted) _passwordResetConfirmation();
    } on TimeoutException {
      // Keep the response neutral even on a timeout: the backend may have
      // accepted the request before the client stopped waiting.
      _logAuthTiming('send-password-reset-timeout', stopwatch);
      if (mounted) _passwordResetConfirmation();
    } on FirebaseAuthException catch (error) {
      if (mounted) {
        if (error.code == 'invalid-email') {
          _formKey.currentState?.validate();
        } else if (error.code == 'user-not-found') {
          _passwordResetConfirmation();
        } else {
          _message(
            tr(context, 'E-mail pro změnu hesla se nepodařilo odeslat.'),
          );
        }
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  bool _focusFirstMissingField() {
    if (_email.text.trim().isEmpty) {
      _emailFocus.requestFocus();
      return true;
    }
    if (_password.text.isEmpty) {
      _passwordFocus.requestFocus();
      return true;
    }
    if (_register && _confirmPassword.text.isEmpty) {
      _confirmPasswordFocus.requestFocus();
      return true;
    }
    return false;
  }

  void _focusFirstInvalidField() {
    if (_validateEmail(_email.text) != null) {
      _emailFocus.requestFocus();
    } else if (_validatePassword(_password.text) != null) {
      _passwordFocus.requestFocus();
    } else if (_validateConfirmedPassword(_confirmPassword.text) != null) {
      _confirmPasswordFocus.requestFocus();
    }
  }

  void _passwordResetConfirmation() => _message(
    tr(
      context,
      'Pokud pro tento e-mail existuje účet, poslali jsme odkaz pro změnu hesla.',
    ),
  );

  Future<void> _googleAuth() async {
    setState(() => _busy = true);
    try {
      await FirebaseAuth.instance.signInWithProvider(GoogleAuthProvider());
    } on FirebaseAuthException catch (error) {
      if (mounted) _message(_authMessage(error.code));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _message(String message) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(message)));
  String _authMessage(String code) => switch (code) {
    'email-already-in-use' => tr(context, 'Tento e-mail už je zaregistrovaný.'),
    'weak-password' => tr(context, 'Zvol silnější heslo.'),
    'invalid-credential' ||
    'wrong-password' ||
    'user-not-found' => tr(context, 'E-mail nebo heslo nesedí.'),
    _ => tr(context, 'Akci se nepodařilo dokončit. Zkus to znovu.'),
  };
}

class VerifyEmailPage extends StatefulWidget {
  const VerifyEmailPage({super.key, required this.user});
  final User user;
  @override
  State<VerifyEmailPage> createState() => _VerifyEmailPageState();
}

class _VerifyEmailPageState extends State<VerifyEmailPage> {
  bool _busy = false;
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.mark_email_unread_outlined,
                      size: 64,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      tr(context, 'Ověř svůj e-mail'),
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${tr(context, 'Ověřovací odkaz byl zaslán na adresu')} ${widget.user.email}. ${tr(context, 'Po kliknutí se vrať sem.')}',
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy ? null : _check,
                      child: Text(tr(context, 'Už jsem e-mail ověřil/a')),
                    ),
                    TextButton(
                      onPressed: _busy ? null : _resend,
                      child: Text(tr(context, 'Poslat ověřovací e-mail znovu')),
                    ),
                    TextButton(
                      onPressed: _busy ? null : _startOver,
                      child: Text(
                        tr(context, 'Zrušit registraci a začít znovu'),
                      ),
                    ),
                    TextButton(
                      onPressed: () => FirebaseAuth.instance.signOut(),
                      child: Text(tr(context, 'Odhlásit se')),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  Future<void> _check() async {
    setState(() => _busy = true);
    final stopwatch = Stopwatch()..start();
    try {
      await widget.user.reload().timeout(const Duration(seconds: 20));
      _logAuthTiming('reload-verified-user', stopwatch);
      final user = FirebaseAuth.instance.currentUser;
      if (user?.emailVerified != true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                tr(
                  context,
                  'E-mail zatím není potvrzený. Po otevření odkazu chvíli počkej a zkus kontrolu znovu.',
                ),
              ),
            ),
          );
        }
        return;
      }
      stopwatch.reset();
      // Firestore Rules read email_verified from the ID token. Reloading the
      // user alone can leave the old token cached and make the next gate wait
      // or fail with permission-denied.
      await user!.getIdToken(true).timeout(const Duration(seconds: 20));
      _logAuthTiming('refresh-verified-token', stopwatch);
    } on TimeoutException {
      _showVerificationError(
        'Kontrola ověření trvá příliš dlouho. Zkontroluj internet a zkus to znovu.',
      );
    } on FirebaseAuthException {
      _showVerificationError(
        'Ověření se nepodařilo načíst. Zkontroluj internet a zkus to znovu.',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    setState(() => _busy = true);
    final stopwatch = Stopwatch()..start();
    try {
      await widget.user
          .sendEmailVerification(emailVerificationActionSettings)
          .timeout(const Duration(seconds: 20));
      _logAuthTiming('resend-verification-email', stopwatch);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr(context, 'Ověřovací e-mail byl odeslán.'))),
        );
      }
    } on TimeoutException {
      _showVerificationError(
        'Odeslání ověřovacího e-mailu trvá příliš dlouho. Zkontroluj internet a zkus to znovu.',
      );
    } on FirebaseAuthException {
      _showVerificationError(
        'Ověřovací e-mail se nepodařilo odeslat. Zkus to později.',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showVerificationError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(tr(context, message))));
  }

  Future<void> _startOver() async {
    final password = await _requestRegistrationPassword(context);
    if (password == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await _cancelIncompleteRegistration(widget.user, password);
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    } on FirebaseAuthException catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'Účet se nepodařilo zrušit. Zkus to prosím znovu.'),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

Future<String?> _requestRegistrationPassword(BuildContext context) async {
  final controller = TextEditingController();
  final password = await showDialog<String>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(tr(dialogContext, 'Zrušit registraci?')),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            tr(
              dialogContext,
              'Účet bude odstraněn a se stejným e-mailem můžeš registraci spustit znovu.',
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: controller,
            obscureText: true,
            decoration: InputDecoration(
              labelText: tr(dialogContext, 'Potvrď heslo'),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: Text(tr(dialogContext, 'Zpět')),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, controller.text),
          child: Text(tr(dialogContext, 'Zrušit registraci')),
        ),
      ],
    ),
  );
  controller.dispose();
  return password?.isEmpty == true ? null : password;
}

Future<void> _cancelIncompleteRegistration(User user, String password) async {
  await user.reauthenticateWithCredential(
    EmailAuthProvider.credential(email: user.email!, password: password),
  );
  await hideActiveShoutsBeforeAccountDeletion(user.uid);
  final application = FirebaseFirestore.instance
      .collection('businessApplications')
      .doc(user.uid);
  final snapshot = await application.get();
  if (snapshot.exists) {
    await application.update({
      'status': 'cancelled',
      'cancelledAt': FieldValue.serverTimestamp(),
    });
  }
  await user.delete();
}

class NicknamePage extends StatefulWidget {
  const NicknamePage({super.key, required this.user});
  final User user;
  @override
  State<NicknamePage> createState() => _NicknamePageState();
}

class _NicknamePageState extends State<NicknamePage> {
  final _nickname = TextEditingController();
  bool _busy = false;
  bool? _isAvailable;
  bool _hasNicknameInput = false;
  bool _hasValidNicknameFormat = false;
  Timer? _availabilityTimer;
  AvatarStyle _avatarStyle = AvatarStyle.random();
  static const _adjectives = [
    'Amber',
    'Bright',
    'Calm',
    'Clever',
    'Cosmic',
    'Curious',
    'Daring',
    'Electric',
    'Golden',
    'Happy',
    'Lucky',
    'Mighty',
    'Nimble',
    'Rapid',
    'Silver',
    'Sunny',
    'Swift',
    'Wild',
    'Agile',
    'Azure',
    'Bold',
    'Brisk',
    'Crimson',
    'Crystal',
    'Dapper',
    'Echoing',
    'Emerald',
    'Fearless',
    'Frosty',
    'Gentle',
    'Glowing',
    'Humble',
    'Icy',
    'Ivory',
    'Jazzy',
    'Kind',
    'Lunar',
    'Magnetic',
    'Midnight',
    'Neon',
    'Northern',
    'Oceanic',
    'Playful',
    'Quiet',
    'Radiant',
    'Rustic',
    'Sapphire',
    'Scarlet',
    'Shiny',
    'Silent',
    'Smart',
    'Snowy',
    'Solar',
    'Sparkling',
    'Steady',
    'Stormy',
    'Tiny',
    'Velvet',
    'Vivid',
    'Warm',
    'Wandering',
    'Whispering',
  ];
  static const _nouns = [
    'Badger',
    'Comet',
    'Falcon',
    'Fox',
    'Harbor',
    'Hedgehog',
    'Lynx',
    'Maple',
    'Meteor',
    'Otter',
    'Panda',
    'Penguin',
    'Raven',
    'River',
    'Sparrow',
    'Tiger',
    'Willow',
    'Wolf',
    'Anchor',
    'Aurora',
    'Beacon',
    'Birch',
    'Bison',
    'Brook',
    'Canyon',
    'Cedar',
    'Cipher',
    'Cloud',
    'Coral',
    'Coyote',
    'Cricket',
    'Dolphin',
    'Dragon',
    'Eagle',
    'Ember',
    'Fern',
    'Firefly',
    'Forest',
    'Galaxy',
    'Grove',
    'Heron',
    'Horizon',
    'Islander',
    'Jaguar',
    'Kestrel',
    'Koala',
    'Lagoon',
    'Lantern',
    'Meadow',
    'Moon',
    'Narwhal',
    'Nova',
    'Oak',
    'Orchid',
    'Peak',
    'Phoenix',
    'Pine',
    'Quartz',
    'Robin',
    'Sailor',
    'Seagull',
    'Shadow',
    'Skylark',
    'Summit',
    'Thunder',
    'Valley',
    'Voyager',
  ];
  @override
  void dispose() {
    _availabilityTimer?.cancel();
    _nickname.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  tr(context, 'Vyber si přezdívku'),
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  tr(
                    context,
                    'Uvidí ji ostatní uživatelé místo tvého skutečného jména.',
                  ),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _nickname,
                  maxLength: 24,
                  onChanged: _scheduleAvailabilityCheck,
                  decoration: InputDecoration(
                    labelText: tr(context, 'Přezdívka'),
                    border: OutlineInputBorder(),
                    helperText: tr(
                      context,
                      '3–24 znaků · písmena a čísla · mezery nahraď _ nebo -',
                    ),
                    helperMaxLines: 2,
                    helperStyle: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(fontSize: 11),
                  ),
                ),
                if (_hasNicknameInput &&
                    (!_hasValidNicknameFormat || _isAvailable != null))
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        _hasValidNicknameFormat && _isAvailable == true
                            ? Icons.check_circle
                            : Icons.cancel,
                        color: _hasValidNicknameFormat && _isAvailable == true
                            ? Colors.green
                            : Colors.red,
                        size: 18,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          !_hasValidNicknameFormat
                              ? tr(
                                  context,
                                  'Použij 3–24 znaků. Pomlčka a podtržítko mohou být jen mezi částmi přezdívky.',
                                )
                              : _isAvailable!
                              ? tr(context, 'Přezdívka je volná')
                              : tr(context, 'Tato přezdívka je obsazená'),
                          style: TextStyle(
                            color:
                                _hasValidNicknameFormat && _isAvailable == true
                                ? Colors.green
                                : Colors.red,
                          ),
                        ),
                      ),
                    ],
                  ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _generateNickname,
                  icon: const Icon(Icons.casino_outlined),
                  label: Text(tr(context, 'Vygenerovat přezdívku')),
                ),
                const SizedBox(height: 20),
                Text(
                  tr(context, 'Tvůj avatar'),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 10),
                AvatarImage(
                  avatarId: _avatarStyle.avatarId,
                  style: _avatarStyle,
                  radius: 48,
                ),
                const SizedBox(height: 10),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: _busy ? null : _selectAvatar,
                      icon: const Icon(Icons.palette_outlined),
                      label: Text(tr(context, 'Upravit avatar')),
                    ),
                    OutlinedButton.icon(
                      onPressed: _busy
                          ? null
                          : () => setState(
                              () => _avatarStyle = AvatarStyle.random(),
                            ),
                      icon: const Icon(Icons.casino_outlined),
                      label: Text(tr(context, 'Náhodný avatar')),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _busy ? null : _save,
                  child: Text(tr(context, 'Pokračovat')),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );

  Future<void> _selectAvatar() async {
    final selected = await showModalBottomSheet<AvatarStyle>(
      context: context,
      isScrollControlled: true,
      builder: (_) => AvatarPickerSheet(initialStyle: _avatarStyle),
    );
    if (selected != null && mounted) {
      setState(() => _avatarStyle = selected);
    }
  }

  Future<void> _save() async {
    final name = _nickname.text.trim();
    if (!isValidNickname(name)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(
              context,
              'Použij 3–24 znaků. Pomlčka a podtržítko mohou být jen mezi částmi přezdívky.',
            ),
          ),
        ),
      );
      return;
    }
    final initialLanguage = Localizations.localeOf(context).languageCode;
    setState(() => _busy = true);
    try {
      final normalized = name.toLowerCase();
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final nicknameRef = FirebaseFirestore.instance
            .collection('nicknames')
            .doc(normalized);
        if ((await transaction.get(nicknameRef)).exists) {
          throw StateError('taken');
        }
        transaction.set(nicknameRef, {
          'uid': widget.user.uid,
          'nickname': name,
          'nicknameLower': normalized,
          'createdAt': FieldValue.serverTimestamp(),
        });
        transaction.set(
          FirebaseFirestore.instance.collection('users').doc(widget.user.uid),
          {
            'nickname': name,
            'nicknameLower': normalized,
            'createdAt': FieldValue.serverTimestamp(),
            'nicknameChangedAt': FieldValue.serverTimestamp(),
            'nicknameChangeCount': 0,
            'emailVerified': true,
            'language': initialLanguage,
            'themeMode': 'system',
            'showOnboardingHelp': true,
            ..._avatarStyle.toFirestore(),
          },
        );
        transaction.set(
          FirebaseFirestore.instance
              .collection('publicProfiles')
              .doc(widget.user.uid),
          _avatarStyle.publicProfileData(name),
        );
      });
    } on StateError catch (error) {
      if (mounted && error.message == 'taken') {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(tr(context, 'Tato přezdívka už je obsazená.')),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(tr(context, 'Přezdívku se nepodařilo uložit.')),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _scheduleAvailabilityCheck(String value) {
    _availabilityTimer?.cancel();
    final trimmed = value.trim();
    final normalized = trimmed.toLowerCase();
    final isValid = isValidNickname(trimmed);
    setState(() {
      _hasNicknameInput = trimmed.isNotEmpty;
      _hasValidNicknameFormat = isValid;
      _isAvailable = null;
    });
    if (!isValid) {
      return;
    }
    _availabilityTimer = Timer(const Duration(milliseconds: 350), () async {
      final exists =
          (await FirebaseFirestore.instance
                  .collection('nicknames')
                  .doc(normalized)
                  .get())
              .exists;
      if (mounted && _nickname.text.trim().toLowerCase() == normalized) {
        setState(() => _isAvailable = !exists);
      }
    });
  }

  void _generateNickname() {
    final random = Random();
    final separator = ['', '_', '-'][random.nextInt(3)];
    final words =
        '${_adjectives[random.nextInt(_adjectives.length)]}$separator${_nouns[random.nextInt(_nouns.length)]}';
    final numberSeparator = separator.isEmpty
        ? ['', '_', '-'][random.nextInt(3)]
        : separator;
    final name = random.nextInt(10) == 0
        ? '$words$numberSeparator${random.nextInt(900) + 100}'
        : words;
    _nickname.text = name;
    _scheduleAvailabilityCheck(name);
  }
}

class _LoadingPage extends StatelessWidget {
  const _LoadingPage();
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}

class _GateLoadError extends StatelessWidget {
  const _GateLoadError();

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_outlined, size: 56),
            const SizedBox(height: 12),
            Text(
              tr(
                context,
                'Profil se nepodařilo načíst. Zkontroluj připojení a spusť aplikaci znovu.',
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    ),
  );
}

void _logAuthTiming(String step, Stopwatch stopwatch) {
  assert(() {
    debugPrint('Auth timing: $step ${stopwatch.elapsedMilliseconds} ms');
    return true;
  }());
}
