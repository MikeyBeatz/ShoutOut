# Retence prostorového indexu – lokální ověření R4

31. října 2026. Vlastník schválil **1 hodinu + lokální ověření**, bez živého
nasazení. Navazuje na [model indexu](FEED_BLOCK_INDEX_PLAN.md) a
[produktové etapy](FEED_IMPLEMENTATION_STAGES.md).

## Platnost pořadí

Relace platí pevně hodinu od otevření nebo obnovy. Stránkování ji neprodlužuje.
Laboratorní view používá monotónní čas; přesně na hodinové hranici odmítne další
i opakovanou uloženou stránku chybou `FeedSessionExpired`. Nové otevření vydá
novou relaci. Již vrácené karty zůstávají volajícímu a jejich aktuální dostupnost
lze dál ověřovat hydratací. Osobní přečtení a uložené Shouty se tím nemažou.

To je ověřený kontrakt lokálního adaptéru. Zobrazení nabídky obnovy ve Flutter UI
a zabezpečený přenos kurzoru přes HTTP ještě nejsou napojené. Relace i pracovní
checkpointy jsou nyní objekty v RAM; restart procesu vyžaduje nové otevření.

## Archivace a bezpečný GC

Každá změna či odstranění existujícího kořene vytvoří ve stejné transakci
`retiredRoots/{cell-operationId}` s předchozím hashem, oblastí a `retiredAt`.
Unikátní ID se při retry transakce nemění; opakované použití stejného hashe
nepřepisuje předchozí archiv. První kořen a skutečný no-op archiv nepřidávají.

GC po oblastech nejprve označí celý aktuální strom a všechny archivní stromy,
jejichž archiv vznikl nejvýše před hodinou. Používá přesný `DocumentSnapshot.createTime`,
nikoli předpoklad shody `retiredAt` a commit času. Serverová transformace
[REQUEST_TIME má milisekundovou přesnost](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/Write#ServerValue);
lokální test ukázal rozdíl oproti času zápisu. Historie se proto prochází stránkovaně
celá pro danou oblast, bez časového filtru podle tohoto pole.

Teprve po úplném ověření chráněných bloků začne sweep. Chybějící/poškozený
chráněný blok ukončí marking chybou před mazáním. Kandidát musí být neoznačený
a jeho `updateTime` nesmí být novější než počáteční databázový read-time fence.
Mazání používá podmínku shody původního `updateTime` a transakčně kontroluje,
že se aktuální kořen oblasti od začátku GC nezměnil. Změna včetně návratu ke
stejnému hashi vyvolá `index-gc-root-changed`: zahodit úklid a začít nový marking.
Tím se chrání i znovu použité starší podstromy, nejen nově zapsané bloky.
Při kolizi precondition se nikdy nepřechází na nepodmíněné mazání.

Po sweepu lze odstranit staré archivní dokumenty. Aktuální kořen se neuklízí
podle stáří vytvoření bloku. Smazané hashe se vyřadí ze sdílené cache včetně
načítání, které právě probíhá. Nedokončený job lze zrušit nebo znovu zahájit;
již provedená bezpečná mazání nevyžadují návrat.

Jedno volání `step` má pracovní rozpočet (výchozí 32 čtení, 16 kandidátů mazání),
počáteční zachycení guardu/kořene jsou další dvě čtení. Při konfliktním batchi
mohou následovat jednotlivé CAS pokusy. Transakční čtení kořene (`rootCheckReads`) a retry jsou
další skutečná databázová práce; metriky traversal čtení nejsou celá faktura.
Pro sweep se musí zachovat indexování `nodes.path`; payload lze jinak vyjmout.

## Vyřazování expirovaných metadat

Adresář oblastí obsahuje `minExpiry`. Omezený dotaz vyhledá oblasti k úklidu;
worker prochází jen větve s dostatečně starou expirací a pokračuje po dávkách.
Namespace guard drží monotónní `prunedThrough`. Metadata aktivního Shoutu starší
než tato hranice mohou v indexu chybět; neexpirovaná nesmějí chybět nikdy.

Prune znovu načte aktuální kanonickou projekci uvnitř transakce. Nepřepisuje ji
starou nasbíranou verzí. Odstraní pouze členství v aktivním indexu, ne samotný
Shout ani jeho status či retenci. Pozdější reakce na uchovaný expirovaný Shout
může upravit kanonický dokument bez opětovného zařazení do aktivního indexu.
Technický test prodloužení expirace ověřuje opětovné zařazení a souběh; tím se
do produktu nepřidává funkce prodlužování příspěvku.

Pracovní snapshot pruneru má také hodinovou hranici. Po vypršení začít novým
zachycením kořene; již provedené vyřazení zůstává platné. Rozpočet průchodu uzlů
a počtu reconciliací není celkový počet čtení: každá reconciliace je samostatná
transakce s načtením guardu, source a potřebné větve. Žádný Scheduler není zapojený.

## Výsledky a hranice

Testy: `functions/feed_session_policy.test.js` a
`functions/feed_index_retention.integration.test.js`; integrace jsou součástí
`tools` příkazu `test:rules`. Lokálně prošel lint, celá Functions sada (69 pass, 83 integrací přeskočených bez
emulátoru) a cílený emulátorový běh 19/19: devět původních testů a deset nových
případů včetně cache. [Naměřená data](benchmarks/FEED_INDEX_RETENTION_2026-10-31.json).
Laboratorní hodiny GC mohou být explicitně posunuté pro simulaci stáří archivů;
tento parametr existuje jen v adaptéru odmítajícím jiné prostředí než emulátor
`shoutout-rules-test` na `127.0.0.1:8080`. Provozní API jej nesmí převzít.

Jednopoložková reakce potřebovala 1 source + 1 uzel + 1 adresář + 1 archivní zápis.
Vyřazení jednoho ze dvou metadat: 1 uzel + 1 adresář + 1 archiv, **0 source zápisů**
(vedle samostatné aktualizace guardu). Pozdější reakce na tento expirovaný Shout
měla 1 source a 0 indexových zápisů. GC dvou verzí listu po simulovaném vypršení
smazal 1 blok a 1 archiv; opakování nesmazalo nic dalšího.

Archivace přidává **jeden zápis na každý změněný existující kořen oblasti**.
Předchozí [benchmark](benchmarks/FEED_BLOCK_INDEX_2026-10-31.json) zůstává původním
měřením před archivací, tento náklad neobsahuje. Další náklady tvoří guard,
traversal/scan, transakční kontroly, mazání a případné restartování GC při změně
kořene. Celou udržovanou historii oblasti nyní čteme při markingu i úklidu archivů.
Není to měření latence cloudu, nákladů indexových položek ani garance 5 000 Kč.

Před provozem zbývají zejména frekvence/rozpočet a kapacitní testy úklidu,
odolnost při trvale zapisované oblasti (GC může opakovaně restartovat), trvalé
checkpointy či bezpečné restartování workeru, složené indexy, pokrytí všech
zapisovacích cest, migrace a zabezpečené API/UI. Živé kolekce, backfill, Functions,
Hosting a Rules se tímto lokálním krokem nemění.
