# B3 — návrh přechodu indexu a DEV zapojení

19. listopadu 2026. **Vlastník schválil lokální přechod a testy; nejde o živé nasazení.**
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

Prošlo 132 společných emulátorových purge/runtime regresí. Po posledních
drobných změnách prošlo všech 18 cílených přechodových testů: 130 neprázdných
zdrojů, starý klient/kurzor, skutečné publikování/reakce/mazání, dávka 50 při
přípravě mazání účtu, restart/ztracená odpověď, souběh auditů, rollback/resume,
chybná metadata i R5/R6 během doplňování a po přepnutí. Také 35 cílených
Flutter testů, 82 tools, kontrola obou Functions artefaktů, ESLint,
formát a analyzátor. Připravený zdroj čeká na společný push a úplné CI;
žádné nasazení ani cloudové mutace.

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
