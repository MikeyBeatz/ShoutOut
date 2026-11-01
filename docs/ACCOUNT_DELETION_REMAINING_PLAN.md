# Dokončení mazání účtu – rozhodnutí, ochrany a pořadí

Rozhodnutí 31. října, aktualizováno 1. listopadu 2026.
Navazuje na [živě ověřený DEV pilot](ACCOUNT_DELETION_DEV_PROPOSAL.md)
a [kritéria účtového milníku](MVP_SERVER_PLAN.md#account-deletion).
Zdrojem deklarované retence je také `lib/legal.dart`, česká sekce
„Uložení a doba uchování“: skrytí veřejného obsahu a potřebné bezpečnostní údaje
60 dní; nejde o povolení uchovat bez rozlišení všechny preference či cizí obsah.

## Rozhodnutí vlastníka 31. října

- **Aktuální přezdívku rezervovat do konce stávající 60denní lhůty a pak uvolnit.**
  Použít serverový deadline žádosti, který už používá DEV job (createTime + 60 dní).
  Uvolnění smí odstranit pouze rezervaci stále vlastněnou původním UID.
  Není to souhlas měnit politiku obyčejného přejmenování nebo rezervovat cizí aliasy.
- **Soukromé zprávy po smazání účtu skrýt oběma účastníkům a následně dočistit.**
  Potřebné podklady hlášení mají být pouze v interní retenční části.
  Samotné schválení ještě neznamená, že jsou staré zprávy přemístěné či skryté.

## Doplnění vlastníka 1. listopadu – rozsah textů

- Uchovat v neveřejné retenční části **všechny soukromé zprávy zahrnuté do
  smazání účtu a všechny jeho veřejné komentáře**, nikoli jen nahlášené texty.
  U zpráv jde o skutečné účastníky podle authorId/recipientId; vlastnictví
  nadřazeného Shoutu nezahrnuje konverzace dvou jiných lidí.
- Platí stávající serverová lhůta createTime žádosti + 60 dní. Nahlášení
  nerozhoduje o zařazení do archivu. Texty nejsou veřejné a samotné toto
  rozhodnutí nezavádí klientské právo na jejich čtení či změny.
- Vlastník požaduje později přístup a případnou práci s archivem v administraci.
  Je to samostatný otevřený [backlogový úkol](BACKLOG.md#archive-administration).
  Konkrétní role, povolené akce, audit a termín se schválí při jeho návrhu;
  běžná moderátorská role tím automaticky nedostává celý neveřejný archiv.
- Jde o produktové rozhodnutí o rozsahu uchování. Právní texty a posouzení
  před veřejným vydáním musí odpovídat skutečné implementaci. Rozhodnutí samo
  neurčuje proces předávání dat institucím ani případné prodloužení právním holdem.

## Stav a návaznosti

| Úsek | Stav | Kritérium uzavření |
|---|---|---|
| Skrytí vlastních Shoutů a trvalý průběh | DEV hotovo, pilot 3/3 | Důkazy v předchozím dokumentu. |
| Zastavení nových serverových oznámení/zpráv pro mazající se účet | DEV nasazené 1. listopadu z b777992 po úspěšném CI | Čtyři Functions ACTIVE, limity a anonymní 401 ověřené. Příjemcovské scénáře mají emulátor/CI, nikoli nový živý přihlášený test. |
| Vlastní nepotřebné soukromé podkolekce | DEV dokončeno z 6a4606e po CI 41300216738 | Živě waiting-auth 0/0 → 3 skryté Shouty → 4 odstraněné vlastní položky, zachovaný profil/legal, replay a úklid. Staré joby se nemigrují. |
| Soukromé zprávy a veřejné komentáře účtu | V3 lokálně implementovaná, nové flagy false | CI, cílený indexový rozdíl a samostatný schválený archivní pilot; [schéma a postup](ACCOUNT_CONTENT_ARCHIVE_PLAN.md). |
| Identita, rezervace přezdívky a zbývající osobní data | Částečně rozhodnuto, implementace zbývá | Minimální retenční údaje, správné odkazy/fallbacky, uvolnění pouze vlastní rezervace po lhůtě. |
| Konečný 60denní úklid | Zbývá | Opakovatelný běh včetně podkolekcí a Storage, vypořádání hlášení/holdů, audit a test přesné hranice. |
| Klient a uzavření přímých zápisů | Zbývá | Nový tok od začátku do konce, ověření přerušené sítě, teprve pak Rules cutover. |

## Ochrana příjemce

`functions/notification_recipient.js` čte v téže transakci existenci profilu,
existenci accountDeletionRequests a nastavení oznámení. Jakákoli žádost znamená
nedostupný účet, stejně jako u vlastní eligibility. Chybějící profil také
nesmí vést k vytvoření nové osiřelé schránky po skončení retence.

- createComment zachová veřejný komentář a čítač; přeskočí jen nedostupné příjemce.
  Druhý aktivní příjemce veřejné odpovědi dostane své oznámení dál.
- toggleShoutReaction/toggleCommentReaction zachovají reakci, čítače, limity a receipt;
  nedostupnému autorovi nevytvoří ani neaktualizují oznámení.
- createPrivateReply nedostupnému příjemci odmítne novou zprávu bez zápisu obsahu,
  receipt, limitu či oznámení. Již potvrzený replay nic nevytváří znovu.

Nevzniká procesová cache stavu mazání. Tím, že se příjemce čte uvnitř transakce,
vznik žádosti a oznámení mají konzistentní pořadí. Na příjemce přibývají dvě
nezbytná dokumentová čtení pro veřejná oznámení, jedno pro soukromou odpověď;
nepřidává se Auth API volání ani plošné hledání uživatelů. Jediné getAll používá
fieldMask pro nickname a tři relevantní preference; e-mail ani celý profil se
kvůli těmto kontrolám nenačítá.

Rollout b777992e7e7a4e02cb94a7c08184e22977a1b0e4 prošel CI 41245446077.
Čistý artefakt má SHA-256 cc4c3b5eed5a6f2383f6222e236ce4ff9f236dc5a371123b338545b6633ff4c2;
nasazený firebase-functions-hash čtyř endpointů je 287c988e2f8515fbc233b58bdd0a1cf43bc74f9e.
Ostatních osm Functions, Hosting, Rules a produkce se neměnily. Rollback kódu:
ef49f2573f488df9b9e6f782bb493df9b4eae71b (CI 41236718912), opět jen stejné čtyři
obsahové Functions. Soukromý úklid tímto rolloutem není aktivovaný.

Staré přímé klientské zápisy/Rules tím nejsou uzavřené. Před úplným dočištěním
je nutné pokrýt i tyto zapisovače; samotný nový serverový helper není důkazem
neexistence všech možných příchozích zápisů.

## Soukromý úklid a verzovaná fáze jobu

`functions/account_private_cleanup.js` je interní lease-fenced jádro bez
callable/trigger exportu. Verzovaný job je volá pouze po potvrzeném skrytí Shoutů,
se shodnou pending žádostí a chybějícím Auth. Každý zápis má ve stejné transakci
kontrolu zámku a původního requestCreateTime. Admin Auth je v testech simulovaný.
`account_private_cleanup_lab.js` zůstává adaptérem původního prototypu pro
emulátor a stále odmítá živé projekty; není v deploy artefaktu. Nové jádro
je v připravovaném account-deletion balíku. V původním 22bcf73 je aktivace
false; schválený aktivační commit 6a4606e ji mění na true a po úspěšném CI
41300216738 je nasazený a živě ověřený v DEV.

| Data | Připravený postup |
|---|---|
| users/{uid}/notifications | Odstranit vlastní schránku, nikoli oznámení jiných účtů. |
| users/{uid}/following, blocked | Odstranit vlastní seznamy, nepřepisovat cizí vazby. |
| users/{uid}/settings/notifications | Ponechat minimální pětici false jako ochranu starých klientů; absence by znamenala jejich výchozí true. |
| users/{uid}, legal, nicknames | V tomto helperu zachovat; minimalizace/retence má vlastní následující krok. |
| Ostatní kolekce, reporty a neznámá vnořená data | Bez automatického mazání tímto helperem. |

Jedna stránka vybírá nejvýše 50 dokumentů a dotazuje jen jejich reference.
Odstranění je transakční s updateTime preconditions; změna jediného kandidáta
vrátí conflict bez částečného smazání. Opakování se znovu dotáže zbývajících
dokumentů. Před smazáním odmítne neočekávané podkolekce; neznámé klíče nastavení
také zachová a předá ke kontrole. Svévolné souběžné Admin zápisy do starého UID
musí být při živém zapojení mimo tento protokol zablokované/provozně vyloučené.
Job verze 2 ukládá workStage (shouts/private), shoutsHiddenAt,
privateDeletedCount a privatePreferencesDisabled. Odstranění stránky a zvýšení
počtu proběhnou atomicky; ztracená odpověď nezpůsobí nové započítání. Settings
guard je také svázaný se zámkem. Samostatný běh zpracuje buď stránku Shoutů,
nebo nejvýše 50 privátních dokumentů, nikdy obě plné stránky najednou.
Neznámá nastavení či vnořená data přejdou hned do needs-review a zachovají se.
Prázdná potvrzovací stránka ukončí tuto část jako private-leaves-cleaned;
nejde o dokončené smazání celého účtu ani o provedený 60denní úklid.

Nové joby dostanou schemaVersion 2 pouze při privateCleanupEnabled=true.
Dosavadní joby verze 1 zůstanou verzí 1, včetně dokončených shouts-hidden;
nezmění se jim identita, průběh ani deadline. Jejich pozdější převod bude mít
vlastní kontrolovaný plán. Vypnutí flagu v kódu, který už verzi 2 zná, ji
bez zápisů pozastaví jako private-disabled; verze 1 pokračuje původním tokem.
Vrátit po vzniku v2 záznamů starší nekompatibilní worker není bezpečný rollback.

Lokální ověření: 35 job/private případů a 68 Rules případů, celkem 103 pass
bez skipů. Nových 12 job případů pokrývá stránkování, replay, ztracené potvrzení
již potvrzené transakce, aktivní a převzatý zámek, konflikt updateTime, výměnu
žádosti, Auth existenci/výpadek, terminální review, zachování v1, vypnutí flagu,
vadný v2 stav a limit stránky. Rules testy doložily, že deleting účet ani jiný
klient neobnoví jeho seznamy či preference. All-false guard odmítne starý
notifikační zápis, ale tatáž platná reakce bez oznámení projde. Všech pět
starých typů oznámení používá tento preference guard; serverové příchozí cesty
už blokují deletion marker podle předchozího rolloutového ověření.
Vzorek 55 privátních položek se rozdělil na 50 + 5, vlastní zpracování dvou
stránek v emulátoru 460 ms; nejde o cloudovou latenci nebo cenu.

<a id="private-job-dev"></a>

## Rozšířený DEV pilot – dokončený 1. listopadu

Vlastník výslovně schválil uvedené rozšíření i nový jednorázový datový test.
Aktivační commit zapíná privátní fázi pro nové DEV joby. 6a4606e7713e66affd1ad6d98339f6837bf2c17c
má úspěšné CI 41300216738, obě Functions ACTIVE a shodný source hash
3c5bb3d252677158aee75a54571a26c43e6af03a. Ostatních 10 Functions, Hosting,
nastavení Scheduleru i prostředky beze změny; anonymní HTTP 403.

Nový disabled Auth fixture byl skutečně ověřený jako existující: waiting-auth,
0 skrytých Shoutů, 0 odstraněných položek, 4 privátní položky a true preference
beze změny. Po odstranění pouze tohoto Auth účet automaticky dokončil 3 skryté
Shouty a 4 odstraněné privátní položky během 3 převzetí jobu. Profil a právní
fixture zůstaly stejné, preference byly false, ostatní pole Shoutů se nezměnila.
Replay nezměnil job ani jeho updateTime, anonymní čtení jobu 403, retenční údaj
je přesně 5 184 000 000 ms. Není to provedení konečného 60denního úklidu.

Všechna data nového testu, jeho žádost/job a vzniklý checkpoint jsou uklizená;
Auth nepřítomný, původní pending žádost má shodný digest a žádné jiné joby
nebyly odstraněné. Důkazy v build/account-private-infra-proof.json,
account-private-wait-proof.json, account-private-live-proof.json a
account-private-cleanup-proof.json. Přesné runtime revize jsou v infra důkazu.

Připravený commit 22bcf7316908d04e12ce5aed80599a460c0c1591 má úspěšné CI
41299376137 včetně 224 Rules/server případů, celé Flutter sady a web buildu.
Čistý instalační balík obsahuje šest JS modulů, každý odpovídá Git blobu.
Read-only DEV preflight: 0 v1 jobů, 0 v2 jobů, 1 pending žádost. Existující
žádost zůstane beze změny, pilot má vlastní novou žádost a UID.
Důkaz: build/account-private-preflight-proof.json, CI log account-private-ci.log.

- Cíl jen shoutout-dev-46c81, codebase account-deletion, dvě stávající Functions.
  Po úspěšném CI připraveného kódu navazující otestovaný commit zapne
  privateCleanupEnabled. Vytváření nových žádostí pak používá v2; žádná migrace
  dosavadních žádostí/jobů. Hosting, Rules, produkce a main se nemění.
- Stejný minutový Scheduler UTC, maxJobs 1, pageSize 50, lease 120 s,
  retryDelay 60 s a stávající chybové okno 24 h. Každý endpoint max 1 instance,
  concurrency 1, 256 MiB, 60 s, europe-west3. Žádný nový plánovač nebo služba.
- Pouze jeden nově vytvořený zablokovaný testovací Auth účet; jeho testovací
  profil, právní fixture, 3 Shouty a 4 vlastní privátní dokumenty (2 oznámení,
  1 sledování, 1 blokace). Nejprve ověřit čekání bez mazání při existujícím Auth,
  pak odstranit pouze tento Auth účet a ověřit 3 skryté Shouty, 4 odstraněné
  privátní položky, minimální all-false preference a zachovaný profil/právní fixture.
  Replay nezmění počty, deadline zůstane createTime + 60 dní.
- Po ověření uklidit jen přesně evidované dokumenty a job tohoto testu.
  Žádné mazání existujících uživatelských účtů či jejich dat, archiv zpráv,
  indexový backfill, uvolnění přezdívky nebo plošný 60denní úklid.
- Nejvýše 50 deletů v privátní stránce, 4 malé job zápisy (po instalaci guardu
  obvykle 3), nejvýše 1 settings zápis při instalaci. Dotazují se jen tři vlastní
  podkolekce a maximálně 50 referencí potomků pro kontrolu neznámé struktury;
  nejsou tu globální uživatelské skeny. Transakční opakování přidá práci.
  Při prázdných dotazech a pravidelných kontrolách existují čtení i bez deletů;
  nastavení není finanční hard cap. Žádná nová sazba Scheduleru.
- Zastavení rozšíření: nový ověřený commit se stejným v2-aware kódem a flagem
  false; rozpracované v2 záznamy zůstanou zachované a pozastavené. Jejich
  logovaný počet privateDisabled upozorní na nedokončenou práci.

Souhlas je třeba kvůli rozšíření živého mazání dat a novému testovacímu Auth
účtu. Trvalý rolloutový souhlas tuto datovou změnu sám nepokrývá.

## Ověřené návaznosti před archivací zpráv a komentářů

- Soukromé zprávy jsou v shouts/{id}/privateReplies a server ukládá authorId,
  recipientId a participants. Mazat lze jen zprávy s mazaným účtem mezi
  skutečnými dvěma účastníky, nikoli každou zprávu pod jeho Shoutem. Současné
  participant Rules dovolí druhému účastníkovi číst existující zdroj i po
  vzniku cizí deletion žádosti; vyčištění vlastní schránky toto neřeší.
- firestore.indexes.json zatím nemá collection-group index pro privateReplies.
  Globální hledání zpráv podle účastníka vyžaduje předem ověřit index/náklady
  a historickou validitu dat; nepředpokládat, že vlastní index kolekce postačí.
  Komentáře už mají collection-group authorId index v repozitáři, živý stav
  je nutné samostatně ověřit před použitím.
- createContentReport už kopíruje text a authorId soukromé zprávy do
  privateReplyReports. U veřejného komentáře commentReports ukládá jen ID,
  důvod a stav: fyzické smazání zdroje by bez doplnění podkladu ztratilo text.
  Stávající deleteComment také neodstraňuje reakční podkolekce. Budoucí fáze
  musí vyřešit oba případy, atomický commentsCount i idempotentní přenos.
- Moderační _ReportDetailDialogState._load v lib/src/moderation.dart nejprve
  vyžaduje existující Shout i pro soukromé hlášení se snapshotem. Samotné
  uchování textu tedy nezaručuje dostupnost důkazu po odstranění Shoutu;
  moderační fallback patří do téhož následujícího úseku.
- Rozsah textů je rozhodnutý: uchovat všechny podle doplnění výše.
  Samostatně zůstává rozhodnutí o existujícím otevřeném hlášení/hold po
  uplynutí lhůty. Místní příprava archivu nemění živou retenci ani indexy.

## Další větší úsek

1. Privátní fáze je hotová ve vývoji včetně CI, živého testu a úklidu.
   Dosavadní v1 shouts-hidden záznamy zachovat;
   případnou migraci připravit odděleně.
2. Dokončit CI a schválit [připravený archivní pilot](ACCOUNT_CONTENT_ARCHIVE_PLAN.md).
   Lokální kód už provádí interní archiv a atomické odstranění původních soukromých zpráv,
   kde je účet jedním z účastníků; zachovat podklady reportů pouze interně.
   Nezahrnout svévolně konverzace dvou jiných lidí jen podle vlastníka Shoutu.
3. Obdobně skrýt vlastní veřejné komentáře a přesně jednou upravit commentsCount;
   samotný filtr v UI není přístupová ochrana ani odstranění podkolekcí.
4. Vyřešit veřejný profil, historické kopie jména, Business profil/logo, role a
   sociální odkazy. Nepovažovat smazání rodiče ve Firestore za smazání jeho potomků.
5. Dopsat přesný rozsah nezbytných retenčních záznamů a konečné odstranění po
   60 dnech včetně vlastnické kontroly přezdívky. Vztah k reportům a případným
   právním holdům musí být rozhodnutý, ne nahrazený novou neomezenou retencí.

Nový archiv, rozšíření živého mazání dat a další testovací Auth účty se
předkládají ke konkrétnímu schválení před živým použitím. Stávající souhlas
s prvním jednorázovým DEV Auth pilotem není neomezené povolení mazat jiné účty.
