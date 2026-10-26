# ShoutOut – společný projektový backlog

## Rychlý přehled postupu

Aktualizováno 26. října 2026.

### Postup do MVP

`███████████████░░░░░░░░░░░░░░░░░░░░░░░░░░` **38 %** — 9 z 24 milníků

### Postup celého backlogu

`███████████████████████████░░░░░░░░░░░░░` **69 %** — 107 ze 155 úkolů

Podrobnosti, pravidla počítání a úplné seznamy zůstávají v příslušných sekcích
níže. Tento rychlý přehled je jejich záměrná kopie pro snadnou orientaci.

---

## Hranice MVP

MVP je pro tento projekt **produkčně provozovatelná veřejná webová aplikace
ShoutOut pro běžné uživatele a Business účty**. Obě části stávajícího webového
rozhraní musí být dokončené a funkční: registrace a správa účtu, feed a tvorba
Shoutů, interakce, veřejné profily, Business registrace a aktivace, pobočky,
loga a dosavadní bezplatné propagační funkce. Současné webové moderační
rozhraní musí umožnit bezpečný provoz této veřejné aplikace. Všechny
rozpracované toky, které tyto funkce potřebují, se dokončí před vydáním.

Webová aplikace bude na `go.shoutout-app.eu` ve stávajícím produkčním projektu
`shoutout-production-a1b34`, který sdílí se vstupní stránkou na `shoutout-app.eu`.
Každá část bude mít vlastní Hosting site, obsah a nasazování. Vývojový web a
data zůstávají v projektu `shoutout-dev-46c81`. Produkční SDK konfigurace je
v `config/prod.json`; app Hosting site `shoutout-go-a1b34` je vytvořený a
propojený s registrovanou webovou aplikací. Vlastní doména je `Connected` a má
platné HTTPS; runtime služby a první nasazení aplikace ještě zbývají.

Android a iOS, jejich distribuce a Business monetizace formou předplatného
zůstávají v plánu po webovém MVP. Již při webovém MVP musí mít bezplatné
Business funkce bezpečná oprávnění a datový základ oddělený od ceny, aby
pozdější předplatné, platby a fakturace nevyžadovaly zásadní změnu účtů. Veřejné
vydání webu nadále vyžaduje produkční, bezpečnostní, právní, testovací a
provozní minimum v `docs/LAUNCH_READINESS.md`.

### Historie rozhodnutí o rozsahu

- Původní pracovní varianta počítala s omezeným Android/web pilotem, ručním
  Business ověřováním a přesunutím iOS i monetizace za MVP.
- Dne 30. srpna 2026 byla tato varianta nahrazena tehdejším širším MVP:
  Android + iOS pro všechny podporované role, web pouze pro Business a moderaci
  a kompletní Business monetizace i moderační část před vydáním.
- Při změně v srpnu nebyl žádný úkol původní varianty odstraněn; změnilo se
  pouze jeho zařazení a výsledný počet blokujících milníků.
- Dne 20. října 2026 se cílem MVP stala veřejná webová aplikace pro běžné a
  Business účty. Mobilní distribuce a dříve plánovaná placená Business
  monetizace zůstávají v backlogu jako navazující vývoj. Plánované omezení
  webu pouze na Business a moderační účty tím přestalo platit; běžný účet
  musí mít na webu přístup k feedu a tvorbě Shoutů.
- Téhož dne byl původní model Business tokenů zrušen. Budoucí monetizace má být
  založená na předplatném; jeho konkrétní podoba se teprve navrhne. Platební
  položky a prázdné statistiky se do té doby v Business rozhraní skryjí.
- Dne 25. října 2026 bylo rozhodnuto využít již existující produkční projekt
  `shoutout-production-a1b34` pro vstupní stránku i aplikaci. Každá část bude
  mít vlastní Hosting site; třetí projekt se nezakládá. Tím se nahrazuje
  původní požadavek samostatného projektu aplikace ze dne 20. října.

### Prezentační web před MVP

Doména `shoutout-app.eu` je pořízená a slouží jako veřejný statický prezentační
web. Nejde o webovou verzi aplikace: neobsahuje
přihlášení, registraci, Business ani moderátorské rozhraní a nebude odkazovat do
obchodů s aplikacemi. Úplný záznam rozhodnutí, cílového Hostingu a pořadí
zprovoznění je v `PRESENTATION_SITE.md`.

- [x] **Před MVP, samostatná etapa** — vytvořit oddělený produkční Firebase
  projekt pro prezentaci: `shoutout-production-a1b34`; doména není připojená k
  `shoutout-dev-46c81`.
- [x] **Před MVP, samostatná etapa** — připravit a nasadit statický prezentační
  obsah na Firebase Hosting v projektu `shoutout-production-a1b34`.
- [x] **Před MVP, samostatná etapa** — připojit `shoutout-app.eu` k Firebase
  Hosting a ověřit HTTPS.
- [ ] **Před MVP, samostatná etapa** — připojit a přesměrovat
  `www.shoutout-app.eu` na hlavní doménu.

Tyto položky se nezapočítávají do procent MVP: neaktivují veřejnou aplikaci ani
nenahrazují produkční, bezpečnostní a distribuční bránu MVP.

### Postup k MVP

Aktualizováno 26. října 2026.

`███████████████░░░░░░░░░░░░░░░░░░░░░░░░░░` **38 %** — 9 z 24 milníků

MVP počítadlo používá níže uvedené vydávací milníky, nikoli každý technický
podkrok. Dokončení volitelné práce po MVP toto procento nezvyšuje a jediný
nesplněný blokující milník může vydání zastavit bez ohledu na celkové procento.

#### Hotové milníky MVP (9)

1. ✅ Základní registrace, ověření e-mailu, právní souhlas a profil.
2. ✅ Lokální feed, vytvoření a životní stav Shoutu.
3. ✅ Komentáře, odpovědi, reakce, ukládání, blokace a hlášení.
4. ✅ Veřejné profily, Follow a oznámení uvnitř aplikace.
5. ✅ Business registrace, pobočky a důvěryhodná ruční aktivace s auditem.
6. ✅ Moderátorské rozhraní, role, regionální rozsahy a základní Rules ochrana.
7. ✅ Web jako funkční vývojový cíl se sedmi jazyky.
8. ✅ Automatické Flutter a Firestore Rules testy zapojené do CI.
9. ✅ Připravit `go.shoutout-app.eu` a Hosting pro aplikaci odděleně od
   stávající prezentace. Ověřeno 25. října 2026: samostatný site, propojená
   webová aplikace, DNS a aktivní HTTPS. Produkční release patří do navazujících
   milníků a zatím není nasazený.

#### Zbývající milníky před MVP (15)

1. ⬜ Nakonfigurovat aplikaci ve stávajícím projektu `shoutout-production-a1b34`,
   oddělit její Hosting site od vstupní stránky a bezpečně oddělit vývojová
   a produkční data i nástroje.
2. ⬜ Ověřit doručitelnost e-mailů, produkční Auth domény, Action URL a šablony.
3. ⬜ Ověřit polohu, feed a publikování v mobilním i desktopovém prohlížeči
   mimo Litoměřice.
4. ⬜ Nasadit geografické obohacení, provést backfill a ověřit regionální data
   potřebná pro stávající moderaci.
5. ⬜ Automatizovat expiraci Shoutů, mazání podkolekcí a dokončení 60denní
   retence účtu.
6. ⬜ Dokončit webový App Check a ochranu registrace; vynucení zapnout až po
   ověření metrik.
7. ⬜ Zavést důvěryhodnou serverovou bránu pro zápisy obsahu, čítače, polohu,
   idempotenci a limity proti spamu.
8. ⬜ Dopracovat bezpečné moderátorské operace a jejich audit pro veřejný web,
   včetně zamítnutí a pozastavení Business účtů.
9. ⬜ Serverově vynutit pravidla současných bezplatných Business funkcí a
    zachovat oddělení oprávnění od budoucí ceny.
10. ⬜ Dokončit audit překladů, přístupnosti a rozložení webu v mobilní i
    desktopové šířce pro všech sedm jazyků.
11. ⬜ Projít všechny webové ruční regresní scénáře běžného, Business i
    moderačního účtu včetně pomalé nebo přerušované sítě.
12. ⬜ Doplnit skutečného provozovatele, podporu, právní kontrolu a proces práv
    subjektů údajů.
13. ⬜ Nastavit monitoring, rozpočty, kvóty, zálohy, obnovu, rollback a
    minimální provozní metriky bez nadbytečných osobních údajů.
