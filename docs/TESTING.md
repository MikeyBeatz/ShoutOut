# Testovací strategie a regresní matice

`test/live_data_test.dart` ověřuje stabilní sdílení realtime zdrojů, oddělení
účtů/databází, chyby a opětovné načtení, rušení odběrů a zachování živých
interakcí při opakovaných aktualizacích 50 položek. Modelové počty odběrů
nejsou měřením účtovaných čtení; viz [READ_COST_AUDIT.md](READ_COST_AUDIT.md).

Testy v tomto projektu jsou současně bezpečnostní síť a spustitelná technická
specifikace. Nová implementace není ekvivalentní ShoutOutu, dokud neprojde
automatickými vrstvami i hlavními ručními scénáři níže.

## Živý vývojový test serverového publikování 25. října 2026

Hosting `shoutout-dev-46c81`, commit
`36f42e241ce9d6d43175db076a3c726d0c306b0b`, verze `d9c867abfdb9e20e`:
App Check diagnostika získala token a nepřihlášený callable požadavek správně
odmítla Auth vrstva. Přihlášený Business účet následně v běžné aplikaci
vytvořil jediný Shout s ověřenou pobočkou. Read-only kontrola Firestore
potvrdila serverové ID, kanonickou identitu i polohu pobočky, nulové čítače,
geohash a odpovídající receipt i rate limit se shodnými timestampy.
Odstranění přes aplikaci bylo ověřené stavem `deleted`; žádný obsah nebyl
vytvořen administrátorským zápisem. Navazující uživatelský test osobního Shoutu
„Test Shout“ také prošel kontrolou serverového ID, kanonického autora,
zaokrouhlené veřejné polohy, geohashe, nulových čítačů a atomického receipt/limitu.
Přechodný problém při přepisování hesla po odhlášení se nepodařilo potvrdit
jako chybu kódu; uživatel následně pokračoval v přihlášení bez změny aplikace.
Živý test souběžných retry a ostatních obsahových operací tento průchod nepokrývá.
Souběh a idempotenci pokrývají lokální emulatorové testy uvedené níže.

## Automatické vrstvy

`functions/create_comment.integration.test.js` používá stejný izolovaný
emulator jako Shout testy. Sedm scénářů pokrývá souběžná retry, cooldown,
atomické čítače/limity/oznámení, rodiče odpovědi, preference a slučování
oznámení, vlastní obsah, neaktivní Shout, poškozená data a blokované účty.
Retry po smazání výsledku jej znovu nevytvoří. Sada běží v `npm run test:rules`;
bez emulatoru je přeskočená. Celkem prošlo 75 emulatorových testů, 18 Functions
unit testů, 156 Flutter testů, lint, analyzátor a vývojový release build.
Následné vývojové nasazení `createComment` (`createcomment-00001-lep`) a
Hostingu commitu `9d85327` prošlo živým testem komentáře a veřejné odpovědi.
Firestore potvrdil kanonického autora, rodiče odpovědi, nulové čítače reakcí,
receipt a přesné zvýšení limitu i počtu komentářů o dvě. Po odstranění obou
testovacích komentářů je databázový čítač na výchozí hodnotě. CI implementace
`40230321972` a aktivace `40230718884` prošlo. Živý test proběhl pod jedním
účtem na vlastním Shoutu; příjemce oznámení mezi účty ověřuje emulator.

Regresní scénář opravy detailu: vytvořit testovací komentář, ve stejném
otevřeném detailu jej odstranit a bez opuštění stránky ověřit shodu čísla na
kartě se seznamem a Firestore. Smazání předává potvrzený čítač z transakce,
nikoli počet položek omezeného dotazu. Ověřit i selhání zápisu bez falešného
lokálního snížení a bezpečný callback po realtime odstranění widgetu.

`test/legal_acceptance_state_test.dart` ověřuje rozdíl mezi chybějící cache
a serverem potvrzeným chybějícím právním souhlasem, čekání na potvrzení zápisu,
známý souhlas v offline režimu a chyby streamu. Widgetový scénář kontroluje,
že při pomalém spojení neproblikne formulář souhlasu. Metadata listenery mají
oddělený klíč od běžných dokumentových streamů a nadále se sdílí.

Celokořenový analyzátor ignoruje generované `build/**`; projektové `lib/` a
`test/` zůstávají kontrolované. Tím se vyloučí i Dart ukázky staženého Firebase
CLI, které nejsou zdrojem aplikace.

`functions/create_shout.integration.test.js` běží pouze s lokálním emulator
hostem `127.0.0.1:8080` a pevným izolovaným projektem `shoutout-rules-test`.
Ověřuje souběžnou idempotenci, transakční limity, serverovou identitu/polohu,
Business pobočku a postihy. `npm run test:rules` spouští tuto sadu i Rules
sekvenčně, protože Rules testy mezi scénáři čistí databázi. Před tímto příkazem
je nutné provést `npm ci` také ve `functions/`. Samostatné `npm test` bez
emulatoru tyto čtyři integrační testy přeskočí; přeskočení není důkaz ověření.

