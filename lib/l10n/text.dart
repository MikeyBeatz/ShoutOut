import 'package:flutter/widgets.dart';

import 'text_sk.dart';
import 'text_uk.dart';
import 'text_vi.dart';

/// Transitional helper for short UI strings. The canonical app translations
/// remain in the ARB files; this keeps labels that are also stored in Firestore
/// (such as categories) stable while presenting them in the selected language.
String tr(BuildContext context, String czech) {
  final languageCode = Localizations.localeOf(context).languageCode;
  final translations = switch (languageCode) {
    'en' => _english,
    'de' => _german,
    'pl' => _polish,
    'sk' => slovakTranslations,
    'uk' => ukrainianTranslations,
    'vi' => vietnameseTranslations,
    _ => null,
  };
  return translations?[czech] ?? czech;
}

const _english = <String, String>{
  'Sledované': 'Following',
  'Profily': 'Profiles',
  'Sledovat': 'Follow',
  'Sledováno': 'Following',
  'Nahlásit účet': 'Report account',
  'Aktivní Shouty': 'Active Shouts',
  'Zatím nesleduješ žádné profily.': 'You are not following any profiles yet.',
  'Tento účet nyní nemá žádné aktivní Shouty.':
      'This account has no active Shouts right now.',
  'Shouty se nepodařilo načíst.': 'Shouts could not be loaded.',
  'Důvod': 'Reason',
  'Oznámení': 'Notifications',
  'Přidat shout': 'Add shout',
  'Co se děje v okolí?': 'What is happening nearby?',
  'Okolí': 'Nearby',
  'Uložené': 'Saved',
  'Mé shouty': 'My shouts',
  'Profil': 'Profile',
  'Vzdálenost': 'Distance',
  'Řazení': 'Sort',
  'Kategorie': 'Category',
  'Vše': 'All',
  'Změnit avatar': 'Change avatar',
  'Upravit profil': 'Edit profile',
  'Vyber si avatar': 'Choose an avatar',
  'Tvůj avatar': 'Your avatar',
  'Upravit avatar': 'Customize avatar',
  'Náhodný avatar': 'Random avatar',
  'První barva': 'First color',
  'Druhá barva': 'Second color',
  'Prohodit barvy': 'Swap colors',
  'Směr přechodu': 'Gradient direction',
  'Opačný směr vytvoříš prohozením první a druhé barvy.':
      'Swap the first and second colors to reverse the direction.',
  'Zatím nemáš žádná oznámení.': 'You have no notifications yet.',
  'Nejbližší': 'Nearest',
  'Oblíbené': 'Popular',
  'Brzy končí': 'Ending soon',
  'Nejblíž': 'Nearby',
  'Top': 'Top',
  'Končící': 'Ending',
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
  'Soukromě': 'Private',
  'Soukromě odpovědět': 'Reply privately',
  'Soukromá odpověď': 'Private reply',
  'Napiš soukromou odpověď': 'Write a private reply',
  'Odpovědět soukromě': 'Reply privately',
  'Nahlásit soukromou odpověď': 'Report private reply',
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
  'Zopakovat heslo': 'Repeat password',
  'Alespoň 10 znaků': 'At least 10 characters',
  'Zadej platný e-mail.': 'Enter a valid email address.',
  'Heslo musí mít alespoň 10 znaků.':
      'The password must be at least 10 characters long.',
  'Zapomenuté heslo?': 'Forgot password?',
  'Pokud pro tento e-mail existuje účet, poslali jsme odkaz pro změnu hesla.':
      'If an account exists for this email, we sent a password reset link.',
  'E-mail pro změnu hesla se nepodařilo odeslat.':
      'The password reset email could not be sent.',
  'Zobrazit heslo': 'Show password',
  'Skrýt heslo': 'Hide password',
  'Vytvořit účet': 'Create account',
  'Vytvářím účet…': 'Creating account…',
  'Přihlašuji…': 'Signing in…',
  'Odesílám ověřovací e-mail…': 'Sending verification email…',
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
  '3–24 znaků · písmena a čísla · mezery nahraď _ nebo -':
      '3–24 characters · letters and numbers · replace spaces with _ or -',
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
  'Tento Shout už není dostupný.': 'This Shout is no longer available.',
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
  'Notifikace': 'Notifications',
  'Uložené preference se použijí po zapnutí oznámení.':
      'Saved preferences will apply when notifications are enabled.',
  'Odpovědi na komentáře': 'Replies to comments',
  'Reakce na mé Shouty': 'Reactions to my shouts',
  'Nové Shouty v okolí': 'New shouts nearby',
  'Soukromé odpovědi': 'Private replies',
  'Nové Shouty sledovaných profilů': 'New Shouts from followed profiles',
  'Oznámení se nepodařilo načíst.': 'Notifications could not be loaded.',
  'Označit vše jako přečtené': 'Mark all as read',
  'Někdo': 'Someone',
  'reagoval na tvůj Shout.': 'reacted to your Shout.',
  'okomentoval tvůj Shout.': 'commented on your Shout.',
  'reagoval na tvůj komentář.': 'reacted to your comment.',
  'dal like tvému Shoutu': 'liked your Shout',
  'dal dislike tvému Shoutu': 'disliked your Shout',
  'uživatelů dalo like tvému Shoutu': 'users liked your Shout',
  'uživatelů dalo dislike tvému Shoutu': 'users disliked your Shout',
  'okomentoval tvůj Shout': 'commented on your Shout',
  'uživatelů komentovalo tvůj Shout': 'users commented on your Shout',
  'dal like tvému komentáři': 'liked your comment on',
  'dal dislike tvému komentáři': 'disliked your comment on',
  'uživatelů dalo like tvému komentáři': 'users liked your comment on',
  'uživatelů dalo dislike tvému komentáři': 'users disliked your comment on',
  'odpověděl na tvůj komentář': 'replied to your comment on',
  'uživatelů odpovědělo na tvůj komentář': 'users replied to your comment on',
  'ti poslal soukromou odpověď': 'sent you a private reply on',
  'uživatelů ti poslalo soukromou odpověď': 'users sent you private replies on',
  'odpověděl na tvůj komentář.': 'replied to your comment.',
  'ti poslal soukromou odpověď.': 'sent you a private reply.',
  'zveřejnil nový Shout.': 'published a new Shout.',
  'Nové oznámení': 'New notification',
  'Nápověda': 'Help',
  'Moderace': 'Moderation',
  'Soukromé': 'Private',
  'Smazat účet?': 'Delete account?',
  'Požádat o smazání': 'Request deletion',
  'Účet čeká na smazání': 'Account pending deletion',
  'Žádost byla přijata. Účet nelze používat a bude zpracován serverovou automatizací.':
      'Your request was received. The account cannot be used and will be processed by server automation.',
  'Veřejný obsah bude při serverovém zpracování skryt. Potřebné bezpečnostní záznamy zůstanou 60 dní, potom budou odstraněny nebo anonymizovány.':
      'Public content will be hidden during server processing. Necessary security records will be retained for 60 days, then deleted or anonymised.',
  'Moje varování': 'My warnings',
  'Nemáš žádná varování.': 'You have no warnings.',
  'Varování od moderace': 'Moderation warning',
  'Shouty': 'Shouts',
  'Hlášení se nepodařilo načíst.': 'Reports could not be loaded.',
  'Žádná otevřená hlášení.': 'No open reports.',
  'Nahlásil/a': 'Reported by',
  'Označit jako vyřešené': 'Mark as resolved',
  'Odstranit z veřejnosti': 'Remove from public view',
  'Udělit varování': 'Issue warning',
  'Ban na 1 den': '1-day ban',
  'Trvalý ban': 'Permanent ban',
  'Účet je omezen': 'Account restricted',
  'Nelegální obsah nebo drogy': 'Illegal content or drugs',
  'Obtěžování, nenávist nebo vyhrožování': 'Harassment, hate or threats',
  'Osobní údaje nebo soukromí': 'Personal data or privacy',
  'Spam, podvod nebo manipulace': 'Spam, scam or manipulation',
  'Explicitní nebo nevhodný obsah': 'Explicit or inappropriate content',
  'Jiné': 'Other',
  'Důvod hlášení': 'Report reason',
  'Volitelně doplň podrobnosti': 'Optionally add details',
  'Právní informace': 'Legal information',
  'Právní info': 'Legal info',
  'Varování': 'Warnings',
  'Podmínky použití': 'Terms of use',
  'Zásady ochrany soukromí': 'Privacy policy',
  'Než začneš': 'Before you start',
  'ShoutOut je veřejný komunitní prostor. Před prvním použitím potvrď věk a seznam se s pravidly.':
      'ShoutOut is a public community space. Before using it for the first time, confirm your age and read the rules.',
  'Potvrzuji, že je mi alespoň 16 let.':
      'I confirm that I am at least 16 years old.',
  'Souhlasím s Podmínkami použití a beru na vědomí Zásady ochrany soukromí.':
      'I agree to the Terms of use and acknowledge the Privacy policy.',
  'Verze': 'Version',
  'Souhlas se nepodařilo uložit. Zkus to znovu.':
      'Your acceptance could not be saved. Try again.',
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
  'Blokovat autora': 'Block author',
  'Blokovat autora?': 'Block author?',
  'Jeho Shouty se přestanou zobrazovat ve tvém feedu.':
      'Their Shouts will no longer appear in your feed.',
  'Blokovat': 'Block',
  'Pro publikování Shoutu povol přístup k poloze.':
      'Allow location access to publish a Shout.',
  'Zapni polohové služby a zkus Shout publikovat znovu.':
      'Turn on location services and try publishing the Shout again.',
  'Povol aplikaci přístup k poloze v nastavení zařízení.':
      'Allow location access for the app in your device settings.',
  'Polohu se nepodařilo zjistit včas. Přejdi na otevřené místo a zkus to znovu.':
      'Your location could not be determined in time. Move to an open area and try again.',
  'Polohu se nepodařilo zjistit. Zkontroluj připojení a polohové služby.':
      'Your location could not be determined. Check your connection and location services.',
  'Otevřít nastavení': 'Open settings',
  'Shout se nepodařilo publikovat kvůli oprávnění účtu. Zkontroluj ověření e-mailu a stav účtu.':
      'The Shout could not be published due to account permissions. Check email verification and your account status.',
  'Služba je dočasně nedostupná. Zkontroluj připojení a zkus to znovu.':
      'The service is temporarily unavailable. Check your connection and try again.',
  'Připojení k přihlášení trvá příliš dlouho. Zkontroluj internet a zkus to znovu.':
      'Connecting to sign-in is taking too long. Check your internet connection and try again.',
  'E-mail zatím není potvrzený. Po otevření odkazu chvíli počkej a zkus kontrolu znovu.':
      'The email is not verified yet. After opening the link, wait a moment and check again.',
  'Kontrola ověření trvá příliš dlouho. Zkontroluj internet a zkus to znovu.':
      'The verification check is taking too long. Check your internet connection and try again.',
  'Ověření se nepodařilo načíst. Zkontroluj internet a zkus to znovu.':
      'Verification could not be loaded. Check your internet connection and try again.',
  'Odeslání ověřovacího e-mailu trvá příliš dlouho. Zkontroluj internet a zkus to znovu.':
      'Sending the verification email is taking too long. Check your internet connection and try again.',
  'Ověřovací e-mail se nepodařilo odeslat. Zkus to později.':
      'The verification email could not be sent. Try again later.',
  'Profil se nepodařilo načíst. Zkontroluj připojení a spusť aplikaci znovu.':
      'The profile could not be loaded. Check your connection and restart the app.',
};