14. ⬜ Spustit CI a produkční webový build a odstranit blokující vady.
    `pubspec.lock` je nyní verzovaný a CI používá `--enforce-lockfile`, aby
    testovalo stejné Flutter závislosti jako lokální ověřený build.
    Lokální integrace 25. října prošla 147 Flutter testy, 12 testy nástrojů,
    64 testy Firestore Rules, 3 testy Functions, cíleným analyzátorem aplikace,
    kontrolou formátu, vývojovým release buildem i produkčním debug buildem.
    ESLint ve `functions/` byl následně doplněný a prošel pod Node.js 22;
    CI zahrnuje Functions lint i testy. Generované artefakty `build/` jsou
    explicitně vyloučené z analyzátoru a celokořenová analýza prochází.
15. ⬜ Splnit webovou rozhodovací bránu v `docs/LAUNCH_READINESS.md` a výslovně
    přijmout nebo odstranit zbývající rizika.

### Práce po MVP

Po MVP patří vydání Androidu a iOS, kompletní placená Business monetizace,
interaktivní tutorial, telefonní ověření, FCM push a fan-out sledujícím a
obecné žebříčky či gamifikace. Tyto plány se neruší; zůstávají v detailním
backlogu níže se štítkem **Po MVP**.

Navazující mobilní etapa zachovává fyzické testování Androidu, Play Integrity,
podpis a Google Play, stejně jako sestavení iOS na Macu, App Attest, fyzický
iPhone, TestFlight a App Store. Úplný postup je v
`docs/MOBILE_DISTRIBUTION_PLAN.md`. Navazující Business etapa zachovává
záměr předplatného, otevřené rozhodnutí o placeném dosahu a Founder
zvýhodnění, platební integraci, fakturaci a důvěryhodné statistiky propagace
podle `docs/BUSINESS_MONETIZATION.md`. Business tokeny ani jejich nákup a
čerpání se neplánují. Ověření firmy přes
registry bylo naopak výslovně zrušeno; webové MVP počítá s ruční aktivací.

### Význam štítků v detailním backlogu

- **MVP** — otevřená položka nebo podúkol blokuje vydání veřejné webové aplikace.
- **Po MVP** — položka zůstává plánovaná, ale webové MVP může začít bez ní.
- Dokončené položky se zpětně neštítkují; jejich vztah k MVP shrnuje osm
  hotových milníků. Neoznačený nový otevřený checkbox je chyba dokumentace a při
  přidání musí být ihned zařazen.

---

## Detailní backlog a historie dokončené práce

## Nové podněty z uživatelského testování

- [x] **Navrhnout sdílenou profilovou vizitku.**
  - Vytvořit kompaktní kartu veřejného profilu použitelnou při otevření autora
    i pro budoucí sdílení; určit obsah, vzhled, akce a ochranu soukromých údajů.
  - Sdílená komponenta zobrazuje pouze veřejnou přezdívku, avatar a flair;
    používá se v detailu autora i v seznamu sledovaných. Kontextové akce zůstávají
    mimo veřejnou identitu a vlastní profil nenabízí Follow, blokaci ani hlášení.
- [ ] **Rozhodnout o případném větším dosahu v rámci předplatného.** **Po MVP**
  - Běžný Business Shout zachová standardní místní dosah. Zda předplatné
    nabídne větší poloměr, není rozhodnuto; samostatné dokupování za tokeny
    bylo zrušeno.
  - Před případnou implementací určit geografické limity, dobu platnosti,
    serverové oprávnění a ochranu proti překryvu či zneužití oblastí.
- [x] **Prověřit API pro události v okolí.**
  - Upřesnit zdroj událostí, podporované země, licenční podmínky, duplicity,
    aktuálnost, lokalizaci a způsob odlišení externí události od Shoutu.
- [x] **Opravit tlačítko „Zrušit registraci a začít znovu“.**
  - Reprodukovat chybu v běžné i Business registraci, bezpečně zrušit rozpracovaný
    účet a registrační data a vrátit uživatele na čistý začátek registrace.
  - Příčinou byl dotaz na aktivní Shouty před smazáním neověřeného účtu;
    Firestore jej správně odmítl, protože rozpracovaná registrace ještě není
    oprávněný profil. Tento nepotřebný krok je pouze z registračního toku odstraněn.
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
  - Událost, Dotaz, Nabídka, Pomoc, Ztráty a nálezy, Tip, Doprava, Diskuze,
    Varování! a Ostatní; v klientovi se zobrazují s přiřazenými emoji.

- [x] **Umožnit otevřít veřejný profil autora z komentáře.**
  - Přezdívka a avatar v komentáři musí mít stejné chování jako autor na kartě
    Shoutu; vlastní profil nesmí nabízet Follow, blokaci ani nahlášení sebe sama.
- [x] **Přidat veřejné flairy rolí.**
  - Za jménem zobrazit malý obdélníkový štítek pro `Business`, `Moderátor`,
    `Admin` a `Owner`; interní role `seniorModerator` se navenek zobrazí jako
    `Moderátor`.
  - Pokud je Business účet současně autorem Shoutu, zobrazit vedle sebe flair
    `Business` i existující štítek `Autor`.
  - Dlouhé jméno zkrátit třemi tečkami ještě před flairy; flairy se nesmí
    zmenšit, zalomit ani vytlačit mimo kartu.
  - [x] Doplnit klientské zobrazení flairů na Shoutech, komentářích, soukromých
    odpovědích, veřejném profilu a seznamu sledovaných profilů včetně lokalizace
    `Moderátor` a mapování `seniorModerator` na stejný veřejný štítek.
  - [x] Nasadit upravená Firestore Rules a důvěryhodně doplnit `publicRole` do
    existujících veřejných profilů skriptem `npm run backfill:public-profiles`.
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
  - Opravit stav, kdy tyto části v některých podporovaných jazycích zůstávají
    česky; tím se znovu otevírá dříve odškrtnutý obecný audit překladů.
- [x] **Opravit ciferník platnosti v dialogu Nový Shout.**
  - Příčina potvrzena v `_DurationWheel`: podmínka `value > 24` nerozlišuje
    hodinový a minutový sloupec. Minutové volby 30 a 45 proto formátuje jako
    `Duration(hours: 30/45)`, tedy například „1 den 6 h“ a „1 den 21 h“.
  - Formát celých dnů používat pouze pro hodinový ciferník; minutový ciferník
    musí vždy zobrazit `00`, `15`, `30` a `45 min`. Referenční fotku lze doplnit
    při implementaci pro vizuální kontrolu výsledku.
- [x] **Přepracovat rozložení společné Shout karty.**
  - Zachovat avatar; zvětšit jméno autora a pod něj úsporně umístit vzdálenost,
    čas vložení a expiraci.
  - Flair zobrazit u jména a akci Uložit Shout zachovat snadno dosažitelnou.
  - Ověřit limit nadpisu podle skutečné šířky a podporovaných jazyků.
  - Text ve feedu zobrazit nejvýše na tři řádky, přetečení zakončit třemi
    tečkami a celý text ukázat v detailu.
  - Zmenšit category chips bez ztráty čitelnosti a přístupnosti.
  - Zachovat like/dislike a ověřit práh automatického skrytí: skrytý Shout musí
    být možné vědomě rozbalit kliknutím.
- [x] **Navrhnout zásady karmy, achievementů a kosmetických odměn.**
  - Oddělení reputace, Business oprávnění a čistě kosmetických odměn je v
    `docs/GAMIFICATION_MODEL.md`. Snadno farmitelné počty nesmí dávat odměny bez
    serverové validace a ochrany proti zneužití.
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
  - Tato položka opravuje starší duplicitní nezaškrtnuté položky níže v backlogu;
    zbývá ruční ověření a budoucí důvěryhodné serverové měření.
- [x] **Naplánovat pořízení evropské ochranné známky ShoutOut.**
  - Zahrnout rešerši kolizí, vlastníka, relevantní třídy, rozpočet, termín podání
    u EUIPO a odbornou právní kontrolu před podáním.

Interní pravidla rolí, pravomocí a postihů jsou vedena v
`docs/INTERNAL_MODERATION.md`. Změny moderace musí aktualizovat také tento
dokument, pravidla, testy a případně veřejné právní texty.

## Stav dokončení backlogu

Aktualizováno 25. října 2026.

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
- [x] Google reverse-geocoding trigger s tajným serverovým API klíčem.
- [x] ISO země/oblasti, moderátorské rozsahy, webový filtr a kontrola postihu.
- [x] Migrační nástroj pro existující shouty.
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

