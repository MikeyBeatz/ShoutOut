# Progresivní feed – schválený směr a doložená implementace

31. října 2026. Nahrazuje původní úplnou přípravu okolí před první stránkou.
Vlastník po vysvětlení geohashe, stránkování a ceny uvedl „perfektní proveď“.
[Etapy](FEED_IMPLEMENTATION_STAGES.md), [původní zadání](requests/FEED_READ_REFRESH_2026-10-31.md).

## Schválený směr

- Shout obsahuje souřadnice a geohash. Výběr buněk zúží hledání, přesné
  vzdálenosti určí pořadí. Samotná podobnost geohashů není vzdálenost.
- První stránka obsahuje až 50 položek; okolí se rozšiřuje podle potřeby.
  Existující bližší příspěvek musí být zahrnutý už při certifikaci stránky.
- Server řídí správnost pořadí napříč stránkami, klient zobrazuje stabilní seznam.
- Blízko konce připravit pouze jednu další stránku; připojovat bez přerovnání
  předchozích. Návrat z detailu nebo jiné karty nemá spustit nový úplný dotaz.
- Nové publikace nevkládat do rozkoukaného seznamu. Ověřovat pouze změny od
  úspěšného checkpointu; po potvrzení refresh atomicky zahájit novou relaci.
  Přesný interval zjišťování novinek ještě není schválený.
- V neaktivní aplikaci nezačínat další prefetch ani kontroly novinek.
- V Nejblíž nadále nepřečtené před přečtenými, uvnitř skupin podle vzdálenosti.
  Top/Končící/Sledované si zachovávají vlastní význam. Uložení Shoutu zůstává
  stávajícím nástrojem pro návrat k obsahu; nová obdobná funkce se nepřidává.
- R2: poslední bod otevřené aplikace s upozorněním; bez něj výzva k poloze,
  ostatní sekce zůstávají použitelné. Žádné trvalé ukládání polohy tím není povolené.

## Připravený kód, zatím nenapojený na živý feed

### Serverová část

`functions/feed_spatial.js`: příprava po rozšiřovaných kruzích, geohashové
rozsahy z `geofire-common` 6.0.0, přesná sférická vzdálenost a úplná certifikace
kruhu před vydáním jeho položek. Již prohledané rozsahy se odečítají, takže
rozšiřování znovu nenačítá stejné dokumenty. Neprůhledné lokální kurzory,
retry stejné stránky a souběžné požadavky používají stejný rozpracovaný výsledek.

`functions/feed_spatial_repository.js`: Admin SDK adaptér načítá pouze aktivní
Shouty z rozsahu, stránkuje přes geohash a document ID a každý query váže na
stejný `readTime`. Chyba snapshotu nemá fallback na aktuální nekonzistentní data.
Adaptér vrací jen metadata; těla skutečně vybraných karet musí později načíst
navazující transport. I metadata/projection stojí dokumentová čtení.

Tato část není exportovaná jako callable. Nemá Auth/App Check obal, trvalou
serverovou relaci, živý rozcestník buněk ani produkční celkové rate/cost limity.
Její callback dostupnosti musí při skutečném napojení dostat úplná pravidla
blokací, expirace, moderace a Business výjimek. Odsouvání nízko hodnocených vůči
read skupinám zůstává rozhodnutím před B3; experiment ho nesmí svévolně změnit.
Nejblíž není automaticky řešením Top/Končící/Sledované.

Čtvrt kilometru pro úvodní kruh a dávka 51 dokumentů jsou výchozí experimentální
parametry. Neomezují počet dostupných příspěvků ani nejsou schválenými
kapacitními či finančními limity aplikace. Maximální dosah dodá kontext uživatele.

### Klientská část

`lib/feed_session.dart`: samostatný koordinátor drží viditelnou stránku a pouze
jednu připravenou další, slučuje opakované požadavky, deduplikuje ID a chrání
před přimícháním odpovědi staré relace. Změna kontextu proběhne až po úspěšném
načtení; při chybě zůstanou původní položky, kontext, další stránka i novinky.
Připravená stránka se nesmí hlásit k jinému baseline snapshotu.

Rozhraní pro novinky přijímá dostupná/stažená ID a potvrzený checkpoint.
Opakované ID se nepočítá dvakrát, novinky seznam nepřerovnají, neúspěšný dotaz
checkpoint neposune. Úspěšná obnova stav novinek resetuje současně s feedem.
Časování/lifecycle volá vlastník komponenty; žádný interval pollingu se nezapíná.
Koordinátor patří jedné přihlášené relaci. Při odhlášení se musí dispose;
dispose vymaže lokální data a ignoruje dobíhající odpovědi.

