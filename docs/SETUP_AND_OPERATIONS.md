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

Webová prostředí a přesné buildovací a nasazovací příkazy jsou v
[WEB_ENVIRONMENTS.md](WEB_ENVIRONMENTS.md). Výchozí holý webový build již není
připravený pro nasazení; vyžaduje explicitní konfiguraci prostředí.

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
   node tools/web_environment.mjs prepare dev
   flutter run -d chrome --dart-define-from-file=build/environments/dev.defines.json --dart-define="GEOAPIFY_API_KEY=$($geoConfig.GEOAPIFY_API_KEY)"
   ```

4. Release web sestavte stejně:

   ```powershell
   node tools/web_environment.mjs build dev
   ```

`String.fromEnvironment` vloží hodnotu do výsledného klientského JavaScriptu;
Geoapify klíč tedy není tajemství schopné zůstat skryté. Nikdy ho ale necommitujte
a v Geoapify nastavte povolené webové domény/aplikace, rozumnou denní kvótu a
sledování spotřeby. Chybějící klíč má zobrazit řízenou chybu a nesmí dovolit
uložit neověřenou Business pobočku.

## Firebase projekt od nuly

### Režim před veřejným pilotem

Současné prostředí zůstává uzavřeným vývojovým testem. Registrace se před
veřejným sdílením neotevře anonymně: tester dostane odkaz individuálně a po
ukončení testu se jeho účet odstraní nástrojem pro integrační scénář. App Check
se nejprve sleduje v metrikách a pro webové MVP vynutí až po ověření webového
provideru, aby se legitimní klienti nezablokovali. Android a iOS provider se
ověří před pozdější mobilní distribucí. Před pilotem musí být
dokončený checklist v [nákladových pojistkách](COST_SAFETY.md). Samotný
rozpočtový alert není tvrdý limit a nenahrazuje servisní kvóty, spend cap pro
Functions, App Check ani nouzové selektivní vypnutí. Žádná Cloud Function se
nesmí poprvé nasadit dřív, než jsou tyto pojistky nastavené a otestované.
Vývojové a seed účty se před produkčním spuštěním nesmějí migrovat do
produkčního projektu.

### 1. Založení a registrace aplikací

1. Vývoj používá `shoutout-dev-46c81`, produkce `shoutout-production-a1b34`.
   Produkční projekt je společný pro vstupní stránku a aplikaci; ta potřebuje
   druhý Hosting web. Před vytvořením Firestore ověřte existující služby a
   zvolte region databáze, protože ho později nelze jednoduše změnit.
2. Zapněte Authentication provider **Email/Password**. Klient vyžaduje heslo
   nejméně 10 znaků a před vytvořením profilu ověření e-mailu.
3. Pro webové MVP zaregistrujte webovou aplikaci. Android aplikaci s package
   name `cz.shoutout.app` a iOS aplikaci se správným bundle ID připravte pro
   pozdější mobilní vydání.
4. Nainstalujte Firebase CLI a FlutterFire CLI a přihlaste se. Produkční
   klientskou konfiguraci získejte pro webovou aplikaci v produkčním projektu.
   Následující FlutterFire příkaz je pouze příklad pro samostatnou pracovní kopii;
   v této kopii by přepsal vývojové `lib/firebase_options.dart`:

   ```powershell
   npm install --global firebase-tools@15.24.0
   dart pub global activate flutterfire_cli
   firebase login
   flutterfire configure --project your-project-id --platforms web
   ```

5. Produkční webové hodnoty doplňte do `config/prod.json` podle
   `WEB_ENVIRONMENTS.md`. Flutter, HTML Auth handler a návratová URL používají
   tento společný zdroj. Stávající `lib/firebase_options.dart` a mobilní
   konfigurace zůstávají vývojové; produkčním generováním je nepřepisujte.

Repozitář obsahuje `.firebaserc` s aliasem `web` pro společný produkční projekt
`shoutout-production-a1b34`. Výchozí projekt (`default`)
nastavený není. Každý nasazovací příkaz proto musí obsahovat `--project` a musí
být spuštěný ze správného adresáře podle příslušného `firebase.json`.

Webové MVP bude na `go.shoutout-app.eu` ve společném produkčním projektu
`shoutout-production-a1b34`, ale na jiném Hosting site než vstupní stránka
`shoutout-app.eu`. Alias `web` sám neurčuje Hosting site. App site je
`shoutout-go-a1b34`, propojený s webovou aplikací `ShoutOut Web Production`;
produkční SDK konfigurace je uložená v `config/prod.json`.

### 2. Firestore, pravidla a indexy

Vytvořte Firestore Native mode a nasaďte současná pravidla i indexy společně:

```powershell
firebase deploy --only firestore:rules,firestore:indexes --project your-project-id
```

Schéma aplikace je bez migračního frameworku a první data vznikají registrací.
Business profil a roli dnes může vytvořit administrátorské rozhraní atomickým
zápisem pod kontrolou Firestore Rules; vývojový Admin SDK nástroj podle
`tools/README.md` je omezená alternativa pro vybrané vývojové scénáře.
Případná demo data vytvářejte jen důvěryhodnými nástroji. Přesný katalog kolekcí
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

Před registrací provideru ověřit přes Service Usage stav **obou** API v cílovém
projektu: `recaptchaenterprise.googleapis.com` i
`firebaseappcheck.googleapis.com` musí být `ENABLED`. Úspěšné administrátorské
čtení konfigurace provideru tento stav nedokládá: používá jiný kvótový kontext
než webový klient s Firebase API klíčem. Dne 25. října uživatelský test přesně
odhalil `SERVICE_DISABLED` u App Check API projektu `696035472864`; Service
Usage následně potvrdilo `DISABLED`. Služba byla v rámci schváleného vývojového
nastavení zapnutá a stav `ENABLED` ověřený opakovaným čtením. Negativní klientský
požadavek na výměnu s prázdným tokenem pak správně vrátil `400 INVALID_ARGUMENT`
(`The recaptcha_enterprise_token cannot be empty.`), nikoli blokaci API.
Úspěšnou výměnu platného tokenu je nutné ověřit zvlášť. Po opravě konfigurace
obnovit diagnostickou stránku, aby nepoužívala lokální backoff po předchozí 403.

Registrace reCAPTCHA Enterprise přes REST sama nemusí vytvořit servisní
identitu App Check. Ve vývojovém projektu byl 25. října ověřen chybějící účet
`service-696035472864@gcp-sa-firebaseappcheck.iam.gserviceaccount.com` a chybějící
role `roles/firebaseappcheck.serviceAgent`. Po schválené registraci App Check
byla identita zřízena přes Service Usage `generateServiceIdentity` a standardní
role přidaná pouze této identitě, s kontrolou IAM etagu a zachováním ostatních
vazeb. Role obsahuje jen `recaptchaenterprise.assessments.create`,
`recaptchaenterprise.assessments.annotate` a `serviceusage.services.use`.
Nevztahuje se na uživatelská data Firestore. Při zřizování dalších prostředí
existenci a roli ověřit; role servisních agentů se nepřidělují lidem ani běžným
aplikačním účtům.

Pro izolované ověření na skutečné vývojové doméně lze sestavit
`node tools/web_environment.mjs build dev --app-check-probe`. Jen tento
vývojový build obsahuje `/__dev/app-check.html`; běžný build ji odstraní a
produkční příkaz tento přepínač odmítne. Stránka přijímá veřejný site key,
nepoužívá přihlášení, nezapisuje obsah a token nikdy nevypisuje. Ověří získání
App Check tokenu a jeho přijetí callable před očekávaným odmítnutím chybějícího
Auth. Případnou chybu výměny zobrazí bez tokenů. Diagnostika není dokladem
úspěšného publikování Shoutu; to vyžaduje navazující přihlášený test.

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

Obsahové callable mají oddělený vstup `functions/content.js`. Pro jejich
samostatnou přípravu spustit `node tools/prepare_content_functions.mjs` a
`npm --prefix build/functions-content ci`. Vznikne konfigurace
`build/firebase-content.json` s codebase `content`, která nevyžaduje Google
Maps secret. Po samostatném souhlasu je přesný vývojový příkaz
`firebase deploy --config build/firebase-content.json --only functions:content:createShout --project shoutout-dev-46c81`.
Pro samostatné schválené nasazení veřejných komentářů použít stejný postup
s `--only functions:content:createComment`. Obě callable jsou nasazené ve
vývoji; klient je řídí nezávislými přepínači `serverShoutCreation` a
`serverCommentCreation`. Nepoužívat obecné `--only functions`, pokud souhlas
platí jen pro jeden endpoint.
`createPrivateReply` se vybírá samostatně přes
`--only functions:content:createPrivateReply`; je nasazená pouze ve vývoji.
Přepínač `serverPrivateReplyCreation` má výchozí hodnotu `false`, ve vývoji
je samostatně schválený rollout zapnutý; živé ověření dvěma účty se dokončuje.
Při nasazení 26. října jednou vypršel lokální desetisekundový discovery limit.
Samostatný import artefaktu prošel za přibližně 0,824 s; další nasazení prošlo
s jednorázovým `$env:FUNCTIONS_DISCOVERY_TIMEOUT='30'`. Jde pouze o limit CLI,
nikoli provozní `timeoutSeconds: 15`. Tento postup popisuje
[oficiální dokumentace](https://firebase.google.com/docs/functions/tips#avoid_deployment_timeouts_during_initialization).
Příprava nic nenasazuje. Vždy připravovat z čistého schváleného commitu.

`functions/index.js` obsahuje jedinou současnou Function
`enrichShoutGeography`. Trigger `shouts/{shoutId}` v `europe-west1` provede
serverový reverse geocoding přes Google Geocoding API a doplní moderátorský
region. Jde o jinou službu než klientské Geoapify.

Před tímto krokem dokončete a prakticky ověřte povinnou bránu v
`docs/COST_SAFETY.md`. Po nasazení následuje geografický backfill, kontrolovaná
aktivace TTL a teprve potom serverová automatizace expirace a mazání účtů.

1. V Google Cloud projektu povolte Geocoding API a ověřte billing.
2. Vytvořte API key omezený pouze na Geocoding API.
3. Uložte jej jako Functions secret a nasaďte funkci:

   ```powershell
   firebase functions:secrets:set GOOGLE_MAPS_API_KEY --project your-project-id
   firebase deploy --only functions --project your-project-id
   ```

Projekt již používá Blaze, ale funkce zatím není nasazená. Bez ní zůstane Shout
funkční, nové dokumenty však nebudou mít doplněné `geography` a regionální
moderace nebude kompletní. Starší Shouty lze po aktivaci obohatit Admin SDK
skriptem `npm run backfill:geography` v `tools/`; spouštějte jej dávkově podle
nákladového plánu, ne současně s prvním nasazením funkce.

### 6. Storage pro screenshoty

Storage, obrazovka, metadata a `storage.rules` jsou aktivní. Přesný postup,
limit 2 MiB a retenční kontrola jsou v `FIREBASE_STORAGE_SETUP.md`. Lifecycle
automatizaci zapínejte až po ověření nákladových pojistek.

## Spuštění

Web s adresním našeptáváním:

```powershell
$geoConfig = Get-Content -Raw -Encoding UTF8 .geoapify.json | ConvertFrom-Json
node tools/web_environment.mjs prepare dev
flutter run -d chrome --dart-define-from-file=build/environments/dev.defines.json --dart-define="GEOAPIFY_API_KEY=$($geoConfig.GEOAPIFY_API_KEY)"
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
npm run lint
npm test
npm audit --omit=dev
Pop-Location

