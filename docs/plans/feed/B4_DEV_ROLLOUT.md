# B4 – řízený přechod na metadata, cache a živý stav

[Rozcestník](README.md) · [Hotový klient a důkazy](FEED_STATE_STORAGE_PROPOSAL.md#client-integration-results)
· [Pravidla vydání](../../operations/RELEASING.md)

## Stav a rozsah

21. listopadu 2026: **schválený lokální přechodový úsek je uzavřený**.
Zdroj **cd21019d846aa018c8d7939ca62c994ba6082520** má
[success úplné CI 44929196473](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44929196473).
Vlastník rozsah schválil v odpovědi na call_a0d99f40f57446909fb11ba932047dcd.
Navazující živý DEV přechod vlastník schválil po vysvětlení postupu a
indexových výjimek („dobře souhlasím“). Aktivační verze se nyní připravuje;
dosavadní živý web/server se tímto zápisem nemění.
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

## Schválený DEV pilot – připravovaný rollout

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

<a id="dev-rollout-progress"></a>

## Aktuální příprava DEV

Čerstvá čtecí inventura 21. listopadu 17:42 UTC potvrdila STANDARD/europe-west3,
38 původních zdrojů (27 expired / 11 deleted), žádný aktivní, jednu žádost
bez potvrzení odstranění Auth, stejných 20 Functions a dostupný Monitoring.
Hosting je stále 5b4d711b715a85e3 ze zdroje fc795ad; jde také o návratovou
verzi webu. Žádný indexový/datový zápis ještě neproběhl.

Připravené konkrétní plány pouze pro shoutout-dev-46c81:

- přechod feed-v2 → feed-v3, původní control revision 6, všechny původní
  inkarnace zachované; digest
  `06232230b447b2a1a57780ed341c8853ed6eea12fd7cbe396111f81e9f2a0e67`;
- jeden composite + 13 výjimek, bez TTL; digest
  `2ab00cd9aa473d569f87557bfb9779f62e007d46b11a9ed87767140c7ef97585`.

Aktivační commit zapíná společné serverové přepínače a DEV serverDeltaFeed.
Nasazení má pořadí: indexy → 10 existujících Functions → ověřený drain →
Rules → start/backfill/audit/activate → web → pilot/rollback/resume/úklid.
Každý skutečně nasazovaný SHA musí nejprve projít úplným CI.
První aktivační běh 44932675068 pro f9117a6 zastavil card test: simulace
starého writeru dědila nově zapnutý card přepínač. Správně odmítla zápis,
ale jako nový writer hlásila `unapplied-card-source-plan`. Simulace nyní
výslovně používá `cardStateEnabled: false` a dál požaduje odmítnutí starého
writeru. Bez oslabení runtime ochrany; po opravě se před nasazením znovu
ověřují související sady a úplné CI. Žádný živý zápis dosud neproběhl.
Rozšířený místní průchod navíc zachytil starší metadata-only fixture R6,
která nemá úplné veřejné tělo ani všechny zdrojové snapshoty nové card
cesty. Tato starší sada nyní výslovně testuje svůj původní režim s card
publisherem vypnutým; aktivní úplnou cestu dál pokrývají samostatné B4 sady.
Read-only kontrola všech 38 skutečných DEV zdrojů potvrdila platný nový
card kontrakt (0 chybných); není potřeba opravovat původní data.

Navazující CI 44934903548 pro a792243 bylo zrušeno po nálezu ještě jedné
staré fixture operátoru bez authorNickname. Fixture nyní obsahuje platné
veřejné tělo i pro aktivní publisher; produkční validace se nemění.
Úplná místní sada purge/R5/R6/runtime/operátoru poté prošla: **142/142**
bez chyb (build/b4-dev-purge-activation.log). Před nasazením následuje
úplné CI konečného kandidáta; z neúspěšných kandidátů se nic nenasadilo.

[Kontrola drainu](../../../tools/feed_revision_drain.mjs) vyžaduje 100 %
provozu na nové připravené revizi a serverový stav Active/RETIRED u všech
historických revizí. Stav RETIRED podle [dokumentace Cloud Run](https://docs.cloud.google.com/run/docs/managing/revisions)
znamená vyřazenou infrastrukturu této revize. Prázdné metriky ani samotné
čekání nejsou důkazem. Při chybějícím potvrzení se generace nezaloží.

[Nový pilot](../../../functions/feed_b4_pilot.js) má vlastní guard/digest,
120 nových ID, oddělené 70/20 přečtení a zachování původních zdrojů.
[Emulátorová sada](../../../functions/feed_b4_pilot.integration.test.js)
ověřuje idempotenci, cold/warm/refill, tři generace, ochranu cizích potomků
a historie při úklidu. Dva Business Shouty dostanou promo až po ověření
120 běžných karet; po této vymezené změně bude v běžném feedu 118 a v promo
2. Nejde o ztrátu dat. [CLI](../../../tools/feed_b4_pilot.mjs) vyžaduje přesný
úspěšný úplný CI a před úklidem potvrzení dokončené klientské akceptace.

Před živou prací je z nedokončené váhy nasazení/akceptace B4 oddělená
metadata/cache část a zbývající společná část s novinkami, v každé stupnici
půl na půl. Hotové váhy zůstávají zachované; nové úseky jsou zatím nehotové.

<a id="dev-rollout-results"></a>

## Nasazená metadata/cache část B4 – 21. listopadu

Přesný zdroj **8b1de6824e116358c4d364785e4b94f57f52fc9d** má
[úspěšné úplné CI 44935555088](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44935555088).
Pouze v **shoutout-dev-46c81** proběhlo:

- Dokončeno všech 14 selektivních indexových kroků. Složený index READY,
  13 field výjimek, všech 12 původních composites zachovaných; bez změny TTL.
  První krátké čekání skončilo před dokončením INITIALIZING; další kontroly
  byly pouze čtecí. Žádný druhý composite se nezakládal.
- Aktualizováno přesně deset Functions ze schváleného seznamu. Všechny
  ACTIVE, 100 % provozu na nových revizích, **všech 63 historických revizí
  RETIRED**. Min0/max1, concurrency1, 256 MiB a timeouty zůstaly stejné.
  Oba existující plánovače mají shodné provozní parametry jako před změnou.
  Závěrečná inventura potvrzuje 20 Functions: 10 aktualizovaných, ostatních
  10 s původními revizemi i prostředky. Anonymní getFeedPage/createShout/
  prepareAccountDeletion správně vracejí 401 UNAUTHENTICATED.
- Rules `7b0e81f6-d153-4c7e-8763-a75965a1896c` odpovídají nasazovanému souboru.
  Předchozí ruleset je uložený v místním důkazu pro návrat.
- Řízený start, backfill 38 původních zdrojů, audit a aktivace feed-v3;
  následně skutečný rollback na feed-v2, nový audit a reaktivace feed-v3.
  Aktuální control **revision 11**, reader/card reader feed-v3,
  writery feed-v1/feed-v2/feed-v3, card writer feed-v3.
- Hosting **fa20f566fc0ab82b**, release **2026-11-21T18:52:14.959Z**.
  Zkontrolováno 67 aplikačních cest + 2 rezervované Firebase soubory;
  HTML, main.dart.js a app-config.json mají na obou doménách shodné SHA-256
  s ověřeným release buildem. Skrytý místní .last_build_id se podle Hosting
  ignore pravidel neposílá. DEV serverDeltaFeed je true; produkce nezměněná.

Pilot má digest
`e009741c9863bc4644ab8b0777fec3e71f8afa4521c9a4fef973512f023d579a`:
120 nových 24h Shoutů pod oběma původními testovacími účty a 70/20 značek
pouze jejich nových ID. Oba účty prošly 50 → 100 → 120 v obou čtecích
režimech, správnými skupinami a delta cold/warm/refill: první stránka 50,
warm **0 těl**, doplnění **1 těla**. Dvě Business promo položky poté prošly
presentation cestou; běžných karet je nyní 118, promo 2.
Před rollbackem byl zachovaný skutečný podepsaný rozpracovaný požadavek;
po rollbacku dostal reset/source-v1 a původní cesta vrátila 50 karet.
Po novém auditu opět card-v1/feed-v3 a 50 karet. Původních 38 zdrojů i
jedna pending žádost mají stále původní updateTime, žádné Auth mutace.

Tyto živé důkazy používají **interní serverové jádro**; nejsou důkazem
callable Auth/App Check ani UI akceptace otevřeného uživatelského okna.
Computer Use zastavila automatická bezpečnostní kontrola kvůli nemožnosti
spolehlivě ověřit URL na Windows; další UI ovládání se neprovádělo.
Vlastník následně potvrdil konkrétní průchod pro oba účty bez konzolových
skriptů; [akceptace a vymezený úklid jsou uzavřené níže](#delta-acceptance-complete).
Signály/číslovka novinek nejsou implementované ani nasazené; celé B4 není uzavřené.

Obnovitelné místní podklady: build/b4-final-release-proof.json,
build/b4-index-progress.json, build/b4-drain-proof.json,
build/b4-scheduler-before.json a b4-scheduler-after.json,
build/b4-rules-before.json a b4-rules-after.json, build/b4-hosting-proof.json,
build/b4-rollback-hold.json / rolled-back.json / restored.json,
build/b4-scope-proof.json a build/b4-originals-proof.json.
Pilotní stav je docs/local/b4-pilot-state.json v čisté pracovní kopii
build/b4-dev/release-f9117a6 na výše uvedeném SHA; jméno adresáře není SHA.
Po úklidu uložit závěrečný důkaz a ověřit původní inventuru znovu.
Návratový web je 5b4d711b715a85e3 / fc795ad; návrat readeru používat pouze
přes operátor, zachovat všechny tři writery, indexy a retence.

<a id="delta-acceptance-complete"></a>

## Uzavřená DEV akceptace metadata/cache části

**21. listopadu 2026** vlastník odpověděl „vše funguje tak jak má“ na
vyžádaný průchod nové verze pod Bright_Otter_182 a TestBusiness: stránkování
bez skoku, obnova feedu, odlišení přečtení, přidání/odebrání palce a záložky
a detail přes Mé shouty. V samostatném vymezeném logovém okně je doloženo
15 getFeedPage a 2 toggleShoutReaction s HTTP 200 / Auth VALID / App Check VALID;
ukládání pokrývá uživatelské UI potvrzení. Podklad build/b4-ui-acceptance.json
odděluje potvrzení vlastníka od skutečně zachycených serverových událostí.

Po potvrzení proběhl schválený úklid z čistého 8b1de68 / úplné CI 44935555088,
se stejným digestem pilotu a přepínačem clients-complete:

- odstraněno **120** testovacích zdrojů přes společný writer všech tří generací;
- odstraněno **138** cloudových read klíčů pouze těchto fixture;
- ověřena absence všech **120** jejich publicStates a příspěvků v aktuálním
  indexu; historické kořeny zůstávají pod běžnou retencí;
- původních **38** zdrojů a **1** pending žádost mají původní updateTime;
  žádné nové/mazané Auth účty ani změny produkce;
- čerstvý serverový feed pro oba účty vrací 0 karet / 0 těl, protože původní
  zdroje jsou expired/deleted; aktuální control zůstává revision 11 / feed-v3;
- web na obou doménách, Rules a oba plánovače jsou znovu ověřené beze změny.

Doklady: build/b4-cleanup-proof.json, build/b4-originals-proof.json,
build/b4-ui-acceptance.json, build/b4-hosting-proof.json a pilotní stav ve
výše uvedené čisté pracovní kopii má phase cleaned. Tento pilot nezakládat
znovu. Místní klientské značky doběhnou podle své schválené retence.

Uzavírá se **feed-b4-delta-accept**. Otevřené zůstávají signály/číslovka
novinek a společná B4 akceptace. Živý rollback byl doložen podepsaným
rozpracovaným požadavkem a klientský přechod automatickou regresí;
interaktivní UI rollback patří do společné finální regrese B4. Kapacita
5 000 současných relací ani produkční připravenost se tímto pilotem netvrdí.

<a id="news-dev-pilot-proposal"></a>

## B4b – konkrétní DEV aktivace a společné dokončení B4

**Návrh připravený 21. listopadu 2026; vlastník následně schválil celý DEV úsek a testy.**
Navazuje na [uzavřený lokální runtime](FEED_DELTA_REFRESH_PLAN.md#b4b-runtime-results)
ze zdroje 3d381f820b22162cf38eb58b757a80e2c9459b7f / úplné CI
44953434700 success. Předchozí metadata/cache pilot výše je hotový;
neopakuje se jeho migrace ani 120 fixture. Toto je zbývající aktivace
číslovky a společná akceptace, nikoli nový milník či další váha.

### Ověřený výchozí stav a hranice

Čtecí inventura 21. listopadu kolem 22:20 UTC potvrdila pouze projekt
**shoutout-dev-46c81**, databázi `(default)` STANDARD / europe-west3:

- Hosting fa20f566fc0ab82b, serverDeltaFeed true / serverFeedNews false.
- Feed control revision 11, card reader feed-v3; zachované writery v1/v2/v3.
  Feed-v3 createTime je `[1795287050,554987000]`, cardReady true.
  `newsIncarnation` zatím chybí; `feedNewsControl/current` chybí a publicationHeads
  je prázdná. Není nutná nová generace, backfill ani přepis původních Shoutů.
- 38 původních Shoutů / 0 aktivních, 1 původní pending žádost. Jejich ID
  a updateTime jsou uložené pro kontrolu zachování; oba testovací profily existují.
- createShout revize createshout-00006-xah a getFeedPage getfeedpage-00004-vay;
  obě ACTIVE, min0/max1, concurrency1, 256 MiB, 15 s, europe-west3.
  Stávající podpisový klíč je ENABLED; jeho obsah se při inventuře nečetl.
- Tři cílová pole zatím dědí indexaci předka, bez evidované TTL konfigurace.

Podklady jsou build/b4-news-dev-inventory.json a b4-news-services-check.json;
obsahují cloudWrites 0. Před zápisem zopakovat inventuru a zkontrolovat
přesné preconditions. Odlišný stav nesmí vést k automatickému přepsání.

Inventura App Check vrací u Firestore/Storage HTTP 200, ale bez pole
enforcementMode; seznam konfigurací je prázdný. Podle
[oficiálního kontraktu](https://firebase.google.com/docs/reference/appcheck/rest/v1/EnforcementMode)
má nenastavený režim výchozí OFF. **Globální vynucení tedy není doložené**;
nezaměňovat je s Auth/App Check kontrolou callable Functions. Tento pilot
globální nastavení nemění. Rules nadále vynucují ověřený účet a rozsah čtení;
produkční ochrana a kapacita zůstávají součástí startovní brány.

### Jeden společný schvalovaný rozsah

Připravit řízený aktivační/pilotní nástroj, jeho cílené emulátorové testy
a přepínače, dokumentaci, lokální commity, společný push a úplné CI.
Nástroj musí vynucovat přesný DEV projekt, čistý zdroj s úspěšným úplným CI,
digest konkrétního plánu, inkarnaci generace a očekávané verze dokumentů.
Opakování pokračuje z potvrzeného stavu; konflikt zastaví bez částečné změny.
Přesný zápisový plán s ID fixture a digestem vznikne po implementaci nástroje
před první mutací; nynější inventura není vydávána za hotový operátor.

Po úspěšném úplném CI přesného aktivačního commitu provést jen v DEV:

1. Připravit ověřený návratový web bez news a zálohu aktuálních Rules.
   Cíleně vypnout indexaci právě tří polí: `publicationHeads.*`,
   `feedNewsControl.*`, `feedIndexGenerations.newsIncarnation`.
   Zachovat TTL a ostatní indexy; nepoužít celý starý čtrnáctikrokový plán.
2. Pomocí `prepareNewsControlChange` atomicky založit news control v režimu
   paused, revision 1, pro přesnou inkarnaci feed-v3; doplnit markerové
   newsIncarnation a technický publicationHeads/_control. Existující
   generace ve feedIndexControl se nemění. Nasadit připravené get-only news Rules.
3. Ze stejného ověřeného zdroje aktualizovat **pouze createShout a getFeedPage**,
   zapnout serverové newsEnabled/newsRuntimeEnabled. Prostředky i stávající
   podpisový klíč zachovat. Ostatních 18 Functions ani plánovače neaktualizovat.
   Při paused dál funguje běžný feed; nový publisher již udržuje oblastní head.
4. Pro obě cílové Functions doložit 100 % provozu na nové revizi a RETIRED
   infrastrukturu všech předchozích revizí. Starý desetifunkční drain checker
   rozšířit o přesně vymezenou dvojici; nesnižovat požadovaný důkaz na čekání
   nebo nepřítomnost logů. Bez důkazu neaktivovat číslovku.
5. Stejným transakčním helperem přepnout control na active, revision 2;
   technický head se změní ve stejné transakci. Při této první aktivaci navíc
   jednou zvýšit technickou revision feedIndexControl o 1 (11 → 12): ohradí
   případný již odeslaný databázový commit starého publisheru. Zápis stejné
   hodnoty markeru je ve Firestore no-op a tento důkaz nezajistí. Generace,
   writery a retence zůstávají stejné; starý kurzor může požádat o bezpečnou
   obnovu. Opakování a běžná pauza/návrat revizi znovu nezvyšují. Potom nasadit DEV web
   se serverFeedNews true a ověřit artefakt/config na obou DEV doménách.

Četnost 2/15/5 s, nejvýše 64 odběrů, samostatná news kvóta 40/1 s,
hodinová relace a všechny retence zůstávají podle již schváleného runtime.
Nevznikají nové Functions, služby, Auth účty, klíče ani Scheduler úlohy.
Produkce, main, původní obsah a původní žádost se nemění.

### Malý pilot a kritéria dokončení

Nejvýše **3 nové syntetické Shouty** pod existujícími Bright_Otter_182 a
TestBusiness, s jednoznačným manifestem a obnovitelným stavem. A a B platí
24 hodin; C má pouze v administrátorské fixture krátkou platnost 60 sekund
od jejího vytvoření pro ověření expirace. Produktové minimum platnosti se nemění.
Nevytvářet další fixture při opakování; operace musí být idempotentní.

Příprava používá tools/feed_news_activation.mjs a tools/feed_news_pilot.mjs;
integrační testy jsou zapojené do existujícího news CI kroku. A/C mají pevná
manifestová ID a před zápisem uložený čas, aby opakování neprodlužovalo platnost.
B se vytváří skutečným klientem; jeho vygenerované ID nástroj přijme pouze po
jednoznačné shodě schváleného autora, názvu, textu, 24h platnosti a oblasti.
Při duplicitě, zásahu do původního zdroje či cizí konverzaci úklid odmítne.
Ovládání prohlížeče při přípravě opět zastavila automatická URL kontrola;
další UI ovládání neprovádět přes tentýž zablokovaný nástroj. Živý průchod
proto může vyžadovat ruční vytvoření právě B, nikoli dalších fixture.
Lokální příprava doložila 92 tools, 22 konfiguračních Flutter a 24 news
emulátorových scénářů; po posledním doplnění se opakuje cílená sada operátoru.
Úplné CI aktivačního zdroje a skutečné nasazení zatím zbývají.
Čtecí aktivační plán má digest
`ec4debeaee94064798ce97913154f23b95faf28f0061068a201f6eeeabe16b72`
(docs/local/b4b-activation-plan-v2.json, včetně původního controlu pro jednorázový fence);
starší aktivační draft bez tohoto údaje se nepoužívá. Konečný pilotní manifest
`86221a3301eaff9e137bc4a5084c815c25c9057d4c4748478bd02e11244519fe`
(docs/local/b4b-pilot-state-v2.json). Starší draft bez plannedAt se nepoužívá.
Vytvoření obou plánů mělo 0 cloudových zápisů. Bezprostředně před mutací
znovu ověřit jejich preconditions; změněná inventura není povolení k jejímu přepsání.

CI aktivačních zdrojů ebc32f4 / 44958041369 a db13ff7 / 44958266379 skončilo
neúspěšně: nejprve tři starší klientské konfigurační fixture, potom dvě
serverové fixture pro předchozí režim. Při simulaci vypnuté delta/card vrstvy
musí výslovně vypnout i novou news závislost. Validace se neoslabuje;
aktuální news scénáře dál používají zapnutý runtime. Nasazení ani první živý
zápis neproběhly. Následuje společné CI opravených fixture a aktivačního fence.
Cílený následný emulátorový průchod má **54/54 success**:
operátor, card stav/přechod, generace a runtime včetně dávky 50, souběhu,
rollbacku a účetního úklidu. Log build/b4b-cutover-regression.log.

- A vytvoří počáteční kontext. Publikace B po úspěšné obnově musí změnit badge
  na 1 bez přeskupení načtených karet; po jeho smazání počet klesne na 0.
- C ověří novou publikaci a odečtení po expiraci. Ruční obnova v samostatném
  průchodu resetuje baseline/badge, vrátí scroll nahoru a správně zařadí přečtení.
- Ověřit oba účty, návrat do popředí, zachování feedu při výpadku a bezpečné
  pokračování. Klidová nula nemá spouštět opakované plné count dotazy.
- Nejméně jedna publikace a news čtení musí projít skutečným callable s
  Auth/App Check; interní jádro samo platformní/UI důkaz nenahrazuje.
- V otevřeném klientu provést řízenou pauzu a opětovnou aktivaci: technický
  head musí probudit odběr, číslovka se bezpečně zastaví, běžný feed zůstane
  použitelný. Ověřit také kompatibilní návratový web a následné obnovení.
- Společná závěrečná regrese využije tyto stejné fixture: delta/cache,
  stabilní další stránka podle dosavadních automatických důkazů, B2/B3,
  okamžitá reakce/záložka, detail/Mé/Uložené a dosavadní promo regrese.
  Třípoložkový pilot sám nově nedokazuje stránkování nad 50 ani kapacitu 5 000.
- Po UI akceptaci uklidit pouze manifestové zdroje přes společný indexový
  writer a pouze jejich testovací interakce/read značky/receipty. Provozní
  opaque heads, control a news quota záznamy zůstávají pod běžnou politikou;
  neobnovovat slepě jejich předtestovou hodnotu přes souběžné změny.
  Znovu prokázat zachování updateTime všech 38 původních zdrojů a pending žádosti.

### Návrat a uzavření

Před návratem backendu nejprve transakčně paused přes helper včetně _control;
samostatný přepis privátního controlu je zakázaný. Použít kompatibilní web
bez news s ověřeným CI/artefaktem, zachovat běžné feed writery a jejich data.
Bezpečnou pauzu lze ponechat při nesplněné akceptaci; nevydávat ji za úspěch.

Teprve skutečné nasazení uzavře feed-b4-dev; živý badge/pauza/návrat/úklid
feed-b4-accept a společná doložená regrese feed-final-accept. Přípravný plán
žádnou z těchto položek nezaškrtává. Celý serverový mvp-16 navíc ponechává
audit zbývající autority a kompletní produkční akceptaci podle serverového plánu.

<a id="news-dev-rollout-results"></a>

## B4b – ověřené DEV nasazení 22. listopadu, otevřená akceptace

Zdroj **20206c4a4d8b186c54947c04212d6a4c6ec5625f** má
[success úplné CI 44959541907](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44959541907).
Ověřen přesný SHA, všechny požadované kroky a čistá pracovní kopie
build/b4b-dev-release; důkaz build/b4b-exact-release-proof.json.
Web byl sestavený na db13ff7; změny do konečného zdroje jsou pouze operátor,
testy a dokumentace. Git diff lib/web/assets/config/pubspec/build helperu je
prázdný a release manifest/config/obsah znovu ověřené. Serverový artefakt je
znovu připravený z konečného zdroje; obsahuje 61 modulů bez pilotu/laboratoří.

Pouze shoutout-dev-46c81 dosud proběhlo:

- Přesně 3 cílené indexové PATCH s updateMask indexConfig; TTL se nemění.
  Digest ee712e7e7ea7efee6874f111be6c5fa2f769e35dca4b1363d083ca4da89e935b.
  Všechny tři serverové operace jsou dokončené; konfigurace je ověřená bez TTL změny.
- Atomický bootstrap news revision 1 / paused: 3 zápisy, žádné zdrojové
  Shouty. Marker feed-v3 dostal mirror inkarnace a vznikl _control head.
  Při transakci ověřeno původních 38 zdrojů a 1 žádost podle updateTime.
  Po důkazu drainu následovala atomická aktivace news revision 2 / active
  a jednorázové zvýšení feed control revision 11 → 12. Reader i všechny
  udržované generace zůstávají stejné. Aktivace měla 3 zápisy.
- Rules 5dde23bc-6ede-4c90-a2e4-7e47ff3034d2 jsou nasazené; obsah odpovídá
  přesnému zdroji po normalizaci konců řádků. Předchozí ruleset je zazálohovaný.
- Cíleně nasazené ACTIVE createShout createshout-00007-viz a getFeedPage
  getfeedpage-00005-res. Ověřeno min0/max1/concurrency1/256 MiB/15 s, 100 %
  provozu na nových revizích a všech 10 starších revizí RETIRED. Dalších
  18 Functions má původní revize/prostředky a oba plánovače původní konfiguraci.
  Anonymní volání obou callable vracejí 401 UNAUTHENTICATED. Interní běžný feed
  při paused vrací ready/0 karet bez news; nejde o důkaz validního UI přihlášení.
- Hosting **ca327f10112ef349 / serverFeedNews true** je nasazený a ověřený.
  Porovnáno všech 67 aplikačních souborů podle gzip(level9) SHA-256 používaného
  Firebase CLI; celkových 69 zahrnuje 2 rezervované Firebase soubory.
  Na obou DEV doménách odpovídá skutečný index/main/bootstrap/app-config
  lokálnímu syrovému SHA-256 (8 HTTP odpovědí). První pomocný checker nesprávně
  srovnával syrový hash s hashem gzip přenosu; po opravě ověření vše souhlasí,
  obsah webu se kvůli tomu neměnil ani znovu nenasazoval.
- První vytvořený slot byl **A** / mvp-b4b-mwqzrojk-e0183ed3-A. Publikace
  atomicky prošla společným writerem tří generací i regionálním headem.
  Interní jádro vrací oběma účtům 1 kartu, news kontext s 36 heads a count 0;
  count má naměřených 30 SDK reads a 1 news quota zápis na účet. Je to interní
  serverový důkaz, nikoli důkaz validního callable přihlášení/UI či faktury.
  Původních 38 zdrojů a 1 žádost byly znovu ověřené beze změny.
  Auth účty, produkce/main a globální App Check se neměnily.

Podklady: build/b4b-cloud-before.json, b4b-rules-backup.json,
b4b-rules-proof.json, b4b-news-index-plan.json, b4b-news-index-operations.json,
b4b-control-bootstrap.log, b4b-functions-deploy.log, b4b-news-drain-evidence.json,
b4b-news-drain-proof.json, b4b-scheduler-proof.json, b4b-anonymous-callable-proof.json
a b4b-paused-feed-proof.log, b4b-control-active.log, b4b-news-index-status.json,
b4b-hosting-active.json, b4b-fixture-a.log, b4b-active-state-proof.log,
b4b-bright-baseline.log / b4b-bright-zero.log a b4b-business-baseline.log / b4b-business-zero.log.
**Kanonický běhový stav pilotu je v čisté release kopii**
build/b4b-dev-release/docs/local/b4b-pilot-state-v2.json; kořenová kopie je
předstartovní podklad, nepoužívat ji pro další mutace. Operátor i jeho plán
docs/local/b4b-activation-plan-v2.json spouštět z téže čisté release kopie.
**Novější klient:** [Auto dosah](FEED_DELTA_REFRESH_PLAN.md#automatic-radius)
je nyní nasazený ze 6bef37c / success úplné CI 45020677812, Hosting
06df6da99db68e74. Backend i pilotní manifest zůstávají stejné. Při tomto
B4b návratovém testu po obnově vydat nový Auto artefakt, nikoli znovu starý
web 20206c4 uložený v b4b-dev-release; ten je pouze historický podklad.
**Další fixture na žádost vlastníka:** 22. listopadu přibylo 50 samostatných
„MVP restart 22.11.“ Shoutů; manifest docs/local/feed-restart-2026-11-22.json
a [důkazy](FEED_DELTA_REFRESH_PLAN.md#automatic-radius). Nejsou součástí A/B/C
slotů tohoto pilotu. Původních 38 zdrojů i A/B zůstaly beze změny; nový
celkový počet zdrojů je 90. Neopakovat adopci B s původním limitem počtu
zdrojů ani hromadný úklid podle prefixu; každý pilot má vlastní manifest.
Podle živých důkazů je dokončené **feed-b4-dev**. Vlastník vytvořil
**MVP B4b B 183ed3** pod TestBusiness: source
84e4c14d44c679357231fb4993bf3b2ac6b381f3f89d16589f2022c4bdb98b20,
createdAt 2026-11-21T23:35:52.317Z, active, přesně 24 h. Callable createShout
má Auth/App Check VALID a HTTP 200; `adopt` svázal B s manifestem bez cloudových
zápisů. Aktuálně 40 zdrojů, C chybí. Interní count běžnému účtu proti původní
baseline vrací 1 / 48 SDK reads; neprokazuje vykreslení číslovky v UI.

Vlastník při tomto průchodu hlásí chybu načtení feedu a nemožnost změnit 5 km
na 50 km. Klient ukládá nový filtr až po úspěšném načtení, proto tento projev
sám nedokazuje druhou chybu ovládání. Pozorovaná volání B2/getFeedPage mají
platné Auth/App Check a HTTP 200, ale samotný stav HTTP neprokazuje úspěch
konkrétní hlavní stránky feedu (getFeedPage obsluhuje také jiné režimy).

Čtecí diagnostika: skutečná interní odpověď pro TestBusiness / 5 km prošla
FeedNewsSignals i FeedDeltaClient parserem v Dart testu. Další izolovaný test
reprodukuje, že jediná `deferred` B2 značka nedostupného Shoutu ponechá po
úspěšném downloadu `snapshotComplete=true`, `uploadComplete=false` a zablokuje
`synchronizeForFeed`. Fronta i přečtení přitom správně zůstanou zachované.
Cloudové read bloky TestBusiness mají 0 entries a revision 8 beze změny od
19:12:54.174Z, přestože následná upload volání prošla; to hypotézu podporuje,
ale bez místní fronty ji nepotvrzuje. Vlastník byl požádán o jediné porovnání
s čerstvým anonymním oknem. Nemazat IndexedDB/frontu, neopakovat publikaci B
a neuvolňovat podmínku úplné B2 synchronizace bez samostatně ověřeného řešení.
Zdrojový kód ani živá konfigurace se při diagnóze neměnily.

Diagnostické podklady: build/b4b-user-failure-inspect.log,
b4b-user-failure-logs.json, b4b-fixture-b-adopt.log, b4b-bright-new-b.log,
b4b-wire-diagnosis.log a b4b-deferred-diagnosis.log. Dva místní diagnostické
testy prošly; nejde o novou úplnou CI ani o potvrzení příčiny v prohlížeči.

**Následné upřesnění vlastníka:** Network bylo nastavené na Offline. Po
obnovení připojení feed funguje a dosah se změnil; vlastník hlásí delší čekání,
bez měření konkrétní délky či fáze. Předchozí hypotézu B2 nepovažovat za
potvrzenou příčinu jeho chyby a neopravovat ji naslepo. Žádná změna kódu ani
mazání místní fronty kvůli incidentu neproběhly. Při změně dosahu aktuální
klient nejprve potvrzuje B2 synchronizaci pro Nejblíž, potom zakládá novou
relaci s novým radiusKm; filtr zobrazí až po úspěchu. B4 cache těl zůstává
v témže projektu/účtu použitelná, nejde o povinný opětovný přenos všech textů.

Pokračovat count/odebrání/expirací, obnovou a otevřeným klientem při
pauze/návratu. **C zatím nevytvářet**;
60sekundové okno zahájit až při připraveném pozorujícím klientu.
Pro interní kontexty používá build/b4b-core-probe.mjs oddělený soubor každého
účtu (b4b-core-Bright_Otter_182.json a b4b-core-TestBusiness.json), aby se
nepřepisovaly souběžné checkpointy. Před refresh/reset testem zachovat původní baseline.
Automatické ovládání okna ShoutOut zamítla URL bezpečnostní kontrola, proto
další UI kroky vyžadují ruční pomoc. Feed-b4-accept a feed-final-accept
zůstávají otevřené. Po jejich důkazech uklidit pouze manifestové sloty.
