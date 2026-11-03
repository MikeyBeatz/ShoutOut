# ShoutOut – aktuální stav pro navázání práce

Souhrn k 3. listopadu 2026. Dokládá poslední ověřené výsledky; před dalším
nasazením znovu ověřit Git, CI a skutečný cíl. Úplná starší chronologie je v
[archivním indexu](archive/README.md), priority v [TODO](TODO.md).

## Další konkrétní krok

Dokončit klientský tok mazání účtu, uzavřít
jeho přímé zápisy a provést společný závěrečný test. Serverový konečný úklid
už je hotový v DEV. Kritéria a otevřené části:
[účtový plán](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#aktualni-stav).

DEV používá prepareAccountDeletion (max. 50 vlastních aktivních Shoutů/transakce),
opakování dávek a společný první/resume pokus. Backend a57ae9b a aktivační web
7976e2f mají úspěšné vlastní CI; serverAccountDeletionPreparation je v DEV true.
Oba originy odpovídají čistému release artefaktu. Rules cutover není dokončený.
První ruční test v dříve otevřené kartě použil starší kompatibilní postup:
Auth odstraněný, vlastní Shouty skryté před žádostí, cizí obsah zachovaný,
worker content-archived a původní +60denní termín ověřený. Fixture je uklizená
a původní inventura shodná. Nová callable se při tomto průchodu nevolala.
Vlastník zvlášť schválil druhý dočasný účet; ten je připravený a čeká na ruční
průchod v novém anonymním okně. Ovládání prohlížeče nemá dostupné nativní spojení.
Přihlašovací údaje druhého účtu jsou jen v ignorovaném docs/local souboru.
CI 41675834244 ověřilo 264 Flutter, 107 unit, 41 tools, 359 Rules/server,
15 purge a 15 Storage testů, analýzu/lint a DEV build. Živý úspěch toto CI nenahrazuje.

Reorganizace dokumentace je dokončená; [pravidla a kontrola](DOCUMENTATION_MAINTENANCE.md).
Neměnila aplikaci, nasazení ani data a není novým otevřeným MVP úkolem.

<a id="posledni-overene-nasazeni"></a>

## Poslední ověřené nasazení

| Vrstva | Poslední ověřený DEV stav |
|---|---|
| Projekt / Hosting site | `shoutout-dev-46c81` |
| Aplikace | https://shoutout-dev-46c81.web.app |
| Webový zdroj / Hosting verze | `7976e2fa4aad969d9f787b2c94231e22240c39e2` / `b4a1834e1c59c893` |
| Příprava mazání / receipt cleanup | Zdroj `a57ae9b46767a7491a743a20c6da93f9407afa7a`, obě ACTIVE; revize `prepareaccountdeletion-00001-mix` / `cleanupoperationreceipts-00003-qig`; hash `bdd5b6b8aaa3f4673d7a66fba89f76d936a71e06` |
| Účtové Functions | `96b078202e2d5adf749d7d7a685ef2cfa9eabcdc`, obě ACTIVE, revize `00010-nif` / `00010-hoz` |
| Účtový hash artefaktu | `fa459ba9128728f23b6b1a69f20111862fb72605` |
| Pět aktualizovaných obsahových Functions | Zdroj f81eaf4; `deleteComment`, `toggleCommentReaction`, `toggleShoutReaction`, `toggleShoutSave`, `createContentReport`; hash `e9d161330bbca061dc1532b2518ef40f74a5d988` |
| Firestore Rules | `44f59688-3b46-4b2b-be9c-ee88d9a22204`, zdroj f81eaf4 |
| Indexy / Storage | Šest nových CG indexů READY a dotazy ověřené; DEV soft delete 0; ostatní bucket nastavení beze změny. |

Další Functions tímto rolloutem aktualizované nebyly; neoznačovat všechny
za jeden nový společný artefakt. Oba DEV originy odpovídaly webovému manifestu.
Návrat webu: předchozí Hosting b9084c259258a732 (zdroj f81eaf4); backend je
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

- Nová příprava: [CI 41671609764](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41671609764)
  pro a57ae9b a [CI 41675834244](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41675834244)
  pro 7976e2f success. Neúspěšné CI 34250ec zachytilo dvě staré testovací konfigurace;
  oprava nemění aplikační chování a celý nový běh je zelený. Nový endpoint odmítl
  anonymní požadavek HTTP 401. Kontrola po rolloutu potvrdila shodu původní účtové
  inventury, ostatních Functions, obou plánovačů, IAM a Rules. První starší klient
  ověřil kompatibilitu a jeho fixture je uklizená; nový přihlášený callable tok
  se tím neověřil. Čeká se na druhý schválený test v čerstvém anonymním okně.
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
