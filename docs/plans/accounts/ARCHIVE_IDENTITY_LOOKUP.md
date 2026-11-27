# Archiv obsahu a dohledání účtů podle kontaktu

Zadání a produktová rozhodnutí vlastníka z 27. listopadu 2026.
Navazuje na [integrační revizi](CONTENT_LIFECYCLE_INTEGRATION_REVIEW.md).
Vlastník 27. listopadu výslovně schválil celý společný místní úsek a testy.
Implementace je připravená ve větvi feature/archive-identity-integration; všechny nové
volby zůstávají vypnuté. Bez nasazení, živých dat, Auth účtů nebo secrets.

**Místní úsek uzavřený:** zdroj b1ed417c689884b496627eb907788d1b871d5a0d má
[úspěšné úplné CI 45970322486](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45970322486).
165 archivních případů, 151 retenčních, 482 Rules/transakčních, 583 aplikačních
a 129 nástrojových testů; prošly i browserové/B4/B2/moderační/Storage sady,
analýza, lint a webový build. Unit 222 pass /882 skip neznamená spuštění skipů.

## Schválené zadání a hranice

- Archivovat obsah už při publikaci, včetně autora, časových údajů a návazností.
  Vytvoření zdroje a jeho neveřejné kopie musí být atomické.
- V administraci dohledat známé účty spojené s e-mailem či telefonem a jejich
  dosud uchovaný veřejný obsah, včetně komentářových vláken.
- **Schváleno:** vyhledávání podle kontaktu a rozšířený archivní náhled smí
  používat pouze stávající administrátor a owner (úrovně 5 a 6).
- **Schváleno:** zachovat dnešní termíny: konec platnosti Shoutu +7 dní vlastní
  historie +60 dní archivu; dřívější závazný účtový termín má přednost.
  Kontaktní vazby odstranit nejpozději s příslušnými účtovými údaji.
- Definitivně smazané údaje se neobnovují. Žádost ani vyhledávání samy
  neprodlužují retenci; případný jiný postup vyžaduje samostatné projednání.
- Soukromé odpovědi nadále zpřístupňovat moderaci přes konkrétní hlášení;
  toto zadání nezavádí obecné procházení soukromých konverzací.
- Telefonní ověřování zůstává plánované po MVP. Před jeho zavedením nelze
  tvrdit dohledání podle čísla, které systém nezískal a neověřil.

## Úsporný technický návrh k implementačnímu schválení

### Jedna kopie a indexované vztahy

Znovu použít připravený contentLifecycleArchive a contentLifecycleThreads.
Tělo obsahu se neduplikuje do každého hlášení ani do kontaktního indexu.
Autor se odkazuje stabilní identitou účtu, při návrhu zohlednit také jeho
inkarnaci při případném znovupoužití UID. Kontakty neopakovat u každého Shoutu.

Komentář nese threadId/shoutId, vlastní ID a případný odkaz na předchozí
komentář. Vlákno se hledá indexovaným dotazem; nevytvářet rostoucí pole
všech ID v rodiči a další zápis rodiče jen kvůli evidenci vazby.
Současný atomický čítač komentářů tím není rušen.

Rozlišit čas publikace, skutečný serverový commit/záchyt, plánovanou expiraci,
případné odstranění, konec historie a závazný termín výmazu. Kde přesný starý
čas chybí, zachovat neznámou hodnotu či doložený pozdější záchyt; nepřepisovat
jej časem migrace vydávaným za původní událost.

### Oddělený kontaktní index

Navrhnout malou serverovou vazbu typu kontakt → inkarnace účtu. Klíč přesného
vyhledání odvodit HMAC z druhu a normalizované hodnoty kontaktu, s oddělením
projektu a verzí klíče. Prostý hash telefonního čísla není vhodnou ochranou.
Skutečné hodnoty ani klíč nepatří do URL, názvů dokumentů, klienta či logů.
HMAC zůstává osobním údajem v souvislosti s účtem, ne anonymním souhrnem.