Toto je jediné místo pro otevřené produktové, grafické, lokalizační, serverové
a produkční úkoly projektu. Samotné zapsání bodu neznamená, že je
implementovaný.

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
  - Role 3–6 mohou ručně vybrat bod, obec nebo region a prohlížet feed tak, jako
    by se nacházely na zvoleném místě; nabídnout návrat ke skutečné poloze.
  - Náhradní polohu držet odděleně od polohy zařízení, výrazně označit aktivní
    režim náhledu a rozhodnout, zda má přetrvat pouze relaci, nebo i další
    přihlášení na stejném účtu.
  - Ručně nastavená poloha nesmí být použita jako poloha nového Shoutu, měnit
    uložený profil ani rozšířit právo moderovat mimo `moderationScope` dané role.
  - Administrátor a owner mohou procházet libovolné území; moderátor a senior
    mohou území prohlížet, ale zásahy se nadále řídí přiděleným rozsahem.
  - Doplnit auditované testy oddělení náhledu, publikování a moderátorských
    oprávnění a ověřit chování na mobilu i ve webovém pracovním prostoru.
  - Ruční adresa je pouze stav pracovního prostoru, filtruje náhled podle
    poloměru 5–50 km a nepřepisuje polohu zařízení, profil ani uložené Shouty.
- [x] **Změřit a zkrátit dlouhé načítání při registraci.**
  - Změřit jednotlivé kroky: vytvoření účtu, odeslání/ověření e-mailu, zápis
    profilu, právní souhlas, načtení polohy a první otevření feedu.
  - Odstranit z kritické cesty vše, co může doběhnout bezpečně na pozadí, a po
    dobu nutného čekání zobrazit srozumitelný stav a možnost opakování.
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
  - Výběr filtru držet po celou relaci aplikace a při návratu na kartu obnovit
    stejný filtr i výsledky.
  - Resetovat jej pouze při novém spuštění aplikace nebo explicitním resetu,
    nikoli při běžné navigaci mezi kartami.
- [x] **Upravit časové údaje na Shoutu.**
  - Zrušit průběžné počítání minut od vytvoření a zobrazovat pouze lokalizované
    datum vytvoření; určit jednotné chování pro dnešní datum a časová pásma.
- [x] **Normalizovat nadpis Shoutu na počáteční velké písmeno.**
  - Rozhodnout, zda jde pouze o vizuální zobrazení, nebo úpravu při zápisu;
    nepoškodit zkratky, emoji ani jazyky bez rozlišení velikosti písmen.

### Etapa 2 – společný profil a identita autora

- [x] **Sjednotit avatarová data ve všech typech obsahu.**
  - Shouty, komentáře a soukromé odpovědi odkazují přes `authorId` na aktuální
    `publicProfiles/{uid}`; starý snímek slouží pouze jako fallback.
  - Veřejný profil obsahuje jen přezdívku a avatarový styl a Firestore Rules
    atomicky kontrolují shodu se soukromým profilem a brání podvržení identity.
- [x] Nasadit nová Firestore Rules a jednorázově spustit
  `npm run backfill:public-profiles` pro existující účty ve vývojovém projektu.
- [x] **Přidat na kartu profilu datum vzniku účtu pod přezdívku.**
  - Použít důvěryhodné serverové datum, lokalizovaný formát a definovat fallback
    pro starší profily bez údaje.

### Etapa 3 – první použití, nastavení a zpětná vazba

- [x] **Přidat úvodní nápovědu po založení účtu.**
  - Navázat ji až na dokončenou registraci a vysvětlit polohu, filtry, vytvoření
    Shoutu, soukromí a hlášení obsahu.
  - Přidat volbu „Znovu nezobrazovat“, uložit ji k účtu a nabídnout opětovné
    spuštění nápovědy v nastavení.
- [x] **Přidat noční režim.**
  - Podporovat systémové nastavení, světlý a tmavý režim; volbu uložit k účtu
    nebo lokálně před přihlášením.
  - Prověřit kontrast, mapy, dialogy, formuláře, avatary, web a všechny stavy chyb.
- [x] **Přepracovat dlaždici Nápověda.**
  - Rozšířit stručné texty na samostatná témata pro polohu a soukromí, feed a
    filtry, vytvoření Shoutu, reakce a komentáře, sledování, bezpečnost účtu,
    hlášení obsahu a Business funkce.
  - Místo stránkovaného průvodce zobrazit seznam témat; každé téma otevřít ve
    vyskakovacím okně stejným vzorem jako dokumenty v **Právní info**.
  - Zachovat úvodní onboarding po registraci, ale opakovaná Nápověda z profilu
    má sloužit jako přehled snadno dostupných témat.
- [x] **Přesunout Nahlásit chybu přímo na kartu Profil.**
  - Přidat samostatnou dlaždici vedle ostatních profilových akcí a odstranit
    duplicitní vstup z Nápovědy.
  - Textové hlášení zůstává funkční zdarma; příloha obrázku zůstane skrytá do
    aktivace Firebase Storage podle následujícího úkolu.
- [x] **Napojit připravené obrázky v „Nahlásit chybu“ po přechodu na placený plán.**
  - Umožnit náhled, odebrání a bezpečný upload screenshotu se stavem průběhu.
  - Stanovit limit typu/velikosti, retenci, přístup podpory a upozornění na možné
    osobní údaje; obrázek nepřikládat bez výslovného potvrzení uživatele.
  - JPG/PNG/WebP do 2 MB, náhled, odebrání, potvrzení obsahu,
    průběh uploadu, retence 60 dní a čtení pouze administrátorem nebo ownerem.
  - Obrázek se v administraci stáhne až po výslovném kliknutí administrátora nebo
    ownera; moderátor a senior moderátor k souboru nemají přístup.
  - Aktivační a ověřovací postup je v `docs/FIREBASE_STORAGE_SETUP.md`.

### Etapa 4 – životnost obsahu a business účty

- [x] **Rozhodnout pravidla životnosti Shoutu před změnou expirace.**
  - Schválené chování, budoucí zpoplatnění a serverové požadavky jsou vedené
    pouze v `docs/BUSINESS_MONETIZATION.md`.
  - Vyhodnotit dopad na feed, zvýrazněné Shouty, cenu/zneužití business účtů,
    moderaci, notifikace, indexy, pravidla a serverové mazání.
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
  - Určit, zda se sledují uživatelé, business profily, oblasti nebo kombinace,
    a vyřešit soukromí, blokace, limity, odstranění účtu a zneužití.
  - Přidat follow/unfollow, seznamy a feed až po uzavření datového modelu; veřejné
    počty odvozovat důvěryhodně, ne klientským přepisem.
  - [x] Přejmenovat kartu Uložené na Sledované a rozdělit ji na uložené Shouty
    a sledované profily, aniž by se měnila karta Mé Shouty.
  - [x] Otevřít profil kliknutím na autora, zobrazit aktivní Shouty a nabídnout
    sledování, zrušení sledování, blokaci a nahlášení účtu.
  - [x] Řadit lokální Shouty sledovaných účtů před ostatními a uvnitř obou skupin
    zachovat zvolené řazení; blokace současně ukončí sledování.
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
  - Nejprve určit důvěryhodné události, pravidla proti farmení a význam karmy;
    neodměňovat samotný objem obsahu ani konfliktní chování.
  - Potom navrhnout malé odznaky a rámečky, přičemž uživatel může zvolit nejvýše
    jeden odznak zobrazovaný u avatara; zajistit přístupnost a moderaci názvů.
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
  - V seznamu aplikací je ikona zobrazena správně, ale na ploše emulátoru má
    po obvodu světlý proužek.
  - Prověřit adaptive icon foreground/background, safe zone a masku launcheru.
  - Ověřit na ploše i v seznamu aplikací, ideálně alespoň na dvou tvarech masek.

- [x] **Sjednotit logo na přihlašovací a registrační obrazovce se záhlavím
  feedu.**
  - Odstranit současný tmavší podklad loga.
  - Použít aktuální barvy a současný font logotypu ze záhlaví feedu.
  - Zkontrolovat přihlášení i registraci v češtině a angličtině.

- [x] **Navrhnout nový font záhlaví karet Uloženo, Mé Shouty a Profil.**
  - Připravit několik náhledů před změnou.
  - Posoudit variantu se stejným fontem jako logotyp i samostatný, lehčí font.
  - Zachovat čitelnost delších překladů a jednotnou velikost záhlaví.

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