const _german = <String, String>{
  'Sledované': 'Gefolgt',
  'Profily': 'Profile',
  'Sledovat': 'Folgen',
  'Sledováno': 'Gefolgt',
  'Nahlásit účet': 'Konto melden',
  'Aktivní Shouty': 'Aktive Shouts',
  'Zatím nesleduješ žádné profily.': 'Du folgst noch keinen Profilen.',
  'Tento účet nyní nemá žádné aktivní Shouty.':
      'Dieses Konto hat derzeit keine aktiven Shouts.',
  'Shouty se nepodařilo načíst.': 'Shouts konnten nicht geladen werden.',
  'Důvod': 'Grund',
  'Oznámení': 'Benachrichtigungen',
  'Přidat shout': 'Shout hinzufügen',
  'Co se děje v okolí?': 'Was passiert in deiner Nähe?',
  'Okolí': 'In der Nähe',
  'Uložené': 'Gespeichert',
  'Mé shouty': 'Meine Shouts',
  'Profil': 'Profil',
  'Vzdálenost': 'Entfernung',
  'Řazení': 'Sortierung',
  'Kategorie': 'Kategorie',
  'Vše': 'Alle',
  'Změnit avatar': 'Avatar ändern',
  'Upravit profil': 'Profil bearbeiten',
  'Vyber si avatar': 'Wähle einen Avatar',
  'Tvůj avatar': 'Dein Avatar',
  'Upravit avatar': 'Avatar anpassen',
  'Náhodný avatar': 'Zufälliger Avatar',
  'První barva': 'Erste Farbe',
  'Druhá barva': 'Zweite Farbe',
  'Prohodit barvy': 'Farben tauschen',
  'Směr přechodu': 'Verlaufsrichtung',
  'Opačný směr vytvoříš prohozením první a druhé barvy.':
      'Vertausche die erste und zweite Farbe, um die Richtung umzukehren.',
  'Zatím nemáš žádná oznámení.': 'Du hast noch keine Benachrichtigungen.',
  'Nejbližší': 'Nächste',
  'Oblíbené': 'Beliebt',
  'Brzy končí': 'Endet bald',
  'Nejblíž': 'Nähe',
  'Top': 'Top',
  'Končící': 'Endet',
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
  'Soukromě': 'Privat',
  'Soukromě odpovědět': 'Privat antworten',
  'Soukromá odpověď': 'Private Antwort',
  'Napiš soukromou odpověď': 'Private Antwort schreiben',
  'Odpovědět soukromě': 'Privat antworten',
  'Nahlásit soukromou odpověď': 'Private Antwort melden',
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
  'Zopakovat heslo': 'Passwort wiederholen',
  'Alespoň 10 znaků': 'Mindestens 10 Zeichen',
  'Zadej platný e-mail.': 'Gib eine gültige E-Mail-Adresse ein.',
  'Heslo musí mít alespoň 10 znaků.':
      'Das Passwort muss mindestens 10 Zeichen lang sein.',
  'Zapomenuté heslo?': 'Passwort vergessen?',
  'Pokud pro tento e-mail existuje účet, poslali jsme odkaz pro změnu hesla.':
      'Falls für diese E-Mail ein Konto existiert, haben wir einen Link zum Zurücksetzen des Passworts gesendet.',
  'E-mail pro změnu hesla se nepodařilo odeslat.':
      'Die E-Mail zum Zurücksetzen des Passworts konnte nicht gesendet werden.',
  'Zobrazit heslo': 'Passwort anzeigen',
  'Skrýt heslo': 'Passwort ausblenden',
  'Vytvořit účet': 'Konto erstellen',
  'Vytvářím účet…': 'Konto wird erstellt…',
  'Přihlašuji…': 'Anmeldung läuft…',
  'Odesílám ověřovací e-mail…': 'Bestätigungs-E-Mail wird gesendet…',
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
  '3–24 znaků · písmena a čísla · mezery nahraď _ nebo -':
      '3–24 Zeichen · Buchstaben und Zahlen · Leerzeichen durch _ oder - ersetzen',
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
  'Tento Shout už není dostupný.': 'Dieser Shout ist nicht mehr verfügbar.',
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
  'Notifikace': 'Benachrichtigungen',
  'Uložené preference se použijí po zapnutí oznámení.':
      'Gespeicherte Einstellungen werden nach dem Aktivieren von Benachrichtigungen verwendet.',
  'Odpovědi na komentáře': 'Antworten auf Kommentare',
  'Reakce na mé Shouty': 'Reaktionen auf meine Shouts',
  'Nové Shouty v okolí': 'Neue Shouts in der Nähe',
  'Soukromé odpovědi': 'Private Antworten',
  'Nové Shouty sledovaných profilů': 'Neue Shouts von gefolgten Profilen',
  'Oznámení se nepodařilo načíst.':
      'Benachrichtigungen konnten nicht geladen werden.',
  'Označit vše jako přečtené': 'Alle als gelesen markieren',
  'Někdo': 'Jemand',
  'reagoval na tvůj Shout.': 'hat auf deinen Shout reagiert.',
  'reagoval na tvůj komentář.': 'hat auf deinen Kommentar reagiert.',
  'dal like tvému Shoutu': 'gefällt dein Shout',
  'dal dislike tvému Shoutu': 'gefällt dein Shout nicht',
  'uživatelů dalo like tvému Shoutu': 'Nutzern gefällt dein Shout',
  'uživatelů dalo dislike tvému Shoutu': 'Nutzern gefällt dein Shout nicht',
  'okomentoval tvůj Shout': 'hat deinen Shout kommentiert',
  'uživatelů komentovalo tvůj Shout': 'Nutzer haben deinen Shout kommentiert',
  'dal like tvému komentáři': 'gefällt dein Kommentar zu',
  'dal dislike tvému komentáři': 'gefällt dein Kommentar nicht zu',
  'uživatelů dalo like tvému komentáři': 'Nutzern gefällt dein Kommentar zu',
  'uživatelů dalo dislike tvému komentáři':
      'Nutzern gefällt dein Kommentar nicht zu',
  'odpověděl na tvůj komentář': 'hat auf deinen Kommentar geantwortet zu',
  'uživatelů odpovědělo na tvůj komentář':
      'Nutzer antworteten auf deinen Kommentar zu',
  'ti poslal soukromou odpověď': 'hat dir privat geantwortet zu',
  'uživatelů ti poslalo soukromou odpověď':
      'Nutzer haben dir privat geantwortet zu',
  'okomentoval tvůj Shout.': 'hat deinen Shout kommentiert.',
  'odpověděl na tvůj komentář.': 'hat auf deinen Kommentar geantwortet.',
  'ti poslal soukromou odpověď.': 'hat dir privat geantwortet.',
  'zveřejnil nový Shout.': 'hat einen neuen Shout veröffentlicht.',
  'Nové oznámení': 'Neue Benachrichtigung',
  'Nápověda': 'Hilfe',
  'Moderace': 'Moderation',
  'Soukromé': 'Privat',
  'Smazat účet?': 'Konto löschen?',
  'Požádat o smazání': 'Löschung beantragen',
  'Účet čeká na smazání': 'Konto wartet auf Löschung',
  'Žádost byla přijata. Účet nelze používat a bude zpracován serverovou automatizací.':
      'Dein Antrag wurde angenommen. Das Konto kann nicht genutzt werden und wird durch Serverautomatisierung verarbeitet.',
  'Veřejný obsah bude při serverovém zpracování skryt. Potřebné bezpečnostní záznamy zůstanou 60 dní, potom budou odstraněny nebo anonymizovány.':
      'Öffentliche Inhalte werden bei der Serververarbeitung verborgen. Notwendige Sicherheitsdaten bleiben 60 Tage erhalten und werden danach gelöscht oder anonymisiert.',
  'Moje varování': 'Meine Verwarnungen',
  'Nemáš žádná varování.': 'Du hast keine Verwarnungen.',
  'Varování od moderace': 'Verwarnung durch Moderation',
  'Shouty': 'Shouts',
  'Hlášení se nepodařilo načíst.': 'Meldungen konnten nicht geladen werden.',
  'Žádná otevřená hlášení.': 'Keine offenen Meldungen.',
  'Nahlásil/a': 'Gemeldet von',
  'Označit jako vyřešené': 'Als erledigt markieren',
  'Odstranit z veřejnosti': 'Aus der Öffentlichkeit entfernen',
  'Udělit varování': 'Verwarnung erteilen',
  'Ban na 1 den': 'Sperre für 1 Tag',
  'Trvalý ban': 'Dauerhafte Sperre',
  'Účet je omezen': 'Konto eingeschränkt',
  'Nelegální obsah nebo drogy': 'Illegale Inhalte oder Drogen',
  'Obtěžování, nenávist nebo vyhrožování': 'Belästigung, Hass oder Drohungen',
  'Osobní údaje nebo soukromí': 'Personenbezogene Daten oder Privatsphäre',
  'Spam, podvod nebo manipulace': 'Spam, Betrug oder Manipulation',
  'Explicitní nebo nevhodný obsah': 'Explizite oder unangemessene Inhalte',
  'Jiné': 'Andere',
  'Důvod hlášení': 'Meldegrund',
  'Volitelně doplň podrobnosti': 'Optional Details ergänzen',
  'Právní informace': 'Rechtliche Informationen',
  'Právní info': 'Rechtliches',
  'Varování': 'Warnungen',
  'Podmínky použití': 'Nutzungsbedingungen',
  'Zásady ochrany soukromí': 'Datenschutzerklärung',
  'Než začneš': 'Bevor du beginnst',
  'ShoutOut je veřejný komunitní prostor. Před prvním použitím potvrď věk a seznam se s pravidly.':
      'ShoutOut ist ein öffentlicher Community-Bereich. Bestätige vor der ersten Nutzung dein Alter und lies die Regeln.',
  'Potvrzuji, že je mi alespoň 16 let.':
      'Ich bestätige, dass ich mindestens 16 Jahre alt bin.',
  'Souhlasím s Podmínkami použití a beru na vědomí Zásady ochrany soukromí.':
      'Ich stimme den Nutzungsbedingungen zu und nehme die Datenschutzerklärung zur Kenntnis.',
  'Verze': 'Version',
  'Souhlas se nepodařilo uložit. Zkus to znovu.':
      'Deine Zustimmung konnte nicht gespeichert werden. Versuche es erneut.',
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
  'Blokovat autora': 'Autor blockieren',
  'Blokovat autora?': 'Autor blockieren?',
  'Jeho Shouty se přestanou zobrazovat ve tvém feedu.':
      'Seine Shouts werden nicht mehr in deinem Feed angezeigt.',
  'Blokovat': 'Blockieren',
  'Pro publikování Shoutu povol přístup k poloze.':
      'Erlaube den Standortzugriff, um einen Shout zu veröffentlichen.',
  'Zapni polohové služby a zkus Shout publikovat znovu.':
      'Aktiviere die Standortdienste und versuche erneut, den Shout zu veröffentlichen.',
  'Povol aplikaci přístup k poloze v nastavení zařízení.':
      'Erlaube der App den Standortzugriff in den Geräteeinstellungen.',
  'Polohu se nepodařilo zjistit včas. Přejdi na otevřené místo a zkus to znovu.':
      'Der Standort konnte nicht rechtzeitig ermittelt werden. Gehe ins Freie und versuche es erneut.',
  'Polohu se nepodařilo zjistit. Zkontroluj připojení a polohové služby.':
      'Der Standort konnte nicht ermittelt werden. Prüfe Verbindung und Standortdienste.',
  'Otevřít nastavení': 'Einstellungen öffnen',
  'Shout se nepodařilo publikovat kvůli oprávnění účtu. Zkontroluj ověření e-mailu a stav účtu.':
      'Der Shout konnte wegen der Kontoberechtigungen nicht veröffentlicht werden. Prüfe E-Mail-Bestätigung und Kontostatus.',
  'Služba je dočasně nedostupná. Zkontroluj připojení a zkus to znovu.':
      'Der Dienst ist vorübergehend nicht verfügbar. Prüfe die Verbindung und versuche es erneut.',
  'Připojení k přihlášení trvá příliš dlouho. Zkontroluj internet a zkus to znovu.':
      'Die Verbindung zur Anmeldung dauert zu lange. Prüfe deine Internetverbindung und versuche es erneut.',
  'E-mail zatím není potvrzený. Po otevření odkazu chvíli počkej a zkus kontrolu znovu.':
      'Die E-Mail ist noch nicht bestätigt. Warte nach dem Öffnen des Links kurz und prüfe erneut.',
  'Kontrola ověření trvá příliš dlouho. Zkontroluj internet a zkus to znovu.':
      'Die Überprüfung dauert zu lange. Prüfe deine Internetverbindung und versuche es erneut.',
  'Ověření se nepodařilo načíst. Zkontroluj internet a zkus to znovu.':
      'Die Bestätigung konnte nicht geladen werden. Prüfe deine Internetverbindung und versuche es erneut.',
  'Odeslání ověřovacího e-mailu trvá příliš dlouho. Zkontroluj internet a zkus to znovu.':
      'Das Senden der Bestätigungs-E-Mail dauert zu lange. Prüfe deine Internetverbindung und versuche es erneut.',
  'Ověřovací e-mail se nepodařilo odeslat. Zkus to později.':
      'Die Bestätigungs-E-Mail konnte nicht gesendet werden. Versuche es später erneut.',
  'Profil se nepodařilo načíst. Zkontroluj připojení a spusť aplikaci znovu.':
      'Das Profil konnte nicht geladen werden. Prüfe die Verbindung und starte die App neu.',
};

