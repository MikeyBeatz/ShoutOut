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

## Výchozí DEV postup – čtecí krok dokončený

1. Po úspěšném úplném CI přesného zdroje provést čtecí inventuru aktuálních
   logo referencí, starých objektů a indexu, bez obrázků/tokenů. Tento krok
   je již dokončený a doložený v následující části.
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

<a id="dev-read-only-inventory"></a>

## Čtecí DEV inventura – 28. listopadu 2026

Vlastník navazujícím „pokračuj“ schválil čtecí inventuru a přípravu přesného
plánu. Provedeno jen v projektu `shoutout-dev-46c81`, bez cloudových zápisů,
změn SDK konfigurace, právních přijetí nebo Auth účtů. Čteny byly vybrané
profilové reference/metadata, názvy a generace souborů, konfigurace a existující
provozní logy. Nebyly čteny obrázky, kontaktní údaje ani download tokeny.
Přihlašovací token zůstal uvnitř dosavadního CLI toku, bez uložení do inventury.

| Vrstva | Čerstvě potvrzený stav |
|---|---|
| Firestore | Standard, europe-west3; 23 uživatelských profilů, 2 Business profily |
| Loga | 0 profilových referencí, 0 objektů v `businessLogos/`, 0 neshod |
| Nový control | `businessLogoMaintenance/current` neexistuje |
| Index | 1 navržená změna pole `logoState.cleanupAt`, pouze indexConfig; bez TTL |
| Functions | 34, nová `updateBusinessLogo` dosud neexistuje |
| Údržba | cleanupOperationReceipts revize 00012-fed, 60 s, 256 MiB, max1/concurrency1 |
| Scheduler | původní 2 ENABLED minutové úlohy, žádná nová |
| Hosting | 69b6045055062848 |
| Firestore / Storage Rules | 8cbacbed-2456-48f7-9a2f-46bb66e8481b / fb4848ff-2673-482e-84df-f1c1caa74c9f |
| Bucket | dosavadní firebasestorage.app, US-EAST1; soft-delete 0 s, versioning není zapnuté |

Výchozí ACL objektů neobsahuje allUsers/allAuthenticatedUsers. Stávající
Compute service account má nepodmíněný projektový Editor; není navrženo nové
IAM oprávnění ani rozšíření rolí. Přesnou identitu nové Function ověřit po nasazení.
Region bucketu se nepřesouvá; cloudový upload/mazání se proto musí měřit
samostatně od Firestore. Prázdný prefix nyní znamená, že není navržen žádný
úklid starých log nebo zásah do původního obsahu.

Vzorek 50 skutečných posledních HTTP běhů údržby měl 50×200, medián 0,285 s,
p95 0,366 s a maximum 0,451 s. Padesát odpovídajících aplikačních souhrnů bylo
checked, bez needsReview a bez aktivního retenčního dluhu. Jde o omezený vzorek
klidného provozu, nikoli měření plného 500+500 úklidu nebo záruku 60s doběhu.

V inventuře byl TestBusiness ověřen jako stávající Business level2 s přijatou
právní verzí 2026-11-27, bez pending mazání a se shodným avatarem v obou profilech.
Je vhodný pro pilot; druhý Business účet bez současného právního přijetí se nepoužije.
Jeho souhlas, role ani data se nebudou upravovat.

Neveřejné místní důkazy v `build/`:
`business-logo-dev-inventory.json`, `business-logo-dev-readiness-actors.json`,
`business-logo-bucket-metadata.json` a `business-logo-iam-readiness.json`.
Úplná inventura má digest
`f366de9784b31f1e1673afee57b4ea559196622892fd989f59e6cc3bd69668f9`;
selektivní indexový plán
`acc1c8b44fe0abb48dd527b62b83a9a9ebf715035c13c2c0b0b09f95bd3d12e8`.
Tyto hashe neudělují oprávnění k zápisu. Před jakýmkoli přechodem se stav
znovu porovná; změněné reference, objekty, cizí override nebo control jej zastaví.

<a id="dev-rollout-proposal"></a>

## Navržený společný DEV přechod – čeká na schválení

Základ e63837d má úplné CI 46164824318. Následující implementace a živý
přechod jsou nový rozsah; nic z tohoto oddílu se inventurou neaktivovalo.

### Společná příprava a rozpočet

- Zapojit připravený logo adaptér do existující cleanupOperationReceipts,
  zachovat dvě původní retenční fáze po max500 dokumentech/10 s a moderační reaper.
  Logo fázi spustit jen pokud od začátku celé úlohy uplynulo méně než 45 s:
  zůstane alespoň 15s rezerva do stávajícího 60s timeoutu. Logo zachová
  nejvýše 50 řádků / měkkých 5 s mezi kroky / lease120 s a trvalý checkpoint.