- [x] **Zobrazovat avatar autora na kartách Shoutů.**
  - Nové Shouty ukládají ověřený veřejný snímek avataru a barevného stylu.
  - Firestore Rules porovnají snímek s profilem autora a nedovolí podvržení.
  - Starší Shouty bez snímku používají bezpečný výchozí avatar.
- [x] Doplnit avatary komentářů, soukromých odpovědí a migraci historického
  obsahu podle úkolu **Sjednotit avatarová data ve všech typech obsahu** v etapě 2.

- [x] **Odstranit krátké zobrazení lišky před načtením uloženého avatara.**
  - Po otevření Profilu se nejdřív ukáže liška a až potom správně uložená sova.
  - Prověřit výchozí hodnotu, lokální cache a asynchronní načtení profilu.
  - Během načítání nezobrazovat jiného avatara; použít neutrální placeholder
    nebo poslední skutečně uloženou hodnotu.

- [x] **Vytvořit a přidat více avatarů.**
  - Zachovat současný vizuální styl, rozměry a bezpečné okraje.
  - Před implementací připravit přehled variant ke schválení.
  - Doplnit assety, výběr v profilu a případné lokalizované názvy či popisy.

- [x] **Doplnit validaci a zobrazení hesel na obrazovce změny hesla.**
  - Nové heslo a jeho potvrzení zvýraznit červeně pouze tehdy, když se po
    zadání neshodují.
  - Chybový stav zobrazit při opuštění pole i při pokusu o potvrzení změny.
  - K oběma polím přidat ikonu oka se stejným chováním jako při registraci:
    heslo je ve výchozím stavu skryté a oko přeškrtnuté; po aktivaci je text
    čitelný a oko nepřeškrtnuté.
  - Zachovat stávající pravidla síly hesla a lokalizovat chybové i pomocné texty.

### Lokalizace

- [x] **Přidat slovenštinu, ukrajinštinu a vietnamštinu.**
  - Doplnit nové locale do aplikace i do nabídky jazyků.
  - Zachovat automatickou volbu podle jazyka zařízení a funkční ruční přepnutí.
  - Ověřit fallback pro zařízení s nepodporovaným jazykem.

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
  - Navázat na rozhodnutí o životnosti Shoutů, model provozovny a schválený
    proces ověření z etapy 4.
  - Vývojový účet `test.business` je aktivní na úrovni 2; uživatel ověřil
    publikování Business Shoutu, pobočky, propagační funkce a vlastní logo.
- [x] **Přidat zvýrazněné Shouty.**
- [x] **Přidat propagační okénko.**
- [x] **Vytvořit webové rozhraní pro administrátory a moderátory.**
  - Jednotné přihlášení a navigace podle role 3–6.
  - Regionální přehled Shoutů, společná fronta hlášení, seskupování a řazení.
  - Detail případu, rozhodovací roletka, postihy, schválení obsahu a eskalace
    senior moderátorovi.
  - Přímé otevření nahlášeného komentáře v kontextu vlákna se zvýrazněním.
  - Historie postihů, uživatelský detail a zrušení oprávněného aktivního postihu.
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
- [x] Ověřit přihlášení na preview doméně a nasadit aktuální Firestore Rules.
- [x] Hosting preview kanál `demo` používá běžný release web a skutečnou polohu
  zařízení po udělení oprávnění. Samostatný DEMO build ani pevnou polohu
  Litoměřice nezavádět; test mimo Litoměřice musí odpovídat reálnému chování.
- [x] Před veřejným sdílením mimo uzavřený test rozhodnout o omezení registrace,
  App Check enforcement, rozpočtových alertech a odstranění testovacích účtů.
- [x] Optimalizovat webové assety, zejména avatary; 24 transparentních runtime
  avatarů je odvozených v rozměru 512 × 512 px, zatímco vysoké zdroje v
  `design/` a `promo/` zůstávají beze změny pro budoucí grafickou a promo práci.
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

## Serverová a produkční část webového MVP a navazujícího vývoje

Následující body nelze spolehlivě dokončit pouze ve Flutter klientovi nebo
vyžadují produkční Firebase/Google Cloud konfiguraci. Části označené **MVP**
se vztahují na veřejnou webovou aplikaci; mobilní providery, podpisy a push
notifikace následují po MVP. Klientský kód není důvěryhodná bezpečnostní
hranice a upravená aplikace jej může obejít.

## Co je už hotové bez vlastního serveru

- Firestore Rules vyžadují ověřený e-mailový token, existující profil, aktuální
  právní souhlas, neblokovaný účet a účet bez čekajícího smazání.
- Pravidla kontrolují povolená pole, typy, délky, kategorie, serverové časové
  značky, autora a přezdívku načtenou z profilu.
- Vytvoření Shoutu, komentáře, soukromé odpovědi, hlášení a interakce spotřebuje
  atomický limit svázaný s ID konkrétního zápisu.
- Aktuální limity: běžný účet nejvýše 1 Shout za 2 minuty a 50 za 24 hodin,
  business účet nejvýše 1 Shout za sekundu a 500 za 24 hodin; komentář a
  soukromá odpověď nejvýše 1 za 10 sekund a 60 za hodinu; hlášení nejvýše
  1 za minutu a 20 za 24 hodin; interakce a mazání nejvýše 120 za hodinu.
- Hlášení má deterministické ID, takže stejný účet nemůže opakovaně hlásit
  stejný obsah.
- Kolekce uživatelů, kteří reagovali nebo si Shout uložili, už nelze vypsat.
  Veřejné jsou pouze důvěryhodně aktualizované souhrnné počty.
- Feed, komentáře, soukromé odpovědi, historie a moderace mají v klientovi i
  pravidlech horní limit 50 dokumentů; blokace má limit 200.
- Firestore Rules mají automatické pozitivní i negativní testy přes Emulator
  Suite a běží v CI.
- Android klient inicializuje App Check: debug provider ve vývojovém buildu a
  Play Integrity v release buildu. Vynucení zatím záměrně není zapnuté.
- Android release už nepoužívá společný debug podpis a záloha privátních dat
  aplikace je vypnutá.
- Vývojová data lze jednorázově srovnat skriptem
  `tools/reconcile_counters.mjs`.

Tyto body výrazně omezují běžné zneužití jednoho účtu. Neřeší spolehlivě farmy
účtů/IP adres, kompromitovaná zařízení, distribuované útoky, obsahovou moderaci
ani podvržení veřejné polohy upraveným klientem.

## Nejbližší ruční krok ve vývojovém projektu

- bezpečně získat omezený Admin SDK klíč pouze pro vývojový projekt,
- nastavit `FIREBASE_SERVICE_ACCOUNT_PATH` na jeho lokální cestu,
- spustit `cd tools && npm run reconcile:data`,
- zkontrolovat souhrnné počty reakcí, uložení a komentářů na starých datech
  a zaokrouhlení jejich veřejné polohy,
- klíč po dokončení odstranit z pracovního počítače nebo uložit do schváleného
  správce tajemství; nikdy jej necommitovat.

Skript tento krok záměrně odmítne pro jiný projekt než `shoutout-dev-46c81`.
Dnes nebyl spuštěn, protože `FIREBASE_SERVICE_ACCOUNT_PATH` není nastavený a
v projektu není žádný administrátorský klíč.

## 1. Oddělit vývojové a produkční prostředí — MVP pro web

Samostatný milník přípravy domény a Hostingu je dokončený. Opakovaná kontrola
25. října přes Firebase Hosting API potvrdila dva odlišné sites a vazbu
`shoutout-go-a1b34` na produkční app ID. Vlastní doména má `HOST_ACTIVE`,
`OWNERSHIP_ACTIVE` a `CERT_ACTIVE`. Google i Cloudflare vracejí očekávaný CNAME;
HTTPS klient ověřil důvěryhodný certifikát pro `go.shoutout-app.eu`.
App site nemá release a vrací očekávané 404. Prezentace vrací 200 ze svého
site; odkaz do aplikace na živé prezentaci ještě chybí. Devět testů webových
nástrojů prošlo včetně oddělení Hosting cílů a odmítnutí nesprávného nasazení.
Širší milník konfigurace produkčních služeb níže zůstává otevřený.

Dne 25. října 2026 byla doména `go.shoutout-app.eu` přidaná ve Firebase k
app site `shoutout-go-a1b34`. Na Hostingeru je nový CNAME `go` →
`shoutout-go-a1b34.web.app`, TTL 300 s, bez přepsání ostatních záznamů.
Autoritativní DNS i Google a Cloudflare změnu potvrzují. Firebase DNS uznal
a následná kontrola potvrdila stav `Connected`, platný TLS certifikát a HTTPS.
App site vrací do prvního release očekávané 404. Podrobnosti jsou v
`WEB_ENVIRONMENTS.md`.

