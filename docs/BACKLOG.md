# Podrobná evidence úkolů ShoutOut

Aktuální priority a milníky: [TODO](TODO.md). Poslední ověřený stav: [PROJECT_STATUS](PROJECT_STATUS.md).

Tento soubor je kanonická checkboxová evidence. Původních 155 úkolů
(107 hotových, 48 otevřených) zůstává zachovaných. Dne 31. října 2026 přibyl
nový požadavek na feed; aktuálně je zde 156 úkolů: 107 hotových a 49 otevřených.
Při reorganizaci se žádný checkbox ani jeho stav nezměnil. Hotové bloky jsou zkrácené na názvy;
jejich úplné požadavky, rozhodnutí a ověření jsou v odkazovaném nezměněném archivu.
Bloky s otevřeným podúkolem zůstávají celé, včetně kontextu a již hotových podúkolů.
Serverové požadavky a podmínky dokončení jsou v [MVP_SERVER_PLAN](MVP_SERVER_PLAN.md).
Počet se odvozuje jen z tohoto souboru, nikoli z kopií checkboxů v archivu nebo přehledů milníků.

### Prezentační web před MVP

Doména `shoutout-app.eu` je pořízená a slouží jako veřejný statický prezentační
web. Nejde o webovou verzi aplikace: neobsahuje
přihlášení, registraci, Business ani moderátorské rozhraní a nebude odkazovat do
obchodů s aplikacemi. Úplný záznam rozhodnutí, cílového Hostingu a pořadí
zprovoznění je v `PRESENTATION_SITE.md`.

- [x] **Před MVP, samostatná etapa** — vytvořit oddělený produkční Firebase
  projekt pro prezentaci: `shoutout-production-a1b34`; doména není připojená k
  `shoutout-dev-46c81`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#prezentační-web-před-mvp).

- [x] **Před MVP, samostatná etapa** — připravit a nasadit statický prezentační
  obsah na Firebase Hosting v projektu `shoutout-production-a1b34`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#prezentační-web-před-mvp).

- [x] **Před MVP, samostatná etapa** — připojit `shoutout-app.eu` k Firebase
  Hosting a ověřit HTTPS.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#prezentační-web-před-mvp).

- [ ] **Před MVP, samostatná etapa** — připojit a přesměrovat
  `www.shoutout-app.eu` na hlavní doménu.

Tyto položky se nezapočítávají do procent MVP: neaktivují veřejnou aplikaci ani
nenahrazují produkční, bezpečnostní a distribuční bránu MVP.


## Nové podněty z uživatelského testování

<a id="feed-read-refresh"></a>

- [ ] **Navrhnout a po schválení zavést přečtení Shoutů, stabilní feed a refresh s počtem novinek.**
  **MVP — vlastník potvrdil celé A0–A3 i B1–B4 před vydáním.**
  - Nový požadavek vlastníka z 31. října 2026; rozšiřuje původní rozsah, nejde
    o přepsání historického dokončení základního feedu ani o další milník MVP.
  - V Nejblíž nepřečtené před přečtenými, obě skupiny podle vzdálenosti se stabilními
    shodami; jeden souvislý seznam, neměnné pořadí během relace a připojované stránky.
  - Označení až po skutečném zobrazení celého relevantního obsahu včetně
    dlouhých/rozbalovaných Shoutů; ihned uložit osobní stav bez přesunu karty.
  - Nový obsah nevkládat průběžně; refresh s indikátorem 1–99/99+ počítá nově
    dostupné položky platných filtrů od baseline, nikoli všechny nepřečtené.
  - Po úspěšném refreshi přepočítat skupiny, vrátit scroll nahoru a posunout
    baseline; zachovat přečtení po restartu, navrhnout dávkovou synchronizaci zařízení.
  - Top/Končící/Sledované zachovají vlastní řazení. Před dalšími etapami vyřešit vztah k
    nízkému hodnocení a Spotlightu, podmínku expozice, změny polohy a čerstvost
    počítadla. Volby budoucího B nesmějí zbytečně blokovat samostatné A0/A1.
  - Změřit náklady celého hledání a synchronizace, nejen počet vrácených karet;
    nepsat každý read automaticky zvlášť ani nepředstírat, že batch snižuje počet dokumentových zápisů.
  - [Etapový návrh a schvalovací brány](FEED_IMPLEMENTATION_STAGES.md).
    [Analýza, otevřené volby a akceptace cílového rozšíření](FEED_READ_REFRESH_PLAN.md).
    [Úplné nezměněné zadání](requests/FEED_READ_REFRESH_2026-10-31.md).
  - A0/A1 lokálně hotové ([měření](FEED_A1_RESULTS.md)); celý úkol zůstává otevřený. R2 schválené (poslední bod otevřené aplikace); technické limity před A2. Nezaměňovat
    osobní přečtení s veřejnými statistikami zobrazení, které zůstávají po MVP.

- [x] **Navrhnout sdílenou profilovou vizitku.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [ ] **Rozhodnout o případném větším dosahu v rámci předplatného.** **Po MVP**
  - Běžný Business Shout zachová standardní místní dosah. Zda předplatné
    nabídne větší poloměr, není rozhodnuto; samostatné dokupování za tokeny
    bylo zrušeno.
  - Před případnou implementací určit geografické limity, dobu platnosti,
    serverové oprávnění a ochranu proti překryvu či zneužití oblastí.
