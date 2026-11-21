# B4 – řízený přechod na metadata, cache a živý stav

[Rozcestník](README.md) · [Hotový klient a důkazy](FEED_STATE_STORAGE_PROPOSAL.md#client-integration-results)
· [Pravidla vydání](../../operations/RELEASING.md)

## Stav a rozsah

21. listopadu 2026: **schválený lokální přechodový úsek je uzavřený**.
Zdroj **cd21019d846aa018c8d7939ca62c994ba6082520** má
[success úplné CI 44929196473](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44929196473).
Vlastník rozsah schválil v odpovědi na call_a0d99f40f57446909fb11ba932047dcd.
Živá migrace schválená není, přepínače zůstávají vypnuté.
Zdroj předchozího klienta 62fc8fe má success úplné CI 44917393562;
uzavírací dokumentace 6c2c7f3 má success lehké CI 44918771643.

Původní inventura provedla pouze čtení DEV a kontrolu kódu. Žádné nasazení,
změna obsahu, řídicího dokumentu, generací, indexů, Rules ani Auth účtů.
Nezapočítává se jako nasazení nebo živá akceptace v metrikách.

<a id="read-only-inventory"></a>

## Ověřený výchozí stav

Čtecí inventura 21. listopadu, 15:25 UTC, projekt `shoutout-dev-46c81`,
databáze `(default)`, **STANDARD**, region europe-west3:

| Oblast | Potvrzený stav |
| --- | --- |
| Control | schemaVersion 1, revision 6, active; reader feed-v2 |
| Udržované generace | feed-v1 a feed-v2, obě formát v1 / accountRetention true; feed-v2 má readIdentity 1 |
| Původní Shouty | 38: 27 expired, 11 deleted, 0 active a 0 nyní viditelných; žádný purged kontext |
| Geografie | všech 38 má platný geohash a souřadnice; cardRevision zatím nemají |
| Účty | 14 autorů těchto zdrojů, žádný jejich veřejný deleted marker; 1 čekající žádost |
| Indexy | 12 složených indexů / 21 výjimek; žádný publicStates index ani některá z 13 navržených výjimek |
| Functions | 20 existujících v2 Functions, europe-west3, max. 1 instance / concurrency 1 / 256 MiB |

Otisk ID/updateTime nepurged zdrojů z této inventury:
`938a7accefb3ab802896cf63a185df2e7213efd00e591f5dc89348bb4c25717d`.
Jde o podklad kontroly, **ne schválený digest mutačního plánu**. Před živým
provedením se stav znovu načte; souběžné změny se nesmějí přepsat.

Zvolený kandidát nové generace je `feed-v3`; v inventuře neexistuje.
Její skutečné založení zatím není povolené. Přechod musí fungovat také
s aktivním obsahem a souběžnými uživateli; prázdný feed není podmínkou.

## Nálezy před schválenou implementací

- `createCardBackfill` má begin/step/beginAudit/auditStep: dávky nejvýše 50,
  dělení příliš velké dávky a společný rozpočet 450 zápisů. Doplňuje malé
  stavy i pro expirované a smazané zdroje; aktivní obsah patří do prostorového
  stromu. Účtové deleted markery a purged kontexty zůstávají chráněné.
- Jádro zatím končí v ready. Nemá hotovou řízenou aktivaci, rollback,
  resume/abort ani veřejný operátorský vstup pro tento formát.
- Dosavadní `feed_generation_transition.mjs` obsluhuje přechod B3 bez
  content identity na v1 s content identity. Jeho planner očekává jediný
  původní writer; dnešní DEV má dva. Nelze jej použít k B4 ani kvůli němu
  odstranit feed-v1 z writerů.
- Statická kontrola `getCompatibleFeedPageOperation` zjistila, že při
  zapnutém přepínači posílá nové starší požadavky přímo do V2, i když
  card reader ještě není aktivní. Před doplněním nebo po rollbacku by tak
  počáteční načtení skončilo odmítnutím. Není to chyba nasazeného DEV:
  nový přepínač je vypnutý. Přechod musí tuto mezistavovou kompatibilitu
  vyřešit a otestovat před nasazením.
- Zvlášť musí projít již otevřený nový klient po návratu na starý reader,
  včetně jeho živého stavu a Home promo odběru. Samotná výměna webu nezmění
  kód již otevřené karty. Fallback se smí spustit jen na explicitní serverové
  capability; běžná chyba oprávnění nebo sítě nesmí otevřít jinou čtecí cestu.
- Audit potřebuje pevně vynucenou platnost původního snapshotu, úplné
  ověření journalu a retenčních pojistek, bezpečné pokračování a ochranu
  opakovaného startu po ztracené odpovědi. Využít vzory B3; neurčovat nové
  produktové lhůty ani neomezeně zvětšovat pracovní dokument.

<a id="local-transition-proposal"></a>

## Schválený lokální úsek

Jeden ucelený úsek **operátor + kompatibilní přechod/rollback + emulátorový
pilot**, bez aktivace v cloudu:

1. Doplnit řízené plánování a status, obnovitelné doplnění, audit, aktivaci,
   rollback, resume a abort pro card generaci. Každá mutace provede omezený
   krok; ověřuje přesný projekt, digest, původní control revizi, inkarnace
   a vlastnictví jobu, čistý commit a úspěšné úplné CI. Povinné kontroly
   zahrnou i tři nové B4 sady. Zachovat všechny dosud udržované generace.
2. Zpevnit audit a bezpečné opakování existujícího jádra. Ready nestačí
   samo o sobě k přepnutí: aktivace ověří platnost auditu, aktuální control,
   původní inkarnace a R5. Po rollbacku vyžaduje resume nový audit. Abort
   nezlikviduje registrované generace ani jejich retenční podklady.
3. Doplnit serverové rozhodování podle skutečně aktivní capability a
   klientské zpracování potvrzeného návratu. Starý klient/kurzor funguje
   během doplňování i po aktivaci; již otevřený nový klient musí po rollbacku
   bezpečně přejít na kompatibilní čtení, živé počty a promo. Zachovat
   Auth/App Check, B2/B3, stabilní pořadí a okamžitý náhled interakcí.
4. Připravit přesný selektivní indexový plán podle
   [návrhu](B4_CLIENT_INDEX_PLAN.json): jeden složený index a 13 výjimek.
   Inventura, digest a kontrola driftu ochrání nesouvisející indexy i TTL.
   Indexové API není jedna atomická transakce; případné částečné provedení
   musí být rozpoznatelné a obnovitelné, ne vydávané za úplný úspěch.
5. Ověřit v emulátoru dva původní writery + nový card writer, prázdné
   i neprázdné zdroje, aktivní/expired/deleted/purged obsah, souběh publikace,
   reakcí, komentářů, záložek, mazání účtu, expirace a R5. Zahrnout restart,
   ztracenou odpověď, stale plán/inkarnaci, chybné pokrytí, propadlý audit,
   překročení rozpočtu, staré/nové kurzory a rollback již otevřeného klienta.
   Změřit skutečnou práci tří generací. Nevydávat to za cloudový load test.
6. Doložit přesné budoucí pořadí nasazení a odvodnění starých writerů,
   návratový web/reader a rozsah živého pilotu. Společný commit/push a úplné
   CI; aktualizovat stav a důkazy bez nového kreditu za již uzavřený klient.

Přepínače zůstanou vypnuté. Rozsah zahrnuje potřebné lokální zdrojové změny
operátoru, jádra přechodu, kompatibility serveru/klienta a jejich testů;
**nezahrnuje nasazení, živé kolekce nebo migraci, indexové/Rules zápisy,
nové či mazané Auth účty, nové služby/klíče, Scheduler, změnu prostředků,
oprávnění, retence, produkce nebo main**. Číslovka novinek se tím nezavádí.

<a id="future-dev-order"></a>

## Budoucí živý DEV postup – zatím nepovolený

1. Čerstvá inventura a konkrétní schválený plán/digest; přesná CI a čisté
   artefakty. Bez převzetí starého inventurního otisku jako povolení mutace.
2. Selektivní příprava indexů; ověřit READY a zachování ostatních indexů/TTL.
3. Nasadit kompatibilní serverové writery, reader a lokálně ověřené Rules
   v pořadí doloženém testem mezistavů. Ověřit skutečné revize a doběhnutí
   starých volání **před založením udržované card generace**. Nový guard
   zpětně neochrání starý Admin zápis bez této kontroly. Samotné vyčkání
   nakonfigurovaného timeoutu se nebude vydávat za důkaz odvodnění.
4. Založit cílovou generaci, po dávkách doplnit všechny způsobilé stavy
   a aktivní prostorová metadata, provést audit. Původní zdroje a jejich
   updateTime mají zůstat beze změny samotným backfillem. Čekající žádost
   se nepoužije jako fixture ani se nebude ručně zpracovávat.
5. Atomicky přepnout reader a card reader při zachování původních writerů,
   ověřit staré i nové čtení. Potom zapnout schválený DEV web, ověřit
   metadata/cache, živé stavy, oba typy účtů, promo a návrat.
6. Živý pilot a jeho úklid povolit zvlášť podle připravených fixture ID,
   počtu, TTL, účtů a writeru. Dřívější uklizené B3 fixture neopakovat.
   Odstranění starých generací a vypnutí kompatibilních publisherů nejsou
   součástí rollbacku; vyžadují vlastní retenčně bezpečný plán.

Z čtecí inventury a konfigurace vychází tento seznam **10 existujících**
Functions, jejichž společný writer/reader se bude týkat připraveného přechodu:

- content: createShout, deleteShout, toggleShoutReaction,
  prepareAccountDeletion, createComment, deleteComment, toggleShoutSave,
  getFeedPage;
- account-deletion: accountDeletionRequestCreatedDev,
  resumeAccountDeletionJobsDev.

Callables zůstávají na 15 s, dva workery na 60 s; max. 1 instance,
concurrency 1, 256 MiB, stávající evropský region. Toto je seznam kandidátů
budoucího rolloutu, ne příkaz k nasazení. **enrichShoutGeography v inventuře
nasazených Functions není**; B4 ji nesmí mimoděk založit nasazením celého
index.js. Příprava jejího publisheru zůstává v kódu pro samostatně schválené
zapojení. Ostatní codebase a jejich Scheduler se tím nemění.

## Podmínka uzavření a další práce

Lokální úsek bude hotový až po úspěšném úplném CI, prokázaném přechodu
i návratu, nákladovém reportu a konkrétním návrhu živého pilotu. Implementace,
nasazení a živá akceptace se evidují zvlášť; samotný plán nezvyšuje stupnice.
Po živém ověření metadat/cache následují signály a číslovka novinek, potom
společná B4 akceptace. Cíl 100 000 účtů / 5 000 aktivních relací dál vyžaduje
samostatnou kapacitní bránu.

<a id="local-transition-results"></a>

## Implementace lokálního přechodu

Dokončené zdroje, ověřené úplným CI uvedeným výše:

- [Operátor](../../../tools/feed_card_transition.mjs) používá stejné kontroly
  čistého SHA, úplného CI a produkčního tagu jako B3; navíc vyžaduje všechny
  čtyři B4 testovací kroky. Aktuální vypnutá konfigurace zablokuje mutaci
  **před přístupem k přihlašovacím údajům a databázi**. Plan/status jsou čtecí.
- [Transakční jádro](../../../functions/feed_card_backfill.js) a
  [validace](../../../functions/feed_card_transition_validation.js) zachovají
  všechny původní writery a vážou job na digest, control revizi a createTime
  **každé** původní generace. Opakovaný start/aktivace/rollback/abort nerozmnoží
  zápisy; opakovaný datový krok pokračuje podle journalu, stav se před ním čte.
  Neplatná fáze se odmítne. Samotný backfill nemění zdrojová updateTime.
- Audit porovnává source/public/index pokrytí v jednom připnutém snapshotu,
  ověřuje stromové souhrny a cesty, ohraničuje journal existujícím rozpočtem
  64 KiB a platností snapshotu 1 hodina. Aktivace znovu ověří retenci/R5.
  Resume po rollbacku odstraní předchozí audit a vyžádá nový. Abort ponechá
  registrovanou generaci a retenční podklady; neprovádí jejich fyzický úklid.
- Server vybírá formát podle skutečné generace. Staré raw i nové neprůhledné
  V1 kurzory zůstávají použitelné v udržovaných generacích. Nový klient dostane
  při změně readeru explicitní `reset` s capability `source-v1` / `card-v1`
  a control revizí. Ponechá již načtené karty a nabídne obnovu; další obnova
  načte správnou cestu. Pozdní odpověď se starší revizí nesmí obnovit starou
  cache ani odběr. Síťová nebo autorizační chyba sama fallback nespouští.
- Živý stav a Home umějí v potvrzeném source režimu původní zdrojové odběry.
  Ty jsou přechodovou kompatibilitou, ne metadatovou úsporou. Zachovávají
  globálních 50 promo kandidátů a následný přesný filtr 20 km. Po rollbacku
  se card generace stále udržuje, takže otevřené karty mohou zůstat funkční
  do dalšího zjištění capability; nepřidává se polling ani nucený skok feedu.
- [Čistý indexový plánovač](../../../tools/feed_card_index_plan.mjs) pracuje
  s úplnou inventurou a digestem, rozpoznává plánované/pending/READY kroky
  i částečné provedení. Povolí jen jeden composite a 13 konkrétních výjimek;
  PATCH maska obsahuje pouze `indexConfig`. Změněné TTL či cizí explicitní
  override zastaví pokračování. Žádný živý indexový HTTP zápis tento modul
  neprovádí. Při návratu readeru se indexy ponechávají; jejich odstranění by
  mělo vlastní plán a nesmí ohrozit dosud otevřené klienty.

Lokální důkazy jsou v [přechodové sadě](../../../functions/feed_card_transition.integration.test.js),
[klientské regresi](../../../test/feed_delta_client_test.dart) a
[kontrolách operátoru/indexů](../../../tools/feed_card_transition.test.mjs).
Zahrnují souběh, idempotenci, 450-write rollback, account preparation/R5,
prázdný/neprázdný start, expired/deleted/purged/autory s markerem, chybné
kořeny, propadlý audit a staré/nové kurzory. Nativní distribuce, živý App Check,
reálná latence/cena a 5 000 relací tím ověřené nejsou.

Lokální kontroly: 432 Flutter, čistá úplná analýza a formát, 87 nástrojových,
159 Functions unit (emulátorové scénáře se v unit běhu přeskakují), 8 nových
přechodových, 14 card/backfill, 9 reader a 11 transportních emulátorových
testů. Samostatný Chrome HTTP transport proti emulátoru prošel včetně
odpojení/doplnění; regresi přechodu živých odběrů prověřuje Dart sada.
Lint a dokumentační kontroly také prošly. První lokální pokus o browser
skončil `spawn dart ENOENT`; po nastavení přesného `DART_BIN` prošel.
To nebyla chyba aplikace ani úspěšný browser důkaz prvního pokusu.

[Transakční měření přechodu](../../benchmarks/FEED_B4_TRANSITION_2026-11-21.json):
55 zdrojů / dva původní writery + nový card writer, celé omezené backfill
volání včetně status guardu: **155 reads / 62 pokusů zápisu / 4 transakční
pokusy**. Žádný zdrojový zápis, žádné prodlužování retence. Samostatné
start/audit/aktivace nejsou v tomto čísle; předchozí P1 má vlastní auditní
měření 50/200/2 000. Jde o operace SDK, ne fakturu nebo produkční load test.
Při stejných třech generacích má změna palce **17 reads / 11 writes**,
změna textu **14 reads / 8 writes**, obě po jednom transakčním pokusu.
Publisher vyhodnotí všechny generace; nejstarší bez content identity
nepřepisuje prostorová metadata při samotné změně textu. Tyto zápisy jsou
náklad dočasně udržované kompatibility, ne příslib nulové režie.
Předchozí běh
44928446576 pro 6d41273 byl zrušen po doplnění tohoto úplnějšího měření;
není dokladem dokončení ani neúspěšného cloudového nasazení.
CI 44928809756 pro 2cb7ea2 selhalo v `Test development tools`, protože nový
operátor importuje serverové moduly a instalace Functions následovala až
po tomto kroku (`geofire-common` nenalezeno). Pořadí je opravené: instalace
Functions je před nástrojovými testy; žádná nová závislost ani změna služby.
Tento neúspěšný běh nenahrazuje potřebné úplné CI finálního commitu.

**Konečné CI je úspěšné:** 44929196473 pro přesný zdroj cd21019d846aa018c8d7939ca62c994ba6082520.
Potvrdilo 432 Flutter, 87 nástrojových, 159 Functions unit (528 emulátorových
testů v unit běhu správně přeskočeno), 464 Rules/server, 9 reader, 14 card,
13 transport/Rules/Chrome, 8 přechodových, 34 B2 runtime, 142 purge a 15 Storage
testů; formát, analýzu/lint, browserové sady a webový build také.
Operátor proti skutečnému GitHub výsledku ověřil všechny požadované kroky,
shodu úplného SHA a čistý pracovní strom před uzavírací dokumentací.
Žádné Firebase nasazení, živé zápisy, Rules/indexy, Auth, Scheduler,
prostředky, main ani produkce se tímto úsekem nezměnily.

Evidence v progress.json doplňuje existující lokální code/check podklady;
jejich váhy a stavy se znovu nezapočítávají. DEV/akceptace i novinky zůstávají
otevřené, proto tento přechodový checkpoint sám nezvyšuje procenta.

<a id="future-dev-pilot"></a>

## Konkrétní návrh budoucího pilotu – čeká na schválení

Pouze `shoutout-dev-46c81`: kandidát `feed-v3`, nový čtecí plán/digest po
inventuře, žádná změna Auth účtů. Po úplném CI aktivačních SHA nejprve indexy,
kompatibilní existující serverové revize a odvodnění starých volání, potom
start/backfill/audit/activate a DEV web. Rules z předchozí klientské přípravy
se ověří a nasadí samostatně před zpřístupněním publicStates; nenasazovat
celý nesouvisející seznam indexů. Aktuální prostředky a Scheduler zůstávají.

Navržená fixture: **120 nových syntetických Shoutů na 24 hodin**, 60 pod
Bright_Otter_182 a 60 pod TestBusiness, bez změny skutečných značek přečtení.
Pouze těmto novým ID nastavit 70/20 testovacích přečtení a vybrané promo
příznaky. Ověřit 50 → 100 → 120, cold/warm/doplnění jednoho těla, B3 skupiny,
kartu/detail/Mé/Uložené, počty, promo a návrat již otevřeného klienta.
Rollback ponechá tři writery, vrátí reader na feed-v2 a nabídne obnovu;
resume vyžádá nový audit. Nakonec přes společný writer uklidit pouze fixture
a jejich testovací značky. Původních 38 zdrojů a původní pending žádost se
nepoužijí jako fixture. Pevné ID/digest a rollback artefakt předložit až po
čerstvé inventuře; dosavadní čtecí otisk nepředstavuje souhlas s migrací.

Odvodnění je zatím **otevřená živá brána**: doložit nové ACTIVE revize všech
10 uvedených Functions, nulový provoz do starých revizí a dokončení jejich
rozpracovaných volání/logů. Pokud to dostupná telemetrie nedoloží, přechod
nezahájit a předložit vymezené servisní okno. Samotné 60sekundové čekání nebo
zaškrtnutí `compatibleWriters` v interním testu tento důkaz nenahrazuje.
