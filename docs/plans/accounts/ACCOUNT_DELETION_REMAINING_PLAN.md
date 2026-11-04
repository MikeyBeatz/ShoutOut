# Dokončení mazání účtu – rozhodnutí, ochrany a pořadí

Rozhodnutí od 31. října; aktuální souhrn ověřený 4. listopadu 2026.
Navazuje na [živě ověřený DEV pilot](ACCOUNT_DELETION_DEV_PROPOSAL.md)
a [kritéria účtového milníku](../../MVP_SERVER_PLAN.md#account-deletion).
Zdrojem deklarované retence je také `lib/legal.dart`, česká sekce
„Uložení a doba uchování“: skrytí veřejného obsahu a potřebné bezpečnostní údaje
60 dní; nejde o povolení uchovat bez rozlišení všechny preference či cizí obsah.

<a id="aktualni-stav"></a>

## Aktuální stav a další práce

Serverové účtové fáze včetně konečného 60denního úklidu jsou dokončené v DEV.
Poslední account runtime je 96b0782 po CI 41539164008; konkrétní vrstvy jsou v
[PROJECT_STATUS](../../PROJECT_STATUS.md#posledni-overene-nasazeni). Nové joby mají
původní serverový deadline; staré žádosti/job verze se automaticky nemigrují.
Dokončený purge a meze řízeného času: [důkazy](ACCOUNT_RETENTION_PURGE_PLAN.md).

Klientský tok v DEV je hotový: web 776e147 sdílí první pokus i pokračování přes
AccountDeletionAttempt, příprava a57ae9b a finalizace a9ff425 jsou zapnuté.
První pokus, recovery, varování/průběh i oprava live odběrů mají lokální/CI testy
a živé ověření. Logout/relogin i smazání prošly bez Uncaught Error, server dokončil
content-archived a fixture jsou uklizené. Přesné vrstvy a důkazy níže a v PROJECT_STATUS.

Zbývá kompatibilní uzavření přímých zápisů. Před změnou Rules ověřit všechny
zapisovací cesty a souběh; starší vypnutá přepínačová větev a starý nativní klient používají
původní přímé skrytí a založení žádosti. Nasazené Rules ještě dovolují klientské
create/delete žádosti. Příprava a finalizace nejsou vynucený cutover celé aplikace.
Celý účtový milník uzavře kompatibilita, uzavření těchto cest a společný test žádosti,
Auth smazání, částečného selhání, opakování, zachování cizího obsahu a retence.
Konkrétní souhlasy pro lokální úseky, rollouty a dočasné Auth testy jsou u etap níže;
samotné dokončení této opravy neschvaluje nové migrace či změny Rules.

<a id="dev-deletion-cutover"></a>

## Uzavření přímých zápisů – lokální úsek 4. listopadu 2026

Vlastník schválil sjednocení mazání účtu i jednotlivého Shoutu v DEV pro web
a nativní kód, uzavření přímých zápisů v emulátoru a související testy. Nejdřív
lokální příprava; před živým uzavřením doložit kompatibilitu a návrat. Tato etapa
nemění produkční konfiguraci, ostatní obsahové zápisy, rozsah moderace, prostředky,
60denní lhůtu ani existující data. Nezahrnuje nové živé Auth fixture.

`DeletionWritePolicy` podle skutečného Firebase projektu v DEV vždy vybere
serverovou přípravu, finalizaci a `deleteShout`. Platí také pro nativní kód a web
s vypnutými historickými přepínači. Mimo DEV zůstává původní chování přepínačů;
produkční konfigurace se nezapíná. Při selhání callable se nepoužije přímý zápis.
Společný první/resume koordinátor, čtecí transakce před Auth.delete a řízený
průběh zůstávají stejné. Nativní inicializace App Check už existuje v main.dart;
tato etapa ji nemění a test směrování není důkazem registrace provideru nebo
průchodu na fyzickém telefonu.

Aktuální lokální Rules odmítají klientské create/update/delete žádosti včetně
desetiminutového rollbacku. Vlastní čtení pro pokračování a dosavadní moderační
čtení zůstávají. U existujícího Shoutu je odstraněná přímá změna statusu na deleted
pro autora i moderátora; zbývá původní validátor izolovaných čítačů. Tvorba Shoutu,
komentáře a ostatní operace se tímto úsekem neuzavírají. Nasazené DEV Rules jsou
stále původní; lokální soubor není důkaz živého vynucení.

### Kompatibilita a pořadí případného DEV rolloutu

| Klient / vrstva | Po uzavření zápisů |
|---|---|
| Nasazený web 776e147 s aktuálním config/dev | Všechny tři cesty už používají server; kompatibilní referenční web. |
| Nový web / nativní kód v DEV | Povinná serverová cesta i při vypnutém historickém přepínači. |
| Starší otevřený web s přímou cestou | Novou žádost či přímé skrytí Rules odmítnou; potřebuje obnovit na aktuální web. Existující žádost nezmizí a aktuální klient ji převezme. |
| Starý mobilní build | Vyžaduje aktualizaci; fyzický mobilní průchod a distribuce nejsou touto etapou ověřené. |
| Produkce | Bez změny; vlastní aktivace služeb/klienta a první vydání mají samostatnou bránu. Tento soubor Rules tam nyní nenasazovat. |

Před živým uzavřením: úspěšné CI přesného commitu, čistý release a ověřený
artefakt; nasadit a ověřit kompatibilní DEV web jako první, potom pouze cílové
Firestore Rules. Backend/IAM/Storage/plánovače a původní inventura se nesmějí
změnit. Ověřit zamítnutí přímých zápisů a nový serverový tok, případné nové
Auth účty či živé testovací zápisy zahrnout do konkrétně schváleného průchodu.
Nedělat migraci starých žádostí, jobů nebo retenčních termínů.

Bezpečný návrat webu je 776e147 / Hosting b274e8c83ebd616a: ponechává serverové
cesty zapnuté a funguje se zpřísněnými Rules. Starší přímé klienty ani vypnutí
DEV přepínačů nelze použít jako návrat. Předchozí nasazené Rules mají ruleset
44f59688-3b46-4b2b-be9c-ee88d9a22204; jejich návrat by znovu otevřel přímé zápisy,
proto není běžnou opravou UI. Žádost se při chybě neruší a neopakuje s novým termínem.

Lokálně prošly Flutter 293/293, tools 42/42, analýza, formátování i DEV debug
build. První celá Rules/server sada měla 371/375: tři staré fixture zamrzly před
submilisekundovým createTime a jeden nový test posílal Admin Timestamp klientskému
SDK. Opraven je pouze testovací čas/typ, žádný runtime workeru ani oprávnění se
kvůli testům neuvolňovaly. Konečná cílená sada workeru + cutoveru prošla 48/48;
celou konečnou podobu už potvrdilo CI níže. Důkazy jsou v ignorovaných
build/deletion-cutover-{flutter,tools,analyze,format,build,rules,targeted}.log.
Nové testy pokrývají klientské zákazy včetně transakce/batche, čtení recovery,
dvě dávky 51 Shoutů, replay/lost ack, zachování cizího obsahu, serverové mazání
autorem/Business/moderátorem a závod zbývající přímé publikace s finalizací.
Dosavadní testy rollbacku byly upravené na odmítnutí klientského zrušení.
Kompilace a lokální kontrola nejsou fyzický mobilní průchod ani živý Rules rollout.
Připravená pravidla jsou návrh ověřený emulátorem: zužují klientské zápisy a
ponechávají izolované validátory čítačů. Před veřejným vydáním je stále nutná
společná bezpečnostní a předstartovní kontrola.

Zdroj 7ab60c88892921101215076690a73837e15b94b4 má úspěšné
[CI 41915977658](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41915977658):
293 Flutter, 42 tools, 107 Functions unit, 375 Rules/server, 15 purge/15 Storage,
analýza/lint/formát a DEV build. Čistá release kopie build/deletion-cutover-release
na stejném commitu má také skutečný release build a ověřený manifest pro
projekt/site shoutout-dev-46c81. Hash přesných Rules v této release kopii je
bf23c5513740a55051bd7bbae0b49965b0477d3e5b1f5e0cafe84e9970b889a2;
oproti pracovnímu souboru se liší jen zakončení řádků. Ignorované důkazy:
build/deletion-cutover-ci.{json,log}, build/deletion-cutover-local-proof.json
a build/deletion-cutover-release-build.log.

Lokální úsek je uzavřený. Nic z něj nebylo nasazené a žádná živá data se neměnila.
Následuje DEV rollout a závěrečný živý test v konkrétně schváleném rozsahu;
kompatibilní web nasadit/ověřit před Rules. Nový Auth fixture dosavadní lokální
souhlas nezahrnoval. Produkce, main, existující žádost a staré joby se nemění.

## Lokální atomické založení žádosti – schváleno 3. listopadu 2026

Vlastník výslovně schválil serverové dokončení přípravy a založení žádosti,
klienta za vypnutým přepínačem a lokální/emulátorové testy. Rozsah nezahrnuje
nasazení, živá data, nové Auth účty ani úpravu Rules.

- Nová připravená callable finalizeAccountDeletion má stávající Auth/App Check
  ověření, expectedUserId, europe-west3, min0/max1, concurrency1, 256 MiB a 15 s.
  Novou žádost vytvoří pouze způsobilý vlastník. Klient neposílá obsah žádosti,
  e-mail, časy ani retenční termín; ty určuje server.
- Jedna transakce přečte vlastní žádost, ověří způsobilost a dotazem limit(1)
  zkontroluje vlastní aktivní Shouty. Pokud nějaký existuje, vrátí ready=false
  bez zápisu; klient provede novou přípravu po dosavadních nejvýše 50 položkách.
  Když žádný nezůstal, ve stejné transakci založí žádost. Serverová tvorba Shoutu
  čte tutéž žádost v transakci: publikace buď předběhne kontrolu a vynutí přípravu,
  nebo po vzniku žádosti selže. Finalizace sama neukrývá obsah a nemaže Auth.
- Vlastní existující platná žádost je přirozeným klíčem opakování. Function ji
  nepřepisuje a nemění createTime, requestedAt ani retainUntil. Nezavádí další
  serverOperations receipt či novou retenční lhůtu. Root retainUntil je serverový
  čas +60 dní; autoritativní deadline workeru zůstává createTime žádosti +60 dní.
  Staré žádosti a joby se nemigrují. Neplatná existující žádost se odmítne.
- Klient po ready=true musí ještě přečíst skutečnou žádost ze serveru, bez cache
  a pending writes. Teprve potom smí pokračovat do původního Auth.delete.
  Ztracená odpověď či neplatný výsledek nespouští automatický retry ani přímý
  klientský zápis; další uživatelský pokus převezme již uloženou žádost.
  ready=false je potvrzený požadavek na další přípravu, nikoli síťová chyba.
- serverAccountDeletionFinalization je v config/dev.json false a výchozí false.
  Zapnutí vyžaduje přípravu i App Check. Nasazená aplikace i nativní kompatibilní
  větev se tímto lokálním úsekem nemění. Nový modul je zahrnutý v přípravném
  content artefaktu; nejedná se o nasazenou Function.

Lokálně prošlo všech 276 Flutter testů, 107 Functions unit (264 integrací bez
emulátoru přeskočených), 42 tools a 16 cílených emulátorových scénářů (8 nových
finalizace + původní příprava/tvorba). Nové scénáře zahrnují paralelní publikování
ve čtyřech bězích, obě pořadí dokončení, replay se shodným createTime/obsahem,
malformované žádosti, oprávnění a rollback. Klient pokrývá dodatečnou přípravu,
lost ack, chybějící uloženou žádost, potvrzenou starší žádost, UID a neplatné
odpovědi. Config testy ověřují závislosti přepínače. Lint, analýza a DEV debug
build prošly. Zdroj a9ff425bb6b01e2d7420f45915b6ea977895fa43 má úspěšné
[CI 41696994668](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41696994668):
276 Flutter, 42 tools, 107 unit, celá Rules/server sada 367/367, 15 purge,
15 Storage, analýza/lint/build. Lokální úsek je uzavřený bez živého nasazení.
Výsledky jsou v ignorovaných build/account-finalization-*.

Další brána po tomto lokálním úseku: připravit kompatibilní DEV rollout a jeho ověření,
poté uzavřít přímé vytvoření/mazání žádosti a přímé skrývání obsahu v Rules.
Dosavadní Rules stále dovolují zrušení pending žádosti v prvních deseti minutách;
to není novou Function opravené. Nový serverový kontrakt nelze vydávat za
vynucený cutover celé aplikace, dokud existují přímé klientské cesty. Před živým
prostorovým indexem nadále zbývá dávkový indexový writer. Milníky se tímto
lokálním podkrokem neuzavírají.

### Navazující souhlas s průběžným nasazením a kontrolami

Vlastník po dokončení lokální finalizace výslovně zrušil předchozí omezení na
nenasazování a schválil průběžné kontroly. Kompatibilní DEV rollout proto může
pokračovat: nejprve pouze finalizeAccountDeletion z a9ff425 po jeho úspěšném CI,
ověření skutečné Function/limitů a zachování ostatních vrstev, potom aktivační
commit se serverAccountDeletionFinalization=true po vlastním CI a DEV Hosting.
Před uzavřením Rules musí projít přihlášený tok a následný serverový postup.
Oprávnění k produkčnímu prvnímu vydání, migracím a existujícím účtům se nemění.
Aktuální přesný výsledek patří do PROJECT_STATUS; souhlas s postupem není důkaz nasazení.

DEV backend a9ff425 je ověřený: finalizeAccountDeletion ACTIVE, revize 00001-wav,
hash 21288ad667885c01f4bbf46dbdfee7a5a7c3025b, schválené limity a anonymní HTTP 401.
Ostatní Functions, pravidla, IAM, oba plánovače a původní účtová inventura shodné
s baseline. Web 8289dce0b8f16d5f962db57a7874e8bdb6bcaf2f má úspěšné CI 41705303226
a Hosting 96f84b4aa35ca226; index, main.dart.js, bootstrap a config na obou originech
odpovídají čistému artefaktu. Oba přepínače přípravy/finalizace jsou true.

Živý test provedl vlastník kvůli nedostupnému nativnímu ovládání. První pokus
zobrazil obecnou chybu po vzniku žádosti. Následně uživatel otevřel pending gate,
zvolil pokračování, znovu zadal heslo a odstranil testovací Auth. Server potvrzuje
jedinou přípravu hidden=2 před jedinou žádostí, validní Auth/App Check a HTTP 200
finalizační callable, zachování cizího Shoutu/komentáře, content-archived, minimální
veřejný marker a purge scheduled s původním +60denním termínem. Fixture včetně
údajů je uklizená a původní inventura shodná; běžný průchod na první pokus tím
ověřený není. Důkaz výslovně uvádí initialAttemptFailed=true, manualResumeUsed=true
a happyPathVerified=false. Rules cutover neproběhl a selhání prvního pokusu jej blokuje.
Lokální důkazy jsou v ignorovaných build/account-finalization-* (baseline,
backend/web proof, pilot/cleanup proof, diagnosis). Konzole první chyby již
není dostupná; server ji nezaznamenal a klient ji skryl obecným pending výsledkem.

Vlastník požaduje test zopakovat. Na fix/account-deletion-diagnostics se proto
připravuje konzolová diagnostika stage/code pro reauthenticate, ensure-request,
delete-auth a vnější UI chybu. Vypisuje jen povolené SDK/invariantní kódy, žádné
zprávy výjimek, osobní údaje, hesla, tokeny, payloady ani nová databázová data.
Selhání diagnostického observeru nesmí změnit operaci ani její retry. Pořadí
běžného průchodu se nemění: varování + jediné heslo → průběh → přihlášení;
pending gate a nové heslo slouží jen k obnově přerušeného pokusu. Dosavadní
příčina při přípravě diagnostiky nebyla potvrzená. Diagnostika 712da1b159d85c50460b2d4a4aa6d6abd5b6f37b
má úspěšné CI 41710073555 (280 Flutter, 42 tools, 107 unit, 367 Rules/server,
15 purge/15 Storage, analýza/lint/build) a DEV Hosting e69064a6c3110b2a. Oba
originy včetně diagnostického markeru v release JS ověřené, backend i původní
inventura nezměněné. První recovery pilot a jeho důkazy jsou oddělené v ignorovaném
build/account-finalization-recovery-test. Pro opakování je vytvořený nový dočasný
Auth účet a stejná fixture. Údaje jen docs/local/account-finalization-fixture.json.
Opakovaný první pokus selhal s ensure-request / state/unconfirmed-account-deletion-request;
před resume ověřeno: Auth existuje, žádost je uložená, jedna příprava před žádostí,
cizí obsah zachovaný, callable HTTP 200 a Auth/App Check VALID, worker waiting-auth.
Následné dokončení a úklid po opravě jsou zaznamenané níže. Pomocný live nástroj má lokální record-first-failure / record-first-success
/ record-resume pro přesné zachycení uživatelského výsledku; happyPathVerified
smí být true pouze po výslovném potvrzení úspěchu prvního pokusu.

### Oprava potvrzení serverového commitu

Samostatný laboratorní pokus s aktivním listenerem a zpožděním jeho aktualizací
250 ms reprodukoval 5/5 zastaralých výsledků Source.server po dokončeném externím
zápisu: exists=false, fromCache=false, hasPendingWrites=false. Čtecí transakce
ve všech případech vrátila skutečnou uloženou žádost. Webový FlutterFire tento get
mapuje na getDocFromServer, který používá stav aktivního Watch targetu; samotný
příznak fromCache proto nestačí jako potvrzení právě dokončeného callable commitu.
Mechanismus odpovídá zachycenému živému selhání; přesný snapshot z uživatelské karty
se neloguje. Feed permission-denied je očekávatelný následek vzniku pending žádosti
(eligibleUser ji vylučuje), nikoli důvod rozšířit oprávnění k mazání.

Oprava na fix/account-deletion-commit-read nahrazuje readExisting čtecí Firestore
transakcí, maxAttempts=1, bez vlastních zápisů a aplikačních retry. Zachovává UID,
validaci žádosti, metadata guard, existující žádost/retenci i pořadí před Auth.delete.
Jde pouze o vzácný účtový tok, nikoli čtení feedu; transakce přidá síťové dokončení
čtení, nezakládá další dokument ani Function. Změny backendu či Rules nejsou potřebné.
Nová account_request_read.integration.test.mjs používá aktuální Rules a skutečný
klientský SDK přes lokální TCP proxy: třikrát reprodukuje starý výsledek, potvrdí
nový commit, nezměněné createTime/updateTime/obsah a odmítnutí cizího/anonymního
čtení. Oba testy prošly a jsou zapojené do test:rules.
Zdroj c2409e0587c42bcbc34008c881395a06c294549f má úspěšné
[CI 41715769367](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41715769367):
280 Flutter, 42 tools, 107 unit, 369 Rules/server, 15 purge/15 Storage, analýza,
lint a build. Je nasazený pouze DEV Hosting a59b75f1d27dc90d; oba originy byte-for-byte
odpovídají čistému release. Functions, Rules, IAM a oba plánovače nezměněné.
Původní inventura shodná po vyloučení pouze známé současné fixture žádosti/jobu.
Důkazy build/account-commit-read-{ci,pre-proof,post-proof}.json a release/deploy log.
Vlastník potvrdil resume po opravě: průběh a pak přihlášení. Server ověřil odstraněný
Auth, jedinou přípravu/žádost, zachovaný cizí obsah, content-archived, veřejný marker
a purge scheduled s původním +60denním termínem. Jen tato fixture a přihlašovací
soubor jsou uklizené, původní inventura shodná. Důkazy v ignorovaném
build/account-finalization-diagnostic-recovery-test: initialAttemptFailed=true,
manualResumeUsed=true, happyPathVerified=false. Recovery test nezaměnit za happy path.

Po přerušení limitem 4. listopadu znovu ověřeno: přesný CI commit success, oba
originy odpovídají release, backend/Rules/IAM/plánovače a původní inventura shodné.
Je připravený nový dočasný Auth účet pro první pokus na c2409e0, dva vlastní Shouty
a cizí kontrolní Shout/komentář; před testem Auth existuje, vlastní Shouty active,
žádost ani receipt neexistují. Údaje jen docs/local/account-finalization-fixture.json.
Vlastník provedl nový první pokus a potvrdil smazání s návratem na přihlášení.
Server potvrdil Auth absent, jednu přípravu hidden=2/hasMore=false před žádostí,
callable HTTP 200 + Auth/App Check VALID, cizí komentář zachovaný, content-archived,
minimální veřejný marker a purge scheduled s původním +60denním termínem.
Fixture včetně údajů uklizená a původní inventura shodná; oba originy i nezměněný
backend/Rules/IAM/plánovače znovu ověřené. Důkazy jsou v ignorovaném
build/account-finalization-first-attempt-test: initialAttemptFailed=false,
manualResumeUsed=false, happyPathVerified=true. Toto pole potvrzuje funkční tok,
nikoli absenci konzolových chyb, které vlastník současně doložil.

Kontrolní cizí Shout během čekání překročil svou původní hodinovou platnost a
stav přešel active → expired v souladu s expiračním workerem. Přímé porovnání celého otisku
proto správně selhalo. Následná kontrola ověřila status=expired, původní expiresAt
již uplynulý, updateTime až po deadline a shodný původní digest po normalizaci
jediného pole status na active. Žádné jiné pole se nezměnilo, původní digest
zůstal neměnný. Live helper nyní připouští právě tento úzce ověřený běžný přechod
a zaznamenává foreignControlExpiredNormally=true; kontrolní data se neopravovala
ani se neposouvala jejich platnost. Cizí obsah nebyl odstraněním účtu dotčený.

### Otevřené konzolové chyby po úspěšném smazání

Vlastník doložil 3× Uncaught Error z Firestore Watch a Feed interaction subscription
failed / cloud_firestore permission-denied při reauth/sign-out; žádný řádek
ShoutOut account deletion stage failure v poskytnutém výpisu není. Dva query
odběry blocked/following v lib/src/home.dart mají listen bez onError. Dokumentová
chyba má zatím potvrzený původ v SDK, konkrétní aplikační odběratel není určený.
Noto font warning se týká chybějících znaků, je samostatný a jeho dotčený znak
zatím není identifikovaný. Neprohlašovat všechny tyto chyby za neškodné.

Lokální symbolizované sestavení stejného c2409e0 nebylo nasazené. Celý JS není
byte-for-byte shodný (zdrojové mapy mění rozložení), proto přímé původní řádky
nelze použít. Pro všech 12 vybraných rámců se ověřil jedinečný identický kontext
13 generovaných řádků a teprve pak posun do mapy: query errorWrapper v interop
firestore.dart:571, document errorWrapper:445, addError ve stream_controller.dart,
reauthentication a příprava/getIdToken v účtovém toku. Důkaz
build/account-console-map-proof.json; zdrojové mapy jsou jen v ignorovaném build.
V této etapě šlo o diagnózu bez opravy. Konkrétní navazující rozsah byl následně
předložený a schválený níže; Rules ani oprávnění se neoslabují.

### Schválená oprava životního cyklu odběrů – 4. listopadu

Vlastník výslovně schválil obsluhu a ukončování odběrů při mazání/odhlášení,
dohledání dokumentové chyby, testy odebrání oprávnění, změny účtu a zániku obrazovky.
Po úspěšném CI pouze DEV web shoutout-dev-46c81 a jeden nový dočasný Auth účet
včetně jeho smazání a úklidu. Bez změn Rules, oprávnění, Functions či produkce;
fontové upozornění zůstává samostatně evidované.

Lokální oprava na fix/account-live-subscription-lifecycle:

- Auth userChanges před doručením do widgetů ukončí staré UID scope stejné Firebase
  app. Samotný auth odběr i scope jiné app zůstávají; reauth stejného UID nerestartuje
  zdroje. Nečeká se na další frame a dispose celé obrazovky.
- Sdílené dokumenty/dotazy i role kontrolují UID při přijetí i doručení události,
  včetně pozastavených front. Staré soukromé hodnoty a chyby se nedoručí novému
  uživateli; stará reference neotevře další SDK zdroj. Vyřazení ruší zdroj, čistí
  poslední hodnotu a cache; opožděný cancel nemůže odstranit novou návštěvu.
- Dva home odběry blocked/following mají explicitní onError s bezpečným kódem.
  Aktivní chyby zůstávají předávané aktivním odběratelům; nejde o globální filtr
  permission-denied nebo změnu přístupu. Selhání cancel se zachytí a výslovně
  zaznamená kódem bez zprávy/payloadu místo neobslouženého Future při dispose.

Starý stack potvrdil SDK document errorWrapper při sign-out; konkrétní widget
neurčil. Nový guard a Auth invalidace pokrývají všechny produkční sdílené dokumenty
včetně rolového wrapperu. Pozdní dokumentová chyba po změně UID je reprodukovaná
ve fault testu bez consumer onError a nově neuniká do zóny. V živém testu níže
se po opravě Uncaught Error neopakovaly při logout/relogin ani smazání účtu.

9 nových regresních scénářů, 19 cílených, konečná celá Flutter sada 289/289,
formátování a analyzátor prošly. Zdroj 776e147e46d98c8b9f8d3eb5409e87bb381d013e
má úspěšné [CI 41908033275](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41908033275):
289 Flutter, 42 tools, 107 unit, 369 Rules/server, 15 purge/15 Storage, analýza/lint/build.
Čistý release je nasazený jen na DEV Hosting b274e8c83ebd616a. Oba originy
index/main/bootstrap/config odpovídají artefaktu; nové diagnostické markery
jsou přítomné v release JS. Functions, Rules, IAM, oba plánovače a původní inventura
shodné s baseline. Rollback webu je c2409e0 / a59b75f1d27dc90d.
Důkazy build/account-live-{ci,pre-proof,post-proof}.json a release/deploy logy.

Computer Use sky.list_apps vrací native pipe unavailable / os error 2 a CUA
inventář nemá browser přístup (browser access host unavailable); žádné vstupy
do aplikací se neprováděly. Je připravený právě jeden schválený nový dočasný Auth
účet a profil/právní fixture, 2 vlastní aktivní Shouty a cizí kontrolní Shout/komentář;
před testem žádost ani receipt neexistovaly. Vlastník výslovně potvrdil logout/relogin
i smazání bez Uncaught Error. Server ověřil Auth absent, jedinou přípravu hidden=2
před žádostí, callable HTTP 200 a Auth/App Check VALID, zachovaný cizí Shout/komentář,
content-archived, minimální marker a purge scheduled s původním +60denním termínem.
Kontrolní Shout v tomto průchodu neexpiroval, jeho celý seed digest zůstal shodný.
Jen tato fixture a přihlašovací soubor jsou uklizené; původní inventura shodná.
Oba originy a nezměněné Functions/Rules/IAM/plánovače po úklidu znovu ověřené.
Důkazy v ignorovaném build/account-live-lifecycle-test: pilot-proof happyPathVerified=true,
initialAttemptFailed=false, manualResumeUsed=false; console-review potvrzuje oba UI
průchody bez Uncaught Error a cleanup-proof potvrzuje úklid/odstranění údajů.
První čtení Cloud Logging vrátilo dočasné API 429 (read quota); ověření dat běželo
nezávisle a pozdější omezené opakování úspěšně ověřilo i logy. Kvóty se neměnily.
Schválená oprava odběrů je uzavřená. Historický konkrétní třetí widget ze starého
stacku neurčený, ale společný dokumentový guard/cancel je otestovaný a původní
Uncaught se v novém živém scénáři neobjevily. Fontové upozornění zůstává samostatně.

## Lokální serverová příprava – schválená 3. listopadu 2026

Vlastník po vysvětlení schválil serverové skrytí po dávkách nejvýše 50 vlastních
aktivních Shoutů, sjednocení prvního pokusu/opakování a související testy.
Tento úsek je lokální, bez nasazení, nových Auth účtů, živých dat nebo změn Rules.
Následně vlastník schválil DEV rollout a zvlášť jeden nový dočasný Auth účet,
jeho testovací obsah, odstranění výhradně tohoto účtu a úklid. Stav tohoto
navazujícího ověření je níže; původní lokální rozsah tím není dokladem nasazení.

- Připravený export `prepareAccountDeletion` v content codebase používá stávající
  Auth/App Check/eligibleActor kontroly, expectedUserId a timed op1 klíče.
  Jedna transakce vybere nejvýše 50 aktivních vlastních Shoutů, změní pouze
  status a uloží potvrzení výsledku. Cizí/neaktivní obsah a podkolekce zachová.
- Odpověď `{hidden, hasMore}` je potvrzení konkrétní dávky. Plných 50 znamená
  další volání; počet Shoutů celého účtu není omezený na 50. Replay stejného
  klíče nesmí spotřebovat další stránku. Ztracená odpověď v klientu zachová
  tentýž klíč; při chybě se další dávka automaticky nespouští.
- Receipt se zahrnuje do stávající sedmidenní údržby. Před rolloutem musí tuto
  novou akci podporovat i nasazená cleanupOperationReceipts; není to změna TTL.
- `serverAccountDeletionPreparation` byl při lokální přípravě v config/dev.json
  false; po ověřeném backendu a CI 7976e2f je v DEV true. Výchozí hodnota zůstává
  false a zapnutí vyžaduje App Check klíč. Produkce zůstává beze změny.
- První pokus i pending gate sdílejí UI latch a koordinátor. Před novou
  přípravou se ověří serverový stav žádosti. Existující žádost se nezapisuje
  znovu; při souběhu ji závěrečná transakce převezme bez nového termínu.
  Nepotvrzená/cache či lokálně necommitnutá žádost není povolení smazat Auth.
- Žádost stále zapisuje klient až po úspěšné přípravě a Auth.delete zůstává
  po reautentizaci v klientu. Samotná příprava žádost nezakládá/neobnovuje a
  Auth nemaže. Vypnutá kompatibilní větev dosud používá původní batche.

Omezení před uzavřením milníku: více dávek není jediná atomická operace a
mezera mezi poslední přípravou a založením žádosti zůstává stejně jako v
původním klientu. Souběžné publikování z jiného zařízení proto musí pokrýt
celkový cutover/regrese; tento lokální úsek jej neprohlašuje za vyřešené.
Před živým prostorovým indexem je potřeba bezpečný dávkový indexový writer;
nelze na stejnou buňku nezávisle aplikovat 50 jednotlivých plánů.

### Navazující DEV rollout a živý UI test

Backend a57ae9b / CI 41671609764 success: prepareAccountDeletion a aktualizovaný
cleanupOperationReceipts jsou ACTIVE, hash bdd5b6b8aaa3f4673d7a66fba89f76d936a71e06.
Web 7976e2f / CI 41675834244 success: Hosting b4a1834e1c59c893; oba originy mají
index.html, main.dart.js a app-config.json shodné s čistým release manifestem.
Původní účetní inventura, ostatní Functions, Rules, IAM a oba plánovače se při
rolloutu nezměnily. Anonymní volání přípravy bylo odmítnuté HTTP 401.

První ruční průchod vlastník provedl v dříve otevřené kartě. Nová callable se
nevolala a nevznikl její receipt; šlo o starší kompatibilní klient. Auth se odstranil,
oba vlastní Shouty byly skryté před žádostí, cizí Shout a komentář zachované,
worker dokončil content-archived s původním +60denním termínem a purge scheduled.
Fixture je uklizená, přihlašovací soubor odstraněný a původní inventura shodná.
Důkaz má výslovně realUIAndCallable=false / compatibilityOnly=true a je oddělený
v ignorovaném build/account-preparation-first-test; nejde o úspěch nové callable.

Vlastník následně výslovně schválil ještě jeden dočasný účet pro stejné ověření
a provedl ruční průchod v novém anonymním okně. Ovládání prohlížeče nebylo dostupné
ani po resetu. Druhý test je dokončený: log nové callable potvrzuje platný Auth
i App Check a HTTP 200; právě jeden receipt má hidden=2/hasMore=false a commit
před createTime žádosti. Auth je odstraněný, cizí kontrolní Shout i komentář
zachované, worker content-archived, veřejný profil má jen minimální marker
a purge scheduled používá původní createTime žádosti +60 dní. Nejde o čekání
60 dní ani o nové ověření samotného konečného purge.

Obě fixture jsou uklizené včetně svých žádostí/jobů, profilů, obsahu, receipt
a přihlašovacích souborů; původní účetní inventura se shoduje s baseline.
Po úklidu znovu ověřené oba originy proti čistému artefaktu a nezměněné Functions,
Rules, IAM a účtový plánovač. Aktuální ignorované důkazy:
build/account-preparation-pilot-proof.json (realUIAndCallable=true),
account-preparation-cleanup-proof.json, account-preparation-diagnosis.json
a account-preparation-web-proof.json; první kompatibilní test je oddělený výše.

Otevřený UX nález z druhého průchodu: uživatel po potvrzení ještě chvíli mohl
ovládat aplikaci a možná viděl krátký mezistav před návratem na přihlášení.
Potvrzená příčina v lib/account_deletion.dart: dialog nejdřív vrátí heslo a zavře
se; reautentizace, příprava a založení žádosti pak běží bez blokujícího ukazatele.
DeletionRequestGate z lib/auth_gate.dart přepíná podle streamu žádosti a může
před dokončením Auth krátce zobrazit pending obrazovku. Přesný probliknutý prvek
z uživatelského popisu určit nelze. UI latch brání souběžnému opakovanému spuštění;
databáze eviduje právě jedno potvrzení přípravy. Před dokončením klienta navrhnout
ukazatel probíhajícího mazání a ochranu ovládání během operace, včetně chyb,
změny UID a zániku obrazovky. Zatím jde o nález/návrh, bez změny aplikačního kódu.
Navazující UX oprava níže nenahrazuje serverové řešení mezery mezi přípravou a žádostí ani Rules cutover.

Vlastník následně výslovně schválil pořadí: nejprve „Tento krok nenávratně smaže
váš účet“, po potvrzení průběh a potom přihlašovací obrazovka. Lokální oprava
na fix/account-deletion-progress doplňuje tuto větu do původního heslového
dialogu včetně pokračování; původní vysvětlení 60denního uchování zachovává.
Obsah dialogu je posuvný i při malé mobilní obrazovce s otevřenou klávesnicí.
Po potvrzení se zobrazuje modální „Probíhá mazání…“, které blokuje klikání,
zavření bariérou a návrat zpět a překrývá pending gate. Úspěch přejde přes Auth
na přihlášení; potvrzení serverem odhlásí pouze stále stejný UID. Chyba uvolní
překryv pro dosavadní chybovou/pending cestu. Změna UID odstraní vlastní překryv;
pozdní výsledek nesmí zavřít novou route ani zasahovat do nového účtu.
Oba nové texty mají překlady všech podporovaných jazyků. Pět widgetových scénářů
pokrývají zrušení/potvrzení, blokaci a pending gate, chybu, UID a zánik navigatoru.
Lokálně všech 269 Flutter testů a analýza bez chyb. Dokončený DEV rollout:
zdroj 97d4b3f6166ec799e2101f1b8be7d373c397f9b2, CI 41688450535 success,
Hosting 603bbdd9239e03d4. Index, main.dart.js, bootstrap a app-config.json na
obou originech odpovídají čistému release manifestu; Functions, Rules, IAM,
oba plánovače a účtová inventura se nezměnily. Lokální důkazy jsou v ignorovaných
build/account-progress-ci.json / account-progress-web-proof.json / baseline.
Návrat webu: 7976e2f / b4a1834e1c59c893. Nové Auth účty ani datové zápisy
tato oprava nevytvářela. Nový ruční destruktivní UI průchod se neopakoval;
nové UI je doložené widgetovými testy a nasazení porovnáním artefaktů.

Následující datované piloty a schémata v1–v5 dokládají postup vývoje.
Označení „aktuální“ u původního pilotu platí pro jeho datum, ne pro dnešní
zdroj všech nasazených Functions.

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
  Je to samostatný otevřený [backlogový úkol](../../BACKLOG.md#archive-administration).
  Konkrétní role, povolené akce, audit a termín se schválí při jeho návrhu;
  běžná moderátorská role tím automaticky nedostává celý neveřejný archiv.
- Jde o produktové rozhodnutí o rozsahu uchování. Právní texty a posouzení
  před veřejným vydáním musí odpovídat skutečné implementaci. Rozhodnutí samo
  neurčuje proces předávání dat institucím ani případné prodloužení právním holdem.

## Stav a návaznosti

### Doplnění vlastníka 2. listopadu

- V 60denní neveřejné retenci zachovat celý existující Business profil včetně
  poboček a dostupných fakturačních podkladů („celý profil i faktury a podobně“).
  Nejde o zavedení nové fakturace ani o prodloužení retenční lhůty. Před
  implementací se musí dohledat skutečné kolekce/soubory; nové typy dat
  nevymýšlet. Archive schema a ohraničený pilot navážou na dokončené role.
- **60denní lhůta je pevná i pro nevyřízená hlášení.** Automatický hold ani
  neomezené prodloužení se nezavádějí. Konečný purge musí pokrýt i kopie důkazů.
- **Po purge trvale ponechat minimální veřejný marker.** Vlastník po vysvětlení
  schválil UID pouze v cestě dokumentu + schemaVersion/accountStatus, bez
  jména, e-mailu, polohy či obsahu. Konečný purge tento marker nesmí odstranit;
  neznamená to povolení trvale uchovat další osobní snapshoty nebo archivní texty.
- **Palce na cizím obsahu po potvrzení Auth odebrat a upravit počty.**
  Vlastník doporučenou variantu schválil. [Příprava a skutečný stav](ACCOUNT_REACTION_REMOVAL_PLAN.md)
  rozlišují interní jádro, vlastnické vyhledávání a živou integraci workeru.

### Přímá kontrola datového modelu pro konečný purge

Business profil/pobočky jsou v `businessProfiles/{uid}/locations`; žádost je
v `businessApplications/{uid}`, aktivační audit odkazuje přes `applicationId`.
Stávající worker tyto podklady zachovává na původních místech. Sekce nákupů
a faktur je zatím prázdný placeholder; existují fakturační údaje profilu,
nikoli hotový model skutečných faktur. Jeho budoucí integrace musí mít vlastní
konkrétní cesty. Pouhé uchování dnes není důkazem implementovaného purge.

Původní reakce Shoutu/komentáře měly UID pouze v ID dokumentu a tělo
`type/updatedAt`; záložky jen `createdAt`. Od DEV rolloutu 62a51b0 mají také
serverové `userId` a oba CG indexy jsou READY. Samostatně schválená atomická
oprava doplnila UID do 3 původních záložek; nová inventura nemá chybějící UID.
Vlastník schválil odebrání palců u cizího obsahu se změnou souhrnných počtů;
v5 navazujícího workeru má stránkování a transakční počty. Skutečný runtime
a pilot eviduje [aktuální stav](../../PROJECT_STATUS.md). Celý feed se pro účet
neskenuje. Vlastní reakce a záložky dočistí nyní nasazený 60denní purge.
Archivované reakce mají původní data v `content`, tedy nejde o stejný dotaz.

Další inventura před purge musí zahrnout `rateLimits/{uid}/actions`, technická
potvrzení, kopie důkazů hlášení, aktivační/moderační audity a známé soukromé
potomky. Neexistence rodičovského dokumentu nesmí být považována za neexistenci
podkolekcí. Role, profil a vlastní přezdívka se odstraní až po ohraničeném
dočištění potomků a kontrole vlastnictví; žádost/protokol až jako poslední.
Nový job nesmí prodloužit původní deadline ani automaticky migrovat staré joby.

| Úsek | Stav | Kritérium uzavření |
|---|---|---|
| Skrytí vlastních Shoutů a trvalý průběh | DEV hotovo, pilot 3/3 | Důkazy v předchozím dokumentu. |
| Zastavení nových serverových oznámení/zpráv pro mazající se účet | DEV nasazené 1. listopadu z b777992 po úspěšném CI | Čtyři Functions ACTIVE, limity a anonymní 401 ověřené. Příjemcovské scénáře mají emulátor/CI, nikoli nový živý přihlášený test. |
| Vlastní nepotřebné soukromé podkolekce | DEV dokončeno z 6a4606e po CI 41300216738 | Živě waiting-auth 0/0 → 3 skryté Shouty → 4 odstraněné vlastní položky, zachovaný profil/legal, replay a úklid. Staré joby se nemigrují. |
| Soukromé zprávy a veřejné komentáře účtu | DEV dokončeno, v3 aktivní z 1dab78c po CI 41322524612 | Živě 2 zprávy, 1 komentář a 3 reakce, cizí obsah zachovaný, čítač/replay/moderační audit a úklid; [důkazy a postup](ACCOUNT_CONTENT_ARCHIVE_PLAN.md). |
| Identita, rezervace přezdívky a zbývající osobní data | DEV dokončeno včetně konečného purge | [V4 b685ac4](ACCOUNT_PUBLIC_IDENTITY_PLAN.md#identity-worker-v4), [91d8d9b](ACCOUNT_AUTHORITY_AND_EXPIRATION.md) a [96b0782](ACCOUNT_RETENTION_PURGE_PLAN.md) mají CI a živé důkazy. Pevný termín, uvolnění stále vlastní rezervace a odstranění Business/profilových potomků ověřené. |
| Konečný 60denní úklid | DEV dokončeno 3. listopadu | 96b0782, CI 41539164008: 15 purge a 355 Rules/server testů; živý trigger/Scheduler do archivace, stejné jádro s řízeným časem nad reálným Firestore/Storage, anonymní cizí kontext, pevný termín, marker/replay/úklid. [Důkazy a hranice](ACCOUNT_RETENTION_PURGE_PLAN.md). |
| Klient a uzavření přímých zápisů | Retry UI dokončené v DEV, plný cutover zbývá | 23f2043 po CI 41472129925 je nasazený, ruční login/reauth/Auth.delete + zachování intentu a úklid ověřené. Lost-ack/UID/latch/dialog mají 11 testů. První klientské skrytí Shoutů a uzavření přímých Rules zápisů ještě zbývají. |

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

V původní privátní fázi nové joby dostávaly schemaVersion 2 při privateCleanupEnabled=true.
Aktuální DEV má navíc contentArchiveEnabled=true a vytváří v3 podle
[archivního protokolu](ACCOUNT_CONTENT_ARCHIVE_PLAN.md); existující v2 se nepřevádějí.
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
- Cílené collection-group authorId/recipientId indexy privateReplies jsou
  po schváleném pilotu READY v DEV, comments.authorId CG také READY.
  Všech 97 původních komentářů prošlo read-only kontrolou schématu, původních
  soukromých zpráv bylo 0. Nebyl plošný backfill ani změna TTL.
- createContentReport už kopíruje text a authorId soukromé zprávy do
  privateReplyReports. U veřejného komentáře commentReports ukládá jen ID,
  důvod a stav: fyzické smazání zdroje by bez doplnění podkladu ztratilo text.
  Samostatné deleteComment stále není průběžný archiv všech smazání aktivního
  účtu. Účtový v3 worker už kopíruje existující komentář/reakce s atomickým
  commentsCount a má auditovaný serverový fallback pro nahlášený komentář.
- _ReportDetailDialogState._load už dovoluje nahlášený komentář ze serverového
  archivu i soukromé hlášení se snapshotem bez nadřazeného Shoutu.
  Komentářový fallback byl živě ověřený účtem TestModerator, vznikl 1 audit.
- Rozsah textů je rozhodnutý: uchovat všechny podle doplnění výše.
  Následně vlastník rozhodl pevnou lhůtu i pro otevřená hlášení, bez holdu.
  DEV archiv i navazující konečný purge jsou živě ověřené; viz aktuální matice.

## Historie dokončených úseků a návaznost

1. Privátní fáze je hotová ve vývoji včetně CI, živého testu a úklidu.
   Dosavadní v1 shouts-hidden záznamy zachovat;
   případnou migraci připravit odděleně.
2. [Archivní pilot](ACCOUNT_CONTENT_ARCHIVE_PLAN.md) je dokončený v DEV včetně
   CI, příchozích/odchozích zpráv, vlastních komentářů/reakcí, přesného čítače,
   moderačního lookupu/auditu, zachování cizích konverzací a úklidu fixture.
3. Veřejný profil/logo, role, sociální odkazy i následný konečný úklid Business
   profilu a osobních potomků jsou dokončené v DEV; viz matice a purge plán.
4. Rozsah retence, pevný termín bez holdu, vlastnická kontrola přezdívky a
   konečné odstranění jsou rozhodnuté a ověřené v DEV. Následuje klientský
   cutover a závěrečný test celého účtového milníku, nikoli migrace starých žádostí.

Nový archiv, rozšíření živého mazání dat a další testovací Auth účty se
předkládají ke konkrétnímu schválení před živým použitím. Stávající souhlas
s prvním jednorázovým DEV Auth pilotem není neomezené povolení mazat jiné účty.
