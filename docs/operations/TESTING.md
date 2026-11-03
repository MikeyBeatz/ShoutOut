# Testovací strategie a regresní matice

Aktuální souhrn výsledků a jejich meze: [PROJECT_STATUS](../PROJECT_STATUS.md).
Datované části níže jsou důkazy jednotlivých etap; starší „zatím bez rolloutu“
neznamená současný stav. Nové příkazy a kontroly se řídí aktuální konfigurací.

Kontrola dokumentace: `node tools/check_docs.mjs`; odkazy, kotvy, dohledatelnost,
metriky a registrované snímky, bez externích URL a neveřejných local souborů.
Je zapojená v CI jako samostatný krok. Neověřuje nasazení ani právní aktuálnost.

## Lokální příprava mazání účtu – 3. listopadu

Nová `prepare_account_deletion.integration.test.js` je součástí test:rules.
Cíleně s receipt cleanupem prošlo 9 emulátorových scénářů: 51 vlastních Shoutů,
zachování cizích/neaktivních dokumentů a potomků, duplicate/replay, sedmidenní
hranice i po úklidu receipt, Auth/App Check/UID/eligibility a atomický rollback.
Flutter pokrývá nové a existující žádosti, lost ack, původní deadline, změnu
účtu, dvojklik, několik dávek a validaci výsledku i přepínače. Cílené sady
nejsou důkazem živého rolloutu; v tomto úseku se nic nenasazuje.

Celé lokální Flutter testy: 264/264, Functions unit 107/107 (256 integrací
přeskočených bez emulátoru), tools 41/41, analyzátor a Functions lint bez chyb.
DEV debug build prošel; není to release určený k nasazení. Přípravný content
balík obsahuje nový modul a jeho export prošel syntax kontrolou. Samostatné
cílené emulátorové ověření výše má 9/9 případů, nikoli celou test:rules sadu.
Regresní test původně zachytil přístup k Auth před zrušením dialogu; opravené
první/resume UI má společný dialogový latch a zrušení bez Auth přístupu.

### Následný DEV rollout přípravy

CI a57ae9b (41671609764) a 7976e2f (41675834244) success. Finální aktivace ověřila
264 Flutter, 107 Functions unit, 41 tools, 359 Rules/server, 15 purge a 15 Storage
testů, analýzu/lint a DEV build. Předchozí aktivační CI 34250ec neprošlo kvůli
dvěma ručním seznamům vypnutých příznaků v testech gateway; po jejich opravě
prošla celá sada. Release pro Hosting je z čistého 7976e2f a prošel kontrolou
prostředí; oba DEV originy odpovídají manifestu. Nová callable + cleanup mají
ověřené revize/limity; Rules, IAM, plánovače a ostatní Functions se nezměnily.
Anonymní příprava vrací HTTP 401. První ruční test použil starší otevřenou kartu:
ověřil kompatibilní smazání, zachování cizího obsahu, content-archived a +60denní
termín; fixture uklizená, původní inventura shodná. Druhý schválený test v novém
anonymním okně ověřil novou callable: Auth/App Check VALID, HTTP 200, jeden receipt
hidden=2/hasMore=false před žádostí, odstraněný Auth, zachovaný cizí Shout/komentář,
content-archived, minimální veřejný marker a purge scheduled s původním +60denním
termínem. Druhá fixture i přihlašovací soubor uklizené, původní inventura shodná;
oba originy a backend/Rules/IAM znovu ověřené. Nejde o živé uplynutí 60 dní.
Nález UI: po potvrzení chybí ukazatel průběhu, aplikaci lze do pending gate
ještě ovládat; samotná data potvrzují úspěšné smazání. UX oprava a souběh před
Rules cutoverem zůstávají otevřené. Nový kód ani nasazení tento ověřovací úsek neměnil.
[Rozsah a dokončovací kontroly](../plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md).

## Potvrzení a průběh mazání účtu – 3. listopadu

Lokálně 269/269 Flutter testů a analýza bez chyb. Nový
account_deletion_progress_test.dart ověřuje upozornění před operací a zrušení
bez jejího spuštění, blokaci klikání/bariéry/návratu, překrytí pending gate,
přechod na přihlášení, uvolnění při chybě, změnu UID s pozdním výsledkem
a zánik navigatoru. Český dialog při 360×640 px a klávesnici 300 px původně
přetékal; posuvný obsah chybu odstraňuje a potvrzení/zrušení zůstávají dostupné.
Existující testy koordinátoru a pending gate dál procházejí.
Úprava má překlady ve všech sedmi jazycích. CI a DEV Hosting tohoto úseku
zatím čekají; nový destruktivní Auth pilot se tímto úsekem nespouští.

## Konečný 60denní úklid

`npm --prefix tools run test:purge` spouští samostatně emulátor a
`account_purge.integration.test.js`: původní termín, chybějící rodiče,
cizí konverzace/rezervace, přesné čítače, souběh, lost ack, podmíněné
Storage mazání, kopie důkazů a pokračování po dočištění preferencí.
CI má pro tuto sadu samostatný krok; nenavyšuje časový limit Rules sady.
Flutter testy ověřují minimální kontext a signál odstraněného obsahu.
Živý DEV pilot používá oddělený syntetický UID; 60denní hranici lze ověřit
řízeným časem interního jádra, nikoli změnou createTime nebo veřejným endpointem.
Konkrétní výsledky a omezení jsou v [PROJECT_STATUS](../PROJECT_STATUS.md).
Uzavření 3. listopadu: obě CI 41538976226 / 41539164008 success,
254 Flutter, 40 tools, 107 unit, 355 Rules/server, 15 purge, 15 Storage.
Živý trigger/Scheduler dokončil archivaci 3 kořenů, konečný kernel s řízeným
časem nad reálným Firestore/Storage ověřil potomky, anonymní cizí kontext,
2 odstraněné soubory, uvolnění aliasu a terminální replay. Fixture uklizená,
původní inventura shodná. SoftDeleted listing při politice 0 není dostupný;
ověřená byla politika, nepřítomnost objektů a prázdný výpis verzí.

## Úsek role/exspirace – 2. listopadu 2026

Lokálně prošlo 22 cílených Firestore testů (konfirmace, moderní/legacy
autorita, exspirace), 15 Storage testů, 107 serverových unit testů
(208 integračních přeskočeno bez emulátoru) a 37 tools testů; lint bez chyby.
Celá lokální Rules/server sada prošla 321/321; CI 41399389084 pro
91d8d9bc16b45d1a2f6ce7ee1fecff271acd66bc také success (241 Flutter,
37 tools, 107 unit/209 skip, 321 Rules/server, 15 Storage, analýza/lint/build).
DEV Rules/index/Functions nasazené; původních 26 Shoutů ověřeno se změnou pouze
statusu. Účtový pilot dokončil content-archived a jeho úklid zachoval původní
inventuru. Klientské jádro má 8 testů pro lost-ack/dvojklik/původní deadline/
změnu účtu; UI 3 widget testy pro latch, potvrzení, chybu/cache, přepnutí UID
a zrušení dialogu. Prokázaný use-after-dispose password controlleru opravený
vlastnictvím ve State dialogu. Zdroj 23f20438c64e8eedfcd06761d8fd9158b56e8257
má success CI 41472129925: 252 Flutter, 37 tools, 107 unit/209 skip,
321 Rules/server, 15 Storage, analýza/lint/build. DEV Hosting d2573a279275eb72,
oba originy ověřené proti release manifestu; backend/Rules/Scheduler/IAM beze změny.
Jeden nový Auth fixture se přes skutečné UI po ručním přihlášení/reauth vrátil
na login. Admin ověřil Auth nepřítomný, původní request/createTime/deadline,
konfirmaci, terminální job i úplný úklid. Původní inventura/žádost beze změny.
Nejasné sítě/lost-ack jsou simulované testy, nikoli nový živý výpadek sítě.
Automatický login měl chybně zadaný e-mail bez mvp; samotné App Check warnings
nejsou důkazem příčiny. Důkazy `build/account-retry-ui-ci-{proof.json,success.log}`,
`build/lifecycle-{web-proof,ui-proof,ui-cleanup-proof}.json` a screenshot
`build/account-retry-ui-completed.jpg`. Dočasné heslo odstraněno ze stavu fixture.
Testy ověřují zachování metadat/deadline, nevytváření chybějících rolí,
ztracený lease, starý token, návrat z nepotvrzeného rollbacku, přesnou
hranici exspirace, transakční souběh i prioritu účtové dávky před exspirací.
Kontrakt je v [ACCOUNT_AUTHORITY_AND_EXPIRATION](../plans/accounts/ACCOUNT_AUTHORITY_AND_EXPIRATION.md).

`test/live_data_test.dart` ověřuje stabilní sdílení realtime zdrojů, oddělení
účtů/databází, chyby a opětovné načtení, rušení odběrů a zachování živých
interakcí při opakovaných aktualizacích 50 položek. Modelové počty odběrů
nejsou měřením účtovaných čtení; viz [READ_COST_AUDIT.md](READ_COST_AUDIT.md).

Testy v tomto projektu jsou současně bezpečnostní síť a spustitelná technická
specifikace. Nová implementace není ekvivalentní ShoutOutu, dokud neprojde
automatickými vrstvami i hlavními ručními scénáři níže.

## V4 identity/logo worker – příprava integrace

