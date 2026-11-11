# Přečtení, hodnocení a platnost klientské relace

31. října 2026. Vlastník schválil jednu souvislou sekundu na každou část obsahu
a upřesnil, že negativní hodnocení mimo Top mění sbalení, nikoli časové/prostorové
místo Shoutu. Navazuje na [etapy](FEED_IMPLEMENTATION_STAGES.md).

## Připravené chování

`orderedFeedShouts` zachovává negativně hodnocené položky v běžném pořadí
Nejblíž/Končící/Sledované. Top ponechává současné hodnocení: nejprve ostatní,
potom nízko hodnocené, uvnitř podle likes. Shody řeší createdAt sestupně a ID.
Volitelná readIds skupina se používá pouze v Nejblíž, zachycuje se pro novou
relaci; pozdější změna setu již seřazený výsledek nemutuje. Laboratorní serverový
index používá stejnou politiku, otestované jsou všechny čtyři režimy.

Existující sbalená karta má vysvětlení negativního hodnocení a tlačítko Zobrazit.
Dosavadní prahy se nemění: nízké hodnocení od 10 reakcí a 70 % dislike;
automatické sbalení od 50 reakcí a 80 % dislike, s dosavadní výjimkou pro autora.
Nové rozhodnutí samo neurčilo jiná čísla. Read stav ani počítadlo novinek nesmějí
negativní Shout vyloučit jen kvůli jeho hodnocení.

## Jádro expozice – zatím bez zapojení do ukládání

`lib/read_exposure.dart` sleduje souvislou expozici každého úseku relevantního
obsahu, ne procento jedné obrazovky. Až po celé sekundě započte viditelný úsek;
u dlouhého obsahu spojí takto dokončené úseky. Nestačí rychlé přejetí, několik
kratších návštěv téhož místa ani pouhá návštěva detailu. Nepokrytá mezera brání
dokončení. Čas je monotónní, změna layoutu před dokončením resetuje souřadnicové
pokrytí; inactive/occlusion a nerozbalený či oříznutý obsah ruší čekající expozici.

Jde o otestované transportně nezávislé jádro. **Ještě není připojené ke skutečné
geometrii widgetů, trvalému lokálnímu úložišti ani cloudové synchronizaci.** UI
adaptér musí dodat skutečný viditelný interval celého nadpisu/textu, stav route,
aplikace a ořezu. Nelze jeho přítomnost vydávat za hotové B1/B2. Zatím nikde
nevznikají osobní read záznamy ani nové kolekce.

## Hodinová relace i na klientovi

