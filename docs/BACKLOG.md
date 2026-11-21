# Podrobná evidence úkolů ShoutOut

Aktuální priority a milníky: [TODO](TODO.md). Poslední ověřený stav: [PROJECT_STATUS](PROJECT_STATUS.md).

Tento soubor je kanonická evidence požadavků. Původních 155 úkolů
(107 hotových, 48 otevřených) zůstává zachovaných. Dne 31. října 2026 přibyl
nový požadavek na feed a 1. listopadu přístup k retenčnímu archivu v administraci;
Před změnou metrik 12. listopadu zde bylo 157 úkolů: 107 hotových a 50 otevřených.
Aktuální souhrn podle podúseků se generuje níže.
Při reorganizaci se žádný checkbox ani jeho stav nezměnil. Hotové bloky jsou zkrácené na názvy;
jejich úplné požadavky, rozhodnutí a ověření jsou v odkazovaném nezměněném archivu.
Bloky s otevřeným podúkolem zůstávají celé, včetně kontextu a již hotových podúkolů.
Serverové požadavky a podmínky dokončení jsou v [MVP_SERVER_PLAN](MVP_SERVER_PLAN.md).
Hlavní položky mají stálá ID; jejich checkboxy a souhrny generuje evidence
[progress.json](progress.json). Podúseky a pravidla jsou v [PROGRESS](PROGRESS.md).

Poslední kontrola 3. listopadu 2026 potvrzuje 107 hotových a 50 otevřených
položek. Reorganizace nemění žádný checkbox. Souhrnná serverová/životní
brána je stále otevřená: dokončený account purge v DEV nenahrazuje klientský
přechod, fyzický Shout cleanup ani podmínky veřejného vydání. [Postup údržby](DOCUMENTATION_MAINTENANCE.md).

### Prezentační web před MVP

Doména `shoutout-app.eu` je pořízená a slouží jako veřejný statický prezentační
web. Nejde o webovou verzi aplikace: neobsahuje
přihlášení, registraci, Business ani moderátorské rozhraní a nebude odkazovat do
obchodů s aplikacemi. Úplný záznam rozhodnutí, cílového Hostingu a pořadí
zprovoznění je v `operations/PRESENTATION_SITE.md`.

- [x] <a id="bl-001"></a> **Před MVP, samostatná etapa** — vytvořit oddělený produkční Firebase
  projekt pro prezentaci: `shoutout-production-a1b34`; doména není připojená k
  `shoutout-dev-46c81`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#prezentační-web-před-mvp).

- [x] <a id="bl-002"></a> **Před MVP, samostatná etapa** — připravit a nasadit statický prezentační
  obsah na Firebase Hosting v projektu `shoutout-production-a1b34`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#prezentační-web-před-mvp).

- [x] <a id="bl-003"></a> **Před MVP, samostatná etapa** — připojit `shoutout-app.eu` k Firebase
  Hosting a ověřit HTTPS.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#prezentační-web-před-mvp).

- [ ] <a id="bl-004"></a> **Před MVP, samostatná etapa** — připojit a přesměrovat
  `www.shoutout-app.eu` na hlavní doménu.

Tyto položky se nezapočítávají do procent MVP: neaktivují veřejnou aplikaci ani
nenahrazují produkční, bezpečnostní a distribuční bránu MVP.


## Nové podněty z uživatelského testování

<a id="feed-read-refresh"></a>

- [ ] <a id="bl-005"></a> **Navrhnout a po schválení zavést přečtení Shoutů, stabilní feed a refresh s počtem novinek.**
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
  - Upřesnění 12. listopadu: připravit společný kontrakt nyní, implementovat
    B2 → B3 → B4 před MVP. V B4 porovnat verze bloků a omezené manifesty ID/verzí
    před čtením celých těl; přenášet potřebné změny, znovu používat ověřenou
    cache a bezpečně vyřadit nedostupné položky. Čítače nevyvolávají přenos
    celého textu. [Kontrakt a akceptace](plans/feed/FEED_DELTA_REFRESH_PLAN.md).
  - Číslovku novinek řešit úspornými změnovými signály/slučováním a ověřit
    náklady v klidné i rušné oblasti; sekundový polling není zvolený výchozí
    postup. Konkrétní čerstvost, mechanismus a případná trvalá cache ještě
    vyžadují rozhodnutí před příslušnou implementací.
  - Integrační kontrola 7. listopadu: uložené Shouty mají připravený samostatný
    zdroj stránek. Před MVP ověřit také **Mé shouty → Aktivní/Expirované**:
    dosavadní Home bere pouze posledních 50 globálních `status=active`, což
    nezaručuje úplný vlastní seznam a vyřazuje serverem označené expirované.
    Omezení existovalo už před touto integrací; nezaměňovat je za hotovou
    osobní historii. [Aktuální integrační plán](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md).
  - [Etapový návrh a schvalovací brány](plans/feed/FEED_IMPLEMENTATION_STAGES.md).
    [Analýza, otevřené volby a akceptace cílového rozšíření](plans/feed/FEED_READ_REFRESH_PLAN.md).
    [Úplné nezměněné zadání](requests/FEED_READ_REFRESH_2026-10-31.md).
  - A0/A1 hotové ([měření](plans/feed/FEED_A1_RESULTS.md)); [progresivní jádro](plans/feed/FEED_PROGRESSIVE_PLAN.md),
    [sdílený index](plans/feed/FEED_BLOCK_INDEX_PLAN.md), API a klient jsou v DEV
    zapojené od 7. listopadu. Tehdy zbývaly regrese A2/A3, úplné vlastní Shouty
    a úklid fixture; nyní jsou uzavřené včetně B1 a regrese Uložených.
    B2 má lokální jádro a kapacitní testy, živé B2–B4 ještě nejsou hotové,
    celý úkol zůstává otevřený. R2 schválené (poslední bod otevřené aplikace).
    [Aktuální stav](PROJECT_STATUS.md), [důkazy integrace](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#dev-rollout-results).
    Osobní přečtení není veřejnou statistikou zobrazení; ta zůstává po MVP.

- [x] <a id="bl-006"></a> **Navrhnout sdílenou profilovou vizitku.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [ ] <a id="bl-007"></a> **Rozhodnout o případném větším dosahu v rámci předplatného.** **Po MVP**
  - Běžný Business Shout zachová standardní místní dosah. Zda předplatné
    nabídne větší poloměr, není rozhodnuto; samostatné dokupování za tokeny
    bylo zrušeno.
  - Před případnou implementací určit geografické limity, dobu platnosti,
    serverové oprávnění a ochranu proti překryvu či zneužití oblastí.
- [x] <a id="bl-008"></a> **Prověřit API pro události v okolí.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] <a id="bl-009"></a> **Opravit tlačítko „Zrušit registraci a začít znovu“.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [ ] <a id="bl-010"></a> **Prověřit nedoručený ověřovací e-mail na Email.cz.** **MVP**
  - Google/Gmail při testu fungoval, ale zpráva na Email.cz nedorazila; rozlišit
    chybu odeslání, zpoždění, spam a odmítnutí či reputaci odesílací domény.
  - Doplnit srozumitelný stav, opakované odeslání a diagnostiku bez ukládání
    plné e-mailové adresy do technických logů.
  - [x] <a id="bl-011"></a> Klient nabízí opakované odeslání, po úspěchu ponechá na obrazovce viditelný
    stav a při chybě diagnostikuje pouze bezpečný Firebase kód bez adresy a odkazu.
  - [ ] <a id="bl-012"></a> **MVP** — Doručitelnost na Email.cz ověřit mimo klienta podle Firebase/Auth provozu,
    spamu a případného odmítnutí příjemcem; bez poštovních logů ji nelze potvrdit.
