# Serverový a produkční plán webového MVP

Tento dokument zachovává podrobné požadavky a výstupní kritéria původního plánu.
Aktuální splnění ověřujte v [PROJECT_STATUS](PROJECT_STATUS.md), priority v [TODO](TODO.md).
Dokončené provozní kroky a starší pokusy jsou v [úplném archivu](archive/TODO_2026-10-29.md).
Seznam požadavků neznamená, že všechny jeho části dosud chybějí; stav je oddělený od specifikace.
Rozsah MVP, limity, role, ceny ani oprávnění se tímto přesunem nemění.

## Obsah

- [1. Oddělit vývojové a produkční prostředí — MVP pro web](#environments)
- [2. App Check, registrace a ochrana proti farmám účtů — MVP pro web](#app-check)
- [3. Důvěryhodná serverová brána pro obsah — MVP](#gateway)
- [4. Antispam a obsahová moderace — MVP](#antispam)
- [5. Důvěryhodné moderátorské operace a audit — MVP](#moderation)
- [6. Zpracování žádosti o smazání účtu — MVP](#account-deletion)
- [7. Exspirace a mazání Shoutů — MVP](#lifecycle)
- [8. Push notifikace a centrum oznámení — Po MVP](#notifications)
- [9. Monitoring, zálohy a závislosti — MVP](#operations)
- [10. Předprodukční bezpečnostní kontrola — MVP pro web](#launch-security)

## Serverová a produkční část webového MVP a navazujícího vývoje

Následující body nelze spolehlivě dokončit pouze ve Flutter klientovi nebo
vyžadují produkční Firebase/Google Cloud konfiguraci. Části označené **MVP**
se vztahují na veřejnou webovou aplikaci; mobilní providery, podpisy a push
notifikace následují po MVP. Klientský kód není důvěryhodná bezpečnostní
hranice a upravená aplikace jej může obejít.

## Výchozí klientská a Rules ochrana

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

Část zápisů již používá serverovou bránu; přesný poslední ověřený stav je v PROJECT_STATUS.md.

<a id="environments"></a>

## 1. Oddělit vývojové a produkční prostředí — MVP pro web

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

<a id="app-check"></a>

## 2. App Check, registrace a ochrana proti farmám účtů — MVP pro web

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

<a id="gateway"></a>

## 3. Důvěryhodná serverová brána pro obsah — MVP

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

Nový požadavek z 31. října 2026 doplňuje [read/refresh kontrakt feedu](FEED_READ_REFRESH_PLAN.md).
Nejdřív schválit [rozdělení do etap](FEED_IMPLEMENTATION_STAGES.md): navržené
A0–A3 řeší před MVP plný detail, kontrakt relace, prostorový feed a ruční obnovu;
B1–B4 s osobním přečtením a číslovanými novinkami jsou navržené po MVP.
Geo kurzory připravit na budoucí osobní pořadí, ale neimplementovat celé B předem. Samotné
seřazení jedné stránky ani globální čítač novinek nezaručují splnění zadání.
Osobní přečtení je soukromé klientské nastavení, nikoli důvěryhodná veřejná
metrika zobrazení. Původní bezpečnostní kritéria této brány zůstávají platná.

<a id="antispam"></a>

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

<a id="moderation"></a>

## 5. Důvěryhodné moderátorské operace a audit — MVP

- ponechat přidělení moderátora pouze v Admin SDK nebo jiném chráněném toku,
- přesunout varování, bany, odstranění obsahu a uzavření hlášení do jedné
  idempotentní serverové operace,
- zabránit běžnému klientovi obejít ban nebo zfalšovat auditní údaje,
- ukládat kdo, kdy, proč a nad čím zásah provedl, bez nadbytečných osobních dat,
- omezit četnost moderátorských akcí a chránit citlivé exporty,
- přidat druhé potvrzení pro nevratné nebo hromadné zásahy.

<a id="account-deletion"></a>

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

<a id="lifecycle"></a>

## 7. Exspirace a mazání Shoutů — MVP

- pravidelně vyhledat Shouty po skončení platnosti podle serverového času,
- změnit stav na expirovaný bez spoléhání na čas zařízení,
- po sedmi dnech odstranit Shout i všechny podkolekce,
- respektovat obsah zadržený kvůli hlášení nebo právnímu požadavku,
- zabránit osiřelým komentářům, reakcím, uložením a soukromým odpovědím,
- měřit počet úspěšných, opakovaných a chybných zpracování.

Firestore podkolekce automaticky nemaže.

<a id="notifications"></a>

## 8. Push notifikace a centrum oznámení — Po MVP

- Hotovo: schválený model Follow, centrum oznámení a kategorie uživatelských
  preferencí,
- Hotovo: oznámení uvnitř aplikace pro reakci na Shout, komentář na Shout,
  odpověď na komentář, soukromou odpověď a reakci na komentář,
- Hotovo: respektovat preference v `users/{uid}/settings/notifications`,
- přidat Firebase Cloud Messaging a správu tokenů zařízení,
- ukládat tokeny pouze pro vlastní účet a po odhlášení je odstranit/deaktivovat,
- odstraňovat neplatné tokeny,
- serverově vytvářet oznámení pro zajímavé Shouty, sledované profily/oblasti,
  varování a moderátorské události,
- nezobrazit obsah blokovaného uživatele v notifikaci,
- ukládat stav přečtení, slučovat opakované události a omezit četnost,
- striktně oddělit vývojové a produkční tokeny.

<a id="operations"></a>

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

<a id="launch-security"></a>

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

<a id="data-reconciliation"></a>

## Kontrola starších dat – stav k potvrzení

Dokončení tohoto původního kroku není potvrzené. Před případným provedením
ověřit současná data, oprávnění a vývojové prostředí. Tehdejší informace
o chybějícím klíči zůstává pouze v archivu.

## Nejbližší ruční krok ve vývojovém projektu

- bezpečně získat omezený Admin SDK klíč pouze pro vývojový projekt,
- nastavit `FIREBASE_SERVICE_ACCOUNT_PATH` na jeho lokální cestu,
- spustit `cd tools && npm run reconcile:data`,
- zkontrolovat souhrnné počty reakcí, uložení a komentářů na starých datech
  a zaokrouhlení jejich veřejné polohy,
- klíč po dokončení odstranit z pracovního počítače nebo uložit do schváleného
  správce tajemství; nikdy jej necommitovat.

Skript tento krok záměrně odmítne pro jiný projekt než `shoutout-dev-46c81`.
