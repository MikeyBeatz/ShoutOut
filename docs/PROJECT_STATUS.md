# ShoutOut – aktuální stav pro navázání práce

Souhrn k 28. listopadu 2026. Kód a konkrétní provozní důkazy mají přednost
před historickým plánem. [Priority](TODO.md), [úplné starší checkpointy](archive/README.md),
[výsledek právě dokončené revize](operations/MVP_COMPLETED_WORK_REVIEW_2026-11-27.md).

## Další konkrétní krok

**Schválená oprava F-01/F-02/F-06 je místně připravená.**
[Rozsah, testy, náklady a konkrétní DEV postup](operations/MVP_AUTHORITY_READ_FIX_2026-11-28.md).
Privilegované cizí Firestore gety používají existující eligibleModerator,
Storage support čtení odmítá aktivní ban, managed oznámení zapisuje server
a čtení starých pending autorů chrání společný dávkový helper. Vlastní stavové
čtení a readAt oznámení zachované. Následuje společné úplné CI přesného zdroje,
potom pouze dvě čtecí Functions a Firestore/Storage Rules v shoutout-dev-46c81.
Web, prostředky, indexy, joby, klíče ani živé fixture se nemění. Q-01 o regionální
viditelnosti metadat zůstává bez změny oprávnění k produktovému upřesnění.

Další stávající MVP práce: úplnost moderační fronty, důvěryhodné Business
pobočky/loga, geografie, produkční kapacita a provozní/startovní brána.
Nejde o nové produktové odbočky. Společná ruční regrese mvp-20 a rozhodnutí
mvp-24 zůstávají otevřené; známé vady mají přednost před dalším ručním pilotem.

<a id="posledni-overene-nasazeni"></a>

## Poslední ověřené nasazení

| Vrstva | Ověřený DEV stav, čtecí kontrola 28.11.2026 před opravou |
|---|---|
| Projekt / site | shoutout-dev-46c81; https://shoutout-dev-46c81.web.app |
| Web + 29 Functions | 5435855847bc81c76a05f1e6f18d5b68b636367b / [úplné CI 46013597685 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46013597685) |
| Dva účtové workery | bd81e98ddab2b5e0e6f62410e302e9824e547f18 / [úplné CI 46020290663 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46020290663) |
| Hosting | 14a0f588585839e2; vydaná hra zachovaná |
| Firestore Rules | 88a94380-2b88-4f37-8ed9-47dc9ab88a89; c361526adeeec77328a7c1d640b43dd693e970bd / [úplné CI 46043558742 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46043558742) |
| Storage Rules | e2b2becb-fe6b-4c83-8dc5-a4b2295afba6; shodné s verzovaným storage.rules |
| Vlastní historie / index | 7c6a1229ced05803498a7f6f9bba7acb1045ea93 / [úplné CI 46065640727 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46065640727); nový publicUntil dotaz funkční |
| Functions / prostředky | 31 ACTIVE /Node22 /europe-west3; min0/max1, concurrency1, 256 MiB; 28 callables 15 s /3 workery 60 s |
| Plánovače | Dvě ENABLED minutové úlohy cleanupOperationReceipts a resumeAccountDeletionJobsDev; nezměněné |
| Archiv / právo | Capture/reader/identita/údržba a verze 2026-11-27 zapnuté; skutečné právní přijetí bez automatického potvrzení |
| Účtový pilot | Oba nové Auth pryč, primární úlohy content-archived, privátní purge scheduled na 26.01.2027 podle původních žádostí |
| Jiné prostředí | Revize nic nenasazovala, main/produkce se neměnily; první produkční app release není tímto DEV stavem doložený |

Úplné hashe Rules a rozdílné zdroje vrstev jsou v
[revizním protokolu](operations/MVP_COMPLETED_WORK_REVIEW_2026-11-27.md#potvrzený-stav-dev). Před dalším rolloutem
znovu ověřit přesný commit, jeho CI, čistý artefakt a cíl podle
[RELEASING](operations/RELEASING.md). Žádné historické označení „aktuální“
ve starém checkpointu nemá přednost před touto tabulkou.

<a id="serverova-brana"></a>

## Stav implementace a otevřené části

| Oblast | Potvrzené dokončení | Co ještě zbývá |
|---|---|---|
| Feed | B1–B4, přečtení/sync, metadata/cache, číslovka, pohyb a řazení mají [uzavřenou DEV akceptaci](plans/feed/B4_DEV_ROLLOUT.md#feed-final-acceptance-complete). | F-06 pro staré/recovery stavy; společná produkční regrese a kapacita. |
| Obsahová brána | DEV serverová tvorba, reakce, uložení, hlášení a mazání včetně idempotence. | Zbylé přímé event oznámení F-02 a souřadnice poboček F-05; celý mvp-16 není uzavřený. |
| Moderace / Business | Rozhodnutí, odstranění, sankce/revokace a zamítnutí/oprava/pozastavení/reaktivace mají serverovou DEV cestu, audit a doložené piloty. | F-01, úplná fronta F-04, Q-01, bezpečná loga F-03 a provozní kritéria. |
| Archiv / životnost | Platnost → 7 dní vlastní historie → 60 dní archivu, dohledání admin/ownerem, podklad hlášení po smazání a omezený purge v DEV přijaty. | Produkční aktivace a společná regrese; původní termíny a otevřený povinný úklid respektovat. |
| Mazání účtu | Příprava/finalizace, Auth, archivace, původní purge a smazání bez přijetí nových podmínek ověřené v DEV. | Produkční brána a dohled nad potřebou ručního řešení; neplést naplánovaný purge s již provedeným. |
| Geografie | Serverový kód a místní ochrany existují. | enrichShoutGeography není mezi 31 Functions; bezpečný backfill a regionální akceptace mvp-13 otevřené. |
| Provoz / produkce | Oddělený app site a SDK konfigurace mají starší přípravné důkazy. | Kapacita 5 000 relací, monitoring, rozpočty, obnova, Auth/App Check, právní údaje a první release gate. |

## Poslední ověření a jeho hranice

[Archivní pilot a úklid](plans/accounts/ARCHIVE_LEGACY_DEV_ASSESSMENT.md#archive-dev-pilot-results)
uzavřené: 16 vymezených dokumentů a tři syntetické cloudové read klíče pryč,
šest technických potvrzení zachováno sedm dní. Původní obsah/pending žádost,
skutečné kontaktní vazby a termíny zůstaly zachované. První neúplný testovací
profil opravený dříve; běžná registrace rezervaci přezdívky již vytváří správně.

Aktuální revize znovu ověřila klientské/serverové regrese, protipříklady nad
přesnými nasazenými Rules a deset skutečných DEV dotazů bez zápisů.
[Počty, výjimky a protokoly](operations/MVP_COMPLETED_WORK_REVIEW_2026-11-27.md#testy-důkazy-a-jejich-meze).
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