- [ ] <a id="bl-013"></a> **Přidat postupné ověření telefonního čísla přes Firebase Phone Auth.** **Po MVP**
  - Telefon nevyžadovat při založení účtu. Vyžádat jej až při první chráněné
    akci a po úspěšném ověření stav bezpečně svázat s účtem.
  - Bez SMS ověření povolit prohlížení feedu, otevření Shoutu a komentářů,
    vyhledávání nebo změnu lokality podle pravidel aplikace a sledování účtu.
  - SMS ověření vyžadovat pro like/dislike či jinou reakci, komentář, vytvoření
    Shoutu, hlasování v anketě a soukromou odpověď autorovi Shoutu.
  - Před zapnutím vyřešit podporované země, kvóty a náklady, ochranu proti
    zneužití SMS, změnu či ztrátu čísla, obnovu účtu a minimalizaci osobních dat.

- [x] <a id="bl-014"></a> **Nahradit původní kategorie Shoutů novou sadou.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] <a id="bl-015"></a> **Umožnit otevřít veřejný profil autora z komentáře.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] <a id="bl-016"></a> **Přidat veřejné flairy rolí.**
  - [x] <a id="bl-017"></a> Doplnit klientské zobrazení flairů na Shoutech, komentářích, soukromých
    odpovědích, veřejném profilu a seznamu sledovaných profilů včetně lokalizace
    `Moderátor` a mapování `seniorModerator` na stejný veřejný štítek.
  - [x] <a id="bl-018"></a> Nasadit upravená Firestore Rules a důvěryhodně doplnit `publicRole` do
    existujících veřejných profilů skriptem `npm run backfill:public-profiles`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [ ] <a id="bl-019"></a> **Přepracovat onboarding na interaktivní tutorial.** **Po MVP** *(Rozpracováno, automatické spuštění je dočasně deaktivované.)*
  - Nahradit dlouhé úvodní rady krátkými kontextovými kroky typu „klikni sem“,
    „udělej toto“ a „pokračuj tady“ přímo nad skutečným rozhraním.
  - Umožnit přeskočení, pozdější opakování a pokračování po přerušení; měřit
    dokončení kroků bez ukládání přesné polohy.
  - První průchod vede uživatele přes skutečný výběr kategorie, otevření a zavření
    detailu Shoutu, otevření formuláře a profilu. Postup je uložený u účtu;
    dokončení nebo potvrzené přeskočení automatické spuštění trvale vypne.
- [ ] <a id="bl-020"></a> **Doplnit uživatelskou zpětnou vazbu a metriky obsahu.** **Po MVP**
  - Navrhnout důvěryhodné počítání zobrazení Shoutu a zobrazit autorovi počet
    zobrazení, uložení a dalších relevantních interakcí.
  - Vyřešit unikátní versus celková zobrazení, ochranu proti farmení, soukromí,
    retenci a serverové počítání před použitím metrik pro karmu.
- [x] <a id="bl-021"></a> **Provést cílenou kontrolu překladů hlášení chyb a průvodce aplikací.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] <a id="bl-022"></a> **Opravit ciferník platnosti v dialogu Nový Shout.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] <a id="bl-023"></a> **Přepracovat rozložení společné Shout karty.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] <a id="bl-024"></a> **Navrhnout zásady karmy, achievementů a kosmetických odměn.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [ ] <a id="bl-025"></a> **Rozhodnout, zda vůbec zavést kosmetické coiny nebo obchod.** **Po MVP**
  - Pokud vzniknou, nesmějí být Business tokeny ani prostředkem k získání
    předplatného, dosahu, moderátorských pravomocí nebo jiné funkční výhody.
- [ ] <a id="bl-026"></a> **Omezit Business promo na nejvýše dva současně aktivní Shouty na firmu.** **MVP**
  - Limit vynucovat serverově napříč všemi pobočkami a typy propagace; určit,
    zda kombinované zvýraznění s okénkem spotřebuje jeden aktivní promo slot.
- [ ] <a id="bl-027"></a> **Navrhnout Founder balíček pro nové podniky.** **Po MVP**
  - Founder entitlement vést odděleně od veřejné role a flairu; oprávněný účet
    může mít zvláštní zvýhodnění vůči budoucímu předplatnému, jehož podobu je
    teprve nutné rozhodnout.
  - Určit podmínky přidělení a odebrání, rozsah zvýhodnění, audit a ochranu
    proti duplicitním firmám a zneužití. Business tokeny se nezavádějí;
    případné kosmetické coiny jsou oddělené produktové rozhodnutí.
