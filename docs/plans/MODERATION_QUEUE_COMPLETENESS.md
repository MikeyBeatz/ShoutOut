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
  V jedné transakci vybere nejvýše 50 hlaviček a malé maskované podklady,
  nikdy plná těla. Kontroly účtových termínů jsou společné a dávkované.
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

Klientské cílené testy **15/15**, kompletní Flutter sada před posledním
doplněním dvou regresí **614/614**, analýza bez nálezů. Functions jednotkové
kontroly: **237 pass /944 skip /0 fail**; vynechané emulátorové případy
nejsou vydávané za spuštěné, jejich matice má vlastní CI kroky.
Nástroje/geo/retence/balíčky **48/48**, lint Functions bez chyb.
Úplné CI přesného finálního zdroje zbývá před dokončením tohoto checkpointu.

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

## Navazující DEV postup k projednání

Tento seznam je návrh dalšího společného úseku, **není souhlas se spuštěním**:

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
pending žádost zůstávají mimo tento navazující návrh. Přesné fixture a
případné provozní meze musí vlastník schválit před živými zápisy.

Místní vývoj probíhá ve větvi `feature/moderation-queue-completeness`.
Nové zapojení není dosud vydané; [aktuální DEV](../PROJECT_STATUS.md)
zůstává na dokončené opravě F-01/F-02/F-06.
