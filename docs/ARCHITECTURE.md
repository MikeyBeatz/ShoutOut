# Architektura ShoutOut

Tento dokument popisuje současnou implementaci aplikace. Je určen vývojáři,
který projekt nezná a potřebuje pochopit jeho hranice, odpovědnosti a tok dat.
Produktové záměry, které ještě nejsou implementované, jsou pouze v `TODO.md`.

Datové streamy klienta sdílí `lib/live_data.dart` podle uživatele, Firebase
aplikace, databáze a dotazu. Aktivní odběratelé dostávají stejná realtime data
a pozdní odběratel poslední událost. Poslední odpojení zruší zdroj a uvolní
hodnotu. Feed a veřejný profil drží vlastní reakce a uložení podle ID Shoutu;
změna čítače nerestartuje načítání všech interakcí. Podrobnosti a zbývající
nákladová rizika shrnuje [READ_COST_AUDIT.md](READ_COST_AUDIT.md).

## Základní principy

- Flutter klient je společný pro Android, iOS a web.
- Web na široké obrazovce drží aplikaci uprostřed v šířce nejvýše 840 px;
  okolní plocha má jemný tyrkysový odstín odlišný od pozadí aplikace.
- Firebase Authentication zajišťuje e-mailové účty, přihlášení přes Google a
  ověření e-mailových adres.
- Cloud Firestore je hlavní databáze, realtime zdroj obrazovek a současně
  serverová validační vrstva prostřednictvím `firestore.rules`.
- Důležité vícečetné zápisy jsou atomické transakce nebo batche. Klient například
  nesmí změnit veřejný počet reakcí bez odpovídající reakce a rate-limit události.
- Veřejná identita autora se načítá z `publicProfiles/{uid}`. Kopie avataru a
  přezdívky v obsahu je pouze historický fallback.
- Běžný Shout používá polohu zařízení zaokrouhlenou funkcí
  `publicLocationCoordinate`; Business Shout používá ověřenou polohu pobočky.
- Business Shout ukládá jako `authorNickname` pouze název vybrané pobočky, její
  ID a značku `businessAuthorFormat: branch`. U starších dokumentů bez značky
  klient při zobrazení odstraní historickou předponu „firma –“, takže není nutná
  migrace databáze. Avatar se dál načítá realtime z veřejného profilu firmy.
  Běžnému Shoutu se realtime mění avatar i přezdívka.
- Bezplatné zaváděcí Business funkce jsou nezávislé příznaky Shoutu:
  zvýraznění, připnuté propagační okénko a délka nad 24 hodin. Aktivní okénka do
  20 km klient v každém cyklu promíchá a rotuje; důvěryhodný unikátní dosah,
  zobrazení a rozkliknutí zůstávají v budoucí serverové vrstvě.
- Business nabídka obsahuje profil, pobočky a historii bezplatné propagace.
  Tokenová sekce je odstraněná; nákupy a faktury ani prázdné metriky propagace
  se před zavedením příslušných služeb nezobrazují.
- Firestore Rules jsou součást aplikační logiky. Změna klientského zápisu bez
  odpovídající změny pravidel a jejich testů je neúplná změna.

Webový build, návratová URL e-mailů a HTML Auth handler používají společnou
konfiguraci z `config/`. `WebEnvironment` kontroluje projekt a hostitele před
připojením Firebase. Vývojové a produkční artefakty a nasazovací kontroly jsou
popsané v [oddělení prostředí](WEB_ENVIRONMENTS.md). Produkce používá projekt
`shoutout-production-a1b34` společný pro vstupní stránku a aplikaci; každý web
má vlastní Hosting site a konfiguraci. Webová aplikace nesmí použít site
vstupní stránky. App site `shoutout-go-a1b34` je registrovaný a produkční
SDK konfigurace je v `config/prod.json`. Nastavení a funkčnost runtime služeb zatím nebyly ověřené;
vlastní doména je přidaná a má nastavený CNAME, DNS ověření ve Firebase proběhlo
a Firebase potvrzuje stav `Connected` s platným HTTPS. Na app site zatím není
první produkční release.

## Spouštěcí a přístupový tok