- [x] <a id="bl-028"></a> **Zvýrazněné Business Shouty a propagační okénko jsou implementované.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

- [x] <a id="bl-029"></a> **Naplánovat pořízení evropské ochranné známky ShoutOut.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#nové-podněty-z-uživatelského-testování).

Interní pravidla rolí, pravomocí a postihů jsou vedena v
`docs/reference/INTERNAL_MODERATION.md`. Změny moderace musí aktualizovat také tento
dokument, pravidla, testy a případně veřejné právní texty.

## Stav dokončení backlogu

Aktuální počet zahrnuje nové zadání feedu a správu retenčního archivu.

<!-- progress:backlog:start -->
`████████████████████████████░░░░░░░░░░░░` **70,22 %** — vážené dokončení podúseků

Hotové úseky: **187/295**. Celé položky: **107/157**; rozpracované: 7.
<!-- progress:backlog:end -->

Každá původní hlavní položka má stejnou pevnou váhu; podúseky ji rozdělují.
Samotné přidání podúseku není dokončená práce. [Metodika a důkazy](PROGRESS.md).

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

- [x] <a id="bl-030"></a> Geohash nových shoutů a model `geography`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#geografie-a-globální-moderace).

- [x] <a id="bl-031"></a> Google reverse-geocoding trigger s tajným serverovým API klíčem.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#geografie-a-globální-moderace).

- [x] <a id="bl-032"></a> ISO země/oblasti, moderátorské rozsahy, webový filtr a kontrola postihu.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#geografie-a-globální-moderace).

- [x] <a id="bl-033"></a> Migrační nástroj pro existující shouty.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#geografie-a-globální-moderace).

- Lokálně byly 25. října odstraněné opakované GETy interakcí, restartování
  stejných streamů a duplicitní načítání historie/detailů; viz
  `docs/operations/READ_COST_AUDIT.md`. Tato optimalizace není dokončením cloudových
  nákladových pojistek ani serverového prostorového feedu. Vývojový build byl
  25. října nasazený na Hosting `shoutout-dev-46c81` a prošel základním
  průchodem v přihlášené relaci.
- [ ] <a id="bl-034"></a> **MVP** — Před prvním nasazením Functions nastavit a prakticky otestovat
  nákladové pojistky podle `docs/operations/COST_SAFETY.md`: servisní kvóty, Functions
  spend cap, rozpočtová upozornění, Pub/Sub nouzovou reakci a odpovědnou osobu.
  Po splnění pokračovat oddělenými kontrolovanými kroky: nasadit
  `enrichShoutGeography`, provést dávkový geografický backfill, aktivovat po
  cenové kontrole TTL a poté implementovat serverovou expiraci Shoutů a mazání
  účtů. Přesná výstupní kritéria jsou v `docs/operations/COST_SAFETY.md`.
- [ ] <a id="bl-035"></a> **MVP** — Zapnout Geocoding API, nastavit `GOOGLE_MAPS_API_KEY` jako Functions secret
  a nasadit Functions, pravidla a indexy.
- [ ] <a id="bl-036"></a> **MVP** — Spustit backfill a zkontrolovat země, kde Google neposkytne ISO 3166-2;
  případné mapování udržovat v serverové vrstvě.
- [x] <a id="bl-037"></a> Po migraci rolí odstranit výjimku pro staré role bez `moderationScope`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#geografie-a-globální-moderace).

Toto je podrobná checkboxová evidence. Priority jsou v TODO.md a serverové
požadavky v MVP_SERVER_PLAN.md. Samotné zapsání bodu neznamená implementaci.

## Brána před veřejným spuštěním

- [ ] <a id="bl-038"></a> **MVP** — Splnit webovou předstartovní bránu v `docs/LAUNCH_READINESS.md`.
  Tento dokument sdružuje produkční, bezpečnostní, právní, testovací a provozní
  předpoklady veřejné aplikace. Mobilní distribuce a placená monetizace jsou
  samostatné navazující etapy; jednotlivé úkoly zůstávají v tomto backlogu.
  Provozní akceptace zahrnuje schválený cíl 100 000 registrovaných účtů
  a 5 000 současně aktivních uživatelů;
  [profil akcí a ověření této zátěže](LAUNCH_READINESS.md#capacity-target)
  se musí určit zvlášť. Kapacita zatím není prokázaná.
- [ ] <a id="bl-039"></a> **Po MVP** — Marketingový pilot zahájit až po splnění startovní brány a dále jej řídit
  samostatným plánem `docs/local/ShoutOut_marketingovy_plan_spusteni.docx`.

## Aktuální produktové úpravy

Otevřené produktové úkoly řešit v pořadí následujících etap. Pořadí drží
diagnostiku a společný datový základ před obrazovkami, které na nich závisejí;
odložené nápady až za hlavními uživatelskými cestami.

### Etapa 1 – stabilita, poloha a základní chování

- [x] <a id="bl-040"></a> **Zjistit, proč mimo Litoměřice nešlo vytvořit Shout.**
  - Reprodukovat na fyzickém zařízení i emulátoru s polohou uvnitř a mimo
    Litoměřice a rozlišit oprávnění, nedostupnou/nepřesnou polohu, validaci
    geohashe, rate limit a zamítnutí Firestore Rules.
  - Zobrazit uživateli konkrétní a lokalizovanou příčinu místo obecné chyby.
  - Zachovat skutečnou polohu zařízení také na Hosting preview kanálu; pevnou
    demo polohu nezavádět.
  - [x] <a id="bl-041"></a> Automaticky ověřit geohash a veřejné zaokrouhlení pro Litoměřice,
    Lovosice, Ústí nad Labem, Prahu, Bratislavu, Varšavu, Berlín a Řím včetně
    světových hranic a odmítnutí neplatných souřadnic.
  - [x] <a id="bl-042"></a> Doplnit testy pravidel pro běžný účet mimo Litoměřice, výběr pobočky
    odlišné od sídla a odmítnutí pozastavené, smazané nebo neověřené pobočky.
  - [ ] <a id="bl-043"></a> **Po MVP** — Dokončit ruční kontrolu na fyzickém zařízení s běžným účtem mimo
    Litoměřice; dosavadní opakované pokusy uživateli procházejí.
  - [ ] <a id="bl-044"></a> **MVP** — Ověřit polohu a publikování běžným účtem mimo Litoměřice v
    mobilním i desktopovém prohlížeči.
  - V kódu ani pravidlech není omezení na Litoměřice. Automatické testy potvrzují
    publikaci z více českých i zahraničních míst a uživatelské pokusy procházejí.
    Mobilní a desktopový prohlížeč jsou předstartovní kontrola webového MVP;
    fyzické zařízení je krok pozdějšího mobilního vydání.
- [x] <a id="bl-045"></a> **Dokončit interní evidenci technických chyb.**
  - Ukládat bezpečný diagnostický záznam neúspěšné akce, důvod zamítnutí,
    čas, verzi aplikace a nezbytný technický kontext bez hesel, tokenů a
    nadbytečných osobních údajů.
  - Přístup k technickým chybám mají pouze administrátor a owner (role 5–6).
    Moderátor ani senior moderátor je nevidí; jejich úkolem je řešit chování
    uživatelů a nahlášený obsah, nikoli provoz aplikace.
  - Doplnit retenci, stránkování, filtrování, audit přístupu a upravit Firestore
    Rules tak, aby kolekci nebylo možné číst rolím 1–4.
  - [x] <a id="bl-046"></a> Omezit čtení ve Firestore Rules na role 5–6 a zobrazit posledních
    50 záznamů v systémovém dohledu administrátora a ownera.
  - [x] <a id="bl-047"></a> Doplnit stránkování po 25, filtrování načtených záznamů, přesný čas,
    neměnný audit otevření a 60denní hranici čtení.
  - [ ] <a id="bl-048"></a> **MVP** — Blaze je aktivní; před nasazením připravené Firestore TTL konfigurace
    pro fyzické odstranění `clientErrorLogs` a `technicalLogAccessAudits` změřit
    objem a schválit účtovaná TTL mazání podle `docs/operations/COST_SAFETY.md`. Do té doby
    jsou starší záznamy bezpečně nečitelné.
- [x] <a id="bl-049"></a> **Umožnit moderátorským a vyšším rolím nastavit polohu pro náhled území.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-1--stabilita-poloha-a-základní-chování).

