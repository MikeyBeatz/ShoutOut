# Trvalá instalace a zapojení prostorového feedu

6.–7. listopadu 2026. Lokálně dokončeno na `feature/feed-page-integration` podle pokynu
vlastníka připravit konečné řešení použitelné také pro produkci. Tento dokument
popisuje připravené řešení a kontrolní brány; **není záznam živé aktivace**.
Aktuální nasazení dokládá [PROJECT_STATUS](../../PROJECT_STATUS.md).

## Co se připravuje společně

- `getFeedPage`: Auth, ověřený e-mail, App Check, právní souhlas, blokace účtu
  a probíhající mazání. Kurzory jsou svázané s uživatelem, projektem, kontextem,
  časem snapshotu a inkarnací generace. Stránka vrací nejvýše 50 plných karet;
  pracovní pokračování není falešný konec seznamu. Řazení provádí server.
- Home: stabilní stránky, přednačtení před koncem, připojení další dávky, ruční
  obnova. Chyba obnovy ponechá původní karty i pozici. Změna filtrů se potvrdí
  až úspěšným načtením. Poloha se v otevřené aplikaci může použít poslední známá
  s upozorněním; chybějící poloha neblokuje ostatní sekce.
- `getSavedShouts`: vlastní záložky po nejvýše 50, nezávisle na nedávném nebo
  prostorovém feedu. Kontrola vlastníka, dostupnosti zdroje, blokací a smazaného
  autora. Čtení je samostatné; oprávnění klientského seznamu `saves` se neotevírá.
