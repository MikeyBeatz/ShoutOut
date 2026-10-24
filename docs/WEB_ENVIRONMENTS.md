# Vývojový a produkční web

Lokální příprava oddělení prostředí je implementovaná. Produkční Firebase
projekt aplikace, jeho služby a DNS zatím nebyly v rámci této změny vytvořené
ani ověřené. Cílová doména aplikace je `go.shoutout-app.eu`.

| Účel | Firebase projekt | Veřejná adresa |
|---|---|---|
| Vývoj | `shoutout-dev-46c81` | `https://shoutout-dev-46c81.web.app` |
| Produkční aplikace | bude doplněn | `https://go.shoutout-app.eu` |
| Prezentace | `shoutout-production-a1b34` | `https://shoutout-app.eu` |

## Konfigurace

`config/dev.json` je společný zdroj veřejné webové Firebase konfigurace,
návratové adresy e-mailů a Hosting site ID. Produkční šablona je
`config/prod.json.example`. Skutečný `config/prod.json` se doplní až po vytvoření
samostatného projektu a webové aplikace; prázdná šablona není použitelný build.
Veřejná klientská konfigurace může být verzovaná, serverové klíče do ní nepatří.

Nástroj `tools/web_environment.mjs` kontroluje prostředí a projekt. Produkce
odmítá vývojový projekt i projekt prezentace, vývojové číslo projektu a jinou
návratovou doménu než `go.shoutout-app.eu`. Firebase `authDomain` zůstává
`<projectId>.firebaseapp.com`; to je jiná položka než doména aplikace nebo Auth
Action URL. Projektové číslo v `appId` musí souhlasit s `messagingSenderId`.

Výsledná definice `SHOUTOUT_CONFIG` je předaná Flutteru přes soubor a stejná
konfigurace se zapisuje do `app-config.json` pro `/auth/action`. Na webu bez
konfigurace inicializace selže před připojením Firebase. Kontrola hostitele
odmítá vývojový build na produkční doméně a opačně. Vývoj dovoluje také
`localhost`, `127.0.0.1`, IPv6 loopback a vlastní Firebase Hosting domény;
produkční aplikace je připravená pouze pro `go.shoutout-app.eu`.

Android a iOS nadále používají vývojové `lib/firebase_options.dart` a původní
návratovou URL. Produkční mobilní konfigurace není součástí webového MVP.
Produkční FlutterFire konfigurací nepřepisujte stávající mobilní soubory.

## Lokální spuštění

Z kořene repozitáře:

```powershell
node tools/web_environment.mjs prepare dev
$geoConfig = Get-Content -Raw -Encoding UTF8 .geoapify.json | ConvertFrom-Json
flutter run -d chrome --dart-define-from-file=build/environments/dev.defines.json --dart-define="GEOAPIFY_API_KEY=$($geoConfig.GEOAPIFY_API_KEY)"
```

`prepare` pouze připraví definice pro Flutter. Samostatný HTML Auth handler
potřebuje také vygenerovaný `app-config.json`, který vzniká při buildu; jeho
testování provádějte nad sestaveným webem. Ověřovací e-mail se vrací do
nasazeného vývojového webu, ne na localhost.

## Build a kontrola před nasazením

```powershell
node tools/web_environment.mjs build dev --debug
node tools/web_environment.mjs build dev
node tools/web_environment.mjs deploy dev --project=shoutout-dev-46c81
```

Poslední příkaz je jen lokální kontrola a náhled cíle. Release vyžaduje
`.geoapify.json`, produkční release samostatný `.geoapify.prod.json`; oba soubory
jsou ignorované Gitem. Debug build bez Geoapify klíče je možný, ale neověřuje
adresní formuláře. Klíče je nutné omezit na domény příslušného prostředí.

