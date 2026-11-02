# ShoutOut – aktuální stav pro navázání práce

## Rozpracovaný úsek – konečný 60denní purge

Větev `feature/account-retention-purge`, navazuje na `40e0e96`.
Vlastník schválil implementaci bodu 1 a dále anonymní technický kontext
cizích konverzací i vypnutí soft delete v DEV bucketu. Lokálně připravený
samostatný durable purge, metadata archivních kopií, omezené stránkování
včetně chybějících rodičů, Storage generation journal a příchozí Rules ochrany.
Lokálně prošlo 15/15 purge emulátorových scénářů, 254 Flutter testů,
107 serverových unit testů, lint a Flutter analýza; úplná Rules regrese běží.
Runtime flag zatím false, nic z této fáze není nasazené.
Skutečný DEV zůstává níže uvedený d0e43c5/62a51b0; žádná původní data se neměnila.
[Rozsah, inventura a provozní brány](ACCOUNT_RETENTION_PURGE_PLAN.md).

## Uzavřený DEV úsek – odebrání palců a vlastnické vyhledávání

Větev `feature/account-reaction-removal`. Vlastník schválil po potvrzeném
odstranění Auth odebrat jeho palce u cizího obsahu a upravit počty.
Vlastnická vrstva z `62a51b04b67c487023b10e387b21a4b590382150` má úspěšné
CI 41487516001 (252 Flutter, 38 tools, 107 unit, 341 Rules/server, 15 Storage,
analýza/lint/build). V DEV jsou ACTIVE tři UID writery toggleShoutReaction,
toggleCommentReaction a toggleShoutSave s hashem
`d8055e2d08e1317719fc3136ef3f13d6a52562c0`, Firestore Rules
`59ba2602-0710-4e37-8a29-97d5c74a9ae7` a Hosting `20af65bc04ae5c35`.
Oba collection-group userId indexy jsou READY, TTL se neměnilo.
Živě ověřeny 3 anonymní požadavky → 401, stránkování UID dotazu a úklid
všech 3 indexových fixture listů. Účtové Functions, IAM, Scheduler a Storage
Rules se při tomto rolloutu nezměnily.

Samostatně schválený plán `beccfc90…136f0` byl atomicky proveden: přesně
3 původní záložky dostaly userId, všechna původní pole včetně createdAt
zůstala shodná. Nová inventura: 0 reakcí, 3/3 indexované záložky, 0 oprav
a 0 neznámých schémat. Původní žádost/job/archive inventura má stejný digest.

Verzovaná fáze workeru v5 je nasazená z
`d0e43c558428cb45976bb5326bbf476cf3ea1cc6` po success CI 41493498292:
252 Flutter, 38 tools, 107 unit, 348 Rules/server, 15 Storage, analýza/lint/build.
UID dotaz, trvalý kurzor, nejvýše 50 kandidátů za běh, atomické odečtení
a bezpečný replay. Stávající v1–v4 joby se nemigrují. Obě account Functions
jsou ACTIVE, hash `b2c8a1f7df60cf86b1937fdb1532321e9e10ba62`, revize
accountDeletionRequestCreatedDev `00008-pay`, resumeAccountDeletionJobsDev `00008-vig`.
Node22, min0/max1, concurrency1, 256 MiB/60 s a Scheduler zůstaly stejné;
ostatní Functions, IAM, Rules a Hosting se tímto rolloutem nezměnily.

Živý v5 pilot použil nový syntetický UID bez Auth účtu a oddělený obsah.
Skutečný trigger/plánovač dokončil content-archived: 1 Shout palec a 1 komentářový
palec odebrány s přesným odpočtem, 1 osiřelý hlas bez zásahu do čítačů;
cizí hlas zachovaný, vlastní přeskočené pro jejich samostatný životní cyklus.
Ověřeno 5 archivních rootů a kopie reakce vlastního komentáře, původní
request/createTime/deadline, anonymní profil a návazný soukromý úklid.
Plánovač byl při testu také ručně vyvolán až po splatnosti jobu; konfigurace
a minimální retry prodleva se neměnily. Všechny fixture položky jsou uklizené,
0 zbylých reakcí fixture a původní účetní inventura má stejný digest.
Další krok je konečný 60denní purge včetně vlastních reakcí, záložek,
soukromých/Business potomků a kopií důkazů; celý účetní milník zůstává otevřený.
[Kontrakt, pořadí rolloutů a zbývající brány](ACCOUNT_REACTION_REMOVAL_PLAN.md).

## Uzavřený DEV úsek 2. listopadu – role, exspirace a klientské opakování

Nasazený zdroj `91d8d9bc16b45d1a2f6ce7ee1fecff271acd66bc` z větve
`fix/retired-privileges-and-expiration` má úspěšné CI 41399389084:
241 Flutter, 37 tools, 107 unit, 321 Rules/server, 15 Storage, analýza/lint/build.
DEV index READY, nové Firestore/Storage Rules a dvě Functions ACTIVE,
hash `b443bd2afc4a879fc846ba36bbdad196f102b1c2`. Ověřené atomické
zneplatnění moderních/legacy rolí při serverové konfirmaci Auth, související
Firestore/Storage ochrany a dávkové `active → expired` ve volném ticku
existujícího plánovače. Bez fyzického mazání či změny retence. Živě 26/26
původních Shoutů: změněný pouze status. Testovací účet má potvrzený Auth
a obě odebrané role; job dokončil content-archived a je uklizený. Původní
žádost/inventura mají stejné digests. Při backendovém rolloutu zůstaly Hosting,
IAM, ostatní Functions a Scheduler beze změny. Produkce nedotčená.
Tehdejší větev `fix/account-deletion-retry-flow` má nasazený klientský
koordinátor, Firebase adaptér a obnovu z pending obrazovky. První žádost už
při nejasné chybě nemaže intent; UID guardy a latch chrání opakování. Společný
password dialog opravil prokázané předčasné dispose controlleru. Zdroj
`23f20438c64e8eedfcd06761d8fd9158b56e8257` má success CI 41472129925:
252 Flutter, 37 tools, 107 unit/209 skip, 321 Rules/server, 15 Storage,
analýza/lint/build. Čistý release build je nasazený na DEV Hosting verzi
`d2573a279275eb72`; oba DEV originy mají shodné HTML/JS/config hashe s artefaktem.
Backend, Scheduler, IAM a Rules mají shodu s nasazením 91d8d9b.
Živě: jeden nový vlastní testovací Auth účet + pending žádost, ruční přihlášení
a pokračování s heslem uživatelem vrátilo aplikaci na login. Server ověřil Auth
user-not-found, původní žádost/createTime/deadline, konfirmaci a content-archived.
Celý test je uklizený, původní inventura/žádost mají stejný digest. V automatizaci
byl chybný e-mail bez mvp; varování App Check neprokázalo příčinu neúspěšného loginu.
Koordinátor má 8 bezpečnostních testů, gate/dialog další 3 widget testy.
[Kontrakt, meze a návaznosti](ACCOUNT_AUTHORITY_AND_EXPIRATION.md).
Rozhodnutí vlastníka: celý existující Business profil/pobočky/fakturační
podklady zachovat po původních 60 dní; lhůta je pevná i pro otevřená hlášení.
Minimální veřejný marker po purge je schválený trvale. Následně byly schválené
i odebrání palců smazaného účtu a změna počtů; nový úsek je uvedený výše.
Vlastnické vyhledání reakcí/záložek už uzavřel novější úsek výše. Navazuje
konečný 60denní purge soukromých/Business dat, potomků a kopií důkazů.
Business data se dnes zachovávají na původních místech, faktury mají zatím
jen UI placeholder. Celý účtový milník a plný Rules cutover stále nejsou uzavřené.

Předchozí uzavřený stav 2. listopadu 2026 byl ve větvi
`feature/account-public-identity-worker`; navazuje na dokončenou retenci
`feature/operation-retention-cleanup`, ověřené CI `079d053`, klientskou retenci
`e42ffbd`, uzavřené živé mazání (`c65338d`), obsahová hlášení
(`c42ed60`) a obnovené metriky postupu (`dd94cc6`).

## Předchozí uzavřený úsek – v4 identita a loga ve workeru

