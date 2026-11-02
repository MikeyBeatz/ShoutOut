# Konečný 60denní úklid účtu

Rozsah schválený vlastníkem 2. listopadu 2026: dokončit bod 1 účtového
milníku – profily, Business data, loga, záložky, vlastní reakce, archivní
texty a kopie důkazů, uvolnění vlastní přezdívky. Navazuje na
[v5 odebrání palců](ACCOUNT_REACTION_REMOVAL_PLAN.md). Implementace je na
`feature/account-retention-purge`; aktuální runtime a brány jsou v
[PROJECT_STATUS](PROJECT_STATUS.md).

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
je při přípravě vypnutý; aktivace vyžaduje přesné CI a uvedené provozní brány.

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
schválená bucket policy, aktivační commit a jeho CI/rollout. Živý pilot používá
jen vlastní syntetický UID a fixture, skutečný Auth/Firestore/Storage; hranici
60 dnů ověří řízený čas interního jádra, nikoli čekání dvou měsíců nebo
zpětné přepsání serverového createTime. Bez nové veřejné testovací Function.
Žádné jiné UID, původní pending žádost, produkce, main ani IAM se nemění.
