import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:country_picker/country_picker.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'address_autocomplete.dart';
import 'geography.dart';
import 'l10n/business_text.dart';
import 'l10n/text.dart';

const businessSupportEmail = 'support@shoutout.app';

class BusinessRegistrationPage extends StatefulWidget {
  const BusinessRegistrationPage({super.key});

  @override
  State<BusinessRegistrationPage> createState() =>
      _BusinessRegistrationPageState();
}

class _BusinessRegistrationPageState extends State<BusinessRegistrationPage> {
  final _formKey = GlobalKey<FormState>();
  final _companyName = TextEditingController();
  final _registrationNumber = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController();
  final _postalCode = TextEditingController();
  final _locationName = TextEditingController();
  final _locationAddress = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirmPassword = TextEditingController();
  Country _country = Country.parse('CZ');
  bool _busy = false;
  String? _progress;
  bool _obscurePassword = true;
  bool _obscureConfirmation = true;
  AddressSelection? _locationSelection;

  @override
  void dispose() {
    _companyName.dispose();
    _registrationNumber.dispose();
    _address.dispose();
    _city.dispose();
    _postalCode.dispose();
    _locationName.dispose();
    _locationAddress.dispose();
    _email.dispose();
    _password.dispose();
    _confirmPassword.dispose();
    super.dispose();
  }

  String get _countryCode => _country.countryCode;

