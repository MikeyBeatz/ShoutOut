# Úsporná obnova feedu, cache a indikátor novinek

12. listopadu 2026. **Vlastník schválil začlenění tohoto směru do B2–B4 před
MVP a přípravu společného návrhu nyní.** Tento dokument je plán, nikoli hotová
implementace nebo schválení libovolného schématu, služby či živé migrace.
Pořadí je příprava kontraktu → B2 → B3 → B4. Technické varianty níže vyžadují
ověření v konkrétním implementačním úseku. Nevzniká další samostatný milník.

[Etapy](FEED_IMPLEMENTATION_STAGES.md) · [aktuální politika přečtení](FEED_READING_POLICY.md#refresh-boundary-policy)
· [kapacitní model a výsledky](../../operations/CAPACITY_AND_SCALING.md)

## Cíl a ověřený výchozí stav

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
- B1 je v DEV, B2 má jen lokální jádro se staršími spouštěči; B3/B4 nejsou hotové.
  Číslo novinek zatím není připojené k živému backendu. Přesné zdroje/CI/nasazení
  určuje [PROJECT_STATUS](../../PROJECT_STATUS.md), ne existence tohoto návrhu.

## Společný kontrakt před další implementací

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

Schválený je směr a jeho zařazení do existujícího plánu. Nejbližší práce zůstává
konkrétní revize runtime B2/úklidu; před zdrojovými změnami uvést přesný rozsah,
testy a provozní dopady. Samotné zapsání tohoto dokumentu nepovoluje živý
backfill, novou placenou službu, změnu retence, oprávnění nebo cloudový test.
Žádné nové číselné limity ani kolekce se tímto nezavádějí.

Referenční podklady k mechanismům, nikoli důkaz implementace ShoutOut:
[Firestore realtime a vysoká zátěž](https://firebase.google.com/docs/firestore/real-time_queries_at_scale),
[účtování odběrů](https://firebase.google.com/docs/firestore/pricing).
