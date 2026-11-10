# Trvalá instalace a zapojení prostorového feedu

6.–7. listopadu 2026. Lokálně dokončeno na `feature/feed-page-integration` podle pokynu
vlastníka připravit konečné řešení použitelné také pro produkci. Tento dokument
popisuje řešení a kontrolní brány. Živý DEV přechod 7. listopadu je doložený
v [záznamu níže](#dev-rollout-results); původní přípravná měření jsou historická.
Aktuální nasazení dokládá [PROJECT_STATUS](../../PROJECT_STATUS.md).

## Co se připravuje společně

- `getFeedPage`: Auth, ověřený e-mail, App Check, právní souhlas, blokace účtu
  a probíhající mazání. Kurzory jsou svázané s uživatelem, projektem, kontextem,
  časem snapshotu a inkarnací generace. Stránka vrací nejvýše 50 plných karet;
  pracovní pokračování není falešný konec seznamu. Řazení provádí server.
- Home: stabilní stránky, přednačtení před koncem, připojení další dávky, ruční
  obnova. Chyba obnovy ponechá původní karty i pozici. Změna filtrů se potvrdí
  až úspěšným načtením. Poloha se v otevřené aplikaci může použít poslední známá
  s upozorněním; chybějící poloha neblokuje ostatní sekce.
- `getSavedShouts`: vlastní záložky po nejvýše 50, nezávisle na nedávném nebo
  prostorovém feedu. Kontrola vlastníka, dostupnosti zdroje, blokací a smazaného
  autora. Čtení je samostatné; oprávnění klientského seznamu `saves` se neotevírá.
- Viditelné prostorové/uložené karty mají vlastní omezené odběry obsahu,
  počtů, reakce a záložky. Aktualizace nepřerovnávají stabilní feed; odchod
  karty odběry ukončí. Spotlight a dosavadní osobní sekce zůstávají kompatibilní.
  Jejich původní dotaz na posledních 50 není zdroj nového hlavního feedu.
  Kontrola 7. listopadu zjistila existující omezení **Mé shouty**: původní
  `Home._startFeedListeners` dotazuje jen posledních 50 globálních aktivních
  zdrojů, i v předchozím `77d0f15`. Nezaručuje vlastní historii a po serverové
  materializaci expirace ji nemůže zobrazit. Samostatný úplný vlastní zdroj
  Aktivní/Expirované je evidovaný v [otevřené akceptaci](../../BACKLOG.md#feed-read-refresh)
  a zbývá před veřejným MVP; tato integrace ho nevydává za hotový.
- Společný minutový worker vybírá nejvýše jeden indexový úsek: pokračování
  rozpracovaného výmazu, novou časnou úlohu nebo běžný úklid historie. Zachovává
  32 kroků / 10 s mezi transakcemi, jednotlivé dávky 32 čtení / 16 mazání,
  lease 120 s a retry nejdříve za 60 s. Původní obsahová dávka nejvýše 50 se
  nezvětšuje. Konečný purge při chybějícím dokladu pouze obnoví časnou práci,
  nespouští vedle ní druhý úplný indexový průchod.
- Běžný GC má restartovatelný checkpoint bez těl příspěvků. Destruktivní
  transakce ověřují lease, inkarnaci generace, aktuální kořen a retenční fence.
  Starší hodinové snapshoty chrání skutečný serverový čas vytvoření historie,
  nikoli klientem zadaný `retiredAt`. Poškozený/velký checkpoint vede na kontrolu,
  nikoli k neomezenému či neověřenému mazání.

Kód používá stejné rozhraní a cesty v DEV i produkci. Vlastník 7. listopadu
schválil celý živý DEV přechod a testy. Připravovaný aktivační commit zapíná
společný runtime a DEV `serverSpatialFeed`, produkční klientská konfigurace
zůstává vypnutá. Samotná příprava přepínačů není živé nasazení.
Přečtení a indikátor B1–B4 nejsou touto integrací dokončené. Před MVP dál platí
[celý schválený rozsah](FEED_IMPLEMENTATION_STAGES.md#aktualni-stav).

## První instalace bez aktivních zdrojů

Read-only kontrola DEV v tomto úseku naměřila 37 Shoutů a **0 se statusem
active**, bez řídicího dokumentu a generace. To dovoluje standardní instalaci
prázdného indexu; nepotřebujeme kvůli tomu migrovat expirovaný testovací obsah.
Před použitím se stav ověřuje znovu v transakci. Stejný postup platí pro první
produkční instalaci, pouze pokud také splní tento předpoklad.

`tools/feed_empty_bootstrap.mjs` má oddělené příkazy:

1. `plan`: pouze čte; vytvoří lokální JSON s projektem, generací a SHA-256.
2. `initialize`: při potvrzeném digestu atomicky založí `feedIndexControl/current`
   v režimu `off` a vlastní doklad `feedIndexMaintenance/bootstrap`.
3. `activate`: po doloženém přechodu všech writerů atomicky založí generaci,
   aktivační doklad a nastaví reader/writer. Najde-li jakýkoliv aktivní zdroj,
   cizí konfiguraci či konflikt, zastaví se bez částečné instalace.
4. `pause` / `resume`: mění pouze dostupnost čtení, writer i generaci zachovají.
5. `status`: jen čte aktuální režim a vlastní instalační doklad.

Opakování po ztracené odpovědi ověřuje původní vlastnictví a inkarnace. Shoda
`serverTimestamp()` s `createTime` není použita jako důkaz identity: generace
a její aktivační doklad vzniknou jako nové dokumenty ve stejné transakci.
Nástroj nekopíruje, neskrývá ani nemaže žádný zdrojový Shout. Není obecná
migrace existujícího aktivního datasetu; pokud takový dataset najde, je nutný
samostatný prověřený migrační plán. Nástroj nesmí tento stav obejít.

Každá mutace vyžaduje přesný cílový projekt, opakované potvrzení projektu,
schválený digest, čistý Git a dokončené úspěšné `Flutter checks` pro právě
spouštěný commit. Produkce navíc vyžaduje `main` a shodný tag `vX.Y.Z`.
CLI tyto podmínky kontroluje; skutečné revize nasazených Functions/Rules,
obsah schválení a startovní bránu ověřuje operátor podle
[RELEASING](../../operations/RELEASING.md). CI není důkaz nasazení.

## Připravený sled živého DEV přechodu

Základ přechodu je zdroj **25a3f92f565bde633844214cca8419fc3053b094**, ověřený
[success CI 42356245115](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42356245115).
Před novou datovou vrstvou a tajemstvím předložit tento připravený celek
vlastníkovi. Následné aktivační commity také potřebují vlastní úspěšné CI.

Read-only plán pro DEV `feed-v1` je připravený v ignorovaném
`docs/local/migrations/feed-bootstrap-shoutout-dev-46c81-feed-v1.json`,
digest `4b0bb8b50864d26469e02ab473b4c83a44681464f77c8d12787adab6cec24fec`.
Jeho vytvoření provedlo **0 databázových zápisů**; kontrolu aktivních zdrojů
opakují instalační transakce. Žádný mutační příkaz zatím nebyl spuštěný.

| Krok | Cíl a kontrola |
|---|---|
| 1 | Pouze `shoutout-dev-46c81`: read-only inventura, plán `feed-v1`, kontrola absence aktivních zdrojů a cizího indexu. |
| 2 | V témže projektu vytvořit `SHOUTOUT_FEED_CURSOR_KEY`: náhodných 32 bytů v kanonickém base64. Hodnotu neukládat do Gitu/logů ani použít mezi projekty. Deklarace v kódu toto tajemství dosud nevytvořila. |
| 3 | Cíleně doplnit pět složených indexů a pět výjimek níže; počkat na připravenost. Nenasazovat naslepo celý indexový soubor nebo cizí TTL změny. |
| 4 | Nasadit ověřené Rules. Jejich nová podmínka zatím nic neuzavírá, dokud neexistuje řídicí dokument. |
| 5 | `initialize` podle schváleného digestu. Přítomnost řídicího dokumentu uzavře přímé vytváření Shoutů a zápisy jejich reakcí/počtů; serverové operace fungují dál. Čtení, komentáře a ukládání se tím nemění. |
| 6 | Z přesného navazujícího CI commitu zapnout společný runtime a aktualizovat všechny relevantní obsahové writery a účtový worker; nasadit oba čtecí endpointy. Klientský feed zůstává vypnutý. |
| 7 | Ověřit skutečné revize, úplnost writerů a odmítnutí přímých zápisů. Nechat doběhnout staré revize podle jejich timeoutů. Samotná deklarace nasazovacího commitu tuto kontrolu nenahrazuje. |
| 8 | `activate` provede atomickou poslední kontrolu prázdného aktivního zdroje. Pokud mezitím někdo publikoval, zastavit a nově vyhodnotit stav; žádné tiché smazání, skrytí ani backfill. |
| 9 | Ze stejného otestovaného aktivačního commitu teprve nyní nasadit Hosting site `shoutout-dev-46c81` s `serverSpatialFeed` zapnutým jen pro DEV. Ověřit skutečný build a oba typy účtů. |

Složené indexy: `cells(latCell,lonCell)` collection;
`jobs(phase,retainUntil,nextAttemptAt)` collection;
`targets(epoch,complete)` collection;
`retiredRoots(kind,retiredAt)` collection group;
`gcJobs(kind,phase,nextAttemptAt)` collection group. Pole ve vzestupném pořadí;
standardní `__name__` navazuje. Výjimky bez indexace:
`nodes.rows`, `nodes.children`, `nodes.summary`, `gcJobs.checkpoint`,
`cells.frontier`. Žádný nový TTL ani nová služba/Scheduler.

Živý test má po schválení založit 120 syntetických testovacích Shoutů v určeném
okolí pod existujícími testovacími identitami, nikoli nový reálný účet. Ověřit
50 → 100 → 120, žádné duplicity/skoky, nové bližší až po obnově, kategorii,
radius, Top/Končící/Sledované, uložení staršího Shoutu, reakci a smazání,
blokace, chování bez polohy a při chybě. Testovací obsah odstranit serverovou
cestou, nikoli přímým mazáním zdrojů mimo writer. Přesnou polohu/identitu,
datový rozsah, úklid i konečný stav doložit před živým provedením.

## Návrat a co ještě není doložené

- Před aktivací lze ponechat starý web. Po aktivaci při problému pozastavit
  reader a vrátit pouze kompatibilní web; společné writery, časný úklid a GC
  musí zůstat zapnuté. Nevracet samostatně staré Functions bez writeru a
  nemažeme generaci, řídicí dokument ani ochranné Rules.
- Podpisový klíč je pro jeden projekt a současná verze nepodporuje překryv
  rotace klíčů. Změna klíče zneplatní staré kurzory a vyžádá obnovu.
- Výsledky emulátoru nedokládají cloudovou latenci, skutečné index entries,
  provozní cenu nebo kapacitu jednoho volání. První stránka má pracovní limit
  32 uzlů na serverový krok a klient nejvýše 32 pokračování na načtení dávky;
  překročení je chyba, nikoli neúplný feed. Živý průchod musí tyto meze změřit.
- Nedokončené B1–B4 a ostatní serverové/startovní brány dál blokují veřejné MVP.
  Podpora produkčního project ID v kódu není produkční nasazení ani schválení
  jeho parametrů. Produkci připravit stejným postupem až podle ověřeného DEV
  výsledku a [startovní brány](../../LAUNCH_READINESS.md).

## Ověření této implementace

První úplné CI `42305776552` pro `cc262af` selhalo: pět instalačních případů
správně odmítlo aktivní fixture předchozích sad a Business branch průchod
překročil limit 1 000 výrazů Rules. Instalační sada nyní před spuštěním resetuje
výhradně doslovný lokální emulátorový projekt; živé instalační kontroly se
neoslabují. Rules opakovaně používají tentýž ověřený role/profile snapshot,
se stejnými podmínkami. Navazujících 92/92 lokálních regresí včetně Business,
instalace a uzavřených zápisů prošlo (`build/feed-install-rules-regression.log`).
Nové CI musí ověřit přesný opravený commit; první běh není release důkaz.

7. listopadu: také CI `42306973622` pro `7832379` odmítlo dva platné Business
průchody při přístupu k pobočce. Navazující oprava sjednocuje `hasProfile` a
kontrolu kanonických údajů na datový `get`, sdílí `getAfter` rate dokumentu a
ověřovaná data/klíče. Povinná pole firmy/pobočky dál odmítají neexistující
dokumenty bez nadbytečného `exists`. Regrese kontroluje správné názvy poboček
i chybějící firmu/pobočku a výslovně zachovává původní zákaz bez profilu
i původní čtení s existujícím prázdným profilem. Výsledek **93/93** v
`build/feed-business-gates-final.log`. Samostatně předtím 83/83 v
`build/feed-business-profile-cache.log`; dřívější neúspěšné varianty zůstávají
jen diagnostické logy. Pro limity přístupů nelze předpokládat, že se všechny
`exists/get/getAfter` navzájem cachují:
[oficiální podmínky a limity Rules](https://firebase.google.com/docs/firestore/security/rules-conditions#access_call_limits).
Read-only DEV inventura byla dnes opakovaná: stále 37 / 0 active, bez control
a generace. Nové živé zápisy neproběhly.

Konečné **success CI 42356245115** pro přesný zdroj
`25a3f92f565bde633844214cca8419fc3053b094`: 305 Flutter, 50 tools,
118 Functions unit (397 integračních případů v této ne-emulátorové sadě
přeskočeno), 421 Rules/server, 116 purge a 15 Storage. Formát, analýza, lint,
dokumentace a DEV web build prošly. Samostatný nový start Business sady
potvrdil 16/16 (`build/feed-business-cold-repeat.log`). Oba připravené balíčky
mají shodné zdroje a exporty s commitem (41 modulů content / 37 účtového
workeru). Strojové důkazy: `build/feed-page-ci-proof.json`,
`build/feed-page-ci-final.{json,log}`, `build/feed-page-artifact-proof.json`.
Metadata klíče byla přečtena bez přístupu k hodnotám: HTTP 404 / neexistuje
(`build/feed-key-metadata-readonly.json`). Indexový read-only plán obsahuje
přesně 5 složených indexů a 5 výjimek, bez TTL; jeho lokální digest je
`6c03d3a6cbb8e18f01dde4b109a698e0d97b7a071773f1544a0d87d5f3ca9591`
(`build/feed-index-readonly-plan.json`). Před aplikací tyto metadata znovu ověřit.

Produkční nasazení potřebuje vlastní konfiguraci účtového wrapperu, který je
dosud výslovně chráněný pro DEV; společné jádro nepotřebuje jiný datový model.
Uzavření přímých create/vote Rules platí pro všechny klienty. Aktuální web má
serverové cesty, ale staré/nativní DEV buildy s přímými zápisy po přechodu tyto
akce neprovedou. Mobilní distribuce a nativní App Check patří podle rozsahu
MVP do samostatného navazujícího plánu; tuto podmínku uvést před živým přechodem.

Průběžné lokální důkazy: 38/38 společných serverových regresí
(`build/feed-start-maintenance-final.log`), 8/8 instalace a uložených Shoutů
(`build/feed-saved-bootstrap-final.log`), předchozí 4/4 checkpoint testy a
úspěšná Rules regrese v `build/feed-start-maintenance-initial.log` (celý první
průchod měl tři instalační/testovací chyby, které byly opravené; není vydáván
za úspěšnou celkovou kontrolu). Konečné CI je doložené výše.
Žádné živé zápisy, tajemství, nasazení nebo nové Auth účty v této přípravě.

<a id="dev-rollout-results"></a>

## Živý DEV přechod 7. listopadu 2026

Vlastník výslovně schválil popsanou novou datovou vrstvu, klíč, Rules,
aktivační rollout i 120 syntetických Shoutů pod existujícími testovacími
identitami. Nezahrnuje produkci, main ani nové/mazané Auth účty.

Původní zdroj 25a3f92 a CI 42356245115 zůstávají důkazem společné přípravy
(305 Flutter / 50 tools / 118 Functions unit / 421 Rules-server / 116 purge /
15 Storage), včetně 93 lokálních Business regresí a 16 při studeném startu.
Aktivační a9a3b41 byl zrušený kvůli neizolovaným testovacím konfiguracím;
7d0b167 odhalil ještě dvě obdobné závislosti mazací politiky. Opravy izolují
volitelné testovací přepínače, neoslabují závislosti skutečné konfigurace.
Aktivace se provedla až z čistého zdroje
**ccc879f485caa24374cadc1dba49ddcec50a4a95** po
[success CI 42358058964](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42358058964).
Úplné lokální regrese mají 305 Flutter / 50 tools / 118 Functions unit;
logy `build/feed-activation-{flutter,tools,functions}-all.log`.

Provedeno a ověřeno:

- Nový projektový Secret Manager klíč, verze 1, náhodných 32 bytů
  v kanonickém base64; hodnota nebyla vypsaná ani uložená do souboru/Gitu.
  První metadata před vytvořením vracela 404. API vrací kanonickou cestu
  s číslem projektu; po vytvoření resource se proto nejprve ověřilo jeho
  vlastnictví a absence verzí, poté se vytvořila a v paměti ověřila verze 1.
  Důkaz `build/feed-secret-created-proof.json` obsahuje jen metadata/otisk.
- Přesně pět složených indexů READY a pět výjimek, TTL beze změny.
  `build/feed-index-apply-proof.json`; původní schválený read-only plán je
  zachovaný jako `build/feed-index-approved-plan.json`.
- Rules ze zdroje 25a3f92, ruleset `832178f3-e140-47c8-852b-425e16c475af`,
  obsahově porovnané přes Rules API (`build/feed-rules-deployed-proof.json`).
- `initialize` podle schváleného digestu nejprve nastavil off a uzavřel přímé
  create/vote zápisy. Následovalo osm Functions ze zdroje ccc879f; všechny
  ACTIVE, max1/concurrency1/256 MiB, min0; callable 15 s, účtové 60 s.
  Stažené nasazené archivy mají shodné skutečné moduly (41 obsahových /
  37 účtových) s čistou release kopií. Důkazy
  `build/feed-active-artifact-proof.json`, `build/feed-functions-after.json`,
  `build/feed-deployed-source-proof.json`. CLI přidělilo runtime service account
  přístup k tomuto tajemství; reader používá verzi 1.
- Po ověření revizí a doběhnutí starých timeoutů proběhl atomický `activate`:
  `feed-v1` active, read/write generace shodná. Logy
  `build/feed-initialize-proof.log`, `build/feed-activate-proof.log`.
- DEV release web je Hosting verze `428dd3e025e17023`, vydaná
  7. listopadu 09:17:29 UTC. Index, main.dart.js, bootstrap i veřejná konfigurace
  na web.app odpovídají SHA-256 manifestu čistého sestavení; DEV prostorový
  přepínač true. Důkaz `build/feed-hosting-live-proof.json`.
- Stávající minutový Scheduler zůstal ENABLED s původním rozvrhem. Nový
  worker `00011-lad` zpracovává údržbu bez indexFailed/indexNeedsReview či
  chyb. Neproběhlo založení dalšího Scheduleru ani změna retence/Storage.
  Důkaz `build/feed-worker-live-proof.json`.

Živý test založil přesně 120 Shoutů `mvp-feed-20261107-000` až `-119`,
střídavě Bright_Otter_182/TestBusiness. Business používá existující ověřenou
pobočku, běžné testovací body jsou zaokrouhlené na dosavadní veřejnou mřížku.
Zdroj i index vznikly atomicky přes společný runtime writer v dávkách
50/50/20. Samotné plány hlásily 6/9/13 indexových čtení a 52/61/33 celkových
zápisů; není to úplný fakturační součet ani měření ceny jednoho feed requestu.
Fixture má předvyplněná geografická metadata schemaVersion 1, takže test
nevyvolává 120 externích geokódování. Původních 37 zdrojů bylo před i po
testu ověřeno včetně nezměněného updateTime. Plán a restartovací checkpoint:
`build/feed-live-fixture-plan.json`, `build/feed-live-fixture-state.json`.
Žádný Auth účet nebyl vytvořen nebo smazán.

Serverové jádro nad skutečným DEV Firestore prošlo pro oba účty stránkami
**50 → 100 → 120**, bez duplicit a podle přesné vzdálenosti. Prošlo Top,
Končící, prioritní řazení sledovaných (zbytek feedu zůstává podle dosavadního
kontraktu), kategorie (60), radius 1 km (3), odmítnutí kurzoru jiného účtu,
opakování stejné reakce, záložka/odebrání a stabilní Top snapshot: reakce
změní pořadí až v nové obnově. Testovací reakce i záložka jsou odebrané.
Důkaz `build/feed-live-core-proof.json`. První měřicí harness mylně očekával
ve Sledované pouze sledované autory; opravil se podle existujícího kontraktu,
aplikační řazení se neměnilo. Toto je Admin SDK test s důvěryhodným vstupem,
ne důkaz skutečného přihlášení/App Check ani klientské UI akce.

Vlastník samostatně potvrdil Business UI: po zvětšení dosahu se Shouty
zobrazily a po dosažení konce se načetly další. Cloudové logy potvrzují
platný Auth i App Check a tři getFeedPage POST HTTP 200 s latencí na serveru
1,071 / 0,841 / 0,522 s. Nepřihlášené HTTP volání obou readerů vrací 401.
Důkaz `build/feed-reader-cloud-proof.json`. Lokální SDK měření mělo 23 volání,
medián přibližně 1,96 s a jeden vzorek 65,8 s; příčina tohoto odlehlého vzorku
není potvrzená. Nelze jej zaměnit za latenci cloudového endpointu ani z těchto
malých vzorků vyvozovat kapacitu, cenu nebo záruku odezvy.

**Otevřené před uzavřením:** dosavadní připomínky k plovoucí obnově a zvonku
vlastník 10. listopadu potvrdil jako hotové. Při checkpointu 7. listopadu bylo všech 120 fixture aktivních,
ruční úklid ještě neproběhl. Po časovém odstupu jejich dostupnost a expiraci
před dalším testem znovu ověřit; historický počet není důkaz současné aktivity.
Pro UI reakce/záložky zatím existuje pouze serverový test; chybí také přímý
klientský důkaz uzavřených zápisů s přihlášenou identitou (obsah Rules a jejich
emulátorová regrese jsou ověřené). Automatické převzetí Chrome zastavila
bezpečnostní kontrola neověřené aktuální URL, takže UI průchod provedl vlastník.
Při navázání nejprve ověřit checkpoint a připomínky, pak testovací obsah
smazat přes deleteShoutOperation s runtime writerem a uklidit výhradně
vlastní fixture záložky, reakce, jejich oznámení a technická potvrzení.
Historické indexové bloky nesmí úklid obejít; běžný GC dodržuje hodinové okno.
Neodstraňovat původní 37 zdrojů ani jiné účty/jejich data.

Návrat při problému: pozastavit reader a případně vrátit kompatibilní web
`f5c7ef14f1b5e04b` (7ab60c8), společné writery/údržbu, generaci, klíč a Rules
zachovat. Celý feed B1–B4, vlastní Aktivní/Expirované a ostatní MVP brány
zůstávají otevřené; tento DEV přechod sám nemění metriku 9/24.

### Připomínka: trvale dostupná obnova

Vlastník 7. listopadu požaduje plovoucí „Obnovit“, dostupné i po odscrollování
hlavičky. Na `fix/feed-floating-refresh` je připravené umístění ve stejném
Scaffold FAB prostoru nad „Přidat shout“, s oddělenými Hero identitami.
Původní tlačítko ve scrollujícím obsahu se odstraní. Při obnově zůstává vidět
průběh a další stisk je blokovaný; používá se dosavadní serverová obnova.
Úspěch vrací scroll nahoru, chyba ponechává karty i pozici. Ostatní záložky
ani legacy feed nezískávají novou akci. Bez změny API, Functions či Rules.
Lokální widget/session regrese ověřuje tlačítko dosažitelné po načtení další
stránky, zachování pozice při chybě i návrat nahoru po úspěchu (15/15).
Lokální analýza je čistá. Zdroj `e43e0e1f93fabffc83e1de523cd28013196fa92f`
má [success CI 42360773795](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42360773795).
Z jeho čisté samostatné kopie je 7. listopadu v 11:08 SEČ nasazený pouze
DEV Hosting `shoutout-dev-46c81`, verze `82efffc97375c3ec`. Čtyři veřejné
soubory na web.app i firebaseapp.com mají shodné SHA-256 s release manifestem.
Důkazy: `build/feed-floating-ci-proof.json`, `build/feed-floating-hosting-proof.json`,
`build/feed-floating-hosting-deploy.log`; místní regrese/analýza v
`build/feed-floating-refresh-{test,analyze}.log`. První lokální build zastavilo
PowerShell ErrorAction Stop při běžném stderr upozornění Flutteru o Wasm;
opakované sestavení bez této shellové pasti dokončilo release i manifest.
Živá UI kontrola zatím čeká na vlastníka, automatické převzetí Chrome znovu
zastavila kontrola neověřené URL. Produkce, main, Functions, Rules i data
zůstaly při tomto UI rolloutu beze změny. Návrat této úpravy je předchozí
kompatibilní web `428dd3e025e17023` (ccc879f); writery a generaci zachovat.

### Upřesnění: pouze ikona vpravo nahoře

Vlastník potvrdil funkční plovoucí obnovu a následně požaduje pouze ikonu
v pravém horním rohu, stále dostupnou při scrollování. Na
`fix/feed-refresh-top-right` ji pevná vrstva nad feedem kotví do SafeArea;
zvonek dostává vlastní místo vlevo od ikony, „Přidat shout“ zůstává dole.
Viditelný popisek se odstraní. Tooltip a popis pro čtečky používají vestavěnou
lokalizaci Material, takže nevzniká nový překladový klíč ani text v tlačítku.
Průběh a blokace opakovaného stisku i dosavadní obnova zůstávají zachované.
Patnáct widget/session testů prošlo včetně stabilní polohy po stránkování,
chyby/úspěchu obnovy a šířky 320 logických bodů bez překrytí zvonku;
analýza je čistá. První zkouška šířky omylem nastavila fyzické pixely bez DPR,
po správném přepočtu prošla bez aplikační opravy rozložení filtrů.
Logy `build/feed-refresh-icon-{test,analyze}.log`. Zdroj
`f08abf97cf34686a7c776848c01bb7627ca08719` má
[success CI 42363878639](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42363878639)
a z čisté kopie byl 7. listopadu nasazený pouze na DEV Hosting, verze
`529bbcd5bb0c6ee8`. Čtyři veřejné soubory na web.app i firebaseapp.com
odpovídají SHA-256 release manifestu. Důkazy
`build/feed-refresh-icon-ci-proof.json`, `build/feed-refresh-icon-hosting-proof.json`
a `build/feed-refresh-icon-hosting-deploy.log`. Kontrola skutečné UI polohy
čeká na vlastníka; testovací obsah zůstává pro jeho další připomínky.
Návrat UI změny: Hosting `82efffc97375c3ec` (e43e0e1). Bez změny Functions,
Rules, dat, produkce či main; generaci a writery zachovat.

### Stejný plovoucí styl pro oznámení

Vlastník potvrdil ikonu obnovy vpravo nahoře a požaduje stejný způsob pro
oznámení. Na `fix/feed-floating-notifications` je zvonek ve stejné pevné
SafeArea vrstvě vlevo od obnovy, se stejným FloatingActionButton.small,
barvami motivu a samostatnou Hero identitou. Ve scrollující hlavičce nového
feedu už není duplicitní zvonek. Původní cesta otevření NotificationsPage
a počet nepřečtených nad dosavadním nejvýše 50 položek zůstávají stejné;
jediný dosavadní odběr se přesouvá, další dotaz se nepřidává. Ostatní sekce
a legacy feed používají původní neplovoucí variantu. Viditelný popisek není,
tooltip používá existující překlad Oznámení; číselný odznak zůstává.
Patnáct widget/session testů prošlo včetně stálé polohy, vzájemného oddělení,
šířky 320 bodů a kliknutí na oznámení po stránkování bez nové feed query.
Log `build/feed-floating-notifications-test.log`, čistá analýza v
`build/feed-floating-notifications-analyze.log`. Zdroj
`1fbf2ae40d34802069c365559c74d402a26f0b37` má
[success CI 42365663624](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42365663624).
Přerušení nastalo před nasazením; 10. listopadu read-only kontrola ověřila
původní f08abf9 na živém webu, čistou release kopii, hotový manifest a přesné
úspěšné CI. Následoval pouze DEV Hosting rollout na site/projekt
`shoutout-dev-46c81`, verze `941a97a6683b8e14`. Čtyři veřejné soubory na
web.app i firebaseapp.com mají shodné SHA-256 s manifestem připraveného releasu.
Důkazy `build/feed-floating-notifications-ci-proof.json`,
`build/feed-floating-notifications-hosting-proof.json` a
`build/feed-floating-notifications-hosting-deploy.log`. Živá UI kontrola
byla následně potvrzená vlastníkem. Návrat: `529bbcd5bb0c6ee8` (f08abf9), backendové writery
a generaci zachovat. Functions, Rules, data, produkce ani main se neměnily.

### Navázání podle TODO 10. listopadu

Read-only inventura původních 120 fixture: všechny existují, jsou serverově
expired, bez konfliktu autora/obsahu/časů a bez podkolekcí. Zůstává jedno
testovací oznámení. Původních 37 Shoutů má nezměněný updateTime, řídicí
dokument je active pro feed-v1. Důkaz `build/feed-resume-inventory.json`,
0 živých zápisů. Aktuálně proto nelze vydávat staré aktivní UI scénáře
za znovu ověřené; novou datovou vrstvu není třeba znovu instalovat.

Před B1 má smysl opravit vlastní Aktivní/Expirované: skutečný Home pořád
předává MyShoutsPage pouze výběr z posledních 50 globálně aktivních zdrojů.
Jejich následné filtrování podle autora nemůže vrátit vlastní starší ani
serverem materializované expired Shouty. Jde o dříve evidovanou otevřenou
akceptaci A, nikoli nový produktový požadavek nebo hotový milník.

Vlastníkovi je předložený konkrétní rozsah: samostatný čtecí endpoint s Auth,
App Check, stavem účtu a serverově určeným autorem; stránky nejvýše 50,
řazení od nejnovějších, stávající časová dostupnost a sedmidenní zobrazení
expirovaných. Klient používá vlastní stránky, dosavadní živé karty/počty
a serverové mazání, s ochranou změny účtu, chyby a zániku obrazovky.
Konkrétní query/indexový plán se ověří v emulátoru a před DEV rolloutem;
neslibovat, že 50 vrácených dokumentů znamená jen 50 fakturačních čtení.
Při měření započítat také případná [čtení indexových položek](https://firebase.google.com/docs/firestore/pricing).
Nejde o nový prostorový ani osobní read index a retence/oprávnění se nemění.

Po souhlasu připravit kód/testy; po úspěšném CI pouze DEV reader, potřebné
dotazové indexy a web. Živé ověření může využít právě těchto 60 expirovaných
Shoutů na každém z obou existujících účtů, poté dokončit schválený úklid
zdrojů přes writer a jen jejich vlastních vedlejších dat. Žádný nový Auth
účet, produkce ani main. Do schválení neprovádět zdrojové změny této opravy.
