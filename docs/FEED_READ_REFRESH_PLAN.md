# Feed: přečtení, stabilní stránky a ruční obnovení

**Následné rozhodnutí vlastníka:** první stránka se nesmí připravovat úplným
průchodem okolí. Platí [progresivní směr a nové výsledky](FEED_PROGRESSIVE_PLAN.md).
Původní srovnání níže zůstává referencí, ne zvoleným živým algoritmem.

Zapsáno 31. října 2026. Stav: požadavek zařazený do plánu, předběžná technická
analýza; vlastník následně rozhodl o celém rozsahu před MVP a unread-first
pouze v Nejblíž. R2 následně schválil: poslední bod v otevřené aplikaci s upozorněním, jinak výzva k poloze. [Etapy a rozhodnutí](FEED_IMPLEMENTATION_STAGES.md).
Původní doporučení odložit personalizaci po MVP neplatí. Dílčí technické volby
zůstávají otevřené a uzavírají se před implementací dotčené etapy.
Úplné zadání je zachované [beze změny zde](requests/FEED_READ_REFRESH_2026-10-31.md).
[TODO](TODO.md), [checkboxová evidence](BACKLOG.md#feed-read-refresh) a
[serverová brána](MVP_SERVER_PLAN.md#gateway) na tento dokument odkazují.

## Zařazení a rozsah

Kontrakt relace, pořadí a kurzorů navrhnout před prostorovým stránkováním,
aby měl připravené rozhraní pro osobní metadata. Doporučené rozdělení po diskusi:
vlastník vybral A0–A3 i B1–B4 před MVP, viz etapový plán. Konkrétní serverová
varianta má bránu po A1; datové migrace ani nové provozní volby nejsou tímto
paušálně schválené. Příprava nezaručuje nulové následné změny backendu.

Přibývá jeden otevřený backlogový úkol, nikoli nový milník MVP. Návrh nemění
hotovou retenci potvrzení operací ani 60denní požadavky mazání účtu. Osobní
přečtení není důvěryhodná statistika zobrazení pro autora, karmu či Business;
tyto veřejné metriky zůstávají samostatným požadavkem po MVP.

## Potvrzený současný stav

| Část | Ověřená implementace | Dopad návrhu |
|---|---|---|
| Dotaz | `lib/src/home.dart::_startFeedListeners`: active, createdAt sestupně, limit 50, živý odběr | Nahradit globální proud prostorovým stránkováním a oddělenou detekcí novinek. |
| Poloha | Home dopočítá vzdálenost po načtení dat; bez polohy nyní používá 0 | Nová relace musí mít jasně určený referenční bod a stav bez polohy. |
| Řazení | `lib/src/feed.dart`: radius/kategorie, Nejblíž, Top, Končící, Sledované | Nové povinné pořadí unread/read podle vzdálenosti se musí sladit s těmito režimy. |
| Výjimky | Záporně hodnocené karty se odsouvají za ostatní; Spotlight je samostatný blok | Nelze současně bez vysvětlení slíbit absolutní unread-first a zachovat všechny výjimky. |
| Obsah | `shout_cards.dart`: nadpis nejvýše 2 řádky, text 3; `shout_detail.dart::_shoutCard` používá tutéž kartu bez přepnutí na plný text; nízké hodnocení může skrýt celou kartu | Zpřístupnění plného obsahu je chybějící předpoklad; otevření dnešního detailu nezaručí zobrazení celého textu. |
| Scroll | `CustomScrollView`/`SliverList`; bez feedového stránkovacího kurzoru | Přidat stabilní relaci, klíče položek, append-only stránky a scroll controller. |
| Přečtení | V prohledaném `lib/`, `test/` a Rules není evidence přečtení Shoutů | Současné `readAt` patří oznámením, nesmí se zaměnit za stav Shoutu. |
| Lokální úložiště | Existuje například webový localStorage pro skóre hry | Není připravená databáze přečtení; vhodné úložiště vybrat podle objemu, ne automaticky kopírovat skóre hry. |
| Živé interakce | `shout_live_data.dart`, `live_data.dart`, `live_shout_state.dart` sdílejí aktualizace | Zachovat čítače a stav akcí načtených karet, ale neřadit kvůli nim celý seznam. |

## Požadovaný kontrakt relace

Při úspěšném refreshi nebo nové relaci zachytit UID/projekt, polohu, filtry,
výchozí čas/hranici nového obsahu a snapshot stavu přečtení. Návrh stabilního
klíče pořadí je `(přečteno_při_startu, vzdálenost_od_bodu_relace,
createdAt sestupně, shoutId vzestupně)`. Sekundární pořadí je návrh ke schválení.

Aktuální lokální přečtení se mění okamžitě; klasifikace pro pořadí této relace
zůstává zmrazená i pro další stránky. Přečtení na jiném zařízení může doplnit
lokální evidenci, nesmí během scrollování přesouvat již načtené položky.
Nové Shouty čekají na refresh a nesmějí být propašované do dalších stránek
staré relace. Samotné časové razítko nestačí jako stabilní hranice při shodě
časů nebo souběžném publikování; návrh musí řešit i jednoznačné ID a konzistenci.

Stránky se pouze připojují, ID se deduplikují a kurzor je svázaný s účtem,
filtry, bodem a verzí relace. Změna radiusu, kategorie, řazení či polohy
nesmí potají změnit význam rozpracovaného kurzoru. Zvolený způsob zahájení
nové relace a chování při restartu ještě schválit. Ukládat přečtení neznamená
automaticky trvale ukládat celý feed ani jeho přesnou polohu.

Smazání, expirace, blokace a ztráta oprávnění mají přednost před stabilitou:
znepřístupnit obsah bez přeřazení zbylých položek, zachovat scroll kotvou nebo
placeholderem. Stabilita nesmí udržovat zakázaný obsah dostupný. Změna počtu
palců či příchozí komentář naopak nesmí změnit pozici karty.

## Detekce přečtení

Sledovat skutečně viditelné části relevantního obsahu v aktivním zobrazení,
po odečtení překrytí záhlavím, dialogem či klávesnicí. U krátkého Shoutu vyžadovat
celou viditelnost; u dlouhého sjednocovat skutečně pozorované intervaly obsahu.
Pouhý rozsah mezi nejvyšší a nejnižší scroll pozicí není důkaz: mohl přeskočit
prostředek. Přidat podmínku expozice proti rychlému přejetí; její dobu zatím
neurčovat jako nové produktové pravidlo.

Oříznutý nadpis/text, nerozbalený obsah a karta skrytá hodnocením nesmějí
označení spustit. Nejprve zajistit skutečně plné zobrazení delšího textu v detailu
nebo po rozbalení: dnešní detail dědí ořez sdílené karty. Samotný vstup
do detailu také není důkaz zobrazení celého obsahu. Řešit změnu rozložení/písma,
návrat z detailu, čtečku obrazovky a obsah mimo viditelnou kartu. Po splnění
podmínek aktualizovat RAM a trvalé lokální úložiště, bez přesunu v aktuální relaci.
Dokončené přečtení po restartu zachovat; rozpracované pokrytí a obnovení scrollu
jsou samostatné volby, nikoli automaticky slíbené vlastnosti.

## Předběžný model dat a synchronizace

Lokálně navrhnout úložiště oddělené podle Firebase projektu a UID: přečtené
`shoutId`, případná verze relevantního obsahu a trvalá fronta dosud nepotvrzených
změn. Značku zapsat lokálně hned a dávky synchronizovat při vhodných příležitostech.
Nespoléhat pouze na zavření aplikace; při pádu se tento callback nemusí provést.
Přepnutí účtu musí zrušit staré načítání/synchronizaci a nepřevést historii jinému UID.

Pro cloud porovnat dvě varianty soukromých metadat pod účtem:

- Záznam na Shout: jednoduché idempotentní slučování, ale jeden zápis dokumentu
  na nové přečtení i tehdy, pokud jsou zápisy poslané v jedné síťové dávce.
- Omezené bucket dokumenty s mapou značek: jeden update může uložit více nových
  značek. Vyžaduje deterministické dělení, maximální velikost, práci s konflikty,
  omezení indexů a načítání jen relevantních bucketů. Jeden rostoucí dokument
  celé historie není přijatelný. Názvy kolekcí ani velikost bucketu nejsou schválené.

Preferovaný směr k ověření je lokální databáze a dávková synchronizace omezených
bucketů. Na webu posoudit IndexedDB; potřeba nové závislosti není rozhodnutá.
Sloučení je monotónní sjednocení značek pro stejnou verzi obsahu; zastaralý klient
nesmí přepsat novější mapu. Výpadek po odeslání nesmí ztratit pending změny.
Na druhém zařízení načíst relevantní cloudový stav před klasifikací relace;
offline lze garantovat jen známý lokální stav, nikoli dosud nesynchronizovaná data.

Pravidla musí chránit historii jen pro jejího vlastníka a omezit schéma/payload.
Osobní značka přečtení je klientské nastavení, nikoli serverový důkaz lidského
přečtení. Nezapisovat ji do Shoutu, neposílat autorovi ani nepřidávat veřejný čítač.
Retenci, vypršení značek, smazání účtu a případnou verzi upraveného obsahu navrhnout
samostatně; nepřebírat bez důvodu sedmidenní retenci potvrzení operací.

## Prostorové stránkování: rozhodující omezení

Geohash rozsahy vracejí kandidáty včetně bodů mimo kruh; je nutný výpočet přesné
vzdálenosti a deduplikace překryvů. Seřazení jediné načtené stránky podle vzdálenosti
nezaručuje pořadí celého okolí. Tento rozdíl plyne z použitého indexu a je nutné
jej ověřit proti referenčnímu úplnému výsledku. [Firebase geoqueries](https://firebase.google.com/docs/firestore/solutions/geoqueries).

Navíc server neumí odvodit individuální unread-first jen z veřejného Shoutu
a lokální historie jednoho zařízení. Než vydá první přečtenou položku, musí
ověřit, že nezůstala žádná způsobilá nepřečtená položka v neprohledané části okolí.
Nelze za přečtené potichu připojit později nalezené nepřečtené a stále tvrdit,
že celá relace splňuje zadání.

Technický návrh má porovnat:

1. Úplný relevantní snapshot kandidátů a read stavu při startu, stabilně seřazená
   relace a stránky podle výsledku. Jednoduchá reference správnosti, ale první
   načtení/sestavení stojí úměrně celému okolí; není to automaticky levné řešení.
2. Postupné prostorové hledání s frontierou/dolními mezemi vzdálenosti a
   konzistentním read snapshotem, které prokáže správné vydání další položky.
   Vyžaduje důkaz úplnosti, stav kurzoru a postup při vyčerpání rozpočtu dotazu.
3. Sdílený prostorový index/cache a případnou materializaci relace. Započítat
   jeho zápisy, čtení, invalidaci, izolaci uživatelů a fyzický úklid, nejen levný
   následný výdej stránky. Nepřidávat novou službu bez samostatného rozhodnutí.

Před implementací provést omezené měření/prototyp se syntetickými daty po schválení
jeho rozsahu. Vybrat strategii podle důkazů úplnosti, odezvy a nákladů. Limit 50
ponechat jako velikost jednotlivé stránky, nikoli tichý globální strop okolí.
Při vyčerpání pracovního rozpočtu vrátit rozlišené pokračování/přípravu, nikoli
falešný konec feedu. Žádná varianta ani numerický rozpočet skenování nejsou schválené.

## Počítadlo novinek a refresh

Oddělit od přečtení: jde o unikátní nově dostupné Shouty od posledního
úspěšného obnovení pro tentýž kontext, nikoli všechny nepřečtené. Navržený
směr je omezené inkrementální zjišťování nových kandidátů podle serverové
hranice; načítat jen potřebná metadata. Netahat opakovaně celé tělo feedu.
Pro 99+ stačí prokázat alespoň 100 způsobilých unikátních položek, ne přesný
vyšší počet. Potřebná frekvence kontroly a maximální stáří indikátoru jsou k rozhodnutí.

Zahrnout radius, kategorii, blokace, dostupnost, expiraci a případné další
platné filtry. Prostý count přes geohashové obdélníky může započíst překryvy
nebo obsah mimo kruh; součet globálních čítačů není přesný osobní počet.
Jedna globální čítačová položka ani zápis pro každého příjemce nejsou automaticky
řešením ceny. Označení již dostupného Shoutu jako přečteného nemá počítadlo zvýšit.
Oprávnění či moderace mohou zpřístupnit starší Shout: vlastník musí určit,
zda i takový obsah počítat jako nový, nebo pouze nově publikovaný.

Zjištěné novinky držet mimo aktuální seznam. Přesnou okamžitou čerstvost bez
kontrol změn nelze slíbit; schválit polling, případný omezený listener/index
a chování offline. Četnost pollingů neurčovat bez nákladového modelu.

Refresh slučuje souběžná kliknutí a ignoruje opožděné odpovědi staré relace.
Připravit nový snapshot a čtené stavy, teprve po úspěchu atomicky vyměnit seznam,
vrátit scroll nahoru a posunout baseline. Chyba zachová starý obsah, scroll,
přečtení i baseline; nevymazat indikátor při pouhém zahájení požadavku.
Novinky vzniklé během obnovy patří podle konzistentní hranice do nové relace
nebo následujícího počítadla, nikdy se nesmějí ztratit resetem.

## Odhad operací, nikoli cenový slib

Pro jednu relaci označme C počet načtených geo kandidátů včetně překryvů a
falešných shod, Q počet dotazů, B počet čtených read bucketů, A počet opakovaných
kontrol novinek a N počet jejich načtených kandidátů. Dokumentová čtení se
orientačně skládají z geo dotazů `součet max(1, kandidáti_dotazu)`, B a obdobného
součtu kontrol novinek. Přidat účtovaná indexová čtení/agregace, pomocné dokumenty,
ověřování Rules, opakování, případné serverové relace a zachované odběry interakcí.
Neztotožňovat velikost výsledné stránky s účtovanými reads.

Příklad modelu pro 100 nových přečtení: záznam na Shout znamená 100 zápisů,
i při 5 síťových dávkách po 20. Pokud každá taková dávka aktualizuje jediný
omezený bucket, vychází modelově 5 updates; pokud zasáhne více bucketů nebo
potřebuje transakční retry, bude operací více. Není to změřená úspora projektu.
Každý prázdný dotaz má minimální účtování, takže polling napříč buňkami
stojí operace i při nulovém počtu novinek. [Účtování Firestore](https://firebase.google.com/docs/firestore/pricing).

Rozpočet měřit pro řídké i husté okolí, velkou historii, více zařízení a
obnovené připojení. Firestore dokument má maximum 1 MiB; u bucketů zahrnout
i limity indexů a rezervu růstu. [Limity Firestore](https://firebase.google.com/docs/firestore/quotas).
Před schválením vyčíslit i Functions, přenosy a úklid podle skutečného regionu,
počtu aktivních uživatelů a frekvence použití; bez těchto vstupů nelze odhadnout Kč.

## Rozhodnutí před implementací

| Otevřená volba | Proč je nutná |
|---|---|
| Vztah nového řazení k Top/Končící/Sledované | Zadání určuje obě skupiny podle vzdálenosti, dnešní režimy jiné pořadí. Neodstraňovat je automaticky. |
| Nízké hodnocení a Spotlight | Stanovit prioritu/skupiny a rozsah hlavního feedu bez změny Business oprávnění. |
| Relevantní obsah a minimální expozice | Určit text/detail, případné přílohy, přístupnost; komentáře a soukromé odpovědi nepovažovat bez rozhodnutí za povinnou součást přečtení Shoutu. |
| Pohyb, změna filtrů, chybějící poloha | Co vytvoří novou relaci a kdy uživatel potvrdí přepočet; nevkládat falešnou nulovou vzdálenost. |
| Restart a druhé zařízení | Povinná je trvalost přečtení; rozsah cloud sync a pokračování stejné relace/scrollu potvrdit zvlášť. |
| Úprava obsahu a retence historie | Zda změněný obsah znovu znepřečtení a jak dlouho značky držet; nepřidávat limity bez schválení. |
| Čerstvost počítadla a nově zpřístupněný starý obsah | Rozhoduje o správnosti, polling nákladech a uživatelském očekávání. |
| Strategie přesného pořadí a nákladové limity | Rozhodnout až po měření; nesnižovat úplnost na náhodně vybraných 50 kandidátů. |

## Pořadí práce a akceptační zkoušky

Pořadí vydání a schvalovací brány určuje [etapový plán](FEED_IMPLEMENTATION_STAGES.md).
Nejdřív schválit R1 a dokončit A0/A1, podle výsledků zvolit konkrétní A2,
potom A3 a B1–B4. Celé přečtení/synchronizace/počítadlo musí podle R1 vzniknout
ještě před veřejným MVP; A3 bez počítadla je jen mezikrok.
Rozhodnutí o viditelnosti a polling čerstvosti nejsou důvod blokovat A0/A1,
ale před jejich vlastní implementací zůstávají povinná. Původní požadavky na
regresi, nákladové měření a kontrolované rollouty platí pro každou etapu.

Akceptace celého cílového rozšíření B vychází ze všech deseti bodů původního zadání;
celé cílové rozšíření je nyní požadavkem vydání MVP, s upřesněním R3 jen pro Nejblíž.
Samotná dílčí etapa A0 neznamená dokončení tohoto požadavku. Testovat navíc globální
unread/read pořadí přes více stránek (nejen uvnitř jedné), shodné vzdálenosti,
překryvy buněk, starší místní Shout za více než 50 vzdálenými, mnoho nepřečtených,
novinku mezi dvěma načtenými vzdálenostmi, změnu polohy/filtrů, expiraci a smazání,
částečné pokrytí dlouhého obsahu, rychlý skok přes prostředek, skrytý/oříznutý
text, opakované čtení v detailu, změnu velikosti písma, druhé zařízení,
odhlášení během sync, pád/restart, offline návrat a souběžné refresh/stránkování.

## Dotčené soubory při budoucí implementaci

- `lib/src/home.dart`, `lib/src/feed.dart`: zdroj dat, relace, filtry, seznam a refresh.
- `lib/src/shout_cards.dart`, `lib/src/shout_detail.dart`: viditelnost, plný obsah a návrat.
- Nové moduly read store/sync/relace (jména zatím návrh), napojení v `lib/main.dart`;
  případná závislost v `pubspec.yaml` až po výběru úložiště.
- `lib/src/shout_model.dart`, případně `lib/geography.dart`: metadata a stabilní klíče.
- `lib/src/shout_live_data.dart`, `lib/live_data.dart`, `lib/live_shout_state.dart`:
  zachovat sdílené odběry bez zbytečného přenačítání či změn pořadí.
- `functions/` a `tools/prepare_content_functions.mjs`: schválená serverová geo/query
  cesta, kurzory, případný index/relace; `lib/web_environment.dart` a `config/dev.json`
  pro postupnou aktivaci, pokud návrh potvrdí přepínač.
- `firestore.rules`, `firestore.indexes.json`: oprávnění soukromé historie a dotazy;
  testy Rules, Functions a Flutter, lokalizace a odpovídající provozní dokumentace.

Jde o předpokládaný rozsah pro budoucí schválení, nikoli seznam již změněného kódu.
