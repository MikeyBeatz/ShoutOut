import 'dart:async';
import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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
          return DeletionRequestGate(
            user: user,
            child: BanGate(
              user: user,
              child: LegalAcceptanceGate(user: user, child: child),
            ),
          );
        },
      );
}

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
  Widget build(BuildContext context) =>
      StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
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
                      tr(context, 'Účet je omezen'),
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    Text(ban['reason'] as String? ?? ''),
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
                        child: Row(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(20),
                              child: Image.asset(
                                'assets/branding/app_icon.png',
                                width: 88,
                                height: 88,
                                fit: BoxFit.cover,
                                cacheWidth: 320,
                                filterQuality: FilterQuality.high,
                                semanticLabel: 'ShoutOut',
                              ),
                            ),
                            const SizedBox(width: 18),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'ShoutOut',
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineSmall
                                        ?.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w900,
                                          letterSpacing: -.5,
                                        ),
                                  ),
                                  const SizedBox(height: 7),
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
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodyMedium
                                        ?.copyWith(
                                          color: Colors.white.withValues(
                                            alpha: .84,
                                          ),
                                          height: 1.3,
                                        ),
                                  ),
                                ],
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
    setState(() => _busy = true);
    try {
      if (_register) {
        final credential = await FirebaseAuth.instance
            .createUserWithEmailAndPassword(
              email: _email.text.trim(),
              password: _password.text,
            );
        TextInput.finishAutofillContext(shouldSave: true);
        await credential.user?.sendEmailVerification();
      } else {
        await FirebaseAuth.instance.signInWithEmailAndPassword(
          email: _email.text.trim(),
          password: _password.text,
        );
        TextInput.finishAutofillContext(shouldSave: true);
      }
    } on FirebaseAuthException catch (error) {
      if (mounted) _message(_authMessage(error.code));
    } finally {
      if (mounted) setState(() => _busy = false);
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
    try {
      await FirebaseAuth.instance.sendPasswordResetEmail(
        email: _email.text.trim(),
      );
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
            'avatarId': 'fox',
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
