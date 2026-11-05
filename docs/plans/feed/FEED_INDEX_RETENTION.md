# Retence prostorového indexu – lokální ověření R4

31. října 2026. Vlastník schválil **1 hodinu + lokální ověření**, bez živého
nasazení. Navazuje na [model indexu](FEED_BLOCK_INDEX_PLAN.md) a
[produktové etapy](FEED_IMPLEMENTATION_STAGES.md).

## Platnost pořadí

Relace platí pevně hodinu od otevření nebo obnovy. Stránkování ji neprodlužuje.
R5 z 5. listopadu přidává schválenou výjimku při konečném účtovém úklidu:
[dřívější obnova dotčené relace](#account-retention-proposal).
Laboratorní view používá monotónní čas; přesně na hodinové hranici odmítne další
i opakovanou uloženou stránku chybou `FeedSessionExpired`. Nové otevření vydá
novou relaci. Již vrácené karty zůstávají volajícímu a jejich aktuální dostupnost
lze dál ověřovat hydratací. Osobní přečtení a uložené Shouty se tím nemažou.

To je ověřený kontrakt lokálního adaptéru. Zobrazení nabídky obnovy ve Flutter UI
a zabezpečený přenos kurzoru přes HTTP ještě nejsou napojené. Relace i pracovní
checkpointy jsou nyní objekty v RAM; restart procesu vyžaduje nové otevření.

## Archivace a bezpečný GC

Každá změna či odstranění existujícího kořene vytvoří ve stejné transakci
`retiredRoots/{cell-operationId}` s předchozím hashem, oblastí a `retiredAt`.
Unikátní ID se při retry transakce nemění; opakované použití stejného hashe
nepřepisuje předchozí archiv. První kořen a skutečný no-op archiv nepřidávají.

GC po oblastech nejprve označí celý aktuální strom a všechny archivní stromy,
jejichž archiv vznikl nejvýše před hodinou. Používá přesný `DocumentSnapshot.createTime`,
nikoli předpoklad shody `retiredAt` a commit času. Serverová transformace
[REQUEST_TIME má milisekundovou přesnost](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/Write#ServerValue);
lokální test ukázal rozdíl oproti času zápisu. Historie se proto prochází stránkovaně
celá pro danou oblast, bez časového filtru podle tohoto pole.

Teprve po úplném ověření chráněných bloků začne sweep. Chybějící/poškozený
chráněný blok ukončí marking chybou před mazáním. Kandidát musí být neoznačený
a jeho `updateTime` nesmí být novější než počáteční databázový read-time fence.
Mazání používá podmínku shody původního `updateTime` a transakčně kontroluje,
že se aktuální kořen oblasti od začátku GC nezměnil. Změna včetně návratu ke
stejnému hashi vyvolá `index-gc-root-changed`: zahodit úklid a začít nový marking.
Tím se chrání i znovu použité starší podstromy, nejen nově zapsané bloky.
Při kolizi precondition se nikdy nepřechází na nepodmíněné mazání.

Po sweepu lze odstranit staré archivní dokumenty. Aktuální kořen se neuklízí
podle stáří vytvoření bloku. Smazané hashe se vyřadí ze sdílené cache včetně
načítání, které právě probíhá. Nedokončený job lze zrušit nebo znovu zahájit;
již provedená bezpečná mazání nevyžadují návrat.

Jedno volání `step` má pracovní rozpočet (výchozí 32 čtení, 16 kandidátů mazání),
počáteční zachycení guardu/kořene jsou další dvě čtení. Při konfliktním batchi
mohou následovat jednotlivé CAS pokusy. Transakční čtení kořene (`rootCheckReads`) a retry jsou
další skutečná databázová práce; metriky traversal čtení nejsou celá faktura.
Pro sweep se musí zachovat indexování `nodes.path`; payload lze jinak vyjmout.

## Vyřazování expirovaných metadat

Adresář oblastí obsahuje `minExpiry`. Omezený dotaz vyhledá oblasti k úklidu;
worker prochází jen větve s dostatečně starou expirací a pokračuje po dávkách.
Namespace guard drží monotónní `prunedThrough`. Metadata aktivního Shoutu starší
než tato hranice mohou v indexu chybět; neexpirovaná nesmějí chybět nikdy.

Prune znovu načte aktuální kanonickou projekci uvnitř transakce. Nepřepisuje ji
starou nasbíranou verzí. Odstraní pouze členství v aktivním indexu, ne samotný
Shout ani jeho status či retenci. Pozdější reakce na uchovaný expirovaný Shout
může upravit kanonický dokument bez opětovného zařazení do aktivního indexu.
Technický test prodloužení expirace ověřuje opětovné zařazení a souběh; tím se
do produktu nepřidává funkce prodlužování příspěvku.

Pracovní snapshot pruneru má také hodinovou hranici. Po vypršení začít novým
zachycením kořene; již provedené vyřazení zůstává platné. Rozpočet průchodu uzlů
a počtu reconciliací není celkový počet čtení: každá reconciliace je samostatná
transakce s načtením guardu, source a potřebné větve. Žádný Scheduler není zapojený.

<a id="account-retention-proposal"></a>

## Účtová retence – diagnostika a návrh R5 z 5. listopadu

**R5 vlastník schválil 5. listopadu včetně navazující lokální implementace.**
Níže je původní diagnostika a schválený rozsah; výsledný lokální protokol je
popsaný za ním. Živá aktivace indexu schválená není.
`tools/diagnose_feed_retention.mjs` odmítá jiný cíl než lokální emulátor.
Na nezměněném aplikačním kódu z 25cd6de/c410ce3 potvrdil tři scénáře:

| Scénář | Ověřený výsledek |
|---|---|
| Opožděné vyřazení starého vlastního Shoutu při původním +60denním termínu | Source odstraněný; dokončený běžný GC ponechal 1 list s UID/polohou kvůli nové hodinové historii. Shout už byl expirovaný a ve feedu se nezobrazoval. |
| Tentýž index po simulovaném zestárnutí historie o hodinu a minutu | GC odstranil vlastní metadata, 79 cizích Shoutů zachováno. Starý cizí snapshot před úklidem správně vrátil stránky 50 + 29. |
| Druhý adaptér se samostatnou zahřátou cache | Po fyzickém smazání starého bloku z DB ho druhá cache stále obsahovala. Nejde o důkaz průchodu expirovaného API tokenu ani o chybu současného živého webu. |

[Naměřené výsledky a meze](../../benchmarks/FEED_RETENTION_BOUNDARY_2026-11-05.json).
Účtový čas je simulovaný, nikoli skutečné čekání 60 dní; zdroje i indexy byly jen
syntetické emulátorové fixture a jsou uklizené. Diagnostika dokládá mezeru,
nikoli hotový retenční mechanismus nebo náklady živého cloudu.

### Schválené rozhodnutí R5

Pevná účtová retence má při konečném úklidu přednost před zbývající platností
dotčené feedové relace. Server může vyžádat obnovu i před koncem její hodiny,
pokud musí zrušit indexovou historii kvůli smazanému účtu. Již načtené cizí
karty a scroll zůstanou; další stránka vyžádá obnovu. Přečtení a záložky se
tím nemažou. Obnovu nesmí vyvolat běžné publikování, palec ani obyčejný GC.
Dotčená relace je ta, jejíž zachycené indexové oblasti změnily retenční verzi;
může tedy patřit i jinému uživateli než mazanému účtu. Nejde o globální reset.

Alternativa zachovat všechny hodinové relace vyžaduje jiný mechanismus
průběžného přesměrování/redakce starých stromů, s dalšími metadaty a měřením.
Prodloužení 60denní lhůty ani pouhé skrytí UID při ponechání fyzických kopií
není navržená alternativa. R5 je schválená výjimka vůči původnímu R4.

### Schválený konkrétní lokální rozsah

1. Připravit emulátorový protokol retenční verze dotčených oblastí a ochranu
   proti opětovnému vložení metadat mazaného autora. Všechny indexové zápisy
   a čtení/kurzory ověří tutéž verzi; stará cache ani čekající odpověď ji nesmí obejít.
2. Vyřadit vlastní metadata z aktuálních kořenů bez vytvoření nové chráněné
   historie těchto údajů. Zachovat cizí metadata a kanonické Shouty; zrušení
   staré relace se odliší od chybějícího nebo poškozeného indexu.
3. Doplnit pokračovatelný úklid historických a osiřelých bloků, nezávislý na
   existenci původního zdroje. Použít původní identitu žádosti/deadline,
   opakování bez nové lhůty a laboratorní dávky odvozené od existujících
   50 zdrojů / 32 traversal čtení / 16 kandidátů mazání; počítat i guard/CAS/retry práci.
4. Ověřit cache více adaptérů a kontrolu verze před použitím uloženého výsledku
   i po čekajícím čtení. Omezit uchování cache; zneplatnění použití nelze vydávat
   za okamžité fyzické vymazání RAM všech procesů nebo již doručených klientských dat.
5. Testovat staré relace, nezasažené oblasti, cizí obsah, chybějící zdroj,
   neukončenou primární fázi, souběžné zápisy/GC, lost ack, retry a restart.
   Změřit celou práci a otestovat návaznost na účet; úspěch hlásit až po ověření
   odstranění všech příslušných databázových kopií. Přípravu plánovat před
   původním termínem, nevytvářet automatickou hodinovou toleranci na jeho konci.

Tento návrh neurčuje živé kolekce, migrační zápisy, plánovač ani provozní limity.
Implementace by zůstala pod feedIndexLab v emulátoru, bez živých dat/Auth účtů,
Rules, nasazení nebo nové služby. Před živým indexem dál platí samostatná brána
schématu, souběžné migrace, změřeného nákladového rozpočtu a ověření doby úklidu.

### Připravený lokální protokol R5

`createLabBlockIndex` má opt-in `accountRetention: true`. Namespace jej uloží;
adaptér s jiným režimem nesmí potichu číst/zapisovat. Žádný živý wrapper tuto
volbu nepředává. `feed_account_retention_lab.js` vede soukromý journal podle
projektu, UID a inkarnace původní žádosti; deadline se odvozuje ze stejného
createTime +60 dní. Vyžaduje potvrzené odstranění Auth a minimální veřejný marker;
při použití z účtového workeru navíc přebírá jeho transakční kontrolu lease.
Pomocník sám Auth nemaže ani nezavádí nová oprávnění.

Průchod: inventory všech bloků → dotčené oblasti → odstranění vlastních řádků
z aktuálních kořenů bez nového archivu → označení aktuálních cizích bloků →
sweep starých/osiřelých bloků a archivů → odstranění pomocných marks → závěrečná
kontrola absence UID → úklid journalu. Každý krok je transakční a pokračování je
uložené, nikoli závislé na RAM či existenci původního zdroje. Aktuální cizí
zdrojové Shouty se nemění; nové čtení ověří verzi oblasti před cache i po čekání.
Původní cizí načtené karty lze dál hydratovat i po zneplatnění starého kurzoru.

Normální GC zachycuje retenční verzi a při její změně přestane mazat. Po dobu
úklidu je dotčená oblast chráněná proti indexovým zápisům (dočasná chyba pro
opakování); ostatní oblasti nejsou uzamčené. Nové řádky smazaného autora
odmítá veřejný marker a rozpracovaný úklid odmítá i zkopírování jeho starého
řádku do nového listu při cizí reakci. Jeden namespace zpracovává jednu erasure
současně. To jsou meze laboratorního protokolu, nikoli schválené provozní SLA.

Cache má nejvýše hodinové stáří, časovač vyřazení a invalidaci čekajících loadů.
Změna erasureRevision vyřadí cache dalšího adaptéru při následující kontrole;
starý výsledek ani rozpracovaný/přenositelný kurzor nesmí obejít verzi oblasti.
Nejde o okamžitý fyzický výmaz RAM všech vzdálených procesů či klientských kopií.

Konečný `runAccountPurgeJob` při volitelném R5 writeru čeká na dokončení indexové
části; její journal maže atomicky s původní žádostí/jobem. Ostatní režimy se
nemigrují. Helper dovoluje přípravu již po potvrzení Auth před 60. dnem; živé
časování tohoto předběžného běhu ještě zapojené není. Konečný worker spouštěný
až u deadline neprokazuje fyzické dokončení přesně v jeho milisekundě.

Konečná širší regrese prošla 61/61 včetně 15 R5 případů a účtového workeru.
Zdroj 2909874312f0e72f48d09c9ad468817cbdb10877 má úspěšné
[CI 42076107087](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42076107087):
293 Flutter, 42 tools, 108 unit, 389 Rules/server, 41 purge/15 Storage,
analýza/lint/formát/build. Lokální úsek je uzavřený bez nasazení.
Případ 82 zdrojových řádků,
historické/orphan kopie a studený adaptér
každý krok: 32 volání, 242 dokumentových/query čtení a 69 zápisů samotných kroků.
Neobsahuje seed, přípravu historie, závěrečný prepareFinish ani celou účtovou práci;
nejde o cenu cloudu či benchmark hustého provozu. Metriky kroků počítají i vnitřní
guard/mark/query/retry práci, ne jen traversal. [Ověření](../../operations/TESTING.md).

Před živou aktivací zůstává provozní brána: změřit celou inventory (nyní dvakrát
přes namespace), náklady pomocných marks/guardů, délku blokace zápisů, obnovu po
výpadku a rozvržení přípravy před deadline. Při stálém zatížení/velkém indexu může
být potřeba jiný locator nebo generační postup; bez měření tuto variantu nenasazovat.
Nezavádí se další hodinová retenční tolerance ani garance termínu při výpadku.

## Výsledky a hranice

Aktualizace 5. listopadu: lokální zapojení expirace a konečného účtového purge
nemění pravidla historie. Před živou aktivací zůstává zvláštní brána odstranění
osobních metadat smazaného účtu do původního +60denního termínu, včetně starých
bloků a selhání primární účtové fáze. Hodinová ochrana nově vyřazeného kořene
není oprávněním tuto lhůtu prodloužit.
[Konkrétní mez a další ověření](FEED_WRITER_INTEGRATION.md#maintenance-purge).

Testy: `functions/feed_session_policy.test.js` a
`functions/feed_index_retention.integration.test.js`; integrace jsou součástí
`tools` příkazu `test:rules`. Lokálně prošel lint, celá Functions sada (69 pass, 83 integrací přeskočených bez
emulátoru) a cílený emulátorový běh 19/19: devět původních testů a deset nových
případů včetně cache. [Naměřená data](../../benchmarks/FEED_INDEX_RETENTION_2026-10-31.json).
Laboratorní hodiny GC mohou být explicitně posunuté pro simulaci stáří archivů;
tento parametr existuje jen v adaptéru odmítajícím jiné prostředí než emulátor
`shoutout-rules-test` na `127.0.0.1:8080`. Provozní API jej nesmí převzít.

Jednopoložková reakce potřebovala 1 source + 1 uzel + 1 adresář + 1 archivní zápis.
Vyřazení jednoho ze dvou metadat: 1 uzel + 1 adresář + 1 archiv, **0 source zápisů**
(vedle samostatné aktualizace guardu). Pozdější reakce na tento expirovaný Shout
měla 1 source a 0 indexových zápisů. GC dvou verzí listu po simulovaném vypršení
smazal 1 blok a 1 archiv; opakování nesmazalo nic dalšího.

Archivace přidává **jeden zápis na každý změněný existující kořen oblasti**.
Předchozí [benchmark](../../benchmarks/FEED_BLOCK_INDEX_2026-10-31.json) zůstává původním
měřením před archivací, tento náklad neobsahuje. Další náklady tvoří guard,
traversal/scan, transakční kontroly, mazání a případné restartování GC při změně
kořene. Celou udržovanou historii oblasti nyní čteme při markingu i úklidu archivů.
Není to měření latence cloudu, nákladů indexových položek ani garance 5 000 Kč.

Před provozem zbývají zejména frekvence/rozpočet a kapacitní testy úklidu,
odolnost při trvale zapisované oblasti (GC může opakovaně restartovat), trvalé
checkpointy či bezpečné restartování workeru, složené indexy, pokrytí všech
zapisovacích cest, migrace a zabezpečené API/UI. Živé kolekce, backfill, Functions,
Hosting a Rules se tímto lokálním krokem nemění.
