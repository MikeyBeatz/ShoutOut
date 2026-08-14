# Vývojové prostředí, služby a nasazení

Tento runbook umožňuje novému vývojáři rozběhnout současný projekt nebo vytvořit
ekvivalentní prostředí od nuly. Příklady používají PowerShell a vývojový Firebase
projekt `shoutout-dev-46c81`. Produkci vždy nahraďte samostatným project ID.

## Podporované cíle a ověřené verze

- Flutter 3.44.8 stable; Dart je omezený v `pubspec.yaml` na `^3.12.2`.
- Android s Java/JVM 17 pro sestavení; Firestore Emulator vyžaduje Java 21 nebo
  kompatibilní novější runtime.
- web v aktuálním Chrome.
- Node.js 22 pro Cloud Functions; aktuální LTS je vhodný i pro `tools/`.
- Firebase CLI 15.24.0 odpovídá CI.

iOS má připravenou vývojovou Firebase konfiguraci a identitu
`cz.shoutout.app.dev`, ale build zatím nebyl sestaven ani podepsán na macOS.
Windows, macOS a Linux mají pouze Flutter kostru a nejsou podporované cíle této
verze.

## Lokální instalace existujícího projektu

```powershell
flutter doctor
flutter pub get

Push-Location tools
npm ci
Pop-Location

Push-Location functions
npm ci
Pop-Location
```

Repozitář neobsahuje service-account JSON, podpisový klíč, hesla testovacích
účtů ani Geoapify hodnotu. Firebase klientská konfigurace v
`lib/firebase_options.dart`, `android/app/google-services.json` a
`ios/Runner/GoogleService-Info.plist` není serverové tajemství; je v Gitu
záměrně. Její zneužití omezují Authentication, App Check, Firestore Rules a
kvóty.

## iOS příprava bez Macu

Vývojová iOS aplikace je ve Firebase zaregistrovaná s bundle ID
`cz.shoutout.app.dev`. Projekt obsahuje Firebase konfiguraci, URL schéma pro
Google přihlášení, oprávnění k poloze a výběru fotografií, App Check providery,
značkovou ikonu a startovní obrazovku. Tyto části jsou připravené zdarma ve
Windows.

Sestavení, podpis a instalaci na fyzický iPhone nelze ve Windows věrohodně
ověřit. Až bude dostupný Mac, stačí nainstalovat Flutter a Xcode, otevřít
`ios/Runner.xcworkspace`, v cíli Runner vybrat vlastní Apple Personal Team a
spustit aplikaci na připojeném telefonu. Bez placeného členství je takový vývojový
podpis určený jen pro vlastní zařízení a musí se pravidelně obnovovat. Před
zapnutím App Check enforcementu je nutné zaregistrovat debug token z telefonu;
produkční App Attest se dokončí až s produkční Apple identitou.
Podrobná cesta přes cloudový Mac, TestFlight a App Store je v plánu
[mobilního testování a distribuce](MOBILE_DISTRIBUTION_PLAN.md).

## Geoapify: našeptávání a přesná poloha adresy

Geoapify Autocomplete API používají registrační a pobočkové formuláře. Klient
volá `https://api.geoapify.com/v1/geocode/autocomplete`, po třech znacích,
s 350ms debounce, limitem pěti návrhů a volitelným filtrem země. Vybraný návrh
dodá formátovanou adresu, město, PSČ, ISO kód země, souřadnice a provider place
ID. Ručně napsaný text bez výběru návrhu není ověřená poloha.

1. V Geoapify vytvořte projekt a klíč pro Geocoding/Autocomplete.
2. Zkopírujte verzovanou šablonu do ignorovaného souboru a doplňte hodnotu:

   ```powershell
   Copy-Item .geoapify.json.example .geoapify.json
   ```

   Výsledný lokální soubor má formát:

   ```json
   {
     "GEOAPIFY_API_KEY": "replace-me"
   }
   ```

3. Načtěte klíč jen do příkazu spuštění:

   ```powershell
   $geoConfig = Get-Content -Raw -Encoding UTF8 .geoapify.json | ConvertFrom-Json
   flutter run -d chrome --dart-define="GEOAPIFY_API_KEY=$($geoConfig.GEOAPIFY_API_KEY)"
   ```