Nasazený DEV worker vytváří nové v4 joby: konfirmace Auth →
minimální veřejný marker/klíč vlastní přezdívky → stránkovaná revokace vlastních
log → dosavadní Shout/private/archive fáze. Staré v1/v2/v3 se nemigrují.
Samotná nicknames rezervace/updateTime se nemění; deadline je původní +60 dní.
Cursor i čekající cesty jsou trvalé; každý ověřený objekt se odškrtne v
transakci s kontrolou konfirmace/žádosti/lease. Storage a Firestore nejsou
atomické; replay po odstranění tokenu je no-op. PageSize (max. 50), cron,
lease i prostředky zůstávají stejné.

11 nových v4 emulátorových případů prošlo se skutečným Firestore a simulačním
Storage adaptérem. Předchozí společný běh měl 51/51 včetně 42 starých worker
regresí. Testuje se i 51 log, ztracený mask/page/token/checkpoint ack, převzetí
lease, cizí data, nulová loga a staré verze. Zdroj b685ac40733126272baeafb7d634d60e9dd3f271
má [CI 41359149804 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41359149804):
241 Flutter, 37 tools, 107 unit (202 emulator-only skip), 306 Rules/server,
14 Storage, analýza/lint a web build. Z čisté kopie vznikl ověřený release build.
Do shoutout-dev-46c81 byly v pořadí nasazené Storage Rules, web a obě účtové
Functions. Web verze 6147a1b814165dad, release 1793573903111000; live HTML/JS/config
hashes odpovídají artefaktu. Storage ruleset ea1bc382-2e11-47b5-a696-0f8fd21e4145
má shodu zdroje. Obě Functions ACTIVE, hash 477ecb9a9163733362b8bf3ed6a0446ee22aa667,
revize accountdeletionrequestcreateddev-00006-loh a resumeaccountdeletionjobsdev-00006-duc.
Ostatních 11 Functions, IAM, Scheduler a Firestore Rules jsou ověřené beze změny;
limity Node 22/max 1/concurrency 1/256 MiB/60 s zachované. Indexy/TTL a produkce se nemění.
Živý v4 pilot automaticky došel přes marker/loga/shouts/private do
content-archived. Minimální marker, obě stará URL 403, count 2, stejná
rezervace/updateTime/private profil/role/Business profil, bytes/metadatové
tagy log i kontrolní objekt jsou ověřené; původní deadline zůstal stejný.
Všechna testovací data včetně 3 objektů jsou uklizená (loga před markerem),
původní žádost a inventura requests/jobs/archive mají nezměněné digests.
Žádný nový Auth účet. Veřejná identita/loga jsou tímto uzavřené v DEV.
Důkazy: build/identity-worker-{ci-proof,artifact-proof,baseline,deployed-proof,live-proof,cleanup-proof}.json.
[Kontrakt a pilot](ACCOUNT_PUBLIC_IDENTITY_PLAN.md#identity-worker-v4).

Další krok: soukromé/Business profilové údaje a odebrání skutečných rolí;
ověřit konkrétní potřebnou 60denní retenci podle existujících rozhodnutí.
Potom zbývá fyzický purge (včetně vlastněné přezdívky), politika markeru po
purge a klientský cutover. Celý účtový milník a MVP metriky zůstávají otevřené.

## Dokončený úsek – nezrušitelná serverová konfirmace Auth mazání

DEV worker za přepínačem confirmAuthDeletionEnabled před první
destruktivní operací transakčně ověří původní žádost i lease a po skutečném
Auth user-not-found přidá serverový Timestamp authDeletionConfirmedAt.
Původní status pending, createTime, retenční deadline i verze jobů zůstávají.
Rules zablokují klientské odstranění potvrzené žádosti; create/update klient
potvrzení vytvořit ani smazat nesmí. Před konfirmací zůstává původní rollback.
Jeden Auth lookup na skutečně zpracovávanou dávku, žádná cache mezi běhy.
Dokončené joby se znovu neotvírají; žádné nové prostředky či časování.

50 cílených emulátorových testů a lint prošly, včetně obou pořadí souběhu,
v1/v2/v3 regresí, celého v3 průchodu a zachování původního deadline.
Zdroj e4dd199ede6345501c9fe3512007c3f1b852a910 má
[CI 41356429637 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41356429637):
241 Flutter, 37 tools, 106 serverových unit (191 emulator-only skip),
295 Rules/server, 14 Storage, analýza/lint a web build.
Rules i obě účtové Functions jsou nasazené pouze v shoutout-dev-46c81.
Obě ACTIVE, source hash 090f03a9ddc0e8e269bf1f36b704eefb964192e9,
revize accountdeletionrequestcreateddev-00005-jol a resumeaccountdeletionjobsdev-00005-bib.
Ruleset 64eb5312-5774-4238-9908-c467a1e58e76 má ověřenou shodu zdroje.
Ostatních 11 regionálních Functions, Hosting a Scheduler konfigurace jsou
porovnané beze změny; max 1/concurrency 1/256 MiB/60 s/Node 22 zachované.
Živá syntetická žádost bez nového Auth účtu automaticky prošla potvrzením,
cleaning-private → archiving-content → content-archived přes původní cron.
Timestamp a původní retenční termín stabilní; testovací data uklizená,
původní žádost a inventura requests/jobs/archive mají nezměněné digests.
Úsek je uzavřený v DEV. Důkazy: build/confirmation-live-proof.json,
build/confirmation-cleanup-proof.json a další nasazovací/CI důkazy v TESTING.md.
Hosting, Storage Rules, indexy/TTL a produkce se nemění.
[Rozsah a zbývající riziko klientského rollbacku](ACCOUNT_PUBLIC_IDENTITY_PLAN.md#auth-deletion-confirmation).

Na tento původně dokončený úsek již navazuje v4 výše. Po jeho uzavření
zbývají ostatní osobní/Business data, role, konečný 60denní purge a klientský cutover.

## Dokončený úsek – izolované ověření na DEV Storage

Vlastník po vysvětlení zbývajících bran povolil pokračovat a nasadit vhodně
ověřené změny. Připravený Storage probe vytvoří pouze 4 nové malé objekty
v náhodném businessLogos/mvp_logo_probe_UID/ prefixu projektu shoutout-dev-46c81,
ověří skutečnou revokaci a obě 412 kolize a podmíněně je uklidí.
Žádné živé Firestore zápisy, žádný nový Auth účet, žádná žádost/job ani změna
bucket politiky. Použije stejné revokační jádro; request/marker transakce jsou
pro tento izolovaný test v paměti, Auth user-not-found a Storage jsou skutečné.
Není to end-to-end test mazání účtu. Zdroj 8c915db9d9e77eb5ed934be83eb3911bd89a38fb
má CI 41355437130 success. Skutečný DEV test: původní URL 200 → po revokaci 403,
obě kolize 412, stejné bytes/ostatní metadata, replay bez zápisu a nezměněný
kontrolní objekt. Všechny 4 vytvořené objekty jsou ověřeně odstraněné.
Bucket metadata potvrdila vypnuté versioning; žádná politika nebyla měněná.
Důkazy: build/logo-dev-preflight-proof.json, build/logo-dev-probe-ci-proof.json,
build/logo-dev-live-proof.json. Tato Storage brána je uzavřená; worker integrace
identity/loga je v navazujícím v4 oddílu výše.

## Dokončený předchozí úsek – zneplatnění odkazů na loga, pouze lokálně

Vlastník schválil lokální serverový prototyp a emulátorové ověření bez mazání
log, worker integrace, nasazení, živých dat nebo nových Auth účtů.
Připravené jsou stránkovaný soupis přesného businessLogos/UID/ prefixu a krok
pro jeden soubor: Auth user-not-found, původní pending žádost, minimální deleted
marker, původní +60 dní a transakční kontrola caller lease; odstraní jen
download tokeny s podmínkou generation i metageneration a ověří výsledek.
V tomto původním lokálním úseku nebyla jádra ani lab v deploy balíku.
V4 nově zahrnuje jádra do účtového balíku; lab zůstává jen lokální.

11 nových unit testů, celá serverová sada (105 pass / 188 emulator-only skip)
a lint prošly. Emulátor výslovně potvrdil mezeru: metadata patch
tokeny zachová a ignoruje verzovací podmínky. Krok proto odmítá potvrdit úspěch;
nejde o důkaz funkční revokace v cloudu. Společná Storage sada má 14/14 pass
bez skipů (8 původních a 6 nových). Zdroj c62e7b5d82b04218fa857e034b6e2ecd59aa6b3a
je commitnutý a pushnutý; [CI 41354109582 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41354109582)
ověřilo 241 Flutter, 37 tools, 105 serverových unit (188 emulator-only skip),
284 Rules/server a 14 Storage případů, analýzu/lint i web build.
Schválená lokální příprava je uzavřená; navazující skutečný DEV důkaz je výše.
[Rozsah, výsledky a zbývající brány](ACCOUNT_PUBLIC_IDENTITY_PLAN.md#logo-url-revocation).
Samotný lokální úsek živé prostředí nezměnil; aktuální nasazení je uvedené výše.
MVP metriky se podkroky nemění.

## Dokončený předchozí úsek – ochrana tří Admin SDK zapisovačů, pouze lokálně

Vlastník výslovně schválil lokální ochranu backfillu veřejných profilů,
přidělování rolí a vývojové Business aktivace. Společná kontrola žádosti
o mazání a veřejného markeru je nyní ve stejné transakci jako změna dat.
Backfill čte aktuální users/role a přeskočí mazající se účet; oba další
nástroje odmítnou celou změnu. Názvy/úrovně rolí, rozsahy, Business podmínky,
lhůty, prostředky a DEV-only cílení zůstávají stejné.

Lokálně prošlo 22 emulátorových scénářů a 37 tools testů, včetně souběhu,
odmítnutí jiného projektu před SDK inicializací a rollbacku bez dílčích dat.
CLI skripty mají ověřenou syntaxi. Zdroj a0a9117b8e53cc349f1248fd0bb264f787afbf85
je commitnutý a pushnutý; [CI 41347854953 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41347854953)
ověřilo 241 Flutter, 37 tools, 94 serverových unit (182 emulator-only skip),
284 Rules/server a 8 Storage testů, analýzu/lint a web build. Tento lokální úsek
je uzavřený; důkazy jsou v TESTING.md.
Žádný z nástrojů nebyl spuštěný proti živým datům; žádný rollout, Auth účty,
nový job ani změna existujících jobů. [Rozsah a náklady](ACCOUNT_PUBLIC_IDENTITY_PLAN.md#admin-write-guards).

## Dokončený předchozí úsek – veřejná identita, pouze lokální příprava

Vlastník schválil lokální serverové jádro, marker smazané veřejné identity,
anonymní zobrazení bez role/loga a nového sledování/soukromé odpovědi,
zachování vlastní přezdívky do původního serverového deadline +60 dní a
ochranu SDK čtení loga. [Přesný rozsah, schéma a brány](ACCOUNT_PUBLIC_IDENTITY_PLAN.md).
V původním lokálním prototypu nebyly jádro a lab v deploy balíku a neproběhl
živý rollout. Aktuálně jsou jádra i klient zapojené ve v4 výše; lab se nenasazuje.
Historické archivní nasazení 1dab78c a konfirmace e4dd199 jsou zachované níže;
aktuální Hosting a worker určuje v4 oddíl výše.

Lokálně implementované: minimální publicProfiles marker, transakční caller fence,
ochrana cizí rezervace, replay a původní deadline; klientská anonymizace a
ochrana před návratem staré identity při chybě streamu. Odebrání dřívějšího
sledování a blokování/nahlášení zůstávají dostupné. Firestore/Storage Rules
jsou lokální prototyp. Osm Storage a osm cílených profilových testů prošlo,
241 úplných Flutter testů, 94 serverových unit (182 emulator-only skip),
35 tools a analyzátor/lint prošly. Plná emulátorová sada měla 261/261 pass;
po dodatečném zpevnění neměnnosti markeru prošla celá Rules sada 73/73.
Konečný zdroj da264992945f694fd68ed95f83a5fb757044b443 má
[CI 41328636468 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41328636468),
včetně 241 Flutter, 262 Rules/server a 8 Storage případů, unit/tools,
analyzátoru/lintu a web buildu. Lokální úsek je uzavřený, commitnutý a pushnutý;
žádný živý rollout neproběhl. Důkaz: build/public-identity-ci-final-proof.json
a build/public-identity-ci-success.log; podrobnosti v TESTING.md.

Před živým napojením chybí revokace dříve vydaných tokenových URL loga
(emulátor doložil, že samotná Rules nestačí) a návrh integrace jobu včetně potvrzeného
stavu mazání odolného vůči starému Auth tokenu/odstranění pending žádosti.
Soukromá/Business identita, role, fyzický 60denní purge a klientský cutover
zůstávají otevřené.
Celý účtový milník ani MVP metriky se lokálním prototypem neuzavírají.

## Dokončený předchozí úsek – archiv všech zpráv a komentářů

Rozhodnutí vlastníka 1. listopadu: uchovat neveřejně všechny existující zahrnuté
zprávy a vlastní komentáře 60 dní, bez ohledu na nahlášení. Budoucí administrační
přístup má vlastní otevřený úkol, bez dnešního udělení nových klientských práv.
[Schéma, provozní meze a nový DEV pilot](ACCOUNT_CONTENT_ARCHIVE_PLAN.md).

Archivní DEV pilot je dokončený včetně konkrétního souhlasu vlastníka a úklidu.
Oba workery a web jsou nasazené z čistého
`1dab78cce583899648f8e17d6814a0ecbfc6aad8`, oba archivní flagy true.
[CI 41322524612](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41322524612)
success: 235 Flutter, 35 tools, 92 unit (171 emulator-only skip), všech
249 Rules/server případů bez skipů, analyzátor/lint a web build. Historické
v2 a App Check testovací konfigurace jsou nezávislé na aktivaci DEV flagů.
Čisté Functions balíky mají 7/19 JS modulů; zdroje/importy i web build ověřené.
Hosting verze 11888ad4b6a3ffb3, release 1793548167143000: HTML/JS/config shodné.

Čtyři cílené indexové změny READY, ostatní indexy a TTL beze změny. Nová
getArchivedCommentReportTarget a cílená Rules změna jsou z f0625b5 po CI
41320353170 success; živá Rules přesně shodná. Všechny tři cíle ACTIVE:
account source hash 84333fd4e60f6ff1f3088b90a8c2bceec3bd8037,
lookup hash f4df3c8589c72a779c7ecfeb9190ca31bbab0d06. Limity, minutový
Scheduler i ostatních 10 Functions zachované, žádný nový Scheduler.

Živý test: při existujícím disabled Auth waiting-auth bez změn; po odstranění
pouze tohoto nového Auth plánovač automaticky skryl 3 Shouty, odstranil 4
privátní položky a archivoval 2 zprávy, 1 komentář a 3 reakce. Cizí konverzace
i komentář zachované, commentsCount 2 → 1, profil/legal zachované, deadline
původní žádost + 60 dní. Terminální replay beze změny, anonymní archiv 403
a callable 401. TestModerator v nové fungující kartě viděl původní text;
vznikl 1 audit bez textu, žádné moderační rozhodnutí/postih. Automatické
obnovení původní karty zůstalo na bílé obrazovce; ruční zavření/otevření pomohlo,
příčina samotného načítání tím není diagnostikovaná ani opravená.
Všech 18 zbývajících testovacích dokumentů a checkpoint uklizené, Auth chybí,
archivy/job kolekce zpět na 0 a původní žádost má shodný digest.
Důkazy: build/account-archive-{infra,wait,live,audit,cleanup}-proof.json,
build/archive-{hosting,index-applied,rules-after}-proof.json a
build/account-content-activation-artifact-proof.json.

Read-only preflight: všech 97 existujících komentářů validních pro archivaci,
0 soukromých zpráv, 0 archivů/jobů a 1 původní žádost. Comments.authorId CG je
READY. Provedený indexový rozdíl má 4 změny, zachoval běžné privátní indexy,
nic nemazal a nesahal na TTL. Celý firestore.indexes.json se pro tento úsek
nesmí nasadit kvůli jeho nesouvisejícím, dosud neschváleným TTL nastavením.
Další krok: identita/veřejný a Business profil, rezervace přezdívky, konečný
60denní purge a klientský cutover podle ACCOUNT_DELETION_REMAINING_PLAN.md.
MVP je stále 9/24; archivace není fyzický 60denní purge ani celý účtový milník.
Produkce, main, staré joby a původní pending žádost se neměnily.

## Dokončený předchozí úsek – privátní fáze účtového jobu

Verzovaná fáze je dokončená v DEV: po skrytí Shoutů v2 job po dávkách
odstraňuje vlastní notifications/following/blocked, ponechá minimální false
preference a zachová profil/legal. Průběh a delety mají společnou transakci
a kontrolu původní žádosti/zámku. Existující v1 joby se nepřevádějí ani nemění.
Vlastník 1. listopadu výslovně schválil nový DEV datový pilot. Aktivace
`6a4606e7713e66affd1ad6d98339f6837bf2c17c` má CI `41300216738` success:
89 serverových unit (149 emulator-only skip), všech 224 Rules/server případů,
31 tools testů a Flutter kontroly/build. Všech 35 job testů prošlo znovu lokálně
s reálnými DEV parametry včetně zapnuté fáze. Původní implementace 22bcf73
má také úspěšné CI 41299376137. Čistý balík má všech šest JS modulů a oba
manifesty shodné s Git zdroji; aggregate artifact SHA-256
56d1690443095cae7cd4ad7527c104d8e8d87a6bbe7389c30d5380c8ba2bf3b1.
Obě Functions ACTIVE, hash 3c5bb3d252677158aee75a54571a26c43e6af03a.
Scheduler, prostředky, Hosting a ostatních 10 Functions jsou beze změny.

Živý schválený test: nový disabled Auth účet nejprve waiting-auth 0/0;
po odstranění jen tohoto Auth automaticky 3/3 skryté Shouty a 4/4 privátní
položky odstraněné, profil/legal zachované, preference false. Terminální
replay nezměnil data ani updateTime jobu; anonymní čtení jobu a HTTP plánovače
403. RetainUntil je přesně createTime + 60 dní; konečný 60denní úklid to nedokládá.
Testovací profil/legal/settings, 3 Shouty, žádost/job a vzniklý checkpoint
jsou uklizené. Původní 1 pending žádost má shodný digest, žádné jiné joby/data
se nečistily. Důkazy: build/account-private-{activation-artifact,infra,wait,live,cleanup}-proof.json.
[Přesný rozsah a rollback](ACCOUNT_DELETION_REMAINING_PLAN.md#private-job-dev).
Rozsah textů vlastník následně schválil: všechny zahrnuté zprávy a komentáře.
Navazující archivace je dokončená v DEV podle aktuálního přehledu výše. Dále zbývají
minimalizace identity/přezdívka, konečná retence a klientský cutover.
Účtový milník ještě není celý hotový, metriky se nemění.

## Opravy zpětného auditu 1. listopadu

Následující odstavce zachovávají důkaz rolloutů 6acca72; obě účetní Functions
byly následně aktualizované na 6a4606e podle aktuálního přehledu výše.

Lokálně opravený životní cyklus timed klienta: místo globální historie drží
malou vazbu přímo rozpracovaný požadavek; obsahuje SHA-256 otisk, identitu
a původní timed klíč, nikoli celý text. Po uvolnění požadavku ji nedrží žádná
globální kolekce. Retry při ztracené odpovědi i po potvrzení a odmítnutí
změněného payloadu zůstávají zachované. `crypto` 3.0.7 již byl v lockfile,
nově je přímou závislostí bez změny verze.

Worker předává trvalé chyby oprávnění/vstupu k ruční kontrole; u ostatních
chyb platí stávající 24hodinové okno od žádosti, pak také needs-review.
Frekvence plánovače, prostředky Functions ani mazání Auth se nemění.
Zastaralé komentáře o čistě lokálním jobu opravené. Cíleně prošlo 46 Flutter
a 23 account/job emulátorových testů, analyzátor a ESLint bez chyb.
Celá Flutter sada 232/232 a Functions unit 88 pass / 138 emulator-only skip
bez chyb. Commit `6acca72fa2cf860178e9411e91acd18d38507831`, CI `41297163776`
success včetně všech 210 Rules/server emulátorových a 31 tools testů.
Opravy jsou nasazené v DEV: Hosting `2e9a063495041b40`, release
`1793528967987000`; oba účetní endpointy ACTIVE, source hash
`9c3983a938f2c2b3ed6cb08e481b03e218ed52f9`. Veřejné HTML/JS/config byte-for-byte
odpovídají čistému release buildu. Plánovač zachoval minutu UTC, retry 0,
identitu i prostředky; CLI pouze převedlo URI a OIDC audience na kanonickou
Cloud Run adresu téže Function. Nová revize `resumeaccountdeletionjobsdev-00002-wuq`
má po nasazení doložený HTTP 200, anonymní POST 403. Dalších deset Functions
je podle celého API výpisu beze změny. Nové přihlášené klientské průchody
nebyly provedené; funkční matice je ověřená testy/CI. Produkce, main a Rules
beze změny. Důkazy: build/audit-fixes-live-proof.json a audit-fixes-artifact-proof.json.
Nálezy uzavřené; navazující privátní fáze je připravená výše.
[Kontrakt a ověření](TESTING.md#audit-lifecycle-fixes).

## Ověřené nasazení 1. listopadu

| Oblast | Skutečný stav |
|---|---|
| DEV web | Hosting 2e9a063495041b40, commit 6acca72; HTML/JS/config byte-for-byte ověřené. Klient obsahuje opravu paměti požadavků. |
| DEV účtový pilot | Dvě Functions z 6a4606e ACTIVE, plán každou minutu ENABLED; source hash 3c5bb3d252677158aee75a54571a26c43e6af03a. Živý v2 průchod dokončený včetně úklidu. |
| DEV ochrana příjemců | Dříve nedokončený rollout b777992 je nyní hotový: createComment/createPrivateReply/toggleShoutReaction/toggleCommentReaction ACTIVE, source hash 287c988e2f8515fbc233b58bdd0a1cf43bc74f9e. |
| Soukromý úklid | V2 aktivní pro nové DEV joby, vlastní notifications/following/blocked živě ověřené 4/4. Zprávy/komentáře a konečná retence ještě zbývají; lab adaptér zůstává emulator-only. |
| Nový prostorový feed/read sync | Lokální příprava, nikoli aktivní klient/query API/indexový backfill. |
| Produkční aplikace | Site shoutout-go-a1b34 existuje, live kanál nemá release/version. Veřejné MVP ještě není vydané. |

Přesný nasazený commit ochrany příjemců: b777992e7e7a4e02cb94a7c08184e22977a1b0e4,
CI 41245446077 success. Nasazeno z čistého worktree, artefakt SHA-256
cc4c3b5eed5a6f2383f6222e236ce4ff9f236dc5a371123b338545b6633ff4c2.
Čtyři endpointy Node 22/europe-west3/max 1/concurrency 1/256 MiB/15 s ověřené přes API;
anonymní callable požadavky 401, zbývajících osm Functions podle úplného výpisu beze změny.
Nové přihlášené případy příjemců jsou ověřené emulátorem/CI, nikoli novým živým Auth testem.
Lokální důkazy: build/deleting-recipient-live-proof.json, feed-reading-web-proof.json,
account-deletion-infra-proof.json a shoutout-production-hosting-proof.json.

## Podklady a dosavadní kroky

Hosting i Function ukládání byly po souhlasu nasazené 29. října a živé testy
prošly oběma rolemi včetně úklidu. Obsahová hlášení jsou také nasazená a ověřená
včetně duplicity, cooldownu, moderační fronty a úklidu. Nové mazání komentářů
je lokálně otestované, nasazené a živě ověřené moderátorem, Business i běžným
účtem včetně úklidu. Sedmidenní retence potvrzení je nyní ve vývoji dokončená;
vlastník zvolil celý nový feed před MVP, unread-first pouze v Nejblíž.
R2 schválené: poslední bod otevřené aplikace s upozorněním, jinak výzva k poloze. [Etapy a brány](FEED_IMPLEMENTATION_STAGES.md).
A0 je lokálně hotová: plný detail a zachovaný krátký náhled feedu.
204 Flutter testů a analyzátor prošly. A0 commit `b56fbbe` má úspěšné CI
`41189106879` a je nasazený na DEV Hosting. Verze `8a42571a4073ed7f`, release
`1793439504594000`, 31. října 09:38:24.594 UTC; veřejné HTML/JS/konfigurace
mají shodné SHA-256 s čistým release buildem. Functions/Rules se neměnily.
Návratový timed klient `079d053` / Hosting `02cdb989d4f18ee2` zachová retenci.
A1 je dokončený, CI `41189770135` pro `8b8ec33` prošlo. Následně vlastník
schválil progresivní výběr první stránky, jednu stránku dopředu a inkrementální
novinky. Připravené jsou serverový geografický modul, pinned repository a
klientský koordinátor; nejsou exportované/napojené na živý feed.
Progresivní základ `90c93ee` má úspěšné CI `41194526738` (212 Flutter testů).
Následně vlastník schválil lokální návrh a ověření sdíleného prostorového indexu.
[Schéma, důkazy, náklady a migrační návrh](FEED_BLOCK_INDEX_PLAN.md) jsou připravené:
10 nových unit testů a 9 emulátorových testů prošlo, celkem 66 Functions unit
bez chyb a lint čistý. CI `41200644473` pro `86fc171` prošlo. Prototyp odmítá
projekty jiné než lokální `shoutout-rules-test`. A0 je základ současného webu; novější Hosting je uvedený níže.
Vzorek 300: 18 metadata čtení za studena / 2 teplá proti 285 u přímého geo
postupu, plus 50 source čtení pro karty. Test pracuje se syntetickými metadaty,
ne skutečnými těly karet nebo cloudovou fakturou. Současné Functions/Rules se nemění.
R4 schválené: pevná hodina od otevření/obnovy, načtené karty zůstávají;
přečtení a uložené Shouty neexpirují. Lokální archivace kořenů, GC a vyřazování
expirovaných metadat jsou lokálně ověřené (69 Functions unit, lint, 19/19
cílených emulátorových případů); [ověření a meze](FEED_INDEX_RETENTION.md).
Původní index `86fc171` má úspěšné CI `41200644473`, retence `415631e`
CI `41208467738`. Následuje pokrytí všech zápisů, migrace a provozní budget
před bezpečným query API/UI; živé indexové kolekce/backfill zatím nejsou povolené.

Serverové mazání Shoutů `868bc8904f04798f227a78384dbdb4eec4c0361c` prošlo
CI `41210929174`; `deleteShout` a aktualizovaný `cleanupOperationReceipts`
jsou v DEV ACTIVE, artifact hash `4c1e36b0740665598d6dc5fcc4a18c013ab616fa`.
Node 22, europe-west3, 256 MiB, max 1/concurrency 1, timeout 15/60 s; anonymní
endpointy vrací 401/403. Aktivace `3b159f2d9acbe28effcfd7f9357034d882d963fb`
prošla CI `41211805774` a je na DEV Hosting `9eda171e25a3cedd`, release
`1793458416396000`, 14:53:36.396 UTC. HTML/JS/config SHA-256 odpovídají čistému buildu.
[Zápisové cesty a rozsah](FEED_WRITER_INTEGRATION.md).

Živý Business průchod po ruční obnově stránky prošel. DB kontrola potvrdila
soft-deleted testovací zdroj bez dalších změn a právě jeden sedmidenní op1 receipt.
Automatická relace předtím měla App Check chybu; ochrany nebyly oslabené.
Běžný/moderátorský nový živý průchod ještě provedený není, lokální matice prošla.
Předchozí lokální mazání: 71 Functions unit, analyzátor,
24 cílených Flutter testů a 6 emulátorových případů prošlo. Skutečné operace
createShout/toggleShoutReaction/deleteShout mají lokálně ověřené skládání indexu
v jejich transakci (22 cílených emulátorových testů včetně rollbacku a plných těl).
Wrappery indexWriter nezapínají; produkce, main a Rules se neměnily.

Nový interní account hiding helper prošel 4 testy, preflight 3 unit a geohash
opravný plán 3 emulátorovými scénáři; celá Functions sada 75 pass / 98 skip bez
emulátoru a lint čistý. Žádný helper není živě exportovaný. Původní klientské
mazání účtu zůstává; před jeho pokrytím se Rules nesmějí uzavřít.
Read-only DEV preflight všech 35 dokumentů našel 17 starých expirovaných
chybných geohashů. Vlastník schválil přesný plán, CI `41213628558` pro
`a5480a737aa621c9090494c688de3e2520e373c8` prošlo. Z čisté kopie je opravených
17 geohashů; SHA porovnání všech ostatních polí souhlasí. Následný preflight
35/35 valid, nula chyb. Původní hodnoty/výsledek jsou v docs/local/migrations/. B1: schválena 1 s na každou část, mimo Top rating nemění pořadí, pouze sbalení.
Další data/provozní volby mají vlastní brány.
[Migrační důkazy, lokální plán a další kroky](FEED_MIGRATION_READINESS.md).

[Čtení a rating](FEED_READING_POLICY.md): připravená změna pořadí mimo Top,
lokální jádro jednosekundové expozice a hodinová hranice klientského koordinátoru.
21 cílených Flutter a 23 emulátorových případů prošlo. Expozice ani koordinátor
nejsou v živém Home napojené, nic neukládá read historii. Pro API potvrzený
read-only historický snapshot v DEV starý 2 269 s, bez nových zápisů.
CI `41216198053` pro `ca67ebd4fc8dfdf06e65bf72865616dc6eae169b` prošlo.
Web řazení mimo Top je v DEV na Hosting `42d86a762a74a2dd`, release
`1793462869474000`, 16:07:49.474 UTC; HTML/JS/config SHA-256 odpovídají buildu.
První pokus měl síťovou chybu před releasem, opakování uspělo. Expozice/koordinátor
jsou nadále nepřipojené ke skutečné geometrii/read úložišti.
[Přenositelný kurzor](FEED_PORTABLE_CURSOR.md): podpis/UID/projekt/H, nejvýše
50 rozepsaných kandidátů, JSON pokračování přes nové instance; 7 unit a 1 nový
emulátorový případ prošly. 10 000 metadat jen RAM, checkpoint max 16 947 B;
160 emulátorových metadat: 16 kroků, 28 uzlových čtení při prázdné cache na každém
kroku. Včetně změněného read fixture zachovává readTime a digest. Není to živé API,
žádný skutečný signing key ani nové živé kolekce. Celá Functions sada má 82 pass,
100 emulator-only skip, nula chyb; lint prošel. Živý UI test ratingu pod TestBusiness
potvrdil sbalený negativní Shout první v Nejblíž a druhý v Top. Oba explicitní
DEV fixtures jsou soft-deleted a úklid ověřený v DB i UI; dosah vrácený na 5 km.
Přenositelný kurzor `bf71d778abfee12c5c755eeee55ec9febc530f13` prošel CI
`41219176408`; nešlo o rollout. Následující malý lokální úsek zpevňuje account
hiding helper: obnovená žádost ukončí starý běh podle createTime; změna metadat
téže pending žádosti běh nezastaví. Není to nasazený worker ani změna klienta.
Ověření: 7/7 cílených testů ve Firestore emulátoru, nula skip/chyb; cílený lint
prošel. Tento úsek je lokální, bez push/nového CI a bez externích změn. Další
krok zůstává napojení účtového toku a dalších zapisovacích cest, nikoli aktivace indexu.
Navazující lokální `hideDeletedAuthAccountShoutsPage` před jednou stránkou ověří
Auth: existující účet znamená čekání, pouze auth/user-not-found dovolí pokračovat.
Ostatní chyby se propagují bez skrytí. Nahrazení/odvolání žádosti během ověření
se odmítne před zápisem; žádost ani Auth účet tato funkce nemění. Návazná oprava
zachovává expectedRequestCreateTime dodané důvěryhodným workerem i mezi stránkami;
stará žádost se odmítne ještě před kontrolou Auth. Souběh dvou běhů nevytváří
duplicitní indexovou historii. Ověření: 13/13 cílených testů, Firestore emulátor
a simulovaný Auth, cílený lint čistý.
Lokální `account_deletion_event.js` již zpracuje jednu stránku podle původní
události vytvoření žádosti; ověřuje projekt/cestu/UID a ignoruje zastaralou žádost.
Výstup retry-required je explicitní požadavek na další pokus, nikoli nasazené
plánování. Provozní chyby propaguje; rozlišuje je od typované chyby neplatné žádosti.
Ověření: 18/18 cílených testů, Firestore emulátor + simulovaný Auth; cílený lint
čistý. [Navazující pracovní záznam a návrh DEV pilotu](ACCOUNT_DELETION_DEV_PROPOSAL.md)
jsou připravené: atomické převzetí, vlastnický zámek, průběh ve zdrojové transakci,
obnova po pádu, omezený scan s rotací a návrh dvou samostatných DEV Functions.
99 cílených account/job/Rules případů prošlo, 87 Functions unit / 126 skip bez
emulátoru a lint čistý. Artefakt se instaluje/importuje, limity SDK manifestu ověřené.
Vlastník schválil DEV pilot včetně provozních/datových voleb a jednorázového Auth
testu. CI `41236718912` pro `ef49f2573f488df9b9e6f782bb493df9b4eae71b` prošlo;
obě nové Functions jsou v DEV ACTIVE (europe-west3, Node 22, 256 MiB, max 1 /
concurrency 1, 60 s každá), source hash `32de6cf5e387959db32687b6d9a8e594f03e8c80`.
Nový plánovač ENABLED každou minutu UTC; anonymní HTTP vstup 403. Živě ověřeno
waiting-auth 0 → odstranění nového disabled Auth fixture → shouts-hidden 3/3,
ostatní pole nezměněná, replay beze změny a anonymní čtení jobu 403. Testovací
Auth/obsah/žádost/job/checkpoint uklizené, původní pending žádost zachovaná.
Při původním pilotu zůstalo tehdejších 10 Functions beze změny. První Eventarc inicializace vyžadovala propagaci;
detail a důkazy jsou v návrhu pilotu. Klient a celá 60denní retence stále nejsou hotové.
[Navazující účtový plán](ACCOUNT_DELETION_REMAINING_PLAN.md): vlastník schválil
rezervaci přezdívky po 60 dní a skrytí soukromých zpráv oběma. Připravené jsou
transakční kontroly příjemce pro čtyři obsahové Functions a nově lokální v2 fáze
vlastních privátních podkolekcí. Původní lab odmítá živé projekty a není v artefaktech.
53 cílených případů prošlo, následné 3 kontroly projekce/bezpečnosti také;
lint čistý. CI a DEV rollout ochrany příjemců jsou dokončené podle přehledu výše;
navazující privátní úklid byl následně dokončený v DEV z 6a4606e podle přehledu
výše. Archiv zpráv, přezdívka a konečné retenční dočištění zbývají.
Kompatibilní serverová vrstva i klientské časové klíče jsou nasazené z čistého
`079d053d24fe04705d13baad7f8307bd25848094` po úspěšném CI `41136744088`.
Nejdřív všech osm Functions, potom Hosting; všechny ACTIVE, původní provozní
limity a HTTP 401 bez App Check ověřené. HTML/JS/konfigurace odpovídají buildu.
Běžný účet ověřil publikaci, komentář, reakce, záložku a mazání; Business
soukromou odpověď a hlášení. Právě 12 receipt má `keyVersion: 1` a přesně
sedmidenní serverové deadline. Testovací obsah/report/notifikace jsou uklizené.
Cutover `9b748d7d9698f4ef99b2ec718180f338ea979da6` prošel úplným CI
`41139730936` (4 min 40 s, 44 unit / 129 integrací / 20 tools a Flutter/build).
Z čistého zdroje jsou nasazené všechny osm operací bez nových legacy klíčů,
potom `cleanupOperationReceipts`. Denní DEV job je ENABLED, 02:15 UTC,
nejvýše 500 receipt/běh, max. 1 instance; IAM je neveřejné a bez Auth vrací 403.
Živá záložka po cutoveru prošla 0 → 1 → 0 se dvěma dalšími timed receipt.
První ruční běh odstranil 1 izolovaný prošlý receipt a zachoval 14 platných;
opakování odstranilo 0 a všech 14 opět zachovalo. Testovací obsah je uklizený.
Po úklidu se nesmí znovu povolit nový legacy formát; rollback musí zachovat
odmítání starých klíčů. [Důkazy a návrat](TESTING.md#retention-rollout).
Nové CI prošlo dvakrát; druhý běh 3 min 14 s, npm i emulator cache hit potvrzené.
[Podrobnosti CI](TESTING.md#ci-reliability).

## Jak přehled používat

Před pokračováním ověřit `git status`, větev, kód a konfiguraci. Tento soubor
je stručná orientace, nikoli náhrada důkazů nebo oprávnění k nasazení.
[TODO](TODO.md) určuje priority, [BACKLOG](BACKLOG.md) obsahuje všechny původní
checkboxy a [serverový plán](MVP_SERVER_PLAN.md) zachovává podrobné požadavky.
Staré neúspěšné pokusy v [archivu](archive/README.md) nejsou aktuální stav.

## Poslední ověřené nasazení

| Položka | Stav |
|---|---|
| Vývojový projekt i Hosting site | `shoutout-dev-46c81` |
| Vývojová aplikace | https://shoutout-dev-46c81.web.app |
| Zdroj webu | `079d053d24fe04705d13baad7f8307bd25848094` |
| Hosting verze | `02cdb989d4f18ee2` |
| Release / čas UTC | `1793399239632000` / `2026-10-30T22:27:19.632Z` |
| Starší Hosting verze | `8d7e3f3fed920529` má legacy klienta; po cutoveru se nesmí samostatně vrátit. |
| Zdroj aktuálních Functions | `9b748d7d9698f4ef99b2ec718180f338ea979da6`, CI `41139730936` |
| Ověření | Osm callable + soukromý plánovač ACTIVE, limity/401/403 ověřené; všech 8 cest, 14 timed receipt, úklid a bezpečné opakování jobu. |

Produkční aplikace dosud nemá první release. Připravená doména
`go.shoutout-app.eu` a site `shoutout-go-a1b34` jsou v projektu
`shoutout-production-a1b34`, který sdílí s prezentací na `shoutout-app.eu`.
Vývojové změny nebyly nasazené do produkce ani sloučené do `main`.
Podrobnosti a historie verzí: [WEB_ENVIRONMENTS](WEB_ENVIRONMENTS.md).

<a id="serverova-brana"></a>

## Serverová brána – přesný stav částí

| Operace | Kód a testy | Vývojové nasazení a živý test |
|---|---|---|
| Vytvoření Shoutu | Hotovo | Hotovo; `createshout-00001-zik` |
| Veřejný komentář a odpověď | Hotovo | Hotovo; `createcomment-00001-lep` |
| Soukromá odpověď | Hotovo | Hotovo; `createprivatereply-00001-baw` |
| Palce na Shoutu | Hotovo | Hotovo; `toggleshoutreaction-00001-lek` |
| Palce na komentáři | Hotovo | Hotovo; `togglecommentreaction-00001-dit` |
| Uložení/odebrání Shoutu | Hotovo; operace/klient `5fceccb`, aktivace `02b8b28`, obě CI prošla | Hotovo; `toggleshoutsave-00001-fal`, běžný i Business účet, seznam/detail a úklid ověřené. |
| Hlášení Shoutu, komentáře a soukromé odpovědi | Hotovo; `79082d8` i aktivace `be5a88f` prošly CI | Hotovo; `createcontentreport-00001-yas`, 3 cíle, duplicita 409, cooldown 429, moderační UI a úklid. |
| Mazání komentářů a dekrement parentu | Operace `34f7cad`, aktivace `fcbc23d`; obě CI prošla | Hotovo; `deletecomment-00001-zuc`, tři role, počet 3 → 2 → 1 → 0, právě 3 receipt a úklid. |
| Sedmidenní retence – serverový základ | `079d053`, poté cutover `9b748d7`; obě CI prošla | Nové legacy klíče se nepřijímají; všechny Functions ACTIVE. |
| Klientské časově omezené klíče | Osm operací; čas z Auth, immutable payload, očekávaný účet a 7 jazyků | Nasazené; všech osm cest živě ověřených oběma účty včetně úklidu. |
| Zákaz nových legacy klíčů a dávkový úklid | Hotovo; nejvýše 500 receipt/běh, checkpoint a CAS | Denní DEV plánovač aktivní; 1 prošlý testovací receipt odstraněný, opakování 0, 14 platných zachováno. |

Osm nasazených Functions používá Node.js 22, `europe-west3`, 256 MiB, 15 s,
min. 0 / max. 1 instanci a concurrency 1. Callable vyžadují Auth a App Check.
Osm odpovídajících klientských přepínačů je v `config/dev.json` zapnutých;
nasazený web používá všech osm. Produkční konfigurace tyto serverové cesty nezapíná.
Přepínač `serverShoutSaves` má výchozí `false`; vývojový web jej má aktivní,
produkční konfigurace jej nezapíná.
Nový `serverContentReports` je výchozí `false`; vývojový web jej má aktivní.
Produkční konfigurace jej nezapíná.
Hlášení účtů a technických chyb tento přepínač neovládá.

Reakce byly ověřené běžným i Business účtem včetně přidání, změny, odebrání,
receipt, limitů a oznámení. Oprava detailu ověřila 0 → 1 → 0 také při externím
smazání komentáře bez obnovení stránky. Testovací komentáře a čistě testovací
oznámení jsou odstraněné, dočasné Shouty mají `deleted`; původní Test Shout je
zachovaný. Platné idempotentní receipt zůstaly zachované; sedmidenní retence
a denní úklid jsou nyní ve vývoji ověřené, viz výše.
Ukládání prošlo vlastním uchovaným Shoutem i cizím aktivním Shoutem. Čtyři
nové receipt a společné rate eventy souhlasí; obě záložky jsou odstraněné,
čítače zpět na 0, dočasný Shout má `deleted` a původní Test Shout zůstal zachovaný.

Přímé zápisy v Rules ještě nejsou uzavřené. Celý milník serverové brány tedy
není hotový. Mazání komentářů i běžné obsahové čítače jsou ve vývoji ověřené;
chybí prostorový feed a uzavření přímých zápisů.
Úplná kritéria jsou
v [MVP_SERVER_PLAN](MVP_SERVER_PLAN.md#gateway).

## Poslední ověření a důkazy

- Klient časově omezených operací: šest cílených testů gateway, dva překladové
  testy, čistá analýza/formát, všech 202 Flutter testů a release build/manifest prošly.
  Backend navíc přijímá a ověřuje očekávaný účet u publikace Shoutu, komentáře
  a soukromé odpovědi: 41 unit / 123 emulatorových testů prošlo.
  CI `41097603906` na `aeeaec8` selhalo v původním souběžném report testu
  (2 ze 3 stejných pokusů uspěly). Přidaná diagnostika nemění očekávání;
  `89247e9` prošel [CI `41098701651`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41098701651).
  Příčina prvního neúspěchu nebyla potvrzená. Konečný klientský commit musí
  před rolloutem projít vlastním CI; úspěch staršího commitu jej nenahrazuje.
  U `c3ad17dafd916915c0af7e01e935fb61466ec7c7` v CI `41100166067` má
  dokončený log jobu `124215878506` všech 202 Flutter / 41 unit / 123 emulatorových
  / 20 tools testů a build zelené (log skončil v 17:39:49 UTC). Run/check/suite
  metadata ale zůstala `in_progress` bez conclusion a jobs API vracelo 502/504.
  Zrušení bylo odmítnuté jako již dokončený běh; attempt 2 následně selhal při
  downloadu emulatoru. Attempt 4 prošel. Finální `079d053` prošel vlastním CI
  `41136744088` a kompatibilní fáze je z něj nasazená, viz aktuální stav výše.

- První serverová vrstva retence: Functions lint, 40 unit testů a 123
  emulatorových (65 Rules + 58 serverových) prošlo. Nové časově omezené
  klíče jsou ošetřené ve všech osmi operacích; opakování po deadline odmítne
  server i po fyzickém odstranění receipt. Původních 119 scénářů zůstalo zelených.
  Balení modulu a lokální export handleru ověřené. Flutter klient se v tomto
  kroku nemění; CI a nasazení kompatibilní vrstvy teprve následují.

- Lokální mazání komentářů 30. října: 194 Flutter, 35 Functions unit,
  20 tools a 119 emulatorových testů (65 Rules + 54 serverových) prošlo;
  čistá analýza/formát, Functions lint, release build dev a kontrola manifestu.
  Optimalizace čtení rolí prošla osmi cílenými transakčními testy; jejich
  následný CLI shutdown timeout je rozlišený v [TESTING](TESTING.md).
  Export/balení, region/limity a lokální handler bez Auth/App Check ověřené.
  [CI `41090758502`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41090758502)
  pro `34f7cade0489e6fe28811cd88693edc2ea0e619c` prošlo. Po výslovném souhlasu
  je Function nasazená (`deletecomment-00001-zuc`), skutečné limity a HTTP 401
  bez App Check ověřené. Lokální aktivace prošla 19 cílenými Flutter a 20 tools
  testy. Aktivace `fcbc23d58bfd94498131a126059fe58b645c79a4` prošla
  [CI `41091651584`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41091651584),
  release build/manifest i Hosting otisky prošly. Živé mazání dosud neověřené.

- Lokální hlášení obsahu: 189 Flutter testů, 32 Functions unit testů, Functions
  lint, 19 testů nástrojů a 111 emulatorových testů (65 Rules + 46 serverových).
  Ověřený export/balení, souběh, idempotence po moderaci, soukromí, schémata
  a sdílené limity. Čistá analýza/formát a release build dev prošly. [CI `40921153845`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40921153845)
  pro `79082d8c3796b0e5f18335be975fe9f2bbf5a576` prošlo; Function je aktivní,
  limity ověřené a HTTP požadavek bez App Check vrací 401.
- Aktivace `be5a88f` prošla [CI `40922593743`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40922593743).
  Živě prošly 3 reporty/receipt, duplicita bez zápisu, cooldown 429 a úspěch
  po vyčkání. TestModerator viděl 3 případy a jejich detaily. Úklid odstranil
  7 testovacích dokumentů a parent označil `deleted` s čítačem 0; receipt zůstaly.
- Klient ukládání 29. října: 181 Flutter testů, čistá analýza a formát,
  18 testů vývojových nástrojů, Functions lint a 29 unit testů, 104 emulatorových
  testů (65 Rules + 39 serverových), release build vývojového webu a příprava
  Functions artefaktu. [CI `40914821162`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40914821162)
  pro `5fceccb98f145174acd7917b26356d04e65604a1` prošlo.
- [CI aktivace `40916381788`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40916381788)
  pro `02b8b28` prošlo. HTML, JS i konfigurace nasazené verze mají shodné otisky
  s lokálním release buildem; živě ověřené byly záložky i plné serverové čítače.
- Lokální import exportu `toggleShoutSave` ověřil region/provozní limity a
  odmítnutí chybějící Auth nebo App Check přes handler; nejde o živý HTTP test.
- Serverová logika ukládání: lint, 29 unit testů a 104 emulatorových testů
  (65 Rules + 39 serverových), z toho 7 nových scénářů ukládání.
- [CI ukládání `40414165546`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40414165546) prošlo pro `cc62831`.
- Nasazená oprava detailu: 173 Flutter testů, analýza, formát, release build
  a [CI `40411478509`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40411478509).
- Webové nástroje: 17 testů při dokončení komentářových reakcí.
- Manuální a databázové důkazy jsou v [TESTING](TESTING.md); limity a známá
  provozní omezení v [SETUP_AND_OPERATIONS](SETUP_AND_OPERATIONS.md).

## Další konkrétní krok

Navázat retencí receipt/mazáním účtu. Vlastník 30. října schválil sedmidenní
okno bezpečného opakování jedné akce; dosavadní 60denní retence po smazání účtu
se nemění. Dokončit kontroly/CI klientského commitu a nasadit všech osm
kompatibilních Functions z téhož zdroje, teprve potom nový Hosting.
Vybraný zdroj je `c3ad17dafd916915c0af7e01e935fb61466ec7c7`, připravený také
v čistém detached worktree `build/operation-retention-deploy`; obsahový artefakt
a závislosti tam jsou připravené. Kořenový `build/web-dev` je release tohoto
zdroje a manifest prošel kontrolou pro `shoutout-dev-46c81`.
Další dokumentační commit není součástí tohoto zvoleného aplikačního zdroje.
Ověřit živé časové klíče, očekávaný účet a metadata/deadline, dokončit odmítání nových
legacy požadavků. Teprve potom uklidit legacy receipt a dokončit úklid.
Současný `legacyOperationKeysAccepted: true` je výslovně přechodný stav;
existující klienti se nesmějí rozbít a legacy receipt se nesmějí zatím mazat.
Samotné TTL nad současnými klíči nestačí. Produkční rozhodnutí se stále
předkládají vlastníkovi; rutinní vývojové rollouty mají trvalý souhlas po CI.

Mazání je uzavřené: TestModerator po novém otevření aplikace odstranil
testovací komentář bez postihu; Business a Bright_Otter_182 pak odstranili
vlastní komentáře automatizovaně ve fungující kartě `722303372`.
Právě tři receipt a odpovídající delete rate eventy souhlasí. Počet v detailu
šel bez obnovy 2 → 1 → 0; moderátorský krok snížil parent 3 → 2.
Dočasný parent má `deleted`, testovací report je odstraněný, komentáře žádné.
Receipt/rate eventy jsou zachované. Důkazy a poslední fixture state jsou
v TESTING.md a ignorovaném `build/comment-delete-live-state.json`.
Nejde o dokončení celého milníku důvěryhodné moderace ani serverové brány.
Průzkum
30. října nenašel další běžnou webovou mutaci těchto čtyř obsahových čítačů
mimo připravené serverové cesty; staré větve zápisů stále chrání přepínače,
Rules se dosud neuzavírají.
Při čekání na ruční průchod lokální emulatorová zkouška doložila, že prosté
mazání receipt umožní opětovné provedení starého požadavku. Bezpečný návrh
retence a schválené sedmidenní okno jsou v [DATA_MODEL](DATA_MODEL.md#retence-potvrzení-operací--ověřený-problém-a-další-návrh).
Ukládání i hlášení drží retry klíče pouze v paměti relace; obnovení stránky je
nezachová. Retence receipt je ve vývoji uzavřená; zbývá prostorový feed a
závěrečné uzavření přímých zápisů v Rules.

## Rozhodnutí, nejistoty a hranice oprávnění

### Další krok – prostorový feed

**Aktualizace 31. října:** vlastník dodal nový read/refresh požadavek.
Po následné diskusi byl připravený [etapový návrh R1–R3](FEED_IMPLEMENTATION_STAGES.md).
Vlastník v R1 vybral A0–A3 i B1–B4 celé před MVP, v R3 unread-first pouze
v Nejblíž. Top/Končící/Sledované zachovají vlastní řazení. R2 následně schválil
pro poslední známý bod otevřené aplikace s upozorněním, jinak výzvu k poloze.
A0 lokálně dokončená; A1 může pokračovat bez cloudových změn. Po výsledku A1
předložit serverové dotazy, indexy a limity. Expozice, retence, synchronizace,
polling a nízké hodnocení mají brány před příslušnou etapou B.
Požadavek je zaevidovaný jako jeden nový otevřený backlogový úkol (107/156);
24 milníků MVP se nemění. Původní zadání je zachované a prolinkované.

Pořadí vychází z prvního zbývajícího bodu TODO a kritérií serverové brány.
`lib/src/home.dart::_startFeedListeners` nyní načítá poslední globální stránku
aktivních Shoutů podle createdAt; radius, kategorie a řazení se použijí až
v `lib/src/feed.dart`. Starší místní Shout proto může vypadnout kvůli novějším
vzdáleným záznamům. Navazující práce:

1. Ověřit pokrytí existujících dat důvěryhodným geohashem a stávající chování
   bez polohy, změny radiusu/kategorie, blokací a všech čtyř řazení.
2. Připravit serverové prostorové dotazy a kurzory s omezenou velikostí stránky
   i skenování; zachovat produktové filtry a limit 50. Řešit hranice buněk,
   duplicity a neplatný kurzor bez globálního listeneru či neomezených čtení.
3. Ověřit scénář s více než 50 novějšími vzdálenými záznamy a starším místním
   Shoutem, přechody stránek bez duplicit a živé reakce/čítače na načtených kartách.
4. Napojit klienta přes vývojový přepínač, projít CI a živé ověření podle
   pravidel vydání. Produkční data ani Rules neuzavírat před regresí všech toků.

- Od 30. října jsou další vývojové i produkční rollouty předem schválené
  po úspěšném CI přesného commitu a splnění pravidel vydání. Nový dotaz na každý rollout není
  potřeba; kontrola artefaktu/cíle a živé ověření zůstávají povinné.
  [Rozsah a podmínky](RELEASING.md#trvaly-souhlas-s-rollouty).
  Vlastník výslovně potvrdil vývoj i produkční aplikaci. Tato změna
  nemění zbývající živé testy mazání ani nepovoluje libovolné zásahy do dat.
  Vlastník dále upřesnil, že nová produkční a jiná podstatná rozhodnutí chce
  nadále schvalovat; rutinní rollout po úspěšných kontrolách se znovu neptá.

- MVP je veřejný web pro běžné i Business účty. Mobilní vydání a placené
  Business předplatné jsou po MVP; ruční Business aktivace zůstává.
- První veřejné vydání má být `v1.0.0`, až bude MVP dokončené a otestované,
  se schváleným obsahem vydání a splněnou startovní bránou. Produkční rollout
  má za těchto podmínek trvalý souhlas; `main` a tag stále vyžadují odpovídající
  Git oprávnění podle [RELEASING](RELEASING.md).
- Vlastník stanovil přijatelný náklad nejvýše 5 000 Kč měsíčně a uvedl, že
  současné pojistky zatím stačí. Není to důkaz automatického finančního stropu;
  nastavení a zbývající požadavky ověřovat v [COST_SAFETY](COST_SAFETY.md).
- App Check v automatické relaci občas hlásil `appCheck/recaptcha-error`;
  ruční ověření vlastníkem umožnilo pokračovat. Ochrana nebyla vypnutá.
  Úplné vysvětlení klientské chyby ani globální enforcement Auth/Firestore
  nejsou uzavřené. Přihlášení pro živé testy může vyžadovat asistenci vlastníka.
- Při testu 29. října bylo přihlášení Business údaji z lokální evidence odmítnuté;
  příčina není potvrzená. Vlastník se přihlásil ručně a celý Business průchod
  potom prošel. Heslo se neměnilo; nevyvozovat bez další kontroly neplatnost účtu.
- Dokončení jednorázového srovnání starších čítačů/poloh není tímto přehledem
  potvrzené; [původní ruční krok zůstává evidovaný](MVP_SERVER_PLAN.md#data-reconciliation).
- Testovací údaje a hesla patří jen do ignorované složky `docs/local/`.
- Při hlášeních fungovala právě ručně ověřená uživatelova karta i pro další
  automatické kroky; původní karta neměla App Check token a vracela 401.
  Pro další testy používat aktuálně ověřenou relaci. Podrobnosti jsou v TESTING.md.
- Soukromý moderační detail nadále ukazuje „Neznámý (UID)“ bez přezdívky a
  u testovacích cílů chybí region. UID/text jsou správné; stávající UI a geografické
  omezení nebylo tímto rolloutem opravené. Nezaměňovat je za nový nehotový report tok.

## Údržba

Po změně uvést zvlášť připravený kód, úspěšné kontroly a skutečné nasazení.
Při novém release aktualizovat výše uvedený commit/verzi a odkaz na důkazy.
Do tohoto přehledu nepřidávat dlouhou chronologii; původní podrobnosti zůstaly
v nezměněném archivu a nové technické záznamy patří do příslušných dokumentů.

Aktuální směr a neuzavřené náklady: [progresivní feed](FEED_PROGRESSIVE_PLAN.md).
