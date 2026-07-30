# ShoutOut – společný projektový backlog

Toto je jediné místo pro otevřené produktové, grafické, lokalizační, serverové
a produkční úkoly projektu. Samotné zapsání bodu neznamená, že je
implementovaný.

## Aktuální produktové úpravy

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

- [ ] **Přidat slovenštinu, ukrajinštinu a vietnamštinu.**
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
- Aktuální limity: Shout nejvýše 1 za 2 minuty a 10 za 24 hodin; komentář a
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

## 5. Důvěryhodné moderátorské operace a audit

- ponechat přidělení moderátora pouze v Admin SDK nebo jiném chráněném toku,
- přesunout varování, bany, odstranění obsahu a uzavření hlášení do jedné
  idempotentní serverové operace,
- zabránit běžnému klientovi obejít ban nebo zfalšovat auditní údaje,
- ukládat kdo, kdy, proč a nad čím zásah provedl, bez nadbytečných osobních dat,
- omezit četnost moderátorských akcí a chránit citlivé exporty,
- přidat druhé potvrzení pro nevratné nebo hromadné zásahy.

## 6. Zpracování žádosti o smazání účtu

Klient zapisuje `accountDeletionRequests/{uid}` a další používání účtu blokují
UI i Firestore Rules. Serverová automatizace musí:

- atomicky převzít žádost a zaznamenat stav zpracování,
- okamžitě skrýt veřejný obsah uživatele,
- zneplatnit relace a zakázat další přihlášení,
- odstranit nebo deaktivovat Firebase Authentication účet,
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

- přidat Firebase Cloud Messaging a správu tokenů zařízení,
- ukládat tokeny pouze pro vlastní účet a po odhlášení je odstranit/deaktivovat,
- odstraňovat neplatné tokeny,
- vytvářet oznámení pro relevantní komentáře, odpovědi, soukromé odpovědi,
  varování a moderátorské události,
- respektovat preference v `users/{uid}/settings/notifications`,
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