- [x] <a id="bl-050"></a> **Změřit a zkrátit dlouhé načítání při registraci.**
  - [x] <a id="bl-051"></a> Měřit samostatně vytvoření účtu, odeslání a kontrolu ověřovacího e-mailu,
    obnovení ID tokenu a u business účtu také zápis žádosti.
  - [x] <a id="bl-052"></a> Zobrazovat aktuální krok registrace a u business účtu po vytvoření účtu
    souběžně uložit žádost a odeslat ověřovací e-mail.
  - [x] <a id="bl-053"></a> U neaktivní Business žádosti zobrazit známý stav bez čekání na roli a
    Business profil a pro onboarding znovu použít již načtená data profilu.
  - [x] <a id="bl-054"></a> Odeslání prvního ověřovacího e-mailu spouštět po vytvoření účtu na pozadí,
    aby neblokovalo přechod na ověřovací obrazovku; opakované odeslání zůstává
    dostupné. Debug měření propojuje vytvoření účtu, ověření, profil a první
    obrazovku bez ukládání UID, e-mailu nebo jiných osobních údajů.
  - [x] <a id="bl-055"></a> Porovnat naměřené časy na rychlém a omezeném mobilním připojení.
    Android Emulator API 35: profil `full` bez latence vytvořil účet za 2 424 ms
    a odeslal ověřovací e-mail na pozadí za 496 ms; profil `edge` (473,6 kbit/s,
    latence 80–400 ms) vytvořil účet za 2 140 ms a e-mail odeslal za 601 ms.
    U malých Firebase požadavků nebyl rozdíl větší než běžné kolísání backendu;
    v obou případech se ověřovací obrazovka zobrazila bez čekání na e-mail.
    Omezení nebylo ověřeno jen stavem emulátoru: průměrná odezva na 8.8.8.8 se
    reálně zvýšila z 246 ms na profilu `full` na 446 ms na profilu `edge`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-1--stabilita-poloha-a-základní-chování).

- [x] <a id="bl-056"></a> **Ověřit reset hesla přes registrační e-mail.**
  - Pokrýt existující i neexistující adresu, neplatný a expirovaný odkaz,
    opakované použití odkazu a přihlášení novým heslem.
  - Zachovat neutrální odpověď, která neprozradí, zda je e-mail registrovaný.
  - [x] <a id="bl-057"></a> Na doručitelném vývojovém účtu ověřeno doručení e-mailu, změna hesla,
    přihlášení novým heslem a odmítnutí opakovaně použitého odkazu; konkrétní
    adresa zůstává pouze v ignorovaném lokálním seznamu testovacích účtů.
  - [ ] <a id="bl-058"></a> **MVP** — Samostatně ověřit přirozeně expirovaný odkaz po uplynutí jeho
    platnosti ve webovém toku obnovy hesla.
  - [ ] <a id="bl-059"></a> **MVP** — Po připojení `go.shoutout-app.eu` k produkčnímu
    projektu `shoutout-production-a1b34` přepnout jeho globální Firebase Authentication Action URL
    na připravený `/auth/action`. Handler už bezpečně obsluhuje ověření e-mailu,
    reset hesla i obnovení změněné adresy; výchozí domény projektu Firebase při
    ukládání vlastní Action URL odmítá. Prezentační projekt není cílem této změny.
- [x] <a id="bl-060"></a> **Zachovat filtr při přepínání karet.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-1--stabilita-poloha-a-základní-chování).

- [x] <a id="bl-061"></a> **Upravit časové údaje na Shoutu.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-1--stabilita-poloha-a-základní-chování).

- [x] <a id="bl-062"></a> **Normalizovat nadpis Shoutu na počáteční velké písmeno.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-1--stabilita-poloha-a-základní-chování).

### Etapa 2 – společný profil a identita autora

