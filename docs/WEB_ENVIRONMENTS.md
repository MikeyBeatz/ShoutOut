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

Opakovaná read-only kontrola 25. října 2026: Hosting API potvrdilo oba sites
a správné app ID; doména `go.shoutout-app.eu` má `HOST_ACTIVE`,
`OWNERSHIP_ACTIVE`, `CERT_ACTIVE`. DNS resolvery Google a Cloudflare vracejí
`shoutout-go-a1b34.web.app`. HTTPS spojení prošlo standardním ověřením
certifikátu pro vlastní doménu (platnost do 22. ledna 2027).
App site dosud nemá žádný release a vrací Firebase 404. Prezentace vrací 200,
její aktuální verze je `a5262058f34f0154`; odkaz do aplikace zatím neobsahuje.
Tím je dokončená příprava domény a samostatného Hostingu, nikoli konfigurace
provozních služeb nebo první produkční nasazení. Devět testů
`tools/web_environment.test.mjs` prošlo. Nebyla provedena externí změna.

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

Ukládání Shoutů má volitelný boolean `serverShoutSaves` (výchozí `false`).
Při zapnutí vyžaduje `appCheckSiteKey` a volá `toggleShoutSave` v `europe-west3`;
chyba callable nevede k přímému zápisu do Firestore. Klient ignoruje historický
HTTP výsledek a stav záložky i čítač zobrazuje z realtime dat. Nejasný pokus
opakuje se stejným klíčem v paměti domovské obrazovky, rychlé souběžné kliknutí
slučuje. Obnovení aplikace klíč nezachová. V detailu se odběr vlastní záložky
zapíná jen pro tuto serverovou cestu a sdílí existující realtime zdroje.
Vlastník 29. října schválil vývojový rollout včetně aktivace klienta a testů.
Zdroj `5fceccb98f145174acd7917b26356d04e65604a1` prošel CI `40914821162`;
nasazená Function je `ACTIVE`, revize `toggleshoutsave-00001-fal`, Node.js 22,
256 MiB, 15 s, min. 0 / max. 1 instance a concurrency 1. Požadavek bez App Check
vrací 401; ostatních pět Functions zůstalo na předchozích revizích.
Dev konfigurace připravuje schválenou aktivaci `serverShoutSaves`; aktivační
Hosting a živé testy zatím zbývají. Produkční konfigurace přepínač nezapíná.

Reakce na Shouty používají volitelný boolean
`serverShoutReactions` (výchozí `false`). Vyžaduje `appCheckSiteKey` a volá
`toggleShoutReaction` v `europe-west3` bez přímého fallbacku. Vlastník schválil
26. října vývojové nasazení, aktivaci a testy včetně úklidu. Function ze zdrojů
`52627843cc1547229d7b40fb9b137b00f97336fc` je `ACTIVE`, revize
`toggleshoutreaction-00001-lek`, Node.js 22, 256 MiB, timeout 15 s,
min. 0 / max. 1 instanci a concurrency 1. Předchozí tři Functions zůstaly na
stejných revizích. `config/dev.json` zapíná schválený rollout; produkční
konfigurace jej nezapíná. Implementace prošla CI `40370550763`.
Aktivační commit `eea077a347b17d9a902f23835beb7ab6658a430e` prošel CI
`40405135293` a byl nasazen pouze na vývojový site. Hosting verze
`a03706f90b97706c`, release `1793050577697000`, čas `2026-10-26T21:36:17.697Z`.
Otisky HTML, JavaScriptu a veřejné konfigurace odpovídají lokálnímu release
buildu. Předchozí Hosting verze pro návrat je `ebede43dc57e569c`.
Požadavek bez App Check byl odmítnut 401. Automatická relace při obnovení
nejprve hlásila `appCheck/recaptcha-error`; první pokus nevytvořil receipt.
Po ručním ověření vlastníkem prošel celý cyklus nahoru → dolů → odebrání
běžným i Business účtem. Šest serverových receipt, rate eventy, čítače a
realtime stav ve feedu/detailu odpovídají. Vlastní reakce neoznámila sebe sama;
dvě Business oznámení autorovi měla kanonickou veřejnou identitu. Reakce jsou
zpět na nule, dvě čistě testovací notifikace byly odstraněné a dočasný Shout
označený `deleted`; původní Test Shout zůstal zachovaný. Ochrana se nevypínala.
Reakce na komentáře tento přepínač neovládá. Produkce, `main` a Rules se neměnily.

