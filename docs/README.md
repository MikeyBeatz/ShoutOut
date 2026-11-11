# Dokumentace ShoutOut

## Navázání práce

1. [PROJECT_STATUS](PROJECT_STATUS.md) – jeden aktuální stav, poslední ověřené nasazení a další krok.
2. [TODO](TODO.md) – priority, souhrn 24 milníků a metriky.
3. [BACKLOG](BACKLOG.md) – jediná podrobná checkboxová evidence.
4. [MVP_SERVER_PLAN](MVP_SERVER_PLAN.md) – serverové podmínky dokončení;
   [LAUNCH_READINESS](LAUNCH_READINESS.md) – samostatná povinná brána veřejného vydání.

Kód a konfigurace dokazují chování. Testy a konkrétní provozní důkazy určují,
co bylo ověřené; samotná existence plánu není implementace ani nasazení.
Při rozporu opravovat souhrn podle podkladů, nikoli opačně. Historické piloty
platí pro uvedenou etapu, současné revize jsou pouze v PROJECT_STATUS.

## Údržba a uspořádání

- [Pravidla údržby a kontrola](DOCUMENTATION_MAINTENANCE.md) – role dokumentů, workflow a kontrolní příkaz.
- [Schválená mapa složek](DOCUMENTATION_LAYOUT_PROPOSAL.md) – provedené přesuny a dohledatelné původní cesty.
- [Archivní index](archive/README.md) – neměnné úplné snímky a kontrolní součty.
- [Původní zadání feedu](requests/FEED_READ_REFRESH_2026-10-31.md) – požadavek vlastníka, nikoli stav implementace.

## Účtový životní cyklus

[Tematické plány](plans/README.md) · [Rozcestník účtové oblasti](plans/accounts/README.md).

Serverové fáze, klientský přechod, Rules cutover i závěrečný účtový test jsou hotové v DEV. Prostorový index má vlastní integrační a retenční brány. Podrobné datované piloty zůstávají důkazy svých etap.

- [Odebrání oprávnění a materializace exspirace](plans/accounts/ACCOUNT_AUTHORITY_AND_EXPIRATION.md)
- [Archiv zpráv a komentářů smazaného účtu](plans/accounts/ACCOUNT_CONTENT_ARCHIVE_PLAN.md)
- [Mazání účtu – průběh a návrh DEV pilotu](plans/accounts/ACCOUNT_DELETION_DEV_PROPOSAL.md)
- [Dokončení mazání účtu – rozhodnutí, ochrany a pořadí](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md)
- [Veřejná identita a loga smazaného účtu](plans/accounts/ACCOUNT_PUBLIC_IDENTITY_PLAN.md)
- [Odebrání reakcí mazaného účtu](plans/accounts/ACCOUNT_REACTION_REMOVAL_PLAN.md)
- [Konečný 60denní úklid účtu](plans/accounts/ACCOUNT_RETENTION_PURGE_PLAN.md)

## Feed, přečtení a obnova

[Rozcestník feedu](plans/feed/README.md).

Celé A0–A3/B1–B4 před MVP. Prostorový index, podepsaný kurzor, relace, stránkované API i Home jsou od 7. listopadu zapojené v DEV; vlastní historie je ověřená. Místní přečtení B1 je od 11. listopadu na DEV webu, má uživatelský důkaz značek/restartu; B1, regrese Uložených a společná DEV akceptace A2/A3 jsou uzavřené včetně úklidu fixture. B2–B4 zůstávají otevřené. Přesné revize a kontroly určuje PROJECT_STATUS.

