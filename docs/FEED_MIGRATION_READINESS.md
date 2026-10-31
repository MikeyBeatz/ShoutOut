# Migrační připravenost feedu a zbývající brány

31. října 2026. Navazuje na [zápisové cesty](FEED_WRITER_INTEGRATION.md),
[index](FEED_BLOCK_INDEX_PLAN.md) a [retenci](FEED_INDEX_RETENTION.md).
Tento dokument nerozhoduje názvy živých indexových kolekcí ani jejich aktivaci.

## Serverové mazání – skutečně nasazený stav

`deleteShout` a `cleanupOperationReceipts` jsou ve vývoji ACTIVE z `868bc89`,
CI `41210929174` success. Následná aktivace a transakční skládání `3b159f2d9acbe28effcfd7f9357034d882d963fb`
prošly CI `41211805774`. Web je na DEV Hosting, verze `9eda171e25a3cedd`,
release `1793458416396000`, 2026-10-31 14:53:36.396 UTC.
Veřejné HTML, main.dart.js a app-config.json mají shodné SHA-256 s čistým release
buildem. App konfigurace zapíná serverShoutDeletion. Produkce/main/Rules se neměnily.

Živý Business test **prošel po ruční obnově stránky uživatelem**. Původní
automatická relace hlásila reCAPTCHA/App Check a nedostupnost Firestore; nový
ruční pokus dočasný „MVP server deletion 31.10.“ odstranil ze seznamu.
Databázová kontrola v 15:08:51 UTC potvrdila `mvp_shout_delete_20261031_business`
ve stavu deleted, všechna ostatní pole beze změny a právě jeden deleteShout
receipt `200219555719c98c4d07ec383d8d378f1b14fec22af79fd493b46f41da963ee8`
s keyVersion 1 a přesným intervalem 604800000 ms. Nedošlo k administrátorskému
obejití callable. Zdroj zůstává soft-deleted dle dosavadní retence; nové živé
průchody běžným a moderátorským účtem ještě provedené nejsou (lokálně otestované).
Lokální důkazy jsou v ignorovaných build/shout-delete-web-proof.json a
build/shout-deletion-live-proof.json. Bezpečný návratový Hosting je A0
`8a42571a4073ed7f` z `b56fbbe`, zachovává timed operace; novou Function lze ponechat.

## Dávkové skrytí při mazání účtu

`functions/account_shout_hiding.js` je interní stavební blok bez callable nebo
Scheduler exportu. Každá stránka vybere nejvýše 50 aktivních Shoutů daného autora.
Každý dokument skryje v samostatné transakci s aktuálním indexovým kořenem;
není možné navzájem přepsat několik nezávislých plánů nad původní verzí oblasti.

Před stránkou a uvnitř každé transakce vyžaduje existující pending žádost se
shodným userId. Znovu ověřuje autora/status zdroje. Částečné dokončení lze
opakovat, hotové dokumenty už nepatří do dotazu; potřebu dalšího dotazu uvádí
needsAnotherPage. Obsah ani retence zdroje se nemění. ID archivace zahrnuje
inkarnaci žádosti a updateTime zdroje, aby nový průchod nekolidoval se starým.

Prošly tři nové emulátorové scénáře a jeden validační test: omezené stránky,
opakování, cizí obsah, odvolání žádosti mezi dotazem a transakcí a pokračování
po přerušení. Toto ještě **není celý account deletion worker**: klientská žádost,
okamžité smazání Auth, soukromá data, přezdívka, audit a 60denní dočištění mají
vlastní milník. Pomocník není zapojený do současného klientského toku.

## Read-only preflight

`functions/feed_index_preflight.js` validuje dodaný konzistentní snapshot,
vyčíslí bloky a kořeny a vrátí digest pouze indexované projekce, bez textů.
Neznámý status, vadná projekce a duplicita ID jsou chyby. Při pracovním limitu
vrací incomplete, nikoli úspěch nebo neúplný feed. Laboratorní strop 10 000
záznamů není schváleným provozním limitem query API. Valid výsledek sám o sobě
nikdy neuděluje activationReady.

