import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'l10n/text.dart';

const legalVersion = '2026-07-25';
const _acceptanceDocument = 'acceptance_2026_07_25';

enum LegalDocumentType { terms, privacy }

class LegalSection {
  const LegalSection(this.title, this.body);
  final String title;
  final String body;
}

class LegalAcceptanceGate extends StatelessWidget {
  const LegalAcceptanceGate({
    super.key,
    required this.user,
    required this.child,
  });
  final User user;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final acceptance = FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .collection('legal')
        .doc(_acceptanceDocument);
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: acceptance.snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        return snapshot.data!.exists
            ? child
            : LegalAcceptancePage(userId: user.uid, acceptance: acceptance);
      },
    );
  }
}

class LegalAcceptancePage extends StatefulWidget {
  const LegalAcceptancePage({
    super.key,
    required this.userId,
    required this.acceptance,
  });
  final String userId;
  final DocumentReference<Map<String, dynamic>> acceptance;

  @override
  State<LegalAcceptancePage> createState() => _LegalAcceptancePageState();
}

class _LegalAcceptancePageState extends State<LegalAcceptancePage> {
  bool _ageConfirmed = false;
  bool _documentsAccepted = false;
  bool _saving = false;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.verified_user_outlined, size: 56),
                const SizedBox(height: 16),
                Text(
                  tr(context, 'Než začneš'),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  tr(
                    context,
                    'ShoutOut je veřejný komunitní prostor. Před prvním použitím potvrď věk a seznam se s pravidly.',
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: () => _open(LegalDocumentType.terms),
                  icon: const Icon(Icons.article_outlined),
                  label: Text(tr(context, 'Podmínky použití')),
                ),
                OutlinedButton.icon(
                  onPressed: () => _open(LegalDocumentType.privacy),
                  icon: const Icon(Icons.privacy_tip_outlined),
                  label: Text(tr(context, 'Zásady ochrany soukromí')),
                ),
                const SizedBox(height: 12),
                CheckboxListTile(
                  value: _ageConfirmed,
                  onChanged: _saving
                      ? null
                      : (value) =>
                            setState(() => _ageConfirmed = value ?? false),
                  title: Text(
                    tr(context, 'Potvrzuji, že je mi alespoň 16 let.'),
                  ),
                  controlAffinity: ListTileControlAffinity.leading,
                ),
                CheckboxListTile(
                  value: _documentsAccepted,
                  onChanged: _saving
                      ? null
                      : (value) =>
                            setState(() => _documentsAccepted = value ?? false),
                  title: Text(
                    tr(
                      context,
                      'Souhlasím s Podmínkami použití a beru na vědomí Zásady ochrany soukromí.',
                    ),
                  ),
                  controlAffinity: ListTileControlAffinity.leading,
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: _saving || !_ageConfirmed || !_documentsAccepted
                      ? null
                      : _accept,
                  child: Text(tr(context, 'Pokračovat')),
                ),
                TextButton(
                  onPressed: _saving ? null : FirebaseAuth.instance.signOut,
                  child: Text(tr(context, 'Odhlásit se')),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );

  void _open(LegalDocumentType type) => Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => LegalDocumentPage(type: type)),
  );

  Future<void> _accept() async {
    setState(() => _saving = true);
    try {
      await widget.acceptance.set({
        'termsVersion': legalVersion,
        'privacyVersion': legalVersion,
        'communityRulesVersion': legalVersion,
        'ageConfirmed': true,
        'acceptedAt': FieldValue.serverTimestamp(),
        'acceptedLanguage': Localizations.localeOf(context).languageCode,
      });
    } on FirebaseException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'Souhlas se nepodařilo uložit. Zkus to znovu.'),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class LegalHubPage extends StatelessWidget {
  const LegalHubPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(tr(context, 'Právní informace'))),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: LegalDocumentType.values
          .map(
            (type) => Card(
              child: ListTile(
                leading: Icon(
                  type == LegalDocumentType.terms
                      ? Icons.article_outlined
                      : Icons.privacy_tip_outlined,
                ),
                title: Text(_title(context, type)),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => LegalDocumentPage(type: type),
                  ),
                ),
              ),
            ),
          )
          .toList(),
    ),
  );
}

class LegalDocumentPage extends StatelessWidget {
  const LegalDocumentPage({super.key, required this.type});
  final LegalDocumentType type;

