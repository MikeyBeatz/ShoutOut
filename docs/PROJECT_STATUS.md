# ShoutOut – aktuální stav pro navázání práce

Souhrn k 11. listopadu 2026. Dokládá poslední ověřené výsledky; před dalším
nasazením znovu ověřit Git, CI a skutečný cíl. Úplná starší chronologie je v
[archivním indexu](archive/README.md), priority v [TODO](TODO.md).

## Další konkrétní krok

**Doplnit chybějící živé UI potvrzení Uložených; připravit návrh B1.**
Oprava na `fix/saved-shouts-pagination`, zdroj
`dbf2aad2b5d5ab7490fa716318625ea1d0705697`, má
[success CI 42932603771](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42932603771):
328 Flutter, 50 tools, 119 Functions unit, 436 Rules/server, 116 purge a 15 Storage,
formát/analýza/lint/build. Nasazený je pouze DEV Hosting `de78cfc631c1acc1`
z čistého releasu; otisky čtyř souborů obou originů souhlasí. Všech 18 Functions
a Firestore Rules se podle API nezměnilo. Oba existující testovací účty mají
přes živé jádro ověřené uložení, odebrání/obnovení i idempotentní replay bez zápisu;
nejde o HTTP Auth/App Check ani UI důkaz. Dva nové aktivní Shouty
`mvp-saved-20261111-{user,business}` mezitím vypršely a jsou od 16:11 SEČ
uklizené přes indexový writer: 2 kořeny, 4 záložky a 8 receipt, nulový zůstatek
v aktuálním indexu. Původních 37 zdrojů má stejné updateTime, Auth se neměnil.
Browser host není dostupný; náhradní ovládání PWA automatická kontrola odmítla
kvůli neověřitelné URL. Dotaz vlastníkovi je odeslaný: pod TestBusiness nebo
Bright_Otter_182 odebrat jednu testovací záložku a ověřit zmizení karty i po obnově.
Odpověď s výsledkem UI zatím není zaznamenaná. Původní expired fixture již
nepoužívat pro nové ověření ukládání; čerstvý test vyžaduje konkrétní rozsah.
Živá UI akceptace A2/A3 zůstává otevřená, úklid je dokončený.
Návrat webu je `831e3baaea8a8df3`. Produkce, main, retence a Auth beze změn.
[Rozsah a checkpoint](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression).