Read-only kontrola DEV v 2026-10-31 14:59 UTC přečetla všech **35 dokumentů**
jedním omezeným dotazem s projekcí metadat (pojistka nejvýše 501 vrácených).
Nebyly načítané texty/titulky ani vytvořené nové kolekce. Výsledek je complete,
ale invalid: **17 chyb**. Všech 17 je již po expiresAt; deset demo_usti záznamů
nemá geohash, sedm dalších má hash neodpovídající uloženému bodu. Automaticky
je vynechat a tvrdit úspěšnou migraci není přijatelné.

Příčina chybějících hodnot je doložená v tools/seed_test_users.mjs: původní demo
seed je nezapisoval. Oprava zdroje nástroje je připravená; seed nebyl spuštěný.
Čistý encoder je nyní společný v functions/geohash.js, používaný i serverem a
starším geografickým nástrojem. Současné Admin seed/backfill nástroje ještě
neaktualizují index: před aktivací generace je nutné je zapojit či provozně
zablokovat, dokumentované upozornění není automatické vynucení.

## Schválená a provedená oprava geohashů

- Cíl pouze `shoutout-dev-46c81`, sedmnáct existujících Shoutů.
- Změnit pouze kořenové pole geohash na sedmimístný hash již uložené polohy.
  Neměnit souřadnice, autory, texty, statusy, timestampy, počty ani retence.
- Deseti demo záznamům pole doplnit, u sedmi je opravit. Žádné mazání obsahu,
  změna geografie přes placené API, nová kolekce nebo indexový backfill.
- Přesný plán a původní hodnoty jsou lokálně v ignorovaném
  `local/migrations/feed-geohash-repair-2026-10-31.json`; digest
  `79f8849fdc41da1befd3e502bc112df31f0106dd5447e8cc788293e8998f35c3`.
- Simulace po těchto sedmnácti změnách validuje všech 35 projekcí bez chyb.
  V daném snapshotu je pouze 1 neexpirovaný aktivní Shout (dočasný test výše);
  nejde o měření nákladů hustého živého okolí.
- `functions/feed_geohash_repair.js` vyžaduje přesný approvedDigest a projekt,
  nejvýše 50 položek plánu, bezpečná ID a updateTime precondition všech zdrojů.
  Celý batch je atomický; při libovolné souběžné změně se nepřepíše nic.
  Stará podoba se při opakování odmítne, plán se tiše neregeneruje.
- Tři emulátorové testy ověřily změnu jediného pole, odmítnutí zastaralého plánu,
  rollback celého batche při konfliktu, chybějící schválení i produkční cíl.

Vlastník výslovně schválil opravu tohoto plánu. CI `41213628558` pro
`a5480a737aa621c9090494c688de3e2520e373c8` prošlo. Z čistého worktree byly
atomicky změněné všechny 17 geohashů; hash porovnání všech ostatních polí
souhlasí. Následný read-only preflight všech 35 zdrojů je valid, nula chyb.
Původní plán i výsledek jsou v docs/local/migrations/, výsledek má příponu -result.json.
Žádná indexová generace nebo kolekce nevznikla a indexový backfill neběžel.

## Co ještě brání dokončení celého feedu

1. Business mazání je živě ověřené; další role zůstávají v regresní matici.
   Schválená oprava geohashů je dokončená; příprava živého indexu má vlastní brány.
2. Dokončit skutečné serverové zapojení účtového a moderátorského toku; uzavření
   přímých Rules až po pokrytí všech platforem a schváleném ověření.
3. Předložit konkrétní živé schéma/generaci, migrační zápisy za souběhu, provozní
   worker/limity a nákladový rozpočet. Read-only preflight toto nepovoluje.
4. Zabezpečené query API, přenositelné kurzory a DEV klientské A2/A3.
5. B1–B4; vlastník schválil 1 souvislou sekundu na každou část obsahu.
   Negativní hodnocení mimo Top nemění časové/prostorové místo, obsah se sbalí
   s vysvětlením; žádný přesun mezi novinkami ani unread-first skupinami. Retence přečtení a synchronizační/polling limity ještě
   potřebují návrh a rozhodnutí, nejsou převzaté ze sedmidenních receiptů.

Checkboxy milníků se tímto přípravným krokem nezavírají.