[Kontrakt a pilot](../plans/accounts/ACCOUNT_PUBLIC_IDENTITY_PLAN.md#identity-worker-v4).
11 nových případů se skutečným Firestore a simulačním Storage adaptérem prošlo;
předchozí společný běh měl 51/51 s 42 existujícími worker regresemi.
Pokrývají maskování před obsahem, rezervaci/updateTime/deadline, 51 log přes
více dávek, cizí prefix/obsah, celý private/archive tok, replay, ztracený
mask/page/token/checkpoint ack, lease takeover, nulová/zmizelá loga, 403,
vadný profil/rezervaci/cestu, versioning a zachování v1/v2/v3 bez migrace.
Logy build/identity-worker-emulator-final.log a build/identity-worker-emulator-final-v4.log.
Storage emulátor nadále nedokládá cloudovou revokaci; simulační adaptér ji
nezastírá. Zdroj b685ac40733126272baeafb7d634d60e9dd3f271 má
[CI 41359149804 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41359149804):
241 Flutter, 37 tools, 107 unit (202 emulator-only skip), 306 Rules/server,
14 Storage, analýza/lint a build. Z čisté kopie ověřený release build webu.
DEV nasazení Storage Rules → web → dvě Functions má ověřené live HTML/JS/config
hashe a zdroj Rules, obě ACTIVE revize, zachované limity, ostatních 11 Functions,
IAM, Scheduler a Firestore Rules. Produkce/indexy/TTL beze změny.

Společný skutečný DEV v4 pilot bez nového Auth účtu automaticky došel do
content-archived. Marker přesně schemaVersion/accountStatus, dvě loga včetně
osiřelého po revokaci vracejí 403, count 2, bytes a metadata zachované.
Rezervace/updateTime, privátní/Business profil a role i kontrolní soubor
nezměněné. Deadline stejný. Tři testovací objekty odstraněné před markerem,
testovací FS kořeny/podkolekce uklizené a původní žádost/inventura zachované.
Pilot neměl textový obsah (samostatný předchozí v3 důkaz + v4 emulátorový tok);
nesbíral nový přihlášený UI průchod či živý starý Auth token. Klientské chování
má widget/Flutter regresi a shodu live release souborů; SDK zamítnutí po markeru
má skutečný Rules emulátorový test. Úsek je uzavřený v DEV.
Důkazy: build/identity-worker-{ci-proof,artifact-proof,baseline,deployed-proof,live-proof,cleanup-proof}.json,
build/identity-worker-{storage,hosting,functions}-deploy.log a
build/identity-worker-web-release.log. Kód i příprava balíku jsou commitnuté/pushnuté.

## Skutečný DEV Storage probe a potvrzení Auth mazání – 1. listopadu

Izolovaný Storage probe 8c915db9d9e77eb5ed934be83eb3911bd89a38fb má
[CI 41355437130 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41355437130).
Skutečný test stejného helperu: URL 200 → 403, obě verzovací kolize 412,
bytes/ostatní metadata zachované, replay bez zápisu a nezměněný kontrolní
objekt. Čtyři vytvořené objekty jsou ověřeně uklizené. Request/marker jsou pro
tento Storage-only test v paměti; Auth lookup a Storage skutečné. Žádný nový
Auth účet ani živý Firestore zápis/job. Nejde o celý průchod mazáním účtu.
Metadata bucketu: versioning vypnuté; bez tokenu fixture vrací anonymní 403.
IAM/ACL starých objektů se neskenovaly, již uložené cache se neodvolají.
Důkazy: build/logo-dev-preflight-proof.json, build/logo-dev-probe-ci-proof.json
a build/logo-dev-live-proof.json; tokeny se do nich neukládají.

[Serverová konfirmace a plán rolloutů](../plans/accounts/ACCOUNT_PUBLIC_IDENTITY_PLAN.md#auth-deletion-confirmation):
50 cílených emulátorových případů a lint prošly, z toho 8 přes skutečné Rules
a 42 worker regresí. Pokrývají rollback před potvrzením, odmítnutí po něm,
podvržení/odstranění serverového pole, cizí/anon přístup a list, UID/status,
oba souběhy, invalidní retenci/lease, potvrzení před první změnou, v3 celý tok,
jediné Auth pozorování na dávku a stabilní timestamp/deadline při replay.
Test ztraceného potvrzení privátního delete nově cílí na konkrétní uložený
progress, nikoli pořadové číslo transakce. Jeho očekávání dat/počtů se nemění.
Logy build/account-confirmation-emulator-final.log a
build/account-confirmation-rules-final.log; přehled dotazů/cest v
build/account-confirmation-rules-inventory.txt.
Zdroj e4dd199ede6345501c9fe3512007c3f1b852a910 má
[CI 41356429637 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41356429637):
241 Flutter, 37 tools, 106 unit (191 emulator-only skip), 295 Rules/server,
14 Storage, analýza/lint a web build. Metadata/log:
build/account-confirmation-ci-proof.json, build/account-confirmation-ci-success.log.
Nasazené DEV Rules i dvě Functions mají ověřenou shodu zdroje/nové ACTIVE
revize a zachované limity; ostatních 11 regionálních Functions, Hosting a
Scheduler konfigurace beze změny. Důkazy: build/confirmation-baseline.json,
build/confirmation-deployed-proof.json, build/confirmation-artifact-proof.json.
Živá syntetická žádost bez nového Auth účtu automaticky prošla uložením
potvrzení a cronem cleaning-private → archiving-content → content-archived.
Timestamp i deadline stabilní, testovací data uklizená a původní žádost i
inventura requests/jobs/archive mají nezměněné digests. Další důkazy:
build/confirmation-live-proof.json a build/confirmation-cleanup-proof.json.
Nejde o další živý test textové archivace či přihlášení starým smazaným
Auth tokenem; starý token pokrývají skutečné Rules emulátorové testy a ověření
shody nasazeného zdroje. Úsek je uzavřený v DEV.
Celková bezpečnostní kontrola Rules zůstává samostatnou MVP bránou.

## Tokenová URL Business loga – lokální prototyp 1. listopadu

[Schválený rozsah, omezení a cloudová brána](../plans/accounts/ACCOUNT_PUBLIC_IDENTITY_PLAN.md#logo-url-revocation).
11 nových unit testů, celá Functions sada (105 pass / 188 emulator-only skip)
a lint prošly. Společná Storage sada má 14/14 pass bez skipů:
8 původních Rules regresí a 6 skutečných SDK/Firestore/Storage emulátorových
scénářů v sekvenci. Pokrývají stránkování starých log, oddělení cizího prefixu,
Auth/marker/request/lease guardy, souběh a idempotentní no-op bez tokenů.
Auth lookup je syntetický; žádný Auth účet nevzniká. Cílení pouze lokální.

Test s reálným metadata patchem dokládá omezení CLI 15.31.0: emulátor starý
token zachová a nesprávné generation/metageneration podmínky ignoruje.
Helper v této situaci selže před potvrzením úspěchu. Unit simuluje správné
cloudové podmínky včetně kolizí a replay po ztraceném potvrzení; **nejde o
důkaz zneplatnění skutečného cloudového URL ani cloudového CAS**.
Žádné nasazení, fyzický purge, živá data, job nebo nová cloudová služba.
Logy: build/logo-revocation-unit.log, build/logo-revocation-emulator.log a
build/logo-revocation-storage-final.log a build/logo-revocation-functions.log.
Zdroj c62e7b5d82b04218fa857e034b6e2ecd59aa6b3a je commitnutý a pushnutý;
[CI 41354109582 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41354109582)
ověřilo 241 Flutter, 37 tools, 105 serverových unit (188 emulator-only skip),
284 Rules/server a 14 Storage případů, analýzu/lint a web build.
Metadata a log: build/logo-revocation-ci-proof.json a build/logo-revocation-ci-success.log.
Lokální příprava je uzavřená; cloudová a integrační brána zůstávají otevřené.

## Tři Admin SDK zapisovače – lokální ochrana 1. listopadu

[Schválený rozsah a provozní rozdíly](../plans/accounts/ACCOUNT_PUBLIC_IDENTITY_PLAN.md#admin-write-guards).
37 tools testů prošlo včetně skutečných CLI odmítajících syntetické ne-DEV
credentials před SDK inicializací. Syntaxe všech tří vstupních CLI ověřená.
22 integračních scénářů v izolovaném emulátoru prošlo bez skipů: běžný
backfill, role 1–6, Business aktivace před vytvořením běžného profilu,
zachování existující role/Business dat, request/marker, šest souběhů,
rollback a žádná změna druhého účtu. Kontrolují data i updateTime.

Testy používají přímo operace volané třemi CLI, ne kopii jejich zápisové logiky.
DB namespace je pouze shoutout-rules-test a FIRESTORE_EMULATOR_HOST 127.0.0.1:8080.
Auth je reprezentované syntetickým dříve načteným objektem; nevytváří se Auth účet.
CLI proti živé databázi spuštěné nebyly, žádné nasazení či změna jobů.
Zdroj a0a9117b8e53cc349f1248fd0bb264f787afbf85 je commitnutý a pushnutý.
[CI 41347854953 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41347854953)
ověřilo 241 Flutter, 37 tools, 94 serverových unit (182 emulator-only skip),
284 Rules/server a 8 Storage testů bez chyb, analýzu/lint a web build.
Metadata a úplný log: build/identity-admin-writes-ci-proof.json a
build/identity-admin-writes-ci-success.log. Lokální logy: build/identity-admin-writes-tools-final.log
a build/identity-admin-writes-emulator-final.log. Flutter/Functions/Rules ani
živé recipient scénáře se tímto lokálním testem znovu nedokládají.

## Veřejná identita smazaného účtu – lokální příprava 1. listopadu

[Rozsah, schéma a zbývající brány](../plans/accounts/ACCOUNT_PUBLIC_IDENTITY_PLAN.md).
Nové jádro ani lab adaptér nejsou součástí Functions artefaktů či živého jobu.
Tato etapa nemá živý rollout ani nové testovací Auth účty.

- Úplná Flutter sada: 241 pass. Osm profilových testů zahrnuje model,
  neutrální avatar, aktivní → smazaný stav, chybu streamu, skrytí privátní
  akce a změnu UID bez přenosu staré identity. Marker následovaný chybou ještě
  před dalším snímkem se také neztratí. Analyzátor a formát čisté.
- Functions: 94 unit pass, 182 emulator-only skip, lint čistý; tools 35 pass.
- Plná Firestore Rules/server sada 261/261 pass bez skipů; jádro má 11
  nových integračních případů pro vlastnictví, Auth, původní deadline,
  replay, lease/rollback a ztracené potvrzení transakce.
- Po doplnění ochrany markeru i bez pending žádosti prošla samostatná úplná
  Rules sada 73/73. Konečný commit da264992945f694fd68ed95f83a5fb757044b443
  má [CI 41328636468 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41328636468):
  241 Flutter, 262 Rules/server, 8 Storage, unit/tools, analyzátor/lint i build.
- Osm Storage případů v izolovaném Firestore+Storage emulátoru prošlo:
  aktivní/legacy čtení zachované, marker blokuje SDK čtení i starý owner token
  pro přepis/mazání či metadata s novým tokenem, všechny role 1–6 bez výjimky,
  klient marker nepodvrhne a bug screenshot workflow zachovaný.
- Test starého tokenového URL výslovně očekává stále dostupný soubor po
  samotném markeru: dokládá zbývající potřebu serverové revokace při integraci.

Logy build/public-identity-{flutter-final,widget-final,analyze-final,functions-unit,
lint,tools,rules-full,firestore-rules-final,storage-final}.log; inventář dotazů
build/public-identity-query-inventory.txt. Finální CI metadata a log:
build/public-identity-ci-final-proof.json, build/public-identity-ci-success.log.
Měření nejsou cloudová latence, účtované čtení ani důkaz živého nasazení.
Rules jsou cílený lokální prototyp,
před veřejným vydáním patří do celkové bezpečnostní kontroly.

<a id="ci-reliability"></a>

## Spolehlivost CI – 30. října 2026

Schválená změna ve větvi `feature/ci-reliability` zachovává všechny dosavadní
testovací příkazy a vydávací podmínky. Node 22.23.4 určuje `.nvmrc`, Firebase
CLI 15.31.0 je lokální přesná závislost tools s lockfilem, shodná pro CI i
`npm run test:rules`. Přibyly npm cache pro oba lockfily, cache emulatorových
binárek, limity kroků a upload diagnostiky při selhání/zrušení. Provedení a
umístění artifactu popisuje [runbook](SETUP_AND_OPERATIONS.md#automatické-kontroly).
Úspěch konkrétní verze musí dokládat její dokončený GitHub Actions běh;
samotná konfigurace nedokazuje cache hit ani provedený upload při chybě.
Lokálně prošel actionlint 1.7.12, kontrola diffu, Functions lint, 41 unit testů
(58 integračních bez emulatoru správně přeskočeno) a 20 tools testů pod
Node 22.23.4; CLI výpis potvrzuje projektovou instalaci 15.31.0.
Úplné [CI 41136220552](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41136220552)
pro `48247fea2cf557731fef1b9fb6c9841f4a51e2dc` prošlo za 3 min 42 s
(22:09:40–22:13:22 UTC): Flutter formát/analýza/testy, 20 tools, 41 unit,
123 emulatorových testů a debug build. Log potvrzuje Node 22.23.4 a CLI 15.31.0.
První běh uložil npm i emulator cache. Finální `079d053` prošel CI `41136744088`
za 3 min 14 s (22:14:10–22:17:24 UTC); npm i emulator cache hit jsou potvrzené.
Upload při selhání nebyl lokálně simulovaný. Audit Functions má 0 nálezů;
tools včetně CLI hlásí 21 nálezů v tranzitivních vývojových závislostech
(9 moderate, 12 high), jejich plošná aktualizace není součástí tohoto kroku.

Výchozí debug průchod `41100166067`, attempt 4, job `124324799559` pro přesný
zdroj `c3ad17dafd916915c0af7e01e935fb61466ec7c7` skončil `success`:
21:33:43–21:38:02 UTC, tedy 4 min 19 s. Emulatorový krok trval 89 s, build
49 s; npm/CLI instalace dohromady přibližně 45 s. Flutter cache již fungovala.
Pokus 2 selhal při stahování `cloud-firestore-emulator-v1.21.0.jar` před testy;
bez uloženého podrobného logu nelze určit příčinu stažení. Cache primárně
omezuje opakovanou závislost na tomto downloadu. Souběžné transakční testy
(jednotlivě přibližně 3–7 s) zůstávají beze změny. Zrychlení nové konfigurace
je nutné měřit zvlášť pro studenou a naplněnou cache.

<a id="retention-rollout"></a>

## Retence – vývojový rollout a připravený cutover 30. října 2026

Z čisté pracovní kopie `079d053d24fe04705d13baad7f8307bd25848094` po úspěšném
CI `41136744088` byly aktualizované pouze existující osmičky content Functions
v `shoutout-dev-46c81`, následně vývojový Hosting `02cdb989d4f18ee2`
(release `1793399239632000`, 22:27:19.632 UTC). Revize a rollback jsou v
[WEB_ENVIRONMENTS](WEB_ENVIRONMENTS.md#konfigurace). API potvrdilo všech osm
ACTIVE, Node 22, europe-west3, 256 MiB, 15 s, min. 0 / max. 1 instance a
concurrency 1. Všech osm odmítlo požadavek bez App Check HTTP 401. HTML,
`main.dart.js` a konfigurace mají shodné SHA-256 s místním release buildem.

Po ručním znovuotevření aplikace vlastník publikoval „MVP retence 30.10.“;
automatická karta předtím hlásila reCAPTCHA error. Ochrany se neměnily.
Stejná funkční karta běžného účtu ověřila komentář, palec Shoutu 0 → 1 → 0,
záložku 0 → 1 → 0, palec komentáře 0 → 1 → 0 a smazání komentáře 1 → 0.
Druhý komentář Business nahlásil jako spam a odeslal soukromou odpověď.
Právě dvanáct receipt má
`keyVersion: 1`, správnou identitu a `expiresAt - createdAt = 604800000 ms`.
Business identita, příjemce zprávy i moderační dokument jsou ověřené přes REST.
Úklid v 22:39:48 UTC soft-deleted parent, odstranil komentář, soukromou zprávu,
testovací report a jeho notifikaci s precondition na původní updateTime.
Všech 12 receipt zůstalo zachovaných; původní uživatelský obsah se neměnil.
Důkaz UI je v ignorovaném `build/timed-operation-private-proof.png`.
Důkazy bez credentials: ignorované `build/retention-before.json`,
`retention-functions-after.json`, `retention-hosting-after.json` a
`timed-operation-live-state.json`. Během této první fáze byl legacy příjem zapnutý.

Ve větvi `feature/operation-retention-cleanup` je implementovaný zákaz nových
legacy klíčů, nyní i nasazený ve vývoji. Platný replay existujícího starého receipt funguje pouze do
sedmi dní od serverového vytvoření; po odstranění se starý formát vždy odmítne.
Emulatorové fixtures přešly na deterministické časové klíče bez změny očekávání.
Úklid prověřuje jen podporované akce a platné datum/metadata, nejvýše 500
receipt v dávkách po 50. Mazání má precondition na původní updateTime; změna
záznamu zruší celou dávku. `maintenanceState/operationReceiptCleanup` ukládá
kurzor přes CAS, takže zachovaná neznámá data nezablokují další stránky a
souběžný běh nepřepíše novější checkpoint. Po konci průchodu kurzor resetuje.
Lokálně prošel lint, 44 unit a finálních 129 emulatorových scénářů bez chyby.
Původní sady zachovávají stejná očekávání. Nově se ověřuje odmítnutí nových
legacy klíčů všemi osmi operacemi bez zápisů, bezpečné opakování po úklidu,
CAS dávky při změně receipt, stránkování přes zachovaná data a závod při
založení checkpointu. Bez emulatoru se 64 integračních scénářů přeskočí.
Logy: `build/retention-cleanup-emulator-final.log` a `retention-cleanup-unit-final.log`.

Nasazená plánovaná Function `cleanupOperationReceipts` má schválený plán denně
02:15 UTC, 256 MiB, 60 s, max. 1 instanci/concurrency 1 a bez automatických
retry. Loguje pouze počty a stavy. Vlastník výslovně vybral denní DEV variantu.
Čistý `9b748d7d9698f4ef99b2ec718180f338ea979da6` prošel
[CI 41139730936](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41139730936)
(22:41:06–22:45:46 UTC): 44 unit, 129 emulatorových, 20 tools, Flutter a build.
Nejdřív bylo aktualizovaných všech osm callable, API ověřilo nové revize,
ACTIVE, původní limity a 401 bez App Check. Teprve potom byl nasazený plánovač
`cleanupoperationreceipts-00001-nuh` a vytvořený job
`firebase-schedule-cleanupOperationReceipts-europe-west3` (ENABLED).
Cloud Run IAM nemá `allUsers` ani `allAuthenticatedUsers`, povoluje OIDC účet
Scheduleru; nepřihlášený POST vrací 403. API/scheduler status i checkpoint byly ověřené.
Živá Business záložka po cutoveru prošla 0 → 1 → 0; další dvě timed receipt
zůstaly, původních dvanáct i ostatní pole parentu se nezměnily.
První ruční job po počáteční konfiguraci projektu doběhl 22:52:42.425 UTC:
scanned 1 / deleted 1 / skipped 0, odstranil pouze izolovaný prošlý testovací
receipt. Všech 14 platných receipt zůstalo beze změny. Opakování 22:53:13.333 UTC:
scanned 0 / deleted 0 / skipped 0, stejných 14 potvrzení zachováno.
Důkazy: `build/retention-cutover-after.json`, `retention-cutover-live-state.json`,
`retention-scheduler-inspect.json`, `retention-scheduler-live-state.json`
a `retention-cutover-ci.log`. Nové API a job jsou pouze ve vývoji; produkce,
Hosting po `079d053`, main a Rules se neměnily.
[Oficiální postup a cena plánovače](https://firebase.google.com/docs/functions/schedule-functions).
Před zapnutím produkce znovu posoudit kapacitu a frekvenci podle provozu.
Sedmidenní deadline operace se vynucuje nezávisle na fyzickém úklidu;
ostatní 60denní retenční požadavky a dokončení mazání účtu se tím nemění.

**Návrat po zapnutí úklidu:** nepovolovat znovu nové legacy klíče. U odstraněných
legacy receipt již nelze poznat původní nečasovaný požadavek, takže návrat na
kompatibilní `allowLegacy: true` by mohl zopakovat jeho účinek. Případně pozastavit
job, ale zachovat striktní kontrolu klíčů v každé operaci a vracet jen timed klienta
(`079d053`/Hosting `02cdb989d4f18ee2`). Starší Hosting `8d7e3f3fed920529` není
po cutoveru bezpečná samostatná návratová verze. Obnovení legacy příjmu by vyžadovalo
samostatný návrh obnovy původních potvrzení a schválení; není rutinní rollback.

## Archiv textů a v3 job – lokální ověření, zatím bez rolloutů

Nové rozhodnutí vlastníka uchovává všechny zahrnuté zprávy a komentáře 60 dní.
Lokálně připravený archiv, omezený auditovaný lookup nahlášeného komentáře,
nové indexy a Rules jsou popsané v [archivním plánu](../plans/accounts/ACCOUNT_CONTENT_ARCHIVE_PLAN.md).
V DEV jsou po schváleném pilotu contentArchiveEnabled i klientský
serverArchivedReportLookup true; produkce se neměnila.

Po přerušení práce byl poslední úplný Flutter log neúspěšný kvůli chybnému
odkazu targetSnapshot v jiném handleru moderace. Odkaz je opravený, analyzátor
čistý a nový úplný běh má 235/235 pass. Serverová unit sada 92 pass a
171 emulator-only skip; celá Rules/server sada 249/249 pass bez skipů.
Samostatně 52 job/archive scénářů, 5 report lookup scénářů a 3 klientské
protokol/config testy. Planner indexů má 3 testy; soubor web/planner 19 pass.

Ověřeno: nenahlášené příchozí/odchozí zprávy včetně původních polí, cizí
konverzace zachovaná, přesný komentářový čítač, bounded přesun reakcí,
ztracené potvrzení již provedené transakce, výměna žádosti/lease, pevný
deadline, dvojí mazání účastníků bez duplicit, nemigrované v1/v2 a pozastavení
v3. Lookup vyžaduje existující kanonické hlášení, způsobilou moderační roli a
App Check; úspěch má audit bez textu a na deadline už nic nevrací.
Přímé čtení/zápisy archivu odmítnuté pro role 1–6 i anonymně. Běžné reakce
procházejí, osiřelé create/update/delete se odmítají. Soukromé hlášení lze
idempotentně uzavřít i po odstranění zdroje, bez rozšíření práva číst jeho text.

Read-only cloud preflight našel 97/97 validních komentářů, 0 soukromých zpráv,
archivů/jobů a 1 původní žádost. Comments.authorId CG READY. Indexový plán
obsahuje pouze 4 cílené operace; zachová dnešní collection indexy a nesahá na
TTL ani nemaže indexy. Nenasazovat celý indexes soubor kvůli starým TTL položkám.

Logy: build/account-archive-flutter-final.log, account-archive-rules-final.log,
account-archive-functions-unit.log, account-archive-analyze.log,
archived-comment-report-emulator.log, archive-index-tools-test.log.
Commit f0625b527ed2660ffa538d26497fc827d427b69f má úspěšné
[CI 41320353170](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41320353170).
Čistý detached worktree stejného SHA: DEV web build prošel, account/content
balíky obsahují 7/19 JS modulů, shodují se s Git zdroji a jejich importy se
načetly. V tomto přípravném commitu byly oba nové flagy false. Důkaz:
build/account-content-artifact-proof.json.

Aktivace 1dab78cce583899648f8e17d6814a0ecbfc6aad8 má
[CI 41322524612 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41322524612):
235 Flutter, 35 tools, 92 unit (171 emulator-only skip), 249/249 Rules/server,
analyzátor, lint a web build. Při aktivaci opravené historické v2 fixture a
izolované App Check konfigurace mají navíc úplnou Flutter sadu, tools/unit a
39 job scénářů lokálně. Prázdná index exemption z REST odpovědi je ověřená plannerem.

Schválený živý DEV pilot prošel: waiting-auth bez změn, po odstranění jen
fixture Auth plánovač skryl 3 Shouty, odstranil 4 privátní položky, archivoval
2 zprávy, 1 komentář a 3 reakce; cizí obsah zachovaný, commentsCount 2 → 1,
deadline původní žádost + 60 dní a replay beze změny. TestModerator zobrazil
archivovaný text v aplikaci, vznikl jeden audit bez textu; bez postihu/rozhodnutí.
Po prázdné obrazovce při automatickém reloadu pomohlo ruční zavření/otevření;
diagnóza tohoto načítání není součástí úspěšného archivního testu.
Anonymní archiv 403/callable 401. Úklid odstranil 18 zbylých fixture dokumentů
a checkpoint, Auth chybí, archivy/joby 0, původní žádost nezměněná.

Workery/lookup ACTIVE, limity a Scheduler zachované; ostatních 10 Functions
beze změny. Živá Rules mají shodný zdroj, 4 indexové změny READY a ostatní
indexy/TTL beze změny. Hosting 11888ad4b6a3ffb3: HTML/JS/config shodné.
Důkazy: build/account-archive-{infra,wait,live,audit,cleanup}-proof.json,
build/archive-{hosting,index-applied,rules-after}-proof.json,
build/account-content-activation-artifact-proof.json a archive-activation-ci-success.log.
Před veřejným vydáním patří Rules dál do celkové kontroly podle MVP_SERVER_PLAN.
Konečný fyzický 60denní purge, identita/přezdívka a klientský cutover nejsou
tímto pilotem ověřené ani dokončené.

## Privátní fáze účtového jobu – DEV dokončeno 1. listopadu

`functions/account_deletion_job.integration.test.js` nyní má 35 případů.
Společně s 68 Rules testy prošlo 103/103 bez skipů. Nová v2 fáze pokrývá
ztracené potvrzení po potvrzeném delete commitu, obnovení z databázového
průběhu, souběh a převzetí lease, atomický rollback při změně kandidáta,
nahrazenou žádost, Auth existenci/výpadek, neznámá privátní data pro review,
zachování dokončených i rozpracovaných v1 jobů, pozastavení v2 flagem a
odmítnutí vadných metadat. Vzorek 55 položek: dvě dávky 50 + 5 za 460 ms
v emulátoru, nikoli měření cloudové latence nebo faktury.

Rules testy navíc doložily, že all-false preference zabrání starému klientu
znovu vytvořit schránku, zatímco stejná reakce bez oznámení projde; mazající
se uživatel ani jiný účet neobnoví vlastní seznamy či preference. Rules se
neměnily. Serverové příchozí cesty mají dosavadní deletion-marker testy.
Celá serverová sada 90 unit pass / 149 emulator-only skip, ESLint čistý,
15 web environment tools testů pass. Klient Flutter se nemění.
Logy: build/account-private-rules-emulator.log, account-private-functions-unit.log,
account-private-eslint.log a account-private-tools.log.
Původní CI 41299376137 pro 22bcf7316908d04e12ce5aed80599a460c0c1591 je success.
Vlastník schválil [konkrétní datový pilot](../plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#private-job-dev).
Aktivace 6a4606e7713e66affd1ad6d98339f6837bf2c17c prošla vlastním CI
41300216738: 89 unit / 149 emulator-only skip, 224 Rules/server případů bez
skipů, 31 tools a Flutter kontroly/build. Všech 35 job testů navíc znovu lokálně
prošlo s reálnými schválenými DEV parametry. Čistý instalační balík má šest
JS modulů, package/lockfile shodné s Git; aggregate artifact SHA-256
56d1690443095cae7cd4ad7527c104d8e8d87a6bbe7389c30d5380c8ba2bf3b1.

Obě účetní Functions jsou ACTIVE, source hash 3c5bb3d252677158aee75a54571a26c43e6af03a,
Node 22/europe-west3/min 0/max 1/concurrency 1/256 MiB/60 s. Scheduler má
stejné URI, OIDC identitu, minutu UTC a retryCount 0. Anonymní HTTP 403,
ostatních 10 Functions i Hosting beze změny. Runtime revize:
accountdeletionrequestcreateddev-00003-jis a resumeaccountdeletionjobsdev-00003-cis.

Živý test vytvořil právě jeden nový disabled Auth účet, 3 Shouty a 4 privátní
položky. Při existujícím Auth waiting-auth/0/0, všechny položky a preference
zachované. Po odstranění pouze tohoto Auth skutečný plánovač dokončil 3 skryté
Shouty a 4 odstraněné položky. Profil/legal zachované, všechny preference
false, ostatní pole Shoutů nezměněná, terminální replay nemění ani updateTime.
Job bez textů/e-mailu/polohy, anonymní Firestore čtení 403. RetainUntil je přesně
createTime + 60 dní; konečný retenční proces stále není implementovaný.

Testovací Auth je nepřítomný, všechny jeho evidované dokumenty/žádost/job a
vzniklý checkpoint jsou uklizené. Digest celé původní pending žádosti a původních
jobů zůstal stejný. Původní uživatelská data, Rules, main a produkce beze změny.
Důkazy: build/account-private-{activation-artifact,infra,wait,live,cleanup}-proof.json,
account-private-activation-ci.log a account-private-functions-deploy.log.
Bezpečný rollback musí zachovat v2-aware jádro a vypnout flag; starší v1-only
worker nezvládne případné již vytvořené v2 joby.

<a id="audit-lifecycle-fixes"></a>

## Opravy životního cyklu po auditu 1. listopadu 2026

Schválené opravy nálezů zpětné kontroly 37 commitů z 30. října–1. listopadu:

- TimedOperationGateway nemá globální mapy pokusů ani uložené celé payloady.
  Každý požadavek nese vlastní TimedOperationAttempt s SHA-256 otiskem,
  scope a timed klíčem. JSON se zmrazí jen na dobu probíhajícího volání.
  Gateways ponechávají stejný request pro nejasný výsledek; návrh publikace
  mění vazbu pouze se změnou draftu. Potvrzená operace dál bezpečně přijme
  opakování s týmž objektem, ale nedrží globálně text ani historii všech akcí.
  Při zániku requestu zanikne i vazba; nové requesty dostávají vlastní vazby.
  UID se ověřuje před získáním času i před odesláním. Změna scope/payloadu
  pod jednou vazbou se odmítne před sítí. Sedmidenní serverový kontrakt se nemění.
- Account worker ukládá pouze sanitizovaný processing-failed. Jednoznačně
  trvalé chyby předává do needs-review hned, ostatní po stávajícím authWaitMillis
  od serverového vytvoření žádosti (DEV 24 h). Dočasná chyba před tímto časem
  drží retry a dosavadní zámky i atomické počty. Needs-review nemá další pokus,
  Scheduler ji vynechá a replay události nevolá Auth. Úspěšné stránky nejsou
  omezené tímto chybovým oknem. Ruční kontrola nadále vyžaduje provozní řešení;
  nevznikl nový upozorňovací kanál ani automatické obnovení.
- Komentáře u nasazeného DEV jobu už neoznačují práci jako čistě lokální.

Cílené ověření: 46 Flutter testů gatewayů/publikací, 23 account/job testů
v emulátoru bez skipů, Flutter analyze a ESLint čisté. Testy pokrývají
ztracenou odpověď, retry po potvrzení, souběh, změnu účtu i payloadu, správný
životní cyklus draftu, trvalé chyby oprávnění, dočasné/neurčené chyby před
hranicí a po ní, vyloučení terminálních jobů ze scanu a zachování zdrojů.
Závislost crypto 3.0.7 pouze převedena z tranzitivní na přímou, bez nové verze.
Logy lokálně: build/audit-fixes-flutter-targeted.log,
build/audit-fixes-account-emulator.log, build/audit-fixes-analyze.log.
Celá Flutter sada má 232 pass, Functions unit 88 pass / 138 emulator-only skip.
CI 41297163776 pro 6acca72fa2cf860178e9411e91acd18d38507831 je success;
210 Rules/server emulátorových a 31 tools testů prošlo bez skipů.
Release build DEV a shoda pěti JS modulů instalačního balíku s Git blobem
ověřené; JS artifact digest 5ad8c53edc10b703dead47f9d14223ea3ed3714605a8a0e56ecca5d40c1c3b7c.

DEV rollout dokončený: Hosting 2e9a063495041b40 a obě účetní Functions ACTIVE,
source hash 9c3983a938f2c2b3ed6cb08e481b03e218ed52f9. Byte-for-byte shoda
veřejných HTML/JS/config, runtime Node 22, max 1/concurrency 1/256 MiB/60 s
ověřené. Cadence, retry i identita plánovače zůstaly stejné; Firebase CLI
převedlo URI a OIDC audience z cloudfunctions.net na kanonický Cloud Run
endpoint téže Function. Nová revize resumeaccountdeletionjobsdev-00002-wuq
má request log HTTP 200 v 10:30:03 UTC; anonymní POST 403. Dalších deset
Functions podle plného API stavu beze změny. Nové přihlášené klientské
průchody se neprováděly. Důkazy: build/audit-fixes-live-proof.json,
audit-fixes-artifact-proof.json, audit-fixes-ci.log a deploy logy.
Návratové verze: předchozí Hosting 42d86a762a74a2dd/ca67ebd a účetní
Functions ef49f25; návrat by vrátil známé auditní nedostatky. Zachovat
striktní op1 protokol. Produkce, Rules a main se neměnily.

## První kompatibilní serverová vrstva retence 30. října 2026

Navazující klient `timed_operation_gateway_test.dart` pokrývá ztracenou odpověď
a změnu Auth času při retry, opakování i po potvrzení, současné získávání času,
přepnutí účtu během await, změnu/mutaci payloadu, pořadí JSON klíčů, prošlý
nejistý pokus bez nového klíče a oddělení účtů/operací. Šest scénářů prošlo.
Dva `operation_text_test.dart` ověřují recovery v sedmi jazycích a zachování
ostatních chyb. Všech osm klientských cest je napojených; pro tři publikace
přibyl test očekávané identity před DB přístupem. Celkem 41 unit a 123
emulatorových testů a všech 202 Flutter testů prošlo, analýza/formát jsou čisté.
Release build dev i kontrola manifestu prošly. Nový zdroj zatím není živě nasazený.

Klientský commit `c3ad17dafd916915c0af7e01e935fb61466ec7c7`, run `41100166067`:
dokončený log prvního jobu `124215878506` dokládá 202 Flutter, 41 unit, 123
emulatorových a 20 tools testů, čistou analýzu a build; skončil v 17:39:49 UTC.
Metadata runu/checku/suite ale zůstala `in_progress` bez výsledku a prázdných
kroků, jobs API vracelo 502/504 a rozhraní také načítalo. Příkaz cancel byl
odmítnutý, protože backend považoval běh za dokončený. Re-run stejného commitu
byl přijat; attempt 2 následně selhal při stahování emulatoru a attempt 4
jednoznačně prošel (viz výše). Lokální log prvního pokusu je v ignorovaném
`build/timed-operation-ci-job-attempt1.log`. Příčina rozporu není potvrzená;
žádný rollout neproběhl. Samotný pozitivní log nenahrazuje požadovaný
jednoznačný konečný stav CI, který už čtvrtý pokus doložil.

První CI serverové vrstvy `41097603906` (`aeeaec8`) selhalo v dosavadním
souběžném testu hlášení, protože z 3 stejných žádostí uspěly 2. Lokální běhy
prošly. Test dostal výpis kódu/zprávy odmítnutých pokusů, jeho přísné očekávání
se neměnilo; `89247e9` prošel CI `41098701651`. Příčina prvního selhání není
potvrzená a nesmí být zaměněná za ověřenou opravu produkčního chování.

Pět unit testů `operation_retention.test.js` pokrývá přesnou sedmidenní
hranici, pozdější první provedení, opakování před/po deadline i po fyzickém
úklidu, budoucí/poškozené klíče a neplatná či prodloužená serverová metadata.
Výslovně rozlišují kompatibilní legacy režim od jeho budoucího ukončení.
Čtyři emulatorové testy `operation_retention.integration.test.js` ověřují
odmítnutí prošlého nového klíče všemi osmi operacemi bez obsahového/rate/receipt
zápisu; skutečné uložení, smazání receipt a starý retry bez druhého přepnutí;
deadline i před fyzickým úklidem; a prioritu současné způsobilosti účtu/banů.

Functions lint, všech 40 unit a 123 emulatorových testů (65 Rules + 58 serverových)
prošlo. Původních 119 scénářů prošlo beze změny očekávání; legacy klient zůstává
kompatibilní. Příprava obsahového artefaktu zahrnuje nový modul a lokální import
exportu ověřil region/limity a odmítnutí bez Auth/App Check. Flutter zdroje se
v tomto kroku nemění. CI, nasazení této vrstvy a nové živé klíče ještě čekají;
úklid receipt není touto změnou zapnutý.

## Lokální příprava mazání komentářů 30. října 2026

`functions/delete_comment.test.js` ověřuje striktní payload bez klientské
identity autora či čítače, Auth/App Check, ověřený e-mail a očekávaný účet,
poškozené rate dokumenty a přesné hranice 1 s / 120 za hodinu. Osm scénářů v
`delete_comment.integration.test.js` provádí skutečné transakce nad emulátorem:
autor, současné retry, soupeřící klíče/účty, cizí komentář i vlastník parentu,
Business, důvěryhodné role 3–5 a legacy moderátor, odebrání role před replay,
ban či nedokončený účet, chybějící cíle a vadné čítače bez částečného zápisu,
neaktivní parent, clamp na 0, tvorbová restrikce a sdílený dosavadní delete bucket.
Ověřují zachování ostatních čítačů a navazujících dokumentů; historický replay
nesmí měnit novější parent stav ani spotřebovat další limit.

`test/comment_deletion_gateway_test.dart` ověřuje neměnný klíč při nejasném
výsledku, sloučení současných kliknutí, oddělení targetů, nový pokus po
definitivním odmítnutí, přepnutí/odhlášení účtu a samostatnou konfiguraci.
Klíč přežívá zánik dlaždice díky session helperu, ne obnovení stránky.
Klient nedostává čítač z callable; detail odebírá živý parent i při samostatně
aktivovaném `serverCommentDeletion`. Chyba serveru nespouští přímý fallback.

Lokálně prošlo 194 Flutter testů, čistá analýza a formát 96 souborů, Functions
lint a 35 unit testů, 20 testů nástrojů a 119 emulatorových testů (65 Rules +
54 serverových), včetně osmi nových. Po odstranění dvou zbytečných čtení rolí
při mazání vlastního komentáře prošlo znovu všech osm cílených transakčních
testů a tři unit testy. U tohoto cíleného běhu Firebase CLI po úspěšném scriptu
ohlásilo timeout při ukončování emulátoru; předchozí plný běh skončil kódem 0.
Release build dev a kontrola manifestu/otisků pro `shoutout-dev-46c81` prošly.
Lokální import připraveného obsahového artefaktu ověřil export, region,
provozní limity a odmítnutí bez Auth/App Check. Nejde o živý HTTP test.
CI `41090758502` pro `34f7cad` prošlo. Výslovný souhlas z 30. října pokrývá
samostatnou Function i následnou otestovanou aktivaci a vývojové živé testy
s úklidem. Function je nasazená (`deletecomment-00001-zuc`); API potvrdilo
limity i živé HTTP odmítnutí bez App Check 401. Připravená aktivace prošla
19 cílenými Flutter a 20 tools testy. Aktivační commit
`fcbc23d58bfd94498131a126059fe58b645c79a4` prošel CI `41091651584`.
Release build, manifest a shoda HTML/JS/konfigurace na nasazeném Hostingu
`8d7e3f3fed920529` prošly. Předchozí Hosting verze je `884138efa765d64a`.

Živé mazání zatím nebylo provedeno. Po reloadu původní ručně ověřené karty
`722302950` zůstalo rozhraní na načítání (5 prázdných Flutter semantics uzlů,
centrální prvek velikosti spinneru); screenshot API jednou vypršelo. Zachycená
konzole obsahovala starší App Check 401 a Firestore transport warnings před
nasazením, ne důkaz nové chyby endpointu. Vlastník je požádán o ruční Ctrl+R
a potvrzení TestModerator. Ochrany zůstaly zapnuté.
Samostatná schválená fixture „MVP mazani 30.10.“ má 3 dosud zachované komentáře
a 1 otevřený report. `build/comment-delete-live-state.json` a
`build/comment_delete_live.cjs` v ignorované složce zachovávají baseline a
podmíněné ověření/úklid. Běžný, Business a moderátorský průchod ani úklid
nesmějí být označené za dokončené bez navazujících důkazů.

Později 30. října se moderátorská karta načetla. Schválený pokus „Skrýt obsah
bez postihu“ na výhradně testovacím komentáři vrátil „Rozhodnutí se nepodařilo
uložit“. Log požadavku z `2026-10-30T16:53:41Z` má HTTP 401; strukturované
ověření potvrzuje Auth VALID / App Check MISSING. Další dva požadavky v
16:58 UTC mají stejný stav ověření. Všechny 3 komentáře a parent čítač 3
zůstaly zachované. Vlastník je požádán o ruční uložení bez sankce.
App Check API přijímá požadavky (prázdný token správně vrací 400), klíč je typu
SCORE s povolenými vývojovými doménami a `minValidScore: 0.5`; běžné JS adresy
vracejí 200. To neprokazuje úspěšnou attestation v konkrétní relaci. Nic z
nastavení nebylo změněné. Jedno čtení Logging API vrátilo 429, pozdější prošlo.

Lokální `build/receipt_expiry_probe.mjs` nad izolovaným emulátorem prokázal
riziko prostého úklidu receipt: první uložení vrátí `{saved:true,count:1}`,
po smazání jeho receipt stejný požadavek vrátí `{saved:false,count:0}`.
Skript i emulátor skončily kódem 0, externí data nebyla dotčená. Potvrzuje to
potřebu odmítnout prošlé požadavky před zavedením úklidu; nejde o schválenou
implementaci retence. [Návrh a otevřené rozhodnutí](../reference/DATA_MODEL.md#retence-potvrzení-operací--ověřený-problém-a-další-návrh).

Živý průchod mazání je následně dokončený. Po zavření původní aplikace a
novém otevření vlastníkem (`722303372`) TestModerator uložil odstranění bez
postihu. REST ověření doložilo smazaný cíl, uzavřený report, právě jeden receipt,
správný actor/author a nezměněné ostatní parent fields; počet 3 → 2.
Ve stejné ručně ověřené kartě automatizovaně prošlo vlastní mazání TestBusiness
(2 → 1) i Bright_Otter_182 (1 → 0), vždy živě v otevřeném detailu bez reloadu.
Business u cizího komentáře neměl ovládání mazání; serverové odmítnutí cizího
autora pokrývá emulatorový test, nikoli živý pokus o podvržené volání.
HTTP log má úspěchy 200 v `17:02:17`, `17:05:57`, `17:07:39` UTC.
Každý ze tří cílů má právě jeden receipt a správný delete rate event.

Podmíněný úklid `17:08:02Z` ověřil nulové komentáře a nezměněný parent, poté
atomicky označil výhradně dočasný parent `deleted` a odstranil vyřešený
testovací report. Tři receipt a skutečné rate eventy ponechal zachované.
Ignorované důkazy: `comment-delete-live-state.json`, `comment-delete-http-proof.json`
a snímky `comment-delete-moderation-proof.jpg`, `comment-delete-business-proof.jpg`,
`comment-delete-personal-proof.jpg` v `build/`. Úplné zavření a otevření stránky
pomohlo této relaci; úplná příčina původní App Check chyby zůstává neurčená.
Vlastník také schválil 7denní okno opakování; 60denní retence účtu se nemění.

## Lokální příprava obsahových hlášení 29. října 2026

`functions/create_content_report.test.js` ověřuje pouze tři povolené druhy
cílů, odmítnutí podvržené identity, soukromého snapshotu, stavu, času a priority,
Unicode délku důvodu, Auth/App Check, očekávaný účet a hranice společného limitu
20/den s odstupem jedné minuty. Sedm scénářů v
`create_content_report.integration.test.js` ověřuje všechna tři stávající
schémata a ID, důvěryhodný soukromý snapshot jen pro příjemce, zákaz vlastních
hlášení a clearance, neexistující cíle, nezměněné čítače, souběh stejných i různých
klíčů, nezávislé reportéry, cooldown a sdílení report/bug-report bucketu, denní
reset a neplatné účty či poškozená data bez částečných zápisů. Replay po moderaci
nezmění uzavřený případ ani limit; replay po banu je odmítnutý. Receipt nekopíruje
soukromý text ani důvod hlášení. Testy běží jen v projektu `shoutout-rules-test`
s přesným lokálním emulator hostem; bez něj jsou integrační testy přeskočené.

`test/report_gateway_test.dart` pokrývá neměnný retry, změnu důvodu, rozlišení
cílů a účtů, sloučení rychlých odeslání, chybu sdílenou oběma volajícími a změnu
účtu/odhlášení. Klient odešle pouze cíl, důvod, očekávaný účet a klíč; nemůže dodat
autora nebo soukromý snapshot. Konfigurace v Dartu i Node testuje výchozí vypnutí,
booleany včetně odmítnutí explicitního null a samostatnou podmínku App Check.

Prošlo 189 Flutter testů, 32 Functions unit testů, lint Functions a 19 testů
vývojových nástrojů. Celá emulatorová sada prošla 111/111 (65 Rules + 46 serverových).
Prošly také analýza, formát a release build vývojového webu. Po sjednocení
validace typu přepínače byly cílené konfigurační testy i analýza/build opakované
úspěšně; šlo pouze o lokální přípravu, nikoli nasazení.
Lokální import callable ověřil region, provozní limity a odmítnutí chybějící
identity či App Check přes handler; autorizovaný report tok a moderační UI
zatím živě ověřené nejsou. Artefakt zahrnuje `create_content_report.js` a syntaxe
prošla. CI `40921153845` pro `79082d8` prošlo. Po souhlasu byla nasazená jediná
nová Function ve vývoji, revize `createcontentreport-00001-yas`; API potvrdilo
limity a HTTP požadavek bez App Check byl odmítnut 401. Aktivace
`be5a88f58cbf88870ac5f90a81f088660eebbdaa` prošla CI `40922593743` a je nasazená na
dev Hostingu jako `884138efa765d64a`, release `1793295581345000`, čas UTC
`2026-10-29T17:39:41.345Z`. Otisky HTML, JS i konfigurace souhlasí s lokálním
release buildem. Produkční konfigurace přepínač nezapíná. Kontroly konfigurace
po aktivaci prošly (14 Dart, 19 nástrojových).
Hlášení účtů a technických chyb zůstávají na současné cestě. Před nasazením
vyžadovat CI konkrétního commitu; souhlas s tímto vývojovým rolloutem, případy
v moderační frontě a úklidem vlastník výslovně udělil 29. října.

TestBusiness přes aplikaci vytvořil dočasný „MVP hlaseni 29.10.“; Bright_Otter_182
přidal „MVP report comment“ a zprávu „MVP report private“ pro TestBusiness.
Databáze potvrdila kanonické účastníky. Během přerušení Shout vypršel, ale
zůstal dostupný přes Mé shouty → Komentáře. První testovací hlášení 20:27 UTC
skončilo 401 a nevytvořilo report ani receipt. Log serveru potvrdil Auth VALID,
App Check MISSING; prohlížeč měl starší chyby reCAPTCHA. Vlastník byl požádán
o ruční Ctrl+R a stejné testovací hlášení. Příčina potíží reCAPTCHA není uzavřená,
ochrana se nevypínala. Ruční hlášení 20:38 UTC potom prošlo 200; databáze
potvrdila kanonický report, receipt, společný rate event, count 1 a nezměněný
parent. Původní automatická karta i další pokus v ní vrátily 401. Vlastník použil
jinou kartu; po převzetí právě této ručně ověřené relace prošel test duplicity
409 ve 20:41 UTC. Report, receipt i rate dokument zůstaly přesně stejné.
Příčinu chyb App Check v původní kartě to samo o sobě nevysvětluje; nezaměňovat
odmítnutí bez tokenu za ověření aplikačního limitu nebo duplicity.
Po ručním přihlášení TestBusiness prošlo hlášení komentáře 21:04 UTC (200,
kanonický report/receipt, count 1). Hlášení přijaté soukromé odpovědi před minutou
vrátilo 429 v 21:05 UTC; report ani receipt nevznikly a rate dokument zůstal
přesně stejný. Opakování v 21:06 UTC prošlo 200, count 2, `priority: high`,
autor i text odpovídají původní zprávě. Receipt neobsahuje důvod ani soukromý
text. Všechna hlášení zachovala celý parent dokument beze změny.
Lokální údaje TestModerator byly odmítnuté z nepotvrzené příčiny; vlastník se
přihlásil ručně. Moderační fronta zobrazila všechny 3 případy, každý 1× nahlášený.
Všechny detaily byly otevřené bez výběru rozhodnutí nebo uložení postihu.
Shout a komentář zobrazily správný obsah/autora, soukromý report správný text
a UID autora z důvěryhodného snapshotu. Stávající `_ReportDetailDialog` u
soukromého snapshotu nemá přezdívku, proto ukazuje „Neznámý (UID)“ a obecný
titulek Detail Shoutu; všechny testovací cíle mají „Region není doplněný“.
Jde o dosavadní UI/datová omezení, nikoli opravu provedenou tímto rolloutem
(soubor moderation.dart se nezměnil). Návazné geografické a moderační milníky
zůstávají otevřené. Nevykazovat nové hlášení jako vyřešení těchto omezení.

Úklid ověřil shodu dokumentů, jejich verze a absenci nesouvisejících interakcí.
Jedním atomickým commitem odstranil 7 testovacích dokumentů (3 reporty,
komentář, soukromá odpověď a 2 notifikace) a dočasný Shout označil `deleted`
s commentsCount 0. API potvrdilo odstranění všech 7 dokumentů a zachování
3 report receipt. Fronta se bez obnovení změnila na „Žádná otevřená hlášení“.
Nebyl uložen postih, rozhodnutí ani změna role; produkce, main a Rules zůstaly
beze změny. Toto vývojové ověření je dokončené; obecná serverová brána zatím ne.

## Lokální příprava serverových reakcí 26. října 2026

Lokální příprava serverových reakcí na Shouty (26. října):
`test/reaction_gateway_test.dart` pokrývá nejasný retry se stejným klíčem,
nový klíč po úspěchu nebo definitivním odmítnutí, pořadí při změně palce,
sloučení souběžných kliknutí, nezávislé cíle a účty a změnu účtu před retry
i během něj. Functions test kontroluje očekávaný účet před přístupem k DB;
emulátor prověřuje úspěšnou akci s tímto polem. Konfigurační testy Dart i Node
ověřují výchozí vypnutí, typ přepínače a povinný App Check.
Schválený vývojový rollout klienta `eea077a` prošel CI `40405135293` a byl
nasazen jako Hosting verze `a03706f90b97706c`; otisky tří hlavních souborů
odpovídají release buildu. Function `toggleshoutreaction-00001-lek` je aktivní
se schválenými limity. Požadavek bez App Check vrací 401. Automatická relace
nejprve hlásila `appCheck/recaptcha-error`; první pokus nevytvořil receipt.
Po ručním ověření vlastníkem prošlo přidání, změna i odebrání běžným účtem
na uchovaném Test Shoutu a Business účtem na novém dočasném Shoutu. Šest
receipt, serverové čítače a rate eventy odpovídají šesti akcím. Realtime stav
byl ověřen v seznamu i otevřeném detailu; vlastní reakce neoznámila autora
sobě, Business reakce vytvořily dvě kanonická oznámení autorovi. Obě reakce
jsou odstraněné, čítače na výchozí nule, dvě čistě testovací notifikace byly
odstraněné a dočasný Shout je `deleted`. Původní Test Shout byl zachovaný,
receipt se nemažou (retence je otevřená). Reálný výpadek s nejasným potvrzením
ani živý souběh nebyly simulované; ty pokrývají automatické testy.
HTTP odpověď obsahuje historické čítače a klient ji musí ignorovat.
Lokální výsledek úseku: 167 Flutter testů, čistá analýza a formát, Functions
lint a 24 unit testů, 90 emulatorových testů (65 Rules + 25 serverových),
10 testů webových nástrojů a úspěšný vývojový release build webu.

## Lokální serverové reakce na komentáře 26. října 2026

`functions/toggle_comment_reaction.test.js` ověřuje striktní vstup a kontrolu
identity před přístupem k databázi. Sedm scénářů v
`functions/toggle_comment_reaction.integration.test.js` ověřuje přidání,
změnu a odebrání, zachování textu i rodičovských čítačů, kanonické oznámení
autorovi komentáře, souběh a idempotenci, odlišné receipt namespace při
sdíleném limitu s reakcemi na Shout, preference, vlastní reakce, poškozená
data a nedostupné cíle bez částečných zápisů. Replay neobchází ban a vrací
historický snapshot, který si klient nesmí promítnout zpět do UI. Uchované
neaktivní Shouty a omezení tvorby obsahu zachovávají dosavadní interakční politiku.
Lokálně prošel lint, 26 Functions unit testů a 97 emulatorových testů
(65 Rules + 32 serverových), příprava artefaktu a kontrola syntaxe.
Navazující klient používá sdílený `ReactionGateway` s klíčem UID/Shout/komentář.
Testy navíc ověřují izolaci různých komentářů a Shoutu, souběžné kliknutí
a klasifikaci skutečných `FirebaseFunctionsException`: transportní chyby
drží klíč, definitivní odmítnutí dovolí nový pokus. Celkem prošlo 171 Flutter
testů, čistá analýza, formát, 17 testů vývojových nástrojů a vývojový release
build webu. CI serverové části
`40407708443` i klienta `40408691708` prošla. Nová Function je po souhlasu
ve vývoji `ACTIVE`, revize `togglecommentreaction-00001-dit`, se schválenými
limity. `serverCommentReactions` má výchozí `false`; dev konfigurace zapíná
schválenou aktivaci, produkční nikoli. CI aktivace `40409557055` prošlo;
klient `45a5d02` byl nasazen jako Hosting verze `3fc2f80232d34ff3`, otisky tří
hlavních souborů odpovídají release buildu. Testovací komentář vznikl přes
`createComment` pod dočasným Business Shoutem. Autorský i cizí cyklus nahoru
→ dolů → odebrání prošel kontrolou šesti receipt, limitů, časů, čítačů a
zachování textu. Vlastní reakce neoznámily autora sobě; cizí vytvořily dvě
kanonická oznámení s cílem komentáře. Úklid odstranil komentář a dvě čistě
testovací notifikace, rodiče označil `deleted` a zachoval šest receipt.

Externí odstranění komentáře odhalilo rozdíl mezi hlavičkou Komentáře (0)
a starou jedničkou u ikony na kartě. `test/live_shout_state_test.dart`
ověřuje společný realtime zdroj čítačů včetně externího 0 → 1 → 0, počty
73 → 72 nezávisle na limitu zobrazených komentářů, nezávislou vlastní reakci
a ukončení obou odběrů. Oprava nepřičítá lokální jedničku ani neaplikuje starší
výsledek mazání, pokud je zapnuté live zobrazení. Prošlo 173 Flutter testů,
čistá analýza, formát, release build a CI `40411478509`. Oprava `987398f`
byla nasazená na vývojový site jako verze `a6756b787e4655de`; hlavní otisky
souhlasí s buildem. Na novém dočasném Shoutu byl živě ověřen začátek 0,
serverové vytvoření jediného komentáře a ikona i hlavička 1, následně externí
atomické smazání komentáře a dekrement parentu na 0. Bez návratu nebo obnovy
stránky se oba počty změnily na 0. Nedošlo k dvojímu lokálnímu přičtení.
Dočasný Shout byl poté smazaný přes UI a databáze potvrdila `deleted`, nulový
čítač, nepřítomnost komentáře a zachování obou create receipt. Produkce,
`main`, Rules ani Functions se při této opravě neměnily.

## Lokální klient ukládání Shoutů 29. října 2026

`test/save_gateway_test.dart` pokrývá ztracené potvrzení se stejným neměnným
klíčem, nový klíč po potvrzení nebo definitivním odmítnutí, transportní chyby,
sloučení rychlých kliknutí včetně chyby sdílené oběma volajícími, nezávislé cíle,
změnu účtu a odhlášení. `test/live_shout_state_test.dart` navíc ověřuje samostatné
změny vlastní záložky a celkového počtu od dalších účtů a ukončení všech tří
odběrů. Detail používá tyto live hodnoty, nikoli historický výsledek callable.
Testy konfigurace v Dartu i Node ověřují výchozí vypnutí `serverShoutSaves`,
boolean typ a nezávislou podmínku App Check.

Prošlo 181 Flutter testů, čistá analýza a formát, 18 testů vývojových nástrojů,
Functions lint a 29 unit testů, 104 emulatorových testů (65 Rules + 39 serverových)
a release build webu pro dev. Příprava artefaktu zahrnuje `toggle_shout_save.js`;
syntaxe prošla. Lokální import callable exportu ověřil region, limity a odmítnutí
Auth/App Check přes handler bez databázového zápisu. Lokální prostředí použilo
Node 24.13.1; CI používá podporovaný Node 22.
CI `40914821162` pro `5fceccb` prošlo. Po souhlasu byla nasazená pouze Function
do vývoje, revize `toggleshoutsave-00001-fal`. Její limity byly ověřené přes API
a skutečný HTTP požadavek bez App Check byl odmítnut 401. Aktivační commit
`02b8b2846c6b4488188e1f58f84fb06db3320e52` prošel CI `40916381788` a byl nasazený
jako Hosting verze `8abd91f97aada32f`, release `1793293260043000`. Otisky tří
hlavních souborů souhlasí; přepínač je zapnutý pouze ve vývojové konfiguraci.
Dosavadní provozní revize ostatních Functions se nezměnily.

Běžný účet uložil vlastní uchovaný Test Shout v seznamu (0 → 1), poté jej odebral
v otevřeném detailu bez obnovení; seznam i databáze potvrdily návrat na 0.
TestBusiness uložil cizí dočasný aktivní Shout, ověřil jeho přítomnost ve
Sledované → Shouty a odebral jej přímo v detailu. Tlačítko se živě přepnulo zpět
na Uložit a položka zmizela ze seznamu uložených. Čtyři nové receipt odpovídají
čtyřem akcím, výsledkům, časům záložek a `lastAt`/`lastEventId` ve společném
interaction bucketu; ostatní pole Shoutů se nezměnila. Živý souběh, nejasný retry
a vyčerpání hodinového limitu nebyly simulované; pokrývají je automatické testy.
Lokálně evidované Business přihlášení bylo odmítnuté z nepotvrzené příčiny,
vlastník se přihlásil ručně; žádné heslo ani ochrana se neměnily.
Úklid ověřil nepřítomnost obou záložek a nulové čítače, původní Test Shout
zachoval a dočasný „MVP ukladani 29.10.“ označil `deleted` s kontrolou aktuální
verze dokumentu a prázdných podkolekcí. Čtyři receipt zůstaly zachované.
Produkce, `main` a Rules se nezměnily.

## Lokální serverová logika ukládání Shoutů

`functions/toggle_shout_save.test.js` ověřuje striktní vstup, Auth/App Check,
ověřený e-mail a očekávaný účet před přístupem k databázi, přesné přechody
uložit/odebrat a neplatné čítače. Sedm scénářů v
`functions/toggle_shout_save.integration.test.js` ověřuje atomický celý cyklus,
historický replay bez dalšího přepnutí nebo čerpání limitu, ban při replay,
konflikt klíče s jiným cílem, souběžná opakování, odlišné aktéry, společné
limity s reakcemi při nezávislém namespace receipt, chybná data a účet bez
částečných zápisů, reset hodinového limitu a zachování interakční politiky.
Lokálně prošel Functions lint, 29 unit testů a 104 emulatorových testů
(65 Rules + 39 serverových). Nové scénáře jsou součástí CI přes `test:rules`.
Testy používají pouze lokální projekt `shoutout-rules-test`. Klientské,
callable a živé ověření nejsou součástí tohoto omezeného úseku.

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

`functions/toggle_shout_reaction.test.js` testuje přechody přidat/změnit/odebrat,
odmítnutí podvržených polí a existující limit 120/h s odstupem 1 s. Šest scénářů
v `toggle_shout_reaction.integration.test.js` běží pouze v izolovaném emulatoru
`shoutout-rules-test` na `127.0.0.1:8080`: souběžná retry, starý retry po novější
akci, více aktérů nad jedním Shoutem, společný interaction limit, atomické čítače
a oznámení, preference a poškozená data. Ověřují také zachování současné politiky
pro omezení tvorby obsahu a uchované neaktivní Shouty. Bez emulatoru jsou
integrační testy přeskočené. Prošlo 23 unit testů Functions, lint a všech 90
emulatorových testů (65 Rules + 25 serverových). Klient ani nový callable zatím neexistují;
živé ověření reakcí tímto krokem není prokázané.

`functions/create_private_reply.integration.test.js` přidává osm scénářů pro
všechny tři druhy cílů, kanonické identity (včetně Business pobočky), ověření
účastníků, cizí Shout, souběžná retry, cooldown, preference a slučování
oznámení, neaktivní cíl, poškozená data a blokované účty. Soukromý text nesmí
být v receipt ani v oznámení a veřejný čítač nesmí být změněn. Retry po smazání
výsledku jej neobnovuje. Nový Rules scénář kontroluje čtení serverového formátu
oběma účastníky a zamítnutí třetího účtu i enumerace celé kolekce. Receipt nemůže
číst ani autor zprávy. Lokálně prošlo celkem 84 emulatorových testů, 20 unit
testů Functions, 158 Flutter testů, lint, analyzátor a 9 testů webových nástrojů.
Nová callable je po samostatném souhlasu nasazená pouze ve vývoji jako
`createprivatereply-00001-baw`; klient `9545946` má přepínač ve vývoji zapnutý.
CI implementace `40359475834` a aktivace `40360446321` prošlo.
Živý průchod 26. října prošel dvěma účty pro Shout, komentář i pokračování
přijaté soukromé zprávy v opačném směru. Firestore potvrdil serverová ID,
kanonické identity, účastníky, receipt, limit a správná oznámení bez privátního
textu. Příjemce viděl zprávu i akci odpovědi. Regresní přepnutí ze soukromé na
veřejnou odpověď vytvořilo veřejný komentář a žádnou soukromou kopii textu.
Po ověření se v jediné transakci odstranilo pět testovacích obsahových dokumentů
a čtyři oznámení, jejichž přesný počet událostí, poslední cíl, autor i čas
odpovídaly výhradně fixture. Čtení potvrdilo smazání, zachovaný původní Shout
a nulový čítač; feed následně také ukázal nulu. Receipt se kvůli idempotenci
nemažou. Živý test třetího účtu není provedený; odmítnutí cizího čtení a
enumerace soukromých zpráv je potvrzené emulatorovými Rules testy.

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
Oprava `4a1a7a0` prošla 156 Flutter testy, analyzátorem, release buildem a CI
`40355266790`; vývojové nasazení odpovídá lokálním otiskům. Automatizované
opakování živého scénáře 26. října se nedokončilo a nevytvořilo komentář;
start nové relace zaznamenal `appCheck/recaptcha-error`. Vlastník následně
ručně potvrdil přechod čísla na kartě 0 → 1 → 0 ve stejném otevřeném detailu
bez návratu na feed. Oprava UI je tedy živě ověřená uživatelským průchodem.

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

## A0 – plný obsah Shoutu v detailu (31. října 2026)

Lokálně prošlo všech 204 Flutter testů a `flutter analyze` bez nálezu.
Dva nové widget testy ověřují dlouhý nadpis/text na šířce 360 při měřítku
písma 1× a 2×, konec textu, scrollování a callbacky reakcí/soukromé odpovědi.
Existující test zachovává omezení náhledu ve feedu na 2/3 řádky.
Nejde o živý test přihlášení, serverových komentářů ani App Check.
Nasazení je podmíněné CI přesného commitu; produkce se nemění.

## A1 – lokální prototyp feedu (31. října 2026)

Node 22.23.4: deset testů `tools/feed_prototype.test.mjs` prošlo.
[Úplné výsledky a neověřené oblasti](../plans/feed/FEED_A1_RESULTS.md). Prototyp je součástí
`test:tools`, neběží v aplikaci ani ve Functions a nepřistupuje k Firebase.

### A0 – doložený vývojový rollout

Čistý commit `b56fbbe17c98da489f5cadbcc387f52d10205017`, CI
[41189106879](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41189106879) success.
Release build prošel kontrolou prostředí. Pouze DEV Hosting `shoutout-dev-46c81`:
verze `8a42571a4073ed7f`, release `1793439504594000`, čas 2026-10-31T09:38:24.594Z.
Veřejné index.html, main.dart.js a app-config.json mají shodné SHA-256 s manifestem.
Functions, Rules a produkce se neměnily. Bezpečný návrat: předchozí timed klient
`079d053`, Hosting `02cdb989d4f18ee2`; nevracet legacy klíče po cutoveru.
Živý ruční průchod dlouhým Shoutem nebyl proveden; plný obsah a dostupnost ovládání
ověřují widget testy, nikoli tato kontrola přenosu artefaktů.

## Progresivní feed – lokální stavební bloky (31. října 2026)

- Flutter: 212 testů prošlo; osm nových testů `test/feed_session_test.dart`
  ověřuje jednu připravenou stránku, deduplikaci, retry, atomickou obnovu,
  staré odpovědi, checkpoint novinek, lifecycle a vymazání dat při dispose.
- `flutter analyze`: bez nálezu. Formátování nových Dart souborů prošlo.
- Dvanáct nových serverových unit testů: geometrie a stránky proti referenci,
  unread-first, dateline/póly, omezené dávky, retry a pevný snapshot v adaptéru.
- Izolovaný Firestore emulátor `shoutout-rules-test`: test
  `functions/feed_spatial.integration.test.js` prošel. Mezi dotazy se změnil
  createdAt původního záznamu a přibyl další; pinned read vrátil původní stav.
  Test je přidaný do standardního `tools` skriptu `test:rules` a následného CI.
- Žádný nový query callable, živé kolekce, Rules, backfill ani Hosting rollout.
  Neověřeno: zapojení Home/FeedPage a scrollu, živá Auth/App Check regrese,
  osobní synchronizace, polling, serverová retence relací, náklady a latence cloudu.

[Doložená práce a zbývající nákladový problém](../plans/feed/FEED_PROGRESSIVE_PLAN.md).
Samotné rozšiřování rozsahů může stále načíst celé husté okolí; není doložená
univerzální úspora ani hotový MVP milník. Před živým napojením vyřešit další
indexovou vrstvu a její aktualizační náklady.

## Sdílený prostorový index – pouze lokální experiment (31. října 2026)

- Node 22.23.4: deset nových unit testů prošlo; celá Functions sada 66 unit
  testů bez chyb, 74 emulator-only testů při tomto běhu přeskočeno. Lint čistý.
- Devět nových integračních testů v izolovaném Firestore emulátoru prošlo:
  výběr a všechny stránky ve čtyřech režimech, cold/warm cache a reálné počty
  SDK operací, rollback, souběh, staré kořeny, dostupnost/expirace, změna oblastí
  jako technický test, změněné bloky/reakce vs publikace a poškozený payload.
- Paměťový test 10 000 malých metadat: 497 bloků / 2 955 200 B, druhý průchod
  bez missů. Tento test nevytvořil 10 000 Firestore příspěvků.
- Testy jsou zahrnuté v běžném CI (`functions` a `tools test:rules`). Flutter
  soubory se neměnily; jejich kontrola proběhne standardní sadou CI tohoto commitu.
- Žádné živé kolekce, backfill, pravidla/indexy, Functions exporty ani Hosting.
  Adaptér vyžaduje přesný testovací projekt a emulator host; fixture namespaces
  se po zkouškách uklidily. Skutečné index entries, cloudová latence a finální
  poplatky nejsou ověřené, protokol historie/GC není implementovaný.

[Úplný model a migrační předpoklady](../plans/feed/FEED_BLOCK_INDEX_PLAN.md),
[naměřená data](../benchmarks/FEED_BLOCK_INDEX_2026-10-31.json).
