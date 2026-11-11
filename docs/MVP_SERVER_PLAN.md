# Serverový a produkční plán webového MVP

## Aktuální stav a použití plánu

Souhrn k 11. listopadu 2026. Níže jsou kritéria dokončení, nikoli seznam
nových příkazů k provedení. Přesné nasazení: [PROJECT_STATUS](PROJECT_STATUS.md).
Prioritní pořadí: [TODO](TODO.md). Stavy milníků se nemění přepsáním tohoto textu.

| Oblast | Doložený stav | Zbývající brána |
|---|---|---|
| Prostředí | DEV/produkční konfigurace a oddělený app Hosting připravené. | Produkční runtime, přístupy a startovní brána. |
| App Check/registrace | DEV web provider a ochrana obsahových callable ověřené. | Produkce, metriky/enforcement a ochrana registrace. |
| Obsahová brána | Serverové DEV operace, timed idempotence, prostorové API/indexové writery, Home i úplné vlastní Aktivní/Expirované jsou nasazené; přímé Shout create/vote zápisy uzavřené. | Zbývající klientská regrese Uložených, B1–B4 a ostatní níže uvedená kritéria. |
| Antispam | Existující serverové UID/rate limity jsou součástí obsahových operací. | Celá níže uvedená kritéria a ochrana registrace nejsou uzavřené. |
| Moderace | UI/Rules a některé obsahové operace existují. | Úplné důvěryhodné operace/atomický audit a Business postihy. |
| Mazání účtu | DEV dokončeno: serverové fáze/purge, klient, Rules cutover, společný UI/serverový test a úklid. | Produkční aktivace pod společnou vydávací bránou. |
| Životnost Shoutů | Exspirace mění status v DEV se společným indexovým writerem; od 11. listopadu je nasazený a ověřený zámek běžných interakcí podle expiresAt. | Sedmidenní fyzický úklid Shoutů a potomků včetně odpovídající indexové konzistence. |
| Push | Pozdější etapa. | Nezavádět do webového MVP bez změny rozsahu. |
| Provoz | Dosavadní pojistky neprokazují úplnou produkční připravenost. | Monitoring, zálohy/obnova a závislosti podle kritérií níže. |
| Bezpečnostní kontrola | Dílčí testy jsou doložené v TESTING. | Závěrečná předprodukční revize a odstranění/přijetí rizik. |

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
  listenerem; zachovat nejvýše 50 výsledků na stránku, nikoli celkový limit feedu,
- provádět čítače, rate limit a obsah v jedné transakci,
- stanovit bezpečné chování při opakování a částečném selhání požadavku.

Hotovo, když upravený klient nemůže podvrhnout autora, čas, polohu, čítač,
limit ani vytvořit více obsahů jedním oprávněným zápisem.