Na `feature/feed-reading-proposal` je připravený
[konkrétní návrh B1](plans/feed/FEED_READING_POLICY.md#b1-proposal): webové
IndexedDB podle projektu/UID, skutečná expozice nadpisu/textu a místní fronta
bez nových Firebase operací. Navržené uchování do expiresAt + 7 dní a další
implementace/čerstvé dva živé fixture čekají na rozhodnutí vlastníka.
Zatím pouze dokumentace; kód, přepínače, nasazení a B1/B2/B3/B4 se nezměnily.

**Předchozí uzavřená část: vlastní seznam a expired interakce.**
Vlastní stránky, menší pokračování až za poslední kartou a zámek interakcí
po expiraci jsou uzavřené v DEV. Zdroj `14b7885b35b89f62633a3d7496e10483fa91a739`
na `feature/expired-shout-read-only` má
[success CI 42902048239](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42902048239):
316 Flutter, 50 tools, 119 Functions unit, 434 Rules/server, 116 purge a 15 Storage,
formát/analýza/lint/build. Nasazené jsou pouze tři Functions, Rules a DEV web
`831e3baaea8a8df3`; zdrojové archivy, prostředky, HTTP 401 i oba webové originy
souhlasí s čistým releasem. Vlastník potvrdil tlačítko za kartami, zachování
scrollu i neaktivní interakce při zachovaném čtení detailu. Browser host je
nedostupný; jde o jeho UI potvrzení, ne automatizovaný browserový průchod.
Živé jádro přes Admin SDK ověřilo dva schválené krátce platné Shouty:
před expirací interakce prošly, po ní pět nových akcí na každém selhalo,
čítače i vedlejší data zůstaly stejné a původní receipt se opakoval bez zápisu.
Nejde o náhradu HTTP Auth/App Check testu. Oba nové Shouty, 10 potomků a 18
vedlejších záznamů jsou uklizené. Po UI potvrzení je uklizených také původních
120 fixture, 27 receipt a 1 oznámení; v aktuálním indexu nezůstala jejich metadata.
Původních 37 Shoutů má shodné updateTime; Auth účty se nevytvářely ani nemazaly.
Výjimky pro vlastní mazání, moderaci a účtový úklid platí; retence se nemění.
Chování Uložených při čekání/chybě/pokračování řeší novější úsek výše;
jeho živé UI potvrzení zatím zbývá, úklid je hotový. B1–B4 ani celý milník hotové nejsou.
[Pravidlo, hranice a testy](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#expired-interactions).

Dosavadní nasazené vlastní stránky: vlastník schválil konkrétní opravu
„Mé shouty“ 10. listopadu. Na `fix/own-shouts-pagination` je dokončený
getOwnShouts, vlastní klientské stránky i živé karty/mazání. Celá Flutter sada
313/313, analýza a lint čisté, 9/9 cílených serverových regresí (6 own / 3 saved),
16/16 cílených klientských regresí a 2/2 testy balíčků. Zdroj
`4e7e5bdfd9e026a2ff76b253a9a233fee2022f65` má
[success CI 42884625807](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42884625807).
Pouze v DEV byl nasazený jeden dotazový index READY, Function getOwnShouts
`00001-fik` a web `4c61d6a850b330b7`; 42 modulů Function i otisky webu na
obou originech souhlasí s čistým releasem. Živé jádro přes Admin SDK vrátilo
vlastní expired stránky 50 + 10 běžnému účtu a 50 + 11 Business (60 fixture
a jeden původní Shout), bez duplicit/cizích autorů a od nejnovějších.
Query Explain: první stránka 50 dokumentů / 51 indexových položek / 51 read
operations; nejde o celkovou cenu celé callable včetně kontrol účtu.
Vlastník ověřil Business další stránku až na konec, palce a mazání. Tlačítko
bylo nenápadné a pokračování přesunulo seznam nahoru. Příčina je lokálně
reprodukovaná: vložení progress indikátoru znovu vytvořilo neoznačený Expanded
a ScrollPosition (offset 3716 → 0). Oprava stabilní identity obsahu a výraznějšího
tlačítka má 17/17 cílených regresí včetně skutečně čekající síťové odpovědi,
314/314 celé Flutter sady a čistou analýzu. Zdroj
`ce6b07a6ca0670235da8da3ab44bbcf91fa98b40` má
[success CI 42890208984](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42890208984)
a byl nasazený pouze na DEV Hosting `fa0a450ecbce236e`; obě adresy souhlasily
s čistým release manifestem. První testy
vracely Future ihned, takže přechodový loading frame nepokryly.
Logy potvrzují platné Auth/App Check a HTTP 200 pro stránky/palce/mazání;
rychlé palce občas vrátily 429, v souladu se stávajícím odstupem 1 sekundy.
Limity ani obecná hláška se neměnily. Před závěrečným úklidem byly dva fixture
deleted, 118 expired, bez podkolekcí, původních 37 zdrojů beze změny;
uložení a okamžitou změnu počtu vlastník mezitím potvrdil. Změnu tlačítka
a novou politiku expired uzavírá úsek výše včetně úklidu.
Test záložky u expired se týkal ikony/počtu v Mé shouty;
sekce Uložené podle dosavadní politiky vrací jen aktivní obsah.
Na `feature/feed-page-integration` je
nový prostorový feed skutečně zapojený v `shoutout-dev-46c81`: osm Functions,
Rules, podpisový klíč, indexy, aktivní generace `feed-v1` i web.
Aktivační zdroj **ccc879f485caa24374cadc1dba49ddcec50a4a95** má
[success CI 42358058964](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42358058964).
Nasazovalo se z čisté samostatné kopie v pořadí server → index → web.
Obsah nasazených Functions byl porovnaný se zdroji (41/37 modulů), web
s release manifestem; konkrétní revize jsou v tabulce níže.

Živý serverový test pod existujícími Bright_Otter_182/TestBusiness prošel:
50 → 100 → 120, žádné duplicity, vzdálenost, kategorie, radius, Top/Končící/
Sledované, odmítnutí cizího kurzoru, idempotentní reakce, záložka/odebrání
a stabilní pořadí až do obnovy. Jde o test jádra přes Admin SDK, nikoli
náhradu klientského Auth/App Check. Vlastník samostatně potvrdil zobrazení
po zvětšení dosahu i načítání dalších stránek v Business webu; serverové logy
to potvrzují platným Auth/App Check a třemi HTTP 200 (0,52–1,07 s na serveru).
Minutový worker běží na nové revizi bez chyb; rozvrh a obsahová dávka se neměnily.

**Read-only kontrola před úklidem 11. listopadu:** z původních 120 Shoutů
`mvp-feed-20261107-*` bylo 118 expired a 2 deleted, bez konfliktů a podkolekcí;
1 testovací oznámení, 37 původních zdrojů se shodným updateTime a feed-v1 active.
Důkaz `build/feed-resume-inventory.json` předcházel úklidu; aktuální nulový
zůstatek dokládá `build/own-shouts-cleanup-proof.json`. Žádný Auth účet se
nevytvářel ani nemazal. Identifikace fixture a výsledky jsou v
[záznamu rolloutu](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#dev-rollout-results).
Plovoucí obnova je nyní **pouze ikona vpravo nahoře**, ze zdroje
`f08abf97cf34686a7c776848c01bb7627ca08719` na `fix/feed-refresh-top-right`,
[success CI 42363878639](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42363878639).
Lokálně 15/15 widget/session testů a čistá analýza, včetně šířky 320 bodů,
nekolidujícího zvonku a chování scrollu. Oba DEV originy odpovídají manifestu
nového release; vlastník tuto polohu potvrdil a požaduje stejný plovoucí
styl také pro oznámení. **Plovoucí zvonek je od 10. listopadu nasazený** vlevo
od obnovy se stejným odznakem a jediným dosavadním odběrem. Zdroj
`1fbf2ae40d34802069c365559c74d402a26f0b37` na `fix/feed-floating-notifications`
má [success CI 42365663624](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42365663624).
Lokálně 15/15 widget/session testů a čistá analýza; ověřený dosah obou
tlačítek po scrollu a otevření oznámení bez dalšího načtení feedu.
Přerušení ponechalo hotový build před nasazením; před navázáním bylo ověřené,
že DEV stále vydával předchozí f08abf9. Nyní oba DEV originy odpovídají
novému manifestu. Vlastník nyní potvrdil hotový zvonek; tato UI připomínka je uzavřená.
Functions, Rules ani data se těmito UI rollouty neměnily.
Je třeba doplnit zbývající regresi Uložených; vlastní reakce/uložení, nové
tlačítko, zámek expired i úklid jsou uzavřené. Celý feed/milník tím není hotový.
Jeden lokální SDK vzorek měl 65,8 s;
příčina není potvrzená, toto měření není cloudová latence ani cenový benchmark.

Produkce/main se neměnily. Produkční účtový wrapper a provozní konfigurace
nadále patří do startovní brány. Před MVP dál zbývají B1–B4 a poslední regrese
Uložených; vlastní zdroj Aktivní/Expirované je uzavřený. Starší R6 výsledky níže
popisují tehdejší lokální etapy; současné zapnutí dokládá tento rollout.

[R6e](plans/feed/FEED_RUNTIME_PROPOSAL.md#r6e-results) je lokálně uzavřené na
feature/feed-runtime-adapter. Zdroj 9a054bb66f4e871de305d4af02ebcd41a9ec6188 má
[success CI 42292159081](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42292159081):
293 Flutter, 47 tools, 115 Functions unit, 398 Rules/server, 106 purge,
15 Storage, analýza/formát/lint a DEV web build. Lokálně také 47/47 závěrečných
regresí a načtení obou artefaktů se shodnými exporty. Společná factory writeru,
časné fronty a koordinátoru je ve wrapperech za **vypnutou** volbou; při off
nevznikají nové databázové přístupy. Lab ochrany, dávka 50 a retence zůstávají.
Důkazy: build/feed-runtime-ci.{json,log}, build/feed-runtime-local-proof.json
a lokální logy uvedené v R6e. Žádné nasazení, živá data, Rules, Scheduler ani nové Auth účty.
Navazující provozní plánování, instalační nástroj a API/klient jsou nyní
připravené ve výše uvedené integraci. Pouhé přepnutí volby na true není
hotový rollout; živý datový/klíčový přechod má vlastní schvalovací bránu.

[R6d koordinace purge](plans/feed/FEED_RUNTIME_PROPOSAL.md#r6d-results) je lokálně
připravená na feature/feed-purge-proof-coordinator. Volitelný koordinátor
využije aktuální doklad bez globálního rescanu, jinak obnoví omezenou práci;
po původním termínu dočistí targets a atomicky smaže hlavičku s žádostí.
Finalizing brání obnově dokladů během dočišťování; purgeRevision chrání
recovery checkpoint proti návratu UID. Původní Auth/lease/retence zůstávají;
bez koordinátoru dosavadní cesta. Finálních 14/14 regresí, unit 114 pass,
lint čistý. Žádné nasazení, živá data, Rules, plánovač ani nové Auth účty.
Důkazy: build/feed-purge-coordinator-{final,unit-final,lint-final}.log.
R6d je lokálně uzavřená: zdroj c7c1fef708e93a5a50ca73d6549d22d777d33543 má
success CI 42258910004 — 293 Flutter, 45 tools, 114 Functions unit,
397 Rules/server, 95 purge, 15 Storage, analýza/formát/lint a DEV build.
Strojové důkazy: build/feed-purge-coordinator-ci.{json,log} a
build/feed-purge-coordinator-local-proof.json. Zdroj i dokumentace jsou pushnuté.

[R6c časná fronta](plans/feed/FEED_RUNTIME_PROPOSAL.md#r6c-results) je připravená
na feature/feed-early-erasure-queue. Pouze emulátor: nezávislé recovery,
lease/guard, stránkované generace, inkarnace/digest, R6a řez a atomický doklad
se zavřením R5 journalu. Lokálně 18/18 závěrečných testů a předchozí společná
regrese 29/29, Functions unit 113 pass a lint. Primární obsah/archiv/žádost
zůstaly v testu shodné včetně updateTime; původní deadline se neprodlužuje.
Živý worker doklad dosud nekonzumuje; lokální volitelné zapojení přidává R6d
výše. Žádné živé změny, plánovač, Rules ani nové Auth účty.
Důkazy: build/feed-early-queue-{final,regression,unit-final,lint-final}.log.
R6c je lokálně uzavřená: zdroj 75ce8f35c7fb335fca16c08324aaad8394015610 má
success CI 42251697874 — 293 Flutter, 45 tools, 113 Functions unit,
397 Rules/server, 81 purge, 15 Storage, analýza/formát/lint a DEV build.
Strojové důkazy: build/feed-early-queue-ci.{json,log} a
build/feed-early-queue-local-proof.json. Zdroj i dokumentace jsou pushnuté.

[R6b Admin ochrana](plans/feed/FEED_RUNTIME_PROPOSAL.md#r6b-results) je lokálně
připravená na feature/feed-admin-write-guard: striktní kontrolní kontrakt,
transakční kontrola off/žádná generace, updateTime preconditions čtyř opravných
CLI a staré geohash opravy; tři seed/reset CLI blokované před první mutací.
11/11 emulátorových regresí, 112 Functions unit, 45 tools, lint/syntaxe prošly.
Žádný živý řídicí dokument, generace, opravy, Auth účty či nasazení.
Důkazy: build/feed-admin-guard-{regression,unit,tools,lint}.log.
R6b je lokálně uzavřená: zdroj e646d79ea730f45f7da95de9b192e737f80132a7 má
success CI 42243312876 — 293 Flutter, 45 tools, 112 Functions unit,
397 Rules/server, 63 purge, 15 Storage, analýza/formát/lint a DEV build.
Stav a úplný log: build/feed-admin-guard-ci.{json,log}; souhrn
build/feed-admin-guard-local-proof.json. Pracovní změny jsou commitnuté a pushnuté.

[Schválený lokální R6a runner](plans/feed/FEED_RUNTIME_PROPOSAL.md#r6a-results)
je připravený na feature/feed-retention-runner. Nejvýše 32 kroků / 10 s mezi
transakcemi, dávky 32/16, povinný transakční guard; žádný nový lease/scheduler.
Závěrečných 11/11 runner testů a předchozí společná regrese 46/46 prošly,
unit 109 pass a lint čistý. Včetně guardu naměřeno 34 kroků ve dvou řezech,
908 čtení / 61 zápisů / 246 delete; nejde o cloudovou latenci ani úsporu čtení.
Chyby zachovají cause a dílčí metriky, ztracený commit ack neznamená rollback.
Dokončení journalu zůstává vnější atomický krok. Bez živých dat, Auth či nasazení.
Důkazy: build/feed-retention-runner-{regression,final,unit,lint}.log a
[benchmark](benchmarks/FEED_RETENTION_RUNNER_2026-11-05.json).
Zdroj 7079cdd74d615b05c7c7e3029df89fc9adfcf230 má success CI 42114669640:
42 tools, 109 Functions unit, 389 Rules/server, 63 purge a 15 Storage,
Flutter testy/analýza/formát/lint i DEV web build. R6a je lokálně uzavřená;
provozní adaptér ani živá aktivace tím nejsou schválené.
Důkazy: build/feed-retention-runner-ci.{json,log} a
build/feed-retention-runner-local-proof.json.

Provozní návrh z 69f2b770dcf2dce13dc172de035daf60f3ca21aa má success CI 42112092816.
Čtyři emulátorové vzorky
měří celou R5 inventory i zavření journalu: 15–116 kroků, 161–3 919 čtení,
33–244 zápisů a 21–1 071 mazání. Model jednoho kroku/min drží oblast 8–79 minut;
takto živě nezapínat. Studený restart každého kroku, odstranění autora,
cizí kontrolní zdroj a audit prošly, fixture jsou uklizené. DEV databáze
read-only potvrzena Standard/europe-west3; produkční dotaz vrátil 403, parametry
nejsou ověřené. Regionální sazby/SKU, cloudové index entries/runtime a konkrétní
pilot zůstávají neověřené. Důkazy a návrh včetně Admin zápisů/migrace/návratu:
[měření](benchmarks/FEED_RUNTIME_2026-11-05.json). Žádné nasazení ani živá data.
Lokální měření prošlo ve všech čtyřech vzorcích; ochrana nástroje bez emulátoru
odmítá spuštění. Prošlo 42/42 tools testů, syntaxe nástroje, diff-check a
kontrola dokumentace (522 odkazů, žádná chyba/osiřelý dokument, archivy shodné).

Moderační indexový úsek na feature/feed-moderation-index je lokálně uzavřený:
zdroj cda647e575090711b2a87944f8a45523dbfd7de9 má success CI 42107616925:
293 Flutter, 42 tools, 108 unit, 389 Rules/server, 52 purge/15 Storage,
analýza/lint/formát/build. Lokálně také 35/35 cílených testů (11 nových).
Opravený neplatný plán a mazání/expirace zachovaného zdroje po R5; role,
oprávnění a retence zůstávají stejné. Nic se nenasazovalo a živý index je
stále mimo tento souhlas. Celé serverové rozhodnutí/report/audit je jiný milník.
Důkazy: build/feed-moderation-index-ci.{json,log}, build/feed-moderation-index-local-proof.json.
[Nálezy a přesný rozsah](plans/feed/FEED_WRITER_INTEGRATION.md#moderation-regression).

R5 je schválené a lokálně připravené na feature/feed-account-retention:
verze dotčených oblastí, ochrana autora, pokračovatelný fyzický úklid bloků,
cache/kurzory a volitelné dokončení přes skutečný účtový worker. Zdroj
2909874312f0e72f48d09c9ad468817cbdb10877 má success CI 42076107087: 293 Flutter,
42 tools, 108 unit, 389 Rules/server, 41 purge/15 Storage, analýza/lint/formát/build.
Lokálně také konečná regrese 61/61 včetně 15 R5 případů a skutečného účtového
workeru; tento předchozí lokální úsek je uzavřený. Provozní brána indexu
zůstává otevřená. Důkazy: build/feed-account-retention-ci.{json,log}
a build/feed-account-retention-local-proof.json. Nic se nenasazovalo.
R5 umožňuje dřívější obnovu dotčené relace, nezavádí další hodinovou retenci.
Provozní brána zůstává otevřená: včasná příprava, globální inventory/náklady,
serializace úklidu a délka dočasné blokace zápisů ve stejné oblasti.
[Rozhodnutí, protokol a meze](plans/feed/FEED_INDEX_RETENTION.md#account-retention-proposal).
Maintenance/purge i dávková příprava mají lokální propojení. Živý index ani
migrace dosud nejsou schválené. Účtová DEV část je včetně závěrečného pilotu
uzavřená, její fixture je uklizená. Kritéria a důkazy:
[účtový plán](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#aktualni-stav).

Na feature/feed-maintenance-index-writer je dokončené předání writeru přes celý
tick, ošetření již anonymizovaného Shoutu v konečném purge a indexové odpočty
bez zbytečných změn při odebrání záložky. Zdroj c410ce3f46403c35f87d04befee4d8358acf396d
má CI 42063945148 success: 293 Flutter, 42 tools, 107 unit, 389 Rules/server,
25 purge/15 Storage, analýza/lint/formát/build. Lokálně prošlo 45/45 cílených
emulátorových testů (10 nových) a kontrola dokumentace; lokální úsek je uzavřený.
Zahrnuje rollback, lost ack a zachování cizího obsahu. Živý wrapper index
nepředává, žádné nasazení ani živá data. Hodinová historie sama negarantuje
pevnou účtovou retenci; to zůstává povinná brána, nikoli změna schválené lhůty.
[Kontrakt a meze](plans/feed/FEED_WRITER_INTEGRATION.md#maintenance-purge).
Důkazy: build/feed-maintenance-ci.{json,log}, build/feed-maintenance-local-proof.json.

Na feature/feed-batch-index-writer je dokončený schválený lokální prepareBatch
a volitelné zapojení do prepareAccountDeletion, zdroj
1ba2b4ac94ecc6d1f519e168e794172e3260d0aa. CI 42053726540 success: 293 Flutter,
42 tools, 107 Functions unit, 389 Rules/server, 15 purge/15 Storage, analýza/lint/build.
Lokálně také konečných 18 cílených emulátorových testů a předchozích 38 indexových
regresí. Pro
50 Shoutů v jedné oblasti naměřena 3 indexová čtení, 1 nový blok/kořen/archiv;
celkem 54 zápisů včetně zdrojů a receipt. Dávkový lokální úsek je uzavřený.
Živý wrapper writer nepředává; nic se nenasazovalo a žádná živá data neměnila.
[Kontrakt, měření a meze](plans/feed/FEED_WRITER_INTEGRATION.md#batch-preparation).

Vlastník schválil další lokální úsek 4. listopadu: povinné serverové mazání
účtu/Shoutu pro všechny DEV klienty a zákaz přímých zápisů v emulátoru. Kód
a testy jsou dokončené na fix/dev-deletion-server-cutover, zdroj
7ab60c88892921101215076690a73837e15b94b4. CI 41915977658 success: 293 Flutter,
42 tools, 107 Functions, 375 Rules/server, 15 purge/15 Storage, analýza/lint/build.
Lokálně také konečných 48 cílených worker/cutover testů a čistý DEV release build,
ověřený manifest/cíl shoutout-dev-46c81. Pracovní i release kopie jsou čisté.
Po navazujícím souhlasu vlastníka je tento web i Firestore Rules nasazený pouze
v DEV: Hosting f5c7ef14f1b5e04b, ruleset c70b6f10-a51e-415d-aef5-8f8b685adb3d,
normalizovaný hash e93fee381fd8a96f3a3c02a87211c0e5a4989e7bc28502cb7a5754dd24c30dc0.
Oba originy odpovídají čistému release; Functions/Storage Rules/IAM/plánovače
a původní účtová inventura zůstaly shodné. Jeden nový dočasný Auth účet měl
schválené dva vlastní Shouty, cizí kontrolní Shout a cizí komentář. Vlastní čtení
vrací 200, čtyři přímé zápisy 403 PERMISSION_DENIED bez změny dat/updateTime.
Vlastník potvrdil první UI pokus s návratem na přihlášení bez problému a odmítnuté
další přihlášení. Server potvrdil Auth absent, jednu přípravu před žádostí,
Auth/App Check VALID, content-archived, marker a purge scheduled v původním +60d.
Dřívější token smí číst vlastní žádost, ale její smazání/změna retence vrací 403
bez změny dat/updateTime. Cizí obsah je zachovaný; kontrolní Shout během přerušení
pouze řádně expiroval, jeho ostatní pole odpovídají původnímu digestu.
Fixture včetně přihlašovacích údajů a dočasného klientského tokenu je uklizená.
Oba originy, nezměněné ostatní vrstvy a původní inventura po úklidu znovu ověřené.
UI provedl vlastník kvůli nedostupnému browser hostu. Důkazy:
build/deletion-cutover-post-cleanup-proof.json a build/deletion-cutover-live-test/.
[Kompatibilita, rozsah a návrat](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#dev-deletion-cutover).

DEV má zapnutou přípravu po 50 Shoutech, společný první/resume pokus a potvrzení
s blokujícím průběhem. Nový i starší kompatibilní tok byly živě ověřené a fixture
uklizené. Potvrzení/průběh i oprava odběrů mají widgetové testy, shodu artefaktů
a nový živý průchod bez Uncaught Error.
Nasazené vrstvy a důkazy jsou níže; účtový DEV cutover i závěrečný test jsou uzavřené.

DEV má zapnutou serverovou finalizaci a9ff425: atomická kontrola vlastních aktivních
Shoutů a založení žádosti, potom klientské potvrzení commitu před Auth.delete.
Oba přepínače přípravy/finalizace jsou true. Function je ACTIVE a anonymní volání
odmítá HTTP 401. Vlastník zrušil omezení na lokální práci a schválil průběžné DEV
rollouty s kontrolami. Následný cutover výše uzavírá žádosti a přímé skrytí Shoutu;
ostatní obsahové přímé zápisy ještě neuzavírá.

Web c2409e0587c42bcbc34008c881395a06c294549f nahrazuje zastaralé Source.server čtení
žádosti čtecí transakcí s maxAttempts=1, bez zápisů či změny oprávnění. Selhání
ensure-request / unconfirmed-account-deletion-request se podařilo vysvětlit
reprodukcí opožděného Watch stavu v emulátoru (5/5); dva nové regresní testy prošly.
CI 41715769367 success: 280 Flutter, 42 tools, 107 unit, 369 Rules/server,
15 purge/15 Storage, analýza/lint/build. Bezpečné konzolové stage/code zůstávají,
bez zpráv výjimek, osobních údajů, tokenů či nového ukládání dat.

Po této opravě vlastník potvrdil průběh a přihlášení při resume. Server ověřil
odstraněný Auth, právě jednu přípravu a žádost, validní Auth/App Check + HTTP 200,
zachovaný cizí obsah, content-archived, minimální veřejný marker a purge scheduled
s původním +60denním termínem. Fixture včetně údajů je uklizená, původní inventura
shodná. Důkazy jsou v ignorovaném build/account-finalization-diagnostic-recovery-test;
happyPathVerified=false, protože šlo o pokračování po předchozí chybě.

Kontrola 4. listopadu znovu potvrdila oba originy proti čistému release,
Hosting a59b75f1d27dc90d, stejné Functions/Rules/IAM/plánovače a původní inventuru.
Nový první pokus vlastník dokončil s návratem na přihlášení. Server potvrdil Auth
absent, jedinou přípravu před žádostí, validní callable, zachovaný cizí obsah,
content-archived, marker a purge scheduled s původním termínem. Test i údaje jsou
uklizené a původní inventura shodná. Důkazy build/account-finalization-first-attempt-test
mají happyPathVerified=true pro funkční tok; neznamená to konzoli bez chyb.
Vlastník doložil 3 Uncaught Error z Firestore Watch při reauth/sign-out a chyby
feed interakcí permission-denied. Dva odběry blocked/following v home.dart neměly
onError; konkrétní odběratel třetí dokumentové chyby ze starého stacku není potvrzený.
Noto fonty jsou samostatné upozornění.
Vlastník 4. listopadu schválil opravu odběrů, CI/DEV web a jeden nový dočasný Auth
test včetně smazání a úklidu. Na fix/account-live-subscription-lifecycle je lokálně
hotová obsluha chyb blocked/following, ukončení starých UID scope při Auth změně,
guard doručování/pozastavených událostí u dokumentů/dotazů/rolí a bezpečný teardown.
Aktivní chyby se dál předávají UI; autentizační odběr ani jiné app scope se neruší.
19 cílených testů, konečných 289 Flutter, formátování a analyzátor prošly.
Zdroj 776e147e46d98c8b9f8d3eb5409e87bb381d013e má success CI 41908033275:
289 Flutter, 42 tools, 107 unit, 369 Rules/server, 15 purge/15 Storage, lint/analyze/build.
DEV Hosting b274e8c83ebd616a je nasazený; oba originy shodné s čistým release,
nové diagnostické markery v JS ověřené, backend/Rules/IAM/plánovače a původní inventura
nezměněné. Vlastník potvrdil logout/relogin i smazání bez Uncaught Error. Server
potvrzuje Auth absent, jedinou přípravu před žádostí, zachovaný cizí obsah,
Auth/App Check VALID a HTTP 200. Worker dokončil content-archived, marker a purge
scheduled s původním +60denním termínem. Jen tato fixture včetně údajů je uklizená;
původní inventura shodná. Oba originy a nezměněné Functions/Rules/IAM/plánovače
jsou po úklidu znovu ověřené. Důkazy v ignorovaném build/account-live-lifecycle-test
obsahují pilot/cleanup proof a explicitní UI console-review od vlastníka.
Native pipe i Browser access host jsou nedostupné; UI průchod provedl vlastník.
Oprava odběrů je uzavřená. Noto upozornění zůstává samostatně evidované. Další
krok: kompatibilita klientů, uzavření přímých zápisů a závěrečný test.
Historie přípravy, původní piloty, CI a meze ověření zůstávají v účtovém plánu.
[Kontrakt, meze a další brána](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#lokální-atomické-založení-žádosti--schváleno-3-listopadu-2026).

Reorganizace dokumentace je dokončená; [pravidla a kontrola](DOCUMENTATION_MAINTENANCE.md).
Neměnila aplikaci, nasazení ani data a není novým otevřeným MVP úkolem.

<a id="posledni-overene-nasazeni"></a>

## Poslední ověřené nasazení

| Vrstva | Poslední ověřený DEV stav |
|---|---|
| Projekt / Hosting site | `shoutout-dev-46c81` |
| Aplikace | https://shoutout-dev-46c81.web.app |
| Webový zdroj / Hosting verze | `dbf2aad2b5d5ab7490fa716318625ea1d0705697` / `de78cfc631c1acc1`; navíc stabilní Uložené, retry, potvrzené odebrání; CI 42932603771 success. Živé UI potvrzení čeká, dvě fixture jsou uklizené. |
| Finalizace žádosti | Zdroj `a9ff425bb6b01e2d7420f45915b6ea977895fa43`, ACTIVE, revize `finalizeaccountdeletion-00001-wav`, hash `21288ad667885c01f4bbf46dbdfee7a5a7c3025b`; min0/max1, concurrency1, 256 MiB/15 s |
| Příprava mazání | Zdroj `ccc879f`, ACTIVE `prepareaccountdeletion-00002-sar`; společný indexový writer |
| Receipt cleanup | Beze změny ze zdroje `a57ae9b46767a7491a743a20c6da93f9407afa7a`, ACTIVE `cleanupoperationreceipts-00003-qig`; hash `bdd5b6b8aaa3f4673d7a66fba89f76d936a71e06` |
| Účtové Functions | `ccc879f`, obě ACTIVE; request `00011-kob`, recovery `00011-lad`; hash `3cf911bd6ef4eb7350ef68068ed9a231ab347fa5` |
| Čtecí Functions | `ccc879f`: ACTIVE `getfeedpage-00001-cim` (klíč v1) a `getsavedshouts-00001-tav`; `4e7e5bd`: ACTIVE `getownshouts-00001-fik`, 42 modulů shodných, anonymní HTTP 401, max1/min0, concurrency1, 256 MiB/15 s |
| Obsahové writery | `ccc879f`: ACTIVE `createshout-00004-ves`, `deleteshout-00002-jax`; `14b7885`: ACTIVE `toggleshoutreaction-00008-zek`; společný indexový writer |
| Ostatní obsahové Functions | `14b7885`: ACTIVE `togglecommentreaction-00007-rir`, `toggleshoutsave-00006-roq`; všechny tři nové revize mají max1/min0, concurrency1, 256 MiB/15 s a shodu 42 modulů. `deleteComment` a `createContentReport` zůstávají ze zdroje f81eaf4 |
| Firestore Rules | `d5193d0b-e957-4c76-ab46-54b0f9a8beac`, zdroj 14b7885; navíc zámek interakcí dle activeShout, čtení a vlastní mazání zachované |
| Prostorový index | `feed-v1` active, klíč v1; dalších 5 složených indexů READY a 5 výjimek ověřeno, bez změny TTL |
| Vlastní stránky | Index `CICAgLiT_JAK` READY: authorId/status ASC, createdAt/expiresAt/__name__ DESC; bez TTL nebo field změn |
| Storage | DEV soft delete 0 z dřívějšího schváleného kroku; tento rollout Storage neměnil |

Další Functions tímto rolloutem aktualizované nebyly; neoznačovat všechny
za jeden nový společný artefakt. Čtyři veřejné soubory na obou DEV originech
odpovídají release manifestu (`build/expired-interactions-hosting-proof.json`).
Návrat posledního webu: Hosting `fa0a450ecbce236e` (ce6b07a, původní široké
tlačítko). Serverové zámky a nové Rules zachovat; jejich samostatný návrat
by znovu povolil schválením zakázané interakce. Reader a index se neměnily.
Při problému celého prostorového feedu lze pozastavit reader a vrátit
kompatibilní Hosting `f5c7ef14f1b5e04b` (zdroj 7ab60c8);
společné writery, generaci a ochranné Rules zachovat. Příprava má timeout 15 s,
receipt cleanup 60 s.
Limity účtových Functions: Node22, europe-west3, min0/max1, concurrency1,
256 MiB/60 s. Obsahové a čtecí callable mají 15 s. Minutový Scheduler zůstal
stejný; worker dostal schválený indexový úsek 32 kroků / 10 s. Firebase CLI
přidělilo pouze přístup runtime service account k novému podpisovému tajemství.
Storage Rules se při tomto rolloutu neměnily. Firestore Rules byly cíleně
zpřísněné výše. Důkazy revizí/zdrojů: `build/feed-functions-after.json`,
`build/feed-deployed-source-proof.json`; běh workeru: `build/feed-worker-live-proof.json`.

Produkční aplikace na `go.shoutout-app.eu` dosud nemá první release.
Projekt `shoutout-production-a1b34` sdílí s prezentací, app site je
`shoutout-go-a1b34`. Vývojová práce nebyla sloučená do main ani vydaná do
produkce. Podrobnosti prostředí jsou v [WEB_ENVIRONMENTS](operations/WEB_ENVIRONMENTS.md).

<a id="serverova-brana"></a>

## Stav implementace a otevřené části

| Oblast | Potvrzené dokončení | Co ještě zbývá |
|---|---|---|
| Obsahové operace | DEV klient používá serverovou tvorbu, reakce, ukládání, hlášení i mazání; přepínače v config/dev.json jsou zapnuté. | Závěrečné uzavření přímých Rules zápisů a celý milník serverové brány. |
| Technická potvrzení | Sedmidenní timed klíče, zákaz nových legacy klíčů a denní DEV cleanup 02:15 UTC, max. 500 záznamů/běh. | Produkční nastavení a společná vydávací brána. |
| Mazání účtu | DEV serverové fáze včetně purge, povinné směrování, Rules cutover, závěrečný UI/serverový test a úklid dokončené. | Produkční aktivace pod společnou vydávací bránou; žádný rozpracovaný DEV pilot. |
| Exspirace Shoutů | Serverová změna statusu se společným indexovým writerem a zámek běžných interakcí po expiresAt v DEV. | Sedmidenní fyzický úklid Shoutů a potomků včetně indexu. |
| Feed | DEV prostorové API, writer/index/feed-v1, klient, vlastní stránky a plovoucí tlačítka jsou nasazené; vlastní knihovna a úklid fixture ověřené. | Zbývající regrese Uložených a osobní přečtení/synchronizace/unread-first/novinky B1–B4. |
| Produkce a spuštění | Oddělený app site, SDK konfigurace a dříve ověřené DNS/HTTPS. | Runtime služby a zbývající bezpečnostní, právní, provozní a ruční kontroly. |

MVP zůstává 9/24 milníků (38 %), backlog 107/157 (68 %). Konečný account
purge sám neuzavírá souhrnný milník životního cyklu ani serverové brány.
[Kritéria serveru](MVP_SERVER_PLAN.md), [etapy feedu](plans/feed/FEED_IMPLEMENTATION_STAGES.md),
[startovní brána](LAUNCH_READINESS.md).

## Poslední ověření a jeho hranice

- Bezpečná konzolová diagnostika: [CI 41710073555](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41710073555)
  pro 712da1b success, DEV Hosting e69064a6c3110b2a. Oba originy (index, main,
  bootstrap, config) odpovídají čistému release; Functions/Rules/IAM/plánovače
  a inventura zachované. Příčina první chyby dosud není určená; nový test čeká.
- Atomické založení žádosti: [CI 41696994668](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41696994668)
  pro a9ff425 success, celá Rules/server sada 367/367. Function je nově nasazená;
  aktivace [CI 41705303226](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41705303226)
  pro 8289dce také success (276 Flutter, 42 tools, 107 unit, 367 Rules/server,
  15 purge, 15 Storage, analýza/lint/build). Nasazení a zachování ostatních vrstev
  jsou ověřené; přihlášený nový tok zatím není dokončený.
- UX potvrzení/průběhu: [CI 41688450535](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41688450535)
  pro 97d4b3f success; DEV Hosting 603bbdd9239e03d4, čtyři veřejné soubory
  (včetně bootstrapu) na obou originech shodné s čistým release manifestem.
  Původní 77dad6e CI bylo záměrně zrušené po doplnění mobilní opravy; nebylo nasazené.
- Nová příprava: [CI 41671609764](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41671609764)
  pro a57ae9b a [CI 41675834244](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41675834244)
  pro 7976e2f success. Neúspěšné CI 34250ec zachytilo dvě staré testovací konfigurace;
  oprava nemění aplikační chování a celý nový běh je zelený. Nový endpoint odmítl
  anonymní požadavek HTTP 401. Kontrola po rolloutu potvrdila shodu původní účtové
  inventury, ostatních Functions, obou plánovačů, IAM a Rules. Nový přihlášený
  callable tok i starší kompatibilní cesta jsou živě ověřené a obě fixture
  uklizené. Po úklidu znovu ověřené oba originy a nezměněný backend/Rules/IAM.
  Dokončený pilot nenahrazuje Rules cutover nebo zkoušku souběžného publikování.
  Ukazatel průběhu je následně dokončený samostatným UX rolloutem výše.
  [Důkazy a UX oprava](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#navazující-dev-rollout-a-živý-ui-test).
- Příprava f81eaf4: [CI 41538976226](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41538976226).
  Aktivace 96b0782: [CI 41539164008](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41539164008).
  Obě success: 254 Flutter, 40 tools, 107 unit, 355 Rules/server, 15 purge,
  15 Storage; analýza/lint/build. Lokálně také 355/355 Rules a 15/15 purge.
- Skutečný DEV trigger/Scheduler dokončil nový syntetický UID bez Auth účtu
  do content-archived se třemi archivními kořeny a původním +60denním termínem.
  Stejný kernel nad reálným Firestore/Storage s řízeným časem ověřil konečný
  úklid, cizí anonymní kontext a terminální replay; nejde o čekání 60 dní na
  hodinách Scheduleru. Fixture uklizená, původní inventura shodná.
- Samostatně schválená oprava doplnila userId do tří starých DEV záložek;
  neměnila obsah, createdAt ani počty. Dřívější oprava 17 geohashů je také
  dokončená; nejde o prostorový indexový backfill.

Podrobné důkazy: [konečný úklid](plans/accounts/ACCOUNT_RETENTION_PURGE_PLAN.md#uzavření-bodu-1-v-dev--3-listopadu-2026),
[palce a vlastnictví](plans/accounts/ACCOUNT_REACTION_REMOVAL_PLAN.md),
[testovací strategie](operations/TESTING.md). Staré pending žádosti a historické joby
se automaticky nemigrovaly. Lokální moduly feedu nebyly nasazeny jako query API.

## Platná rozhodnutí a omezení

- Celé nové chování feedu A0–A3/B1–B4 před MVP; poslední bod pouze v otevřené
  aplikaci, relace 1 hodina, expozice každé části 1 sekundu; unread-first jen
  v Nejblíž. Nízké hodnocení mimo Top mění sbalení, nikoli pořadí. Interval
  kontrol novinek ani provozní rozpočet API nejsou tímto souhrnem schválené.
- Účtová retence je původní createTime +60 dní, pevná i pro otevřená hlášení.
  Celý dostupný Business profil i zahrnuté zprávy/komentáře do tohoto termínu;
  potom minimální veřejný marker, uvolnění jen stále vlastní přezdívky a
  anonymní Shout kontext pro cizí konverzace. Správa archivu v administraci
  je samostatný otevřený backlogový úkol.
- Rozpočet vlastníka je nejvýše 5 000 Kč měsíčně; nejde o automaticky
  vynucený finanční strop. [Nákladové pojistky](operations/COST_SAFETY.md).
- App Check v automatické relaci může potřebovat ruční asistenci; ochranu
  kvůli testu nevypínat. Globální enforcement Auth/Firestore není uzavřený.
- Jednorázové srovnání starších čítačů/poloh není potvrzené. Není automaticky
  dalším příkazem k provedení; [stav inventury](MVP_SERVER_PLAN.md#data-reconciliation).
- Rutinní rollout po přesném CI má trvalý souhlas, nové produktové/provozní
  volby a první veřejné vydání mají vlastní brány. [RELEASING](operations/RELEASING.md).
  Lokální účty/hesla zůstávají pouze v ignorovaném docs/local/.

## Údržba

Tento soubor má jeden další krok a jednu tabulku posledního ověřeného nasazení.
Nový výsledek nahradí předchozí souhrn; dlouhá historie patří k plánu nebo do
[archivu](archive/README.md). Role dokumentů a kontrola:
[DOCUMENTATION_MAINTENANCE](DOCUMENTATION_MAINTENANCE.md).