4. Release web sestavte stejně:

   ```powershell
   $geoConfig = Get-Content -Raw -Encoding UTF8 .geoapify.json | ConvertFrom-Json
   flutter build web --release --dart-define="GEOAPIFY_API_KEY=$($geoConfig.GEOAPIFY_API_KEY)"
   ```

`String.fromEnvironment` vloží hodnotu do výsledného klientského JavaScriptu;
Geoapify klíč tedy není tajemství schopné zůstat skryté. Nikdy ho ale necommitujte
a v Geoapify nastavte povolené webové domény/aplikace, rozumnou denní kvótu a
sledování spotřeby. Chybějící klíč má zobrazit řízenou chybu a nesmí dovolit
uložit neověřenou Business pobočku.

## Firebase projekt od nuly

### 1. Založení a registrace aplikací

1. Založte oddělený Firebase projekt pro prostředí; region databáze zvolte před
   vytvořením Firestore, protože ho později nelze jednoduše změnit.
2. Zapněte Authentication provider **Email/Password**. Klient vyžaduje heslo
   nejméně 10 znaků a před vytvořením profilu ověření e-mailu.
3. Zaregistrujte Android aplikaci s package name `cz.shoutout.app`, iOS aplikaci
   se správným bundle ID a webovou aplikaci.
4. Nainstalujte Firebase CLI a FlutterFire CLI, přihlaste se a vygenerujte
   klientské konfigurace:

   ```powershell
   npm install --global firebase-tools@15.24.0
   dart pub global activate flutterfire_cli
   firebase login
   flutterfire configure --project your-project-id --platforms android,ios,web
   ```

5. Zkontrolujte, že vznikl `lib/firebase_options.dart`, Android
   `google-services.json`, iOS `GoogleService-Info.plist` a vazby ve
   `firebase.json`. Pro jiné prostředí je vygenerujte znovu; nekopírujte
   vývojové project ID do produkce.

Repozitář nemá `.firebaserc`, aby se omylem nepřepínal implicitní projekt. Každý
nasazovací příkaz proto musí obsahovat `--project`.

### 2. Firestore, pravidla a indexy

Vytvořte Firestore Native mode a nasaďte současná pravidla i indexy společně:

```powershell
firebase deploy --only firestore:rules,firestore:indexes --project your-project-id
```

Schéma aplikace je bez migračního frameworku a první data vznikají registrací.
Role, Business profil a případná demo data se zakládají důvěryhodnými Admin SDK
nástroji podle `tools/README.md`, nikoli ručně z klienta. Přesný katalog kolekcí
je v `DATA_MODEL.md`.

Čekající Business žádost lze ve vývojovém projektu po potvrzení e-mailu a ruční
kontrole firmy i první pobočky aktivovat příkazem `npm run activate:business`
podle `tools/README.md`. Výchozí spuštění je pouze náhled; skutečný atomický
zápis vyžaduje `--apply` a potvrzení project ID, UID a adresy pobočky.

### 3. Authentication a e-maily

- Přidejte všechny Hosting a vlastní domény mezi autorizované domény Auth.
- Nastavte veřejný název projektu, adresu odesílatele a šablony ověření e-mailu
  a resetu hesla pro zamýšlené jazyky.
- Ověřte, že odkaz z mobilního e-mailu otevře správné prostředí. Aplikace po
  návratu obnovuje uživatele i ID token; dlouhé čekání může být síť/Firebase Auth,
  ale nesmí vytvořit profil před `emailVerified == true`.
- Reset hesla vrací neutrální hlášku a nesmí prozradit, zda e-mail existuje.

### 4. App Check

Android debug používá debug provider a release Play Integrity. iOS debug používá
debug provider a release App Attest s fallbackem na DeviceCheck. Postup:

1. Zaregistrujte Android aplikaci pro Play Integrity ve Firebase App Check.
2. Pro lokální debug přidejte pouze token vypsaný vlastním zařízením/emulátorem.
3. Nejdřív sledujte App Check metriky; enforcement zapínejte po jedné službě až
   po ověření legitimního provozu.
4. Web provider dnes není v aplikaci nakonfigurovaný. Dokud nebude doplněný podle
   `TODO.md`, nevynucujte App Check pro webový provoz.