Zachovat serverově doložený původ a stav ověření kontaktu, čas pozorování,
UID/inkarnaci a termín odstranění. Čas prvního pozorování není automaticky
čas změny či ověření v Auth. Výsledky znamenají doložené vazby na kontakt,
nikoli důkaz totožnosti osoby; číslo nebo adresu může v čase používat někdo jiný.

Při implementaci ověřit pokrytí vzniku účtu, dostupných změn kontaktů, jejich
ověření a odstranění Auth. Klientské tvrzení o cizím kontaktu nestačí.
Existující Auth není úplný historický protokol. Staré vazby, které nebyly
zachované, nelze domýšlet. Počáteční doplnění musí výslovně uvést meze důkazů.
Základ návrhu nesmí vyžadovat placený nový poskytovatel nebo sken Auth při dotazu.

Index měnit při skutečném záchytu či změně vazby, nikoli opakovaně při každém
zobrazení obsahu. Přesný okamžik synchronizace musí při implementaci doložit
požadovanou úplnost; úspora zápisu nesmí znamenat nepravdivou historickou vazbu.

### Serverové čtení a klient

Rozhraní: kontakt → seznam dochovaných účtů → stránka jejich Shoutů → vlákno.
Připravit přesné hledání a stránky nejvýše 50 záznamů; žádný plný scan ani
trvalý realtime odběr archivu. Celá těla načítat až při otevření detailu.
Měřit čtení a zápisy podle skutečně prohlédnutých stránek, ne slíbenou cenu.

Každý serverový požadavek znovu kontroluje Auth/App Check, aktuální roli 5/6,
způsobilost žádajícího pracovníka a původní retenční termíny cíle.
Odstranění Auth cílového účtu samo neznamená, že již uplynul termín jeho archivu;
dohledání musí respektovat tento rozdíl a skutečně provedené výmazy či redakce.
UI samo oprávnění nevynucuje.
Klientské i serverové zapojení připravit za vypnutou volbou.

Vyhledání/otevření doprovodit auditem aktéra, operace a důvodu či identifikátoru
případu. Neukládat otevřený vyhledávaný kontakt ani tělo obsahu do provozních
logů. Audit a jeho osobní reference zahrnout do stávajících retenčních kontrol;
návrh nesmí prostřednictvím auditu vytvořit druhou neomezenou kontaktní historii.
Konkrétní data k poskytnutí a oprávněnost žádosti se posuzují jednotlivě;
vyhledání samo žádné údaje policii ani jiné straně neodesílá.

### Úklid, opakování a bezpečný návrat

Propojit vazby s původní inkarnací účtu a závazným termínem. Po zahájení
mazání či po uplynutí termínu nesmí opožděná synchronizace, starý token nebo
opakovaný požadavek znovu vytvořit dohledatelnou vazbu či prodloužit lhůtu.
Mazání po dávkách musí pokračovat po restartu a zachovat cizí účty.
Ověřit opakované vytvoření účtu se stejným kontaktem jako odlišnou inkarnaci.

Původní integrační úkoly nadále platí: převzetí ověřitelného starého rodiče
při prvním novém potomku, oddělení informace o archivaci od readeru a kompatibilní
návrat po scrub textových kopií. Verze se týká klienta i serverového ověření
přijetí; dnes mají lib/legal.dart a functions/callable_security.js stejnou starou
verzi natvrdo. Novou veřejnou verzi a přechod stávajících účtů schválit zvlášť.

## Navazující místní úsek k výslovnému schválení

Připravit společně výše popsané datové jádro a administrátorské čtení,
klientské zapojení za vypnutou volbou, účtový úklid a tři integrační návaznosti.
HMAC klíč v testech pouze dodat jako laboratorní vstup; nezakládat živý secret.
Ověřit odmítnutí rolí 1–4, podvrženého kontaktu, změny role či účtu mezi stránkami,
expiraci/mazání během požadavku, ztracenou odpověď, restart a souběh registrací.
Doložit matici writerů/čtenářů, operace i existující rozpočet 450 zápisů a původní
nejvýše 50 zdrojů. Zdokumentovat nezachycenou minulost a podmínky budoucí aktivace.

