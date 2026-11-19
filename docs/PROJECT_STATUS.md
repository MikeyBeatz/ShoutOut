# ShoutOut – aktuální stav pro navázání práce

Souhrn k 19. listopadu 2026. Dokládá poslední ověřené výsledky; před dalším
nasazením znovu ověřit Git, CI a skutečný cíl. Úplná starší chronologie je v
[archivním indexu](archive/README.md), priority v [TODO](TODO.md).

## Další konkrétní krok

**B3 je nasazené v DEV, serverový pilot prošel; zbývá UI akceptace a úklid.**
Aktivační zdroj **1db4631e424c3333553c12ebbfbba5e2aa54cca0** má
[success úplné CI 44620011513](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44620011513).
getFeedPage je ACTIVE na revizi getfeedpage-00003-tux; DEV Hosting verze
62bd3a157ab5342b má ověřených pět zásadních souborů na obou originech.
serverUnreadFeed a B2 jsou zapnuté. Kompatibilních sedm Functions ze zdroje
1a4d184 / CI 44614605147 a skutečný rollback → resume → nový audit → activate
jsou ověřené; control revision 6 čte feed-v2 a udržuje oba writery.

V rámci [schváleného pilotu](plans/feed/B3_DEV_ROLLOUT.md#dev-rollout-results)
vzniklo přesně 120 nových 24h syntetických Shoutů a 90 testovacích značek
přečtení. Živé interní jádro oběma účtům vrátilo 50 → 100 → 120, staré
negrupované i B3 pořadí: Bright_Otter_182 má 50 nepřečtených, TestBusiness 100.
Tento důkaz nenahrazuje veřejný Auth/App Check a UI; uživatel dostal konkrétní
kontrolu Nejblíž / 50 km / oddělovač / další stránky / obnova. Po ní dokončit
interakce a další potřebné klientské kontroly, následně schválený úklid.
Původních 38 zdrojů a původní žádost jsou zachované; žádná Auth mutace.
Browser host byl nedostupný a nativní automatická kontrola zastavila Chrome
kvůli neověřené URL; ve stejném tahu tuto kontrolu neobcházet jinou cestou.

Čistý izolovaný checkout nasazeného 1db4631 je v ignorovaném
build/b3-dev/release-1db4631, jeho místní pilot-state má phase verified.
Pokračovat/uklízet CLI odsud s přesným CI 44620011513 a digestem uloženého
plánu; průběžně aktualizovat i hlavní build/b3-dev/pilot-state.json.
Nezakládat nový pilot ani neopakovat migraci. Návratový v3 web bez B3 je
ověřený. Produkce/main/Rules/indexová konfigurace/Auth účty/Scheduler se nemění.

**Předchozí provozní příprava — uzavřená:**

Na feature/feed-b3-operator je schválená
[provozní příprava B3](plans/feed/B3_DEV_ROLLOUT.md#operator-preparation):
řízený CLI s digestem, kontrolou přesného úplného CI a zdrojové inkarnace,
společné vypnuté hostitelské zapojení a oddělená omezená read cache.
Prošlo 22 emulátorových a 6 unit regresí; oba Functions artefakty zachovaly
oddělení migračního nástroje od živého hostitele. Zdroj
**16e2ea524f565a43e2bbc43f9e83f8e0b69c4ded** má
[success úplné CI 44607375041](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44607375041):
381 Flutter, 17 browserových + 2 transportní, 82 tools, 141 Functions unit
(486 integračních mimo emulátor přeskočeno), 457 Rules/server, 34 B2 runtime,
138 purge/runtime a 15 Storage testů, lint/formát/analyzátor i webový build.
Skutečný CI doklad prošel ověřením CLI a vypnutý režim odmítl mutaci před
otevřením databáze; test navíc databázovou factory nepodmíněně blokoval.
Přípravný úsek je uzavřený, nevracet se k jeho implementaci.
[Měření](plans/feed/B3_DEV_ROLLOUT.md#operator-preparation) má 5 scénářů / 35
výběrů: hustá historie 10 000 značek znamenala 284 SDK dokumentových čtení
na první stránku/novou obnovu, další stránka 80; vždy včetně 50 těl.
Nejde o cenu ani potvrzení kapacity 5 000 aktivních uživatelů.

Read-only DEV inventura: Standard/europe-west3, control active/revision 1,
jediná generace feed-v1, 38 Shoutů / 0 active. Všech sedm dotčených Functions
je ACTIVE; žádné cloudové zápisy. Je připravený
[konkrétní živý DEV návrh](plans/feed/B3_DEV_ROLLOUT.md#dev-pilot-proposal)
feed-v1 → feed-v2 s digestem 6db86498…b329347c, sedmi kompatibilními Functions,
návratem a pilotem na 120 nových 24h syntetických Shoutech. Živý rozsah
je již schválený výše. Nové B3 přepínače zatím zůstávají false; main/produkce/Rules,
Auth účty a Scheduler se nemění. Dnešní lokální příprava nic nenasazuje.

**Předchozí přechodové jádro — uzavřené po CI:**

Kontrola po přerušení 19. listopadu potvrdila success zdrojového CI 44419427913
i dokumentačního CI 44421327266, shodu pushnutých commitů a čistý pracovní strom.
Předchozí lokální B3 bylo dokončené. Vlastník následně schválil
[lokální přechod obou formátů](plans/feed/B3_DEV_ROLLOUT.md#local-transition-proposal).
Na feature/feed-b3-transition je kompatibilní writer, obnovitelné doplnění,
audit úplných projekcí, přepnutí/návrat a kompatibilita starých kurzorů.
Zdroj **7191502b29b57c063c1e40f714df1ee9f98d4e78** má
[success úplné CI 44565313452](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44565313452):
381 Flutter, 17 browserových + 2 transportní, 82 tools, 135 Functions unit
(482 integračních mimo emulátor přeskočeno), 457 Rules/server, 34 B2 runtime,
134 purge/runtime včetně všech 18 přechodových a 15 Storage testů;
také formát, analyzátor, lint a webový build.
[Podrobné výsledky](plans/feed/B3_DEV_ROLLOUT.md#local-transition-results)
rozlišují lokální důkazy a provozní meze. Nové B3 flags zůstávají vypnuté;
žádné nasazení ani živá migrace neproběhly.

Řízený provozní vstup a návrh živého DEV přechodu jsou připravené výše.
Interní jádro není součástí nasazovaných Functions. Živý rozsah vyžaduje zvláštní souhlas;
hotové lokální implementace ani B2 testy neopakovat.

**Předchozí základ B3 — lokální implementace a automatické ověření uzavřené po CI.**
[Rozsah a upřesnění vlastníka](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b3-local):
zmrazené globální pořadí, dvě skupiny podle vzdálenosti a oddělovač Přečtené.
Číslovka nově příchozích Shoutů patří do navazujícího B4. Na feature/feed-b3
je opt-in propojení skutečných B2 bloků s historickým prostorovým snapshotem
a bariéra úplné synchronizace v klientu. Živé flag/wrappery se nezměnily;
nový režim vyžaduje označenou generaci s otiskem obsahu. Prošlo 62 širších
emulátorových a po poslední změně 17 cílených API/cache testů, 80 Flutter,
23 cílených unit/tools, ESLint a analyzátor. Celý lokální balíček má 82 tools
a 135 Functions unit (464 integračních mimo emulátor přeskočeno).
Zdroj **c2cdb48aedcd0584eeb675935b4694af8b46701e** má
[success úplné CI 44419427913](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44419427913)
včetně Flutter/browser, Rules/server, B2 runtime, purge, Storage a webového
sestavení. Dřívější chyba modulového grafu účtového artefaktu z CI 44418757494
je opravená oddělením čistého otisku od B2 kodeku; kontrola balíčků zůstala.
Pracovní strom je po zdrojových commitech čistý; nejde o nasazení.
[Lokální výsledky a naměřené náklady](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b3-local-results)
odlišují studenou cestu od opakovaných stránek s cache. Před DEV aktivací
zbývá posoudit studený náklad a doložit živý plán společného přechodu.

[Závěrečná akceptace a úklid](plans/feed/B2_DEV_ROLLOUT.md#b2-acceptance-complete)
dokládají přenos/import mezi dvěma klientskými relacemi, zachování fronty při
zablokovaném callable a úplném znovunačtení aplikace, potom skutečný HTTP 200
s platným Auth/App Check. Opakování zachovalo serverovou revizi, confirmedAt
i retenci. Původní pilotní helper z čistého bc4a6e1 přes indexový writer
uklidil oba Shouty, čtyři záložky, související potvrzení a testovací cloudové
read záznamy. Následná verify má phase=cleaned; 38 původních zdrojů je beze změny,
žádná Auth mutace. Dočasný checkout je odstraněný. Místní potvrzené testovací
značky mají původní expiraci +7 dní; žádná neodeslaná fronta nezůstala.

Backend bc4a6e1d38f7d46c2144fe31521c1cdbe91e507a má success úplné CI 44099715617;
nasazení i čtyři field výjimky jsou doložené v [rolloutu](plans/feed/B2_DEV_ROLLOUT.md#dev-rollout-results).
DEV read sync, účtový read úklid i minutová retence zůstávají aktivní. Dnes se
nenasazovalo; produkce, main, Rules a původní pending žádost se neměnily.
[Izolované HTTP regrese](plans/feed/B2_DEV_ROLLOUT.md#http-recovery-tests) mají
success úplné CI 44157663737 a doplňují živý průchod. Ověřený restart znamená
nový dokument/Flutter aplikaci přes Ctrl+R, nikoli celý proces Chrome nebo
odpojení operačního systému. Nevytvářet znovu fixture ani neopakovat hotové B2.

Hotový lokální rozsah B3 ani B2 neopakovat. Další je po CI a schválení provést
připravený řízený DEV přechod a živé ověření. B3/B4 ani
produkční kapacita 100 000 účtů / 5 000 aktivních relací hotové v DEV nejsou.

Fontová oprava je také uzavřená v DEV: zdroj
9e3828dd37bd8ce68713f87cedb956db0a135124, success úplné CI 44178308912,
Hosting 74d0c3756884ac19. Vlastník potvrdil zmizení Noto hlášky;
[důkazy a oba v3 návraty](operations/CONSOLE_WARNINGS.md#category-font-dev-rollout)
zůstávají platné. Intl.v8BreakIterator je [diagnostikovaný ve Flutter engine](operations/CONSOLE_WARNINGS.md#intl-break-iterator);
SDK/bootstrap se nemění. CSP/QUIC a pozdější Listen 400 mají samostatnou
evidenci a jejich oprava se netvrdí. Následující datované přípravy jsou
historické podklady, jejich vypnuté flags nejsou stavem dnešního DEV.

**Příprava DEV B2 je uzavřená po CI; skutečné spouštění a pilot čekají.**
Na feature/b2-dev-preparation je vypnutý retenční adaptér s 24h klidem,
odděleným controlem a transakční ochranou. Účtový read úklid je explicitně false;
čistý plánovač pokrývá jen čtyři DEV field výjimky bez TTL. 68 emulátorových
regresí a 17 Chrome/IndexedDB testů prošlo včetně neaktivního v3 návratu.
Zdroj `405be7d8218d628a85a93d529cdf391d7085bf3c` má
[success CI 44077124957](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44077124957):
81 tools / 131 Functions unit (457 skip mimo emulátor) / 450 Rules/server /
34 B2 runtime/retention / 116 purge / 15 Storage a Flutter/browser/formát/analýzu/build.
Čistý neaktivní release ze stejného SHA má ověřenou kopii 68 souborů v
build/b2-v3-rollback-405be7d8, s manifestem/proofem a kontrolovanými SHA-256.
[Rozsah a pořadí DEV pilotu](plans/feed/B2_DEV_ROLLOUT.md). Skutečné spouštění,
aktivace a živá ověření nejsou tímto úsekem povolené. Žádné nasazení či živé zápisy.
Další je rozhodnutí o spouštění úklidu a konkrétní vymezený DEV pilot podle plánu;
lokální přípravu neopakovat. Produkční kapacita a živá akceptace nejsou prokázané.

**Lokální retenční úklid B2 je uzavřený po přesném CI; není nasazený.**
Na feature/b2-retention-cleanup jsou oddělené read/receipt runnery s atomickým
kurzorem a lease, měřením a čtyřmi připravenými indexovými výjimkami bez TTL.
28 cílených emulátorových regresí, 129 Functions unit, 79 tools a lint prošlo.
Zdroj `5f3ed5ce014ef303ae163d9034fd1ae6a23e03a3` má
[success CI 44060619655](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44060619655):
129 Functions unit (447 integračních přeskočeno mimo emulátor), 448 Rules/server,
26 B2 runtime/retention, 116 purge, 15 Storage a Flutter/browser/formát/analýzu/build.
650 receipt se odčerpalo v 5 úsecích, 1 000 značek bylo 19 bloků.
[Rozsah, důkazy a návrh kapacity](plans/feed/FEED_READING_POLICY.md#b2-retention-implementation).
Živý plánovač, Rules, Auth, přepínače ani data se nemění. Implementace i
automatické ověření jsou v metrice uzavřené. Další je provozní spouštění/rozpočet,
dokončení indexace, účtové zapojení, v3 návrat a konkrétní DEV pilot.

Vlastník schválil [větší funkční úseky a seskupené push/CI](operations/RELEASING.md#development-checkpoints).
Průběžné lokální kontroly a samostatné brány rizikových přechodů zůstávají;
implementační priorita je nadále provozní dokončení B2. Jde o pracovní pravidlo, ne nové
dokončení produktového úseku nebo změnu nasazení.

**Údržba CI je uzavřená po ověření obou režimů; další je B2 úklid.**
Na fix/selective-ci má zdroj `27f46e8cd98c195471e68cc6bdedb592a75fc819`
[úspěšné úplné CI 44053527899](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44053527899)
za 13 min 7 s: 22 cílených regresí, 79 tools a všechny původní aplikační,
serverové, emulátorové kontroly i webový build. Dokumentační commit
`fe50d95e5c7280a1680970693961275adc189575` má
[úspěšné lehké CI 44053648299](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44053648299)
za 11 s, s 22 testy, čistou dokumentací a skutečně přeskočenými těžkými kroky.
[Režimy a hranice](operations/TESTING.md#dva-rezimy-ci). Aplikace, Firebase ani
procenta se neměnily; nic se nenasazovalo. Další produktový úkol je B2 úklid níže.

**Nová metodika stupnic je uzavřená po přesném CI; další je B2 úklid.**
Feature/progress-substeps zachovává 24 MVP milníků a 157 backlogových položek,
ale eviduje jejich podúseky s pevnými vahami. Registry, podklady a generátor
jsou v [PROGRESS](PROGRESS.md); aktuální procenta se odvozují jen do TODO/BACKLOG.
Zdroj `dad4ecd4ebaceecf09a0349e15c0e8f668f72e34` má
[success CI 44044929954](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44044929954):
68 tools včetně 11 cílených regresí výpočtu, 375 Flutter / 16 Chrome /
127 Functions unit (431 integračních přeskočeno mimo emulátor) / 448 Rules/server /
10 B2 runtime / 116 purge / 15 Storage a formát/analýza/lint/build.
Dokumentace a šest snímků jsou bez chyb; všech 157 checkboxů a 24 kritérií je
zachovaných. Nové procento zachycuje i již doložené podúseky, ne další hotové
milníky. Nic aplikačního ani živého se neměnilo. Vrátit se k B2 úklidu níže.

**Schválená serverová obsluha B2 je uzavřená po přesném CI; není nasazená.**
Na feature/read-sync-runtime jsou izolované callable obálky, control
off/active/paused, kvóta 40 + 1/s pro každý směr/UID a klientský adaptér za false
v DEV i produkční konfiguraci. 375 Flutter / 127 Functions unit, 10 různých
emulátorových scénářů napříč dvěma běhy a 24 cílených tools prošlo; analýza/lint čisté.
Test 1 000 značek prošel bez quota čekání, 10 000 zachoval všechna data přes
přerušení/restart; obnova beze změn má 14 reads + 1 rate write.
Zdroj `cce1e7d49f12b8a79374cb3117bd1dbc2f10b6a9` má
[success CI 43284395332](https://github.com/MikeyBeatz/ShoutOut/actions/runs/43284395332):
375 Flutter / 16 Chrome / 57 tools / 127 Functions unit (431 integračních
přeskočeno mimo emulátor) / 448 Rules/server / 10 runtime / 116 purge / 15 Storage
a formát/analýza/lint/build. CI zopakovalo stejné SDK počty obou velkých front.
[Konkrétní rozsah, počty a omezení](plans/feed/FEED_READING_POLICY.md#b2-runtime-implementation).
Současné živé artefakty nový host neimportují; žádné Functions, Rules,
Scheduler ani živá data se neměnily. Následuje kapacitně navržený
retenční úklid před aktivací. B2–B4 ani celá kapacitní brána nejsou uzavřené.

**Schválený klientský úsek B2 je uzavřený po přesném CI; není nasazený.**
Na feature/read-sync-boundaries je hranice outboxu a sync při startupu/obnově,
IndexedDB v3 s atomickou migrací v1/v2, import/checkpoint s CAS a cold restart.
369 Flutter / 16 Chrome, 39 cílených regresí prošlo; fronta 1 025 značek má
33 dávek bez skenování od začátku, pozdější značka čeká. Selhání migrace,
souběžné karty, disková chyba i erase jsou ověřené. Zdroj
`049cedc4cb4ec01b8a24ac93b04e8b9399205290` má
[success CI 43270732252](https://github.com/MikeyBeatz/ShoutOut/actions/runs/43270732252):
369 Flutter, 16 Chrome, 55 tools, 124 Functions unit (421 integračních testů
přeskočeno mimo emulátor), 448 Rules/server, 116 purge, 15 Storage
a formát/analýza/lint/build. CI fronta 1 025 značek: 33 dávek, 655 ms lokálně.
[Rozsah a důkazy](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b2-client-results).
Transport je stále null; Functions/Rules/konfigurace ani živá data se neměnily.
V3 zatím není nasazené a návratový artefakt musí v3 podporovat. Runtime navazuje
ve výše uvedeném úseku, úklid a propojení obnovy zbývají; B2–B4 jsou otevřené.

**Společný plán úsporné obnovy je zapsaný.**
Vlastník schválil připravit kontrakt nyní a realizovat jej v pořadí B2 → B3 → B4.
[Kontrakt](plans/feed/FEED_DELTA_REFRESH_PLAN.md) odděluje verze obsahu/čítačů,
bloková metadata, cache, dostupnost a baseline novinek. Do B4 patří přenos
rozdílů a úsporná detekce s číslovkou; další cache podle měřeného přínosu.
Tento dokumentační krok nemění implementaci, nasazení ani stav milníků.

**Kapacitní lokální úsek je uzavřený po přesném CI.**
Vlastník schválil model/testy pro 100 000 účtů / 5 000 aktivních uživatelů
a [upřesnil synchronizaci](plans/feed/FEED_READING_POLICY.md#refresh-boundary-policy):
pouze při spuštění/skutečné obnově feedu; nahrazuje 10s upload/resume pull.
Přečtení místně zůstává ihned, číselný indikátor obnovy B4 není hotový.
Na feature/capacity-model je offline nástroj a čtyři nové emulátorové testy:
4 modelové regrese, 4/4 cílené emulátorové průchody, 55 tools a lint prošly.
Zdroj `4024e496d017ebd6705b9ccd4d5dc697ac26b3c8` má
[success CI 43254458838](https://github.com/MikeyBeatz/ShoutOut/actions/runs/43254458838):
361 Flutter, 10 Chrome, 55 tools, 124 Functions unit (421 integračních
testů přeskočeno mimo emulátor), 448 Rules/server, 116 purge, 15 Storage
a formát/analýza/lint/build. Nejde o cloudový test 5 000 uživatelů.
[Výsledky a návrh škálování](operations/CAPACITY_AND_SCALING.md) rozlišují
model, skutečné SDK pokusy a neověřenou cloudovou kapacitu. Souběžné zápisy
jsou správné, opakování transakcí stojí operace; pevný úklid 500 receipt/den
neodpovídá modelové zátěži. Další je konkrétní revize runtime B2/úklidu
podle výsledků; bez implementace B4 nebo nové provozní datové vrstvy.
Aplikační chování, konfigurace a živá prostředí zůstaly beze změny.

**Starší základ B2a je uzavřený; novější klient/runtime jsou popsané výše.**
Schválený lokální úsek je na `feature/feed-read-sync`: transakční bloky,
stránkovaný snapshot/delta, IndexedDB v2 outbox a připravené klientské napojení.
360 Flutter, 10 Chrome/IndexedDB, 49 cílených emulátorových regresí, 124 Functions
unit a 51 tools prošlo; přidaný test slučování souběžných požadavků prochází
v 11 cílených testech. Analýza/lint čisté, debug web sestavený a otisky ověřené.
Zdroj `693663d0c25c7106a7bfbb8efcc9bdc947b955cc` má
[success CI 43119749520](https://github.com/MikeyBeatz/ShoutOut/actions/runs/43119749520):
361 Flutter, 10 Chrome, 51 tools, 124 Functions unit (417 integračních testů
se v neemulátorové fázi přeskakuje), 444 Rules/server, 116 purge, 15 Storage
a formát/analýza/lint/build. B2 nemá exportované Functions,
syncFactory je v aplikaci null a účtový readSyncEnabled je false. Nic nebylo
nasazené ani zapsané do živého prostředí. Výsledky a omezení jsou v
[B2 checkpointu](plans/feed/FEED_READING_POLICY.md#b2-local-results).
[Provozní návrh B2](plans/feed/FEED_READING_POLICY.md#b2-runtime-proposal)
uchovává starší podklad k četnosti, pokračování, dennímu úklidu, indexaci a návratu.
Novější trigger politika, klient v3 a schválená serverová obsluha jej nahrazují
v rozsahu svých výše uvedených výsledků. Fyzický úklid a konkrétní živý DEV plán
nadále zbývají; staré limity nebo tehdejší stav runtime nepřebírat jako aktuální.

**Poslední živé nasazení — B1 a regrese Uložených, uzavřené v DEV.**
Aktuální zdroj `503eea672db85fb06200115488a4e313cd751d48` na
`feature/feed-read-tracking` má
[success CI 43056516730](https://github.com/MikeyBeatz/ShoutOut/actions/runs/43056516730):
350 Flutter, 8 skutečných Chrome/IndexedDB, 51 tools, 119 Functions unit,
436 Rules/server, 116 purge a 15 Storage; formát/analýza/lint/build prošly.
Z čistého releasu byl 11. listopadu v 17:26 SEČ nasazen pouze DEV Hosting
`47268ed17fd2eebd` na projekt/site `shoutout-dev-46c81`. Čtyři soubory obou
originů souhlasí s manifestem. API porovnání před/po potvrzuje stejných
18 Functions i Firestore ruleset `d5193d0b-e957-4c76-ab46-54b0f9a8beac`.
Produkce, main, Auth, Rules a prostředky Functions se neměnily.
Návratová verze webu je `de78cfc631c1acc1`.

B1 měří úplnou expozici nadpisu/textu a ukládá místní značky do IndexedDB
podle projektu/UID; při běžném odhlášení je zachová do expiresAt + 7 dní,
při potvrzené žádosti o smazání účtu je odstraní. Zahrnuje úklid prošlých
značek dřívějších účtů; nové Firebase operace samotná evidence nepřidává.
Produkční přepínač se neměnil. Přes indexový writer vznikly právě dva
schválené 24hodinové Shouty `mvp-read-20261111-{short,long}`, po jednom pod
existujícími Bright_Otter_182/TestBusiness. Živé jádro oběma účtům ověřilo
záložky, odebrání/obnovení a idempotentní replay; nejde o HTTP/UI důkaz.
Vlastník pod Bright_Otter_182 potvrdil zmizení krátké karty bez ruční obnovy
i její nepřítomnost po znovuotevření. Dva read-only IndexedDB výpisy potvrzují
short i long jako přečtené se stejnými časy před/po restartu (1794414568452 /
1794414596259). TestBusiness nemá v tomto originu databázi; jeho živé čtení
netvrdit. Oddělení účtů, logout, vymazání i souběh pokrývá browserová/lokální sada.
Oba testovací Shouty jsou uklizené přes indexový writer: 2 kořeny, 3 záložky,
9 receipt, nulový zůstatek zdrojů/receipt i aktuálních indexových metadat.
Původních 37 zdrojů má stejná updateTime; 0 nových/smazaných Auth účtů.
Dvě místní testovací značky uživateli ručně nemažeme; platí jejich původní
expiresAt + 7 dní. Důkaz: build/read-tracking-ui-proof.json a cleanup proof.
Log první akce ukazuje start instance asi 3,3 s a vlastní volání 0,69 s,
Auth/App Check VALID. Jde o diagnózu latence, žádná změna prostředků nebyla provedena.
[Podrobnosti B1](plans/feed/FEED_READING_POLICY.md#b1-implementation).
Společná DEV akceptace A2/A3 i webové B1 jsou uzavřené. Vlastník následně
schválil B2 retenci expiresAt + 7 dní, upload nejvýše 32 / první termín 10 s,
přenos při loginu/návratu/obnově bez prázdného pollingu a první lokální úsek.
Ten je připravený podle checkpointu výše; nejde o živé B2 ani dokončení B3/B4.
Živá/provozní brána, denní fyzický úklid a konkrétní DEV pilot ještě zbývají.

Předchozí oprava Uložených dbf2aad / CI 42932603771 / web de78cfc631c1acc1
je základem této verze. Její dva starší `mvp-saved-20261111-*` fixture jsou
od 16:11 SEČ uklizené: 2 kořeny, 4 záložky a 8 receipt; aktuální index bez
jejich metadat, původních 37 zdrojů se stejným updateTime. Dřívější chybějící
UI důkaz nyní doplňuje výše uvedený nový test, nikoli další opakování starých dat.
[Checkpoint Uložených](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression).

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
jeho živé UI potvrzení i úklid nové dvojice B1 jsou uzavřené podle checkpointu výše.
B2–B4 ani celý milník hotové nejsou.
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
Regrese Uložených, vlastní reakce/uložení, nové tlačítko, zámek expired
i úklid jsou uzavřené. Celý feed/milník tím není hotový; B2–B4 zbývají.
Jeden lokální SDK vzorek měl 65,8 s;
příčina není potvrzená, toto měření není cloudová latence ani cenový benchmark.

Produkce/main se neměnily. Produkční účtový wrapper a provozní konfigurace
nadále patří do startovní brány. Před MVP dál zbývají B2–B4; B1, regrese
Uložených i vlastní zdroj Aktivní/Expirované jsou uzavřené v DEV. Starší R6 výsledky níže
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
| Webový zdroj / Hosting verze | `1db4631e424c3333553c12ebbfbba5e2aa54cca0` / `62bd3a157ab5342b`; úplné CI 44620011513 success. B2/B3 aktivní; index, JavaScript, config, bootstrap a version na obou doménách shodné s releasem. B2 akceptace uzavřená, B3 čeká na UI/úklid. |
| Finalizace žádosti | Zdroj `a9ff425bb6b01e2d7420f45915b6ea977895fa43`, ACTIVE, revize `finalizeaccountdeletion-00001-wav`, hash `21288ad667885c01f4bbf46dbdfee7a5a7c3025b`; min0/max1, concurrency1, 256 MiB/15 s |
| Příprava mazání | Zdroj `1a4d184`, ACTIVE `prepareaccountdeletion-00003-pav`; kompatibilní společný indexový writer |
| Receipt/read cleanup | `bc4a6e1`, ACTIVE `cleanupoperationreceipts-00004-zel`; původní job každou minutu, nový continuing runner, controls/24h klid a prošlé fixture ověřené. ZIP shodný se 49 soubory balíčku. |
| Účtové Functions | `1a4d184`, obě ACTIVE; request `00013-caf`, recovery `00013-cal`; read úklid a kompatibilita obou generací zachované, 39 zdrojových modulů ověřeno před uploadem. |
| B2 čtecí Functions | `bc4a6e1`, ACTIVE `syncreadbatch-00001-fox` / `getreadstatepage-00001-xub`, klíč v1, min0/max1/concurrency1/256 MiB/15 s, oba HTTP 401 bez identity/attestace; ZIP shodné s 10 soubory balíčku. |
| Čtecí Functions | `1db4631`: ACTIVE `getfeedpage-00003-tux` (stávající klíč v1), B3/kompatibilita, 256 read bloků, oddělená cache 4 MiB / ≤1 h, anonymní HTTP 401. getSavedShouts `00001-tav` a getOwnShouts `00001-fik` zůstávají z předchozích zdrojů. |
| Obsahové writery | `1a4d184`: ACTIVE `createshout-00005-goj`, `deleteshout-00003-vav`, `toggleshoutreaction-00009-tec`; kompatibilní společný indexový writer |
| Ostatní obsahové Functions | `14b7885`: ACTIVE `togglecommentreaction-00007-rir`, `toggleshoutsave-00006-roq`; všechny tři nové revize mají max1/min0, concurrency1, 256 MiB/15 s a shodu 42 modulů. `deleteComment` a `createContentReport` zůstávají ze zdroje f81eaf4 |
| Firestore Rules | `d5193d0b-e957-4c76-ab46-54b0f9a8beac`, zdroj 14b7885; navíc zámek interakcí dle activeShout, čtení a vlastní mazání zachované |
| Prostorový index | Control revision 6 / active, čte `feed-v2`, zapisuje `[feed-v1, feed-v2]`; migrace, rollback, nový audit i reaktivace ověřené. Klíč v1 a indexová konfigurace zůstaly zachované, bez změny TTL. |
| Vlastní stránky | Index `CICAgLiT_JAK` READY: authorId/status ASC, createdAt/expiresAt/__name__ DESC; bez TTL nebo field změn |
| Storage | DEV soft delete 0 z dřívějšího schváleného kroku; tento rollout Storage neměnil |

Ostatní Functions tímto B2 rolloutem aktualizované nebyly; neoznačovat je za
jeden společný nový artefakt. Release ověřuje build/b2-hosting-proof.json,
zdroje a revize build/b2-deployed-source-proof.json a b2-rollout-live-infra-check.json.
Návrat B2: pozastavit readSyncControl a použít ověřený neaktivní v3 artefakt
405be7d podle [plánu](plans/feed/B2_DEV_ROLLOUT.md#neaktivní-web-a-návrat).
Starší v1/v2 weby, včetně historických ce6b07a/7ab60c8, po upgradu IndexedDB
automaticky nevracet. Zachovat místní fronty, nové indexy, read úklid, obsahové
writery, generaci a ochranné Rules. Účtové a cleanup Functions mají 60 s,
obsahové/čtecí callable 15 s; všechny uvedené DEV prostředky jsou min0/max1,
concurrency1, 256 MiB, Node22, europe-west3. Účtový minutový job je zachovaný;
původní receipt job nově běží také každou minutu. Další Scheduler job nevznikl.
Rules a Storage se touto fází neměnily. Podpisový klíč zůstává existující v1.

Produkční aplikace na `go.shoutout-app.eu` dosud nemá první release.
Projekt `shoutout-production-a1b34` sdílí s prezentací, app site je
`shoutout-go-a1b34`. Vývojová práce nebyla sloučená do main ani vydaná do
produkce. Podrobnosti prostředí jsou v [WEB_ENVIRONMENTS](operations/WEB_ENVIRONMENTS.md).

<a id="serverova-brana"></a>

## Stav implementace a otevřené části

| Oblast | Potvrzené dokončení | Co ještě zbývá |
|---|---|---|
| Obsahové operace | DEV klient používá serverovou tvorbu, reakce, ukládání, hlášení i mazání; přepínače v config/dev.json jsou zapnuté. | Závěrečné uzavření přímých Rules zápisů a celý milník serverové brány. |
| Technická potvrzení | Sedmidenní timed klíče, zákaz nových legacy klíčů a pokračující DEV cleanup každou minutu, max. 500 dokumentů / 10 s na fázi, po dokončení 24h klid. | Produkční nastavení a společná vydávací brána. |
| Mazání účtu | DEV serverové fáze včetně purge, povinné směrování, Rules cutover, závěrečný UI/serverový test a úklid dokončené. | Produkční aktivace pod společnou vydávací bránou; žádný rozpracovaný DEV pilot. |
| Exspirace Shoutů | Serverová změna statusu se společným indexovým writerem a zámek běžných interakcí po expiresAt v DEV. | Sedmidenní fyzický úklid Shoutů a potomků včetně indexu. |
| Feed | DEV prostorové API a kompatibilní writery, feed-v2, vlastní stránky a plovoucí tlačítka; B1/B2 akceptace uzavřené. B3 nasazené, interní živý pilot 50 → 100 → 120 prošel. | UI akceptace a úklid B3, novinky B4 a závěrečná společná brána. Regrese Uložených uzavřená v DEV. |
| Produkce a spuštění | Oddělený app site, SDK konfigurace a dříve ověřené DNS/HTTPS. | Runtime služby a zbývající bezpečnostní, právní, provozní a ruční kontroly. |

Aktuální stupnice jsou generované v [TODO](TODO.md#postup) z
[evidence podúseků](PROGRESS.md). Dílčí dokončení posouvá vážené procento;
konečný account purge sám neuzavírá celý životní cyklus ani serverovou bránu.
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