- Viditelné prostorové/uložené karty mají vlastní omezené odběry obsahu,
  počtů, reakce a záložky. Aktualizace nepřerovnávají stabilní feed; odchod
  karty odběry ukončí. Spotlight a dosavadní osobní sekce zůstávají kompatibilní.
  Jejich původní dotaz na posledních 50 není zdroj nového hlavního feedu.
  Kontrola 7. listopadu zjistila existující omezení **Mé shouty**: původní
  `Home._startFeedListeners` dotazuje jen posledních 50 globálních aktivních
  zdrojů, i v předchozím `77d0f15`. Nezaručuje vlastní historii a po serverové
  materializaci expirace ji nemůže zobrazit. Samostatný úplný vlastní zdroj
  Aktivní/Expirované je evidovaný v [otevřené akceptaci](../../BACKLOG.md#feed-read-refresh)
  a zbývá před veřejným MVP; tato integrace ho nevydává za hotový.
- Společný minutový worker vybírá nejvýše jeden indexový úsek: pokračování
  rozpracovaného výmazu, novou časnou úlohu nebo běžný úklid historie. Zachovává
  32 kroků / 10 s mezi transakcemi, jednotlivé dávky 32 čtení / 16 mazání,
  lease 120 s a retry nejdříve za 60 s. Původní obsahová dávka nejvýše 50 se
  nezvětšuje. Konečný purge při chybějícím dokladu pouze obnoví časnou práci,
  nespouští vedle ní druhý úplný indexový průchod.
- Běžný GC má restartovatelný checkpoint bez těl příspěvků. Destruktivní
  transakce ověřují lease, inkarnaci generace, aktuální kořen a retenční fence.
  Starší hodinové snapshoty chrání skutečný serverový čas vytvoření historie,
  nikoli klientem zadaný `retiredAt`. Poškozený/velký checkpoint vede na kontrolu,
  nikoli k neomezenému či neověřenému mazání.

Kód používá stejné rozhraní a cesty v DEV i produkci; oba klientské přepínače
`serverSpatialFeed` i společný serverový runtime jsou zatím **vypnuté**.
Přečtení a indikátor B1–B4 nejsou touto integrací dokončené. Před MVP dál platí
[celý schválený rozsah](FEED_IMPLEMENTATION_STAGES.md#aktualni-stav).

## První instalace bez aktivních zdrojů

Read-only kontrola DEV v tomto úseku naměřila 37 Shoutů a **0 se statusem
active**, bez řídicího dokumentu a generace. To dovoluje standardní instalaci
prázdného indexu; nepotřebujeme kvůli tomu migrovat expirovaný testovací obsah.
Před použitím se stav ověřuje znovu v transakci. Stejný postup platí pro první
produkční instalaci, pouze pokud také splní tento předpoklad.

`tools/feed_empty_bootstrap.mjs` má oddělené příkazy:

1. `plan`: pouze čte; vytvoří lokální JSON s projektem, generací a SHA-256.
2. `initialize`: při potvrzeném digestu atomicky založí `feedIndexControl/current`
   v režimu `off` a vlastní doklad `feedIndexMaintenance/bootstrap`.
3. `activate`: po doloženém přechodu všech writerů atomicky založí generaci,
   aktivační doklad a nastaví reader/writer. Najde-li jakýkoliv aktivní zdroj,
   cizí konfiguraci či konflikt, zastaví se bez částečné instalace.
4. `pause` / `resume`: mění pouze dostupnost čtení, writer i generaci zachovají.
5. `status`: jen čte aktuální režim a vlastní instalační doklad.

Opakování po ztracené odpovědi ověřuje původní vlastnictví a inkarnace. Shoda
`serverTimestamp()` s `createTime` není použita jako důkaz identity: generace
a její aktivační doklad vzniknou jako nové dokumenty ve stejné transakci.
Nástroj nekopíruje, neskrývá ani nemaže žádný zdrojový Shout. Není obecná
migrace existujícího aktivního datasetu; pokud takový dataset najde, je nutný
samostatný prověřený migrační plán. Nástroj nesmí tento stav obejít.

Každá mutace vyžaduje přesný cílový projekt, opakované potvrzení projektu,
schválený digest, čistý Git a dokončené úspěšné `Flutter checks` pro právě
spouštěný commit. Produkce navíc vyžaduje `main` a shodný tag `vX.Y.Z`.
CLI tyto podmínky kontroluje; skutečné revize nasazených Functions/Rules,
obsah schválení a startovní bránu ověřuje operátor podle
[RELEASING](../../operations/RELEASING.md). CI není důkaz nasazení.

## Připravený sled živého DEV přechodu

Základ přechodu je zdroj **25a3f92f565bde633844214cca8419fc3053b094**, ověřený
[success CI 42356245115](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42356245115).
Před novou datovou vrstvou a tajemstvím předložit tento připravený celek
vlastníkovi. Následné aktivační commity také potřebují vlastní úspěšné CI.

Read-only plán pro DEV `feed-v1` je připravený v ignorovaném
`docs/local/migrations/feed-bootstrap-shoutout-dev-46c81-feed-v1.json`,
digest `4b0bb8b50864d26469e02ab473b4c83a44681464f77c8d12787adab6cec24fec`.
Jeho vytvoření provedlo **0 databázových zápisů**; kontrolu aktivních zdrojů
opakují instalační transakce. Žádný mutační příkaz zatím nebyl spuštěný.

| Krok | Cíl a kontrola |
|---|---|
| 1 | Pouze `shoutout-dev-46c81`: read-only inventura, plán `feed-v1`, kontrola absence aktivních zdrojů a cizího indexu. |
| 2 | V témže projektu vytvořit `SHOUTOUT_FEED_CURSOR_KEY`: náhodných 32 bytů v kanonickém base64. Hodnotu neukládat do Gitu/logů ani použít mezi projekty. Deklarace v kódu toto tajemství dosud nevytvořila. |
| 3 | Cíleně doplnit pět složených indexů a pět výjimek níže; počkat na připravenost. Nenasazovat naslepo celý indexový soubor nebo cizí TTL změny. |
| 4 | Nasadit ověřené Rules. Jejich nová podmínka zatím nic neuzavírá, dokud neexistuje řídicí dokument. |
| 5 | `initialize` podle schváleného digestu. Přítomnost řídicího dokumentu uzavře přímé vytváření Shoutů a zápisy jejich reakcí/počtů; serverové operace fungují dál. Čtení, komentáře a ukládání se tím nemění. |
| 6 | Z přesného navazujícího CI commitu zapnout společný runtime a aktualizovat všechny relevantní obsahové writery a účtový worker; nasadit oba čtecí endpointy. Klientský feed zůstává vypnutý. |
| 7 | Ověřit skutečné revize, úplnost writerů a odmítnutí přímých zápisů. Nechat doběhnout staré revize podle jejich timeoutů. Samotná deklarace nasazovacího commitu tuto kontrolu nenahrazuje. |
| 8 | `activate` provede atomickou poslední kontrolu prázdného aktivního zdroje. Pokud mezitím někdo publikoval, zastavit a nově vyhodnotit stav; žádné tiché smazání, skrytí ani backfill. |
| 9 | V otestovaném navazujícím commitu zapnout `serverSpatialFeed` jen pro DEV a nasadit Hosting site `shoutout-dev-46c81`. Ověřit skutečný build a oba typy účtů. |

Složené indexy: `cells(latCell,lonCell)` collection;
`jobs(phase,retainUntil,nextAttemptAt)` collection;
`targets(epoch,complete)` collection;
`retiredRoots(kind,retiredAt)` collection group;
`gcJobs(kind,phase,nextAttemptAt)` collection group. Pole ve vzestupném pořadí;
standardní `__name__` navazuje. Výjimky bez indexace:
`nodes.rows`, `nodes.children`, `nodes.summary`, `gcJobs.checkpoint`,
`cells.frontier`. Žádný nový TTL ani nová služba/Scheduler.

Živý test má po schválení založit 120 syntetických testovacích Shoutů v určeném
okolí pod existujícími testovacími identitami, nikoli nový reálný účet. Ověřit
50 → 100 → 120, žádné duplicity/skoky, nové bližší až po obnově, kategorii,
radius, Top/Končící/Sledované, uložení staršího Shoutu, reakci a smazání,
blokace, chování bez polohy a při chybě. Testovací obsah odstranit serverovou
cestou, nikoli přímým mazáním zdrojů mimo writer. Přesnou polohu/identitu,
datový rozsah, úklid i konečný stav doložit před živým provedením.

## Návrat a co ještě není doložené

- Před aktivací lze ponechat starý web. Po aktivaci při problému pozastavit
  reader a vrátit pouze kompatibilní web; společné writery, časný úklid a GC
  musí zůstat zapnuté. Nevracet samostatně staré Functions bez writeru a
  nemažeme generaci, řídicí dokument ani ochranné Rules.
- Podpisový klíč je pro jeden projekt a současná verze nepodporuje překryv
  rotace klíčů. Změna klíče zneplatní staré kurzory a vyžádá obnovu.
- Výsledky emulátoru nedokládají cloudovou latenci, skutečné index entries,
  provozní cenu nebo kapacitu jednoho volání. První stránka má pracovní limit
  32 uzlů na serverový krok a klient nejvýše 32 pokračování na načtení dávky;
  překročení je chyba, nikoli neúplný feed. Živý průchod musí tyto meze změřit.
- Nedokončené B1–B4 a ostatní serverové/startovní brány dál blokují veřejné MVP.
  Podpora produkčního project ID v kódu není produkční nasazení ani schválení
  jeho parametrů. Produkci připravit stejným postupem až podle ověřeného DEV
  výsledku a [startovní brány](../../LAUNCH_READINESS.md).

## Ověření této implementace

První úplné CI `42305776552` pro `cc262af` selhalo: pět instalačních případů
správně odmítlo aktivní fixture předchozích sad a Business branch průchod
překročil limit 1 000 výrazů Rules. Instalační sada nyní před spuštěním resetuje
výhradně doslovný lokální emulátorový projekt; živé instalační kontroly se
neoslabují. Rules opakovaně používají tentýž ověřený role/profile snapshot,
se stejnými podmínkami. Navazujících 92/92 lokálních regresí včetně Business,
instalace a uzavřených zápisů prošlo (`build/feed-install-rules-regression.log`).
Nové CI musí ověřit přesný opravený commit; první běh není release důkaz.

7. listopadu: také CI `42306973622` pro `7832379` odmítlo dva platné Business
průchody při přístupu k pobočce. Navazující oprava sjednocuje `hasProfile` a
kontrolu kanonických údajů na datový `get`, sdílí `getAfter` rate dokumentu a
ověřovaná data/klíče. Povinná pole firmy/pobočky dál odmítají neexistující
dokumenty bez nadbytečného `exists`. Regrese kontroluje správné názvy poboček
i chybějící firmu/pobočku a výslovně zachovává původní zákaz bez profilu
i původní čtení s existujícím prázdným profilem. Výsledek **93/93** v
`build/feed-business-gates-final.log`. Samostatně předtím 83/83 v
`build/feed-business-profile-cache.log`; dřívější neúspěšné varianty zůstávají
jen diagnostické logy. Pro limity přístupů nelze předpokládat, že se všechny
`exists/get/getAfter` navzájem cachují:
[oficiální podmínky a limity Rules](https://firebase.google.com/docs/firestore/security/rules-conditions#access_call_limits).
Read-only DEV inventura byla dnes opakovaná: stále 37 / 0 active, bez control
a generace. Nové živé zápisy neproběhly.

Konečné **success CI 42356245115** pro přesný zdroj
`25a3f92f565bde633844214cca8419fc3053b094`: 305 Flutter, 50 tools,
118 Functions unit (397 integračních případů v této ne-emulátorové sadě
přeskočeno), 421 Rules/server, 116 purge a 15 Storage. Formát, analýza, lint,
dokumentace a DEV web build prošly. Samostatný nový start Business sady
potvrdil 16/16 (`build/feed-business-cold-repeat.log`). Oba připravené balíčky
mají shodné zdroje a exporty s commitem (41 modulů content / 37 účtového
workeru). Strojové důkazy: `build/feed-page-ci-proof.json`,
`build/feed-page-ci-final.{json,log}`, `build/feed-page-artifact-proof.json`.
Metadata klíče byla přečtena bez přístupu k hodnotám: HTTP 404 / neexistuje
(`build/feed-key-metadata-readonly.json`). Indexový read-only plán obsahuje
přesně 5 složených indexů a 5 výjimek, bez TTL; jeho lokální digest je
`6c03d3a6cbb8e18f01dde4b109a698e0d97b7a071773f1544a0d87d5f3ca9591`
(`build/feed-index-readonly-plan.json`). Před aplikací tyto metadata znovu ověřit.

Produkční nasazení potřebuje vlastní konfiguraci účtového wrapperu, který je
dosud výslovně chráněný pro DEV; společné jádro nepotřebuje jiný datový model.
Uzavření přímých create/vote Rules platí pro všechny klienty. Aktuální web má
serverové cesty, ale staré/nativní DEV buildy s přímými zápisy po přechodu tyto
akce neprovedou. Mobilní distribuce a nativní App Check patří podle rozsahu
MVP do samostatného navazujícího plánu; tuto podmínku uvést před živým přechodem.

Průběžné lokální důkazy: 38/38 společných serverových regresí
(`build/feed-start-maintenance-final.log`), 8/8 instalace a uložených Shoutů
(`build/feed-saved-bootstrap-final.log`), předchozí 4/4 checkpoint testy a
úspěšná Rules regrese v `build/feed-start-maintenance-initial.log` (celý první
průchod měl tři instalační/testovací chyby, které byly opravené; není vydáván
za úspěšnou celkovou kontrolu). Konečné CI je doložené výše.
Žádné živé zápisy, tajemství, nasazení nebo nové Auth účty v této přípravě.
