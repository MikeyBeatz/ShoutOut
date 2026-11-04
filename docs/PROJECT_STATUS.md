# ShoutOut – aktuální stav pro navázání práce

Souhrn k 4. listopadu 2026. Dokládá poslední ověřené výsledky; před dalším
nasazením znovu ověřit Git, CI a skutečný cíl. Úplná starší chronologie je v
[archivním indexu](archive/README.md), priority v [TODO](TODO.md).

## Další konkrétní krok

Dokončit klientský tok mazání účtu, uzavřít
jeho přímé zápisy a provést společný závěrečný test. Serverový konečný úklid
už je hotový v DEV. Kritéria a otevřené části:
[účtový plán](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#aktualni-stav).

DEV má zapnutou přípravu po 50 Shoutech, společný první/resume pokus a potvrzení
s blokujícím průběhem. Nový i starší kompatibilní tok byly živě ověřené a fixture
uklizené; nejnovější čistě UI opravu ověřují widgety a shoda nasazených artefaktů.
Nasazené vrstvy a důkazy jsou níže; Rules cutover zůstává otevřený.

DEV má zapnutou serverovou finalizaci a9ff425: atomická kontrola vlastních aktivních
Shoutů a založení žádosti, potom klientské potvrzení commitu před Auth.delete.
Oba přepínače přípravy/finalizace jsou true. Function je ACTIVE a anonymní volání
odmítá HTTP 401. Vlastník zrušil omezení na lokální práci a schválil průběžné DEV
rollouty s kontrolami. Žádné přímé zápisy se zatím v Rules neuzavíraly.

Web c2409e0587c42bcbc34008c881395a06c294549f nahrazuje zastaralé Source.server čtení
žádosti čtecí transakcí s maxAttempts=1, bez zápisů či změny oprávnění. Selhání
ensure-request / unconfirmed-account-deletion-request se podařilo vysvětlit
reprodukcí opožděného Watch stavu v emulátoru (5/5); dva nové regresní testy prošly.
CI 41715769367 success: 280 Flutter, 42 tools, 107 unit, 369 Rules/server,
15 purge/15 Storage, analýza/lint/build. Bezpečné konzolové stage/code zůstávají,
bez zpráv výjimek, osobních údajů, tokenů či nového ukládání dat.

Po této opravě vlastník potvrdil průběh a přihlášení při resume. Server ověřil
odstraněný Auth, právě jednu přípravu a žádost, validní Auth/App Check + HTTP 200,
zachovaný cizí obsah, content-archived, minimální veřejný marker a purge scheduled
s původním +60denním termínem. Fixture včetně údajů je uklizená, původní inventura
shodná. Důkazy jsou v ignorovaném build/account-finalization-diagnostic-recovery-test;
happyPathVerified=false, protože šlo o pokračování po předchozí chybě.

Kontrola 4. listopadu znovu potvrdila oba originy proti čistému release,
Hosting a59b75f1d27dc90d, stejné Functions/Rules/IAM/plánovače a původní inventuru.
Nový první pokus vlastník dokončil s návratem na přihlášení. Server potvrdil Auth
absent, jedinou přípravu před žádostí, validní callable, zachovaný cizí obsah,
content-archived, marker a purge scheduled s původním termínem. Test i údaje jsou
uklizené a původní inventura shodná. Důkazy build/account-finalization-first-attempt-test
mají happyPathVerified=true pro funkční tok; neznamená to konzoli bez chyb.
Vlastník doložil 3 Uncaught Error z Firestore Watch při reauth/sign-out a chyby
feed interakcí permission-denied. Dva odběry blocked/following v home.dart nemají
onError; konkrétní odběratel třetí dokumentové chyby ze starého stacku není potvrzený.
Noto fonty jsou samostatné upozornění.
Vlastník 4. listopadu schválil opravu odběrů, CI/DEV web a jeden nový dočasný Auth
test včetně smazání a úklidu. Na fix/account-live-subscription-lifecycle je lokálně
hotová obsluha chyb blocked/following, ukončení starých UID scope při Auth změně,
guard doručování/pozastavených událostí u dokumentů/dotazů/rolí a bezpečný teardown.
Aktivní chyby se dál předávají UI; autentizační odběr ani jiné app scope se neruší.
19 cílených testů, konečných 289 Flutter, formátování a analyzátor prošly.
Zdroj 776e147e46d98c8b9f8d3eb5409e87bb381d013e má success CI 41908033275:
289 Flutter, 42 tools, 107 unit, 369 Rules/server, 15 purge/15 Storage, lint/analyze/build.
DEV Hosting b274e8c83ebd616a je nasazený; oba originy shodné s čistým release,
nové diagnostické markery v JS ověřené, backend/Rules/IAM/plánovače a původní inventura
nezměněné. Schválený nový dočasný účet je připravený (2 vlastní active Shouty,
cizí kontrolní obsah, žádná žádost/receipt); údaje jen docs/local/account-finalization-fixture.json.
Vlastník je požádaný o nové anonymní okno, logout/relogin a smazání se sledováním
Uncaught Error. Výsledek a úklid této fixture ještě zbývají. Native pipe je
nedostupná (os error 2), Browser access host také; UI test potřebuje asistenci.
Další krok: schválený živý test a úklid; potom kompatibilita klientů,
uzavření přímých zápisů a závěrečný test.
Historie přípravy, původní piloty, CI a meze ověření zůstávají v účtovém plánu.
[Kontrakt, meze a další brána](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#lokální-atomické-založení-žádosti--schváleno-3-listopadu-2026).

Reorganizace dokumentace je dokončená; [pravidla a kontrola](DOCUMENTATION_MAINTENANCE.md).
Neměnila aplikaci, nasazení ani data a není novým otevřeným MVP úkolem.

<a id="posledni-overene-nasazeni"></a>

## Poslední ověřené nasazení

| Vrstva | Poslední ověřený DEV stav |
|---|---|
| Projekt / Hosting site | `shoutout-dev-46c81` |
| Aplikace | https://shoutout-dev-46c81.web.app |
| Webový zdroj / Hosting verze | `776e147e46d98c8b9f8d3eb5409e87bb381d013e` / `b274e8c83ebd616a` |
| Finalizace žádosti | Zdroj `a9ff425bb6b01e2d7420f45915b6ea977895fa43`, ACTIVE, revize `finalizeaccountdeletion-00001-wav`, hash `21288ad667885c01f4bbf46dbdfee7a5a7c3025b`; min0/max1, concurrency1, 256 MiB/15 s |
| Příprava mazání / receipt cleanup | Zdroj `a57ae9b46767a7491a743a20c6da93f9407afa7a`, obě ACTIVE; revize `prepareaccountdeletion-00001-mix` / `cleanupoperationreceipts-00003-qig`; hash `bdd5b6b8aaa3f4673d7a66fba89f76d936a71e06` |
| Účtové Functions | `96b078202e2d5adf749d7d7a685ef2cfa9eabcdc`, obě ACTIVE, revize `00010-nif` / `00010-hoz` |
| Účtový hash artefaktu | `fa459ba9128728f23b6b1a69f20111862fb72605` |
| Pět aktualizovaných obsahových Functions | Zdroj f81eaf4; `deleteComment`, `toggleCommentReaction`, `toggleShoutReaction`, `toggleShoutSave`, `createContentReport`; hash `e9d161330bbca061dc1532b2518ef40f74a5d988` |
| Firestore Rules | `44f59688-3b46-4b2b-be9c-ee88d9a22204`, zdroj f81eaf4 |
| Indexy / Storage | Šest nových CG indexů READY a dotazy ověřené; DEV soft delete 0; ostatní bucket nastavení beze změny. |

Další Functions tímto rolloutem aktualizované nebyly; neoznačovat všechny
za jeden nový společný artefakt. Oba DEV originy odpovídaly webovému manifestu.
Návrat posledního webového rolloutu: Hosting a59b75f1d27dc90d (zdroj c2409e0); backend je
kompatibilní i s předchozím klientem. Nová příprava má timeout 15 s, cleanup 60 s.
Limity účtových Functions: Node22, europe-west3, min0/max1, concurrency1,
256 MiB/60 s. Obsahové callable mají 15 s. Minutový účtový Scheduler, IAM,
Storage Rules a ostatní Functions se při posledním rolloutu nezměnily.

Produkční aplikace na `go.shoutout-app.eu` dosud nemá první release.
Projekt `shoutout-production-a1b34` sdílí s prezentací, app site je
`shoutout-go-a1b34`. Vývojová práce nebyla sloučená do main ani vydaná do
produkce. Podrobnosti prostředí jsou v [WEB_ENVIRONMENTS](operations/WEB_ENVIRONMENTS.md).

<a id="serverova-brana"></a>

## Stav implementace a otevřené části

| Oblast | Potvrzené dokončení | Co ještě zbývá |
|---|---|---|
| Obsahové operace | DEV klient používá serverovou tvorbu, reakce, ukládání, hlášení i mazání; přepínače v config/dev.json jsou zapnuté. | Závěrečné uzavření přímých Rules zápisů a celý milník serverové brány. |
| Technická potvrzení | Sedmidenní timed klíče, zákaz nových legacy klíčů a denní DEV cleanup 02:15 UTC, max. 500 záznamů/běh. | Produkční nastavení a společná vydávací brána. |
| Mazání účtu | Auth konfirmace, skrytí, identita/loga/role, soukromý úklid, archiv, odebrání cizích palců a konečný 60denní purge v DEV. | Klientský přechod, uzavření přímých zápisů a společný závěrečný test. |
| Exspirace Shoutů | Serverová změna statusu po expiresAt v DEV. | Sedmidenní fyzický úklid Shoutů a potomků; zapojení writeru před živým prostorovým indexem. |
| Feed | Plný detail A0, pořadí negativního obsahu a lokální moduly indexu/relace/expozice/kurzoru. | Provozní limity, integrace všech writerů, migrace, živé query API, klient a osobní přečtení/novinky. |
| Produkce a spuštění | Oddělený app site, SDK konfigurace a dříve ověřené DNS/HTTPS. | Runtime služby a zbývající bezpečnostní, právní, provozní a ruční kontroly. |

MVP zůstává 9/24 milníků (38 %), backlog 107/157 (68 %). Konečný account
purge sám neuzavírá souhrnný milník životního cyklu ani serverové brány.
[Kritéria serveru](MVP_SERVER_PLAN.md), [etapy feedu](plans/feed/FEED_IMPLEMENTATION_STAGES.md),
[startovní brána](LAUNCH_READINESS.md).

## Poslední ověření a jeho hranice

- Bezpečná konzolová diagnostika: [CI 41710073555](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41710073555)
  pro 712da1b success, DEV Hosting e69064a6c3110b2a. Oba originy (index, main,
  bootstrap, config) odpovídají čistému release; Functions/Rules/IAM/plánovače
  a inventura zachované. Příčina první chyby dosud není určená; nový test čeká.
- Atomické založení žádosti: [CI 41696994668](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41696994668)
  pro a9ff425 success, celá Rules/server sada 367/367. Function je nově nasazená;
  aktivace [CI 41705303226](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41705303226)
  pro 8289dce také success (276 Flutter, 42 tools, 107 unit, 367 Rules/server,
  15 purge, 15 Storage, analýza/lint/build). Nasazení a zachování ostatních vrstev
  jsou ověřené; přihlášený nový tok zatím není dokončený.
- UX potvrzení/průběhu: [CI 41688450535](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41688450535)
  pro 97d4b3f success; DEV Hosting 603bbdd9239e03d4, čtyři veřejné soubory
  (včetně bootstrapu) na obou originech shodné s čistým release manifestem.
  Původní 77dad6e CI bylo záměrně zrušené po doplnění mobilní opravy; nebylo nasazené.
- Nová příprava: [CI 41671609764](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41671609764)
  pro a57ae9b a [CI 41675834244](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41675834244)
  pro 7976e2f success. Neúspěšné CI 34250ec zachytilo dvě staré testovací konfigurace;
  oprava nemění aplikační chování a celý nový běh je zelený. Nový endpoint odmítl
  anonymní požadavek HTTP 401. Kontrola po rolloutu potvrdila shodu původní účtové
  inventury, ostatních Functions, obou plánovačů, IAM a Rules. Nový přihlášený
  callable tok i starší kompatibilní cesta jsou živě ověřené a obě fixture
  uklizené. Po úklidu znovu ověřené oba originy a nezměněný backend/Rules/IAM.
  Dokončený pilot nenahrazuje Rules cutover nebo zkoušku souběžného publikování.
  Ukazatel průběhu je následně dokončený samostatným UX rolloutem výše.
  [Důkazy a UX oprava](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#navazující-dev-rollout-a-živý-ui-test).
- Příprava f81eaf4: [CI 41538976226](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41538976226).
  Aktivace 96b0782: [CI 41539164008](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41539164008).
  Obě success: 254 Flutter, 40 tools, 107 unit, 355 Rules/server, 15 purge,
  15 Storage; analýza/lint/build. Lokálně také 355/355 Rules a 15/15 purge.
- Skutečný DEV trigger/Scheduler dokončil nový syntetický UID bez Auth účtu
  do content-archived se třemi archivními kořeny a původním +60denním termínem.
  Stejný kernel nad reálným Firestore/Storage s řízeným časem ověřil konečný
  úklid, cizí anonymní kontext a terminální replay; nejde o čekání 60 dní na
  hodinách Scheduleru. Fixture uklizená, původní inventura shodná.
- Samostatně schválená oprava doplnila userId do tří starých DEV záložek;
  neměnila obsah, createdAt ani počty. Dřívější oprava 17 geohashů je také
  dokončená; nejde o prostorový indexový backfill.

Podrobné důkazy: [konečný úklid](plans/accounts/ACCOUNT_RETENTION_PURGE_PLAN.md#uzavření-bodu-1-v-dev--3-listopadu-2026),
[palce a vlastnictví](plans/accounts/ACCOUNT_REACTION_REMOVAL_PLAN.md),
[testovací strategie](operations/TESTING.md). Staré pending žádosti a historické joby
se automaticky nemigrovaly. Lokální moduly feedu nebyly nasazeny jako query API.

## Platná rozhodnutí a omezení

- Celé nové chování feedu A0–A3/B1–B4 před MVP; poslední bod pouze v otevřené
  aplikaci, relace 1 hodina, expozice každé části 1 sekundu; unread-first jen
  v Nejblíž. Nízké hodnocení mimo Top mění sbalení, nikoli pořadí. Interval
  kontrol novinek ani provozní rozpočet API nejsou tímto souhrnem schválené.
- Účtová retence je původní createTime +60 dní, pevná i pro otevřená hlášení.
  Celý dostupný Business profil i zahrnuté zprávy/komentáře do tohoto termínu;
  potom minimální veřejný marker, uvolnění jen stále vlastní přezdívky a
  anonymní Shout kontext pro cizí konverzace. Správa archivu v administraci
  je samostatný otevřený backlogový úkol.
- Rozpočet vlastníka je nejvýše 5 000 Kč měsíčně; nejde o automaticky
  vynucený finanční strop. [Nákladové pojistky](operations/COST_SAFETY.md).
- App Check v automatické relaci může potřebovat ruční asistenci; ochranu
  kvůli testu nevypínat. Globální enforcement Auth/Firestore není uzavřený.
- Jednorázové srovnání starších čítačů/poloh není potvrzené. Není automaticky
  dalším příkazem k provedení; [stav inventury](MVP_SERVER_PLAN.md#data-reconciliation).
- Rutinní rollout po přesném CI má trvalý souhlas, nové produktové/provozní
  volby a první veřejné vydání mají vlastní brány. [RELEASING](operations/RELEASING.md).
  Lokální účty/hesla zůstávají pouze v ignorovaném docs/local/.

## Údržba

Tento soubor má jeden další krok a jednu tabulku posledního ověřeného nasazení.
Nový výsledek nahradí předchozí souhrn; dlouhá historie patří k plánu nebo do
[archivu](archive/README.md). Role dokumentů a kontrola:
[DOCUMENTATION_MAINTENANCE](DOCUMENTATION_MAINTENANCE.md).