```text
main()
  └─ Firebase.initializeApp (webové prostředí / vývojová mobilní konfigurace)
     └─ Android / iOS App Check
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
| `lib/web_environment.dart` | Validace webového prostředí, Firebase konfigurace, hostitele a návratové URL e-mailů. |
| `lib/main.dart` | Inicializace, téma, routing a seznam Flutter `part` modulů. |
| `lib/auth_gate.dart` | Přihlášení, běžná registrace, ověření e-mailu, právní a stavové brány, onboarding a vytvoření profilu. |
| `lib/business_registration.dart` | Samostatný registrační formulář Business účtu a zápis žádosti. |
| `lib/business_logo_editor.dart` | Lokální výběr a bezpečný 512px výřez vlastního Business loga; profil následně ukládá PNG do Firebase Storage a atomicky aktualizuje cestu loga ve veřejném i soukromém profilu. |
| `lib/address_autocomplete.dart` | Geoapify autocomplete a převod výsledku na adresu, souřadnice a provider place ID. |
| `lib/public_profile.dart` | Realtime načtení aktuální přezdívky a avataru. |
| `lib/live_data.dart` | Sdílení a replay aktivních Firestore streamů bez duplicitních listenerů. |
| `lib/help_content.dart` | Osm rozšířených témat Nápovědy ve všech sedmi jazycích. |
| `lib/easter_egg_game.dart` | Offline minihra Shout Flight, fyzika megafonu nezávislá na snímkové frekvenci, obtížnost překážek, skóre, překlady a tematické vykreslení bez externích assetů. |
| `lib/flight_score_store*.dart` | Platformní úložiště osobního rekordu: webový `LocalStorage` a nativní `SharedPreferences`, vždy pouze vyšší výsledek. |
| `lib/profile_tile_layout.dart` | Deterministické skládání viditelných profilových dlaždic do řádků po třech. |
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
| `functions/callable_security.js` | Společná serverová brána pro Auth, App Check, profil, právní souhlas, ban, žádost o smazání a omezení tvorby. Přijímá také Firestore transakci jako reader, aby budoucí kontrola a zápis mohly být atomické. |
| `functions/index.js` | Serverový reverse geocoding nových Shoutů přes Google. |
| `firestore.rules` | Autorizace, schéma zápisů, rate limiting a integrita čítačů. |
| `storage.rules` | Pravidla Firebase Storage pro Business loga a screenshoty bug reportů. |

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
Přezdívka má 3–24 písmen nebo číslic. Podporuje Unicode písmena, takže lze
použít znaky všech jazyků aplikace včetně ukrajinské cyrilice a české,
slovenské, německé, polské a vietnamské diakritiky. Pomlčka a podtržítko jsou
povolené pouze mezi částmi; mezery povolené nejsou. Formulář průběžně odlišuje
červenou chybu formátu nebo obsazenou přezdívku od zeleného potvrzení
dostupnosti.

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

Společná callable brána je připravená a vyžaduje App Check, ale zatím ji
nepoužívá žádný veřejný endpoint ani klientský tok. Přesun jednotlivých zápisů
na server musí přidat vlastní validaci vstupu, rate limit a idempotenci ve stejné
transakci; samotná existence brány neznamená dokončený serverový gateway.

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

## Co dnes není dokončené pro produkci

- produkční postup ruční kontroly Business žádosti včetně zamítnutí a
  pozastavení; současné administrátorské rozhraní umí schválení a vývojový
  projekt má omezený Admin SDK nástroj pro aktivaci vybraných žádostí,
- platby,
- push notifikace a oznámení sledujícím,
- fyzické TTL mazání; konfigurace je připravená, ale aktivace čeká na kontrolu
  objemu a nákladů,
- serverové čištění expirovaného obsahu a dokončení smazání účtu,
- automatický úklid screenshotů bug reportů; samotný upload přes Storage je
  aktivní.

Tyto hranice musí při rekonstrukci zůstat zřetelně označené; jejich návrh je v
`TODO.md`, `BUSINESS_VERIFICATION.md`, `BUSINESS_MONETIZATION.md` a
`FIREBASE_STORAGE_SETUP.md` a `COST_SAFETY.md`.
