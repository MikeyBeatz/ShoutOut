# Architektura ShoutOut

Tento dokument popisuje současnou implementaci aplikace. Je určen vývojáři,
který projekt nezná a potřebuje pochopit jeho hranice, odpovědnosti a tok dat.
Produktové záměry, které ještě nejsou implementované, jsou pouze v `TODO.md`.

## Základní principy

- Flutter klient je společný pro Android a web.
- Firebase Authentication zajišťuje e-mailové účty a ověření adresy.
- Cloud Firestore je hlavní databáze, realtime zdroj obrazovek a současně
  serverová validační vrstva prostřednictvím `firestore.rules`.
- Důležité vícečetné zápisy jsou atomické transakce nebo batche. Klient například
  nesmí změnit veřejný počet reakcí bez odpovídající reakce a rate-limit události.
- Veřejná identita autora se načítá z `publicProfiles/{uid}`. Kopie avataru a
  přezdívky v obsahu je pouze historický fallback.
- Běžný Shout používá polohu zařízení zaokrouhlenou funkcí
  `publicLocationCoordinate`; Business Shout používá ověřenou polohu pobočky.
- Firestore Rules jsou součást aplikační logiky. Změna klientského zápisu bez
  odpovídající změny pravidel a jejich testů je neúplná změna.

## Spouštěcí a přístupový tok

```text
main()
  └─ Firebase.initializeApp
     └─ Android App Check
        └─ ShoutOutApp
           └─ AuthGate
              ├─ nepřihlášený → SignInPage
              ├─ neověřený e-mail → VerifyEmailPage
              └─ ověřený e-mail → BusinessApplicationGate
                 ├─ čekající Business žádost → stav ověření
                 └─ běžný nebo aktivovaný Business účet → ProfileGate
                    ├─ právní souhlas
                    ├─ vytvoření přezdívky, avataru a profilů
                    ├─ žádost o smazání / ban / omezení obsahu
                    ├─ úvodní nápověda
                    └─ ShoutOutHome
```

`ProfileGate` současně synchronizuje jazyk a režim vzhledu z dokumentu uživatele.
Pořadí bran je bezpečnostně významné a odpovídá podmínkám `eligibleUser()` ve
Firestore Rules.

## Hlavní navigace

`ShoutOutHome` drží stav hlavních záložek a sdílené callbacky pro reakce a
uložení. Spodní navigace má čtyři karty:

1. **Shouty** – lokální feed, filtry, řazení a vytvoření Shoutu.
2. **Sledované** – uložené Shouty a sledované profily.
3. **Mé Shouty** – aktivní, expirované a vlastní komentáře.
4. **Profil** – identita, systémová nastavení, pomoc, právní informace a
   role-specifické dlaždice Business nebo Moderace.

Filtry feedu žijí ve stavu `ShoutOutHome`, a proto se při přepínání karet
neztrácejí. Celá aplikace je na širokém webu centrovaná do maximální šířky
840 px; formuláře používají užší lokální limity.

## Rozdělení zdrojového kódu

| Soubor nebo oblast | Odpovědnost |
|---|---|
| `lib/main.dart` | Inicializace, téma, routing a seznam Flutter `part` modulů. |
| `lib/auth_gate.dart` | Přihlášení, běžná registrace, ověření e-mailu, právní a stavové brány, onboarding a vytvoření profilu. |
| `lib/business_registration.dart` | Samostatný registrační formulář Business účtu a zápis žádosti. |
| `lib/business_logo_editor.dart` | Lokální výběr a bezpečný 512px výřez vlastního Business loga; bez vzdáleného uložení do zapnutí Storage. |
| `lib/address_autocomplete.dart` | Geoapify autocomplete a převod výsledku na adresu, souřadnice a provider place ID. |
| `lib/public_profile.dart` | Realtime načtení aktuální přezdívky a avataru. |
| `lib/geography.dart` | Geohash, veřejné zaokrouhlení souřadnic a geografický model. |
| `lib/src/home.dart` | Realtime feed, poloha, publikování, ukládání a reakce na Shout. |
| `lib/src/feed.dart` | Vykreslení feedu, filtrů, řazení a společných záhlaví. |
| `lib/src/create_shout.dart` | Formulář Shoutu, délka, kategorie a výběr Business pobočky. |
| `lib/src/shout_model.dart` | Doménový model Shoutu, stav, retence, vzdálenost a časové popisky. |
| `lib/src/shout_cards.dart` | Karty Shoutů a vstup do detailu. |
| `lib/src/shout_detail.dart` | Detail, komentáře, odpovědi, soukromé odpovědi, hlášení a mazání. |
| `lib/src/comments.dart` | Komentářová karta, reakce, veřejná identita a moderátorské akce. |
| `lib/src/private_replies.dart` | Soukromé odpovědi viditelné jen účastníkům. |
| `lib/src/following.dart` | Follow/unfollow, veřejný profil, aktivní Shouty, blokace a hlášení účtu. |
| `lib/src/saved.dart` | Karty Sledované a Mé Shouty. |
| `lib/src/profile*.dart` | Profil, systémová nastavení, změna hesla, avatar, jazyk, nápověda, bug report a oznámení. |
| `lib/src/business.dart` | Business profil, fakturační údaje a CRUD poboček. |
| `lib/src/account_roles.dart` | Realtime načítání role a moderátorského rozsahu. |
| `lib/src/moderation.dart` | Moderace dostupná také v mobilním klientovi. |
| `lib/src/staff_*.dart` | Webový pracovní prostor rolí 3–6: uživatelé, Shouty, reporty a technické logy. |
| `lib/src/firestore_security.dart` | Limity, bezpečné ID událostí, technické logování a sdílené atomické operace. |
| `lib/legal.dart` | Právní souhlasy, podmínky a zásady ochrany soukromí. |
| `lib/l10n/` | Generované ARB překlady a přechodové slovníky `tr` / `businessTr`. |
| `functions/index.js` | Serverový reverse geocoding nových Shoutů přes Google. |
| `firestore.rules` | Autorizace, schéma zápisů, rate limiting a integrita čítačů. |
| `storage.rules` | Připravená pravidla screenshotů bug reportů. |