- [x] <a id="bl-063"></a> **Sjednotit avatarová data ve všech typech obsahu.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-2--společný-profil-a-identita-autora).

- [x] <a id="bl-064"></a> Nasadit nová Firestore Rules a jednorázově spustit
  `npm run backfill:public-profiles` pro existující účty ve vývojovém projektu.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-2--společný-profil-a-identita-autora).

- [x] <a id="bl-065"></a> **Přidat na kartu profilu datum vzniku účtu pod přezdívku.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-2--společný-profil-a-identita-autora).

### Etapa 3 – první použití, nastavení a zpětná vazba

- [x] <a id="bl-066"></a> **Přidat úvodní nápovědu po založení účtu.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-3--první-použití-nastavení-a-zpětná-vazba).

- [x] <a id="bl-067"></a> **Přidat noční režim.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-3--první-použití-nastavení-a-zpětná-vazba).

- [x] <a id="bl-068"></a> **Přepracovat dlaždici Nápověda.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-3--první-použití-nastavení-a-zpětná-vazba).

- [x] <a id="bl-069"></a> **Přesunout Nahlásit chybu přímo na kartu Profil.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-3--první-použití-nastavení-a-zpětná-vazba).

- [x] <a id="bl-070"></a> **Napojit připravené obrázky v „Nahlásit chybu“ po přechodu na placený plán.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-3--první-použití-nastavení-a-zpětná-vazba).

### Etapa 4 – životnost obsahu a business účty

