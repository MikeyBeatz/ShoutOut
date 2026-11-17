# B2 – DEV zapojení, pilot a návratová verze

17. listopadu 2026. Lokální příprava je uzavřená a vlastník následně výslovně
schválil navazující DEV zapojení a pilot níže. Cílem je výhradně projekt/site
shoutout-dev-46c81; produkce, main, Rules, Auth účty a původní pending žádost
zůstávají mimo něj. Připravený kód není důkaz nasazení či živé akceptace.

## Schválený živý rozsah

- Čtyři cílené field změny bez TTL; živá metadata byla načtena jen pro čtení.
  Schválený digest je
  `39562e1f24114992c9590d55897a1240021caf299634510b9f123dcbc2808eaa`.
- Dvě nové Functions syncReadBatch/getReadStatePage v samostatném read-sync
  codebase: europe-west3, min 0 / max 1, concurrency 1, 256 MiB, 15 s,
  existující SHOUTOUT_FEED_CURSOR_KEY. Žádný nový podpisový klíč.
- readSyncEnabled=true ve dvou existujících účtových Functions; jejich
  prostředky ani 60denní retence se nemění. Musí být nasazené před příjmem značek.
- Existující cleanupOperationReceipts nahradí původní runner pokračujícím
  read/receipt runnerem, každou minutu místo denně. Zachová 0–1 instanci,
  concurrency 1, 256 MiB, 60 s a retry 0. Nevzniká nový Scheduler job.
  Nejvýše 500 dokumentů / měkkých 10 s na každou ze dvou fází, po dokončení
  24h klid; neporuchový klidový tick má naměřené 3 reads. Stále jde o
  1 440 volání Function denně plus skutečnou práci a související účtování.
- readSyncControl a retentionControl určují aktivaci odděleně. Před výměnou
  runneru pozastavit původní job, nechat doběhnout jeho maximálně 60s běh a
  ověřit novou revizi před aktivací retence. Starý a nový runner nesmějí běžet
  současně; nový checkpoint začíná od začátku. Chybějící control je off,
  nedochází k návratu na starý runner.
- Po přesném úplném CI zapnout DEV synchronizaci a web. Živý test zahrne
  dvě nové 24h syntetické Shouty pod existujícími Bright_Otter_182/TestBusiness,
  dva klienty, offline/restart a jeden vymezený prošlý read blok a receipt.
  Uklidit testovací obsah přes writer; neodstraňovat žádný Auth účet.
  Retenční runner smí uklidit všechny způsobilé prošlé technické záznamy.

Zdrojové zapojení je na feature/b2-dev-rollout. Přípravu artefaktu provede
tools/prepare_read_sync_functions.mjs; sama nic nenasazuje. Ověřit přesné SHA,
úspěšné úplné CI, čistý strom a shodu balíčků před každým rolloutem. DEV profil
neurčuje produkční kapacitu 100 000 účtů / 5 000 aktivních relací.

Lokálně prošlo 134 Functions unit testů (457 integračních mimo emulátor skip),
81 tools, lint a 17 skutečných Chrome/IndexedDB testů. Nové regrese ověřují
odmítnutí produkce před DB přístupem, chybějící control bez legacy fallbacku
a odstranění identifikátorů/kurzorů z logů. Balíčková kontrola potvrzuje, že
content přibírá retenční jádro a codec, nikoli read callable host; nový host
je izolovaný. Dále prošlo 375 Flutter a 68 společných emulátorových regresí
(44 účtových, 16 retenčního jádra, 8 adaptéru). První úplné CI skončilo na
starém očekávání vypnutého DEV flagu; navazující běh byl zrušen při doplnění
zbývajících testovacích konfigurací. Produkční/historické fixture mají flag
explicitně vypnutý. Celá fronta 10 000 značek v původním emulátorovém běhu
prošla; jeho jediná chyba byla opravená historická fixture. Přesné úplné CI
finálního kandidáta zůstává podmínkou nasazení.

<a id="dev-rollout-results"></a>

## Ověřené DEV nasazení

Zdroj `bc4a6e1d38f7d46c2144fe31521c1cdbe91e507a` má
[úspěšné úplné CI 44099715617](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44099715617):
375 Flutter, 17 Chrome, 81 tools, 134 Functions unit (457 skip mimo emulátor),
450 Rules/server, 34 B2 runtime/retention, 116 purge a 15 Storage, formát,
analýzu/lint/build. První neúspěšný a zrušený mezikandidát se nenasazovaly.

17. listopadu 2026 je nasazený jen DEV:

| Vrstva | Ověřený výsledek |
|---|---|
| Čtyři field výjimky | Přesný schválený digest, všechny READY; žádné další akce ani TTL změny. Živé full/delta i retenční dotazy prošly. |
| syncReadBatch / getReadStatePage | ACTIVE, revize syncreadbatch-00001-fox / getreadstatepage-00001-xub; min0/max1, concurrency1, 256 MiB/15 s, stávající klíč v1. Anonymní požadavky oba HTTP 401. |
| Účtový read úklid | ACTIVE request 00012-tiw / recovery 00012-rud; readSyncEnabled=true, dosavadní 256 MiB/60 s/max1/concurrency1. |
| Retence | ACTIVE cleanupoperationreceipts-00004-zel, stávající Scheduler job ENABLED každou minutu UTC, stejných 256 MiB/60 s/max1/concurrency1. |
| Web | Hosting a5edfc1f8a96c6e7, release 2026-11-17T14:26:57.539Z; index.html, main.dart.js a app-config.json na web.app mají shodné bajty s release. |

Před nahrazením runneru byl starý job pozastavený; před aktivací nového již
uplynulo přes 65 s a nová revize byla ACTIVE. Obě controls jsou active/v1/revision1.
Stažené skutečné zdrojové ZIP všech pěti Functions odpovídají připraveným
balíčkům: 10 souborů pro každou read Function, 39 pro každou účtovou a 49 pro
cleanup. Nejde jen o odvození z Git nebo metadata deploy příkazu.

První živý retenční průchod odstranil právě jeden vymezený prošlý read blok
a jeden receipt; oba checkpointy jsou dokončené, bez lease/skipped a mají
nextRunAt +24 h. Následná kontrola zachovala jejich stav i termín; cloudové
INFO logy následných ticků dokládají checked/idle bez dalšího skenování/mazání
a bez needsReview. První dvě čtení Logging API narazila na dočasnou kvótu 429;
po odkladu stejná kontrola prošla. Nešlo o chybu údržbové Function.
Původní pending žádost je beze změny. Všech 38 zdrojů zachycených před pilotem
má stejné updateTime. Žádný Auth účet nevznikl ani nebyl smazán.

Dva nové 24h Shouty „MVP B2 A 17.11.“ / „MVP B2 B 17.11.“ byly vytvořeny
atomicky přes writer a oba jsou uložené pod oběma testovacími účty. Důvěryhodný
Admin SDK průchod pod TestBusiness ověřil upload obou značek, opakování bez
zvýšení revize a full/unchanged-delta dotazy ve skutečné DB. Tento průchod
nenahrazuje HTTP Auth/App Check ani dvě uživatelské relace. Bright_Otter_182
nebyl tímto jádrovým testem označen jako přečtený.

První uživatelská relace Bright_Otter_182 má na serveru ověřenou značku A;
jeho „Mé shouty“ správně obsahují jen vlastní A, protože B patří TestBusiness.
Vlastník doložil také novou anonymní relaci před otevřením obsahu: IndexedDB v3,
A read=true/pendingSync=false/queued=false s readAtLocal=1794926106840, což je
přesný confirmedAt serverové značky. B zůstává nepřečtené, checkpoint není
rozpracovaný a TestBusiness DB v této relaci neexistuje. Import druhého klienta
je tím ověřený; důkaz je build/b2-client-second-proof.json.

**Živá klientská akceptace a úklid obou Shoutů zůstávají otevřené.** Browser host
není dostupný; náhradní nativní ovládání skončilo, protože nástroj nedokázal
spolehlivě určit URL. První přenos i import odděleného klienta jsou ověřené;
zbývá offline/restart/retry a úklid přes writer. Vlastník dostal test B v běžné
relaci: přečíst bez obnovy, zapnout Network Offline, zkusit obnovu feedu a
read-only kontrolou ověřit zachovanou frontu před návratem online.
Do té doby netvrdit dokončené B2 ani mazat testovací obsah. Produkce, main,
Rules a původní pending žádost jsou zachované; kapacitní brána zůstává otevřená.

Lokální důkazy jsou v ignorovaném build: b2-deployed-source-proof.json,
b2-rollout-live-infra-check.json, b2-hosting-proof.json, b2-live-pilot-proof.json,
b2-live-pilot-state.json, b2-maintenance-live-log-proof.json a
b2-rollout-control-proof.json. Read-only kontrola
dvou místních testovacích značek je build/b2-read-check.js; nečte Auth ani tokeny.
Návratový neaktivní v3 artefakt 405be7d byl před rolloutem znovu ověřený (68
souborů). Při návratu zachovat read úklid, indexy i místní fronty podle postupu.

