# Archiv zpráv a komentářů smazaného účtu

1. listopadu 2026. [Rozhodnutí vlastníka a návaznosti](ACCOUNT_DELETION_REMAINING_PLAN.md).
DEV pilot je dokončený včetně živého testu a úklidu; produkce se neměnila.
Zdroj f0625b527ed2660ffa538d26497fc827d427b69f má úspěšné
[CI 41320353170](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41320353170).
Aktivace workerů/webu 1dab78cce583899648f8e17d6814a0ecbfc6aad8 má
[CI 41322524612 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41322524612).
Čisté Functions balíky a DEV web build jsou ověřené; oba DEV flagy jsou true.

## Schválený rozsah

Aktualizace 3. listopadu: v3 je zde historie zavedení archivu; účtový runtime
už má navazující v5 a [konečný purge](ACCOUNT_RETENTION_PURGE_PLAN.md) dokončený
v DEV. Staré joby se nepřevádějí. Aktuální otevřená práce je klientský přechod
a společný závěrečný test, viz [účtový plán](ACCOUNT_DELETION_REMAINING_PLAN.md#aktualni-stav).

Uchovat všechny existující zprávy zahrnuté do smazání účtu a všechny jeho
veřejné komentáře, nejen nahlášený obsah. Soukromá zpráva se zahrne jen při
shodě skutečného odesílatele/příjemce; vlastnictví Shoutu samo nestačí.
Pevná lhůta je serverový createTime žádosti + 60 dní. Přímé klientské čtení
archivu nemá žádná role včetně ownera. Budoucí administrativa má samostatný
[otevřený úkol](BACKLOG.md#archive-administration); nové role, exporty nebo
změny důkazů se tímto nezavádějí.

Rozsah pokrývá obsah existující při zpracování smazání účtu. Neobnoví dříve
fyzicky odstraněné zprávy a není průběžným archivem všech změn aktivních účtů.
Případné uchování při samostatném mazání obsahu vyžaduje vlastní rozhodnutí
o rozsahu a počátku lhůty. Právní texty před veřejným vydáním musí odpovídat
zvolenému rozsahu; nevzniká automatický proces zpřístupňování dat institucím.

## Data a transakce

`accountContentArchive/{sha256(project, sourcePath, sourceCreateTime)}`:

- schemaVersion 1, kind (comment/privateReply), sourcePath;
- sourceCreateTime, sourceUpdateTime, archivovaný celý původní dokument content;
- retentionOwnerId, původní requestCreateTime, archivedAt, pevný retainUntil;
- reactionsComplete a informace, zda v okamžiku přesunu existoval rodičovský Shout.

Archivace, odstranění původního dokumentu a zvýšení počtu v jobu jsou ve stejné
transakci. U komentáře se ve stejné transakci přesně jednou sníží commentsCount
existujícího Shoutu; chybějící rodič se nevytváří. Zdrojové inkarnace stejné
cesty mají různé archivy. Kolize či neznámá vnořená data znamenají review.

Kořen komentáře se přesune nejdřív a job si atomicky uloží pendingArchiveId.
Potom se po dávkách přenesou existující reakce do archivních podkolekcí a
jejich původní dokumenty se odstraní, vždy s průběhem v téže transakci.
Lokální úprava Rules zakazuje další klientské zápisy do reakcí chybějícího
komentáře; běžné reakce se nemění. Svévolné souběžné Admin zápisy do těchto
cest nejsou součástí protokolu a musí být provozně vyloučené.

Souběh smazání obou účastníků jedné soukromé zprávy vytvoří jedinou kopii.
Vlastní ji první úspěšná archivující transakce a její původní deadline se
dalším zpracováním neprodlužuje. Na hranici 60 dní archivátor už nepřidává
další obsah; vyžaduje navazující konečný purge/review. Samotné nastavení
retainUntil neznamená provedené fyzické odstranění. Purge musí odstranit i
reakce a accessAudits před kořenem; smazání rodiče samo nestačí.

## Verze jobu

Nové joby mohou mít schemaVersion 3 jen při současně zapnuté privátní fázi
a contentArchiveEnabled. Živý DEV wrapper má tento nový flag **true**.
Verze 1/2 se nepřevádějí ani při zapnutí flagu; migrace vyžaduje vlastní plán.

Po Shoutech a privátních seznamech následují stages messages → comments ↔
reactions, zakončené content-archived. Počty archivovaných zpráv, komentářů
a reakcí, pendingArchiveId a mezikroky jsou trvalé. Jedno spuštění má společný
rozpočet nejvýše 50 zpracovaných zdrojových položek, nikoli 50 na každý typ.
Auth se ověří jednou v rámci tohoto běhu, bez procesové cache; každá transakce
znovu ověřuje původní žádost a vlastnictví lease. Vypnutí flagu ve v3-aware
kódu v3 pozastaví bez změny dat; v1/v2 dál fungují původně.

## Zachování současné moderace

Nové getArchivedCommentReportTarget přijímá jen ID skutečného commentReport.
Vyžaduje ověřený Auth, App Check, způsobilý účet a stávající oprávnění číst
hlášení (role alespoň 3 nebo dosavadní legacy členství). Nezpřístupňuje
nenahlášené záznamy, soukromé konverzace ani procházení archivu.

Server odvodí cestu z důvěryhodného hlášení a vybere nejvýše dvě inkarnace.
Váže je na skutečný Firestore createTime hlášení a zdroje/archivu, nikoli
čas z klienta či ručně přepsatelný report.createdAt. Vrátí jen text, autora,
původní jméno a čas komentáře. Úspěšné čtení musí zároveň vytvořit accessAudit
bez kopie textu, s actorId a koncem retence stejným jako archiv. Na deadline
nevrací obsah a nevytváří nový audit. Audit/purge jsou částí serverového
retenčního protokolu, nikoli nové klientské oprávnění.

Klientský serverArchivedReportLookup má výchozí false. Při zapnutí použije
fallback jen pro již odstraněný nahlášený komentář. Chybějící Shout nebrání
zobrazení uchovaného podkladu; jeho neexistující detail se neotevírá. Stávající
snapshot soukromého hlášení zůstává použitelný i bez rodičovského Shoutu.
Uzavření již odstraněného komentáře nezopakuje mazání ani úpravu počtu.

## Indexy a provozní rozsah před živým pilotem

Target je existující Standard Firestore `(default)` v shoutout-dev-46c81,
europe-west3. Následující cílené indexy jsou v DEV ověřené jako READY:

- collection-group privateReplies.authorId a privateReplies.recipientId;
- accountContentArchive podle sourcePath + sourceCreateTime descending;
- vyloučení mapy accountContentArchive.content z nepotřebného indexování;
- comments.authorId collection-group je v repozitáři i živě READY, není třeba ho měnit.

Read-only kontrola 1. listopadu: všech 97 komentářů validních, žádné soukromé
zprávy, archiv ani joby; jedna původní žádost. Žádný vzorek nedosáhl hranice
101, kontrola tedy pokryla všechny tehdejší textové záznamy. Důkaz:
build/archive-content-preflight-proof.json, metadata build/archive-index-before.json.

Čistý planner tools/archive_index_plan.mjs vytvořil přesný rozdíl v
docs/local/migrations/archive-index-delta-2026-11-01.json. Digest:
faf3ea13ddc5eb66e6380a2f4ce022390a48e8706766fc38a9e34f11f32eca4d.
Jsou to pouze 3 field PATCH s updateMask=indexConfig a 1 composite POST.
Privátní authorId/recipientId zachovají všechny 3 dosavadní collection indexy
a přidají CG ascending. Textová mapa nového archivu dostane index exemption.
Žádný DELETE a žádný ttlConfig. Celý firestore.indexes.json se v této etapě
**nenasazuje**, protože obsahuje i nesouvisející dosud neschválenou TTL
konfiguraci technických logů. Před použitím rozdílu porovnat aktuální metadata,
po změnách vyčkat READY a ověřit nezměněné ostatní indexy/TTL.
Kontrakty: [field PATCH](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.collectionGroups.fields/patch),
[composite create](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.collectionGroups.indexes/create).

Soukromé zprávy se vybírají dvěma cílenými dotazy. Tím se nevynechá původní
odesílatel/příjemce jen kvůli vadnému participants poli; vadný vybraný záznam
se zachová pro review. Žádný plošný sken všech Shoutů nebo uživatelů.

Jedna archivovaná zpráva má jeden archive create, source delete a job update.
Komentář navíc mění rodičovský čítač. Reakce má vlastní copy/delete/progress;
prázdné potvrzení a přechody fází mají malé metadata čtení/zápisy. Čtení
podkladu hlášení má kontrolní čtení účtu/role/reportu, dotaz nejvýše dvou
archivů a jeden audit write. Opakování transakcí přidává práci. To nejsou
finanční stropy a nezavádí to novou sazbu nebo službu mimo současný Firestore.

Před živým použitím: úspěšné CI přesného commitu, ověřená připravenost indexů,
konkrétní souhlas s novou archivní datovou vrstvou a dalším testovacím Auth
účtem/obsahem, cílený rollout API/Rules/workeru a navazující aktivace webu.
Dosavadní souhlas s pilotem privátních seznamů tento nový archiv nezahrnuje.
Produkce a main se nemění. Konečný 60denní purge a případné právní holdy jsou
samostatné otevřené kroky před celým MVP.

## Schválený rozsah DEV pilotu – dokončený 1. listopadu

Pouze shoutout-dev-46c81. Po CI přesného commitu nejprve výše uvedený indexový
rozdíl a ověření READY, lokální Rules změna pouze k osiřelým reakcím, nová
Function getArchivedCommentReportTarget a aktualizace dvou existujících
account-deletion Functions. Nová callable má App Check, europe-west3,
max 1/min 0, concurrency 1, 256 MiB, 15 s. Oba workery i minutový Scheduler
zachovají dosavadní limity (60 s, maxJobs 1, pageSize 50, lease 120 s,
retryDelay 60 s). Nový Scheduler nevzniká.

Aktivační commit po vlastním CI zapne nové v3 joby a webový report lookup;
Hosting jen site shoutout-dev-46c81. V1/v2 se nemigrují a původní pending
žádost se nemění. Žádný plošný backfill zdrojových dat, TTL, produkce či main.

Test vytvoří právě jeden nový disabled Auth účet, jeho profil/legal, 3 Shouty,
4 privátní položky, 2 zahrnuté soukromé zprávy, 1 cizí konverzaci pod stejným
Shoutem, 1 vlastní a 1 cizí veřejný komentář, 3 reakce a 1 hlášení komentáře
mazajícího se účtu s jiným testovacím reporterId. Ostatní identity fixture jsou jen náhodná testovací data bez
nových Auth účtů/rolí. Při existujícím Auth nic neodstraňovat; po odstranění
jen tohoto Auth ověřit postupný úklid, 3 archivní kořeny, 3 archivní reakce,
zachování cizí konverzace/komentáře, přesný commentsCount, původní deadline,
terminální replay a nepřístupnost archivu klientům.

Stávající účet TestModerator ověří pouze nahlášený komentář přes novou callable
a vznik auditu, případně s ručním přihlášením/potvrzením vlastníka při App Check
potížích. Žádné nové moderátorské oprávnění. Test zahrne dokončený report
detail v aplikaci i bez původního komentáře. Nakonec odstranit pouze evidovaná
data tohoto testu včetně archivních potomků/auditu, reportu, jobu a vzniklého
checkpointu. Jde o schválený jednorázový testovací úklid, nikoli předčasný
purge skutečných uživatelských důkazů.

Rollback musí zachovat v3-aware kód a vypnout contentArchiveEnabled i webový
lookup flag, případné rozpracované v3 bezpečně ponechat pozastavené. Úspěšné
CI není souhlas s novou archivní datovou vrstvou, tímto datovým testem nebo
aktivací neprošlých indexů. Vlastník tento konkrétní pilot výslovně schválil.

## Výsledek živého ověření

- Po existujícím disabled Auth waiting-auth 0 změn; po odstranění jen nového
  testovacího Auth automatický Scheduler dokončil v3 ve čtyřech pokusech.
  Skryl 3 Shouty, odstranil 4 privátní položky, archivoval 2 zprávy,
  1 komentář a 3 reakce. Cizí konverzace a komentář zachované; commentsCount 2 → 1.
- Profil/legal zachované, deadline původní žádost + 60 dní, terminální replay
  nezměnil job ani data. Anonymní archiv 403, nová callable 401.
- TestModerator v aplikaci zobrazil původní archivovaný text, autorství i čas;
  server zapsal 1 accessAudit bez textu. Žádný postih či rozhodnutí se neukládaly.
  Po bílé obrazovce při automatickém reloadu pomohlo ruční zavření/otevření karty;
  samotná příčina načítání nebyla tímto testem určena.
- Úklid odstranil pouze 18 zbývajících fixture dokumentů a checkpoint.
  Testovací Auth chybí, archivů/jobů je opět 0; původní žádost má stejný digest.
- Oba účtové endpointy ACTIVE, source hash 84333fd4e60f6ff1f3088b90a8c2bceec3bd8037;
  nový lookup ACTIVE, hash f4df3c8589c72a779c7ecfeb9190ca31bbab0d06.
  Scheduler a ostatních 10 Functions se nezměnily. Hosting verze
  11888ad4b6a3ffb3, release 1793548167143000, tři hlavní soubory shodné s buildem.

Důkazy: build/account-archive-{infra,wait,live,audit,cleanup}-proof.json,
build/archive-{hosting,index-applied,rules-after}-proof.json,
build/account-content-activation-artifact-proof.json a CI 41322524612.
V1/v2 nebyly migrované, produkce ani main se neměnily. Konečný 60denní purge,
minimalizace identity a klientské napojení zbývají; celý účtový milník není uzavřený.
