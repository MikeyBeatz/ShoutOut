# Archiv obsahu a dohledání účtů podle kontaktu

Zadání a produktová rozhodnutí vlastníka z 27. listopadu 2026.
Navazuje na [integrační revizi](CONTENT_LIFECYCLE_INTEGRATION_REVIEW.md).
Tento dokument je návrh dalšího úseku; nový index ani jeho prohlížení nejsou
implementované nebo nasazené. Stávající archivní volby zůstávají vypnuté.

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

Tyto produktové odpovědi samy nejsou souhlasem s implementací nového indexu.
Do něj ještě nevstupovat; před změnou kódu předložit tento konkrétní rozsah
podle AGENTS.md. Původní tříbodový úsek vlastník nejprve požádal vysvětlit,
poté zpřesnil požadavek na dohledatelnost účtů.
