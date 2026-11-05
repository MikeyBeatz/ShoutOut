# Provozní návrh prostorového indexu

5. listopadu 2026. **R6a schválená a lokálně ověřená; zbývající provozní návrh
není schválená živá konfigurace.** [Výsledek runneru](#r6a-results).
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

1. R6a více omezených kroků, obnovy a vnějšího guardu je lokálně ověřená níže.
   Následuje konkrétní návrh vynucené ochrany Admin nástrojů a schématu přepnutí.
2. Připravit včasnou indexovou frontu po potvrzení odstranění Auth, produkční
   adaptér za vypnutým přepínačem a přesný migrační nástroj. Každý z těchto
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
  práci, ne slepé přeskočení. Dnes takový časný doklad implementovaný není.
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
| `reconcile_counters.mjs` | Dnes mění palce **i polohu**, bez přepočtu geohashe/indexu. Za aktivní generace blokovat, později transakční opravný nástroj s dry-runem. |
| `round_shout_locations.mjs` | Dnes mění polohu bez geohashe/indexu. Blokovat; případná oprava musí měnit všechny odvozené údaje atomicky. |
| `backfill_shout_geography.mjs` | Geography samotná není v projekci, nástroj ale může doplnit kořenový geohash. Tuto větev blokovat bez writeru. |
| `seed_test_users.mjs`, `reset_integration_scenario.mjs`, `seed_moderation_queue.mjs` | Přímé seed/overwrite blokovat za aktivní generace; používat pouze vyhrazenou fixture cestu nebo budoucí writer. Live-activity větev prvního nástroje stále vynechává geohash. |
| `hide_deleted_account_shouts.mjs` | Přímé statusové batch zápisy blokovat; živý worker už má bezpečnější serverovou cestu. |
| Jednorázová oprava geohashů | Historicky schválená a provedená; starý nástroj nesmí být znovu použit jako výjimka z writeru. |
| Geography trigger v `functions/index.js` | Mění pouze `geography`; nevyžaduje indexovou verzi. Ověřit to regresí, až se změní schéma projekce. |
| Komentářové/saves počty, profily a role | Samy nejsou indexovanými Shout palci/polohou. Nepřidávat zbytečné blokové zápisy; případné změny Shout Business flagů už writer vyžadují. |
| Ruční Admin SDK, konzole, jiné servisní identity | Rules je nezastaví. Omezit provozní přístup a evidovat opravy; sdílená ochrana nástrojů není bezpečnostní bariéra proti držiteli neomezeného Admin oprávnění. |

Lokální nejbližší varianta: společný serverový kontrolní dokument/generace
kontrolovaný **ve stejné transakci jako zápis nástroje**. Přepnutí generace mění
týž dokument, takže souběh nemůže obejít starý preflight. CLI kontrola před
dlouhým `.get()`/batchem sama nestačí. Offline/emulator seed nesmí dostat
univerzální živý bypass. Nástroj bez podporovaného zápisu skončí bez změn.
Kontrolní schéma a ochranu je potřeba schválit před úpravami těchto nástrojů.

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

Další konkrétní návrh má řešit společný přepínací dokument a transakční
odmítnutí nekompatibilních Admin zápisů za building/active generace. Není
součástí implementace R6a. Časná fronta, produkční adaptér, backfill a cloudové
ceny/latence dál zůstávají otevřené brány této listiny.