`FeedSessionController` má pevný monotónní deadline hodinu od zahájení obnovy.
Čas síťové přípravy ani načítání stránek tuto hranici neprodlužují. Po vypršení
nepřipojí ani dříve prefetchnutou stránku, zachová načtené karty a vystaví
needsRefresh. Serverové FeedSessionExpired ošetří stejně. Jen úspěšná obnova
stav resetuje; chyba starého požadavku neoznačí novější relaci za expirovanou.
Od 7. listopadu je tento koordinátor zapojený ve skutečném DEV Home feedu;
[současné nasazení a jeho hranice](FEED_INSTALLATION_AND_ROLLOUT.md#dev-rollout-results).

R5 z 5. listopadu umožňuje při konečném účtovém úklidu zneplatnit relaci
dotčených oblastí dřív. Serverový lokální protokol používá FeedSessionExpired;
načtené cizí karty, přečtení a záložky se tím nemažou. Není to změna běžné
obnovy při publikaci/reakci. [Rozhodnutí a ověření](FEED_INDEX_RETENTION.md#account-retention-proposal).

Lokálně prošlo 21 cílených Flutter testů (11 koordinátor, 7 expozice, 3 řazení)
a 23 cílených emulátorových případů indexu/retence/zápisových cest. Pořadí na
skutečném webu je nasazené z `ca67ebd4fc8dfdf06e65bf72865616dc6eae169b`
po CI `41216198053` na DEV Hosting `42d86a762a74a2dd`. Živý test pod TestBusiness
potvrdil negativní sbalený Shout před běžným v Nejblíž a za ním v Top.
Oba disposable fixtures byly soft-deleted a úklid ověřený v DB i UI; původní
dosah 5 km a Nejblíž obnovené. Důkazy: build/feed-rating-nearest.png a
build/feed-rating-fixture-cleanup.json. Expozice zůstává přípravou; klientský
koordinátor má od 7. listopadu navazující živé zapojení uvedené výše.

## Důkaz pro přenositelný API kurzor

Oficiální Firestore API podporuje historické readTime v poslední hodině i bez
PITR: [ReadOnly TransactionOptions](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/TransactionOptions).
Read-only ověření ve skutečném DEV přes současný Node SDK načetlo dva dokumentové
obrazy téhož zdroje: starý snapshot **2 269 sekund** před požadavkem vrátil geohash
před schválenou opravou, aktuální čtení nový. Nic tím nebylo zapsané.
Lokální důkaz: build/historical-feed-read-proof.json.

To umožňuje před dalším API návrhem ověřit kurzor podepsaný serverem s readTime,
kontextem a polohou přenášenou klientem, bez povinné per-user session v databázi
nebo závislosti na životě serverové instance. Současné view/WeakMap samo není tento
protokol. [Lokální přenositelný kurzor](FEED_PORTABLE_CURSOR.md) již ověřuje
UID/projekt/kontext, hodinový limit a pokračování omezené práce; aktuální hydratace
a živé API byly v pozdější etapě zapojené do DEV (viz aktuální rollout výše). Historické čtení
nenahrazuje dnešní ověření Auth/App Check a dostupnosti obsahu.

Původní brány před živými kolekcemi/klíčem/API zachovává
[migrační připravenost](FEED_MIGRATION_READINESS.md); první DEV přechod je již
doložený v instalačním plánu. Retence osobního přečtení,
protokol synchronizace a polling novinek stále potřebují konkrétní návrh.

<a id="b1-proposal"></a>

## Návrh B1 k rozhodnutí — 11. listopadu 2026

**Stav: vlastník 11. listopadu schválil obě rozhodnutí i celý popsaný úsek.**
Platí retence expiresAt + 7 dní, oddělené zachování při odhlášení a odstranění
při potvrzené žádosti o smazání účtu. Schválené jsou implementace, testy,
DEV web po přesném CI a právě dva čerstvé 24hodinové syntetické Shouty pod
existujícími testovacími účty včetně úklidu. Následující návrh sám není důkaz
dokončeného kódu či nasazení; aktuální checkpoint je uveden níže.
Chybějící živé UI potvrzení Uložených
zůstává otevřené; staré dva fixture jsou uklizené, viz
[checkpoint](FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression).

### Ověřený výchozí stav

- `FullContentExposure` má otestované souvislé pokrytí a jednu sekundu, ale
  žádný skutečný widget ani trvalé ukládání na něj není napojené.
- `ShoutCard` v seznamu ořezává nadpis na 2 řádky a text na 3; detail používá
  `showFullContent: true`. Samotné otevření detailu ani rozbalení ratingu
  proto není dostatečným důkazem přečtení.
- Home sleduje lifecycle pro relaci feedu; v `MaterialApp` nyní není společný
  route observer pro expozici textu a překrytí dialogem.
- Projekt už obsahuje `web`, `crypto` a `shared_preferences`. Evidenci
  přečtení zatím nemá. Existující preference skóre hry nebudeme používat ani měnit.

### Doporučené lokální úložiště

Pro webové MVP použít IndexedDB přes již přítomné `package:web`, s úzkým
rozhraním `ReadStateStore` a paměťovou implementací pro jednotkové testy.
IndexedDB poskytuje klíčované záznamy, indexy a transakce; to odpovídá
potřebě slučovat značky i při dvou otevřených kartách.
[Stabilní specifikace W3C](https://www.w3.org/TR/IndexedDB-2/).
Jde o návrh vhodnosti pro tuto aplikaci, nikoli naměřený výsledek výkonu.

Alternativa přes shared_preferences by znamenala ukládat/slučovat serializované
seznamy a řešit jejich přepis při souběhu. Dokumentace balíčku také upozorňuje
na vlastnosti cache a nezaručenou perzistenci každého zápisu.
[Dokumentace správce balíčku](https://pub.dev/packages/shared_preferences).
Nový databázový balíček ani novou službu B1 nevyžaduje. Mobilní trvalý adaptér
není součástí webového MVP; newebový build musí dál fungovat s vypnutým B1.

Navržený lokální záznam:

| Pole | Účel |
|---|---|
| `schemaVersion: 1` | Řízená změna lokálního formátu. |
| `projectId`, `userId`, `shoutId` | Společný klíč odděluje DEV/produkci i účty. |
| `contentHash` | SHA-256 verzovaného JSON pole `[title, text]`, bez normalizace textu. Značka patří přesnému obsahu. |
| `readAtLocal` | Čas dokončení pro osobní metadata, nikdy důvěryhodný veřejný počet zobrazení. |
| `expiresAt`, `retainUntil` | Deadline převzatý ze zdroje a schválený termín místního úklidu. |
| `pendingSync` | Fronta změn připravená pro B2, v B1 se nikam neodesílá. |

Text, nadpis, souřadnice, profil, e-mail ani tokeny do tohoto úložiště
nekopírovat. UID je jen technická součást oddělení záznamů. Dva prohlížečové
originy mají oddělené databáze: například web.app a firebaseapp.com si B1
nesdílejí; propojení zařízení/originů zajistí až schválené B2.

**Schválená produktová volba:** uchovat značku do `expiresAt + 7 dní`,
aby zůstala dostupná i během dnešního sedmidenního zobrazení expirovaných.
Hodinová obnova feedu ji nemaže. Při odhlášení vyprázdnit paměť a zavřít
přístup předchozího účtu; záznamy ponechat oddělené pro jeho příští přihlášení
na stejném originu do výše uvedeného termínu. Při potvrzené žádosti o smazání
účtu odstranit jeho lokální značky v aktuálním originu. Kvůli souběhu zůstává
jen technická zábrana opětovného zápisu v prázdné databázi pod hashovaným scope;
neobsahuje historii přečtení, text, UID v otevřeném tvaru ani čas přečtení.
Jiné zavřené/offline prohlížeče nelze vzdáleně vymazat samotným B1; jejich
kopie podléhají místní retenci, při pozorované potvrzené žádosti se také vymažou.
Úplná synchronizace a její účtový úklid patří do B2 před veřejným MVP.
Nejde o změnu stávající serverové
60denní retence obsahu. Návrh se týká pouze osobních lokálních značek.

Po termínu záznam logicky nepoužít; fyzický úklid provést průběžně při otevření
úložiště a práci s ním, po malých dávkách kurzoru. Zavřený prohlížeč nemůže
garantovat fyzické smazání přesně v danou sekundu. Vymazání dat prohlížeče,
anonymní režim nebo nedostupná kapacita mohou značky odstranit; B2 později
doplní jejich obnovu z cloudu. B1 samotné nezaručí synchronizaci ani zálohu.

### Napojení na skutečně zobrazený text

1. Pro vlastní nadpis a text měřit skutečný layout po vykreslení. Ověřit
   případný ořez; při neúplně vykresleném relevantním obsahu nedokončit přečtení.
   Flutter poskytuje geometrii textových úseků a detekci vynechaných řádků;
   konkrétní adaptér bude ověřený widget testy, nikoli pouze procentem karty.
   [Geometrie](https://api.flutter.dev/flutter/rendering/RenderParagraph/getBoxesForSelection.html),
   [detekce ořezu](https://api.flutter.dev/flutter/painting/TextPainter/didExceedMaxLines.html).
2. Pokrytí nadpisu a textu převést na relevantní textové úseky bez avataru,
   tlačítek, mezer mezi widgety, komentářů a soukromých zpráv. Zohlednit
   obě osy ořezu, viewport, appbar, klávesnici a spodní composer detailu.
3. Po celou schválenou sekundu musí být úsek viditelný, aplikace aktivní,
   aktuální záložka/route nezakrytá. Dialog, jiná route, skrytá prohlížečová
   karta, ztráta aktivity a dispose přeruší čekající expozici. Změna layoutu
   resetuje dosud nedokončené souřadnicové pokrytí. Nemíchat souřadnice karty a detailu.
4. Po dokončení označit obsah ihned v paměti a zahájit místní atomický zápis.
   Čekání na načtení starších značek nesmí přepsat právě dokončené přečtení.
   Dva pozorovatelé téhož obsahu se sloučí, nevytvoří dva záznamy.
5. Použít události scrollu/layoutu/route a zrušitelný časovač nejbližšího
   dokončení; žádný databázový polling ani trvalé měření všech karet 60× za sekundu.

Pokrýt plný detail ze všech jeho vstupů a společné karty v Home, Uložených,
vlastních seznamech i veřejném profilu. Skrytá ratingová karta se nezapočítá;
po rozbalení musí dál projít stejnou kontrolou úplného textu. Spotlightu
nepřidávat reklamní metriku. Zvětšené písmo, klávesnice a čtečka obrazovky
musí zůstat použitelné; samotný accessibility focus nebude důkazem vizuální
expozice. Žádné nové tlačítko nebo badge přečtení tento úsek nepřidává.

### Restart, chyby a návaznost B2/B3

Lokální upsert je monotónní: přečtení stejného obsahu se samo nevrací na
nepřečtené. Místní `pendingSync` je součást stejné transakce. Při chybě zápisu
ponechat stav v paměti, zachovat dosavadní data, nabídnout neblokující informaci
o nemožnosti uložit stav a zkusit zápis znovu při další vhodné akci/návratu.
Nezavádět nekonečnou retry smyčku. Po restartu načíst pouze namespace aktuálního
účtu; neblokovat kvůli tomu první zobrazení současného nepřerovnávaného feedu.
Opožděná odpověď nesmí změnit jiný účet ani zaniklý pohled.

B1 poskytne samostatné rozhraní značek pro B2/B3. **Nemění pořadí současné
relace, kurzor, serverový výběr ani chování refresh tlačítka.** B3 později
potřebuje úplný konzistentní osobní snapshot, ne pouze lokální readIds první
stránky. Nesmí se tvářit, že samotné B1 splnilo globální unread-first.

### Náklady, ověření a konkrétní rozsah

Samotná evidence B1 přidá **0 Firestore čtení, 0 Firestore zápisů a 0 Functions
volání**: je výhradně místní. Dosavadní feed/detail a jejich odběry dál mají
svůj stávající provoz. Nové lokální zápisy vzniknou jen při dokončení dosud
neevidovaného obsahu, nikoli při každém scroll eventu nebo sekundě zobrazení.
Zápisy více značek lze spojit v jedné IndexedDB transakci; cloudové dávkování
a jeho peněžní cenu navrhnout samostatně až v B2.

Ověření po schválení:

- krátký/velmi dlouhý a oříznutý text, přesná hranice 999/1000 ms,
  rychlé posouvání, částečně viditelné řádky, ratingové sbalení/rozbalení;
- mobilní šířka, text scale, RTL, otočení/změna šířky, klávesnice,
  překrytí dialogem, přepnutí route/záložky/aplikace a zánik pohledu;
- restart, pomalé načtení, dvě souběžné instance úložiště, chyba/abort/quota,
  změna UID/projektu, poškozený záznam a logický/fyzický retenční úklid;
- skutečný webový IndexedDB adaptér v browserových testech, nikoli pouze mock;
  lokální syntetická metadata 100/1 000/10 000 značek pro velikost/čas práce,
  bez vytváření tisíců Shoutů či zápisů do Firebase;
- analýza, build a přesné CI, následně pouze DEV web; ověřit skutečné UI,
  restart a zachování pořadí, nepřipisovat headless/memory testům živý Auth/App Check.

Předpokládané soubory: nové `lib/read_state_store.dart`, webový adaptér a
testovací/nonweb stub, controller a widgetový adaptér expozice; dosavadní
`lib/read_exposure.dart`, `lib/src/shout_cards.dart`, `lib/src/shout_detail.dart`,
napojení scope v `lib/main.dart`/`lib/auth_gate.dart`/`lib/src/home.dart`,
DEV přepínač v `lib/web_environment.dart` a `config/dev.json`, cílené testy
a dokumentace. `config/prod.json` zůstane vypnuté. Nejsou potřeba změny
Functions, Firestore Rules, indexů, Scheduleru nebo stávajících zdrojových dat.

**Živý test schválený spolu s B1:** právě dva nové syntetické
Shouty (krátký a dlouhý, platnost 24 hodin), po jednom pod existujícím
Bright_Otter_182/TestBusiness, vytvořené přes indexový writer až při připraveném
průchodu. Záložky obou účtů umožní současně doplnit chybějící UI kontrolu
Uložených. Test nesmí měnit nebo mazat Auth účty; po ověření uklidit oba
Shouty a jejich přesně vymezená vedlejší data stejnou indexovou cestou.
Produkce, main a stávající obsah se nemění. Samotné schválení tohoto návrhu
neuzavírá A2/A3 ani B1 bez doložených výsledků.

### Schválená rozhodnutí před implementací

1. Potvrdit navrženou retenci `expiresAt + 7 dní` a ponechání oddělené lokální
   kopie při běžném odhlášení; při potvrzeném mazání účtu ji odstranit.
2. Schválit popsanou webovou B1 implementaci s IndexedDB, testy, následným
   DEV webem a dvěma čerstvými testovacími Shouty včetně úklidu. B2/B3/B4,
   jejich cloudová retence/náklady a produkční aktivace tím schválené nejsou.

<a id="b1-implementation"></a>

### Implementační checkpoint 11. listopadu

Práce probíhá na `feature/feed-read-tracking`, od dokumentovaného návrhu
f1c380d; zdrojové změny jsou připravené k commitu a CI, zatím nejsou nasazené. Připravené jsou
model značek, IndexedDB transakce, místní controller/fronta, scope podle UID,
vymazání s trvalou lokální zábranou proti souběžnému obnovení, widgetové
měření skutečné geometrie textu, route/lifecycle a překrytí. DEV přepínač
`localReadTracking` je lokálně zapnutý; produkční soubor se nemění. Hook do
účtové přípravy se volá až po serverově potvrzené žádosti; neprovádí nové
Firebase operace ani změny původních Auth/retencí.

První cílená sada prošla 22/22, rozšířený průchod expozice/store/controller/
widgetů/konfigurace/účtového opakování 55/55 a navazující přesné ořezy i
skutečná Material karta 12/12 widget testů. Plná sada a finální analýza se
ještě dokončují. Test zachytil cyklickou Future v úklidu mapy pending operací;
callbacky load/erase nyní vracejí void a průchod již doběhl. Ořezy kontrolují
skutečný ClipRect a známé konvexní Material tvary, ne jen jejich přibližný
obdélník. Neznámý vlastní ClipPath není důkaz viditelnosti a nezapočítá se.

Webová sada `test/read_state_store_browser.dart` prošla **7/7** ve skutečné
IndexedDB izolovaného headless Chrome: restart, dvě souběžná spojení, hranice
retence, oddělení UID/projektu, poškozený záznam, zavření během otevírání
a vymazání s trvalou lokální zábranou. Je to lokální browserový test úložiště,
nikoli živá aplikace/Auth/App Check. Původní `flutter test --platform chrome`
uvízl ve startu suite i po přesunu souboru do test/; přesnou příčinu startu
Flutter rendereru jsme nepotvrdili. Samotný transakční adaptér je proto
oddělený od Flutter activity wrapperu do `lib/indexed_read_state_store.dart`
a sada běží přes `dart test --platform chrome test/read_state_store_browser.dart`.
Přibyla pouze dev závislost `test` 1.31.0 a její transitive lock; žádný nový
runtime databázový balíček. Název sady nekončí `_test.dart`, proto ji nativní
Flutter discovery nenačítá. CI ji explicitně spouští v samostatném kroku.

Naměřené místní hodnoty ve Windows Chrome (nejde o SLA ani diskovou/cloudovou cenu):

| Značky | Velikost JSON vzorku | Hromadná příprava testu | Dva bodové dotazy | Úklid po 100 položkách |
|---|---|---|---|---|
| 100 | 36 581 B | 17 ms | 1 ms | 28 ms |
| 1 000 | 367 781 B | 71 ms | 2 ms | 470 ms |
| 10 000 | 3 697 781 B | 795 ms | 1 ms | 7 987 ms |

Příprava vzorku používá jednu testovací transakci, neměří jednotlivé produkční
upserty. Úklid je asynchronní po malých transakcích a běží na pozadí,
první zobrazení současného feedu na jeho dokončení nečeká. Vzorek jsou jen
místní značky; žádný z 10 000 Shoutů nevznikl ve Firebase. Zápisy samotného
B1 do Firestore a volání Functions zůstávají nulové.

Celá místní Flutter sada prošla 350/350, cílené nástroje konfigurace 20/20,
finální analýza je čistá a formát 145 souborů souhlasí.
Přidána je samostatná Chrome sada do CI; všechny nové testovací závislosti
jsou pouze dev a lockfile přidal 28 položek bez změny existujících verzí.
Následuje source commit/push a přesné CI, čistý release
a pouze DEV Hosting. Nové živé fixture dosud nevznikly. Nevydávat B1 ani
chybějící UI Uložených za uzavřené. Důkazy rozpracování:
`build/read-tracking-tests.log`, `build/read-tracking-analyze.log`,
`build/read-store-browser.log`, `build/read-store-browser-verbose.log`.