| Vrstva | Umístění | Co ověřuje |
|---|---|---|
| Dart unit testy | `test/account_role_test.dart`, `account_ban_test.dart`, `app_theme_test.dart`, `geography_test.dart`, `profile_tile_layout_test.dart`, `shout_test.dart` | Role, aktivitu dočasných a trvalých banů, téma, geohash, veřejné zaokrouhlení, profilové řádky po třech, životní cyklus a řazení Shoutu, avatary a normalizaci nadpisu. |
| Flutter widget testy | `test/widget_test.dart`, `localization_test.dart`, `business_logo_editor_test.dart` | Hlavní UI, zachování filtrů, avatar, datum profilu, onboarding, tematické dialogy Nápovědy, běžnou kartu, spuštění a trvalý lokální rekord Shout Flight, systém, heslo, Storage feature flag, všech sedm jazyků a geometrii i 512px výstup Business loga. |
| Firestore Rules integrační testy | `tools/rules/firestore.rules.test.mjs` | Pozitivní i útočné scénáře registrace, rolí, Business poboček, obsahu, čítačů, limitů, soukromí, oznámení a moderace. |
| Vývojové nástroje | `tools/business_activation.test.mjs`, `moderation_seed.test.mjs`, `web_environment.test.mjs` | Odmítnutí neověřeného nebo odlišného e-mailu, neplatného stavu a pobočky, sestavení atomické Business aktivace a vyloučení staff rolí z autorů závadného seed obsahu; oddělení prostředí, integritu buildu, shodu cíle nasazení, oddělení app a vstupního Hosting site ve společném produkčním projektu, konfiguraci Auth handleru a odmítnutí produkčních credentials třemi staršími vývojovými Admin SDK skripty. |
| Functions unit testy a lint | `functions/index.test.js`, `callable_security.test.js`, `eslint.config.js` | Normalizaci ISO regionu; Auth, App Check, profil, právní souhlas, ban, žádost o smazání a omezení tvorby; fail-closed chování poškozených postihů a použití transakčního readeru. |
| Statická kontrola a build | `dart format`, `flutter analyze`, `node tools/web_environment.mjs build dev --debug` | Konzistenci zdroje, typové/lint chyby a sestavitelnost webu. |

`test/web_environment_test.dart` navíc pokrývá společnou Firebase konfiguraci a
návratovou URL e-mailů, odmítnutí neúplné konfigurace a záměny vývojové a
produkční domény. Tyto testy neprokazují nastavení skutečného produkčního projektu.

CI workflow `.github/workflows/flutter.yml` používá Node.js 22 a spouští Flutter
vrstvu, čisté testy vývojových nástrojů, Rules, Functions lint a unit testy i
web build při každém pushi a pull requestu. Přesné příkazy a závislosti jsou v
`SETUP_AND_OPERATIONS.md`.

Počet testů není cílová metrika. Test přidejte vždy, když opravujete regresi,
měníte Firestore zápis/pravidlo nebo přidáváte větev s uživatelsky důležitým
výsledkem. Neduplicujte stejnou podmínku v několika widget testech, pokud ji lze
levněji a přesněji pokrýt unit testem.

## Povinné ruční scénáře

### Účet a registrace

- běžná registrace, doručení ověřovacího e-mailu, návrat do aplikace a vytvoření
  právního souhlasu, přezdívky a avataru;
- Business registrace zůstane před potvrzením na ověření e-mailu a po potvrzení
  na stavu žádosti; do profilového onboardingu pokračuje až s rolí 2 a aktivním
  Business profilem;
- kontrolní spuštění Business aktivace nic nezapíše; potvrzené spuštění vytvoří
  roli 2, profil a první pobočku společně a druhé spuštění pouze oznámí, že je
  žádost již aktivní;
- chybné/krátké heslo, rozdílné potvrzení, obsazená přezdívka a opětovné použití
  existujícího e-mailu;
- reset hesla na existujícím i neexistujícím e-mailu bez úniku existence účtu;
- změna avataru a přezdívky na jednom zařízení a realtime změna ve starších
  Shoutech/komentářích na druhém zařízení;
- odhlášení, nové přihlášení a čekající smazání účtu.

### Feed a Shout

- povolená, zamítnutá a nedostupná poloha; feed musí fungovat i bez přesné
  vzdálenosti, publikování běžného Shoutu ji vyžaduje;
- poloměr, kategorie a všechna řazení; filtry zůstávají při přepnutí všech čtyř
  karet a resetují se až novou relací aplikace;
- nadpis i text na mobilní klávesnici začnou velkým písmenem; uložený nadpis je
  normalizovaný i při vložení textu;
- limity délky, jedna/dvě kategorie, minimum 15 minut, maximum 24 hodin a hláška
  rate limitu bez zavření či vymazání formuláře;
- like, dislike, odebrání reakce, vlaječka a čítače se shodují ve feedu, detailu,
  Mé Shouty i detailu sledovaného profilu bez znovuotevření obrazovky;
- expirovaný nebo smazaný Shout zmizí z aktivních seznamů a deep link zobrazí
  nedostupný stav.

### Business

- registrace ze zařízení v každém podporovaném jazyce, povinné odlišení sídla a
  první pobočky/provozovny;
