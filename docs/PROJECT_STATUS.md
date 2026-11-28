# ShoutOut – aktuální stav pro navázání práce

Souhrn k 28. listopadu 2026. Kód a konkrétní provozní důkazy mají přednost
před historickým plánem. [Priority](TODO.md), [úplné starší checkpointy](archive/README.md),
[výsledek právě dokončené revize](operations/MVP_COMPLETED_WORK_REVIEW_2026-11-27.md).

## Další konkrétní krok

**Navazující místní balík F-03 je připravený**, větev
`feature/business-logo-local`. [Recovery, provozní profil a přesný další plán](plans/BUSINESS_LOGO_RUNTIME_READINESS.md).
IndexedDB zachová PNG i původní časovaný požadavek, kvóta je 10 nových
uploadů/hodinu na účet. Samostatný wrapper, údržbový adaptér, klient i Rules
jsou vypnuté, bez zapojení do aktivních Functions nebo nasazení.
Cíleně prošlo 21 emulátorových testů a společná klientská sada 53 testů;
úplné CI nového zdroje se teprve provede. Původní balík 3bcea52 má
[úspěšné úplné CI 46153914387](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46153914387),
což nedokládá nové změny. Žádné živé zápisy/inventura, Auth účty, klíče,
změny plánovačů či prostředků. Následuje CI a teprve konkrétní samostatně
schválená DEV inventura/přechod; Business milník ani MVP nejsou celé uzavřené.
F-05 vlastník upřesnil: firma si volí provozovnu nebo oblast působení
(i samotné město), bez dalšího ověřování. Současný výběr se nemění;
nepřipravuje se serverové dokazování adresy/přítomnosti firmy.

**Schválená oprava F-01/F-02/F-06 je hotová a ověřená v DEV.**
[Rozsah, testy, náklady a skutečné nasazení](operations/MVP_AUTHORITY_READ_FIX_2026-11-28.md).
Privilegované cizí Firestore gety používají existující eligibleModerator,
Storage support čtení odmítá aktivní ban, managed oznámení zapisuje server
a čtení starých pending autorů chrání společný dávkový helper. Vlastní stavové
čtení a readAt oznámení zachované. Zdroj ec371188b5aa82c04002b17210f11a1b265c317f
má úplné CI 46117687063 success; nasazeny pouze dvě čtecí Functions a
Firestore/Storage Rules v shoutout-dev-46c81. Skutečné zdroje a hashe Rules
ověřené, staré revize vybraných Functions odstavené. Web, ostatních 29 Functions,
prostředky, indexy, joby, klíče ani živé fixture se neměnily.

