# ShoutOut

ShoutOut je komunitní Flutter aplikace pro sdílení časově omezených příspěvků
z okolí uživatele. Příspěvky lze řadit podle vzdálenosti, popularity nebo
zbývající doby platnosti. Aplikace podporuje komentáře, reakce, soukromé
odpovědi, ukládání, blokování uživatelů, hlášení obsahu a moderaci.

## Aktuálně podporované platformy

- Android
- web

Projekt obsahuje připravenou vývojovou Firebase konfiguraci pro iOS, ale build
zatím nebyl sestaven ani ověřen na macOS a fyzickém iPhonu. Windows, macOS a
Linux mají pouze Flutter kostru. Tyto platformy proto zatím nejsou součástí
aktuálně podporovaného vývojového prostředí.

Cílem MVP je veřejně dostupná funkční webová aplikace pro běžné uživatele a
Business účty na `go.shoutout-app.eu`. Produkční projekt
`shoutout-production-a1b34` bude sdílet s veřejnou vstupní stránkou na
`shoutout-app.eu`; každý web má samostatný Hosting site a nasazování. Vstupní
stránka odkazuje tlačítkem do aplikace. Vývojový projekt zůstává oddělený. Vývoj a vydání
Androidu a iOS zůstávají v plánu po webovém MVP.
Rozsah vydání a zbývající produkční předpoklady jsou v `docs/TODO.md` a
`docs/LAUNCH_READINESS.md`.

## Technologie

- Flutter a Dart
- Firebase Authentication
- Cloud Firestore, Security Rules a indexy
- Firebase Hosting, App Check a připravený Firebase Storage
- Cloud Functions for Firebase pro serverové geografické obohacení
- Geoapify Autocomplete API pro adresy a Google Geocoding API pro regiony
- Geolocator a `country_picker`
- Material 3

Vývojová Firebase konfigurace používá projekt `shoutout-dev-46c81`. Produkční
prostředí musí před vydáním používat samostatný Firebase projekt.

## Požadavky

- Flutter SDK odpovídající `pubspec.yaml`
- Android Studio nebo Android SDK pro Android
- Chrome pro webový vývoj
- Node.js 22 pro pomocné skripty a Cloud Functions
- Firebase CLI a Java 21 pro testy Firestore Rules
- přístup k vývojovému Firebase projektu

Stav prostředí lze zkontrolovat příkazem:

```powershell
flutter doctor
```

## První spuštění

Kompletní nastavení Firebase, Geoapify, lokálních klíčů a nasazení je v
[provozním runbooku](docs/SETUP_AND_OPERATIONS.md). Následující příkazy stačí pro
části aplikace, které nepoužívají adresní našeptávání.

Nainstalujte závislosti:

```powershell
flutter pub get
```

Zkontrolujte dostupná zařízení:

```powershell
flutter devices
```

Spusťte Android aplikaci na připojeném zařízení nebo emulátoru:

```powershell
flutter run
```

Spusťte webovou variantu bez Geoapify nebo použijte příkaz s `--dart-define` z
runbooku. Oddělení prostředí a nasazení popisuje
[WEB_ENVIRONMENTS.md](docs/WEB_ENVIRONMENTS.md):

```powershell
node tools/web_environment.mjs prepare dev
flutter run -d chrome --dart-define-from-file=build/environments/dev.defines.json
```

Pracovní prostředí moderátorů a administrátorů je po přihlášení dostupné na
pojmenované trase `/admin` (ve výchozím Flutter web režimu `/#/admin`); jeho
obsah se řídí rolí v `accountRoles/{uid}`.

Aplikace žádá o přístup k poloze. Pokud uživatel oprávnění nepovolí nebo poloha
není dostupná, feed se stále načte, pouze nemá přesný výpočet vzdálenosti.

### Geografické regiony