## Původní přípravné zapojení

- retention_runtime.js nemá cloudový trigger ani živý import. Enabled=false
  znamená nulové DB operace. Enabled=true vyžaduje soukromý
  maintenanceState/retentionControl přesně `{v:1, revision: kladné celé číslo,
  mode: off|active|paused}`. Chybějící/neplatný control znamená off.
- Přijatý úsek je svázaný s revizí i updateTime. Každá mutující transakce
  control znovu čte; pause→active ani se stejnou revizí starou práci nepovolí.
  Housekeeping může po přerušení uvolnit jen vlastní lease, nikoli měnit zdroje.
- Read příjem má samostatný readSyncControl: jeho pauza nezastavuje retenci.
  Účtový úklid na retentionControl nezávisí. Původní denní receipt úloha se nemění.
- Dokončený průchod čeká 24 h. Nedokončený pokračuje dalším zavoláním, chyba
  čeká 60 s. Zůstává lease 120 s a 10 stránek po 50 / měkkých 10 s na fázi
  mezi transakcemi. Dvě fáze mají oddělené rozpočty; nejde o timeout RPC.
- AccountDeletionDevProposal má explicitní readSyncEnabled=false. Skutečný
  job předává tuto volbu soukromé fázi; test zapnuté větve ověřuje readBuckets
  i readState bez změny 60denního termínu, profilu či právních podkladů.

## Cílené indexy bez TTL

Čistý tools/read_sync_index_plan.mjs nepoužívá síť a nemá apply příkaz.
Vyžaduje čtyři úplné GET snapshoty DEV `(default)` v objektu s klíči
např. readBuckets/fields/day a hodnotami `{status:200, data:<Admin API odpověď>}`.
Resource začíná projects/shoutout-dev-46c81/databases/(default)/collectionGroups/.

| Collection group / field | Cíl |
|---|---|
| readBuckets / * | explicitně prázdná automatická indexace |
| readBuckets / revision | ASCENDING / COLLECTION |
| readBuckets / day | ASCENDING / COLLECTION_GROUP |
| readState / * | explicitně prázdná automatická indexace |

Výstup obsahuje původní stavy, přesné PATCH s updateMask=indexConfig, digest
a ready. Nula změn neznamená připravenost vytvářeného indexu. Neúplná inventura,
jiný projekt nebo cizí explicitní override plán zastaví; zděděné automatické
defaults lze nahradit uvedenými výjimkami. Ostatní fields/kompozitní indexy/TTL
se nemění. Nenahrazovat cílený plán celým deploy firestore.indexes.json.
Prázdný seznam je explicitní výjimka podle
[Field API](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.collectionGroups.fields);
samostatný index má jednu položku fields podle
[Index API](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.collectionGroups.indexes).

Živé snapshoty se nyní nečtou. Před budoucím apply inventuru získat a plán
porovnat s aktuálním stavem a schváleným rozsahem; počkat na dokončení operací
a READY, potom ověřit full/delta a collectionGroup dotazy. Emulátor dostupnost
cloudových indexů neprokazuje. Původní stavy jsou pro review, nikoli automatický
inverzní PATCH včetně output-only polí.

## Neaktivní web a návrat

Návratový release musí být z čistého konkrétního commitu s úplným CI,
IndexedDB v3, localReadTracking=true a serverReadSynchronization=false.
Stávající web_environment.mjs ověří konfiguraci, projekt a SHA-256 všech souborů.
Uložit kopii webu/manifestu s úplným Git SHA. Jde o ignorovaný lokální artefakt;
staré v1/v2 weby po upgradu nejsou vhodný rollback.

Chrome regrese uzavře v3 spojení po potvrzeném importu a s nedokončeným
checkpointem. Otevření bez transportu zachová přečtení/import, outbox i checkpoint;
další místní čtení a erase fungují. Toto spolu s release buildem ověřuje místní
kompatibilitu, nikoli živý návrat mezi nasazenými weby.

## Pořadí DEV pilotu

1. Ověřit kandidátní SHA/úplné CI, čistý strom, skutečné nasazené revize a uložený
   kompatibilní neaktivní v3 artefakt. Jeho Hosting rollout patří až do pilotu.
2. Získat čtyři snapshoty, nasadit pouze schválený indexový plán a ověřit dotazy.
3. Izolovaný balíček read_sync_host.js přidá syncReadBatch/getReadStatePage:
   europe-west3 / min 0 / max 1 / concurrency 1 / 256 MiB / 15 s a stávající
   SHOUTOUT_FEED_CURSOR_KEY. Dokud control chybí/off, data se nesmějí zapisovat.