- [x] **Prověřit API pro události v okolí.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] **Opravit tlačítko „Zrušit registraci a začít znovu“.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [ ] **Prověřit nedoručený ověřovací e-mail na Email.cz.** **MVP**
  - Google/Gmail při testu fungoval, ale zpráva na Email.cz nedorazila; rozlišit
    chybu odeslání, zpoždění, spam a odmítnutí či reputaci odesílací domény.
  - Doplnit srozumitelný stav, opakované odeslání a diagnostiku bez ukládání
    plné e-mailové adresy do technických logů.
  - [x] Klient nabízí opakované odeslání, po úspěchu ponechá na obrazovce viditelný
    stav a při chybě diagnostikuje pouze bezpečný Firebase kód bez adresy a odkazu.
  - [ ] **MVP** — Doručitelnost na Email.cz ověřit mimo klienta podle Firebase/Auth provozu,
    spamu a případného odmítnutí příjemcem; bez poštovních logů ji nelze potvrdit.
- [ ] **Přidat postupné ověření telefonního čísla přes Firebase Phone Auth.** **Po MVP**
  - Telefon nevyžadovat při založení účtu. Vyžádat jej až při první chráněné
    akci a po úspěšném ověření stav bezpečně svázat s účtem.
  - Bez SMS ověření povolit prohlížení feedu, otevření Shoutu a komentářů,
    vyhledávání nebo změnu lokality podle pravidel aplikace a sledování účtu.
  - SMS ověření vyžadovat pro like/dislike či jinou reakci, komentář, vytvoření
    Shoutu, hlasování v anketě a soukromou odpověď autorovi Shoutu.
  - Před zapnutím vyřešit podporované země, kvóty a náklady, ochranu proti
    zneužití SMS, změnu či ztrátu čísla, obnovu účtu a minimalizaci osobních dat.

- [x] **Nahradit původní kategorie Shoutů novou sadou.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] **Umožnit otevřít veřejný profil autora z komentáře.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] **Přidat veřejné flairy rolí.**
  - [x] Doplnit klientské zobrazení flairů na Shoutech, komentářích, soukromých
    odpovědích, veřejném profilu a seznamu sledovaných profilů včetně lokalizace
    `Moderátor` a mapování `seniorModerator` na stejný veřejný štítek.
  - [x] Nasadit upravená Firestore Rules a důvěryhodně doplnit `publicRole` do
    existujících veřejných profilů skriptem `npm run backfill:public-profiles`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [ ] **Přepracovat onboarding na interaktivní tutorial.** **Po MVP** *(Rozpracováno, automatické spuštění je dočasně deaktivované.)*
  - Nahradit dlouhé úvodní rady krátkými kontextovými kroky typu „klikni sem“,
    „udělej toto“ a „pokračuj tady“ přímo nad skutečným rozhraním.
  - Umožnit přeskočení, pozdější opakování a pokračování po přerušení; měřit
    dokončení kroků bez ukládání přesné polohy.
  - První průchod vede uživatele přes skutečný výběr kategorie, otevření a zavření
    detailu Shoutu, otevření formuláře a profilu. Postup je uložený u účtu;
    dokončení nebo potvrzené přeskočení automatické spuštění trvale vypne.
- [ ] **Doplnit uživatelskou zpětnou vazbu a metriky obsahu.** **Po MVP**
  - Navrhnout důvěryhodné počítání zobrazení Shoutu a zobrazit autorovi počet
    zobrazení, uložení a dalších relevantních interakcí.
  - Vyřešit unikátní versus celková zobrazení, ochranu proti farmení, soukromí,
    retenci a serverové počítání před použitím metrik pro karmu.
- [x] **Provést cílenou kontrolu překladů hlášení chyb a průvodce aplikací.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] **Opravit ciferník platnosti v dialogu Nový Shout.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] **Přepracovat rozložení společné Shout karty.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] **Navrhnout zásady karmy, achievementů a kosmetických odměn.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [ ] **Rozhodnout, zda vůbec zavést kosmetické coiny nebo obchod.** **Po MVP**
  - Pokud vzniknou, nesmějí být Business tokeny ani prostředkem k získání
    předplatného, dosahu, moderátorských pravomocí nebo jiné funkční výhody.
- [ ] **Omezit Business promo na nejvýše dva současně aktivní Shouty na firmu.** **MVP**
  - Limit vynucovat serverově napříč všemi pobočkami a typy propagace; určit,
    zda kombinované zvýraznění s okénkem spotřebuje jeden aktivní promo slot.
- [ ] **Navrhnout Founder balíček pro nové podniky.** **Po MVP**
  - Founder entitlement vést odděleně od veřejné role a flairu; oprávněný účet
    může mít zvláštní zvýhodnění vůči budoucímu předplatnému, jehož podobu je
    teprve nutné rozhodnout.
  - Určit podmínky přidělení a odebrání, rozsah zvýhodnění, audit a ochranu
    proti duplicitním firmám a zneužití. Business tokeny se nezavádějí;
    případné kosmetické coiny jsou oddělené produktové rozhodnutí.
- [x] **Zvýrazněné Business Shouty a propagační okénko jsou implementované.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] **Naplánovat pořízení evropské ochranné známky ShoutOut.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

Interní pravidla rolí, pravomocí a postihů jsou vedena v
`docs/INTERNAL_MODERATION.md`. Změny moderace musí aktualizovat také tento
dokument, pravidla, testy a případně veřejné právní texty.

## Stav dokončení backlogu

Počet zachován při reorganizaci 29. října 2026.

`███████████████████████████░░░░░░░░░░░░░` **69 %** — pokročilá fáze

Hotovo je 107 ze 155 evidovaných úkolů. Procento počítá každý řádek s checkboxem
`[x]` nebo `[ ]` jako jednu stejně váženou položku, včetně vnořených podúkolů.
Při přidání nebo uzavření úkolu se musí přepočítat počet hotových i celkový počet.