Výstupy jsou oddělené v `build/web-dev` a `build/web-prod`. Manifest mimo
veřejný web uchovává konfiguraci, typ buildu a SHA-256 otisky všech souborů.
Neúspěšný pokus o build zneplatní předchozí manifest. Nasazovací kontrola
odmítne debug build, chybějící manifest, změněné soubory, změněnou konfiguraci
a jiný cílový projekt. CI používá stejný nástroj pro debug build.

## Nasazení až po výslovném souhlasu

Výběr schváleného kódu, větve, commitu a verze upravuje
[RELEASING.md](RELEASING.md). Níže uvedená kontrola buildu zatím automaticky
nevynucuje čistý Git strom, release tag ani vazbu artefaktu na commit.

Pro vývojový Hosting je přesný cíl projekt i site `shoutout-dev-46c81`:

```powershell
node tools/web_environment.mjs deploy dev --project=shoutout-dev-46c81 --apply
```

Nástroj vygeneruje Hosting konfiguraci s explicitním site ID a spustí pouze
`--only hosting`. Firebase predeploy hook znovu ověří projekt z `GCLOUD_PROJECT`,
adresář z `RESOURCE_DIR` a celý build. Kořenový `firebase.json` míří pouze na
vývojový build a používá stejnou kontrolu. Běžné `flutter build web` není
připravený artefakt pro nasazení tímto postupem.

Produkční příkazy používají `prod` a skutečné produkční project ID. Do jeho
doplnění selžou před spuštěním Flutteru nebo Firebase. Samotná lokální kontrola
neověřuje vlastnictví Hosting site, IAM, DNS ani nastavení Firebase služeb.
Kontroly jsou pojistkou proti omylu v tomto workflow; nenahrazují IAM a Rules
a lze je obejít úmyslnou změnou skriptů či jinou konfigurací CLI.

Prezentace dál používá `presentation/firebase.json`. Alias `web` označuje pouze
projekt prezentace a nesmí sloužit pro nasazení aplikace.

## Vývojové Admin SDK nástroje

Starší skripty `enable_test_user_tutorial.mjs`, `round_shout_locations.mjs` a
`set_moderator.mjs` nově odmítají credentials jiného projektu ještě před
inicializací Admin SDK a explicitně nastavují vývojové project ID. Ostatní
existující Admin SDK nástroje už kontrolu cílového projektu obsahují.
Negativní testy používají pouze syntetické credentials a nevolají Firebase.

## Další externí kroky

Po samostatném schválení vytvořit produkční projekt a webovou aplikaci,
vybrat region databáze, doplnit veřejnou konfiguraci a nastavit potřebné
Authentication, Firestore, Storage a Hosting služby. Testovací účty a demo
data se nepřenášejí. Připojit `go.shoutout-app.eu` přes DNS údaje vydané
Firebase Hostingem, ověřit HTTPS a autorizované Auth domény; vlastní Auth
Action URL má být `https://go.shoutout-app.eu/auth/action`.

Před veřejným provozem dokončit nákladové pojistky, IAM, pravidla, App Check,
testy e-mailů, rollback a ostatní brány v `LAUNCH_READINESS.md` a
`COST_SAFETY.md`. Lokální příprava žádný z těchto externích kroků nepotvrzuje.

## Ověření lokální přípravy 24. října 2026

Prošly Flutter testy, cílené testy webové konfigurace, 11 testů nástrojů,
`flutter analyze` i nový debug a release build vývojového webu. Lokální náhled
ověřil shodu release buildu a vývojového cíle; negativní kontroly odmítly debug
artefakt, projekt prezentace, nesprávný adresář a chybějící produkční konfiguraci.

Formát upravených Dart souborů prošel. Celorepozitářový formát má existující
nálezy v nezměněných `lib/l10n/text_sk.dart` a `lib/l10n/text_uk.dart`; tyto
soubory nebyly v této změně upravené. CI tím zatím může zůstat blokované.
Ruční test v prohlížeči, skutečné produkční služby a externí nasazení nebyly
provedené.
