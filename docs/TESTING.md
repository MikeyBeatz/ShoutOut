# Testovací strategie a regresní matice

Testy v tomto projektu jsou současně bezpečnostní síť a spustitelná technická
specifikace. Nová implementace není ekvivalentní ShoutOutu, dokud neprojde
automatickými vrstvami i hlavními ručními scénáři níže.

## Automatické vrstvy

| Vrstva | Umístění | Co ověřuje |
|---|---|---|
| Dart unit testy | `test/account_role_test.dart`, `account_ban_test.dart`, `app_theme_test.dart`, `geography_test.dart`, `profile_tile_layout_test.dart`, `shout_test.dart` | Role, aktivitu dočasných a trvalých banů, téma, geohash, veřejné zaokrouhlení, profilové řádky po třech, životní cyklus a řazení Shoutu, avatary a normalizaci nadpisu. |
| Flutter widget testy | `test/widget_test.dart`, `localization_test.dart`, `business_logo_editor_test.dart` | Hlavní UI, zachování filtrů, avatar, datum profilu, onboarding, tematické dialogy Nápovědy, běžnou kartu, spuštění a trvalý lokální rekord Shout Flight, systém, heslo, Storage feature flag, všech sedm jazyků a geometrii i 512px výstup Business loga. |
| Firestore Rules integrační testy | `tools/rules/firestore.rules.test.mjs` | Pozitivní i útočné scénáře registrace, rolí, Business poboček, obsahu, čítačů, limitů, soukromí, oznámení a moderace. |
| Vývojové nástroje | `tools/business_activation.test.mjs`, `moderation_seed.test.mjs` | Odmítnutí neověřeného nebo odlišného e-mailu, neplatného stavu a pobočky, sestavení atomické Business aktivace a vyloučení staff rolí z autorů závadného seed obsahu. |
| Functions unit testy | `functions/index.test.js` | Normalizaci ISO regionu a bezpečné zachování provider-specific hodnot. |
| Statická kontrola a build | `dart format`, `flutter analyze`, `flutter build web` | Konzistenci zdroje, typové/lint chyby a sestavitelnost webu. |

CI workflow `.github/workflows/flutter.yml` spouští Flutter vrstvu, čisté testy
vývojových nástrojů, Rules a web build při každém pushi a pull requestu.
Functions test je zatím lokální povinná kontrola. Přesné příkazy a závislosti
jsou v `SETUP_AND_OPERATIONS.md`.

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
- pouze Business účet vidí v editoru avatara tlačítko vlastního loga; před
  zapnutím Storage kliknutí zobrazí lokalizovanou informaci o připravované funkci;
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
- Business → Propagace uvádí použité funkce bez ceny a připravené metriky
  unikátní dosah, zobrazení, rozkliknutí a míra prokliku; do zapojení
  důvěryhodného serverového měření místo čísel zobrazí pomlčku.

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

Před demo/release ověřte minimálně:

- úzký Android telefon v portrait, otevřenou klávesnici a změnu orientace
  zakázanou manifestem;
- Chrome v mobilní šířce a desktopový Chrome alespoň 1920 px široký;
- maximální šířku celé aplikace 840 px, centrování a užší, rozměrově stabilní
  dialogy;
- světlý, tmavý i systémový režim;
- češtinu, angličtinu, němčinu, polštinu, slovenštinu, ukrajinštinu a
  vietnamštinu včetně diakritiky a delších popisků;
- launcher, splash, feed watermark a všech 24 avatarů podle `design/README.md`.

## Testovací data

Automatické Rules testy používají pouze lokální projekt
`shoutout-rules-test`. Seedovací skripty smějí pracovat jen s vývojovým
projektem `shoutout-dev-46c81` a mají pojistku proti produkci. Jejich návod je v
`tools/README.md`.

Konkrétní ruční účty a hesla patří výhradně do ignorované složky `docs/local/`.
Nejsou součástí přenositelné dokumentace ani historie Gitu a před produkcí se
odstraní.