- [x] <a id="bl-071"></a> **Rozhodnout pravidla životnosti Shoutu před změnou expirace.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-4--životnost-obsahu-a-business-účty).
  - Upřesnění schválené 10. listopadu: po expiraci běžné interakce jen ke čtení,
    včetně palců komentářů a přidání/odebrání uložení; vlastní mazání, moderace
    a účtový úklid zůstávají možné a mohou změnit počty. [Realizace a důkazy](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#expired-interactions).

- [ ] <a id="bl-072"></a> **Dokončit Business účet, provozovny a ruční aktivaci pro veřejný web.** **MVP**
  - Současný postup a otevřená kritéria ruční kontroly jsou v
    `docs/reference/BUSINESS_VERIFICATION.md`; napojení na firemní registry bylo z plánu
    vyřazeno.
  - Přidat do profilu konkrétní adresu/polohu provozovny, veřejný náhled a postup
    při změně adresy; souřadnice odvozovat důvěryhodně a chránit proti podvržení.
  - Jeden účet může mít více poboček pod stejným registračním číslem. V první
    verzi neimplementovat správce ani pozvánky; účet má jedno přihlášení.
  - [x] <a id="bl-073"></a> Přidat pouze business účtům dlaždici Business se schválenými profilovými
    a monetizačními sekcemi podle `docs/plans/roadmap/BUSINESS_MONETIZATION.md`.
  - [x] <a id="bl-074"></a> Přidat klientskou správu poboček: seznam, název, adresa, pozastavení,
    bezpečné skrytí a opětovné předání změněné adresy k serverovému geocodingu.
  - Oddělit oficiální název firmy od veřejného názvu. Při vytvoření Shoutu vybrat
    pobočku a autora zobrazit jako `Veřejný název – Pobočka`.
  - Před veřejným vydáním určit a zdokumentovat přiměřená kritéria ruční
    kontroly žádosti, změn identifikačních údajů, sporů o profil a pozastavení
    účtu. Potvrzený kontaktní e-mail sám neprokazuje oprávnění jednat za firmu.
  - Zachovat důvěryhodné přidělení a odebrání Business role, stav žádosti a
    audit zásahů; klient si roli nesmí přidělit sám.
  - [x] <a id="bl-075"></a> Přidat samostatnou business registraci s údaji firmy, fakturační adresou,
    kontaktním e-mailem a žádostí ve stavu `pending_email`; klient si business
    roli nepřiděluje.
  - [x] <a id="bl-076"></a> Po povinném potvrzení e-mailu držet žadatele na samostatné stavové
    obrazovce a nepustit ho do běžného profilu, dokud důvěryhodný proces
    nevytvoří aktivní Business profil a nepřidělí roli 2.
  - [x] <a id="bl-077"></a> Přidat do registrace samostatnou povinnou část **Pobočka/provozovna** s
    veřejným názvem a adresou první provozovny. Provozovnu nikdy automaticky
    nevytvářet ze sídla ani fakturační adresy; shodné adresy jsou však povolené.
    Adresu vybrat přes našeptávač a uložit ověřené souřadnice a geohash, protože
    tato poloha určuje oblast Shoutů.
  - [x] <a id="bl-078"></a> Při důvěryhodné aktivaci business žádosti atomicky převést údaje
    první provozovny do `businessProfiles/{uid}/locations/{locationId}`; bez
    úspěšného vytvoření provozovny účet neoznačit jako aktivní.
    Administrátorské schválení používá atomický batch pro roli, profil, první
    pobočku, stav žádosti a audit. Vývojový Admin SDK nástroj používá transakci
    pro aktivaci, ale auditní záznam nevytváří a přijímá jen stav `pending_email`.
  - [x] <a id="bl-079"></a> Pro vývojové ruční scénáře přidat Admin SDK nástroj
    s dry-runem a explicitním potvrzením, který po ověření e-mailu a ruční
    kontrole atomicky vytvoří roli 2, Business profil a první pobočku.
  - [x] <a id="bl-080"></a> Přidat administrátorům a ownerovi frontu ověřených Business žádostí;
    ruční schválení atomicky vytvoří roli, profil, pobočku a audit.
  - [ ] <a id="bl-081"></a> **MVP** — Doplnit kontrolované zamítnutí a pozastavení Business žádosti
    nebo aktivního účtu, včetně bezpečných stavových přechodů v Rules, odebrání
    oprávnění, odůvodnění, auditu a odpovídajícího stavu v klientovi.
  - [x] <a id="bl-082"></a> Při zamítnutém přidání, úpravě nebo smazání pobočky zachovat obrazovku,
    zobrazit lokalizovanou chybu a diagnostikovat pouze bezpečný Firebase kód.
  - [x] <a id="bl-083"></a> Nabídnout všechny země a území podle ISO 3166 s lokalizovaným vyhledáváním;
    Česko, Německo, Polsko, Slovensko a další prioritní evropské země řadit nahoru.
  - [x] <a id="bl-084"></a> Doplnit překlady všech business obrazovek a validačních/chybových textů
    do všech sedmi jazyků aplikace (čeština, angličtina, němčina, polština,
    slovenština, ukrajinština a vietnamština); názvy zemí přebírat lokalizovaně
    z udržovaného ISO seznamu.
  - [x] <a id="bl-085"></a> Přidat aktivním Business účtům vlastní logo místo systémového avatara.
    - [x] <a id="bl-086"></a> Připravit lokální editor s posunem a zoomem, kruhovým náhledem,
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
    - [x] <a id="bl-087"></a> V úpravě avatara zobrazit funkční tlačítko **Nahrát vlastní logo** pouze
      aktivním Business účtům. Běžné účty tuto volbu nevidí.
    - [x] <a id="bl-088"></a> Po zapnutí Firebase Storage doplnit pravidla, cestu souboru, cache
      invalidaci a bezpečné odstranění předchozí verze a tlačítku předat hotovou
      ukládací callback funkci. Výběr, editor a 512px převod už jsou zapojené.
  - [x] <a id="bl-089"></a> Přidat Business checkbox **Na více než 24 hodin**, po jehož zapnutí
    pokračuje výběr po celých dnech až na 7 dní; server dovolí delší expiraci
    pouze Business účtu.
  - [x] <a id="bl-090"></a> Implementovat schválené Business premium funkce bez platby:
    platnost až 7 dní zachovat zdarma, doplnit zvýrazněný Shout a propagační
    okénko. Nárok a použití ukládat odděleně od budoucí platby, aby pozdější
    předplatné změnilo jen serverové oprávnění, nikoli základní uživatelský tok.
  - [x] <a id="bl-091"></a> Odstranit nefunkční položku **Tokeny** a skrýt **Nákupy a
    faktury** i prázdné metriky v **Propagaci**. Sekce bezplatné propagace
    zůstane funkční; odstranit také neplatné tokenové texty z nápovědy a
    lokalizace a ověřit webové rozhraní testy. Tokenová sekce se nevrátí.
    - Implementováno 24. října 2026: nabídka má pouze profil, pobočky a
      propagaci; historie zachovává příznaky bezplatných funkcí bez prázdných
      statistik. Nápověda je upravená ve všech sedmi jazycích.
    - Ověření: 66 widgetových a lokalizačních testů, `flutter analyze` a
      `flutter build web --debug` prošly. Ruční kontrola v prohlížeči ani
      nasazení nebyly součástí této změny.
  - [ ] <a id="bl-092"></a> **Po MVP** — Po zapojení důvěryhodného serveru měřit unikátní dosah, celková
    zobrazení a rozkliknutí propagačních okének; v Business → Propagace zobrazit
    také vypočtenou míru prokliku. Vzdálenostní pásma se nesledují.

#### Navazující placená Business monetizace

Následující úkoly nejsou bránou webového MVP. Bezplatné Business funkce musí
zůstat použitelné a bezpečné; placené kroky se přidají podle
`plans/roadmap/BUSINESS_MONETIZATION.md` bez zásadní změny Business účtů.

- [ ] <a id="bl-093"></a> **Po MVP** — Schválit model předplatného: rozsah plánů, cenu, období,
  placená oprávnění, změnu a ukončení plánu, Founder zvýhodnění a případný
  větší dosah. Žádné Business tokeny ani jejich balíčky neplánovat.
- [ ] <a id="bl-094"></a> **Po MVP** — Zavést serverově řízený stav předplatného, auditovaná
  oprávnění a idempotentní změny stavu; klient si nesmí nárok přiznat sám.
- [ ] <a id="bl-095"></a> **Po MVP** — Navrhnout a zapojit důvěryhodný platební tok předplatného;
  dosavadní volbu Stripe, kartu, Apple Pay a Google Pay ověřit pro zvolený model
  a platformy. Řešit serverové potvrzení, duplicity, selhání a chargebacky;
  případný SetupIntent posoudit zvlášť.
- [ ] <a id="bl-096"></a> **Po MVP** — Dokončit DPH/VAT, měny, doklady a fakturaci na firmu,
  účetní retenci a bezpečné refundace bez zpětné změny vystavených dokladů.
- [ ] <a id="bl-097"></a> **Po MVP** — Navrhnout a dokončit správu předplatného a firemních dokladů
  v Business rozhraní; placený nárok navázat na stávající bezplatný tok
  propagace bez tokenové sekce.

### Etapa 5 – sociální vazby a oznámení

- [x] <a id="bl-098"></a> **Navrhnout a přidat Follow.**
  - [x] <a id="bl-099"></a> Přejmenovat kartu Uložené na Sledované a rozdělit ji na uložené Shouty
    a sledované profily, aniž by se měnila karta Mé Shouty.
  - [x] <a id="bl-100"></a> Otevřít profil kliknutím na autora, zobrazit aktivní Shouty a nabídnout
    sledování, zrušení sledování, blokaci a nahlášení účtu.
  - [x] <a id="bl-101"></a> Řadit lokální Shouty sledovaných účtů před ostatními a uvnitř obou skupin
    zachovat zvolené řazení; blokace současně ukončí sledování.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-5--sociální-vazby-a-oznámení).

