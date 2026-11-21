# B4 – provozní vrstva obsahu a živého stavu

[Rozcestník feedu](README.md) · [Výsledky readeru](FEED_DELTA_REFRESH_PLAN.md#b4-read-local-results)

Návrh k 21. listopadu 2026. **Čeká na schválení implementace.** Nejde o
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
