# F-03 – obnova uploadu a provozní příprava

## Schválení a aktuální stav

Vlastník schválil společný místní balík: trvalá obnova stejného uploadu po
zavření prohlížeče, 10 nových uploadů za hodinu/účet, vypnuté serverové
zapojení a úklid, indexový/návratový plán, regrese, dokumentace a push/úplné CI.
Původní sedmidenní okno a účtová retence se nemění. Bez nasazení, živé
inventury/zápisů, Auth účtů nebo nových klíčů/služeb.

Místní balík je dokončený. Zdroj **e63837d904e16d961a8cfeaa5adb00ac477b92c4**
má [úspěšné úplné CI 46164824318](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46164824318)
včetně browser/klient/server/Rules/archiv/purge/Storage regresí a web buildu.
DEV zůstává nezměněné; tento úspěch nedokládá živý rollout ani cloudový závod.

## Klient a souběžné karty

[IndexedDB](../../lib/indexed_business_logo_store.dart) používá samostatný
projektový namespace a klíč účtu. Neprovádí migraci databáze přečtení.
Na účet drží nejvýše jeden PNG do 2 MiB nebo žádost o avatar, původní
logické ID, čas místního konce a vazbu časovaného požadavku. Neukládá Auth,
App Check tokeny, e-mail nebo hlavičky.

Vložení žádosti i uložení původního časovaného klíče jsou atomické
compare-and-set transakce. Dvě karty proto pro stejný payload převezmou
stejný klíč. Síť se spustí až po potvrzení místního zápisu. Při výpadku
IndexedDB se přenos neprovede. Potvrzení odstraňuje pouze vlastní klíč,
nikoli novější žádost jiné karty.

[Gateway](../../lib/business_logo_gateway.dart) obnoví frontu při přihlášení
nebo startupu, pokud je serverový přepínač zapnutý; Profil nabízí opakování.
Změna účtu obnovu pozastaví. Nejednoznačné chyby a vyčerpaná kvóta zachovají
původní payload. Jednoznačné obrazové odmítnutí, zrušení a serverová expirace
jej uvolní; nový klíč se při retry nikdy nevymýšlí.

Místní žádost platí nejvýše sedm dní od místního vytvoření. Prošlé bajty se
při další aktivitě uklízí přes časový index po nejvýše 50 záznamech; zavřený
prohlížeč nemůže sám fyzicky čistit data. Server dál nezávisle vynucuje své
původní termíny. Potvrzené mazání účtu odstraní PNG a uloží tombstone,
který zastaví opožděné zápisy. Selhání místního mazání nezmění úspěšné
serverové smazání na chybu; serverová kontrola účtu dál brání publikaci.
Také návratový klient ponechá hook pro odstranění dříve uložených bajtů.
Nativní přepínač zůstává false, místní nativní store je pouze paměťový.

## Server a provozní profil

[Jádro](../../functions/business_logo.js) rezervuje nové povolení ve stávající
první transakci kontroly účtu. Klouzavá hodina má nejvýše deset časových
značek v soukromém `businessProfiles/{uid}/logoState/quota`; je společná všem
zařízením. Obrazově neplatné nové uploady limit čerpají, stejný již
rezervovaný/potvrzený požadavek znovu ne. Odstranění loga limit nečerpá.
Neplatný dekódovaný obraz má terminální receipt, takže jeho retry opětovně
nedekóduje. Potvrzení reserved/rejected/complete/cancelled mají stále původních
sedm dní a již existující receipt/účtový úklid; quota spadá pod Business podstrom.

[Samostatný wrapper](../../functions/business_logo_host.js) není exportovaný
z aktivních content/account Functions a není uvedený v nasazovací konfiguraci.
Má připravený profil europe-west3, App Check, min0/max1, concurrency1,
256 MiB a 15 s. Výchozí false končí bez konstrukce Storage klienta.
Při zapnutí vyžaduje soukromý `businessLogoMaintenance/current`:
schemaVersion 1, kladná celočíselná revision a mode off/active/paused.
Mode/revize se ověřují také transakčně před citlivými kroky a po Storage I/O.
Tento dokument není nyní založený v DEV.

[Údržbový runtime](../../functions/business_logo_runtime.js) a
[adaptér](../../functions/business_logo_cleanup_adapter.js) jsou vypnuté a
zatím nezapojené do živého workeru. Jeden úsek má nejvýše 50 objevených řádků
a měkkých 5 s mezi kroky, lease 120 s a trvalý kurzor po každém řádku.
Studený restart bezpečně opakuje právě rozpracovaný krok; jiný vlastník
lease zastaví mazání i zápis starého checkpointu. Neplatný řádek zaznamená
needsReview a neblokuje další stránky. Prázdná aktivní cesta má jeden
control get a jeden prázdný omezený dotaz, bez lease zápisů; false nemá I/O.
Nejde o nový Scheduler job ani scan všech účtů.