Nový požadavek z 31. října 2026 doplňuje [read/refresh kontrakt feedu](plans/feed/FEED_READ_REFRESH_PLAN.md).
Vlastník vybral celé A0–A3 i B1–B4 před MVP; viz
[etapy](plans/feed/FEED_IMPLEMENTATION_STAGES.md). Unread-first pouze v Nejblíž;
Top/Končící/Sledované zachovají vlastní řazení. R2 schválené: poslední bod otevřené aplikace s upozorněním, jinak výzva k poloze. Serverová varianta,
indexy a nákladové limity mají bránu před A2 po výsledku A1. Samotné
seřazení jedné stránky ani globální čítač novinek nezaručují splnění zadání.
Aktuálně schválený výběr stránek a jeho neuzavřené náklady jsou v
[progresivním plánu](plans/feed/FEED_PROGRESSIVE_PLAN.md); úplná příprava regionu před
první stránkou není zvolená. Od 7. listopadu jsou prostorové query API,
[sdílený index](plans/feed/FEED_BLOCK_INDEX_PLAN.md), writery/údržba i Home
skutečně zapojené v DEV; [nasazení a omezení](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#dev-rollout-results).
Úplný vlastní seznam, jeho UI regrese a původní fixture jsou uzavřené.
Oprava Uložených dbf2aad je po success CI 42932603771 na DEV webu;
před uzavřením A2/A3 zbývá její ruční UI potvrzení. Dva nové fixture mezitím
vypršely a byly uklizené včetně záložek/receipt i aktuálního indexu.
[Checkpoint](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression).
B1–B4 i ostatní požadavky serverové brány zůstávají otevřené.
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

DEV klient po opětovném zadání hesla připraví vlastní Shouty a nechá serverovou
finalizaci atomicky založit `accountDeletionRequests/{uid}`. Po ověřeném čtení
žádosti ze serveru odstraňuje Firebase Authentication účet, aby bylo možné e-mail
znovu registrovat. Přímé create/update/delete žádosti i statusové skrytí Shoutu
jsou od cutoveru 7ab60c8 uzavřené v nasazených DEV Rules.
Lokální cutover 7ab60c8 má success CI 41915977658 včetně 375 Rules/server testů;
povinné DEV směrování i zákazy jsou ověřené. Web/Rules jsou nasazené, přihlášený
klient má vlastní čtení 200 a přímé zápisy 403. První UI pokus, content-archived,
původní deadline, zákazy starého tokenu i úklid jsou ověřené 5. listopadu.
[Kompatibilita a návrat](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#dev-deletion-cutover).
Serverová automatizace musí:

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
částečné selhání a dokončení 60denní retence. Tato DEV kritéria jsou splněná:
aktuální CI, živý cutover pilot a dřívější konečný purge nad reálnými službami
s řízeným časem. Neznamená to produkční aktivaci ani hotový sedmidenní úklid Shoutů.

Dílčí stav 1. listopadu: DEV v2 job má živě ověřené skrytí Shoutů a odstranění
vlastních notifications/following/blocked, zachování profilu/legal a minimalizaci
notification preferencí na false. Aktivace 6a4606e po CI 41300216738, replay a
úklid testu prošly. Navazující DEV v3 archiv je také hotový: aktivace 1dab78c
po CI 41322524612, živě 2 zprávy, 1 komentář a 3 reakce, přesný commentsCount,
cizí obsah zachovaný, moderační zobrazení/audit i úklid fixture ověřené.
Aktualizace 3. listopadu: identita/role, vlastnické odebrání palců a konečný
60denní purge jsou dokončené v DEV. Aktivace 96b0782 má success CI 41539164008
(355 Rules/server, 15 purge); skutečný trigger/Scheduler i konečné odstranění
nad reálným Firestore/Storage s řízeným časem, anonymní cizí kontext, replay
a úklid fixture prošly. K tomuto datu milník zůstával otevřený kvůli klientskému cutoveru,
uzavření přímých zápisů a závěrečnému testu. Staré joby se nepřeváděly.
Následně je v DEV ověřená příprava po dávkách a potvrzení/průběh v UI. Atomické
serverové založení žádosti i aktivační klient jsou po úspěšném CI nasazené v DEV;
živě prošlo obnovení z pending gate a úklid. Selhání prvního pokusu má reprodukci
zastaralého Watch stavu; oprava čtecí transakcí c2409e0 má úspěšné CI i DEV rollout.
Resume po opravě i nový první průchod, serverové dokončení a úklid jsou ověřené.
Oprava životního cyklu odběrů 776e147 má k 4. listopadu úspěšné CI a DEV rollout;
živě prošly logout/relogin i smazání bez Uncaught Error, serverové dokončení a úklid
schválené fixture. V této dílčí etapě ještě zbýval cutover a společný test.
Navazující web/Rules 7ab60c8 a konečný pilot jsou uzavřené 5. listopadu:
Auth absent, právě jedna příprava, Auth/App Check VALID, content-archived,
purge scheduled v původním +60d, zachovaný cizí obsah a úplný úklid. Původní
inventura a ostatní backend jsou po úklidu shodné; žádný DEV pilot nezůstává otevřený.
[Důkazy a navazující rozhodnutí](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md).

<a id="lifecycle"></a>

## 7. Exspirace a mazání Shoutů — MVP

Dílčí DEV stav 2. listopadu: 91d8d9b po CI 41399389084 materializuje uplynulou
platnost pomocí active → expired, nejvýše 50 kandidátů ve volném minutovém
ticku stávajícího plánovače. Živě 26/26 původních Shoutů měnilo pouze status;
budoucí kontrola a potomci zachovaní. Sedmidenní fyzické mazání podkolekcí
ještě implementované není. [Kontrakt a důkazy](plans/accounts/ACCOUNT_AUTHORITY_AND_EXPIRATION.md).

- pravidelně vyhledat Shouty po skončení platnosti podle serverového času,
- změnit stav na expirovaný bez spoléhání na čas zařízení,
- od expiresAt odmítnout nové změny palců Shoutu/komentářů a uložení,
  zachovat čtení a výjimky pro vlastní mazání, moderaci a účtový úklid;
  [schválené upřesnění a ověření](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#expired-interactions),
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

### Podmínky případného budoucího srovnání

Původní jednorázový návrh se zachoval v
[úplném snímku](archive/MVP_SERVER_PLAN_2026-11-03.txt). Jeho dokončení není
potvrzené a není to nejbližší povinný úkol. Nyní se automaticky nezískává nový
klíč ani nespouští opravný zápis.

Pokud bude srovnání potřebné, nejdřív provést read-only inventuru současných
čítačů/poloh a ověřit aktuální nástroj `tools/reconcile_counters.mjs`, jeho
DEV pojistku a oprávnění. Konkrétní plán změn existujících dat předložit
vlastníkovi; teprve po souhlasu provést a ověřit. Přihlašovací údaje nikdy
necommitovat a produkční cíl nepoužít.
