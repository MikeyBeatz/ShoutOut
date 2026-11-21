# Feed, přečtení a obnova

[Hlavní rozcestník](../../README.md) · [Aktuální stav](../../PROJECT_STATUS.md)

A0–A3/B1–B4 celé před MVP. Platný směr je progresivní; lokální laboratorní parametry nejsou provozní limity. Aktuální pořadí určuje implementační plán.

B2 má od 18. listopadu [uzavřenou DEV akceptaci a úklid](B2_DEV_ROLLOUT.md#b2-acceptance-complete).
B3 má od 20. listopadu [uzavřenou živou akceptaci i úklid](B3_DEV_ROLLOUT.md#b3-acceptance-complete).
B4a má [dokončený lokální základ a úplné CI](FEED_DELTA_REFRESH_PLAN.md#b4a-local-results).
Další [lokální čtecí adaptér](FEED_DELTA_REFRESH_PLAN.md#b4-read-local-results) je dokončený s úspěšným úplným CI.
Má zlevnit cold/refill při zachování aktuální dostupnosti a B3 textové identity.
Další [konkrétní návrh provozní vrstvy a všech writerů](FEED_STATE_STORAGE_PROPOSAL.md)
má [uzavřenou lokální implementaci a úplné CI](FEED_STATE_STORAGE_PROPOSAL.md#p1-results). Poté následuje klient/Rules,
provozní přechod a B4 signály/číslovka. Kapacitní cíl produkce tím není prokázaný.
[Klientské zapojení a Rules – konkrétní navazující návrh](FEED_STATE_STORAGE_PROPOSAL.md#client-integration-proposal)
čeká na schválení; nepřidává další očíslované P úseky.
Předchozí lokální přechod, provozní vstup i živý rollout B3 jsou historie;
neopakovat je jako otevřenou práci.

- [A1 – lokální kontrakt feedu a výsledky prototypu](FEED_A1_RESULTS.md)
- [Sdílený prostorový index – lokální návrh a ověření](FEED_BLOCK_INDEX_PLAN.md)
- [Provozní návrh indexu – náklady, plánování a migrace](FEED_RUNTIME_PROPOSAL.md)
- [Trvalá instalace indexu a zapojení API/klienta](FEED_INSTALLATION_AND_ROLLOUT.md)
- [Feed – implementační etapy a návrhy ke schválení](FEED_IMPLEMENTATION_STAGES.md)
- [Úsporná obnova – verze, přenos rozdílů, cache a novinky v B2–B4](FEED_DELTA_REFRESH_PLAN.md)
- [B4 – návrh provozní vrstvy obsahu, živého stavu a atomických writerů](FEED_STATE_STORAGE_PROPOSAL.md)
- [Retence prostorového indexu – lokální ověření R4](FEED_INDEX_RETENTION.md)
- [Migrační připravenost feedu a zbývající brány](FEED_MIGRATION_READINESS.md)
- [Přenositelný kurzor a omezený výběr stránky – lokální stav](FEED_PORTABLE_CURSOR.md)
- [Progresivní feed – schválený směr a doložená implementace](FEED_PROGRESSIVE_PLAN.md)
- [Přečtení, hodnocení a platnost klientské relace](FEED_READING_POLICY.md)
- [B2 – příprava DEV zapojení, indexů a návratové verze](B2_DEV_ROLLOUT.md)
- [B3 – návrh přechodu indexu a DEV zapojení](B3_DEV_ROLLOUT.md)
- [Feed: přečtení, stabilní stránky a ruční obnovení](FEED_READ_REFRESH_PLAN.md)
- [Zápisové cesty před připojením prostorového indexu](FEED_WRITER_INTEGRATION.md)