Rozhodnutí 25. října 2026: třetí Firebase projekt se nevytváří. Produkční
aplikace sdílí `shoutout-production-a1b34` se vstupní stránkou, ale má vlastní
Hosting site. Lokálně upravené kontroly povolují tento projekt a odmítají site
vstupní stránky. V `presentation/` je připravené tlačítko do aplikace; jeho
nasazení počká na zprovoznění `go.shoutout-app.eu`. Následně byl po souhlasu
uživatele vytvořen app site `shoutout-go-a1b34` a registrována webová aplikace
`ShoutOut Web Production`; propojení ověřil výpis Firebase Hosting a veřejná
SDK konfigurace byla uložena do `config/prod.json`.
Následně prošel produkční debug build a 12 testů nástrojů. Release čeká na
produkční Geoapify klíč; provozní služby a nasazení aplikace zbývají.

Ověření této úpravy: 137 Flutter testů, 12 testů nástrojů, analyzátor a debug
build prošly; tlačítko bylo vizuálně ověřené na desktopu a při mobilní šířce
390 px. Produkční SDK konfigurace a vlastnictví app site byly následně ověřené;
nastavení služeb Firebase zatím nebylo ověřené. Vlastní doména byla následně
připojená a její HTTPS ověřené.

Pravidla výběru změn a publikování zapsána 25. října 2026 do `AGENTS.md` a
`RELEASING.md`: samostatné větve, uživatelské schválení, produkční commit
a verze, čistá pracovní kopie a oddělený souhlas s nasazením. Automatické
vynucení Git původu buildu, release tagu a schválení zůstává otevřené;
současné nasazovací kontroly je zatím neověřují.

Lokální příprava dokončena 24. října 2026: společná webová konfigurace pro
Flutter, e-mailové návraty a Auth handler, oddělené buildy, kontrola cílového
projektu a integrity release artefaktů, ochrana tří starších Admin SDK
skriptů (tutorial, zaokrouhlení polohy, přidělení moderátora) a testy.
Cílová adresa byla změněna na `go.shoutout-app.eu`. Postup a omezení jsou v
`WEB_ENVIRONMENTS.md`. Produkční SDK konfigurace a app Hosting site jsou od
25. října doplněné a doména je `Connected` s platným HTTPS; služby, IAM a
nákladové pojistky zůstávají otevřené.
Tento milník tím není dokončený.

Ověření lokální přípravy: Flutter a Node testy, analyzátor, debug i release
build a pozitivní/negativní nasazovací kontroly prošly. Celorepozitářový formát
má starší nálezy ve dvou nezměněných překladových souborech; podrobnosti jsou
v `WEB_ENVIRONMENTS.md`. Externí nasazení nebylo provedeno.

- připravit služby aplikace ve stávajícím projektu `shoutout-production-a1b34`,
  odděleném od vývojového projektu,
- webová aplikace a samostatný Hosting site jsou vytvořené; dokončit jejich
  provozní konfiguraci a první release; doména a HTTPS jsou ověřené,
- přidat bezpečné přepínání vývojové a produkční webové konfigurace,
- zabránit spuštění seedovacích a migračních skriptů proti produkci,
- nepřenášet testovací účty ani demo data do produkce,
- vytvořit minimálně oprávněné service accounts pro nasazení a automatizace,
- nastavit rozpočty, nákladové limity a upozornění,
- vytvořit kontrolovaný postup nasazení, návratu verze a částečného selhání,
- znovu prověřit, že service-account JSON ani klíče nejsou v historii Gitu.

Hotovo pro webové MVP, když vývojový build ani skript nemůže omylem číst nebo
měnit produkční data a produkční web míří na správný projekt i Hosting cíl.
Produkční mobilní Firebase aplikace, build varianty, Android keystore a
podpisový klíč zůstávají navazujícími úkoly mobilní distribuce po MVP.

## 2. App Check, registrace a ochrana proti farmám účtů — MVP pro web

Stav po úspěšném rollout testu 25. října 2026: vývojový Hosting
`shoutout-dev-46c81` běží na commitu
`36f42e241ce9d6d43175db076a3c726d0c306b0b`, verzi `d9c867abfdb9e20e`.
App Check i `serverShoutCreation` jsou zapnuté. Přihlášený Business účet
vytvořil přes aplikaci právě jeden testovací Shout. Čtení Firestore potvrdilo
serverové ID, ověřenou pobočku a její kanonickou identitu/polohu, nulové čítače,
geohash a odpovídající idempotentní záznam i limit se společným timestampem.
Test byl následně v aplikaci odstraněn; stav `deleted` je ověřený čtením.
CI `40227813927` prošlo a otisky nasazených souborů odpovídají release buildu.
Globální enforcement Auth/Firestore, produkce a `main` se neměnily.
Uživatelský test osobního Shoutu „Test Shout“ následně také prošel. Firestore
potvrdil osobní publikační cestu, kanonického autora, zaokrouhlenou veřejnou
polohu, odpovídající geohash a atomický receipt i limit. Přechodný problém
s přepisem hesla po odhlášení uživatel přestal pozorovat; příčina se nepotvrdila
a přihlašovací formulář se neměnil.

Následující odstavce zaznamenávají starší pokusy; jejich vypnuté přepínače
a čekající ověření jsou historický stav překonaný výše uvedeným testem.

Po zapnutí App Check API uživatelský test na vývojové doméně potvrdil
`tokenObtained: true` a odpověď callable `401 Authentication is required.`.
To prokazuje získání tokenu i jeho přijetí App Check vrstvou; následná Auth
kontrola správně zastavila nepřihlášený požadavek. Vývojová konfigurace proto
znovu zapíná App Check a `serverShoutCreation` pro schválený přihlášený test.
Úspěšný zápis obsahu ještě není tímto diagnostickým testem prokázaný.

Uživatelský ruční test 25. října poskytl přesnou odpověď výměny tokenu:
`403 PERMISSION_DENIED`, App Check API je v projektu `696035472864` vypnuté.
Service Usage potvrdilo `firebaseappcheck.googleapis.com: DISABLED`; služba
byla zapnutá pouze ve vývoji a následně ověřená jako `ENABLED`. Klientský
požadavek s Firebase API klíčem a prázdným tokenem už prošel k validaci a
správně vrátil `400 INVALID_ARGUMENT` místo `SERVICE_DISABLED`. Tato kontrola
nepotvrzuje úspěšnou atestaci: zbývá ruční opakování po obnovení stránky a
potom přihlášený test callable. Serverové publikování zůstává vypnuté.

Navazující diagnostika 25. října potvrdila správný projekt, SCORE klíč,
doménové omezení, aktivní billing i povolené App Check API na Firebase API
klíči. Ve vývoji ale chyběla servisní identita App Check i její standardní
role. Identita a `roles/firebaseappcheck.serviceAgent` byly doplněné a ověřené
čtením IAM. Samostatný test nyní dosáhl výměny tokenu, která na localhostu
vrací 403; úspěch ostré domény zatím není potvrzený. Připravená vývojová
diagnostika `--app-check-probe` rozliší tento krok bez zápisů obsahu a bez
vypisování tokenů. Serverové publikování zůstává vypnuté do úspěšného ověření.

Ověření po opravě IAM: build commitu `5c3034e` s opravou právní brány a
výslovně zapnutou diagnostikou byl nasazen pouze na vývojový Hosting jako
verze `63c6c0ab3e299be3`. Otisky HTML, JavaScriptu a konfigurace odpovídají
lokálnímu release. CI `40226532742` prošlo. Samostatná diagnostika na
`shoutout-dev-46c81.web.app` ale nadále vrací `appCheck/recaptcha-error` před
výměnou tokenu (`exchange: null`). Chybějící servisní účet byl skutečný
nedostatek konfigurace, nikoli prokázané úplné vysvětlení této klientské chyby.
Aktivace App Check v aplikaci i serverové publikování zůstávají vypnuté.
Následné ověření v aktivním okně přerušila bezpečnostní kontrola Computer Use,
protože nebyla schopná bezpečně určit URL; další UI vstupy nebyly provedené.
Zbývá test v běžném aktivním Chrome okně a teprve po úspěchu přihlášený test
callable. Produkce, `main` a Firestore Rules se neměnily.

