# Úsporná obnova feedu, cache a indikátor novinek

12. listopadu 2026. **Vlastník schválil začlenění tohoto směru do B2–B4 před
MVP a přípravu společného návrhu nyní.** Tento dokument je plán, nikoli hotová
implementace nebo schválení libovolného schématu, služby či živé migrace.
Pořadí je příprava kontraktu → B2 → B3 → B4. Technické varianty níže vyžadují
ověření v konkrétním implementačním úseku. Nevzniká další samostatný milník.

[Etapy](FEED_IMPLEMENTATION_STAGES.md) · [aktuální politika přečtení](FEED_READING_POLICY.md#refresh-boundary-policy)
· [kapacitní model a výsledky](../../operations/CAPACITY_AND_SCALING.md)

## Cíl a ověřený výchozí stav

<a id="automatic-radius"></a>

### Automatický dosah – schválený úsek 22. listopadu

Vlastník schválil přípravu až 50 vhodných Shoutů, rozšíření podle potřeby
nejvýše do 50 km a nabídku rozšíření při prázdném ručně zvoleném okruhu.
Současný serverový index již certifikuje stránku podle pořadí a prostorových
mezí; není potřeba zavádět nové kolekce, dotazy pro každý mezikruh ani nový
serverový kontrakt. Nepřečtené zůstávají před přečtenými; ostatní režimy si
zachovávají vlastní řazení. Příprava správných 50 karet může prověřit více
než 50 metadat, zvláště při dokazování konce nepřečtené skupiny.

Konkrétní klientské chování:

- Nová prostorová relace Home začíná v režimu **Auto (max. 50 km)**. První
  stránka používá jediný kontext radiusKm=50 a stávající podepsané stránkování.
  Existující přípravné pokračování, dávky 50, prefetch jedné stránky,
  synchronizace B2, cache těl i kontrola dostupnosti zůstávají stejné.
- Zobrazený údaj „Načtené Shouty do X km · automaticky až 50 km“ odvodí X
  od nejvzdálenější dosud načtené karty a zaokrouhlí nahoru na stávající
  nabídku 1/3/5/10/20/50. Jde o pokrytí výsledků, nikoli zúžení podepsaného
  kontextu: nové publikace/číslovka i další stránky mají stále strop 50 km.
  Tím změna zobrazeného X nevyvolává nový feed ani nepřehazuje scroll.
- Ruční volba je pevný filtr. Pouze po úspěšně dokončeném prázdném výsledku
  pod 50 km nabídnout „Hledat ve větším okolí?“ / „Hledat až do 50 km“.
  Kliknutí přepne do Auto, zachová kategorii i řazení. Při chybě, čekání na
  další stránku nebo chybějící poloze prázdné okolí netvrdit.
- Ruční filtr se nepřepisuje během čekání. Nová relace i volba dosahu se
  potvrdí společně až po úspěchu; neúspěch zachová dosavadní obsah/filtr.
  Volba trvá v otevřené relaci Home, stejně jako dosavadní filtry; nová
  trvalá preference ani ukládání polohy nevzniká.
- Starší cesta bez serverSpatialFeed zůstává na dosavadním ručním dosahu.
  Promo si zachovává nezávislou stávající hranici. Žádné Functions, Rules,
  indexy, infrastruktura, retence nebo prostředky se tím nemění.

Ověření: šest nových policy/gateway/widget scénářů a dosavadní prostorové,
stránkovací a řadicí regrese – 38 různých testů prošlo. Příklad 25 položek do 20 km
a dalších 175 do 50 km vrací 25 + 25; další stránka používá pouze kurzor,
přednačtení nepřipojí karty předčasně. Widget ověřuje souhlas, nezměněné
filtry, chybu oproti prázdnému okolí a změnu Auto → ruční. Doplněná kontrola
320px obrazovky pro všechny podporované jazyky ve světlém/tmavém vzhledu
prošla. Místní úplná sada před touto poslední kontrolou měla 461 úspěšných
testů; konečná analýza bez nálezů a formát bez změn. Dokončené místní
ověření není důkaz cloudové latence; delší čekání po Offline zatím změřené není.
Podklady: test/feed_automatic_radius_test.dart, lib/src/feed.dart,
lib/src/home.dart a build/feed-automatic-radius-regression.log.

Zbývá přesné úplné CI, DEV Hosting a živé ověření na existujících A/B pilotu.
Nový seed ani Auth účty nejsou potřeba. Přesný cíl je projekt/site
shoutout-dev-46c81; produkce/main se nemění. B4b badge/pauza/návrat/úklid
zůstávají samostatně otevřené. Stávající nedokončená finální feed váha se dělí
na Auto implementaci/ověření/nasazení/akceptaci a původní závěrečnou regresi;
žádná hotová váha se nemění a rodiče zůstávají na 10 000.

**Aktualizace 22. listopadu:** [B4b je nasazené a aktivní v DEV](B4_DEV_ROLLOUT.md#news-dev-rollout-results),
20206c4 / úplné CI 44959541907 success. Funkce, indexy, Rules a Hosting
ca327f10112ef349 jsou ověřené; news control 2/active, feed control 12/feed-v3.
Živý pilot má A i skutečně publikovaný B, čeká společná akceptace
včetně pauzy/návratu a úklidu. Celé B4 není uzavřené. Datované vypnuté
konfigurace níže jsou předchozí přípravné checkpointy.

**Aktualizace 20. listopadu:** B2 i B3 mají uzavřenou DEV akceptaci včetně
úklidu testovacích dat. [B3 – konečné důkazy](B3_DEV_ROLLOUT.md#b3-acceptance-complete)
zahrnují skutečné přečtení a řazení, obě identity, interakce i mazání.
Další je konkrétní návrh B4: verze/metadatové porovnání a delta/cache,
potom úsporné signály a číslo nově příchozích Shoutů. Technické schéma,
čerstvost/slučování a provozní náklady před implementací konkretizovat;
samotné uzavření B3 je neurčuje. Datované přípravné checkpointy níže jsou historie.

**Aktualizace 21. listopadu:** serverová vrstva i
[klientské zapojení metadat/cache a malého živého stavu](FEED_STATE_STORAGE_PROPOSAL.md#client-integration-results)
mají uzavřenou lokální implementaci a úplné CI. Nová vrstva zůstává vypnutá;
další je řízený DEV přechod, potom signály a číslovka. Celé B4 není uzavřené.

**Pozdější stav 21. listopadu:** [metadata/cache B4 mají uzavřenou DEV akceptaci a úklid](B4_DEV_ROLLOUT.md#delta-acceptance-complete).
Navazující [lokální B4b](#b4b-local-proposal) je schválený a jeho
[výsledky a návrh četnosti](#b4b-local-results) jsou níže; živé signály ještě neběží.
Navazuje [konkrétní provozní návrh ke schválení](#b4b-runtime-proposal);
vlastník následně schválil celý lokální implementační úsek. Jeho
[aktuální výsledek](#b4b-runtime-results) stále neznamená živou aktivaci.

<a id="b3-local"></a>

### B3 — schválený lokální úsek, 19. listopadu 2026

Vlastník schválil lokální serverovou a klientskou implementaci, testy,
dokumentaci, společný commit/push a CI. Následně upřesnil výsledné chování:
v Nejblíž nejprve nepřečtené podle vzdálenosti, potom viditelný oddělovač
**Přečtené** a dosud platné přečtené opět podle vzdálenosti. Během scrollování
se již připravené pořadí nemění. Teprve úspěšná obnova založí nový výběr
a vrátí scroll nahoru; selhání zachová původní seznam i jeho pozici.
Top, Končící a Sledované přečtení nepoužívají jako řadicí klíč.

Číslovka na plovoucí obnově znamená **nově příchozí relevantní Shouty v okolí**,
nikoli počet všech nepřečtených. Její detekce a přenos rozdílů patří do B4;
tento úsek číslovku ani polling nezapíná.

Lokální implementace:

- Klientská volba `serverUnreadFeed` chybí v obou provozních konfiguracích,
  tedy zůstává false. Při budoucím zapnutí vyžaduje DEV prostorový feed a B2.
  Obnova v Nejblíž čeká na úplné dokončení zachycené B2 hranice; neúplný
  upload/download, pozastavení nebo změna účtu nevytvoří novou baseline.
- Interní `getFeedPageOperation` přijímá pouze od důvěryhodného hostitele
  volbu `readOrdering`; výchozí hodnota je null a živý wrapper ji nemění.
  Klient nemůže posílat vlastní seznam read ID ani zapnout toto řazení.
- Volitelná indexová projekce přidává `contentHash` relevantního nadpisu/textu.
  Generace musí mít serverový marker `readIdentity: 1`; starý a nový režim
  se nesmějí míchat. Každý odpovídající writer počítá otisk ze zdroje ve stejné
  transakci jako ostatní metadata. Dosavadní generace a writery zůstávají
  beze změny za výchozí false. Samotný tento kód nemigruje živý index.
  Společný otisk je v `read_content_identity.js`; účtový balíček tím nezískává
  závislost na soukromém read-block kodeku ani callable hostiteli.
- `feed_read_snapshot.js` zachytí revizi B2 ve stejném historickém readTime
  jako prostorový index. U prostorově relevantních metadat dohledá pouze
  jejich hashové cesty v již existujících soukromých blocích B2. Neprochází
  celou historii účtu, nepřidává kolekci relací, nečte texty všech kandidátů
  a nic nezapisuje. V rámci jednoho požadavku sdílí načtené bloky a dávkuje
  společné cesty. Historický stav dovolí bezpečné opakování i cold restart.
- Hostitel může předat stávající omezenou cache neměnných bloků. Klíč obsahuje
  projekt, UID a přesné readTime, takže cizí účet ani nová obnova nedostanou
  starý osobní stav. Laboratorně je použitý existující profil 4 MiB / 1 024
  položek / nejvýše 1 hodina. Evikce, jiná instance či restart znamenají nové
  historické čtení, nikoli změnu výsledku. Živý wrapper cache nezapíná.
- Podepsaný kurzor obsahuje revizi/politiku, nikoli kompletní osobní historii.
  Skupina vybraných karet je zmrazená. Změna nadpisu/textu při hydrataci
  odstraní tuto kartu ze staré stránky; nový snapshot ji zařadí podle nového
  otisku. Palce otisk ani značku přečtení nemění.
- Laboratorní budget je explicitních nejvýše 256 read bloků na požadavek;
  není to schválený produkční limit. Překročení vrátí rozpoznatelnou chybu
  `feed-read-work-budget` bez částečné stránky nebo zápisu. Dosavadní limity
  prostorových kroků, maximálně 50 karet a hodinové relace zůstávají.

Před živou aktivací zbývá doložit výsledky a navrhnout společný přechod
generace/writerů/čtecího hostitele i návrat. Nejde o pouhé zapnutí webového
flag. Tento lokální souhlas nepovoluje backfill, novou živou generaci,
testovací obsah, Auth účty ani nasazení. Kapacita 5 000 aktivních relací
není emulátorovými výsledky prokázaná.

<a id="b3-local-results"></a>

Lokální kontroly prošly: 62 širších emulátorových regresí prostorového indexu,
writerů, runtime, B2 a stránek; po poslední úpravě dalších 17 cílených testů
API/cache včetně opakování, obsahové změny, rollbacku, skrytí a pracovního
rozpočtu. Klient má 80 cílených Flutter testů; analyzátor bez nálezů, ESLint
bez nálezů, 23 cílených unit/tools testů a 82 testů celého nástrojového balíčku.
První CI 44418757494 správně zastavila změna modulového grafu v testu
balení Functions; oddělení čistého otisku od read-block kodeku je opravené
a lokální kontrola obou skutečných artefaktů prošla. Celé místní Functions unit
má 135 úspěšných testů a 464 integračních přeskočených mimo emulátor.
Tyto skupiny se mohou překrývat;
nejde o součet unikátních scénářů celé aplikace.

Zdroj **c2cdb48aedcd0584eeb675935b4694af8b46701e** má
[success úplné CI 44419427913](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44419427913).
Ověřené jsou všechny aplikační kroky včetně browserových testů, serverových
transakcí a Rules, B2 runtime, účtového purge, Storage a sestavení webu.
Lokální kód a automatické ověření B3 jsou tím uzavřené; skutečná aktivace
a živá akceptace B3 zůstávají otevřené. Commit e7acea0 obsahuje jádro,
c2cdb48 navazující opravu modulového grafu; oba jsou ve feature/feed-b3.

| Laboratorní scénář | Celá těla stránky | Soukromé blokové reads | Poznámka |
|---|---:|---:|---|
| 120 Shoutů / 70 přečtených, stránky 50 + 50 + 20 | 50 / 50 / 20 | 1 / 0 / 0 | Vzdálených 50 nepřečtených před všemi blízkými přečtenými. |
| 10 000 značek v jiném dni expirace, 50 kandidátů | 50 | 1 | Cizí časový blok historie se vůbec neprochází. |
| 10 000 značek ve stejném dni, 120 kandidátů, první stránka | 50 | 190 | Studené dohledání v 16 dávkách; historie má 255 bloků. |
| Další stránka téhož snapshotu ve stejné cache | 50 | 0 | 190 cache hitů; jiná instance by měla studenou cestu. |

Jde o komponentové počty SDK dokumentových operací, **nikoli celkovou fakturu**:
nezahrnují veškerá Auth/actor/control čtení, účtované indexové položky, provoz
Functions, síť ani jiné služby. Prostorové metadata se v uvedených stránkách
stále vyhodnocují; B4 delta/reuse indexů není touto cache hotové. Poslední
scénář ukazuje dražší studenou cestu a závislost úspory na dostupnosti cache;
nelze z něj odvodit splnění cíle 5 000 aktivních relací. Před rolloutem vyhodnotit
tento náklad a návrh přechodu generace. Lokální logy a JSON shrnutí jsou společně
v `build/b3-local/`; trvalé reprodukovatelné regrese jsou ve zdrojových testech.

Živé B3 ani B4 není nasazené a tato část je neoznačuje za hotové v DEV.

### Výchozí stav před lokálním B3

Cíl je přenášet celé Shouty jen tehdy, když je klient potřebuje a ještě nemá
jejich platnou verzi. Nejprve porovnat omezená metadata/verze bloků, potom
načíst potřebná těla. Zachovat všechny čtyři režimy, stabilitu relace,
správnost pořadí a dosavadní oprávnění. Kapacitní cíl celé aplikace je
100 000 účtů / 5 000 současně aktivních uživatelů, zatím bez důkazu cloudového výkonu.

Ověřené v kódu při přípravě tohoto plánu:

- `get_feed_page.js` přijímá kontext nebo podepsaný kurzor, nikoli manifest
  klientských verzí. Při obnově vytváří nový snapshot a načítá těla vybrané stránky.
- `feed_block_index_store.js` má obsahově adresované bloky a malé kořeny
  oblastí. `metadataOf` neobsahuje nadpis/text; hash nynějšího uzlu tedy není
  verzí celého obsahu karty. Kořen se mění také při reakcích a mazání.
- Klient drží načtené karty, deduplikuje ID, připravuje další stránku a při
  úspěšné obnově atomicky mění relaci. Porovnání klientské cache není zapojené.
- B1 a od 17. listopadu také B2 jsou zapojené v DEV; B2 má od 18. listopadu
  [uzavřenou živou akceptaci a úklid](B2_DEV_ROLLOUT.md#b2-acceptance-complete).
  [Ověřené nasazení](B2_DEV_ROLLOUT.md#dev-rollout-results)
  nahrazuje původní výchozí stav lokálního jádra. B3/B4 hotové nejsou, číslo
  novinek není připojené k živému backendu. Přesné zdroje/CI/nasazení určuje
  [PROJECT_STATUS](../../PROJECT_STATUS.md), ne existence tohoto návrhu.

## Společný kontrakt před další implementací

<a id="b4a-proposal"></a>

### B4a — konkrétní návrh prvního lokálního úseku, 20. listopadu

**Stav: připravený návrh ke schválení, žádná B4 implementace ani aktivace.**
Navazuje na uzavřenou B3 akceptaci a zdrojový checkpoint 2878782. Vlastník
schválil pokračovat přípravou B4; níže vymezená změna serverového/klientského
kontraktu a laboratorní projekce ještě nemá konkrétní implementační souhlas.

#### Co ověřil průzkum současného kódu

- `functions/get_feed_page.js` po výběru stránky volá `hydratePortable`.
  `functions/feed_block_index_store.js` v tomto kroku čte každý vybraný zdroj
  pomocí getAll. Opakovaná plná stránka tedy znovu znamená až 50 zdrojových
  SDK čtení, i když klient už všechna těla má; vedle toho běží ostatní kontroly.
- `metadataOf` v `functions/feed_block_index.js` obsahuje geometrii, status,
  řadicí údaje a B3 `contentHash` nad title/text. Neobsahuje verzi celé přenášené
  karty ani commentsCount/savesCount. Existující hash proto nelze vydávat za
  úplnou validaci cache veřejného těla karty.
- `lib/src/spatial_feed.dart` a detail mají dokumentový živý odběr `shouts/id`;
  `_startFeedListeners` v Home spouští i při prostorovém feedu původní globální
  dotaz na 50 aktivních dokumentů, mimo jiné jako zdroj promo karet.
  Pouhé zkrácení callable odpovědi tyto cesty neodstraní. Rozpočet a měření
  musí zahrnout i je; před náhradou zachovat promo, vlastní a sledované sekce.
- Komentáře a záložky dnes mění čítače rodiče bez řadicího index writeru.
  Totéž musí nová stavová projekce pokrýt u archivace/purge komentáře.
  Geografické obohacení ve zdrojovém `functions/index.js` zapisuje geography
  přímo. Nová verze celého těla musí zachytit i tuto cestu; sama B3 ji nepotřebovala.
- Engine už má porovnání neměnných kořenů `indexChanges`, ale jde o interní
  rozdíl indexových metadat mezi kompatibilními views. Není to nasazený
  přenositelný delta protokol, aktuální kontrola dostupnosti ani osobní počet novinek.

Firestore dokumentuje počáteční snapshot a další události při změně dokumentu;
RPC protokol navíc rozlišuje úplný stav a případné maskované změny. Proto
neodvozovat skutečné síťové bajty jen z velikosti callback objektu, ani bez
měření slibovat, že každá událost přenáší všechny bajty těla. Současný kód
nicméně nemá vlastní oddělený kompaktní stavový odběr ani body reuse kontrakt.
Primární reference: [listeners](https://firebase.google.com/docs/firestore/query-data/listen),
[DocumentChange/DocumentMask](https://docs.cloud.google.com/firestore/docs/reference/rpc/google.firestore.v1#documentchange).

#### Doporučený výsledný kontrakt k lokálnímu ověření

1. **Tělo a stav oddělit.** Navržená `bodyVersion` je serverově odvozený SHA-256
   kanonické, verzované serializace všech statických veřejných polí dnešní
   `publicFeedBody`: text/nadpis, kategorie v renderovaném pořadí, autorův
   snapshot/avatar, geografická a Business prezentace, časy. Čítače, aktuální
   dostupnost a osobní reakce/záložka patří do stavové části. Existující B3
   contentHash/read markery se nemění při pouhé změně prezentace nebo čítačů.
2. **Nejdřív vybrat, potom doplnit chybějící těla.** Server určí stejné pořadí
   a nejvýše dnešních 50 descriptorů ID + bodyVersion + drobný stav + read skupina.
   Klient je porovná se svou RAM cache; zdrojová těla se načtou jen pro chybějící
   či odlišné verze. Složená stránka se potvrdí atomicky, nikoli po kusech.
   Při prázdné cache porovnat přímou studenou cestu s dvoufázovou; nevnucovat
   druhý síťový obrat každému prvnímu otevření. Do požadavků neposílat neomezený
   seznam všech dříve viděných ID. Podpis výběru musí vázat projekt, UID, generaci,
   kontext, pořadí, verze a původní deadline; není náhradou nového ověření přístupu.
3. **Dostupnost ověřit před reuse i po síťových čekáních.** Zachovat Auth/App Check,
   blokace, aktuální status/expiraci, B3 read snapshot a R5/60denní fence. Shodný
   hash neopravňuje zobrazit nově zakázaný obsah. Změna mezi výběrem a doplněním
   vrátí bezpečně chybějící/změněnou položku nebo vyžádá novou obnovu; nesmí
   označit jiné tělo starou verzí ani vyrobit neúplnou hotovou stránku.
4. **Aktuální metadata musí stačit bez čtení všech těl.** Laboratorně porovnat
   rozšířenou blokovou projekci celého těla s variantou doplněnou o malý
   serverový stavový dokument bez textu u každého Shoutu. Kandidát stavového
   dokumentu obsahuje verze, authorId, status/expiry a veřejné počty; osobní
   reakce/záložky zůstanou soukromé v dosavadních cestách. Jedna další položka
   na Shout může šetřit přenos živých dat, sama nesnižuje počet dokumentových reads.
   Výstup musí doložit součet čtení, zápisů i přenosů a potřebné změny Rules,
   ne automaticky doporučit další dokument jen kvůli jeho menší velikosti.
5. **Jedna atomická zápisová cesta.** Prototyp plánu musí zachovat zdroj, obsahové
   verze, stav a případný index ve stejné transakci, včetně mazání, expirace,
   účtových odpočtů/archivu/purge a geografie. Replay ani zápis shodných hodnot
   nesmí vytvářet další verze/zápisy. Nepropisovat každé zvýšení comments/saves
   do drahé řadicí stromové struktury, pokud výběr neovlivňuje.
6. **RAM cache a bezpečné doplnění.** Oddělit projekt/UID, žádné nové trvalé
   ukládání textů do IndexedDB. Laboratorní kandidát je 4 MiB na body cache,
   položka nejvýše po dobu existující hodinové hranice; nejde o limit celé
   paměti aplikace ani schválený produkční parametr. Evikce pouze vyvolá
   doplnění těla, nesmí odstranit načtené karty nebo měnit pořadí. Změna účtu
   či potvrzená žádost o smazání vyprázdní cache a ohradí opožděné odpovědi.

#### Konkrétní první implementační rozsah ke schválení

Ucelený **lokální B4a základ**: čisté serializační/verzovací helpery a kontrakt
výběr/doplnění, Dart RAM cache a skládání stránky, vypnutý laboratorní adaptér
blokové/stavové projekce a emulátorové ověření atomických zápisových plánů.
Aktuální callable hostitelé, aktivní generace, skutečné Home odběry a Rules
zůstanou v této části zapojené dosavadním způsobem. Laboratorní kód smí pracovat
jen s pamětí nebo striktně ověřeným emulátorem shoutout-rules-test/127.0.0.1:8080;
žádné skutečné Auth účty a žádné volání placeného geokódování.

Ověřit 50/200 karet a matici beze změn / nové tělo / změna jen čítačů / pouze
geografie / smazání / expirace / blokace / jiný účet / ztráta odpovědi / poškozená
či evikovaná cache. Přidat dávku až 50 zdrojových změn a zachovat společný
rozpočet 450 zápisů, kompatibilní generace, rollback celé transakce a R5.
Studené a teplé průchody měřit zvlášť: SDK reads/writes/queries, nové zdrojové
body, velikosti reprezentací/přenosů, počet obratů a náklad živých odběrů včetně
původního Home dotazu. Model 5 000 relací pouze propočítat z těchto operací;
neoznačovat to za zátěžový test ani garanci cloudové ceny/latence.

**Výstup:** ověřený protokol a klientské jádro za vypnutou cestou, srovnání
variant a jedno doporučené schéma, úplná matice writerů i zbývajících zásahů,
podklady pro kompatibilní přechod/retenci/rollback, dokumentace, metriky,
seskupený commit/push a úplné CI. Před živou aktivací musí být prokazatelně
nahrazené všechny závislé zápisové/živé cesty; laboratorní cache není hotové B4.

**Hranice:** bez živých dat/kolekcí, backfillu, změn Rules, nasazení, Auth účtů,
nového Scheduleru, podpisového klíče, navýšení prostředků nebo aktivace B4.
Názvy/cesty nových provozních dat, výsledný migrační formát a provozní limity
se po měření předloží konkrétně. Čerstvost/slučování signálů, případné znovu
zpřístupněné novinky a číslovka patří do navazujícího B4b, ne do tohoto úseku.

<a id="b4a-local-results"></a>

### B4a – lokální základ a výsledky

Vlastník 20. listopadu výslovně schválil celý výše uvedený lokální rozsah.
Evidence stupnic rozlišuje již předem plánovanou hranici B4a základ / budoucí
provozní integrace: každá dostává polovinu dosud nedokončené váhy delta-code
a delta-check (MVP 44 + 44, backlog 70 + 70). Původní součty ani hotové váhy
se nemění; za B4a se nezapočítává integrace, DEV nasazení ani živá akceptace.
Implementace je oddělená od aktivních hostitelů a generací:

- `functions/feed_body_contract.js`: veřejné tělo podle dnešní whitelist
  serializace, samostatný SHA-256 bodyVersion, oddělený stav a omezený protokol
  výběr/doplnění. Kategorie zachovají pořadí. Typované kanonické tokeny čísel
  používají IEEE-754, aby se JavaScript/Dart shodly i na zlomkových časech.
  B3 hash nadpisu/textu se nemění. Podpis váže UID/projekt, generaci i její
  inkarnaci, kontext, pořadí/verze/read skupiny a původní deadline. Čítače se
  nepodepisují podruhé; aktuální stav se ověří nezávisle. Cold cesta vrací těla
  rovnou, warm cesta žádná, doplnění jen chybějící ID z podepsaného výběru.
- `lib/feed_body_cache.dart`: RAM cache oddělená projektem/UID, omezení
  4 MiB/hodina, LRU a ochrana proti posunu hodin. Již zobrazené karty evikce
  nemění. Assembler potvrzuje stránku celou, ověřuje hash a ohradí změnu účtu,
  smazání cache, zánik i opožděnou odpověď. Sdílený JSON wire fixture ověřuje
  skutečný serverový formát na Dart straně, nejen dva nezávislé mocky.
- `functions/feed_body_lab.js`: pouze shoutout-rules-test/127.0.0.1:8080,
  tři varianty packed / individual / hybrid. Hybrid drží blokový výběr a malý
  živý stav bez textu. Zdroj, projekce a plány obou generací se uloží atomicky;
  rozpočet 450 hlídá plán i skutečné SDK mutace včetně pokusu spolknout chybu.
  Stejné hodnoty/replay nepíšou. Komentáře/uložení nemění řadicí strom.
  Anonymní purged kontext zůstane zachovaný, ale jeho projekce se odstraní.

Guard je povinný injektovaný hostitelský kontrakt, nikoli nová implementace
Auth/App Check/eligibility/block/R5 kontrol. Lokální testy ověřují odmítnutí
při revokaci a změně generace/R5 i čekání; skutečné zapojení stávajících
bezpečnostních kontrol do nového protokolu teprve zbývá. Kód se neimportuje
z aktivního feed gateway ani Functions hostitele. Žádný feature flag,
živý index nebo Rules se neměnil.

#### Měření a doporučení

[Reprodukovatelný výstup](../../benchmarks/FEED_B4A_2026-11-20.json) pochází
z `feed_body_lab.integration.test.js`: 50/200 syntetických zdrojů, stránky 50.
Počet reads zahrnuje samostatné načtení projekce pro výběr a obě kontroly
dostupnosti. Nezahrnuje společný prostorový výběr a produkční bezpečnostní
guardy. Přenos je velikost konkrétní JSON reprezentace, **nikoli naměřené
Firestore síťové/billing bajty**. Framework, masky listenerů a komprese nejsou
emulátorovým měřením prokázané. Zápisy níže nezahrnují stávající index;
jeho atomickou kompatibilitu ověřuje zvláštní dvougenerační test.

| Varianta | Cold reads / těla | Warm reads / těla | Jedno nové tělo, dva obraty | Zápisy při vytvoření 50 / 200 |
| --- | --- | --- | --- | --- |
| packed | 95 / 50 | 45 / 0 | 76 / 1 | 65 / 261 |
| individual | 200 / 50 | 150 / 0 | 251 / 1 | 100 / 400 |
| hybrid | 95 / 50 | 45 / 0 | 76 / 1 | 115 / 461 |

200 zdrojů se zapisuje ve čtyřech transakcích po 50; údaj 461 není jedna
transakce přes rozpočet. Cold má jeden callable obrat, doplnění dva; všechny
varianty přenášejí stejný veřejný formát. Warm nečte zdrojová těla, ale nový
protokol **zatím nepřináší plošné snížení reads**. Varianta individual je pro
výběr nevhodná. Hybrid má smysl jen po doložení přínosu živého přenosu proti
dalším zápisům. Není automaticky doporučený k provozní aktivaci.

Současný Home dotaz a odběry rodičů jsou zvlášť zahrnuté jako model jednoho
počátečního doručení 50 + 50 dokumentů. Neúčtovat je mechanicky znovu při
každé obnově: existující SDK odběry mohou zůstat a data sdílet. Soukromé
reakce/záložky zůstávají samostatné. U fixture je dolní veřejná reprezentace
Home+rodičů 201 680 B; náhrada jen rodičů kompaktním stavem ji modelově mění
na 111 790 B, při stejném počtu počátečních dokumentů a s dalšími zápisy.
Nejde o zachycený provoz listenerů. Home nelze odstranit bez náhrady promo.
Model 5 000 warm sestavení má 225 000 packed nebo 750 000 individual fetches,
plus případné odběry a vynechané společné/policy náklady; není to SLA ani cena.

**Doporučené schéma k navazujícímu návrhu:** statický bodyVersion spolu se
sdílenou neměnnou blokovou projekcí ve verzované generaci, mimo řadicí klíč;
čítače/dostupnost v oddělené kompaktní blokové stavové vrstvě. Samostatné živé
stavové dokumenty přidat pouze při nahrazení celých rodičovských odběrů a
doložené úspoře celého toku. Další integrace musí sloučit duplicitní načítání
výběru/ověření a vyřešit drahou cold/refill cestu, nikoli nasadit tuto tabulku
jako finální optimalizaci. Laboratorních 16 hash bucketů je omezený experiment
(64 řádků/64 KiB na bucket), **nikoli globální produkční index pro 100 000 účtů**.
Provozní generace musí využít existující dělené bloky a plán kompatibility.

#### Matice zbývajícího zapojení

| Cesta | Dnešní zápis | Co musí navazující integrace pokrýt |
| --- | --- | --- |
| create_shout / toggle_shout_reaction / delete_shout | zdroj + index | přidat stejný body/state plán a zachovat receipt |
| prepare_account_deletion / account_shout_hiding | dávka zdrojů + index | rezervovat všechny projekce v rozpočtu 450, max. 50 |
| shout_expiration | zdroj + index | stav/dostupnost i bez dalšího načtení těla |
| account_reaction_removal | rodičovské počty, u Shoutu index | kompaktní stav jen u Shoutu; nepřidat druhý odpočet |
| create_comment / delete_comment | commentsCount rodiče | stav atomicky, bez řadicího stromu |
| toggle_shout_save | savesCount rodiče | stav atomicky, osobní záložka dál soukromá |
| account_content_archive / account_purge_job | odpočty commentsCount | stav atomicky, zachovat cizí obsah |
| account_purge_job / R5 časná fronta | odstranění metadat a zdroje/kontextu | odstranit nové projekce i historii, fence i pro warm reuse |
| functions/index.js geografie | přímé geography update po geokódování | odvozená verze ve stejné transakci; žádné nové placené volání |
| administrativní opravy/backfill | guard index-off | zachovat zákaz obcházení, konkrétní nový migrační plán |
| Home / spatial karta / detail | plné zdroje/odběry | zachovat promo/sledované/vlastní; nahrazovat až společně s writery |

Pro živé použití zbývá schválit formát nové generace, doplnění a audit pokrytí,
R5/history/purge včetně nových dat, přesné Rules a kompatibilní návratový web.
Při návratu musí zdroje a starší writery zůstat konzistentní; nikdy přepnout
reader na neúplnou generaci. Tato matice je důkaz rozsahu zbývající práce,
nikoli tvrzení, že se už produkční writery změnily. B4b signály/číslovka a
celé B4 DEV/akceptace zůstávají otevřené.

Ověření: 8 serverových kontraktových, 8 Dart testů, 6 emulátorových scénářů,
Functions lint a cílená lib/test analýza. Konečný zdroj
**13bfe74c182e266eb4ed7c86ca7c1f1dfcecfc64** má
[úspěšné úplné CI 44816457563](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44816457563):
416 Flutter, 152 Functions unit (495 emulátorových testů v unit fázi záměrně
skip), 464 transakčních, 34 B2 runtime, 142 purge a 15 Storage testů;
formát/analýza, browser read-state a webový build prošly také. Výstup měření
B4a v CI se přesně shoduje s uloženým lokálním reportem. Konečná oprava TTL
navíc testuje náhradu vypršelého záznamu čerstvě ověřeným tělem, aby nevznikal
zbytečný druhý fetch. Starší CI a3ebdad bylo po nahrazení zrušené.
**Lokální B4a je uzavřené; celé B4 ani provozní integrace tím nejsou dokončené.**
Žádné nasazení ani skutečná data nejsou součástí.

<a id="b4a-read-integration-proposal"></a>

### Další ucelený úsek – bezpečné a levnější sestavení stránky

**Stav 20. listopadu: schválený lokální úsek je dokončený s úplným CI, viz výsledky níže.**
Navazuje na dokončený B4a základ; nejde o opakování jeho testů ani povolení
živého zapojení. Implementace je na feature/feed-b4-consistent-reads.
Před začátkem práce se zbývající delta-code/check váha rozděluje napůl mezi
finální reader a zbývající writery/aktivní integraci: MVP 22 + 22, backlog
35 + 35. Součet a již dokončené váhy se nemění; žádný nový kredit za plán.

#### Co průzkum ověřil

`feed_body_contract.js` vyžaduje hotové descriptory před select; laboratorní
měření je získává samostatným čtením projekce. Hydrate pak čte stejné bloky
před těly a po nich. Pro fixture s 15 dotčenými bloky jde o 45 čtení bloků,
při dvoufázovém doplnění ještě dalších 30. To je odstranitelná duplicita,
nikoli důvod vynechat kontrolu oprávnění.

`requireEligibleActor` už přijímá transakční reader. `hydratePortable` dnes
kontroluje také aktuální přesnou polohu, kategorii, createdAt a Spotlight
podmínku přes available; B3 navíc porovnává hash aktuálního nadpisu/textu
s vybraným snapshotem. Základní stav B4a obsahuje pouze autora, dostupnost,
expiraci, bodyVersion a čítače. Pro náhradu čtení zdroje tyto údaje nestačí.

#### Doporučené konkrétní řešení

1. **Oddělit prostorový výběr od finálního sestavení.** Zachovat existující
   progresivní výběr nejvýše 50 ID, zmrazené pořadí, read snapshot a podepsaný
   kurzor. Nepřidávat klientský seznam celé cache ani průchod všemi Shouty.
2. **Jeden závěrečný konzistentní read-only transakční krok.** Po výběru v něm
   načíst aktuální stavové bloky jednou, případná chybějící těla a všechny
   související serverové dokumenty přes tentýž reader. Zachovat vstupní
   Auth/App Check/eligibility kontrolu před drahou prací i opětovné ověření
   účtu, blokací, generace/inkarnace, R5 fence a smazaných autorů při finálním
   sestavení. Kontroly neukládat do sdílené cache. Po návratu ověřit časové
   hranice bez dalšího čekání. Konzistence znamená serverový snapshot této
   transakce; neslibuje zabránění změně po dokončení čtení.
3. **Doplnit potřebná metadata.** Laboratorní projekce bude obsahovat dnešní
   výběrová pole metadataOf: přesnou polohu/geohash, createdAt/expiresAt,
   kategorie, autora, status a Business dostupnost; také současný B3 hash
   nadpisu/textu. bodyVersion a veřejné čítače zůstanou oddělené. Podpis
   doplnění naváže i neměnnou identitu výběrových polí. Jejich změna nebo
   nesoulad textového hashe vyžádá obnovu celé stránky; změna samotného počtu
   palců/komentářů/záložek zachová pořadí a převezme aktuální počty.
4. **Cold/teplá/doplňovací cesta.** Cold vrátí potřebná těla přímo v prvním
   obratu. Teplý výběr vrátí finálně ověřené descriptory a klient použije
   shodnou RAM cache. Při chybějících tělech druhý požadavek znovu ověří
   podepsaný výběr a provede jeden finální transakční krok, nikoli dvě další
   čtení stejných bloků. Změna během čekání nikdy nepotvrdí neúplnou stránku.
5. **Jedno trvalé čtecí jádro mimo aktivní cestu.** Doplnit konkrétní
   transakční adaptér a jeho zapojení do klientského assembleru, s testem
   serverového wire formátu. Aktivní getFeedPage, Home/živé odběry, writery
   a generace zůstanou zatím stejné; nový čtecí adaptér se nesmí pustit na
   živé cesty bez kompletního zápisového pokrytí a R5/purge přechodu.

#### Cíl měření, nikoli slíbený účet

Pro stejných N dotčených stavových bloků a M chybějících těl je návrhový cíl:

| Cesta | Hotový B4a prototyp | Cíl nového sestavení |
| --- | --- | --- |
| Cold | 3N + 50 | N + 50 |
| Teplá, vše v RAM | 3N | N |
| Výběr + doplnění M těl | 5N + M | 2N + M |

Při N=15/M=1 tedy 95 → 65, 45 → 15 a 76 → 31. Jde o **teoretické cíle
pro stejné laboratorní rozložení**, ne naměřené výsledky nebo produkční
limity. Rozšířená metadata mohou změnit počet/velikost bloků; měřit znovu.
Vykázat i skutečné součty s actor/blocks/author/generation/R5 čteními,
prostorovým výběrem, transakčními opakováními a stávajícími Home/živými cestami.
Nesrovnávat nový úplný součet s původním neúplným. Zachovat oddělení SDK
operací, JSON bajtů a neověřeného síťového/billing přenosu.

#### Rozsah navržený k povolení

Ucelená lokální implementace finálního transakčního readeru, potřebného
projekčního kontraktu a klientského dekódování. Přidat emulátorovou regresi
se skutečnými existujícími eligibility helpery a read snapshotem: změna
polohy/kategorie/promo/textu, blokace, postih, smazání účtu/autorů, R5,
inkarnace, expirace, výpadek/restart a souběh mezi výběrem a doplněním.
Ověřit 50/200 zdrojů, cold/warm/jednu změnu, stejné počty i dávku nejvýše 50
a společný zápisový rozpočet 450. Doplnit měření a dokumentaci, lokální
commity a jeden společný push/úplné CI včetně již hotové opravy analyzátoru.

**Bez živých kolekcí, nového provozního formátu/generace, migrace, nasazení,
Rules, Auth účtů, Scheduleru, navýšení prostředků nebo změn retence.**
Laboratorní nové projekce zůstanou chráněné emulátorem; 16 bucketů se nesmí
vydávat za globální produkční schéma. Nový runtime datový layout a dokončení
všech writerů/odběrů včetně promo náhrady budou navazující konkrétní přechod
před DEV aktivací. B4b signály a číslovka tímto úsekem nezačínají.

<a id="b4-read-local-results"></a>

### Finální transakční reader – lokální výsledky

Navazující [konkrétní návrh provozní vrstvy a všech writerů](FEED_STATE_STORAGE_PROPOSAL.md)
má schválený lokální P1 s [implementací a výsledky](FEED_STATE_STORAGE_PROPOSAL.md#p1-results).
Nemění dokončení tohoto readeru; živý přechod zůstává samostatný.

Schválený úsek je implementovaný a má úspěšné úplné CI. Aktivní cesta
getFeedPage/Home ani žádný živý writer se neměnily.

- `feed_body_reader.js` přijímá pouze serverově připravený binding, původní
  snapshot/session a callback stávajícího progresivního výběru. Admission
  proběhne před callbackem. B3 klasifikace používá skutečný feedReadClassifier
  nad zmrazenými B2 bloky. Pak jedna read-only transakce načte stavové bloky,
  requireEligibleActor přes reader, control/generaci/inkarnaci, R5 buňky,
  blokace a veřejné markery autorů; zdrojová těla jen pro chybějící ID.
  Čas relace a expirace se kontrolují i po návratu transakce.
- `feed_body_state.js` přidává pouze do laboratorní projekce metadataOf,
  textovou identitu B3 a selectionVersion. Změna přesné polohy uvnitř téhož
  geohashe tak nezneužije shodný bodyVersion; počty mohou dál aktualizovat
  zobrazení bez přesunu karty. Přesná poloha a interní eligibility se do
  klientského wire stavu neposílají. Laboratorní writer je udržuje atomicky
  a zachovává limit 50/450 i úplný rollback.
- Podpis váže selectionVersion a frozenContentHash spolu s dosavadním
  účtem/generací/kontextem/deadline. Doplnění znovu ověří dostupnost v jedné
  transakci; nevytváří serverovou per-user relaci. Dart decoder/assembler
  tyto identity kontroluje a odmítne jejich záměnu před potvrzením stránky.

Read-only snapshot je konkrétní bod oprávnění/dostupnosti. Test se souběžným
zápisem po prvním čtení ověřuje starou projekci se starým tělem, nikdy starý
hash s novým textem. Změna provedená až po tomto bodě nemůže být tímto čtením
garantovaně zachycená. Admission/final-policy test naopak prokazuje odmítnutí
postihu vloženého před začátkem závěrečné transakce. Auth/App Check testy zde
ověřují existující helpery a request kontrakt; nenahrazují živé ověření tokenů
platformou ani neaktivují veřejný callable.

#### Naměřené operace

[Výstup 50/200](../../benchmarks/FEED_B4_READ_2026-11-20.json) má dvě nezávislá
počítadla: čtecí adaptér a pozorovatel SDK zahrnující také skutečný prostorový
výběr. V obou fixture je jeden potvrzený B2 marker. Nezahrnuje vytvoření
počátečního snapshotu, platformní Auth/App Check, Home/živé odběry a síťové
rámcování. SDK request znamená čtecí volání, nikoli všechny gRPC zprávy.

| Případ | Bloky + zdroje | Se skutečnými guardy/B3 | Navíc i prostorový výběr |
| --- | --- | --- | --- |
| 50 zdrojů, cold | 65 | 82 | 89 |
| 50 zdrojů, warm | 15 | 32 | 38 |
| 50 zdrojů, výběr + doplnění jednoho těla | 31 | 64 | 70 |
| 200 zdrojů, cold | 65 | 83 | 96 |
| 200 zdrojů, warm | 15 | 33 | 41 |
| 200 zdrojů, výběr + doplnění jednoho těla | 31 | 66 | 74 |

Srovnání 95 → 65, 45 → 15 a 76 → 31 platí pouze pro **stejně vymezené
blokové/zdrojové čtení**, ne pro kompletní součty různých benchmarků.
Cold čte 50 těl a má jeden obrat; warm nečte žádné. Doplnění používá druhý
obrat a jedno tělo. Každý obrat má právě jednu závěrečnou read-only transakci;
B3 bloky mohou vyvolat vlastní historickou transakci, kterou report počítá.

Veřejná odpověď má v této fixture asi 164 kB cold / 50 kB warm. Nesrovnávat
přímo s bajty staršího B4a, které používalo jiný text a menší podpisový
kontrakt. Interní JSON projekce roste na asi 37/141 kB pro 50/200 zdrojů:
laboratorních 16 bucketů načítá i nevybraná metadata. Odstranili jsme
duplicitní čtení, **neprokázali optimální provozní layout ani síťový přenos**.
Home+parent odběry zůstávají jako samostatný model 100 počátečních doručení,
nikoli automatická položka při každém refreshi. Model 5 000 warm sestavení
samotné měřené cesty je 190 000/205 000 reads; nejde o návštěvnost, SLA,
účet nebo zátěžový test.

Lokálně prošlo 9 emulátorových scénářů (včetně 200 karet po stránkách),
12 kontraktových/metadata testů a 10 Dart cache/wire testů. Původní B4a
emulátorová sada 6 scénářů rovněž prošla po rozšíření laboratorního adaptéru.
Celá flutter analyze, formát, Functions lint i nástroje výběru CI/metrik jsou
čisté. Nová sada má samostatný test:body-reader a CI krok, aby neprodlužovala
již dlouhou pětiminutovou Rules sadu.

Konečný zdroj **0b2d004472873408eae74daf570d8e8abc03e4d2** má
[úspěšné úplné CI 44825059479](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44825059479):
418 Flutter, 156 Functions unit (504 emulátorových testů v této fázi skip),
464 transakčních, 9 nových B4 reader, 34 B2 runtime, 142 purge a 15 Storage
testů. Browser, lint/analýza/formát i webový build rovněž prošly. JSON
benchmark z CI se přesně shoduje s uloženým lokálním reportem. Checkpoint
zahrnuje také předchozí schválenou opravu analýzy node_modules a její dokumentaci.

**Hranice dokončení:** pouze neaktivní čtecí jádro a laboratorní projekce.
Před živou aktivací stále zbývá provozní layout, atomické zapojení všech
writerů z matice výše, R5/history/purge nové vrstvy, náhrada závislých
Home/živých odběrů se zachováním promo, migrační audit a kompatibilní rollback.
Nový reader spoléhá na úplné zápisové pokrytí; sám jej nenahrazuje. Nové živé
cesty/generace, Rules, data, Auth, Scheduler a prostředky se neměnily.

### Verze a jejich význam

Oddělit následující významy; jde o koncepty, nikoli již schválené názvy polí:

| Údaj | Účel | Co se nesmí předpokládat |
|---|---|---|
| Verze přenášeného obsahu karty | Rozpoznat stejný nadpis/text a další renderovaná pole. | Geohash, createdAt ani dnešní indexový hash nepokrývají celé tělo. |
| Verze drobných živých dat | Samostatně změnit čítače, osobní reakci/uložení a potřebnou prezentaci. | Palec nevyžaduje znovu posílat celý text. |
| Verze indexového bloku/oblasti | Přeskočit nezměněné části výběrových metadat. | Změna této verze automaticky neznamená nový příspěvek. |
| Dostupnost a retenční fence | Aktuální oprávnění, status, autor, blokace, expirace a R5. | Shodná verze těla ani jeho držení klientem není oprávnění ke čtení. |
| Baseline novinek | Určit potvrzenou hranici poslední úspěšné obnovy konkrétního feedu. | Nejde o počet všech nepřečtených ani o obsahový hash dnešního kurzoru. |

Verze celé přenášené karty není totéž co hash relevantního nadpisu/textu pro
přečtení B1/B2. Změna palců či jiné prezentační položky nesmí sama rušit
značku přečtení. Vazbu těchto dvou verzí musí implementační kontrakt vyjádřit.

Verze odvozovat ze serverově ověřeného stavu; chybné klientské údaje nesmějí
měnit autoritativní obsah, čítače nebo přístup. Bez skutečné změny neprodukovat
nové obsahové verze a indexové zápisy. Před zvolením schématu doložit, jak
všechny existující writery zachovají zdroj, verze a index atomicky, včetně
moderace, expirace, účtového mazání a obnovení dostupnosti.

### Průchod obnovou

1. Na hranici spuštění/skutečné obnovy dokončit bezpečný přenos čekajícího
   přečtení a načíst potvrzený read snapshot podle B2. Pro B3 nesmí částečná
   historie předstírat úplnou; velká fronta nesmí být řešená nekonečným čekáním.
   Přesné chování selhání a pracovní rozpočty patří do revidovaného runtime B2.
   Zachytit konkrétní hranici fronty: čtení vzniklé během přenosu se neztratí,
   ale nesmí donekonečna posouvat dokončení rozpracované obnovy.
2. Server založí nový výběrový snapshot podle polohy/filtrů a pro B3 read stavu.
   Porovnáním verzí oblastí/bloků získá potřebné změny metadat. Nevyžadovat
   celý neomezený seznam všech dříve načtených Shoutů v každém požadavku.
3. Pro požadovanou stránku porovnat omezený manifest ID + verze těla z klienta
   s aktuálním serverovým stavem. Po kontrole dostupnosti vrátit pořadí/ID,
   potvrzení použitelných verzí, nové či změněné obsahy a drobné aktualizace.
   Nejdřív načíst všechna těla a pak je porovnat by šetřilo jen přenos, ne jejich reads.
4. Klient použije potvrzené položky ze své cache a doplní změny. Neznámá verze,
   chybějící tělo nebo poškozená cache vyvolá omezené doplnění, nikdy prázdnou
   či nesprávnou kartu. Cache nemění serverem určené pořadí.
5. Až po úplném úspěchu atomicky potvrdit novou relaci, read snapshot a baseline,
   posunout scroll nahoru a odpovídajícím způsobem resetovat indikátor. Selhání
   ponechá starý feed/scroll/baseline, ale neudrží nově zakázaný obsah dostupný.

Výběr podle nového bodu či filtrů je nový kontext. Obsah lze z cache znovu
použít pouze po ověření pro nový kontext, nikoli převzít staré pořadí nebo
osobní filtry. Výpadek mezi stránkami/opakování nesmí duplikovat karty ani změnit
význam kurzoru. Hodinový kontrakt R4 a jeho R5 výjimka dál platí.

### Hranice cache a historie změn

Začít návrhem cache v otevřené relaci. Schválená trvalá IndexedDB evidence
přečtení sama nepovoluje trvalé ukládání celých textů, přesné polohy nebo
soukromých zpráv. Pokud bude pro úsporu při restartu potřebná trvalá cache
celých karet, před implementací určit rozsah, kapacitu, retenci a pravidla
offline zobrazení; nepřebírat automaticky expiresAt + 7 dní z read markerů.

Klientská cache a běžící požadavky jsou oddělené podle projektu/UID. Změna
účtu nebo žádost o jeho smazání musí zabránit pozdnímu importu starých dat.
Znepřístupněné položky vyřadit z aktivního feedu i při shodném hash; samostatná
schválená dostupnost expirovaných ve vlastní historii tím není změněná.
Chybové odpovědi nesmějí odhalovat cizí nepřístupný obsah či jeho verze.

Pro inkrementální přenos navrhnout potvrzený bod a omezenou historii změn,
včetně odstranění. Její uložení/retence zatím nejsou zvolené. Při příliš starém
či neplatném bodu bezpečně znovu porovnat aktuální metadata po dávkách;
nepředstírat úplnou deltu a nestahovat automaticky všechna těla. Žádný nový
journal nesmí obejít pevné retenční lhůty nebo obnovit R5 vyčištěná metadata.

<a id="b4b-local-proposal"></a>

## Schválený lokální B4b – 21. listopadu 2026

Vlastník zvolil **jen nově publikované Shouty od úspěšné obnovy**. Starší
znovu zpřístupněný obsah se objeví při obnově, ale nezvyšuje číslovku.
Schválil ucelený lokální výpočet nad indexovými metadaty bez celých textů,
bezpečnou baseline, 1–99/99+, odečtení nedostupných novinek a klientský badge
za vypnutou volbou. Součástí jsou regrese souběhu/filtrů/výpadků/účtů,
porovnání malého publication-only signálu s omezenou dávkovou kontrolou,
naměřené operace/přenosy a návrh provozní četnosti, commit/push a úplné CI.
Pouze paměť/emulátor: bez nasazení, živých dat, nových služeb, Rules, Auth
účtů či změn retence. Provozní mechanismus a četnost zatím zvolené nejsou.

Implementace se připravuje ve feature/feed-b4-news-local. Výchozí DEV a
produkční klientský přepínač serverFeedNews i serverový newsEnabled jsou
false. Samotné createdAt není spolehlivá hranice: transakce může začít před
obnovou a publikaci potvrdit později. Prototyp proto váže podepsanou baseline
na původní indexový snapshot/readTime a první vytvoření publicStates ve
stejné transakci jako zdroj; hashový rozdíl přeskočí nezměněné podstromy.
Hranice platí uvnitř téže inkarnace auditované card generace; R5 a přepnutí
readeru vyžadují obnovu. Nemění se formát ani zápisy živých zdrojů/indexu.
Za připravený či provozně ověřený výsledek to lze označit až po testech a CI.

<a id="b4b-local-results"></a>

## Lokální B4b – implementace, měření a další provozní brána

Lokální základ je uzavřený ve feature/feed-b4-news-local: zdroj
**e8c0c9c722049d989021ff5cc0339c3260b43a14** má
[úspěšné úplné CI 44944929884](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44944929884).
Žádné nové nasazení ani živé zápisy.

- [Serverový kontrakt](../../../functions/feed_news.js) používá podepsaný
  checkpoint oddělený od čtecích/body kurzorů, svázaný s projektem/UID,
  filtry, readTime, inkarnací generace a původní hodinovou lhůtou.
  Není založený na samotném createdAt. První createTime publicStates dokládá
  atomický vznik nového zdroje, takže opožděný commit nepřepadne mezi obnovu
  a číslovku a starší obnovený obsah se nepočítá. Platí uvnitř auditované
  card generace; změna readeru nebo R5 vyžaduje obnovu.
- [Porovnání stromů](../../../functions/feed_news_scan.js) přeskočí shodné
  hashe a původní ID ve stejném listu. Počítá dostupné metadata, nikoli celé
  texty; nejvýše 100 kandidátů dokládá 99+. Pracovní krok používá 32 načtení
  uzlů, mez odpovídá stávajícímu readeru; potřebuje-li pokračování, nevrací
  částečný počet. Klient má nejvýše 32 pokračování a starý checkpoint při chybě
  zachová. Původní 262 144B mez podepsaného kurzoru se nezvětšovala.
- Před každou odpovědí včetně pokračování se znovu ověří účet a R5.
  Konečný výsledek kontroluje aktuální hlavičky, blokace, autory, dostupnost,
  kategorii/promo/radius a expiraci. Změna během přípravy způsobí bezpečné
  odmítnutí/opakování stejné hranice, nikoli smyšlený počet. B3 read markery
  se při pouhé detekci nesynchronizují a počet není počet všech nepřečtených.
- [Klient](../../../lib/feed_delta_client.dart) a
  [relace](../../../lib/feed_session.dart) přebírají potvrzený počet bez změny
  karet, pořadí nebo scrollu. Pouze úspěšná obnova převezme novou hranici.
  Pozdní odpověď, jiný účet/baseline a vadná odpověď se odmítnou. Při známé
  expiraci se číslo včas označí jako neověřené a aktivní host znovu ověří
  jen novinky. Tento časovač není odhad stáří ani pravidelné načítání feedu.
- Plovoucí tlačítko má 1–99/99+ a samostatný neověřený stav; světlý/tmavý
  vzhled i zachování umístění jsou testované. [Detekční driver](../../../lib/feed_news_driver.dart)
  má výslovně dodané časování, slučuje pulsy bez hladovění, zachová signál
  přijatý během požadavku a pracuje jen v aktivním zobrazení. Žádný výchozí
  provozní polling ani nový odběr se neinstaluje. Home má za vypnutou volbou
  klientský transport a kontrolu po úspěšné obnově/návratu do feedu/popředí;
  skutečný publikovací odběr a adaptivní provozní profil zatím napojené nejsou.
- Výchozí serverový newsEnabled a klientský serverFeedNews jsou false v DEV
  i produkčním buildu. Změna Rules, datového formátu, retence nebo IndexedDB
  nebyla potřebná. Publication-only hlavička existuje pouze v
  [emulátorovém prototypu](../../../functions/feed_news_lab.js); do balíčků
  Functions se laboratorní modul ani detekční model nepřibalují.

Lokální kontroly: 445 Flutter, 89 nástrojových, 165 Functions unit
(540 emulátorových scénářů v unit běhu přeskočených), 9 nových databázových
scénářů a 11 transportních včetně Chromu. Lint, úplná analýza a formát
prošly; konečné úplné CI potvrdilo také všechny dosavadní serverové,
Rules, B2, purge a Storage regrese i webový build. Nový samostatný krok
`Test B4 news count and refresh fence` je úspěšný, místní souhrn důkazu
je build/b4-news-ci-proof.json. Ověřen byl přesný SHA a čistý pracovní strom.
[Nové regrese](../../../functions/feed_news.integration.test.js) zahrnují
hranici 99+, mazání/expiraci, starý obnovený obsah, zpožděný commit, publikaci
během obnovy, změnu účtu, R5, rollback a smazání účtu během přípravy.
Skutečný headless Chrome prošel serverovým HTTP transportem proti emulátoru:
0 → 1 → 0, výpadek/opakování, bez přenosu dalších těl. Identitu dodává fixture,
takže tento test neověřuje živý platformní Auth/App Check.

### Naměřené náklady

[Reprodukovatelný lokální výstup](../../benchmarks/FEED_NEWS_2026-11-21.json)
odděluje SDK operace od modelu detektoru. Účet/kontrolní dokumenty a
retenci zahrnuje; založení fixture a prvotní plný feed nezahrnuje.

| Syntetické zdroje | Nezměněné okolí: reads | Jen palec: reads | 1 novinka cold / warm: reads | Celá těla | JSON požadavek / odpověď |
|---|---:|---:|---:|---:|---:|
| 50 | 19 | 24 | 32 / 30 | 0 | 1 557 / 1 651 B |
| 200 | 19 | 28 | 40 / 30 | 0 | 1 557 / 1 651 B |
| 2 000 | 23 | 35 | 50 / 36 | 0 | 1 709 / 1 803 B |

Všechny samotné count dotazy mají 0 zápisů. Prototyp signálu přidal jeden
malý zápis při publikaci; změna palce ho nepřidala. Kompletní publikační
transakce stály podle tvaru stromu 5/7/7 zápisů a se signálem 6/8/8;
nejde o příslib stejného počtu pro všechny polohy či všechny udržované generace.
SDK reads nejsou přesně fakturované index-entry reads. Bajty jsou JSON
serializace se základní callable obálkou, bez HTTP hlaviček/komprese/gRPC.
Časy emulátoru, stromové hashe a bajty závislé na serverovém čase nejsou
cloudovou latencí, cenou ani přesně reprodukovatelným číselným SLA.

Detektorový model za 60 sekund: v klidu publication-only signál nevyvolá
další probe; pevné dávky 5/15 s znamenají 12/4 probe za minutu. Sto publikací
v jedné dávce se na klientu sloučí na jeden probe, ale stále způsobí 100
signálových zápisů a modelových 101 listener reads na odběratele. Sto
rovnoměrných publikací dává 25 probe při 2s slučování proti 12 při 5s dávce.
Pouhé slučování překreslení/požadavků nešetří doručené změny dokumentu.

### Návrh četnosti pro další schválení

Doporučený směr: **publication-only signál v klidu, 2s slučování**; při
čekajících novinkách **nejvýše 15 s mezi kontrolami dostupnosti**, známá
expirace dříve. Po návratu/popředí/reconnectu okamžitá kontrola. Pro hustou
oblast navrhnout **5s dávku se zastavením hlučného odběru**, když součet
skutečných signal reads a probe práce vyjde dráž; návrat s hysterézí.
Jde o návrh, ne zapnuté časování ani garantovanou čerstvost.

Před provozním adaptérem konkretizovat bezpečný kontrakt hlavičky,
ověřované oblastní odběry, limity/četnost a hysterézi, způsob odečtu
smazaných novinek a reconnectu, celkové náklady včetně fanoutu i ochranu
účtu/API proti zahlcení. U publication-only signálu je omezená kontrola
nutná: sám nesignalizuje mazání/expiraci. V tomto úseku nevznikla služba,
Scheduler, Cloud Task ani aktivní globální timer. Cíl 5 000 relací má stále
vlastní kapacitní bránu. Provozní adapter, DEV rollout a společná B4 akceptace
jsou další otevřené kroky, nejsou součástí zde hotového lokálního základu.

Evidence rozlišuje lokální základ od dosud nezačatého provozního napojení:
z nedokončené code/check váhy je oddělená lokální a provozní polovina,
při zachování celkové váhy rodiče a všech dosud hotových částí. Lokální
verification je uzavřená výše uvedeným úspěšným úplným CI konečného zdroje.

První společný kandidát 6cc2d4a / CI 44944087675 byl zrušen po závěrečném
nálezu v klientském označení čerstvosti: neúspěšná obnova musí ponechat
předchozí počet a checkpoint, ale číslo zobrazit jako neověřené. Oprava má
cílenou regresi. Tento zrušený běh nenahrazuje úplné CI konečného zdroje;
žádný rollout se neprováděl.

<a id="b4b-runtime-proposal"></a>

## B4b – schválený lokální provozní návrh, 21. listopadu 2026

**Vlastník následně schválil celý tento lokální úsek včetně Rules a měření.**
Souhlas neobsahuje živou aktivaci; níže je zachován schválený rozsah.
Původně vlastník povolil připravit konkrétní další postup. Níže se rozšiřuje hotový
lokální základ; ten ani metadata/cache pilot se neopakují. Doporučený další
úsek je jedna ucelená lokální implementace s testy a úplným CI. Živý DEV
přechod dostane až potom konkrétní aktivaci, inventuru a vymezené fixture.

### Doporučený kontrakt signálu

- Ve stávajícím STANDARD Firestore navrhuji malý dokument
  `feedIndexGenerations/{generation}/publicationHeads/{cell}`. `cell` je
  stejný čtyřznakový geohash jako současný adresář indexu. Obsah pouze
  `{v: 1, token: <náhodná revize>}`; žádné ID/UID, text, souřadnice, přesný
  čas publikace ani počet příspěvků. Revize není rostoucí čítač.
- `createShout` při skutečné nové publikaci atomicky zapíše zdroj, index,
  technické potvrzení a jednu novou revizi příslušné oblasti aktivní news
  generace. Opakování potvrzené operace, backfill, návrat moderovaného obsahu,
  palce, záložky a komentáře ji nemění. Samotné `before == null` proto
  nestačí: backfill také vytváří projekci, ale není novou publikací.
- Jeden malý soukromý `feedNewsControl/current` má verzovaný režim
  off/active/paused a vazbu na ID i inkarnaci card generace. Musí se shodovat
  s autoritativním feedIndexControl; není náhradou jeho kontroly. Pause
  zastaví detekční čtení, ale zachová již aktivovanou údržbu hlaviček.
  Nová inkarnace, změna readeru nebo R5 vyžaduje novou relaci; neplatný či
  chybějící control neaktivuje nic automaticky. Výchozí volby zůstanou off.
- Hlavička je pomocný signál, nikoli důkaz dostupnosti nebo osobní počet.
  Přesný count zůstává stávající podepsaný `mode: news` se všemi filtry,
  kontrolami účtu a R5. Těla se při detekci nestahují. B2 se synchronizuje
  při spuštění/skutečné obnově, nikoli při každém signálu.
- Žádné události ani historie hlaviček se nearchivují; zůstane jen poslední
  anonymní revize oblasti. Nepřidává se TTL nebo nová retenční lhůta obsahu.
  Návrh indexů: výjimka indexace polí hlavičky, žádný nový složený index,
  protože se čte podle ID. Přesný indexový diff ověřit při implementaci.

### Čtení, pokrytí a soukromí

Server z podepsaného kontextu spočítá úplné pokrytí kruhu, včetně dosud
prázdných buněk. Odběr pouze dnešních existujících kořenů by minul první
publikaci v sousední prázdné buňce. Výchozí revize hlaviček musí odpovídat
readTime úspěšné obnovy; připojení odběrů potom porovná i jejich první
serverový stav. Událost během obnovy/připojování nesmí přepadnout do mezery.
Lokální cache události sama nepotvrzuje aktuální serverový stav.

Navrhuji nejvýše **64 přímých odběrů na otevřený feed**. Při lokálním
ověření je jeden slot rezervovaný pro technický signál `_control` ve stejné
projekci; zbývá nejvýše 63 geografických buněk. Celková mez 64 se nezvyšuje.
Je to nová technická mez ke schválení, ne již platný limit. U velkého pokrytí
(zejména u pólů) se oblast nesmí oříznout: použije se úplný omezený serverový
count v dávkovém režimu bez přímých odběrů. Dosavadní radiusy 1/3/5/10/20/50 km
se nemění. Test musí doložit úplnost na hranicích buněk, kolem datové čáry
i pólů; dražší fallback se musí ukázat v měření, nikoli skrýt v průměru.

Rules návrh dovolí pouze jednotlivé `get` oprávněnému ověřenému účtu podle
dnešního eligibleUser a platné news/card generace; `list` i všechny klientské
zápisy zůstanou zakázané. To je **nové čtecí oprávnění k hrubému anonymnímu
signálu aktivity oblasti**. Neuděluje přístup k soukromému indexu nebo obsahu.
Serverem dodaný seznam řídí klientské pokrytí, ale samotná Rules neumí
ověřit HMAC kurzor nebo skutečnou fyzickou polohu uživatele. Oprávněný klient
může zkusit jednotlivě číst i jinou buňku; nepředstírat geografické omezení
nebo účetní kvótu, které nejsou vynucené. Při nepřijetí tohoto rozsahu
viditelnosti zvolit serverovou cestu, ne přidávat skryté osobní granty.

### Navržený adaptivní profil

| Situace | Akce |
|---|---|
| Aktivní feed, klidná oblast, počet 0 | Odběr hlaviček; po připojení žádný pravidelný count jen kvůli běhu času. |
| Změna revize | Označit počet jako neověřený, sloučit pulsy v pevném okně 2 s a spustit jeden count. Pulsy během požadavku zachovat. |
| Čekající novinky | Opakovat count nejpozději 15 s od začátku předchozí kontroly, při známé expiraci dříve. Tím odečíst i smazané novinky, které publication-only hlavička nehlásí. |
| Rušná oblast | Odpojit hlučné odběry; každých 5 s dávkově načíst jen revize pokrytých hlaviček. Count pouze při změně, čekajících novinkách nebo zneplatnění. |
| Pokrytí přes kapacitu 63 geografických buněk + 1 technického odběru | Bez oříznutí používat stávající úplný count v 5s dávkovém režimu; všechny jeho pokračovací meze platí dál. |
| Pozadí, jiná sekce, odhlášení | Zastavit odběry i časovače; ohradit pozdní odpovědi projektem/UID/relací. |
| Návrat do feedu/popředí, reconnect | Bez čekání na další periodu ověřit stav; znovu nepovažovat staré číslo za potvrzené. |
| Úspěšná obnova | Nová baseline, správný počet vůči ní, návrat nahoru; při chybě zachovat staré karty/baseline a neověřený stav. |

Při čekání se uplatní jediný společný plánovač; 2s slučování nesmí přidat
další 2 s za již splatnou 15s kontrolu. Nejvýše jeden běžící count na relaci,
časované kontroly rozptýlit uvnitř posledních 10 % intervalu proti souběžnému
probuzení klientů. Uváděné časy jsou cíle zahájení online kontroly, ne SLA
doručení výsledku při výpadku, kvótě nebo pomalém požadavku.

Přepnutí porovná počet doručených hlaviček, závislá Rules čtení, opakovaná
připojení a skutečnou práci countu proti dávkové cestě se stejným pokrytím.
Návrh hysteréze: při nákladu odběru nad 125 % dávkové cesty ve dvou 60s
oknech přejít do dávky; při 32 signálových změnách během 5 s odpojit hned.
V dávce zůstat alespoň 60 s. Návrat zkusit nejvýše jednou za 60 s krátkým
5s odběrem; po 32 změnách pokus ukončit. Dva pokusy pod 75 % odhadované
dávkové ceny dovolí návrat. Do srovnání patří i čtení při těchto pokusech;
při chybějících měřeních zachovat konzervativní dávkovou cestu.
Jde o výchozí algoritmus k emulátorovému ověření, ne změřenou cloudovou cenu.

### Ochrany a nákladové meze

- Auth/App Check pro callable a dnešní autorizaci zachovat. Před živým
  pilotem zvlášť doložit aktuální Firestore App Check enforcement; lokální
  test Rules nebo callable není důkaz jeho zapnutí. Nic automaticky nevypínat.
- Samostatný news token bucket podle UID sdílený mezi zařízeními: návrh
  kapacita 40, doplnění 1 kredit/s, vzor již existujícího B2 bucketu.
  Každý přijatý HTTP krok včetně pokračování spotřebuje kredit; odmítnutí
  bucket nepřepisuje. Nejde o převzetí nebo změnu B2 kvóty.
  Zachovat nejvýše 32 klientských pokračování a současný pracovní rozpočet.
  Test musí ověřit, zda se nejhorší pokračovací cesta do profilu vejde;
  kvóta nikdy nesmí vytvořit částečný údaj nebo nekonečné automatické retry.
- Nejvýše jedna probíhající operace, respektování retryAfter a při síťové
  chybě návrh backoff 5/10/20/40/60 s s rozptylem. Reconnect může naplánovat
  kontrolu, ale nesmí obejít serverem určené retryAfter. Změna účtu/mazání
  zruší staré čekání. Nedokončený stav se ukáže jako neověřený, nikoli 0.
- Nový bucket přidá na přijatý krok databázové čtení a zápis. Přímé SDK
  odběry tento bucket neomezí; jejich počet 64 je klientská ochrana, nikoli
  neobejitelná finanční pojistka. App Check ani maxInstances nejsou pevný
  měsíční strop účtu. Tuto hranici musí měření výslovně uvádět.
- Jeden head write přibude na skutečnou novou publikaci v jedné aktivní
  news generaci, v rámci společného rozpočtu 450 zápisů. Žádný globální
  dokument se nepřepisuje při každé publikaci. Hotspot v jediné buňce musí
  ověřit kapacitní test; lokální úspěch není důkaz škálování na 5 000 relací.

Modelové zatížení, **nikoli cenová nabídka**: 5 000 současných feedů,
všechny s čekajícím počtem a periodou 15 s, představuje 20 000 logických
kontrol/min. Dosavadních 19–36 SDK reads na jednoduchou kontrolu by znamenalo
380–720 tisíc reads/min před novým bucketem, Rules a opakováním; pokračování
náklady dále zvýší. Proto při nule v klidu není zvolen pravidelný count.
Ani 5s dávka nesmí znamenat automatický celý count, pokud stačí porovnání
hlaviček. Model zahrne zvlášť počet buněk, délku relací, podíl čekajících
novinek, fanout a pomocné zápisy. Z celkových registrovaných účtů nelze
odvodit měsíční částku ani dodržení rozpočtu 5 000 Kč.

### Jeden další lokální úsek a podmínky dokončení

Po schválení připravit společně serverový writer/control a rate guard,
Rules pro minimální hlavičky, serverové úplné pokrytí, klientský adaptér
s profilem výše, měření a neaktivní návratovou verzi. Bez nové Function,
služby, klíče či Scheduleru; stávající getFeedPage a prostředky se nyní
nepřenastavují. Výjimky indexace pouze připravit. Všechny přepínače off.

Ověření musí zahrnout:

1. Atomický souběh publikací, ztracenou odpověď a opakování; rollback celé
   transakce včetně signálu při překročení 450 zápisů. Backfill/obnova obsahu
   a ostatní akce nezvyšují novinky ani nepřepisují head.
2. Novou prázdnou oblast, hraniční geohash, celou současnou sadu radiusů,
   póly/datovou čáru a publikaci mezi snapshotem obnovy a připojením odběru.
3. Krok 0 → 1 → 0, 99+, smazání/expiraci, blokace, R5, změnu generace,
   pauzu, odvolání oprávnění, druhý účet, zánik obrazovky, offline/reconnect.
4. Tiché/hlučné oblasti, hysterézi, náklady návratových pokusů, více zařízení,
   kvótu během pokračování a zachování stabilních karet/scrollu/read sync.
5. Úplné počty SDK reads/writes, Rules závislostí, přenesených JSON bajtů,
   count pokračování i volání Functions; 50/200/2 000 zdrojů a model 5 000
   relací se scénáři řídkého/hustého pokrytí. Reálnou cloudovou latenci,
   fanout, contention a měsíční cenu ponechat samostatné kapacitní bráně.

Výstup: implementace za off, testy, měření, aktualizovaná dokumentace,
metriky bez změny rodičovských vah, společný commit/push a úplné CI.
**Tento návrh nepovoluje živé kolekce/control, migraci, nasazení, Auth účty,
změnu produkce, Scheduleru, prostředků nebo dosavadních retencí.** Po úspěchu
naváže konkrétní DEV aktivace a pilot; potom společná akceptace B4 včetně
interaktivního návratu již otevřeného klienta. Nevzniká další MVP milník.

### Podklady návrhu

Kód: [driver](../../../lib/feed_news_driver.dart),
[count](../../../functions/feed_news.js),
[existující adresář a directoryWindows](../../../functions/feed_block_index_store.js),
[současná validace radiusu](../../../functions/get_feed_page.js),
[Rules](../../../firestore.rules),
[B2 bucket jako vzor](../../../functions/read_sync_runtime.js).
Naměřený základ: [SDK operace a model detektoru](../../benchmarks/FEED_NEWS_2026-11-21.json).

Oficiální dokumentace ověřená při přípravě návrhu:
[účtování odběrů, opětovných připojení a Rules závislostí](https://firebase.google.com/docs/firestore/pricing),
[contention jednotlivého dokumentu a indexový fanout](https://firebase.google.com/docs/firestore/best-practices),
[real-time dotazy a škálování](https://firebase.google.com/docs/firestore/real-time_queries_at_scale).
Odvozením pro ShoutOut je nutnost započítat každý doručený head a návratový
odběr; 2s klientské sloučení samo o sobě tyto účtované události neodstraňuje.
Nové intervaly, prahy a datový kontrakt jsou návrh autora, nikoli doporučené
číselné limity Firebase nebo již schválený provozní profil.

<a id="b4b-runtime-results"></a>

## B4b – lokální provozní implementace a výsledky

Větev **feature/feed-b4-news-runtime**, navazuje na schválený návrh výše.
Zdroj **3d381f820b22162cf38eb58b757a80e2c9459b7f** má
[úspěšné úplné CI 44953434700](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44953434700).
Lokální úsek je uzavřený. Žádný živý zápis či nasazení.
První zdroj 73526a0 / CI 44952312294 byl zrušen po lokálním nálezu chybějícího
probuzení odběrů při změně controlu; zrušený běh není důkaz úplného ověření.

- [Serverový adaptér](../../../functions/feed_news_signals.js) má úplné
  pokrytí čtyřznakovými buňkami, včetně prázdných. Nad 63 geografickými buňkami vrátí
  úplný serverový fallback, nikdy oříznutý seznam. Ověřené jsou všechny
  dnešní radiusy, kruhové hranice, datová čára a póly.
- `createShout` předává explicitní důvod publikace společnému writeru.
  Head se uloží ve stejné transakci jako zdroj/index/receipt; běžné změny,
  backfill, smazání a opakování potvrzené operace ho nepřepisují. Společná
  pojistka 450 zápisů zahrnuje signál i dodatečné zápisy volajícího.
- Soukromý news control váže aktivní generaci na její skutečný createTime.
  Marker má navíc serverové zrcadlo `newsIncarnation` pro Rules, protože
  Rules nemají SDK vlastnost createTime. Budoucí aktivace musí toto pole
  doložit proti createTime, ne jen opsat libovolnou dvojici z controlu.
  Pauza/off zastaví čtení detektoru; již zavedený writer udržuje hlavičky
  i tehdy, aby nevznikla mezera. Pozastavená číslovka neblokuje načtení feedu.
- Dodatečné lokální ověření ukázalo, že změna samotného privátního controlu
  nevzbudila do 5 s již otevřený Firestore odběr. Proto je v téže hlavičkové
  projekci jeden `_control` s totožným minimálním schématem v/token. Nový
  neveřejný orchestrace helper mění private control a tuto revizi atomicky;
  při změně generace také probudí původní kontext, ale neobnoví již odstraněnou
  generaci. Rules potom odmítnou otevřený odběr a klient přejde do neověřeného
  stavu. Limit zůstává 64 celkem (63 geografických + 1 technický odběr).
  Běžná publikace technický head nepřepisuje a soukromý control není čitelný.
  Aktivace, pauza a rollback musí použít tento helper, nikoli samostatný
  ruční zápis controlu. Regrese prokazuje probuzení bez změny geografického
  headu i bez jakékoli publikace. Stejnou pauzu vyžadovat před návratem backendu.
- Výchozí revize hlaviček se přečtou v readTime původního feed snapshotu;
  aktuální účet/control se ověří znovu před odpovědí. První serverové
  události po připojení se porovnají s těmito revizemi. Nová publikace
  mezi obnovou a připojením se tedy neztratí. R5 se ověřuje i u samotného
  `news-signals` transportu; smazání účtu po přečtení hlaviček zabrání odpovědi.
- [Připravené Rules](../../../firestore.rules) dovolují jen jednotlivé get
  těchto malých hlaviček současné news/card generace oprávněným účtům.
  List, klientské zápisy, privátní control a uzly zůstávají zakázané.
  Regrese zahrnuje chybné schéma, chybějící buňku, role, zákaz, pauzu,
  inkarnaci a permission-denied na již otevřeném odběru po zrušení přístupu.
  Jde o lokální prototyp ověřený emulátorem; žádná živá Rules se neměnila.
- Samostatná UID kvóta má 40 kreditů a doplnění 1/s. Počítá každý HTTP
  krok, ne jen logický count; odmítnutí nepřepisuje záznam. Poškozený stav
  ani zpětné hodiny nevytvoří nové kredity. B2 implementace/kvóta se nemění.
  Záznam je pod dnešním rateLimits stromem zahrnutým ve stávajícím purge.
- [Klientský runtime](../../../lib/feed_news_runtime.dart) a Home dodržují
  schválený profil 2/15/5 s, hysterézi, zastavení mimo feed/popředí a
  serverové retryAfter. Nejvýše jeden count běží současně; signál přijatý
  během něj přežije. Čerstvá úspěšná baseline s hlavičkami ušetří okamžitý
  redundantní count; opožděná publikace ho spustí prvním změněným headem.
  Návrat/reconnect naproti tomu ověření vyžaduje. Expirovaná relace ukončí
  detektor a ponechá karty s nabídkou obnovy. Nová baseline/account/clear
  ohradí staré odpovědi. Přečtení, pořadí, scroll a cache těl se tím nemění.
- Adaptace používá pozorované SDK read jednotky countu a dávky; pro přímé
  odběry konzervativní model head + nejvýše sedm závislých Rules dokumentů.
  Počáteční odběry a návratové pokusy se započítávají. To není přesně
  fakturované měření: SDK/Rules cache a cloudové index-entry reads se liší.
  Samotné 2s slučování nemění účtování doručených headů. Po chybě čeká
  backoff 5/10/20/40/60 s s rozptylem, nejméně serverové retryAfter.

### Naměřené meze a další brána

[Reprodukovatelný lokální report](../../benchmarks/FEED_NEWS_RUNTIME_2026-11-21.json)
odděluje SDK operace od modelu 5 000 relací. Měřená oblast má 30 geografických
buněk a jeden technický head, dohromady 31 odběrů.

| Zdroje | Metadata/hlavičky při obnově | Samostatná klidová kontrola | Jedna novinka | Dávka hlaviček | Indexový publikační plán / z toho head |
|---|---:|---:|---:|---:|---:|
| 50 | 76 reads | 30 reads | 43 reads | 57 reads | 6 / 1 writes |
| 200 | 79 reads | 30 reads | 47 reads | 57 reads | 8 / 1 writes |
| 2 000 | 88 reads | 34 reads | 53 reads | 58 reads | 8 / 1 writes |

Detekční dotazy mají 0 source/body reads a po jednom quota write na přijatý
HTTP krok. Obnova v tabulce je metadata-only, nikoli studené naplnění těl;
to má samostatné přijaté B4 delta důkazy. Publikační plán zahrnuje zdroj,
index a head, nikoli dodatečnou kvótu/receipt skutečného createShout.
Jde o konkrétní uložený běh; tvar stromu a počet reads mohou s jinými ID
a transakčními opakováními kolísat. Nejde o přesné cenové nebo výkonové SLA.
V klidu při nule automatická periodická kontrola vůbec neběží. Dávkový
režim načítá hlavičky a celý count opakuje až při změně nebo potřebném
ověření čekajících novinek. Zrušena jsou duplicitní kontrolní SDK čtení.

Připraveny jsou tři indexové výjimky v [konfiguraci](../../../firestore.indexes.json):
publicationHeads.*, feedNewsControl.* a feedIndexGenerations.newsIncarnation;
bez složeného indexu nebo TTL. Žádná se neaplikovala. Artifact kontrola
potvrzuje, že laboratorní moduly ani B2 callable runtime nejsou zavlečené
do nesouvisejících Functions. [Nové serverové regrese](../../../functions/feed_news_runtime.integration.test.js),
[Rules/odběr](../../../tools/rules/feed_news_access.integration.test.mjs) a
[klientské regrese](../../../test/feed_news_runtime_test.dart) jsou v úplném CI;
nové databázové testy patří do stávajícího kroku test:feed-news.

Úplné CI potvrdilo 456 Flutter, 89 nástrojových, 167 Functions unit (548
integration scénářů přeskočených pouze v unit běhu), 464 Rules/server,
9 reader, 14 card, 13 transport/Rules/Chrome, 12 přechodových, 20 news,
34 B2, 142 purge a 15 Storage scénářů. Formát, analýza, lint, browser
persistence i webový build jsou úspěšné. Kontrola ověřila přesný headSha
a success; místní strojový souhrn je build/b4-news-runtime-ci-proof.json.

**Zbývá:** konkrétní DEV aktivační/pilotní plán,
ověření App Check enforcement, vazby marker/control, zapnutí writeru před
readerem po prokázaném doběhnutí starých publikačních revizí a kontrolovaný
návrat přes atomickou pauzu. Rutinní rollout nevyžaduje opakovaný souhlas,
ale nové živé kolekce/control, marker a testovací data mají vlastní bránu.
Společná akceptace B4 stále zahrnuje interaktivní rollback otevřeného klienta.
Kapacita 100 000 účtů / 5 000 relací a měsíční účet nejsou emulátorem ani
modelem prokázané; patří do stávající startovní brány, nikoli do nové fáze P.
V DEV/prod je serverFeedNews false, serverové newsEnabled/newsRuntimeEnabled
jsou false. Produkce, main, Functions prostředky, Scheduler a retence nezměněné.

## B4: číslovka bez přenačítání feedu

Preferovaný směr je odběr malých změnových signálů pro relevantní oblasti,
inkrementální ověření dostupných novinek a případné slučování signálů **před
jejich doručením**. Samotné omezení překreslení čísla neomezuje databázové reads.
Ve velmi rušné oblasti porovnat náklady tohoto odběru s méně častou dávkovou
kontrolou. Sekundový polling všech klientů není zvolený výchozí postup.

Signál pouze říká, že je třeba ověřit změnu; není osobním přesným počtem.
Výpočet musí respektovat kruhový radius, kategorii, blokace a ostatní filtry,
status/expiraci, deduplikaci ID a potvrzenou baseline. Přečtení nebo samotná
změna palců nevytváří novinku. Nové položky zůstanou mimo rozpracované pořadí
až do obnovy. Zachovat dosavadní 1–99/99+; pro 99+ stačí prokázat alespoň 100.

Při obnově resetovat jen novinky zahrnuté novou potvrzenou hranicí. Publikace
vzniklé souběžně s obnovou musí patřit do nového feedu nebo dalšího indikátoru.
Výpadek/reconnect nesmí ztratit změny ani zobrazovat staré číslo jako ověřeně aktuální.
Odběr číslovky omezit na relevantní aktivní zobrazení; ostatní dosavadní živé
interakce/oznámení mají vlastní životní cyklus.

Zbývající volby před implementací B4: maximální stáří čísla, okno serverového
slučování, mechanismus signálů a případný adaptivní fallback. Téměř okamžité
aktualizace jsou požadovaný směr, nikoli schválené sekundové SLA. Dále rozhodnout,
zda počítat také starší obsah znovu zpřístupněný moderací či jinou změnou dostupnosti.

## Pořadí, výstupy a podmínky dokončení

| Krok | Výstup | Hranice |
|---|---|---|
| Příprava kontraktu nyní | Tento společný návrh a návaznosti v TODO/BACKLOG/serverovém plánu. | Dokumentační krok; bez změny kódu či živých dat. |
| B2 | Revidovaný runtime, sync při spuštění/obnově, outbox/ack/checkpoint/retry, soukromý přístup a úklid. | Podle kapacitních výsledků; neaktivovat starý 10s trigger ani neověřenou kapacitu úklidu. |
| B3 | Úplný potvrzený read snapshot, globální unread-first pouze v Nejblíž a stabilní stránky. | Reference musí ověřit celé okolí, ne jen jednu stránku. |
| B4 – metadata a přenos rozdílů | Verze pokrývající obsah, porovnání bloků a manifestu stránky, bezpečná reuse cache, dávkové srovnání při starém bodu. | Nejprve konkrétní schéma/writery/náklady a lokální ověření; potom kontrolovaný DEV rollout. |
| B4 – signály a číslovka | Úsporná detekce, přesný osobní počet do 99+, bezpečný reset a souběh s refresh. | Zvolit a změřit čerstvost/slučování/fallback; společná DEV akceptace. |
| Kapacitní brána | Zátěžový profil a cloudový důkaz pro schválený cíl celé aplikace. | Před veřejným MVP; konkrétní prostředí, fixture a nákladový limit testu zvlášť. |

Sdílenou serverovou cache neměnných bloků, další přednačítání nebo rozdělení
horkých zápisů přidat podle naměřeného přínosu. Co bude potřebné pro kapacitní
cíl, je podmínkou před MVP; další optimalizace mohou následovat později.
Nepředpočítávat automaticky samostatnou kopii feedu každému ze 100 000 účtů.

Pro každý implementační úsek doložit rozdíl oproti referenčnímu výsledku,
reads/writes včetně kontrol a retry, indexové operace, přenosové bajty, paměť,
počty odběrů, studenou/teplou odezvu a úklid. Započítat i zápisovou amplifikaci
nových verzí, signálů a historie, nejen levnější refresh. Čerstvější číslovka
nesmí být vydávaná za bezplatnou.

Regrese musí pokrýt nezměněný refresh, několik nových/změněných karet,
samostatné čítače, smazání/moderaci/expiraci/účtový R5 purge, různé UID a filtry,
poškozenou/chybějící cache, propadlou deltu, ztracenou odpověď/reconnect a změny
vzniklé během obnovy. Zachovat další stránku bez skoku scrollu a potvrzený
restart/erasure přečtení. Úspěch pro jednu oblast není důkaz celé kapacity.

## Schválení a nejbližší implementační krok

<a id="b2-client-foundation"></a>

### Konkrétní první úsek B2: hranice fronty a trvalé pokračování

**Vlastník tento konkrétní lokální úsek schválil; implementace, místní
kontroly i přesné CI jsou hotové.** Výchozí průzkum našel timer v
`read_sync_controller.dart`, samostatný resume pull v `ReadSessions` a pouze
paměťový kurzor. Níže je zachovaný schválený rozsah; výsledky následují.
Navazující [transport/admission](FEED_READING_POLICY.md#b2-runtime-implementation)
je nově připravený lokálně, serverový úklid a aktivace nadále zbývají.

- V `read_sync_controller.dart` a `read_tracking_controller.dart` zrušit
  automatický 10s upload a pull při pouhém návratu do popředí. Synchronizaci
  spouštět při založení přihlášené relace/spuštění a výslovně při skutečné
  obnově feedu. Průběžné místní značky jen plní trvalou frontu. Hotový transport
  se nezapíná, globální syncFactory zůstane null.
- V `read_state_store.dart` a `indexed_read_state_store.dart` připravit atomicky
  zachycené pořadí outboxu: serveru dál odchází nejvýše 32 značek, ale klient
  zpracovává jen frontu do zachycené hranice. Pozdější čtení zůstane na příště.
  Pro stabilní pořadí použít technické rostoucí sequence místo samotného času
  zařízení, aby stejné milisekundy nebo posun hodin neporušily hranici.
- IndexedDB posunout na v3 s pořadovým indexem outboxu a metadaty průběhu.
  Upgrade z v1 i v2 musí být atomický a zachovat značky, pending stav i erasure
  fence. Nejde o novou retenci, veřejná data nebo ukládání celých Shoutů.
- Import download stránky a její checkpoint uložit v jedné místní transakci.
  Uchovat projekt/UID, inkarnaci synchronizace, hranici fronty, revizi a kurzor;
  bránit přepsání novějšího postupu jinou kartou či opožděnou odpovědí.
  Při restartu pokračovat použitelným checkpointem, při odmítnutém/propadlém
  začít bezpečný snapshot při zachování přečtení. Nové uploady nesmějí vést
  k označení neodpovídajícího starého snapshotu za úplný pro novou obnovu.
- Odlišit dokončení zachycené fronty, odložené značky, úplný download a chybu.
  Slučovat souběžné požadavky bez ztráty nově požadované hranice obnovy;
  po zániku obrazovky, změně UID nebo erase nedovolit pozdní import/ack.
  Nezavádět nekonečný retry či skrytý periodický polling. Síťová chyba zachová
  postup; úplnost pro budoucí B3 se nesmí tvrdit při odložené části.
- Memory adapter, cílené Flutter regrese a skutečné Chrome/IndexedDB testy
  musí pokrýt více než 32 / 1 000 čekajících značek, nové značky během běhu,
  souběžné karty, stejný/vracející se čas zařízení, upgrade v1/v2, cold restart,
  ztracenou odpověď, opakování, prázdnou nefinální stránku, erase a změnu účtu.
  Změřit lokální průchod frontou a doložit, že další dávky nezačínají sken od
  prvního záznamu pokaždé. Zahrnout dokumentaci, commit/push a přesné CI.

Návratový web pro budoucí rollout musí umět v3 a smazat i nové checkpointy;
staré v1/v2 buildy po upgradu nejsou automaticky kompatibilní rollback.
Zatím bez nasazení, živých dat/účtů, nových Functions nebo zapnutí transportu,
změn Rules, serverových limitů, Scheduleru, retence, B3 pořadí či B4 číslovky.
Navazující runtime návrh musí zvlášť vyřešit admission pro velkou frontu,
propojení s obnovou feedu a nákladově omezenou kapacitu úklidu.

<a id="b2-client-results"></a>

### Výsledky klientského základu B2

- `ReadSyncCheckpoint` a oba store adaptéry mají lokální epoch/CAS ochranu,
  pořadový outbox a omezené pokračování. Shodné či vracející se hodiny nemění
  zachycenou hranici; pozdější značky čekají na další výslovnou obnovu.
- `ReadSessions` čeká na zápis již zaznamenaných RAM značek, ale ne na
  nekonečný přísun nového čtení. Chyba disku zastaví hranici před sítí.
  Startup odložený skrytou aplikací proběhne jednou při prvním zobrazení;
  běžný návrat do popředí žádné cloudové operace nespouští.
- Upload pokračuje bez 10s timeru po dávkách nejvýše 32; pracovní odmítnutí
  může dávku půlit, ostatní chyby nevytvářejí automatický nekonečný retry.
  `uploadComplete`, `snapshotComplete` a `synchronizationComplete` odlišují
  odložené značky, úplný cloudový snapshot a dokončení zachycené hranice.
- Import a download checkpoint jsou jedna místní transakce. Nový epoch
  jiné karty odmítne starý import/ack bez částečného zápisu. Po cold restartu
  se dokončí konzistentní snapshot a jedním delta průchodem dorovná jeho novější
  stav. Po nových místních značkách se nepoužije neodpovídající starý kurzor.
  Odmítnutý propadlý kurzor umožní jeden bezpečný restart, ne opakující se smyčku.
- Dokončený checkpoint se maže; známá úplná revize dál zůstává pouze v paměti
  relace. Místní technické sequence/epoch chrání proti starým operacím. Erase
  vyčistí records/outbox i veškerá meta a ponechá jen příznak erased.
- IndexedDB v3 zachovává v1/v2 značky, potvrzený stav, cooldown a erasure fence;
  odstraní osiřelé queue položky. Chrome test chyby během backfillu prokázal
  rollback dříve vyžádaných clear operací i zachování v2 a původních dat.

Místní kontroly: **369 Flutter / 16 skutečných Chrome/IndexedDB**, cílená
klientská sada 39 testů. V3 fronta 1 025 položek: 33 dávek, 1 025 zpracovaných
řádků, pozdější značka zůstala pending. Poslední Chrome průchod trval 593 ms
bez seedování; nejde o SLA, velikost disku ani cloudovou latenci. Oba typy
časového posunu, souběh účtů/karet, síťový výpadek, restart, změna UID,
zánik a erase jsou pokryté. Důkazy: build/b2-client-full-final.log,
build/b2-boundary-browser-complete.log a build/b2-boundary-targets-final.log.
Zdroj `049cedc4cb4ec01b8a24ac93b04e8b9399205290` má
[success CI 43270732252](https://github.com/MikeyBeatz/ShoutOut/actions/runs/43270732252):
369 Flutter, 16 Chrome, 55 tools, 124 Functions unit (421 integračních testů
přeskočeno mimo emulátor), 448 Rules/server, 116 purge, 15 Storage
a formát/analýza/lint/build. CI zopakovalo průchod 1 025 řádků / 33 dávek
za 655 ms bez Firebase čtení či zápisů; jde o lokální IndexedDB měření,
nikoli cloudovou kapacitu. Log: build/b2-client-ci.log.
Tento lokální úsek je uzavřený; živé testy nebyly jeho součástí.

**Hranice:** syncFactory zůstává null, žádný transport/backend/feature flag
nebyl zapnutý. Home stále synchronizaci nečeká jako bariéru B3; serverový
potvrzený read kontext, jeho propojení s obnovou, aktivace admission a úklid zbývají.
Nenazývat tento krok dokončeným B2 nebo ověřením 5 000 cloudových uživatelů.
V3 migrace se v budoucím webovém buildu týká i lokálního B1, nezávisle na
vypnutém cloudovém transportu: pro první rollout připravit přesný kompatibilní
neaktivní v3 artefakt a rollback, nezaměňovat CI debug build za hotové vydání.

Schválený je směr, plán a výše vymezená lokální implementace. Nejbližší práce
po jejím dokončeném CI navazuje [schválená serverová obsluha](FEED_READING_POLICY.md#b2-runtime-implementation)
a dosud nepřipravený fyzický úklid; pro další změny uvést rozsah,
testy a provozní dopady. Samotné zapsání tohoto dokumentu nepovoluje živý
backfill, novou placenou službu, změnu retence, oprávnění nebo cloudový test.
Žádné nové číselné limity ani kolekce se tímto nezavádějí.

Referenční podklady k mechanismům, nikoli důkaz implementace ShoutOut:
[Firestore realtime a vysoká zátěž](https://firebase.google.com/docs/firestore/real-time_queries_at_scale),
[účtování odběrů](https://firebase.google.com/docs/firestore/pricing).