Geoapify v klientovi našeptává adresy a vrací přesnou polohu Business
provozovny. Klíč se předává přes `GEOAPIFY_API_KEY` při sestavení; jeho vytvoření,
omezení a příkazy jsou v [provozním runbooku](docs/SETUP_AND_OPERATIONS.md).

Nové shouty ukládají sedmimístný `geohash`. Firebase Function
`enrichShoutGeography` následně pomocí Google Geocoding API doplní pole
`geography`: ISO 3166-1 `countryCode`, ISO 3166-2 `subdivisionCode`, název
lokality a pomocné Google Place ID. Place ID není trvalou identitou ani základem
oprávnění.

Před nasazením povolte Geocoding API, nastavte Functions secret a nasaďte
Functions, pravidla a indexy:

Příkazy spouštějte z kořene repozitáře a zástupné `PROJECT_ID_APLIKACE`
nahraďte ověřeným ID cílového Firebase projektu; postup a nákladová brána jsou
v [provozním runbooku](docs/SETUP_AND_OPERATIONS.md).

```powershell
firebase functions:secrets:set GOOGLE_MAPS_API_KEY --project PROJECT_ID_APLIKACE
firebase deploy --only functions,firestore:rules,firestore:indexes --project PROJECT_ID_APLIKACE
```

Klíč omezte na Geocoding API a nevkládejte ho do Flutter aplikace. Starší shouty
lze obohatit příkazem `npm run backfill:geography` ve složce `tools`.

## Kontroly před commitem

```powershell
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
Push-Location tools
npm ci
npm run test:rules
Pop-Location
node tools/web_environment.mjs build dev --debug
```

Stejné základní kontroly spouští také GitHub Actions.

## Firebase a data

Význam a vazby všech kolekcí jsou popsané v
[datovém modelu](docs/DATA_MODEL.md). Přesná validace zůstává ve
`firestore.rules`.

Hlavní kolekce ve Firestore:

- `users`, `nicknames`
- `shouts` s podkolekcemi `comments`, `privateReplies`, `reactions` a `saves`
- `reports`, `commentReports`, `privateReplyReports`
- `moderators`, `warnings`, `bans`
- `accountRoles` – serverově přidělované role business a správcovských účtů
- `contentRestrictions`, `sanctions` – aktivní omezení tvorby a audit postihů
- `accountDeletionRequests`

Bezpečnostní pravidla jsou v `firestore.rules` a indexy v
`firestore.indexes.json`.

Nasazení pravidel a indexů z kořene repozitáře po ověření cíle; zástupné
`PROJECT_ID_APLIKACE` nahraďte skutečným ID projektu aplikace:

```powershell
firebase deploy --only firestore:rules,firestore:indexes --project PROJECT_ID_APLIKACE
```

Před nasazením vždy ověřte, že Firebase CLI míří na správný projekt. Produkční
pravidla se nemají nasazovat z neověřené pracovní větve.

### Bezpečnostní pravidla a lokální emulátor

Testy v `tools/rules` spouštějí Firestore Emulator proti izolovanému projektu
`shoutout-rules-test`; nemění vývojová ani produkční data:

```powershell
Push-Location tools
npm ci
npm run test:rules
Pop-Location
```

Firebase Emulator vyžaduje Javu 21 nebo kompatibilní verzi v `PATH`. Android
Studio ji standardně obsahuje ve složce `jbr`.

Zápisy obsahu a interakcí používají atomické rate-limit dokumenty. Proto musí
být změny klienta a `firestore.rules` nasazeny společně až po průchodu testů.
Před zpřísněním pravidel nad existujícími vývojovými daty spusťte jednorázové
srovnání veřejných čítačů podle návodu v `tools/README.md`.

### Firebase App Check

Android debug build používá App Check debug provider, release build používá
Play Integrity. Vynucení App Check se nesmí zapnout naslepo: nejdřív
zaregistrujte pouze vlastní debug tokeny, ověřte metriky a až potom zapínejte
enforcement po jednotlivých Firebase službách. Webový provider a produkční
enforcement jsou zapsané v `docs/TODO.md`.