Vývojový rollout 25. října: CI `40206757797` prošlo a release odpovídal
lokálním otiskům. Smoke test ale zjistil `appCheck/recaptcha-error` také na
`shoutout-dev-46c81.web.app`, zpožděné načítání Firestore a přechodné zobrazení
právní brány z prázdné cache. Hosting byl vrácen na dříve ověřenou verzi
`c8ec155e05b4a3b3`; lokální App Check aktivace a serverové publikování jsou
opět vypnuté. Příčina reCAPTCHA chyby zůstává k ověření. Úspěšná tvorba Shoutu
přes veřejný endpoint zatím nebyla ověřená a žádný testovací Shout tímto
rolloutem nevznikl. Právní brána je následně lokálně opravená ve větvi
`fix/legal-acceptance-offline`: prázdná offline cache již není považovaná za
chybějící souhlas, čeká se na serverové potvrzení včetně metadata událostí.
Oprava prošla 154 Flutter testy, celkovou analýzou a 14 cílenými testy stavů
a sdílení streamů; nasazení této opravy zatím neproběhlo.

Webový klient umí App Check přes `appCheckSiteKey` a řízené přepnutí tvorby
Shoutu přes `serverShoutCreation`. Ve vývoji byl po souhlasu vlastníka
registrovaný reCAPTCHA Enterprise provider (TTL 1 hodina, výchozí práh 0,5).
Vynucení pro Auth/Firestore a přepnutí klienta zatím zůstávají vypnuté.
Při přepnutí nepoužívá klient při chybě serveru přímý fallback. Klíč požadavku
i původní poloha se při retry zachovávají, upravený koncept má nové ID.
Lokálně prošlo 150 Flutter testů, 13 nástrojových testů a cílený analyzátor.
Externí nasazení této klientské verze a její end-to-end ověření ještě zbývá.

Callable `createShout` byla po výslovném souhlasu nasazená pouze do vývoje
`shoutout-dev-46c81`, codebase `content`, region `europe-west3`, ze zdrojů
commitu `34aee41`. API potvrdilo stav `ACTIVE`, revizi `createshout-00001-zik`,
Node.js 22, 256 MiB, 15 s, nejvýše jednu instanci a jeden souběžný požadavek.
Požadavky bez App Check i s neplatným tokenem vracejí 401. Registrace
App Check je ověřená čtením API; lokální browserový pokus získat token skončil
`appCheck/recaptcha-error`, proto klientské přepnutí zůstává vypnuté. Zbývá
ověřit skutečnou vývojovou doménu a úspěšnou tvorbu přihlášeným testovacím účtem.
Úložiště `gcf-artifacts` v `europe-west3` má standardní Firebase politiku úklidu
obrazů starších než 24 hodin. Produkce ani geografická Function nebyly nasazené.

- ověřit metriky platných/neplatných App Check požadavků a teprve potom
  postupně zapnout vynucení pro Firestore a podporované Authentication toky,
- webový App Check provider a klíč reCAPTCHA Enterprise jsou ve vývoji
  vytvořené a ověřené; připravit samostatné produkční nastavení,
- po zapnutí fakturace/Identity Platform zapnout reCAPTCHA Enterprise pro
  registraci a přihlášení e-mailem a heslem nejdřív v auditním a pak ve
  vynucovacím režimu,
- sledovat kvótu vytváření účtů podle IP a alarmovat na prudké nárůsty,
- zavést serverový limit podle UID, IP, zařízení/App Check signálu a rizika;
  klientský limit ve Firestore ponechat jako další obrannou vrstvu,
- zavést globální pojistku proti náhlému růstu registrací a zápisů,
- podle reálného zneužití přidat cooldown nových účtů, reputaci nebo ověření
  telefonu; nevyžadovat telefon bez prokázané potřeby.

App Check omezuje neautorizované klienty, ale sám o sobě není CAPTCHA ani úplná
ochrana proti replay útokům a farmám skutečných zařízení.
Android App Check debug tokeny, Play Integrity a produkční podpis i iOS App
Attest zůstávají podmínkami pozdějších mobilních vydání.

## 3. Důvěryhodná serverová brána pro obsah — MVP

Serverové vytváření Shoutu je lokálně implementované v `functions/create_shout.js`
a exportované jako callable `createShout` v regionu `europe-west3` s povinným
App Check. Autor, avatar, čas, nulové čítače, veřejné zaokrouhlení polohy a
geohash vznikají na serveru. Business používá aktivní ověřenou pobočku a
aktivní profil. Shout, rate limit a idempotentní záznam vznikají v jedné
transakci. Limity odpovídají současným Rules (50/500 za den, 120/1 sekund).
16 Functions unit testů a 68 emulatorových testů (64 Rules + 4 serverové)
prošlo; emulator zahrnuje souběžné retry a souběžné odlišné požadavky.
Vývojový web již používá callable a Business i osobní průchod prošly živými
testy popsanými výše. Přímé vytváření v Rules zatím není uzavřené. Zbývá
retence serverových idempotentních záznamů sladěná s mazáním
účtů a převod ostatních obsahových operací. Milník zůstává otevřený.

Ve větvi `feature/server-comment-creation` je připravená callable
`createComment` a klientský přepínač `serverCommentCreation` (výchozí `false`,
vývojová konfigurace jej zapíná pro výslovně schválený rollout). Server atomicky vytvoří komentář
nebo veřejnou odpověď, zvýší čítač, spotřebuje existující limit 60/h s odstupem
10 s a zapíše idempotentní potvrzení i slučovaná oznámení podle preferencí.
Ověřuje aktivní Shout, rodiče ve stejném Shoutu a společnou Auth/App Check
bránu. Autor, čas a příjemci oznámení pocházejí ze serveru. Retry neobnoví ani
smazaný komentář a neúčtuje další událost. Klient při chybě callable nemá
přímý fallback a zachovává klíč konceptu; při odesílání nelze změnit koncept.
Prošlo 156 Flutter testů, 18 Functions unit testů, lint, celkový analyzátor,
9 cílených testů webových nástrojů, 75 emulatorových testů (64 Rules, 4 Shout
a 7 komentářových), vývojový release build a lokální kontrola nasazovacího cíle.
Schválený rollout následně prošel: `createComment` je `ACTIVE`, revize
`createcomment-00001-lep`, ze zdrojů `4dce3d2`, v `europe-west3` s 256 MiB,
15 s a max. jednou instancí/souběžným požadavkem. `createShout` zůstala na
stejné revizi. Vývojový Hosting commitu `9d85327` má verzi `4333ea9ad939c510`;
otisky nasazených souborů odpovídají buildu. CI `40230321972` i `40230718884`
prošlo. Živě vznikl komentář i veřejná odpověď se serverovým autorem, správným
rodičem, nulovými čítači reakcí a odpovídajícími receipt; limit i čítač Shoutu
se zvýšily právě o dvě. Oba testovací komentáře byly odstraněné a databázový
čítač je zpět na původní hodnotě. Oznámení mezi různými účty pokrývá emulator,
nikoli tento živý průchod na vlastním Shoutu.

Navazující oprava detailu po smazání komentáře používá čítač vrácený
úspěšnou transakcí. Původně se aktualizoval seznam i databáze, ale karta Shoutu
v otevřeném detailu zobrazovala staré číslo. Oprava nepřidává čtení a zachovává
atomický zápis i současné Rules. Commit `4a1a7a0` prošel 156 Flutter testy,
celkovým analyzátorem, release buildem a CI `40355266790`. Dne 26. října byl
nasazen pouze na vývojový Hosting jako verze `d70f5fa95b367f22`; otisky HTML,
JavaScriptu a konfigurace odpovídají buildu. Functions se znovu nenasazovaly.
Závěrečný automatizovaný průchod se v nové prohlížečové relaci nedokončil;
při startu relace byla zaznamenána `appCheck/recaptcha-error`, žádný testovací
komentář nevznikl. Příčina čekajícího odeslání není potvrzená. Vlastník následně
ručně potvrdil správný přechod 0 → 1 → 0 ve stejném otevřeném detailu bez
návratu na feed. Oprava čítače je tím živě ověřená. API App Check zůstává
`ENABLED`; prázdná výměna tokenu správně vrací `400 INVALID_ARGUMENT`.