  String get _registrationLabel => switch (_countryCode) {
    'CZ' => 'IČO',
    'DE' => 'Handelsregisternummer / Steuernummer',
    'PL' => 'NIP / KRS',
    'SK' => 'IČO / DIČ',
    'IT' => 'Partita IVA',
    'AT' => 'Firmenbuchnummer / UID',
    'FR' => 'SIREN / SIRET',
    'ES' => 'NIF',
    'NL' => 'KVK-nummer / BTW-nummer',
    'BE' => 'Ondernemingsnummer / numéro d’entreprise',
    _ => businessTr(context, 'Registrační nebo daňové číslo firmy'),
  };

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(businessTr(context, 'Business registrace'))),
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
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
                children: [
                  _header(context),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 22),
                    child: Form(
                      key: _formKey,
                      child: AutofillGroup(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              businessTr(context, 'Údaje společnosti'),
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.headlineSmall
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 18),
                            InkWell(
                              onTap: _busy ? null : _selectCountry,
                              borderRadius: BorderRadius.circular(4),
                              child: InputDecorator(
                                decoration: InputDecoration(
                                  labelText: businessTr(
                                    context,
                                    'Země registrace',
                                  ),
                                  border: OutlineInputBorder(),
                                  suffixIcon: Icon(Icons.arrow_drop_down),
                                ),
                                child: Row(
                                  children: [
                                    Text(
                                      _country.flagEmoji,
                                      style: const TextStyle(fontSize: 22),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        _country.getTranslatedName(context) ??
                                            _country.name,
                                      ),
                                    ),
                                    Text(_countryCode),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            _field(
                              controller: _companyName,
                              label: businessTr(
                                context,
                                'Oficiální název firmy',
                              ),
                              autofillHints: const [
                                AutofillHints.organizationName,
                              ],
                            ),
                            const SizedBox(height: 12),
                            _field(
                              controller: _registrationNumber,
                              label: _registrationLabel,
                              inputFormatters: [
                                FilteringTextInputFormatter.allow(
                                  RegExp(r'[a-zA-Z0-9 .\-]'),
                                ),
                              ],
                              validator: _validateRegistrationNumber,
                            ),
                            const SizedBox(height: 12),
                            AddressAutocompleteField(
                              controller: _address,
                              label: businessTr(
                                context,
                                'Fakturační adresa / sídlo firmy',
                              ),
                              countryCode: _countryCode,
                              enabled: !_busy,
                              onSelected: (selection) {
                                _city.text = selection.city;
                                _postalCode.text = selection.postalCode;
                              },
                            ),
                            const SizedBox(height: 12),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  flex: 3,
                                  child: _field(
                                    controller: _city,
                                    label: businessTr(context, 'Město'),
                                    autofillHints: const [
                                      AutofillHints.addressCity,
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  flex: 2,
                                  child: _field(
                                    controller: _postalCode,
                                    label: businessTr(context, 'PSČ'),
                                    autofillHints: const [
                                      AutofillHints.postalCode,
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 20),
                            Text(
                              businessTr(context, 'Pobočka/provozovna'),
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              businessTr(
                                context,
                                'Tato poloha se použije pro Shouty. Může se shodovat se sídlem firmy.',
                              ),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 12),
                            _field(
                              controller: _locationName,
                              label: businessTr(
                                context,
                                'Název pobočky/provozovny',
                              ),
                            ),
                            const SizedBox(height: 12),
                            AddressAutocompleteField(
                              controller: _locationAddress,
                              label: businessTr(
                                context,
                                'Adresa pobočky/provozovny',
                              ),
                              countryCode: _countryCode,
                              enabled: !_busy,
                              onSelected: (selection) => setState(
                                () => _locationSelection = selection,
                              ),
                            ),
                            const SizedBox(height: 20),
                            Text(
                              businessTr(context, 'Přihlašovací údaje'),
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 12),
                            _field(
                              controller: _email,
                              label: businessTr(context, 'Kontaktní e-mail'),
                              keyboardType: TextInputType.emailAddress,
                              autofillHints: const [AutofillHints.email],
                              validator: _validateEmail,
                            ),
                            const SizedBox(height: 12),
                            _passwordField(
                              controller: _password,
                              label: tr(context, 'Heslo'),
                              obscure: _obscurePassword,
                              onToggle: () => setState(
                                () => _obscurePassword = !_obscurePassword,
                              ),
                              validator: (value) => (value ?? '').length < 10
                                  ? tr(
                                      context,
                                      'Heslo musí mít alespoň 10 znaků.',
                                    )
                                  : null,
                            ),
                            const SizedBox(height: 12),
                            _passwordField(
                              controller: _confirmPassword,
                              label: tr(context, 'Zopakovat heslo'),
                              obscure: _obscureConfirmation,
                              onToggle: () => setState(
                                () => _obscureConfirmation =
                                    !_obscureConfirmation,
                              ),
                              validator: (value) => value != _password.text
                                  ? tr(context, 'Hesla se neshodují.')
                                  : null,
                            ),
                            const SizedBox(height: 18),
                            Text(
                              businessTr(
                                context,
                                'Údaje firmy ověříme v dostupném veřejném registru. O výsledku tě budeme informovat e-mailem.',
                              ),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 16),
                            FilledButton(
                              onPressed: _busy ? null : _submit,
                              style: FilledButton.styleFrom(
                                minimumSize: const Size.fromHeight(48),
                              ),
                              child: _busy
                                  ? const SizedBox.square(
                                      dimension: 22,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : Text(
                                      businessTr(
                                        context,
                                        'Vytvořit business účet',
                                      ),
                                    ),
                            ),
                            if (_busy && _progress != null) ...[
                              const SizedBox(height: 8),
                              Semantics(
                                liveRegion: true,
                                child: Text(
                                  businessTr(context, _progress!),
                                  textAlign: TextAlign.center,
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ),
                            ],
                            const SizedBox(height: 16),
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
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );

  Widget _header(BuildContext context) => Stack(
    children: [
      Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 42),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1496A8), Color(0xFF0A6371), Color(0xFF074B57)],
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Image.asset(
                  'assets/branding/feed_mark.png',
                  width: 44,
                  height: 44,
                  cacheWidth: 160,
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
              businessTr(
                context,
                'Vytvoř profil své firmy a oslov lidi ve svém okolí.',
              ),
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.white.withValues(alpha: .84),
              ),
            ),
          ],
        ),
      ),
      Positioned(
        left: 0,
        right: 0,
        bottom: 0,
        child: Container(
          height: 30,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          ),
        ),
      ),
    ],
  );

  TextFormField _field({
    required TextEditingController controller,
    required String label,
    TextInputType? keyboardType,
    Iterable<String>? autofillHints,
    List<TextInputFormatter>? inputFormatters,
    String? Function(String?)? validator,
  }) => TextFormField(
    controller: controller,
    keyboardType: keyboardType,
    autofillHints: autofillHints,
    inputFormatters: inputFormatters,
    validator: validator ?? _required,
    textInputAction: TextInputAction.next,
    decoration: InputDecoration(
      labelText: label,
      border: const OutlineInputBorder(),
    ),
  );

  TextFormField _passwordField({
    required TextEditingController controller,
    required String label,
    required bool obscure,
    required VoidCallback onToggle,
    required String? Function(String?) validator,
  }) => TextFormField(
    controller: controller,
    obscureText: obscure,
    obscuringCharacter: '•',
    autofillHints: const [AutofillHints.newPassword],
    validator: validator,
    textInputAction: TextInputAction.next,
    decoration: InputDecoration(
      labelText: label,
      border: const OutlineInputBorder(),
      suffixIcon: IconButton(
        onPressed: onToggle,
        icon: Icon(
          obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
        ),
      ),
    ),
  );

  String? _required(String? value) => (value ?? '').trim().isEmpty
      ? businessTr(context, 'Toto pole je povinné.')
      : null;

  String? _validateEmail(String? value) {
    final email = (value ?? '').trim();
    return RegExp(
          r'^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$',
        ).hasMatch(email)
        ? null
        : tr(context, 'Zadej platný e-mail.');
  }

  String? _validateRegistrationNumber(String? value) {
    final normalized = (value ?? '').replaceAll(RegExp(r'\s'), '');
    if (_countryCode == 'CZ' && !RegExp(r'^\d{8}$').hasMatch(normalized)) {
      return businessTr(context, 'České IČO musí mít 8 číslic.');
    }
    if (_countryCode == 'IT' && !RegExp(r'^\d{11}$').hasMatch(normalized)) {
      return businessTr(context, 'Italská Partita IVA musí mít 11 číslic.');
    }
    if (_countryCode == 'SK' && !RegExp(r'^\d{8,12}$').hasMatch(normalized)) {
      return businessTr(
        context,
        'Slovenský identifikátor musí mít 8 až 12 číslic.',
      );
    }
    if (_countryCode == 'PL' && !RegExp(r'^\d{10,14}$').hasMatch(normalized)) {
      return businessTr(context, 'Polský NIP/KRS musí mít 10 až 14 číslic.');
    }
    return normalized.length < 3
        ? businessTr(context, 'Zadej registrační číslo firmy.')
        : null;
  }

  void _selectCountry() => showCountryPicker(
    context: context,
    showPhoneCode: false,
    favorite: const ['CZ', 'DE', 'PL', 'SK', 'AT', 'IT', 'FR'],
    countryListTheme: CountryListThemeData(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      bottomSheetHeight: MediaQuery.sizeOf(context).height * .82,
      inputDecoration: InputDecoration(
        labelText: businessTr(context, 'Hledat zemi'),
        prefixIcon: Icon(Icons.search),
        border: OutlineInputBorder(),
      ),
    ),
    onSelect: (country) => setState(() {
      _country = country;
      _locationAddress.clear();
      _locationSelection = null;
    }),
  );

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final location = _locationSelection;
    if (location == null ||
        location.formatted.trim() != _locationAddress.text.trim()) {
      _message(
        businessTr(context, 'Vyberte adresu pobočky/provozovny z nabídky.'),
      );
      return;
    }
    setState(() {
      _busy = true;
      _progress = 'Vytvářím účet…';
    });
    UserCredential? credential;
    final accountStopwatch = Stopwatch()..start();
    try {
      credential = await FirebaseAuth.instance
          .createUserWithEmailAndPassword(
            email: _email.text.trim(),
            password: _password.text,
          )
          .timeout(const Duration(seconds: 20));
      _logBusinessRegistrationTiming('create-account', accountStopwatch);
      final user = credential.user;
      if (user == null) throw StateError('missing-user');
      if (mounted) setState(() => _progress = 'Dokončuji registraci…');
      final applicationStopwatch = Stopwatch()..start();
      final applicationFuture = FirebaseFirestore.instance
          .collection('businessApplications')
          .doc(user.uid)
          .set({
            'userId': user.uid,
            'countryCode': _countryCode,
            'registrationNumber': _registrationNumber.text
                .replaceAll(RegExp(r'\s'), '')
                .toUpperCase(),
            'submittedCompanyName': _companyName.text.trim(),
            'submittedAddress': _address.text.trim(),
            'submittedCity': _city.text.trim(),
            'submittedPostalCode': _postalCode.text.trim(),
            'initialLocationName': _locationName.text.trim(),
            'initialLocationAddress': location.formatted.trim(),
            'initialLocationCity': location.city.trim(),
            'initialLocationPostalCode': location.postalCode.trim(),
            'initialLocationCountryCode': location.countryCode,
            'initialLocation': GeoPoint(location.latitude, location.longitude),
            'initialLocationGeohash': encodeGeohash(
              location.latitude,
              location.longitude,
            ),
            'initialLocationProviderPlaceId': location.placeId,
            'contactEmail': _email.text.trim(),
            'status': 'pending_email',
            'submittedAt': FieldValue.serverTimestamp(),
          })
          .timeout(const Duration(seconds: 20))
          .then(
            (_) => _logBusinessRegistrationTiming(
              'save-business-application',
              applicationStopwatch,
            ),
          );
      final emailStopwatch = Stopwatch()..start();
      final emailFuture = user
          .sendEmailVerification()
          .timeout(const Duration(seconds: 20))
          .then(
            (_) => _logBusinessRegistrationTiming(
              'send-verification-email',
              emailStopwatch,
            ),
          );
      await Future.wait([applicationFuture, emailFuture]);
      TextInput.finishAutofillContext(shouldSave: true);
      if (mounted) Navigator.of(context).pop();
    } on FirebaseAuthException catch (error) {
      if (mounted) {
        _message(
          error.code == 'email-already-in-use'
              ? tr(context, 'Tento e-mail už je zaregistrovaný.')
              : businessTr(
                  context,
                  'Business účet se nepodařilo vytvořit. Zkus to znovu.',
                ),
        );
      }
    } on TimeoutException {
      if (mounted) {
        _message(
          businessTr(
            context,
            'Registrace trvá příliš dlouho. Zkontroluj připojení.',
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        _message(
          '${businessTr(context, 'Žádost se nepodařilo uložit. Kontaktujte podporu:')} $businessSupportEmail',
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _progress = null;
        });
      }
    }
  }

  void _message(String value) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(value)));
}

void _logBusinessRegistrationTiming(String step, Stopwatch stopwatch) {
  assert(() {
    debugPrint(
      'Business registration timing: $step ${stopwatch.elapsedMilliseconds} ms',
    );
    return true;
  }());
}