5. Na iPhonu zaregistrujte debug token vypsaný aplikací; produkční App Attest
   nakonfigurujte až pro konečný bundle ID a Apple tým.

### 5. Cloud Function pro geografii

`functions/index.js` obsahuje jedinou současnou Function
`enrichShoutGeography`. Trigger `shouts/{shoutId}` v `europe-west1` provede
serverový reverse geocoding přes Google Geocoding API a doplní moderátorský
region. Jde o jinou službu než klientské Geoapify.

1. V Google Cloud projektu povolte Geocoding API a billing.
2. Vytvořte API key omezený pouze na Geocoding API.
3. Uložte jej jako Functions secret a nasaďte funkci:

   ```powershell
   firebase functions:secrets:set GOOGLE_MAPS_API_KEY --project your-project-id
   firebase deploy --only functions --project your-project-id
   ```

Cloud Functions deployment vyžaduje placený Firebase/Google Cloud plán. Bez něj
zůstane Shout funkční, ale nové dokumenty nebudou mít doplněné `geography` a
regionální moderace nebude kompletní. Starší Shouty lze po aktivaci obohatit
Admin SDK skriptem `npm run backfill:geography` v `tools/`.

### 6. Storage pro screenshoty

Balíček, obrazovka, metadata a `storage.rules` jsou připravené, ale upload je
záměrně skrytý do aktivace služby. Přesný postup, limit 5 MiB a retenční kontrola
jsou v `FIREBASE_STORAGE_SETUP.md`. Storage a lifecycle automatizaci zapínejte
až v odpovídajícím placeném prostředí.

## Spuštění

Web s adresním našeptáváním:

```powershell
$geoConfig = Get-Content -Raw -Encoding UTF8 .geoapify.json | ConvertFrom-Json
flutter run -d chrome --dart-define="GEOAPIFY_API_KEY=$($geoConfig.GEOAPIFY_API_KEY)"
```

Android na vybraném zařízení:

```powershell
flutter devices
$geoConfig = Get-Content -Raw -Encoding UTF8 .geoapify.json | ConvertFrom-Json
flutter run -d DEVICE_ID --dart-define="GEOAPIFY_API_KEY=$($geoConfig.GEOAPIFY_API_KEY)"
```

Bez `--dart-define` lze procházet části aplikace, které adresu nepotřebují, ale
Business registrace ani vytvoření/změna pobočky se nesmí považovat za otestované.

## Automatické kontroly

Lokálně spusťte stejné kontroly jako CI:

```powershell
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test

Push-Location tools
npm ci
npm run test:tools
npm run test:rules
Pop-Location

Push-Location functions
npm ci
npm test
Pop-Location

flutter build web --debug
```