Měkký rozpočet nepřerušuje probíhající databázové/Storage I/O. Zapojení do
stávající 60s úlohy musí před DEV doložit společný časový rozpočet s dosavadním
receipt/read úklidem a moderačním reaperem; samotný samostatný test jej nedokazuje.

## Index a naměřená práce

[Čistý indexový plán](../../tools/business_logo_index_plan.mjs) vyžaduje přesný
DEV projekt a úplný čerstvý snapshot jediného pole `logoState.cleanupAt`.
Přidává collection-group ASC a zachovává collection ASC/DESC. Neznámou
explicitní výjimku odmítá; PATCH maska mění pouze indexConfig, nikdy TTL.
Živý digest a READY důkaz mohou vzniknout až po samostatně schválené inventuře.

Po sloučení kvóty s první kontrolou účtu byly v emulátoru naměřeny SDK pokusy:

| Operace | Document reads | Writes | Transakční pokusy | Nové objekty |
|---|---:|---:|---:|---:|
| První upload | 57 | 8 | 7 | 1 |
| Potvrzené opakování | 10 | 0 | 1 | 0 |
| Náhrada | 61 | 8 | 8 | 1 |
| Odstranění / avatar | 40 | 7 | 6 | 0 |

Před sloučením měl nový první upload 76 reads/9 pokusů; tato meziverze se
nevydává. Původní potvrzený retry zůstal bez nových zápisů/objektů. PNG fixture
6 275 B, request JSON 8 524 B, peak dva objekty. Nejde o cloudovou latenci
ani fakturaci: čísla nezahrnují index-entry reads, GCS API/přenosy a cloudový souběh.

## Konkrétní další DEV postup – zatím neschválený

1. Po úspěšném úplném CI přesného zdroje připravit čtecí inventuru aktuálních
   logo referencí, starých objektů a uvedeného indexu, bez obrázků/tokenů.
   Staré objekty nejsou důkazem dodržení dvou slotů. Existující osiřelý planner
   vyžaduje digest, updateTime a generace; sporné objekty se bez rozhodnutí nemažou.
2. Předložit jeden přesný živý plán: index/digest, nová Function, zapojení
   existujícího cleanupOperationReceipts s ověřeným společným rozpočtem,
   control, klient, kompatibilní návrat, kandidátní Firestore/Storage Rules
   a vymezený pilot. Scheduler, account retence a ostatní role se nemění.
3. Po samostatném souhlasu a CI aktivačních commitů nejprve připravit index,
   server a klienta; teprve po doložení kompatibility uzavřít přímé zápisy
   a zapnout control/údržbu. Staré otevřené klienty/nativní buildy s přímým
   uploadem nelze vydávat za kompatibilní.
4. Návrat po uzavření Rules musí zachovat serverovou cestu a nový formát
   potvrzení. Bezpečná pauza controlu ponechá čtení současného loga a
   reference, zastaví změny; nevrací přímé uploady a nemaže aktuální soubor.
   Starší web s vypnutou serverovou cestou není plnohodnotný návratový klient.
5. Pilot ověří restart/taby, náhradu/odstranění, SDK oprávnění, skutečné GCS
   generation preconditions, pauzu/návrat a úklid. Cloudový závod emulátor
   neprokazuje. Žádné nové živé fixture ani Auth účty tímto místním plánem
   nejsou povolené. Ruční průchod seskupit na konec.

Celé Business MVP, jeho nasazení a produkční akceptace zůstávají otevřené.


## Ověření dokončeného místního balíku

Cíleně prošlo 21/21 Firestore/Storage emulátorových testů bez skipů,
54/54 společných Flutter testů gateway/časování/editoru/konfigurace,
2/2 testy ve skutečném Chrome IndexedDB a 150/150 nástrojových testů.
Flutter analyze, Functions lint a formát jsou čisté. Úplné CI přesného
zdroje e63837d výše navíc potvrdilo celou dosavadní společnou regresi a web build.

První běh 46164591135 zdroje 6ddb068 byl záměrně zrušen pro doplnění
kontroly velikosti PNG ještě před místním uložením. Není úspěšným důkazem;
finální zdroj tuto kontrolu i regresní test obsahuje. Samostatný logo host
má úplný připravený balíček, ale všechny aktivní content/account artefakty
jej i údržbový adaptér dál vylučují. Příprava nezakládá control, index nebo endpoint.

Důkazy doplňují otevřené business-endtoend/business-authority-final.
Jejich celé Business a produkční podmínky splněné nejsou, proto se nepřidávají
zpětné body ani nové váhy. Další krok je samostatně schválená čtecí DEV
inventura a podle ní jeden konkrétní přechod/pilot. Ruční test teď není potřebný.