Dne 25. října 2026 vznikl testovaný společný základ
`functions/callable_security.js`. Vyžaduje Auth, ověřený e-mail a App Check a
kontroluje profil, aktuální právní souhlas, ban, žádost o smazání a podle typu
operace omezení tvorby. Podporuje Firestore transakci jako reader; nyní ji
používá vývojový endpoint `createShout`. Functions lint a testy jsou
nově v CI na Node.js 22; přímé Firebase závislosti a bezpečné tranzitivní verze
byly aktualizované a `npm audit --omit=dev` hlásí nula nálezů.

Ve větvi `feature/server-private-replies` je od 26. října připravená callable
`createPrivateReply` a nezávislý klientský přepínač `serverPrivateReplyCreation`
(výchozí `false`, vývojová konfigurace jej zapíná pro schválený rollout). Podporuje odpověď na Shout,
na veřejný komentář a na přijatou soukromou odpověď. Příjemce i přezdívky
odvozuje server z daného cíle a profilů. Pokračování soukromé konverzace
vyžaduje ID zdrojové zprávy ve stejném Shoutu a ověřuje příjemce i oba účastníky.
Soukromá odpověď, limit 60/h s odstupem 10 s, idempotentní potvrzení a oznámení
vznikají atomicky. Text není v receipt ani oznámení; veřejný čítač komentářů
se nemění. Retry neobnoví smazanou zprávu. Klient při chybě nepoužije přímý
fallback. Přepnutí ze soukromé na veřejnou odpověď nově vyčistí soukromý cíl.
Lokálně prošlo 158 Flutter testů, analyzátor, Functions lint, 20 unit testů,
9 cílených testů webových nástrojů a 84 emulatorových testů (65 Rules a 19
serverových, z toho 8 scénářů soukromých odpovědí). Vývojový release build a
lokální kontrola cíle nasazení prošly. CI `40359475834` prošlo. Vlastník
samostatně schválil vývojové nasazení nové Function, zapnutí klienta a živý
test mezi dvěma testovacími účty včetně úklidu. Vývojový rollout je dokončený.
Function je nasazená jako `createprivatereply-00001-baw`, Node.js 22, 256 MiB,
15 s a max. jedna instance/souběžný požadavek. Původní dvě Functions nebyly
aktualizované. Hosting commitu `9545946` má verzi `ebede43dc57e569c`; otisky
odpovídají release buildu a CI aktivace `40360446321` prošlo. Živě prošly všechny
tři cíle mezi Business a běžným účtem: odpověď autorovi Shoutu, pokračování
přijaté soukromé zprávy v opačném směru a soukromá odpověď na veřejný komentář.
Serverová ID, kanonické identity, dvojice účastníků, receipt, limit a oznámení
bez textu byly ověřené čtením Firestore. Příjemce zprávu viděl a měl dostupnou
akci odpovědi. Přepnutí ze soukromé na veřejnou odpověď vytvořilo veřejný
komentář; tentýž text v soukromé kolekci nevznikl.
Po ověření se jednou transakcí odstranily 3 soukromé zprávy, 2 veřejné
testovací komentáře a 4 prokazatelně čistě testovací agregáty oznámení. Původní
Shout zůstal zachovaný; databázový čítač i feed jsou zpět na výchozí nule.
Idempotentní receipt zůstávají zachované; jejich retence je nadále otevřená.

Krátký úsek 1 pro reakce na Shouty je implementovaný ve větvi
`feature/server-shout-reactions`: `functions/toggle_shout_reaction.js` obsahuje
samostatnou serverovou operaci pro kliknutí na like/dislike. Přidání, změna
i odebrání, čítače, společný limit `interaction` a receipt se zapisují atomicky.
Zůstává 120 interakcí/h a odstup 1 s, sdílený s dosavadními reakcemi a uložením.
Oznámení se vytváří jen při přidání nebo změně, respektuje preference a čerpá
jméno z veřejného profilu. Vlastní reakce a odebrání oznámení nevytvářejí.
Současné Rules dovolují reakce i na uchované neaktivní Shouty a při omezení
tvorby obsahu; tento úsek tato produktová pravidla nemění.
Retry stejného klíče neprovede toggle znovu a vrací historický výsledek z receipt.
Budoucí klient musí čítače i vlastní reakci zobrazovat z realtime zdrojů;
historická odpověď nesmí přepsat novější stav po akci téhož ani jiného uživatele.
Lokálně prošel Functions lint, 23 unit testů a 90 emulatorových testů
(65 Rules a 25 serverových, z toho 6 nových scénářů reakcí na Shout).
Navazující krátký úsek 2 přidává callable export a balení Function,
klientské napojení pouze pro Shouty a volitelný přepínač `serverShoutReactions`.
Přepínač je výchozí `false`; po souhlasu vlastníka jej vývojová konfigurace
zapíná pro samostatný rollout, produkční nikoli. Klient nepoužívá
přímý fallback; při nejasném selhání opakuje neměnný požadavek se stejným
klíčem, souběžné kliknutí na stejný Shout neodešle další toggle. Před změnou
na opačný palec nejprve dořeší původní nejasný požadavek. Čekající klíče žijí
jen v paměti dané relace, ne napříč obnovením stránky. Definitivní odmítnutí
(včetně limitu) umožní nový pokus s novým klíčem. Kontrola účtu je na klientu
i serveru. HTTP výsledek se do UI nepřenáší; feed používá dosavadní realtime
zdroje a detail při zapnutí přepínače odebírá dokument Shoutu a vlastní reakci
přes sdílené listenery. Reakce na komentáře nejsou součástí této změny.
Vlastník výslovně schválil samostatné vývojové nasazení a testy včetně úklidu.
Function ze zdrojů `5262784` je ve `shoutout-dev-46c81` `ACTIVE`, revize
`toggleshoutreaction-00001-lek` (256 MiB, 15 s, max. 1 instance/concurrency 1).
Předchozí tři Functions zůstaly na stejných revizích. Aktivační commit `eea077a`
prošel CI `40405135293` a je nasazený pouze na vývojovém Hostingu, verze
`a03706f90b97706c`, release `1793050577697000` z `2026-10-26T21:36:17.697Z`.
Otisky HTML, JavaScriptu a konfigurace odpovídají lokálnímu release buildu.
Bez App Check endpoint správně vrací 401. Automatická relace nejprve hlásila
`appCheck/recaptcha-error`; po ručním ověření vlastníkem prošel celý cyklus
nahoru → dolů → odebrání běžného i Business účtu. Šest serverových receipt
a limity odpovídají přesně šesti akcím, UI ve feedu/detailu ukazuje realtime
stav. Vlastní reakce nevytvořily oznámení; dvě Business oznámení autorovi měla
kanonickou identitu a byla po testu odstraněná. Dočasný Shout byl označen
`deleted`, oba cíle jsou zpět na nulových palcích, původní Shout zůstal zachovaný.
Test Shout je nyní po expiraci a přístupný v Mé shouty
→ Expirované; současná Rules i server dovolují reakce na uchovaný Shout.
Lokálně prošlo 167 Flutter testů, analýza i kontrola formátu, Functions lint
a 24 unit testů, 90 emulatorových testů a 10 testů konfigurace/nástrojů webu.
Vývojový release build webu a popsané živé průchody prošly. Retry po nejasném
síťovém selhání a souběhy jsou zatím doložené automatickými testy.
CI implementace `40370550763` prošlo. Aktivace lokálně prošla 11 testy webové
konfigurace Flutteru a všemi 16 testy vývojových nástrojů.
Firestore Rules se nemění; uzavření přímého vytváření a retence receipt
zůstávají společnými navazujícími podmínkami celé serverové brány.