| Rozsah | Orientační stav |
|---:|---|
| 0–19 % | začátek |
| 20–39 % | základ rozpracovaný |
| 40–59 % | hlavní části ve vývoji |
| 60–79 % | pokročilá fáze |
| 80–99 % | dokončování a ověřování |
| 100 % | backlog uzavřený |

Toto číslo měří postup celým backlogem, nikoli připravenost k veřejnému vydání.
O spuštění rozhoduje samostatná povinná brána v `docs/LAUNCH_READINESS.md`; její
blokující body nelze vyvážit dokončením většího počtu méně kritických úkolů.

## Geografie a globální moderace

- [x] Geohash nových shoutů a model `geography`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#geografie-a-globální-moderace).

- [x] Google reverse-geocoding trigger s tajným serverovým API klíčem.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#geografie-a-globální-moderace).

- [x] ISO země/oblasti, moderátorské rozsahy, webový filtr a kontrola postihu.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#geografie-a-globální-moderace).

- [x] Migrační nástroj pro existující shouty.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#geografie-a-globální-moderace).

- Lokálně byly 25. října odstraněné opakované GETy interakcí, restartování
  stejných streamů a duplicitní načítání historie/detailů; viz
  `docs/READ_COST_AUDIT.md`. Tato optimalizace není dokončením cloudových
  nákladových pojistek ani serverového prostorového feedu. Vývojový build byl
  25. října nasazený na Hosting `shoutout-dev-46c81` a prošel základním
  průchodem v přihlášené relaci.
- [ ] **MVP** — Před prvním nasazením Functions nastavit a prakticky otestovat
  nákladové pojistky podle `docs/COST_SAFETY.md`: servisní kvóty, Functions
  spend cap, rozpočtová upozornění, Pub/Sub nouzovou reakci a odpovědnou osobu.
  Po splnění pokračovat oddělenými kontrolovanými kroky: nasadit
  `enrichShoutGeography`, provést dávkový geografický backfill, aktivovat po
  cenové kontrole TTL a poté implementovat serverovou expiraci Shoutů a mazání
  účtů. Přesná výstupní kritéria jsou v `docs/COST_SAFETY.md`.
- [ ] **MVP** — Zapnout Geocoding API, nastavit `GOOGLE_MAPS_API_KEY` jako Functions secret
  a nasadit Functions, pravidla a indexy.
- [ ] **MVP** — Spustit backfill a zkontrolovat země, kde Google neposkytne ISO 3166-2;
  případné mapování udržovat v serverové vrstvě.
- [x] Po migraci rolí odstranit výjimku pro staré role bez `moderationScope`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#geografie-a-globální-moderace).

Toto je podrobná checkboxová evidence. Priority jsou v TODO.md a serverové
požadavky v MVP_SERVER_PLAN.md. Samotné zapsání bodu neznamená implementaci.

## Brána před veřejným spuštěním

- [ ] **MVP** — Splnit webovou předstartovní bránu v `docs/LAUNCH_READINESS.md`.
  Tento dokument sdružuje produkční, bezpečnostní, právní, testovací a provozní
  předpoklady veřejné aplikace. Mobilní distribuce a placená monetizace jsou
  samostatné navazující etapy; jednotlivé úkoly zůstávají v tomto backlogu.
- [ ] **Po MVP** — Marketingový pilot zahájit až po splnění startovní brány a dále jej řídit
  samostatným plánem `docs/local/ShoutOut_marketingovy_plan_spusteni.docx`.

## Aktuální produktové úpravy

Otevřené produktové úkoly řešit v pořadí následujících etap. Pořadí drží
diagnostiku a společný datový základ před obrazovkami, které na nich závisejí;
odložené nápady až za hlavními uživatelskými cestami.

### Etapa 1 – stabilita, poloha a základní chování

- [x] **Zjistit, proč mimo Litoměřice nešlo vytvořit Shout.**
  - Reprodukovat na fyzickém zařízení i emulátoru s polohou uvnitř a mimo
    Litoměřice a rozlišit oprávnění, nedostupnou/nepřesnou polohu, validaci
    geohashe, rate limit a zamítnutí Firestore Rules.
  - Zobrazit uživateli konkrétní a lokalizovanou příčinu místo obecné chyby.
  - Zachovat skutečnou polohu zařízení také na Hosting preview kanálu; pevnou
    demo polohu nezavádět.
  - [x] Automaticky ověřit geohash a veřejné zaokrouhlení pro Litoměřice,
    Lovosice, Ústí nad Labem, Prahu, Bratislavu, Varšavu, Berlín a Řím včetně
    světových hranic a odmítnutí neplatných souřadnic.
  - [x] Doplnit testy pravidel pro běžný účet mimo Litoměřice, výběr pobočky
    odlišné od sídla a odmítnutí pozastavené, smazané nebo neověřené pobočky.
  - [ ] **Po MVP** — Dokončit ruční kontrolu na fyzickém zařízení s běžným účtem mimo
    Litoměřice; dosavadní opakované pokusy uživateli procházejí.
  - [ ] **MVP** — Ověřit polohu a publikování běžným účtem mimo Litoměřice v
    mobilním i desktopovém prohlížeči.
  - V kódu ani pravidlech není omezení na Litoměřice. Automatické testy potvrzují
    publikaci z více českých i zahraničních míst a uživatelské pokusy procházejí.
    Mobilní a desktopový prohlížeč jsou předstartovní kontrola webového MVP;
    fyzické zařízení je krok pozdějšího mobilního vydání.
