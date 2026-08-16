# ShoutOut – společný projektový backlog

## Nové podněty z uživatelského testování

- [ ] **Umožnit otevřít veřejný profil autora z komentáře.**
  - Přezdívka a avatar v komentáři musí mít stejné chování jako autor na kartě
    Shoutu; vlastní profil nesmí nabízet Follow, blokaci ani nahlášení sebe sama.
- [ ] **Přidat veřejné flairy rolí.**
  - Za jménem zobrazit malý obdélníkový štítek pro `Business`, `Moderátor`,
    `Admin` a `Owner`; interní role `seniorModerator` se navenek zobrazí jako
    `Moderátor`.
  - Pokud je Business účet současně autorem Shoutu, zobrazit vedle sebe flair
    `Business` i existující štítek `Autor`.
  - Dlouhé jméno zkrátit třemi tečkami ještě před flairy; flairy se nesmí
    zmenšit, zalomit ani vytlačit mimo kartu.
- [ ] **Přepracovat onboarding na interaktivní tutorial.**
  - Nahradit dlouhé úvodní rady krátkými kontextovými kroky typu „klikni sem“,
    „udělej toto“ a „pokračuj tady“ přímo nad skutečným rozhraním.
  - Umožnit přeskočení, pozdější opakování a pokračování po přerušení; měřit
    dokončení kroků bez ukládání přesné polohy.
- [ ] **Doplnit uživatelskou zpětnou vazbu a metriky obsahu.**
  - Navrhnout důvěryhodné počítání zobrazení Shoutu a zobrazit autorovi počet
    zobrazení, uložení a dalších relevantních interakcí.
  - Vyřešit unikátní versus celková zobrazení, ochranu proti farmení, soukromí,
    retenci a serverové počítání před použitím metrik pro karmu.
- [ ] **Provést cílenou kontrolu překladů hlášení chyb a průvodce aplikací.**
  - Opravit stav, kdy tyto části v některých podporovaných jazycích zůstávají
    česky; tím se znovu otevírá dříve odškrtnutý obecný audit překladů.
- [ ] **Opravit ciferník platnosti v dialogu Nový Shout.**
  - Příčina potvrzena v `_DurationWheel`: podmínka `value > 24` nerozlišuje
    hodinový a minutový sloupec. Minutové volby 30 a 45 proto formátuje jako
    `Duration(hours: 30/45)`, tedy například „1 den 6 h“ a „1 den 21 h“.
  - Formát celých dnů používat pouze pro hodinový ciferník; minutový ciferník
    musí vždy zobrazit `00`, `15`, `30` a `45 min`. Referenční fotku lze doplnit
    při implementaci pro vizuální kontrolu výsledku.
- [ ] **Přepracovat rozložení společné Shout karty.**
  - Zachovat avatar; zvětšit jméno autora a pod něj úsporně umístit vzdálenost,
    čas vložení a expiraci.
  - Flair zobrazit u jména a akci Uložit Shout zachovat snadno dosažitelnou.
  - Ověřit limit nadpisu podle skutečné šířky a podporovaných jazyků.
  - Text ve feedu zobrazit nejvýše na tři řádky, přetečení zakončit třemi
    tečkami a celý text ukázat v detailu.
  - Zmenšit category chips bez ztráty čitelnosti a přístupnosti.
  - Zachovat like/dislike a ověřit práh automatického skrytí: skrytý Shout musí
    být možné vědomě rozbalit kliknutím.
- [ ] **Navrhnout ekonomiku karmy, coinů a kosmetického obchodu.**
  - Rozhodnout vztah karmy, zobrazení, liků a coinů a obsah obchodu, například
    premium avatary. Snadno farmitelné počty nesmí dávat odměny bez serverové
    validace a ochrany proti zneužití.
- [ ] **Omezit Business promo na nejvýše dva současně aktivní Shouty na firmu.**
  - Limit vynucovat serverově napříč všemi pobočkami a typy propagace; určit,
    zda kombinované zvýraznění s okénkem spotřebuje jeden aktivní promo slot.
- [ ] **Navrhnout Founder balíček pro nové podniky.**
  - Founder entitlement vést odděleně od veřejné role a flairu; oprávněný účet
    nikdy nespotřebovává tokeny za premium Business funkce.
  - Určit podmínky přidělení, počáteční množství coinů/tokenů, převoditelnost,
    expiraci, audit a ochranu proti zneužití.
