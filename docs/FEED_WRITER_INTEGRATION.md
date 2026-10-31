# Zápisové cesty před připojením prostorového indexu

31. října 2026. Vlastník schválil pokračování plánu až k dokončení; nová produktová,
datová a provozní rozhodnutí se nadále předkládají zvlášť. Navazuje na
[model indexu](FEED_BLOCK_INDEX_PLAN.md) a [retenci](FEED_INDEX_RETENTION.md).

## Ověřený stav a pořadí

| Cesta | Současný stav | Potřebná návaznost |
|---|---|---|
| Publikace Shoutu | Serverová `createShout` | Index ve stejné transakci jako dokument a receipt. |
| Reakce na Shout | Serverová `toggleShoutReaction` | Aktualizace likes/dislikes v indexu ve stejné transakci. |
| Mazání autorem/moderátorem | Nová `deleteShout` nasazená ve vývoji, aktivace webu čeká na CI/Hosting | Nejprve DEV rollout a regrese, následně atomické vyřazení z indexu. |
| Moderace Shoutu | Sdílená klientská cesta pro odstranění používá přepínač `serverShoutDeletion` | Rozhodnutí/report/audit mají vlastní serverový milník, nejsou touto změnou automaticky atomické. |
| Mazání účtu | `hideActiveShoutsBeforeAccountDeletion` stále stránkuje a mění statusy z klienta | Serverový dávkový postup a index; neuzavírat přímé Rules dříve. |
| Expirace | Lokální indexový prune; současná dostupnost zohledňuje expiresAt | Provozní worker a budget jsou před aktivací nové kolekce samostatnou bránou. |
| Obohacení geografie | Trigger doplňuje `geography`, nemění location/geohash | Není změnou současné indexové projekce. |
| Komentáře/záložky | Jejich souhrny nejsou v řadicí indexové projekci | Bez zbytečného přepisování indexu. |

## Serverové mazání Shoutů

`functions/delete_shout.js` zachovává dosavadní Rules: eligible účet, autor nebo
důvěryhodný moderátor (accountRoles level >= 3 nebo legacy membership), pouze
soft-delete změnou `status`. Zachovává dokument, podkolekce, počty i možnost
odstranit expirovaný Shout. Nepřidává rate bucket, který dnešní Shout Rules nemají.

Auth, App Check, ověřený e-mail, aktuální stav účtu a expectedUserId jsou ověřené
na serveru. Sedmidenní op1 receipt vzniká atomicky se změnou; opakování kontroluje
aktuální oprávnění a nezapisuje status znovu. Nový klíč pro již smazaný dokument
potvrdí požadovaný stav bez přepisování obsahu. Chybějící dokument vrátí not-found.
Cleanup whitelist rozpoznává také deleteShout; zdroj cleanup Function je potřeba
zahrnout při rollout změny tohoto seznamu.

Klient má session-scoped `ShoutDeletionGateway`, sdílí současná kliknutí a drží
stejný pokus při nejasném výsledku. TimedOperationGateway doplní serverový čas
z Auth. Feed/detail/moderace používají společný helper; zapnutá serverová cesta
při chybě nepřechází na přímý zápis. Detail se po chybě nezavře a zobrazí chybu.
`serverShoutDeletion` je volitelný boolean s výchozí false, vyžaduje App Check.

Lokálně prošly: lint, celá Functions sada (71 pass, 89 emulator-only skip),
analyzátor, 24 cílených Flutter testů a šest nových emulátorových scénářů.
Před aktivací je nutné CI přesného commitu, nasadit pouze nový endpoint a
aktualizovaný cleanup do `shoutout-dev-46c81`, potom otestovanou aktivaci webu.
Limity endpointu: europe-west3, min 0 / max 1 instance, concurrency 1,
256 MiB, 15 s. Žádná produkce nebo Rules tímto přípravným krokem změněné nejsou.

## Další kontrola před aktivací indexu

Transakční indexový plán musí nejprve provést všechny své čtení, teprve potom
vrátit zápisový plán volajícímu. Nesmí otevírat vnořenou transakci nebo přepisovat
celý kanonický Shout projekcí metadat. Rollback musí zachovat obsah, index i receipt
společně. Skutečný no-op a replay nesmějí přidávat archivní verze.

Názvy živých kolekcí/generací, migrace, provozní budget a aktivace indexu stále
vyžadují konkrétní návrh a schválení; dřívější lokální souhlas je neurčil.

## Doložený rollout a transakční skládání

CI `41210929174` pro `868bc8904f04798f227a78384dbdb4eec4c0361c` je success.
Z čistého worktree byl připraven a nasazen content artifact hash
`4c1e36b0740665598d6dc5fcc4a18c013ab616fa` pouze pro `deleteShout` a
`cleanupOperationReceipts` do `shoutout-dev-46c81`. Obě ACTIVE; CLI potvrdilo
Node 22, europe-west3, 256 MiB, max 1/concurrency 1, timeout 15/60 s.
Bez tokenů je callable 401 a soukromý cleanup 403. Živá klientská regrese ještě
není důkazem pokrytá. Připravený dev.json zapíná serverShoutDeletion, skutečný
Hosting se tímto samotným commitem nemění.

Laboratorní adaptér má `prepare(transaction, id, before, after, {operationId})`.
Provede pouze čtení a vrátí apply plán pro tutéž transakci; neotevírá vnořenou
transakci a nezapisuje zdrojový dokument. Volitelná důvěryhodná závislost
`indexWriter` v createShout, toggleShoutReaction a deleteShout je aktuálně
využitá pouze v emulátorových testech. Není polem klientského payloadu,
callable wrapper ji nepředává a živé kolekce se nevytvářejí.

Reálné operation testy potvrdily atomickou publikaci/reakci/mazání se zachováním
plného textu, idempotentní souběh, žádné další verze při replay, úplný rollback
obsahu/indexu/receipt/rate při chybě plánu a reakci na expirovaný prune source bez
návratu do indexu. Spolu s předchozími index/retention testy prošlo 22 případů.
Test se souběžným prvním zápisem narazil na emulator lock retry (cca 20 s);
konzistence prošla, není to důkaz přijatelné cloudové latence pod zátěží.

Dávkové mazání účtu a migrace nejsou ještě zapojené. Více změn jedné oblasti
se nesmí slepě plánovat nezávisle nad týmž původním kořenem: přepsaly by se navzájem.
Je potřeba sdílený plán dávky, nebo omezené samostatné transakce s opakováním.