### Android release podpis

Release build už nikdy nepoužívá společný Flutter debug klíč. Pro podepsaný
release zkopírujte `android/key.properties.example` na
`android/key.properties`, doplňte cestu k vlastnímu `.jks` a hesla. Skutečný
soubor i keystore jsou ignorované Gitem a musí mít samostatnou bezpečnou zálohu.

## Vývojová testovací data

Skripty ve složce `tools` umí vytvořit vývojové uživatele a demo aktivitu kolem
Litoměřic. Podrobný postup je v `tools/README.md`.

Firebase service-account JSON musí zůstat mimo repozitář. Neukládejte jej do
projektu, neposílejte jej do chatu a nikdy jej necommitujte.

## Struktura projektu

- `lib/main.dart` – inicializace aplikace, společné téma a registrace částí
- `lib/src/` – feed, profil, moderace, Shouty, komentáře a sdílené modely
- `lib/auth_gate.dart` – přihlášení, registrace a vstupní uživatelské brány
- `lib/legal.dart` – právní souhlasy a dokumenty
- `lib/l10n/` – stávající lokalizační vrstva
- `functions/` – serverové geografické obohacení Shoutů
- `.geoapify.json.example` – bezpečná šablona lokálního klientského API klíče
- `assets/avatars/` – vestavěné uživatelské avatary
- `promo/` – samostatný balíček značky, screenshotů a zadání pro promo video
- `test/` – automatizované Flutter testy
- `tools/` – vývojové administrační a seedovací skripty
- `firestore.rules` – oprávnění a validace Firestore dat
- [Rozcestník dokumentace](docs/README.md) – přehled všech produktových,
  provozních a specializovaných dokumentů
- `docs/ARCHITECTURE.md` – hranice systému a odpovědnosti modulů
- `docs/PRODUCT_FLOWS.md` – skutečné uživatelské toky současné verze
- `docs/UI_SPECIFICATION.md` – obrazovky, navigace a globální UI pravidla
- `docs/DATA_MODEL.md` – kolekce, vazby a atomické invarianty
- `docs/SETUP_AND_OPERATIONS.md` – vytvoření prostředí, testy a nasazení
- `docs/COST_SAFETY.md` – povinné nákladové limity, kvóty a nouzový postup
- `docs/TESTING.md` – automatická a ruční regresní matice
- `docs/PROJECT_STATUS.md` – stručný aktuální stav a další krok pro navázání práce
- `docs/TODO.md` – priority, hranice webového MVP a přehled milníků
- `docs/BACKLOG.md` – úplná kanonická checkboxová evidence úkolů
- `docs/MVP_SERVER_PLAN.md` – podrobné serverové a produkční požadavky
- `docs/archive/README.md` – nezměněný původní TODO a rozcestník historie
- `docs/INTERNAL_MODERATION.md` – interní role, oprávnění, postihy a postupy

## Lokalizace

Aplikace podporuje češtinu (`cs`), angličtinu (`en`), němčinu (`de`), polštinu
(`pl`), slovenštinu (`sk`), ukrajinštinu (`uk`) a vietnamštinu (`vi`). Používá
generované ARB lokalizace a přechodové slovníky `tr`/`businessTr`; při změně
textu je nutné doplnit obě vrstvy, dokud nebude migrace dokončená.

## Odložená serverová část

Některé operace jsou v klientovi a Firestore připravené, ale vyžadují budoucí
serverovou automatizaci – například úplné zpracování smazání účtu, retenční
lhůty, čištění expirovaného obsahu a push notifikace. Business žádosti se dnes
schvalují ručně v administrátorském rozhraní; zamítnutí a pozastavení se musí
dopracovat před veřejným webovým MVP.
Přesný seznam a podmínky dokončení jsou v [TODO](docs/TODO.md); dokumentace
současné architektury zřetelně odděluje hotový stav od návrhu.

## Licence

Projekt je licencován podle souboru `LICENSE`.