- [x] **Zvýrazněné Business Shouty a propagační okénko jsou implementované.**
  - Tato položka opravuje starší duplicitní nezaškrtnuté položky níže v backlogu;
    zbývá ruční ověření a budoucí důvěryhodné serverové měření.
- [ ] **Naplánovat pořízení evropské ochranné známky ShoutOut.**
  - Zahrnout rešerši kolizí, vlastníka, relevantní třídy, rozpočet, termín podání
    u EUIPO a odbornou právní kontrolu před podáním.

Interní pravidla rolí, pravomocí a postihů jsou vedena v
`docs/INTERNAL_MODERATION.md`. Změny moderace musí aktualizovat také tento
dokument, pravidla, testy a případně veřejné právní texty.

## Stav dokončení backlogu

Aktualizováno 14. srpna 2026.

`███████████████████████████░░░░░░░░░░░░░` **68 %** — pokročilá fáze

Hotovo je 77 ze 114 evidovaných úkolů. Procento počítá každý řádek s checkboxem
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
- [ ] Zapnout Geocoding API, nastavit `GOOGLE_MAPS_API_KEY` jako Functions secret
  a nasadit Functions, pravidla a indexy.
- [ ] Spustit backfill a zkontrolovat země, kde Google neposkytne ISO 3166-2;
  případné mapování udržovat v serverové vrstvě.
- [ ] Po migraci rolí odstranit výjimku pro staré role bez `moderationScope`.

Toto je jediné místo pro otevřené produktové, grafické, lokalizační, serverové
a produkční úkoly projektu. Samotné zapsání bodu neznamená, že je
implementovaný.

## Brána před veřejným spuštěním

- [ ] Splnit předstartovní bránu v `docs/LAUNCH_READINESS.md`. Tento dokument
  sdružuje produkční, bezpečnostní, právní, distribuční, testovací a provozní
  předpoklady. Jednotlivé implementační úkoly zůstávají v tomto backlogu.
- [ ] Marketingový pilot zahájit až po splnění startovní brány a dále jej řídit
  samostatným plánem `docs/local/ShoutOut_marketingovy_plan_spusteni.docx`.

## Aktuální produktové úpravy

Otevřené produktové úkoly řešit v pořadí následujících etap. Pořadí drží
diagnostiku a společný datový základ před obrazovkami, které na nich závisejí;
odložené nápady až za hlavními uživatelskými cestami.

### Etapa 1 – stabilita, poloha a základní chování

- [ ] **Zjistit, proč mimo Litoměřice nešlo vytvořit Shout.**
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
  - [ ] Dokončit ruční kontrolu na fyzickém zařízení s běžným účtem mimo
    Litoměřice; dosavadní opakované pokusy uživateli procházejí.
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
  - [ ] Po zapnutí fakturace nasadit připravenou Firestore TTL konfiguraci pro
    fyzické odstranění `clientErrorLogs` a `technicalLogAccessAudits`; Spark plán
    aktivaci TTL odmítá, do té doby jsou starší záznamy bezpečně nečitelné.
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
  - [ ] Samostatně ověřit přirozeně expirovaný odkaz po uplynutí jeho platnosti;
    tento časový test neblokuje hlavní tok obnovy hesla.
  - [ ] Po připojení vlastní domény přepnout globální Firebase Authentication
    Action URL na připravený `/auth/action`. Handler už bezpečně obsluhuje
    ověření e-mailu, reset hesla i obnovení změněné adresy; výchozí domény
    projektu Firebase při ukládání vlastní Action URL odmítá.
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
- [ ] **Napojit připravené obrázky v „Nahlásit chybu“ po přechodu na placený plán.**
  - Umožnit náhled, odebrání a bezpečný upload screenshotu se stavem průběhu.
  - Stanovit limit typu/velikosti, retenci, přístup podpory a upozornění na možné
    osobní údaje; obrázek nepřikládat bez výslovného potvrzení uživatele.
  - Kód je připravený: JPG/PNG/WebP do 5 MB, náhled, odebrání, potvrzení obsahu,
    průběh uploadu, retence 60 dní a čtení pouze administrátorem nebo ownerem.
  - Firebase Storage na projektu Spark nelze inicializovat. Do přechodu na
    placený plán je tlačítko skryté a zůstává funkční textové hlášení.
  - Aktivační a ověřovací postup je v `docs/FIREBASE_STORAGE_SETUP.md`.

### Etapa 4 – životnost obsahu a business účty

