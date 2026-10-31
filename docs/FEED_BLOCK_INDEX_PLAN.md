# Sdílený prostorový index – lokální návrh a ověření

31. října 2026. **Schválený lokální úsek dokončený; nasazení není součástí souhlasu.**
Vlastník zvolil „Schvaluji lokální návrh a ověření indexu“. Navazuje na
[progresivní feed](FEED_PROGRESSIVE_PLAN.md), jehož přímé geohashové dotazy
v hustém okolí stále načítaly mnoho Shoutů. Nejde o dokončení celého feedu ani
milníku serverové brány. Aktuální DEV rollout a zápisové cesty jsou v [migrační připravenosti](FEED_MIGRATION_READINESS.md).

## Konkrétní schéma prototypu

| Cesta v emulátoru | Obsah |
|---|---|
| `feedIndexLab/{namespace}` | Marker verze a monotónní `prunedThrough` pro členství expirovaných metadat. |
| `.../cells/{geohash4}` | `v`, hash kořenového bloku, revize, celočíselné `latCell` a `lonCell`, `minExpiry` pro objevování úklidu. |
| `.../nodes/{sha256}` | Neměnný obsahově adresovaný blok: verze, cesta stromu, souhrny a potomci nebo list metadat. |
| `.../retiredRoots/{cell-operationId}` | Předchozí kořen, oblast a serverový čas vyřazení; atomicky se změnou aktuálního kořene. |
| `.../source/{shoutId}` | Pouze laboratorní náhrada kanonického dokumentu. V aplikaci zůstane pravdou `shouts/{id}`; druhé plné Shout úložiště není navržené. |

Metadata: ID Shoutu, UID autora, zveřejněná poloha a sedmimístný geohash,
createdAt/expiresAt, kategorie, likes/dislikes, status a Business zvýraznění/Spotlight.
Neobsahují text, titulky, komentáře, soukromé odpovědi, polohu čtenáře ani jeho read stav.
Timestamp z Firestore zachovává i zlomky milisekund, nic se netruncuje na celé ms.

