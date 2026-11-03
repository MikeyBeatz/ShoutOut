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
- [Mapa složek ke schválení](DOCUMENTATION_LAYOUT_PROPOSAL.md) – konkrétní přesuny; zatím neprovedené.
- [Archivní index](archive/README.md) – neměnné úplné snímky a kontrolní součty.
- [Původní zadání feedu](requests/FEED_READ_REFRESH_2026-10-31.md) – požadavek vlastníka, nikoli stav implementace.

## Účtový životní cyklus

Serverové fáze jsou hotové v DEV; nejbližší otevřená práce je klientský přechod a společný závěrečný test. Podrobné datované piloty zůstávají důkazy svých etap.

- [Odebrání oprávnění a materializace exspirace](ACCOUNT_AUTHORITY_AND_EXPIRATION.md)
- [Archiv zpráv a komentářů smazaného účtu](ACCOUNT_CONTENT_ARCHIVE_PLAN.md)
- [Mazání účtu – průběh a návrh DEV pilotu](ACCOUNT_DELETION_DEV_PROPOSAL.md)
- [Dokončení mazání účtu – rozhodnutí, ochrany a pořadí](ACCOUNT_DELETION_REMAINING_PLAN.md)
- [Veřejná identita a loga smazaného účtu](ACCOUNT_PUBLIC_IDENTITY_PLAN.md)
- [Odebrání reakcí mazaného účtu](ACCOUNT_REACTION_REMOVAL_PLAN.md)
- [Konečný 60denní úklid účtu](ACCOUNT_RETENTION_PURGE_PLAN.md)

## Feed, přečtení a obnova

Celé A0–A3/B1–B4 před MVP. Plný detail a rating jsou v DEV; index, relace, expozice a kurzor jsou převážně lokální příprava, nikoli živý prostorový feed.

- [A1 – lokální kontrakt feedu a výsledky prototypu](FEED_A1_RESULTS.md)
- [Sdílený prostorový index – lokální návrh a ověření](FEED_BLOCK_INDEX_PLAN.md)
- [Feed – implementační etapy a návrhy ke schválení](FEED_IMPLEMENTATION_STAGES.md)
- [Retence prostorového indexu – lokální ověření R4](FEED_INDEX_RETENTION.md)
- [Migrační připravenost feedu a zbývající brány](FEED_MIGRATION_READINESS.md)
- [Přenositelný kurzor a omezený výběr stránky – lokální stav](FEED_PORTABLE_CURSOR.md)
- [Progresivní feed – schválený směr a doložená implementace](FEED_PROGRESSIVE_PLAN.md)
- [Přečtení, hodnocení a platnost klientské relace](FEED_READING_POLICY.md)
- [Feed: přečtení, stabilní stránky a ruční obnovení](FEED_READ_REFRESH_PLAN.md)
- [Zápisové cesty před připojením prostorového indexu](FEED_WRITER_INTEGRATION.md)

## Navazující produktové a distribuční plány

- [ShoutOut – Business monetizace](BUSINESS_MONETIZATION.md)
- [Plán evropské ochranné známky ShoutOut](EU_TRADEMARK_PLAN.md)
- [Vyhodnocení API událostí v okolí](EXTERNAL_EVENTS_EVALUATION.md)
- [Karma, achievementy a kosmetické odměny](GAMIFICATION_MODEL.md)
- [ShoutOut – plán mobilního testování a distribuce](MOBILE_DISTRIBUTION_PLAN.md)

## Současné chování a model systému

- [Architektura ShoutOut](ARCHITECTURE.md)
- [Ověření Business účtů](BUSINESS_VERIFICATION.md)
- [Datový model Firestore](DATA_MODEL.md)
- [ShoutOut – interní role, oprávnění a moderace](INTERNAL_MODERATION.md)
- [Produktové a uživatelské toky](PRODUCT_FLOWS.md)
- [Specifikace obrazovek a navigace](UI_SPECIFICATION.md)

## Provoz, testování a vydávání

- [Nákladové pojistky Firebase a Google Cloud](COST_SAFETY.md)
- [Firebase Storage – Business loga a obrázky k hlášením chyb](FIREBASE_STORAGE_SETUP.md)
- [Prezentační web ShoutOut](PRESENTATION_SITE.md)
- [Audit načítání a nákladů](READ_COST_AUDIT.md)
- [Výběr změn a publikování ShoutOut](RELEASING.md)
- [Vývojové prostředí, služby a nasazení](SETUP_AND_OPERATIONS.md)
- [Testovací strategie a regresní matice](TESTING.md)
- [Vývojový a produkční web](WEB_ENVIRONMENTS.md)

## Nahrazené návrhy

- [A2 – návrh dalšího ověřovacího úseku](FEED_A2_PROPOSAL.md)

## Další rozcestníky a neveřejné podklady

- [Nástroje](../tools/README.md) – Admin SDK utility a testy.
- [Design](../design/README.md) – logo, barvy, avatary a assety.
- [Promo](../promo/README.md) – marketingové podklady a historické screenshoty.
- [iOS launch assety](../ios/Runner/Assets.xcassets/LaunchImage.imageset/README.md).

Ignorované docs/local/ obsahuje neveřejné pracovní podklady, účty a přesné
lokální migrační plány. Nikdy z něj automaticky nepřenášet údaje do veřejné
dokumentace nebo produkce; externí neversionované soubory kontrola neprochází.