- [x] **Rozhodnout pravidla životnosti Shoutu před změnou expirace.**
  - Schválené chování, budoucí zpoplatnění a serverové požadavky jsou vedené
    pouze v `docs/BUSINESS_MONETIZATION.md`.
  - Vyhodnotit dopad na feed, zvýrazněné Shouty, cenu/zneužití business účtů,
    moderaci, notifikace, indexy, pravidla a serverové mazání.
- [ ] **Rozšířit návrh business účtu o provozovnu a ověření.**
  - Globální cílový návrh, úrovně důvěry, regionální adaptéry, rizikový model,
    datový model a postup zavádění jsou v `docs/BUSINESS_VERIFICATION.md`.
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
  - IČO nejprve ověřit serverově přes ARES a uložit oficiální název, právní formu,
    stav a sídlo jako neměnný snímek žádosti. ARES ověřuje subjekt, nikoli právo
    konkrétního uživatele za něj jednat.
  - Oprávnění konkrétní osoby jednat za firmu neověřovat jako u finanční služby.
    Automaticky potvrdit jednorázový odkaz na firemní e-mail a stav označit jako
    „Registrovaný business účet“; telefon, DNS ani dokumenty nepoužívat.
  - Přijmout jakýkoli funkční kontaktní e-mail včetně veřejných služeb jako Gmail
    nebo Seznam. Potvrzení prokazuje jen dosažitelnost kontaktu, nikoli oprávnění
    uživatele právně jednat za firmu.
  - Stavový tok: `checking` → `contact_pending` → `active` / `suspended` /
    `rejected`; běžný proces je bez ručního schvalování.
  - Ruční zásah použít jen při sporu o profil, hlášení vydávání se za firmu,
    známé značce nebo zjevné neshodě údajů.
  - Ověření obnovit při změně IČO nebo právního subjektu, pravidelně kontrolovat
    stav v ARES a umožnit administrátorovi okamžité pozastavení s auditním záznamem.
  - Implementovat automatickou žádost, stav ověření, audit a odebrání business
    role; ruční zásah ponechat jen pro spory, duplicity a zneužití známých značek.
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
  - [ ] Při budoucí serverové aktivaci business žádosti atomicky převést údaje
    první provozovny do `businessProfiles/{uid}/locations/{locationId}`; bez
    úspěšného vytvoření provozovny účet neoznačit jako aktivní.
  - [x] Pro dobu před serverovou automatizací přidat vývojový Admin SDK nástroj
    s dry-runem a explicitním potvrzením, který po ověření e-mailu a ruční
    kontrole atomicky vytvoří roli 2, Business profil a první pobočku.
  - [x] Přidat administrátorům a ownerovi frontu ověřených Business žádostí;
    ruční schválení atomicky vytvoří roli, profil, pobočku a audit.
  - [x] Nabídnout všechny země a území podle ISO 3166 s lokalizovaným vyhledáváním;
    Česko, Německo, Polsko, Slovensko a další prioritní evropské země řadit nahoru.
  - [x] Doplnit překlady všech business obrazovek a validačních/chybových textů
    do všech sedmi jazyků aplikace (čeština, angličtina, němčina, polština,
    slovenština, ukrajinština a vietnamština); názvy zemí přebírat lokalizovaně
    z udržovaného ISO seznamu.
  - [ ] Přidat aktivním Business účtům vlastní logo místo systémového avatara.
    - [x] Připravit lokální editor s posunem a zoomem, kruhovým náhledem,
      kontrolou formátu, 10MB limitem a minimálním rozlišením 512 × 512 px.
      Ukládaný výsledek je nový 512 × 512 PNG bez původních metadat a částí
      mimo výřez; všechny texty jsou dostupné v sedmi jazycích.
    - [x] V úpravě avatara zobrazit pouze Business účtům vizuálně neaktivní
      tlačítko **Nahrát vlastní logo** s lokalizovanou informací, že funkci
      připravujeme. Běžné účty tuto volbu nevidí.
    - [ ] Po zapnutí Firebase Storage doplnit pravidla, cestu souboru, cache
      invalidaci a bezpečné odstranění předchozí verze a tlačítku předat hotovou
      ukládací callback funkci. Výběr, editor a 512px převod už jsou zapojené.
  - [ ] Napojit serverové ověření českého IČO přes ARES, italské Partita IVA přes
    VIES a následné automatické přidělení role až po úspěšné kontrole. Pokud pro
    zemi není dostupné bezplatné rozhraní, přijmout ručně vyplněný identifikátor
    a žádost ponechat k ruční kontrole.
  - [ ] Implementovat odložené platební kroky až po splnění předpokladů a podle
    jednotného návrhu v `docs/BUSINESS_MONETIZATION.md`.
  - [x] Přidat Business checkbox **Na více než 24 hodin**, po jehož zapnutí
    pokračuje výběr po celých dnech až na 7 dní; server dovolí delší expiraci
    pouze Business účtu.
  - [x] Implementovat schválené Business premium funkce bez tokenové platby:
    platnost až 7 dní zachovat zdarma, doplnit zvýrazněný Shout a propagační
    okénko. Nárok a použití ukládat odděleně od budoucí platby, aby pozdější
    tokeny změnily pouze autorizační/účetní krok, nikoli uživatelský tok.
  - [ ] Po zapojení důvěryhodného serveru měřit unikátní dosah, celková
    zobrazení a rozkliknutí propagačních okének; v Business → Propagace zobrazit
    také vypočtenou míru prokliku. Vzdálenostní pásma se nesledují.

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
- [ ] **Napojit Follow a uživatelské preference na oznámení.**
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
  - [ ] Přes Cloud Functions rozesílat nový Shout sledovaného profilu a později
    relevantní Shouty v okolí; tyto události mají více příjemců a klient je
    nesmí rozesílat sám.
  - [ ] Přidat FCM push mimo otevřenou aplikaci, systémová/moderátorská
    oznámení a omezení četnosti.

