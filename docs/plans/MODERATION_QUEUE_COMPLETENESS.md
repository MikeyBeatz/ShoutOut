# Úplná moderační fronta – F-04

## Schválený místní rozsah

28. listopadu 2026 vlastník schválil společné místní dokončení F-04: přesné
počty seskupených případů, serverové stránky nejvýše 50 případů, atomické
writery a úklid, obnovitelný převod starých hlášení, bezpečné velké rozhodnutí
po dávkách nejvýše 50 hlášení, oba klientské vstupy a historii postihů.
Zahrnuje testy, měření, dokumentaci/metriky, commit/push a úplné CI.

**Q-01 rozhodnuté:** metadata fronty a důvody jsou globálně dostupné způsobilé
moderaci. Filtr místa může vybrat město/oblast/stát nebo geohash. Filtr není
oprávnění: otevření archivního těla a rozhodnutí dál kontroluje dnešní roli
a přidělený geografický rozsah. Chybějící doložená geografie se neodhaduje.

Vše výchozí vypnuté a pouze emulátor. Bez nasazení, živých dat/účtů, služeb,
Scheduler změn, nových poskytovatelů/klíčů nebo změny retenčních lhůt.
Konkrétní DEV převod a prostředky se připraví podle skutečných výsledků.

## Kontrakt

- Jedna malá hlavička na obsahový případ; neobsahuje text příspěvku, zprávy,
  důvod, e-mail ani telefon. Hlášení a archiv zůstávají původním zdrojem.
- Oddělené open/escalated počty, časové hranice a odkaz na reprezentativní
  hlášení; globální pořadí vzniká v dotazu, nikoli až z prvních 50 hlášení.
- Jeden atomický adaptér pozoruje konečné transakční zápisy hlášení za
  archivním adaptérem. Zahrne nové hlášení, moderaci, retenci a účtový purge.
  Změny zdroje/hlavičky/členství se buď uloží společně, nebo vůbec.
- Soukromé členství váže konkrétní inkarnaci původního hlášení. Neplatné
  počty, zaměněný původ nebo neúplný převod aktivní čtení zastaví.
- Filtry používají dosavadní veřejný geohash a doloženou geografii rodiče.
  Názvy míst vybírá klient přes existující vyhledávání; neposuzují oprávnění.
- Velké rozhodnutí má vlastní trvalý průběh a jedno provedení obsahového
  účinku/postihu. Další transakce nejvýše po 50 pouze bezpečně dokončí
  vyřízení stejného případu; nejde o zvýšení limitu jedné transakce.
- Změna role, rozsahu, účtu, retence nebo inkarnace znovu ověřena i při retry.
  Původní sedmidenní potvrzení se neprodlužuje opakováním.

Společný rozpočet zůstává 450 zápisů; promítnutí do fronty se do něj započítá.
Pauza nesmí otevřít starou cestu ani zastavit povinné retenční smazání.

## Místní implementace

- Soukromé `moderationCases/{targetHash}` a `members/{reportId}`, řídicí
  `moderationQueueControl/current` a přechodový checkpoint. Hlavička obsahuje
  počty fyzicky existujících pending hlášení, první/poslední čas a serverové
  filtrační tokeny. Retenčně nepřístupný reprezentant nezpřístupní důvod.
  Povinné fyzické odstranění hlášení atomicky opravuje i počty/hranice.
- Reader ověří Auth/App Check, aktuální způsobilost/roli a aktivní control.
  V jedné transakci vybere nejvýše 50 hlaviček a malé maskované podklady.
  Spravovaný obsahový archiv nevyžaduje plná těla. Výjimečný doložený starý
  účtový formát používá původní ověřovač podkladu, který může na serveru
  načíst tělo kvůli jeho původu a termínu; klientovi je nikdy nevrací.
  Kontroly účtových termínů jsou společné a dávkované.
  Prázdná nefinální stránka může pokračovat, takže hraniční geografický filtr
  ani odložený fyzický úklid nezahodí zbytek seznamu.
- Kurzory váže projekt databáze, účet, aktuální role, inkarnace/revize control,
  filtr a pořadí. Jde o živé stránkování: nově vzniklé či přeskupené případy
  se zobrazí při obnově, nikoli jako zmrazený celkový snapshot.
- `moderationCaseDecisions/{operationId}` zamkne jednu inkarnaci případu.
  První transakce provede dnešní existující účinek včetně auditu právě jednou;
  další transakce nejvýše po 50 dokončují pouze stejná hlášení. Eskalace
  pokračuje podle ID členství a sama opakovaně nevybírá již předané položky.
  Příchod nového hlášení během uzamčení skončí bez reportu, kvóty i receipt.
