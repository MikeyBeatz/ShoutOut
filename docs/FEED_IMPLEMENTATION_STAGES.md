# Feed – implementační etapy a návrhy ke schválení

31. října 2026. **Rozsah rozhodnutý vlastníkem; dílčí technické brány zůstávají.** Navazuje na
[analýzu současného kódu a celého cílového chování](FEED_READ_REFRESH_PLAN.md)
a [původní nezměněné zadání](requests/FEED_READ_REFRESH_2026-10-31.md).
V odpovědích R1–R3 vlastník zvolil celé nové chování před MVP, rozhodnutí
o poloze odložil před A2 a schválil unread-first pouze v Nejblíž.

## Platný rozsah po rozhodnutí R1

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
  Toto mění dosavadní fallback a vyžaduje produktové schválení. Ruční výběr
  města je možná samostatná alternativa, nikoli již schválená funkce.
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
  Rušení dnešního odsouvání špatně hodnocených Shoutů je až volba etapy B.
- Relevantní obsah: vlastní plný nadpis/text Shoutu, nikoli komentáře či
  soukromé odpovědi. Pro případné další přílohy stanovit vlastní pravidlo.
- Doba expozice, interval synchronizace, polling a retence zůstanou samostatnými
  návrhy B1/B2/B4 založenými na měření; nejsou podmínkou zahájení A0/A1.
- Počet novinek nebude počet všech nepřečtených. Před B4 rozhodnout zvlášť,
  zda počítat i starší příspěvky nově zpřístupněné moderací či změnou dostupnosti.

## Výsledek rozhodnutí R1–R3

| Návrh | Rozhodnutí vlastníka | Další krok |
|---|---|---|
| R1: rozsah vydání | „Chci celé nové chování před MVP“ | A0–A3 i B1–B4 před MVP. Začít samostatnou A0, pokračovat A1; konkrétní serverová varianta, limity a indexy mají bránu před A2. |
| R2: poloha pro MVP | „Rozhodnout až před A2“ | Dosavadní návrh fallbacku není schválený; před A2 znovu předložit konkrétní varianty. A0/A1 mohou pokračovat. |
| R3: řazení | „Nepřečtené první jen v Nejblíž“ | Platný směr pro B3; Top/Končící/Sledované ponechat. Neřeší automaticky nízké hodnocení, Spotlight ani numerické parametry. |

Před vlastní implementací B stále uzavřít definici expozice, úložiště/retenci,
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