List má nejvýše 64 záznamů a každý blok měřený limit 64 KiB kanonického JSON.
Překročení vyvolá rozdělení. Prostorové bity geohashe se dělí binárně, po
vyčerpání přesnosti se hotspot rozděluje podle stabilního hashe ID. Komprimované
cesty odstraňují zbytečné mezivrstvy. To jsou parametry lokálního modelu,
nikoli limit počtu Shoutů nebo schválená kapacita veřejné aplikace.
Firestore má [limit dokumentu 1 MiB](https://firebase.google.com/docs/firestore/quotas).
Měřený JSON není skutečná velikost proto zprávy, účtovaného úložiště ani index entries.

Adresář používá mřížku odpovídající geohashi délky 4: 1 024 pásů v každé ose.
Okolí se přeloží na jedno obdélníkové okno, přes ±180° na dvě. Přesný okruh a
vzdálenosti se kontrolují nad metadaty; okno není náhradou kruhu. Testované jsou
hranice a přesné póly. Čtení adresáře potřebuje složený index `latCell ASC, lonCell ASC`.
Pro skutečný dataset se má přes Query Explain ověřit selektivita a případná
opačná varianta pořadí. [Dvě rozsahové podmínky mohou účtovat index entries](https://firebase.google.com/docs/firestore/query-data/multiple-range-fields).
Emulátor neověřuje existenci potřebného produkčního složeného indexu.

Bloky se čtou podle document ID, takže jejich payload nemá být automaticky
indexovaný. Výjimky pro pole bloků a konkrétní produkční názvy kolekcí jsou součástí
přípravy před nasazením; `firestore.indexes.json` ani Rules se nyní nezměnily.

## Aktualizace a konzistence

`functions/feed_block_index.js` definuje projekci, rozdělování a copy-on-write
plán stromu. `functions/feed_block_index_lab.js` jej připojuje k Firestore.
Adaptér odmítá jakýkoliv projekt jiný než `shoutout-rules-test` a vyžaduje přesný
lokální emulator host. Neexportuje se jako callable a není připojený do současných
obsahových operací. Nemůže se tímto postupem provést živý backfill.

Laboratorní mutace čte zdroj a dotčené cesty, potom v jedné transakci zapisuje
zdroj, nové bloky a kořenové ukazatele. Změna oblasti aktualizuje oba kořeny
atomicky. Staré bloky se nepřepisují. Výjimka před commitem vrátí celý zápis;
souběžné inserty do stejné oblasti se neztratily. Nezměněná metadata nevytvoří
novou verzi. Audit umí porovnat aktuální strom se všemi aktivními zdrojovými metadaty
bez opravy dat a rozlišit aktuální a historické bloky.

Výběr zachytí adresář v read-only transakci, potom čte jeho neměnné bloky.
Test s vložením příspěvku mezi dvěma dotazy přes dateline vrátil konzistentní
původní stav; nový výběr viděl nový příspěvek. Pozdější změny proto nepřehází
rozpracované stránky. Starý snapshot může obsahovat již smazané ID: před vrácením
veřejné karty je nutná kontrola aktuálního zdroje a oprávnění na serveru.
Testovaná hydratace vrací pro smazání, ztrátu kategorie, Spotlight dostupnosti
nebo expiraci pouze nedostupnost, ne stará metadata karty.

Současné `mutate` je samostatná laboratorní transakce, ne hotový hook pro vložení
do existující vnější transakce. Při integraci se musí plánovač zapojit do téže
transakce jako obsah, ověřování a potvrzení operace; nesmí vzniknout dvě nezávislé
transakce nebo pouze pozdější trigger vydávaný za okamžitou konzistenci.

## Výběr a sdílení cache

Dva prioritní zásobníky řídí dosud neprohledané větve a dostupné kandidáty.
Souhrn větve dává bezpečně optimistickou mez pro vzdálenost, Top nebo expiraci.
Položka se vydá až tehdy, když nemůže být předběhnutá neprohledanou větví.
Testy pokrývají celé pořadí všech stránek ve všech čtyřech režimech.
Nepřečtené mají přednost jen v Nejblíž; soukromé Sety jsou oddělené pro každý view.
Nízké hodnocení má explicitní přepínač zachovávající dosavadní chování A;
jeho priorita vůči read skupinám před B3 zůstává samostatnou produktovou volbou.
Spotlight mimo obecný feed nadále potřebuje vlastní transport.

Cache klíč obsahuje projekt, namespace a hash neměnného bloku. Může se sdílet
mezi uživateli bez jejich polohy/read historie. Každá obnova přesto ověří aktuální
adresář; nová revize má jiný hash a nemůže se zaměnit se starým payloadem.
Cache je místní procesu, nikoli globální cache všech instancí Functions.

Výchozí experiment: nejvýše 4 MiB serializovaných payloadů a 1 024 položek,
LRU evikce. Nejde o tvrdý limit RSS/JS heapu nebo celé relace. Původní kapacita
256 položek v paměťovém testu 10 000 malých metadat způsobila úplné vytlačování
cache, proto byla opravena; 497 bloků / 2 955 200 B se nyní vejde a druhý průchod
má nula missů. Tento test proběhl jen v RAM, nevytvářel 10 000 Firestore příspěvků.
Delší UID/ID, kategorie a větší pracovní oblast mohou mít jiný výsledek; plná cache
není funkční chyba, ale zvedá další čtení. Nulové missy nejsou univerzální slib.

Chybějící bloky se sdružují do `getAll`, při procházení až po osmi podle dostupného
pracovního rozpočtu. Kód ověřuje horní mez nově načtených i zpracovaných uzlů
v jednom kroku; `preparing` není konec feedu. Prefetch indexových bloků může
zvýšit počet čtení a objem proti nejmenšímu možnému průchodu, ale snížit RPC.
Nejde o načtení dalších celých karet ani o další frontendovou stránku navíc.

## Naměřené čtení první stránky

Node 22.23.4 a Firestore emulátor, stejné syntetické dokumenty pro oba postupy.
Referenční adaptér přímých geohashových dotazů čte tatáž laboratorní source data;
jen časový tvar je přeložen na jeho Timestamp rozhraní. Pořadí prvních 50 je
porovnané s úplnou referencí. Uvedené počty zahrnují minimum prázdného dotazu
u přímé varianty a její úvodní readTime čtení. Nejsou převzaté z odhadu faktury.

| Vzorek | Přímé geo: hledání | Index studený | Index teplý | Hydratace karet | Celkem přímé → studené / teplé |
|---|---|---|---|---|---|
| 300 / grid300 | 285 | 18 | 2 | 50 | 335 → 68 / 52 |
| 75 / allRead75 | 114 | 4 | 1 | 50 | 164 → 54 / 51 |

V prvním vzorku se dopředu načetlo 16 bloků / 90 848 B; pro vlastní řazení se
prošlo 141 metadat. Za studena to bylo sedm batch RPC pro uzly místo šestnácti
samostatných; za tepla žádné. U 75 přečtených to byly tři bloky ve dvou RPC,
za tepla opět žádné uzlové RPC. Adresář a hydratace se počítají zvlášť.
Validace/serializace bloků také pracuje s jejich obsahem, nejen se záznamy
započtenými do rankingového čítače `metadataExamined`.

Server stále může při hledání nepřečtených projít mnoho malých metadat v RAM.
Rozdíl je v počtu databázových dokumentů, celých načtených karet a sdílení mezi
uživateli. Zejména studený velký all-read hotspot může stále trvat déle;
cloudová latence a throughput nejsou změřené. Toto není slib okamžité odezvy.

Tabulka srovnává nové správné výběry, nikoli účet aktuální živé aplikace,
která stále načítá nejvýše 50 globálně nejnovějších. Nezahrnuje účtované index
entries, Auth/App Check, ostatní oprávnění, živé odběry, přenos a výpočet Functions,
retry, migraci, audit ani úklid. Hydratace v testu načítá metadata fixture source,
ne skutečné texty/obrázky karet; dokumentové operace jsou měřené, velikost přenosu
skutečné aplikace ne. [Účtování Firestore](https://firebase.google.com/docs/firestore/pricing).

## Zápisy, úložiště a zbývající cenový model

Ve vzorku 80 příspěvků byly navíc k laboratornímu zdroji tyto indexové operace:

| Změna | Nové/verzované bloky | Adresář | Čtení celé lab mutace |
|---|---|---|---|
| Reakce | 2 | 1 | 5 |
| Vytvoření | 2 | 1 | 5 |
| Znepřístupnění | 2 | 1 | 5 |
| Změna oblasti, technický test | 3 | 2 | 6 |
| Stejná metadata | 0 | 0 | 2 |

Každá skutečná změna měla v labu navíc jeden source zápis, který simuluje
kanonický zápis. První dvě čtení zahrnují zdroj a guard verze lab datasetu.
Nejde o úplný účet současných callables s jejich rate limity, potvrzeními a dalšími
zápisy, ani o přesně tolik nových čtení po zapojení do již probíhající transakce.
Ve druhém vzorku 160 položek reakce potřebovala tři bloky a jeden adresář;
rozštěpení listu, hloubka i konflikt/retry mohou cenu změnit. Komentáře/saves
neovlivňují projekci řazení; samotná změna takových čítačů nepotřebuje nový indexový
payload. Jejich skutečné kanonické aktualizace tím samozřejmě nezmizí.

Při 300 položkách vzniklo 16 uzlů / 90 848 B JSON, největší 17 807 B.
75 položek potřebovalo tři uzly / 21 356 B. Po několika změnách 80položkového
vzorku bylo v úložišti 12 verzovaných uzlů / 70 054 B. Jde jen o obsah uzlů;
chybí velikost adresáře, systémová metadata a skutečné indexy Firestore.

Cena za období se má sestavit z R hledání + R hydratace + R index entries +
R živých odběrů a oprávnění + R/W aktualizací + R/W/D úklidu + uložené verze +
přenos a Functions. Teplý pracovní set, podíl cold startů, četnost reakcí a počet
načtených stránek jsou vstupy modelu, nikoli automatické konstanty. Rozpočet
5 000 Kč nelze převést na garantovaný počet návštěvníků z těchto dvou vzorků.

Lokální protokol historie a úklidu je doplněný podle schváleného R4:
relace platí pevně **1 hodinu od otevření/obnovy**, další stránka dobu neprodlužuje.
Po expiraci zůstanou načtené karty, pokračování vyžaduje obnovu. Osobní přečtení,
uložené Shouty, 7denní potvrzení operací ani 60denní požadavky mazání se nemění.
Detaily, meze a výsledky jsou v [ověření retence indexu](FEED_INDEX_RETENTION.md).
Jde stále o lokální model, nikoli nasazený worker nebo zapojené UI.

## Novinky podle změněných bloků

`indexChanges` přeskočí shodné hashe a porovnává změněné větve. Ve 160položkovém
vzorku reakce změnila jeden záznam, nevydala nové publikace; bylo potřeba šest
studených uzlových čtení / 68 porovnaných metadat. Následná publikace potřebovala
čtyři nová uzlová čtení / 97 metadat a přesně jedno přidané ID. Bez změny hashe
se nepřečetl žádný uzel. [Přesná naměřená data](benchmarks/FEED_BLOCK_INDEX_2026-10-31.json).

To je interní delta indexu, ne hotové číslo tlačítka. Před UI je nutné zohlednit
přesný okruh, blokace, čas, přístupy a schválený význam nově dostupného obsahu.
Expirace může nastat i bez změny hashe. Časování pollingu ani započítání staršího
obsahu nově zpřístupněného moderací se tímto nerozhoduje.

## Konkrétní návaznost před živým napojením

1. Lokální protokol historie/GC a expirovaných metadat je ověřený; před provozem
   určit rozpočet, frekvenci a kapacitní chování workeru, trvalé checkpointy a obnovu
   po přerušení procesu. R4 určuje hodinovou relaci; veřejné API/UI zbývá napojit.
2. Vyjmenovat a zapojit všechny změny indexovaných polí do stejných transakcí:
   createShout, reakce Shoutu, vlastní/moderátorské odstranění, dostupnost,
   související account worker. Zápisy ignorující index nesmějí zůstat povolenou
   cestou. Právě nyní nejsou všechny tyto cesty serverové; nejprve dokončit potřebné
   obsahové operace a ověřit regrese, teprve pak plánovat uzavření jejich Rules.
3. Zkontrolovat skutečné historické ID, statusy, geohash, souřadnice a timestampy.
   Neplatné projekce hlásit v dry-run, ne potichu vynechat. Návrh migrace použije
   oddělenou generaci indexu a zachytí souběžné změny; starý snapshot nesmí přepsat
   novější dual-write. Žádný takový live backfill ani migrační nástroj se nyní nespouští.
4. Předložit konkrétní produkční schéma/názvy, složené indexy a výjimky payloadu,
   úplné náklady včetně archivace/GC, bezpečnostní a retentní hranice. Vlastník
   schválil pouze tuto lokální přípravu, nikoli nové živé kolekce nebo migraci.
5. Připravit zabezpečené query API (Auth/App Check, UID/kontext kurzoru, celkové
   limity/čas), hydrataci a kontrolu dostupnosti ještě před veřejnou odpovědí.
   Při ztrátě oprávnění/expiraci zachovat pořadí kotvou či tombstonem, ne vracet
   starý obsah z indexu. Aktuální lab view/cursor jsou objekty v RAM, ne HTTP protokol.
6. Po schválení konkrétního DEV rozsahu provést Query Explain, měřit latenci,
   cache working set a všechny režimy, teprve poté napojit klientský koordinátor,
   prefetch/scroll a B1–B4. První veřejné vydání nadále čeká na celé MVP.

Ověření: deset nových unit testů (včetně 10 000 metadat pouze v RAM) a devět
emulátorových testů, všechny čtyři režimy a stránky proti úplné referenci,
rollback, souběžné inserty, pohyb mezi oblastmi jako technický test, read izolace,
byte/entry cache limity, změny dostupnosti a odmítnutí poškozeného bloku.
Testy jsou v běžné Functions sadě a `tools` skriptu `test:rules`. Lokální dataset
se po testu uklízí. Živé sbírky, hosting, Functions exporty a main se neměnily.