- Geoapify návrhy pro českou i zahraniční adresu, diakritika, stabilní šířka
  dialogu a zákaz uložení pouhého ručně napsaného textu;
- přidání, úprava, pozastavení a soft-delete pobočky; po uložení se rozbalený
  editor zavře a změna se objeví bez reloadu;
- Business dlaždice zůstává po přechodu Profil → Shouty → Profil;
- pouze aktivní Business účet vidí v editoru avatara tlačítko vlastního loga;
  nahrání 512px PNG se projeví ve veřejné identitě a nahrazení odstraní starý soubor;
- formulář Shoutu nabízí jen aktivní ověřené pobočky; viditelné jméno autora je
  název vybrané pobočky a poloha odpovídá této pobočce, ne zařízení ani sídlu;
- načtení veřejného Business profilu nesmí přepsat název pobočky názvem firmy;
  realtime se na Business Shoutu aktualizuje avatar, u běžného Shoutu i přezdívka;
- starší Business Shout uložený jako „firma – pobočka“ se zobrazí jen jako
  „pobočka“, zatímco nový název pobočky obsahující pomlčku zůstane beze změny;
- publikování rychle po sobě respektuje 1s cooldown a 500/24 h; Business
  checkboxy se běžnému účtu nezobrazí.
- Business formulář dovolí kombinovat zvýraznění a okénko; bez checkboxů je
  Shout standardní. Okénka do 20 km jsou připnutá, po 6 sekundách rotují,
  reagují na tah do stran a cyklicky se opakují. Bez okénka prostor zmizí.
- delší platnost nabízí po 24 hodinách pouze celé dny 2–7; běžný účet nesmí
  propagaci ani prodloužení zapsat a nepravdivé příznaky pravidla odmítnou.
- Business → Propagace uvádí použité bezplatné funkce bez ceny. Před webovým
  MVP se nesmí zobrazit položka **Tokeny**, nefunkční **Nákupy a faktury** ani
  prázdné metriky dosahu, zobrazení, rozkliknutí a míry prokliku. Ověřit
  mobilní i desktopový web a nápovědu ve všech sedmi jazycích bez slibů
  tokenového nákupu; statistiky se vrátí až s důvěryhodným měřením po zavedení
  monetizace.

### Follow, komunikace a oznámení

- veřejný profil z přezdívky, Follow/unfollow, blokace a hlášení účtu;
- karta Sledované přepíná uložené Shouty a profily; Shout v profilu otevře plný
  detail s komentáři a reakcemi;
- veřejný komentář, odpověď na komentář a soukromá odpověď jsou viditelné jen
  zamýšlenému publiku;
- dva účty/zařízení ověří realtime změny reakcí a avataru;
- každý druh události vytvoří oznámení jen cizímu příjemci a respektuje jeho
  preference;
- více like nebo komentářů stejného typu a cíle zvýší jednu sérii, aktualizuje
  posledního aktéra, vrátí ji nahoru a označí nepřečteně;
- jiné Shouty a jiné komentáře mají vlastní série;
- kliknutí na oznámení otevře správný Shout a relevantní komentář, po expiraci
  zobrazí srozumitelný nedostupný stav.

### Moderace a administrace

- `/admin` odmítne role 1–2 a zobrazí jen sekce povolené rolím 3–6;
- regionální moderátor vidí/potrestá jen obsah v přiděleném ISO rozsahu a nikdy
  uživatele stejné nebo vyšší role;
- warning, omezení tvorby, dočasný/trvalý ban, zrušení postihu, eskalace a
  označení obsahu jako v pořádku zachovají neměnný audit;
- technické logy nevidí moderátor ani senior; administrator/owner při otevření
  vytvoří `technicalLogAccessAudits`;
- ruční náhled polohy role 3–6 mění pouze prohlížené území, ne jejich scope ani
  místo publikovaného Shoutu.

## Zařízení a zobrazení

Před vydáním webového MVP ověřte minimálně:

- Chrome v mobilní šířce a desktopový Chrome alespoň 1920 px široký;
- maximální šířku celé aplikace 840 px, centrování a užší, rozměrově stabilní
  dialogy;
- světlý, tmavý i systémový režim;
- češtinu, angličtinu, němčinu, polštinu, slovenštinu, ukrajinštinu a
  vietnamštinu včetně diakritiky a delších popisků;
- feed watermark a všech 24 avatarů podle `design/README.md`.

Před pozdějším mobilním vydáním navíc ověřte úzký Android telefon v portrait,
otevřenou klávesnici, změnu orientace zakázanou manifestem, rozměry iPhonu,
launcher a splash podle `design/README.md`.

## Testovací data

Automatické Rules testy používají pouze lokální projekt
`shoutout-rules-test`. Seedovací skripty smějí pracovat jen s vývojovým
projektem `shoutout-dev-46c81` a mají pojistku proti produkci. Jejich návod je v
`tools/README.md`.

Konkrétní ruční účty a hesla patří výhradně do ignorované složky `docs/local/`.
Nejsou součástí přenositelné dokumentace ani historie Gitu a před produkcí se
odstraní.
