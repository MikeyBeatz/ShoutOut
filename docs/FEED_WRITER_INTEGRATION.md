# Zápisové cesty před připojením prostorového indexu

Aktuální DEV exspirace z 91d8d9b běží bez aktivního prostorového indexu.
`expireDueShouts` má lokálně ověřený atomický indexWriter adaptér; samotný
maintenance wrapper jej zatím nepředává. Před aktivací živého indexu musí být
writer zapojený i do této volací cesty a ověřený přes celý maintenance tick,
nikoli jen přímé volání helperu. [Stav exspirace](ACCOUNT_AUTHORITY_AND_EXPIRATION.md).

31. října 2026. Vlastník schválil pokračování plánu až k dokončení; nová produktová,
datová a provozní rozhodnutí se nadále předkládají zvlášť. Navazuje na
[model indexu](FEED_BLOCK_INDEX_PLAN.md) a [retenci](FEED_INDEX_RETENTION.md).

## Ověřený stav a pořadí

| Cesta | Současný stav | Potřebná návaznost |
|---|---|---|
| Publikace Shoutu | Serverová `createShout` | Index ve stejné transakci jako dokument a receipt. |
| Reakce na Shout | Serverová `toggleShoutReaction` | Aktualizace likes/dislikes v indexu ve stejné transakci. |
| Mazání autorem/moderátorem | Function i aktivace webu nasazené ve vývoji, Business živě ověřený; další role ještě v regresní matici | Dokončit živou regresi; atomické vyřazení z indexu je ověřené lokálně. |
| Moderace Shoutu | Sdílená klientská cesta pro odstranění používá přepínač `serverShoutDeletion` | Rozhodnutí/report/audit mají vlastní serverový milník, nejsou touto změnou automaticky atomické. |
| Mazání účtu | Klientská cesta stále existuje; DEV pilot navíc serverově skrývá obsah po odstranění Auth a ukládá trvalý průběh | Pilot 3/3 živě ověřený; celý účtový proces a klientské napojení zbývají, indexWriter je živě vypnutý. Neuzavírat Rules dříve. |
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

Aktuální DEV Hosting, stav ručního testu a návazná kontrola historických dat:
[migrační připravenost](FEED_MIGRATION_READINESS.md). Výše uvedené čekání na CI/Hosting
popisuje přípravu prvního rolloutu; aktuální aktivace `3b159f2` již nasazená je.

## Malý lokální úsek – identita žádosti o smazání účtu

Interní `account_shout_hiding.js` si zachytí createTime původní pending žádosti.
Každá transakce ověří nejen UID/status, ale i tutéž inkarnaci žádosti. Smazání
a nové vytvoření pending žádosti tedy ukončí starý běh před dalším skrytím;
nový běh může pokračovat podle nové žádosti. Běžná aktualizace metadat téže
pending žádosti není důvodem k zastavení. Již dokončené transakce se nevracejí.

Testy navíc kontrolují selhání po naplánování indexových zápisů: rozpracovaný
zdroj i historie se vrátí společně, dříve dokončený Shout zůstane konzistentní
a další běh práci dokončí. Jde stále pouze o interní lokální helper, nikoli
exportovaný worker, nasazení nebo změnu stávajícího klientského mazání účtu.
Ověření tohoto úseku: 7/7 cílených testů ve Firestore emulátoru bez přeskočení
a cílený ESLint prošly. Celé CI ani živý průchod nebyly pro tento úsek spuštěné.

## Navazující malý úsek – ověření odstraněného Auth účtu

Interní `hideDeletedAuthAccountShoutsPage` zachytí identitu pending žádosti,
ověří uživatele přes dodaný Admin Auth a teprve při auth/user-not-found spustí
jednu omezenou stránku. Existující uživatel vrací waiting-for-auth-deletion;
ostatní chyby Auth se propagují a nezapisuje se nic. Tento postup Auth účet
nesmaže, nemění žádost, nepřidává uložené statusy ani retenční pravidla.

Identita žádosti se kontroluje i po síťovém ověření: odvolání nebo nové vytvoření
žádosti nepovolí starému běhu skrývat obsah. Výsledky hiding/shouts-hidden
popisují pouze tuto stránkovanou fázi, nikoli dokončení celého smazání účtu.
Interní nízkoúrovňový helper sám Auth neověřuje; veřejný endpoint zatím neexistuje.

Ověření: 11/11 cílených testů bez přeskočení, Firestore emulátor a simulovaný
Auth (existující/chybějící účet, výpadek, změna žádosti během kontroly, pokračování
a replay); cílený ESLint čistý. Skutečný Auth, klientské napojení, převzetí žádosti,
automatické opakování a 60denní úklid tím nejsou dokončené. Bez push, CI a nasazení.

Navazující oprava: důvěryhodně dodané expectedRequestCreateTime se respektuje
už před Auth kontrolou, ne jen uvnitř stránky. Worker tak může zachovat identitu
žádosti při dalších stránkách/opakování; nesmí ji při pokračování načítat znovu
jako novou práci. Dva další emulátorové testy ověřily pokračování stejné žádosti,
odmítnutí staré po nahrazení a souběh dvou běhů bez dvojího skrytí/archivace.
Celkem 13/13 cílených testů a cílený ESLint prošly, bez nového CI a nasazení.
Při tomto kroku zůstalo zpracování události otevřené; lokální návaznost je níže.

## Lokální adaptér události vytvoření žádosti

`account_deletion_event.js` přijímá důvěryhodný snapshot vytvořené žádosti,
kontroluje UID, cestu, projekt a pending obsah. Identitu createTime bere vždy
z původní události, i při opakovaném doručení; nezamění ji za novou žádost.
Zpracuje jednu stránku přes ověřenou Auth bránu. Zastaralou/odvolanou žádost
ignoruje; provozní chyby Auth/DB/indexu propaguje. Pro rozlišení používá typ
AccountDeletionRequestUnavailable, nikoli shodu libovolného textu chyby.

Výstup retry-required rozlišuje čekání na odstranění Auth a zbývající Shouty.
Budoucí trigger jej nesmí pouze vrátit jako úspěch: musí zajistit další pokus
podle dosud neschválené provozní strategie. Výstup shouts-hidden znamená pouze
dokončenou fázi skrytí Shoutů. Adaptér neukládá nové statusy, neodstraňuje Auth,
neplánuje opakování a není exportovaný jako Cloud Function. Celý účtový worker,
trvalý audit, retenční úklid a napojení klienta zůstávají otevřené.
Ověření: 18/18 cílených testů bez přeskočení ve Firestore emulátoru se simulovaným
Auth, včetně redelivery, cizího projektu/cesty, nové/odvolané žádosti a propagace
chyb. Cílený ESLint prošel. CI, živý Auth ani skutečné doručování nebyly ověřené.

Navazující větší lokální úsek již přidává atomický pracovní záznam, zámek,
průběh ve stejné transakci jako každý Shout a omezenou obnovu po pádu. Stav
zůstává oddělený od dokončení celého smazání účtu. [Schéma, 99 cílených testů,
nákladové meze a konkrétní DEV návrh](ACCOUNT_DELETION_DEV_PROPOSAL.md) jsou
připravené. Vlastník následně schválil DEV pilot; dva endpointy a plánovač jsou
nasazené z `ef49f25` po CI `41236718912`, živé čekání/skrytí 3/3, replay,
soukromost a úklid prošly. Aktuální důkazy jsou v odkazovaném dokumentu.