- Aktuální oprávnění se kontroluje při každém kroku. První účinek může provést
  jen původní aktér; dokončení již použitého účinku může převzít jiný aktuálně
  oprávněný moderátor. Účtový purge odstraňuje jeho soukromé úlohy i reference.
  Pokračování nesmí znovu zapsat identitu již odstraněného moderátora.
- Potvrzení a poznámka mají původních 7 dní. Omezený reaper po termínu odstraní
  úlohu, odemkne případ a zachová jen minimální doklad již provedeného účinku
  do úklidu zbývajících hlášení. Nový platný požadavek může dokončit pouze tento
  účinek, nikoli udělit nový postih. Částečné retenční smazání také ruší starou
  úlohu; původní počty z ní se nepoužijí pro zachovaný zbytek.
- Oba vstupy klienta sdílejí stejné seznamy a rozhodování. Lokální nejasný
  požadavek drží původní payload, serverový čas i klíč; opakování nevyvolává
  nové potvrzování sankce. Stránky seznamu i historie se připojují na konci
  bez skoku. Dřívější aktivní ban/omezení se doplní přes přesná ID i mimo
  první stránku historie; revokace se čtou dávkami nejvýše 30 ID.

Připravený kontrakt má tři obsluhy `getModerationCasePage`,
`startModerationCaseDecision`, `stepModerationCaseDecision`.
`createModerationQueueHandlers` je pouze injektovatelná továrna: nejsou
přidány žádné `onCall` exporty, funkční prostředky ani Scheduler.
`moderationQueueConfiguration.enabled` i klientská volba zůstávají false.
Připravené rozhodování vyžaduje spravovaný archivní runtime a společný writer.

Všechny nové kolekce jsou soukromé, přímé get/list/create/update/delete
odmítají současná Rules i ownerovi. Globální metadata se zpřístupní jen přes
nový autentizovaný serverový přehled. Stávající globální čtení původních
report metadat se nemění; nejde o přístup k soukromým konverzacím.

### Geografické filtry