**F-04 je nasazené a automaticky ověřené v DEV.**
[Zdroje, indexy, doběhnutí, audit a skutečné běhy](plans/MODERATION_QUEUE_COMPLETENESS.md#dev-rollout-results).
Zdroj `9df1b1bddfb4a6766a41c61732e8366a7eceadd6` má
[úplné CI 46137813905 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46137813905).
Čtyři indexy READY, soukromá projekce/control active revize 4, tři nové
callables a osm aktualizovaných Functions, DEV web. Skutečné zdrojové ZIPy,
IAM/prostředky a odstavení všech předchozích revizí ověřené. Globální
metadata/důvody s filtrem místa; těla a zásahy dál chrání původní geografii.

**Klientský pilot F-04 a úklid jsou dokončené.**
[Ruční akceptace, serverová potvrzení a konečná inventura](plans/MODERATION_QUEUE_COMPLETENESS.md#dev-pilot-complete).
TestModerator ověřil stránky 50→52 bez skoku, skupinu se dvěma hlášeními,
schválení, uzavření a předání; TestAdmin dokončil eskalovaný případ.
Potvrzen filtr CZ/DE a návrat stejné otevřené karty po pauze 3 → active 4.
Vymezených 53 testovacích hlášení a 110 obsahových/archivních dokumentů
uklizeno, bez zbývajících případů/členů/rozpracovaných rozhodnutí.
Původní 1 Shout a 3 účtové žádosti mají nezměněné updateTime; všech 8
technických potvrzení zachováno do původního sedmidenního termínu.
Žádné nové Auth; Rules, prostředky a plánovače se neměnily.
F-03 a úplná společná regrese nejsou součástí uzavření F-04;
produktové upřesnění F-05 je uvedené výše.

Další stávající MVP práce: bezpečné Business logo,
geografie, produkční kapacita a provozní/startovní brána.
Nejde o nové produktové odbočky. Společná ruční regrese mvp-20 a rozhodnutí
mvp-24 zůstávají otevřené; známé vady mají přednost před dalším ručním pilotem.

<a id="posledni-overene-nasazeni"></a>

## Poslední ověřené nasazení

| Vrstva | Ověřený DEV stav, kontrola po opravě 28.11.2026 |
|---|---|
| Projekt / site | shoutout-dev-46c81; https://shoutout-dev-46c81.web.app |
| Web + 11 vybraných Functions | 9df1b1bddfb4a6766a41c61732e8366a7eceadd6 / [úplné CI 46137813905 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46137813905); skutečné zdroje ověřené |
| Ostatních 21 Functions ze staršího základu | 5435855847bc81c76a05f1e6f18d5b68b636367b / [úplné CI 46013597685 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46013597685); beze změny |
| Dva účtové workery | Součást F-04 zdroje 9df1b1b; revize 00020-riq /00020-jab, prostředky zachované |
| getFeedPage / getSavedShouts | ec371188b5aa82c04002b17210f11a1b265c317f / [úplné CI 46117687063 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46117687063); revize 00010-nay /00004-biv, zdroje ověřené |
| Hosting | 69b6045055062848; 68 skutečně vydaných souborů/4 další HTTP kontroly, hra a hudba zachované |
| Firestore Rules | 8cbacbed-2456-48f7-9a2f-46bb66e8481b; materializovaný active zdroj ec371188, hash ověřený |
| Storage Rules | fb4848ff-2673-482e-84df-f1c1caa74c9f; shodné s verzovaným storage.rules z ec371188 |
| Vlastní historie / index | 7c6a1229ced05803498a7f6f9bba7acb1045ea93 / [úplné CI 46065640727 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46065640727); nový publicUntil dotaz funkční |
| Functions / prostředky | 34 ACTIVE /Node22 /europe-west3; min0/max1, concurrency1, 256 MiB; 31 callables 15 s /3 workery 60 s |
| Moderační fronta | Control active revize 4; 4 indexy READY, klientský pilot 50→52/rozhodnutí/filtr/pauza/návrat i úklid dokončené |
| Plánovače | Dvě ENABLED minutové úlohy cleanupOperationReceipts a resumeAccountDeletionJobsDev; nezměněné |
| Archiv / právo | Capture/reader/identita/údržba a verze 2026-11-27 zapnuté; skutečné právní přijetí bez automatického potvrzení |
| Účtový pilot | Oba nové Auth pryč, primární úlohy content-archived, privátní purge scheduled na 26.01.2027 podle původních žádostí |
| Jiné prostředí | Oprava nasazena pouze do DEV; main/produkce se neměnily, první produkční app release není doložený |

Úplné hashe Rules a rozdílné zdroje vrstev jsou v
[protokolu opravy](operations/MVP_AUTHORITY_READ_FIX_2026-11-28.md#dokončené-dev-nasazení-a-ověření). Před dalším rolloutem
znovu ověřit přesný commit, jeho CI, čistý artefakt a cíl podle
[RELEASING](operations/RELEASING.md). Žádné historické označení „aktuální“
ve starém checkpointu nemá přednost před touto tabulkou.

<a id="serverova-brana"></a>

## Stav implementace a otevřené části

| Oblast | Potvrzené dokončení | Co ještě zbývá |
|---|---|---|
| Feed | B1–B4 mají [uzavřenou DEV akceptaci](plans/feed/B4_DEV_ROLLOUT.md#feed-final-acceptance-complete); čtecí ochrana starých pending autorů F-06 nasazená. | Společná produkční regrese a kapacita; nejasné staré indexové stavy zůstávají bezpečně odmítnuté. |
| Obsahová brána | DEV serverová tvorba, reakce, uložení, hlášení a mazání včetně idempotence; klientský writer event oznámení F-02 uzavřený. | Souřadnice poboček F-05 a zbylá autorita; celý mvp-16 není uzavřený. |
| Moderace / Business | Serverová rozhodnutí, sankce/revokace a Business stav mají audit/piloty; F-01 čtení při banu opravené. F-04 nasazené v DEV s globálními metadaty a filtry. | F-04 klientský pilot 50→52 a úklid; bezpečná loga F-03 a provozní kritéria; Storage má popsanou hranici dvou autorizačních dokumentů. |
| Archiv / životnost | Platnost → 7 dní vlastní historie → 60 dní archivu, dohledání admin/ownerem, podklad hlášení po smazání a omezený purge v DEV přijaty. | Produkční aktivace a společná regrese; původní termíny a otevřený povinný úklid respektovat. |
| Mazání účtu | Příprava/finalizace, Auth, archivace, původní purge a smazání bez přijetí nových podmínek ověřené v DEV. | Produkční brána a dohled nad potřebou ručního řešení; neplést naplánovaný purge s již provedeným. |
| Geografie | Serverový kód a místní ochrany existují. | enrichShoutGeography není mezi 34 Functions; bezpečný backfill a regionální akceptace mvp-13 otevřené. |
| Provoz / produkce | Oddělený app site a SDK konfigurace mají starší přípravné důkazy. | Kapacita 5 000 relací, monitoring, rozpočty, obnova, Auth/App Check, právní údaje a první release gate. |

## Poslední ověření a jeho hranice

[Archivní pilot a úklid](plans/accounts/ARCHIVE_LEGACY_DEV_ASSESSMENT.md#archive-dev-pilot-results)
uzavřené: 16 vymezených dokumentů a tři syntetické cloudové read klíče pryč,
šest technických potvrzení zachováno sedm dní. Původní obsah/pending žádost,
skutečné kontaktní vazby a termíny zůstaly zachované. První neúplný testovací
profil opravený dříve; běžná registrace rezervaci přezdívky již vytváří správně.

Revize a navazující oprava ověřily klientské/serverové regrese a protipříklady
Rules. Po opravě prošlo přesné úplné CI i deset skutečných DEV dotazů bez zápisů;
oba čtecí endpointy odmítly anonymní požadavek 401/UNAUTHENTICATED.
[Počty, výjimky a protokoly opravy](operations/MVP_AUTHORITY_READ_FIX_2026-11-28.md#dokončené-dev-nasazení-a-ověření).
Živé dotazy byly prázdné, proto nejsou důkazem stránkování většího živého
seznamu ani klientského Auth/App Check. Browserový scénář označený skip
není spuštěný test. Žádný cloudový zátěžový test ani produkční audit neproběhl.

Uživatelem odložený feed code=unknown v jednom prohlížeči zůstává bez určené
příčiny. Tmavý vzhled/odlišné akce soukromých odpovědí jsou otevřené UI nálezy.
Ovládání hudby je viditelné; poslední pilot její zvuk výslovně nepotvrdil.

## Platná rozhodnutí a omezení

- Obsah: konec veřejné platnosti +7 dní historie +60 dní archivu; při účtovém
  mazání má přednost původní případný dřívější závazný termín. Nové hlášení,
  opakování ani archivní čtení termín neprodlužují.
- Kontaktní dohledání a neveřejný archiv jen admin/owner; soukromé odpovědi
  pro běžnou moderaci přes konkrétní hlášení, ne procházením konverzací.
- Návrat po migraci musí zachovat nové archivní čtení a původní retenční
  fáze. Starý web před IndexedDB v3 ani worker bez nového úklidu automaticky
  nevracet; použít [kompatibilní návratový profil](plans/accounts/ARCHIVE_LEGACY_DEV_ASSESSMENT.md).
- 100 000 registrovaných /5 000 aktivních je schválený cíl, dosud ne ověřená
  kapacita. Rozpočet vlastníka 5 000 Kč/měsíc není automatický finanční strop.
- Android/iOS, monetizace a další schválené položky po MVP zůstávají v backlogu;
  revize je nepřesunula před MVP. Nové implementační/provozní volby schválit
  konkrétně; rutinní rollouty mají podmínky v RELEASING.

## Údržba

Tento soubor má jeden současný stav a další krok. Nový výsledek nahradí
předchozí souhrn; unikátní historii zachovat v plánu nebo registrovaném
[archivu](archive/README.md). Stupnice generuje
[progress.json](progress.json), nikdy ji ručně nepřepisovat.
