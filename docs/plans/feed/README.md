# Feed, přečtení a obnova

[Hlavní rozcestník](../../README.md) · [Aktuální stav](../../PROJECT_STATUS.md)

**23. listopadu: A0–A3/B1–B4 mají [uzavřenou finální DEV akceptaci a úklid](B4_DEV_ROLLOUT.md#feed-final-acceptance-complete).**
Hotové jsou B2 synchronizace, B3 unread-first, B4 metadata/cache/číslovka,
ruční dosahy 1–50 km s výchozím 50 km a pohyb s živým pořadím a stabilní kartou.
Všech 53 zbývajících testovacích Shoutů a 54 cloudových read klíčů je uklizených;
38 původních zdrojů a 21 receipts zachovaných. Další ruční pohybový test nečeká.
Přesné nasazení a další serverovou práci určuje PROJECT_STATUS.

[B2 akceptace](B2_DEV_ROLLOUT.md#b2-acceptance-complete) ·
[B3 akceptace](B3_DEV_ROLLOUT.md#b3-acceptance-complete) ·
[B4 metadata/cache](B4_DEV_ROLLOUT.md#delta-acceptance-complete) ·
[B4 novinky, pohyb a společná regrese](B4_DEV_ROLLOUT.md#feed-final-acceptance-complete).

Platný směr je progresivní. Historické Auto bylo nahrazené ručními dosahy;
laboratorní parametry nejsou produkční kapacita. Kapacitní cíl 5 000 aktivních
relací a veřejné vydání mají samostatnou startovní bránu. Diagnóza původního
běžného okna zůstává odložená; místní frontu nemazat naslepo.
Následující plány zachovávají také datované přípravné stavy, nikoli pokyny
znovu migrovat, nasazovat nebo seedovat uzavřené piloty.

- [A1 – lokální kontrakt feedu a výsledky prototypu](FEED_A1_RESULTS.md)
- [Sdílený prostorový index – lokální návrh a ověření](FEED_BLOCK_INDEX_PLAN.md)
- [Provozní návrh indexu – náklady, plánování a migrace](FEED_RUNTIME_PROPOSAL.md)
- [Trvalá instalace indexu a zapojení API/klienta](FEED_INSTALLATION_AND_ROLLOUT.md)
- [Feed – implementační etapy a návrhy ke schválení](FEED_IMPLEMENTATION_STAGES.md)
- [Úsporná obnova – verze, přenos rozdílů, cache a novinky v B2–B4](FEED_DELTA_REFRESH_PLAN.md)
- [B4 – návrh provozní vrstvy obsahu, živého stavu a atomických writerů](FEED_STATE_STORAGE_PROPOSAL.md)
- [B4 – řízený přechod, návrat a příprava DEV pilotu](B4_DEV_ROLLOUT.md)
- [Retence prostorového indexu – lokální ověření R4](FEED_INDEX_RETENTION.md)
- [Migrační připravenost feedu a zbývající brány](FEED_MIGRATION_READINESS.md)
- [Přenositelný kurzor a omezený výběr stránky – lokální stav](FEED_PORTABLE_CURSOR.md)
- [Progresivní feed – schválený směr a doložená implementace](FEED_PROGRESSIVE_PLAN.md)
- [Přečtení, hodnocení a platnost klientské relace](FEED_READING_POLICY.md)
- [B2 – příprava DEV zapojení, indexů a návratové verze](B2_DEV_ROLLOUT.md)
- [B3 – návrh přechodu indexu a DEV zapojení](B3_DEV_ROLLOUT.md)
- [Feed: přečtení, stabilní stránky a ruční obnovení](FEED_READ_REFRESH_PLAN.md)
- [Zápisové cesty před připojením prostorového indexu](FEED_WRITER_INTEGRATION.md)