### Etapa 6 – gamifikace a odložené nápady

- [ ] **Navrhnout karmu, achievementy a kosmetické odměny.**
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
  - [ ] Volitelně později zvážit žebříček pouze mezi sledovanými profily; před
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

- [ ] **Provést kompletní audit překladů.**
  - Najít texty zapsané přímo ve widgetech a přesunout je do lokalizace.
  - Porovnat úplnost všech klíčů pro češtinu, angličtinu, němčinu, polštinu,
    slovenštinu, ukrajinštinu a vietnamštinu.
  - Zkontrolovat přihlášení, registraci, validace, feed, detail Shoutu,
    komentáře, soukromé odpovědi, uložené položky, Mé Shouty, profil,
    nastavení, právní obrazovky, moderaci, dialogy a chybové hlášky.
  - Ověřit přetékání textů, diakritiku, množná čísla a texty na menším displeji.
  - Při testování lokalizace zachovat funkční načítání Shoutů podle polohy
    v emulátoru.

### Business účty a webová správa

- [ ] **Vytvořit business účet.**
  - Navázat na rozhodnutí o životnosti Shoutů, model provozovny a schválený
    proces ověření z etapy 4.
- [x] **Přidat zvýrazněné Shouty.**
- [x] **Přidat propagační okénko.**
- [x] **Vytvořit webové rozhraní pro administrátory a moderátory.**
  - Jednotné přihlášení a navigace podle role 3–6.
  - Regionální přehled Shoutů, společná fronta hlášení, seskupování a řazení.
  - Detail případu, rozhodovací roletka, postihy, schválení obsahu a eskalace
    senior moderátorovi.
  - Přímé otevření nahlášeného komentáře v kontextu vlákna se zvýrazněním.
  - Historie postihů, uživatelský detail a zrušení oprávněného aktivního postihu.

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
- [ ] Před veřejným sdílením mimo uzavřený test rozhodnout o omezení registrace,
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
  - [ ] Na Macu sestavit nepodepsaný iOS build a odstranit případné chyby nativních
    závislostí; ve Windows tento krok nelze spolehlivě provést.
  - [ ] Přes Xcode s Apple Personal Team nainstalovat debug build na vlastní
    iPhone, zaregistrovat App Check debug token a projít hlavní uživatelské cesty.
  - [ ] Pro distribuci vytvořit samostatnou produkční Firebase/Apple identitu,
    podpisy a App Store konfiguraci; vývojovou konfiguraci nepoužít veřejně.

### Navazující ruční test moderace

