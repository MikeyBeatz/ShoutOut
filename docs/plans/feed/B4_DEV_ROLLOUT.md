# B4 – řízený přechod na metadata, cache a živý stav

[Rozcestník](README.md) · [Hotový klient a důkazy](FEED_STATE_STORAGE_PROPOSAL.md#client-integration-results)
· [Pravidla vydání](../../operations/RELEASING.md)

## Stav a rozsah

**Aktuálně 23. listopadu: [B4 a společná finální DEV regrese feedu jsou uzavřené](#feed-final-acceptance-complete).**
Vlastník přijal řazení při pohybu/kotvu; 50 restartovacích a 3 A/B/C fixture
i 54 cloudových read klíčů jsou uklizené, 38 původních zdrojů zachovaných.
Následující datované checkpointy uchovávají průběh, nikoli otevřené pokyny.

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

**Aktuální překážka:** [živý test číslovky a diagnostika návratu/pohybu](#news-ui-diagnosis).
Následující nasazovací důkazy zůstávají platné; UI akceptace tím není splněná.

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

<a id="news-ui-diagnosis"></a>

## B4b – neúspěšná živá akceptace a diagnostika 22. listopadu

Po potvrzení „sleduji“ vznikl původní C v 19:01:19.906 UTC s expirací
19:02:19.906 UTC. Vlastník průběh nepozoroval a výslovně požádal „zkus to
ještě jednou“. Tím povolil jednu náhradní fixture nad původní tři sloty;
původnímu C se platnost neprodlužovala a původní manifest se nepřepisoval.
Náhradní C mvp-b4b-repeat-15af0889caf1-C vznikl v 19:03:31.760 UTC a expiroval
v 19:04:31.760 UTC. Opakování má samostatný manifest v čisté release kopii:
build/b4b-dev-release/docs/local/b4b-c-repeat-2026-11-22.json,
digest 9f91b10b72eebde76eaaf89e12574834285dbc6eee128e080bf1891ba37ea49b.
Je v něm jen binding C; žádné nové A/B ani Auth účty nevznikly.

**Výsledek je neúspěch, nikoli splněná expirace číslovky:** vlastník uvedl
„nic se neobjevilo“. Potvrdil TestBusiness a viditelný „MVP restart 22.11. 025“;
zobrazila se pouze hláška o změně polohy. Obě C byly čtením ověřené jako
active během jejich platnosti, s publicStates v feed-v3, a následně expired.
News control zůstal revision 2 / active. Původních 38 Shoutů a pending žádost
mají zachované updateTime. Kód publisheru je beze změny z čistého zdroje
20206c4 / success úplné CI 44959541907; potvrzené zápisy prošly společným writerem.

Cloud Logging po 19:00 UTC obsahuje běžná getFeedPage volání s Auth/App Check
VALID / HTTP 200, poslední v 19:00:52.302 UTC. Během obou C nebyl evidovaný
další požadavek; TestBusiness feedNews quota má poslední update 17:17:23.355 UTC.
Aktuální CDN app-config má serverFeedNews/serverDeltaFeed/serverSpatialFeed true.
To podporuje chybějící spuštění klientského sledování; neprokazuje konkrétní
stav otevřeného prohlížeče ani neopravňuje oslabit B2 bariéru.

Lokální diagnostika složených stávajících komponent reprodukuje možný souběh:
stránka je potvrzená v FeedSessionController, změna aktivity zruší dokončení
hostu a jeho configure(newsSignals) se přeskočí. Návrat pak jen zavolá pulse
na runtime bez kontextu: 0 odběrů / 0 news požadavků. Kontrolní opětovné
napojení již potvrzené baseline spustí odběr i počet 1 bez změny karet.
Jeden diagnostický test prošel; jde o reprodukovatelnou chybu životního cyklu,
ne o důkaz, že přesně tento souběh nastal u vlastníka. Aplikační zdroje se neměnily.
Podklady: build/b4b-home-resume-diagnosis_test.dart / .log,
build/b4b-resume-preflight.json, build/b4b-news-failure-read.json,
build/b4b-c-observe.json,
build/b4b-c-expired-observe.json a b4b-c-repeat-active-observe.json /
b4b-c-repeat-expired-observe.json. Samostatný opakovací wrapper
build/b4b-repeat-c.mjs používá nezměněný ověřený publisher/cleanup operátor;
nejde o nový aplikační modul. Další fixture bez konkrétní potřeby nevytvářet.

**Upřesnění pohybu:** v _noticeSpatialMovement je skutečně přímé porovnání
latitude/longitude bez tolerance či kontroly accuracy; hlášku proto může
vyvolat GPS šum. Jde o kontrolu při návratu do aplikace, nikoli hotové
automatické sledování jízdy. Vlastník požaduje automatické doplnění geograficky
platných karet a odebrání těch mimo okolí bez opakované ruční obnovy při jízdě.
Nové publikace mají dál čekat pod číslovkou; automatický pohyb nesmí bezděčně
spotřebovat/resetovat jejich baseline. Toto nové upřesnění zaznamenat do návrhu,
nepovažovat nynější upozornění za cílové chování.

<a id="news-ui-fix-proposal"></a>

### Navržený konkrétní další úsek

1. Lokálně opravit koordinaci potvrzené feed baseline a news runtime při
   návratu do popředí, změně karty a přerušení dokončení načtení. Připojit jen
   aktuální projekt/účet/relaci, bez duplicitních odběrů a bez obnovení karet.
   Ověřit přímo hosta, změnu účtu, výpadek a zánik obrazovky; diagnostický test
   převést na trvalou regresi. Provozní četnost, prostředky i Rules se nemění.
2. Současně navrhnout a na syntetickém pohybu lokálně ověřit automatickou
   změnu okolí: odlišit přesnost GPS od skutečného přesunu, zachovat kotvu
   scrollu a platné karty, využít existující index/cache a oddělit geografické
   doplnění od nových publikací. Doložit dotazy/přenosy při stání, chůzi a jízdě
   i vztah k B2 synchronizaci, read pořadí a starým kurzorům. Konkrétní meze
   a provozní zapojení předložit po měření; bez změny trvalého ukládání polohy.

Vlastník následně schválil opravu a lokální návrh pohybu: po úspěšném přesném
úplném CI pouze DEV web, automatický pohyb zatím jen lokálně. Bez změn
Functions, Rules, retence, prostředků, Auth účtů a dalších živých fixture.
B4b/finální feed akceptace zůstávají false, bez nového procentního kreditu.
Pauza/návrat, návratový web a úklid původního i náhradního manifestu čekají
na funkční pozorující klient. Další testování nesmí přepsat novější DEV Rules
476d216c-9208-4e5c-9143-f583cb82a3e9 ani vrátit starý web místo Auto artefaktu.

<a id="news-ui-fix-results"></a>

### Oprava napojení v DEV a lokální model pohybu

Větev fix/feed-news-live-acceptance přidává FeedNewsBinding, který skutečný
Home volá při změně potvrzené stránky, návratu do popředí, přepnutí sekce
a dokončení obnovy. Kontext se připojuje podle potvrzené baseline nezávisle
na tom, zda doběhl původní hostitelský finally. Skryté/načítané/expirované
pohledy nemají aktivní odběry. FeedDeltaClient neposkytne kontext při změně
UID, odhlášení nebo smazání účtu; chybějící kontext se bezpečně označí jednou
v konzoli kódem missing-context bez výpisu baseline, UID či tokenů.
Četnost 2/15/5 s, existující server, zdroje i oprávnění zůstávají stejné.

Trvalý [test napojení](../../../test/feed_news_binding_test.dart) používá
skutečný transportní adaptér, gateway, session, binding a runtime s fake
transportem: 6 scénářů pro přerušené dokončení stránky, klidnou novou baseline,
publikaci bez duplicitních odběrů, návrat/sekce, chybu obnovy, změnu účtu se
zpožděnou odpovědí a zánik/expiraci pohledu. Cílený společný průchod má 38/38,
celá místní Flutter sada 468/468, analýza bez nálezů. Nástrojová sada 99/99
zahrnuje 7 nových pohybových scénářů.
Zdroj **34268e5f2e2416f6c3e7c3f23cc4f82a4bd20d43** má
[success úplné CI 45060709344](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45060709344). Release build prošel,
manifest je svázaný s čistým zdrojem a přesným CI (build/b4b-binding-ci-proof.json).
Pouze DEV Hosting shoutout-dev-46c81 / **346ea6fb1866da8e** je nasazený.
Z 69 vzdálených souborů má všech 67 aplikačních shodu gzip hashů
s artefaktem; zbývající rezervované Firebase cesty jsou povolené. Ověřeno osm HTTP
odpovědí (index/main/bootstrap/app-config) na obou DEV doménách.
Rules 476d216c-9208-4e5c-9143-f583cb82a3e9 a všech 20 Functions i jejich prostředky
jsou porovnané beze změny; žádný nový Auth účet ani živá fixture nevznikly.
Podklady: build/b4b-binding-hosting-before.json / -after.json,
build/b4b-binding-web-build.log, b4b-binding-full-tests.log a b4b-binding-tools.log.
Návratový Hosting je 06df6da99db68e74, zachovat aktuální Rules a backend.
Číslovka 1 a její odečtení nejsou tímto HTTP ověřením nově potvrzené;
původní A/B/C i náhradní manifest čekají na společnou akceptaci a úklid.
Původní živé selhání tím není zpětně označené jako úspěšné.

Lokální [prototyp pohybu](../../../tools/feed_movement_prototype.mjs) má
[testy](../../../tools/feed_movement_prototype.test.mjs) a reprodukovatelný report:
`node tools/feed_movement_prototype.mjs --output build/feed-movement-report.json`.
Je to 2 000 syntetických rovinných bodů v metrech, nikoli reálné polohy.
Osmnáct případů porovnává 5/50 km, tři laboratorní politiky a 20 minut stání,
chůze 1,4 m/s a jízdy 100 km/h s GPS šumem a deklarovanou přesností 25 m.
Hranice níže nejsou schválené provozní parametry ani zapnutý watcher:

| Laboratorní rezerva / min. odstup | Požadavky stání / chůze / vlak, včetně prvního | Největší posun před přepočtem ve vlaku |
|---|---:|---:|
| 100 m / 15 s | 1 / 12 / 81 | 445 m |
| 250 m / 30 s | 1 / 6 / 41 | 850 m |
| 500 m / 60 s | 1 / 4 / 21 | 1 695 m |

Tabulka je pro ruční dosah 5 km; trasa má 1 201 polohových vzorků. Ve stání
žádná politika neposlala další geografický požadavek kvůli kolísání GPS.
U prostřední varianty model navštívil 239 nových metadatových buněk a 1 198
znovu použil; načetl 386 jedinečných těl / 108 528 syntetických textových bytů
na celou dvacetiminutovou jízdu (včetně počátečních 50 karet). Tyto hodnoty
nejsou skutečné Firestore reads/bytes na drátě, účet, latence ani důkaz kapacity
5 000 uživatelů: model vynechává přihlášení, ověření verzí, síťové obálky,
skutečný tree layout a cache eviction. Počet přesných vzdálenostních kontrol
je také evidovaný; geohash/řetězcové pořadí není vydáváno za vzdálenost.

Prototyp ověřil přesný výběr 50 vůči nezávislému plnému seřazení, ořez mimo
dosah/po expiraci, chybějící/zastaralé fixy, stabilní kotvu po vložení a
deterministický návrat při jejím odebrání. Pozdější publikace zůstávají ve
zvláštním počtu; geografický přepočet nemění publication cutoff. Jde o
matematický model kotvy a členství, nikoli hotové Flutter scrollování či B3
unread-first stránkování. Nic z prototypu se neimportuje do aplikace.

**Doporučení pro další konkrétní návrh:** nepoužít jednu pevnou minutu při
všech rychlostech. Spojit toleranci accuracy a rezervu pokrytí s rychlostí;
zvolit přípustnou geografickou odchylku i horní četnost, ne jen interval.
Existující podepsaný kurzor je vázaný na bod: živý přesun vyžaduje řízený rebase
s vlastní geografickou revizí, zachováním publikačního cutoffu, read politiky,
kotvy a deduplikace dalších stránek. Automatický pohyb nesmí spouštět B2 sync
při každém GPS fixu ani tiše potvrdit čekající nové publikace. Výpadek zachová
poslední potvrzené okolí s jedním stavem, ne výzvou po každém metru. Konkrétní
rebase kontrakt, číselné meze a živé zapojení předložit zvlášť; GPS hláška se
v nynějším schváleném webovém fixu ještě nemění.

<a id="news-positive-acceptance"></a>

### Živé připojení, číslovka a expirace po opravě – 22. listopadu

Vlastník pod TestBusiness obnovil 34268e5, provedl Profil → feed a ponechal
aplikaci v popředí. Potvrdil normální zobrazení bez čísla. News quota skutečně
změnila updateTime na 19:44:48.991 UTC; jediný odpovídající HTTP požadavek
v 19:44:48.862 UTC má Auth/App Check VALID, HTTP 200 a trvání 0,421 s.
To je platformní důkaz obnoveného připojení, ne jen interní jádro.
Podklad build/b4b-news-reattachment-proof.json.

Předchozí souhlas opravy vylučoval nové fixture. Vlastník proto následně
výslovně schválil jeden nový 60sekundový C a odpověděl „Ano, sleduji tlačítko“.
Samostatný manifest build/b4b-dev-release/docs/local/b4b-postfix-pilot-state.json
má digest 673401539524da3901941860a590d89bdb20af4c244887af46e690b2e9c41058;
vznikl pouze C mvp-b4b-postfix-0566d68ca95e-C, žádné A/B či Auth účty.
Publikace 19:48:36.149 UTC, expirace 19:49:36.149 UTC. Během platnosti i po
expiraci proběhly news požadavky; update quota po expiraci je 19:49:55.346 UTC.
Cloud Logging dočasně odmítlo další diagnostický dotaz HTTP 429; nejde o chybu
aplikačního callable. Pozdější ověření použilo přímo read-only technické dokumenty.

Vlastník potvrdil „tři tečky, pak číslovka 1, pak zase tři tečky a místo pro
číslo zmizelo úplně“. Tím jsou živě potvrzené kladná číslovka a odečtení po
expiraci; tečky vyjadřují ověřovaný stav. Výslovné nové potvrzení stability
scrollu z této odpovědi neodvozovat. C byl poté vyčištěný ověřeným operátorem:
removed 1 / readKeys 0, 38 původních zdrojů a pending žádost zachované,
authMutations 0. Jeho manifest je cleaned; ostatní pilotní manifesty se
nečistily. Podklady build/b4b-postfix-expired-observe.json a manifest.cleanup.

Dokončený dílčí důkaz se eviduje jako feed-b4-news-positive-accept. Z původní
otevřené feed-b4-accept váhy 44 v MVP / 70 v backlogu dostává 11 / 18;
zbývajících 33 / 52 ponechává původní společná akceptace. Již hotové váhy se
nemění, původní závislosti se zachovají a finální feed brána zůstává otevřená.
Čekají pauza/návrat, kompatibilní web a úklid původních manifestů.

**Nové UI připomínky:** číslovka zvonku je uvnitř jeho 24px ikony, zatímco
číslovka obnovy obaluje celý FloatingActionButton. Rozdílná kotva je tedy
potvrzená ve zdroji, nikoli domnělá chyba počtu. GPS hláška je dosavadní
implementace, kterou lokální pohybový prototyp ještě nenahradil.

<a id="badge-and-recenter-proposal"></a>

### Návrh dalšího uceleného úseku – jednotné badge a lokální přesun okolí

- Sjednotit číslovky obou plovoucích tlačítek do stejného vnějšího pravého
  horního rohu jednou sdílenou komponentou. Zachovat počty, 99+, stav ověřování,
  neviditelnou nulu a ovládání; neplovoucí zvonek tím nepřekreslovat. Ověřit
  zarovnání pro 1/99+/tečky ve světlém/tmavém vzhledu a úzkém viewportu.
- Lokálně připravit serverový a klientský rebase geografického kontextu za
  vypnutou volbou: nová geografická revize a podepsaný pokračovací kontext,
  původní serverová publikační hranice (nikoli hodiny zařízení), stejná read
  politika, UID/generace/R5 a původní hodinová platnost. Nová poloha nesmí
  přijmout staré kurzory ani vynulovat počet čekajících publikací.
- Přesun potvrdit atomicky až s úplnou novou stránkou, zachovat kotvu scrollu,
  deduplikaci, cache těl a platné karty; při chybě ponechat dosavadní okolí.
  Geografické doplnění starších příspěvků oddělit od nově publikovaných.
  Žádná B2 synchronizace při každém GPS fixu. Číselné meze pro accuracy,
  rezervu a četnost zůstávají laboratorní až do měření a dalšího rozhodnutí.
- Zachovat stávající mez stránky 50, společný transakční rozpočet a ochrany;
  ověřit souběh publikace/přečtení/expirace, pohyb přes oblasti, restart,
  výpadek, starý kurzor, změnu účtu a operace/přenosy v emulátoru. Bez nových
  živých kolekcí, migrace, Rules, Auth účtů, Scheduleru, prostředků či retence.
- Po úspěšném přesném úplném CI pouze DEV web s opravou zarovnání; živé
  serverové geografické přepínání zůstane vypnuté a Functions se nenasadí.
  Výsledky rebase, provozní meze a aktivační plán předložit samostatně.

Vlastník 22. listopadu výslovně schválil celý tento rozsah. Automatické živé
přesouvání tím schválené není; následuje místní výsledek a samostatný DEV web.

<a id="badge-and-recenter-results"></a>

### Jednotné číslovky a místní geografický rebase – 22. listopadu

**Připravený kód:** oba plovoucí ovladače používají FeedActionBadge kolem
celého FAB, se stejnou kotvou/odsazením. Neplovoucí zvonek zachovává dosavadní
vzhled. Dva widget testy skutečného refresh/zvonku ověřují 1/99+/tečky/nulu,
stisky, světlý/tmavý vzhled a šířku 320 px. Zachycený přesah 99+ je opravený.

**Pohyb zůstává neaktivní:** getFeedDeltaOperation má důvěryhodnou volbu
recenterEnabled, výchozí false. Žádný host ji nezapíná. Home/GPS nevolají
novou cestu a DEV konfigurace se nemění. Samostatný podpisový účel movement
používá stávající klíč, nevytváří nový secret. Potvrzení obsahuje jen kontext,
nikoli 50 řádků stránky; completion/news token jej nemůže zastoupit.

Server zachová původní databázové readTime, readRevision, UID, generaci,
inkarnaci a hodinový termín. Nové oblasti čte historicky k původní hranici,
takže ani nová publikace s dřívějším createdAt nevstoupí do rozpracované
stránky; zůstává novinkou příslušného okolí. Nová podepsaná baseline má další
geografickou revizi. Současná oprávnění, blokace, smazaní autoři, dostupnost,
expirace a R5 se znovu kontrolují. R5 rodiče nelze obejít přesunem do jiné
oblasti. Přesun neprodlužuje hodinovou platnost a nezapisuje B2 ani jiné údaje.

Klientské jádro a gateway předají pouze nový bod a podepsané potvrzení,
nedovolí zamíchat starý kurzor či změnit ostatní filtry. RAM potvrzení jsou
oddělená účtem a mizí při změně účtu/generace či smazání. Body cache se používá
dál. Nové okolí se potvrdí až s úplnou stránkou; chyba ponechá staré karty,
okolí a checkpoint. Opožděné odpovědi po zrušení/zániku nepřepíšou relaci.
Číslovka se nevynuluje, ale do ověření nového okolí je neaktuální.

Samostatný FeedMovementView, dosud mimo Home, udrží skutečnou viditelnou
kotvu při vložení 80 karet před ni, odstranění předchozích karet, změně
výšek a odchodu samotné kotvy z okolí. Nejde jen o model offsetů.
Místní slučování zachová pořadí již načtených platných karet uvnitř
nepřečtených/přečtených, doplní nově nalezené a deduplikuje další stránky.
**Není to důkaz úplného globálního pořadí všech dosud nenačtených karet při
pohybu.** To znovu stanoví ruční obnova. Před aktivací je nutné tuto politiku
výslovně předložit spolu s GPS mezemi; neoznačovat tento prototyp za hotové
automatické chování aplikace. Při ztrátě news checkpointu se přesun nepotvrdí.

**Místní ověření:** 474 Flutter testů, analýza bez nálezů, lint Functions;
99 nástrojových testů. Dosavadní společná news regrese prošla 28/28, po
doplnění poslední ochrany prošla samostatná rebase regrese 5/5. Zahrnuje
změnu účtu, poškozený/cizí token, pauzu/generaci, R5, expiraci, mazání účtu
během historického čtení, novou publikaci/přečtení a studený restart.
Testy jsou zařazené i do úplného CI; jeho výsledek se ověří před nasazením.

[Reprodukovatelné měření](../../benchmarks/FEED_RECENTER_2026-11-22.json):
50/200/2 000 syntetických zdrojů, první stránka vždy nejvýše 50. Studená
cesta 35/38/52 SDK reads, teplá 34/34/40; dvě directory queries, 0 zápisů
a 0 čtení plných zdrojů. Kompletní procházení dalo 1/4/40 stránek bez duplicit.
Podepsané potvrzení má 1 581–1 733 B a požadavek 1 755–1 907 B; dřívější
reuse completion tokenu přenášel kolem 24 kB jen v požadavku. Odpověď první
stránky má 64 752–67 167 B nekomprimovaného JSON včetně dosavadních metadata
a completion/news tokenů. To zůstává prostor pro další optimalizaci,
není to měření placených přenosů či produkční latence/5 000 souběžných relací.

**DEV nasazení ověřené:** zdroj **211471bbdb9df36fde9b233adb4149f2e45adfc8** má [success úplné CI 45066405533](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45066405533).
První běh 45066283784 zastavil formát jednoho testovacího řádku; opravený zdroj
211471b prošel celým CI, nic z neúspěšného kandidáta se nenasadilo. Pouze
Hosting shoutout-dev-46c81 je **3881ef4d17f67aa8**: ověřeno všech 67 app souborů
podle hashů (69 v inventáři včetně rezervovaných Firebase) a 8 HTTP odpovědí
na obou doménách. Rules 476d216c-9208-4e5c-9143-f583cb82a3e9 a všech 20
Functions mají původní revize/prostředky. Podklady build/b4b-badge-ci-proof.json
a build/b4b-badge-hosting-after.json. Vrátit lze **346ea6fb1866da8e**.
Rozložení je ověřené widget testy; nový ruční UI průchod se zatím netvrdí. Functions,
Rules, data, Auth, Scheduler a prostředky se v tomto úseku nemění. Žádné nové
živé fixture. Dosavadní GPS hláška zatím zůstane; její odstranění by nyní
předstíralo zapnuté automatické okolí. B4 pauza/návrat, kompatibilní web a
původní úklid nadále čekají. Oprava již hotových částí nepřidává novou váhu
do stupnic; aktualizují se jejich důkazy, nikoli stav celé akceptace.

<a id="news-pause-acceptance"></a>

### Živá pauza a kompatibilní web – 22. listopadu

V rámci původního souhlasu s B4b proběhla inventura: 92 zdrojů, 38 původních
Shoutů a pending žádost se shodným updateTime, feed control 12, news control
2/active, Hosting 3881ef4d17f67aa8. Browser access host zůstal nedostupný;
vlastník ověřuje otevřený anonymní klient, nepoužívají se konzolové skripty.

Původní operátor z čistého 20206c4 / success úplného CI 44959541907 provedl
schválenou news revizi **3/paused**, 2 atomické zápisy včetně technického headu.
Vlastník potvrdil zachované karty a funkční plovoucí obnovu/detail. Po ověření
původního úspěšného úplného CI 44935555088 a neměnné Hosting verze byl krátce
nasazen kompatibilní web **fa20f566fc0ab82b / 8b1de68 / news off**. Šest HTTP
odpovědí na obou DEV doménách odpovídá uloženým hashům; B2/B3/delta zůstaly true.
Vlastník po Ctrl+R a nastavení 50 km potvrdil funkční feed i detail.

Následně je vrácen aktuální **3881ef4d17f67aa8 / 211471b / news on**, opět
se success úplným CI 45066405533 a šesti ověřenými HTTP odpověďmi. Původní
operátor přešel na **4/active**, znovu 2 atomické zápisy. Feed control zůstává
12; Rules a všech 20 Functions/revizí/prostředků se nezměnily. Nevznikly nové
fixture/Auth a zatím se nic neuklízelo. Vlastník potvrdil také návrat aktuálního
UI, feed a detail pod TestBusiness. Důkazy build/b4b-final-before.json, -paused.json, -rollback.json,
-restored.json; build/b4b-compatible-plan.json a -verify-old/-verify-current.json.

**Nově potvrzená mezera:** čerstvá stránka načtená během paused vrací karty,
ale žádný newsCheckpoint ani newsSignals. FeedNewsBinding proto zruší runtime
a po opětovné aktivaci není čím zachytit změnu control headu. Dva nezávislé
místní diagnostické testy aktuálního serveru a složeného klienta tento stav
potvrdily: karty zůstanou, ale i po simulovaných 61 s je 0 odběrů a 0 news
požadavků. Samotná ruční obnova po návratu tento nedostatek maskuje.
Podklady build/b4b-paused-page-diagnosis.json / -final.log a
build/b4b-paused-attachment-diagnosis_test.dart / .log. Nejde o tvrzení, že je
konkrétní uživatelův účet právě v chybném stavu. Nový automatický návrat se
neoznačuje jako hotový a společná B4 akceptace zůstává otevřená.

<a id="news-pause-recovery-proposal"></a>

### Návrh opravy návratu po stránce načtené během pauzy

- U platné paused generace zachovat podepsanou hranici novinek a obnovitelný
  kontext bez oblastních odběrů. Využít stávající dávkovou cestu, ochranu
  četnosti a dosavadní omezené opakování; žádný nový pollovací interval.
  Po active znovu převzít hlavičky a počet bez resetu baseline, karet či B2.
- Během paused dál zakázat samotný count a čtení regionálních headů. Neměnit
  Rules, soukromý control, Auth/App Check, UID/generaci/R5 ani hodinovou retenci.
  Off a neplatný stav nesmějí vznikem kontextu získat přístup. Souběh režimů,
  změnu účtu, smazání, výpadek a expiraci ověřit v emulátoru a složeném klientu.
- Připravit nový navazující digestovaný operační plán **active 4 → paused 5 →
  active 6**, vázaný na čerstvé verze controlu a původní inkarnaci. Neprodlužovat
  ani přepisovat historický pětipoložkový plán. Zachovat feed control 12,
  původních 38 zdrojů a pending žádost; bez nových fixture/Auth.
- Jeden společný commit/push a úplné CI; potom pouze DEV getFeedPage a případný
  potřebný web. getFeedPage má nadále europe-west3, min0/max1, concurrency1,
  256 MiB / 15 s. Automatický geografický rebase zůstane vypnutý, ostatní
  Functions/Rules/plánovače/prostředky, produkce a main se nemění. Ověřit nový
  scénář na stávajících testech a pak pokračovat k původnímu úklidu.

Vlastník výslovně schválil opravu i uvedený DEV průchod. Následně požádal
odstranit údaj o dosahu načtených karet a zvolil pouze ruční dosahy 1–50 km,
výchozí 50 km, bez duplicitního Auto.

<a id="news-pause-recovery-results"></a>

### Oprava návratu po pauze a ruční dosahy – 22. listopadu

Nový klient výslovně vyjedná newsRecovery=true. Jen taková stránka může během
paused získat podepsaný checkpoint a kontext recovering bez regionálních
headů. Samotné news/news-signals jsou při pauze dál odmítané před kvótovým
zápisem; off nic neobnovuje. Kontroly účtu/generace/R5 zůstávají zachované.
Po active klient převezme skutečné hlavičky přes dosavadní omezené opakování
a přejde zpět na signalizaci; klidová nula nepokračuje v recovery polling.
RAM kontext se aktualizuje, aby jej další Home binding nevrátil do paused.
Starší klient bez vyjednání má dosavadní kontrakt; pořadí nasazení je proto
getFeedPage → ověření připravené revize → nový web, vždy z přesného úplného CI.

Nový tools/feed_news_recovery.mjs má zvláštní neměnný digestovaný plán,
přesný DEV cíl, vazbu na původní manifest/inkarnaci a přechody 4 → 5 → 6.
Odmítá drift původních dat, controlu, jinou revizi a změněný digest; souběžné
opakování je no-op. Historický aktivační plán se neupravuje. Živý plán se
připravil z čerstvého stavu, viz následující živý protokol.

UI má jeden ruční seznam 1/3/5/10/20/50 km, výchozí 50. Zmizely Auto i text
„Načtené Shouty do…“. Rozšíření prázdného menšího okruhu nastaví explicitních
50 km po kliknutí; dávky 50, cache, řazení a geografický serverový rozsah se
nemění. Starší Auto důkazy zůstávají historií; nové UI je nasazené a vlastník je potvrdil.

Místně prošlo 474 Flutter testů, analýza bez nálezů, 100 nástrojových testů
a lint Functions. Společná news regrese 32/32 a poslední cílená recovery sada
4/4 zahrnují souběh pauzy s historickým čtením, legacy/off, nulové pauzové
kvótové zápisy, publikaci během pauzy, replay a souběh operátorů. Dokončení
automatického návratu ověřuje následující živý průchod.

**Nasazení pouze DEV shoutout-dev-46c81:** čistý zdroj
**b57f6b9793b70530369384cb07eee7f4e56af9c4**, [success úplné CI 45071219942](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45071219942).
Nejprve getFeedPage **getfeedpage-00006-niz**, 100 % provozu a všechny staré
revize retired; min0/max1, concurrency1, 256 MiB/15 s beze změny. Potom
Hosting **6762922852bede94**: 67 app souborů shodných s artefaktem, 8 HTTP
odpovědí na obou DEV doménách. Ostatních 19 Functions i Rules 476d216c…a3e9
beze změny. Návratový web 3881ef4d17f67aa8. První CLI pokus ukončil místní
10s limit discovery před aktualizací; kontrola potvrdila nezměněné prostředí.
Opakování s FUNCTIONS_DISCOVERY_TIMEOUT=30 uspělo; běhový timeout zůstal 15 s.
Podklady build/b4b-recovery-release-ci.json, -functions.json a -hosting.json.

**Řízený průchod:** neměnný místní plán docs/local/b4b-news-recovery-2026-11-22.json,
digest bdd1f66f811ae3b9f5fffdad0387b69f6e88945b58cb0ccfb93c6454a42f727c,
vázaný na původní plán ec4debea…16b72 a stejnou inkarnaci feed-v3.
Operátor provedl 22. listopadu 21:39:35 UTC **5/paused**, 2 atomické zápisy.
Vlastník pod TestBusiness potvrdil novou plovoucí obnovu a detail bez chyby,
potom návrat do feedu. Operátor v 21:41:08 UTC provedl **6/active**, opět
2 atomické zápisy. Bez dalšího obnovení stránky doloženy HTTP 200 v 21:43:01
a 21:43:26 UTC; poslední požadavek 0,380 s obsahuje změnu news kvóty účtu
it_business a ve stejném trace Auth/App Check VALID. Vlastník potvrdil
zachovaný seznam. Čekání ve skryté kartě se nepovažuje za latenci aktivní
detekce; dobu návratu v popředí nelze z této ruční relace přesně změřit.
Podklady build/b4b-recovery-observe-ready/-paused/-active.json a
build/b4b-recovery-callable-proof.json. Následující kontrola v 21:46:12 UTC
potvrdila dalších 101 s bez změny news kvóty či počtu zdrojů, tedy bez dalších
úspěšných count požadavků v tomto úseku; podklad build/b4b-recovery-observe-quiet.json.
Samotná absence kvótových zápisů není důkazem nulového Firestore provozu.
Ve spojení s regresí runtime a ověřeným návratem jde o uzavřenou akceptaci
této konkrétní obnovy, nikoli o zátěžový test nebo novou pozitivní publikaci.

Inventury potvrzují feed control 12, všech 92 zdrojů, původních 38 Shoutů a
pending žádost s původními verzemi. Žádné nové fixture/Auth, změny Rules,
plánovačů, retence, prostředků či produkce. Původní A/B/C/restart úklid dosud
neproběhl. Vlastník znovu zaznamenal hlášku „Poloha se změnila…“; automatický
pohyb není součástí tohoto nasazení a zůstává otevřený před živým zapojením.

Samostatně uzavřený kompatibilní web + návrat UI se eviduje v obou stupnicích
jako feed-b4-compatible-web-accept: z dosud otevřené společné váhy 33/52
dostává 11/18. Zbývající rozlišené podmínky 22/34 se dělí na doložený
automatický návrat feed-b4-recovery-accept (11/17) a zbytek společné akceptace
s původním úklidem (11/17). Součet rodiče ani již dokončené váhy se nemění.
Celé B4 zůstává otevřené; žádný nový kredit za samotnou opravu dříve dokončeného kódu.

<a id="movement-integration"></a>

### Zapojení pohybu a poslední úklid – schválený úsek 22. listopadu

Vlastník schválil jeden společný úsek: klient/server, simulace a regrese,
dokumentace/CI a pouze DEV rollout, ruční kontrola až na konci. Bez nových
Auth účtů, služeb, Rules, prostředků či retenčních změn. Provozní pravidla:
nejvýše jeden geografický přesun za 30 s, až po vzdálenosti větší než
250 m + přesnost původního i nového fixu, nový fix nejvýše 30 s starý a
s přesností do 100 m. To není přesnost skutečné polohy ani slíbená latence.
Při výpadku/nepřesné poloze zůstane poslední potvrzené okolí. Načtené karty
v původní verzi udržely čtecí posloupnost v nepřečtené/přečtené skupině;
nové se doplnily a neplatné odešly. Toto pravidlo pořadí vlastník po ručním
průchodu změnil 23. listopadu – platí [navazující řazení při pohybu](#movement-order).

**Připravená integrace:** samostatný FeedMovementController slučuje GPS události,
ignoruje šum, staré/neplatné fixy a souběžné požadavky. V pozadí a mimo feed
se sledování odpojí; při otevřeném detailu se žádný pohybový požadavek neposílá.
Home používá původní podepsaný rebase, nemění publikační hranici, readRevision
ani hodinový termín a nespouští B2. Žádost dokončí všechna metadata před
potvrzením nového okolí; chybná/opožděná odpověď staré karty nepřepíše.
Původní hlášku „Poloha se změnila…“ aktivovaný klient už nepoužije; při
nedostupnosti zobrazí jeden stav posledního potvrzeného okolí.

**Přesné ponechání karet:** veřejná těla neobsahují přesné souřadnice. Nový
režim movement-state proto využívá původní podepsanou completion stránku a
nový movement token. Nejvýše 50 jejích ID ověří proti aktuálním hlavičkám,
Auth/App Check, blokacím, smazaným autorům a oběma R5 kontextům. Vracejí se
jen ID a přesná vzdálenost, bez souřadnic a těl. Jiný účet/filtry/inkarnace,
nepodepsané ID a expirované potvrzení se odmítnou. Další načtené stránky se
ověřují odděleně; ID v nové první stránce se znovu nekontrolují. RAM důkazy
zůstanou dostupné i po opakovaném přesunu a neztratí se při chybné přípravě.

FeedMovementView je zapojený do skutečného FeedPage včetně hlavičky, konce,
oddělovače a ruční obnovy. Regrese zachytila a opravila layoutový posun při
změně středu; kotva bere skutečnou viditelnou kartu a respektuje probíhající
uživatelský scroll. Zachované je také odstranění vlastní karty mimo pohyb.

**Úklid:** krátký náhradní C2 je již uklizený původním operátorem z čistého
20206c4 / success úplného CI 44959541907: 1 zdroj, 0 read klíčů; 38 původních
zdrojů a pending žádost zachované, 0 Auth mutací. Manifest
build/b4b-dev-release/docs/local/b4b-c-repeat-2026-11-22.json má phase cleaned,
digest 9f91b10b…ea49b; podklad build/b4b-c2-cleanup-final.log.
50 restartovacích Shoutů se ponechává pro poslední ruční průchod. Nástroj
tools/feed_restart_cleanup.mjs ověří původní manifest e29b1bf9…ef74, přesná ID,
obsah, autory, časy/polohy, původních 40 zdrojů, pending žádost a inkarnace.
Před první mutací projde všech 50; komentář, privátní konverzace nebo cizí
interakce úklid zastaví. Po skupinách nejvýše 10 použije společný writer se
stávajícím rozpočtem 450 zápisů, zachová cizí read klíče a umožní replay.
Živý cleanup potřebuje čistý přesný commit s úplným CI a digest. Po ručním
průchodu pořadí: restart 50 → původní A/B/C, podle jejich manifestů.

Nové zapojení má vlastní implementační/ověřovací/DEV díly v dosud otevřené
finální váze feedu: MVP původních 44 = 11/11/11 + 11 závěrečné akceptace;
backlog původních 70 = 18/18/17 + 17 závěrečné akceptace. Hotové váhy,
prototypové důkazy i součet rodiče zůstávají zachované. Ruční akceptace a
zbývající živý úklid se před jejich skutečným provedením neuzavírají.

**Místní výsledky:** 481 Flutter testů, analýza bez nálezů, 103 testů nástrojů,
9 cílených serverových testů a lint Functions prošly. Regrese zahrnuje skutečný
FeedPage s velkým vložením i vlastním odebráním nad viewportem, ruční návrat
k hlavičce, přesnost/stáří GPS, cooldown, souběh, ztracenou odpověď a změnu účtu.
Emulátor ověřil také odmítnutí cizí konverzace před první mutací, odstranění
všech 50 přes index, zachování cizího přečtení a opakování úklidu.
[Měření](../../benchmarks/FEED_MOVEMENT_INTEGRATION_2026-11-22.json): nezávislá
kontrola 50 ponechávaných ID při 50/200/2 000 zdrojích má 12/15/17 SDK reads,
1 query, 0 source reads a 0 zápisů. Požadavek s již existujícími podepsanými
kontexty má 28 318–28 622 B JSON, odpověď 4 431 B. V reálném klientu se tato
kontrola vynechá pro ID obsažená v nové první stránce. Nejde o cloudový účet,
měření latence ani důkaz 5 000 současných uživatelů.

Živý pouze čtecí dry-run nástroje úklidu potvrdil 50 kandidátů, 40 chráněných
zdrojů a jednu žádost; 0 cloudových zápisů. Manifest zůstává seeded a všech
50 restartovacích Shoutů se ponechává pro závěrečnou ruční kontrolu. Podklad
build/feed-restart-cleanup-dryrun.log.

Před rolloutem přidaná kontrola prvního snímku odhalila krátký posun, přestože
po ustálení byla kotva správná. Oprava rozlišuje slivery před/za kotvou a
jejich skutečné indexy a nastaví odpovídající posun před layoutem. Trvalá
regrese nyní kontroluje i první vykreslení, nejen pumpAndSettle; první
připravený commit se s tímto známým problémem nenasazuje.
Návrat z detailu navíc obnoví sledování a získá čerstvý fix i tehdy, když
se zařízení už zastavilo a GPS sama nepošle další změnu. Zakrytá route
geografické sledování odpojí; není třeba měnit kartu ani ručně obnovovat feed.

**DEV rollout dokončený, živá akceptace čeká:** zdroj
**78d6a3f3d5bbf80df7c31bebc92ea4fe45a6df88** má [success úplné CI 45077814590](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45077814590).
Nejprve nasazen a ověřen getFeedPage **getfeedpage-00007-moc**, 100 % provozu,
staré revize retired, min0/max1/concurrency1/256 MiB/15 s zachované. Potom
Hosting **2d6ae9af70840b03**, shodných 67 app souborů a 8 skutečných HTTP
odpovědí na obou doménách. Ostatních 19 Functions a Rules 476d216c…a3e9 mají
původní stav/prostředky. Feed control 12 a news 6/active, žádná migrace nebo
indexová/Scheduler/Storage změna. Návratový web **6762922852bede94**.
Podklady build/feed-movement-release-ci/-functions/-hosting.json a
build/feed-movement-function-deploy.log / -hosting-deploy.log. Bez identity
vrací endpoint HTTP 401/UNAUTHENTICATED, což je pouze negativní kontrola,
nikoli úspěšný přihlášený pohybový průchod.

Čerstvá inventura v 22:46 UTC: 91 zdrojů, původních 38 Shoutů a pending
žádost s nezměněnými verzemi; podklad build/feed-movement-data-active.json.
Nad rámec již schváleného C2 nevznikly žádné testovací zápisy nebo Auth mutace.
Pro následný úklid je připravený čistý checkout build/feed-movement-release-47720ec
na skutečném HEAD **78d6a3f** a stejné neměnné manifesty. Jeho název neurčuje
zdroj, před spuštěním ověřit HEAD/čistotu/CI a digests znovu. Kanonické
manifesty po dokončení synchronizovat se zachováním původních plánů/digestů.

Dodatečná místní simulace používá přímo Dart FeedMovementController a jeden
společný virtuální čas pro události i Timer: 1 200 GPS fixů / 20 minut pro
stání, chůzi 1,4 m/s a jízdu 100 km/h. Výsledkem je **0 / 5 / 40** geografických
požadavků nad rámec úvodního načtení; všechny rozestupy nejméně 30 s, nejistota
25 m a šum do 15 m. Jde o syntetické časování, 0 sítí/databázových zápisů;
ne měření účtu, cloudu ani přesnosti skutečné GPS. Reprodukce
build/feed-movement-policy-simulation_test.dart, výstup
build/feed-movement-policy-simulation.json; souhrn je také v připojeném měření.

Dokumentační zdroj 3729a4b doplnil tento výsledek i do statického JSON měření.
Současný tools/ci_scope.mjs považuje takový soubor za plný rozsah; následný
nadbytečný běh 45079862014 byl úmyslně zrušen. Lokální check_docs/progress
prošly, aplikace/artefakt zůstávají z 78d6a3f s úspěšným úplným CI. Selektor
ani pravidla vydání se neměnila; dokumentační zdroj se nepoužívá pro rollout.

<a id="movement-manual-acceptance"></a>

### Původní ruční průchod a následný úklid

Vlastník jej 23. listopadu vyzkoušel, potvrdil správné změny vzdáleností a
uvedl, že ostatní průběh přibližně odpovídal zadání. Zároveň požádal o živé
řazení v Nejblíž. Následující scénář dokumentuje původní kontrolu; celý jej
neopakovat. Čeká jen [navazující řazení/kotva](#movement-order) a úklid.

Prohlížečový host je stále nedostupný, potvrzeno novou inventurou. Nelze tím
nahrazovat ruční UI důkaz. Vlastník požádal nechat ruční průchod až na konec;
automatické kontroly, rollout a dry-run proto předcházejí této kontrole.
Použít fungující anonymní kartu a existující TestBusiness, žádné nové Shouty
nebo Auth účty. Přibližně tři minuty, bez konzolových skriptů:

1. Otevřít https://shoutout-dev-46c81.web.app/?mvp=78d6a3f a Ctrl+R, povolit polohu.
2. V DevTools F12 otevřít Ctrl+Shift+P → Show Sensors. V Location vybrat
   Custom location/Other a zadat Latitude **50.5300**, Longitude **14.1300**,
   Accuracy **25**. Každé pole potvrdit Tab. Ostatní nastavení neměnit.
   [Oficiální postup Chrome](https://developer.chrome.com/docs/devtools/sensors);
   [pole Accuracy v implementaci](https://chromium.googlesource.com/devtools/devtools-frontend/+/main/front_end/panels/sensors/SensorsView.ts).
   Výchozích 150 m není pro schválený filtr do 100 m vhodných; pokud pole
   Accuracy chybí, test zastavit a uvést to, limity ani ochrany neobcházet.
3. V aplikaci nastavit **1 km**, jednou plovoucí obnova, počkat na „MVP restart…“
   a posunout seznam o několik karet. Od této chvíle neobnovovat ručně.
4. Po alespoň 30 s v popředí změnit jen Latitude na **50.5340** a potvrdit Tab.
   Do dalšího cyklu + sítě se mají změnit vzdálenosti bez skoku scrollu a bez
   hlášky „Poloha se změnila…“. Karty jsou stále do 1 km.
5. Po dalším nejméně 30s odstupu změnit Latitude na **50.5420**. V tomto 1km
   okruhu mají restartovací karty samy zmizet; dosah se automaticky nerozšíří.
6. Po dalším nejméně 30s odstupu vrátit Latitude **50.5300**. Karty se mají
   vrátit samy. Při každém čekání ponechat kartu aplikace viditelnou.
7. Nakonec Sensors → No override, dosah **50 km** a jedna plovoucí obnova pro
   návrat ke skutečné poloze. Popsat výsledek nebo první konkrétní chybu.

Po potvrzení: z čistého uvedeného zdroje s úplným CI provést restart cleanup
digest e29b1bf9…ef74, ověřit zachování původních 40/pending a potom původní
A/B/C digest 86221a33…19fe. Ověřit 38 původních zdrojů, chybějící testovací
publicStates, absenci testovacích cloudových read klíčů a neporušené ostatní
read položky. Teprve poté dokončit společné akceptační díly; dosavadní kladnou
číslovku, expiraci a kompatibilní rollback neopakovat. Délka nynějšího feedu
po hodině vyžaduje obnovu nezávisle na pohybu a netvoří nový problém.

<a id="movement-order"></a>

### Řazení při potvrzeném pohybu – schváleno 23. listopadu

Po ručním průchodu vlastník potvrdil změnu vzdáleností a schválil návrh:
v Nejblíž přeskupit karty při již schváleném potvrzeném přesunu, zachovat
právě čtenou kartu na obrazovce a nepřečtené/přečtené oddělení. Nové publikace
nad původní hranicí dál čekají pod číslovkou obnovy. Meze GPS, 30s cooldown,
readRevision, hodinový termín, ostatní režimy, oprávnění a retence se nemění.

**Místní implementace a ověření dokončené:** sdílený komparátor kopíruje klíč
serveru: zmrazená skupina → přesná vzdálenost → createdAt sestupně → binární
ID vzestupně. Dekódování zachová i zlomky milisekundy pro shodnou vzdálenost.
Po přesunu se řadí sjednocení nové stránky a serverem znovu ověřených starších
karet; další stránky nahrazují duplicity a vkládají chybějící karty na správné
místo. Lokální přečtení, palce a živé čítače samy pořadí nemění.

Ponechaná karta může ležet za dosud potvrzenou částí nového kurzoru. Klient
proto sleduje poslední viditelnou kartu a pokračuje po původních 50 položkách,
dokud ji kurzor nepokryje; postupuje i přes stránku tvořenou jen duplicitami.
Nejde o předběžné načtení celého okolí. Během dohánění nelze tvrdit, že počet
již ponechaných karet je souvislý globální prefix – stav načítání zůstává
viditelný a další stránka doplní mezery. Viditelná kotva se zachová i při
vložení před ní bez nové GPS revize. Kontrola viewportu prochází pouze právě
vytvořené lazy děti; ne celý historický seznam při každém scroll snímku.

Výsledky: **486 Flutter testů**, analýza bez nálezů, **7 serverových regresí**
a lint změněného serverového testu. Nová widgetová regrese přesune kotvu z
původních 100 karet do opačně řazených 200, ověří první snímek i doplnění tří
stránek včetně zcela duplicitní. Serverový test ověří všechny čtyři stránky
pro 200 zdrojů s promíchaným přečtením, bez duplicit/mezer a se stejnou původní
hranicí a termínem. Testy výpadku, neplatného pořadí a staré odpovědi zachovají
poslední potvrzený seznam. Zdrojové důkazy:
[klientská regrese](../../../test/feed_movement_order_test.dart),
[viewport](../../../test/feed_movement_view_test.dart),
[server](../../../functions/feed_recenter.integration.test.js).
Místní výpisy build/feed-movement-order-{flutter,analyze2,server}.log.

Serverové jádro již vrací správný proud od nového bodu; mění se pouze klient
a serverový test. Po úspěšném přesném úplném CI nasadit **jen DEV Hosting
shoutout-dev-46c81**. Zachovat všech 20 Functions, Rules, control 12/news
6/active, prostředky i testovací data. Návratový web je 2d6ae9af70840b03.
Metriky se za opravu znovu nenavyšují; zbývající akceptace zůstává otevřená.

**DEV rollout dokončený:** zdroj **af4c3aa06fc65b7d429497cca73817d2d4529be2**,
[success úplné CI 45085601243](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45085601243).
Z čistého přesného zdroje sestaven a ověřen DEV artefakt; pouze Hosting
**37b697da10fbb5b1**, 67 shodných app souborů a 8 HTTP kontrol na obou doménách.
Všech 20 Functions, Rules 476d216c…a3e9 a prostředky mají původní stav.
Inventura v 00:13 UTC: 91 zdrojů, všech 38 původních a pending žádost mají
nezměněné verze, feed control 12/news 6/active. Žádné fixture/Auth mutace,
úklid ani nová serverová konfigurace. Návratový web 2d6ae9af70840b03.
Podklady build/feed-movement-order-release-{build,before,ci,hosting}.json,
build/feed-movement-order-data-{before,active}.json a -hosting-deploy.log.
Prohlížečový host znovu vrací unavailable, proto se živá UI akceptace netvrdí.
Vlastník dostal jedinou cílenou kontrolu na konci; čeká odpověď, potom úklid.

V navazující odpovědi 23. listopadu vlastník uvedl, že na test nyní nemá čas,
a požádal pokračovat nezávislou prací. Kontrola i úklid jsou výslovně odložené,
nikoli úspěšné. Existující fixture zatím zachovat; původní aktivní platnost
restartovacích karet končí 23. listopadu v 18:23 SEČ. Žádné tiché prodlužování
nebo nový seed; pokud kontrola proběhne až po expiraci, nejprve upřesnit
potřebný testovací podklad. Nová serverová práce může probíhat samostatně.

**Čekající poslední ruční kontrola:** otevřít
https://shoutout-dev-46c81.web.app/?mvp=af4c3aa a Ctrl+R. Stejné existující restartovací
karty pod TestBusiness, Sensors 50.5300/14.1300/25 m, dosah 1 km a jedna obnova.
Po posunutí o několik karet změnit po alespoň 30 s Latitude na 50.5340.
Po potvrzeném přesunu mají být karty uvnitř každé skupiny znovu podle nové
vzdálenosti, přitom právě viditelná karta zůstane na místě. Pro kontrolu vršku
scrollovat ručně nahoru; nemačkat obnovu, která by sama vytvořila nové pořadí.
Potom No override / 50 km / jedna obnova. Nepožadovat opakování již ověřené
číslovky, expirace, pauzy ani celého původního pohybového průchodu. Při úspěchu
restart 50 → původní A/B/C podle stávajících manifestů; bez nových fixture/Auth.

<a id="movement-cleanup-resume"></a>

### Obnovení kontroly a úklidového plánu – 23. listopadu

Vlastník obnovil odložený test na aktuálním webu **33853a9**, nikoli rollbackem
na historický af4c3aa. První pokus o načtení a změnu dosahu selhal, následně
potvrdil opětovné načtení. Poslední dvě getFeedPage volání mají HTTP 200 a
Auth/App Check VALID; příčina předchozí klientské chyby není prokázaná.
Podklad build/feed-movement-load-error-logs.json. Ruční řazení/kotva zůstávají
otevřené; nic nezapočítávat před skutečnou akceptací a úklidem.

Inventura 16:50 SEČ doložila všech **50/50** restartovacích Shoutů i publicStates,
aktivní pohyb a nezměněnou expiraci **23. listopadu 18:23:34 SEČ**. Podklady
build/feed-movement-resume-status.json a build/feed-movement-cleanup-preflight.json.
Původní úklid správně zastavil před zápisy: dva chráněné původní testy A/B
mezitím expirovaly, jejich updateTime již neodpovídá manifestu.
U obou ověřen původní titul/identita a status expired; ostatních 38 chráněných
zdrojů a pending žádost odpovídají. Žádné rozšíření mazání ani nové fixture.

Vlastník výslovně schválil nový úklidový manifest
docs/local/feed-restart-cleanup-2026-11-23.json s digestem
**9cdd773105af8178bd21a7c02c29857ac15f92bb9a1ba8af66f4d003587381ed**.
Mění pouze dva zaznamenané updateTime po expiraci A/B, nikoli jejich data;
původní manifest **e29b1bf9…293ef74** je zachovaný. Read-only dry-run nové
varianty prošel: 50 kandidátů, 40 chráněných zdrojů, 1 žádost, **0 zápisů**;
build/feed-restart-cleanup-proposed-dryrun.json. Původní A/B/C manifest zůstává
v build/b4b-dev-release/docs/local/b4b-pilot-state-v2.json, digest
**86221a3301eaff9e137bc4a5084c815c25c9057d4c4748478bd02e11244519fe**.

Schválená místní oprava obou úklidových cest zachovává potvrzení operací
včetně původního updateTime a expirace, i při opakovaném úklidu; neřeší jejich
retenci vlastní předčasnou smazávací cestou. Guard počtu/vlastníka operací
zůstává zachovaný. Restart nemá žádný související receipt; původní klientský B
má jedno dosud platné potvrzení. Všech 21 aktuálních receipts musí zůstat
zachovaných. Podklad build/feed-news-cleanup-preflight.json.

Místní ověření: **3/3 emulátorové případy** včetně obou cleanup cest/replay,
**2/2 manifestové unit testy** a cílený ESLint prošly. Zachovaná receipt data
i updateTime ověřené skutečným čtením po každém úklidu. Podklad
build/feed-pilot-cleanup-emulator.log; nové MVP body se za tuto opravu nepřidávají.

Další krok: dokončit přesné úplné CI, poté při úspěšné
ruční kontrole restart 50 → původní A/B/C. Do té doby žádné živé mazání,
nasazení webu/Functions/Rules, změna Auth nebo prodloužení fixture.

<a id="feed-final-acceptance-complete"></a>

### B4 a společná finální DEV akceptace – uzavřeno 23. listopadu

Vlastník pod TestBusiness potvrdil poslední průchod na aktuálním webu
**33853a9**: po změně Latitude 50.5300 → 50.5340 bez obnovy zůstala čtená
karta na místě a po ručním odscrollování nahoru bylo pořadí uvnitř obou
skupin správně podle nové vzdálenosti. Dosah 1 km, původní restartovací
sada; žádná nová fixture nebo prodlužování platnosti.
Podklad build/feed-movement-manual-acceptance.json. Počáteční hláška o
načtení odezněla před testem; její příčina se za diagnostikovanou nepovažuje.

Oprava úklidu **a8d13ebd99836f1c1b9b14ccc716e1b4f02e3b0a** má
[success úplné CI 45218543240](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45218543240),
včetně skutečných emulátorových regresí zachování receipts, Rules, klienta,
účtové retence a webového buildu. Živé mutace provedly původní operátory
z čisté přesné kopie tohoto commitu po dokončení CI, pouze v
**shoutout-dev-46c81**. Aplikace, Functions ani Rules se z tohoto zdroje nenasazovaly.

V pořadí restart → A/B/C bylo odstraněno **50 + 3 Shoutů** a **50 + 4
cloudových značek přečtení**, přes společný indexový writer. Oba kanonické
manifesty mají phase **cleaned**; původní nezměněný restartovací manifest
zůstává historickým podkladem a nesmí se podle něj znovu seedovat.
Nový restartovací manifest/digest a původní A/B/C manifest jsou popsané
[výše](#movement-cleanup-resume). Předúklidové kopie jsou v
build/feed-{restart,news}-cleanup-preexecution.json. C2 byl uklizený dříve,
neopakoval se. Logy build/feed-restart-cleanup-final.log a feed-news-cleanup-final.log.

**Závěrečná nezávislá kontrola v 18:01 SEČ:** všech **53 kořenů i 53
publicStates** je nepřítomných, žádné zbývající potomky ani cloudové read
klíče těchto ID. Zachováno všech **38 původních Shoutů včetně updateTime**,
pending žádost a **21 receipts včetně dat, updateTime i původní expirace**.
Nezměnily se cizí read položky ani 15 kvót nesouvisejících s průběžným
feed/read provozem; celkem zůstává 25 rate dokumentů. Feed/read kvóty
otevřeného klienta nebyly resetované a jejich běžná aktivita se nevydává za chybu.
Podklady build/feed-movement-cleanup-{before,after}.json a
build/feed-movement-cleanup-final-proof.log.

Porovnání cloudové inventury před/po potvrdilo stejných **23 Functions**, oba
minutové plánovače, Hosting **565880d4664da7b2**, Rules
**3de8f7d8-6658-4b24-951f-043eac8de297**, feed **12/feed-v3/active** a news
**6/active**, bez účtových či purge jobů. Žádná Auth mutace, produkce/main/tagy
beze změny. Podklady build/feed-movement-cleanup-cloud-{before,after}.json.

Tím jsou uzavřené B4 i společná finální DEV regrese A0–A3/B1–B4, v návaznosti
na dříve přijaté číslovky, expiraci, pause/recovery, kompatibilní UI rollback,
stránkování, přečtení a interakce. Kapacitní cíl 5 000 aktivních relací,
produkční aktivace a ostatní serverové/startovní brány tím nejsou prokázané.
Samostatně odložená diagnóza původního běžného okna zůstává evidovaná;
nezaměňovat ji za opravu nebo znovuotevření již přijaté pohybové regrese.
