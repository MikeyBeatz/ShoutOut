# Návrh rozdělení dokumentace do složek

**Mapa schválená vlastníkem a provedená 3. listopadu 2026.** Připraveno po
inventuře a opravě hlavních přehledů. Zachovává původní a nové cesty pro
orientaci v historii; nemění obsah požadavků ani oprávnění.

## Zásady

- V kořeni docs zůstanou vstupní přehledy, MVP/startovní brána a pravidla údržby.
- Účtové a feedové plány budou podle tématu; soubory zachovají své názvy a
  význam. Starší pilot obsahující stále platný protokol zůstane u svého tématu,
  s výslovně označeným historickým důkazem a odkazem na současný stav.
- Výslovně nahrazený návrh A2 se přesune do archivu, s odkazem na platný směr.
- Existující requests/, archive/ a ignorované local/ zachovají svůj účel.
  Neměnné snímky, jejich bajty a původní request se nebudou přepisovat.
- Každá nová tematická složka dostane README rozcestník a hlavní index bude
  odkazovat i na ně. Po přesunu se opraví odkazy a kotvy v celém repozitáři,
  včetně README, AGENTS, nástrojů a nápověd; nesmí zůstat duplicitní živé kopie.
- Kritické kořenové cesty TODO/BACKLOG/PROJECT_STATUS/MVP_SERVER_PLAN zůstanou stejné.

## Ponechané vstupy v docs/

- [README.md](README.md)
- [TODO.md](TODO.md)
- [BACKLOG.md](BACKLOG.md)
- [PROJECT_STATUS.md](PROJECT_STATUS.md)
- [MVP_SERVER_PLAN.md](MVP_SERVER_PLAN.md)
- [LAUNCH_READINESS.md](LAUNCH_READINESS.md)
- [DOCUMENTATION_MAINTENANCE.md](DOCUMENTATION_MAINTENANCE.md)
- [DOCUMENTATION_LAYOUT_PROPOSAL.md](DOCUMENTATION_LAYOUT_PROPOSAL.md)

## Přesná mapa přesunů

### plans/accounts/

| Dnešní dokument | Nová cesta od docs/ |
|---|---|
| [ACCOUNT_AUTHORITY_AND_EXPIRATION.md](plans/accounts/ACCOUNT_AUTHORITY_AND_EXPIRATION.md) | `plans/accounts/ACCOUNT_AUTHORITY_AND_EXPIRATION.md` |
| [ACCOUNT_CONTENT_ARCHIVE_PLAN.md](plans/accounts/ACCOUNT_CONTENT_ARCHIVE_PLAN.md) | `plans/accounts/ACCOUNT_CONTENT_ARCHIVE_PLAN.md` |
| [ACCOUNT_DELETION_DEV_PROPOSAL.md](plans/accounts/ACCOUNT_DELETION_DEV_PROPOSAL.md) | `plans/accounts/ACCOUNT_DELETION_DEV_PROPOSAL.md` |
| [ACCOUNT_DELETION_REMAINING_PLAN.md](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md) | `plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md` |
| [ACCOUNT_PUBLIC_IDENTITY_PLAN.md](plans/accounts/ACCOUNT_PUBLIC_IDENTITY_PLAN.md) | `plans/accounts/ACCOUNT_PUBLIC_IDENTITY_PLAN.md` |
| [ACCOUNT_REACTION_REMOVAL_PLAN.md](plans/accounts/ACCOUNT_REACTION_REMOVAL_PLAN.md) | `plans/accounts/ACCOUNT_REACTION_REMOVAL_PLAN.md` |
| [ACCOUNT_RETENTION_PURGE_PLAN.md](plans/accounts/ACCOUNT_RETENTION_PURGE_PLAN.md) | `plans/accounts/ACCOUNT_RETENTION_PURGE_PLAN.md` |

### plans/feed/