node tools/web_environment.mjs build dev --debug
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

GitHub Actions v `.github/workflows/flutter.yml` používá Node.js 22 a kontroluje
formát, analyzátor, Flutter testy, čisté testy vývojových nástrojů, Firestore
Rules, Functions lint a unit testy i debug web build při pushi a pull requestu.
`npm audit --omit=dev` zůstává povinná lokální kontrola při změně Functions
závislostí; automatický `npm audit fix --force` se nepoužívá.
Povinné ruční scénáře pro dva účty, Business pobočky, realtime oznámení,
moderaci a různá zařízení jsou v `TESTING.md`.

## Nasazení webového dema

Hosting označený jako demo není samostatná Flutter build varianta. Jde o běžný
release web připojený k vývojovému Firebase projektu; po povolení používá
skutečnou polohu prohlížeče. Pevná poloha Litoměřice se do buildu nevkládá.
Produkční app Hosting site a SDK konfigurace už jsou připravené. Doména a
nastavení provozních služeb aplikace zatím nebylo ověřené. Buildy mají oddělené konfigurace a výstupy podle `WEB_ENVIRONMENTS.md`.

1. Ověřte čistý pracovní strom a cílový projekt.
2. Sestavte release s Geoapify hodnotou.
3. Nasaďte Hosting s explicitním project ID:

```powershell
git status --short
node tools/web_environment.mjs build dev
node tools/web_environment.mjs deploy dev --project=shoutout-dev-46c81 --apply
```

`firebase.json` nastavuje SPA rewrite na `index.html` a zakazuje dlouhou cache pro
bootstrap, `main.dart.js` a `version.json`. Tím se omezuje stav, kdy prohlížeč po
nasazení stále ukazuje starou verzi. CLI může upozornit na FlutterFire sekci
`flutter`; tato metadata používá FlutterFire CLI a Hosting konfigurace je vedle
ní samostatná.

Pravidla, indexy, Functions a Storage nenasazujte automaticky spolu s demem.
Každá část se nasazuje explicitním `--only` až po příslušných testech.

## Produkční webové MVP

Cílem je `go.shoutout-app.eu` ve stávajícím projektu `shoutout-production-a1b34`,
odděleném od vývoje. Webová aplikace `ShoutOut Web Production`, site
`shoutout-go-a1b34` a `config/prod.json` jsou připravené. Před nasazením
prověřit služby podle `WEB_ENVIRONMENTS.md`, připravit vlastní doménu Hostingu,
Auth Action URL a autorizované domény, nasadit pravidla, indexy a potřebné
služby a projít bránu v `LAUNCH_READINESS.md`.