Nezávislý `serverCommentReactions` (výchozí `false`) volá
`toggleCommentReaction` v `europe-west3` a vyžaduje App Check klíč.
Vlastník schválil vývojové nasazení, aktivaci a testovací obsah včetně úklidu.
Function ze zdrojů `8a8d05733d00ef0e099723e2453cccf493549f17` prošla CI
`40408691708` a je ve vývoji `ACTIVE`, revize `togglecommentreaction-00001-dit`,
Node.js 22, 256 MiB, timeout 15 s, min. 0 / max. 1 instance, concurrency 1.
Předchozí čtyři Functions zůstaly na stejných revizích. Vývojová konfigurace
zapíná schválenou aktivaci, produkční ji nezapíná. Aktivační commit
`45a5d024c3cbe7c234c20793116e91d94bf51395` prošel CI `40409557055` a byl na
vývojovém Hostingu, verze `3fc2f80232d34ff3`, release `1793052566828000`
z `2026-10-26T22:09:26.828Z`. Tři hlavní otisky odpovídají release buildu;
návratová verze je `a03706f90b97706c`. Živě prošel celý cyklus palců autora
komentáře i druhého účtu: šest receipt, odpovídající limity, nezměněný text a
Shoutové čítače, žádné vlastní oznámení a dvě kanonická oznámení druhému účtu.
Komentář a dvě čistě testovací notifikace byly odstraněné, parent je `deleted`;
receipt zůstávají. Při externím úklidu se projevilo zastaralé číslo u ikony
komentářů v otevřeném detailu. Lokální oprava čte `commentsCount` ze stávajícího
odběru Shoutu a vynechává lokální inkrementy. Oprava z commitu
`987398f2f60f5375b0413402322ab829970bcff3` prošla CI `40411478509` a je nyní
nasazená pouze na vývojovém site: verze `a6756b787e4655de`, release
`1793053435595000`, čas `2026-10-26T22:23:55.595Z`. Tři hlavní otisky souhlasí
s release buildem. Návratová verze je `3fc2f80232d34ff3`. Živý test potvrdil
0 → 1 → 0 na ikoně i v hlavičce bez obnovení detailu, včetně externího smazání
komentáře. Nevznikla druhá lokální jednička. Regresní komentář byl odstraněný,
jeho dočasný Shout smazaný běžnou UI akcí, receipt zachované. Functions se
při opravě neaktualizovaly; produkce, `main` a Rules zůstaly beze změny.
Klient nemá přímý fallback, HTTP výsledek ignoruje a počty i vlastní reakci
zobrazuje z existujících realtime odběrů komentářů a vlastních reakcí.
Retry drží neměnný klíč v paměti otevřeného detailu; zavření detailu nebo
obnovení stránky jej nezachová. Souhlas platí jen pro vývojový projekt/site
`shoutout-dev-46c81`, nikoli produkci nebo Rules.

Aktuální vývojové nastavení po opravě Service Usage a IAM: uživatelská
diagnostika získala platný App Check token a callable jej přijala, pak správně
odmítla chybějící Auth. `config/dev.json` znovu aktivuje registrovaný provider
a serverové vytváření Shoutů. Přihlášený Business test úspěšně vytvořil
Shout přes callable a následně jej odstranil. Firestore potvrdil serverové ID,
kanonické údaje ověřené pobočky, čítače, geohash, idempotentní záznam a limit
se společným časem zápisu; po úklidu potvrdil stav `deleted`.
Předchozí klient již obsahoval soukromé odpovědi a opravu čítače detailu:
commit `9545946983c284a344a273aab231608677529eb5`, Hosting verze `ebede43dc57e569c`,
release `1793032800630000` z `2026-10-26T16:40:00.630Z`.
Otisky HTML, JavaScriptu a konfigurace odpovídají lokálnímu release buildu.
CI implementace `40230321972`, aktivace `40230718884` a opravy `40355266790`
prošlo; soukromé odpovědi prošly CI `40359475834` a aktivace `40360446321`.
Diagnostická stránka není součástí tohoto běžného buildu.
Produkční konfigurace se tím nemění. Starší neúspěšné pokusy a rollback níže
jsou historie, včetně tehdy vypnutého přepínače a čekajícího ověření.

Volitelný `appCheckSiteKey` nastavuje veřejný reCAPTCHA Enterprise klíč a při
startu webu aktivuje App Check. Volitelný boolean `serverShoutCreation`
přepíná vytvoření Shoutu na callable `createShout` v `europe-west3`; vyžaduje
App Check klíč. Bez přepínače zůstává současný přímý zápis. Při chybě callable
se klient nepřepne na přímý zápis. Retry stejného konceptu drží stejné ID a
původní polohu, úprava konceptu vytvoří nové ID.