- [x] **Dokončit interní evidenci technických chyb.**
  - Ukládat bezpečný diagnostický záznam neúspěšné akce, důvod zamítnutí,
    čas, verzi aplikace a nezbytný technický kontext bez hesel, tokenů a
    nadbytečných osobních údajů.
  - Přístup k technickým chybám mají pouze administrátor a owner (role 5–6).
    Moderátor ani senior moderátor je nevidí; jejich úkolem je řešit chování
    uživatelů a nahlášený obsah, nikoli provoz aplikace.
  - Doplnit retenci, stránkování, filtrování, audit přístupu a upravit Firestore
    Rules tak, aby kolekci nebylo možné číst rolím 1–4.
  - [x] Omezit čtení ve Firestore Rules na role 5–6 a zobrazit posledních
    50 záznamů v systémovém dohledu administrátora a ownera.
  - [x] Doplnit stránkování po 25, filtrování načtených záznamů, přesný čas,
    neměnný audit otevření a 60denní hranici čtení.
  - [ ] **MVP** — Blaze je aktivní; před nasazením připravené Firestore TTL konfigurace
    pro fyzické odstranění `clientErrorLogs` a `technicalLogAccessAudits` změřit
    objem a schválit účtovaná TTL mazání podle `docs/COST_SAFETY.md`. Do té doby
    jsou starší záznamy bezpečně nečitelné.
- [x] **Umožnit moderátorským a vyšším rolím nastavit polohu pro náhled území.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-1--stabilita-poloha-a-základní-chování).

- [x] **Změřit a zkrátit dlouhé načítání při registraci.**
  - [x] Měřit samostatně vytvoření účtu, odeslání a kontrolu ověřovacího e-mailu,
    obnovení ID tokenu a u business účtu také zápis žádosti.
  - [x] Zobrazovat aktuální krok registrace a u business účtu po vytvoření účtu
    souběžně uložit žádost a odeslat ověřovací e-mail.
  - [x] U neaktivní Business žádosti zobrazit známý stav bez čekání na roli a
    Business profil a pro onboarding znovu použít již načtená data profilu.
  - [x] Odeslání prvního ověřovacího e-mailu spouštět po vytvoření účtu na pozadí,
    aby neblokovalo přechod na ověřovací obrazovku; opakované odeslání zůstává
    dostupné. Debug měření propojuje vytvoření účtu, ověření, profil a první
    obrazovku bez ukládání UID, e-mailu nebo jiných osobních údajů.
  - [x] Porovnat naměřené časy na rychlém a omezeném mobilním připojení.
    Android Emulator API 35: profil `full` bez latence vytvořil účet za 2 424 ms
    a odeslal ověřovací e-mail na pozadí za 496 ms; profil `edge` (473,6 kbit/s,
    latence 80–400 ms) vytvořil účet za 2 140 ms a e-mail odeslal za 601 ms.
    U malých Firebase požadavků nebyl rozdíl větší než běžné kolísání backendu;
    v obou případech se ověřovací obrazovka zobrazila bez čekání na e-mail.
    Omezení nebylo ověřeno jen stavem emulátoru: průměrná odezva na 8.8.8.8 se
    reálně zvýšila z 246 ms na profilu `full` na 446 ms na profilu `edge`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-1--stabilita-poloha-a-základní-chování).

- [x] **Ověřit reset hesla přes registrační e-mail.**
  - Pokrýt existující i neexistující adresu, neplatný a expirovaný odkaz,
    opakované použití odkazu a přihlášení novým heslem.
  - Zachovat neutrální odpověď, která neprozradí, zda je e-mail registrovaný.
  - [x] Na doručitelném vývojovém účtu ověřeno doručení e-mailu, změna hesla,
    přihlášení novým heslem a odmítnutí opakovaně použitého odkazu; konkrétní
    adresa zůstává pouze v ignorovaném lokálním seznamu testovacích účtů.
  - [ ] **MVP** — Samostatně ověřit přirozeně expirovaný odkaz po uplynutí jeho
    platnosti ve webovém toku obnovy hesla.
  - [ ] **MVP** — Po připojení `go.shoutout-app.eu` k produkčnímu
    projektu `shoutout-production-a1b34` přepnout jeho globální Firebase Authentication Action URL
    na připravený `/auth/action`. Handler už bezpečně obsluhuje ověření e-mailu,
    reset hesla i obnovení změněné adresy; výchozí domény projektu Firebase při
    ukládání vlastní Action URL odmítá. Prezentační projekt není cílem této změny.
- [x] **Zachovat filtr při přepínání karet.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-1--stabilita-poloha-a-základní-chování).

- [x] **Upravit časové údaje na Shoutu.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-1--stabilita-poloha-a-základní-chování).

- [x] **Normalizovat nadpis Shoutu na počáteční velké písmeno.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-1--stabilita-poloha-a-základní-chování).

### Etapa 2 – společný profil a identita autora

- [x] **Sjednotit avatarová data ve všech typech obsahu.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-2--společný-profil-a-identita-autora).

- [x] Nasadit nová Firestore Rules a jednorázově spustit
  `npm run backfill:public-profiles` pro existující účty ve vývojovém projektu.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-2--společný-profil-a-identita-autora).

- [x] **Přidat na kartu profilu datum vzniku účtu pod přezdívku.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-2--společný-profil-a-identita-autora).

### Etapa 3 – první použití, nastavení a zpětná vazba

- [x] **Přidat úvodní nápovědu po založení účtu.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-3--první-použití-nastavení-a-zpětná-vazba).

- [x] **Přidat noční režim.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-3--první-použití-nastavení-a-zpětná-vazba).

- [x] **Přepracovat dlaždici Nápověda.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-3--první-použití-nastavení-a-zpětná-vazba).

- [x] **Přesunout Nahlásit chybu přímo na kartu Profil.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-3--první-použití-nastavení-a-zpětná-vazba).