Součástí návrhu je dokumentace, příslušná evidence bez svévolného navýšení vah,
commit/push a společné úplné CI. Bez nasazení, živých dat, migrace, Auth účtů,
nových služeb/secrets, změny retenčních lhůt, rolí či provozních prostředků.
Potřebné indexy a oprávnění pouze navrhnout a ověřit místně; žádný DEV cutover.

Po vysvětlení a zpřesnění rolí/retence vlastník výslovně schválil výše uvedený
společný místní implementační úsek včetně testů, commitu/pushe a úplného CI.
Aktivace, veřejná právní verze a konkrétní DEV plán tím schválené nejsou.

## Místní implementace a ověřené meze

- [Serverový index](../../../functions/archive_identity.js): HMAC oddělený podle
  projektu, druhu kontaktu a verze klíče. Inkarnace obsahuje UID, doložený vznik
  Auth a přesný SDK createTime profilu; nezávisí jen na sekundové přesnosti Auth.
  Hodnota kontaktu ani klíč se nezapisují do indexu, ID dokumentů nebo diagnostiky.
- Záchyt používá Admin Auth a transakčně kontroluje profil, přijetí podmínek,
  zákaz i mazání. Telefon se bere pouze z doloženého Auth phoneNumber. Záchyt
  před vznikem nového profilu nemůže být připojen k jeho náhradě.
- [Připravené adaptéry](../../../functions/archive_identity_runtime.js) jsou off.
  Serverové publikování Shoutu, komentáře a soukromé odpovědi před novým tělem
  znovu ověří identitu. Publikace váže transakční důkaz na tentýž účet; přepnutí
  inkarnace mezi ověřením a zápisem odmítne celý obsahový zápis.
- Klient má vypnuté pozorování při přihlášení/změně Auth a návratu do popředí.
  Samostatný [administrátorský náhled](../../../lib/src/staff_archive.dart) není
  v běžné moderaci. Po změně účtu/role odstraní RAM stav; vypršení serverové
  platnosti rovněž odstraní obsah bez dalšího síťového požadavku.
- [Čtení](../../../functions/archive_identity_reader.js): nejvýše 50 prohlédnutých
  záznamů, podepsané pokračování pro konkrétního aktéra/případ/výběr, metadata
  bez textů v seznamu, tělo až v detailu. Veřejné komentáře mají vazbu na přesnou
  inkarnaci vlákna; soukromé odpovědi nejsou součástí obecného procházení.
  Každý požadavek znovu ověřuje současnou roli 5/6 a původní termíny, včetně retry.
- Úspěšné čtení zapisuje jeden audit na požadavek; opakování stejného ID jej
  neduplikuje a neukládá kopii odpovědi. Audit obsahuje identifikátor případu,
  aktéra a cílové reference, nikoli kontakt nebo tělo. Při purge aktéra či
  některého cílového účtu se celý příslušný audit odstraní; cizí účty se nemění.
- Příjem/čtení a účtový purge mají oddělené vypnuté volby. Po první instalaci
  musí purgeEnabled zůstat zapnuté i při vypnutí příjmu/hledání; nepotřebuje HMAC
  klíč. Zachová i lifecycle fáze před identity fázemi, aby návrat neposunul čísla
  rozpracovaného jobu. Aktivní adaptér vyžaduje připravený úklid.
- [Finalizace účtu](../../../functions/finalize_account_deletion.js) atomicky
  uzavře identitu a označí původní žádost. Druhá omezená transakce doplní přesný
  SDK createTime této žádosti. Při přerušení čtení přijme jen původní označenou
  žádost; při její ztrátě odmítne přístup. Opakování ji může dokončit, nikdy
  nahradit novějším termínem. Účtový purge má nové fáze až za původními pozicemi.
- [Indexový návrh](../../../tools/archive_identity_index_plan.mjs) obsahuje dvě
  složená indexová schémata a skupinový array index auditních subjektů. Zachovává
  ostatní indexy a neprovádí změnu TTL; nemá živý aplikační vstup.
  Nové soukromé kolekce nadále pokrývá výchozí deny ve stávajících Rules.

### Co index dokládá a co nedokládá

