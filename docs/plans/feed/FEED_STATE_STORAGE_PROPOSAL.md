# B4 – provozní vrstva obsahu a živého stavu

[Rozcestník feedu](README.md) · [Výsledky readeru](FEED_DELTA_REFRESH_PLAN.md#b4-read-local-results)

Návrh k 21. listopadu 2026. **Vlastník schválil celý lokální P1; implementace i úplné CI jsou uzavřené.** Nejde o
nasazenou vrstvu ani prokázanou kapacitu produkce. Navazuje na uzavřený
neaktivní reader 0b2d004 a jeho úplné CI 44825059479.

## Problém a doporučení

Laboratorních 16 stavových bucketů načítá i metadata nevybraných Shoutů.
Sdílení všech čítačů v těchto dokumentech by navíc spojovalo souběžné změny
různých příspěvků. Samotné rozdělení na jednotlivé dokumenty ale nezlevní
výběr stránky: čtení 50 samostatných stavů může být dražší než čtení bloků.

Doporučení proto odděluje dvě trvalé části:

| Část | Účel | Kdy se mění |
| --- | --- | --- |
| Sdílený prostorový index s verzí těla | Výběr karet a porovnání již známého obsahu | Změna dostupnosti, obsahu, polohy nebo údajů nutných pro řazení |
| Malý stav jednoho Shoutu | Živé počty a dostupnost bez opakovaného přenosu celého těla | Změna daného Shoutu nebo jeho čítačů |

Komentář či záložka nemají přepisovat společný strom řazení. Palce jej dál
ovlivňují kvůli Top, stejně jako dnes. Název a text zůstávají ve zdrojovém
Shoutu; celé tělo se přenáší jen při chybějící či jiné verzi v klientské cache.

Firestore nemá univerzální garantovanou rychlost zápisů do jednoho dokumentu;
závisí na zátěži a contention. [Doporučení Firebase](https://firebase.google.com/docs/firestore/best-practices)
proto vyžaduje měření. Nová vrstva odstraňuje další společný čítačový dokument,
ale neřeší sama horký příspěvek, existující prostorové kořeny ani celý cíl
5 000 aktivních relací.

## Ověřené mezery současné implementace

- `feed_body_lab.js` je pouze laboratorní adaptér; aktivní hostitelé jej nepoužívají.
- `feed_block_index.js` ověřuje přesný formát řádků. Přidání identity celého
  těla potřebuje nový verzovaný formát, ne přepsání aktivní generace na místě.
- Komentáře, záložky, archivace a purge mají vlastní změny rodičovských
  čítačů; zeměpisné obohacení v `functions/index.js` zapisuje zdroj přímo.
  Všechny tyto cesty musí udržovat odvozený stav ve stejné transakci.
- Rules nyní pod spravovaným indexem zakazují přímé vytváření a změny palců,
  ale nechávají některé přímé změny commentsCount/savesCount. Bez následného
  uzavření těchto cest nelze novou projekci považovat za úplnou.
- `home.dart` stále odebírá celé aktivní Shouty vedle prostorového feedu.
  Tento odběr a rodičovské odběry musí být zahrnuté do celkového srovnání.

## Navržený kontrakt

1. Nová verze soukromého indexového řádku ponese `bodyVersion` a identitu
   výběru při zachování geografie a textové identity B3. Starý formát zůstane
   čitelný. Novou generaci odliší marker i verze uzlů; starý parser ji nesmí
   přijmout jako starý formát. Nepřidávat další přesnou polohu do odpovědi.
2. Malé stavové dokumenty budou mít cestu
   `feedIndexGenerations/{generation}/publicStates/{shoutId}`.
   Whitelist: verze schématu, authorId, status, createdAt, expiresAt,
   čtyři čítače, bodyVersion, selectionVersion a revision. Bez textů,
   přesné polohy, kontaktů, soukromých reakcí, záložek a značek přečtení.
   Název publicStates sám neposkytuje veřejná oprávnění; Rules se v tomto
   lokálním úseku neotevírají ani jinak nemění.
3. `cardRevision` zdrojového Shoutu bude celé monotónní číslo, zvýšené jednou
   za skutečnou relevantní změnu. Stejnou revizi dostanou všechny udržované
   nové generace. Opakování již potvrzené operace a no-op nepřidají zápis.
   Revize čítačů nemění bodyVersion ani schválené pravidlo přečtení.
4. Lokální kompatibilní control schema 2 doplní k dosavadním polím
   `cardWriteGenerationIds` a `cardReadGenerationId`. První je podmnožinou
   udržovaných generací, druhé je null nebo auditovaná čitelná generace.
   Schema 1 zachová dnešní vypnutou cestu. Neplatný stav nebo povinný writer
   bez adaptéru odmítne transakci před zápisy; nevznikne částečná projekce.
5. Každý kompatibilní writer přečte control uvnitř transakce. Plán nejdřív
   načte všechny podklady a teprve potom společně uloží zdroj, potřebné
   indexové změny, stav a technické potvrzení/job. Zachová nejvýše 50 zdrojů
   a společný projektový rozpočet 450 zápisů napříč generacemi. Tento
   rozpočet není tvrzení o obecném limitu Firestore.
6. Dávková práce může před potvrzením zvolit menší prefix, pokud více generací
   či oblastí překročí rozpočet. Zbytek má trvalé pokračování; jediná operace,
   která se nevejde, selže bez částečného zápisu. Žádné zvýšení limitů.

Při doplnění existujících dat se chybějící zdrojová revize interpretuje jako
0. Zdroj a cílový stav se ověří v jedné transakci; novější kompatibilní zápis
se nesmí přepsat starším plánem. Nová generace má vlastní inkarnaci. V tomto
úseku půjde pouze o obnovitelné jádro backfillu a audit v emulátoru, ne o
živé spuštění nebo schválení konkrétního migračního digestu.

## P1 – konkrétní lokální úsek ke schválení

- Připravit uvedený formát, generační adaptér, společný transakční plán a
  kompatibilní vypnuté zapojení všech serverových writerů: tvorba, palce,
  mazání, expirace, účtové skrytí, komentáře, záložky, odpočty při archivaci
  a purge i zeměpisné obohacení. Nová vrstva zůstane v živých wrapperech vypnutá.
- U geografie zůstane volání poskytovatele mimo transakci. Před konečným
  zápisem znovu ověřit původní inkarnaci zdroje, polohu a dostupnost, aby
  opožděný výsledek neobnovil smazaný obsah. Test používá falešnou odpověď,
  žádné nové placené geokódování ani retry pravidlo.
- Doplnit R5, historii a účtový úklid odvozených dokumentů všech dotčených
  generací. Po potvrzeném odstranění Auth nesmí pozdější změna cizího
  komentáře znovu zveřejnit stav smazaného autora. Textové archivy mají dál
  schválených 60 dní; konečný purge zachová cizí obsah a anonymní kontext.
  Neměnit existující živé joby, jejich inkarnace nebo původní pending žádost.
- Připravit obnovitelné doplnění a audit pokrytí proti souběžným writerům.
  Nezapínat nové veřejné API a nepřesměrovat aktivní reader na samostatné
  stavové dokumenty jen proto, že nový adaptér existuje.
- Ověřit 50/200/2 000 syntetických zdrojů, dělení uzlů, více oblastí,
  souběh různých Shoutů i jednoho Shoutu, dvě/tři udržované generace,
  dávkování 50/450, ztracenou odpověď, restart, opakování a rollback.
- Změřit skutečné SDK reads/writes, opakování transakcí a JSON bajty proti
  stejné fixture dosavadního řešení. Zahrnout výběr, chybějící těla,
  čítačové změny, R5 a úklid; oddělit první připojení živých odběrů.
- Zahrnout cílené testy, dokumentaci, zachování vah metrik a společný
  commit/push/úplné CI hotového úseku.

**Bez nasazení, živých kolekcí, migrace, nových Auth účtů, změn Rules,
Scheduleru, prostředků, retencí, produkce nebo main.** Jde o trvalý model
pro budoucí produkci, ověřený před živou aktivací, nikoli o zkratku pro prázdný DEV.

## Náklady a podmínky pokračování

Nový stav přidá nejvýše jeden vlastní stavový zápis za změněný Shout a
udržovanou novou generaci; jeho čtení a kontrola přidají práci transakci.
Nový formát zvětší indexové řádky a některé zdrojové zápisy přidají revizi.
Celkový počet fyzických zápisů do stromu závisí na oblastech a dělení uzlů,
proto jej musí doložit měření. Dvě/tři generace stojí víc než jedna.

Samostatný stav se nemá znovu načítat po 50 dokumentech při každé obnově
jen kvůli čítačům. Cílový klient porovná sdílená metadata a využije malý živý
stav místo odběru celých rodičů. Tato další integrace ještě není implementovaná;
P1 samo nezaručuje menší počet reads ani celkový účet. Při zhoršení měřené
cesty se neaktivuje a nález se doloží, nikoli skryje přesunutím nákladů mimo report.

Před implementací rozdělit pouze zbývající váhu delta-code/check na serverový
a klientský úsek, bez nového kreditu za tento návrh. P1 je hotové až s úplným
pokrytím writerů, regresí a úspěšným přesným CI; samotné schéma nestačí.

Rozpad je založený bez nového kreditu: serverové `feed-b4-state-code/check`
mají po 11 bodech MVP / 18 bodech backlogu, navazující klientské delta-code/check
po 11 / 17. Součet původních 22 / 35 zůstává stejný. Pro menší transakční
prefix je nutné kompatibilní dekódování účtové přípravy: pokračování může
platit i při méně než 50 skrytých Shoutech. Přibyla pouze tato technická
kompatibilita, bez změny UI nebo pořadí mazání; dosavadní odpovědi zůstávají platné.

## Následující brány k nasazení

1. **Klient a oprávnění:** verze odpovědi pro metadata/chybějící těla,
   sloučení živých revizí bez dvojího čítače, náhrada Home/rodičovských
   odběrů a uzavření přímých čítačových zápisů v Rules. Zachovat optimistickou
   odezvu, stabilní pořadí, B3, Mé shouty/Uložené i dosavadní promo:
   Spotlight do 20 km a dnešní výběr nejvýše 50 globálních kandidátů.
2. **Konkrétní DEV přechod:** přesný commit/CI, schéma/indexy, plán/digest,
   audit, návrat a vymezený pilot. Nejdřív nasadit všechny kompatibilní
   writery a doložit jejich skutečné revize a doběhnutí starých volání.
   Staré volání, které control vůbec nečetlo, nový guard zpětně neochrání.
   Teprve pak řízeně doplnit a aktivovat novou generaci.
3. **B4 novinky:** úsporný signál a počet na obnově při zachování stabilního
   rozečteného feedu. Potom společná regrese a samostatná kapacitní brána.

Návrh nemění pořadí nepřečtené → přečtené, ruční obnovu, sekundové měření
čtení, expiraci ani produktové možnosti. Nové nákladové/provozní volby a
živý datový přechod se předloží konkrétně před provedením.

<a id="client-integration-proposal"></a>

## Klientské zapojení B4 – konkrétní rozsah před DEV

Návrh z 21. listopadu, **vlastník schválil celý lokální rozsah; implementace i úplné CI jsou uzavřené**. Je to první ze
tří zbývajících bloků výše, nikoli nová řada P1–Pn. Serverový P1 zůstává
uzavřený; jeho algoritmy ani celé fixture bez důvodu neopakovat.

### Ověřené podklady

`home.dart::_startFeedListeners` stále odebírá 50 celých aktivních Shoutů
od nejnovějšího; v prostorovém režimu je předává do promotionShouts.
Home následně vyřadí neaktivní/blokované autory a Feed zobrazí Spotlight
do 20 km. Filtr Spotlight se aplikuje až po výběru těchto 50 kandidátů.
Jeho přesunutí před limit nebo použití jen aktuální prostorové stránky
by změnilo produktové chování, proto se nenavrhuje.

`_SpatialShoutCard` a `ShoutDetailPage` mají vlastní odběr celého rodiče,
vlastní reakce a záložky. `_reconcileInteraction` při opožděném potvrzení
také čte celý rodičovský dokument. `FeedPageGateway` přijímá pouze v1 s plnými
těly; laboratorní FeedBodyCache není napojená. Nový stav P1 zatím neobsahuje
geohash ani promo příznaky, které potřebuje levná náhrada Home dotazu.

### Navržená implementace jednoho uceleného úseku

1. Připravit vypnutou verzovanou větev stávajícího getFeedPage: serverový
   výběr metadat, studenou stránku s těly a podepsané doplnění pouze chybějících
   ID. Zachovat starý v1 kontrakt a kurzory. Použít stávající projektový klíč
   s odděleným podpisovým účelem; žádná nová Function ani tajemství. Studené
   načtení prázdné cache má jeden obrat, warm manifest jeden, chybějící těla
   nejvýše jeden navazující obrat. Zachovat dávku 50, přípravný rozpočet,
   hodinový deadline, inkarnaci generace, B3 a skutečné kontroly účtu/blokací/R5.
2. Pro warm validaci použít současné kořeny a potřebné cesty společného
   soukromého indexu. Nečíst navíc 50 publicStates v každém manifestu jen
   kvůli čítačům. Doplnění těla znovu ověří dostupnost a bodyVersion;
   chybějící/změněná metadata se nesmějí vydávat za úplnou platnou stránku.
3. Napojit sdílenou RAM cache projektu/UID a sestavení stránky do skutečného
   gateway/session. V rozpočtu 4 MiB / nejvýše hodina počítat také potřebný
   potvrzený stav; aktualizace čítače neprodlužuje životnost těla. Žádná těla
   do IndexedDB. Při změně účtu, odhlášení či mazání zrušit rozpracované
   přenosy a vyčistit odpovídající cache. Nepřidávat automatické refresh timery
   ani měnit dosavadní synchronizaci přečtení při spuštění/obnově.
4. Připravit společný registry odběrů podle projektu/UID, generace a ID.
   Karta, detail, Mé/Uložené a promo sdílejí malý veřejný stav i existující
   vlastní reakci/záložku. Odebírat pouze používané položky; po uvolnění
   posledního odběratele ukončit stream, při obnově nezakládat duplicitní
   odběry stejných ID. Slučovat monotónní revize a SDK potvrzení, zachovat
   okamžitý optimistický náhled bez dvojího čítače. Neznámý stav není nula.
   Také read-only reconcile po potvrzené akci použije malý stav a vlastní
   reakci/záložku, nikoli původní plné tělo.
5. Jednorázově sdílet zjištění aktuální čitelné card generace, i bez polohy
   v Mé/Uložených. Při vyřazení staré generace jednou bezpečně přesměrovat
   odběry přes serverem potvrzený kontext; stará odpověď jiné inkarnace se
   odmítne. Bez nekonečného retry nebo skrytého návratu k celým rodičům.
   Načtené karty po hodině zůstanou, jejich pořadí se tím nepřestavuje.
6. Nahradit globální Home dotaz ekvivalentním omezeným dotazem na malé stavy.
   Před prvním živým použitím doplnit do dosud vypnuté projekce geohash a
   příznaky businessHighlighted/businessSpotlight, již veřejné v běžném těle.
   Přesná poloha zůstane soukromá. Pro vybrané promo kandidáty serverově
   ověřit aktuální indexová metadata a přesnou vzdálenost; nevycházet z pouhého
   středu geohashe. Těla přes stejnou cache doplňovat jen pro potřebné karty.
   Zachovat výběr globálních 50 před promo filtrem, živé změny promo sekce,
   blokace a hranici 20 km včetně případů na hranici dosahu.
7. Lokálně připravit Rules pro čtení malé projekce oprávněným účtem, jen pro
   udržovanou a připravenou card generaci; list nejvýše 50, zápisy server-only.
   Soukromé uzly/control ani vlastní reakce/záložky jiných účtů neotevírat.
   Při udržování card generace uzavřít i přímé změny commentsCount/savesCount
   u zdrojového Shoutu, včetně navázaných klientských create/delete cest.
   Zachovat současnou kompatibilitu starého control schema 1. Privilegovaná
   klientská role nesmí projít výjimkou; Admin operace se nemění.
8. Připravit potřebný indexový návrh bez TTL a ověřit celý ucelený stav:
   cold/warm/chybějící tělo, nová verze během přenosu, ztracená odpověď,
   neplatný podpis, změna UID/generace, pauza, odpojení, zánik obrazovky,
   expirace/moderace/mazání/R5, detail a více kopií stejné karty, promo,
   potvrzené palce a záložky bez dvojího započtení a bez Uncaught Error.
   Zahrnout Flutter/browser a emulátorové Rules/API testy, dokumentaci,
   aktualizaci stávajících delta-code/check a společný commit/push/úplné CI.

Přepínače serveru i klienta zůstanou vypnuté. Neměnit nyní serverové
stránkování Mé/Uložených; zapojit je do společného živého stavu a zachovat
jejich dosavadní funkčnost. Tato knihovní stránka tedy může dál při otevření
číst zdrojová těla a není součástí tvrzení o nulovém warm source čtení feedu.

### Měření a hranice souhlasu

Porovnat stejný uživatelský průchod na 50/200/2 000 syntetických zdrojích:
manifest a doplnění včetně vstupních kontrol, B2/B3, starý/nový Home a živé
odběry, počáteční doručení, změny čítačů, znovupřipojení, souběžnou kartu/detail,
počet aktivních odběrů, JSON/payload bajty a paměť. Ověřit, že čítač sám
nespouští přenos těla a zachování stejného ID při refresh nezakládá další
plný odběr. Započíst i zápisy P1, závislé Rules kontroly a retry; emulátorový
report není skutečná cloudová faktura ani důkaz kapacity 5 000 relací.

**Pouze lokální implementace, prohlížečové testy proti emulátoru a CI.**
Bez nasazení, živých dat, migrace, nových Auth účtů, nových služeb/klíčů,
Scheduleru, změny prostředků, retence, produkce nebo main. Číslovka novinek
zůstává následný blok. Před živým DEV přechodem doložit přesný stav schématu,
indexů, klientské/Rules kompatibility, migrace a rollbacku; nový datový
kontrakt a čtecí oprávnění nyní nepokrývá původní souhlas s P1.

<a id="p1-results"></a>

## P1 – implementace a ověření

Stav 21. listopadu: implementace i závěrečné úplné CI jsou dokončené.
Tento odstavec není doklad nasazení. Runtime má `cardStateEnabled: false`;
reader ani cloudová data na novou vrstvu nepřešly.

Zdroj **d2cac88313c914f4d4fbf0780f0b0862d77da04e** má
[success úplné CI 44908128699](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44908128699).
Prošlo 419 Flutter, 158 Functions unit (513 emulátorových v unit fázi skip),
464 Rules/transakčních, 9 B4 reader, 14 card/backfill, 34 B2 runtime,
142 purge a 15 Storage testů, browser, analýza, lint, formát i webový build.
SDK reads/writes/attempts/steps se pro všechny tři fixture shodují s lokálním
reportem; JSON bajty serverových timestampů se mohou lišit.

Předchozí CI 44907163960 bylo zrušené po opravě datumové závislosti testu
geografie. CI 44907302349 mělo 464/464 úspěšných Rules testů, ale
pětiminutový limit přerušil vypínání emulátoru, takže zůstalo failure.
Finální workflow má pro tento krok šest minut včetně ukončení. Prostředky
aplikace a Firebase se tím neměnily; důkaz úspěchu je až finální běh výše.

- `feed_card_state.js` sestavuje whitelist živého stavu a monotónní revizi.
  Runtime přebírá skutečné zdrojové snapshoty načtené v téže transakci a
  odmítá odlišný či dodatečně pozměněný plán. Kontroluje chybějící apply,
  chybějící zdrojový zápis, opakovanou mutaci a spolknutou chybu zápisu.
  Revize se připojí k původnímu SDK zápisu zdroje, nikoli dalším zápisem navíc.
  Ochrana platí pro zápisy přes runtime transakci; není náhradou Rules,
  přezkoumání dalších serverových cest nebo budoucího migračního auditu.
- Staré uzly zůstávají v1. Card uzly jsou v2 s bodyVersion/selectionVersion;
  starý verifier je odmítá. Obě verze sdílejí omezený strom a jeho cache,
  oddělené cestou generace a obsahem hashe. Příslušný generační marker je
  v2/readIdentity 1/cardProjection 1; control používá schválené schema 2.
- Komentáře, jejich mazání, záložky, archivace a purge používají společného
  publishera. Tvorba, palce, expirace, skrytí a mazání jej dostávají přes
  stávající indexový runtime. Kompatibilní cesta bez publishera při aktivním
  card control odmítá čítačovou změnu. Staré dosud nenasazené klienty/serverové
  revize tím zpětně chránit nelze; jejich přechod zůstává samostatnou bránou.
- `shout_geography_update.js` dokončí výsledek poskytovatele až po kontrole
  inkarnace zdroje, autora, polohy, aktivního stavu, expirace a deleted markeru.
  Nezavádí nové geokódování ani jeho opakování. Veřejný whitelist těla je
  přesunutý beze změny do feed_public_body, aby planner neměl závislost na hostu readeru.
- `feed_card_backfill.js` má interní begin/step/beginAudit/auditStep, trvalý
  kurzor a půlení příliš velké dávky. Každá dávka čte aktuální zdroj ve své
  transakci; po restartu navazuje na potvrzený kurzor. Nevytváří read aktivaci,
  CLI nebo automatickou migraci. Audit má pevný readTime, dva nezávislé souhrny
  pro veřejné stavy a aktivní index, omezené stránky a verzi jobu. Poškozené
  pokrytí nebo změna retenční revize odmítnou ready. Audit lze explicitně
  restartovat s novým bodem čtení; neúspěch neotevře reader.
- R5 odstraňuje i publicStates autora po nejvýše min(reads, deletes), s týmiž
  Auth-confirmation/inkarnace/lease kontrolami. Kontrola profilu brání jejich
  návratu při pozdějším odpočtu cizího komentáře. V2 historie a GC používají
  odpovídající verifier; původní obsahová retence se nemění.

Lokální sada má 14 scénářů včetně vnořených měření 50/200/2 000. Zahrnuje
skutečné create/comment/delete/save/reaction/expiration operace, archivaci
komentáře a purge záložky, souběh, starší snapshot, R5 s cold restartem,
50/450 ve třech generacích, chybný audit a odmítnutí změněného control.
Samostatný CI krok `test:card-state` má čtyřminutovou pojistku; zátěžový
cloudový test tím není nahrazený. Pro technickou kompatibilitu menších
účtových dávek prošlo také 9 Dart testů a celá flutter analyze bez nálezů.

### Hranice měření a zbývající integrace

Report eviduje skutečné SDK reads, pokusy o zápis a JSON bajty přečtených
dokumentů; nejde o přenosové bajty HTTP odpovědi, cenu nebo SLA. Čistá
čtecí transakce se počítá do attempts stejně jako zapisující. Backfill a
audit jsou jednorázová práce; běžná obnova je od nich oddělená.

[Lokální report](../../benchmarks/FEED_B4_STATE_2026-11-21.json), stejných
50 vybraných karet a shodné vymezení staré/nové čtecí cesty:

| Zdrojů | Původní cold / warm reads | Nové cold / warm header reads | Jedno chybějící tělo navíc |
| --- | --- | --- | --- |
| 50 | 59 / 58 | 59 / 8 | 1 |
| 200 | 63 / 58 | 63 / 8 | 1 |
| 2 000 | 72 / 62 | 72 / 12 | 1 |

Cold v této fixture počet reads nezlepšuje. Warm rozdíl je přesně 50
neopakovaných zdrojových čtení, ne odstranění ostatních kontrol. Samostatná
změna čítače v měřených dvou generacích (stará + card) má 7 reads / 2 SDK
zápisy: zdroj a jeho card stav, bez zápisu stromu. Ostatní operace s
receipt/rate/oznámeními mají vlastní práci navíc. Backfill měl 2/5/41 dávek,
121/463/4 663 reads a 54/225/2 385 SDK zápisů. Report uchovává i samostatný audit.

Připravená čtecí cesta porovnává header v RAM a doplňuje pouze chybějící těla.
Neobsahuje vstupní kontroly volajícího a načtení jeho blokací, platformní
Auth/App Check, B2/B3 synchronizaci, dosavadní Home ani
počáteční doručení živých odběrů. Tyto části nemizí a musí se připočíst při
klientském přechodu. Nová per-Shout vrstva se při obnově nenačítá po 50
dokumentech jen kvůli čítačům. Přidává vlastní stavový zápis a transakční
kontroly; náklady nelze hodnotit jen podle nulových warm source reads.

Před DEV dál zbývá klientský kontrakt a sloučení živého stavu, náhrada
Home/rodičovských odběrů se zachováním promo, Rules proti přímému čítačovému
zápisu, přesný indexový plán a migrační/rollback postup s odvodněním starých
serverových volání. Pro budoucí indexový plán ponechat authorId pro účtový
úklid; monotonní cardRevision/revision a hashe nepotřebují vlastní dotazové
indexy. Zatím se neměnil firestore.indexes.json, TTL ani živé konfigurace.

<a id="client-integration-results"></a>

## Klientské zapojení – implementace a lokální důkazy

Stav 21. listopadu: implementace, lokální kontroly i úplné CI jsou dokončené.
Zdroj **62fc8feb0bbded06c5f116867bbbd61ec0848b5b**, větev
feature/feed-b4-client-integration, má
[úspěšné úplné CI 44917393562](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44917393562).
Nejde o nasazení ani živou akceptaci. `cardStateEnabled` i
`deltaResponsesEnabled` zůstávají false; `serverDeltaFeed` má výchozí false
a žádná konfigurace jej nezapíná. Prostředky a retence se nemění.

- Stávající getFeedPage má oddělený formát delta-v1: výběr, doplnění a
  potvrzený kontext živých odběrů. Nová relace starého klienta dostane
  kompatibilní stránku v1 s plnými těly; již vydané v1 kurzory dál používají
  původní reader a udržovanou starou generaci. Aktivace bude vyžadovat
  zachování obou generací a přesný audit. Nevzniká další Function ani klíč.
- Konečná čtecí transakce znovu ověřuje účet, blokace, autora, R5, aktuální
  hlavičky a verze. Zdrojové Shouty čte jen pro chybějící těla. Kurzory
  nesou odkazy na řádky/uzly, ne souřadnice zdrojů; server si je obnovuje
  z původních neměnných kořenů. Podpis používá oddělený derivát stávajícího
  klíče. Čitelný podepsaný kurzor se nepovažuje za šifrování.
- RAM cache páruje celé tělo a potvrzený stav podle projektu/UID/verze
  a inkarnace generace. Limit je stále laboratorní 4 MiB / nejvýše hodina;
  stavové aktualizace neprodlužují původní platnost. Opožděná odpověď
  nepřepíše novější živou revizi. Změna účtu a potvrzené mazání data odpojí;
  těla se nezapisují do IndexedDB.
- Karta, detail, Mé a Uložené sdílejí jednu kombinaci malého veřejného stavu
  a vlastního palce/záložky. Neznámé vlastní příznaky se nepředstírají jako
  potvrzené nuly; interakce čekají na serverové snapshoty. Po potvrzené akci
  zůstává dosavadní optimistický náhled a reconciliace čte malý stav místo
  celého rodiče. Poslední odběratel vše odpojí; staré události účtu/generace
  a klesající revize se odmítají. Odpojení generace vyvolá nejvýše jedno
  dohledání nového kontextu, nikoli opakující se polling.
- Home v nové větvi odebírá posledních globálních 50 aktivních malých stavů,
  teprve potom filtruje Spotlight. Přesnou hranici 20 km ověřuje server;
  geohash není náhradou vzdálenosti. Podporuje i původní businessPromotion.
  Čítač sám nevyvolá přenos těla. Promo query současně poskytuje stav
  otevřené kartě/detailu a zabrání duplicitnímu dokumentovému odběru;
  při opuštění query převezme stav jednotlivý dokument.
- Nová větev nahrazuje plný Home dotaz a jeho hromadné vlastní interakce;
  vypnutá větev zůstává původní. Formáty knihovních stránek, pořadí,
  odscrollování, promo pravidla a B2 spouštění se nemění. Malá projekce
  přidává veřejný geohash a dva promo příznaky, žádnou přesnou polohu.
- Lokální Rules dovolují get a list nejvýše 50 stavů pouze oprávněnému
  uživateli v udržované ready card generaci. Soukromé uzly/control i cizí
  palce/záložky zůstávají nepřístupné. Ani moderátor/vlastník nemůže stav
  zapisovat. Při udržované card generaci se uzavřou přímé rodičovské čítače,
  komentářové create/delete a záložky; bez ní zůstává stará kompatibilita.
  [Přesný indexový návrh](B4_CLIENT_INDEX_PLAN.json) je pouze návrh: jeden
  složený index, 13 výjimek, žádné TTL; authorId zůstává pro R5. Živý ani
  kořenový firestore.indexes.json se tím nemění.

### Ověření

Nová emulátorová sada má 13 úspěšných testů včetně měření 50/200/2 000,
skutečného Web SDK query/listeneru a Chrome HTTP proti serverové operaci
s Firestore emulátorem. Ověřuje 50 → 100 → 120, rozpracovaný kurzor,
ztrátu spojení při doplnění a retry, blokaci/mazání účtu, R5, změnu těla,
paused stav, starý formát klienta, 20 km a všechny role. Prohlížečový harness
dodává syntetickou identitu přímo serverové operaci: **neověřuje platformní
Auth/reCAPTCHA/App Check ani živou aplikaci** a nezakládá Auth účty.

Devět Dart regresí pokrývá cache, chybějící tělo, změnu účtu/generace,
monotónní živý stav, pozdní odpověď a sdílení 50 karet + 50 detailů.
Zahrnují výměnu synchronizační bariéry po přihlášení jiného účtu; původní
odběr se nesmí přenést do nové relace. Ochrana platí i pro opožděné události
při výměně generace a zániku posledního odběratele.
S deseti překrývajícími promo řádky vznikne 40 veřejných dokumentových
odběrů a po 50 vlastních reaction/save odběrech; další detail je nezdvojí.
Dosavadní testy optimistického potvrzování a scrollu zůstávají součástí
celé Flutter sady. Finální CI potvrdilo 429 Flutter, 83 nástrojových,
159 Functions unit (520 emulátorových skip v unit fázi), 464 Rules/server,
9 reader, 14 card/backfill, 13 nových B4, 34 B2 runtime, 142 purge a 15
Storage testů; browserové sady, lint, analýzu, formát, dokumentaci i webový build.

Předchozí běhy 44915563143 a 44915680084 byly zrušené po doplnění ochrany
opožděných událostí a opravy synchronizační bariéry po změně účtu. Běh
44917243560 selhal pouze na formátu testu; oprava je zahrnutá ve finálním
zdroji. Tyto tři běhy nejsou důkazem dokončení. Rozhodující je success výše.

### Měření bez slibu plošné úspory

[Report skutečných SDK čtení a JSON bajtů](../../benchmarks/FEED_B4_CLIENT_2026-11-21.json)
zahrnuje vstupní kontroly, blokace a B3. Každý požadavek vytváří nový adaptér;
opravené inkarnací/retencí ohraničené sdílení serverových bloků přežije
tento restart adaptéru. Studená, opakovaná a doplňovací cesta jsou oddělené:

| Zdrojů | Cold reads / těla | Warm reads / těla | Doplnění jednoho: reads / těla |
| --- | --- | --- | --- |
| 50 | 80 / 50 | 29 / 0 | 17 / 1 |
| 200 | 83 / 50 | 29 / 0 | 17 / 1 |
| 2 000 | 90 / 50 | 34 / 0 | 18 / 1 |

Stejný Home query má před i po změně 50 dokumentových čtení, ale v této
fixture přibližně 54 kB proti 24 kB JSON. Malá aktualizace čítače přenáší
stav, ne text; těla ani manifest se kvůli ní znovu nestahují. Warm API
odpověď má pořád přibližně 60–62 kB včetně podepsaných kurzorů a metadat;
cold 112–115 kB. **Nulová warm těla neznamenají nulový přenos ani reads.**

B2 se dál spouští při startu/obnově a má vlastní proměnnou práci podle
fronty/pokračování, nikoli pevnou konstantu na stránku. Report navíc měří
skutečné odeslání 50 nových přečtení dvěma uploady (32 + 18), jejich download
a následující B3 obnovu ve stejné fixture: upload má 84 reads / 6 zápisů,
download 15 reads / 1 kvótový zápis a přibližně 11 kB JSON. Nové přečtení
se prokazatelně promítne do pořadí. Pro 200/2 000 zdrojů tím předchozí
první stránku nahradí 50 dalších nepřečtených těl: metadata sama je
nestahují, ale klient je následně potřebuje doplnit (66/67 reads včetně
50 těl). Ani tato práce se nesmí schovat do tvrzení o nulových warm tělech.
Dřívější unit, browserové a emulátorové B2 sady navíc znovu poběží v CI.
P1 report dál eviduje cenu publishera: změna čítače ve staré + card generaci
7 reads / 2 SDK zápisy. Nový report k tomu nepřidává další publisher.
Počty aktivních logických odběrů jsou klientská regrese, nikoli fakturované
reads; Rules závislá čtení, reconnect, síťové rámce, App Check a cloudové
škálování mohou přidat práci. Emulátor neurčuje cenu ani kapacitu 5 000 relací.
Cache rozpočet počítá kódované payload bajty, ne úplnou haldu procesu
včetně kontejnerů, widgetů, SDK a vykreslených karet.

**Další brána:** [konkrétní plán operátoru a DEV přechodu](B4_DEV_ROLLOUT.md)
je připravený k novému lokálnímu schválení. Zahrne společný přechod P1 + klient/Rules,
audit všech zdrojů včetně expirovaných knihovních položek, přesné aktivace,
indexy, odvodnění starých serverových writerů a rollback s udržovanou v1
generací. Současný souhlas živou migraci nepokrývá. Signály a číslovka
novinek zůstávají další implementační blok; celé B4 zatím není uzavřené.