Nezávislý `serverCommentCreation` připravuje stejný přechod veřejných komentářů
a odpovědí na `createComment` v `europe-west3`. Vyžaduje App Check klíč;
výchozí hodnota je `false`; `config/dev.json` jej po souhlasu vlastníka zapíná
pro vývojový rollout. Produkční konfigurace jej nezapíná. Soukromé
odpovědi tím nejsou přepnuté. Při chybě callable klient nepoužije přímý fallback.
Příprava prošla vývojovým release buildem. Dne 25. října vlastník výslovně
schválil nasazení nové Function, aktivaci klienta a živé komentářové testy
včetně úklidu pouze ve `shoutout-dev-46c81`. Function je `ACTIVE`, revize
`createcomment-00001-lep`, zdroje `4dce3d2`, Node.js 22, 256 MiB, 15 s a max.
jedna instance/souběžný požadavek. Živý test komentáře a veřejné odpovědi prošel
kontrolou databáze (autor, rodič, receipt, přesné zvýšení limitu a čítače).
Testovací komentáře byly odstraněné; původní Shout uživatele zůstává zachovaný.
`createShout` nebyla aktualizovaná. Produkce ani Rules se neměnily.

Oprava čítače z 26. října prošla automatickými kontrolami a nasazením; vlastník
následně ručně potvrdil přechod 0 → 1 → 0 ve stejném detailu bez opuštění stránky.
Nová automatizovaná relace při startu hlásila `appCheck/recaptcha-error`
a testovací komentář nevytvořila. Příčina nedokončeného odeslání není potvrzená.
API App Check bylo opakovaně ověřené jako `ENABLED`; prázdná výměna tokenu
správně vrací `400 INVALID_ARGUMENT`. Serverový provider ani jeho ochrana
se při tomto ověření neměnily.

`serverPrivateReplyCreation` připravuje přechod soukromých odpovědí
na `createPrivateReply` v `europe-west3`. Má výchozí `false`, vyžaduje platný
App Check klíč; vývojová konfigurace jej zapíná pro samostatně schválený rollout.
Produkční konfigurace jej nezapíná. Veřejné komentáře i Shouty
mají vlastní nezávislé přepínače. Nová Function vyžaduje samostatný souhlas
s vývojovým nasazením a následným živým testem mezi dvěma testovacími účty.
Vlastník dne 26. října výslovně schválil nasazení pouze nové Function
`createPrivateReply`, navazující zapnutí klienta a testy mezi dvěma testovacími
účty včetně úklidu ve vývoji. Function je `ACTIVE`, revize
`createprivatereply-00001-baw`, zdroje `113050f`, Node.js 22, 256 MiB, 15 s,
max. jedna instance/souběžný požadavek. Existující dvě Functions se neměnily.
Živý průchod dvěma účty prošel pro všechny tři cíle i přepnutí ze soukromé na
veřejnou odpověď. Metadata serverových operací a oznámení odpovídají databázi.
Pět testovacích obsahových dokumentů a čtyři čistě testovací agregáty oznámení
byly odstraněné; původní Shout zůstal zachovaný a čítač je na výchozí hodnotě.
Produkce, `main` a Firestore Rules se neměnily.

Dne 25. října 2026 byl ve vývojovém projektu po souhlasu vlastníka zapnutý
reCAPTCHA Enterprise API a registrovaný webový App Check. Registrovaný klíč
dovoluje pouze obě vývojové Firebase domény a `localhost`.
Token TTL je 3600 s, práh zůstává výchozí 0,5. Globální enforcement Firestore
ani Auth se neměnil a `serverShoutCreation` je zatím `false`.

Vývojový rollout z 25. října byl vrácen: browserový smoke test na localhostu
i skutečné vývojové doméně hlásil `appCheck/recaptcha-error`. Klíč proto není
aktivovaný v `config/dev.json` a serverové publikování zůstává vypnuté.
Hosting byl přes ověřené API vrácen na verzi `c8ec155e05b4a3b3` (release
`1792942480312000`). Callable zůstává nasazená s povinným App Check; nesmí se
obejít vypnutím její ochrany. Příčina chyby získávání reCAPTCHA tokenu zatím
není potvrzená.

Následná verze `63c6c0ab3e299be3` ve vývoji obsahuje opravenou právní bránu a
výslovně přibalenou stránku `/__dev/app-check.html`. App Check v hlavní
aplikaci ani serverové publikování nejsou zapnuté. Přestože byla doplněná
chybějící servisní identita App Check s úzkou standardní rolí, izolovaný test
na `web.app` stále selhal před výměnou tokenu. Dokončení ověření v aktivním
prohlížeči zůstává otevřené; ochrana callable nebyla vypnutá.

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

Výstupy jsou oddělené v `build/web-dev` a `build/web-prod`.
Před buildem se čistí pouze výstup právě zvoleného prostředí, aby ve vydání
nezůstaly staré soubory nebo lokální diagnostika. Druhý výstup se nemaže.
Manifest mimo
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