**Home/FeedPage zatím používají původní zdroj.** Tento koordinátor není napojený
na widgety, scroll controller, backend endpoint ani trvalý osobní read store.
Živé novinky, serverové řazení a automatický prefetch se tímto ještě nezapnuly.

## Ověření a cena – důležitý neuzavřený výsledek

V izolovaném emulátoru `shoutout-rules-test` prošel test s vložením příspěvku
a změnou řadicího času mezi dotazy. Pinned query vrátil původní členství a čas.
Do DEV ani produkčních dat se kvůli tomuto testu nezapisovalo. Žádné tisíce
živých Shoutů se nevytvářely.

Jednotkové testy porovnávají všechny stránky s úplnou referencí včetně ±180°,
vysokých zeměpisných šířek, úzkých okruhů, smíšeného read stavu, opakování
a omezení práce v jednom kroku. Skutečné účtování index entries a cloudová
latence nejsou měřené; emulátor ani lokální čas je nenahrazují.

| Lokální vzorek | První stránka | Načtená metadata | Dotazy | Z toho prázdné |
|---|---|---|---|---|
| 300 položek, uživatel v rohu mřížky | 50 | 270 | 25 | 14 |
| 300 položek, uživatel uprostřed mřížky | 50 | 300 | 24 | 4 |
| 75 přečtených ve stejném geohashi | 50 | 75 | 42 | 38 |

Čísla jsou práce lokálního repository podle skutečných geohashových rozsahů,
nikoli faktura. Nezahrnují úvodní získání readTime, hydrataci karet, oprávnění,
read metadata, síť a případná účtovaná index entries. I prázdný Firestore query
má minimální cenu čtení. První zkoušené jemné větvení buněk navíc potřebovalo
339 dotazů/100 kandidátů pro první stránku ze 300, proto nebylo zvolené.

**Samotné rozšiřování geohashových dotazů tedy neprokázalo požadovanou úsporu.**
Správné pořadí ano; univerzálně malý počet čtení ne. Hustý geohash stále může
obsahovat mnoho položek a pro přechod z nepřečtených na přečtené je nutný důkaz,
že žádné nepřečtené v dosahu nezůstaly. Tento postup se zatím nemá aktivovat
v živém feedu jako hotové rychlé a levné řešení.

## Další architektonické rozhodnutí

Doporučený návrh je **sdílený prostorový index malých metadat v existujícím
Firestore**, oddělený od celých Shout dokumentů. Jeden indexový blok by obsahoval
více ID, souřadnic, časů a údajů nutných pro dostupnost/řazení. Vyhodnocení read
skupin by pak nemuselo platit samostatné čtení každého celého Shoutu. Vybrané
karty se hydratují až po výběru. Krátká serverová cache bloků může náklady sdílet
mezi uživateli; její invalidace musí odpovídat revizi indexu, ne libovolnému stáří.

To vyžaduje nový odvozený datový model: ohraničené bloky kvůli limitu dokumentu,
adresář buněk a synchronizaci s vytvořením, smazáním, moderací, expirací a
změnami hodnocení/Business dostupnosti. Přibudou indexové zápisy a úklid.
Samotné předběžné napočítání bodů nevynutí levnější celkový provoz pro každý
poměr čtení/zápisů. Dosavadní Rules dovolující některé přímé zápisy jsou také
součástí konzistence, nelze je ignorovat a index prohlásit za úplný.

Před touto podstatnou změnou předložit konkrétní schéma bloků, jejich atomickou
aktualizaci a počet zápisů na každou obsahovou operaci, kapacitní chování,
retenci/soukromí, migraci historických dat a nový nákladový model. Nejprve
lokální implementace a emulátor, bez vytvoření živých kolekcí nebo backfillu.
Externí nasazení vyžaduje splnění pravidel vydání a výslovné rozhodnutí o této
nové datové vrstvě. Nová placená služba ani změna databázové edice nejsou zvolené.

Původní [A2 návrh](FEED_A2_PROPOSAL.md) zůstává pro historii s upozorněním na změnu.
Celý feed a milník serverové brány jsou otevřené; A0 zůstává jedinou novou živou
změnou v tomto navazujícím feedovém úkolu. MVP metrika se tímto podkrokem nemění.
