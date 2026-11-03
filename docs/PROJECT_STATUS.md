# ShoutOut – aktuální stav pro navázání práce

Souhrn k 3. listopadu 2026. Dokládá poslední ověřené výsledky; před dalším
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

Na feature/account-deletion-finalization je v DEV zapnutá finalizace:
server atomicky kontroluje nepřítomnost vlastních aktivních Shoutů a zakládá
žádost; klient ověřuje její serverový commit před Auth.delete. Přepínač
serverAccountDeletionFinalization je true. Vlastník zrušil omezení na lokální práci
a schválil průběžný DEV rollout s kontrolami. Nová Function a9ff425 je ACTIVE,
anonymní volání odmítá HTTP 401; aktivace 8289dce / CI 41705303226 success proběhla,
následovala diagnostika 712da1b a nyní oprava čtení c2409e0. Oba originy odpovídají čistému release. Ostatní Functions, Rules, IAM, oba
plánovače i původní účtová inventura se při rolloutu nezměnily.
Živý první pokus skončil obecnou chybou po vzniku žádosti. Vlastník poté z pending
gate znovu ověřil heslo a dokončil Auth odstranění. Server potvrzuje právě jednu
přípravu a jednu žádost, validní Auth/App Check a HTTP 200, cizí obsah zachovaný,
content-archived a původní +60denní termín. Fixture je uklizená a původní inventura
shodná. Jde o ověřené obnovení po chybě, nikoli úspěch běžného průchodu na první pokus.
Konzole tohoto prvního pokusu nebyla dostupná; příčinu zpřesnil opakovaný test níže.
Na fix/account-deletion-diagnostics je v DEV nasazený bezpečný konzolový kód fáze/chyby,
bez zpráv výjimek, UID/e-mailu, hesel, tokenů, payloadů či nového ukládání dat.
CI 41710073555 zdroje 712da1b success: 280 Flutter, 42 tools, 107 unit,
367 Rules/server, 15 purge, 15 Storage, analýza/lint/build. Diagnostický marker
je ověřený i v release JS. Backend a původní inventura se při novém Hostingu nezměnily.
Opakovaný test zachytil ensure-request / state/unconfirmed-account-deletion-request.
Server má platnou žádost, jednu přípravu, zachovaný cizí obsah a validní callable;
Auth stále existuje, worker čeká. Uživatel zatím nepokračoval do resume.
V emulátoru se podařilo reprodukovat zastaralý Source.server výsledek při aktivním
listeneru a opožděné aktualizaci po externím zápisu (5/5); metadata přitom tvrdí
fromCache=false. Čtení v transakci vždy našlo commit. Na fix/account-deletion-commit-read
je připravená náhrada kontroly žádosti čtecí transakcí s maxAttempts=1, bez zápisů
či změny oprávnění. Dva regresní emulátorové testy prošly, včetně owner-only Rules
a nezměněného dokumentu/retence. Oprava c2409e0587c42bcbc34008c881395a06c294549f
má success CI 41715769367: 280 Flutter, 42 tools, 107 unit, 369 Rules/server,
15 purge/15 Storage, analýza/lint/build. DEV Hosting a59b75f1d27dc90d je nasazený;
oba originy shodné s čistým release, backend/Rules/IAM/plánovače a původní inventura
nezměněné (při porovnání vynechaná pouze známá současná fixture žádost/job).
Současná fixture čeká na dokončení Auth a úklid; údaje pouze v ignorovaném
docs/local/account-finalization-fixture.json. Běžný průchod zůstává neověřený.
Zdroj a9ff425bb6b01e2d7420f45915b6ea977895fa43 má success
CI 41696994668: 276 Flutter, 107 unit, 42 tools, 367 Rules/server, 15 purge,
15 Storage, analýza/lint/build. Lokálně navíc 16 cílených emulátorových scénářů.
Lokální úsek a kompatibilní nasazení jsou hotové; uživatel je požádaný o dokončení
současného pending testu v nové kartě. Pak úklid, nový běžný průchod a Rules cutover.
[Kontrakt, meze a další brána](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#lokální-atomické-založení-žádosti--schváleno-3-listopadu-2026).

Reorganizace dokumentace je dokončená; [pravidla a kontrola](DOCUMENTATION_MAINTENANCE.md).
Neměnila aplikaci, nasazení ani data a není novým otevřeným MVP úkolem.

<a id="posledni-overene-nasazeni"></a>

## Poslední ověřené nasazení

| Vrstva | Poslední ověřený DEV stav |
|---|---|
| Projekt / Hosting site | `shoutout-dev-46c81` |
| Aplikace | https://shoutout-dev-46c81.web.app |
| Webový zdroj / Hosting verze | `c2409e0587c42bcbc34008c881395a06c294549f` / `a59b75f1d27dc90d` |
| Finalizace žádosti | Zdroj `a9ff425bb6b01e2d7420f45915b6ea977895fa43`, ACTIVE, revize `finalizeaccountdeletion-00001-wav`, hash `21288ad667885c01f4bbf46dbdfee7a5a7c3025b`; min0/max1, concurrency1, 256 MiB/15 s |
| Příprava mazání / receipt cleanup | Zdroj `a57ae9b46767a7491a743a20c6da93f9407afa7a`, obě ACTIVE; revize `prepareaccountdeletion-00001-mix` / `cleanupoperationreceipts-00003-qig`; hash `bdd5b6b8aaa3f4673d7a66fba89f76d936a71e06` |
| Účtové Functions | `96b078202e2d5adf749d7d7a685ef2cfa9eabcdc`, obě ACTIVE, revize `00010-nif` / `00010-hoz` |
| Účtový hash artefaktu | `fa459ba9128728f23b6b1a69f20111862fb72605` |
| Pět aktualizovaných obsahových Functions | Zdroj f81eaf4; `deleteComment`, `toggleCommentReaction`, `toggleShoutReaction`, `toggleShoutSave`, `createContentReport`; hash `e9d161330bbca061dc1532b2518ef40f74a5d988` |
| Firestore Rules | `44f59688-3b46-4b2b-be9c-ee88d9a22204`, zdroj f81eaf4 |
| Indexy / Storage | Šest nových CG indexů READY a dotazy ověřené; DEV soft delete 0; ostatní bucket nastavení beze změny. |

Další Functions tímto rolloutem aktualizované nebyly; neoznačovat všechny
za jeden nový společný artefakt. Oba DEV originy odpovídaly webovému manifestu.
Návrat webu: předchozí Hosting 96f84b4aa35ca226 (zdroj 8289dce); backend je
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