Pokud Firestore Emulator v PowerShellu nenajde Java 21, použijte runtime Android
Studia pouze pro daný proces, například:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Push-Location tools
npm run test:rules
Pop-Location
```

GitHub Actions v `.github/workflows/flutter.yml` kontroluje formát, analyzátor,
Flutter testy, čisté testy vývojových nástrojů, Firestore Rules a debug web
build při pushi i pull requestu.
Functions test je proto nutné lokálně spustit vždy, když se `functions/` změní.
Povinné ruční scénáře pro dva účty, Business pobočky, realtime oznámení,
moderaci a různá zařízení jsou v `TESTING.md`.

## Nasazení webového dema

Hosting označený jako demo není samostatná Flutter build varianta. Jde o běžný
release web připojený k vývojovému Firebase projektu; po povolení používá
skutečnou polohu prohlížeče. Pevná poloha Litoměřice se do buildu nevkládá.
Samostatné produkční Firebase prostředí a build konfigurace zatím neexistují.

1. Ověřte čistý pracovní strom a cílový projekt.
2. Sestavte release s Geoapify hodnotou.
3. Nasaďte Hosting s explicitním project ID:

```powershell
git status --short
$geoConfig = Get-Content -Raw -Encoding UTF8 .geoapify.json | ConvertFrom-Json
flutter build web --release --dart-define="GEOAPIFY_API_KEY=$($geoConfig.GEOAPIFY_API_KEY)"
firebase deploy --only hosting --project shoutout-dev-46c81
```

`firebase.json` nastavuje SPA rewrite na `index.html` a zakazuje dlouhou cache pro
bootstrap, `main.dart.js` a `version.json`. Tím se omezuje stav, kdy prohlížeč po
nasazení stále ukazuje starou verzi. CLI může upozornit na FlutterFire sekci
`flutter`; tato metadata používá FlutterFire CLI a Hosting konfigurace je vedle
ní samostatná.

Pravidla, indexy, Functions a Storage nenasazujte automaticky spolu s demem.
Každá část se nasazuje explicitním `--only` až po příslušných testech.

## Android release

Účty, testovací kanály, fyzické ověření zařízení a cesta do produkce jsou
podrobně popsané v plánu
[mobilního testování a distribuce](MOBILE_DISTRIBUTION_PLAN.md).

1. Vytvořte vlastní upload keystore a bezpečně ho zálohujte mimo repozitář.
2. Zkopírujte `android/key.properties.example` na ignorovaný
   `android/key.properties` a vyplňte `storeFile`, `storePassword`, `keyAlias` a
   `keyPassword`.
3. Zvyšte `version` v `pubspec.yaml`.
4. Sestavte Play Store bundle:

   ```powershell
   $geoConfig = Get-Content -Raw -Encoding UTF8 .geoapify.json | ConvertFrom-Json
   flutter build appbundle --release --dart-define="GEOAPIFY_API_KEY=$($geoConfig.GEOAPIFY_API_KEY)"
   ```

Release bez `key.properties` je záměrně nepodepsaný; projekt nikdy nesmí použít
sdílený debug klíč pro distribuovanou verzi. Před Google Play ještě splňte
produkční bezpečnostní a právní body v `TODO.md`.

## Tajemství a konfigurace

| Hodnota | Kde patří | V Gitu |
|---|---|---|
| Firebase web/Android/iOS client config | `firebase_options.dart`, `google-services.json`, `GoogleService-Info.plist` | ano; veřejná identifikace projektu |
| Geoapify API key | `.geoapify.json` → `--dart-define` | ne; ve výsledném klientu je viditelný, proto restrikce a kvóty |
| Google Maps API key | Firebase Functions secret | nikdy |
| service-account JSON | lokální bezpečné úložiště / CI secret | nikdy |
| Android keystore a hesla | mimo repo + `android/key.properties` | nikdy |
| testovací e-maily a hesla | `docs/local/` | nikdy |

Před zveřejněním historie spusťte kontrolu na skutečné privátní klíče, hesla,
service-account soubory a hodnoty Geoapify. Firebase client API key sám o sobě
není důvod k odstranění z klienta, ale musí mít správné aplikační restrikce.

## Rekonstrukce stejné aplikace – kontrolní seznam

- [ ] Flutter projekt používá stejný package name, závislosti, assety, font a
  Material 3 téma.
- [ ] Android, iOS a web jsou registrované ve správném Firebase prostředí.
- [ ] Email/Password Auth, ověření e-mailu a autorizované domény fungují.
- [ ] Firestore Rules a indexy jsou nasazené a celé rules testy procházejí.
- [ ] Datové kolekce a atomické invarianty odpovídají `DATA_MODEL.md`.
- [ ] Obrazovky, navigace, breakpointy a stavy odpovídají
  `UI_SPECIFICATION.md` a značkové tokeny `design/README.md`.
- [ ] Geoapify autocomplete je předán přes `--dart-define`, omezený a otestovaný
  na Business registraci i CRUD provozoven.
- [ ] Google reverse geocoding je buď nasazený se secretem, nebo je prostředí
  zřetelně označené jako bez regionálního obohacení.
- [ ] App Check je nakonfigurovaný pro skutečné podporované klienty před
  zapnutím enforcementu.
- [ ] Role a Business profily vytváří pouze důvěryhodný Admin SDK proces.
- [ ] Všechny kontroly z této stránky a ruční hlavní toky z
  `PRODUCT_FLOWS.md` prošly.
- [ ] Web Hosting servíruje novou verzi bez staré cache a `/admin` funguje.
- [ ] Produkční projekt, klíče, testovací účty, platby, monitoring, zálohy a
  retenční joby jsou oddělené od dema a dokončené podle `TODO.md`.
