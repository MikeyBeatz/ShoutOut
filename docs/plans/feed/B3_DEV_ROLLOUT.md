# B3 — návrh přechodu indexu a DEV zapojení

19. listopadu 2026. **Vlastník schválil lokální přechod a testy; nejde o živé nasazení.**
Následně schválil celý [přípravný provozní úsek](#operator-preparation).
[Konkrétní návrh živého DEV přechodu](#dev-pilot-proposal) je oddělený;
jeho provedení dosud schválené není.
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
Další je schválení a provedení vymezeného DEV pilotu níže; obecnou přípravu neopakovat.

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

## Konkrétní návrh následného DEV přechodu — čeká na schválení

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
