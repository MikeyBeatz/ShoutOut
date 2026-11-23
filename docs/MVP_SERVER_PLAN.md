# Serverový a produkční plán webového MVP

## Aktuální stav a použití plánu

Souhrn původně k 11. listopadu 2026; stav feedu aktualizovaný 22. listopadu.
Níže jsou kritéria dokončení, nikoli seznam
nových příkazů k provedení. Přesné nasazení: [PROJECT_STATUS](PROJECT_STATUS.md).
Prioritní pořadí: [TODO](TODO.md). Stavy milníků se nemění přepsáním tohoto textu.

| Oblast | Doložený stav | Zbývající brána |
|---|---|---|
| Prostředí | DEV/produkční konfigurace a oddělený app Hosting připravené. | Produkční runtime, přístupy a startovní brána. |
| App Check/registrace | DEV web provider a ochrana obsahových callable ověřené. | Produkce, metriky/enforcement a ochrana registrace. |
| Obsahová brána | Serverové DEV operace, timed idempotence, prostorové API/indexové writery, Home i úplné vlastní Aktivní/Expirované jsou nasazené; přímé Shout create/vote zápisy uzavřené. A2/A3, Uložené, B1–B3 a metadata/cache B4 mají uzavřenou DEV akceptaci. B4b news je od 22. listopadu aktivní v DEV. | Živá společná akceptace B4b a úklid malého pilotu, finální regrese feedu, audit zbývající autority a ostatní níže uvedená kritéria. |
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

<a id="authority-audit"></a>

### Zbývající přímé zápisy – audit a DEV cutover 22. listopadu

Zbývající content-remaining-authority ani celkový audit bezpečnosti nejsou
uzavřené. Před přechodem měl DEV ruleset 5dde23bc-6ede-4c90-a2e4-7e47ff3034d2
shodu se zdrojem po normalizaci konců řádků. Pět izolovaných testů v emulátoru
shoutout-rules-test prošlo s aktivní schemaVersion 2 / managed card projekcí:

| Cesta | Ověřený výsledek | Další krok |
|---|---|---|
| Přímý čítač Shoutu / vytvoření komentáře | Zamítnuto | Zachovat uzavřenou projekci. |
| privateReplies create | Povoleno i při blokaci odesílatele příjemcem a targetType privateReply bez rodičovské zprávy. | Uzavřít přímý create, zachovat createPrivateReply; cutover níže dokončený. |
| Komentářové reactions | Samostatný like dokument je povolený, likesCount zůstane 0. | Uzavřít přímé reakce i čítače, zachovat toggleCommentReaction; cutover níže dokončený. |
| reports create | Přímá tvorba Shout hlášení je povolená vedle serverové cesty. Základní validace existuje. | Do cutoveru zahrnout i commentReports/privateReplyReports; všechny tři jsou otestované v cutoveru níže. |
| privateReplies delete | Původní audit: vlastní přímé smazání bylo povolené bez rate/receipt. | [Vlastní mazání nyní uzavřené v DEV](#private-deletion-dev-complete); atomická/regionální moderace zůstává samostatná. |

Vlastník první navazující úsek schválil: v managed režimu
uzavřít jen create soukromých odpovědí, komentářové palce a create tří typů
obsahových hlášení, otestovat existující serverové operace a po přesném CI
nasadit pouze DEV Rules. Bez nových Auth účtů, živých testovacích zápisů,
změn čtení, rolí, retence nebo produkce; přímé soukromé mazání a moderace
zůstávají mimo tento první úsek.

**Implementace cutoveru:** větev fix/managed-content-write-cutover doplňuje
sedm zákazových podmínek podle přítomnosti feedIndexControl/current, stejně
jako dosavadní Shout create. Platí také během building/paused a návratu na v1;
bez řídicího dokumentu zůstává původní validovaný režim. Oproti další kontrole
card generace tato existující pojistka nepřidává druhé čtení Rules a nepřekročí
limit přístupů u soukromé tvorby. Čtení, role, moderátorské rozhodnutí a
soukromé mazání se nemění. Web už používá createPrivateReply,
toggleCommentReaction a createContentReport; Functions se nenasazují.

Nová trvalá sada tools/rules/managed_content_cutover.integration.test.mjs
má 11/11 úspěchů: building/active/paused/v1, všechny klientské role,
anonymní klient, blokace/podvržené vlastnictví/rodič/typy/velikost,
atomické odmítnutí reakce i samotného čítače bez spotřeby klientského limitu,
serverová idempotence všech tří operací a přesné počty. Ověřuje také
účastnické čtení a omezený dotaz soukromé konverzace, odmítnutí cizího čtení,
zachované vlastní mazání a moderační čtení/rozhodnutí. Nepřítomný App Check
server odmítá. Nejde o úplný audit všech Rules ani produkční kapacitní test.
**Dokončeno v DEV:** místní širší sada 475/475, 0 selhání; zdroj
17317e9aede8f6aa286c12365ac335d597a6867f má [úspěšné úplné CI 45056112263](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45056112263).
Nasazeny výhradně Firestore Rules do shoutout-dev-46c81, ruleset
476d216c-9208-4e5c-9143-f583cb82a3e9. Čtecí REST kontrola ověřila shodu vydaného
souboru se zdrojem a nezměněný Hosting 06df6da99db68e74 i všech 20 Functions.
Aktuální webový app-config má všechny tři serverové cesty zapnuté a odpovídající
Functions jsou ACTIVE. Staré/nativní přímé cesty jsou v managed režimu blokované;
mobilní distribuce nebyla součástí této akceptace. Bez nových Auth účtů a
živých testovacích datových zápisů. Návratový ruleset je
5dde23bc-6ede-4c90-a2e4-7e47ff3034d2; jeho použití by znovu otevřelo původní
přímé cesty, proto jen jako odůvodněný návrat. Podklady:
build/managed-content-cutover-regression.log,
build/managed-content-cutover-ci-proof.json a build/managed-content-rules-after.json.
Navazující stav 23. listopadu: [vlastní soukromé mazání je uzavřené v DEV](#private-deletion-dev-complete);
důvěryhodná atomická/regionální moderace zůstává dalším samostatným úsekem.

V metrice se dosud otevřených 88 jednotek content-remaining-authority dělí
na tento cutover (implementace 15, ověření 15, DEV nasazení 14) a zbývající
autoritu 44. Již hotové váhy a součet rodiče 10 000 se nemění; celé serverové
kritérium tím není uzavřené. Živé ověření tohoto úseku je jen čtecí kontrola
skutečně vydaných Rules, bez nových Auth účtů a testovacích zápisů.
Podklady: firestore.rules (comments/reactions/privateReplies/reports),
functions/create_private_reply.js, functions/toggle_comment_reaction.js,
functions/create_content_report.js a dosavadní tools/rules/firestore.rules.test.mjs.
Nové provozní důkazy: build/content-authority-audit.test.mjs,
build/content-authority-audit-results.json, build/content-authority-audit.json,
build/content-authority-audit-emulator.log a build/content-authority-live-rules-proof.json.
Emulátorová kontrola nevytvářela ani neměnila DEV/produkční data.

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
Oprava Uložených dbf2aad po success CI 42932603771 tvoří součást novějšího
DEV webu 503eea6. Vlastník potvrdil odebrání karty i nepřítomnost po znovuotevření;
tím je uzavřená poslední regrese a společná DEV akceptace A2/A3.
Předchozí dvě fixture byly uklizené včetně záložek/receipt i aktuálního indexu.
[Checkpoint](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression).
Novější B1 zdroj 503eea6 má success CI 43056516730 a je nasazený pouze
na DEV web 47268ed17fd2eebd. Vlastník na nové dvojici 24hodinových fixture
potvrdil zmizení odebrané karty i nepřítomnost po restartu. Přečtení obou
testovacích Shoutů má stejné lokální časy před/po znovuotevření pod Bright_Otter_182.
B1 uzavřené; nová dvojice je uklizená přes writer (2 zdroje, 3 záložky,
9 receipt), 37 původních zdrojů beze změny. Functions/Rules beze změny.
B2 má od 18. listopadu [uzavřenou DEV akceptaci](plans/feed/B2_DEV_ROLLOUT.md#b2-acceptance-complete),
B3 od 20. listopadu [uzavřenou akceptaci i úklid](plans/feed/B3_DEV_ROLLOUT.md#b3-acceptance-complete).
Původní lokální [checkpoint B2](plans/feed/FEED_READING_POLICY.md#b2-local-results)
je historie, nikoli další neprovedený rollout. B4 a ostatní požadavky celé
serverové brány zůstávají otevřené.
Vlastník 12. listopadu začlenil [úspornou obnovu, verze, cache a přenos rozdílů](plans/feed/FEED_DELTA_REFRESH_PLAN.md)
do navazujících B2–B4 před MVP. Nejprve společný kontrakt, potom B2, B3 a B4;
samotné zapsání plánu nedokládá dostupnou deltu, číslovku ani cloudovou kapacitu.
Osobní přečtení je soukromé klientské nastavení, nikoli důvěryhodná veřejná
metrika zobrazení. Původní bezpečnostní kritéria této brány zůstávají platná.

<a id="antispam"></a>

<a id="private-deletion-preparation"></a>

### Nezávislá příprava vlastního mazání soukromých odpovědí – 23. listopadu

Historický audit před serverovým cutoverem. Nynější vlastní mazání je
[uzavřené v DEV](#private-deletion-dev-complete); níže zjištěná mezera běžného
přímého delete již byla uzavřena. Moderátorská atomická/regionální část zůstává otevřená.

Navazuje na zbývající privateReplies delete v [auditu autority](#authority-audit),
nikoli na ruční akceptaci B4. Zdroj ověřený na b7ef32b, vydaný web dál
af4c3aa / Hosting 37b697da10fbb5b1. Vlastník odložil pohybový test a požádal
pokračovat samostatně; tento audit nemění jeho výsledek ani oprávnění.

**Hotový pouze audit:** 8/8 izolovaných scénářů v emulátoru
shoutout-rules-test, 0 živých zápisů/nových Auth účtů. Vlastní zprávu lze
přímo smazat v managed active/building/paused i bez control dokumentu,
bez receipt a delete kvóty. Soukromé čtení a vlastnictví fungují: příjemce,
cizí a anonymní účet nemohou smazat kořen ani přepsat autora. Čekající žádost
o smazání/ban blokují mazání aktéra; samotné omezení tvorby ne. Expirace či
chybějící rodič smazání neblokují. Ostatní konverzace, existující archiv a
Shout čítače se nemění. Nejde o celkový bezpečnostní audit aplikace.

V obou moderátorských UI (lib/src/moderation.dart a lib/src/staff_reports.dart)
je delete následovaný samostatným uzavřením hlášení. Test potvrdil přetrvávající
otevřené hlášení při odmítnuté druhé změně; textový snapshot hlášení přežil.
Přímé moderátorské delete navíc používá roli, ale nikoli vazbu na report či
geografický rozsah – moderátor s rozsahem US mohl smazat CZ fixture, zatímco
číst její text nemohl. Toto zařadit do [důvěryhodné moderace](#moderation),
nezpřístupňovat kvůli tomu celé soukromé konverzace ani archiv.

Auditní podklady v build/: private-deletion-audit.test.mjs,
private-deletion-audit-results.json, private-deletion-audit-assessment.json
a private-deletion-audit.log. Jde o lokální diagnostiku mimo runtime;
opírá se o firestore.rules/privateReplies, lib/src/private_replies.dart,
oba moderátorské soubory a schválenou
[hranici účtové archivace](plans/accounts/ACCOUNT_CONTENT_ARCHIVE_PLAN.md).

**Konkrétní následující místní úsek – návrh ke schválení:**

Vlastník následně tento místní rozsah výslovně schválil. Živé nasazení,
aktivace a nové testovací účty/data zůstávají mimo tento souhlas.

- Serverové deletePrivateReply pro vlastní zprávu s Auth/App Check,
  ověřením způsobilosti a skutečného autora. Payload jen expectedUserId,
  shoutId, privateReplyId a idempotencyKey; bez klientského autora či textu.
- Stávající 7denní technické potvrzení a sdílený delete bucket ze serverového
  mazání komentářů (120/h, odstup 1 s), vše v jedné transakci s odstraněním.
  Opakování nesmí znovu spotřebovat kvótu, ztracená odpověď zachová původní
  požadavek a změna účtu ho nesmí odeslat pod jinou identitou. Neodlišovat
  cizí a nedostupnou zprávu způsobem odhalujícím její existenci.
- Klientský gateway a obsluha vlastního koše včetně průběhu/chyby/bezpečného
  opakování; integrace za vypnutou volbou. Příjemce nezíská právo mazat.
  Zachovat mazání po expiraci i bez rodiče, ostatní zprávy, hlášení, archiv,
  oznámení a čítače; žádný rekurzivní úklid ani přidání průběžné archivace.
- Místní návrh uzavření běžného přímého delete v managed režimu až po
  kompatibilním klientu; dosavadní moderátorské cesty ponechat funkční
  do jejich samostatného atomického cutoveru. Oprávnění při tom nerozšiřovat.
- Emulátorové a klientské regrese: vlastnictví, ban/pending, paralelní kliknutí,
  ztracená odpověď/opakování, změna účtu, expirace/chybějící rodič,
  souběh s účtovým archivátorem a zachování cizích dat. Změřit reads/writes,
  doplnit trvalé testy, dokumentaci a společný commit/push/úplné CI.

Tento návrh zatím nepovoluje nasazení nové Function, aktivaci klienta,
živé uzavření Rules, nové živé fixture/Auth, změnu retence nebo produkce.
Případný wrapper/prostředky a konkrétní DEV průchod předložit po místním
ověření; odložený ruční test feedu tomu nebrání. Automatická provozní
kapacita ani moderátorský audit se tímto dílčím krokem neprokazují.
content-remaining-authority zůstává nedokončený; za samotný průzkum
se nepřidává implementační kredit a pevné váhy se nemění.

<a id="private-deletion-local"></a>

### Vlastní soukromé mazání – místní příprava a regrese

**Implementace a úplné CI dokončené:** zdroj
**282666562e034bc18314a3becfe9d8c203b05712**, [success CI 45091447773](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45091447773).
Ověřený čistý přesný commit, úspěšný nový private-deletion krok i webový build.
Neproběhlo žádné nasazení; podklad build/private-deletion-ci-proof.json.
Jádro
[delete_private_reply.js](../functions/delete_private_reply.js) přijímá pouze
expectedUserId, shoutId, privateReplyId a idempotencyKey. Auth/App Check,
ověřený e-mail a způsobilost účtu kontroluje před účinkem; skutečného autora
čte v transakci. Příjemce, vlastník Shoutu ani staff nezískají touto operací
právo mazat cizí zprávu. Cizí a chybějící zpráva mají shodnou odpověď.
Moderační odebrání zůstává samostatnou operací nad hlášením/rozhodnutím.

Zdroj, společná delete kvóta 120/h s odstupem 1 s a body-free receipt vzniknou
v jedné transakci. Opakování používá stejný původní timed key; nezapisuje,
neobnovuje kvótu a znovu ověří způsobilost. Podporovaný seznam stávajícího
7denního úklidu doplněn o deletePrivateReply; přesný termín se nemění.
Operace nečte rodičovský Shout, index ani role, nemění čítače, pokračování
konverzace, důkazy hlášení ani archiv. Mazání funguje i po expiraci, pod
anonymním purged kontextem a při chybějícím rodiči; žádná rekurze či obnova dat.

Session-scoped [gateway](../lib/private_reply_deletion_gateway.dart) uchovává
nejistý požadavek přes zánik a znovuvytvoření tlačítka; nejde o perzistentní
frontu přes zavření prohlížeče. Používá existující TimedOperationGateway a čas
z Auth metadata. Dvojklik sdílí jeden let, změna účtu zablokuje nový transport
a pozdní výsledek nehlásí jako úspěch jiného účtu. Vlastní koš ukáže průběh,
dočasně se zakáže a chybu zobrazí jen ve stále platné obrazovce/účtu.
Kartu odstraňuje potvrzený živý stream, nikoli předčasný optimistický zásah.
serverPrivateReplyDeletion je výslovně **false** v DEV, chybějící volba má
výchozí false i v produkci. Typ musí být bool; true samostatně vyžaduje App Check.
Žádný nový callable export/provozní wrapper ani změna prostředků se nepřidává.

**Rules jsou místní prototyp:** [generátor kandidáta](../tools/rules/private_reply_deletion_candidate.mjs)
odvozuje úplný ruleset z nezměněného kořenového firestore.rules a při změně
očekávaného místa se zastaví. Pouze v emulátoru uzavře běžný přímý delete
v managed režimu active/building/paused/v1. Dosavadní staff delete a legacy
režim bez control zůstanou funkční do samostatného moderačního cutoveru.
Čtení účastníků a dotazy s vlastnictvím/limit 50 se nemění. Před živým
uzavřením je nutná kompatibilita klientů, konkrétní DEV průchod a kontrola
Rules; tento místní prototyp není zárukou bezpečnosti celé aplikace.

**Místní výsledky:** 493 Flutter testů, 104 nástrojových testů, analýza bez
nálezů a lint Functions; mimo emulátor 169 Functions testů prošlo a 576
emulátorových scénářů bylo správně přeskočených, nikoli vydávaných za úspěch.
40 cílených emulátorových testů zahrnuje 12 nových serverových
scénářů a 6 nových Rules scénářů plus 22 dosavadních regresí komentářového
mazání a účtové archivace. Ověřeno: přesné vlastnictví a soukromé čtení,
chybějící App Check/identity před DB, ochrana payloadu, paralelní opakování
i odlišné klíče, rollback při selhání receipt, ban/pending/omezení tvorby,
sdílená kvóta a hranice, sedmidenní replay/úklid, průběh/chyby/zánik UI a
změna účtu. Útoky proti návrhu Rules: veřejný/neomezený list, cizí delete,
podvržená role/vlastnictví/čas/účastníci/schema i velký text odmítnuté;
klient nemůže vytvořit ani číst serverové potvrzení. Staff nezíská čtení zpráv.

Archivující transakce i vlastní smazání mohou vyhrát souběh; vždy nastane
jen jedno odstranění zdroje. Archivující vítěz zachová tělo i původní
request createTime +60 dní; smazaný zdroj se nevytvoří znovu a ostatní
účastníci zůstanou nezměnění. Předchozí samostatné mazání se nově nearchivuje,
což zachovává již schválenou hranici archivace při zpracování smazání účtu.

Měření jedné bezkonfliktní transakce: **8 SDK reads / 3 writes**, potvrzené
opakování **6 reads / 0 writes**, žádné čtení Shoutu/indexu. Podklad
build/private-deletion-measurement.json, výpisy build/private-deletion-{flutter,
analyze-final,tools,integration,functions-unit}.log. Jde o emulátorové počty
operací, ne cloudovou latenci, účtování či kapacitu 5 000 uživatelů.
Trvalé regrese: [server](../functions/delete_private_reply.integration.test.js),
[klient](../test/private_reply_deletion_test.dart),
[Rules](../tools/rules/private_reply_deletion.integration.test.mjs).
Příkaz npm --prefix tools run test:private-deletion má samostatný krok plného CI;
nezatěžuje již dlouhý základní Rules krok dalším emulátorovým testem.

Zbývající váha content-remaining-authority **44** se rozděluje na vlastní
soukromé mazání **22** (kód/ověření/DEV/akceptace **6/6/5/5**) a další
autoritu **22**. Dosavadní hotové váhy ani součet rodiče se nemění. Po plném
CI započtena jen implementace a automatické ověření (6 + 6); DEV a živá
akceptace zůstávají otevřené. Backlog tento původní serverový díl samostatně
nevážil, proto mu nepřidávat dvojí nebo novou umělou váhu.

**Další krok:** samostatně připravit konkrétní DEV wrapper, prostředky,
aktivaci a kontrolu kompatibility před živým uzavřením běžného delete.
Součástí navazujícího nasazení musí být také **aktualizace existující
cleanupOperationReceipts** se zde doplněným podporovaným action, bez změny
časování a pracovních mezí. Starý živý whitelist nový typ zatím nezná;
samotné nasazení nového callable by nestačilo pro fyzický 7denní úklid.
Logický zákaz pozdního opakování je nezávislý na době fyzického úklidu.
Odložený test pohybu feedu
zůstává otevřený a jeho fixture se touto prací nemění. Nový živý pilot ani
produkci tento úsek nespouští. Regionální autorita a atomické rozhodování
moderátorů nadále patří do následujícího serverového milníku.

<a id="private-deletion-dev-proposal"></a>

### Vlastní soukromé mazání – návrh uceleného DEV přechodu

Příprava 2826665 má success úplné CI 45091447773; dokumentační checkpoint
2e1804b má success lehké CI 45093505578. Vlastník 23. listopadu výslovně
schválil celý následující DEV přechod včetně implementace, push/CI a pilotu.
Živé uzavření Rules nadále podmiňuje doložená klientská kompatibilita.

**Čerstvá čtecí inventura, 23. listopadu 01:26 UTC:** pouze
shoutout-dev-46c81: 20 ACTIVE Functions, deletePrivateReply dosud neexistuje.
cleanupOperationReceipts je revision cleanupoperationreceipts-00004-zel,
min0/max1/concurrency1/256 MiB/60 s. Dvě stávající Scheduler úlohy běží každou
minutu; jejich nastavení se nenavrhuje změnit. Hosting 37b697da10fbb5b1,
Rules 476d216c-9208-4e5c-9143-f583cb82a3e9, reader 00007-moc, feed control 12,
news 6/active a writery feed-v1/v2/v3. 91 zdrojů, z toho 50 aktivních;
38 původních Shoutů a pending žádost mají původní updateTime. Podklad
build/private-deletion-dev-inventory.json, 0 cloudových zápisů. Prohlížečový
host byl znovu ověřen jako unavailable; bez něj se UI akceptace netvrdí.

**Navržený celý rozsah:**

1. Připravit skutečný callable wrapper deletePrivateReply se stávajícími
   Auth/App Check kontrolami: europe-west3, min0/max1, concurrency1,
   256 MiB, 15 s. Aktualizovat stávající cleanupOperationReceipts kvůli nové
   action, se stejnými prostředky, rozpočty a minutovým plánovačem. Žádný
   nový Scheduler, klíč, index, migrace, globální App Check ani retence.
2. Připravit řízený pilotní/ověřovací nástroj s přesným DEV projektem,
   čistým zdrojem/úplným CI, manifestem a digestem, preconditions a bezpečným
   opakováním. Před první mutací kontrolovat profil/role testovacích aktérů,
   generace/control a chráněný původní obsah/žádost. Balíček musí obsahovat
   pouze runtime závislosti, nikoli testy/laboratoře.
3. Po úplném CI přesného zdroje nasadit pouze novou Function a uvedenou
   existující cleanup Function, potom kompatibilní DEV web se zapnutým
   serverPrivateReplyDeletion. Ověřit obě revize, prostředky a shodu webového
   artefaktu; zbývajících 19 Functions, dva Scheduler joby, read/news control
   a původní Rules zachovat. HTTP 401 bez identity je jen negativní kontrola.
4. Připravit také kořenové Rules a aktualizované regresní očekávání pro
   pozdější uzavření běžného přímého delete v managed režimu. Současný
   generátor zpřesnit tak, aby bezpečně ověřil staré i již převedené znění
   bez dvojí úpravy a bez přijetí neočekávané odchylky. Tento samostatný
   bezpečnostní checkpoint musí mít vlastní úplné CI; Rules zatím **nenasazovat**.
5. Živý pilot založit až při dostupném ovladatelném klientu nebo připravenosti
   vlastníka ke krátké kontrole: nejvýše **1 nový 24h syntetický Shout a 2
   navazující soukromé zprávy** mezi stávajícími Bright_Otter_182/TestBusiness.
   Součástí jsou běžná testovací oznámení a technická potvrzení; žádné nové
   ani mazané Auth účty. Shout projde společným indexovým writerem, zprávy
   stávajícím createPrivateReply jádrem, aby měly kanonické účastníky/vazbu.
   Nové ID oddělit od dosavadního odloženého restartovacího pilotu.
6. Ověřit vlastní mazání obou účtů přes nový klient/callable, viditelný průběh,
   přijetí Auth/App Check a odpovídající deletePrivateReply receipts; cizí
   obsah, hlášení, role a archiv musí zůstat zachované. Je-li prohlížeč
   nedostupný, infrastrukturu a místní přípravu dokončit, ale pozitivní UI
   důkaz a živé uzavření Rules neoznačit za splněné a ruční kontrolu nechat na konec.
7. Teprve po doložené klientské kompatibilitě a úplném CI Rules checkpointu
   nasadit přesně připravené DEV Rules. Ověřit vydaný zdroj, odmítnutí běžného
   přímého delete a zachované účastnické čtení i existující staff cesty.
   Starší otevřený web bude potřebovat obnovu; nativní přímá cesta bude
   v managed DEV blokovaná, bez mobilní distribuce či nového App Check nastavení.
8. Uklidit pouze nový manifest: testovací Shout přes společný writer, jeho
   soukromé fixture, případné read značky tohoto nového ID a nová oznámení.
   Technická potvrzení ponechat do původní 7denní lhůty pro aktualizovaný
   úklid; skutečné spotřebované kvóty nevracet zpět. Cizí interakce znamenají
   zastavení úklidu, nikoli kaskádové smazání. Dosavadních 91 zdrojů a původní
   pending žádost zachovat; odložený pohybový test ani jeho úklid tím neuzavírat.

**Návrat:** před nasazením uchovat dnešní web 37b697da10fbb5b1 a Rules 476d216c…a3e9.
Před uzavřením Rules doložit návratový web, který již umí nové serverové
mazání. Starší web bez tohoto gateway není po uzavření běžného delete
kompatibilním samostatným rollbackem. Při širším návratu nejprve vrátit
kompatibilní Rules, pak starý web; funkční endpoint a rozšířený úklid
potvrzení zachovat, dokud je mohou potřebovat otevření klienti a receipts.
Návrat nesmí obnovovat obsah nebo resetovat sdílené kvóty.

Po schválení tento celek zahrnuje implementaci/pilotní nástroj, lokální regrese,
seskupené commity/push a výše uvedené podmíněné DEV rollouty po přesném CI.
Produkce, main, původní pending žádost, globální App Check a prostředky
ostatních služeb se nemění. Nový živý rozsah se schvaluje jednou; rutinní
provedení jeho podmínek pak pokrývá trvalý souhlas s rollouty. Souhlas je
udělený; implementace probíhá, metriky DEV/akceptace zůstávají otevřené.

**Příprava první nasazovací fáze, 23. listopadu:** wrapper má schválený
profil a sdílenou ochranu Auth/App Check; DEV konfigurace zapíná nový gateway,
produkční konfigurace zůstává vypnutá. Idempotentní renderer ověřuje staré
i převedené Rules; kořenové/vydané Rules se v této fázi nemění.
`tools/private_reply_deletion_pilot.mjs` vyžaduje přesný DEV projekt,
čistý commit a úplné CI včetně soukromé regrese, digest a výslovně připraveného
klienta. Manifest se ukládá před mutací. Tři pevné požadavky zakládají právě
jeden 24h Shout a dvě navazující zprávy přes existující serverová jádra;
opakování nezakládá nové ID ani neobnovuje smazané zprávy.
Nástroj hlídá inkarnace/control a updateTime všech 91 dosavadních zdrojů
i původních žádostí. Při nesouladu zastaví. Administrativní úklid nepřidává
pozitivní delete receipts; ponechá skutečné kvóty i 7denní potvrzení a maže
pouze nové ID, jeho dvě zprávy, oznámení a odpovídající cloudové read klíče.
Cizí konverzace/interakce úklid zastaví. Pilotní modul není součástí runtime
artefaktu Functions. Dosavadní helper úklidu read klíčů je sdílený, s volitelnou
transakční kontrolou původních dat.

Lokálně prošlo 493 Flutter testů, analýza bez nálezů, 106 nástrojových testů,
21 cílených emulátorových testů (12 jádro, 3 pilot, 6 Rules návrh) a kontrola
resource kontraktu wrapperu; lint a 170 serverových unit testů (579 integračních
mimo emulátor přeskočeno). Podklady jsou v build/private-deletion-dev-*.log;
nejde o živé měření. Připravený kód ani lokální test nenahrazují úplné CI,
nasazení či UI akceptaci. Žádná nová živá fixture zatím nevznikla.

Zbývající DEV váha 5 je před nasazením rozdělena na Functions/úklid 2,
kompatibilní web 1 a podmíněný Rules cutover 2. Součet i váha rodiče zůstávají
stejné; všechny tři části jsou zatím otevřené. Živá akceptace má dál vlastní
váhu a podmínky, proto nelze přípravu zaměnit za dokončený milník.

<a id="private-deletion-dev-results"></a>

### Vlastní soukromé mazání – DEV server/web a samostatný Rules checkpoint

Stav první nasazovací fáze před pilotem; [finální výsledek je níže](#private-deletion-dev-complete).

**První nasazovací fáze je ověřená:** zdroj
**9c2e121706ea824d10282f06c778249b9b4a0f05** má
[success úplné CI 45096691292](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45096691292),
včetně nového pilotního kroku a webového buildu. Čistý přesný commit,
hash artefaktu a moduly Functions ověřeny před nasazením. Pouze DEV
shoutout-dev-46c81: nová **deletePrivateReply / deleteprivatereply-00001-koz**,
aktualizovaná **cleanupOperationReceipts / cleanupoperationreceipts-00005-goh**.
Obě revize připravené, 100 % provozu; čtyři staré cleanup revize retired.
Callables 0–1 instance / concurrency1 / 256 MiB / 15 s, cleanup stejný profil
se 60 s. Dva stávající minutové Scheduler joby zachovaly nastavení;
ostatních 19 Functions beze změny. Neautentizované volání vrací očekávané
401; to není pozitivní klientský důkaz.

DEV Hosting **813f34b7555e272a**, serverPrivateReplyDeletion true.
Ověřeno všech 67 veřejných app souborů proti manifestu a osm HTTP odpovědí
obou domén. Předchozí verze **37b697da10fbb5b1** je návratová před Rules
cutoverem; nový web 813f34b7555e272a je kompatibilní návratová verze pro
budoucí cutover. Manifest navíc obsahuje neveřejný pomocný soubor, který
Hosting podle ignore pravidla nevydává. Rules stále
**476d216c-9208-4e5c-9143-f583cb82a3e9**. Všech **91 dosavadních zdrojů**,
všechny původní žádosti, feed control 12 a news 6/active mají stejný stav
i updateTime zdrojů/žádostí jako před nasazením. Žádná nová živá fixture ani
Auth změna, produkce/main beze změny. Důkazy:
build/private-deletion-release-{build,ci,before,functions,hosting}.json.

**Samostatný místní Rules checkpoint:** kořenový návrh již v managed režimu
odmítá běžné přímé mazání soukromé zprávy. Odpovídající staré regresní
očekávání je upravené; čtení, legacy bez řídicího dokumentu a existující
moderátorská cesta zůstávají zachované. Zdroj
**9fee32e952378404baab13463470f8224366e79a** má
[success samostatné úplné CI 45098775591](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45098775591).
Před nasazením ještě musí být doložena pozitivní živá kompatibilita klienta.
Lokálně prošlo všech **32** cílených emulátorových regresí jádra,
pilotu, návrhu Rules a stávajících obsahových operací. **Kořenový soubor
není důkaz vydaných Rules.** Souhrn přesného
CI checkpointu se ukládá do build/private-deletion-cutover-ci-proof.json;
před mutací jeho stav znovu ověřit přímo na GitHubu. Závěrečná čtecí kontrola
v 02:30 UTC znovu potvrdila 21 Functions, dva plánovače, všech 91 zdrojů,
osm shodných HTTP odpovědí a přesnou shodu dosavadního živého Rules zdroje.
Nový Rules soubor je připravený, nikoli vydaný; manifest je stále planned,
nová fixture neexistuje a ověřovací nástroj měl 0 cloudových zápisů.

Pro řízený pilotní nástroj a budoucí Rules rollout použít čistý výše uvedený
zdroj **9fee32e** a `--ci-run 45098775591`; navazující dokumentační commit
není nový aplikační zdroj s úplným CI. Před dočasným výběrem release commitu
ověřit čistý pracovní strom a po operaci vrátit pracovní větev. Připravený
manifest docs/local/private-reply-deletion-dev-pilot.json má digest
**30fffa903a3b357aae7442a92c67a986236a2297f5d0a5b9fcdc954fe9b88d01**;
jeho preconditions a připravenost klienta ověřit znovu před první mutací.

**Tehdejší navazující postup, dokončený níže:** dostupný ovladatelný prohlížeč nebo připravený vlastník →
čerstvý manifest/digest a schválený pilot 1 Shout / 2 zprávy → vlastní
mazání obou účtů s Auth/App Check a receipts → podmíněné DEV Rules → úklid.
Prohlížečový host byl při přípravě znovu unavailable, proto zatím žádná pilotní
data nevznikla a pozitivní akceptace se netvrdí. Nepřenášet sem splnění
odloženého pohybového testu. Započtené pouze dvě doložené nasazovací části
(Functions 2, web 1); Rules 2 a živá akceptace 5 zůstávají otevřené.

<a id="private-deletion-dev-complete"></a>

### Vlastní mazání soukromých odpovědí – DEV akceptace a úklid uzavřené

Vlastník 23. listopadu potvrdil připravený TestBusiness a následně rychlé
mazání při průchodu oběma účty. Vznikl pouze schválený Shout
**MVP private deletion d20abeb8** na 24 hodin a dvě navazující soukromé zprávy.
Skutečné klientské operace pod TestBusiness i Bright_Otter_182 odstranily
vlastní zprávy a vytvořily dvě kanonická deletePrivateReply potvrzení.
Obě volání mají Auth/App Check **VALID**, HTTP 200; samotné POST požadavky
trvaly 0,650 s a 0,129 s (nezahrnuje CORS ani celý klientský průběh).
Účty nemají moderátorskou roli ani legacy marker. Zprávy nezmizely
administrativním úklidem; byly odstraněné už před ním.

Po tomto důkazu byl z čistého **9fee32e952378404baab13463470f8224366e79a** /
[úplné CI 45098775591 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45098775591)
nasazen pouze DEV firestore:rules. Vydaný ruleset je
**e16b7a3d-f363-499c-ad40-262471059271**, přesná shoda zdroje ověřena přes API,
SHA-256 normalizovaného zdroje **26c795cd…9c91dcc3**. Ostatní Functions,
Hosting, dva plánovače a prostředky se nezměnily. Návratový ruleset
476d216c-9208-4e5c-9143-f583cb82a3e9 je uložený; kompatibilní web zůstává
**813f34b7555e272a**. Starý web bez serverového mazání samotný nevracet.

Odmítnutí přímého běžného delete bylo ověřeno v emulátoru a pomocí
[oficiálního Rules test API](https://firebase.google.com/docs/reference/rules/rest/v1/projects/test)
nad přesně vydaným zdrojem: všech **8/8 modelových scénářů** prošlo.
Párové srovnání před přechodem prokázalo ALLOW starého a DENY nového own-delete;
zachované je čtení autora/příjemce, odmítnutí cizího čtení, dosavadní staff
delete a legacy bez spravovaného feedu. Simulace používá explicitní kontexty
a mocks; není to autentizovaný HTTP DELETE z běžného prohlížeče.
Živé klientské důkazy se týkají skutečného callable mazání obou účtů.
Samostatné atomické moderátorské rozhodování se tím neuzavírá.

**Úklid dokončený:** jeden nový Shout odstraněn společným indexovým writerem,
dvě testovací notifikace a **1 cloudový read klíč** tohoto ID odstraněny.
Soukromé zprávy už byly pryč. **5 technických potvrzení** zůstává do vlastních
serverových termínů +7 dní, kvóty se neresetovaly. Manifest
docs/local/private-reply-deletion-dev-pilot.json je **cleaned**; znovu neseedovat.
Závěrečná kontrola v **06:45 SEČ** potvrdila návrat na **91 původních zdrojů**,
jejich původní updateTime, jednu původní pending žádost a feed 12/news 6/active.
Všech 21 Functions, dva minutové joby, web i nový Rules release zachované.
Žádné nové/mazané Auth účty, produkce ani main. Podklady:
build/private-deletion-{live-audit,final-proof,rules-after}.json a
build/private-deletion-rules-simulation-after-proof.json. Pole cloudWrites:0
ve čtecím statusu je jen měření této kontroly; seed provedl tři zapisující
operace a tento údaj není celkový počet pilotních zápisů.

Poznámka vlastníka k dohledání konverzace: **Mé shouty → Komentáře** nyní
načítá jen collectionGroup('comments') v lib/src/saved.dart. Soukromé zprávy
se zobrazují v detailu Shoutu / přes oznámení; nový přehled konverzací nebyl
v tomto úseku zaveden. Odložená akceptace pohybu a její staré fixture zůstávají
samostatné. Vlastní soukromé mazání je uzavřené; další autorita/moderace
a kompletní obsahový milník zůstávají otevřené.

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

<a id="moderation-private-local"></a>

### Schválený místní úsek: skrytí soukromé odpovědi bez postihu

Vlastník 23. listopadu schválil první atomickou operaci pro jedno hlášení
soukromé odpovědi: odstranit živý kořen zprávy, uzavřít hlášení a společně
uložit aktéra/rozhodnutí a technické potvrzení. Pouze místní serverové jádro
a emulátor, dokumentace, commit/push a společné CI. Bez wrapperu, zapojení
klienta, nasazení, změn Rules, živých dat či Auth účtů. Jiné rozhodnutí,
sankce ani hromadné zpracování nejsou součástí tohoto úseku.

Autorita vychází z uloženého accountRoles/moderators a stávajícího
moderationScope: role 5–6 nebo explicitní global mají globální rozsah,
jinak země/subdivision podle serverové geografie rodičovského Shoutu.
Otevřené hlášení vyžaduje moderátora, eskalované alespoň seniora podle
dosavadního rozdělení front. Scope se kontroluje i při opakování; neodvozuje
se z callerových souřadnic nebo role v payloadu. Nejasný nebo chybějící cíl
se odmítne bez změn. Chybějící region neopravňuje regionálního moderátora
ke globálnímu zásahu. Žádná nová role, kvóta nebo retenční lhůta.

Audit rozhodnutí zůstane u existujícího hlášení (resolvedBy, resolvedAt,
resolution, vazba na operaci a případná dosavadní moderatorNote); textový
snapshot se nepřepíše. Potvrzení nebude obsahovat text zprávy ani poznámku
a použije již schválených 7 dní. Novou action doplnit také do místního
allowlistu úklidu; před budoucí živou aktivací ji bude nutné nasadit v úklidu.
Archiv, cizí konverzace, čítače a index feedu tato operace nemění.

Ověření pokryje cizí region, změnu role/rozsahu, Auth/App Check, dva moderátory,
opakování i ztracenou odpověď, selhání po přípravě delete, změnu inkarnace
cíle a souběh s účtovou archivací. Příprava ani testy nejsou živé vynucení;
stávající klientské moderátorské cesty zatím zůstávají funkční.

Před implementací rozdělena pouze zbývající váha moderation-decision 1250:
125 jádro, 125 jeho ověření, 1000 ostatní rozhodnutí/sankce/klient/provozní
zapojení. Váha rodiče i dříve hotové úseky zůstávají stejné.

**Místní výsledek 23. listopadu:** functions/remove_reported_private_reply.js
provádí odstranění, update původního hlášení a body-free potvrzení v jedné
transakci. Kontroluje uloženou roli/rozsah i při opakování, kanonickou vazbu
hlášení na příjemce, původního autora/text a inkarnaci zdroje. Nově vytvořený
zdroj pod stejnou cestou se nesmí odstranit na základě starého hlášení.
Chybějící zdroj se odmítne; operace nehledá ani nemění retenční archiv.

Node 22: **37/37 cílených emulátorových testů**, z toho 16 pro nové jádro;
také souběh dvou moderátorů a skutečně paralelní archivace, opakování,
změna role/geografie, rollback a přesná sedmidenní hranice. Celá serverová
unit sada **173 passed / 595 skipped** (integrační testy bez emulátoru),
**104 nástrojových testů** a lint prošly. Naměřeno **11 SDK reads / 3 writes**
pro první zásah, **9 / 0** pro opakování bez konfliktu/retry. Nejde o cloudové
měření ceny či latence. Důkazy jsou nové unit/integrační testy a místní
build/private-moderation-{emulator-final,functions,tools}.log,
build/private-moderation-measurement.json.

Do stupnice započítat pouze jádro a automatické ověření. Runtime balíčky nový
modul neobsahují, což kontroluje tools/function_artifact.test.mjs. Zdroj
**f1e32e9e1474498b4ce662878cc93558a31c3ee9** má
[úspěšné úplné CI 45136851001](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45136851001),
včetně nové sady soukromé moderace a webového buildu. Přesný čistý commit
a požadované kroky doložené v build/private-moderation-ci-proof.json.
Žádný wrapper, klientská aktivace,
živé změny Rules/dat ani nasazení tím nejsou dokončené. Stávající staff
přímé mazání zatím zůstává v DEV otevřené; následné zapojení musí sladit
obě klientské cesty, audit, úklid nového typu potvrzení a teprve potom Rules.
Seskupená hlášení, chybějící/archivované cíle, ostatní rozhodnutí a sankce
zůstávají samostatnou navazující prací; tento základ řeší jedno živé hlášení.

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

- doložit kapacitu pro schválený cíl 100 000 registrovaných účtů podle
  [kapacitní akceptace](LAUNCH_READINESS.md#capacity-target); souběžná špička
  5 000 aktivních uživatelů je schválený cíl, dosud neprokázaný výkon,
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
