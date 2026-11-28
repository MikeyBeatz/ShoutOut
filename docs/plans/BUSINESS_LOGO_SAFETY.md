# F-03 – bezpečné Business logo

## Schválený rozsah a hranice

Vlastník 28.11.2026 schválil společný místní balík: zachovat editor,
512×512 PNG a 2 MiB; serverově přenést/dekódovat logo, ověřit stávající
Auth/App Check/Business oprávnění a ban, řídit jednu aktuální verzi a jednu
rozpracovanou náhradu, bezpečně opakovat a uklízet i při účtovém mazání.
Součástí jsou vypnutý klient a kandidátní Rules, testy, měření, dokumentace,
commit/push a úplné CI. Živé zápisy, migrace, nové Functions/job a nasazení
nejsou součástí tohoto souhlasu. Nejde o fotografie ani Cloudflare R2.

F-05 vlastník upřesnil: sídlo je fakturační údaj; provozovna/oblast působení
může být přesná adresa nebo pouze město a může se sídlem shodovat. Volbu
určuje firma bez dalšího ověřování. Stávající výběr měst funguje a zůstává.
`geocodingStatus: verified` je dosavadní označení vybraného mapového výsledku,
nikoli serverový důkaz skutečné provozovny či přítomnosti. F-05 se podle
tohoto pravidla nepovažuje za důvod zavádět serverové ověřování adresy.
Technická validace souřadnic a serverový geohash Shoutu zůstávají zachované.

## Současná živá cesta a místní příprava

