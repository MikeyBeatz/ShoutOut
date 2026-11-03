# Konečný 60denní úklid účtu

Rozsah schválený vlastníkem 2. listopadu 2026: dokončit retenční část účtového
milníku – profily, Business data, loga, záložky, vlastní reakce, archivní
texty a kopie důkazů, uvolnění vlastní přezdívky. Navazuje na
[v5 odebrání palců](ACCOUNT_REACTION_REMOVAL_PLAN.md). Implementace je na
`feature/account-retention-purge`; aktuální runtime a brány jsou v
[PROJECT_STATUS](../../PROJECT_STATUS.md).

## Potvrzená rozhodnutí a rozsah

- Termín je původní serverové createTime accountDeletionRequests + přesně
  60 dní. Klientské retainUntil, opakování, report ani nový worker jej nemění.
  Po termínu je práce splatná; fyzické dokončení je dávkové. Nezavádí se hold.
- Ponechat trvale pouze veřejný marker `{schemaVersion: 1, accountStatus: deleted}`
  s UID v cestě. Přezdívku uvolnit jen tehdy, patří-li rezervace stále tomuto UID.
- Všechny dostupné Business údaje včetně poboček/fakturačních podkladů jsou do
  stejného termínu zachované a pak se dočistí. Současná aplikace má fakturační
  pole, nikoli implementované doklady/předplatné; nové modely se nevymýšlejí.
- Vlastník výslovně schválil anonymní technický kontext pro cizí komentáře
  a soukromé konverzace pod vlastním Shoutem: pouze schemaVersion/status/
  contentPurged, bez původního textu, názvu, polohy a identity autora. Cizí
  komentáře a zprávy dvou jiných účtů se kvůli smazání vlastníka Shoutu nemažou.