- [x] **Napojit připravené obrázky v „Nahlásit chybu“ po přechodu na placený plán.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-3--první-použití-nastavení-a-zpětná-vazba).

### Etapa 4 – životnost obsahu a business účty

- [x] **Rozhodnout pravidla životnosti Shoutu před změnou expirace.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-4--životnost-obsahu-a-business-účty).

- [ ] **Dokončit Business účet, provozovny a ruční aktivaci pro veřejný web.** **MVP**
  - Současný postup a otevřená kritéria ruční kontroly jsou v
    `docs/BUSINESS_VERIFICATION.md`; napojení na firemní registry bylo z plánu
    vyřazeno.
  - Přidat do profilu konkrétní adresu/polohu provozovny, veřejný náhled a postup
    při změně adresy; souřadnice odvozovat důvěryhodně a chránit proti podvržení.
  - Jeden účet může mít více poboček pod stejným registračním číslem. V první
    verzi neimplementovat správce ani pozvánky; účet má jedno přihlášení.
  - [x] Přidat pouze business účtům dlaždici Business se schválenými profilovými
    a monetizačními sekcemi podle `docs/BUSINESS_MONETIZATION.md`.
  - [x] Přidat klientskou správu poboček: seznam, název, adresa, pozastavení,
    bezpečné skrytí a opětovné předání změněné adresy k serverovému geocodingu.
  - Oddělit oficiální název firmy od veřejného názvu. Při vytvoření Shoutu vybrat
    pobočku a autora zobrazit jako `Veřejný název – Pobočka`.
  - Před veřejným vydáním určit a zdokumentovat přiměřená kritéria ruční
    kontroly žádosti, změn identifikačních údajů, sporů o profil a pozastavení
    účtu. Potvrzený kontaktní e-mail sám neprokazuje oprávnění jednat za firmu.
  - Zachovat důvěryhodné přidělení a odebrání Business role, stav žádosti a
    audit zásahů; klient si roli nesmí přidělit sám.
  - [x] Přidat samostatnou business registraci s údaji firmy, fakturační adresou,
    kontaktním e-mailem a žádostí ve stavu `pending_email`; klient si business
    roli nepřiděluje.
  - [x] Po povinném potvrzení e-mailu držet žadatele na samostatné stavové
    obrazovce a nepustit ho do běžného profilu, dokud důvěryhodný proces
    nevytvoří aktivní Business profil a nepřidělí roli 2.
  - [x] Přidat do registrace samostatnou povinnou část **Pobočka/provozovna** s
    veřejným názvem a adresou první provozovny. Provozovnu nikdy automaticky
    nevytvářet ze sídla ani fakturační adresy; shodné adresy jsou však povolené.
    Adresu vybrat přes našeptávač a uložit ověřené souřadnice a geohash, protože
    tato poloha určuje oblast Shoutů.
  - [x] Při důvěryhodné aktivaci business žádosti atomicky převést údaje
    první provozovny do `businessProfiles/{uid}/locations/{locationId}`; bez
    úspěšného vytvoření provozovny účet neoznačit jako aktivní.
    Administrátorské schválení používá atomický batch pro roli, profil, první
    pobočku, stav žádosti a audit. Vývojový Admin SDK nástroj používá transakci
    pro aktivaci, ale auditní záznam nevytváří a přijímá jen stav `pending_email`.
  - [x] Pro vývojové ruční scénáře přidat Admin SDK nástroj
    s dry-runem a explicitním potvrzením, který po ověření e-mailu a ruční
    kontrole atomicky vytvoří roli 2, Business profil a první pobočku.
  - [x] Přidat administrátorům a ownerovi frontu ověřených Business žádostí;
    ruční schválení atomicky vytvoří roli, profil, pobočku a audit.
  - [ ] **MVP** — Doplnit kontrolované zamítnutí a pozastavení Business žádosti
    nebo aktivního účtu, včetně bezpečných stavových přechodů v Rules, odebrání
    oprávnění, odůvodnění, auditu a odpovídajícího stavu v klientovi.
  - [x] Při zamítnutém přidání, úpravě nebo smazání pobočky zachovat obrazovku,
    zobrazit lokalizovanou chybu a diagnostikovat pouze bezpečný Firebase kód.
  - [x] Nabídnout všechny země a území podle ISO 3166 s lokalizovaným vyhledáváním;
    Česko, Německo, Polsko, Slovensko a další prioritní evropské země řadit nahoru.
  - [x] Doplnit překlady všech business obrazovek a validačních/chybových textů
    do všech sedmi jazyků aplikace (čeština, angličtina, němčina, polština,
    slovenština, ukrajinština a vietnamština); názvy zemí přebírat lokalizovaně
    z udržovaného ISO seznamu.
  - [x] Přidat aktivním Business účtům vlastní logo místo systémového avatara.
    - [x] Připravit lokální editor s posunem a zoomem, kruhovým náhledem,
      kontrolou formátu, 10MB limitem a minimálním rozlišením 512 × 512 px.
      Ukládaný výsledek je nový 512 × 512 PNG bez původních metadat a částí
      mimo výřez; všechny texty jsou dostupné v sedmi jazycích. Běžné webové
      obrázky se dekódují přímo a browserové odstranění problematických metadat
      se používá pouze jako záložní cesta. Systémový dialog souborů otevírá
      oficiální multiplatformní `file_selector` a jeho chyby nejsou skryté.
      Náhled zachovává poměr stran a kruhová vodicí zóna se ztmaveným okolím je
      vykreslená nad obrázkem. Výběr vestavěného avatara vlastní Business logo
      deaktivuje v obou profilech a jeho soubor následně odstraní ze Storage.
      Použitý výřez se nejdřív zobrazí jako rozpracovaný náhled v kartě změny
      avatara; nahraje a aktivuje se až tlačítkem **Uložit**, zatímco návrat bez
      uložení ponechá původní profil beze změny.
      Při opětovném otevření editoru je úvodním náhledem aktivní Business logo,
      nikoli dříve uložený záložní systémový avatar; ten se zobrazí až po nové
      volbě uživatele.
    - [x] V úpravě avatara zobrazit funkční tlačítko **Nahrát vlastní logo** pouze
      aktivním Business účtům. Běžné účty tuto volbu nevidí.
    - [x] Po zapnutí Firebase Storage doplnit pravidla, cestu souboru, cache
      invalidaci a bezpečné odstranění předchozí verze a tlačítku předat hotovou
      ukládací callback funkci. Výběr, editor a 512px převod už jsou zapojené.
  - [x] Přidat Business checkbox **Na více než 24 hodin**, po jehož zapnutí
    pokračuje výběr po celých dnech až na 7 dní; server dovolí delší expiraci
    pouze Business účtu.
  - [x] Implementovat schválené Business premium funkce bez platby:
    platnost až 7 dní zachovat zdarma, doplnit zvýrazněný Shout a propagační
    okénko. Nárok a použití ukládat odděleně od budoucí platby, aby pozdější
    předplatné změnilo jen serverové oprávnění, nikoli základní uživatelský tok.
  - [x] Odstranit nefunkční položku **Tokeny** a skrýt **Nákupy a
    faktury** i prázdné metriky v **Propagaci**. Sekce bezplatné propagace
    zůstane funkční; odstranit také neplatné tokenové texty z nápovědy a
    lokalizace a ověřit webové rozhraní testy. Tokenová sekce se nevrátí.
    - Implementováno 24. října 2026: nabídka má pouze profil, pobočky a
      propagaci; historie zachovává příznaky bezplatných funkcí bez prázdných
      statistik. Nápověda je upravená ve všech sedmi jazycích.
    - Ověření: 66 widgetových a lokalizačních testů, `flutter analyze` a
      `flutter build web --debug` prošly. Ruční kontrola v prohlížeči ani
      nasazení nebyly součástí této změny.
  - [ ] **Po MVP** — Po zapojení důvěryhodného serveru měřit unikátní dosah, celková
    zobrazení a rozkliknutí propagačních okének; v Business → Propagace zobrazit
    také vypočtenou míru prokliku. Vzdálenostní pásma se nesledují.

