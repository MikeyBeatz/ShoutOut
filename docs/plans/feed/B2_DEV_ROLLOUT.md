# B2 – příprava DEV zapojení a návratové verze

17. listopadu 2026. Schválený je pouze lokální přípravný úsek s testy, dokumentací
a commit/push/CI. Bez nasazení, živých dat, aktivace přepínačů, změn Scheduleru,
Rules nebo Auth účtů. Budoucí pilot cílí výhradně na projekt/site
shoutout-dev-46c81; produkce, main a původní pending žádost zůstávají mimo něj.

## Připravené zapojení

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

## Přesné pořadí budoucího DEV pilotu

1. Ověřit kandidátní SHA/úplné CI, čistý strom, skutečné nasazené revize a uložený
   kompatibilní neaktivní v3 artefakt. Jeho Hosting rollout patří až do pilotu.
2. Získat čtyři snapshoty, nasadit pouze schválený indexový plán a ověřit dotazy.
3. Izolovaný balíček read_sync_host.js přidá syncReadBatch/getReadStatePage:
   europe-west3 / min 0 / max 1 / concurrency 1 / 256 MiB / 15 s a stávající
   SHOUTOUT_FEED_CURSOR_KEY. Dokud control chybí/off, data se nesmějí zapisovat.
4. Po vlastním CI aktivace zapojit readSyncEnabled do dvou stávajících účtových
   Functions bez změny prostředků/retence. Musí fungovat před prvním uploadem.
5. Samostatně schválit skutečné spouštění retence a nahradit starou receipt
   cestu. Oba receipt runnery nesmějí běžet současně; nový checkpoint bezpečně
   začne od začátku. Bez funkčního provozního úklidu B2 neaktivovat.
6. Teprve potom readSyncControl active a aktivační DEV web s vlastním CI.
   Navržený test: dva nové 24h syntetické Shouty pod Bright_Otter_182/TestBusiness,
   dvě zařízení, offline/restart/retry a úklid přes writer. Tento návrh samotný
   test nepovoluje. Živý test účtového mazání vyžaduje zvlášť vymezený dočasný
   Auth účet; existující účty ani původní pending žádost se nemažou.

Při potížích pozastavit readSyncControl a vrátit ověřený neaktivní v3 web.
Zachovat místní fronty, cloudová data a funkční účtový/retenční úklid včetně
již potřebného readSyncEnabled. Nevracet automaticky indexy. Zaznamenat revize,
chybu a výsledek živého ověření.

## Provozní kandidát k dalšímu rozhodnutí

Pro malý DEV pilot doporučuji údržbu mimo účtový worker: navrhnout nahrazení
runneru a změnu existující cleanupOperationReceipts z denního na minutové
spouštění. Nový Scheduler job by nevznikl; tato změna nyní není schválená ani
implementovaná. Nejprve ověřit možnost ponechat min 0 / max 1 / concurrency 1 /
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

Konečné CI a důkaz release artefaktu se doplní před uzavřením přípravy.
Žádné živé změny nejsou provedené.

Lokálně prošlo 68 emulátorových testů (8 adaptéru, 16 jádra, 44 účtových),
17 skutečných Chrome/IndexedDB, 131 Functions unit (457 integračních se mimo
emulátor přeskočilo), 81 tools a lint. Logy:
build/b2-preparation-emulator-final.log, build/b2-preparation-functions-unit.log,
build/b2-preparation-tools.log a build/b2-preparation-browser.log.

Metriky rozdělují pouze původní nedokončený podíl feed-b2-indexes: v MVP
88 bodů na 29 implementace / 29 ověření / 30 živé indexace a účtové aktivace,
v backlogu 141 na 47/47/47. Váhy rodičů ani dokončená práce se nemění.
Návratový v3 artefakt má vlastní dosavadní podúsek; žádné nasazení tím nezíská kredit.