Dosavadní [profilový klient](../../lib/src/profile.dart) vytvoří nový objekt,
změní dvě profilové reference a pokusí se smazat starou verzi. Storage ověřuje
velikost/MIME, ne skutečné pixely. Při výpadku mohou zůstat staré soubory;
přímé klientské verze nejsou početně omezené. To je F-03 z
[revize](../operations/MVP_COMPLETED_WORK_REVIEW_2026-11-27.md#f-03--střední-priorita-business-loga-nemají-omezený-počet-platných-objektů).

Nové jádro v [business_logo.js](../../functions/business_logo.js) se
neimportuje do aktivního content/account balíčku a vyžaduje explicitní `enabled`.
Samostatný připravený wrapper i údržbový adaptér jsou výchozí vypnuté.
`serverBusinessLogo` je false v obou konfiguracích; nativní define má
výchozí false. Ověřený DEV zdroj a Rules zůstávají podle PROJECT_STATUS.
Místní soubory Rules mají novou statickou bránu **false**;
[testovací kandidát](../../tools/rules/business_logo_candidate.mjs) ji zapíná
jen v emulátoru. Nejde o runtime přepínač ani nasazenou ochranu.

## Protokol náhrady

1. Po Auth/App Check server ověří účet, právní přijetí, ban, pending mazání,
   Business roli a profil, shodu soukromé/veřejné reference. Pozastavení
   Business samo o sobě nezavádí nové omezení editace loga.
2. Přijme pouze kanonické base64 nejvýše 2 MiB skutečných dat. PNG signaturu
   následuje úplné dekódování přes připnutý `sharp` 0.35.5 s limitem 512²
   pixelů, kontrolou 512×512 a jediné vrstvy/snímku. Nové PNG vznikne ze
   samotných pixelů: nepřenášejí se EXIF, ICC ani další metadata.
3. Transakce rezervuje jediný `businessProfiles/{uid}/logoState/current`.
   Uchovává profilovou inkarnaci, fingerprint/ID operace, verzi, cestu a
   původní objekt/generaci; nikdy obrázek, e-mail ani token. Verze určuje
   server a zachovává současnou cestu `businessLogos/{uid}/logo-{n}.png`.
4. [Storage adaptér](../../functions/business_logo_storage.js) zapisuje
   s `ifGenerationMatch:0`, ověřuje digest přesných uložených bajtů a znovu
   kontroluje oprávnění po I/O. Opakování existující identické verze
   soubor znovu nenahrává. Nevytváří download token ani veřejnou URL.
5. Jedna Firestore transakce přepne users/publicProfiles, uloží původní
   sedmidenní receipt a označí starou verzi k úklidu. Před tím zůstává
   staré logo aktivní. Storage a Firestore nejsou jedna společná transakce;
   jejich mezery překrývá trvalý journal a opakování.
6. Starý soubor se smaže jen při shodě generace a po kontrole, že není
   aktuálním logem. Selhání úklidu ponechá novou verzi i trvalý ukazatel;
   nová další náhrada nejdřív dokončí úklid. Neprobíhá kompenzační smazání
   již zveřejněného nového loga při ztracené odpovědi.

Přechod na vestavěný avatar je stejná serverová operace; čtyři dosavadní
avatarové hodnoty a odstranění obou logo referencí se uloží atomicky.
Ostatní profilová pole server nepřebírá z klientského snímku.

## Opakování, úklid a account purge

Klientský [gateway](../../lib/business_logo_gateway.dart) sdílí běžící
požadavek, drží neměnné bajty/klíč při nejasné odpovědi a nabízí opakování
téže operace. Chrání změnu účtu a přežije zánik/znovuotevření Profilu
v téže aplikaci. Jde o RAM, nikoli novou trvalou frontu v prohlížeči.
Odchod procesu před dokončením uploadu řeší trvalý serverový slot;
jeho rozpracovanou operaci nelze potichu nahradit jiným požadavkem.
Konkrétní uživatelské recovery po úplném zavření prohlížeče a kratší
provozní lhůtu nedokončeného uploadu je nutné uzavřít před DEV aktivací.

`cleanupBusinessLogoBatch` je vypnutý adaptér, nejvýše 50 journalů na
stránku, s checkpointem podle `cleanupAt`/cesty. Vadný řádek hlásí jako
needsReview a umožňuje pokračovat. Nahrazená verze je způsobilá hned;
opuštěný připravený slot po původních 7 dnech, případně při zániku účtu.
Kratší lhůtu nyní nezavádíme. Při úklidu v původním okně se zachová
technické zrušení operace, aby ji nová inkarnace účtu nemohla obnovit.
Po původním termínu se potvrzení znovu nevytváří.

[Operátor osiřelých verzí](../../functions/business_logo_orphans.js) navrhne
jen metadata vlastní stránky do 50 objektů, ochrání aktuální i rozpracované
cesty a vyžaduje digest/verze. Cizí cesta, změněná generace nebo profil
mazání zastaví. Při pending mazání celého účtu neprovádí tento samostatný
úklid: zachová dosavadní account purge. Staré libovolné přímé verze je
nutné inventarizovat a vyřešit před tvrzením, že celý bucket dodržuje dva sloty.

Stávající purge již pokrývá celý businessProfiles podstrom, serverOperations
podle userId a původní Storage prefix. Cesty ani původní 60denní account
termín se nemění. Dosavadní revokace tokenů/úklid účtu se nenahrazují.
Pokud při smazání účtu existuje publikovaná verze s nedokončeným úklidem,
nová logo údržba ji ponechá původní účtové retenci/purge, včetně starého
publikovaného souboru. Nezveřejněný opuštěný upload není touto výjimkou aktivován.

## Kandidátní oprávnění

Při aktivní kandidátní bráně server vlastní přidání, změnu i odstranění
obou logo referencí. Klientské založení profilu nesmí logo podvrhnout;
jiné avatarové úpravy se zachováním loga zůstávají možné. Journal je
soukromý a přímý klient jej nečte ani nezapisuje.

Storage odmítá klientský upload, přepis, metadata i mazání. Přihlášení
čtenáři stahují jen soubor uvedený v publicProfiles aktuálního vlastníka;
nezveřejněné a staré verze nejsou SDK čitelné. Stejný veřejný dokument
zajišťuje marker smazaného účtu, takže čtení nezvyšuje počet odlišných
Firestore bridge dokumentů. Bug screenshot pravidla se nemění.

Jde o místní prototyp Rules. Před aktivací musí projít společná regrese,
kontrola konkrétního vydávaného zdroje a připravený kompatibilní návrat.

## Měření a provozní návrh

Skutečné SDK document operace v emulátoru bez souběžného retry:

| Cesta | Reads | Writes | Transakční pokusy | Nové objekty |
|---|---:|---:|---:|---:|
| První logo | 56 | 6 | 7 | 1 |
| Potvrzené opakování | 10 | 0 | 1 | 0 |
| Náhrada | 60 | 6 | 8 | 1 |
| Odstranění / avatar | 40 | 6 | 6 | 0 |

Syntetické PNG 6 275 B má request JSON 8 524 B; limit 2 MiB přináší
přibližně 2,67 MiB base64 plus malou obálku. Peak byly dva objekty.
Čísla nezahrnují billed index-entry reads, Storage API operace, síťové
kódování, cloudovou latenci či souběžné transakční opakování.
Čtení před každým citlivým krokem chrání aktuální ban/mazání/inkarnaci;
nejde o práci vykonávanou při každém zobrazení loga ve feedu.

Navazující schválený místní balík již implementuje **10 nových uploadů
v klouzavé hodině na účet**, včetně obrazově neplatných pokusů. Stejný
rezervovaný/potvrzený požadavek kvótu znovu nečerpá; odstranění loga ji
nečerpá. Vše zůstává vypnuté. [Recovery, nové měření a DEV plán](BUSINESS_LOGO_RUNTIME_READINESS.md).
Kratší opuštění se nezavádí: původní sedmidenní okno je zachované.
Nový scheduler ani globální scan účtů nejsou potřebné.

## Ověření a další krok

Místně prošlo **5/5** unit testů obrazu/Storage adaptéru, **17/17**
Firestore/Storage emulátorových testů bez skipů, **42/42** Flutter testů
včetně původního editoru a konfigurace, Flutter analyze, formát a Functions
lint. Nástrojová sada webového prostředí/artefaktů **38/38**; doplněná
kontrola neaktivního modulového grafu znovu **3/3**. Retenční okraj doplňuje
samostatná cílená regrese. Opravený zdroj
**3bcea522167999b9cdf7e8379bb3c837b6c9a45b** má
[úspěšné úplné CI 46153914387](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46153914387):
celá klientská/serverová sada, všechny Rules/archivní/purge/Storage kroky,
nových 17 emulátorových testů a web build. První běh 46153656328 byl
záměrně zrušen po nalezení a opravě předání publikovaných souborů účtovému
purge; nepoužívá se jako úspěšný důkaz.

Příprava je tímto místně uzavřená, ne živě aktivovaná. Důkazy doplňují
otevřené `business-endtoend` a `business-authority-final`; celé jejich
podmínky ani produkce ještě splněné nejsou. Pevné váhy se nezměnily a
nevznikají zpětné body jen za přejmenování nálezu F-05.

Do zámku přibyl pouze `sharp` a jeho platformní závislosti; verze
dosavadních balíčků se nezměnily. Audit produkčních závislostí hlásí
dosavadní transitive nálezy (6 moderate, 1 low), žádný pro sharp;
nesouvisející hromadná aktualizace nebyla provedena.

Cílené testy pokrývají neplatné/velké PNG, původní editor, Auth/App Check,
role/ban, cizí účet, dvě souběžné stejné žádosti, jinou pending žádost,
restart serverového zpracování, ztracenou Storage i Firestore odpověď,
odstranění/novou inkarnaci účtu, sedmidenní konec, chráněnou generaci,
osiřelé objekty a kandidátní Firestore/Storage Rules. Testy jsou součástí
úplného CI přes `test:business-logo`; původní Storage sada zůstává samostatná.

Storage emulátor nepředstavuje důkaz všech cloudových preconditions při
souběhu: při prvním testu přijal opakovaný create přes `ifGenerationMatch:0`.
Adaptér proto před opakováním kontroluje existující objekt a při mazání
generaci; preconditions dál posílá do GCS. Lokální model ověřuje závod,
skutečný emulátor SDK roundtrip a chybnou generaci. Cloudový důkaz bude
součástí případného samostatně schváleného DEV pilotu, nikoli tohoto balíku.

Navazující recovery/provozní balík a jeho přesný aktuální stav jsou v
[readiness plánu](BUSINESS_LOGO_RUNTIME_READINESS.md); starší CI výše
dokládá pouze původní zdroj, ne následné změny.
Nyní se nic nenasazuje; tato příprava neuzavírá celý Business milník ani MVP.
