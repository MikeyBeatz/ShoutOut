# Provozní návrh prostorového indexu

6. listopadu 2026. **R6a–R6c jsou schválené lokální úseky; zbývající provozní
návrh není schválená živá konfigurace.** [Runner](#r6a-results),
[ochrana Admin nástrojů](#r6b-results), [časná fronta](#r6c-results).
Navazuje na [writer](FEED_WRITER_INTEGRATION.md), [R5](FEED_INDEX_RETENTION.md#account-retention-proposal)
a [migrační připravenost](FEED_MIGRATION_READINESS.md). Lokální jádro je ověřené;
živý adaptér, generace, backfill, API ani plánování indexu dosud neběží.
Aktuální DEV aplikace a účtové mazání zůstávají podle [PROJECT_STATUS](../../PROJECT_STATUS.md).

## Závěr pro další práci

Současný R5 prototyp **nezapínat pouhým předáním writeru do živého workeru**.
Konečný account purge začíná až u původního +60denního termínu a pro R5 nyní
udělá pouze jeden krok na průchod. Indexový úklid tak teprve začíná v okamžiku,
kdy už má být dokončený. Navíc drží oblast zamčenou přes několik pokračování.
Úspěšná lokální regrese tuto provozní mezeru neřeší.

Doporučené pořadí:

1. R6a runner, R6b transakční ochrana a R6c časná fronta mají lokální ověření níže.
   Zbývá skutečný adaptér a koordinace časné fronty s konečným purge.
2. Připravit provozní adaptér za vypnutým přepínačem, propojení dokladů/úklidu
   s účtovým workerem a přesný migrační nástroj. Každý z těchto
   rozsahů před úpravami konkretizovat, nejde o automatický souhlas touto listinou.
3. Předložit DEV pilot s měřením skutečných index entries, cloudové latence,
   prostředků a rozpočtu. Teprve schválený pilot může měnit živé indexy/data.
4. Po úspěchu připojit query API a klienta A2/A3, potom přečtení B1–B4.

Nezavádět zatím další vyhledávací službu, jiné úložiště, změnu tarifu ani
novou toleranci po 60 dnech. Otevřené kapacitní brány nejsou nové MVP funkce.

## Celá inventory: reprodukovatelné lokální měření

[Naměřený JSON](../../benchmarks/FEED_RUNTIME_2026-11-05.json) vznikl nástrojem
`tools/measure_feed_runtime.mjs` nad jádrem z commitu
`20cd41f8c3b42b8d03bddc83bda3c3fab85147c3` (poslední změna jádra cda647e).
Přesný host `127.0.0.1:8080`, projekt `shoutout-rules-test`, žádné Auth účty,
živé kolekce ani reálná uživatelská poloha. Souřadnice jsou syntetické body.
Fixture se vytvářejí existujícím writerem po 50, takže historie zahrnuje i
přípravu datasetu; běžný GC mezi těmito zápisy neběžel. Sloupec „změny autora“
není počet všech historických kořenů. Dataset není předpovědí živého zatížení.

| Případ | Cizí Shouty / změny autora | Aktuální / všechny bloky před úklidem | Kroky R5 | Čtení | Zápisy / mazání | Model zámku při 1 kroku/min |
|---|---:|---:|---:|---:|---:|---:|
| Malý hotspot | 80 / 4 | 3 / 12 | 15 | 161 | 33 / 21 | 8 min |
| Rozložení do 128 cizích oblastí | 1 024 / 32 | 129 / 1 057 | 82 | 2 577 | 96 / 68 | 10 min |
| 1 024 cizích oblastí | 1 024 / 32 | 1 025 / 1 057 | 82 | 2 580 | 96 / 68 | 10 min |
| Hustý hotspot s historií | 1 024 / 96 | 49 / 948 | 116 | 3 919 | 244 / 1 071 | 79 min |

Počty pokrývají **všechny transakční operace samotného R5 a závěrečné zavření
jeho journalu**, nikoli jen nalezené listy. Zahrnují inventory, druhou kontrolní
inventory, guardy R5, marks, prázdné dotazy, archivy a jejich úklid. Ve všech
případech nebyl transakční retry. Zápisy a delete jsou oddělené. Nezahrnují
vnější účtový lease/guard, setup, kontrolní pozorování, audit ani úklid fixture.
Nejde proto o cenu celého smazání účtu. SDK počty nejsou fakturační výpis.

Adaptér byl každý krok nový. Ověřeno odstranění UID ze všech uzlů, audit všech
zbývajících metadat, nezměněný kontrolní cizí zdroj a zavřený journal. Žádná
zkouška nesmazala kanonické cizí Shouty. Limity zůstaly dosavadních 32 traversal
položek / 16 kandidátů mazání; **nejsou stropem všech čtení transakce**.

Lokální samotné úklidy trvaly přibližně 1,7 / 8,9 / 8,4 / 16,2 sekundy.
To nejsou časy cloudu ani celé přípravy a nejsou garancí UI odezvy. Minutový
model počítá intervaly mezi kroky, po nichž zůstal cell fence zamčený, bez
výpadků, další fronty a chyb. Další blokace kopírování listu s mazaným autorem
může začít už globálním `activeErasure`, ještě před zamčením jeho oblasti.

Každé mazání nyní prochází všechny udržované uzly namespace dvakrát, včetně
nesouvisejících oblastí. Náklad roste s bloky/historií, ne pouze s počtem
Shoutů mazaného člověka. U velkého provozu je povinné nové měření; nelze
lineárně slibovat stejné sekundy. Pokud ani dávkový runner nevyhoví, další
varianta je locator autor→oblast nebo společná inventory více žádostí.
To by vyžadovalo atomickou evidenci všech historických/orphan kopií a vlastní
návrh; samotné vyhledání současných Shoutů autora nestačí. Nyní to nezavádíme.

Reprodukce: Node 22, Firestore emulátor přes konfiguraci `firebase.rules-test.json`,
projekt `shoutout-rules-test`; uvnitř `emulators:exec` spustit
`node tools/measure_feed_runtime.mjs`. Výstup je `build/feed-runtime-measurement.json`.
Bez přesného emulator hostu nástroj skončí před inicializací databáze.

## Nákladový model a ověřené prostředí

Read-only `firestore:databases:get` potvrdil DEV `(default)`: Native / Standard,
`europe-west3`, freeTier true, PITR vypnutý. Produkční dotaz skončil 403:
Firestore API nebylo použité nebo je vypnuté. **Produkční edice, region a stav
databáze nejsou tímto ověřené.** Nic se kvůli tomu nepovolovalo ani nevytvářelo.
Lokální důkazy: build/index-runtime-dev-database.json a build/index-runtime-prod-database.json.

Podle [ceníku Firestore Standard](https://cloud.google.com/firestore/pricing)
se účtují dokumentové operace, případné čtení index entries, úložiště včetně
indexů a přenos. Prázdný dotaz má minimum jednoho čtení. U zpoplatněných
nevektorových dotazů se index entries převádějí na čtecí jednotky po nejvýše
1 000; pravidla závisí na range polích. Výsledky emulátoru jejich počet neměří.
Před pilotem použít Query Explain pro adresář i R5 sweep, který řadí podle
path a document ID. Výchozí Explain stojí jedno čtení; analyze skutečně provede
dotaz. Sazbu ověřit pro Frankfurt a měnu účtu, nikoli převzít výchozí Iowa tabulku.

Pro rozpočet evidovat zvlášť:

| Složka | Co započítat |
|---|---|
| Čtení feedu | Adresář, bloky při cold/warm cache, R5 fence a profily, hydratace až vybraných karet, receipt/replay a index entries. |
| Zápisy | Zdroj, receipt, nové bloky, kořeny, historie a R5/GC checkpointy; reakce zvyšují churn. |
| Úklid | R5 inventory a verify, marks/guardy, GC traversal/restart, delete, vnější lease a opakované pokusy. |
| Uložení | Aktuální i historické/orphan bloky, pomocné dokumenty a skutečné Firestore indexy. JSON bytes v měření nejsou účtované GiB. |
| Runtime | CPU/GiB-sekundy, invokace, startup/retry, síť, logy, build/artefakty a případný Scheduler. |
| Zbytek aplikace | Auth/App Check, mapy/geokódování, soukromé zprávy, účtové archivy a ostatní obsah. |

Rozpočtová rovnice nad placenými jednotkami po příslušných kvótách:
`C = (Rdoc + Rindex) × Pr/100000 + W × Pw/100000 + D × Pd/100000 + storage + runtime + network + ostatní`.
`Pr/Pw/Pd` jsou **dosud nedosazené** regionální ceny v měně účtu, ne schválené
sazby. Kvóty odečítat za celý projekt/den, ne zvlášť každému uživateli či operaci.
Příklad citlivosti: 1 000 úklidů se stejnou prací jako hustý vzorek spotřebuje
3 919 000 čtení, 244 000 zápisů a 1 071 000 mazání jen pro R5. Databázová část
je tedy `39,19 × Pr + 2,44 × Pw + 10,71 × Pd`, před dalšími index entries,
kvótami a službami. Není to prognóza počtu smazaných účtů ani cena za refresh.

[Cloud Run ceník](https://cloud.google.com/run/pricing) rozlišuje region a režim
účtování. Před pilotem načíst skutečné CPU, paměť, billing mode a naměřené
účtované trvání; lokální elapsed nelze dosadit jako cloudovou fakturaci.
Současný účetní limit **5 000 Kč je rozpočet celé aplikace**, ne tvrdý
vynucený strop tohoto indexu. Počet návštěvníků z něj bez vzoru provozu určit nelze.
DEV pilot musí dodat sazby/SKU, Query Explain, měřený runtime a denní projekci;
do té doby nemáme podklad k tvrzení „vejde se to do 5 000 Kč“.

## Včasné plánování a obnova zámku — navržené řešení

- Po potvrzeném chybění Auth, platné původní žádosti a serverovém markeru
  zařadit indexovou práci včas. Nečekat na 60. den ani jen na úspěch všech
  ostatních archivních fází; po selhání primární fáze ji musí objevit i
  nezávislý recovery průchod. Retenční deadline zůstane původní createTime +60 dní.
- R5 helper tuto časnou práci již dovoluje, ale **žádný živý wrapper ji nyní
  nevolá**. Včasné zpracování nezkracuje retenční archiv textů či Business dat;
  odstraňuje pouze indexové kopie, které už nejsou potřebné pro dostupný feed.
- Fronta musí znát všechny udržované generace a inkarnaci žádosti. Novou práci
  vybírat podle nejbližšího původního deadline. Zachovat serializaci R5 uvnitř
  generace; žádné paralelní přepsání stejného journalu. Rozpočet pro běžnou
  expiraci/účtovou práci nesmí tento indexový úklid trvale vyhladovět.
- Pro následující **lokální experiment** navrhuji runner nejvýše **32 kroků
  a 10 sekund mezi transakcemi na jedno volání**, podle toho, co nastane dřív.
  Stávající čtecí/mazací dávky zůstanou 32/16. Již běžící transakci nelze tímto
  časovým rozpočtem přerušit; celý endpoint musí mít rezervu. Tyto hodnoty nejsou
  schválené živé prostředky ani záruka délky zámku. Naměřit počet kroků a čtení
  včetně skutečného lease guardu, nikoli jen násobit lokální tabulku.
- Zámek oblasti je **datový fence**, ne lease, který lze po timeoutu zahodit.
  Po pádu převezme oprávněný worker tutéž práci s novým lease tokenem, ověří
  žádost/marker/generaci/verzi journalu a pokračuje z checkpointu. Starý worker
  musí při commitu ztratit oprávnění. Nikdy automaticky neodemknout oblast,
  v níž ještě mohou být stará metadata.
- Při vadném journalu, chybějící inkarnaci či nečekaném kořeni stav needs-review,
  upozornění obsluze a bezpečné zastavení dotčených operací; nepřeskočit práci.
  Návrat po opravě musí mít audit a preconditions. Čtení cizího již načteného
  obsahu zůstává podle R5; nové stránky/změny dostanou řízenou obnovu/retry.
- Dokončení časného úklidu musí atomicky uložit doklad inkarnace/generací a
  zavřít indexový journal. Závěrečný account purge jej ověří místo opětovné
  inventory. Nová generace, neplatný doklad či nepokrytá kopie znamená novou
  práci, ne slepé přeskočení. R6c již má lokální doklad; živý purge jej dosud
  nekonzumuje a celý provozní protokol není tímto hotový.
- Provozní alarmy: stáří fronty, čas nejbližšího deadline, stáří zámku,
  počet čtení/retry a blokovaných operací. Konkrétní prahy, interval a prostředky
  předložit po lokálním runneru a cloudovém měření. Výpadek služby nemůže být
  vydáván za garanci fyzického odstranění přesně v termínu.

## Všechny zapisovací cesty

Před aktivací každý zápis ovlivňující projekci musí používat stejnou transakci
zdroj + bloky + kořeny + historie + receipt, nebo být technicky odmítnutý.
Nestačí upozornění v dokumentaci. Klientské fallbacky ve všech podporovaných
verzích a přímé Rules zápisy publikace/reakcí prověřit zvlášť; poslední DEV
cutover uzavřel mazání, **nikoli automaticky všechny indexované změny**.

| Cesta ověřená v kódu | Před aktivací |
|---|---|
| createShout, toggleShoutReaction, deleteShout | Zapojit transakční writer a R5, fail-closed; platí i moderátorské odstranění. |
| prepareAccountDeletion, account_shout_hiding, odebrání palců účtu | Použít existující lokální integrace a ověřit přes živý adaptér. |
| Expirace a konečný account purge | Writer i včasné R5; terminal-only fallback není plán retence. |
| `reconcile_counters.mjs` | Mění palce **i polohu**, bez přepočtu geohashe/indexu. R6b dovolí starou opravu pouze bez indexu, s transakční kontrolou a updateTime precondition. |
| `round_shout_locations.mjs` | Mění polohu bez geohashe/indexu. R6b stejná ochrana; opravu odvozených údajů nyní nezavádí. |
| `backfill_shout_geography.mjs` | Geography není v projekci, nástroj ale doplňuje i kořenový geohash. R6b chrání celý jeho root zápis. |
| `seed_test_users.mjs`, `reset_integration_scenario.mjs`, `seed_moderation_queue.mjs` | R6b všechny tři CLI zablokuje před credentials/první mutací, bez živé výjimky. Potřebují nový bezpečný fixture/reset postup; jeho zavedení není součástí R6b. |
| `hide_deleted_account_shouts.mjs` | R6b chrání každou statusovou dávku; živý worker má vlastní serverovou cestu. |
| Jednorázová oprava geohashů | Historický digestový souhlas není výjimka: R6b přidává stejnou transakční kontrolu a zachovává digest/updateTime preconditions. |
| Geography trigger v `functions/index.js` | Mění pouze `geography`; nevyžaduje indexovou verzi. Ověřit to regresí, až se změní schéma projekce. |
| Komentářové/saves počty, profily a role | Samy nejsou indexovanými Shout palci/polohou. Nepřidávat zbytečné blokové zápisy; případné změny Shout Business flagů už writer vyžadují. |
| Ruční Admin SDK, konzole, jiné servisní identity | Rules je nezastaví. Omezit provozní přístup a evidovat opravy; sdílená ochrana nástrojů není bezpečnostní bariéra proti držiteli neomezeného Admin oprávnění. |

Schválená R6b varianta: společný serverový kontrolní dokument/generace
kontrolovaný **ve stejné transakci jako zápis nástroje**. Přepnutí generace mění
týž dokument, takže souběh nemůže obejít starý preflight. CLI kontrola před
dlouhým `.get()`/batchem sama nestačí. Offline/emulator seed nesmí dostat
univerzální živý bypass. Nástroj bez podporovaného zápisu skončí bez změn.
Kontrolní schéma a ochranu vlastník schválil 6. listopadu, pouze lokálně.
Živý řídicí dokument/generace tím nevznikly. [Kontrakt a meze](#r6b-results).

## Živé schéma, migrace a návrat — návrh kontraktu

Navržené privátní cesty, **dosud nevytvořené**:

| Cesta | Účel |
|---|---|
| `feedIndexControl/current` | Verze kontraktu, režim off/building/active/paused, ID zapisované/čtené generace a revize přepnutí. Čtený v každé relevantní transakci. |
| `feedIndexGenerations/{id}` | Identita generace, schemaVersion, stav a inventory/retention revize. |
| `.../cells`, `.../nodes`, `.../retiredRoots`, `.../cellRetention` | Dosavadní laboratorní struktury bez kolekce source; zdrojem zůstává `shouts/{id}`. |
| `.../accountErasures` | Soukromý R5 journal; vazba na inkarnaci žádosti a stávající pevný termín. |

Všechny tyto kolekce server-only, bez přímého klientského čtení/zápisu.
Zakázat automatické indexování payloadů bloků/marks; explicitně povolit pouze
query pole a potřebné složené indexy. Žádné TTL na bloky: mohlo by odstranit
stále dosažitelný uzel. Připravit cílený diff indexů, nikoli nasadit celý starý
soubor konfigurace bez inventury. Stávající deploy přípravné skripty kopírují
explicitní seznam modulů; produkční adaptér se musí do artefaktu přidat a
manifest ověřit. Laboratorní emulator-only guard se nesmí jen odstranit.

Navržená migrace se stínovou generací, bez neohlášeného vypnutí celé aplikace:

1. Přesný commit/CI, read-only inventura projekcí a přístupů, dry-run zápisů,
   digest a samostatný souhlas s konkrétními živými změnami. Dřívější 35řádkový
   preflight není současná inventura. Údaje do archivu/indexu nesmí obejít
   marker smazaného účtu nebo původní retenční termín.
2. Nejprve kompatibilní writer ve všech serverových cestách a artefaktech,
   uzavřené přímé relevantní klientské zápisy, Admin ochrany a recovery.
   Dokud toto chybí, žádný backfill ani přepnutí feedu.
3. Atomicky vyhlásit building generaci. Writer od této revize aktualizuje
   stínovou generaci; reader ještě běží původně. Backfill stránkuje zdroje po ID
   a v každé transakci znovu čte aktuální zdroj a stav přepnutí. Musí umět
   rozlišit nový/neindexovaný zdroj od již vloženého souběžným writerem.
   Protokol a doklad pokrytí smazaných zdrojů vyžadují regresi — pouhé očekávání
   staré řádky v existujícím `prepareBatch` není hotový backfill algoritmus.
4. Audit úplnosti a projekčního digestu za definovaného fence/snapshotu,
   load/Query Explain, časná R5 práce **včetně všech starých generací**,
   ověření prázdných i hustých oblastí. Až pak atomické active přepnutí.
5. Canary query API a nový klient, sledování nákladů/zámků/dostupnosti.
   Podepsaný kurzor musí nést generaci a její retenční revize; neplatný kurzor
   nabídne obnovu, nikoli neúplný feed. Stávající hodinová relace se nemění.

Při rollbacku nejprve zastavit nový reader a přepnout na kompatibilní původní
feed. Writer a R5 musí dál udržovat všechny zachované generace nebo je řízeně
vyřadit a fyzicky uklidit. **Nenasazovat staré backendy bez writeru**, zatímco
kontrola tvrdí active/building. Návrat klienta není návratem dat. Konkrétní
rollback commit/artefakty určit až pro skutečný pilot. Stará generace nesmí
zůstat uložená za původním účtovým deadline ani znovu posloužit jako rollback
zdroj již odstraněných metadat.

<a id="konkretni-nejblizsi-rozsah-ke-schvaleni"></a>

## Rozsah R6a schválený 5. listopadu

Vlastník zvolil „Schvaluji R6a a lokální testy“ pro návrh z commitu 69f2b77.
**R6a — pouze lokálně:** runner nad existujícím R5 (nejvýše 32 kroků a 10 s mezi
transakcemi), cold restart, ztracený lease, souběh workerů, kontrola ukončení
při rozpočtu a evidence všech operací včetně vnějšího guardu. Bez nového živého
scheduleru, adaptérů do skutečných kolekcí, změn Rules, Auth účtů či dat.
Nezvyšovat nynější dávky 32/16 ani retenci. Po měření předložit zbývající
provozní parametry a Admin ochrany jako další konkrétní rozsah.

Přijetí tohoto textu samo nepotvrzuje živou migraci ani dosud neověřené ceny.
Celý MVP milník zůstává otevřený; lokální návrh není důkaz nasazeného feedu.

<a id="r6a-results"></a>

## R6a — ověřený lokální runner

`functions/feed_account_retention_runner_lab.js` vytváří při každém volání nový
adaptér, který pokračuje výhradně z uloženého R5 journalu. Nepřidává callable,
plánovač ani claim/release lease. Vyžaduje přesný emulátor a projekt; povinný
vnější guard předává **do každé transakce**, nikdy pouze před celou smyčku.
Zachovává R5 dávky 32/16 a původní termín. Nezapojuje časnou frontu do živého
workeru a nenahrazuje pravidla guardu: skutečný account purge guard stále
odmítá spuštění před 60. dnem. Časná fronta bude potřebovat vlastní schválený
guard a doklad dokončení; R6a je nezavádí.

Řez vrací complete nebo yielded s důvodem step-budget/time-budget, počtem
potvrzených kroků a metrikami. Nejvýše 32 kroků, časový rozpočet nejvýše 10 s;
menší laboratorní hodnoty lze použít v testu. Hodiny jsou monotónní. Čas se
kontroluje mezi transakcemi, **již běžící transakce může skončit po rozpočtu**.
Virtuální test dvou šestisekundových kroků proto skončí na 12 s a třetí nezačne.
Nejde o tvrdý desetisekundový timeout celé Function.

Chyba okamžitě zastaví smyčku a vrací se jako AccountIndexSliceError s původní
cause a dílčím reportem. Počítá všechny SDK čtecí požadavky, dokončené čtecí
jednotky, neúspěšné čtecí požadavky a pokusy o mutace včetně transakčních retry.
Zvlášť eviduje pouze potvrzené transakce/zápisy/delete. Při ztraceném potvrzení
je výsledek nejistý; nula potvrzených commitů **není důkaz rollbacku**. Skutečné
index entries a náklady neúspěšných RPC z těchto počtů určit nelze.

Complete znamená dokončenou R5 fázi, **ne smazaný účet ani odstraněný journal**.
Dosavadní prepareAccountIndexFinish zůstává zvláštním atomickým krokem vnějšího
postupu. Runner po dosažení complete nepokračuje a neopakuje dokončení účtu.

[Deterministické měření](../../benchmarks/FEED_RETENTION_RUNNER_2026-11-05.json):
80 cizích Shoutů, jeden vlastní a 80 změn jeho palců. Celkem 34 transakčních
kroků ve dvou řezech místo 34 samostatných návštěv; 908 čtecích jednotek,
61 potvrzených zápisů a 246 delete včetně skutečného readAccountPurgeGuard.
Časové hodiny tohoto měření jsou pevné pro stabilní test hranice 32 kroků;
nejde o měření latence. Samotné spojení kroků nesnižuje jejich databázovou
práci. Úsporu invocation/startup a skutečnou délku blokace musí teprve ověřit
cloudový pilot. Neporovnávat cenu přímo s jinak velkými vzorky předchozí tabulky.

Závěrečná sada `feed_account_retention_runner.integration.test.js`: **11/11**.
Pokrývá step/time rozpočty včetně nula kroků, odmítnutí živého projektu a
vadných voleb/hodin, cold pokračování, všech sedm čtení prvního kroku včetně
guardu, ztrátu/převzetí/expiraci lease, změnu žádosti, původní deadline,
souběh správného a cizího tokenu i dvou volání stejného vlastníka, rollback,
ztracené potvrzení a skutečný SDK retry s kódem ABORTED. Retry měl 14 čtení,
čtyři pokusy o zápis a jen dva potvrzené zápisy. Cizí metadata/zdroj a pevný
termín jsou zachované. Sada je v tools test:purge, tedy v běžném CI.

Předtím prošla společná regrese 46/46 (R5, první runner sada, maintenance,
moderace); přidané dvě retry/souběhové zkoušky pak prošly v závěrečné sadě.
Functions unit 109 pass, emulator-only přeskočené bez emulátoru; lint čistý.
Fixture jsou uklizené, žádné živé zápisy/nasazení ani nové Auth účty.

R6a je uzavřená na feature/feed-retention-runner. Zdroj
`7079cdd74d615b05c7c7e3029df89fc9adfcf230` má
[success CI 42114669640](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42114669640):
42 tools, 109 Functions unit, 389 Rules/server, 63 purge, 15 Storage, Flutter
testy/analýza/formát/lint a DEV build. To neaktivuje živý index. Strojové důkazy
jsou build/feed-retention-runner-ci.{json,log} a build/feed-retention-runner-local-proof.json.

Navazující R6b ochrana je popsána níže; není součástí dřívější implementace R6a.
Časná fronta, produkční adaptér, backfill a cloudové ceny/latence dál zůstávají
otevřené brány této listiny.

<a id="r6b-results"></a>

## R6b — ochrana opravných Admin zápisů (6. listopadu)

Vlastník výslovně schválil R6b včetně blokace starých skriptů. Připraveno na
feature/feed-admin-write-guard, bez spuštění oprav na živých datech, nasazení,
změn Rules, Auth účtů či retence. Sdílený modul je
`functions/feed_index_admin_guard.js`; sám nic neinicializuje ani neaktivuje.
Podporuje pouze DEV projekt a přesný místní emulátor shoutout-rules-test.

Kontrakt `feedIndexControl/current` má právě těchto pět polí:

| Pole | Validace |
|---|---|
| schemaVersion | Přesně 1. Neznámá pole/schéma jsou chyba. |
| revision | Nezáporné bezpečné celé číslo. Přechody ani monotónní zvyšování revize R6b neimplementuje. |
| mode | off / building / active / paused. |
| readGenerationId | null nebo ID uvedené i mezi zapisovanými generacemi. |
| writeGenerationIds | Pole různých ID podle stávajícího laboratorního formátu `[a-z][a-z0-9-]{0,39}`. |

Off vyžaduje null reader a prázdné writers. Active vyžaduje reader; paused
null reader a neprázdné writers. Building potřebuje zapisovanou generaci,
při souběžném čtení staré generace také jinou zapisovanou generaci pro build.
Guard žádný z režimů building/active/paused nepovoluje pro legacy root zápisy.

Chybějící kontrolní dokument odpovídá současnému projektu před indexem pouze
tehdy, pokud není žádný záznam v `feedIndexGenerations`. Také explicitní off
se zachovanou generací zápis odmítne. Vadná data se nikdy nepovažují za off.
Budoucí správce musí registrovat generaci před/atomicky s prvním indexovým
zápisem a odstranit její rodičovský záznam až po vyprázdnění všech podkolekcí.
Guard není inventura osiřelých podkolekcí bez rodiče a nenahrazuje řízení
Admin oprávnění. Konzole/držitel neomezeného Admin přístupu ho může obejít.

Kontrola řídicího dokumentu i registru proběhne **ve stejné transakci** jako
oprava. Pokud už přepnutí proběhlo, oprava se odmítne; jinak se úspěšná oprava
serializuje před čekajícím přepnutím. Budoucí aktivace musí měnit tentýž
řídicí dokument. Dřívější preflight samotný nedává oprávnění pozdější dávce.

Čtyři CLI mají preflight (hide pouze pro apply) a každou root dávku přes
applyLegacyFeedAdminUpdates. Každý zdroj vyžaduje původní updateTime; změna
libovolného zdroje vrátí celou dávku. Zachováno 450 u round, 400 u hide,
jednotlivé zápisy u reconcile/geography a nejvýše 50 u staré opravy geohashů.
Celé vícedávkové CLI není jedna transakce: dřívější dokončené dávky se při
pozdějším odmítnutí nevracejí. Ani geokódovací HTTP požadavek nelze rollbackem
odvolat; jeho živé volání nebylo testováno. Neindexované komentářové čítače
zůstávají původní cestou. R6b neopravuje starý vztah zaokrouhlené polohy/geohashe.

Tři seed/reset CLI vždy skončí zprávou legacy-feed-seed-disabled ještě před
čtením credentials, potvrzení nebo síťovou mutací, včetně starého dry-run
vstupu resetu. Read-only inspect nástroj zůstává dostupný. Nepřibyla možnost
obejít ochranu přepínačem. Bezpečný nový fixture/reset postup se teprve navrhne.

Stará applyGeohashRepairPlan zachovává přesný digest, počet a updateTime
preconditions i atomický výsledek. Výstup writes nově obsahuje pouze ID;
runTransaction neposkytuje per-write commit timestamp a pozdější read jej
nemůže nahradit. Historické migrační plány/důkazy se tím nepřepisují.

Ověření: 3 nové kontraktové unit testy, 3 CLI testy blokace před credentials,
8 emulátorových scénářů ochrany a 3 původní geohash regrese (11/11 společně).
Celá Functions unit sada 112 pass, tools 45 pass, lint a syntaxe čisté.
Testy zahrnují oba platné legacy stavy, všechny udržované režimy/vadná data,
zachovanou generaci, stale batch rollback, přepnutí po preflightu, serializaci,
starý schválený geohash plán i vadný rozsah. Jsou registrované v běžném CI.
Skutečné CLI s credentials se nespouštěly; ověřená je jejich syntaxe/zapojení,
sdílené transakční jádro a blokované entrypointy. Fixture jsou uklizené.
Důkazy: build/feed-admin-guard-{regression,unit,tools,lint}.log.

R6b je lokálně uzavřená. Zdroj `e646d79ea730f45f7da95de9b192e737f80132a7`
má [success CI 42243312876](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42243312876):
293 Flutter, 45 tools, 112 Functions unit, 397 Rules/server, 63 purge a
15 Storage, analýza/formát/lint a DEV web build. Strojové důkazy jsou
build/feed-admin-guard-ci.{json,log} a build/feed-admin-guard-local-proof.json.
Žádná živá aktivace nebo oprava dat se tím neprovedla.

Navazující [R6c časná fronta](#r6c-results) má vlastní lokální ověření níže.
R6b ji nezapíná a nezakládá řídicí dokument ve skutečném DEV ani produkčním projektu.

<a id="r6c-results"></a>

## R6c — časná indexová fronta (6. listopadu, pouze emulátor)

Vlastník schválil R6c a lokální ověření po vysvětlení, že stávající purge guard
výslovně vyžaduje původní +60denní termín. Nový modul
`functions/feed_early_erasure_queue_lab.js` tento guard ani účetní worker
nemění. Nemá callable/trigger/scheduler export. Odmítá jiné prostředí než
shoutout-rules-test a přesný host `127.0.0.1:8080`. Auth je předané rozhraní;
testy používají stub, nikoli nově vytvořené účty.

| Laboratorní cesta | Význam |
|---|---|
| `feedErasureQueueLab/{namespace}` | CAS checkpoint omezeného recovery scanu. |
| `.../jobs/{hash}` | UID, přesná request createTime, původní retainUntil, fáze, lease, kurzor/digest inventury a počty cílů. Hash váže projekt, UID a inkarnaci žádosti. |
| `.../jobs/{hash}/targets/{generation}` | CreateTime registrace i indexové báze, epoch inventury, stav a čas dokončení generace. |

R6c mapuje registrované generace na stejně pojmenované `feedIndexLab/{id}`.
Produkční cesty ani skutečný queue namespace tím nejsou zavedené. Před pilotem
musí být jeden koordinátor fronty pro daný registr; testové namespaces nejsou
návod na několik nezávislých živých front nad stejnými bloky.

Enqueue i každý claim vyžadují potvrzeně chybějící Auth účet, aktuální pending
žádost se shodnou createTime a přesně minimální veřejný marker smazání. Guard
ověřuje žádost/marker a lease v každé R5 transakci; nepotřebuje čekat 60 dní.
Nevytváří chybějící potvrzení ani marker. Auth outage není důkaz smazání.
Když se Auth účet znovu najde u již zařazené práce, úkol skončí v needs-review.
Retenční archiv, kanonické Shouty, role a původní retainUntil ostatních dat
se nemění. Test porovnal i updateTime žádosti, kanonického obsahu, archivu a
nedokončené primární práce před/po časném úklidu.

Recovery stránkuje nejvýše 50 žádostí podle ID a znovu cykluje po konci.
Na primární fázi/nextAttemptAt se nespoléhá, takže najde i žádost s již
potvrzeným Auth a markerem, jejíž primární worker skončil needs-review.
Chybějící potvrzení/marker eviduje jako nezpůsobilé, nikoli jako dokončení;
jejich oprava a alarmy zůstávají provozní bránou. Auth chyby nepostoupí
checkpoint. Souběžné recovery používají jeho updateTime CAS.

Nové úkoly se vybírají podle nejbližšího původního retainUntil. Rozpracovaná
due práce má přednost, aby se uvolnily její oblasti. Jeden průchod vezme
nejvýše jeden úkol a jednu stránku inventury nebo výběr cíle nebo R6a řez.
Lease 120 s a retry 60 s přebírají stávající laboratorní vzor; není tím
schválený nový živý interval. R6a zachovává nejvýše 32 kroků / 10 s mezi
transakcemi a čtecí/mazací dávky 32/16. Claim/inventura/finalizace jsou práce
navíc mimo čas samotného R6a řezu. Úkol nesmí být nasazen jako 10s Function
na základě tohoto parametru.

Inventura registru je také stránkovaná po 50, bez stropu celé sady generací.
Zahrne všechny registrované generace, včetně zachovaných mimo současný reader.
Chybějící kontrolní generace, vadný registr/báze nebo ztracený target vedou
k odmítnutí dokončení. Každý target váže createTime registrace a indexové báze;
výměna inkarnace během zpracování je needs-review, nikoli důvod automaticky
smazat její fence. Lease takeover rovněž nedovolí starému workeru uvolnit lease
nového vlastníka.

Epoch registru je hash createTime/updateTime řídicího dokumentu. **Každá změna
členství/incarnace registru musí atomicky změnit tentýž kontrolní dokument.**
R6c toto ověřuje na kontrolované fixture; skutečný registrátor ještě není
implementovaný. Platí také R6b zákaz odstranit rodiče generace před vyprázdněním
jejích podkolekcí. Bez těchto invariantů nelze doklad použít jako důkaz úplnosti.

Při změně epoch během aktivního úklidu se dokončí rozpracovaná generace a až
pak obnoví inventura. Již dokončený target se znovu použije jen při shodě obou
createTime. Nová generace zneplatní starý globální doklad; verify vrací
registry-changed a run vrací stale-proof. Recovery/enqueue ji opět zařadí.
Čítače pending/done a digest celé sady brání tomu, aby chybějící target vypadal
jako prázdná dokončená fronta. Výběr ověřuje i hash identity proti klíči úkolu.

Dokončení jednoho targetu je jedna transakce: kontrola lease/identity/generace,
R5 prepareAccountIndexFinish, odstranění jeho journalu a activeErasure,
označení targetu a zvýšení doneCount. Injekce chyby před commitem vrátí všechny
tyto změny. Při ztraceném potvrzení commit může být uložený; cold pokračování
se řídí databází a neprovede druhé vymazání. Teprve prázdná pending sada se
shodnými počty a epoch dokončí celkový doklad.

Celkový doklad je serverový stav svázaný s inkarnací žádosti, epoch registru,
digestem generací a původním retainUntil. Verify vždy znovu čte aktuální
žádost, marker a kontrolní dokument. **Stávající konečný purge ho zatím
nečte**; jeho původní Auth/deadline kontroly zůstávají stejné. Před živým
pilotem propojit aktuální doklad i jeho soukromé job/target záznamy s konečným
úklidem v původním +60d. Datum samo dokumenty neodstraní. Selhání registru,
identity či R5 může ponechat chráněné oblasti zablokované pro ruční kontrolu;
prototyp není garance termínu při výpadku služby.

Ověření: 18/18 závěrečných testů; předtím 29/29 společně s R6a. Zahrnují
studené pokračování dvou generací před deadline, zachování obsahu/archivu,
recovery bez úspěšné primární fáze, oba pagery (51 generací v 50+1), Auth
outage/existující účet, claim/retry/takeover, změnu/revizi/inkarnaci registru,
záměnu žádosti, atomický finish/rollback/ztracené potvrzení, CAS recovery,
vadný klíč a chybějící cíle. Functions unit 113 pass, lint čistý. Nová sada
je v tools test:purge, tedy v běžném CI. Emulátor neověřuje potřebné cloudové
složené indexy, jejich Query Explain ani náklady.

Dvougenerační scénář použil 18 laboratorních volání s uměle sníženým řezem
na dva kroky a posouvanými hodinami; nejde o cloudovou latenci/cenu ani
schválenou frekvenci Scheduleru. Důkazy: build/feed-early-queue-{final,regression,
unit-final,lint-final}.log. Fixture byly uklizené. Žádné živé kolekce, indexy,
Auth účty, migrace, Rules, prostředky nebo nasazení se neměnily.

R6c je lokálně uzavřená na feature/feed-early-erasure-queue. Zdroj
`75ce8f35c7fb335fca16c08324aaad8394015610` má
[success CI 42251697874](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42251697874):
293 Flutter, 45 tools, 113 Functions unit, 397 Rules/server, 81 purge,
15 Storage, analýza/formát/lint a DEV web build. Důkazy jsou
build/feed-early-queue-ci.{json,log} a build/feed-early-queue-local-proof.json.
Živý index, plánovač a konečný purge tím nebyly změněné.
