import 'package:flutter/widgets.dart';

/// Transitional helper for short UI strings. The canonical app translations
/// remain in the ARB files; this keeps labels that are also stored in Firestore
/// (such as categories) stable while presenting them in the selected language.
String tr(BuildContext context, String czech) {
  final languageCode = Localizations.localeOf(context).languageCode;
  final translations = switch (languageCode) {
    'en' => _english,
    'de' => _german,
    'pl' => _polish,
    _ => null,
  };
  return translations?[czech] ?? czech;
}

const _english = <String, String>{
  'Oznámení': 'Notifications',
  'Přidat shout': 'Add shout',
  'Co se děje v okolí?': 'What is happening nearby?',
  'Okolí': 'Nearby',
  'Uložené': 'Saved',
  'Mé shouty': 'My shouts',
  'Profil': 'Profile',
  'Vzdálenost': 'Distance',
  'Řazení': 'Sort',
  'Nejbližší': 'Nearest',
  'Nejoblíbenější': 'Most popular',
  'Brzy končí': 'Ending soon',
  'V tomto okolí zatím nejsou žádné shouty.': 'There are no shouts nearby yet.',
  'Uložené shouty': 'Saved shouts',
  'Zatím nemáš uložené žádné shouty.': 'You have no saved shouts yet.',
  'Aktivní': 'Active',
  'Expirované': 'Expired',
  'Smazané': 'Deleted',
  'V této části zatím nemáš žádné shouty.':
      'You have no shouts in this section yet.',
  'Odebrat z uložených': 'Remove from saved',
  'Uložit shout': 'Save shout',
  'Smazat shout?': 'Delete shout?',
  'Shout zmizí z veřejného feedu.':
      'The shout will disappear from the public feed.',
  'Zrušit': 'Cancel',
  'Smazat': 'Delete',
  'Smazat shout': 'Delete shout',
  'Shout': 'Shout',
  'Nahlásit': 'Report',
  'Komentáře': 'Comments',
  'Autor': 'Author',
  'Smazat komentář': 'Delete comment',
  'Napiš veřejný komentář': 'Write a public comment',
  'Zatím jsi nenapsal/a žádný komentář.':
      'You have not written any comments yet.',
  'Komentáře se nepodařilo načíst. Zkus to prosím znovu.':
      'Comments could not be loaded. Please try again.',
  'Nový shout': 'New shout',
  'Nadpis': 'Title',
  'Stručně, co se děje?': 'Briefly, what is happening?',
  'Text': 'Text',
  'Doplň podrobnosti…': 'Add details…',
  'Kategorie (vyber nejvýše dvě)': 'Categories (choose up to two)',
  'Platnost': 'Duration',
  'Publikovat': 'Publish',
  'Shout může mít platnost minimálně 15 minut.':
      'A shout must last at least 15 minutes.',
  'Rozumím': 'Got it',
  'Doplň nadpis, text a alespoň jednu kategorii.':
      'Add a title, text and at least one category.',
  'Obecné': 'General',
  'Akce': 'Events',
  'Sport': 'Sports',
  'Zábava': 'Entertainment',
  'Pomoc': 'Help',
  'Upozornění': 'Alert',
  'Dotaz': 'Question',
  'Doprava': 'Transport',
  'Jídlo a pití': 'Food & drink',
  'Kultura': 'Culture',
  'Vytvoř si účet pro dění v okolí.': 'Create an account for local activity.',
  'Přihlas se a zjisti, co se děje v okolí.':
      'Sign in and find out what is happening nearby.',
  'E-mail': 'Email',
  'Heslo': 'Password',
  'Vytvořit účet': 'Create account',
  'Přihlásit se': 'Sign in',
  'Přihlášení': 'Sign in',
  'Registrace': 'Create account',
  'Už účet mám': 'I already have an account',
  'Vytvořit nový účet': 'Create a new account',
  'nebo': 'or',
  'Pokračovat přes Google': 'Continue with Google',
  'Odhlásit se': 'Log out',
  'Tento e-mail už je zaregistrovaný.': 'This email is already registered.',
  'Zvol silnější heslo.': 'Choose a stronger password.',
  'E-mail nebo heslo nesedí.': 'The email or password is incorrect.',
  'Akci se nepodařilo dokončit. Zkus to znovu.':
      'The action could not be completed. Please try again.',
  'Ověř svůj e-mail': 'Verify your email',
  'Už jsem e-mail ověřil/a': 'I have verified my email',
  'Ověřovací odkaz byl zaslán na adresu': 'A verification link was sent to',
  'Po kliknutí se vrať sem.': 'Return here after clicking it.',
  'Poslat ověřovací e-mail znovu': 'Resend verification email',
  'Zpět a opravit e-mail': 'Go back and correct email',
  'Ověřovací e-mail byl odeslán.': 'Verification email sent.',
  'Účet se nepodařilo zrušit. Zkus to prosím znovu.':
      'The account could not be cancelled. Please try again.',
  'Vyber si přezdívku': 'Choose your nickname',
  'Uvidí ji ostatní uživatelé místo tvého skutečného jména.':
      'Other users will see it instead of your real name.',
  'Přezdívka': 'Nickname',
  'Přezdívka je volná': 'Nickname is available',
  'Tato přezdívka je obsazená': 'This nickname is taken',
  'Vygenerovat přezdívku': 'Generate nickname',
  'Pokračovat': 'Continue',
  'Použij 3–24 znaků. Pomlčka a podtržítko mohou být jen mezi částmi přezdívky.':
      'Use 3–24 characters. Hyphens and underscores may only be between nickname parts.',
  'Tato přezdívka už je obsazená.': 'This nickname is already taken.',
  'Přezdívku se nepodařilo uložit.': 'The nickname could not be saved.',
  'Tuto změnu je možné provést pouze jednou za 30 dní. Chceš pokračovat?':
      'This change can only be made once every 30 days. Do you want to continue?',
  'Ano': 'Yes',
  'Zavřít': 'Close',
  'Uložit': 'Save',
  'Zadej jinou přezdívku.': 'Enter a different nickname.',
  'Přezdívku zatím nelze změnit.': 'The nickname cannot be changed yet.',
  'Další změna přezdívky bude možná':
      'Your next nickname change will be available',
  'Přezdívku se nepodařilo změnit.': 'The nickname could not be changed.',
  'Odpovědět': 'Reply',
  'Nahlásit komentář': 'Report comment',
  'Stručně popiš důvod hlášení': 'Briefly describe the reason for the report',
  'Odeslat': 'Send',
  'Hlášení bylo odesláno.': 'Report sent.',
  'Skrytý komentář': 'Hidden comment',
  'Komentář byl skryt kvůli negativnímu hodnocení.':
      'This comment was hidden because of negative ratings.',
  'Zobrazit': 'Show',
  'Odpovídáš': 'Replying to',
  'Odkazovaný komentář už není dostupný.':
      'The linked comment is no longer available.',
  'Shout s nízkým hodnocením': 'Low-rated shout',
  'Tento Shout byl sbalen kvůli výrazně negativnímu hodnocení.':
      'This shout was collapsed because of strongly negative ratings.',
  'Změnit heslo': 'Change password',
  'Aktuální heslo': 'Current password',
  'Nové heslo': 'New password',
  'Potvrdit nové heslo': 'Confirm new password',
  'Hesla se neshodují.': 'Passwords do not match.',
  'Heslo se nepodařilo změnit. Zkontroluj aktuální heslo.':
      'The password could not be changed. Check your current password.',
  'Heslo účtu Google změň přímo u Google.':
      'Change a Google account password directly with Google.',
  'Nastavení notifikací': 'Notification settings',
  'Uložené preference se použijí po zapnutí oznámení.':
      'Saved preferences will apply when notifications are enabled.',
  'Odpovědi na komentáře': 'Replies to comments',
  'Reakce na mé Shouty': 'Reactions to my shouts',
  'Nové Shouty v okolí': 'New shouts nearby',
  'Nápověda': 'Help',
  'Pravidla komunity': 'Community rules',
  'Bezpečné používání ShoutOutu pro všechny.':
      'Using ShoutOut safely for everyone.',
  'ShoutOut je komunitní prostor pro lidi od 16 let. Pomoz udržet feed užitečný a bezpečný.':
      'ShoutOut is a community space for people aged 16 and over. Help keep the feed useful and safe.',
  'Respektuj ostatní': 'Respect others',
  'Neobtěžuj, nevyhrožuj, neponižuj ani nediskriminuj jiné lidi.':
      'Do not harass, threaten, humiliate or discriminate against other people.',
  'Chraň soukromí': 'Protect privacy',
  'Nezveřejňuj cizí osobní údaje, kontakty, přesnou adresu ani soukromé zprávy.':
      'Do not publish another person’s personal data, contacts, exact address or private messages.',
  'Žádný nelegální obsah': 'No illegal content',
  'Nezveřejňuj nabídky drog, zbraní, podvodů ani jinou nezákonnou činnost.':
      'Do not publish offers of drugs, weapons, scams or other illegal activity.',
  '16+ bez explicitního obsahu': '16+ without explicit content',
  'Flirt a neexplicitní debata jsou v pořádku. Pornografie, nahota, sexuální nabídky, obtěžování a obsah týkající se nezletilých jsou zakázané.':
      'Flirting and non-explicit discussion are fine. Pornography, nudity, sexual offers, harassment and content involving minors are prohibited.',
  'Piš veřejně a férově': 'Post publicly and fairly',
  'Shouty a komentáře jsou veřejné. Neposílej spam, manipuluj s hodnocením ani neobcházej blokování a bany.':
      'Shouts and comments are public. Do not spam, manipulate ratings or evade blocks and bans.',
  'Nahlaš problém': 'Report a problem',
  'Nevhodný Shout nebo komentář nahlas. Autora můžeš také zablokovat. Závažné či opakované porušení může vést k omezení nebo trvalému zablokování účtu.':
      'Report an unsuitable shout or comment. You can also block its author. Serious or repeated violations may lead to account restrictions or a permanent ban.',
  'Jak fungují Shouty?': 'How do shouts work?',
  'Shout se zobrazuje lidem v okolí po dobu, kterou nastavíš při publikování.':
      'A shout is shown to people nearby for the duration you choose when publishing.',
  'Jak fungují komentáře?': 'How do comments work?',
  'Na komentář můžeš odpovědět přes @přezdívku, hodnotit ho nebo nahlásit.':
      'You can reply to a comment with @nickname, rate it, or report it.',
  'Bezpečnost a pravidla': 'Safety and rules',
  'Nesdílej veřejně citlivé kontakty. Nevhodný obsah nahlas nebo autora zablokuj.':
      'Do not share sensitive contact details publicly. Report unsuitable content or block its author.',
  'Účet a soukromí': 'Account and privacy',
  'Používáme přezdívku místo skutečného jména. Nastavení účtu najdeš v profilu.':
      'We use a nickname instead of your real name. Find account settings in your profile.',
};