- [ ] Udělit varování běžnému uživateli a ověřit záznam v historii postihů.
- [ ] Udělit dočasné omezení tvorby a ověřit blokaci Shoutů i komentářů.
- [ ] Skrýt závadný komentář a ověřit jeho stav ve vlákně.
- [ ] Eskalovat případ senior moderátorovi a ověřit oddělení obou front.
- [ ] Senior rolí ověřit 90denní a trvalý ban.
- [ ] Označit obsah jako v pořádku a ověřit nemožnost dalšího hlášení.
- [ ] Ověřit zrušení dočasného postihu a zachování neměnné auditní historie.
- [x] Upravit generátor testovací fronty tak, aby závadný demonstrační obsah
  standardně nevytvářely účty moderátora, seniora, administrátora ani ownera.

## Odložená serverová a produkční část

Následující body nelze spolehlivě dokončit pouze ve Flutter klientovi nebo
vyžadují produkční Firebase/Google Cloud konfiguraci. Serverová část je vědomě
odložená až na závěr projektu. Klientský kód není důvěryhodná bezpečnostní
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

## 1. Oddělit vývojové a produkční prostředí

- vytvořit samostatný produkční Firebase projekt,
- vytvořit samostatné Android a webové Firebase aplikace,
- přidat build varianty/flavors a bezpečné přepínání konfigurace,
- zabránit spuštění seedovacích a migračních skriptů proti produkci,
- nepřenášet testovací účty ani demo data do produkce,
- vytvořit minimálně oprávněné service accounts pro nasazení a automatizace,
- uložit produkční Android keystore a hesla mimo Git a nastavit bezpečnou
  obnovu klíče,
- nastavit rozpočty, nákladové limity a upozornění,
- vytvořit kontrolovaný postup nasazení, návratu verze a částečného selhání,
- znovu prověřit, že service-account JSON ani klíče nejsou v historii Gitu.

Hotovo, když vývojový build ani skript nemůže omylem číst nebo měnit produkční
data a produkční release je podepsaný vlastním chráněným klíčem.

## 2. App Check, registrace a ochrana proti farmám účtů

- v Android vývojovém projektu zaregistrovat pouze potřebné App Check debug
  tokeny; nikdy je necommitovat,
- ověřit metriky platných/neplatných App Check požadavků a teprve potom
  postupně zapnout vynucení pro Firestore a podporované Authentication toky,
- dokončit Play Integrity konfiguraci pro produkční aplikaci a produkční
  podpisový certifikát,
- pro web vytvořit samostatný App Check provider a klíč reCAPTCHA
  Enterprise; klíč nesmí být použit jako tajemství na serveru,
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

## 3. Důvěryhodná serverová brána pro obsah

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

## 4. Antispam a obsahová moderace

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

## 5. Důvěryhodné moderátorské operace a audit

- ponechat přidělení moderátora pouze v Admin SDK nebo jiném chráněném toku,
- přesunout varování, bany, odstranění obsahu a uzavření hlášení do jedné
  idempotentní serverové operace,
- zabránit běžnému klientovi obejít ban nebo zfalšovat auditní údaje,
- ukládat kdo, kdy, proč a nad čím zásah provedl, bez nadbytečných osobních dat,
- omezit četnost moderátorských akcí a chránit citlivé exporty,
- přidat druhé potvrzení pro nevratné nebo hromadné zásahy.

## 6. Zpracování žádosti o smazání účtu

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

## 7. Exspirace a mazání Shoutů

- pravidelně vyhledat Shouty po skončení platnosti podle serverového času,
- změnit stav na expirovaný bez spoléhání na čas zařízení,
- po sedmi dnech odstranit Shout i všechny podkolekce,
- respektovat obsah zadržený kvůli hlášení nebo právnímu požadavku,
- zabránit osiřelým komentářům, reakcím, uložením a soukromým odpovědím,
- měřit počet úspěšných, opakovaných a chybných zpracování.

Firestore podkolekce automaticky nemaže.

## 8. Push notifikace a centrum oznámení

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

## 9. Monitoring, zálohy a závislosti

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

## 10. Předprodukční bezpečnostní kontrola

- právní texty odpovídají skutečně nasazeným retenčním procesům,
- provozovatel a kontaktní adresy jsou skutečné a funkční,
- každá podporovaná platforma má vlastní produkční Firebase konfiguraci,
- App Check a reCAPTCHA jsou nejdřív ověřené v metrikách a potom vynucené,
- všechny serverové úlohy mají emulátorové a integrační testy,
- existuje postup nasazení, rollbacku, obnovy a incident response,
- proběhne kontrola Firestore Rules, IAM, service accounts, Android podpisu,
  záloh, logů, tajemství a závislostí,
- produkce neobsahuje `@shoutout.test` účty ani demo data z Litoměřic.