| Dnešní dokument | Nová cesta od docs/ |
|---|---|
| [FEED_A1_RESULTS.md](plans/feed/FEED_A1_RESULTS.md) | `plans/feed/FEED_A1_RESULTS.md` |
| [FEED_BLOCK_INDEX_PLAN.md](plans/feed/FEED_BLOCK_INDEX_PLAN.md) | `plans/feed/FEED_BLOCK_INDEX_PLAN.md` |
| [FEED_IMPLEMENTATION_STAGES.md](plans/feed/FEED_IMPLEMENTATION_STAGES.md) | `plans/feed/FEED_IMPLEMENTATION_STAGES.md` |
| [FEED_INDEX_RETENTION.md](plans/feed/FEED_INDEX_RETENTION.md) | `plans/feed/FEED_INDEX_RETENTION.md` |
| [FEED_MIGRATION_READINESS.md](plans/feed/FEED_MIGRATION_READINESS.md) | `plans/feed/FEED_MIGRATION_READINESS.md` |
| [FEED_PORTABLE_CURSOR.md](plans/feed/FEED_PORTABLE_CURSOR.md) | `plans/feed/FEED_PORTABLE_CURSOR.md` |
| [FEED_PROGRESSIVE_PLAN.md](plans/feed/FEED_PROGRESSIVE_PLAN.md) | `plans/feed/FEED_PROGRESSIVE_PLAN.md` |
| [FEED_READING_POLICY.md](plans/feed/FEED_READING_POLICY.md) | `plans/feed/FEED_READING_POLICY.md` |
| [FEED_READ_REFRESH_PLAN.md](plans/feed/FEED_READ_REFRESH_PLAN.md) | `plans/feed/FEED_READ_REFRESH_PLAN.md` |
| [FEED_WRITER_INTEGRATION.md](plans/feed/FEED_WRITER_INTEGRATION.md) | `plans/feed/FEED_WRITER_INTEGRATION.md` |

### plans/roadmap/

| Dnešní dokument | Nová cesta od docs/ |
|---|---|
| [BUSINESS_MONETIZATION.md](plans/roadmap/BUSINESS_MONETIZATION.md) | `plans/roadmap/BUSINESS_MONETIZATION.md` |
| [EU_TRADEMARK_PLAN.md](plans/roadmap/EU_TRADEMARK_PLAN.md) | `plans/roadmap/EU_TRADEMARK_PLAN.md` |
| [EXTERNAL_EVENTS_EVALUATION.md](plans/roadmap/EXTERNAL_EVENTS_EVALUATION.md) | `plans/roadmap/EXTERNAL_EVENTS_EVALUATION.md` |
| [GAMIFICATION_MODEL.md](plans/roadmap/GAMIFICATION_MODEL.md) | `plans/roadmap/GAMIFICATION_MODEL.md` |
| [MOBILE_DISTRIBUTION_PLAN.md](plans/roadmap/MOBILE_DISTRIBUTION_PLAN.md) | `plans/roadmap/MOBILE_DISTRIBUTION_PLAN.md` |

### reference/

| Dnešní dokument | Nová cesta od docs/ |
|---|---|
| [ARCHITECTURE.md](reference/ARCHITECTURE.md) | `reference/ARCHITECTURE.md` |
| [BUSINESS_VERIFICATION.md](reference/BUSINESS_VERIFICATION.md) | `reference/BUSINESS_VERIFICATION.md` |
| [DATA_MODEL.md](reference/DATA_MODEL.md) | `reference/DATA_MODEL.md` |
| [INTERNAL_MODERATION.md](reference/INTERNAL_MODERATION.md) | `reference/INTERNAL_MODERATION.md` |
| [PRODUCT_FLOWS.md](reference/PRODUCT_FLOWS.md) | `reference/PRODUCT_FLOWS.md` |
| [UI_SPECIFICATION.md](reference/UI_SPECIFICATION.md) | `reference/UI_SPECIFICATION.md` |

### operations/

| Dnešní dokument | Nová cesta od docs/ |
|---|---|
| [COST_SAFETY.md](operations/COST_SAFETY.md) | `operations/COST_SAFETY.md` |
| [FIREBASE_STORAGE_SETUP.md](operations/FIREBASE_STORAGE_SETUP.md) | `operations/FIREBASE_STORAGE_SETUP.md` |
| [PRESENTATION_SITE.md](operations/PRESENTATION_SITE.md) | `operations/PRESENTATION_SITE.md` |
| [READ_COST_AUDIT.md](operations/READ_COST_AUDIT.md) | `operations/READ_COST_AUDIT.md` |
| [RELEASING.md](operations/RELEASING.md) | `operations/RELEASING.md` |
| [SETUP_AND_OPERATIONS.md](operations/SETUP_AND_OPERATIONS.md) | `operations/SETUP_AND_OPERATIONS.md` |
| [TESTING.md](operations/TESTING.md) | `operations/TESTING.md` |
| [WEB_ENVIRONMENTS.md](operations/WEB_ENVIRONMENTS.md) | `operations/WEB_ENVIRONMENTS.md` |

### archive/

| Dnešní dokument | Nová cesta od docs/ |
|---|---|
| [FEED_A2_PROPOSAL.md](archive/FEED_A2_PROPOSAL.md) | `archive/FEED_A2_PROPOSAL.md` |

## Podmínka dokončení

Schválená mapa provedená, všechny indexy a vstupní/výstupní odkazy opravené,
kontrola dokumentace bez chyb a osiřelých dokumentů, stejné checkboxy a metriky,
stejné hashované snímky. Žádné nasazení aplikace, Rules nebo změna dat.
