# Vývojový a produkční web

Lokální příprava oddělení prostředí je implementovaná. Od 25. října 2026
aplikace i vstupní stránka používají společný produkční Firebase projekt
`shoutout-production-a1b34`, oddělený od vývoje. Každá má vlastní Hosting web
a konfiguraci. Dne 25. října 2026 byl vytvořen app site `shoutout-go-a1b34`,
propojený s registrovanou aplikací `ShoutOut Web Production`. Veřejná SDK
konfigurace je uložená v `config/prod.json`. Doména `go.shoutout-app.eu` je
přidaná k app site a DNS CNAME na Hostingeru je nastavený; Firebase DNS uznal
a potvrzuje stav `Connected` s platným HTTPS. Na app site zatím není první
release a nastavení provozních služeb aplikace není ověřené.

| Účel | Firebase projekt | Veřejná adresa |
|---|---|---|
| Vývoj | `shoutout-dev-46c81` | `https://shoutout-dev-46c81.web.app` |
| Produkční aplikace | `shoutout-production-a1b34` | `https://go.shoutout-app.eu` |
| Prezentace | `shoutout-production-a1b34` | `https://shoutout-app.eu` |

## Registrované produkční prostředky

Ověřeno 25. října 2026 přes Firebase CLI:

- projekt: `shoutout-production-a1b34`, číslo `391665039159`,
- vstupní Hosting site: `shoutout-production-a1b34` (výchozí site),
- app Hosting site: `shoutout-go-a1b34`,
- registrovaná webová aplikace: `ShoutOut Web Production`,
- app ID: `1:391665039159:web:ee4fea2f25a49d04ec0cb2`,
- výchozí app Hosting URL: `https://shoutout-go-a1b34.web.app`.

Vytvoření site není nasazení aplikace. Na novém site zatím není publikovaný
Flutter build. Doména `go.shoutout-app.eu` má nastavený CNAME; stav ověření
a HTTPS je popsaný v posledním záznamu níže. Hodnota
`storageBucket` převzatá z SDK konfigurace sama nepotvrzuje existenci ani
připravenost Storage služby.

## Konfigurace

Volitelný `appCheckSiteKey` nastavuje veřejný reCAPTCHA Enterprise klíč a při
startu webu aktivuje App Check. Volitelný boolean `serverShoutCreation`
přepíná vytvoření Shoutu na callable `createShout` v `europe-west3`; vyžaduje
App Check klíč. Bez přepínače zůstává současný přímý zápis. Při chybě callable
se klient nepřepne na přímý zápis. Retry stejného konceptu drží stejné ID a
původní polohu, úprava konceptu vytvoří nové ID.

Dne 25. října 2026 byl ve vývojovém projektu po souhlasu vlastníka zapnutý
reCAPTCHA Enterprise API a registrovaný webový App Check. Veřejný klíč v
`config/dev.json` dovoluje pouze obě vývojové Firebase domény a `localhost`.
Token TTL je 3600 s, práh zůstává výchozí 0,5. Globální enforcement Firestore
ani Auth se neměnil a `serverShoutCreation` je zatím `false`.

`config/dev.json` je společný zdroj veřejné webové Firebase konfigurace,
návratové adresy e-mailů a Hosting site ID. Produkční šablona je
`config/prod.json.example`; její prázdné SDK hodnoty ji záměrně činí
nepoužitelnou pro build. Skutečný `config/prod.json` obsahuje veřejnou SDK
konfiguraci získanou přes Firebase CLI a ověřené propojení webové aplikace
s app site. Neobsahuje serverové credentials.
Veřejná klientská konfigurace může být verzovaná, serverové klíče do ní nepatří.

Nástroj `tools/web_environment.mjs` kontroluje prostředí a projekt. Produkce
vyžaduje `shoutout-production-a1b34`, odmítá vývojové číslo projektu a jinou
návratovou doménu než `go.shoutout-app.eu`. Aplikace nesmí použít Hosting site
`shoutout-production-a1b34`, který patří vstupní stránce, ani vývojový site.
App site je `shoutout-go-a1b34`; jeho vlastnictví a vazba na produkční app ID
byly ověřené výpisem Firebase Hosting. Firebase `authDomain` zůstává
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