#### Navazující placená Business monetizace

Následující úkoly nejsou bránou webového MVP. Bezplatné Business funkce musí
zůstat použitelné a bezpečné; placené kroky se přidají podle
`BUSINESS_MONETIZATION.md` bez zásadní změny Business účtů.

- [ ] **Po MVP** — Schválit model předplatného: rozsah plánů, cenu, období,
  placená oprávnění, změnu a ukončení plánu, Founder zvýhodnění a případný
  větší dosah. Žádné Business tokeny ani jejich balíčky neplánovat.
- [ ] **Po MVP** — Zavést serverově řízený stav předplatného, auditovaná
  oprávnění a idempotentní změny stavu; klient si nesmí nárok přiznat sám.
- [ ] **Po MVP** — Navrhnout a zapojit důvěryhodný platební tok předplatného;
  dosavadní volbu Stripe, kartu, Apple Pay a Google Pay ověřit pro zvolený model
  a platformy. Řešit serverové potvrzení, duplicity, selhání a chargebacky;
  případný SetupIntent posoudit zvlášť.
- [ ] **Po MVP** — Dokončit DPH/VAT, měny, doklady a fakturaci na firmu,
  účetní retenci a bezpečné refundace bez zpětné změny vystavených dokladů.
- [ ] **Po MVP** — Navrhnout a dokončit správu předplatného a firemních dokladů
  v Business rozhraní; placený nárok navázat na stávající bezplatný tok
  propagace bez tokenové sekce.

### Etapa 5 – sociální vazby a oznámení

- [x] **Navrhnout a přidat Follow.**
  - [x] Přejmenovat kartu Uložené na Sledované a rozdělit ji na uložené Shouty
    a sledované profily, aniž by se měnila karta Mé Shouty.
  - [x] Otevřít profil kliknutím na autora, zobrazit aktivní Shouty a nabídnout
    sledování, zrušení sledování, blokaci a nahlášení účtu.
  - [x] Řadit lokální Shouty sledovaných účtů před ostatními a uvnitř obou skupin
    zachovat zvolené řazení; blokace současně ukončí sledování.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-5--sociální-vazby-a-oznámení).

- [ ] **Napojit Follow a uživatelské preference na oznámení.** **Po MVP**
  - Zahrnout reakce na vlastní Shout, komentáře a odpovědi, soukromé odpovědi,
    relevantní nebo zajímavé Shouty a nový obsah sledovaných profilů/oblastí.
  - Definovat, co znamená „zajímavý“, omezit četnost a umožnit každou kategorii
    samostatně vypnout; serverovou realizaci vést v části 8 níže.
  - [x] Připravit centrum oznámení uvnitř aplikace, živý seznam posledních 50,
    stav přečtení a samostatné preference pro reakce, komentáře/odpovědi,
    soukromé odpovědi, sledované profily a okolní Shouty.
  - [x] Vytvářet oznámení o like/dislike ve stejné atomické transakci jako
    reakci; pravidla ověřují příjemce, autora, Shout, typ reakce i rate limit.
  - [x] Atomicky vytvářet oznámení pro komentář na vlastním Shoutu, odpověď na
    komentář, soukromou odpověď a like/dislike komentáře. Zápis je povolen jen
    společně s ověřenou zdrojovou událostí a respektuje preference příjemce.
  - [x] Slučovat opakované události stejného typu u stejného Shoutu nebo
    komentáře, zvyšovat počet, zobrazit zkrácený nadpis a každou další událostí
    vrátit oznámení mezi nejnovější a nepřečtená.
  - [x] Kliknutím na oznámení otevřít živý detail cílového Shoutu, u komentářů
    posunout a zvýraznit konkrétní komentář; nedostupný, smazaný nebo expirovaný
    obsah nahradit srozumitelnou hláškou.
  - [ ] **Po MVP** — Přes Cloud Functions rozesílat nový Shout sledovaného profilu a později
    relevantní Shouty v okolí; tyto události mají více příjemců a klient je
    nesmí rozesílat sám.
  - [ ] **Po MVP** — Přidat FCM push mimo otevřenou aplikaci, systémová/moderátorská
    oznámení a omezení četnosti.