## Stav a realtime aktualizace

Aplikace zatím nepoužívá externí state-management knihovnu. Stav je rozdělen do:

- `StatefulWidget` pro stav obrazovky nebo formuláře,
- Firestore `snapshots()` pro data, která se mají měnit napříč zařízeními,
- `ValueNotifier` pro aktuální jazyk a téma,
- sdílené callbacky z `ShoutOutHome` pro změny Shoutu.

Feed poslouchá aktivní Shouty, blokované a sledované účty. Veřejný profil a
detail sledovaného profilu používají realtime stream, aby se avatar a reakce
změnily i při zásahu na jiném zařízení.

## Identita a role

Hierarchie je pevná: user 1, business 2, moderator 3, seniorModerator 4,
administrator 5 a owner 6. Privilegovanou roli přiděluje pouze důvěryhodný
Admin SDK nástroj nebo budoucí backend; klient dokument `accountRoles` měnit
nesmí. Podrobné pravomoci rolí 3–6 jsou v `INTERNAL_MODERATION.md`.

Soukromý profil `users/{uid}` obsahuje nastavení účtu. Veřejný profil obsahuje
jen přezdívku a avatar. Rezervace v `nicknames/{lowercase}` zajišťuje globální
unikátnost a změna přezdívky atomicky aktualizuje všechny tři dokumenty.

## Poloha

- Načtení feedu není blokované chybějícím oprávněním k poloze; bez ní pouze není
  přesná vzdálenost.
- Publikování běžného Shoutu polohu vyžaduje.
- Do Shoutu se ukládá zaokrouhlený veřejný bod a sedmimístný geohash, ne historie
  pohybu.
- Business účet musí vybrat aktivní, nesmazanou a ověřenou pobočku. Klient ani
  pravidla nedovolí přepsat její polohu při publikování.
- Role 3–6 mohou v pracovním prostoru změnit bod náhledu, ale náhradní poloha
  nesmí ovlivnit publikování ani moderátorský rozsah.

Geoapify a Google Geocoding řeší odlišné úlohy: Geoapify je klientské
našeptávání adres, Google běží serverově po vytvoření Shoutu a doplňuje region
pro moderaci.

## Oznámení

Oznámení uvnitř aplikace vznikají atomicky se zdrojovou událostí. Slučují se
podle typu a cíle: každý Shout má vlastní série reakcí, komentářů, odpovědí a
soukromých odpovědí; každý komentář má vlastní série like/dislike. Další událost
zvýší `eventCount`, změní posledního aktéra, čas a vrátí záznam mezi nepřečtené.

Kliknutí načte živý Shout, otevře detail a případně zvýrazní poslední komentář.
Push mimo otevřenou aplikaci a fan-out sledujícím zatím nejsou implementované;
jsou v `TODO.md` a vyžadují Cloud Functions/FCM.

## Bezpečnostní model

Klient je považován za nedůvěryhodný. Základní pravidla:

- e-mail musí být ověřený,
- musí existovat profil a aktuální právní souhlas,
- nesmí být aktivní ban ani žádost o smazání,
- tvorbu navíc blokuje aktivní `contentRestrictions`,
- seznamové dotazy mají povinný limit,
- veřejné čítače lze změnit pouze společně se zdrojovým dokumentem,
- identita autora musí odpovídat kanonickému profilu,
- časové údaje zásadních zápisů musí být serverový `request.time`,
- moderátor smí zasahovat pouze proti nižší roli a v přiděleném území.

Přesné a konečné znění oprávnění je vždy ve `firestore.rules`; tento dokument
vysvětluje záměr, nenahrazuje pravidla.

## Co dnes není automatizované

- automatická aktivace Business žádosti přes registry; vývojový projekt má
  bezpečný ruční Admin SDK nástroj, který atomicky vytvoří roli, profil a první
  pobočku až po potvrzení e-mailu a kontrole údajů,
- ověření ARES/VIES a platby,
- push notifikace a oznámení sledujícím,
- fyzické TTL mazání na placeném plánu,
- serverové čištění expirovaného obsahu a dokončení smazání účtu,
- upload screenshotu bug reportu, dokud není inicializovaný Storage.

Tyto hranice musí při rekonstrukci zůstat zřetelně označené; jejich návrh je v
`TODO.md`, `BUSINESS_VERIFICATION.md`, `BUSINESS_MONETIZATION.md` a
`FIREBASE_STORAGE_SETUP.md`.