Produkční příkazy používají `prod` a project ID `shoutout-production-a1b34`.
Produkční konfigurace i app site už jsou doplněné. Release navíc vyžaduje
samostatný `.geoapify.prod.json`, který zatím není připravený. Samotná lokální kontrola
neověřuje vlastnictví Hosting site, IAM, DNS ani nastavení Firebase služeb.
Kontroly jsou pojistkou proti omylu v tomto workflow; nenahrazují IAM a Rules
a lze je obejít úmyslnou změnou skriptů či jinou konfigurací CLI.

Vstupní stránka používá `presentation/firebase.json`, který má explicitní site
`shoutout-production-a1b34`. Aplikace generuje vlastní konfiguraci pouze se svým
site. Alias `web` v `.firebaserc` ukazuje na společný produkční projekt,
nevybírá však Hosting web. Pro nasazení vždy použít explicitní project ID
a odpovídající konfiguraci se site.

Oba produkční weby sdílejí projektové služby, oprávnění a kvóty. Oddělené
Hosting konfigurace rozdělují obsah a nasazování; nevytvářejí samostatné
bezpečnostní ani nákladové prostředí. Statická vstupní stránka neobsahuje
Firebase SDK a nedostává tím automaticky přístup k uživatelským datům.

## Vývojové Admin SDK nástroje

Starší skripty `enable_test_user_tutorial.mjs`, `round_shout_locations.mjs` a
`set_moderator.mjs` nově odmítají credentials jiného projektu ještě před
inicializací Admin SDK a explicitně nastavují vývojové project ID. Ostatní
existující Admin SDK nástroje už kontrolu cílového projektu obsahují.
Negativní testy používají pouze syntetické credentials a nevolají Firebase.

## Další externí kroky

Po samostatném schválení prověřit služby projektu `shoutout-production-a1b34`.
Webová aplikace i druhý Hosting web už jsou vytvořené. Před případným
vytvořením Firestore zvolit region databáze a nastavit potřebné
Authentication, Firestore, Storage a Hosting služby. Testovací účty a demo
data se nepřenášejí. CNAME pro `go.shoutout-app.eu` už odpovídá požadavku
Firebase Hostingu a HTTPS je platné; zbývá autorizovaná Auth doména. Vlastní
Auth Action URL má být `https://go.shoutout-app.eu/auth/action`.

Před veřejným provozem dokončit nákladové pojistky, IAM, pravidla, App Check,
testy e-mailů, rollback a ostatní brány v `LAUNCH_READINESS.md` a
`COST_SAFETY.md`. Lokální příprava žádný z těchto externích kroků nepotvrzuje.

## Ověření lokální přípravy 24. října 2026

Následující záznam popisuje původní variantu před rozhodnutím o společném
produkčním projektu z 25. října; aktuální kontroly jsou uvedené níže.

Prošly Flutter testy, cílené testy webové konfigurace, 11 testů nástrojů,
`flutter analyze` i nový debug a release build vývojového webu. Lokální náhled
ověřil shodu release buildu a vývojového cíle; negativní kontroly odmítly debug
artefakt, projekt prezentace, nesprávný adresář a chybějící produkční konfiguraci.

Formát upravených Dart souborů prošel. Celorepozitářový formát má existující
nálezy v nezměněných `lib/l10n/text_sk.dart` a `lib/l10n/text_uk.dart`; tyto
soubory nebyly v této změně upravené. CI tím zatím může zůstat blokované.
Ruční test v prohlížeči, skutečné produkční služby a externí nasazení nebyly
provedené.

## Ověření společného produkčního projektu 25. října 2026