### Etapa 6 – gamifikace a odložené nápady

- [x] **Navrhnout karmu, achievementy a kosmetické odměny.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-6--gamifikace-a-odložené-nápady).

- [x] **Přidat minihru Shout Flight.**
  - Offline klikací hra používá megafon aplikace, který se klepnutím nadzvedne a
    roztočí; bez dalšího klepnutí rotace postupně zpomaluje.
  - Překážky tvoří tematické mrakodrapy zdola, shora nebo v páru. Skóre roste s
    časem letu a přidává bonus podle obtížnosti průletu.
  - Hra je dostupná jako poslední karta uvnitř dlaždice **Nápověda**, bez
    vysvětlujícího popisku, aby ji mohl každý objevit sám.
  - Nesmí měnit právní obsah, vyžadovat další oprávnění ani ovlivňovat karmu.
  - Hra funguje zcela offline; nejlepší skóre je uložené pouze v zařízení a bez
    globálního žebříčku. Maximum přetrvá zavření hry a překonání zobrazí
    gratulaci k novému rekordu.
  - Pohybové pozadí tvoří procedurální mraky a dvě vrstvy městské siluety s
    rozdílnou rychlostí paralaxy; nepravidelný vzor plynule navazuje a pozadí
    nevstupuje do kolizí.
  - Po výsledku vyžadovat samostatný vstup pro návrat na úvodní kartu a teprve
    další vstup pro spuštění nového pokusu.
  - [ ] **Po MVP** — Volitelně později zvážit žebříček pouze mezi sledovanými profily; před
    implementací vyřešit soukromí, ochranu výsledků a náklady Firestore.

### Vzhled a grafika

- [x] **Odstranit světlý proužek kolem ikony na ploše Androidu.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#vzhled-a-grafika).

- [x] **Sjednotit logo na přihlašovací a registrační obrazovce se záhlavím
  feedu.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#vzhled-a-grafika).

- [x] **Navrhnout nový font záhlaví karet Uloženo, Mé Shouty a Profil.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#vzhled-a-grafika).

### Profil a avatary

- [x] **Přestavět akce na kartě Profil.**
  - [x] **Upravit profil** přesunout z tlačítka v záhlaví na samostatnou dlaždici.
  - [x] **Změnit heslo** přesunout ze Systémových nastavení dovnitř obrazovky
    **Upravit profil**; zachovat stávající validaci a lokalizace.
  - [x] Dlaždice rozmisťovat po řádcích maximálně po třech. Jeden prvek je uprostřed;
    po přidání druhého se první posune doleva a nový je uprostřed; třetí obsadí
    pravou pozici. Další řádek začne znovu uprostřed stejným pravidlem.
  - [x] Rozložení odvozovat z pořadí skutečně viditelných dlaždic včetně Business a
    staff rolí, bez prázdných klikacích míst a se stabilní šířkou na mobilu i webu.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#profil-a-avatary).

- [x] **Zobrazovat avatar autora na kartách Shoutů.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#profil-a-avatary).

- [x] Doplnit avatary komentářů, soukromých odpovědí a migraci historického
  obsahu podle úkolu **Sjednotit avatarová data ve všech typech obsahu** v etapě 2.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#profil-a-avatary).

- [x] **Odstranit krátké zobrazení lišky před načtením uloženého avatara.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#profil-a-avatary).

- [x] **Vytvořit a přidat více avatarů.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#profil-a-avatary).

- [x] **Doplnit validaci a zobrazení hesel na obrazovce změny hesla.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#profil-a-avatary).

### Lokalizace

- [x] **Přidat slovenštinu, ukrajinštinu a vietnamštinu.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#lokalizace).

- [ ] **Provést kompletní audit překladů.** **MVP**
  - Najít texty zapsané přímo ve widgetech a přesunout je do lokalizace.
  - Porovnat úplnost všech klíčů pro češtinu, angličtinu, němčinu, polštinu,
    slovenštinu, ukrajinštinu a vietnamštinu.
  - Zkontrolovat přihlášení, registraci, validace, feed, detail Shoutu,
    komentáře, soukromé odpovědi, uložené položky, Mé Shouty, profil,
    nastavení, právní obrazovky, moderaci, dialogy a chybové hlášky.
  - Ověřit přetékání textů, diakritiku, množná čísla a texty na menším displeji.
  - Při testování lokalizace zachovat funkční načítání Shoutů podle polohy
    v mobilním i desktopovém prohlížeči; emulátor ověřit před mobilním vydáním.

### Business účty a webová správa

- [x] **Vytvořit business účet.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#business-účty-a-webová-správa).

- [x] **Přidat zvýrazněné Shouty.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#business-účty-a-webová-správa).

- [x] **Přidat propagační okénko.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#business-účty-a-webová-správa).