4. Po vlastním CI aktivace zapojit readSyncEnabled do dvou stávajících účtových
   Functions bez změny prostředků/retence. Musí fungovat před prvním uploadem.
5. V rámci výše schváleného spouštění retence nahradit starou receipt
   cestu. Oba receipt runnery nesmějí běžet současně; nový checkpoint bezpečně
   začne od začátku. Bez funkčního provozního úklidu B2 neaktivovat.
6. Teprve potom readSyncControl active a aktivační DEV web s vlastním CI.
   Schválený test: dva nové 24h syntetické Shouty pod Bright_Otter_182/TestBusiness,
   dvě zařízení, offline/restart/retry a úklid přes writer. Živý test účtového
   mazání není součástí pilotu a vyžadoval by zvlášť vymezený dočasný
   Auth účet; existující účty ani původní pending žádost se nemažou.

Při potížích pozastavit readSyncControl a vrátit ověřený neaktivní v3 web.
Zachovat místní fronty, cloudová data a funkční účtový/retenční úklid včetně
již potřebného readSyncEnabled. Nevracet automaticky indexy. Zaznamenat revize,
chybu a výsledek živého ověření.

## Podklad provozní volby

Pro malý DEV pilot doporučuji údržbu mimo účtový worker: navrhnout nahrazení
runneru a změnu existující cleanupOperationReceipts z denního na minutové
spouštění. Vlastník tuto variantu následně schválil v rozsahu nahoře.
Nový Scheduler job nevznikne. Zachovat min 0 / max 1 / concurrency 1 /
256 MiB / 60 s. Rozpočty zůstávají až 500 dokumentů / 10 s mezi transakcemi na
fázi, celkem dvě; měkká mez nezastropuje latenci jednotlivého RPC.

Po dokončení je 24h klid. Případný minutový tick pak provede naměřené 3 reads
(control + dva checkpointy), bez zápisů/metadata sond: početně 4 320 reads/den
plus práce nového epochu, bez poruch. Není v tom indexové účtování, síť, CPU ani
cena v Kč. Varianta není důkazem produkčního cíle 100 000 účtů / 5 000 aktivních
relací. Budget živého měření, skutečné latence, práce při dluhu a produkční
škálování musí projít další samostatnou kapacitní branou.

<a id="preparation-results"></a>

## Výsledky

Příprava je uzavřená. Zdroj `405be7d8218d628a85a93d529cdf391d7085bf3c` má
[úspěšné úplné CI 44077124957](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44077124957):
81 tools, 131 Functions unit (457 integračních mimo emulátor přeskočeno),
450 Rules/server, 34 B2 runtime/retention, 116 purge, 15 Storage a
Flutter/browser/formát/analýzu/lint/build. Žádné živé změny nejsou provedené.

Lokálně prošlo 68 emulátorových testů (8 adaptéru, 16 jádra, 44 účtových),
17 skutečných Chrome/IndexedDB, 131 Functions unit (457 integračních se mimo
emulátor přeskočilo), 81 tools a lint. Logy:
build/b2-preparation-emulator-final.log, build/b2-preparation-functions-unit.log,
build/b2-preparation-tools.log a build/b2-preparation-browser.log.

Čistý release ze stejného SHA prošel web_environment check pro DEV. Kopie
68 souborů je v build/b2-v3-rollback-405be7d8/web; vedle ní jsou manifest.json
a proof.json. Otisky kopie byly znovu ověřené stávajícím verifyBuild.
Manifest SHA-256: `6bf3665671f14f514c8cfad666fb9001451b2d318ec716a1149f7d33274283b7`.
main.dart.js SHA-256: `14b7b460ca21516ee7885a162be1594cb92ffc80a35772b0a7a1c1f52485b600`.
LocalReadTracking je true, serverReadSynchronization false; 17 Chrome testů
prošlo i v CI. Release log: build/b2-preparation-release-build.log. Artefakt je
lokální/ignorovaný a před budoucím rolloutem znovu ověřit jeho existenci/otisky;
není nasazený. Živý rollback a celá DEV akceptace B2 zůstávají otevřené.

Metriky rozdělují pouze původní nedokončený podíl feed-b2-indexes: v MVP
88 bodů na 29 implementace / 29 ověření / 30 živé indexace a účtové aktivace,
v backlogu 141 na 47/47/47. Váhy rodičů ani dokončená práce se nemění.
Návratový v3 artefakt má vlastní dosavadní podúsek; žádné nasazení tím nezíská kredit.