- [A1 – lokální kontrakt feedu a výsledky prototypu](plans/feed/FEED_A1_RESULTS.md)
- [Sdílený prostorový index – lokální návrh a ověření](plans/feed/FEED_BLOCK_INDEX_PLAN.md)
- [Provozní návrh indexu – náklady, plánování a migrace](plans/feed/FEED_RUNTIME_PROPOSAL.md)
- [Trvalá instalace indexu a zapojení API/klienta](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md)
- [Feed – implementační etapy a návrhy ke schválení](plans/feed/FEED_IMPLEMENTATION_STAGES.md)
- [Retence prostorového indexu – lokální ověření R4](plans/feed/FEED_INDEX_RETENTION.md)
- [Migrační připravenost feedu a zbývající brány](plans/feed/FEED_MIGRATION_READINESS.md)
- [Přenositelný kurzor a omezený výběr stránky – lokální stav](plans/feed/FEED_PORTABLE_CURSOR.md)
- [Progresivní feed – schválený směr a doložená implementace](plans/feed/FEED_PROGRESSIVE_PLAN.md)
- [Přečtení, hodnocení a platnost klientské relace](plans/feed/FEED_READING_POLICY.md)
- [Feed: přečtení, stabilní stránky a ruční obnovení](plans/feed/FEED_READ_REFRESH_PLAN.md)
- [Zápisové cesty před připojením prostorového indexu](plans/feed/FEED_WRITER_INTEGRATION.md)

## Navazující produktové a distribuční plány

[Rozcestník navazujících plánů](plans/roadmap/README.md).

- [ShoutOut – Business monetizace](plans/roadmap/BUSINESS_MONETIZATION.md)
- [Plán evropské ochranné známky ShoutOut](plans/roadmap/EU_TRADEMARK_PLAN.md)
- [Vyhodnocení API událostí v okolí](plans/roadmap/EXTERNAL_EVENTS_EVALUATION.md)
- [Karma, achievementy a kosmetické odměny](plans/roadmap/GAMIFICATION_MODEL.md)
- [ShoutOut – plán mobilního testování a distribuce](plans/roadmap/MOBILE_DISTRIBUTION_PLAN.md)

## Současné chování a model systému

[Referenční rozcestník](reference/README.md).

- [Architektura ShoutOut](reference/ARCHITECTURE.md)
- [Ověření Business účtů](reference/BUSINESS_VERIFICATION.md)
- [Datový model Firestore](reference/DATA_MODEL.md)
- [ShoutOut – interní role, oprávnění a moderace](reference/INTERNAL_MODERATION.md)
- [Produktové a uživatelské toky](reference/PRODUCT_FLOWS.md)
- [Specifikace obrazovek a navigace](reference/UI_SPECIFICATION.md)

## Provoz, testování a vydávání

[Provozní rozcestník](operations/README.md).

- [Nákladové pojistky Firebase a Google Cloud](operations/COST_SAFETY.md)
- [Firebase Storage – Business loga a obrázky k hlášením chyb](operations/FIREBASE_STORAGE_SETUP.md)
- [Prezentační web ShoutOut](operations/PRESENTATION_SITE.md)
- [Audit načítání a nákladů](operations/READ_COST_AUDIT.md)
- [Výběr změn a publikování ShoutOut](operations/RELEASING.md)
- [Vývojové prostředí, služby a nasazení](operations/SETUP_AND_OPERATIONS.md)
- [Testovací strategie a regresní matice](operations/TESTING.md)
- [Vývojový a produkční web](operations/WEB_ENVIRONMENTS.md)

## Nahrazené návrhy

- [A2 – návrh dalšího ověřovacího úseku](archive/FEED_A2_PROPOSAL.md)

## Další rozcestníky a neveřejné podklady

- [Nástroje](../tools/README.md) – Admin SDK utility a testy.
- [Design](../design/README.md) – logo, barvy, avatary a assety.
- [Promo](../promo/README.md) – marketingové podklady a historické screenshoty.
- [iOS launch assety](../ios/Runner/Assets.xcassets/LaunchImage.imageset/README.md).

Ignorované docs/local/ obsahuje neveřejné pracovní podklady, účty a přesné
lokální migrační plány. Nikdy z něj automaticky nepřenášet údaje do veřejné
dokumentace nebo produkce; externí neversionované soubory kontrola neprochází.