- [x] **Vytvořit webové rozhraní pro administrátory a moderátory.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#business-účty-a-webová-správa).

- [ ] **MVP** — Ověřit produkční web pro běžné i Business účty včetně přístupu
  běžného uživatele k feedu a publikování. Moderátorské trasy `/admin` dál
  vyžadují odpovídající roli v klientovi, pravidlech a testech. Dřívější plán
  omezit celý web pouze na Business a moderaci byl 20. října 2026 nahrazen
  cílem veřejné webové aplikace.

### Demo a distribuce

Budoucí postup od Windows přes Google Play a cloudový Mac až k TestFlightu a
veřejným obchodům je zapsaný v plánu
[mobilního testování a distribuce](MOBILE_DISTRIBUTION_PLAN.md) včetně nákladů,
podmínek testovacích účtů a požadavků na fyzická zařízení.

- [x] Nakonfigurovat Firebase Hosting a nasadit dočasný preview kanál `demo`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#demo-a-distribuce).

- [x] Ověřit přihlášení na preview doméně a nasadit aktuální Firestore Rules.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#demo-a-distribuce).

- [x] Hosting preview kanál `demo` používá běžný release web a skutečnou polohu
  zařízení po udělení oprávnění. Samostatný DEMO build ani pevnou polohu
  Litoměřice nezavádět; test mimo Litoměřice musí odpovídat reálnému chování.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#demo-a-distribuce).

- [x] Před veřejným sdílením mimo uzavřený test rozhodnout o omezení registrace,
  App Check enforcement, rozpočtových alertech a odstranění testovacích účtů.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#demo-a-distribuce).

- [x] Optimalizovat webové assety, zejména avatary; 24 transparentních runtime
  avatarů je odvozených v rozměru 512 × 512 px, zatímco vysoké zdroje v
  `design/` a `promo/` zůstávají beze změny pro budoucí grafickou a promo práci.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#demo-a-distribuce).

- [x] Připravit vývojovou iOS variantu bez Macu a placeného Apple účtu.
  - Ve Firebase projektu je registrované bundle ID `cz.shoutout.app.dev`; projekt
    obsahuje iOS Firebase konfiguraci, Google OAuth URL schéma, oprávnění k poloze
    a fotografiím a debug/release App Check providery.
  - Výchozí Flutter ikonu a startovní obrazovku nahradily existující značkové
    podklady ShoutOut ve všech požadovaných iOS rozměrech.
  - [ ] **Po MVP** — Na Macu sestavit nepodepsaný iOS build a odstranit případné chyby nativních
    závislostí; ve Windows tento krok nelze spolehlivě provést.
  - [ ] **Po MVP** — Přes Xcode s Apple Personal Team nainstalovat debug build na vlastní
    iPhone, zaregistrovat App Check debug token a projít hlavní uživatelské cesty.
  - [ ] **Po MVP** — Pro distribuci zaregistrovat iOS aplikaci v produkčním
    Firebase projektu aplikace, vytvořit produkční Apple identitu, podpisy a
    App Store konfiguraci; vývojovou konfiguraci nepoužít veřejně.

#### Navazující mobilní vydání

Mobilní klienti se po webovém MVP registrují ve stejném produkčním Firebase
projektu aplikace; distribuční a nákladové podrobnosti zůstávají v
`MOBILE_DISTRIBUTION_PLAN.md`.

- [ ] **Po MVP** — Připravit produkční Android/iOS Firebase aplikace, bezpečné
  build varianty a mobilní konfigurace bez přístupu k vývojovým datům.
- [ ] **Po MVP** — Dokončit podepsaný Android release, bezpečnou správu klíče,
  Play Integrity a produkční App Check; ověřit hlavní cesty na fyzickém zařízení.
- [ ] **Po MVP** — Připravit Google Play záznam, zásady ochrany dat, věkové
  hodnocení, testovací kanál a vydání Androidu pro běžné i privilegované role.
- [ ] **Po MVP** — Dokončit produkční iOS podpis, App Attest a fyzickou regresi,
  připravit TestFlight, App Store Connect a veřejné vydání iOS.

### Navazující ruční test moderace

- [ ] **MVP** — Udělit varování běžnému uživateli a ověřit záznam v historii postihů.
- [ ] **MVP** — Udělit dočasné omezení tvorby a ověřit blokaci Shoutů i komentářů.
- [ ] **MVP** — Skrýt závadný komentář a ověřit jeho stav ve vlákně.
- [ ] **MVP** — Eskalovat případ senior moderátorovi a ověřit oddělení obou front.
- [ ] **MVP** — Senior rolí ověřit 90denní a trvalý ban.
- [ ] **MVP** — Označit obsah jako v pořádku a ověřit nemožnost dalšího hlášení.
- [ ] **MVP** — Ověřit zrušení dočasného postihu a zachování neměnné auditní historie.
- [x] Upravit generátor testovací fronty tak, aby závadný demonstrační obsah
  standardně nevytvářely účty moderátora, seniora, administrátora ani ownera.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#navazující-ruční-test-moderace).


## 8. Push notifikace a centrum oznámení — Po MVP

- [x] schválený model Follow, centrum oznámení a kategorie uživatelských
  preferencí,
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#8-push-notifikace-a-centrum-oznámení--po-mvp).

- [x] oznámení uvnitř aplikace pro reakci na Shout, komentář na Shout,
  odpověď na komentář, soukromou odpověď a reakci na komentář,
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#8-push-notifikace-a-centrum-oznámení--po-mvp).

- [x] respektovat preference v `users/{uid}/settings/notifications`,
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#8-push-notifikace-a-centrum-oznámení--po-mvp).
