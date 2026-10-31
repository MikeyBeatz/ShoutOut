# A1 – lokální kontrakt feedu a výsledky prototypu

31. října 2026. Navazuje na [etapy](FEED_IMPLEMENTATION_STAGES.md).
**Lokální experiment A1 dokončený; nejde o serverovou implementaci A2 ani o celý milník MVP.**
Runtime ověření: Node 22.23.4, deset testů. Modul není importovaný aplikací ani Functions.

## Reprodukce a vymezení

- `node --test tools/feed_prototype.test.mjs`
- `node tools/feed_prototype.mjs` nebo `npm --prefix tools run prototype:feed`
- Kompletní nástrojová sada: `npm --prefix tools run test:tools` (zahrnuje prototyp).

Bez Firebase připojení, nových závislostí, osobních dat, migrací a placené služby.
Mřížka 1 km je parametr experimentu v kartézských kilometrech, nikoli návrh
produkční přesnosti geohashe. Body nejsou zeměpisná šířka/délka; póly,
antimeridián a sférické vzdálenosti musí ověřit až geografický adaptér A2.

Porovnány dvě strategie: úplný globální snapshot a postupné procházení všech
obsazených buněk zasahujících okruh. Druhá strategie filtruje skutečnou
vzdálenost, vyřazené autory, kategorii, expiraci a dostupnost, potom řadí úplný
výsledek. Nedělá chybnou náhradu globálního pořadí řazením každé jednotlivé stránky.
Není implementované časné ukončení podle nejbližší buňky: při Top nebo při
vzdáleném nepřečteném před blízkým přečteným by bez dalšího indexu nebylo správné.

## Kontrakt ověřený experimentem

- Kontext obsahuje projekt/UID, bod, radius, kategorii, režim, hranici relace,
  snapshot blokací, sledovaných a osobního přečtení. Bod se během relace nemění.
- Příprava postupuje omezeným počtem buněk. Stav `preparing` není konec seznamu;
  počet 8 buněk/běh je pouze měřicí parametr, nikoli schválený serverový limit.
- Teprve úplný výsledek vytváří neměnný snapshot členství a řadicích klíčů.
  Stránka vrací nejvýše 50 položek, kurzor a stav `continuation` nebo `end`.
  Celkový počet položek není omezen na 50.
- Kurzor je v experimentu neprůhledný objekt registrovaný konkrétní relací;
  cizí relace/UID/projekt a velikost nad 50 se odmítají. Produkce potřebuje
  autentizovaný token nebo serverovou relaci, verzi filtrů a expiraci. Lokální
  kontrola parametrů není náhradou Auth/App Check ani bezpečnostním auditem.
- Opakování stránky je stabilní; pozdější změny zdrojového pole, čítačů a read
  stavu nemění pořadí. Každá vrácená stránka je kopie, klient nezmění snapshot.
- Reference řazení: Nejblíž podle vzdálenosti; Top podle likes sestupně;
  Končící podle expirace; Sledované nejprve sledovaní a uvnitř podle vzdálenosti.
  Navržený tiebreak je createdAt sestupně a ID vzestupně. Není dosud živým UI.
- A zachovává dnešní odsunutí nízko hodnocených a oddělení čistého Spotlightu.
  Experiment B ověřuje unread-first jen v Nejblíž uvnitř těchto skupin.
  Priorita read skupin vůči nízkému hodnocení zůstává před B3 produktovou volbou;
  experiment ji neschvaluje. Ostatní režimy read stav ignorují.

Časová podmínka createdAt <= boundary sama neřeší souběžný zápis se stejným
časem. Zde členství chrání úplná lokální kopie indexu. A2 musí doložit konzistentní
serverový snapshot při sestavování přes více dotazů; nelze pouze převzít timestamp.
Tombstones a opětovná kontrola oprávnění/expirace pro živě načtené karty rovněž
patří do A2/A3, nikoli do tohoto neměnného laboratorního snapshotu.

## Výsledky syntetického měření

Vzorky 100/1 000/10 000, seed 17, řídký čtverec 100 × 100 km a hustý 4 × 4 km,
radius 5 km, všechny čtyři režimy. Všech 24 případů se shodovalo s úplnou referencí.
Tabulka uvádí Nejblíž; ostatní režimy v tomto algoritmu procházejí stejné kandidáty.

| Vstup | Hustota | Kandidáti buněk | Obsazené buňky | Výsledky | Stránky po 50 | JSON snapshot B |
|---|---|---|---|---|---|---|
| 100 | sparse | 0 | 0 | 0 | 0 | 2 |
| 100 | dense | 100 | 16 | 95 | 2 | 21281 |
| 1,000 | sparse | 5 | 5 | 5 | 1 | 1113 |
| 1,000 | dense | 1000 | 16 | 959 | 20 | 214823 |
| 10,000 | sparse | 105 | 71 | 66 | 2 | 14732 |
| 10,000 | dense | 10000 | 16 | 9599 | 192 | 2150629 |