- [ ] <a id="bl-102"></a> **Napojit Follow a uživatelské preference na oznámení.** **Po MVP**
  - Zahrnout reakce na vlastní Shout, komentáře a odpovědi, soukromé odpovědi,
    relevantní nebo zajímavé Shouty a nový obsah sledovaných profilů/oblastí.
  - Definovat, co znamená „zajímavý“, omezit četnost a umožnit každou kategorii
    samostatně vypnout; serverovou realizaci vést v části 8 níže.
  - [x] <a id="bl-103"></a> Připravit centrum oznámení uvnitř aplikace, živý seznam posledních 50,
    stav přečtení a samostatné preference pro reakce, komentáře/odpovědi,
    soukromé odpovědi, sledované profily a okolní Shouty.
  - [x] <a id="bl-104"></a> Vytvářet oznámení o like/dislike ve stejné atomické transakci jako
    reakci; pravidla ověřují příjemce, autora, Shout, typ reakce i rate limit.
  - [x] <a id="bl-105"></a> Atomicky vytvářet oznámení pro komentář na vlastním Shoutu, odpověď na
    komentář, soukromou odpověď a like/dislike komentáře. Zápis je povolen jen
    společně s ověřenou zdrojovou událostí a respektuje preference příjemce.
  - [x] <a id="bl-106"></a> Slučovat opakované události stejného typu u stejného Shoutu nebo
    komentáře, zvyšovat počet, zobrazit zkrácený nadpis a každou další událostí
    vrátit oznámení mezi nejnovější a nepřečtená.
  - [x] <a id="bl-107"></a> Kliknutím na oznámení otevřít živý detail cílového Shoutu, u komentářů
    posunout a zvýraznit konkrétní komentář; nedostupný, smazaný nebo expirovaný
    obsah nahradit srozumitelnou hláškou.
  - [ ] <a id="bl-108"></a> **Po MVP** — Přes Cloud Functions rozesílat nový Shout sledovaného profilu a později
    relevantní Shouty v okolí; tyto události mají více příjemců a klient je
    nesmí rozesílat sám.
  - [ ] <a id="bl-109"></a> **Po MVP** — Přidat FCM push mimo otevřenou aplikaci, systémová/moderátorská
    oznámení a omezení četnosti.

### Etapa 6 – gamifikace a odložené nápady

- [x] <a id="bl-110"></a> **Navrhnout karmu, achievementy a kosmetické odměny.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#etapa-6--gamifikace-a-odložené-nápady).

- [x] <a id="bl-111"></a> **Přidat minihru Shout Flight.**
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
  - [ ] <a id="bl-112"></a> **Po MVP** — Volitelně později zvážit žebříček pouze mezi sledovanými profily; před
    implementací vyřešit soukromí, ochranu výsledků a náklady Firestore.

### Vzhled a grafika

- [x] <a id="bl-113"></a> **Odstranit světlý proužek kolem ikony na ploše Androidu.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#vzhled-a-grafika).

- [x] <a id="bl-114"></a> **Sjednotit logo na přihlašovací a registrační obrazovce se záhlavím
  feedu.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#vzhled-a-grafika).

- [x] <a id="bl-115"></a> **Navrhnout nový font záhlaví karet Uloženo, Mé Shouty a Profil.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#vzhled-a-grafika).

### Profil a avatary

- [x] <a id="bl-116"></a> **Přestavět akce na kartě Profil.**
  - [x] <a id="bl-117"></a> **Upravit profil** přesunout z tlačítka v záhlaví na samostatnou dlaždici.
  - [x] <a id="bl-118"></a> **Změnit heslo** přesunout ze Systémových nastavení dovnitř obrazovky
    **Upravit profil**; zachovat stávající validaci a lokalizace.
  - [x] <a id="bl-119"></a> Dlaždice rozmisťovat po řádcích maximálně po třech. Jeden prvek je uprostřed;
    po přidání druhého se první posune doleva a nový je uprostřed; třetí obsadí
    pravou pozici. Další řádek začne znovu uprostřed stejným pravidlem.
  - [x] <a id="bl-120"></a> Rozložení odvozovat z pořadí skutečně viditelných dlaždic včetně Business a
    staff rolí, bez prázdných klikacích míst a se stabilní šířkou na mobilu i webu.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#profil-a-avatary).

- [x] <a id="bl-121"></a> **Zobrazovat avatar autora na kartách Shoutů.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#profil-a-avatary).

- [x] <a id="bl-122"></a> Doplnit avatary komentářů, soukromých odpovědí a migraci historického
  obsahu podle úkolu **Sjednotit avatarová data ve všech typech obsahu** v etapě 2.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#profil-a-avatary).

- [x] <a id="bl-123"></a> **Odstranit krátké zobrazení lišky před načtením uloženého avatara.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#profil-a-avatary).

- [x] <a id="bl-124"></a> **Vytvořit a přidat více avatarů.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#profil-a-avatary).

- [x] <a id="bl-125"></a> **Doplnit validaci a zobrazení hesel na obrazovce změny hesla.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#profil-a-avatary).

### Lokalizace

- [x] <a id="bl-126"></a> **Přidat slovenštinu, ukrajinštinu a vietnamštinu.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#lokalizace).

- [ ] <a id="bl-127"></a> **Provést kompletní audit překladů.** **MVP**
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

- [x] <a id="bl-128"></a> **Vytvořit business účet.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#business-účty-a-webová-správa).

- [x] <a id="bl-129"></a> **Přidat zvýrazněné Shouty.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#business-účty-a-webová-správa).

- [x] <a id="bl-130"></a> **Přidat propagační okénko.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#business-účty-a-webová-správa).

- [x] <a id="bl-131"></a> **Vytvořit webové rozhraní pro administrátory a moderátory.**
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#business-účty-a-webová-správa).

<a id="archive-administration"></a>

- [ ] <a id="bl-132"></a> **Později, termín k rozhodnutí** — Navrhnout a implementovat správu
  neveřejného 60denního archivu zpráv/komentářů smazaných účtů.
  - Požadavek vlastníka 1. listopadu: přístup k celému uchovanému obsahu a
    případná práce s daty v administrátorském rozhraní.
  - Před implementací konkrétních akcí schválit role a oprávnění, prohlížení,
    případný export/změny, audit a vztah ke konci retence. Neudělit automaticky
    celé moderační roli přímé klientské čtení všech soukromých zpráv.
  - [Rozsah uchování a návaznosti](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md).

- [ ] <a id="bl-133"></a> **MVP** — Ověřit produkční web pro běžné i Business účty včetně přístupu
  běžného uživatele k feedu a publikování. Moderátorské trasy `/admin` dál
  vyžadují odpovídající roli v klientovi, pravidlech a testech. Dřívější plán
  omezit celý web pouze na Business a moderaci byl 20. října 2026 nahrazen
  cílem veřejné webové aplikace.