Zachytí ověřený kontakt, který backend skutečně viděl u dokončeného účtu.
Při nezměněných kontaktech se nový záznam nezapisuje. Nedokládá všechny minulé
změny Auth mezi dvěma pozorováními, nedokončené/neověřené registrace, vlastnictví
telefonu mimo Auth ani občanskou totožnost osoby. Přihlašovací/foreground
pozorování není nová Auth služba či trigger; jeho chyba neblokuje odhlášení.

Nové tělo dostává authorAccountKey ve stejné transakci jako archiv. Staršímu
archivu bez doložené vazby se UID nepřeklopí automaticky na dnešní inkarnaci.
Rozhraní i odpověď přiznávají pouze doložené pokrytí; prázdná stránka není důkazem,
že účet nikdy nepublikoval. Před DEV aktivací je třeba konkrétně schválit způsob
počátečního záchytu stávajících účtů a řešení starých archivních vazeb; v této
místní přípravě se živá data neinventarizovala ani nedoplňovala.

Není zaveden veřejný callable wrapper ani skutečný secret. Názvy připraveného
transportu jsou observeArchiveIdentity/getArchiveIdentityPage, jejich lokální
obsluhy jsou testované přímo. První aktivace musí doplnit wrapper s vynuceným
Auth/App Check, konkrétní prostředky, právní verzi, ověřený indexový stav a klíč.
Změna verze HMAC klíče vyžaduje samostatný přechod; samotné přepnutí klíče není
kompatibilní migrací. Phone Auth a fyzické mobilní release kontroly zůstávají
v původním pořadí plánu.

### Měření a kontrolní důkazy

[Emulátorová sada](../../../functions/archive_identity.integration.test.js)
počítá dokumentové výsledky, prázdný dotaz jako jedno čtení, pokusy zápisů a
volání Auth. Jedna emailová vazba bez konfliktu:

| Operace | Firestore čtení | Zápisy | Auth getUser |
| --- | ---: | ---: | ---: |
| První ověřené pozorování | 8 | 3 | 1 |
| Stejná již zachycená vazba | 7 | 0 | 1 |
| Přesné dohledání jedné vazby s auditem | 12 | 1 | 0 |

Nejde o účtenku nebo cloudový kapacitní benchmark; nezahrnuje index entries,
přenosy, infra App Check ani opakování transakcí. Ověřeny jsou i stránky 50 +3,
změna role mezi požadavky, cizí kontakt, chybějící ověření, souběžné pozorování,
zánik/reinkarnace profilu, archiv po odstranění zdroje, zákaz soukromého browse,
původní 60denní hranice a účtový úklid se zachováním cizích dat.

Samostatné [klientské regrese](../../../test/archive_identity_client_test.dart)
ověřují retry stejné žádosti, řídkou stránku, opožděnou odpověď, změnu účtu,
zánik controlleru a lokální odstranění prošlého obsahu. [Rules regrese](../../../tools/rules/content_lifecycle.integration.test.mjs)
odmítají přímé čtení/listování/zápisy indexu pro úrovně 1–6; kandidát právní
verze zachovává vlastnictví, validaci a neměnnost přijetí. Kandidát je pouze
místní prototyp, nikoli doklad nasazení či úplné bezpečnostní certifikace.

### Příští kontrolní bod před DEV

Nejdřív vybrat novou veřejnou právní verzi a způsob přechodu existujících účtů;
testovací datum 2099-01-01 není návrhem veřejné verze. Potom doložit počáteční
kontaktní pokrytí a případné vazby starých archivů s konkrétními důkazy. Teprve
nad tím připravit přesný živý plán klíče/wrapperů, indexů, kompatibilních klientů,
retence a návratu, včetně skutečné připravenosti všech indexových stavů.

Tato větev je izolovaná od vedlejší práce na hře. Před budoucím webovým rolloutem
porovnat celý vybraný zdroj s aktuálním DEV vydáním včetně již schválené hudby
a ovládání hry; testovaný místní archivní zdroj sám není automaticky vybranou
náhradou dnešního webu. Nezahrnovat rozpracované herní experimenty ani R2 plán.
