import 'dart:async';
import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'app_locale.dart';
import 'legal.dart';
import 'l10n/text.dart';

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
        return const SignInPage();
      }
      if (!user.emailVerified) {
        return VerifyEmailPage(user: user);
      }
      return ProfileGate(user: user, child: signedInChild);
    },
  );
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
          return LegalAcceptanceGate(user: user, child: child);
        },
      );
}

class SignInPage extends StatefulWidget {
  const SignInPage({super.key});
  @override
  State<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends State<SignInPage> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _register = false;
  bool _busy = false;
  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(
                  Icons.campaign_rounded,
                  size: 64,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(height: 16),
                Text(
                  'ShoutOut',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  tr(context, _register ? 'Registrace' : 'Přihlášení'),
                  textAlign: TextAlign.center,
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text(
                  _register
                      ? tr(context, 'Vytvoř si účet pro dění v okolí.')
                      : tr(context, 'Přihlas se a zjisti, co se děje v okolí.'),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 28),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: InputDecoration(
                    labelText: tr(context, 'E-mail'),
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _password,
                  obscureText: true,
                  decoration: InputDecoration(
                    labelText: tr(context, 'Heslo'),
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _busy ? null : _emailAuth,
                  child: Text(
                    tr(context, _register ? 'Vytvořit účet' : 'Přihlásit se'),
                  ),
                ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => setState(() => _register = !_register),
                  child: Text(
                    tr(
                      context,
                      _register ? 'Už účet mám' : 'Vytvořit nový účet',
                    ),
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
                  label: Text(tr(context, 'Pokračovat přes Google')),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
  Future<void> _emailAuth() async {
    setState(() => _busy = true);
    try {
      if (_register) {
        final credential = await FirebaseAuth.instance
            .createUserWithEmailAndPassword(
              email: _email.text.trim(),
              password: _password.text,
            );
        await credential.user?.sendEmailVerification();
      } else {
        await FirebaseAuth.instance.signInWithEmailAndPassword(
          email: _email.text.trim(),
          password: _password.text,
        );
      }
    } on FirebaseAuthException catch (error) {
      if (mounted) _message(_authMessage(error.code));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

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
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.mark_email_unread_outlined, size: 64),
            const SizedBox(height: 16),
            Text(
              tr(context, 'Ověř svůj e-mail'),
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
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
              child: Text(tr(context, 'Zpět a opravit e-mail')),
            ),
            TextButton(
              onPressed: () => FirebaseAuth.instance.signOut(),
              child: Text(tr(context, 'Odhlásit se')),
            ),
          ],
        ),
      ),
    ),
  );
  Future<void> _check() async {
    setState(() => _busy = true);
    await widget.user.reload();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _resend() async {
    setState(() => _busy = true);
    await widget.user.sendEmailVerification();
    if (mounted) {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr(context, 'Ověřovací e-mail byl odeslán.'))),
      );
    }
  }

  Future<void> _startOver() async {
    setState(() => _busy = true);
    try {
      await widget.user.delete();
      await FirebaseAuth.instance.signOut();
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
  Timer? _availabilityTimer;
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
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              tr(context, 'Vyber si přezdívku'),
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
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
              ),
            ),
            if (_isAvailable != null)
              Row(
                children: [
                  Icon(
                    _isAvailable! ? Icons.check_circle : Icons.cancel,
                    color: _isAvailable! ? Colors.green : Colors.red,
                    size: 18,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _isAvailable!
                        ? tr(context, 'Přezdívka je volná')
                        : tr(context, 'Tato přezdívka je obsazená'),
                  ),
                ],
              ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _busy ? null : _generateNickname,
              icon: const Icon(Icons.casino_outlined),
              label: Text(tr(context, 'Vygenerovat přezdívku')),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(tr(context, 'Pokračovat')),
            ),
          ],
        ),
      ),
    ),
  );
  Future<void> _save() async {
    final name = _nickname.text.trim();
    if (!RegExp(
      r'^(?=.{3,24}$)[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*$',
    ).hasMatch(name)) {
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
            'language': 'cs',
          },
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
    final normalized = value.trim().toLowerCase();
    if (!RegExp(
      r'^(?=.{3,24}$)[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*$',
    ).hasMatch(value.trim())) {
      setState(() => _isAvailable = null);
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