- Vlastník výslovně schválil vypnutí soft delete pouze v bucketu
  `shoutout-dev-46c81.firebasestorage.app`. Ověřená původní politika je
  604800 sekund; změna je pouze retentionDurationSeconds 0 s podmínkou
  metageneration. IAM, veřejnost, versioning a produkce se nemění.
  Podle [Cloud Storage dokumentace](https://cloud.google.com/storage/docs/soft-delete)
  se změna nevztahuje zpětně na dříve soft-deleted objekty.

## Trvalý průběh a pořadí

Samostatný soukromý accountPurgeJobs/{hash} používá tutéž identitu jako
accountDeletionJobs: projekt, UID a originální request createTime. Vzniká
atomicky s novým výslovně zapnutým primárním jobem, nikoli až po úspěchu
archivace; částečné selhání primární fáze tedy neztrácí termín konečného úklidu.
Staré žádosti/job verze se automaticky nepřevádějí. Flag retentionPurgeEnabled
je při přípravě vypnutý; DEV aktivace 96b0782 proběhla po přesném CI a všech
uvedených provozních branách. Produkce ani historické joby se tím nezapínají.

Existující minutový Scheduler upřednostní splatný purge před další údržbou.
Nejvýše 1 job / 50 pracovních kroků za invokaci, lease 120 s, retry nejdříve
za 60 s; žádný další plánovač ani rozšíření prostředků Functions.
Každý krok zahrnuje nanejvýš jeden vybraný dokument či soubor, nebo posun
metadat. Prázdné fáze také spotřebují krok. Žádné plošné skeny uživatelů/feedu.

Před převzetím server ověří nepřítomnost Auth, původní pending žádost,
její createTime, pevný termín a neaktivní lease primárního workeru. Primární
job se ohradí retentionPurgeStartedAt; veřejný marker brání obnovení identity.
Každá databázová mutace znovu čte originální žádost, marker, vlastní lease
a verzi průběhu ve stejné transakci. Výpadek Auth není důkazem smazání.

Vybraný kořen a post-order zásobník se ukládají trvale. Metadata-only
listDocuments s showMissing a pageSize 1 zahrne i dokumenty bez vlastních
polí, pod nimiž zůstali potomci. Automatické stránkování SDK je zakázané.
Odstranění listu a posun průběhu jsou atomické; rodič se řeší až po potomcích.
Převzatý/propadlý zámek, výměna kořene nebo žádosti zastaví starého pracovníka.
Neznámá/nebezpečná data jdou do needs-review, bez zavedení nového retenčního
termínu. Oprava takové provozní chyby je nutná; není to oprávnění držet data navždy.

## Datové cesty

| Skupina | Postup |
|---|---|
| Živé vlastní komentáře/zprávy | Cílené CG authorId/recipientId; odstranit vlastní obsah a potomky, transakčně upravit commentsCount. |
| Vlastní palce/záložky | Cílené CG userId; odstranit, u současného cizího rodiče atomicky odečíst odpovídající počet, bezpečně řešit osiřelý list/reinkarnaci rodiče. |
| accountContentArchive | Nové subjectUserIds indexují skutečné autory/účastníky; odstranit všechny vlastní kopie i v archivu jiného účtu a potomky. |
| Archivované reakce/accessAudits | CG actorId umožní odstranit také vlastní kopii pod cizím archivním kořenem. |
| Odpovědi na vlastní komentáře | Odstranit strukturovanou replyToNickname/replyToCommentId vazbu v živé i archivní odpovědi; oddělit pouze shodný automatický @prefix, zachovat vlastní text cizího autora. |
| Hlášení a kopie důkazů | Vlastní reporterId/authorId/targetUserId plus přesné odkazy vlastního obsahu; vyčistit i kopii v cizí sanctions/clearance při zachování ostatního cizího případu. Stav open neprodlužuje termín. |
| Oznámení a sociální vazby | Vlastní actorId, příchozí following/blocked targetUserId; odstranit. Z oznámení odkazujících na původní vlastní Shout odstranit starý název a neplatný cíl. |
| Technické/podpůrné záznamy | Vlastní serverOperations, clientErrorLogs, technicalLogAccessAudits, bugReports a rateLimits/actions. |
| Role, sankce a audity | Odstranit vlastní cílové záznamy; z cizích případů odebrat pouze strukturovaný odkaz na smazaného pracovníka. |
| Business/profil | Rekurzivně vlastní users/businessProfiles/businessApplications včetně poboček a právních či dalších vlastních potomků. |
| Storage | Pouze businessLogos/{uid}/ a bugReports/{uid}/; trvalý pending path/generation, podmíněný delete, ověřené zmizení, bezpečný lost-ack retry. |
| Závěr | Uvolnit jen stále vlastní rezervaci a jako poslední odstranit původní žádost, primární job a purge job. Minimální veřejný marker zůstává. |

Přirozené volné zmínky osoby v textu jiného uživatele nejsou automaticky
rozpoznávané ani přepisované. Cílem jsou data účtu a jejich strukturované kopie.
Mimo tento protokol se nesmějí Admin SDK nástroji obnovovat zápisy pod starým
UID či generace souborů. Nejde o implementaci sedmidenního globálního Shout purge.

## Příchozí zápisy a indexy

Při vstupu do purge zmizí soukromý profil a jednorázově se vypnou všechny
notifikační preference. Existující Rules kontroly příjemce a preferencí tím
uzavřou příchozí soukromé zprávy a oznámení bez dalších dokumentových čtení.
Opakování preference znovu nevytváří. Nové cílové blokace, sankce a hlášení
jsou také odmítnuté. Vlastní Shouty se nejdříve zmrazí: tělo a poloha zmizí,
dočasný authorId umožňuje dokončit cílený průchod. Po dočištění zůstává pouze
třípolový anonymní kontext, pokud má cizí potomky; prázdný kořen se odstraní.
To je bezpečnostní návaznost úklidu, nikoli tvrzení, že je dokončený plný
klientský cutover účtového milníku. Nové blocked listy mají targetUserId
shodné s ID dokumentu; oba klientské zapisovače jsou kompatibilně upravené.

Plán přidává jen 6 CG ASC indexů: reactions.actorId, accessAudits.actorId,
notifications.actorId/targetShoutId, following.targetUserId, blocked.targetUserId.
Všechny dosavadní indexy se zachovají, updateMask je pouze indexConfig.
Celý firestore.indexes.json se nenasazuje, protože obsahuje jiné neschválené TTL.
Metadata nových archivů obsahují subjectUserIds, sourceShoutId a případnou
replyToCommentId; tělo content zůstává mimo globální index archivu.

## Ověřené vstupy a zbývající brány

Read-only DEV inventura před implementací: 0 archivů/jobů/obsahových hlášení/
sankcí/auditů, 1 původní pending žádost, 0 blocked/following listů,
2 oznámení, 2 clientErrorLogs a 52 serverOperations. Žádné opravné datové
zápisy nebyly potřeba. Inventura ani přítomnost indexů samy nejsou nasazení.

Lokální sada zahrnuje souběh, Firestore/Storage lost ack, kopie cizího
moderačního případu, minutový maintenance rozpočet a zamezení opětovnému
vytvoření notifikačních preferencí při pokračování. Přesné výsledky kontrol
a skutečné nasazení se evidují v PROJECT_STATUS; příprava sama není rollout.
Následuje přesné CI, přípravný DEV rollout metadat/webu/Rules/indexů, samostatně
schválená bucket policy, aktivační commit a jeho CI/rollout. Tyto brány jsou
v DEV splněné (f81eaf4 / 96b0782, CI 41538976226 / 41539164008).
Živý pilot používá
jen vlastní syntetický UID a fixture, skutečný Auth/Firestore/Storage; hranici
60 dnů ověří řízený čas interního jádra, nikoli čekání dvou měsíců nebo
zpětné přepsání serverového createTime. Bez nové veřejné testovací Function.
Žádné jiné UID, původní pending žádost, produkce, main ani IAM se nemění.

Rules prototyp používá vlastnické kontroly, výchozí zákaz a vstupní ohradu
pro purge; regresní sada prošla. Před prvním veřejným vydáním zůstává nutná
závěrečná revize pravidel jako součást startovní brány MVP.

<a id="uzavření-bodu-1-v-dev--3-listopadu-2026"></a>

## Dokončení konečného úklidu v DEV – 3. listopadu 2026

Příprava f81eaf4 / [CI 41538976226](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41538976226)
a aktivace 96b0782 / [CI 41539164008](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41539164008)
prošly: 254 Flutter, 40 tools, 107 unit, 355 Rules/server, 15 purge a 15 Storage,
analýza/lint/build. Lokálně také 355/355 Rules a 15/15 purge.

Skutečný DEV trigger a minutový Scheduler dokončily nový syntetický UID bez
vytvoření Auth účtu do content-archived se 3 archivními kořeny a budoucím
purge jobem. Původní createTime a deadline zůstaly shodné. Před termínem
stejné jádro vrátilo deferred bez zápisu; s řízeným časem +60 dní nad reálným
Firestore/Storage dokončilo úklid včetně chybějícího mezilehlého rodiče,
Business/právních potomků, archivních kopií, záložky, 2 souborů, rezervace,
žádosti a obou pracovních záznamů. Cizí komentář a konverzace zůstaly pod
třípolovým kontextem; cizí odpověď ztratila strukturovanou vazbu a automatický
@prefix, zachovala vlastní text. Čítače zůstaly správné, terminální replay noop.

Řízený kernel běžel přes autorizovaný CLI OAuth a přesnou připravenou
nasazenou binárku; nejde o důkaz uplynutí 60 dní na hodinách Cloud Scheduleru
ani o veřejný testovací endpoint. Skutečný runtime trigger/Scheduler byl
ověřen běžným časem v předcházejících fázích. Storage test ověřil politiku 0,
nepřítomné objekty a prázdné výpisy verzí. Pokus o softDeleted listing v této
politice vrací 400; opraven byl pouze lokální verifier, serverový purge uspěl.
Časování jednotlivých živých dávek se při tomto průchodu nedochovalo;
provozní limity se ověřily v konfiguraci a rozsah kroků v integračních testech.

Fixture je celá uklizená; původní request/job/archive inventura je shodná.
Metadata/Rules/web/indexy, dvě účtové a pět obsahových Functions jsou ověřené
v DEV. Produkce, main, historické žádosti a IAM zůstaly beze změny.
Aktuální revize/hash jsou v PROJECT_STATUS. Surové lokální důkazy (ignorované):
`build/purge-{preparation-ci,active-ci,indexes-ready,bucket-applied,
preparation-deployed,active-deployed,hosting-proof,primary-proof,pilot-proof,
cleanup-proof}.json`; logy CI a lokálních sad mají stejný prefix.

Celý účtový milník zůstává otevřený: navazuje klientský cutover, uzavření
přímých Rules zápisů a společný závěrečný test. Tento podkrok nemění MVP 9/24.
