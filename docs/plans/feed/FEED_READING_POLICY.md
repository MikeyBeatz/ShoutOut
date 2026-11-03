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
Ve skutečném Home feedu tento koordinátor ještě není zapojený.

Lokálně prošlo 21 cílených Flutter testů (11 koordinátor, 7 expozice, 3 řazení)
a 23 cílených emulátorových případů indexu/retence/zápisových cest. Pořadí na
skutečném webu je nasazené z `ca67ebd4fc8dfdf06e65bf72865616dc6eae169b`
po CI `41216198053` na DEV Hosting `42d86a762a74a2dd`. Živý test pod TestBusiness
potvrdil negativní sbalený Shout před běžným v Nejblíž a za ním v Top.
Oba disposable fixtures byly soft-deleted a úklid ověřený v DB i UI; původní
dosah 5 km a Nejblíž obnovené. Důkazy: build/feed-rating-nearest.png a
build/feed-rating-fixture-cleanup.json. Expozice/koordinátor zůstávají přípravou.

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
a živé API zůstávají navazujícím krokem. Historické čtení
nenahrazuje dnešní ověření Auth/App Check a dostupnosti obsahu.

Před živými kolekcemi/klíčem/API zůstávají brány ve
[migrační připravenosti](FEED_MIGRATION_READINESS.md). Retence osobního přečtení,
protokol synchronizace a polling novinek stále potřebují konkrétní návrh.