Navazující serverová část reakcí na komentáře je lokálně připravená ve větvi
`feature/server-comment-reactions` (navazuje na připravené reakce na Shouty).
`toggleCommentReaction` používá tentýž přechod palců a společný limit
`interaction` 120/h s odstupem 1 s. Reakce, čítače komentáře, limit, receipt
a případné oznámení autorovi komentáře vznikají atomicky. Autor Shoutu není
příjemcem oznámení, pokud není současně autorem komentáře. Respektují se
preference a veřejná identita, odebrání ani vlastní reakce oznámení nevytváří.
Nový požadavek musí mít existující komentář i rodičovský Shout; osiřelý
komentář pod odstraněným rodičem se odmítne bez zápisů. Uchované expirované
nebo označené smazané Shouty a omezení tvorby obsahu neblokují reakce, stejně
jako v současných Rules. Bezpečnost účtu se kontroluje i při replay.
Samostatný namespace receipt brání kolizi stejného klíče s reakcí na Shout;
historická odpověď nesmí aktualizovat UI. Lokálně prošel lint, 26 Functions
unit testů a 97 emulatorových testů (65 Rules + 32 serverových, z toho
7 nových scénářů komentářových reakcí), také příprava a syntaxe artefaktu.
Function ze zdrojů `8a8d057` prošla CI `40408691708` a po souhlasu vlastníka
je nasazená pouze ve vývoji, revize `togglecommentreaction-00001-dit`,
256 MiB, 15 s, max. 1 instance/concurrency 1. Předchozí čtyři Functions se
nezměnily. Nezávislý `serverCommentReactions` má výchozí `false`; dev konfigurace
jej po souhlasu zapíná, produkční nikoli. Společný `ReactionGateway`
rozlišuje UID, Shout i komentář, drží
neměnný retry klíč v otevřeném detailu a slučuje souběžná kliknutí stejného
cíle. HTTP výsledek neaplikuje a při chybě nepoužije přímý fallback. Komentáře
využívají dosavadní realtime dotaz i odběr vlastní reakce. Klientské testy
ověřují izolaci Shoutu/komentářů, skutečné callable chyby a nejasný retry.
Prošlo 171 Flutter testů, analýza, formát, všech 17 testů vývojových nástrojů
a vývojový release build webu.
CI serverové části `40407708443` a klienta `40408691708` prošla. Další krok
je CI aktivačního commitu a již schválený vývojový Hosting a živé ověření
komentářových palců mezi testovacími účty včetně úklidu.
Produkční prostředí ani Rules se nemění.

- přesunout vytváření Shoutů, komentářů, soukromých odpovědí, reakcí, uložení
  a hlášení do callable Cloud Functions nebo Cloud Run,
- u každého požadavku ověřit Firebase Auth, App Check, stav účtu, právní
  souhlas, serverové limity a idempotency key,
- přidělit autora, přezdívku, čas, stav a souhrnné počty pouze na serveru,
- kontrolovat povolené kategorie, délku platnosti a vazby odpovědí,
- zaokrouhlit polohu na serveru a odvodit důvěryhodný prostorový/geohash klíč;
  nepřijímat přesnou veřejnou polohu vypočtenou pouze klientem,
- dotazovat feed přes prostorové buňky a stránkovací kurzory, ne globálním
  listenerem; klientský limit 50 ponechat,
- provádět čítače, rate limit a obsah v jedné transakci,
- stanovit bezpečné chování při opakování a částečném selhání požadavku.

Hotovo, když upravený klient nemůže podvrhnout autora, čas, polohu, čítač,
limit ani vytvořit více obsahů jedním oprávněným zápisem.

## 4. Antispam a obsahová moderace — MVP

- normalizovat text před kontrolou a detekovat opakovaný/velmi podobný obsah,
  zakázané odkazy, zahlcení, podvodné vzory a obcházení znaků,
- zavést limity napříč účty, IP a zařízeními a oddělené prahy pro registraci,
  Shouty, komentáře, soukromé odpovědi, reakce a hlášení,
- přidat reputaci účtu, věk účtu a postupné uvolňování limitů,
- u rizikového obsahu použít stav `pending` a moderátorskou frontu,
- ukládat vysvětlitelný důvod automatického zásahu a umožnit odvolání,
- měřit falešně pozitivní zásahy a pravidla upravovat podle dat,
- nikdy nespoléhat pouze na klientské skrytí obsahu nebo počet dislike.
- pravidelně deaktivovat a následně mazat záznamy postihů podle `purgeAt`;
  aktivní omezení tvorby uchovávat v `contentRestrictions/{uid}` a úplné blokace
  v `bans/{uid}` pouze po dobu jejich platnosti,
- po smazání detailu postihu přepočítat klouzavé počty za 30, 180 a 365 dní;
  dlouhodobé statistiky uchovávat jen anonymně bez vazby na konkrétní účet,
- sladit retenční lhůty postihů s právními dokumenty před produkčním nasazením.

## 5. Důvěryhodné moderátorské operace a audit — MVP

- ponechat přidělení moderátora pouze v Admin SDK nebo jiném chráněném toku,
- přesunout varování, bany, odstranění obsahu a uzavření hlášení do jedné
  idempotentní serverové operace,
- zabránit běžnému klientovi obejít ban nebo zfalšovat auditní údaje,
- ukládat kdo, kdy, proč a nad čím zásah provedl, bez nadbytečných osobních dat,
- omezit četnost moderátorských akcí a chránit citlivé exporty,
- přidat druhé potvrzení pro nevratné nebo hromadné zásahy.

## 6. Zpracování žádosti o smazání účtu — MVP

Klient po opětovném zadání hesla zapisuje `accountDeletionRequests/{uid}` a
ihned odstraňuje Firebase Authentication účet, aby bylo možné e-mail znovu
registrovat. Serverová automatizace musí:

- atomicky převzít žádost a zaznamenat stav zpracování,
- okamžitě skrýt veřejný obsah uživatele,
- ověřit, že Authentication účet již neexistuje, a bezpečně dořešit
  případné částečné selhání klientského toku,
- uvolnit nebo bezpečně rezervovat přezdívku podle produktové politiky,
- odstranit nepotřebná soukromá data,
- uchovat pouze nezbytné bezpečnostní záznamy po deklarovaných 60 dnů,
- po lhůtě data odstranit nebo nevratně anonymizovat,
- bezpečně opakovat zpracování po částečném selhání,
- vytvořit auditní výsledek bez nadbytečných osobních údajů.

Hotovo, když integrační test pokryje běžnou žádost, opakované spuštění,
částečné selhání a dokončení 60denní retence.

## 7. Exspirace a mazání Shoutů — MVP

- pravidelně vyhledat Shouty po skončení platnosti podle serverového času,
- změnit stav na expirovaný bez spoléhání na čas zařízení,
- po sedmi dnech odstranit Shout i všechny podkolekce,
- respektovat obsah zadržený kvůli hlášení nebo právnímu požadavku,
- zabránit osiřelým komentářům, reakcím, uložením a soukromým odpovědím,
- měřit počet úspěšných, opakovaných a chybných zpracování.

Firestore podkolekce automaticky nemaže.

## 8. Push notifikace a centrum oznámení — Po MVP

- [x] schválený model Follow, centrum oznámení a kategorie uživatelských
  preferencí,
- [x] oznámení uvnitř aplikace pro reakci na Shout, komentář na Shout,
  odpověď na komentář, soukromou odpověď a reakci na komentář,
- [x] respektovat preference v `users/{uid}/settings/notifications`,
- přidat Firebase Cloud Messaging a správu tokenů zařízení,
- ukládat tokeny pouze pro vlastní účet a po odhlášení je odstranit/deaktivovat,
- odstraňovat neplatné tokeny,
- serverově vytvářet oznámení pro zajímavé Shouty, sledované profily/oblasti,
  varování a moderátorské události,
- nezobrazit obsah blokovaného uživatele v notifikaci,
- ukládat stav přečtení, slučovat opakované události a omezit četnost,
- striktně oddělit vývojové a produkční tokeny.

## 9. Monitoring, zálohy a závislosti — MVP

- zapnout hlášení pádů a serverových chyb bez úniku citlivých dat,
- alertovat na nárůst registrací, zamítnuté App Check požadavky, zápisy,
  hlášení, náklady a chyby automatizací,
- nastavit export/zálohování Firestore a pravidelně testovat obnovu,
- definovat retenci logů, auditů, reportů a exportů,
- otestovat nákladové stropy pro dotazy, listenery a plánované úlohy,
- pravidelně spouštět `flutter pub outdated`, `npm audit` a aktualizace,
- před použitím administračních Node nástrojů v CI/produkci vyřešit nebo
  formálně posoudit zbývající tranzitivní nálezy v aktuálních Google
  závislostech; nepoužívat automatický `npm audit fix --force`, pokud by
  provedl neověřený downgrade.

## 10. Předprodukční bezpečnostní kontrola — MVP pro web

- právní texty odpovídají skutečně nasazeným retenčním procesům,
- provozovatel a kontaktní adresy jsou skutečné a funkční,
- produkční web má vlastní správnou Firebase konfiguraci,
- App Check a reCAPTCHA jsou nejdřív ověřené v metrikách a potom vynucené,
- všechny serverové úlohy mají emulátorové a integrační testy,
- existuje postup nasazení, rollbacku, obnovy a incident response,
- proběhne kontrola Firestore Rules, IAM, service accounts, záloh, logů,
  tajemství a závislostí; Android podpis se ověří před mobilním vydáním,
- produkce neobsahuje `@shoutout.test` účty ani demo data z Litoměřic.