Prošlo 137 Flutter testů, 12 testů nástrojů, `flutter analyze` a debug build
vývojového webu. Testy pokrývají povolení společného produkčního projektu,
odmítnutí site vstupní stránky pro aplikaci, odmítnutí cizího projektu,
vygenerování konfigurace pouze pro vybraný app site a konfiguraci Auth handleru.
Produkční SDK hodnoty v testech jsou syntetické; služby Firebase se nevolají.

Tlačítko **Otevřít ShoutOut** bylo vizuálně ověřené v lokálním Chrome při
desktopové šířce 1440 px a mobilní šířce 390 px. Odkaz míří na
`https://go.shoutout-app.eu`; mobilní stránka nemá vodorovné přetékání.
Upravené Dart soubory a diff prošly kontrolou formátu. Dříve popsané nálezy
formátu v nezměněných překladech zůstávají mimo tuto změnu.

Tento záznam předcházel následnému zřízení prostředků níže. Dostupnost cílové
domény a provozních služeb ani externí nasazení zatím nebyly ověřené či
provedené. Tlačítko je připravené lokálně pro nasazení po zprovoznění aplikace.

## Zřízení Hosting webu a SDK konfigurace 25. října 2026

Po výslovném souhlasu uživatele byla přes Firebase CLI 15.34.1 registrována
webová aplikace `ShoutOut Web Production` a vytvořen site `shoutout-go-a1b34`
s vazbou na její app ID. Následný výpis potvrdil oba produkční Hosting weby
včetně původního výchozího site vstupní stránky. SDK konfigurace byla získána
příkazem `apps:sdkconfig WEB` a potvrzena opakovaným čtením; uložena je
v `config/prod.json`. Nový Firebase projekt se nezakládal.

Prošly lokální `prepare prod`, validace konfigurace a skutečný produkční
**debug** build `node tools/web_environment.mjs build prod --debug`, stejně
jako všech 12 testů nástrojů. Vygenerovaný `app-config.json` odpovídá zdroji
v `config/prod.json` a Hosting konfigurace vybírá pouze app site.

Release vyžaduje vlastní `.geoapify.prod.json`, který zatím chybí. Debug build
není povolený podklad pro nasazení. Žádný obsah nebyl na nový site nasazený,
DNS nebylo změněné a doména nebyla připojená. Firestore, Auth, Storage, IAM,
App Check a ostatní provozní nastavení nebyly v tomto kroku ověřené ani měněné.
Název Storage bucketu dodaný Firebase SDK není doklad jeho provisioningu.

## Připojení domény a DNS 25. října 2026

Po obnovení relace s Hostinger konektorem byla ve Firebase Console přidaná
vlastní doména `go.shoutout-app.eu` k site `shoutout-go-a1b34` v projektu
`shoutout-production-a1b34`, bez přesměrování na jinou stránku. Firebase Quick
setup vyžádal tento záznam:

| Typ | Název v DNS zóně `shoutout-app.eu` | Hodnota | TTL |
|---|---|---|---|
| CNAME | `go` | `shoutout-go-a1b34.web.app` | 300 s |

Hostinger DNS validace prošla a záznam byl přidán s `overwrite: false`.
Následné čtení potvrdilo nový záznam a zachování původních záznamů `www` CNAME,
kořenového A a ověřovacího TXT. Nameservery nebyly měněné. CNAME byl ověřen
na autoritativním serveru `aurora.dns-parking.com` i přes veřejné resolvery
Cloudflare `1.1.1.1` a Google `8.8.8.8`. Cílový Hosting web vrací DNS A
`199.36.158.100`; tato IP nebyla ručně vkládaná do zóny pro `go`.

Firebase po propagaci oznámil `Custom domain setup successfully`; průvodce
byl dokončen tlačítkem Finish. Následná kontrola potvrdila stav `Connected`,
platný TLS certifikát a HTTPS odpověď cílového webu. Odpověď je zatím očekávané
404, protože app site stále čeká na první release. Flutter build, Auth,
Firestore ani jiné služby v tomto kroku nasazené nebyly.
