# Přenositelný kurzor a omezený výběr stránky – lokální stav

31. října 2026. Navazuje na [čtení a relaci](FEED_READING_POLICY.md) a
[indexový model](FEED_BLOCK_INDEX_PLAN.md). **Nejde o nasazené query API.**

## Co je připravené

`functions/feed_cursor.js` podepisuje JSON obálku HMAC-SHA256. Ověření odmítá
změněný payload/podpis, jiný klíč, jiný UID nebo projekt, nesprávný čas a
nadměrnou velikost. Pokračování nemění kontext, readTime ani hodinový deadline.
Starší readTime nemůže získat novou celou hodinu; platnost je omezená i stářím
databázového snapshotu. Klíč je explicitně dodaný, kopíruje se a nemá veřejný default.

Podpis **není šifrování**. Token obsahuje kontext známý přihlášenému klientovi,
nesmí se logovat ani dávat do URL; budoucí endpoint jej přenese v HTTPS těle.
Tento modul nezajišťuje Auth/App Check sám; budoucí callable musí ověřit aktuální
účet, parametry a dostupnost ještě před vrácením karet. Testy používají pouze
náhodný klíč v RAM. Žádný živý klíč nebo Secret Manager prostředek nevznikl.

`functions/feed_portable_selection.js` umí pokračovat z čistě serializovatelného
stavu. Odvozené řadicí klíče uzlů se po obnově přepočítají, aby se Infinity
nezměnilo přes JSON na null. Během přípravy drží **nejvýše 50 kandidátů celkem**,
další stav tvoří frontier hashů/souhrnů. Po dokončené stránce pokračuje od posledního
stabilního klíče nad stejnými kořeny. Neudržuje seznam všech dříve prohlédnutých ID.
Konzistentní index musí mít každé ID právě jednou; audit a atomické zápisy zůstávají
nezbytné. Detekované duplicitní kandidáty odmítá jako poškozený index.

Při pracovním limitu vrátí preparing s prázdnou veřejnou stránkou a přenositelným
checkpointem, nikoli falešný konec nebo částečné výsledky. Chyba nezmění vstupní
checkpoint. Každý krok znovu kontroluje platnost relace. Nová serverová instance
se stejným tajným klíčem může pokračovat bez session mapy a bez zápisu polohy
čtenáře do databáze. Finální metadata se musí stále hydratovat z aktuálního zdroje.

## Soukromý read stav

Lab adaptér `capturePortable` zachytí databázový readTime. Důvěryhodný callback
readIdsAt načte osobní stav **k tomuto času**. Do přenositelného kontextu jde jen
digest značek, nikoli celý seznam. Každý další krok dostane znovu tentýž historický
read stav a ověří digest/UID/projekt/namespace; aktuálnější stav nelze potichu dosadit.

Emulátorový test vytvořil pouze dočasný fixture dokument pod feedIndexLab,
po zachycení jej změnil a u každého kroku načetl původní stav historickou transakcí.
Budoucí názvy živých soukromých kolekcí, ukládání a synchronizace nejsou tímto
vybrané ani nasazené. Podpora historického čtení přes Node SDK je navíc ověřená
ve skutečném DEV na snapshotu starém 2 269 s; viz předchozí dokument.

## Naměřený lokální rozsah

| Scénář | Výsledek |
|---|---|
| 10 000 metadat pouze v RAM, záměrně pesimistické průchody | 497 bloků, první 2 stránky správné, nejvýše 50 kandidátů, 34 pracovních kroků, největší checkpoint 16 947 B. |
| 160 metadat v emulátoru, nový adaptér a prázdná cache při každém kroku | 160 správných unikátních ID, 16 kroků, 28 uzlových čtení, největší podepsaný token 19 242 B. |
| Změna adresáře a osobních značek po startu | Pokračování zachovalo původní veřejný i soukromý snapshot. |
| UID/projekt/klíč/podpis/čas/vstupní hodiny | Odmítnuté chyby; přesně na hodinové hranici FeedSessionExpired. |

Při resetu po dokončené stránce se znovu prochází stejný index od rank hranice.
Teplá sdílená cache pomůže; studená instance může část uzlů číst znovu. Není to
garance univerzální úspory nebo cloudové latence. Syntetických 10 000 záznamů
nebylo založených ve Firebase. Provozní budget a skutečné query API mají vlastní bránu.

Laboratorní obálka má výchozí pojistku 256 KiB, krok nejvýše 128 uzlů (běžně 32).
Tyto technické laboratorní hodnoty nejsou schváleným limitem živého produktu.
Před exportem je nutné určit celý limit požadavků/čtení/času, validovat skutečný
model kontextu a checkpointu, měřit celý průchod ve všech režimech a rozhodnout
živý klíč, generaci a cache. Nesmí se tím předčasně obejít nedokončené zapisovací
cesty, Rules ani migrační brány.
