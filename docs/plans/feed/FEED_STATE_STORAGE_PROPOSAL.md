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