  @override
  Widget build(BuildContext context) {
    final sections = _document(
      Localizations.localeOf(context).languageCode,
      type,
    );
    return Scaffold(
      appBar: AppBar(title: Text(_title(context, type))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            '${tr(context, 'Verze')} $legalVersion',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          ...sections.map(
            (section) => Padding(
              padding: const EdgeInsets.only(bottom: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    section.title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(section.body),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String _title(BuildContext context, LegalDocumentType type) => tr(
  context,
  type == LegalDocumentType.terms
      ? 'Podmínky použití'
      : 'Zásady ochrany soukromí',
);

List<LegalSection> _document(String language, LegalDocumentType type) {
  final terms = type == LegalDocumentType.terms;
  if (language == 'en') return terms ? _enTerms : _enPrivacy;
  if (language == 'de') return terms ? _deTerms : _dePrivacy;
  if (language == 'pl') return terms ? _plTerms : _plPrivacy;
  if (language == 'sk' || language == 'uk' || language == 'vi') {
    return terms ? _enTerms : _enPrivacy;
  }
  return terms ? _csTerms : _csPrivacy;
}

const _csTerms = [
  LegalSection(
    '1. Služba a věk',
    'ShoutOut je veřejná komunitní aplikace pro osoby od 16 let. Službu v přípravě provozuje ShoutOut; úplné identifikační údaje provozovatele a funkční kontakt support@shoutout.app budou doplněny před veřejným spuštěním.',
  ),
  LegalSection(
    '2. Tvůj obsah a pravidla',
    'Za každý Shout a komentář odpovídá jeho autor. Obsah musí dodržovat Pravidla komunity: zejména nesmí obsahovat nelegální nabídky, obtěžování, cizí osobní údaje, spam ani explicitní sexuální obsah. ShoutOut není seznamka ani služba pro soukromé domlouvání kontaktů.',
  ),
  LegalSection(
    '3. Moderace',
    'Obsah a účty lze na základě hlášení nebo vlastního zjištění skrýt, odstranit nebo omezit. Podle závažnosti může následovat napomenutí, dočasný nebo trvalý ban. Dotčenému uživateli sdělíme důvod omezení, pokud tomu nebrání bezpečnostní či právní důvody.',
  ),
  LegalSection(
    '4. Veřejnost a poloha',
    'Shouty a komentáře jsou veřejné pro přihlášené uživatele. Poloha slouží jen k řazení Shoutů v okolí během používání aplikace; ostatním se má zobrazovat vzdálenost, nikoli přesný bod autora.',
  ),
  LegalSection(
    '5. Dostupnost',
    'Službu můžeme měnit, pozastavit nebo ukončit. Nezaručujeme nepřetržitou dostupnost ani správnost obsahu vytvořeného uživateli. Podmínky můžeme změnit; u podstatné změny vyžádáme nové potvrzení.',
  ),
];

const _csPrivacy = [
  LegalSection(
    '1. Kdo data zpracovává',
    'Správcem bude před veřejným spuštěním společnost ShoutOut. Do té doby jde o vývojové prostředí. Pro dotazy k soukromí bude určen kontakt support@shoutout.app; před spuštěním musí být tato adresa zprovozněna.',
  ),
  LegalSection(
    '2. Jaká data a proč',
    'Zpracováváme e-mail a technický identifikátor účtu pro přihlášení, přezdívku pro veřejné vystupování, Shouty, komentáře, reakce, hlášení, blokace a nastavení. Při používání aplikace používáme přesnou polohu pro zobrazení obsahu v okolí; nevedeme historii pohybu mimo používání aplikace.',
  ),
  LegalSection(
    '3. Uložení a doba uchování',
    'Data ukládáme ve Firebase od Google. Aktivní účet držíme po dobu používání služby. Po smazání účtu se veřejný obsah skryje; bezpečnostní záznamy, identifikátor účtu, e-mail, hlášení a potřebný obsah se uchovají 60 dní pro prevenci zneužití a ochranu právních nároků, poté budou odstraněny nebo anonymizovány. Expirovaný Shout včetně komentářů má být odstraněn po 7 dnech; v tomto vývojovém prostředí může být uchování delší, dokud není nasazena serverová automatizace.',
  ),
  LegalSection(
    '4. Reklama, analytika a tvoje práva',
    'V této verzi nejsou zapnuté reklamy ani produktová analytika. Nebudeme prodávat identifikovatelné osobní údaje, přesnou polohu, e-mail ani obsah. Před zapnutím volitelné analytiky či personalizace zobrazíme samostatnou volbu. Máš právo na přístup, opravu, výmaz, omezení, námitku a přenositelnost v rozsahu stanoveném právem; žádost vyřídíme přes kontaktní adresu.',
  ),
];

const _enTerms = [
  LegalSection(
    '1. Service and age',
    'ShoutOut is a public community app for people aged 16 and over. During preparation, the service is operated as ShoutOut; the full operator details and working contact support@shoutout.app will be added before public launch.',
  ),
  LegalSection(
    '2. Your content and rules',
    'The author is responsible for every shout and comment. Content must comply with the Community Rules: in particular, no illegal offers, harassment, other people’s personal data, spam or explicit sexual content. ShoutOut is not a dating service or a private contact-arrangement service.',
  ),
  LegalSection(
    '3. Moderation',
    'Content and accounts may be hidden, removed or restricted following a report or our own finding. Depending on severity, this may result in a warning, temporary ban or permanent ban. We will explain the reason for a restriction unless safety or legal reasons prevent it.',
  ),
  LegalSection(
    '4. Public content and location',
    'Shouts and comments are public to signed-in users. Location is used only to sort nearby shouts while using the app; other users should see distance, not the author’s exact point.',
  ),
  LegalSection(
    '5. Availability',
    'We may change, suspend or end the service. We do not guarantee uninterrupted availability or the accuracy of user-created content. We may change these terms and will request new acceptance for material changes.',
  ),
];

const _enPrivacy = [
  LegalSection(
    '1. Who processes data',
    'The controller will be ShoutOut before public launch. Until then, this is a development environment. Questions about privacy will be handled through support@shoutout.app, which must be operational before launch.',
  ),
  LegalSection(
    '2. Data and purposes',
    'We process email and a technical account identifier for sign-in, a nickname for public presence, shouts, comments, reactions, reports, blocks and settings. While using the app, we use precise location to show nearby content; we do not keep a movement history outside app use.',
  ),
  LegalSection(
    '3. Storage and retention',
    'Data is stored in Google Firebase. We retain an active account while the service is used. After account deletion, public content is hidden; security records, account identifier, email, reports and necessary content are retained for 60 days to prevent abuse and protect legal claims, then deleted or anonymised. An expired shout and its comments should be deleted after 7 days; retention can be longer in this development environment until server automation is deployed.',
  ),
  LegalSection(
    '4. Advertising, analytics and rights',
    'Advertising and product analytics are not enabled in this version. We will not sell identifiable personal data, precise location, email or content. Before enabling optional analytics or personalisation, we will show a separate choice. You have rights of access, correction, erasure, restriction, objection and portability as provided by law; requests can be made through the contact address.',
  ),
];

const _deTerms = [
  LegalSection(
    '1. Dienst und Alter',
    'ShoutOut ist eine öffentliche Community-App für Personen ab 16 Jahren. Während der Vorbereitung wird der Dienst als ShoutOut betrieben; vollständige Betreiberangaben und der funktionierende Kontakt support@shoutout.app werden vor dem öffentlichen Start ergänzt.',
  ),
  LegalSection(
    '2. Deine Inhalte und Regeln',
    'Für jeden Shout und Kommentar ist der Autor verantwortlich. Inhalte müssen die Community-Regeln einhalten: insbesondere keine illegalen Angebote, Belästigung, personenbezogenen Daten anderer, Spam oder expliziten sexuellen Inhalte. ShoutOut ist keine Dating- oder private Kontaktvermittlung.',
  ),
  LegalSection(
    '3. Moderation',
    'Inhalte und Konten können nach einer Meldung oder eigener Feststellung verborgen, entfernt oder eingeschränkt werden. Je nach Schwere kann dies zu einer Verwarnung, einer vorübergehenden oder dauerhaften Sperre führen. Wir erläutern den Grund, soweit Sicherheits- oder Rechtsgründe dem nicht entgegenstehen.',
  ),
  LegalSection(
    '4. Öffentliche Inhalte und Standort',
    'Shouts und Kommentare sind für angemeldete Nutzer öffentlich. Der Standort dient nur zum Sortieren naher Shouts während der Nutzung; andere Nutzer sollen die Entfernung sehen, nicht den genauen Punkt des Autors.',
  ),
  LegalSection(
    '5. Verfügbarkeit',
    'Wir können den Dienst ändern, aussetzen oder beenden. Eine ununterbrochene Verfügbarkeit oder die Richtigkeit nutzergenerierter Inhalte wird nicht garantiert. Bei wesentlichen Änderungen fordern wir eine neue Zustimmung an.',
  ),
];

const _dePrivacy = [
  LegalSection(
    '1. Wer Daten verarbeitet',
    'Verantwortlicher wird vor dem öffentlichen Start ShoutOut sein. Bis dahin handelt es sich um eine Entwicklungsumgebung. Fragen zum Datenschutz werden über support@shoutout.app bearbeitet; diese Adresse muss vor dem Start funktionieren.',
  ),
  LegalSection(
    '2. Daten und Zwecke',
    'Wir verarbeiten E-Mail und technische Konto-ID für die Anmeldung, einen Spitznamen für das öffentliche Auftreten, Shouts, Kommentare, Reaktionen, Meldungen, Sperren und Einstellungen. Während der App-Nutzung verwenden wir den genauen Standort für Inhalte in der Nähe; außerhalb der Nutzung speichern wir keinen Bewegungsverlauf.',
  ),
  LegalSection(
    '3. Speicherung und Fristen',
    'Daten werden in Google Firebase gespeichert. Ein aktives Konto bleibt während der Nutzung erhalten. Nach der Löschung werden öffentliche Inhalte verborgen; Sicherheitsdaten, Konto-ID, E-Mail, Meldungen und notwendige Inhalte bleiben 60 Tage zur Missbrauchsprävention und Wahrung rechtlicher Ansprüche gespeichert und werden danach gelöscht oder anonymisiert. Abgelaufene Shouts samt Kommentaren sollen nach 7 Tagen gelöscht werden; in der Entwicklungsumgebung kann dies bis zur Serverautomatisierung länger dauern.',
  ),
  LegalSection(
    '4. Werbung, Analytik und Rechte',
    'Werbung und Produktanalytik sind in dieser Version nicht aktiv. Wir verkaufen keine identifizierbaren personenbezogenen Daten, genauen Standorte, E-Mails oder Inhalte. Vor optionaler Analytik oder Personalisierung zeigen wir eine eigene Auswahl. Dir stehen die gesetzlichen Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch und Datenübertragbarkeit zu.',
  ),
];

const _plTerms = [
  LegalSection(
    '1. Usługa i wiek',
    'ShoutOut to publiczna aplikacja społecznościowa dla osób od 16 lat. W okresie przygotowań usługa działa jako ShoutOut; pełne dane operatora i działający kontakt support@shoutout.app zostaną dodane przed publicznym startem.',
  ),
  LegalSection(
    '2. Treści i zasady',
    'Autor odpowiada za każdy shout i komentarz. Treści muszą spełniać Zasady społeczności: w szczególności zakazane są nielegalne oferty, nękanie, dane osobowe innych osób, spam i eksplicytne treści seksualne. ShoutOut nie jest serwisem randkowym ani usługą prywatnego umawiania kontaktów.',
  ),
  LegalSection(
    '3. Moderacja',
    'Treści i konta mogą zostać ukryte, usunięte lub ograniczone po zgłoszeniu albo własnym ustaleniu. W zależności od wagi może to oznaczać ostrzeżenie, tymczasowy lub trwały ban. Wyjaśnimy przyczynę ograniczenia, o ile nie uniemożliwiają tego względy bezpieczeństwa lub prawne.',
  ),
  LegalSection(
    '4. Publiczność i lokalizacja',
    'Shouty i komentarze są publiczne dla zalogowanych użytkowników. Lokalizacja służy tylko do sortowania shoutów w pobliżu podczas korzystania z aplikacji; inni użytkownicy powinni widzieć odległość, a nie dokładny punkt autora.',
  ),
  LegalSection(
    '5. Dostępność',
    'Możemy zmienić, zawiesić lub zakończyć usługę. Nie gwarantujemy nieprzerwanej dostępności ani poprawności treści użytkowników. Przy istotnej zmianie poprosimy o ponowną akceptację.',
  ),
];

const _plPrivacy = [
  LegalSection(
    '1. Kto przetwarza dane',
    'Administratorem będzie ShoutOut przed publicznym startem. Do tego czasu jest to środowisko rozwojowe. Pytania o prywatność będą obsługiwane przez support@shoutout.app; adres musi działać przed startem.',
  ),
  LegalSection(
    '2. Dane i cele',
    'Przetwarzamy e-mail i techniczny identyfikator konta do logowania, pseudonim do publicznej obecności, shouty, komentarze, reakcje, zgłoszenia, blokady i ustawienia. Podczas używania aplikacji korzystamy z dokładnej lokalizacji, aby pokazać treści w pobliżu; poza używaniem aplikacji nie przechowujemy historii ruchu.',
  ),
  LegalSection(
    '3. Przechowywanie i okresy',
    'Dane są przechowywane w Google Firebase. Aktywne konto zachowujemy podczas korzystania z usługi. Po usunięciu konta publiczne treści są ukrywane; dane bezpieczeństwa, identyfikator konta, e-mail, zgłoszenia i niezbędne treści pozostają przez 60 dni w celu zapobiegania nadużyciom i ochrony roszczeń prawnych, a następnie są usuwane lub anonimizowane. Wygasły shout wraz z komentarzami powinien zostać usunięty po 7 dniach; w środowisku rozwojowym okres może być dłuższy do czasu wdrożenia automatyzacji serwerowej.',
  ),
  LegalSection(
    '4. Reklamy, analityka i prawa',
    'Reklamy i analityka produktu nie są w tej wersji aktywne. Nie sprzedajemy identyfikowalnych danych osobowych, dokładnej lokalizacji, e-maili ani treści. Przed włączeniem opcjonalnej analityki lub personalizacji pokażemy oddzielny wybór. Przysługują Ci ustawowe prawa dostępu, sprostowania, usunięcia, ograniczenia, sprzeciwu i przenoszenia danych.',
  ),
];
