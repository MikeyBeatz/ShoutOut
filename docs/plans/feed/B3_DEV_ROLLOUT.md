# B3 — návrh přechodu indexu a DEV zapojení

19. listopadu 2026. **Vlastník schválil lokální přechod a testy; nejde o živé nasazení.**
Následně schválil celý [přípravný provozní úsek](#operator-preparation).
[Konkrétní živý DEV přechod](#dev-pilot-proposal) a uvedený pilot vlastník
následně výslovně schválil. [Průběh](#dev-rollout-results) odlišuje přípravu a skutečné provedení.
[Lokální jádro a měření](FEED_DELTA_REFRESH_PLAN.md#b3-local-results) jsou uzavřené.
Zdroj c2cdb48aedcd0584eeb675935b4694af8b46701e má
[success úplné CI 44419427913](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44419427913),
dokumentace a metriky a55e288 mají
[success dokumentační CI 44421327266](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44421327266).
Pracovní strom při navázání byl čistý. Přerušená implementace ani chybějící push
se nepotvrdily. Navazující lokální přechod je popsaný níže; živá aktivace
a akceptace B3 zůstávají otevřené.

[Etapy](FEED_IMPLEMENTATION_STAGES.md#aktualni-stav) ·
[Obecný migrační kontrakt](FEED_RUNTIME_PROPOSAL.md) ·
[Pravidla vydání](../../operations/RELEASING.md)

## Výchozí mezery před tímto lokálním úsekem

| Oblast | Kód před úsekem | Potřebné doplnění |
|---|---|---|
| Formát writeru | `createFeedRuntime` předává jedno `contentIdentity` všem generacím. | Rozlišovat formát každé serverové generace ve stejné transakci. |
| Doplnění existujícího zdroje | `prepareBatch` běžně očekává původní řádek v indexu. | Bezpečně rozlišit dosud nedoplněný zdroj od poškozeného již udržovaného indexu. |
| Čtení a kurzor | `getFeedPageOperation` vyžaduje shodu generace s jednou hostitelskou volbou. | Kompatibilně číst obě generace a zachovat původní politiku starého kurzoru. |
| Klient | Nový web při B3 čeká na B2 a vyžaduje potvrzenou skupinu; starý web tuto schopnost nemá. | Výslovná schopnost nového klienta, potvrzená serverem; starý klient zachová dosavadní řazení. |
| Migrační nástroj | `feed_empty_bootstrap` odmítá existující generaci či aktivní zdroj. | Obnovitelný přechod se skutečnými aktivními Shouty, použitelný i pro budoucí produkci. |
| Cena osobního výběru | Cache je navázaná na přesný readTime, nikoli napříč všemi obnovami. | Odděleně změřit novou obnovu, studený proces a další stránku. |

<a id="local-transition-results"></a>

## Lokální implementace přechodu

Vlastník odpověděl „Schvaluji lokální přechod a testy“ pro rozsah níže.
Na feature/feed-b3-transition vzniklo interní jádro
`functions/feed_generation_transition.js`, bez callable, CLI a plánovače.
Schválení samo nepovoluje živou migraci ani aktivaci provozních flags.

- Režim `compatibleGenerations` zůstává ve všech živých wrapperech výchozí
  false. Při lokálním zapnutí se projekce odvozuje od markeru každé generace;
  neznámá verze se odmítne. Formát se nepřebírá z klientských dat.
- Přepnutí začíná atomickým vytvořením cílové generace a soukromého jobu
  v `feedIndexMaintenance/transitions/jobs/{target}`. Vlastnictví váže skutečné
  createTime jobu/cíle, inkarnace zdrojové generace a kontrolní revize.
  Živý start musí navíc předat očekávanou inkarnaci zdroje.
- Chybějící původní řádek je přípustný jen ve vlastněné `backfill` fázi
  skutečně udržované generace. Přítomná chybná metadata se neopravují naslepo.
  Výsledek společného writeru bere změny ze všech projekcí. Autorův veřejný
  profil a již načtené markery se uvnitř jedné transakce sdílejí, bez jejich
  opětovného čtení pro každou generaci.
- Backfill stránkuje aktivní zdroje po ID, znovu je čte ve své transakci
  a potvrzuje index i checkpoint společně. Zachovává stávající mez 50 / 450;
  při překročení plánovacího rozpočtu bezpečně sníží dávku bez posunu kurzoru.
  Smazaní autoři se nepřenášejí zpět do indexu. Zdrojová těla nemění.
- Audit se připne na jeden readTime. Zvlášť dávkově projde zdrojové projekce
  a dosažitelné cílové bloky. Porovnává počet, XOR SHA-256 a součet SHA-256
  modulo 2^256 nad celými kanonickými projekcemi včetně ID; nejde jen o počet.
  Ověřuje i geografický adresář a souhrny větví. Stav auditu zůstává omezený
  dosavadními 32 uzly na krok a 262 144 byty checkpointu, nevzniká kopie textů.
  Změna R5 fence, kontrolní revize či inkarnace důkaz zneplatní. Po hodině je
  nutný nový audit; tím se nemění uživatelská relace ani retenční termín.
- Aktivace bez hotového platného auditu se odmítne. Původní generace se dále
  udržuje pro staré kurzory a rollback. Návrat zachová oba writery; `resume`
  vyžaduje nový audit před dalším zapnutím. `abort` před aktivací odebere
  neúplný cíl z writerů, avšak nemaže registry ani neobnovuje odstraněná data.
  R5/R6 nadále musejí dočistit i zachované generace, s původní lhůtou.
- Nový klient posílá schopnost `readPolicy: confirmed-v1` pouze pro B3 Nejblíž.
  Server ji potvrzuje teprve se zapnutým hostitelem a správnou generací.
  Starý klient zůstává u původního řazení; starý podepsaný kurzor zachová svou
  původní politiku i po přepnutí. Místní IndexedDB se tím znovu nemigruje.
- Veřejné neměnné indexové bloky používají jednu sdílenou procesovou cache
  se stávajícími mezemi 4 MiB / 1 024 položek / nejvýše hodina. Zaniklé requesty
  tak nezakládají další hodinové cache držené časovači. Retenční fence platí
  dál; limit označuje uložené bloky, nikoli celkovou paměť Node procesu.

Lokálně prošlo 133 společných emulátorových purge/runtime regresí. Po posledních
drobných změnách prošlo všech 18 cílených přechodových testů: 130 neprázdných
zdrojů, starý klient/kurzor, skutečné publikování/reakce/mazání, dávka 50 při
přípravě mazání účtu, restart/ztracená odpověď, souběh auditů, rollback/resume,
chybná metadata i R5/R6 během doplňování a po přepnutí. Také 35 cílených
Flutter testů, 82 tools, kontrola obou Functions artefaktů, ESLint,
formát a analyzátor.

**Lokální úsek je uzavřený po přesném úplném CI.** Zdroj
`7191502b29b57c063c1e40f714df1ee9f98d4e78` je pushnutý na feature/feed-b3-transition
a má [success CI 44565313452](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44565313452).
Prošlo 381 Flutter, 17 browserových + 2 transportní, 82 tools, 135 Functions
unit (482 integračních mimo emulátor přeskočeno), 457 Rules/server, 34 B2 runtime,
134 purge/runtime včetně všech 18 přechodových a 15 Storage testů, formát,
analyzátor, lint a webový build. Interní přechodové jádro se do Functions
artefaktů nebalí. Žádné nasazení ani cloudové mutace neproběhly.

Pro budoucí živé provedení ještě zbývá kontrolovaný operátorský vstup se
schváleným digestem a přesným úplným CI, aktuální inventura a výslovně
odsouhlasený pilot. Jádro není oprávněním spouštět živé zápisy z pomocného
skriptu. Vyřazení staré generace není součástí tohoto živého kroku a nesmí
obcházet hodinové kurzory ani R5/60denní úklid.

Pouhé přepnutí webového flag nebo přepsání markeru současné generace není
bezpečný rollout. Vznik nového řádku, mazání či reakce během doplňování nesmějí
zablokovat běžné zápisy ani přepsat čerstvá metadata starou kopií.

<a id="local-transition-proposal"></a>

## Navržený ucelený lokální úsek

1. **Kompatibilní formáty a hostitelé.** Zachovat dosavadní generaci i vypnuté
   živé flags. Důvěryhodný marker rozliší původní projekci a `readIdentity: 1`;
   neznámá verze se odmítne. Writer, časná účtová fronta a purge koordinátor
   použijí odpovídající adaptér každé generace. Pokrytí společného plánu musí
   zohlednit všechny generace, nikoli převzít výsledek jen první projekce.
2. **Příprava doplňované generace.** Starý reader zůstane aktivní. Řízení
   `building` bude udržovat původní i cílovou generaci. Pouze ověřený migrační
   stav cílové generace dovolí chybějící starý řádek nahradit vložením aktuálního
   zdroje, případně prázdným odstraněním. Přítomný nesouhlasící řádek zůstane
   chybou; běžná aktivní generace tuto výjimku nedostane. Stejné pravidlo platí
   pro souběžné serverové writery i doplňovací nástroj.
3. **Obnovitelný backfill bez změny Shoutů.** Stránkovat zdroje po ID a ukládat
   trvalý checkpoint v soukromé existující oblasti údržby indexu. V transakci
   znovu načíst zdroj, kontrolní revizi a inkarnaci generace. Použít nejvýše
   stávající dávku 50 a společný rozpočet 450 zápisů; velikost dávky při potřebě
   snížit, nikoli obejít rozpočet. Opakování po ztracené odpovědi je idempotentní.
   Checkpoint i indexový plán se potvrdí společně. Žádné přepisování textu,
   polohy, statusů, čítačů či retenčních termínů zdrojových Shoutů.
4. **Pokrytí a přepnutí.** Ověřit ID a obsahové projekce ve stejném historickém
   snapshotu, včetně vynechání nedostupných/smazaných autorů; samotná shoda počtů
   nestačí. Doklad svázat s migrační inkarnací a kontrolní revizí. Atomické
   přepnutí readeru odmítne neúplný, zastaralý či cizí doklad. Následné souběžné
   změny musejí zachovávat stejný invariant přes společný writer.
5. **Kompatibilní čtení a návrat.** Nový klient uvede podporu B3 až na cestě
   s potvrzenou B2 bariérou. Server ji povolí pouze ve vlastním zapnutém režimu;
   klient nedodává osobní read ID ani revizi jako autoritativní stav. Kurzor
   zachová generaci, inkarnaci, hodinovou hranici a původní politiku. Starý web
   a stará rozečtená relace nesmějí během přechodu vyžadovat nový formát.
   Obě generace zůstanou udržované pro návrat a existující relace; jejich
   pozdější vyřazení nesmí obejít R5 ani účtový retenční termín.
6. **Náklady a konkrétní DEV návrh.** Měřit studenou první stránku, další stránky,
   novou obnovu, vyhození cache a různé účty. Odlišit indexové, osobní a tělové
   reads, zápisy migrace a počet RPC. Na základě výsledků připravit přesný
   DEV plán s revizemi Functions, ověřeným návratem a digestem změn. Provozní
   budget nevyvozovat automaticky z laboratorních 256 bloků.

Implementace má obsahovat emulátorové regrese publikování/reakce/mazání během
doplňování, dvě oblasti, změnu obsahu, souběžné workery, restart, opakování,
rollback, prázdný i neprázdný dataset, R5/účtovou práci v obou generacích,
neznámou verzi a starý/nový kurzor. Klientské testy ověří výměnu účtu,
neúplnou synchronizaci a potvrzení skupin. Kontrola obou Functions artefaktů
zůstane zachovaná. Následují dokumentace, společný commit/push a úplné CI.

Tento navržený souhlas se týká **jen lokální implementace a emulátoru**.
Nepovoluje živou generaci, běh migrace nad DEV, testovací Auth účty, testovací
obsah ani rollout. Nevzniká nová placená služba, Scheduler úloha, role,
oprávnění či produktová retence. Rules a produkce se nyní nemění.

## Posouzení dosavadních nákladů

Lokální měření přechodu 25 zdrojů s dávkou 10, ztracenou odpovědí a dvěma
souběžnými auditními pokusy: 149 čtení (z toho 7 veřejných profilů), 24
pokusů o zápis a 22 potvrzených zápisů, nejvýše 4 zápisy v jedné transakci.
Při stejném scénáři v CI bylo 141 čtení a 22 pokusů / 22 potvrzených zápisů;
rozdíl tvoří počet opakovaných transakčních pokusů při souběhu auditů.
Žádný pokus o změnu zdrojového Shoutu. Zahrnuje řízení přechodu a audit;
nejde o účet za celý životní cyklus feedu. Regrese společného writeru ověřuje
jediné čtení autorova profilu pro obě generace v témže transakčním pokusu.
Scénář se 130 zdroji potvrzuje shodu úplných projekcí a neměnná updateTime
zdrojů. Čas emulátoru není důkaz cloudové propustnosti.

V naměřeném hustém scénáři má historie 10 000 značek ve stejném dni expirace
a okolí 120 kandidátů. První stránka vyžadovala **190 soukromých blokových
reads v 16 dávkách**, dalších 5 prostorových uzlů a 50 vybraných těl.
Nejde o úplný účet za požadavek; actor/control/retention a další práce jsou navíc.
Další stránka ve stejné cache měla 0 osobních reads. Nové readTime či jiná
instance tuto cache automaticky nepřevezmou, takže uvedená úspora není
garancí pro každou obnovu ani pro první otevření aplikace.

**Závěr:** měření prokazuje funkční a omezený výběr, nikoli splněnou provozní
kapacitu nebo schválenou cenu pro 5 000 aktivních relací. B4 metadata/delta
dosud nejsou hotová. Před živým pilotem doplnit rozlišená měření z bodu 6;
pokud vyjdou nevyhovující, konkrétní optimalizaci předložit jako další změnu,
nikoli tiše navyšovat limity nebo označit teplou cache za řešení studené cesty.

## Následná živá brána

Po lokálním ověření předložit skutečnou aktuální inventuru DEV, konkrétní
schéma/checkpoint, prostředky, rozpočet operací, migrační digest, cílové
generace, seznam writerů/readerů a kompatibilní návrat. Starší prázdný DEV
dataset není důkaz dnešního stavu. Nový generický přechod se nesmí nahradit
zkratkou vyžadující natrvalo prázdnou aplikaci.

Nejdříve nasadit kompatibilní kód po úspěšném přesném CI a ověřit writery;
potom může schválený plán vytvořit a doplnit cílovou generaci. Až po ověření
pokrytí přepnout čtení a zapnout nový web. Přesný živý test a jeho úklid musí
být vymezený v tomto plánu před provedením. Rutinní rollout má trvalý souhlas;
nová migrace a nová živá data potřebují samostatné schválení.

Metriky zůstávají **60,01 % MVP / 70,19 % backlog**. Důkazy lokálního B3 jsou
doplněné, jejich již započtené váhy se nemění. Tento přechod nezavírá
nasazení ani živou akceptaci B3.

<a id="operator-preparation"></a>

## Provozní příprava po schválení vlastníkem

Vlastník 19. listopadu odpověděl „Schvaluji celý přípravný úsek“. Rozsah:
řízený nástroj, vypnuté společné zapojení, rozlišené měření, návrh pilotu,
testy, dokumentace, commit/push a CI. Bez živé migrace, nasazení, změn Rules,
provozních prostředků či Auth účtů.

- `tools/feed_generation_transition.mjs` poskytuje `plan`, `status`, `start`,
  `backfill`, `begin-audit`, `audit`, `activate`, `rollback`, `resume`, `abort`.
  Každé mutační spuštění provede jeden obnovitelný krok dosavadního jádra;
  nezavádí Scheduler ani neomezenou smyčku. Dávka zůstává 50 / 450 zápisů,
  audit nejvýše 32 uzlů za krok. Po ztrátě odpovědi nejprve načíst status:
  uvnitř fáze lze pokračovat stejnou akcí, po jejím dokončení zvolit další.
  Opakování backfill po přechodu do auditu se bezpečně odmítne bez zápisu.
- Plán zahrnuje projekt, generace, původní kontrolní revizi, inkarnaci zdroje
  a dávku 50; všechny položky kryje SHA-256. Změna obsahu vyžaduje jiný digest.
  Nástroj odmítá cizí job či znovu vytvořený zdroj. Plán ani stav nedávají
  oprávnění k mutaci a jejich čtení nemění cloudová data.
- Mutace vyžaduje `--project`, shodné `--confirm-project`, `--plan`,
  `--approved-digest`, `--ci-run`, čistý Git včetně nesledovaných souborů
  a přesné úspěšné **úplné** CI. Ověřují se i úspěšné jednotlivé aplikační,
  serverové, browserové, dokumentační kroky a build; lehké CI neprojde.
  Produkce navíc vyžaduje main a odpovídající tag. Schválení produkce a
  startovní brána zůstávají samostatné podmínky, které CLI samo nedokazuje.
- `feedRuntimeConfiguration.compatibleGenerations` a `unreadFirst` zůstávají
  false. Všechny factory writerů/účtového úklidu sdílejí první volbu;
  `getFeedPage` přebírá výhradně důvěryhodné hostitelské nastavení. Druhá volba
  vyžaduje první. Mutátor CLI při vypnuté kompatibilitě odmítne běh ještě
  před otevřením databáze. Provozní nasazení všech writerů se ověřuje zvlášť;
  čistý lokální kód není důkazem cloudových revizí.
- Budoucí B3 hostitel má samostatnou omezenou cache soukromých read bloků,
  oddělenou od veřejného indexu. Klíč stále zahrnuje projekt, UID a readTime.
  Profil je dosavadních 4 MiB / 1 024 položek / hodina; budget 256 read bloků
  je nadále kandidát pro DEV pilot, nikoli určená produkční kapacita.
  IndexedDB, přenos B2, retence a oprávnění se tím nemění.
- Migrační jádro i operátor zůstávají mimo oba nasazované Functions balíčky.
  Testy jsou ve Functions sadě až po instalaci jejích SDK závislostí.

Lokálně prošlo 22 emulátorových regresí (18 přechodových + 4 operátorské),
6 unit regresí CLI/release/hostitele a kontrola obou skutečných artefaktů.
Přípravný úsek je uzavřený a pushnutý: zdroj
`16e2ea524f565a43e2bbc43f9e83f8e0b69c4ded` má
[success úplné CI 44607375041](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44607375041).
Prošlo 381 Flutter, 17 browserových + 2 transportní, 82 tools, 141 Functions
unit (486 integračních mimo emulátor přeskočeno), 457 Rules/server, 34 B2 runtime,
138 purge/runtime a 15 Storage testů, lint, formát, analyzátor i webový build.
Při následném ověření skutečného CI dokladu odmítl CLI vstup mutaci chybou
feed-compatible-writer-release-required ještě před otevřením databáze.
Test databázovou factory zároveň nepodmíněně blokoval; počet jejích volání
byl 0. Žádná mutace ani nasazení se tím neprováděly. Živé přepínače jsou vypnuté.
Další je provedení již schváleného DEV pilotu níže; obecnou přípravu neopakovat.

### Rozlišené měření studené cesty

[Reprodukovatelný nástroj](../../../tools/measure_feed_b3.mjs) vytvořil
[úplný report](../../benchmarks/FEED_B3_2026-11-19.json): pět scénářů, každý
120 syntetických Shoutů, dva databázové testovací profily bez Auth a sedm
měřených stránek/obnov. Všechny běžely pouze v `shoutout-rules-test` na
127.0.0.1:8080. Report obsahuje otisky použitých souborů a omezení měření.

| Další historie účtu | První stránka: celkem / read bloky | Další stránka | Nová obnova | Další stránka po vyhození cache |
|---|---:|---:|---:|---:|
| 0 | 87 / 1 | 80 / 0 | 87 / 1 | 81 / 1 |
| 100, stejný den expirace | 89 / 3 | 80 / 0 | 89 / 3 | 83 / 3 |
| 1 000, stejný den | 109 / 23 | 80 / 0 | 109 / 23 | 103 / 23 |
| 10 000, stejný den | 284 / 198 | 80 / 0 | 284 / 198 | 278 / 198 |
| 10 000, jiný den | 87 / 1 | 80 / 0 | 87 / 1 | 81 / 1 |

Každá stránka zahrnuje **50 čtených těl**, ostatní SDK dokumentová čtení
včetně prázdných dotazů a eligibility/control/retention práce. Nejde o celý
účet: účtované index entries, HTTP callable, Auth/App Check, transaction
begin/commit RPC a síť nejsou měřené. SDK read calls nejsou úplný počet RPC.
Založení fixture, B2 přenos a úklid jsou mimo tato čísla. Ve všech 35 výběrech
byly ověřené výsledky, beze změn zdrojů nebo read stavu během samotného čtení.

Druhý účet nevyužil cizí osobní cache; v hustém scénáři opět 198 read bloků.
Nové readTime znovu platí studený osobní výběr. Veřejné adaptéry stále
ověřují retenční fence a nové adaptéry cache invalidují; cache tedy není
hotovým B4 porovnáním verzí. Opakování starého kurzoru zůstalo shodné i po
vyhození cache. „Studený proces“ v reportu je vyprázdnění obou cache, nikoli
měření skutečného cloudového cold startu. Emulátor neprokazuje cenu, latenci
ani propustnost 5 000 aktivních uživatelů. Hustou studenou cestu zohlednit
v B4 a kapacitní bráně; nezvyšovat potichu budget při jeho vyčerpání.

Reprodukce po instalaci tools/functions závislostí: ve Firestore emulátoru
projektu `shoutout-rules-test` spustit `node tools/measure_feed_b3.mjs`.
Bez přesného lokálního hostu nástroj skončí před inicializací. Dočasné
výsledky tohoto úseku jsou společně v build/b3-operator.

<a id="dev-pilot-proposal"></a>

## Schválený rozsah následného DEV přechodu

Read-only inventura 19. listopadu: Standard Firestore v europe-west3,
`feed-v1`, control active / revision 1 / writers `[feed-v1]`, 38 zdrojových
Shoutů, 0 se statusem active. Všech sedm níže uvedených Functions je ACTIVE,
Node.js 22, europe-west3. Inventura není souhlas se zápisem ani trvalá záruka
počtů; před skutečným provedením ji obnovit. Použít stejný obecný doplňovací
postup i při nulovém počtu zdrojů, nikoli znovu prázdný bootstrap.

Read-only připravený plán je v ignorovaném
`docs/local/migrations/feed-b3-transition-2026-11-19.json`. Sdílené parametry:

| Parametr | Hodnota |
|---|---|
| Projekt | shoutout-dev-46c81 |
| Zdroj → cíl | feed-v1 → feed-v2 |
| Původní control revision | 1 |
| Inkarnace zdroje (seconds, nanoseconds) | [1794043015, 319104000] |
| Dávka | 50 |
| Digest | 6db86498320baf666e263c48e4359f3dafd837b3e94232dd3448ef22b329347c |

1. **Kompatibilní release.** Zapnout jen compatibleGenerations, B3 čtení i
   webový serverUnreadFeed ponechat false. Přesné úplné CI aktivačního commitu,
   čistý artefakt a předem uložený kompatibilní v3 návratový web. Aktualizovat
   pouze createShout, toggleShoutReaction, deleteShout, prepareAccountDeletion,
   getFeedPage a dva stávající účtové workery accountDeletionRequestCreatedDev,
   resumeAccountDeletionJobsDev. Callables zachovají min 0 / max 1, concurrency 1,
   256 MiB / 15 s; účtové Functions stejný profil s 60 s. Žádná nová Function,
   klíč, Rules, indexová konfigurace ani Scheduler. Ověřit skutečné cloudové
   revize všech writerů/workerů a doběhnutí předchozích požadavků před migrací.
2. **Obecný přechod indexu.** Se schváleným digestem a přesným úplným CI
   provést start, obnovitelné backfill kroky, begin-audit a audit do ready.
   Starý reader běží dál. Změna inkarnace/revize či chybný audit přechod
   zastaví. Prázdný zdroj projde stejně přes audit; nově publikované zdroje
   se souběžně udržují v obou generacích. Až potom activate přepne reader.
3. **B3 reader a web.** V navazujícím otestovaném commitu zapnout unreadFirst
   a DEV serverUnreadFeed, zachovat compatibleGenerations. Pro pilot navrhnout
   dosavadních 256 read bloků / požadavek s explicitní chybou při překročení;
   žádné zvýšení instancí ani produkční kapacity. Po přesném úplném CI nasadit
   getFeedPage a DEV Hosting site shoutout-dev-46c81, ověřit app-config i artefakt.
4. **Vymezený pilot.** Připravit testovací helper a jeho testy před cloudovým
   během. Navrhnout 120 nových syntetických Shoutů s platností 24 h (60 pod
   Bright_Otter_182, 60 TestBusiness), v syntetickém okolí Litoměřic
   [50.533, 14.13]. Ověřit 50 → 100 → 120, globální skupiny napříč stránkami,
   oddělovač, stabilní scroll a nové pořadí po obnově; Top/Končící/Sledované
   zachovat. Pro průkaz globálního pořadí navrhnout testovací značky přečtení
   prvních 70 příspěvků pro Bright_Otter_182 a prvních 20 pro TestBusiness.
   Jde pouze o nové fixture ID, skutečné značky účtů se nezmění; toto přímé
   seedingové ověření musí být výslovně zahrnuté v živém souhlasu. Skutečný
   B2 přenos a UI čtení dalších fixture ověřit samostatně.
   Kontrolovat starý web/kurzor, reakci, záložku, mazání a změnu přihlášeného
   účtu bez zakládání či mazání Auth účtů. UI akceptaci netvrdit, pokud
   tester nemá testovací oblast v dosahu. Úklid přes společný writer v obou
   generacích; odstranit pouze fixture obsah, související vlastní potvrzení,
   záložky a testovací read klíče se zachováním cizích dat. Původní pending
   žádost a 38 původních zdrojů zachovat, ověřit před/po.
5. **Návrat a zastavení.** Před aktivací lze abort vrátit samotný starý writer;
   registry cíle se nemažou kvůli R5. Po aktivaci vrátit kompatibilní web bez
   B3 a rollback přepne čtení na feed-v1, oba writery/úklid zůstanou aktivní.
   Nevracet starý backend s compatibleGenerations=false nad dvě generace.
   Znovuzapnutí vyžaduje resume a nový audit. Staré generace ani soukromý job
   nyní fyzicky nevyřazovat; hodinové kurzory a R5 mají dál původní ochrany.

Všechny mutace CLI požadují navíc potvrzení projektu a digestu a shodné CI
pro aktuální čistý commit. Operátorské názvy akcí nejsou automatický souhlas
uživatele. Aktivační SHA/run ID se doplní až po konkrétních commitech; dnešní
vypnutý zdroj se za kompatibilní živý release nevydává. Tento návrh neprovádí
produkční nasazení, nemění main a nezavírá B4 ani kapacitní bránu.

<a id="dev-rollout-results"></a>

## DEV rollout — kompatibilní Functions a přechod nasazené

Vlastník odpověděl „Schvaluji DEV přechod a uvedený pilot“ pro celý rozsah
výše: helper/testy, přesné úplné CI aktivačních commitů, sedm stávajících
Functions, přechod feed-v1 → feed-v2 se schváleným digestem, následný B3
reader a DEV web, 120 nových 24h syntetických Shoutů, fixture přečtení 70/20,
kompatibilita, návrat a úklid. Nové Auth účty, Rules, indexová konfigurace,
Scheduler, produkce a main jsou mimo rozsah. Znovu se na stejný pilot neptat.
Na feature/feed-b3-dev je připravená kompatibilní fáze (compatibleGenerations
true, unreadFirst a webové serverUnreadFeed zatím false) a pilotní helper
functions/feed_b3_pilot.js / tools/feed_b3_pilot.mjs. Helper má přesné CI,
digest, místní obnovitelný stav a odmítá opětovné vytvoření po úklidu.
Před vytvořením ověří oba existující profily, právní souhlas, omezení a
vzájemné blokace. Zachování původních Shoutů kontroluje jen podle ID/updateTime
bez opakovaného přenosu jejich textů. Testy zahrnují i větvenou cizí read
historii, idempotentní vytváření, ochranu cizích potomků a oba formáty indexu.
Interní čtecí ověření není důkaz veřejného callable Auth/App Check; to zůstává
součástí živého UI průchodu. Úklid kontroluje aktuální metadata v obou indexech;
neměnné historické kořeny mají nadále běžnou retenci a GC. Samotný helper se
do Functions balíčků nedostane. Lokálně prošlo 19 širších emulátorových testů,
po menší úpravě ještě 3 cílené a 11 unit/artifact kontrol; následuje úplné CI.
Předchozí odstavec dokládá první přípravu; následný skutečný stav je níže.

### Kompatibilní nasazení a migrace 19. listopadu

Zdroj **1a4d1845ac3f734780f64e9c8f671dd7e99c35bb** má
[úspěšné úplné CI 44614605147](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44614605147).
Oba balíčky byly ověřené proti zdrojům (51/39 modulů, bez pilotního helperu).
Návratový release web bez B3 zachovává B2 a IndexedDB v3; všech 68 souborů
kopie build/b3-dev/rollback-1a4d1845 je ověřených proti manifestu.

| Function | Ověřená ACTIVE revize |
|---|---|
| createShout | createshout-00005-goj |
| toggleShoutReaction | toggleshoutreaction-00009-tec |
| deleteShout | deleteshout-00003-vav |
| prepareAccountDeletion | prepareaccountdeletion-00003-pav |
| getFeedPage | getfeedpage-00002-zic |
| accountDeletionRequestCreatedDev | accountdeletionrequestcreateddev-00013-caf |
| resumeAccountDeletionJobsDev | resumeaccountdeletionjobsdev-00013-cal |

Všech sedm má europe-west3, Node.js 22, min 0 / max 1, concurrency 1,
256 MiB a timeout 15 s / 60 s podle schváleného plánu. Metadata API ověřila
nové revize; po posledním update uplynulo alespoň 60 s před migrací.
Původní inventura byla zopakovaná: 38 zdrojů, 0 active a jedna původní žádost.
Lokální neveřejný kontrolní otisk uchovává jen jejich ID/updateTime.

Schválený digest 6db86498…b329347c prošel start → backfill → audit → activate.
Obecný doplňovací průchod nenašel žádný aktivní zdroj, oba auditní akumulátory
mají count 0 a shodné otisky. Potom byl skutečně proveden rollback na feed-v1,
resume, nový audit a druhá aktivace. Konečný control má **revision 6, active,
readGenerationId feed-v2, writeGenerationIds [feed-v1, feed-v2]**; soukromý
job phase active / version 11. Generace ani job nebyly fyzicky odstraněné.
Dosavadní web stále používá původní pořadí; samotná migrace není B3 akceptace.

### Navazující aktivační zdroj

Připravený aktivační commit zapíná unreadFirst a pouze DEV serverUnreadFeed.
Před vytvořením pilotních dat byly doplněné transakční kontroly eligibility
a vzájemné blokace v každé dávce; úklid nově kontroluje updateTime rodiče
i aktuální členství záložek, reakcí a potvrzení uvnitř transakce. Nová regrese
ověřuje žádost o smazání mezi preflightem a zápisem i souběžnou změnu rodiče
nebo cizího potomka. Nejde o změnu Rules či oprávnění.
Prošlo 8 cílených emulátorových testů (4 pilotní / 4 operátorské), 11 unit/artifact
kontrol a celá Functions unit sada: 143 pass, 490 integrací mimo emulátor
přeskočeno; také cílený ESLint a kontrola odkazů/metrik. Původních 38 zdrojů
i jedna žádost mají po migraci stejné updateTime. Následuje úplné CI, potom
pouze getFeedPage a DEV web.
120 fixture, veřejný Auth/App Check průchod, UI akceptace a úklid dosud neběžely.

První aktivační CI zastavila zastaralá generovaná evidence, následné CI odhalilo
testovací fixture dědící nově aktivní B3 při záměrném vypnutí prostorového feedu
nebo B2. Fixture nyní přepínače oddělují; test chybějícího B3 klíče dál ověřuje
výchozí false a produkční guard zůstává. Po opravě lokálně prošlo všech 381
Flutter testů a 82 tools testů; čeká se na nové přesné úplné CI.

### Aktivace a serverový pilot — 19. listopadu, UI dosud neuzavřené

Aktivační zdroj **1db4631e424c3333553c12ebbfbba5e2aa54cca0** má
[success úplné CI 44620011513](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44620011513).
Čistý HEAD i všechny požadované úplné kroky ověřil stejný release guard jako
migrační CLI. Lokální release má 68 souborů; nasazené getFeedPage bylo připravené
ze shodných modulů. Ostatní šestice kompatibilních Functions se znovu nenasazovala.

- **Reader:** ACTIVE getfeedpage-00003-tux, hash 4b1dd75308f58da5dcccb459714adefb66085561,
  původní prostředky min0/max1/concurrency1/256 MiB/15 s, stávající podpisový klíč.
  Anonymní callable vrací HTTP 401; to nedokládá úspěšnou klientskou attestaci.
- **Hosting:** site shoutout-dev-46c81, verze 62bd3a157ab5342b, release
  1795124919775000 z 2026-11-19T21:48:39.775Z. Na web.app i firebaseapp.com
  odpovídá SHA-256 index.html, main.dart.js, app-config.json, flutter_bootstrap.js
  a version.json release manifestu (10 kontrol). B2 i serverUnreadFeed true.
- **Pilot:** přesně 120 nových 24h zdrojů v předem určeném bodě, 60 na každý
  existující účet; run mvp-b3-mwo2nutj-4a8c6eeeb464, digest plánu
  2099624a2567909fe1baea29c6a64dee9069c98259c9d66a72630e88c408b93a.
  Vzniklo pouze 90 schválených testovacích read značek: 70 Bright / 20 Business.
  Zdrojová místní identifikace je v build/b3-dev/pilot-state.json, phase verified.
- **Živé interní jádro:** čtyři průchody (oba účty × původní negrupované/B3
  pořadí), vždy stránky 50 → 100 → 120, přesná ID a žádné duplicity.
  B3 vrací 50 nepřečtených / 70 přečtených Brightovi a 100 / 20 Business.
  Původních 38 zdrojů má stejné updateTime; původní žádost se nemění.
  Žádná Auth mutace, nové Rules/indexy/Scheduler ani produkční změna.

Veřejný Auth/App Check s obsahem, skutečný oddělovač, scroll/obnova a klientské
interakce ještě čekají na UI. Byl vyžádaný konkrétní průchod Bright_Otter_182
v Nejblíž s dosahem 50 km. Browser host není dostupný; nativní kontrola Chrome
odmítla pokračování kvůli nezjištěné URL. Ve stejném tahu automatizaci neobcházet.
Živá akceptace proto zůstává otevřená a fixture se zatím neuklízejí.

Pro pokračování bez opakování úplného CI pouze kvůli záznamu výsledků vznikl
čistý izolovaný checkout build/b3-dev/release-1db4631 na nasazeném commitu.
Obsahuje kopii přesně téhož pilot-state a odkazy na již instalované závislosti,
žádné nové přihlašovací údaje. CLI akce v něm dál vyžadují CI 44620011513,
projekt i digest; cleanup navíc skutečně dokončené klientské kontroly.
Při pokračování vždy nejprve status, po úklidu přenést stav a důkaz zpět do
hlavního build/b3-dev, potvrdit zachování baseline/žádosti a uzavřít dokumentaci.
Nový pilot ani migraci nezakládat. Nezměněná historie indexu má původní GC.

<a id="read-feedback-fix"></a>

### Oprava měření a vizuální stav — schváleno 20. listopadu

Vlastník potvrdil načítání dalších stránek a následně i oddělovač. Uvedl však,
že otevřené „MVP B3 070“ zůstalo nepřečtené, a požádal o barevné rozlišení.
Read-only kontrola tehdy našla u Bright_Otter_182 87/120 značek (původních 70
a 17 nových), ale nikoli 070; u Business zůstalo původních 20. To dokládá
částečně funkční živý přenos, nikoli příčinu konkrétního nepřečtení.

Vlastník výslovně schválil společný úsek: reprodukovanou chybu čtení opravit
bez změny celého zobrazení a jedné sekundy, okamžitý jemný barevný stav při
pevném pořadí, zprávu „Žádné nepřečtené Shouty“ jen při potvrzené prázdné
skupině a odpovídající testy/dokumentaci/DEV rollout po přesném úplném CI.
Použít existující pilot, bez nových Auth účtů, Rules, retencí či produkce;
serverovou změnu zahrnout jen při prokázané nutnosti v dosavadním kontraktu.

Na fix/b3-read-feedback jsou lokálně reprodukované dva nedostatky:

1. Každé překreslení statického plovoucího ovládání rušilo rozměřenou sekundu,
   přestože se jeho geometrie nezměnila. Regrese se stálým překreslováním
   před opravou selhala. Oprava hlásí změnu zakrytí jen při změně skutečných
   globálních hranic; skutečné posunutí/změna velikosti pořád měření přeruší.
2. Ovládání předchozí zakryté routy zůstalo v seznamu překážek otevřeného
   detailu. Regrese s dokončenou animací před opravou selhala a po omezení
   překážky na aktuální routu prochází. Modalita, životní cyklus a skrytý či
   oříznutý text mají dál původní ochrany.

Tyto reprodukce prokazují chyby klienta; jejich odstranění v konkrétní živé
relaci 070 musí teprve potvrdit nové UI ověření. Backend se nemění.
ReadStatusBuilder sleduje jen změnu bool stavu vlastní karty; cizí značky ji
nepřestavují. Místní uložení, remote import i obnova mění barvu bez změny
výšky, scrollu, serverového feedRead nebo pořadí. Uložené/nové barevné stavy
nevyvolávají síťový přenos; zachovaná synchronizace běží při spuštění/obnově.
Pozadí zachovává Business zvýraznění, interakce i textový kontrast.

Zpráva bez nepřečtených se zobrazuje nad oddělovačem v Nejblíž pouze pokud
první vrácená položka má serverový feedRead=true. Globální pořadí tím
potvrzuje prázdnou nepřečtenou skupinu i přes další stránky. Prázdná nefinální
stránka, loading, Top a pouhé místní přečtení aktuální dávky zprávu nespustí.
„Nepřečtené“ se nezaměňuje s nově příchozími Shouty, jejichž indikátor je B4.
Text má překlady ve všech šesti dalších podporovaných jazycích.

Prošlo 34 cílených Flutter testů včetně detail → mark → refresh sync → nová
serverová skupina, neprůběžného uploadu, rozhraní obou témat, kontrastu ≥4,5:1,
živého ovládání karty a změny uživatele. Zatím jde o místní kód a výsledky;
úplné kontroly, přesné CI, DEV nasazení a ruční akceptace následují.

Celá místní Flutter sada má **389 pass**; analýza lib/test je bez nálezů.
Obecné místní flutter analyze navíc zahrnulo Dart šablonu vendored Firebase CLI
v tools/node_modules a našlo šest chyb jeho chybějícího balíčku, nikoli zdrojů
aplikace. Výjimky analyzátoru ani závislosti kvůli tomu změněné nebyly.
Úplné CI stále provede povinný standardní analyzátor v čistém prostředí.
Před živým nasazením zůstává vyžadovaný jeho přesný úspěšný výsledek.