Řídký vzorek 10 000: 105 kandidátů místo 10 000; hustý 10 000: všech 10 000.
Hustý snapshot měl přibližně 2,15 MB i s krátkými syntetickými řádky. Produkční
texty mohou stav výrazně zvětšit; nelze jej uložit do jednoho Firestore dokumentu
ani posílat celý jako kurzor. Paměť experimentu roste O(N), řazení O(M log M),
kde M je počet platných kandidátů. Počet vydaných tokenů roste s počtem stránek.
Lokální časy se tisknou do JSON, nejsou zárukou latence Functions.

První stránka i obnova zde zaplatí přípravu celého regionu; další stránka už
pouze čte paměť snapshotu. V cloudu přibudou přenos, čtení stavu relace, bezpečné
ověření aktuální dostupnosti a případné zápisy/chunky relace a jejich úklid.
Každá obnova je nová příprava; náklady nelze odvozovat jen od velikosti stránky.

**Buňka není účtovaný Firestore dotaz.** Experiment zná adresář obsazených buněk
předem. Produkce by za adresář platila nebo dotazovala i prázdné rozsahy;
geohashové rozsahy se mohou překrývat a zahrnovat body mimo okruh. Počet kandidátů
zde proto není cloudový účet ani úplná horní mez reálných čtení.
[Oficiální geoqueries](https://firebase.google.com/docs/firestore/solutions/geoqueries)
popisují rozsahy a nutnost odstranit falešně pozitivní výsledky.

## Co testy skutečně doložily

Deset testů zahrnuje 24 měření a 24 kombinací seed/hustota/režim s kategorií,
blokací, sledovanými a smíšeným read stavem; všechny stránky se porovnávají
s referencí a kontrolují se duplicity. Samostatné příklady ověřují správné
řadicí klíče všech režimů, hranice buněk/okruhu a shody, nízké hodnocení,
Spotlight, expiraci, nové publikace, starší místní Shout proti 100 vzdáleným,
vzdálený nepřečtený před blízkými přečtenými, retry a neplatné kurzory.
Neověřeno: cloudové náklady/latence, skutečné geohashe, souběžné serverové dotazy,
Firebase bezpečnost, klientský offline provoz, reálné read store a živé UI A2.

## Kontrolní brána před A2

Výsledek doporučuje pokračovat serverovým geohashovým adaptérem v emulátoru
nad stávajícím `shouts.geohash`, s postupnou přípravou úplného regionálního
snapshotu a explicitním `preparing`. Globální snapshot všech Shoutů nedoporučujeme.
V repozitáři jsou indexy status/createdAt a geografické administrativní oblasti;
pro status/geohash je potřeba připravit a ověřit odpovídající index.
Neprovádět migraci historických dat automaticky: nejdřív změřit pokrytí geohashem.

Před serverovým kódem ještě předložit konkrétní A2 návrh se:

1. R2 již schválené: poslední známý bod jen v otevřené aplikaci s upozorněním,
   jinak výzva k poloze. Ostatní sekce použitelné; ruční výběr města se nepřidává.
2. Hranicí konzistence, formátem a uložením relace/kurzoru, soukromím polohy,
   retencí, limity kandidátů na požadavek i relaci a celkovou horní mezí práce.
3. Chováním po dosažení limitu: zachovat starý feed a říci, že příprava nebyla
   dokončená. Žádné tiché zkrácení či neomezené pokračování na účet uživatele.
4. Měřením pravých geohashů v emulátoru a modelem čtení: kandidáti + prázdné
   rozsahy/překryvy + index entries + oprávnění/read metadata + stav relace,
   zápisy/úklid + živé odběry. Přepočet vůči 5 000 Kč potřebuje očekávaný počet
   relací, obnov a souběžných uživatelů; nejde o automatický strop faktury.

Číselné limity nelze schválit tímto laboratorním parametrem ani odhadem času.
A1 je uzavřený lokální podkrok; A2 zůstává před touto branou a celý feed otevřený.

### Ověřená databáze pro následný návrh

Read-only Firestore API kontrola 31. října: DEV `(default)` v `shoutout-dev-46c81`
je `STANDARD`, `FIRESTORE_NATIVE`, region `europe-west3`, PITR vypnuté.
Produkční databáze se tím neprověřovala. API podporuje pevné `readTime`;
[oficiální kontrakt](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/runQuery)
uvádí poslední hodinu. Lokální typy Node SDK ReadOnlyTransactionOptions ovšem
zmiňují 60 sekund. Délku přípravy/konkrétní SDK postup je proto potřeba ověřit,
nikoli předpokládat, že několik navazujících dotazů má totožný snapshot.
[Účtování](https://firebase.google.com/docs/firestore/pricing) zahrnuje i minimum
prázdného dotazu a podle tvaru dotazu index entries. Simulace tyto náklady neměří.