const _german = <String, String>{
  'Oznámení': 'Benachrichtigungen',
  'Přidat shout': 'Shout hinzufügen',
  'Co se děje v okolí?': 'Was passiert in deiner Nähe?',
  'Okolí': 'In der Nähe',
  'Uložené': 'Gespeichert',
  'Mé shouty': 'Meine Shouts',
  'Profil': 'Profil',
  'Vzdálenost': 'Entfernung',
  'Řazení': 'Sortierung',
  'Nejbližší': 'Nächste',
  'Nejoblíbenější': 'Beliebteste',
  'Brzy končí': 'Endet bald',
  'V tomto okolí zatím nejsou žádné shouty.':
      'In deiner Nähe gibt es noch keine Shouts.',
  'Uložené shouty': 'Gespeicherte Shouts',
  'Zatím nemáš uložené žádné shouty.':
      'Du hast noch keine gespeicherten Shouts.',
  'Aktivní': 'Aktiv',
  'Expirované': 'Abgelaufen',
  'Smazané': 'Gelöscht',
  'V této části zatím nemáš žádné shouty.':
      'Du hast in diesem Bereich noch keine Shouts.',
  'Odebrat z uložených': 'Aus Gespeicherten entfernen',
  'Uložit shout': 'Shout speichern',
  'Smazat shout?': 'Shout löschen?',
  'Shout zmizí z veřejného feedu.':
      'Der Shout verschwindet aus dem öffentlichen Feed.',
  'Zrušit': 'Abbrechen',
  'Smazat': 'Löschen',
  'Smazat shout': 'Shout löschen',
  'Shout': 'Shout',
  'Nahlásit': 'Melden',
  'Komentáře': 'Kommentare',
  'Autor': 'Autor',
  'Smazat komentář': 'Kommentar löschen',
  'Napiš veřejný komentář': 'Öffentlichen Kommentar schreiben',
  'Zatím jsi nenapsal/a žádný komentář.':
      'Du hast noch keine Kommentare geschrieben.',
  'Komentáře se nepodařilo načíst. Zkus to prosím znovu.':
      'Kommentare konnten nicht geladen werden. Bitte versuche es erneut.',
  'Nový shout': 'Neuer Shout',
  'Nadpis': 'Titel',
  'Stručně, co se děje?': 'Kurz: Was ist los?',
  'Text': 'Text',
  'Doplň podrobnosti…': 'Details hinzufügen…',
  'Kategorie (vyber nejvýše dvě)': 'Kategorien (maximal zwei wählen)',
  'Platnost': 'Gültigkeit',
  'Publikovat': 'Veröffentlichen',
  'Shout může mít platnost minimálně 15 minut.':
      'Ein Shout muss mindestens 15 Minuten gültig sein.',
  'Rozumím': 'Verstanden',
  'Doplň nadpis, text a alespoň jednu kategorii.':
      'Füge einen Titel, Text und mindestens eine Kategorie hinzu.',
  'Obecné': 'Allgemein',
  'Akce': 'Veranstaltungen',
  'Sport': 'Sport',
  'Zábava': 'Unterhaltung',
  'Pomoc': 'Hilfe',
  'Upozornění': 'Hinweis',
  'Dotaz': 'Frage',
  'Doprava': 'Verkehr',
  'Jídlo a pití': 'Essen & Trinken',
  'Kultura': 'Kultur',
  'Vytvoř si účet pro dění v okolí.':
      'Erstelle ein Konto für lokale Aktivitäten.',
  'Přihlas se a zjisti, co se děje v okolí.':
      'Melde dich an und entdecke, was in deiner Nähe passiert.',
  'E-mail': 'E-Mail',
  'Heslo': 'Passwort',
  'Vytvořit účet': 'Konto erstellen',
  'Přihlásit se': 'Anmelden',
  'Už účet mám': 'Ich habe bereits ein Konto',
  'Vytvořit nový účet': 'Neues Konto erstellen',
  'nebo': 'oder',
  'Pokračovat přes Google': 'Mit Google fortfahren',
  'Odhlásit se': 'Abmelden',
  'Přihlášení': 'Anmelden',
  'Registrace': 'Registrierung',
  'Tento e-mail už je zaregistrovaný.': 'Diese E-Mail ist bereits registriert.',
  'Zvol silnější heslo.': 'Wähle ein stärkeres Passwort.',
  'E-mail nebo heslo nesedí.': 'E-Mail oder Passwort ist nicht korrekt.',
  'Akci se nepodařilo dokončit. Zkus to znovu.':
      'Die Aktion konnte nicht abgeschlossen werden. Bitte versuche es erneut.',
  'Ověř svůj e-mail': 'Bestätige deine E-Mail',
  'Už jsem e-mail ověřil/a': 'Ich habe meine E-Mail bestätigt',
  'Ověřovací odkaz byl zaslán na adresu':
      'Ein Bestätigungslink wurde gesendet an',
  'Po kliknutí se vrať sem.': 'Kehre nach dem Anklicken hierher zurück.',
  'Poslat ověřovací e-mail znovu': 'Bestätigungs-E-Mail erneut senden',
  'Zpět a opravit e-mail': 'Zurück und E-Mail korrigieren',
  'Ověřovací e-mail byl odeslán.': 'Bestätigungs-E-Mail wurde gesendet.',
  'Účet se nepodařilo zrušit. Zkus to prosím znovu.':
      'Das Konto konnte nicht gelöscht werden. Bitte versuche es erneut.',
  'Vyber si přezdívku': 'Wähle einen Spitznamen',
  'Uvidí ji ostatní uživatelé místo tvého skutečného jména.':
      'Andere Nutzer sehen ihn statt deines echten Namens.',
  'Přezdívka': 'Spitzname',
  'Přezdívka je volná': 'Spitzname ist verfügbar',
  'Tato přezdívka je obsazená': 'Dieser Spitzname ist vergeben',
  'Vygenerovat přezdívku': 'Spitznamen generieren',
  'Pokračovat': 'Weiter',
  'Použij 3–24 znaků. Pomlčka a podtržítko mohou být jen mezi částmi přezdívky.':
      'Verwende 3–24 Zeichen. Bindestriche und Unterstriche dürfen nur zwischen Teilen des Spitznamens stehen.',
  'Tato přezdívka už je obsazená.': 'Dieser Spitzname ist bereits vergeben.',
  'Přezdívku se nepodařilo uložit.':
      'Der Spitzname konnte nicht gespeichert werden.',
  'Tuto změnu je možné provést pouze jednou za 30 dní. Chceš pokračovat?':
      'Diese Änderung ist nur einmal alle 30 Tage möglich. Möchtest du fortfahren?',
  'Ano': 'Ja',
  'Zavřít': 'Schließen',
  'Uložit': 'Speichern',
  'Zadej jinou přezdívku.': 'Gib einen anderen Spitznamen ein.',
  'Přezdívku zatím nelze změnit.':
      'Der Spitzname kann noch nicht geändert werden.',
  'Další změna přezdívky bude možná':
      'Die nächste Änderung deines Spitznamens ist möglich ab',
  'Přezdívku se nepodařilo změnit.':
      'Der Spitzname konnte nicht geändert werden.',
  'Odpovědět': 'Antworten',
  'Nahlásit komentář': 'Kommentar melden',
  'Stručně popiš důvod hlášení': 'Beschreibe kurz den Grund für die Meldung',
  'Odeslat': 'Senden',
  'Hlášení bylo odesláno.': 'Meldung wurde gesendet.',
  'Skrytý komentář': 'Ausgeblendeter Kommentar',
  'Komentář byl skryt kvůli negativnímu hodnocení.':
      'Dieser Kommentar wurde wegen negativer Bewertungen ausgeblendet.',
  'Zobrazit': 'Anzeigen',
  'Odpovídáš': 'Antwort an',
  'Odkazovaný komentář už není dostupný.':
      'Der verlinkte Kommentar ist nicht mehr verfügbar.',
  'Shout s nízkým hodnocením': 'Shout mit niedriger Bewertung',
  'Tento Shout byl sbalen kvůli výrazně negativnímu hodnocení.':
      'Dieser Shout wurde wegen stark negativer Bewertungen eingeklappt.',
  'Změnit heslo': 'Passwort ändern',
  'Aktuální heslo': 'Aktuelles Passwort',
  'Nové heslo': 'Neues Passwort',
  'Potvrdit nové heslo': 'Neues Passwort bestätigen',
  'Hesla se neshodují.': 'Die Passwörter stimmen nicht überein.',
  'Heslo se nepodařilo změnit. Zkontroluj aktuální heslo.':
      'Das Passwort konnte nicht geändert werden. Prüfe dein aktuelles Passwort.',
  'Heslo účtu Google změň přímo u Google.':
      'Ändere das Passwort eines Google-Kontos direkt bei Google.',
  'Nastavení notifikací': 'Benachrichtigungseinstellungen',
  'Uložené preference se použijí po zapnutí oznámení.':
      'Gespeicherte Einstellungen werden nach dem Aktivieren von Benachrichtigungen verwendet.',
  'Odpovědi na komentáře': 'Antworten auf Kommentare',
  'Reakce na mé Shouty': 'Reaktionen auf meine Shouts',
  'Nové Shouty v okolí': 'Neue Shouts in der Nähe',
  'Nápověda': 'Hilfe',
  'Pravidla komunity': 'Community-Regeln',
  'Bezpečné používání ShoutOutu pro všechny.':
      'ShoutOut sicher für alle nutzen.',
  'ShoutOut je komunitní prostor pro lidi od 16 let. Pomoz udržet feed užitečný a bezpečný.':
      'ShoutOut ist ein Community-Bereich für Menschen ab 16 Jahren. Hilf mit, den Feed nützlich und sicher zu halten.',
  'Respektuj ostatní': 'Respektiere andere',
  'Neobtěžuj, nevyhrožuj, neponižuj ani nediskriminuj jiné lidi.':
      'Belästige, bedrohe, demütige oder diskriminiere keine anderen Menschen.',
  'Chraň soukromí': 'Schütze die Privatsphäre',
  'Nezveřejňuj cizí osobní údaje, kontakty, přesnou adresu ani soukromé zprávy.':
      'Veröffentliche keine persönlichen Daten, Kontakte, genaue Adresse oder private Nachrichten anderer.',
  'Žádný nelegální obsah': 'Keine illegalen Inhalte',
  'Nezveřejňuj nabídky drog, zbraní, podvodů ani jinou nezákonnou činnost.':
      'Veröffentliche keine Angebote zu Drogen, Waffen, Betrug oder anderen illegalen Aktivitäten.',
  '16+ bez explicitního obsahu': '16+ ohne explizite Inhalte',
  'Flirt a neexplicitní debata jsou v pořádku. Pornografie, nahota, sexuální nabídky, obtěžování a obsah týkající se nezletilých jsou zakázané.':
      'Flirten und nicht explizite Gespräche sind in Ordnung. Pornografie, Nacktheit, sexuelle Angebote, Belästigung und Inhalte über Minderjährige sind verboten.',
  'Piš veřejně a férově': 'Veröffentliche fair',
  'Shouty a komentáře jsou veřejné. Neposílej spam, manipuluj s hodnocením ani neobcházej blokování a bany.':
      'Shouts und Kommentare sind öffentlich. Spamme nicht, manipuliere keine Bewertungen und umgehe keine Sperren oder Bans.',
  'Nahlaš problém': 'Problem melden',
  'Nevhodný Shout nebo komentář nahlas. Autora můžeš také zablokovat. Závažné či opakované porušení může vést k omezení nebo trvalému zablokování účtu.':
      'Melde ungeeignete Shouts oder Kommentare. Du kannst den Autor auch blockieren. Schwere oder wiederholte Verstöße können zu Einschränkungen oder einer dauerhaften Kontosperre führen.',
  'Jak fungují Shouty?': 'Wie funktionieren Shouts?',
  'Shout se zobrazuje lidem v okolí po dobu, kterou nastavíš při publikování.':
      'Ein Shout wird Personen in der Nähe für die beim Veröffentlichen gewählte Dauer angezeigt.',
  'Jak fungují komentáře?': 'Wie funktionieren Kommentare?',
  'Na komentář můžeš odpovědět přes @přezdívku, hodnotit ho nebo nahlásit.':
      'Du kannst auf einen Kommentar mit @Spitzname antworten, ihn bewerten oder melden.',
  'Bezpečnost a pravidla': 'Sicherheit und Regeln',
  'Nesdílej veřejně citlivé kontakty. Nevhodný obsah nahlas nebo autora zablokuj.':
      'Teile keine sensiblen Kontaktdaten öffentlich. Melde ungeeignete Inhalte oder blockiere den Autor.',
  'Účet a soukromí': 'Konto und Datenschutz',
  'Používáme přezdívku místo skutečného jména. Nastavení účtu najdeš v profilu.':
      'Wir verwenden einen Spitznamen statt deines echten Namens. Kontoeinstellungen findest du im Profil.',
};