Kořenový `firebase.json` nasazuje ověřený vývojový Flutter build z `build/web-dev`;
`presentation/firebase.json` nasazuje statický web. Při budoucím nasazení je
třeba explicitně určit project ID, app Hosting site a pracovat v kořeni repozitáře. ID
projektu `shoutout-production-a1b34` je společné; rozdílný je Hosting site.
Výchozí site `shoutout-production-a1b34` patří vstupní stránce a app build
jej odmítá. Tlačítko na vstupní stránce má být veřejně nasazené až po
zprovoznění cílové aplikace.

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
| Firebase web/Android/iOS client config | `config/*.json` (web), `firebase_options.dart`, `google-services.json`, `GoogleService-Info.plist` | ano; veřejná identifikace projektu |
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
- [ ] Business role a profily vznikají jen administrátorským zápisem pod
  kontrolou Rules nebo schváleným Admin SDK procesem, nikoli běžným klientem.
- [ ] Všechny kontroly z této stránky a ruční hlavní toky z
  `PRODUCT_FLOWS.md` prošly.
- [ ] Web Hosting servíruje novou verzi bez staré cache a `/admin` funguje.
- [ ] Produkční projekt, klíče, testovací účty, monitoring, zálohy a retenční
  joby jsou oddělené od dema a dokončené podle webové brány v `TODO.md`.
  Platby patří do pozdější monetizační etapy.
