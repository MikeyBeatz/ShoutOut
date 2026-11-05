# Zápisové cesty před připojením prostorového indexu

Poslední ověřená DEV účtová/exspirační vrstva je 96b0782; 91d8d9b je zdroj
původního zavedení exspirace. Běží bez aktivního prostorového indexu.
Lokální maintenance wrapper již předává volitelný indexWriter do expirace.
Také konečný purge má doplněnou kompatibilitu s anonymním kontextem Shoutu;
živý wrapper index stále nezapíná. [Lokální ověření a zbývající retenční brána](#maintenance-purge),
[stav nasazené exspirace](../accounts/ACCOUNT_AUTHORITY_AND_EXPIRATION.md).

Aktualizace 4. listopadu: DEV web/Rules 7ab60c8 už vynucují serverové mazání
účtu/Shoutu; klientské create/delete žádosti a přímé statusové skrytí jsou
uzavřené. Příprava a57ae9b i finalizace a9ff425 jsou nasazené a zapnuté.
Index writer se tímto rolloutem neaktivoval; před živým indexem zůstává nutné
dávkové skládání a pokrytí všech dalších zápisových cest.
Účtový DEV pilot po cutoveru a úklid jsou uzavřené 5. listopadu; žádná fixture nečeká.
[Aktuální účtový cutover a důkazy](../accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#dev-deletion-cutover).

31. října 2026. Vlastník schválil pokračování plánu až k dokončení; nová produktová,
datová a provozní rozhodnutí se nadále předkládají zvlášť. Navazuje na
[model indexu](FEED_BLOCK_INDEX_PLAN.md) a [retenci](FEED_INDEX_RETENTION.md).

## Ověřený stav a pořadí

| Cesta | Současný stav | Potřebná návaznost |
|---|---|---|
| Publikace Shoutu | Serverová `createShout` | Index ve stejné transakci jako dokument a receipt. |
| Reakce na Shout | Serverová `toggleShoutReaction` | Aktualizace likes/dislikes v indexu ve stejné transakci. |
| Mazání autorem/moderátorem | Function i aktivace webu nasazené ve vývoji, Business živě ověřený; další role ještě v regresní matici | Dokončit živou regresi; atomické vyřazení z indexu je ověřené lokálně. |
| Moderace Shoutu | Sdílená cesta pro odstranění používá v DEV povinný server podle DeletionWritePolicy; přímé skrytí Rules odmítnou. | Rozhodnutí/report/audit mají vlastní serverový milník, nejsou touto změnou automaticky atomické. |
| Mazání účtu | Účtové fáze a cutover hotové v DEV. Lokálně ověřené indexové odpočty a konečný purge v celém maintenance ticku. | Před aktivací dořešit osobní metadata ve starých indexových blocích do původního deadline. Runtime indexWriter se nepředává. |
| Příprava mazání účtu | Živá prepareAccountDeletion a57ae9b je zapnutá bez indexu; lokální dávkový plán nejvýše 50 změn z 1ba2b4a má success CI 42053726540. | Před živým indexem zvolit provozní adaptér a aktivaci. Dávkový laboratorní writer se živému wrapperu nepředává. |
| Expirace | DEV materializuje status podle expiresAt bez indexu. Lokálně je předání writeru i atomické vyřazení ověřené přes celý tick. | Provozní adaptér a aktivace indexu; sedmidenní fyzický Shout cleanup zůstává samostatnou otevřenou částí. |
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
Od 7ab60c8 má DEV nad tímto přepínačem povinnou serverovou politiku také pro
nativní kód; mimo DEV zůstává dosavadní přepínačové chování. Následující lokální
počty testů a původní rollouty jsou historie, poslední stav je v PROJECT_STATUS.

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

Původní tato etapa ještě dávkové mazání účtu a migrace nezapojovala. Více změn
jedné oblasti se nesmí slepě plánovat nezávisle nad týmž původním kořenem:
přepsaly by se navzájem. Navazující lokální dávkový plán je popsaný níže;
živý adaptér a migrace nadále zapojené nejsou.

<a id="batch-preparation"></a>

## Dávkový writer přípravy účtu – lokální úsek 5. listopadu 2026

Vlastník po vysvětlení schválil pokračování vývoje a testování: sdílený plán
nejvýše dosavadních 50 Shoutů, volitelné serverové zapojení, pouze lokálně
a v emulátoru. Bez nasazení, migrací, živých kolekcí a nových účtů. Auth/App Check,
oprávnění, payload, dávka 50 a retence se nemění.

Laboratorní adaptér má `prepareBatch(transaction, changes, {operationId,
additionalWrites})`. Přečte marker, každý dotčený kořen a potřebné bloky jednou,
postupné změny skládá nad společnými pracovními kořeny. Všechny čtecí operace
proběhnou před apply plánem. Uloží jen dosažitelné konečné bloky a jeden nový
kořen/archiv původního kořene na změněnou oblast. Jednotlivé prepare deleguje
do stejného mechanismu. Zachovává prunované expirace, historii a původní schéma.
Duplicitní ID a více než 50 změn se odmítnou. Původní laboratorní mez 450 zápisů
nyní zahrnuje celý plán včetně projekčně změněných zdrojů a dodaných dalších
zápisů; pro receipt se rezervuje jeden zápis. Nejde o schválení provozního budgetu.

`prepareAccountDeletionOperation` přijímá volitelný důvěryhodný indexWriter.
Po načtení/validaci celé stránky připraví jediný plán, potom ve stejné transakci
zapíše zdrojové statusy, index a receipt. Chyba plánu/apply/commitu vrátí všechny
zápisy. Chybějící použitelný plán zapnutého writeru je chyba, nikdy fallback na
samotné skrytí. Replay receipt nečte ani nemění index, prázdná stránka writer
nevolá. content.js writer stále nepředává; DEV ani produkční runtime se neměnil.

Konečná cílená sada má 18/18 případů: 14 nových dávkových a 4 původní přípravy.
Před ní prošlo 38 testů indexu, writerů, historie a přípravy. Pokryté jsou jedna/
více oblastí, větvený hotspot se 100 Shouty ve dvou dávkách, přesné zachování
plných zdrojů/potomků, studená starší relace a ochrana před GC, souběžný stejný
požadavek i různí autoři ve stejné oblasti, lost ack/replay/expirace klíče,
rollback, vadný plán, poškozená/stará metadata, prunovaná expirace a vstupní guardy.
107 Functions unit, 42 tools a ESLint také prošly. Nový soubor
feed_batch_writers.integration.test.js je přidaný do celé CI test:rules sady.
Celou konečnou podobu potvrdilo CI níže. Důkazy:
build/feed-batch-{targeted,final-targeted,unit,tools,lint}.log.

Naměřené syntetické případy pro 50 skrytých Shoutů se dvěma cizími kontrolami:

| Případ | Čtení indexového plánu | Nové bloky / kořeny / archivy | Celkové zápisy včetně 50 zdrojů a receipt |
|---|---|---|---|
| Jedna oblast, dávka | 3 | 1 / 1 / 1 | 54 |
| Dvě oblasti, dávka | 5 | 2 / 2 / 2 | 57 |
| Jedna oblast, 50 samostatných laboratorních mutací | 150 | 50 / 50 / 50 | Bez společného receipt; nesrovnávat jako celý callable. |

U samostatných mutací bylo navíc 50 čtení zdroje (celkem 200). Čtení plánu
neobsahují způsobilost účtu, receipt ani výběr zdrojové stránky. Nejde o cloudový
ceník či zátěžový benchmark; velký/fragmentovaný index má jiné počty. Skutečné
provozní limity a náklady zůstávají samostatnou branou před živou aktivací.

Zdroj 1ba2b4ac94ecc6d1f519e168e794172e3260d0aa má úspěšné
[CI 42053726540](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42053726540):
293 Flutter, 42 tools, 107 Functions unit, 389 Rules/server, 15 purge/15 Storage,
analýza/lint/formát/build. Lokální úsek je uzavřený. Nic z něj se nenasazovalo;
živé vrstvy zůstávají podle PROJECT_STATUS. Konečné důkazy:
build/feed-batch-ci.{json,log} a build/feed-batch-local-proof.json.

Aktuální DEV Hosting, stav ručního testu a návazná kontrola historických dat:
[migrační připravenost](FEED_MIGRATION_READINESS.md). Výše uvedené čekání na CI/Hosting
popisuje přípravu prvního rolloutu; aktuální aktivace `3b159f2` již nasazená je.

<a id="maintenance-purge"></a>

## Maintenance a konečný purge – lokální úsek 5. listopadu

`runAccountMaintenanceTick` předává volitelný writer do expirace. Chybějící
`apply` při zapnutém writeru ukončí transakci chybou; není tichý přechod na zápis
samotného statusu. Priorita purge → účtový job → expirace i společný rozpočet
jednoho jobu / nejvýše 50 kroků zůstávají beze změny.

Konečný purge atomicky odstraní indexovou projekci při prvním zmrazení Shoutu
spolu se zdrojem a journal kurzorem. Pozdější fáze už nepředává minimální
anonymní kontext znovu do metadatového writeru: neobsahuje původní polohu ani
časy. Neočekávaná další pole takového kontextu znamenají needs-review.
Odebrání palce na cizím Shoutu mění index ve stejné transakci jako zdroj,
reakce a journal. Záložky a komentářové reakce index nepotřebují; savesCount
ani počty komentářů nejsou součástí jeho řadicí projekce.

Laboratorní adaptér může v přísně střeženém emulátoru používat skutečné cesty
`shouts/{id}`, aby test nepřeskakoval path/owner ochrany purge. Audit a hydratace
rozpoznávají anonymní kontext; starý indexový řádek audit stále odmítne.
Živý projekt ani namespace tím nevzniká. Nová sada
`functions/feed_maintenance.integration.test.js` je zařazená do `test:purge`.
Ověření a přesné výsledky jsou v [TESTING](../../operations/TESTING.md).
Zdroj c410ce3f46403c35f87d04befee4d8358acf396d má success
[CI 42063945148](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42063945148)
včetně 389 Rules/server a 25 purge testů; lokálně prošlo 45/45 cílených případů.
Lokální propojení je uzavřené, živý wrapper zůstává beze změny.

**Zbývající povinná brána před živým indexem:** dosavadní GC chrání archivní
kořeny hodinu od jejich vyřazení. To samo nezaručuje odstranění UID/polohy
smazaného účtu do původního +60denního termínu. Kdyby až konečný purge našel
ještě aktivní vlastní projekci, běžná archivace kořene by vytvořila novou historii
právě u tohoto termínu. Také starší bloky potřebují skutečně zapojený úklid.
Neprodlužovat retenci; navrhnout a ověřit cílené odstranění těchto metadat,
včetně souběhu se snapshoty/GC a nedokončené primární účtové fáze.
Před aktivací rovněž ověřit konzistenci rozpracovaných jobů: samotný minimální
kontext není důkazem odstranění všech starších indexových kopií.
Navazující diagnostika potvrdila novou historii u deadline i cache druhého
adaptéru. [R5 a lokální protokol](FEED_INDEX_RETENTION.md#account-retention-proposal)
jsou nyní schválené/připravené, konečná regrese 61/61 prošla, CI ještě čeká.
Provedená diagnostika samotná index neopravuje ani neaktivuje. Režim R5 se
zapíná pouze v explicitně vytvořeném emulátorovém namespace; živý wrapper jej
nepředává. Provozní inventory, časování a blokace zápisů mají ještě vlastní bránu.
Tento lokální úsek to neřeší ani nepovoluje živou aktivaci. Pozitivní purge test
vychází z vlastních Shoutů již vyřazených z indexu v dřívější účtové fázi;
historii cizího Shoutu zachovává a neobsahuje UID mazaného hlasujícího.

Bez nasazení, migrace, živých kolekcí, Auth účtů, změny Rules nebo retencí.

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
nákladové meze a konkrétní DEV návrh](../accounts/ACCOUNT_DELETION_DEV_PROPOSAL.md) jsou
připravené. Vlastník následně schválil DEV pilot; dva endpointy a plánovač jsou
nasazené z `ef49f25` po CI `41236718912`, živé čekání/skrytí 3/3, replay,
soukromost a úklid prošly. Aktuální důkazy jsou v odkazovaném dokumentu.
