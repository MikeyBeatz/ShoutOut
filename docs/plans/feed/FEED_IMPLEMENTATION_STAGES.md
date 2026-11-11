# Feed – implementační etapy a návrhy ke schválení

31. října 2026. **Rozsah rozhodnutý vlastníkem; dílčí technické brány zůstávají.** Navazuje na
[analýzu současného kódu a celého cílového chování](FEED_READ_REFRESH_PLAN.md)
a [původní nezměněné zadání](../../requests/FEED_READ_REFRESH_2026-10-31.md).
V odpovědích R1–R3 vlastník zvolil celé nové chování před MVP, rozhodnutí
o poloze nejprve odložil před A2; následně schválil poslední bod otevřené aplikace
s upozorněním, jinak výzvu k poloze. Unread-first pouze v Nejblíž.

## Platný rozsah po rozhodnutí R1

<a id="aktualni-stav"></a>

### Aktuální stav a pořadí integrace

A0 (plný detail) je nasazené v DEV; A1 je dokončený lokální prototyp.
Negativní hodnocení už mimo Top nemění pořadí, ale sbalení. A2/A3 mají
moduly prostorového indexu, historické relace, kurzoru a koordinátoru.
Od 7. listopadu je v DEV skutečně zapojené zabezpečené API, Home, vlastní
uložené Shouty, provozní úklid a aktivní generace feed-v1 ze zdroje ccc879f
po success CI 42358058964. DEV přepínače jsou zapnuté; produkce se neměnila.
Pro oba účty prošel serverový test 50 → 100 → 120 a interakce. Vlastník
potvrdil Business stránkování v UI, platný Auth/App Check potvrzují logy.
Vlastník 10. listopadu potvrdil plovoucí obnovu i oznámení. Před uzavřením
A2/A3 zbývá klientská regrese Uložených; vlastní Aktivní/Expirované i úklid
120 fixture jsou od 11. listopadu uzavřené; [důkazy a checkpoint](FEED_INSTALLATION_AND_ROLLOUT.md#dev-rollout-results).
Konkrétní oprava vlastního seznamu je od 10. listopadu schválená a nasazená
v DEV ze zdroje 4e7e5bd po success CI 42884625807: index READY, getOwnShouts
a web ověřené proti releasu. Živé serverové vlastní stránky 50 + 10 / 50 + 11
prošly. Vlastník potvrdil Business pokračování, palce a mazání; chyba návratu
nahoru při čekání na další stránku je opravená v ce6b07a a po success CI
42890208984 nasazená pouze na DEV web. Navazující 14b7885 po success CI
42902048239 uzavírá kompaktní pokračování za kartami a zámek expired interakcí
v klientu/serveru/Rules. Vlastník potvrdil UI, živé jádro obě testovací identity;
nové dva i původních 120 fixture jsou uklizené. Novější regrese Uložených
`dbf2aad` má success CI 42932603771 a DEV web `de78cfc631c1acc1`; 328 Flutter
a 5/5 cílených serverových testů prošlo. Živé jádro ověřilo oba účty, čeká
krátký ruční UI průchod; dva novější `mvp-saved-20261111-*` už vypršely
a jsou 11. listopadu uklizené včetně záložek/receipt i aktuálního indexu.
[Aktuální checkpoint](FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression).
B1 má lokální jádro
expozice, nikoli úplné označování/synchronizaci přečtení. B2–B4 nejsou hotové.

Účtový DEV klientský přechod, Rules cutover a závěrečný pilot jsou uzavřené
5. listopadu 2026. Lokální dávková příprava 1ba2b4a má success CI 42053726540
a je uzavřená bez živé aktivace indexu.
Maintenance/purge má lokální propojení; R5 pro historii a cache má schválený
lokální protokol s 61/61 cílenými testy a success CI 42076107087. Navazující
moderační regrese a opravy jsou lokálně uzavřené: 35/35 cílených testů a success CI 42107616925.
Navazující R6a–R6e, provozní měření, instalace a query API jsou doložené
v přechodovém plánu; jejich živý DEV výsledek je uveden výše. Po uzavření
právě ověřovaného A2/A3 následují osobní metadata B1–B3 a indikátor B4
se společnou regresí. Původní úplná
příprava okolí před první stránkou není zvolená.
[Progresivní směr](FEED_PROGRESSIVE_PLAN.md), [writeři](FEED_WRITER_INTEGRATION.md),
[migrační brány](FEED_MIGRATION_READINESS.md), [přečtení](FEED_READING_POLICY.md).

Další části zachovávají akceptaci a původní návrhy; časově omezený lokální
souhlas nesmí být zaměněný za aktivaci celé datové vrstvy v cloudu.

Před MVP dokončit všechny etapy A0–A3 i B1–B4: prostorový feed, plný obsah,
osobní přečtení a synchronizaci, unread-first v Nejblíž i indikátor novinek.
Původní doporučení odložit B po MVP vlastník nevybral. Písmena A/B nadále
označují technické části práce, nikoli dvě různá vydání. A samotné nestačí
ke splnění nové akceptace feedu pro veřejné MVP.

Nejdřív oddělit zdroj stránek, relaci, řadicí pravidla a rozhraní pro
osobní metadata. V A0/A1 se ještě nezapisují přečtení, nebuduje cloudová
historie ani nespouští polling či nevytvářejí nevyužité kolekce/indexy. Následné
unread-first bude nadále vyžadovat backendové rozšíření; úplnou absenci budoucích
změn ani jejich nulovou cenu neslibujeme.

## A – základ, všechny etapy před MVP

| Etapa | Konkrétní výstup | Podmínka dokončení |
|---|---|---|
| A0: celý obsah | Feed si zachová krátkou kartu; v detailu bude celý nadpis a text. Parametr/varianta zobrazení nebude měnit ostatní použití karty. | Dlouhý text a nadpis jsou skutečně dostupné, včetně mobilu a zvětšeného písma; současné reakce, komentáře a soukromé odpovědi fungují. |
| A1: smlouva stránek a omezený lokální prototyp | Popsané typy relace/stránky/kurzoru, porovnání prostorových strategií a měření na syntetických datech. | Správné výsledky proti úplnému referenčnímu seřazení, popsané náklady a limity pro všechny čtyři dnešní režimy. Žádné Firebase migrace nebo placená nová služba. |
| A2: prostorové načítání | Serverové stránky podle polohy/filtrů s ověřením Auth a App Check, napojení přes DEV přepínač, stabilní seznam. | Místní Shout nezmizí kvůli 50 novějším vzdáleným; stránky nemají duplicity ani falešný konec při vyčerpání pracovního rozpočtu; dodržený schválený nákladový limit. |
| A3: obnova a regrese | Ruční tlačítko „Obnovit“ bez čísla; bezpečná výměna relace a návrat nahoru po úspěchu. | Chyba ponechá starý feed/scroll, opakované kliknutí sdílí jednu obnovu; CI a živá DEV regrese běžného i Business účtu projdou. |

A3 bez čísla je mezikrok. Před veřejným MVP musí B4 doplnit požadovaný indikátor.
A1 už musí prověřit i budoucí globální unread/read pořadí v Nejblíž na smíšených
stavech přečtení, aby se návrh A2 neopíral pouze o nepersonalizované výsledky.

**Kontrolní brána po A1:** před A2 předložit výsledky, zvolený způsob dotazování,
potřebné indexy a konkrétní limity skenování/relace. Novou službu, trvalé
ukládání polohy či datovou migraci nelze schovat do obecného schválení této tabulky.
Pro velký hustý feed může být nutný dražší index; není předem rozhodnutý.

### Kontrakt navržený pro A1

- `FeedContext`: identita prostředí/uživatele, bod relace, radius, kategorie,
  režim řazení a verze podmínek dostupnosti. Bod se během scrollování nemění.
- `FeedSession`: identifikátor, kontext a jednoznačná hranice obsahu při startu.
  Server musí doložit konzistenci i při stejných časech, souběžném vložení a smazání.
- `FeedPage`: položky, neprůhledný validovaný kurzor a explicitní stav
  `pokračování/příprava/konec`. Velikost výsledné stránky nejvýše 50;
  celkový počet dostupných Shoutů se tím nesmí potichu omezit na 50.
- `FeedOrderPolicy`: pořadí je samostatná část, později rozšiřitelná o snapshot
  osobního přečtení. V MVP se nepředstírá, že server tento stav již zná.
- Další stránky pouze připojovat a deduplikovat. Aktualizace čítačů/reagování
  nemění pořadí. Nové publikace se objeví při obnově, ne skokem doprostřed seznamu.
- V A zachovat Nejblíž, Top, Končící a Sledované, stejně jako současné chování
  nízkého hodnocení a samostatného Spotlightu. Řazení stabilizovat datem a ID
  při shodě hlavního klíče; přesný kontrakt potvrdit ve výsledku A1.
- Všechny výsledky se posuzují podle celého okruhu a současných výjimek,
  nikoli jen podle lokálně seřazené první dávky. U Top/Končící může správnost
  vyžadovat větší průchod než u Nejblíž; prototyp nesmí měřit pouze snadný režim.

### Navržené chování UI pro A2–A3

- Změna radiusu, kategorie nebo režimu je výslovná akce: nová relace a po
  úspěchu začátek seznamu. Při chybě ponechat staré výsledky s jejich starými
  platnými filtry; neukazovat stará data pod nově zvolenými štítky bez upozornění.
- Zjištěný pohyb sám nepřehází feed. Nabídnout „Aktualizovat okolí“; kliknutí
  vytvoří relaci s novým bodem. Bod nesledovat po celou dobu, když to aplikace nepotřebuje.
- Bez dostupné aktuální polohy nabídnout poslední známý bod dané relace,
  pokud existuje, s jasným upozorněním. Jinak výzvu k získání polohy a opakování;
  ostatní sekce aplikace zůstanou použitelné. Nepředstírat všem Shoutům 0 km.
  Vlastník tento fallback schválil v R2. Ruční výběr města není součástí změny.
- R4 schválené: pořadí platí pevně hodinu od otevření/obnovy. Po expiraci
  načtené karty zůstanou, další stránka nabídne obnovu; přečtení a záložky neexpirují.
  [Lokální protokol a ověření](FEED_INDEX_RETENTION.md).
- R5 schválené: konečný účtový úklid může zneplatnit relaci dotčených oblastí
  před koncem hodiny; cizí načtené karty zůstanou a další stránka vyžádá obnovu.
  Přečtení/záložky se nemažou. [Protokol a meze](FEED_INDEX_RETENTION.md#account-retention-proposal).
- Po restartu A vytvoří novou relaci; návrat z detailu/přepnutí karty v otevřené
  aplikaci zachová rozpracovanou relaci a scroll. Trvalé obnovení celého seznamu
  ani přesné polohy mezi restarty se do MVP tímto nepřidává.
- Smazání, expirace, blokace a ztráta přístupu obsah znepřístupní i uvnitř
  relace. Zachovat scroll kotvou/placeholderem, ne přerovnáním ostatních karet.
- Osobní reakce, souhrnné čítače a potřebná dostupnost načtených položek
  zůstanou živé. Při připojování stránek měřit počet odběrů; nelze násobit
  neomezeně dnešní model pro 50 karet. Výběr sdílených či okénkovaných odběrů
  pro viditelné položky musí zachovat správnost při návratu na starší kartu.

### Ověření a náklady A1

Navržený lokální vzorek: 100, 1 000 a 10 000 syntetických Shoutů; řídké/husté
okolí, hranice buněk, shodné vzdálenosti, více než 50 novějších vzdálených
záznamů, kategorie a blokace. Porovnat jednoduchý úplný snapshot a postupné
prostorové hledání; stejné pořadí ověřit proti referenci pro každou stránku.
Prototyp poběží pouze lokálně a nepřidá produkční infrastrukturu či novou závislost.

Výstup: kandidáti přečtení na první/další stránku a refresh, počet dotazů,
velikost kurzoru/stavu, duplicity, latence místního výpočtu a horní meze práce.
Místní čas není zárukou cloudové latence a simulovaný počet není skutečný účet.
Připočíst indexy, opakování, živé aktualizace, případné zápisy a úklid relací.
Po A1 teprve vybrat konkrétní meze a kapacitní předpoklady vůči celkovému
rozpočtu vlastníka 5 000 Kč/měsíc; nepovažovat jej za automatický finanční strop.

Po A3 dokončit B1–B4 a závěrečnou společnou regresi. Uzavření přímých obsahových
zápisů v Rules může následovat po ověření dotčených obsahových toků; nové osobní
read metadata musí mít vlastní soukromá oprávnění. Veřejné MVP na dokončení B čeká.

## B – personalizace a novinky, rovněž před MVP

| Etapa | Obsah | Podmínka zahájení |
|---|---|---|
| B1: trvalé osobní přečtení | Lokální store podle projektu/UID, skutečná viditelnost celého obsahu v kartě/detailu, fronta změn, bez změny pořadí. | Schválená definice relevantního obsahu, doba expozice a přístupnost; volba úložiště a retence. |
| B2: synchronizace zařízení | Soukromé omezené buckety, slučování značek a offline retry, obnova na jiném zařízení. | Měření bucketingu proti záznamu na Shout, bezpečná Rules, smazání účtu a indexy. |
| B3: pořadí nepřečtené/přečtené | Snapshot read stavu celé relace a správné globální pořadí napříč stránkami. | Konzistentní read stav dostupný při přípravě relace; backendové rozšíření znovu ověřené proti referenci a nákladům. |
| B4: indikátor novinek | Oddělené inkrementální zjišťování dostupných novinek, 1–99/99+, atomický reset baseline. | Schválená čerstvost a polling/index strategie s nákladovým rozpočtem. |

B1 může nejprve sloužit pouze na jednom zařízení. Tím ještě nebude dokončené
celé původní zadání. B3 nesmí používat pouze částečnou lokální historii a tvrdit
garantovanou konzistenci mezi zařízeními. Pokud se pořadí B2/B3 změní, tento
dočasný kompromis vyžaduje výslovný souhlas.

### Schválený směr a zbývající produktové volby

- R3 schválené: unread-first pouze v Nejblíž, obě skupiny podle vzdálenosti.
  Top/Končící/Sledované zachovají své řazení. Tato volba upravuje původní zadání
  výslovným rozhodnutím vlastníka, ne předpokladem implementátora.
- U nového Nejblíž skrytou nízko hodnocenou kartu ponechat na jejím místě,
  ale neoznačit ji přečtenou před rozbalením celého obsahu. Spotlight dál
  odděleně; jeho přečtení nevydávat za veřejné započítané zobrazení reklamy.
  Vlastník 31. října schválil odstranění odsouvání mimo Top; hodnocení tam mění jen sbalení.
- Relevantní obsah: vlastní plný nadpis/text Shoutu, nikoli komentáře či
  soukromé odpovědi. Pro případné další přílohy stanovit vlastní pravidlo.
- Doba expozice je schválená: 1 s na každou část. Interval synchronizace, polling
  a retence zůstávají samostatnými návrhy B2/B4 založenými na měření.
- Počet novinek nebude počet všech nepřečtených. Před B4 rozhodnout zvlášť,
  zda počítat i starší příspěvky nově zpřístupněné moderací či změnou dostupnosti.

## Výsledek rozhodnutí R1–R3

| Návrh | Rozhodnutí vlastníka | Další krok |
|---|---|---|
| R1: rozsah vydání | „Chci celé nové chování před MVP“ | A0–A3 i B1–B4 před MVP. Začít samostatnou A0, pokračovat A1; konkrétní serverová varianta, limity a indexy mají bránu před A2. |
| R2: poloha pro MVP | Původně odloženo, následně schválen poslední známý bod v otevřené aplikaci | Bod s upozorněním; bez bodu výzva k získání polohy, ostatní sekce použitelné. Žádné trvalé ukládání polohy ani ruční výběr města tím není schválený. |
| R3: řazení | „Nepřečtené první jen v Nejblíž“ | Platný směr pro B3; Top/Končící/Sledované ponechat. Neřeší automaticky nízké hodnocení, Spotlight ani numerické parametry. |

Expozice je schválená; před dokončením B stále uzavřít úložiště/retenci,
synchronizační a polling strategii a vztah nízkého hodnocení/Spotlightu k pořadí.
Volba R1 není souhlas s libovolnou cenou, migrací ani neomezeným skenováním.

## Předpokládané změny souborů

A0: `lib/src/shout_cards.dart`, `lib/src/shout_detail.dart` a cílené widget testy.
A1: nový čistý modul kontraktu/řazení, lokální syntetický vzorek a testy; konkrétní
jména souborů zvolit při implementaci podle současného rozdělení `part` souborů.
A2/A3: `lib/src/home.dart`, `lib/src/feed.dart`, sdílené živé zdroje, nový serverový
query modul v `functions/`, balení, konfigurační přepínač, potřebné indexy a testy.
Rules měnit jen v předem popsaném rozsahu dané cesty; plošné uzavření následuje
až po regresi. Soubory etapy B jsou vyjmenované v původní technické analýze.

Každý krok ověřit přiměřenými testy a CI. Externí rollout do přesně uvedeného
DEV cíle podléhá trvalému souhlasu a pravidlům vydání; první veřejné vydání
stále vyžaduje celé MVP. Tento plán sám neprovádí žádnou externí změnu.

## Doložený postup

A0: lokálně 204 Flutter testů a čistý analyzátor; commit `b56fbbe`.
A1: [výsledky, kontrakt a hranice měření](FEED_A1_RESULTS.md); deset testů
a 24 syntetických měření prošlo. Serverové stavební bloky A2 a [sdílený index](FEED_BLOCK_INDEX_PLAN.md) jsou
lokálně ověřené; živé query API dosud není zapojené.

Aktuální schválený směr a důkazy: [progresivní feed a náklady](FEED_PROGRESSIVE_PLAN.md).

## Doplnění rozhodnutí 31. října 2026 – expozice a hodnocení

Vlastník schválil **1 souvislou sekundu na každou část** celého nadpisu/textu
v aktivní aplikaci. U dlouhého Shoutu se musí postupně pokrýt všechny části;
rychlé přejetí nebo sbalený relevantní obsah nestačí. Samotný vstup do detailu
není přečtení. Read značka nepřesouvá kartu v aktuální relaci.

Negativně hodnocený Shout zůstává na správném místě podle polohy/času a může
být mezi novinkami i nepřečtenými. Hodnocení mění sbalení s vysvětlením, nikoli
pořadí v Nejblíž/Končící/Sledované. Top nadále používá dosavadní hodnocení.
Navržený text: „Shout je komunitou hodnocen negativně. Pro zobrazení klikněte.“
Dosavadní číselné prahy ratingu se tímto nerozhodují znovu.
