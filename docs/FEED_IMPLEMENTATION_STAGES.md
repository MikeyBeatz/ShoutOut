# Feed – implementační etapy a návrhy ke schválení

31. října 2026. **Návrh, nikoli souhlas s implementací.** Navazuje na
[analýzu současného kódu a celého cílového chování](FEED_READ_REFRESH_PLAN.md)
a [původní nezměněné zadání](requests/FEED_READ_REFRESH_2026-10-31.md).
Uživatel požádal o rozdělení práce s ohledem na dokončení stabilního MVP.

## Doporučený rozsah

Před MVP dokončit prostorový feed a připravit hranice pro jeho budoucí rozšíření.
Po MVP dodat personalizaci přečtením a číslovaný indikátor novinek. Odklad
nesmí zneplatnit původní zadání: jeho požadavky zůstávají akceptací etapy B,
nejsou vydávané za již splněné vlastnosti etapy A.

Příprava znamená oddělený zdroj stránek, relaci, řadicí pravidla a rozhraní pro
budoucí osobní metadata. Neznamená předem zapisovat přečtení, budovat cloudovou
historii, spouštět polling ani vytvářet nevyužité kolekce/indexy. Pozdější
unread-first bude nadále vyžadovat backendové rozšíření; úplnou absenci budoucích
změn ani jejich nulovou cenu neslibujeme.

## A – před MVP

| Etapa | Konkrétní výstup | Podmínka dokončení |
|---|---|---|
| A0: celý obsah | Feed si zachová krátkou kartu; v detailu bude celý nadpis a text. Parametr/varianta zobrazení nebude měnit ostatní použití karty. | Dlouhý text a nadpis jsou skutečně dostupné, včetně mobilu a zvětšeného písma; současné reakce, komentáře a soukromé odpovědi fungují. |
| A1: smlouva stránek a omezený lokální prototyp | Popsané typy relace/stránky/kurzoru, porovnání prostorových strategií a měření na syntetických datech. | Správné výsledky proti úplnému referenčnímu seřazení, popsané náklady a limity pro všechny čtyři dnešní režimy. Žádné Firebase migrace nebo placená nová služba. |
| A2: prostorové načítání | Serverové stránky podle polohy/filtrů s ověřením Auth a App Check, napojení přes DEV přepínač, stabilní seznam. | Místní Shout nezmizí kvůli 50 novějším vzdáleným; stránky nemají duplicity ani falešný konec při vyčerpání pracovního rozpočtu; dodržený schválený nákladový limit. |
| A3: obnova a regrese | Ruční tlačítko „Obnovit“ bez čísla; bezpečná výměna relace a návrat nahoru po úspěchu. | Chyba ponechá starý feed/scroll, opakované kliknutí sdílí jednu obnovu; CI a živá DEV regrese běžného i Business účtu projdou. |

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

Po A3 navázat stávajícím plánem uzavření přímých obsahových zápisů v Rules,
dalšími otevřenými milníky a veřejným MVP. Na celou etapu B kvůli tomu nečekat.

## B – po MVP, samostatná rozšíření

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

### Doporučené budoucí produktové volby

- Unread-first použít pro režim Nejblíž; Top/Končící/Sledované zachovat jako
  samostatné režimy. Je to navržené upřesnění původního zadání, ne tiché schválení
  toho, že se unread-first má automaticky týkat všech režimů.
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

## Co schválit nyní

| Návrh | Doporučení | Co znamená souhlas |
|---|---|---|
| R1: rozsah vydání | A0–A3 před MVP, B1–B4 po MVP | Začít A0 a lokální A1. Po A1 znovu předložit konkrétní serverovou variantu, limity a indexy před A2; nejde o souhlas s libovolnou cenou nebo migrací. |
| R2: poloha pro MVP | Poslední známý bod s upozorněním, jinak výzva k získání polohy | Schválení popsané změny fallbacku v A2. Alternativa: navrhnout ruční výběr města, který zvětší rozsah. |
| R3: budoucí řazení | Unread-first jen v Nejblíž, ostatní režimy zachovat | Produktový směr pro B3. Není to souhlas s dnešní implementací přečtení ani celou cloudovou synchronizací. |

R2/R3 lze rozhodnout později; jejich neuzavření neblokuje oddělenou opravu A0
a lokální porovnání A1. Před dotčenou implementací se nesmějí považovat za schválené.

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