Výběr adresy znovu používá stávající autocomplete. Země/kraj lze filtrovat
přesným uloženým ISO kódem, geohash prefixem 1–7 znaků, město/oblast obalovým
obdélníkem poskytovatele. Deterministické úplné pokrytí má nejvýše 30 buněk;
hraniční buňky se ověří středem dosavadního veřejného geohashe. Obdélník
není přesná správní hranice, což klient výslovně uvádí. Bez doložené oblasti
neodvozuje dosah z jediného středu; nabídne přesný ISO/geohash filtr.
Výchozí adresa pobočky i ostatní použití autocomplete zůstávají zachované.
Podklad: [Geoapify autocomplete](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/),
[obalové oblasti](https://apidocs.geoapify.com/how-to/addresses/address-suggestions-near-user-or-city/).

### Obnovitelný převod a návrat

`moderation_queue_transition.js` je záměrně operátor **pouze pro emulátor**.
Plán váže projekt, source commit, inkarnaci, meze 50/450 a digest. Checkpoint
se uloží atomicky s převzetím hlášení. Audit po nejvýše 50 členech kontroluje
počty, inkarnaci reportu, vazbu podkladu i skutečné časové hranice. Změna
případu audit restartuje; souběžný writer jej označí jako neověřený a aktivace
zůstane blokovaná. Změněný plán, zaměněný původ či nesoulad se neopraví odhadem.

Živá verze operátoru, ověření čistého přesného commitu/úplného CI a odstavení
všech starých report writerů patří až do dalšího DEV přechodu. Současný lokální
operátor tyto cloudové pojistky nepředstírá. Návrat musí ponechat společné
writery a úklid; starý web s prvním limitem 50 nemůže být plnohodnotnou
návratovou frontou. Vypnutí nové projekce po jejím zapnutí by vyžadovalo nový
převod/audit před dalším čtením. Pouhá pauza readeru writery nevypíná.

Kandidát indexů v `tools/moderation_queue_index_plan.mjs` připravuje 3 složené
dotazy nad případy a jeden pro historii postihů uživatele. Zachovává všechny
ostatní indexy, výjimky i TTL. Živý `firestore.indexes.json` se nyní nemění.

## Ověření a stav

Přípravná kontrola nad zdrojem 97807c8 potvrdila chybu prvních 50 hlášení.
Tři hraniční emulátorové regrese prošly bez skipů: 50 se uloží společně,
opakování nezdvojí postih, 51 je dosud odmítnuto bez částečné změny.
Nejde o test nové implementace ani o živou akceptaci.

Místní sada `test:moderation-queue` prošla **32/32, bez skipů**. Podklady:
[projekce a reader](../../functions/moderation_queue.integration.test.js),
[velká rozhodnutí](../../functions/moderation_case_decision.integration.test.js),
[skutečný archiv/card writer](../../functions/moderation_queue_managed.integration.test.js),
[převod](../../functions/moderation_queue_transition.integration.test.js),
[soukromí Rules](../../tools/rules/moderation_queue_access.integration.test.mjs).
Samostatně prošel skutečný účtový purge a opakované měření (2/2 vybrané testy).
Pokryté jsou přes 50 případů, 120 hlášení jednoho cíle, souběh, restart,
ztracená odpověď, změna role/oblasti, jediné provedení účinku, příchozí hlášení,
archivní původ, částečná retence, ztráta rodičovského kontextu a rollback.

Klientské cílené testy **15/15**, kompletní Flutter sada v CI **616/616**,
analýza bez nálezů. Functions jednotkové kontroly v CI:
**237 pass /945 skip /0 fail**; vynechané emulátorové případy
nejsou vydávané za spuštěné, jejich matice má vlastní CI kroky.
Nástroje/geo/retence/balíčky místně **48/48**, lint Functions bez chyb;
úplná CI sada vývojových nástrojů **142/142**.

**Úplné CI 46131153276 success** pro přesný zdroj
`65c5b0b9ed7987039b054248f17db2b08a6b4306`:
[běh a všechny kroky](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46131153276).
Prošly i původní Rules/serverové transakce (500/500), archiv (194/194),
nová fronta (32/32), původní rozhodnutí/sankce, B2, účtový purge (156/156),
Storage (16/16), browserové kontroly, analýza/formát a DEV debug archive
webové sestavení. Jednotlivé matice mohou opakovat stejný kód, proto je
nesčítáme do údajně unikátního počtu scénářů. Nejde o živý Auth/App Check pilot,
produkční build, kapacitní zkoušku ani živou migraci.

Evidence stávajících příslušných úseků v progress.json aktualizována, pevné
váhy a hotové fáze zachovány. Nová DEV aktivace a úplná ruční regrese se
nezapočítávají jako hotové; MVP zůstává 62,26 %. Oprava dříve započteného
kritéria nepřidává stejnou implementační váhu podruhé.

### Naměřené operace

Skutečné SDK transakce nad syntetickými malými hlavičkami; založení fixture,
uložení archivních těl a úklid nejsou součástí měřeného přenosu.
Jedna existující thread hlavička, společný autor a reportér. Stránky zahrnují
i poslední prázdnou kontrolu při přesném násobku 50:

| Případy | Požadavky | SDK reads všech stránek | Nové zápisy projekce včetně původních reportů | JSON odpovědí klientovi přibližně |
|---|---:|---:|---:|---:|
| 50 | 2 | 172 | 150 | 37 kB |
| 200 | 5 | 661 | 600 | 149 kB |
| 2 000 | 41 | 6 529 | 6 000 | 1,50 MB |

Projekce 50 různých nových případů: **152 reads /150 writes /4 SDK read
volání**. Nový report přidá jedno členství a změnu jedné společné hlavičky;
více změn stejného případu v transakci se složí do jedné hlavičky. Nejde
o stejné číslo jako celý callable s původním receipt, kvótou a archivem.
Reader nečetl **žádné celé tělo**, nezapisoval. Bodová čtení i minimum jedné
položky pro prázdný dotaz jsou započtené. Indexové položky, síťová režie,
cloudové latence/ceny a různí autoři/reportéři mají jiné náklady; tabulka
neprokazuje kapacitu 5 000 současných uživatelů.

Indexový kandidát má 4 nové složené indexy, zachovaná ostatní nastavení a
digest `8f9598d59e8e43ed674beafb43a37f5f9c35df7022989832ae30c517f7fa2e34`.
Definice pořadí sdílejí skutečný reader i plán, takže nové řazení nemůže
nepozorovaně používat druhý ručně opsaný seznam indexů. Živou inventuru
a nový digest je nutné před budoucím použitím znovu ověřit.

## Navazující schválený DEV postup

Vlastník 28.11.2026 schválil celý následující DEV úsek včetně pilotu.
Živé mutace nadále podléhají úspěšnému úplnému CI přesného zdroje:

1. Připravit skutečné callable wrappery tří výše uvedených obsluh, řízený DEV
   operátor a kompatibilní návratový web. Navržený první DEV profil odpovídá
   dnešním callables: europe-west3, min0/max1, concurrency1, 256 MiB, 15 s;
   nejde o produkční kapacitu. Doplnit testy a úplné CI přesných zdrojů.
2. Čtecí inventura v `shoutout-dev-46c81`, selektivní čtyři indexy bez TTL,
   kontrolované založení building control a převodního checkpointu. Cílem je
   připravená projekce bez změny zdrojového obsahu, archivů a původních lhůt.
3. Kompatibilně aktualizovat report writery createContentReport,
   decideContentReports, removeReportedPublicContent, removeReportedPrivateReply,
   sanctionContent; dva účtové workery a cleanupOperationReceipts. Prostředky
   a stávající minutové plánovače neměnit. Zahrnout ověřené balíčky, přesné
   zdroje a prokázané doběhnutí původních revizí před živým převodem.
   Aktivovaný prázdný reaper přidá podle připraveného kódu jednu control
   a jednu prázdnou query operaci za běh; stávající interval zůstane minuta.
   Před zapnutím změřit celé spojení s dosavadním retenčním runnerem a
   ověřit časový rozpočet, nejen jeho samostatné části.
4. Převzít všechny doložené pending reporty po nejvýše 50, auditovat počty,
   členství a hranice. Chybějící důkaz či nedoběhnutý writer přechod zastaví.
   Potom aktivovat reader a nový web. Přímý přístup k soukromé projekci dál
   odmítá současná Rules; nová oprávnění, služby ani klíče nejsou potřebné.
5. Pilot pouze pod existujícími testovacími účty: navrhuje se nejvýše jeden
   nový 24h Shout, 50 veřejných komentářů a jedna soukromá odpověď s vymezenými
   syntetickými reporty (52 případů pro 50→52). Původní kvóty se neresetují;
   syntetický seed musí být předem přesně vymezený manifestem. Živé skupiny
   nad 50 různými reportéry by vyžadovaly další identity, proto jejich
   deterministická regrese zůstane v emulátoru bez nových živých Auth účtů.
   Ověřit oprávnění, pokračování, pauzu/návrat a úklid přes společné writery.
   Ruční kontrolu seskupit až na konec; žádný nynější ruční test není potřeba.

Produkce, main, nové role, obecná retence, nové Scheduler joby a dosavadní
pending žádost zůstávají mimo tento úsek. Pilot je schválen na jeden 24h
Shout, 50 komentářů, jednu soukromou odpověď a 53 hlášení (52 případů).
Další fixture ani nové provozní meze tento souhlas nepokrývá.

Místní vývoj probíhá ve větvi `feature/moderation-queue-completeness`.
Nové zapojení není dosud vydané; [aktuální DEV](../PROJECT_STATUS.md)
zůstává na dokončené opravě F-01/F-02/F-06.

<a id="dev-implementation"></a>

## Provozní balík F-04 – příprava 28.11.2026

Práce pokračuje ve větvi `feature/moderation-queue-dev`. Tento záznam
rozlišuje připravený kód a skutečné nasazení; nové živé zápisy zatím neproběhly.
Čtecí inventura DEV: 0 hlášení všech tří typů, 0 případů/journalů, žádný
queue control; 1 původní Shout a 3 původní žádosti o smazání. Nejde o souhlas
s úklidem těchto původních zdrojů. Firestore Standard, europe-west3.

- [Projektová aktivační politika](../../functions/moderation_queue_deployment.js)
  zapíná společné writery/reaper jen v přesném živém DEV projektu. Místní
  a produkční běh zůstávají vypnuté. Tři skutečné callable wrappery používají
  stejný Auth/App Check a managed runtime s archivem a indexovým writerem.
- [DEV operátor](../../tools/moderation_queue_dev.mjs) má read-only inventuru,
  neměnný digest plánu a inkarnaci. Mutace vyžadují čistý commit a úplné CI
  včetně F-04/archivních/sankčních kroků. Začátek vyžaduje READY indexy a
  shodu čerstvé inventury; nepřepisuje už instalovaný control.
- Sdílené [transakční jádro](../../functions/moderation_queue_transition_core.js)
  zachovává původní převod/audit po 50 položkách a 450 zápisech. Původní
  laboratorní vstup dál odmítá živé SDK. `run` provede nejvýše 32 kroků a
  mezi transakcemi sleduje měkkých 10 s; checkpoint umožňuje restart.
- Před adopcí a aktivací [cloudová kontrola](../../tools/moderation_queue_cloud.mjs)
  stáhne skutečné zdrojové ZIPy všech 11 vybraných Functions a porovná jejich
  soubory s čistým artefaktem. Vyžaduje nezměněné prostředky/IAM původních
  Functions, Rules a Scheduler, 100% nový provoz a RETIRED infrastrukturu
  všech předchozích revizí osmi writerů. Čekání podle hodin důkaz nenahrazuje.
- [Selektivní indexový nástroj](../../tools/moderation_queue_dev_indexes.mjs)
  umí jen čtyři schválené POST definice. Nepoužívá mazání, výjimky ani TTL;
  dokončené operace při restartu neopakuje. Další změna plánu končí odmítnutím.
- [Release balík](../../tools/moderation_queue_dev_release.mjs) zachovává
  aktivní archiv/právní verzi i vydanou hru. Aktivní i kompatibilní návratový
  profil mají úplnou novou frontu, společné writery a úklid. Starý web
  s prvním limitem 50 není návratovou frontou. Nouzová pauza control blokuje
  nové obsluhy, nikoli tvorbu projekce ani sedmidenní reaper. Návrat/resume
  jsou CAS operace s přesnou inkarnací a revizí; opakování ztracené odpovědi
  je bezpečné. Po změně revize klient obnoví neplatný kurzor od první stránky
  až po úspěšné odpovědi, původní seznam během chyby ponechá.
- [Pilot](../../tools/moderation_queue_pilot.mjs) nevytváří Auth ani role,
  nepřijímá právní souhlasy a neresetuje kvóty. Vyžaduje čtyři existující
  doložené identity a dostupného klienta. Přesný manifest váže verze profilů,
  původní zdroje, kontrolní dokumenty a 24h platnost. Syntetické zápisy jdou
  přes skutečný archiv/index/projekci; nejde o měření běžného callable ani
  jeho kvóty. Opakování doplní jen chybějící vlastní ID, po vyřízení či
  odstranění už seed odmítne. Živý pilot ještě není založený.
- Úklid nejdřív odstaví vlastní kořen skutečným indexovým writerem a odstraní
  vymezené reporty přes projekční adaptér. Samostatný plán fyzických fixture
  kontroluje přesné SDK verze, původ archivů a neznámé potomky; mazání je po
  nejvýše 40 řádcích, s indexovým writerem při odstranění zdroje. Uklidí i
  vymezené read klíče, ne technická potvrzení/journaly před sedmi dny,
  skutečné identity, původní obsah či žádosti. Není to obecný retenční purge.

Společný skutečný SDK test plánovaného retenčního runneru:
v klidu **5 reads /0 writes /3 transakce** (původní 3 +2 queue reads).
50 prošlých technických journalů bez přítomných případů: **154 reads /50
writes /3 transakce**, padesátý první zůstane do dalšího běhu. Pauza queue
reaper nevypíná. Dosavadní fáze zůstávají nejvýše 500 prohlédnutých řádků
a měkkých 10 s každá; nový reaper nejvýše 50 journalů v jedné transakci.
Jde o emulátorové operace, nikoli záruku cloudové latence pod 60 s.
Minutový plánovač stále volá Function 1 440× denně; klidná dodatečná práce
fronty je 2 880 reads/den. Produkční kapacitu tento profil neurčuje.

Před živými mutacemi: úplné CI tohoto balíku, nový plán/digest, čtyři READY
indexy, building control, 11 explicitně vybraných Functions, důkaz doběhnutí,
obnovitelná adopce/audit, aktivace, potom pouze DEV web. Neprovádět hromadný
`firebase deploy` ani nasazení Rules. Po nasazení ověřit skutečné zdroje,
anonymní odmítnutí, zachování prostředí a reálný retenční běh. Fixture založit
až po dostupnosti klienta; živou akceptaci zaznamenat zvlášť.

Místní kontroly tohoto dokončovacího balíku: F-04 emulátorová sada **34/34
bez skipů**, provozní kontrakty nástroje **6/6**, obálky Functions **2/2**,
klient fronty **10/10**, Functions lint a Flutter analyze čisté. Vývojové
nástroje před závěrečným doplněním dvou kontraktů prošly 146/146. Úplné CI
aktivačního commitu a skutečné nasazení ještě nejsou doložené. Původní
váhy metrik se nemění; živou akceptaci nepředjímáme.