const _polish = <String, String>{
  'Sledované': 'Obserwowane',
  'Profily': 'Profile',
  'Sledovat': 'Obserwuj',
  'Sledováno': 'Obserwujesz',
  'Nahlásit účet': 'Zgłoś konto',
  'Aktivní Shouty': 'Aktywne Shouty',
  'Zatím nesleduješ žádné profily.': 'Nie obserwujesz jeszcze żadnych profili.',
  'Tento účet nyní nemá žádné aktivní Shouty.':
      'To konto nie ma teraz aktywnych Shoutów.',
  'Shouty se nepodařilo načíst.': 'Nie udało się wczytać Shoutów.',
  'Důvod': 'Powód',
  'Oznámení': 'Powiadomienia',
  'Přidat shout': 'Dodaj shout',
  'Okolí': 'W pobliżu',
  'Uložené': 'Zapisane',
  'Mé shouty': 'Moje shouty',
  'Profil': 'Profil',
  'Co se děje v okolí?': 'Co dzieje się w pobliżu?',
  'Vzdálenost': 'Odległość',
  'Řazení': 'Sortowanie',
  'Kategorie': 'Kategoria',
  'Vše': 'Wszystkie',
  'Změnit avatar': 'Zmień awatar',
  'Upravit profil': 'Edytuj profil',
  'Vyber si avatar': 'Wybierz awatar',
  'Tvůj avatar': 'Twój awatar',
  'Upravit avatar': 'Dostosuj awatar',
  'Náhodný avatar': 'Losowy awatar',
  'První barva': 'Pierwszy kolor',
  'Druhá barva': 'Drugi kolor',
  'Prohodit barvy': 'Zamień kolory',
  'Směr přechodu': 'Kierunek gradientu',
  'Opačný směr vytvoříš prohozením první a druhé barvy.':
      'Zamień pierwszy i drugi kolor, aby odwrócić kierunek.',
  'Zatím nemáš žádná oznámení.': 'Nie masz jeszcze żadnych powiadomień.',
  'Nejbližší': 'Najbliższe',
  'Oblíbené': 'Popularne',
  'Brzy končí': 'Wkrótce wygasają',
  'Nejblíž': 'Blisko',
  'Top': 'Top',
  'Končící': 'Koniec',
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
  'Soukromě': 'Prywatnie',
  'Soukromě odpovědět': 'Odpowiedz prywatnie',
  'Soukromá odpověď': 'Prywatna odpowiedź',
  'Napiš soukromou odpověď': 'Napisz prywatną odpowiedź',
  'Odpovědět soukromě': 'Odpowiedz prywatnie',
  'Nahlásit soukromou odpověď': 'Zgłoś prywatną odpowiedź',
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
  'Zopakovat heslo': 'Powtórz hasło',
  'Alespoň 10 znaků': 'Co najmniej 10 znaków',
  'Zadej platný e-mail.': 'Wpisz prawidłowy adres e-mail.',
  'Heslo musí mít alespoň 10 znaků.': 'Hasło musi mieć co najmniej 10 znaków.',
  'Zapomenuté heslo?': 'Nie pamiętasz hasła?',
  'Pokud pro tento e-mail existuje účet, poslali jsme odkaz pro změnu hesla.':
      'Jeśli istnieje konto dla tego adresu e-mail, wysłaliśmy link do zmiany hasła.',
  'E-mail pro změnu hesla se nepodařilo odeslat.':
      'Nie udało się wysłać wiadomości do zmiany hasła.',
  'Zobrazit heslo': 'Pokaż hasło',
  'Skrýt heslo': 'Ukryj hasło',
  'Vytvořit účet': 'Utwórz konto',
  'Vytvářím účet…': 'Tworzenie konta…',
  'Přihlašuji…': 'Logowanie…',
  'Odesílám ověřovací e-mail…': 'Wysyłanie e-maila weryfikacyjnego…',
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
  '3–24 znaků · písmena a čísla · mezery nahraď _ nebo -':
      '3–24 znaki · litery i cyfry · spacje zastąp _ lub -',
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
  'Tento Shout už není dostupný.': 'Ten Shout nie jest już dostępny.',
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
  'Notifikace': 'Powiadomienia',
  'Uložené preference se použijí po zapnutí oznámení.':
      'Zapisane preferencje będą użyte po włączeniu powiadomień.',
  'Odpovědi na komentáře': 'Odpowiedzi na komentarze',
  'Reakce na mé Shouty': 'Reakcje na moje shouty',
  'Nové Shouty v okolí': 'Nowe shouty w pobliżu',
  'Soukromé odpovědi': 'Prywatne odpowiedzi',
  'Nové Shouty sledovaných profilů': 'Nowe Shouty obserwowanych profili',
  'Oznámení se nepodařilo načíst.': 'Nie udało się wczytać powiadomień.',
  'Označit vše jako přečtené': 'Oznacz wszystkie jako przeczytane',
  'Někdo': 'Ktoś',
  'reagoval na tvůj Shout.': 'zareagował na Twój Shout.',
  'reagoval na tvůj komentář.': 'zareagował na Twój komentarz.',
  'dal like tvému Shoutu': 'polubił Twój Shout',
  'dal dislike tvému Shoutu': 'nie polubił Twojego Shoutu',
  'uživatelů dalo like tvému Shoutu': 'użytkowników polubiło Twój Shout',
  'uživatelů dalo dislike tvému Shoutu':
      'użytkowników nie polubiło Twojego Shoutu',
  'okomentoval tvůj Shout': 'skomentował Twój Shout',
  'uživatelů komentovalo tvůj Shout': 'użytkowników skomentowało Twój Shout',
  'dal like tvému komentáři': 'polubił Twój komentarz pod',
  'dal dislike tvému komentáři': 'nie polubił Twojego komentarza pod',
  'uživatelů dalo like tvému komentáři':
      'użytkowników polubiło Twój komentarz pod',
  'uživatelů dalo dislike tvému komentáři':
      'użytkowników nie polubiło Twojego komentarza pod',
  'odpověděl na tvůj komentář': 'odpowiedział na Twój komentarz pod',
  'uživatelů odpovědělo na tvůj komentář':
      'użytkowników odpowiedziało na Twój komentarz pod',
  'ti poslal soukromou odpověď': 'wysłał Ci prywatną odpowiedź pod',
  'uživatelů ti poslalo soukromou odpověď':
      'użytkowników wysłało Ci prywatne odpowiedzi pod',
  'okomentoval tvůj Shout.': 'skomentował Twój Shout.',
  'odpověděl na tvůj komentář.': 'odpowiedział na Twój komentarz.',
  'ti poslal soukromou odpověď.': 'wysłał Ci prywatną odpowiedź.',
  'zveřejnil nový Shout.': 'opublikował nowy Shout.',
  'Nové oznámení': 'Nowe powiadomienie',
  'Nápověda': 'Pomoc',
  'Moderace': 'Moderacja',
  'Soukromé': 'Prywatne',
  'Smazat účet?': 'Usunąć konto?',
  'Požádat o smazání': 'Poproś o usunięcie',
  'Účet čeká na smazání': 'Konto oczekuje na usunięcie',
  'Žádost byla přijata. Účet nelze používat a bude zpracován serverovou automatizací.':
      'Twoje żądanie zostało przyjęte. Konto nie może być używane i zostanie przetworzone przez automatyzację serwera.',
  'Veřejný obsah bude při serverovém zpracování skryt. Potřebné bezpečnostní záznamy zůstanou 60 dní, potom budou odstraněny nebo anonymizovány.':
      'Publiczne treści zostaną ukryte podczas przetwarzania na serwerze. Niezbędne dane bezpieczeństwa będą przechowywane przez 60 dni, a następnie usunięte lub zanonimizowane.',
  'Moje varování': 'Moje ostrzeżenia',
  'Nemáš žádná varování.': 'Nie masz ostrzeżeń.',
  'Varování od moderace': 'Ostrzeżenie od moderacji',
  'Shouty': 'Shouty',
  'Hlášení se nepodařilo načíst.': 'Nie udało się wczytać zgłoszeń.',
  'Žádná otevřená hlášení.': 'Brak otwartych zgłoszeń.',
  'Nahlásil/a': 'Zgłoszone przez',
  'Označit jako vyřešené': 'Oznacz jako rozwiązane',
  'Odstranit z veřejnosti': 'Usuń z widoku publicznego',
  'Udělit varování': 'Udziel ostrzeżenia',
  'Ban na 1 den': 'Ban na 1 dzień',
  'Trvalý ban': 'Trwały ban',
  'Účet je omezen': 'Konto ograniczone',
  'Nelegální obsah nebo drogy': 'Nielegalne treści lub narkotyki',
  'Obtěžování, nenávist nebo vyhrožování': 'Nękanie, nienawiść lub groźby',
  'Osobní údaje nebo soukromí': 'Dane osobowe lub prywatność',
  'Spam, podvod nebo manipulace': 'Spam, oszustwo lub manipulacja',
  'Explicitní nebo nevhodný obsah': 'Treści eksplicytne lub nieodpowiednie',
  'Jiné': 'Inne',
  'Důvod hlášení': 'Powód zgłoszenia',
  'Volitelně doplň podrobnosti': 'Opcjonalnie dodaj szczegóły',
  'Právní informace': 'Informacje prawne',
  'Právní info': 'Informacje prawne',
  'Varování': 'Ostrzeżenia',
  'Podmínky použití': 'Warunki korzystania',
  'Zásady ochrany soukromí': 'Polityka prywatności',
  'Než začneš': 'Zanim zaczniesz',
  'ShoutOut je veřejný komunitní prostor. Před prvním použitím potvrď věk a seznam se s pravidly.':
      'ShoutOut to publiczna przestrzeń społecznościowa. Przed pierwszym użyciem potwierdź wiek i zapoznaj się z zasadami.',
  'Potvrzuji, že je mi alespoň 16 let.':
      'Potwierdzam, że mam co najmniej 16 lat.',
  'Souhlasím s Podmínkami použití a beru na vědomí Zásady ochrany soukromí.':
      'Akceptuję Warunki korzystania i przyjmuję do wiadomości Politykę prywatności.',
  'Verze': 'Wersja',
  'Souhlas se nepodařilo uložit. Zkus to znovu.':
      'Nie udało się zapisać akceptacji. Spróbuj ponownie.',
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
  'Blokovat autora': 'Zablokuj autora',
  'Blokovat autora?': 'Zablokować autora?',
  'Jeho Shouty se přestanou zobrazovat ve tvém feedu.':
      'Jego shouty przestaną pojawiać się w Twoim kanale.',
  'Blokovat': 'Zablokuj',
  'Pro publikování Shoutu povol přístup k poloze.':
      'Zezwól na dostęp do lokalizacji, aby opublikować shout.',
  'Zapni polohové služby a zkus Shout publikovat znovu.':
      'Włącz usługi lokalizacyjne i spróbuj ponownie opublikować Shout.',
  'Povol aplikaci přístup k poloze v nastavení zařízení.':
      'Zezwól aplikacji na dostęp do lokalizacji w ustawieniach urządzenia.',
  'Polohu se nepodařilo zjistit včas. Přejdi na otevřené místo a zkus to znovu.':
      'Nie udało się ustalić lokalizacji na czas. Przejdź na otwartą przestrzeń i spróbuj ponownie.',
  'Polohu se nepodařilo zjistit. Zkontroluj připojení a polohové služby.':
      'Nie udało się ustalić lokalizacji. Sprawdź połączenie i usługi lokalizacyjne.',
  'Otevřít nastavení': 'Otwórz ustawienia',
  'Shout se nepodařilo publikovat kvůli oprávnění účtu. Zkontroluj ověření e-mailu a stav účtu.':
      'Nie udało się opublikować Shoutu z powodu uprawnień konta. Sprawdź weryfikację e-maila i stan konta.',
  'Služba je dočasně nedostupná. Zkontroluj připojení a zkus to znovu.':
      'Usługa jest tymczasowo niedostępna. Sprawdź połączenie i spróbuj ponownie.',
  'Připojení k přihlášení trvá příliš dlouho. Zkontroluj internet a zkus to znovu.':
      'Łączenie z logowaniem trwa zbyt długo. Sprawdź internet i spróbuj ponownie.',
  'E-mail zatím není potvrzený. Po otevření odkazu chvíli počkej a zkus kontrolu znovu.':
      'E-mail nie jest jeszcze potwierdzony. Po otwarciu linku odczekaj chwilę i sprawdź ponownie.',
  'Kontrola ověření trvá příliš dlouho. Zkontroluj internet a zkus to znovu.':
      'Sprawdzanie weryfikacji trwa zbyt długo. Sprawdź internet i spróbuj ponownie.',
  'Ověření se nepodařilo načíst. Zkontroluj internet a zkus to znovu.':
      'Nie udało się wczytać weryfikacji. Sprawdź internet i spróbuj ponownie.',
  'Odeslání ověřovacího e-mailu trvá příliš dlouho. Zkontroluj internet a zkus to znovu.':
      'Wysyłanie e-maila weryfikacyjnego trwa zbyt długo. Sprawdź internet i spróbuj ponownie.',
  'Ověřovací e-mail se nepodařilo odeslat. Zkus to později.':
      'Nie udało się wysłać e-maila weryfikacyjnego. Spróbuj później.',
  'Profil se nepodařilo načíst. Zkontroluj připojení a spusť aplikaci znovu.':
      'Nie udało się wczytać profilu. Sprawdź połączenie i uruchom aplikację ponownie.',
};