const _polish = <String, String>{
  'Oznámení': 'Powiadomienia',
  'Přidat shout': 'Dodaj shout',
  'Okolí': 'W pobliżu',
  'Uložené': 'Zapisane',
  'Mé shouty': 'Moje shouty',
  'Profil': 'Profil',
  'Co se děje v okolí?': 'Co dzieje się w pobliżu?',
  'Vzdálenost': 'Odległość',
  'Řazení': 'Sortowanie',
  'Nejbližší': 'Najbliższe',
  'Nejoblíbenější': 'Najpopularniejsze',
  'Brzy končí': 'Wkrótce wygasają',
  'V tomto okolí zatím nejsou žádné shouty.':
      'W tej okolicy nie ma jeszcze shoutów.',
  'Uložené shouty': 'Zapisane shouty',
  'Zatím nemáš uložené žádné shouty.': 'Nie masz jeszcze zapisanych shoutów.',
  'Aktivní': 'Aktywne',
  'Expirované': 'Wygasłe',
  'Smazané': 'Usunięte',
  'V této části zatím nemáš žádné shouty.':
      'Nie masz jeszcze shoutów w tej sekcji.',
  'Odebrat z uložených': 'Usuń z zapisanych',
  'Uložit shout': 'Zapisz shout',
  'Smazat shout?': 'Usunąć shout?',
  'Shout zmizí z veřejného feedu.': 'Shout zniknie z publicznego kanału.',
  'Zrušit': 'Anuluj',
  'Smazat': 'Usuń',
  'Smazat shout': 'Usuń shout',
  'Shout': 'Shout',
  'Nahlásit': 'Zgłoś',
  'Komentáře': 'Komentarze',
  'Autor': 'Autor',
  'Smazat komentář': 'Usuń komentarz',
  'Napiš veřejný komentář': 'Napisz publiczny komentarz',
  'Zatím jsi nenapsal/a žádný komentář.':
      'Nie napisałeś/aś jeszcze żadnego komentarza.',
  'Komentáře se nepodařilo načíst. Zkus to prosím znovu.':
      'Nie udało się wczytać komentarzy. Spróbuj ponownie.',
  'Nový shout': 'Nowy shout',
  'Nadpis': 'Tytuł',
  'Stručně, co se děje?': 'Krótko: co się dzieje?',
  'Text': 'Tekst',
  'Doplň podrobnosti…': 'Dodaj szczegóły…',
  'Kategorie (vyber nejvýše dvě)': 'Kategorie (wybierz maksymalnie dwie)',
  'Platnost': 'Czas trwania',
  'Publikovat': 'Opublikuj',
  'Shout může mít platnost minimálně 15 minut.':
      'Shout musi trwać co najmniej 15 minut.',
  'Rozumím': 'Rozumiem',
  'Doplň nadpis, text a alespoň jednu kategorii.':
      'Dodaj tytuł, tekst i co najmniej jedną kategorię.',
  'Obecné': 'Ogólne',
  'Akce': 'Wydarzenia',
  'Sport': 'Sport',
  'Zábava': 'Rozrywka',
  'Pomoc': 'Pomoc',
  'Upozornění': 'Alert',
  'Dotaz': 'Pytanie',
  'Doprava': 'Transport',
  'Jídlo a pití': 'Jedzenie i napoje',
  'Kultura': 'Kultura',
  'Vytvoř si účet pro dění v okolí.':
      'Utwórz konto, aby śledzić lokalne wydarzenia.',
  'Přihlas se a zjisti, co se děje v okolí.':
      'Zaloguj się i sprawdź, co dzieje się w pobliżu.',
  'E-mail': 'E-mail',
  'Heslo': 'Hasło',
  'Vytvořit účet': 'Utwórz konto',
  'Přihlásit se': 'Zaloguj się',
  'Už účet mám': 'Mam już konto',
  'Vytvořit nový účet': 'Utwórz nowe konto',
  'nebo': 'lub',
  'Pokračovat přes Google': 'Kontynuuj z Google',
  'Odhlásit se': 'Wyloguj się',
  'Přihlášení': 'Logowanie',
  'Registrace': 'Rejestracja',
  'Tento e-mail už je zaregistrovaný.':
      'Ten adres e-mail jest już zarejestrowany.',
  'Zvol silnější heslo.': 'Wybierz silniejsze hasło.',
  'E-mail nebo heslo nesedí.': 'Adres e-mail lub hasło są nieprawidłowe.',
  'Akci se nepodařilo dokončit. Zkus to znovu.':
      'Nie udało się ukończyć działania. Spróbuj ponownie.',
  'Ověř svůj e-mail': 'Potwierdź swój e-mail',
  'Už jsem e-mail ověřil/a': 'Potwierdziłem/am e-mail',
  'Ověřovací odkaz byl zaslán na adresu':
      'Link weryfikacyjny został wysłany na adres',
  'Po kliknutí se vrať sem.': 'Wróć tutaj po kliknięciu linku.',
  'Poslat ověřovací e-mail znovu': 'Wyślij e-mail weryfikacyjny ponownie',
  'Zpět a opravit e-mail': 'Wróć i popraw e-mail',
  'Ověřovací e-mail byl odeslán.': 'E-mail weryfikacyjny został wysłany.',
  'Účet se nepodařilo zrušit. Zkus to prosím znovu.':
      'Nie udało się usunąć konta. Spróbuj ponownie.',
  'Vyber si přezdívku': 'Wybierz pseudonim',
  'Uvidí ji ostatní uživatelé místo tvého skutečného jména.':
      'Inni użytkownicy zobaczą go zamiast Twojego prawdziwego imienia.',
  'Přezdívka': 'Pseudonim',
  'Přezdívka je volná': 'Pseudonim jest dostępny',
  'Tato přezdívka je obsazená': 'Ten pseudonim jest zajęty',
  'Vygenerovat přezdívku': 'Wygeneruj pseudonim',
  'Pokračovat': 'Kontynuuj',
  'Použij 3–24 znaků. Pomlčka a podtržítko mohou být jen mezi částmi přezdívky.':
      'Użyj 3–24 znaków. Myślniki i podkreślenia mogą znajdować się tylko między częściami pseudonimu.',
  'Tato přezdívka už je obsazená.': 'Ten pseudonim jest już zajęty.',
  'Přezdívku se nepodařilo uložit.': 'Nie udało się zapisać pseudonimu.',
  'Tuto změnu je možné provést pouze jednou za 30 dní. Chceš pokračovat?':
      'Ta zmiana jest możliwa tylko raz na 30 dni. Czy chcesz kontynuować?',
  'Ano': 'Tak',
  'Zavřít': 'Zamknij',
  'Uložit': 'Zapisz',
  'Zadej jinou přezdívku.': 'Wpisz inny pseudonim.',
  'Přezdívku zatím nelze změnit.': 'Pseudonimu nie można jeszcze zmienić.',
  'Další změna přezdívky bude možná':
      'Kolejna zmiana pseudonimu będzie możliwa',
  'Přezdívku se nepodařilo změnit.': 'Nie udało się zmienić pseudonimu.',
  'Odpovědět': 'Odpowiedz',
  'Nahlásit komentář': 'Zgłoś komentarz',
  'Stručně popiš důvod hlášení': 'Krótko opisz powód zgłoszenia',
  'Odeslat': 'Wyślij',
  'Hlášení bylo odesláno.': 'Zgłoszenie zostało wysłane.',
  'Skrytý komentář': 'Ukryty komentarz',
  'Komentář byl skryt kvůli negativnímu hodnocení.':
      'Ten komentarz został ukryty z powodu negatywnych ocen.',
  'Zobrazit': 'Pokaż',
  'Odpovídáš': 'Odpowiadasz do',
  'Odkazovaný komentář už není dostupný.':
      'Komentarz, do którego prowadzi link, nie jest już dostępny.',
  'Shout s nízkým hodnocením': 'Shout z niską oceną',
  'Tento Shout byl sbalen kvůli výrazně negativnímu hodnocení.':
      'Ten shout został zwinięty z powodu bardzo negatywnych ocen.',
  'Změnit heslo': 'Zmień hasło',
  'Aktuální heslo': 'Aktualne hasło',
  'Nové heslo': 'Nowe hasło',
  'Potvrdit nové heslo': 'Potwierdź nowe hasło',
  'Hesla se neshodují.': 'Hasła nie są takie same.',
  'Heslo se nepodařilo změnit. Zkontroluj aktuální heslo.':
      'Nie udało się zmienić hasła. Sprawdź aktualne hasło.',
  'Heslo účtu Google změň přímo u Google.':
      'Hasło do konta Google zmień bezpośrednio w Google.',
  'Nastavení notifikací': 'Ustawienia powiadomień',
  'Uložené preference se použijí po zapnutí oznámení.':
      'Zapisane preferencje będą użyte po włączeniu powiadomień.',
  'Odpovědi na komentáře': 'Odpowiedzi na komentarze',
  'Reakce na mé Shouty': 'Reakcje na moje shouty',
  'Nové Shouty v okolí': 'Nowe shouty w pobliżu',
  'Nápověda': 'Pomoc',
  'Pravidla komunity': 'Zasady społeczności',
  'Bezpečné používání ShoutOutu pro všechny.':
      'Bezpieczne korzystanie z ShoutOut dla wszystkich.',
  'ShoutOut je komunitní prostor pro lidi od 16 let. Pomoz udržet feed užitečný a bezpečný.':
      'ShoutOut to przestrzeń społecznościowa dla osób od 16 lat. Pomóż utrzymać użyteczny i bezpieczny feed.',
  'Respektuj ostatní': 'Szanuj innych',
  'Neobtěžuj, nevyhrožuj, neponižuj ani nediskriminuj jiné lidi.':
      'Nie nękaj, nie groź, nie poniżaj ani nie dyskryminuj innych osób.',
  'Chraň soukromí': 'Chroń prywatność',
  'Nezveřejňuj cizí osobní údaje, kontakty, přesnou adresu ani soukromé zprávy.':
      'Nie publikuj cudzych danych osobowych, kontaktów, dokładnego adresu ani prywatnych wiadomości.',
  'Žádný nelegální obsah': 'Zakaz nielegalnych treści',
  'Nezveřejňuj nabídky drog, zbraní, podvodů ani jinou nezákonnou činnost.':
      'Nie publikuj ofert narkotyków, broni, oszustw ani innej nielegalnej działalności.',
  '16+ bez explicitního obsahu': '16+ bez treści eksplicitnych',
  'Flirt a neexplicitní debata jsou v pořádku. Pornografie, nahota, sexuální nabídky, obtěžování a obsah týkající se nezletilých jsou zakázané.':
      'Flirt i nieeksplicytna rozmowa są w porządku. Pornografia, nagość, oferty seksualne, nękanie i treści dotyczące osób niepełnoletnich są zabronione.',
  'Piš veřejně a férově': 'Publikuj uczciwie',
  'Shouty a komentáře jsou veřejné. Neposílej spam, manipuluj s hodnocením ani neobcházej blokování a bany.':
      'Shouty i komentarze są publiczne. Nie spamuj, nie manipuluj ocenami ani nie omijaj blokad i banów.',
  'Nahlaš problém': 'Zgłoś problem',
  'Nevhodný Shout nebo komentář nahlas. Autora můžeš také zablokovat. Závažné či opakované porušení může vést k omezení nebo trvalému zablokování účtu.':
      'Zgłoś nieodpowiedni shout lub komentarz. Możesz też zablokować autora. Poważne lub powtarzające się naruszenia mogą prowadzić do ograniczeń lub trwałej blokady konta.',
  'Jak fungují Shouty?': 'Jak działają shouty?',
  'Shout se zobrazuje lidem v okolí po dobu, kterou nastavíš při publikování.':
      'Shout jest widoczny dla osób w pobliżu przez czas wybrany podczas publikacji.',
  'Jak fungují komentáře?': 'Jak działają komentarze?',
  'Na komentář můžeš odpovědět přes @přezdívku, hodnotit ho nebo nahlásit.':
      'Na komentarz możesz odpowiedzieć przez @pseudonim, ocenić go lub zgłosić.',
  'Bezpečnost a pravidla': 'Bezpieczeństwo i zasady',
  'Nesdílej veřejně citlivé kontakty. Nevhodný obsah nahlas nebo autora zablokuj.':
      'Nie udostępniaj publicznie wrażliwych danych kontaktowych. Zgłoś nieodpowiednią treść lub zablokuj autora.',
  'Účet a soukromí': 'Konto i prywatność',
  'Používáme přezdívku místo skutečného jména. Nastavení účtu najdeš v profilu.':
      'Używamy pseudonimu zamiast prawdziwego imienia. Ustawienia konta znajdziesz w profilu.',
};
