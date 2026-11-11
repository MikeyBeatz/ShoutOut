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

## Jádro expozice a aktuální zapojení

`lib/read_exposure.dart` sleduje souvislou expozici každého úseku relevantního
obsahu, ne procento jedné obrazovky. Až po celé sekundě započte viditelný úsek;
u dlouhého obsahu spojí takto dokončené úseky. Nestačí rychlé přejetí, několik
kratších návštěv téhož místa ani pouhá návštěva detailu. Nepokrytá mezera brání
dokončení. Čas je monotónní, změna layoutu před dokončením resetuje souřadnicové
pokrytí; inactive/occlusion a nerozbalený či oříznutý obsah ruší čekající expozici.

Jde o otestované transportně nezávislé jádro. Od B1 z 11. listopadu je na DEV
webu připojené ke skutečné geometrii widgetů, ořezům, aktivitě/překrytí a
trvalé IndexedDB. Místní značky prokazatelně přežily znovuotevření aplikace.
Cloudová synchronizace ani nové read kolekce ještě nejsou implementované;
to je další B2. [Důkazy B1](#b1-implementation).

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
build/feed-rating-fixture-cleanup.json. Jde o historický test pořadí; novější
zapojení expozice dokládá B1 níže a koordinátor má od 7. listopadu živé zapojení.

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
Živé UI potvrzení Uložených bylo následně při B1 doplněné a všechny tři
testovací skupiny jsou uklizené, viz
[checkpoint](FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression).

### Historický výchozí stav před B1

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
aplikace, návratu do popředí a práci s úložištěm, po malých dávkách kurzoru.
Startup/resume uklidí pouze prošlé záznamy také v namespaces dřívějších účtů,
aniž by je načítal do osobního stavu aktuálního uživatele. Zavřený prohlížeč nemůže
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
f1c380d. Finální zdroj 503eea672db85fb06200115488a4e313cd751d48
je po success CI 43056516730 nasazený pouze na DEV Hosting
47268ed17fd2eebd (11. listopadu 17:26 SEČ). Připravené jsou
model značek, IndexedDB transakce, místní controller/fronta, scope podle UID,
vymazání s trvalou lokální zábranou proti souběžnému obnovení, widgetové
měření skutečné geometrie textu, route/lifecycle a překrytí. DEV přepínač
`localReadTracking` je lokálně zapnutý; produkční soubor se nemění. Hook do
účtové přípravy se volá až po serverově potvrzené žádosti; neprovádí nové
Firebase operace ani změny původních Auth/retencí.

První cílená sada prošla 22/22, rozšířený průchod expozice/store/controller/
widgetů/konfigurace/účtového opakování 55/55 a navazující přesné ořezy i
skutečná Material karta 12/12 widget testů. Plná sada a finální analýza již prošly, výsledky jsou níže. Test zachytil cyklickou Future v úklidu mapy pending operací;
callbacky load/erase nyní vracejí void a průchod již doběhl. Ořezy kontrolují
skutečný ClipRect a známé konvexní Material tvary, ne jen jejich přibližný
obdélník. Neznámý vlastní ClipPath není důkaz viditelnosti a nezapočítá se.

Webová sada `test/read_state_store_browser.dart` prošla **8/8** ve skutečné
IndexedDB izolovaného headless Chrome: restart, dvě souběžná spojení, hranice
retence, oddělení UID/projektu, poškozený záznam, zavření během otevírání
a vymazání s trvalou lokální zábranou. Navazující osmý test dokládá fyzický
úklid prošlých značek odhlášeného účtu, zachování platné cizí značky a lokální
zábrany smazaného účtu. Je to lokální browserový test úložiště,
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
| 100 | 36 581 B | 16 ms | 1 ms | 24 ms |
| 1 000 | 367 781 B | 74 ms | 1 ms | 426 ms |
| 10 000 | 3 697 781 B | 818 ms | 1 ms | 8 245 ms |

Příprava vzorku používá jednu testovací transakci, neměří jednotlivé produkční
upserty. Úklid je asynchronní po malých transakcích a běží na pozadí,
první zobrazení současného feedu na jeho dokončení nečeká. Vzorek jsou jen
místní značky; žádný z 10 000 Shoutů nevznikl ve Firebase. Zápisy samotného
B1 do Firestore a volání Functions zůstávají nulové.

Celá místní Flutter sada prošla 350/350, cílené nástroje konfigurace 20/20,
finální analýza je čistá a formát 145 souborů souhlasí.
Přidána je samostatná Chrome sada do CI; všechny nové testovací závislosti
jsou pouze dev a lockfile přidal 28 položek bez změny existujících verzí.
Základ 82d54a0 prošel CI 43054545920, ale nebyl nasazený. Finální doplnění
úklidu značek dřívějších účtů pokrývá vlastní
[success CI 43056516730](https://github.com/MikeyBeatz/ShoutOut/actions/runs/43056516730):
350 Flutter, 8 Chrome/IndexedDB, 51 tools, 119 Functions unit, 436 Rules/server,
116 purge, 15 Storage a formát/analýza/lint/build. Čistý release a otisky čtyř
souborů na obou DEV originech souhlasí se zdrojem 503eea6. API potvrzuje
18 nezměněných Functions i Firestore ruleset d5193d0b. Návrat webu de78cfc631c1acc1.

Živé ověření má právě dvě nové syntetické karty `mvp-read-20261111-short`
a `mvp-read-20261111-long` pod schválenými existujícími identitami, platnost
24 hodin od přípravy kolem 17:27 SEČ. Dlouhý text má 40 krátkých řádků,
aby i při dodržení dosavadního limitu 220 znaků vyžadoval posouvání.
Živé jádro ověřilo oběma účtům záložky, odebrání/obnovení i replay bez změny;
jde o Admin SDK core, nikoli HTTP/Auth/App Check nebo UI důkaz.
Vlastník potvrdil zmizení krátké karty bez ruční obnovy a databáze potvrzuje
odebrání pod Bright_Otter_182. Následně výslovně potvrdil nepřítomnost odebrané
karty po znovuotevření. Dva read-only IndexedDB výpisy mají shodné obě značky:
short read=true / readAtLocal=1794414568452, long read=true / 1794414596259,
pendingSync=true před/po restartu. To dokládá zachování místního přečtení,
nikoli cloudovou synchronizaci. TestBusiness v tomto originu neměl databázi;
jeho živé přečtení se netvrdí. Oddělení účtů, odhlášení, souběh a smazání
jsou doložené samostatnými lokálními/browserovými testy.

Po potvrzení jsou obě fixture uklizené přes indexWriter.prepareBatch atomicky
se zdroji: 2 kořeny, 3 zbývající záložky a 9 receipt. Aktuální index nemá jejich
metadata, zdroje/receipt mají nulový zůstatek; 37 původních Shoutů má stejná
updateTime. Auth účty se neměnily, rate buckety zachované, historické uzly
podléhají normálnímu GC. Dvě místní testovací značky nejsou ručně smazané
z uživatelova browseru; zůstává jejich schválená retence expiresAt + 7 dní.
**Webové B1 a společná DEV akceptace A2/A3 včetně regrese Uložených jsou uzavřené.**
Celý milník ani B2–B4 tím dokončené nejsou; další je konkrétní návrh B2 ke schválení.

První uživatelovo odebrání záložky mělo v logu start instance asi 3,3 s a
vlastní volání 0,685 s, Auth/App Check VALID. Stejný vzor prvního startu je
u getSavedShouts (asi 2,8 s + 0,713 s). Latence je doložená na serveru,
není to přesný součet celého času browseru. Nezměnily se prostředky ani UX.
Dodatečný opakovaný dotaz na log dostal HTTP 429; původní uložený log je
zachovaný, neprovádět opakované pollingové dotazy.

Důkazy: `build/read-tracking-{ci,deploy,build}.log`,
`build/read-tracking-hosting-proof.json`, `build/read-tracking-environment-proof.json`,
`build/read-tracking-live-{state,proof}.json`,
`build/read-tracking-save-latency-proof.json`, `build/read-tracking-check.js`,
`build/read-tracking-ui-proof.json`, `build/read-tracking-cleanup.log`.
Lokální testy: `build/read-tracking-tests.log`, `build/read-tracking-analyze.log`,
`build/read-store-browser.log`, `build/read-store-browser-verbose.log`.

<a id="b2-proposal"></a>

## Návrh B2 — synchronizace přečtení mezi zařízeními

11. listopadu 2026. **Vlastník schválil retenci, přenos při přihlášení/návratu/
obnově a celý první lokální úsek; výsledky jsou níže.**
B1 a klientská regrese Uložených jsou uzavřené; další závislost je B2 před
globálním unread-first B3. Návrh není důkaz nasazení; živé prostředí se tímto úsekem nemění.
Read-only kontrola potvrdila DEV `(default)`, Standard / FIRESTORE_NATIVE,
europe-west3, historické verze 3 600 sekund a vypnuté PITR.

### Doporučené uživatelské chování

1. Přečtení se uloží místně ihned podle B1. Síť ani pomalý start Function
   nesmějí blokovat posouvání, otevření detailu nebo místní označení.
2. Nové značky posílat dávkově: navrženě nejvýše 32 za požadavek, nejpozději
   10 sekund od první čekající značky v aktivní aplikaci. Další čtení nesmí
   posouvat tento termín do nekonečna. Větší fronta pokračuje dalšími dávkami.
3. Na jiném zařízení načíst stav při přihlášení, návratu aplikace do popředí
   a ruční obnově feedu. Doporučení: bez pravidelného prázdného pollingu.
   Dvě trvale otevřená zařízení si tedy cizí změny převezmou při těchto akcích,
   nikoli okamžitě během nepřerušeného scrollování. Pokud je požadovaná průběžná
   aktualizace, interval je samostatná produktová volba; nyní ji nezapínat.
4. Při výpadku ponechat trvalou místní frontu a bezpečně opakovat; při běžném
   logout ji zachovat odděleně, po změně UID zahodit jen práci v paměti staré
   relace. Odeslání při zavření karty není zaručené, proto je nutná perzistence.
5. Synchronizace nepřehazuje rozpracované stránky. B3 později zachytí potvrzený
   stav pro novou relaci; při neúplném stavu nesmí tvrdit úplné globální pořadí.
   B2 samo zatím nemění řazení ani nepřidává veřejnou značku/počet zobrazení.

### Retence k výslovnému rozhodnutí

Doporučení: cloudová značka má stejně jako B1 logickou platnost do
**expiresAt + 7 dní**. Opakování, pozdější upload ani jiné zařízení termín
neprodlouží. Čas expirace určuje server ze zdroje; klient nemůže prodlužovat
historii. Starý/přepsaný obsah se nemíchá: identita značky je Shout ID a hash
přesného nadpisu/textu. Při potvrzené žádosti o smazání účtu ihned zakázat
cloudové čtení/zápis a obnovu jeho fronty; fyzické odstranění zahrnout do
stávající soukromé fáze po potvrzeném odstranění Auth. Read metadata se
nearchivují jako texty zpráv/komentářů na 60 dní.

Po expiraci značku logicky nepoužít. Navržený fyzický úklid je denní, omezený
s pokračováním, bez nového minutového plánovače a zatím bez TTL. Přesné
zapojení do existující denní úlohy nebo samostatného běhu i jeho kapacitu
určit po měření; nevydávat denní dávku za záruku vymazání v přesné sekundě.
Zavřené/offline lokální kopie podléhají dosavadním omezením B1.

### Serverový kontrakt a ukládání

- Osobní metadata patří výhradně pod vlastní UID; návrh prostoru
  `users/{uid}/readState` a `users/{uid}/readBuckets`. Nepřidávat read stav
  do veřejných Shoutů, indexových bloků okolí, profilu ani statistik autora.
- Značka obsahuje technický klíč, contentHash, serverově ověřenou expiraci
  a termín, serverové potvrzení a verzi. Neobsahuje text, polohu, profil,
  e-mail, token ani důkaz lidského čtení. Klientský čas není veřejná metrika.
- Dva připravované interní kontrakty: potvrzení dávky značek a omezené
  stránkování vlastního stavu. Host až při pozdějším DEV aktivování vyžaduje
  existující Auth/App Check/eligibility kontroly. Přímé klientské cloudové
  zápisy zůstanou zakázané, bez nových rolí.
- Server ověří vlastníka, tvar/velikost dávky a existenci i verzi zdroje;
  klient nesmí pomocí odpovědi zjišťovat cizí nepřístupný obsah. Sloučení je
  monotónní a transakční: opakování potvrzené značky nemění její termín,
  současné dva uploady nesmějí ztratit značky. Ztracená odpověď nesmí násobit
  stav; samostatný receipt pro každý Shout by zbytečně přidával zápisy.
- Odpověď potvrzuje konkrétní klíče/verze. Část fronty označit za doručenou
  až po potvrzení odpovídajícího uploadu; neoznačit mezitím změněný obsah
  ani cizí účet. Neplatné, zaniklé a dočasně nedostupné položky rozlišit
  tak, aby zbytek dávky nezůstal uvězněný za jedinou neodeslatelnou značkou.
- B1 dnes považuje za platnou značku jen `pendingSync == true`. B2 musí
  oddělit platnost přečtení od stavu doručení, jinak by potvrzení false
  přečtení po restartu ztratilo. IndexedDB rozšířit se zachováním starých
  značek, hranic projektu/UID a trvalé zábrany po smazání účtu.
- Pro B3 musí stránkování umožnit úplný potvrzený snapshot, navázaný na
  serverovou verzi/readTime. Další synchronizace nemění starší snapshot;
  historické Firestore čtení není důvod pro neomezené načítání celé historie
  při každém požadavku. B2 nezapíná unread-first ani neposílá historii do kurzoru.

### Rozhodnutí o blocích až podle jednoho místního měření

Doporučený směr je více malých omezených bloků místo jednoho dokumentu
za každý Shout nebo jednoho stále rostoucího dokumentu za celý účet.
Než zafixujeme nové schéma, jeden lokální úsek porovná:

| Varianta | Výhoda | Co zahrnout do nákladů a testu |
|---|---|---|
| Dokument na značku | Jednoduchá reference správnosti a opakování. | Zápis/čtení každé značky, plný snapshot a příslušné indexy. |
| Omezené sdílené bloky | Více značek se může vejít do jednoho čtení/zápisu. | Reálné naplnění, rozdělování, adresář/revize, souběh a úklid. |

Laboratorní kandidát pro blok má nejvýše 128 značek a 64 KiB serializovaného
obsahu; při naplnění se rozdělí podle hashe klíče. Nesmí vzniknout produktový
strop historie, tiché zahazování nebo neomezeně velký kořenový dokument.
V implementaci porovnat jednu referenci s jedním kandidátem, nikoli budovat
dvě kompletní produkční služby. Změřit také přidanou složitost; pokud bloky
nepřinesou prospěch, jejich cenu neskrývat. Konečné schéma a provozní meze
se zapíší podle výsledku před aktivováním nové datové vrstvy.

Vzorek 100 / 1 000 / 10 000 syntetických značek je pouze místní metadata
a emulátor; žádných 10 000 živých Shoutů. Měřit první/inkrementální stažení,
odeslání 1/32 značek, dvě zařízení, replay, restart a úklid. Výsledek obsahuje
všechny zdrojové a kontrolní reads, zápisy bloků/revizí, dělení, retries,
mazání, bajty a časy; počty emulátoru nejsou účet ani cloudová latence.
Pro N značek je ideální dolní mez bloků ceil(N/128), skutečný počet bude
vyšší podle naplnění. Neprezentovat tuto mez jako naměřenou úsporu.

Firestore účtuje operace nad dokumenty: dávka 32 samostatných dokumentů
není jeden placený zápis. Jeden Function požadavek může navíc provést čtení
zdrojů i transakční opakování. Bez naměřených operací a objemu používání
nepřislibovat cenu v Kč ani absolutní rozpočtový strop.
[Účtování Firestore](https://firebase.google.com/docs/firestore/pricing),
[transakce](https://firebase.google.com/docs/firestore/manage-data/transactions),
[indexace velkých map](https://firebase.google.com/docs/firestore/best-practices).

### Konkrétní první implementační úsek k souhlasu

Po schválení výše uvedené retence a načasování: samostatná větev, lokální
slučování/acknowledgement/retry, kompatibilní IndexedDB fronta, emulátorový
serverový kontrakt a jedno srovnání ukládání. Ověřit změnu UID, restart,
offline, dvě zařízení, změnu obsahu, expiraci, request/Auth deletion fence,
transakční rollback i částečně odmítnutou dávku. Prověřit zapojení do účtového
úklidu, který dnes prochází notifications/following/blocked a nové větve
automaticky nevyčistí. Připravit kontrakt soukromých oprávnění a otestovat jej.

Výstup: jedna zvolená implementace, skutečné počty operací, testy/analýza,
source commit/push a CI, výsledky v tomto dokumentu. Zatím bez živých
kolekcí, migrace, TTL/Scheduler změn, nasazení či nových Auth účtů.
Živé zapojení předložit konkrétně po měření včetně cílových Functions,
Rules/indexů, denního úklidu, prostředků, rollbacku a vymezených testovacích dat.
Trvalý souhlas s rutinním rolloutem nenahrazuje schválení této nové datové vrstvy.

<a id="b2-local-results"></a>

### Lokální B2 — výsledky 12. listopadu 2026

Schválený úsek je připravený na `feature/feed-read-sync`. Nejde o živé B2:
DEV stále vydává 503eea6 / Hosting 47268ed17fd2eebd. Operace nejsou exportované
z Functions entry pointů; kontrola obou balíčků jejich nepřítomnost vynucuje.
`ReadSessions.syncFactory` je v aplikaci null. Functions, Rules, indexy,
Scheduler, živá data, Auth i produkce se lokálním úsekem neměnily.

- Zvolený kandidát: `users/{uid}/readState/current` s revizí a
  `readBuckets/d{expiryDay}_r{binaryHashPrefix}`. List má nejvýše 128 značek /
  64 KiB, při naplnění se rozdělí. Větve mají pouze technický prefix/den/revizi,
  nikoli neomezený adresář. Záznamy neobsahují text ani polohu.
- Transakce sloučí dávku, dělení i revizi atomicky. Laboratorní rozpočet je
  200 blokových reads / 128 blokových writes plus revize; překročení nic
  nezapíše. Klient na resource-exhausted zmenší dávku místo zahození historie.
  Provozní meze tím nejsou schválené. Server kontroluje účet/žádost, zdroj,
  hash, expiraci, blokace a smazaného autora. accepted/obsolete/deferred
  umožňují postup i přes neodeslatelnou položku; odložená má místní minutový
  cooldown, nikoli cloudový polling. Retry neprodlužuje termín ani potvrzení.
- Podepsaný kurzor váže UID/projekt, historický readTime, revizi a pozici.
  Prázdná nefinální stránka pokračuje. Po úplném snapshotu v otevřené relaci
  knownRevision při shodě vynechá bloky; při změně se stáhnou pouze novější
  bloky. Po restartu se první snapshot načte celý: samotné číslo není důkaz
  úplné místní kopie. Delta řadí revision + document ID; živé Query Explain
  ani indexové náklady zatím nejsou změřené. Celá historie není v kurzoru.
- IndexedDB v2 přidává transakční outbox s migrací starých pending značek.
  false po potvrzení zůstává platným přečtením, původní čas se nepřepisuje.
  UID, dispose a erase ohradí opožděné odpovědi; fence chrání records/outbox.
  Importovaná historie se neuploaduje znovu. Připravené napojení podporuje
  login/návrat/obnovu a dirty po místním zápisu; desetisekundový termín se
  dalšími čteními neposouvá. Prázdná fronta nevyvolává periodická volání.
- Volitelný readSyncEnabled v účtovém workeru je defaultně false. Zapnutý
  zahrne nové větve do stávající soukromé dávky nejvýše 50 po ověření chybějícího
  Auth; bez soukromé fáze se odmítne. Test zachovává data druhého účtu.
- Stávající Rules obě větve uzavírají. Test ověřuje get/list/create/update/delete
  pro vlastníka, cizí účet, moderátora/seniora/admina/ownera i nepřihlášeného,
  se skutečnými rolemi a právní fixture. Rules se neměnily. Budoucí callable
  wrapper musí vynutit App Check; interní simulace tuto HTTP bránu nenahrazuje.

**Místní porovnání layoutů, nikoli účet nebo cloudová latence:**

| Značky | Reference: zápisy značek / dokumenty snapshotu | Blokové reads při přípravě | Blokové writes + revize | Dokumenty snapshotu |
|---|---|---|---|---|
| 100 | 100 / 100 | 4 | 4 + 4 | 1 |
| 1 000 | 1 000 / 1 000 | 321 | 182 + 32 | 21 |
| 10 000 | 10 000 / 10 000 | 19 817 | 6 968 + 313 | 253 |

Vzorek posílá po 32, má jeden expiry den. Jiné dny/hashe/malé dávky mění
naplnění. Tabulka nezahrnuje account/source/author/blocked kontroly, retries,
indexové položky, Functions, síť ani cleanup. Reference je jeden dokument na
značku, nikoli druhá produkční služba. Při stránce 8 dokumentů je potřeba ještě
11 kontrolních bodových reads na stránku; delta má jiné indexové chování.
Tyto části musí zůstat v budoucí kalkulaci.

Na naplněném vzorku 10 000 přidání jedné značky potřebovalo 8 blokových reads
a 2 writes včetně revize; dalších 32 potřebovalo 103 reads a 30 writes.
Bloky tedy nejsou levnější při každém jednotlivém uploadu. Přínos je hlavně
opakované čtení historie. Emulátorový replay dvou značek měl **0 writes,
ale 11 dokumentových reads**: 5 account + 2 source + 1 author + 1 blocked
(prázdný dotaz) + 1 meta + 1 blok. Nejde o úplnou cenu veřejné Function.

Lokálně prošlo 360 Flutter, navazující slučování souběhu v 11 cílených testech,
10 skutečných Chrome/IndexedDB, 124 Functions unit
(416 integračních testů se bez emulátoru přeskakuje), 49 cílených emulátorových
regresí včetně 42 stávajících účtových případů, 51 tools a analýza/lint.
Debug web byl sestavený a manifest/konfigurace/otisky samostatně ověřené.
PowerShell zachytil informativní Wasm stderr jako NativeCommandError;
samotné sestavení vytvořilo manifest i web, následná kontrola prošla.
Přesné CI finálního source commitu ještě následuje; starší CI B1 změnu nepokrývá.
Důkazy: `build/read-sync-{client,flutter,browser,analyze,emulator,functions-unit,tools,build,layout}.log`
a `build/read-sync-layout-proof.json`. Navazující finální emulátorová sada
ověřuje také odpovědi bez hashového oracle pro skrytý/chybějící/blokovaný zdroj
a upload po expiraci při offline návratu. Živé UI, nové Auth účty ani Shouty se netestovaly.

**Před živým B2 zbývá:** callable transport/runtime/limity, indexace, denní
omezený fyzický úklid, kapacita/retry a vymezený DEV pilot. Kvůli IndexedDB v2
nejprve připravit kompatibilní neaktivní webový základ pro návrat. Stará B1 verze
otevírá DB explicitně jako v1 a po migraci není plně kompatibilní rollback;
staré karty potřebují obnovu. Chyba místní evidence neblokuje zbytek aplikace.
Neslibovat návrat na 503eea6 bez tohoto omezení. Root readState drží technickou
revizi, nikoli historii textů; jeho odstranění je svázané s účtem.
B3 musí respektovat contentHash a nezaměnit starou verzi Shout ID za současný
přečtený obsah. Tyto navazující živé/provozní kroky se nyní neprovádějí.