- Jednotlivé probíhající I/O nelze měkkým časem násilně přerušit. Prokázat
  společný rozpočet simulovaně pomalých fází, restartu, pauzy a ztráty lease;
  při nedostatku rezervy logo bezpečně odložit, nevynechat dosavadní údržbu.
- Doplnit whitelist souhrnných logů bez ID/cest/PNG. Zapnuté prázdné logo
  přidá 2 reads/běh, tedy při minutové úloze odvozených 2 880 reads/den,
  bez nových idle zápisů. Nejde o odhad celého účtu ani změnu četnosti Scheduleru.
- Připravit řízený release/pilotní operátor, digesty, originální avatarový
  baseline, kompatibilní návrat a automatické regrese. Ověřit připravený
  callable v aktivním právním profilu 2026-11-27 a explicitní DEV bucket.
  Bez nových secrets nebo IAM rolí.
- Společný push a úplné CI přesného aktivačního zdroje. Každý pozdější
  změněný vydávaný zdroj musí mít své úplné CI; starší úspěch nestačí.

### Živá vrstva jen shoutout-dev-46c81

1. Znovu ověřit inventuru, původní prostředí a čistý zdroj/artefakty. Při
   nových původních logách nepoužívat tento prázdný baseline jako povolení
   k jejich odstranění; zastavit a předložit přesný rozdíl.
2. Aplikovat jediný schválený indexový plán bez TTL a doložit READY.
   Založit soukromý control schemaVersion1/revision1/mode off, bez lease,
   PNG nebo kontaktních údajů.
3. Nasadit novou `updateBusinessLogo` (europe-west3, min0/max1,
   concurrency1, 256 MiB, 15 s, Auth/App Check) a aktualizovat pouze
   cleanupOperationReceipts se stávajícími prostředky/60 s/minutovým plánem.
   Účtové Functions nový podstrom již pokrývají a nenasazují se znovu.
4. Doložit kompatibilní serverový klient, jeho hotový návratový artefakt
   a cílené Rules. Firestore uzavře přímé změny obou logo referencí;
   Storage uzavře přímé uploady/přepisy/mazání a dovolí SDK čtení aktuálního
   loga ověřeným účtům. Ostatní pravidla včetně bug screenshotů se nemění.
   Nový control ponechat off, dokud brána není ověřená.
5. Po uzavření přímých zápisů znovu ověřit logo baseline a zapnout control,
   údržbu a kompatibilní DEV web. Staré otevřené weby vyžadují refresh;
   staré nativní buildy s přímým uploadem nejsou kompatibilní pro editaci loga.
   Nejde o mobilní distribuci ani globální změnu App Check.

### Vymezený pilot a návrat

- Použít jen existující TestBusiness. Nejvýše dvě nová syntetická 512px PNG,
  první uložení a jedna náhrada; nakonec obnovit přesně původní avatar
  serverovou cestou. Bez nového/mazaného Auth účtu, Shoutu, hlášení nebo
  automatického přijetí podmínek. Pilot založit až při dostupném klientu.
- Ověřit editor, načtení přes SDK, restart/nejednoznačné potvrzení, dvě karty,
  bezpečnou pauzu/návrat a zachování současného loga při výpadku. Kvóty
  se neresetují a všechny technické receipts zůstanou původních sedm dní.
- Nad přesně testovacím PNG provést jeden očekávaně odmítnutý create-only
  přepis stejnými bajty; ověřit skutečné GCS generation preconditions,
  HTTP412 a nezměněnou generaci. Žádný takový pokus se netýká původního souboru.
- Uklidit pouze manifestem určené testovací objekty přes společný writer,
  bez změny původní retence, nových bucketů nebo cenových parametrů.
  Pilotní kvótu, receipts a průběhová potvrzení nepřepisovat zpětně.
- Po cutoveru vracet jen klienta se serverovou cestou a čtením nových
  stavů. Bezpečná pauza zachová aktuální obrázek/reference, zastaví editaci;
  neotevírá přímé zápisy. Předběžně ověřit otevřeného klienta i obnovu po pauze.
- Ruční kontroly seskupit na konec; produkce, main, původní obsah,
  původní pending žádosti a ostatní účty se nemění. Tento DEV profil
  není důkazem produkční kapacity pro 5 000 aktivních relací.


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
zpětné body ani nové váhy. Navazující čtecí inventura je doložená výše;
připravený společný DEV přechod nyní čeká na schválení. Ruční test teď není potřebný.