### Demo a distribuce

Budoucí postup od Windows přes Google Play a cloudový Mac až k TestFlightu a
veřejným obchodům je zapsaný v plánu
[mobilního testování a distribuce](plans/roadmap/MOBILE_DISTRIBUTION_PLAN.md) včetně nákladů,
podmínek testovacích účtů a požadavků na fyzická zařízení.

- [x] <a id="bl-134"></a> Nakonfigurovat Firebase Hosting a nasadit dočasný preview kanál `demo`.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#demo-a-distribuce).

- [x] <a id="bl-135"></a> Ověřit přihlášení na preview doméně a nasadit aktuální Firestore Rules.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#demo-a-distribuce).

- [x] <a id="bl-136"></a> Hosting preview kanál `demo` používá běžný release web a skutečnou polohu
  zařízení po udělení oprávnění. Samostatný DEMO build ani pevnou polohu
  Litoměřice nezavádět; test mimo Litoměřice musí odpovídat reálnému chování.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#demo-a-distribuce).

- [x] <a id="bl-137"></a> Před veřejným sdílením mimo uzavřený test rozhodnout o omezení registrace,
  App Check enforcement, rozpočtových alertech a odstranění testovacích účtů.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#demo-a-distribuce).

- [x] <a id="bl-138"></a> Optimalizovat webové assety, zejména avatary; 24 transparentních runtime
  avatarů je odvozených v rozměru 512 × 512 px, zatímco vysoké zdroje v
  `design/` a `promo/` zůstávají beze změny pro budoucí grafickou a promo práci.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#demo-a-distribuce).

- [x] <a id="bl-139"></a> Připravit vývojovou iOS variantu bez Macu a placeného Apple účtu.
  - Ve Firebase projektu je registrované bundle ID `cz.shoutout.app.dev`; projekt
    obsahuje iOS Firebase konfiguraci, Google OAuth URL schéma, oprávnění k poloze
    a fotografiím a debug/release App Check providery.
  - Výchozí Flutter ikonu a startovní obrazovku nahradily existující značkové
    podklady ShoutOut ve všech požadovaných iOS rozměrech.
  - [ ] <a id="bl-140"></a> **Po MVP** — Na Macu sestavit nepodepsaný iOS build a odstranit případné chyby nativních
    závislostí; ve Windows tento krok nelze spolehlivě provést.
  - [ ] <a id="bl-141"></a> **Po MVP** — Přes Xcode s Apple Personal Team nainstalovat debug build na vlastní
    iPhone, zaregistrovat App Check debug token a projít hlavní uživatelské cesty.
  - [ ] <a id="bl-142"></a> **Po MVP** — Pro distribuci zaregistrovat iOS aplikaci v produkčním
    Firebase projektu aplikace, vytvořit produkční Apple identitu, podpisy a
    App Store konfiguraci; vývojovou konfiguraci nepoužít veřejně.

#### Navazující mobilní vydání

Mobilní klienti se po webovém MVP registrují ve stejném produkčním Firebase
projektu aplikace; distribuční a nákladové podrobnosti zůstávají v
`plans/roadmap/MOBILE_DISTRIBUTION_PLAN.md`.

- [ ] <a id="bl-143"></a> **Po MVP** — Připravit produkční Android/iOS Firebase aplikace, bezpečné
  build varianty a mobilní konfigurace bez přístupu k vývojovým datům.
- [ ] <a id="bl-144"></a> **Po MVP** — Dokončit podepsaný Android release, bezpečnou správu klíče,
  Play Integrity a produkční App Check; ověřit hlavní cesty na fyzickém zařízení.
- [ ] <a id="bl-145"></a> **Po MVP** — Připravit Google Play záznam, zásady ochrany dat, věkové
  hodnocení, testovací kanál a vydání Androidu pro běžné i privilegované role.
- [ ] <a id="bl-146"></a> **Po MVP** — Dokončit produkční iOS podpis, App Attest a fyzickou regresi,
  připravit TestFlight, App Store Connect a veřejné vydání iOS.

### Navazující ruční test moderace

- [ ] <a id="bl-147"></a> **MVP** — Udělit varování běžnému uživateli a ověřit záznam v historii postihů.
- [ ] <a id="bl-148"></a> **MVP** — Udělit dočasné omezení tvorby a ověřit blokaci Shoutů i komentářů.
- [ ] <a id="bl-149"></a> **MVP** — Skrýt závadný komentář a ověřit jeho stav ve vlákně.
- [ ] <a id="bl-150"></a> **MVP** — Eskalovat případ senior moderátorovi a ověřit oddělení obou front.
- [ ] <a id="bl-151"></a> **MVP** — Senior rolí ověřit 90denní a trvalý ban.
- [ ] <a id="bl-152"></a> **MVP** — Označit obsah jako v pořádku a ověřit nemožnost dalšího hlášení.
- [ ] <a id="bl-153"></a> **MVP** — Ověřit zrušení dočasného postihu a zachování neměnné auditní historie.
- [x] <a id="bl-154"></a> Upravit generátor testovací fronty tak, aby závadný demonstrační obsah
  standardně nevytvářely účty moderátora, seniora, administrátora ani ownera.
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#navazující-ruční-test-moderace).


## 8. Push notifikace a centrum oznámení — Po MVP

- [x] <a id="bl-155"></a> schválený model Follow, centrum oznámení a kategorie uživatelských
  preferencí,
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#8-push-notifikace-a-centrum-oznámení--po-mvp).

- [x] <a id="bl-156"></a> oznámení uvnitř aplikace pro reakci na Shout, komentář na Shout,
  odpověď na komentář, soukromou odpověď a reakci na komentář,
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#8-push-notifikace-a-centrum-oznámení--po-mvp).

- [x] <a id="bl-157"></a> respektovat preference v `users/{uid}/settings/notifications`,
  - [Původní podrobnosti a ověření](archive/TODO_2026-10-29.md#8-push-notifikace-a-centrum-oznámení--po-mvp).
