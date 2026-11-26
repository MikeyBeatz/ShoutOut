# Serverový a produkční plán webového MVP

## Aktuální stav a použití plánu

**Místní úsek uzavřený s úplným CI:** [atomické veřejné odstranění bez postihu](#moderation-public-local-results).
Navazující [DEV přechod, živá akceptace i úklid jsou uzavřené](#moderation-public-dev-complete);
původní obsah a ostatní konfigurace jsou zachované. Celý moderační milník ještě není uzavřený.
Probíhá [místní sankční pokračování](#moderation-sanctions-local), bez aktivace.

Souhrn původně k 11. listopadu 2026; stav feedu aktualizovaný 23. listopadu.
Níže jsou kritéria dokončení, nikoli seznam
nových příkazů k provedení. Přesné nasazení: [PROJECT_STATUS](PROJECT_STATUS.md).
Prioritní pořadí: [TODO](TODO.md). Stavy milníků se nemění přepsáním tohoto textu.

| Oblast | Doložený stav | Zbývající brána |
|---|---|---|
| Prostředí | DEV/produkční konfigurace a oddělený app Hosting připravené. | Produkční runtime, přístupy a startovní brána. |
| App Check/registrace | DEV web provider a ochrana obsahových callable ověřené. | Produkce, metriky/enforcement a ochrana registrace. |
| Obsahová brána | Serverové DEV operace, timed idempotence, prostorové API/indexové writery, Home i úplné vlastní Aktivní/Expirované jsou nasazené; přímé Shout create/vote zápisy uzavřené. A0–A3/B1–B4 včetně číslovky, pohybu a finální regrese mají [uzavřenou DEV akceptaci a úklid](plans/feed/B4_DEV_ROLLOUT.md#feed-final-acceptance-complete). | Audit zbývající autority, veřejné moderační odstranění/sankce, produkční kapacita a ostatní níže uvedená kritéria. |
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

<a id="moderation-private-dev-proposal"></a>

### Schválený přechod soukromé moderace do DEV

Vlastník 23. listopadu schválil celý navazující úsek: wrapper, obě klientské
cesty skrytí bez postihu, zachování původního požadavku/poznámky při nejasném
výsledku, testy, dokumentaci, push/CI a následný DEV pilot. Nový endpoint
removeReportedPrivateReply: europe-west3, min 0 / max 1, concurrency 1,
256 MiB, 15 s, stávající Auth/App Check. Aktualizace cleanupOperationReceipts
zahrne již připravený typ potvrzení, bez změny prostředků a minutového plánu.

Jeden přesný zdroj s úplným CI připraví wrapper i DEV web; nasadit nejprve
endpoint/úklid, potom web s DEV přepínačem serverPrivateReportRemoval.
Produkční konfigurace zůstane vypnutá. Poznámka a rozhodnutí se po nejasné
odpovědi v otevřené relaci nesmějí změnit pod novým požadavkem. Obě obrazovky
musí nabídnout bezpečné opakování bez následného přímého update hlášení.
Neočekávaná skupina více starých soukromých hlášení se odmítne bez změn;
kanonická soukromá zpráva má jediného příjemce a deterministické ID hlášení.

Rules jsou nejprve jen kandidát v tools/rules/private_report_removal_candidate.mjs:
při existujícím managed feed control uzavřít přímé delete soukromé zprávy všem
rolím a přímé deklarování contentRemoved u soukromého hlášení. Stávající
čtení, approve/escalate/resolve/sanction a nespravované prostředí zachovat.
Teprve po pozitivní kompatibilitě klienta změnit vydávaný zdroj, samostatně
otestovat a získat úplné CI před nasazením Rules do shoutout-dev-46c81.
To není dokončení celé moderační autority: ostatní rozhodnutí mají další bránu.

Pilot: jeden nový 24h Shout a dvě zprávy mezi Bright_Otter_182/TestBusiness,
jedno hlášení přijaté zprávy a jedno odstranění přes TestModerator. Samostatný
manifest nesmí obnovit předchozí cleaned pilot. Původní zdroje/žádost, role,
generace a scope chrání čerstvá inventura a digest. Plánovací/čtecí operace
nevytvářejí obsah; mutace vyžadují čistý přesný zdroj a úplné CI. Nástroj
nevytváří moderátorské potvrzení sám: živá akceptace vyžaduje skutečného klienta.
Kontrolní zpráva, snapshot hlášení a audit se před úklidem ověří, pak se
odstraní pouze fixture přes společný indexový writer. Potvrzení zůstanou +7 dní,
kvóty se neresetují, Auth účty se nemění. Ruční průchod až na konci podle
dostupnosti prohlížeče. Žádná nová role, sankce, kvóta, retence, služba,
Scheduler ani produkční/main změna.

Návrat: před uzavřením Rules lze vrátit dosavadní DEV web; po uzavření musí
zůstat klient se serverovou cestou, nebo se nejprve řízeně vrátit původní
Rules. Samotný návrat starého raw-delete webu při uzavřených Rules není
kompatibilní. Serverové potvrzení ani audit se návratem nemění.

Před uzavřením úseku se ze zbývající moderation-decision váhy 1000 vyčleňuje
25 klient/wrapper/pilot, 25 ověření, 25 kompletní DEV přechod a 25 živá
akceptace/úklid. Zbytek 900 zůstává ostatním rozhodnutím a sankcím; dříve
hotové váhy a celková váha milníku zůstávají stejné.

**Příprava přechodu ověřená lokálně:** session gateway drží původní note/klíč
i po zavření dialogu, obě obrazovky používají stejnou serverovou operaci;
nejasný výsledek blokuje jiné rozhodnutí do bezpečného opakování. DEV přepínač
je v připraveném zdroji true, produkční chybějící přepínač znamená false.
Wrapper i kontrolovaný pilotní nástroj jsou připravené; samotná místní příprava
ještě nedokládala živé vytvoření obsahu ani nové nasazení. Aktuální rollout níže.

500 Flutter testů, následná cílená sada 30 testů a analyze bez nálezů;
107 nástrojových testů, lint, 174 serverových unit testů (598 integračních
bez emulátoru přeskočeno) a 46 cílených emulátorových testů prošly.
Zahrnují tři nové pilotní regrese a šest případů kandidáta Rules, jejich
kompilaci, role 1–6, podvržené audity, transakční batch, snapshot/čítače,
čtení/fronty, chybějící rodič, approve/escalate/resolve a nespravovaný režim.
Kandidát je prototyp pro dvě uvedené zápisové cesty, nikoli úplný audit všech
dosavadních oprávnění. Před veřejným vydáním zůstává úplná moderační brána.
Důkazy: test/private_report_removal_test.dart,
functions/private_reply_deletion_pilot.integration.test.js,
tools/rules/private_report_removal.integration.test.mjs a místní
build/private-moderation-dev-{emulator-final,flutter-final,analyze-final,client-final,tools,functions}.log.
Úplné CI přípravy je doložené níže. Cílený kontrolní modul pro vývojový
pilot je tools/private_report_removal_pilot.mjs; nevyrábí pozitivní UI důkaz.
Browser host je nedostupný a Windows ovládání navíc automaticky skončilo,
protože nešlo spolehlivě určit URL otevřené karty. Živá kompatibilita zatím
není ověřená; žádné další UI vstupy po tomto zastavení neproběhly.

<a id="moderation-private-dev-rollout"></a>

### Nasazený server/web, čekající klientská kompatibilita

Zdroj **0fa2774be634db27013e37ca511e8523c6a9f7c7** má
[success úplné CI 45147594322](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45147594322).
Z ověřeného čistého zdroje vznikl release artefakt; nasazeno pouze DEV:
removeReportedPrivateReply **removereportedprivatereply-00001-zec**,
cleanupOperationReceipts **cleanupoperationreceipts-00006-lum** a Hosting
**b5703cec19978454**. Obě služby mají 100 % provozu, staré revize jsou retired;
prostředky zůstaly podle schválení. Nepřihlášený POST nové callable vrátil 401.
Zachováno ostatních 20 Functions, oba minutové plánovače i 91 původních Shoutů,
jejich updateTime, původní pending žádost a feed 12/news 6/active. Ověřeno
67 veřejných app souborů a 8 HTTP odpovědí obou DEV domén proti artefaktu.
Návratový web je **813f34b7555e272a**. Rules jsou stále původní
**e16b7a3d-f363-499c-ad40-262471059271**; jejich nový cutover dosud neproběhl.

První nasazovací pokus skončil ještě při místním discovery po 10 s, před
nahráním zdroje. Čerstvá inventura potvrdila nezměněné prostředí. Opakování
použilo CLI-only FUNCTIONS_DISCOVERY_TIMEOUT=60 podle
[oficiálního postupu](https://firebase.google.com/docs/functions/tips#avoid_deployment_timeouts_during_initialization);
běhové timeouty 15/60 s ani prostředky se neměnily. Následné nasazení/provoz
ověřené. Důkazy: build/private-moderation-release-{ci,build,before,functions,hosting}.json
a samostatný discovery-timeout log.

Nový manifest **docs/local/private-report-moderation-pilot.json**, digest
**c5801fcb190c182d4e590c4c8bfb820899507e22306cbddc1d295b0685c059d9**,
je nyní **seeded**. Vznikl přesně jeden 24h Shout **MVP private deletion 3a725093**,
dvě navazující zprávy a jedno hlášení
**MVP private moderation 3a725093. Remove after verification.**
První zpráva je od TestBusiness příjemci Bright_Otter_182; kontrolní pokračování
patří Bright_Otter_182. Hlášení je open, obě zprávy přítomné, odstranění ani
pozitivní moderátorský doklad zatím neexistují. Čtyři seed operace vytvořily
čtyři technická potvrzení; cloudWrites:0 v čtecím statusu není součet zápisů
celého pilotu. Celkem 92 Shoutů = 91 původních + jediná nová fixture.

Čerstvá inventura potvrdila, že enrichShoutGeography v DEV dosud není
nasazená. Žádné automatické obohacení proto není předpokladem tohoto pilotu.
Pouze nové vlastněné fixture byla jednorázově doplněna označená syntetická
geografie CZ / CZ-42 přes již otestované finishShoutGeography a společný
indexový writer, s kontrolou inkarnace/updateTime, digestu a původních dat.
GeographyReady je nyní true, TestModerator má stále svůj stávající regionální
rozsah. Bez Google požadavku, doplnění původních Shoutů, nového triggeru nebo
změny role. Důkaz build/private-moderation-fixture-geography-proof.json.
Skutečný geografický rollout/backfill nadále patří k otevřenému milníku 13.

**Čekající jediný ruční průchod:** nové anonymní okno s
https://shoutout-dev-46c81.web.app/?mvp=0fa2774, TestModerator → Hlášení →
výše uvedený případ → Skrýt obsah bez postihu → jednou Uložit rozhodnutí.
Backend musí potvrdit skutečnou receipt/aktéra, zachovaný report snapshot,
kontrolní zprávu, Auth/App Check VALID a úspěšný POST. Zatím jen čtecí
build/private-moderation-live-audit.json a before-ui snapshot hash; nejsou
pozitivním UI důkazem. Až poté vydat kandidáta Rules se samostatným úplným
CI, ověřit skutečný ruleset a uklidit vymezená testovací data. Do té doby
Rules ani fixture neměnit. Automatická kontrola zastavila Windows ovládání
kvůli nespolehlivému určení URL; další UI akce nebyly provedené. Celá DEV
váha a živá akceptace zůstávají otevřené. Produkce, main a Auth účty beze změny.

<a id="moderation-private-deferred-preparation"></a>

### Místní pokračování během odloženého ručního testu

Vlastník 23. listopadu odložil klientský průchod a požádal pokračovat samostatně.
Kořenové firestore.rules ani živá pravidla se proto nemění; nová fixture se
neuklízí, neobnovuje a její platnost se neprodlužuje.

Starší privateReplyDeletionCandidate nyní přijme i úplný přísnější prototyp,
aniž by znovu povolil přímé staff mazání. Odmítne duplicitní zdroj i neúplný
přechod, kde chybí zákaz přímého contentRemoved. Regrese ověřuje stejný výsledek
pro LF/CRLF a skutečný průchod vlastního serverového mazání pod přísnějšími
pravidly. Zákazy přímého delete, falešného auditu a kombinovaných dávek jsou
ověřené pro všech šest úrovní rolí v active/building/paused/off.

34 serverových/pilotních případů prošlo v původním společném běhu;
nový test přepnutí prototypu v něm nejprve selhal kvůli neexistující metodě
testovacího SDK. Po opravě na podporované initializeTestEnvironment prošlo
všech **13 Rules regresí**, bez přeskočení. Součet pokrytí je 47 různých případů,
nikoli tvrzení o jednom závěrečném společném průchodu. Důkazy:
tools/rules/private_reply_deletion_candidate.mjs,
tools/rules/private_reply_deletion.integration.test.mjs,
tools/rules/private_report_removal.integration.test.mjs a místní
build/private-moderation-deferred-{emulator,rules-final}.log.

Jde o místní přípravu stávajícího schváleného přechodu, bez dalšího MVP kreditu.
Push a úplné CI se spojí s následným Rules checkpointem po skutečné klientské
kompatibilitě; dosavadní úspěšné CI nedokládá tyto pozdější místní změny.
Dokumentační checkpoint 849e55f má success lehké CI 45152572378, které není
náhradou aplikačního/Rules CI. Produkce, Auth, Functions, web, prostředky,
Scheduler i živá data se při tomto pokračování neměnily.

<a id="moderation-private-cutover-prepared"></a>

### Přijatý skutečný průchod TestAdmin a příprava Rules cutoveru

Vlastník 23. listopadu potvrdil zmizení hlášení bez chyby. Server doložil
resolved/contentRemoved v 12:08:27 SEČ, odstranění první zprávy a zachování
kontrolního pokračování i 91 původních zdrojů/pending žádosti. Původní podklady
hlášení mají nezměněný hash 9400ced5…f93b. Rozhodnutí provedl **TestAdmin**,
UID it_admin, úroveň 5, nikoli původně plánovaný TestModerator. Původní
pojistka toto správně odmítla; vlastník následně výslovně schválil přijmout
skutečný admin průchod a upravit pouze kontrolovaný plán úklidu.

Po dočasném 429 doložen jediný úspěšný POST, HTTP 200 a Auth/App Check VALID
se stejnou trace; serverová latency 0,6426 s. Důkazy:
build/private-moderation-actor-audit.json a build/private-moderation-decision-logs.json.
Regionální živé oprávnění není tímto průchodem doložené; regiony zůstávají
ověřené místně v původních serverových regresích.

Read-only acceptPrivateModerationDecision vytvořil samostatný doplňkový plán
docs/local/private-report-moderation-accepted-pilot.json, digest
**873e936e49b56626ef5877afbd850669b0806197e8fba797372dc80d92d4770a**.
Váže původní digest c5801fcb…05c059d9, přesný operation ID
**d5a476d02508c508718db4373d8fa5885929e66dec38f4e7d72bf8605dc4d21a**,
TestAdmin profil/roli a updateTime hlášení i receipt. Kontroluje navíc původního
moderátora, zdroje, účastníky, generace a nezměněné podklady. Neumožňuje seed,
změnu aktéra/rozhodnutí ani tichou obnovu potvrzení po driftu. Původní manifest
zůstal byte-for-byte shodný (SHA-256 54a3f78d…fcb952), audit a role beze změny.
Žádné cloudové zápisy při přijetí. Důkaz build/private-moderation-acceptance-proof.json.
Původní manifest již nepoužívat pro seed/úklid tohoto přijatého průchodu.

Vydávaný firestore.rules nyní obsahuje připravené dvě uzávěry: managed private
delete pro všechny role a přímé contentRemoved u privateReplyReports. Ostatní
rozhodnutí, čtení, nespravované prostředí a serverové operace zůstávají.
Jde zatím o místní zdroj, nikoli živá pravidla. Následuje samostatné úplné CI
přesného cutover commitu, serverová simulace před/po, pouze DEV Rules deploy,
ověření shody vydaného zdroje a teprve pak úklid podle přijatého digestu.
Functions/web ani prostředky není potřeba znovu nasazovat. Původní data,
pending žádost, Auth, produkce a main zůstávají mimo změnu.

Konečný místní běh: **49/49 emulátorových testů**, bez přeskočení, včetně
doplňkového admin plánu, jeho zákazu opětovného seedování, změny role,
receipt/report driftu, opakovaného úklidu a zachování přísnějších Rules.
Lint prošel. První běh odhalil nepodporované reader.get v novém pomocném
nástroji; opraveno na společné getAll, poté celý konečný běh prošel (80,7 s).
Důkazy build/private-moderation-cutover-{emulator-final,lint}.log.
Samostatné úplné CI nového zdroje ještě následuje; místní úspěch není nasazení.

<a id="moderation-private-dev-complete"></a>

### Uzavřená DEV akceptace soukromého odstranění bez postihu

App/server zdroj **0fa2774be634db27013e37ca511e8523c6a9f7c7** má
[success úplné CI 45147594322](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45147594322).
Samostatný Rules/úklidový zdroj **40e127ff52f076b912179427c932a908da62d162**
má [success úplné CI 45164557897](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45164557897),
všech 39 úspěšných kroků včetně aplikačních testů, emulátorů a webového buildu.
Z čistého přesného commitu nasazeny pouze DEV Firestore Rules:
**3de8f7d8-6658-4b24-951f-043eac8de297**. Ověřená shoda vydaného zdroje po
normalizaci konců řádků (SHA-256 cc10ccef…e66ca2). Oficiální serverový simulátor
prošel 16/16 scénářů nad původním, navrženým i skutečně vydaným zdrojem:
managed přímé soukromé delete/contentRemoved jsou DENY, čtení, noAction,
escalation a nespravovaná kompatibilita zachované. Nejde o autentizovaný
HTTP DELETE z prohlížeče. Místních 49 cílených emulátorových testů prošlo také.

Vlastník potvrdil skutečný klientský průchod a výslovně přijal aktéra TestAdmin
namísto TestModerator; přesná receipt/audit, Auth/App Check VALID, HTTP 200 a
zachovaná kontrolní zpráva jsou doložené předchozími důkazy. Regionální živý
průchod neproběhl a nepočítá se tím do úplné ruční regrese rolí. Přijatý
manifest s digestem 873e936e…2d4770a je nyní **cleaned**; znovu neseedovat.
Původní manifest/digest c5801fcb…05c059d9 zůstal beze změny a slouží jen jako
historický podklad; nepoužívat jej k novým mutacím.

Úklid přes společný indexový writer odstranil pouze nový Shout, jednu
kontrolní soukromou zprávu a testovací hlášení; první zprávu už odstranilo
skutečné rozhodnutí. Pod Shoutem nezůstaly žádné dokumenty a obě příslušné
notifikace jsou nepřítomné. Žádné fixture read klíče nezůstaly u Bright,
Business, Admin ani Moderator (před úklidem rovněž 0). **5 potvrzení** zůstalo
beze změny updateTime do původního +7denního termínu; žádný reset kvót.
Všech **91 původních Shoutů a jejich updateTime**, původní pending žádost,
feed 12/news 6/active, 22 Functions, oba minutové plánovače a Hosting
**b5703cec19978454** zachované. Nová callable stále **00001-zec**, cleanup
**00006-lum**; prostředky se při tomto cutoveru neměnily. Žádné Auth mutace,
produkce/main/tagy beze změny.

Důkazy: build/private-moderation-rules-{before,after,final}.json,
build/private-moderation-rules-simulation-{before,after}-proof.json,
build/private-moderation-cleanup.log a build/private-moderation-cleanup-check.json.
Návratový ruleset **e16b7a3d-f363-499c-ad40-262471059271** a jeho zdroj jsou
uchované. Po aktuálním cutoveru ponechat web se serverovou cestou; návrat
starého raw-delete klienta vyžaduje nejprve řízený rollback Rules.

Implementace, automatické ověření, kompletní DEV přechod a živá akceptace
**tohoto jednoho rozhodnutí** jsou uzavřené. Celý moderační milník, ostatní
rozhodnutí/sankce, regionální živá regrese a produkční aktivace zůstávají
otevřené. Odložený feedový test a jeho staré fixture se tím neuzavírají.

<a id="moderation-basic-local"></a>

### Schválený místní úsek: společná rozhodnutí bez postihu

Vlastník 23. listopadu schválil společné serverové schválení obsahu, předání
seniorovi a prosté uzavření hlášení pro Shouty, komentáře a soukromé odpovědi.
Rozhodnutí se týká celé aktuální skupiny nejvýše 50 otevřených/eskalovaných
hlášení; klient posílá očekávaná ID a server je ověří omezeným transakčním
dotazem. Zastaralá/neúplná skupina, překročení 50 nebo nejasný/revytvořený
cíl se odmítne bez částečných zápisů. Schválení zachová neměnné clearance
a dosavadní zákaz dalšího hlášení schváleného obsahu; prosté uzavření
clearance nevytváří. Eskalované případy dokončuje alespoň senior.

Uložená role, země/subdivision, Auth/App Check a účetní způsobilost se ověřují
uvnitř transakce a také při opakování. Audit zůstává u původních hlášení;
body-free technické potvrzení má dosavadních 7 dní. Poznámka, rozhodnutí
i původní seznam ID zůstanou při nejasném výsledku v klientu neměnné.
Ověřit dva moderátory, nové hlášení během rozhodování, změnu role/účtu,
rollback, archivaci a konečný účtový úklid. Transakční izolaci a opakování
posuzovat podle [oficiálního kontraktu Firestore](https://firebase.google.com/docs/firestore/transaction-data-contention),
nikoli podle pouhého úspěchu klientského batch zápisu.

Klientské napojení zůstane za novým serverContentReportDecisions=false;
žádný callable wrapper ani aktivace, živé změny, Auth účty, Rules, nové
sankce/role/limity, prostředky či retence. Zahrnuje dokumentaci/metriky,
commit/push a společné úplné CI. Konkrétní DEV rollout/pilot bude připraven
podle výsledků, nikoli automaticky proveden tímto místním souhlasem.

Před dokončováním je ze zbývající moderation-decision váhy 900 vyčleněno:
jádro 100, jeho ověření 100, klient 50, klientské ověření 50, budoucí DEV 50,
živá akceptace/úklid 50; na ostatní rozhodnutí/sankce zůstává 500. Již hotové
části, celková váha rodiče a váhy ostatních milníků zůstávají stejné.

<a id="moderation-basic-local-results"></a>

### Místní výsledek a navazující DEV brána

functions/decide_content_reports.js řeší approve/escalate/resolve ve všech
třech kolekcích. V transakci porovná úplnou aktuální skupinu s kanonickými
očekávanými ID, ověří stav/inkarnaci cíle a autoritu a uloží všechny výsledky
společně. Dotaz má 51. řádek jen pro zjištění překročení a přenáší pouze
potřebná pole. Nevyžaduje novou kolekci, koordinační zápis ani změnu zdroje
obsahu. Schválení vytvoří neměnnou moderationClearances; resolve má noAction;
escalate uloží assignedRole/escalatedBy/escalatedAt a escalationOperationId.
Dokončení ukládá resolvedBy/resolvedAt/decisionOperationId. Snapshoty, obsah,
čítače, feed a poznámky jiných rozhodnutí se nepřepisují.

Nová receipt action decideContentReports uchovává pouze technická ID, výsledek,
požadovanou roli a fingerprint, bez důvodu/textu/poznámky. Sedmidenní cleanup
allowlist je připravený místně. Konec dosavadní 60denní účtové retence navíc
odstraní resolvedBy/escalatedBy u všech tří typů hlášení; šest scrub fází je
**připojeno na konec** accountPurgeStages, žádný dřívější číselný index se
neposunuje. Zdroj, role ani aktivní/původní živé joby se nyní neměnily.
Nasazení později musí ověřit také kompatibilitu tehdy rozpracovaných jobů;
hotové historické joby tento místní úsek znovu nespouští.

Klientský ContentReportDecisionGateway drží jeden neměnný požadavek na
účet/cíl i při nových ID ve frontě, opakované kliknutí sdílí jednu akci.
Nejasný výsledek zachová původní note/decision/IDs a server-issued klíč;
jednoznačné odmítnutí jej uvolní. Hlavní panel i starší seznamy jsou napojené
za **serverContentReportDecisions=false**. Podporují průběh, chyby, bezpečné
opakování, zánik obrazovky i změnu účtu. DEV/prod konfigurační soubory
zůstaly beze změny, přepínač má přísný boolean/App Check gate a výchozí false.
Žádný callable export; test runtime balíčků hlídá nepřítomnost nového jádra.

Ověřeno: **509 Flutter testů**, včetně 9 nových; **108 nástrojových testů**;
analyze bez nálezů, lint a **177 serverových unit testů**. 618 integračních
testů v unit běhu bez emulátoru je přeskočených, nikoli dodatečný úspěch.
Nových 18 emulátorových případů zahrnuje všechny 3×3 kombinace, 50/51,
nové hlášení během transakce, dva moderátory, replay, poškozenou receipt,
zastaralou inkarnaci, rollback po připravených změnách, archivaci a přesnou
sedmidenní hranici. Samostatných 15 účtových purge regresí také prošlo.
Místní důkazy build/report-decisions-{server-final,server-regression,client-final,flutter-final,analyze-final,functions-final,tools-final,lint-final}.log
a build/report-decisions-measurement.json. První širší běh měl opravený
testový předpoklad: regionální moderátor při chybějícím rodiči dostane
permission-denied už při kontrole scope, nikoli vždy not-found.
Rozšířený průchod skutečným purge workerem také prošel na přesné 60denní
hranici: před termínem zachová všechny 3×2 actor vazby, po termínu je odstraní
a ponechá důvod, čas a operation ID. Důkaz build/report-decisions-purge-boundary-final.log.

SDK operace bez konfliktu: první Shout approve 11 reads / 3 writes, komentář
nebo soukromá odpověď 12 / 3, jejich escalate/resolve 12 / 2; replay 9 / 0.
50 komentářových hlášení 61 / 52; při 51 se nic nezapíše. Nejde o cloudový
kapacitní, cenový ani latencový výsledek. Přidán samostatný úplný CI krok
Test prepared content report decisions (3 min), bez emulátorů v lehkém CI.
Zdroj **7746bbdc56b2db1abdd9965f9cea348ae82243f3** je uložený a pushnutý ve
feature/report-decisions. [Úplné CI 45177013854](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45177013854)
skončilo **success** 23. listopadu 2026 ve 14:00 SEČ. Prošlo 509 Flutter,
108 nástrojových, 177 serverových unit, 18 nových rozhodovacích a celý
142testový retenční průchod; také Rules/serverové regrese, browserové testy,
analyze, lint a webový build. Sady se překrývají, počty se nesčítají na počet
unikátních testů. Log build/report-decisions-ci.log. Tím je schválený místní
úsek uzavřený; žádné nasazení ani živá data, Rules, prostředky či Auth změny.

**Konkrétní návrh navázání, dosud bez souhlasu s provedením:**

1. Připravit callable decideContentReports a kompatibilní řízený DEV pilot;
   navržený DEV profil je dosavadní callable min 0 / max 1, concurrency 1,
   europe-west3, 256 MiB, 15 s, Auth/App Check. Produkční kapacita tím není určena.
2. Připravit nejvýše 3 složené indexy podle dotazů: reports(shoutId,status),
   commentReports(shoutId,commentId,status), privateReplyReports(shoutId,privateReplyId,status).
   Aktuální katalog nemá tyto skupiny výslovně nastavené; přesný plán ověřit
   proti tehdejším indexům. Bez TTL a bez nynějšího nasazení.
3. Před aktivací aktualizovat stejný existující receipt cleanup a účtové
   Functions pro auditní scrub, beze změny prostředků a plánovačů; doložit
   čistý přesný commit/úplné CI, kompatibilitu jobů a návratový web.
4. Navrhovaný pozdější pilot: 1 nový 24h Shout, 1 komentář, 1 soukromá
   odpověď a 3 hlášení pod existujícími testovacími účty, bez Auth změn;
   regionální TestModerator ověří approve/resolve/escalate, TestAdmin dokončí
   eskalovaný případ. Přesná identita, geografie, digest a úklid mají být
   součástí samostatně schváleného živého plánu. Nyní nic neseedovat.
5. **Neuzavírat celé moderační Rules před dokončením ostatních rozhodnutí.**
   Přímé sankční cesty dosud mohou uzavírat hlášení bez resolution; pouhé
   blokování pojmenovaných noAction/contentApproved by nebylo úplnou uzávěrou.
   Navržené pořadí: dokončit veřejné odstranění a sankční transakce, potom
   společný kompatibilní Rules cutover. Nové serverové napojení ani UI flag
   samy nejsou důkazem dokončené serverové autority celého milníku.

<a id="moderation-basic-dev-proposal"></a>

### Schválený DEV přechod společných rozhodnutí

Vlastník 23. listopadu výslovně schválil celý navazující DEV úsek:
callable decideContentReports, řízený pilot, testy/dokumentaci/metriky a
společný commit/push. Po úspěšném úplném CI přesných zdrojů pouze projekt
shoutout-dev-46c81: nová callable europe-west3, min 0 / max 1 instance,
concurrency 1, 256 MiB a 15 s; aktualizace cleanupOperationReceipts a obou
účtových Functions se stávajícími prostředky a plánovači, následně DEV web.
Auth/App Check zůstávají vynucené. Bez změn Rules, rolí, sankcí, retence,
Auth účtů, produkce, main nebo nových služeb.

Všechny tři přesné pending dotazy byly před schválením úspěšně ověřené
čtením DEV s nepřítomným testovacím ID: 0 výsledků, 0 zápisů. Nové indexy
nejsou nyní potřeba; předchozí návrh nejvýše tří indexů je tím nahrazený.
Nejde o kapacitní měření. Před worker aktualizací ověřit rozpracované purge
joby: nové scrub fáze jsou pouze připojené na konec původního seznamu.
Staré hotové joby ani původní pending žádost se ručně neotvírají.

Pilot tvoří přesně 1 nový 24h Shout Bright_Otter_182 s testovací serverovou
geografií CZ/CZ-42, 1 veřejný komentář a 1 soukromá odpověď TestBusiness,
3 odpovídající hlášení. TestModerator (přesná úroveň 3 a přidělený region)
schválí Shout, uzavře komentář bez opatření a předá soukromý případ seniorovi;
TestAdmin (přesná úroveň 5) jej uzavře bez opatření. Nejde o nový postih.
Případná ruční pomoc až po samostatných kontrolách a dostupném klientu;
fixture nevytvářet zbytečně předem. Nástroj respektuje minutový report
cooldown a umožní přípravu později dokončit bez resetu kvót.

functions/content_report_decision_pilot.js a tools/content_report_decision_pilot.mjs
mají nezávislý manifest chráněný digestem; nevyužívají cleaned staré piloty.
Před mutací ověřují přesný čistý commit/úplné CI včetně rozhodovacího kroku,
projekt, digest, původní zdroje/žádosti, inkarnace generací a neměnné role.
Před úklidem vyžadují všechna čtyři skutečná serverová potvrzení a správné
aktéry; administrativní seed není důkazem klientského průchodu.
Úklid přes společný writer odstraní jen nové zdroje, 3 hlášení, jejich
clearance, příslušná oznámení a read klíče tohoto Shoutu u čtyř testovacích
účtů. Odmítne cizí potomky. Receipts zůstanou původních 7 dní, bez resetu
kvót a Auth mutací; přerušení úklidu lze obnovit, cleaned manifest neseedovat.

Návratový web je dosavadní kompatibilní b5703cec19978454 bez nového přepínače.
Při rollbacku neodstraňovat receipts ani vracet starý account worker tak,
aby zapomněl již zahájené nové scrub fáze. Aktuální DEV stav, přesný digest,
CI, revize a skutečné výsledky se doplní až po jejich ověření; nyní pouze příprava.

**Lokální checkpoint:** prošlo 20/20 rozhodovacích a pilotních emulátorových
případů, 32 klientských, 109 nástrojových, lint a analyze bez nálezů.
Pilotní testy skutečně provedly regionální/admin rozhodnutí a opakovaný
úklid, zachovaly receipts, kvóty, původní zdroj a pending žádost a odmítly
změnu role, digestu a cizího potomka. Posun testovacího rate času je výhradně
v izolovaném emulátoru; provozní nástroj cooldown nezkracuje.
Důkazy build/report-decision-pilot-{final,client,all-tools,lint,analyze}.log.
Předchozí neúspěšné běhy odhalily opravenou inicializační revizi fixture,
nesprávně sdílené query API pro databázi/transakci a zastaralé předpoklady
testů při zapnutí nového DEV přepínače. Aktuální úplné ověření je oddělené
od těchto pokusů. Čtecí DEV inventura potvrdila STANDARD, 22 Functions,
2 plánovače, 91 zdrojů a 1 pending žádost; accountDeletionJobs/accountPurgeJobs
jsou prázdné. Původní Hosting a Rules zachované, 0 živých zápisů.

<a id="moderation-basic-dev-results"></a>

### DEV nasazení ověřené, klientský pilot čeká

Zdroj **44e07a5d18570ef2fc416d8387ed459bd55dd853** má
[úspěšné úplné CI 45196844737](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45196844737),
dokončené 23. listopadu ve 15:58 SEČ. Prošlo 509 Flutter, 109 nástrojových,
178 serverových unit, 20 rozhodovacích/pilotních emulátorových a 142 retenčních
případů, ostatní browserové/Rules/serverové regrese, analyze, lint a webový build.
620 integračních případů je v samostatném unit běhu přeskočených; překrývající
sady se nesčítají na počet unikátních testů. Důkaz build/report-decisions-dev-ci.log.

Ze samostatné čisté kopie uvedeného SHA byly cíleně nasazené pouze:

| Function | Ověřená revize | Prostředky |
|---|---|---|
| decideContentReports | decidecontentreports-00001-yak | europe-west3, min 0 / max 1, concurrency 1, 256 MiB, 15 s |
| cleanupOperationReceipts | cleanupoperationreceipts-00007-hoz | původní 0–1 / concurrency 1 / 256 MiB / 60 s |
| accountDeletionRequestCreatedDev | accountdeletionrequestcreateddev-00015-viw | původní 0–1 / concurrency 1 / 256 MiB / 60 s |
| resumeAccountDeletionJobsDev | resumeaccountdeletionjobsdev-00015-huw | původní 0–1 / concurrency 1 / 256 MiB / 60 s |

Všechny ACTIVE, Node.js 22 a 100 % provozu na nových revizích; obsah jejich
skutečných GCS zdrojových archivů přesně odpovídá připraveným balíčkům
(66/66/48/48 souborů). Následně vydán DEV Hosting **bf962d314d4380b7**,
serverContentReportDecisions true, produkční konfigurace beze změny.
Všech 67 aplikačních souborů odpovídá gzip hashům vydané verze a 8 HTTP
odpovědí obou DEV domén má přesnou shodu bajtů s releasem. Dva soubory
__/firebase/init.js/init.json generuje Firebase a jejich hashe zůstaly
shodné s předchozím vydáním; místní .last_build_id je podle Hosting ignore
vyloučený. První kontrola počtu souborů tuto odlišnost nezohlednila; po
jejím přesném rozlišení ověření prošlo, žádná změna app buildu nebyla potřebná.
Nový endpoint odmítl požadavek bez identity/App Check HTTP 401. Platný
klientský moderační průchod se tím ještě netvrdí.

Ostatních **19 Functions**, oba minutové plánovače včetně retry/target
parametrů, Rules **3de8f7d8-6658-4b24-951f-043eac8de297**, feed 12/news 6/active,
91 původních zdrojů s jejich updateTime a 1 pending žádost zachované.
Žádné existující accountDeletionJobs/accountPurgeJobs; nové fáze nikoho
ručně nemigrovaly. Žádná Auth mutace, produkce/main/tagy či nové indexy.
Důkazy build/report-decisions-{cloud-before,cloud-after,release-proof,source-proof}.json
a report-decisions-{functions-deploy,hosting-deploy}.log.

**Zbývající pilot:** nezávislý manifest z čtecího plánování má digest
90be601822323c6e235336f200730e6e04112dd85e235d56a549296957e30d02, phase **planned**.
Jeho kanonický soubor je nyní v čisté release kopii
build/report-decisions-release-44e07a5/docs/local/content-report-decision-pilot.json;
přesun zachoval bajty. Operátor, závislosti i jediný manifest jsou připravené
tam, aby nový dokumentační commit neobcházel kontrolu přesného úplného CI.
Mutace tímto souhlasem zůstávají schválené, ale obsah se založí až po potvrzení
dostupného klienta TestModerator. Později ověřit čerstvost plánu a zastavit
při driftu; dosud **žádný nový Shout/komentář/zpráva/hlášení nevznikl**.
Po 3 rozhodnutích TestModerator a dokončení TestAdmin doložit serverové
receipts/platný Auth a App Check, provést schválený úklid a teprve pak
uzavřít moderation-basic-accept. Staré cleaned piloty ani odložený feedový
test a jeho původní data tím znovu neotevírat. Návratový web b5703cec19978454;
nové účtové scrub fáze a již vzniklá technická potvrzení při návratu zachovat.

<a id="moderation-basic-choice-fix"></a>

### Založený pilot a oprava dostupnosti prostého uzavření

Vlastník potvrdil TestModerator. Stávající plán zůstal čerstvý a z čistého
44e07a5 se seed dokončil ve dvou krocích při zachování skutečného minutového
report cooldownu. Pilot je **seeded**: nový Shout cf14d896…268a7797ccc,
nadpis **MVP rozhodnuti ee9f4648**, 1 komentář, 1 soukromá odpověď,
3 open hlášení a 6 vytvořovacích receipts. Původních 91 zdrojů a pending
žádost zůstaly při každé transakci chráněné. Následné moderační výsledky
jsou níže; tento manifest znovu neplánovat ani neseedovat.

Před ručními instrukcemi se zjistila klientská mezera: hlavní webový panel
nabízel resolve pouze jako opakování už rozpracované akce; první prosté
uzavření poskytovaly jen starší obrazovky, na které webový Profil nevede.
Serverová operace a oprávnění existují, ale schválený klientský pilot by
tak přes hlavní panel nebyl dokončitelný. Oprava v rámci stejného schváleného
rozsahu zpřístupňuje „Označit jako vyřešené“ při zapnutém stávajícím
serverContentReportDecisions. Vypnutá kompatibilní cesta, role, sankce,
opakování a serverové parametry zůstávají stejné; bez nové produktové volby.

Skutečné menu používá společnou staffReportDecisionItems funkci. Dva
widgetové testy otevřou tento výběr a zvolí resolve pro open i escalated
případ; třetí ověřuje neaktivní cestu a původní pending volby. Spolu s
gateway/regresní sadou prošlo 12/12 testů a analyze bez nálezů. Důkazy
build/report-decisions-choice-fix-{test,analyze}.log. Po úspěšném úplném CI
přesného opravného commitu pouze DEV web, žádné Functions/Rules/indexy/seed.
Akceptaci ani další procentní kredit tím neuzavírat; následně dokončit
správné TestModerator/Admin kroky a úklid původní jediné fixture.

**První živá část je ověřená:** vlastník potvrdil schválení Shoutu a předání
soukromého případu na původním webu 44e07a5. Server doložil skutečného
it_moderator, úroveň 3, moderationScope global false / countries CZ /
subdivisions CZ-42, nezměněnou roli a dva POST 200 se spárovaným Auth/App Check
VALID. Receipts fe7b8083…4db759a8 (approve Shoutu) a 1d78f995…15de078d
(escalate soukromé odpovědi) souhlasí s příslušnými auditními poli;
obsah všech tří zdrojů zůstal přítomný. Stav hlášení resolved/open/escalated,
celkem 8 receipts. Podklady build/report-decisions-moderator-first-proof.json
a report-decisions-staff-scope-proof.json. Mimo přidělenou geografii se žádný
živý pokus neprováděl; příslušné odmítnutí dokládá emulátor.

**Oprava je nasazená:** 33853a9d0eb6fca61368217cf053140f5c6f3de4 má
[úspěšné úplné CI 45202922410](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45202922410),
včetně 512 Flutter a celé serverové/Rules/browserové sady s webovým buildem.
Z čistého SHA vydán pouze DEV Hosting **565880d4664da7b2**; 67 app souborů,
8 HTTP odpovědí obou domén a 2 generované Firebase soubory přesně ověřené.
Všech 23 Functions, jejich revize/zdroje/prostředky, oba plánovače, Rules,
92 zdrojů (91 původních + tato jedna fixture), jejich updateTime, pending
žádost a feed/news zůstaly nezměněné. Žádný nový seed nebo serverový rollout.
První čtecí inventura měla přechodný timeout cloudfunctions API, po opakování
prošla bez změny prostředí. Důkazy build/report-decisions-choice-{ci,hosting-deploy}.log
a report-decisions-choice-{cloud-before,cloud-after,release-proof}.json.
Návratový web bf962d314d4380b7 by měl tutéž chybějící volbu; pro dokončení
pilotu ponechat opravenou verzi. Čekají pouze resolve komentáře pod
TestModerator a resolve eskalované soukromé odpovědi pod TestAdmin, potom
ověření skutečných potvrzení a schválený úklid. Akceptace zůstává otevřená.

<a id="moderation-basic-dev-complete"></a>

### Společná rozhodnutí – DEV akceptace a úklid uzavřené

Vlastník potvrdil všechny čtyři klientské akce. První dvě proběhly na webu
44e07a5; zbývající dvě na opraveném 33853a9, server po celou dobu 44e07a5.
Skutečné receipts a audity odpovídají přesně schváleným aktérům a cílům:

| Akce | Skutečný aktér | Serverové potvrzení |
|---|---|---|
| approve Shoutu | TestModerator / it_moderator, úroveň 3 | fe7b8083…4db759a8 |
| resolve komentáře | TestModerator / it_moderator, úroveň 3 | 1ed6518d…b0f7e84d |
| escalate soukromé odpovědi | TestModerator / it_moderator, úroveň 3 | 1d78f995…15de078d |
| resolve předané soukromé odpovědi | TestAdmin / it_admin, úroveň 5 | 152ad3c7…2457d2e7 |

Všechny 4 POST vracejí HTTP 200, každé má spárované Auth a App Check VALID
na revizi decidecontentreports-00001-yak. Obsah/metadata všech tří zdrojů
zůstaly do úklidu beze změny včetně updateTime. Všechna hlášení byla resolved:
contentApproved/noAction/noAction, správné resolvedBy a zachované
escalatedBy/escalationOperationId; clearance patřila správnému moderátorovi.
TestModerator scope zůstal global false, countries CZ a subdivisions CZ-42;
zamítnutí jiné geografie je ověřené emulátorem, ne tímto pozitivním pilotem.
Důkaz build/report-decisions-acceptance-before-cleanup.json.

Následný schválený cleanup z čistého serverového SHA 44e07a5 a jeho úplného
CI odstranil **pouze 1 nový Shout, 1 komentář, 1 soukromou odpověď,
3 hlášení, 1 clearance a 2 příslušná oznámení** (9 dokumentů + indexový plán).
Nezůstali žádní potomci ani cloudové read klíče této fixture u čtyř
testovacích účtů; read cleanup našel 0 klíčů. Všech **10 technických potvrzení**
zůstalo do původní +7denní lhůty bez změny obsahu nebo updateTime a všech
**23 rate dokumentů** čtyř účtů bylo zachováno stejně. Žádný reset kvót,
Auth mutace ani další seed. Jediný manifest s digestem 90be6018…57e30d02 je
**cleaned**, nikdy znovu nepoužívat k seedování.

Závěrečné ověření 23. listopadu v **16:42 SEČ** potvrdilo všech 91 původních
Shoutů a jejich updateTime, původní pending žádost, feed 12/news 6/active,
23 Functions včetně přesných revizí/zdrojů/prostředků, oba minutové plánovače,
Rules 3de8f7d8-6658-4b24-951f-043eac8de297 a Hosting 565880d4664da7b2.
Produkce, main, tagy, Auth účty, retence a indexová konfigurace beze změny.
Podklady build/report-decisions-cleanup-{baseline,proof}.json,
report-decisions-cloud-final.json a report-decisions-final-proof.json.

Implementace, automatické ověření, DEV nasazení a živá akceptace **tohoto
společného základního rozhodování** jsou uzavřené. Veřejné odstranění,
sankce, jejich auditní atomické operace a společný Rules cutover zůstávají
navazujícími úseky celého milníku; produkční start ani další live fixture
se tím neschvalují. Odložený feedový test a jeho původní data zůstávají zachované.

- ponechat přidělení moderátora pouze v Admin SDK nebo jiném chráněném toku,
- přesunout varování, bany, odstranění obsahu a uzavření hlášení do jedné
  idempotentní serverové operace,
- zabránit běžnému klientovi obejít ban nebo zfalšovat auditní údaje,
- ukládat kdo, kdy, proč a nad čím zásah provedl, bez nadbytečných osobních dat,
- omezit četnost moderátorských akcí a chránit citlivé exporty,
- přidat druhé potvrzení pro nevratné nebo hromadné zásahy.

<a id="moderation-public-local"></a>

Vlastník 23. listopadu schválil společný místní úsek: transakční odstranění
nahlášeného Shoutu/veřejného komentáře, uzavření celé aktuální skupiny do
50 hlášení, stávající autorita/geografie/Auth/App Check, audit a 7denní replay.
Shout má dál soft delete; komentář se odstraní s úpravou počtu a živého stavu.
Zůstávají dosavadní indexové writery, 450 zápisů, komentářová delete kvóta,
archiv a retence. Klient za vypnutou volbou, regresní testy, dokumentace,
metriky, commit/push a společné úplné CI. Bez wrapperu, nasazení, živých dat,
Auth účtů, změn Rules, sankcí či nových limitů. DEV přechod předložit podle výsledků.
Před dokončením se z dosavadní zbývající moderation-decision váhy 500
odděluje jádro/ověření 60/60, klient/ověření 40/40, budoucí DEV/akceptace
50/50; ostatním rozhodnutím a sankcím zůstává 200. Součet rodiče, hotové
váhy a backlog se nemění; tyto MVP díly již nemají samostatnou backlogovou položku.

<a id="moderation-public-local-results"></a>

### Veřejné odstranění – místní výsledek zdroje ea1fde9

Jádro functions/remove_reported_public_content.js provede soft delete Shoutu
nebo fyzické odstranění jednoho komentáře, uzavře přesnou aktuální skupinu
reports/commentReports a uloží resolvedBy/resolvedAt/decisionOperationId
i technické potvrzení v jedné transakci. Sdílí kanonickou validaci skupin
s decideContentReports. Nové hlášení před načtením skupiny, 51 řádků,
neúplný seznam, změna inkarnace nebo již schválený obsah skončí bez zápisů.
Shout vyžaduje použitelný indexový plán; komentář aktualizuje živý stav a
počet přes stávající publisher. Společný rozpočet zůstává 450 zápisů.
Pod anonymním kontextem lze dál globálně moderovat cizí komentář, aniž se
obnoví původní tělo, identita nebo čítače smazaného Shoutu.

Aktuální role/rozsah, způsobilost účtu, Auth/App Check se ověřují také při
replay. Eskalovaná skupina vyžaduje existující úroveň 4; admin/owner mají
dosavadní globální geografii. Komentář zachovává společnou kvótu delete
120/h a odstup 1 s; replay ji znovu nečerpá. Shoutu nová kvóta nevzniká.
Receipt neobsahuje text/důvod/poznámku, má původní 7denní limit a je zahrnutá
do místního allowlistu cleanupOperationReceipts. Stávající účtové purge fáze
ji již pokrývají přes userId/authorId a audit hlášení přes resolvedBy; žádné
nové fáze ani posuny číselných stage indexů nevznikly.

Obě klientské obrazovky používají společný ContentReportDecisionGateway,
který váže celý neměnný požadavek a timed key na účet/cíl. Nejasný výsledek
zachová volbu/poznámku/ID pro retry, potvrzení či jednoznačné odmítnutí jej
uvolní. Route removeReportedPublicContent je oddělená od dosavadních základních
rozhodnutí. Nová serverPublicReportRemoval je přísný boolean s App Check
gate, **výchozí false a false v obou konfiguracích**. Host/export neexistuje
a kontrola runtime balíčků vynucuje nepřítomnost nového jádra. DEV/prod
konfigurace, Functions, Rules, živá data, Auth i prostředky zůstaly beze změny.

Ověření: **16/16 konečných nových případů**, včetně dvou reálných generací,
živých projekcí, staršího snapshotu, rozpočtu/rollbacku, 50/51 hlášení,
dvou moderátorů, souběžného approve/remove, vlastního mazání, archivace,
nového hlášení, replay/expiry i fyzického receipt cleanupu. Předchozí širší
běh navíc doložil 18 základních rozhodovacích a 15 purge regresí; jeho jediný
neúspěch byl příliš úzký testový název chyby rozpočtu (nižší indexový guard
správně odmítl zápis). Konečných 16/16 netvrdit jako jeden lokální 49/49 běh.
Prošlo **519 Flutter testů**, **110 nástrojových**, **179 serverových unit**,
analyze bez nálezů a lint. 635 integračních testů v unit běhu bez emulátoru
je přeskočených, nikoli úspěšně provedených. Důkazy build/public-removal-
{server-final-all,server-regression,flutter,client,analyze-final,tools,functions,lint}.log.
Počáteční testové předpoklady pro novou inkarnaci a čas později vytvořeného
Shoutu byly opravené; produkční guardy se neoslabovaly.

SDK měření pro dvě hlášení bez spravovaného indexu: Shout 12 reads / 4 writes,
komentář 15 / 6, replay 9 / 0; nejde o cloudovou latenci/cenu nebo kapacitu.
Podklady build/public-removal-{shout,comment}-measurement.json. Spravovaný
index má své dodatečné blokové/projekční operace a zůstává pod společným limitem.
Zdroj **ea1fde9b9460b018d21570ff551da790faa9bf9f** je commitnutý/pushnutý a
[úplné CI 45230513178](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45230513178)
skončilo **success**. Zahrnuje nové veřejné odstranění, starší rozhodnutí,
celou Rules/serverovou a retenční regresi, browserové testy, analyze/lint
i webový build. Přesný výpis je build/public-removal-exact-ci.json.
Tím je schválený místní úsek uzavřený; živá aktivace/akceptace se tím netvrdí.

Chybějící zdroj se v tomto odstraňovacím kontraktu neoznačí falešně za
odstraněný. Pokud souběh vyhraje vlastní mazání/archivace, může hlášení zůstat
otevřené; další obsluha osiřelých případů patří do zbývajícího rozhodovacího
auditu před úplným Rules cutoverem. Staré deleteShout/deleteComment a přímé
sankční cesty se tímto místním úsekem nepovažují za uzavřené moderační autority.

<a id="moderation-public-dev-proposal"></a>

### Schválený navazující DEV přechod – příprava

Vlastník výslovně schválil celý níže uvedený úsek a pilot („Schvaluji celý
DEV přechod a pilot“). Připravuje se jediný aktivační zdroj: nejprve jeho
úplné CI a Functions, teprve po jejich ověření odpovídající DEV web.

1. Připravit callable wrapper, řízený pilotní nástroj/digest a host testy,
   commit/push a úplné CI přesných aktivovaných zdrojů. Pouze DEV
   shoutout-dev-46c81: removeReportedPublicContent v europe-west3, min 0 /
   max 1 instance, concurrency 1, 256 MiB, 15 s, Auth/App Check.
2. Před aktivací aktualizovat pouze existující cleanupOperationReceipts pro
   nový receipt action, se stejnými prostředky a minutovým plánovačem.
   Zbývající účtové scrub/delete fáze již podporují stejné auditní/receipt
   fieldy; jejich pořadí ani živé joby neměnit. Nové indexy nyní návrh
   nevyžaduje: používá tentýž pendingContentReports dotaz jako nasazený základ.
   Před rolloutem doložit aktuální kompatibilitu a dotazy, ne ji pouze předpokládat.
3. Zapnout serverPublicReportRemoval jen v DEV webu, ověřit artefakt/HTTP
   a návrat na současný kompatibilní web. Rules nyní neměnit; společný
   kompatibilní cutover počká na zbývající sankce a audit autority.
4. Pilot: jeden nový 24h syntetický Shout Bright_Otter_182, dva komentáře
   (cílový TestBusiness a kontrolní Bright_Otter_182) a dvě hlášení,
   s vymezenou serverovou geografií CZ/CZ-42. Přes přesně TestModerator
   odstranit nejdřív nahlášený komentář, ověřit počet 2 → 1 a zachování
   kontrolního komentáře; pak odstranit Shout. Obě skupiny/audity/receipts
   ověřit serverově, bez nového Auth účtu nebo postihu.
5. Po akceptaci uklidit pouze tento manifest, cílová hlášení, kontrolní
   komentář, související testovací oznámení/read klíče přes writer. Receipts
   ponechat původních 7 dní, kvóty neresetovat, původní obsah/pending žádost
   a staré cleaned piloty zachovat. Produkce/main/role/retence beze změny.

Konkrétní souhlas s tímto živým wrapperem/aktivací a fixture je již udělený;
nerozšiřuje rozsah na jiné prostředí, Auth účty nebo jiné testovací zdroje.
Pilotní nástroj má vlastní prefix/manifest a vyžaduje 38 původních zdrojů,
pending žádost, přesné role/profily a inkarnace generací. Staré 91položkové
plány se neupravují ani znovu nepoužívají. Nový seed nelze spustit po prvním
rozhodnutí nebo po cleanup fázi. Obě rozhodnutí musí prokazatelně provést
TestModerator a komentář před Shoutem; admin substituce se potichu nepřijímá.
Cleanup chrání kontrolní komentář, cizí podstromy/hlášení a pokračuje po
přerušení mezi odstraněním obsahu a read klíčů. Receipts a kvóty se nemažou.
Společný místní běh má 41/41 emulátorových scénářů včetně 5 nových pilotních,
2/2 host testy, 111 nástrojových a 519 Flutter testů. Dva konfigurační testy
po aktivaci DEV přepínače nejprve selhaly; izolovaná fixture nyní přepínač
výslovně vypíná a celý Flutter běh je zelený. Důkazy build/public-removal-
activation-{emulator,flutter-final,tools}.log. Následuje přesné úplné CI.
Živý seed až při dostupném klientu, ne předem během CI.

<a id="moderation-public-dev-results"></a>

### Veřejné odstranění – ověřené DEV nasazení a navazující pilot

23. listopadu 2026, ověřeno 19:48 SEČ. Zdroj
**87d6687f17eafa670dcaf115665439bdd5597227**, větev feature/report-public-removal,
[úplné CI 45238613178 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45238613178).
Místně 41/41 společných emulátorových případů, 2/2 host, 111 nástrojových a
519 Flutter testů; analyze/lint čisté. První dva konfigurační testy byly opravené
po aktivaci přepínače, celý závěrečný běh prošel. CI ověřilo také ostatní
Rules/serverové sady, B2, retenci, Storage a webový build.

Z čisté přesné release kopie nasazeno jen do **shoutout-dev-46c81**:

- removeReportedPublicContent, revize **removereportedpubliccontent-00001-yaw**,
  europe-west3, Node.js 22, min 0 / max 1, concurrency 1, 256 MiB, 15 s.
- cleanupOperationReceipts, revize **cleanupoperationreceipts-00008-fal**,
  stávající prostředky a minutový Scheduler zachované; 60 s.
- Web **1974e34d52e2945b**, serverPublicReportRemoval true pouze DEV;
  produkční konfigurace nezměněná. Návratový web **565880d4664da7b2** je kompatibilní.

Obě revize mají 100 % provozu. Stažené zdrojové archivy odpovídají každý všem
67 souborům připraveného balíčku; pilotní helper není v nasazovacím balíčku.
Všech 67 veřejných app souborů odpovídá release, 8 HTTP kontrol obou domén
je shodných a 2 generované Firebase konfigurace zachované. Neautentizovaný
požadavek na novou callable vrací 401. Dotazy pendingContentReports pro Shout
i komentář jsou živě spustitelné; žádné nové indexy nebyly potřeba ani změněny.

Ostatních **22 Functions**, oba minutové plánovače, Rules
**3de8f7d8-6658-4b24-951f-043eac8de297**, feed 12/news 6/active, všech
**38 původních Shoutů a pending žádost včetně updateTime**, nulové účtové/purge
joby zachované. Žádný nový Auth účet, fixture ani kvótový reset, změna produkce
nebo main. Přednasazovací inventura obsahovala 21 stávajících receipts.

Důkazy: build/public-removal-exact-activation-ci.json,
build/public-removal-{read-preflight,prepared-artifacts,functions-proof,source-proof,web-proof}.json,
build/public-removal-cloud-{before,predeploy,after-functions,after-web}.json a oba deploy logy.
Nasazovací/pilotní kopie **build/public-removal-release-87d6687** zůstává čistá
na přesném uvedeném SHA; mutační CLI vyžaduje jeho úplné CI. Budoucí jediný
manifest docs/local/public-report-removal-pilot.json v této kopii vznikl ve 22:02 SEČ,
jeho konečná fáze je **cleaned**, digest
**c8e37fd7eaa0bef9e676b4b0b15c602d44892df9ec783f19a5a45d18c0639cc8**. Znovu neseedovat.

**Průběh navazující akceptace, dokončené níže.** Browser host je nedostupný; při pokusu o
nativní Windows ovládání automatická kontrola zastavila tento UI průchod,
protože nedokázala spolehlivě určit aktuální URL. Další UI akce nebyly provedené.
Vlastník následně potvrdil načteného TestModerator klienta. Ve 22:02 SEČ byl
založen pouze schválený **MVP public removal ada057d3** (24h Shout Bright_Otter_182,
cílový komentář TestBusiness a kontrolní Bright_Otter_182, dvě hlášení).
Počáteční ověření 22:03 SEČ: active, commentsCount 2, oba komentáře přítomné,
obě hlášení open, 5 nových receipts; všech 21 původních receipts/updateTime
zachovaných. Žádné nové Auth účty, reset kvót či změna původních zdrojů.
Důkaz build/public-removal-seeded-proof.json; platnost do 24. listopadu 22:02 SEČ.
**První živá akce potvrzená:** vlastník provedl „Skrýt obsah bez postihu“ u
hlášení „MVP public removal ada057d3 comment. Remove after verification.“ bez chyby.
Server potvrzuje TestModerator (it_moderator, role 3), target komentář absent,
commentsCount **2 → 1**, kontrolní komentář beze změny a celý aktuální publicState
feed-v3 shodný se zdrojem. Hlášení resolved/contentRemoved/resolvedBy odpovídá
novému receipt **577ddc02…fe69a208** s ověřeným 7denním termínem; celkem je
přítomných 6 receipts. Shout je stále active a jeho hlášení open. Důkaz
build/public-removal-comment-proof.json; žádný další živý zápis při této kontrole.
Vlastník následně provedl poslední akci stejného testu s důvodem
„MVP public removal ada057d3 shout. Remove after verification.“ bez chyby.
Oba receipts/audity a chráněný úklid jsou ověřené níže; potvrzení do +7 dní a
kvóty zůstaly zachované. DEV nasazení i živá akceptace se započítávají. Sankce, osiřelá
hlášení a společný Rules cutover/audit autority nadále brání uzavření celého milníku.

<a id="moderation-public-dev-complete"></a>

### Veřejné odstranění – živá akceptace a úklid uzavřené

23. listopadu 2026, konečné ověření **22:21 SEČ**. Vlastník potvrdil oba UI
průchody bez chyby. Přesný **TestModerator / it_moderator / role 3 / CZ/CZ-42**
nejdřív odstranil cílový komentář, potom Shout. Po prvním rozhodnutí byl
commentsCount **2 → 1**, kontrolní komentář beze změny a publicState feed-v3
odpovídal zdroji. Po druhém rozhodnutí byl Shout deleted, kontrolní komentář
stále zachovaný a publicState opět shodný. Obě hlášení byla resolved/contentRemoved,
resolvedBy it_moderator, s odkazy na správné receipts. Pořadí, cíle, aktér,
rozhodnutí i původní 7denní termíny moderačních potvrzení ověřené.

Receipts: komentář **577ddc02…fe69a208**, Shout **c881aa3c…34a2a0c**. Cloudové
logy potvrzují **2×POST HTTP 200**, Auth i App Check VALID; zvlášť 2×OPTIONS 204.
Závěrečný kontrolní skript nejprve počítal i OPTIONS jako moderační požadavky;
diagnostické rozlišení metod bylo opravené, aplikace se kvůli tomu neměnila.

Chráněný cleanup z čistého zdroje **87d6687f17eafa670dcaf115665439bdd5597227** /
[úplné CI 45238613178 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45238613178)
odstranil pouze **1 testovací Shout, kontrolní komentář, 2 hlášení a 1 oznámení**.
Cílový komentář už odstranila první moderace. Žádní fixture potomci, živé
publicStates, oznámení ani cloudové read klíče nezůstaly; cizí read položky zachované.
Všech **28 serverOperations receipts a 26 rate dokumentů** při cleanupu zachováno
včetně updateTime. Z nich všech 21 původních receipts odpovídá také předpilotnímu
dokladu. Sedm testovacích potvrzení se nemaže ani neprodlužuje; ponecháno stávající
automatické 7denní retenci. Kvóty se neresetovaly, žádná Auth mutace.

Jediný kanonický manifest je **cleaned**:
build/public-removal-release-87d6687/docs/local/public-report-removal-pilot.json,
digest **c8e37fd7…c0639cc8**. Nikdy znovu neseedovat. Úplné CI/zdroj této kopie
nadále určují mutační CLI; následné dokumentační commity je nenahrazují.

Závěrečná inventura: **38 původních Shoutů a pending žádost včetně updateTime**,
všech **24 Functions**, oba minutové plánovače, web **1974e34d52e2945b**, Rules
**3de8f7d8-6658-4b24-951f-043eac8de297**, feed 12/news 6/active beze změny proti
předpilotnímu stavu. Žádné účtové/purge joby. Produkce/main/role/retence nezasažené.

Důkazy build/public-removal-{comment,before-cleanup,after-cleanup,final}-proof.json,
build/public-removal-cloud-{before-pilot,final}.json a cleaned manifest.
Akceptace je hotová, nový rollout ani další ruční test tohoto pilotu není potřeba.
Regionální živá regrese soukromého odstranění zůstává odložená samostatně;
veřejný pilot ji nenahrazuje. **Další úsek** vybrat ze zbývajících sankčních
rozhodnutí, osiřelých hlášení a auditu/cutoveru autority, před zdrojovými úpravami
předložit konkrétní rozsah podle AGENTS. Celý moderační milník zatím zůstává otevřený.

<a id="moderation-sanctions-local"></a>

### Navazující společné sankce – místní práce

Vlastník po uzavření veřejné moderace požádal pokračovat samostatně na zbývající
moderaci a ruční testy odložit na konec dostupné práce. Konkrétní pokračování:
serverově sjednotit udělení sankce z hlášení i přímého zjištění a zrušení aktivního
postihu, napojit klienta za vypnutou volbou a automaticky ověřit. Pouze místní
práce/emulátor, následně společný push/CI; žádné nové živé fixture/Auth ani
produkční rozhodnutí. Živý rozsah a provozní parametry doložit připravené zvlášť.

Zachovat role 1–6 a jejich hierarchii, geografii ze zdroje, Auth/App Check,
stávající 50členné skupiny hlášení, 7denní technická potvrzení a nynější retence
postihů. Varování, omezení 1/7/30 dní a ban 1/7/30 dní; senior navíc dokumentované
90denní omezení/ban a trvalý ban. Doklad source/author/role/deletion se čte
v transakci, obsahový snapshot se bere ze serveru, nikoli z payloadu.
Sankce, aktivní vazba/varování, celá skupina hlášení a receipt se uloží společně.
Předchozí počet zůstává stávajících nejvýše 50 dohledaných postihů; nové
automatické eskalace ani jinou frekvenční kvótu nezavádět.

**Nově výslovně schváleno vlastníkem:** nový kratší postih nesmí zkrátit delší
nebo trvalé aktivní omezení. Nové rozhodnutí zůstává v historii, stejná/kratší
platnost zachová aktivní vazbu bez přepisu. Zrušení je samostatná oprávněná
akce s auditním důvodem, nesmí smazat novější odlišnou vazbu. Automatické
znovuzapínání starších historických postihů se nepřidává.

Zrušení zachová původní neměnnou sankci/purgeAt; vlastní dočasný aktivní postih
smí zrušit jeho moderátor, senior také cizí/trvalý. Hierarchie vůči cílovému účtu
se ověřuje aktuálně. Regionální rozsah pro udělení vychází z rodičovského Shoutu;
zrušení zatím zachovává autoritu dnešních Rules (hierarchie a vlastní/dočasný či senior).
Úplný společný audit oprávnění a uzavření přímých zápisů zůstávají navazující brána.

Připravené functions/moderation_sanctions.js a dva wrappery v content.js, zatím
bez nasazení. Navržený host profil obou: europe-west3, min 0 / max 1, concurrency 1,
256 MiB, 15 s; Auth/App Check ve společném obalu. Klientské napojení obou
obrazovek hlášení, přímého zásahu i zrušení aktivního postihu má nový strict
serverContentSanctions=false v DEV, v prod default false. Pole role, expirace,
snapshot nebo libovolné čítače klient neposílá. Před potvrzením se čte jen počet
historie (limit 50), nikoli celé záznamy; retry nevyžaduje znovu číst historii
ani již odstraněný cíl. Nejasný výsledek zamkne původní důvod/volbu/ID a nabídne
stejný požadavek. Zrušení dialogu neuzavře zdrojové hlášení jako dokončené.

Konečných **28/28** emulátorových scénářů ověřuje 90denní omezení, 50/51,
kolize/souběh, rollback, odnětí role/žádost o mazání, zachování silnější vazby,
bezpečný replay zrušení i cleanup kopie důkazů podle skutečného sourceReportId
(nezaměňovat reprezentativní hlášení s prvním lexikografickým ID skupiny).
Sedm cílených unit/host a 9 konečných klientských testů zelených. Širší místní
regrese měla **528 Flutter, 112 tools a 185 unit**, bez emulátoru přeskočeno 666
integračních případů; konečné drobné kontraktové/validační změny mají následné
28/7/9 cílené běhy. Analyze/lint čisté. Přesné společné úplné CI ještě následuje.
Podklady build/moderation-sanctions-{emulator-final,client-final,unit-final,flutter,tools,functions,analyze,lint}.log.

Následný klientský audit odhalil před živou aktivací nepovolený preflight cizí
soukromé zprávy. Opravená příprava soukromé sankce použije authorId ze snapshotu
konkrétního hlášení a nikdy nečte cizí privateReplies dokument. Server dál
transakčně ověřuje skutečného autora, příjemce, text, skupinu i roli; údaj
z klienta není důvěryhodný důkaz. Veřejný zdroj a přímé zjištění se čtou jen
jednou, opakování nevyžaduje nové čtení zdroje. **13/13** cílených klientských
testů včetně zákazu soukromého čtení a analyze prošlo; podklady
build/moderation-private-subject-{client,analyze}.log. Původní CI 45279278076
bylo záměrně zrušeno během běhu kvůli této nalezené opravě; není dokladem
ověření konečného zdroje. Následuje úplný běh opraveného commitu.
Finální společný lokální běh **48/48** (29 sankčních, 11 osiřelých a 8
authority případů), žádné přeskočení, je v
build/moderation-checkpoint-emulator-final.log. Nová regrese ověřila čtyři
varianty podvržení soukromého cíle bez zápisu sankce, reportu nebo receiptu.
Zdroj **0cf1b870a8d332d0b433bfe0177028ef8ad035ec** má
[úspěšné úplné CI 45280367518](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45280367518).
Započítává klientské regrese včetně soukromého preflightu; nová navazující
retenční změna 95e018f ještě potřebuje své přesné úplné CI. Živá akceptace
ani společné Rules uzavření tím nejsou dokončené.

Rozpad zbývající nedokončené váhy moderation-decision **200** zůstává pevný:
140 sankce (30 kód / 30 kontrola / 20 klient / 20 kontrola klienta / 20 DEV /
20 akceptace), 40 osiřelá hlášení (4×10) a 20 společné uzavření přímých zápisů.
Váha milníku se nemění; připravený kód nezapočítává nasazení ani ruční akceptaci.
Připravená allowlist aktualizace úklidu technických potvrzení se nenasazuje.
Žádné backendové čtení Auth účtů ani mutace živých uživatelů nejsou potřebné.

**Business produktové volby schválené:** zamítnutou žádost půjde opravit a
znovu odeslat na stejném účtu. Pozastavení zastaví nové publikování/propagaci,
ponechá přístup k údajům/důvodu a starší běžné Shouty nechá doběhnout; obnovit
smí admin/owner. Business role zůstane kvůli zákazu obcházení osobní cestou.
Přesný místní rozsah serverového sjednocení/klienta a testů je nyní předložen
vlastníkovi zvlášť; samotná produktová volba nedokládá implementaci ani DEV stav.

<a id="moderation-orphans-local"></a>

### Osiřelá hlášení a autorita starších mazacích API – místní příprava

Navazuje v témže schváleném společném moderačním úseku. Jádro
decideContentReports umí za výchozím **orphanReportResolutionEnabled=false**
uzavřít chybějící cíl jako vyřešený / noAction, se zachováním důkazů a auditu.
Nevytváří fiktivního autora, neobnovuje obsah a netvrdí, že byl právě odstraněn.
Existující klientské „Označit jako vyřešené“ je dostupné i při chybě detailu;
payload a běžná rozhodnutí zůstávají kompatibilní. Chybějící nebo anonymizovaný
rodič nedává regionální oprávnění. Znovu vytvořený rodič nemůže dodat novou
geografii starému hlášení. Přeživší cizí komentář pod anonymním kontextem zůstane
zachovaný; rozhodnutí ho nesmaže ani nevydává za chybějící.

Samostatný body-free receipt resolveUnavailableContentReports má původních
7 dní a ověřuje aktuální roli i při opakování. Kolize obou typů receiptů zastaví
zápis. Vypnutí přípravy zachová běžné staré chování, ale již potvrzené osiřelé
rozhodnutí starý wrapper nedokáže znovu potvrdit; při návratu proto ponechat
kompatibilní nový wrapper a vypínat klientskou aktivaci. Nová větev resolve čte
jeden další malý receipt; těla všech Shoutů se nenačítají.

Společný místní běh sankcí a osiřelých hlášení: **39/39**, z toho 11 nových
osiřelých případů (včetně výchozího vypnutí), 50/51, změna role, chybějící
rodič, soukromé důkazy, starý receipt a uplynutí sedmidenního okna.
Podklad build/moderation-orphans-emulator.log; lint čistý. Přesné úplné CI
a živá aktivace jsou samostatné další kroky.

Audit našel, že dosavadní deleteShout/deleteComment dovolují moderátorovi
smazat cizí obsah mimo novou auditovanou cestu. Připravené **authorOnly**
omezení za výchozím **managedModerationAuthorityEnabled=false** ponechá
vlastní mazání (také po expiraci), ale odmítne cizí obsah i adminovi a i při
opakování starého potvrzení. Veřejné odstranění musí použít již existující
removeReportedPublicContent. Wrapper předává tuto volbu společně s dosavadním
writerem; ostatní operace a jejich indexování se nemění. Přímá stará klientská
moderace zůstává jen návratovou větví, do živého uzavření doložit přepínače
serverových rozhodnutí/odstranění a klientskou kompatibilitu.

Konečný samostatný běh **49/49** zahrnuje osm případů authority gate i 41
stávajících regresí společného rozhodování, veřejného odstranění a pilotních
nástrojů. Vlastní běžný/Business/moderátorský obsah i replay fungují; cizí obsah
odmítnut u úrovní 3–6 a legacy moderátora, bez změny zdroje, rate nebo receipt.
Sedm cílených unit/host, 44 nástrojových testů, lint a dokumentační kontroly
prošly. Podklady build/moderation-authority-regression.log a
build/moderation-checkpoint-{unit,tools}.log. Společný CI krok nyní obsahuje
sankce, osiřelé cíle i authority gate; dosavadní rozhodovací sada zůstává navíc.

**Společný audit není živě uzavřený:** navazující místní
[retenční oprava](#moderation-retention-followup-proposal) a
[Rules prototyp](#moderation-authority-local-proposal) jsou nyní připravené
a ověřené úplným CI. Zbývá konkrétní společný DEV přechod a živá akceptace.
Číselné pozice původních purge fází se nepřeskládávají. Místní kontrola sama
nezapočítává živý authority cutover ani neaktivuje sankce v DEV.

Žádná část tohoto místního úseku se zatím nenasazuje; Rules, Scheduler, živá
data, Auth, prostředky, produkce i main zůstávají beze změny. Ruční testy až
po dokončení dostupných nezávislých příprav; Business volby výše jsou již schválené.

<a id="moderation-retention-followup-proposal"></a>

#### Konkrétní návrh navazující opravy retenčních kopií

Potvrzeno v account_purge_policy/job: copiedReport odstraňuje reason a
contentSnapshot ze sanctions, ale ne z navazujícího warning nebo aktivní
vazby. U smazaného moderátora se scrubují sankce/varování/revokace, nikoli
moderatorId v cizím aktivním bans/contentRestrictions. Nová serverová sankce
tyto historické kopie nezavádí, stále je však umí vytvořit. Proto před aktivací
ověřit celou cestu místo pouhého testu hlavní sanctions kolekce.

Navržený samostatný místní rozsah k potvrzení: do transakce odstraňující
zkopírovaný důkaz připravit omezené dočištění reason u warning a odpovídající
aktivní vazby. Vazbu určit přes přesné userId + sanctionId, nikdy nesmazat
novější odlišný postih ani změnit expiresAt/permanent nebo vynucování zákazu.
Varování dohledat omezeným dotazem na sanctionId, při nejednoznačné vazbě
zastavit bez částečného zápisu. Reference moderátora v aktivních vazbách
řešit pouze přidanými konečnými fázemi; stávající číselné fáze neměnit.
Ověřit také souběh nového rozhodnutí s 60denním úklidem reportéra, aby již
odstraněný důvod nevznikl znovu. Žádný globální scan ani prodloužení retence.

Regrese: warning/ban/restriction, cizí nezasažený případ, novější vazba,
restart mezi dávkami, souběh s moderací/revokací a reporter purge,
ambiguita/rollback a pokračování původního purge jobu bez přečíslování fází.
Po místním ověření společný push/CI a konkrétní začlenění do DEV plánu;
do té doby žádné živé přepínače, migrace nebo zásahy do existujících jobů.
Vlastník tento místní rozsah výslovně schválil; implementace a ověření
jsou uzavřené zdrojem 95e018f a úplným CI 45283039166 success. Živý zásah ani
aktivace tím schválené nejsou.

Připravené moderation_retention.js: warning dohledává limit 2 se selektivními
poli; nejednoznačná kopie zastaví celý transakční scrub. Aktivní pointer se čte
jedním přesným dokumentem a mění se jen při shodě userId/sanctionId. Dvě nové
moderatorId fáze jsou pouze za původními pozicemi. Volba
moderationEvidenceRetentionEnabled=false společně řídí approve guard a
moderationCopiesEnabled v existujícím DEV workeru; nové sankce mají vlastní
retention guard vždy. Žádné TTL ani nová plánovaná úloha.

Před kopírováním se transakčně čtou jen userId/accountStatus a metadata času
žádosti, případně ingressClosedAt odpovídajícího purge jobu. Horní mez je
2 čtené dokumenty na reportéra a 1 navíc pouze při existující žádosti, nejvýše
50 různých reportérů; nejde o měření cloudové ceny nebo propustnosti. Guard
blokuje přesnou hranici +60 dní i dokončený purge a čtením jobu ohradí transakci
zahájenou těsně před termínem. Pouhé ověření request času by souběh s již
zahájeným úklidem dostatečně neohradilo. Běžné resolve/escalate nové kopie
mimo původní hlášení nevytvářejí, approve guard je za vypnutou volbou.

**50/50** společných lokálních scénářů, **5/5** cílených purge scénářů, **11**
unit/host a **3** testy balíčků zelené; lint čistý. V prvním širším purge běhu
prošlo 18/19: nový restartovací test nedostatečně simuloval doběhnutí původní
fáze (čekal retry a ponechal notifikační preference). Test opraven; opakovaný
cílený běh všech pěti nových případů zelený. Selhání nebylo ignorováno ani
zaměněno za plný konečný průchod sady; následné úplné CI 45283039166
potvrdilo celou kombinaci včetně purge.
Podklady build/moderation-retention-{core-final,purge-final,unit,artifact,lint}.log.
Po doplnění fieldMask prošlo navíc všech 5 vybraných reporter/retention scénářů
nad skutečným SDK a emulátorem (build/moderation-retention-fieldmask.log).

Po případné budoucí aktivaci ponechat kompatibilní guard i maintenance zapnuté
také při návratu klienta. Worker s vypnutými novými fázemi nesmí převzít job,
který již vstoupil do přidaných fází; starší binární rollback není kompatibilní.
Žádná změna existujících živých jobů tímto místním úsekem neproběhla.

<a id="moderation-authority-local-proposal"></a>

#### Návrh společného místního uzavření klientské moderační autority

**Vlastník schválil místní přípravu i testy 24. listopadu.** Stejně schválil
navazující místní Business úsek popsaný níže; další souhlas s těmito dvěma
rozsahy nevyžadovat. Živá aktivace není součástí tohoto souhlasu.

Schválený rozsah: připravit výchozí vypnutou Rules bránu bez nové živé
kolekce. Po budoucí aktivaci uzavře klientské zápisy sanctions, warnings,
bans, contentRestrictions, sanctionRevocations, moderationClearances a update
tří typů obsahových hlášení (reports/commentReports/privateReplyReports).
Čtení, vlastní mazání obsahu, role a ostatní zápisy zůstanou podle dnešních
pravidel; Business aktivaci ani přidělování rolí tento cutover neuzavírá.
Serverové Admin SDK operace zůstávají funkční a jejich vlastní autorizace
musí být doložená před živým zapnutím. Již připravené authorOnly pro
deleteShout/deleteComment je součástí téhož přechodu.

Místní testy celé Rules varianty před/po: běžný/Business/moderátor/senior/admin,
vlastní čtení a čtení historie, přímé falešné rozhodnutí/sankce/revokace,
atomické batch obcházení a odmítnutí update přes starý klient. Nový serverový
průchod v téže emulátorové databázi musí dál projít s korektním auditem.
Výchozí vypnutý soubor musí zachovat stávající regrese. Zahrnout dokumentaci
a jeden společný push/CI; teprve podle výsledků sestavit konkrétní DEV plán
včetně kompatibilního návratu (starý web s přímými zápisy po uzavření nestačí).
Pouze místní příprava: bez nasazení, živých dat, Auth účtů, nových prostředků,
Scheduleru nebo změny rolí/retencí. Místní prototyp není živé Rules uzavření.

Budoucí provozní pořadí doložit v konkrétním DEV plánu: kompatibilní serverové
writery/guard a klient, potom ověřené Rules uzavření, až pak nová purge údržba.
Pouhé zapnutí serverového guardu nechrání starou přímou klientskou cestu.
Společná zdrojová volba proto nenahrazuje ověření skutečně nasazených zdrojů
jednotlivých Functions. Rollback po vstupu jobů do nových fází musí ponechat
kompatibilní worker a nové API, nikoli starý zdroj s vypnutou údržbou.

Připravený firestore.rules má **managedModerationAuthority=false** bez nového
řídicího dokumentu. Žádná čtecí podmínka, role ani původní validátor se nemění;
nová podmínka je jen u výše vyjmenovaných zápisů. Pomocník
tools/rules/moderation_authority_candidate.mjs vytvoří pouze místní zapnutou
variantu, kontroluje jedinou přesnou aktivační značku a drift odmítne.
Vydávaný soubor ponechá vypnutý. Obě celé varianty se kompilují v emulátoru.

**9/9** konečných scénářů prošlo (build/moderation-rules-gate-final.log).
Před bránou procházejí platné warning/ban/restriction batch, revokace a
clearance+approve; po zapnutí jsou odmítnuté včetně atomických batch a pro
admina/ownera. Ověřeny role 1–6, legacy i anonymní, chybné typy/vlastnictví,
nadměrný důvod, podkolekce a podvržený audit/receipt. Změna feed control na
off/paused či jeho odstranění autoritu nevrátí. Vlastní warning/ban čtení,
staff historie a všechny tři fronty podle skutečných klientských dotazů
procházejí; cizí/soukromé a anonymní čtení zůstává odmítnuté. Serverové
sankce/revokace, schválení, obě odstranění a vlastní mazání prošly ve stejné
databázi. Nejde o úplný audit ostatních existujících oprávnění aplikace.
První dva serverové testy měly neúplný laboratorní feed control; opravená
fixture používá platný kontrakt a finální průchod je celý zelený. Žádná
produkční pojistka kvůli testu nebyla oslabena. Zdroj
**0b68535329e9a10763edb9f3fb04bd919fa886b7** má
[úspěšné úplné CI 45335353004](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45335353004),
včetně společné 59členné moderační sady a všech dosavadních kontrol/buildů.
Rules brána nadále false, živé uzavření není započítané.

Před implementací je rozdělená pouze zbývající váha: původních 20 společné
autority = 5 místní kód / 5 regrese / 10 živé uzavření. Původních 1 250 Business
= 250 server / 250 kontrola / 200 klient / 150 kontrola klienta / 100 DEV /
100 živá akceptace / 200 pravidla ruční kontroly a společná regrese. Váhy
rodiče i již dokončená práce zůstávají beze změny; nové podúseky nepovolují
nasazení. Business pravidla kontroly/duplicit/sporů zůstávají samostatně otevřená.

<a id="business-review-local"></a>

#### Schválený místní Business úsek

Serverově sjednotit approve/reject/suspend/reactivate pro dnešního admin/owner
a opravené resubmit stejného žadatele. Zachovat firemní roli při pozastavení,
blokaci nového publikování/propagace na serveru a doběhnutí starších běžných
Shoutů. Klient za vypnutou volbou; žádné nové registry, pravidla kontroly firem,
role, kvóty, retenční lhůty ani živá data/Auth. Audit použije dosavadní soukromé
businessActivationAudits se stejnými applicationId/administratorId vazbami na
60denní úklid. Zachovat ochranu identity proti návratu smazaného účtu.
Testy souběhu rozhodnutí/resubmit, opakování, změny role a mazání účtu;
společný push/CI a konkrétní DEV návrh až podle výsledků.

**Místně připraveno na feature/business-moderation:** functions/business_review.js
obsahuje transakční stavový automat, bez callable exportu. Verze žádosti
expectedRevision/revision (starý dokument = 0) ohradí zastaralé rozhodnutí;
approve/reject přijímají pending_email/checking, resubmit jen vlastní rejected,
suspend pouze active a reactivate pouze suspended. Schválení vytvoří roli 2,
profil a pobočku initial atomicky s aplikací, auditem a sedmidenním receipt.
Resubmit nepřidělí roli ani Business profil; e-mail pochází z ověřeného Auth,
geohash přepočítává server. Admin/owner se ověřuje z accountRoles uvnitř téže
transakce, před čtením cizího Auth. Zákaz, mazání/marker a privilegovaná cílová
role operaci zastaví. App Check a ověřený e-mail jsou povinné.

Audit nese applicationId/administratorId, action, revision, operationId,
důvod, čas a předchozí/následný stav s verzí. Nedubluje celé žádosti, e-maily
ani historická UID aktérů; původní aplikační/profile data mají dál stávající
účtový archiv. Nové reviewedBy kopie nevznikají. Původní applicationId purge
a administratorId scrub, activatedBy a assignedBy zůstávají použitelné;
serverOperations má jen vazby, fingerprint a výsledek bez důvodu/obsahu.
Přesné opakování používá tentýž receipt; změna payloadu nebo role jej nepřepíše.

Klientský serverBusinessReview=false je explicitně v DEV, výchozí false
v produkci i nativním běhu. Připravená fronta rozlišuje čekající/aktivní/
pozastavené žádosti, dialog vyžaduje důvod zamítnutí/pozastavení. Opravený
formulář zachová údaje, nezakládá další Auth účet, e-mail je pouze pro čtení.
Nejasná odpověď zamkne původní payload i pokus; změna účtu zruší místní vazbu
a opožděná odpověď nesmí potvrdit akci pro jinou relaci. Pozastavení zachová
navigaci, profil a mazání účtu, zobrazí důvod a zakáže nové publikování; stávající
createShout kontroluje status Business profilu transakčně. Původní Shouty se nemění.

Ověřeno místně: **15/15** emulátorových scénářů, **3/3** unit validací,
**12** nových klientských testů (**38/38** s dosavadní konfigurací/bránou),
**34/34** nástrojových/balíčkových kontrol. Souběh dvou adminů a dvou oprav,
odvolání role, ztracená odpověď, rollback auditu, mazání během Auth kontroly,
skutečné publikování před/po pozastavení, všechny promo volby a osobní bypass,
publikace souběžná s pozastavením, retenční vazby i zamknutí formuláře jsou
součástí trvalých testů. První publikační fixture postrádala avatar; doplněná
fixture nyní ověřuje konkrétní business-location-unavailable, nikoli libovolnou
chybu precondition. Doklady build/business-review-{emulator,client,tools,unit}.log.
Nový npm --prefix tools run test:business-review je samostatně zapojený do
úplného CI. Zdroj **464c0ad0f8d690101b651373dbfc9e336b4cfce1** má
[úspěšné úplné CI 45339418090](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45339418090).
Prošel celý klient/analýza, nástroje, serverové unit/lint, všechny dosavadní
Rules a serverové transakce, B4, moderace včetně 59 společných a 15 Business
scénářů, B2, úplné purge, Storage i webový build. Oba ověřovací Business
podúseky jsou uzavřené; DEV aktivace, živá akceptace a celý moderační milník
zůstávají otevřené. Backlogové bl-081-work také ještě není celé splněné,
protože zahrnuje navazující Business Rules přechod; jeho váha se zpětně nedělí.

Žádné nové API zatím není nasazené; původní klientská aktivace a Business Rules
jsou beze změny. Před živým přechodem dokončit wrapper a přímou Business autoritu,
ověřit návratovou verzi, plán fixture a čerstvý přesný zdroj/CI. Kritéria kontroly
firem, duplicit a sporů ani produkční kapacita nejsou tímto úsekem vyřešené.

<a id="moderation-business-dev-next-proposal"></a>

#### Navazující společný DEV přechod – schválený rozsah

**Vlastník 24. listopadu výslovně schválil celý tento DEV přechod a pilot.**
Stejný rozsah, fixture ani prostředky znovu neschvalovat; ruční průchody až na konec.

**Aktualizace:** technické nasazení již dokončené, viz
[živé důkazy níže](#moderation-business-dev-results). Následující příprava
zachovává původní checkpoint; tvrzení „dosud nenasazeno“ popisuje tento starší stav.

**Příprava 24. listopadu:** wrapper reviewBusinessApplication je nyní v content
hostu se společným App Check, skutečným Admin Auth a schválenými prostředky.
Zdrojové brány managedModerationAuthority/managedBusinessAuthority jsou true;
serverové a DEV klientské volby také true. Produkční config zůstává bez nich.
Dosud nenastalo žádné nasazení; stávající DEV pořád používá původní zdroj.
Místní aktivní/baseline Rules kompilují a prošlo 20 cílených scénářů, dalších
96 historických případů, 22 společných Business/pilotních, 24 klientských a
36 nástrojových kontrol. Analýza a lint čisté. Přesné úplné CI následuje.

První úplné CI db13fed / 45374082977 skončilo u dvou starších konfiguračních
Flutter testů: jejich gatewayFixture nevypínala nově zapnuté Business/sankční
volby před odebráním App Check. Opravená pouze fixture, kontrola skutečné
konfigurace nebyla oslabena. Celá místní klientská sada **543/543** následně
prošla. Neúspěšný běh není použitý pro nasazení; přesné nové úplné CI je povinné.

Historické allow-testy ve firestore.rules.test, managed_content_cutover a
private_report_removal záměrně používají legacyModerationRules: přepne jen dva
přesně označené konstantní guardy. Nevydává ani nemění soubor. Ostatní současné
access testy čtou aktivní zdroj. Samostatné authority/Business sady testují obě
celé varianty a aktivní serverový průchod; staré allow-testy nejsou vydávané Rules.
Aktivní guardy nepřidávají čtení/řídicí dokument a neřeší celkový bezpečnostní
audit aplikace. Nový Business prototyp má ověřené role 1–6/legacy/anonymní,
batch obcházení, nadměrná/chybná pole, cizí vlastnictví/časy/stavy a skutečné
admin fronty; vlastní registrování/údaje/pobočky zůstávají zachované.

Řízený tools/moderation_business_pilot.mjs má plan/status/account/content/orphan/
cleanup, vyžaduje digest, přesný čistý release s úplným CI a schválenou
připravenost klienta. Auth provisioning má jediné předem zvolené UID/e-mail,
ověření inkarnace a opakovatelné navázání po ztracené odpovědi. Celý pilot prošel
v emulátoru včetně zachování silnějšího banu, odvolání správného postihu,
osiřelého resolve, cizích potomků odmítnutých před smazáním Auth, restartu úklidu
a zachování updateTime receipts/původních dat. Místní zápis hesla zůstane pouze
v ignorovaném docs/local manifestu a po úklidu se odstraní. Úklid nejdřív
ověří serverová potvrzení všech pěti Business rozhodnutí, tří postihů,
revokace a uzavření tří hlášení. Před odstraněním Auth zablokuje stale tokeny
minimálním markerem a odstraněním vlastního profilu; marker bez PII zůstane.
Nové minimum není změnou schváleného retenčního pravidla. Kvóty ostatních účtů
se neresetují; skutečný cooldown se při živém seedování musí vyčkat.
Spojuje připravené sankce/osiřelá hlášení/retenci/Rules s místním Business tokem,
aby se znovu neschvaloval každý drobný wrapper. Cíl výhradně shoutout-dev-46c81;
produkce, main, nové tarify, role, sankční délky a retence beze změny.

Podklad místní přípravy 464c0ad / úplné CI 45339418090 success. Čerstvé čtení
DEV inventury 24. listopadu potvrdilo **24 ACTIVE Functions**, žádnou z níže
uvedených tří nových callable a stejná omezení šesti aktualizovaných Functions.
Veřejný app-config má dál serverPublicReportRemoval=true a nové volby chybějí
(výchozí false). Nejde o nové nasazení ani úplný datový audit; před přechodem
znovu ověřit živý stav, source archivy, CI a artefakty.

Příprava po souhlasu:

- Doplnit callable reviewBusinessApplication s dosavadním Auth/App Check
  a businessReviewEnabled; otestovat host i skutečný balíček. Připravit
  aktivaci managedModerationAuthorityEnabled, orphanReportResolutionEnabled,
  moderationEvidenceRetentionEnabled a klientských serverContentSanctions /
  serverBusinessReview, spolu se samostatnou Business Rules bránou.
- Business brána uzavře původní přímé admin přidělení Business role, vytvoření
  profilu/první pobočky, aktivaci žádosti, ruční potvrzení e-mailu a audit.
  Zachová prvotní žádost, vlastní pending_email → checking/zrušení, vlastní
  oprávněné úpravy údajů/poboček i stávající čtení. Nové resubmit je serverové.
  Zvláštní testy před/po ověří batch obcházení a žádné rozšíření jiných rolí.
- Připravit řízený pilot/úklid s digestem manifestu, přesným DEV cílem,
  ověřeným čistým zdrojem/úplným CI a kontrolami inkarnací/updateTime.
  Ověřit kompatibilní návratový web; starý web s přímou moderací po uzavření
  Rules nestačí. Nové zdroje/release artefakty musí mít vlastní úplné CI.

Navržený živý rozsah po přípravě a kontrolách:

| Změna | DEV rozsah |
|---|---|
| Nové callables | sanctionContent, revokeSanction, reviewBusinessApplication; každá europe-west3, min 0/max 1, concurrency 1, 256 MiB, 15 s, App Check |
| Stávající callables | decideContentReports (osiřelé resolve + retenční guard), deleteShout/deleteComment (authorOnly); stejná dosavadní omezení prostředků |
| Stávající úklid | cleanupOperationReceipts; původní min 0/max 1, concurrency 1, 256 MiB, 60 s, minutový plánovač a rozpočty zachované |
| Účtové Functions | accountDeletionRequestCreatedDev a resumeAccountDeletionJobsDev; stejné prostředky, 50/dávka, lease/retry a minutový plánovač; nové retenční fáze až po uzavření ingress |
| Klient a Rules | DEV web, společná moderační brána a navazující Business brána; čtení/ostatní zápisy zachované |

Pořadí: čerstvá inventura a záloha metadat → kompatibilní API/klient s guardy
→ doložené doběhnutí starých volání → ověřené uzavření přímých Rules cest
→ teprve nová purge údržba. Samotný serverový přepínač neuzavře staré klienty.
Při neprokázaném doběhnutí, chybějícím indexu nebo driftu zdroje se přechod
zastaví; nový index/migraci nespouštět bez konkretizace. Z nynějších query
plyne potřeba stávajících indexů, nový index ani TTL se zde nenavrhuje.

Navržený pilot: **jeden nový dočasný ověřený Auth účet**, vlastní syntetická
Business žádost/profil/první pobočka a běžný profil/právní fixture; nejvýše
**jeden 24h Shout, dva veřejné komentáře, jedna soukromá odpověď a tři hlášení**.
Geografie pouze serverová testovací CZ/CZ-42. Ostatní účastníci jsou stávající
Bright_Otter_182/TestBusiness/TestModerator/TestAdmin bez změny jejich rolí
nebo postihů. Postih se vztáhne výhradně na nový dočasný účet.

Ověřit reject → oprava stejného účtu → approve → suspend/zákaz nového Shoutu
i promo → reactivate; původní běžný obsah musí zůstat. Nad syntetickým obsahem
ověřit varování, časově omezený zákaz a jeho explicitní zrušení, audit,
zachování silnější vazby, přímé zápisy odmítnuté Rules a uzavření jednoho
již odstraněného komentáře jako osiřelého hlášení. Účtový rozsah/role ověřit
ze skutečného aktéra; globální admin průchod nenahrazuje regionální test.
Automatické kontroly průběžně, ruční průchody až na konec; data nevytvářet
před dostupným klientem/uživatelem, aby pilot zbytečně neexpiroval.

Po úspěchu odstranit výhradně tento nový Auth účet a data z jeho manifestu,
včetně vlastních testovacích postihů, oznámení, clearance a read klíčů;
Shout uklidit přes společný indexový writer. Technická potvrzení ponechat
původních sedm dní, kvóty neresetovat. Původních 38 Shoutů, pending žádost
a ostatní Auth/role nebudou cílem testu ani úklidu. Nasazená údržba obecně
zpracuje způsobilé záznamy podle dosavadních pevných termínů; nejde o změnu
retence nebo ruční posun starých jobů.

Návrat: po uzavření Rules ponechat serverovou cestu a obě autoritativní brány;
nevracet přímé klientské zápisy jen kvůli rollbacku webu. Po vstupu purge jobu
do přidaných fází ponechat kompatibilní worker i ingress guard; starý worker
s false není bezpečná návratová verze. Tento DEV profil neurčuje produkční
kapacitu 5 000 souběžných uživatelů. Kritéria ruční kontroly firem/duplicit/sporů
a společná předstartovní regrese zůstanou samostatným otevřeným krokem.

<a id="moderation-business-dev-results"></a>

#### Společný DEV přechod – nasazení a technické ověření 24. listopadu

Nasazený zdroj **05fc1eddf51a2594524774b3ea4857d0e6ae2d1b**, větev
feature/moderation-business-dev, [úspěšné úplné CI 45375019177](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45375019177).
Čistá detached release kopie build/moderation-business-release-db13fed má přes
historický název HEAD **05fc1ed**; balíčky i release web byly připravené až z něj.
První db13fed / CI 45374082977 selhal na dvou starších Flutter config fixtures;
05fc1ed vypíná nové volby pouze v této testovací fixture. Celých 543 místních
klientských testů i následné úplné CI prošly, neúspěšný zdroj se nenasazoval.

Pouze **shoutout-dev-46c81**, dodržené pořadí:

1. Sedm cílených content Functions a kompatibilní web; publikovaný Hosting
   **507c7a0b950b74b2** je nová kompatibilní návratová verze po uzavření Rules.
2. Ověřené skutečné balíčky, 100 % provozu na nových ready revizích;
   všechny staré revize vyřazené (Active CONDITION_FAILED / RETIRED).
3. Firestore Rules **82d8db43-d9e9-4bd1-ba3f-f530fa78da57**, přesná shoda
   publikovaného textu se zdrojem; obě autoritativní brány true.
4. Teprve potom dvě účtové Functions s moderationCopiesEnabled=true.
   Před oběma přechody ověřeno nula accountDeletionJobs/accountPurgeJobs.

| Function | Ověřená nová revize |
|---|---|
| sanctionContent | sanctioncontent-00001-bos |
| revokeSanction | revokesanction-00001-cat |
| reviewBusinessApplication | reviewbusinessapplication-00001-lek |
| decideContentReports | decidecontentreports-00002-cod |
| deleteShout | deleteshout-00005-xij |
| deleteComment | deletecomment-00006-ror |
| cleanupOperationReceipts | cleanupoperationreceipts-00009-nor |
| accountDeletionRequestCreatedDev | accountdeletionrequestcreateddev-00016-yix |
| resumeAccountDeletionJobsDev | resumeaccountdeletionjobsdev-00016-cib |

Celkem **27 ACTIVE Functions**; ostatních 18 má shodné revize, source generace,
hash i prostředky jako před přechodem. U devíti změněných ověřeno min 0/max 1,
concurrency 1, 256 MiB; šest callable má 15 s, cleanup/oba workery 60 s.
Oba minutové plánovače včetně URI/retry/deadline beze změny. Žádný nový Scheduler,
index/TTL, globální App Check, main nebo produkční zásah.

Z cloudových source ZIPů souhlasí každý ze **70** souborů content balíčku
a **49** účtového balíčku včetně package/lock; žádné pilotní/testovací JS.
Content ZIP SHA-256 a03d56db…f2790, account ZIP 49c8118d…099b0c.
Hosting má 67 app souborů + 2 Firebase init; všechny raw/gzip otisky souhlasí,
osm HTTP kontrol index/main/bootstrap/config na obou DEV doménách také.
Lokální .last_build_id se v souladu s původním Hosting ignore nepublikuje.
Tři nové callable bez Auth/App Check vrátily 401 UNAUTHENTICATED; ověřený
přihlášený průchod tím není nahrazený.

Nad **skutečně publikovaným** zdrojem proběhlo 20 Rules service simulací:
přímé Business aktivace/role/profil/pobočka/audit, sankce/vazby/revokace/clearance
a změny tří druhů hlášení odmítnuté; původní vlastní/admin/moderátorské get
čtení zachované, anonymní/cizí běžné čtení odmítnuté. Existující moderátorský
get žádosti byl v první pomocné simulaci chybně očekáván jako DENY; zdroj jej
už před přechodem dovoloval. Opraveno pouze očekávání pomocné simulace,
Rules ani oprávnění se kvůli tomu neměnily. Skutečné queue dotazy, batch útoky
a before/after varianty pokrývá předchozí emulátorové CI. Nejde o úplný
bezpečnostní audit ani autentizovaný přímý HTTP zápis do živých dat.

Závěrečná kontrola **10:56:36 UTC**: 38 původních Shoutů a původní pending
žádost včetně updateTime beze změny, účtové joby 0/0, feed/news/staff fence shodný.
Žádný nový Auth účet ani pilotní obsah zatím nevznikl. Důkazy v ignorovaných
build/modbiz-cloud-{before,content,final,hosting,sources}.json,
build/modbiz-source-{content-proof,proof}.json, build/modbiz-rules-simulation.json,
build/modbiz-callable-auth-proof.json a build/modbiz-quiet-latest.json.
První pomocné porovnání metadat bylo opravené na stejnou JSON normalizaci
undefined/chybějících polí; skutečné revize/source/prostředky se shodují.

**Další krok: již schválený společný živý pilot a úklid.** Kanonický manifest
docs/local/moderation-business-pilot-2026-11-24.json, fáze planned,
digest **84f4aac021b69a9d858d668ccfe0dd4dece2b6c990092edafcb157ae23de5335**.
Zatím pouze plán bez přihlašovacích údajů; provisioning až při dostupném klientovi.
Začít TestAdmin → zamítnutí, fixture → oprava/resubmit, TestAdmin → schválení,
teprve pak obsah, pozastavení/reaktivace, TestModerator → varování/ban 7d/ban 1d,
TestAdmin → revokace silnějšího aktivního banu; nakonec osiřelé resolve,
zbývající hlášení a řízený úklid. Zachovat receipts +7 dní a minimální marker;
postihy a Auth smazání výhradně na novém dočasném UID. Kvóty neresetovat.
Mutační nástroj spouštět z čisté release 05fc1ed s přesným CI, nikoli z pozdějšího
dokumentačního HEAD. Před založením znovu ověřit platnost plánu a aktuální fence.

**Pilot zahájen:** vlastník potvrdil připravený TestAdmin. Z čisté release 05fc1ed
po opětovném ověření úplného CI a fence založen jediný plánovaný dočasný Auth
účet mvp_modbiz_f794f930926a31d2 a jeho profil/legal/Business žádost.
Firma **MVP Business 926a31d2**, server checking / revize 0, manifest account-ready.
Žádný nový Shout/komentář/zpráva/hlášení ani postih zatím nevznikly;
všech 38 původních zdrojů zachovaných. Čeká první klientské zamítnutí přes TestAdmin;
další kroky až po serverovém ověření výsledku. Předchozí „planned“ výše je stav
před tímto výslovným potvrzením připravenosti. Žádný nový akceptační kredit.

**První klientský krok ověřený 24. listopadu 11:42 UTC:** vlastník hlásí
zamítnutí bez chyby. Server rejected / revize 1, audit reject od it_admin
(TestAdmin), shodný důvod; propojený receipt/audit
00358d9c03e79b3d461e601471b6996b897e63db091cc7d36314c3fa077d5a09.
Živé logy mají POST HTTP 200 a Auth/App Check VALID; důkazy
build/modbiz-reject-proof.json a build/modbiz-reject-logs.json. Pilotní status
ověřil původních 38 zdrojů a plánovaný auditní průchod. Následuje přihlášení
dočasné fixture, oprava jen názvu na „MVP Business 926a31d2 oprava“ a resubmit;
adresy/pobočku neměnit, nový Auth nevytvářet. Celá akceptace stále otevřená.

**Opětovné podání potvrzené 24. listopadu 12:33 UTC:** vlastník odeslal žádost,
server checking / revize 2. Audit resubmit má administratorId=null, receipt
aktéra/authorId shodné s jediným dočasným UID, výsledek revize 2 a původních
7 dní. Audit/receipt **2fdb88633115724592fb46020987a040b0a6d7bd979804fd5ae52b6a95e34003**;
POST HTTP 200, Auth/App Check VALID. Původní adresy/souřadnice/identifikace
pobočky zachované, Business profil ani role zatím nevznikly. Důkaz
build/modbiz-resubmit-proof.json. **Název je stále MVP Business 926a31d2**,
bez požadovaného dodatku „oprava“. To zatím nedokládá chybu ukládání;
vlastník byl požádán upřesnit, zda pole upravoval, nebo jen znovu odeslal žádost.
Do odpovědi žádné schválení, opakované zamítnutí, přepis dat ani další fixture.
Živý přenos upraveného pole ani celá akceptace tím nejsou označené za ověřené.

Vlastník následně upřesnil, že dodatek „oprava“ mohl zapomenout, protože jej
nepovažoval za součást názvu. Nelze tvrdit ztrátu změny ani opravu chyby klienta;
živé resubmit upraveného pole zůstává nedoložené. Pokračovat schválením stejné
žádosti přes TestAdmin bez dalšího zamítnutí, resetu revize či změny auditů.
Dosavadní schválený pilot a jeho jediná inkarnace se nemění.

**Schválení ověřené 24. listopadu 12:40 UTC:** vlastník potvrdil úspěšné
„Schválit a aktivovat“. Server active / revize 3, Business profil active,
role business/level 2 přidělená it_admin a aktivní první pobočka s původními
souřadnicemi. Audit/receipt
**a578fbdc091f9cbdfc7fbc78447466f6d0b0a08e1e0411b8a0fe7f592177af47**,
správný TestAdmin, 7denní receipt, POST HTTP 200 a Auth/App Check VALID.
Důkaz build/modbiz-approval-proof.json. Opravený název při resubmit nadále
není označený za živě ověřený.

Po opětovné kontrole čisté release 05fc1ed/úplného CI spuštěn schválený
content helper se stejnými ID/časovanými klíči. Druhý komentář narazil na
skutečný cooldown; vyčkáno a původní operace zopakovaná bez resetu kvóty.
Manifest **content-ready**: **1** aktivní 24h Shout „MVP moderation Business
926a31d2“, **2** komentáře dočasného autora, **1** soukromá odpověď Bright →
dočasný příjemce, **3** otevřená hlášení. Expirace Shoutu **25. listopadu
12:40:55 UTC**. Kontrola 12:42 UTC potvrdila commentsCount=2, přesná ID,
plánovaný obsah/autor/stav a původní fence; žádný nový Auth účet nebo další obsah.
Důkaz build/modbiz-content-proof.json, původních 38 zdrojů zachovaných.
Další ruční krok uživateli předán: TestAdmin pozastaví pouze tuto firmu,
dočasný účet ověří důvod, přístup k údajům, blokaci nového publikování/promování
a zachování dřívějšího Shoutu. Reaktivaci zatím neprovádět.

**Pozastavení serverově ověřené 24. listopadu 14:51 UTC:** suspended / revize 4,
profil suspended, role business/level 2 zachovaná, první pobočka active,
dosavadní Shout active. Správný suspend audit/receipt od it_admin
**13c988008ae4fc1ec537ea96d7954ac9a171e5e886d782712226f0a5d98427c4**,
POST HTTP 200 / Auth/App Check VALID. Původních 38 zdrojů zachovaných;
build/modbiz-suspension-proof.json. Nejde zatím o ověření živé serverové
publikace v pozastaveném stavu, její zákaz je pokrytý dřívější emulátorovou sadou.

Vlastník vidí pozastavení, při kliknutí publikovat celý důvod; lišta má
nevýrazný text/křiklavé pozadí. Ostatní karty fungují, ale Profil je šedý
a odhlášení nedostupné. Zjištěno: pilotní generátor uložil avatarId=avatar_01,
avatarBackgroundStart=1 a avatarBackgroundEnd=2 do users i publicProfiles.
Klientský AvatarStyle.fromProfile přetypovává obě barvy na String?; přesná
živá avatar data v místním build/modbiz_avatar_probe_test.dart reprodukují
TypeError. Test prošel tím, že očekávaný pád potvrdil, **nejde o opravený klient**.
Žádné živé zápisy, změna zdrojů aplikace ani reaktivace při diagnóze neproběhly.

<a id="business-suspension-ui-repair-proposal"></a>

##### Oprava UI/fixture – schválený rozsah a místní výsledek

**Vlastník výslovně schválil opravu i DEV ověření.** Stejný rozsah znovu
neschvalovat; opravná data jsou stále výhradně původní dočasná fixture.

Vlastníkovi předložen jeden společný úsek podle AGENTS „Před úpravami … předlož
konkrétní rozsah změny uživateli ke schválení“:

- Opravit pilotní generátor na platné fox/teal/navy; u jediného dočasného UID
  atomicky opravit pouze avatarId/avatarBackgroundStart/avatarBackgroundEnd
  ve users/publicProfiles. Ověřit původní hodnoty, updateTime i pilotní fence;
  mimo tyto dva dokumenty nezapisovat. Podklad před opravou uchovat lokálně.
- Avatar parser chránit před chybnými typy stejným výchozím vzhledem,
  aby vadný avatar neznepřístupnil Profil/odhlášení; doplnit regresi.
- Klidnější kontrastní lišta, krátké „Účet pozastaven“, důvod dostupný přes Detail;
  při pokusu o publikování pouze krátký stav. Oprávnění/stav/role se nemění.
- Ověřit Profil/odhlášení a světlý/tmavý vzhled, generátor a cílenou opravu,
  dokumentaci, společný push/úplné CI přesných zdrojů a pouze DEV web rollout.
  Žádné Rules/Functions, nové účty/obsah, postihy, audit, retence nebo produkce.

Původní souhlas pokrýval pilot; nová klientská oprava a oprava již existujících
testovacích dat mají nyní vlastní výslovný souhlas. Živý účet ponechat
suspended/revize 4, další obsah ani účty nezakládat.

**Místní příprava dokončená na fix/business-suspension-profile:**
AvatarStyle.fromProfile ověřuje typ všech čtyř avatar polí a používá stávající
fallback pro chybná, platná zachová. ProfilePage deleguje vykreslení na stejný
ProfileContent s injektovaným odhlášením/role streamem; test tak vykresluje
skutečný Profil s vadnými barvami a klikne na skutečnou akci odhlášení i po
chybě role streamu. Žádná změna Auth chování nebo čtecích práv.

BusinessAccessBoundary používá surfaceContainerHigh/onSurface, neutrální ikonu
a krátké „Účet pozastaven“. Důvod není v liště ani ve snackbar při publikování;
Detail ho nadále zobrazí. Společné showBusinessPublishingRestriction používá
Home i widgetová regrese; aktivní Business cestu neblokuje. Testy měří kontrast
textu/ikony/Detailu v obou Material vzhledech na kompaktním 390×720 viewportu,
stav child/scroll se kvůli opravě znovu neinicializuje.

Pilotní generátor nyní používá fox/teal/navy v users i publicProfiles.
tools/moderation_business_pilot.mjs má čtecí avatar-plan a chráněné avatar-repair:
vyžaduje původní i opravný digest a čistý přesný release/úplné CI. Opravný plán
obsahuje jen dvě cesty dočasného UID, přesné 3 hodnoty před/po, hash celého
dokumentu a původní updateTime. V transakci se ověří také původní pilotní fence,
vlastní označení/inkarnace a suspended/revize 4. Zastaralý/míchaný/cizí stav
zastaví obě změny; ztracená odpověď dovolí opakování bez dalších zápisů jen
při shodě ostatních polí. Hash a updateTime nepovolují přepsat souběžnou změnu.

Místně **15/15** klientských (nové test/business_suspension_profile_test.dart
a dosavadní Business sada), **23/23** společných Business/Rules/pilotních
emulátorových a **113/113** nástrojových testů; analyze i cílený ESLint čisté.
Nová emulátorová regrese ověřila stale updateTime, cizí/tampered plán,
chybu po první staged změně s rollbackem obou, opakování bez změny updateTime,
zachování Business profilu/role/žádosti a všech receipts. Nejde zatím o živé ověření.

Čtecí plán pro skutečnou fixture již uložený do ignorovaného manifestu,
digest **7c0d84a958ce34c1f1ba9e88c26b7a7861a3833891b45407a4a4205d93c6af02**,
2 dokumenty / 0 živých zápisů. Firestore (default) ověřen STANDARD / FIRESTORE_NATIVE,
europe-west3. Po úspěšném úplném CI přesného opravného zdroje aplikovat tento plán,
ověřit neavatarová pole a provozní stav a nasadit jen DEV web. Potom krátká
kontrola Profilu/odhlášení a čitelnosti ve stávajícím pilotu; Functions/Rules
zůstávají na 05fc1ed. Nevytvářet další obsah, účet ani nové váhy stupnice.

Při místní vizuální kontrole skutečných app témat (render 390×720, načtené
Roboto/Urbanist/MaterialIcons a avatar) zjištěn navíc málo kontrastní hardcoded
teal odhlášení ve tmavém Profilu. V rámci schváleného zpřístupnění odhlášení
jeho foreground nyní používá colorScheme.primary; přidaná regrese kontrastu
v obou vzhledech. Místních 15 klientských případů znovu prošlo a oba PNG
build/modbiz-profile-{light,dark}.png byly vizuálně zkontrolované.
Nejde o živou browserovou akceptaci. První opravné CI a4e2699 / 45421922334
zastavil nezahrnutý generovaný PROGRESS; doplněno v 9c6e34c. Jeho dokumentační
CI 45422303586 success není důkaz pro nasazení. Úplný běh 45422011563 záměrně
zrušen po doplnění barvy odhlášení; vyžadované nové úplné CI přesného zdroje
před jakýmkoli opravným rolloutem/datovým zápisem. Tyto starší běhy nepoužít.

<a id="business-suspension-ui-repair-results"></a>

##### Oprava pozastaveného Profilu – DEV nasazení 24. listopadu

Přesný zdroj **3ffe71ade738f3c80cc66c70a0970bb485382052**, fix/business-suspension-profile,
[úplné CI 45424330633 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45424330633).
Prošly všechny klientské/nástrojové/serverové/Rules/B4/B2/purge/Storage kontroly
i webový build; nejde o lehký dokumentační běh. Místní 15/23/113 sady a vizuální
ověření obou skutečných app témat popsané výše. Čistá release kopie
build/business-profile-release-9c6e34c má přes historický název HEAD **3ffe71a**;
finální web byl znovu sestaven po změně barvy odhlášení.

Po úplném CI proveden schválený **avatar-repair** s původním pilotním digestem
a opravným digestem **7c0d84a9…93c6af02**. Výsledek repaired=true / repeated=false /
documentsWritten=2. V jedné transakci ověřené preimages/hashes/updateTime/fence;
změněna pouze avatarId/Start/End ve users a publicProfiles dočasného
mvp_modbiz_f794f930926a31d2 na fox/teal/navy. Původní hodnoty a updateTime zachované
v ignorovaném avatarRepairPlan manifestu. Reaktivace, žádost, právní přijetí,
role, Business data, obsah, audit, postihy a kvóty se tímto zápisem neměnily.

Následně pouze **Hosting shoutout-dev-46c81** na verzi **2edf6b744dcbe95e**.
67 app souborů + 2 Firebase init přesně odpovídá raw/gzip otiskům artefaktu;
osm HTTP kontrol index/main/bootstrap/config na web.app a firebaseapp.com
souhlasí. Místní .last_build_id je podle původního ignore nepublikovaný.
Návratový kompatibilní web je 507c7a0b950b74b2, se zachováním opraveného avataru;
žádný živý rollback se netvrdí. Zdroj Functions a Rules zůstává 05fc1ed,
neproběhlo jejich nové nasazení, index/TTL/Scheduler ani prostředkové změny.

Kontrola po opravě i po Hostingu (**15:44:36 UTC**) potvrdila přesnou shodu
**19** kontrolovaných pilotních dokumentů včetně updateTime (Business data/role,
obsah/hlášení, audit a potvrzení), shodná neavatarová pole obou opravených
dokumentů a očekávané tři nové hodnoty. Původních 38 Shoutů/pending žádost a
feed/news/staff fence zachované; všech 27 Functions včetně zdrojových generací,
revizí a prostředků, Rules **82d8db43-d9e9-4bd1-ba3f-f530fa78da57** i oba
plánovače beze změny. Účet zůstává suspended / revize 4, role 2, původní
Shout active, tři hlášení open, žádný postih. Nové účty ani další obsah nevznikly.
Důkazy build/modbiz-profile-ci.json, build/modbiz-profile-live-{before,after}.json,
build/modbiz-profile-cloud-hosting.json a lokální stav avatarRepair v manifestu.

**Ruční kontrola opravy potvrzená:** vlastník odpověděl „vše funguje“ na celý
průchod nové verze ?mvp=3ffe71a: čitelné „Účet pozastaven“, důvod přes Detail,
krátký stav při Přidat Shout a vykreslený Profil → Odhlásit se s návratem na
přihlášení. Tato UI oprava je uzavřená; zdroj/release/konfigurace se při potvrzení
neměnily a není potřeba ji znovu testovat. Oba vzhledy byly místně vykreslené,
živé potvrzení se vztahuje na uživatelovo aktuální prostředí, nikoli všechny prohlížeče.
Následný čtecí status ověřil suspended/revize 4, zachované původní zdroje,
tři otevřená hlášení a žádný postih. Žádné živé zápisy při této kontrole.
**Další krok již předaný vlastníkovi:** TestAdmin → Business žádosti → Pozastavené
Business → MVP Business 926a31d2 → Znovu aktivovat. Zatím žádné hlášení nevyřizovat
ani obsah nemazat. Po serverovém ověření pokračovat stejným pilotem: sankce TestModerator,
revokace a osiřelé resolve, teprve potom řízený úklid. Akceptaci ani celý milník
neoznačovat hotové před dokončením. Oprava nepřidala nové váhy ani další MVP kredit.

**Reaktivace ověřená 24. listopadu 19:27 UTC:** vlastník potvrdil uložení bez
chyby. Server active / revize 5, Business profil active, role business/level 2
a první pobočka zachované. Audit reactivate od it_admin
**5e8e122612febbd39ba25fb655870090b0311b3ee380542f82bd3fb92b62489a**,
POST HTTP 200 a Auth/App Check VALID. Ověřena celá posloupnost pěti Business
auditů i receipts (reject/resubmit/approve/suspend/reactivate), správní aktéři,
revize 1–5 a původních +7 dní. Důkaz build/modbiz-reactivation-proof.json;
čtecí pilotní fence potvrdil původních 38 zdrojů. Nejde o nový rollout/datový zápis.

Vlastník je dostupný pro navazující testy. Předán jeden blok pod přesným
TestModerator: hlášení „MVP modbiz 926a31d2 shout. Remove after verification.“
→ Udělit varování / potvrzení postihu; potom v detailu „MVP moderation Business
926a31d2“ u „MVP f794f930926a31d2 comment 2“ přes Moderovat nejprve ban 7 dní,
potom ban 1 den. Žádná jiná hlášení, mazání, revokace nebo nový obsah.
Při chybě či nenalezeném cíli zastavit; po potvrzení všech tří serverově
ověřit aktéra/audit/receipt a zachování 7denní aktivní vazby. Navazující ruční
kroky: přihlášení dočasné fixture pro ban UI, TestAdmin revokace silnějšího
postihu, dostupnost reaktivovaného účtu bez skutečné nové publikace, osiřelé
resolve a zbývající soukromé hlášení; teprve potom řízený úklid jediné fixture.

<a id="moderation-business-observed-admin-proposal"></a>

##### Přijatý skutečný sankční průchod – místní ověření nástroje

Vlastník hlásí všechny tři kroky bez chyby. Čtecí kontrola 24. listopadu
19:37 UTC zjistila **3** sankce i **3** propojené receipts pro správný dočasný
UID a plánovaný Shout; původní fence/38 zdrojů zachované. Všechny ale vytvořil
**it_admin (TestAdmin)** a cílem byl Shout, nikoli druhý komentář:

| Rozhodnutí | Sankce = receipt | Zdroj |
|---|---|---|
| warning | a71f1dc563757c64fef5b0a91487e6ff52a89cb891c8081cb451d125e6d55b9a | report / shout |
| ban7d | b94f2f575bbf760ed22f4bdbdbbf78f4df8604aedde398e67f789e354286349e | moderatorObservation / shout |
| ban1d | 109beaa0aa214fb04fd203983bfc6c48a07548c6ccc7982ceb3a41882497721a | moderatorObservation / shout |

Aktivní bans vazba správně odkazuje na **b94f2f57…6349e**, konec
**1. prosince 2026 19:35:02.759 UTC**; kratší ban zůstal v historii a delší
nepřepsal. První hlášení resolved/sanctioned. Tři POST HTTP 200 a tři
Auth/App Check VALID ověřené v živých logs. Důkazy
build/modbiz-sanction-actor-diagnostic.json a build/modbiz-sanction-logs.json.
Původní status/orphan/cleanup guard správně odmítá wrong-sanction-actor;
nebyl obejitý ani oslabený, při diagnóze žádný živý zápis.

Vlastník výslovně schválil přijmout **přesně tyto tři** skutečné serverové důkazy
jako průchod TestAdmin nad Shoutem a upravit pouze ověřovací/úklidový nástroj.
Audit, role, autor, zdroj ani živé záznamy se nepřepisují. Regionální sankční
oprávnění zůstávají doložená emulátorem, nikoli tímto admin průchodem.
Vlastník také potvrdil „Účet je zablokován“ do **1. prosince** s odhlášením.

Místní větev fix/moderation-pilot-evidence: readonly sanction-plan vytvořil
samostatný zapečetěný důkaz v původním manifestu, bez přepsání původního plánu.
Digest **e70a46e5fd5902b9ea61b5d056b903572074f619065b913968dac12be0e8a5b5**.
V DEV je výjimka vázaná na původní digest/UID a tři výše uvedená ID; otisky
celých receipts se znovu kontrolují. Bez výslovného --approved-sanctions-digest
zůstává původní přísná cesta. Jiný postih, změna důkazu nebo zdroje se odmítne
před úklidem Auth. Testy zahrnují celou navazující revokaci, osiřelé hlášení
a restartovatelný úklid se zachováním receipts; **24/24** Business emulátorových
a **115/115** nástrojových kontrol a cílený ESLint prošly. Test přepínačů
pilotního nástroje je nově zahrnutý i v běžné test:tools sadě CI. Logy
build/modbiz-observed-emulator-final.log a build/modbiz-observed-tools-ci.log.
První úplné CI 45485542125 ze zdroje 1f64c6e bylo řízeně zastavené před
doplněním této CI vazby; neslouží jako podklad pro mutace nebo nasazení.

Zdroj **3ec9664cf406fb18cdb531a0cad84689a5e07361** má
[úspěšné úplné CI 45486072998](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45486072998),
všechny potřebné kroky včetně Business/moderačních testů a webu. Ověřená čistá
oddělená pracovní kopie; tato operátorová úprava nevyžaduje rollout aplikace,
Functions ani Rules. Důkaz build/modbiz-observed-ci.json.

**Revokace TestAdmin ověřená:** 24. listopadu **21:05:14.432 UTC**, audit
sanctionRevocations/b94f2f57…6349e, správný UID/aktér a původní purgeAt;
bans pointer odstraněný, kratší jednodenní záznam zachovaný. Receipt
**aaca37c4bc6a2967de6bba7bc57688ae219691315d2e8e60a6d39b21543774a8**,
result.revoked true a původních +7 dní. POST HTTP 200 / Auth a App Check VALID.
Důkazy build/modbiz-revocation-proof.json a build/modbiz-revocation-logs.json.
Původní expiresAt sankce se správně nemění; skutečný konec dokládá revokace.

Po tomto CI schválený orphan krok ze stejného čistého zdroje odstranil pouze
první syntetický komentář přes sdílený writer. Druhý zachovaný, zdrojový počet
i publicStates projekce **2 → 1**, příslušné hlášení zůstává open a původních
38 zdrojů/pending žádost zachované. Důkaz build/modbiz-orphan-proof.json;
nejde o živou moderační akceptaci ani vlastní klientské mazání.
Následuje obnovený přístup bez nové publikace a obě zbývající hlášení,
společně s novým UI přehledem níže. Akceptace/úklid stále otevřené.

<a id="moderation-user-history-ui"></a>

##### Přehled stavu a historie uživatele – schválená klientská oprava

Vlastník 24. listopadu výslovně schválil názvy „Ban“ a „Omezení tvorby“,
stav aktivní/není aktivní a červenou ikonu při zákazu. Aktivní ban se v přehledu
projeví také jako „Omezení tvorby – Aktivní kvůli banu“; nevytváří druhý postih.
Aktuálně účinné pointery mají přednost v historii, jemně tónované pozadí,
červený okraj a tučný název. Období vedle názvu se na úzkém displeji zalomí:
dd.mm.rrrr–dd.mm.rrrr, u dosud trvalého postihu „trvale“, u varování datum udělení.
Při předčasném zrušení se jako konec zobrazí uložené createdAt revokace;
platnost se nezvětšuje pozdějším zrušením již expirovaného postihu.
Původní plánovaná platnost zůstává v rozbaleném detailu, audit se nepřepisuje.

Větev fix/moderation-user-history, lib/staff_user_enforcement.dart a zapojení
v lib/src/staff_users.dart. Původní historie zůstává nejvýše 50 položek;
pokud v první dávce chybí některý ze dvou účinných pointerů, dohledá se
jednotlivě (nejvýše 2 dodatečná čtení), ověří vlastnictví a zařadí navrch.
Bez nového indexu, změn serveru, oprávnění nebo retenčních dat. Podmínky
zobrazení tlačítka revokace podle role/původního pointeru jsou zachované.

Místně **23/23** cílených klientských testů (6 nových stav/čas/řazení/theme,
dosavadní sankce a pozastavený Profil) a celá flutter analyze bez nálezů.
Následná barevná regrese 6/6 a dvě vykreslení skutečných témat prošly;
ověřené texty, datumy, barvy i ikony na šířce 390. Vizuální kontrola zachytila
splývající ikony při silném errorContainer; konečná varianta používá jemný tón
odvozený od povrchu a kontrastní ikony/text, doplněný regresní kontrastní test.
Důkazy test/staff_user_enforcement_test.dart,
build/modbiz-history-{regressions,analysis,final-test}.log a
build/modbiz-history-{dark,light}.png.

**DEV nasazení ověřené 24. listopadu:** čistý zdroj
**aa43ae18e3ebd0b5ed9a0be77d2c8f00010c6a74**, fix/moderation-user-history,
[úplné CI 45491348488 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45491348488),
všech 42 úspěšných kroků, odpovídající release build/manifest a přesný cíl ověřené.
Pouze Hosting shoutout-dev-46c81: verze **f8f0b0338d6eb03d**, 67 app souborů
shodných s manifestem; 8 HTTP 200 a shodné tělo na obou doménách. Hosting API
navíc obsahuje 2 rezervované Firebase soubory, tedy 69 záznamů celkem.
Všech 27 ACTIVE Functions včetně hashů/revizí/prostředků, oba plánovače a
Rules **82d8db43-d9e9-4bd1-ba3f-f530fa78da57** přesně shodné před/po.
Čtecí fence ověřil původních 38 Shoutů/pending žádost; fixture dál active/revize 5,
bez aktivního banu, zbývají právě dvě otevřená hlášení. Žádný další živý datový
zápis, Auth účet, role, main nebo produkční nasazení tímto rolloutem nevznikly.
Návratový web **2edf6b744dcbe95e**. Důkazy build/modbiz-history-{ci,build-proof}.json,
build/modbiz-history-cloud-{before,after,hosting}.json a build/modbiz-history-deploy.log.

Vlastníkovi předán jeden konečný blok: TestAdmin neaktivní přehled + skutečný
konec/původní platnost zrušeného banu a resolve soukromého hlášení; dočasná
fixture běžný přístup a formulář bez publikace/odhlášení; přesný TestModerator
resolve osiřelého komentářového hlášení. Bez nových účtů, postihů nebo obsahu.
Aktivní vizuální stav byl prověřený místně; současný účet má po revokaci správně
neaktivní ban a novým postihem se to znovu nepřipravuje. Celá živá pilotní
akceptace/úklid ani metriky tím nejsou uzavřené.

<a id="moderation-business-final-client-results"></a>

##### Závěrečný klientský blok potvrzený, úklid odložený kvůli novému nálezu

Vlastník 24. listopadu potvrdil „ano vše je v pořádku“ na celý blok: nové
neaktivní stavy/historie a původní platnost, dočasný účet bez banu a otevření
formuláře bez publikace/odhlášení, soukromé resolve a osiřelé resolve.
Server potvrzuje přesné dva výsledky:

- TestAdmin / it_admin, privateReply → resolve/noAction, count 1,
  receipt **3ca546328413996f752f03a5887b4c94074ce78239661074dc21c7dd7d061e85**,
  24. listopadu 21:59:08.592 UTC.
- TestModerator / it_moderator, chybějící první komentář →
  resolveUnavailableContentReports/noAction, count 1,
  receipt **4e355d8aa9f71290c8e367a5975bff14a0746391265c9e85eb42f51fcc3fe298**,
  22:07:17.149 UTC. To prokazuje tento regionální resolve průchod,
  nikoli dřívější sankce, které zůstávají přijatým admin průchodem.

Oba receipts mají správné ID zdroje/reportu/aktéra a původních +7 dní,
2×POST HTTP 200 a 2×Auth/App Check VALID. Všechna 3 hlášení resolved,
Business active/revize 5, ban absent, původních 38 zdrojů/pending žádost zachované.
Důkazy build/modbiz-client-final-{proof,logs}.json. Při ověřování žádný živý zápis.
Původní řízený úklid nebyl spuštěný: vlastník při tomto průchodu požaduje
neveřejnou dostupnost nahlášeného obsahu i po smazání zdroje. Zbývající fixture
zachovaná jako podklad; testovací stav content-ready, Auth účet nesmazaný.
Metriky celé akceptace se před dokončením návaznosti/úklidu neuzavírají.

<a id="reported-content-evidence-proposal"></a>

##### Podklady nahlášeného obsahu nezávislé na živém zdroji – návrh čeká schválení

**Ověřená současná mezera:** createContentReport ukládá u Shoutu a veřejného
komentáře jen reference; u soukromé odpovědi i text a autora. Detail veřejného
hlášení čte zdroj přímo. Jednotlivý deleteComment/removeReportedPublicContent
komentář fyzicky odstraní bez evidence snapshotu. getArchivedCommentReportTarget
umí jen archiv vzniklý při mazání celého účtu, ne běžně smazaný komentář.
Samotný Shout tohoto pilotu stále existuje; chybí záměrně odstraněný první
komentář. Z jeho původního veřejného hlášení nelze zpětně získat text.
Text známý testovacímu manifestu nesmí být dodatečně vydávaný za zachovaný
serverový důkaz. Dosavadní bezpečné resolve bez zdroje tedy funguje, ale
nenahrazuje obsah potřebný pro posouzení nebo postih.

Hranice účtové archivace zůstává podle
[účtového plánu](plans/accounts/ACCOUNT_CONTENT_ARCHIVE_PLAN.md#schválený-rozsah):
obsah existující při zpracování mazání účtu, pevně request createTime +60 dní;
neobnovuje dříve fyzicky smazaný obsah. Nové uchování nahlášeného obsahu při
jednotlivém mazání je samostatná retenční volba, ne již hotová univerzální archivace.

Původní předložený **místní úsek podkladů pouze nahlášeného obsahu**
(následně rozšířený na společný cyklus níže):

- atomicky se serverovým hlášením zachovat neměnný podklad Shoutu/komentáře/
  soukromé odpovědi, s jednoznačnou inkarnací a bez klientem podvrženého textu;
- moderaci zobrazit označený archivní podklad i bez zdroje/rodiče a bezpečně
  na něj navázat dnešní rozhodování, role, geografii, souběh a idempotenci;
- pevný deadline, hlídané kopie/vazby a běžný i účtový purge, bez prodlužování
  vyřízením/opakováním; testy souběhu mazání, změny účtu, restartu a hranice retence;
- testy, měření, dokumentace, jeden společný push/CI; bez živé migrace,
  nasazení, dalších fixture/Auth účtů nebo změny DEV Rules/prostředků.

**Odpověď vlastníka:** místní úsek a testy schválil. Lhůtu od prvního hlášení
nepřijal; požaduje prozkoumat původní myšlenku archivace všech příspěvků:
platnost 24 h nebo ruční smazání → 7 dní vlastní historie → 60 dní archivu.
Navrhl archiv založit hned a mazání +68 dní. Tento širší cyklus je prověřený
níže; implementace původního úseku nezačala s neodsouhlaseným časovým pravidlem.

<a id="content-lifecycle-retention-review"></a>

##### Prověření celého životního cyklu – schválený místní rozsah

**Schváleno vlastníkem 25. listopadu 2026:** celý níže uvedený místní rozsah,
s požadavkem po MVP cyklus znovu upravit/přepracovat. Konkrétní budoucí změna
zatím určena není; [správa archivu po MVP](BACKLOG.md#archive-administration)
zahrnuje i tuto revizi. Souhlas neaktivuje archiv v DEV ani nemění živá data.
První místní jádro za výchozí vypnutou volbou má vlastní úplné CI níže;
celková integrace čtení, úplné místní ověření provozního napojení, provozní
plán a případný živý přechod dosud hotové nejsou.

**Dohledané původní podklady:**

- Tento serverový plán v části exspirace i neměnný archiv
  [původního plánu](archive/MVP_SERVER_PLAN_2026-11-03.txt) požadují fyzicky
  odstranit Shout a podkolekce po sedmi dnech od expirace; další +60denní
  archiv pro všechny běžné Shouty tam není. Texty v lib/legal.dart uvádějí
  stejné sedmidenní pravidlo a nedokončenou DEV automatizaci.
- [Schválený účtový archiv](plans/accounts/ACCOUNT_CONTENT_ARCHIVE_PLAN.md#schválený-rozsah)
  opravdu zahrnuje všechny existující zprávy a veřejné komentáře, nejen
  nahlášené, ale při zpracování smazání celého účtu. Jeho pevný termín je
  createTime žádosti +60 dní. Dřívější jednotlivé smazání nearchivuje.
- [Vytvoření Shoutu](reference/PRODUCT_FLOWS.md#vytvoření-shoutu) a
  functions/create_shout.js dovolují běžně 15 minut až 24 hodin (výchozí 2 h),
  aktivnímu Business až 7 dní. Pevných +68 dní od vytvoření by neodpovídalo
  navrženému cyklu u kratších Shoutů ani u delšího Business Shoutu.

**Potvrzený kód:** get_own_shouts drží expirované položky do expiresAt +7 dní,
bere jen status active/expired a status deleted vyřazuje hned. deleteShout
zatím mění pouze status, deleteComment komentář fyzicky odstraní. Worker
shout_expiration jen materializuje active → expired. Běžný sedmidenní fyzický
purge Shoutů ještě hotový není; nelze tvrdit, že nyní automaticky probíhá
cyklus historie → univerzální archiv → konečné odstranění.

**Schválená nová politika pro místní implementaci:**

1. Neveřejný archivní podklad každého Shoutu a jeho veřejných komentářů i
   soukromých odpovědí atomicky založit při vytvoření obsahu, nezávisle na
   nahlášení. Hlášení odkazují na společný podklad/inkarnaci; nevytvářejí
   další plné kopie a neprodlužují čas. Soukromou zprávu moderátor získá jen
   přes příslušné hlášení, bez procházení konverzací. Přímé veřejné čtení archivu
   se nepovoluje, obecná správa/export archivu zůstává samostatným úkolem.
2. Konec veřejné platnosti je plánovaná expirace nebo dřívější serverově
   potvrzené ruční odstranění. Vlastní historie Shoutu skončí o 7 dní později;
   ručně smazané Shouty by se tedy nově zobrazovaly ve vlastní historii jen
   ke čtení. Převod soukromých odpovědí do Mé shouty → Komentáře zůstává po MVP.
3. Konečný termín obsahu je konec historie +60 dní, tedy skutečný konec
   platnosti +67 dní. Datum připravit už při vytvoření podle expiresAt;
   předčasné odstranění jej může zkrátit. Použije se i dřívější závazný
   účtový termín; smazání účtu ani hlášení již dřívější konec neprodlužuje.
   Cizí konverzace a anonymní rodičovský kontext respektují dosavadní vlastnictví.
4. Čtení se na konci retence zavře podle serverového času a trvalý dávkový
   úklid musí opravdu odstranit příslušná data/kopie/indexové vazby. Samotné
   datum v dokumentu ani zmizení karty z UI nejsou fyzické smazání. Způsob,
   náklady a dohánění dluhu se změří místně před provozním návrhem.

| Případ | Konec veřejné platnosti od vytvoření | Konec historie | Konečné smazání |
|---|---|---|---|
| Běžný Shout na 24 h | +1 den | +8 dní | +68 dní |
| Business Shout na 7 dní | +7 dní | +14 dní | +74 dní |
| Výchozí Shout na 2 h | +2 h | +7 dní 2 h | +67 dní 2 h |
| Ruční smazání po 3 h | +3 h | +7 dní 3 h | +67 dní 3 h |

**Rozsah navíc oproti schváleným nahlášeným podkladům:** kopie i nenahlášeného
obsahu při publikování, nový obecný životní cyklus a historie ručně smazaného
Shoutu. Proto předložený jeden sjednocený místní úsek: potřebné writery/čtení/
moderace/purge, účtové vazby, souběžné testy/restart, přesné deadline a rozpočty,
měření operací/objemu, potřebné právní texty/dokumentace a společný push/CI.
Bez živé migrace, dalších fixture/Auth, nasazení nebo změny provozních prostředků;
DEV zapojení až podle naměřeného konkrétního plánu. Konečná podoba kontraktu,
provozní četnost a indexové změny nejsou dosud aktivní. První místní základ
je připravený níže; nejde o dokončenou integraci nebo povolení nasazení.

<a id="content-lifecycle-local-foundation"></a>

##### Místní základ společného cyklu – 25. listopadu 2026

**Připravený kód, všechny nové volby výchozí false:**

- Společná transakční vrstva zachytí publikování Shoutu, komentáře i soukromé
  odpovědi; její zápis, zdroj a dosavadní potvrzení/index se uloží společně,
  nebo vůbec. Neměnné tělo je v contentLifecycleArchive, společný technický
  termín a inkarnace v contentLifecycleThreads. Při ručním odstranění se
  termín zkrátí v jedné hlavičce, bez hromadného přepisování cizích odpovědí.
- Identita váže projekt, cestu, serverově určené createdAt a hash těla.
  archivedAt je auditní čas, nikoli vydávaný Firestore createTime původního
  dokumentu. Skutečné createTime se ukládá jen při pozdějším ověřeném čtení
  existujícího zdroje; první zápis je chráněný atomickou vazbou a zákazem
  opětovného použití již archivovaného ID. Starý neprovázaný zdroj se odmítne
  s požadavkem na řízený přechod, nikoli automaticky adoptuje.
- Hlášení uchová odkaz na konkrétní verzi a hrubý geografický rozsah.
  Nová soukromá hlášení už nekopírují celé tělo. Čtecí jádro a zatím vypnutá
  deklarace getLifecycleReportEvidence vyžadují Auth/App Check, stejný účet,
  aktuální roli/region a konkrétní hlášení; soukromé konverzace nelze procházet.
  Přístup má atomický audit. Schválení, uzavření, eskalace, odstranění i
  postih mohou pracovat s podkladem po zániku zdroje/rodiče. Postih nově
  ukládá odkaz místo další plné kopie těla. Nejasná skupina verzí selže celá.
- Účtové čtení a kopie používají dřívější z obou termínů. Čtení kontroluje
  žádost, minimální marker i uzavřený vstup účtového purge. Po dřívějším konci
  se reakce jen odstraňují, nevzniká nová kopie. Volitelné účtové fáze se
  přidávají na konec, nepřečíslují uložené journaly.
- Účtový purge odstraní také automatický odkaz/prefix na smazaného autora
  v historických verzích cizí odpovědi a ponechá její vlastní text. Taková
  výjimka z neměnnosti je označená account-reference, drží původní hash
  identity a nový hash anonymizovaného těla; UI ji výslovně označí jako
  anonymizovaný podklad. Původní znění se po konci jeho retence nezachovává.
  U cizích hlášení se odstraní původní rodičovský kontext/geografie;
  bez ní regionální přístup selže, dosavadní globální autorita zůstává.
- Vlastní historie má místní variantu stránky se status deleted a pevným
  publicUntil +7 dní. Karta/detail zůstávají čitelné, neobnoví se interakce
  ani přečtení smazaného Shoutu; další mazání téže karty se nenabízí.
  Původní sedmidenní cesta bez nové volby je zachovaná.
- Je připravený obnovitelný post-order úklid zdrojů, podkladů i přístupových
  auditů, dočištění účtových kopií a odstranění technických journalů.
  Nehostovaný dávkový adaptér projde zdroje → účtové kopie → hlášení/clearance
  → archiv → technické záznamy. Rozpočet předává volající, zkouška používá
  nejvýše 32 kroků / měkkých 10 s mezi transakcemi. Vadné neznámé potomky
  neodstraňuje, zaznamená needs-review; konflikt nezapočítá jako dokončení.
  Platná pauza zastaví příjem nových těl a jejich běžné úpravy, nikoli
  odstranění, účtovou anonymizaci nebo již splatný retenční úklid.
  Neplatné/off řízení se odmítá; pauza neposouvá žádné datum.
- Právní odstavec je připravený ve všech sedmi jazycích za vypnutou volbou.
  Aktivní právní verze se nemění. Rules mají výchozí vypnutý prototyp brány
  konce historie; archiv/řízení/journaly jsou pro SDK všech rolí neveřejné.
  Kandidátní pravidla jsou místní prototyp, vyžadují další revizi kompatibility.

**Měření lokální transakční vrstvy:** 50 nových Shoutů téhož autora znamená
153 dokumentových čtení a 150 zápisů včetně zdrojů a archivů; sdílené účtové
kontroly se načtou jednou. Samotná změna čítače má 1 read / 1 write, bez
dalšího čtení či zápisu archivu. Měření nezahrnuje Auth/App Check, feed index,
síťové přenosy, retry ani Functions a není účtem za cloud. Společný limit
450 zápisů i nejvýše 50 zdrojů se kontroluje před skutečným zápisem.
Samostatný emulátorový případ spojuje archiv se skutečným aktivním indexovým
writerem a ověřuje zachování identity veřejného B4 těla.

**Doložené místní kontroly:** 126 dosavadních serverových regresí; celé starší
účtové purge/archivní sady prošly, nová vlastní historie nejprve odhalila
chybný dotaz přes dva časové rozsahy. Oprava využívá jediný rozsah publicUntil
a ověřuje vazbu historyUntil = publicUntil +7 dní. Samostatně prošly oba
úplné zapnuté účtové průchody, včetně zachování cizího těla a anonymizace.
Opakovaný účtový průchod potvrdil stejný výsledek i při paused příjmu.
V indexové fixture bylo opravené příliš dlouhé ID generace; opakovaný
skutečný indexový průchod prošel. Nový CI krok spouští celou transakční
sadu i oba stavy Rules. Závěrečný společný běh nové sady, vlastní historie
a Rules prošel ve všech 33 případech, včetně pauzy a dvou souběžných workerů.
Zdroj **cea00c02035963da42208db30c99cec5c7ce1e59** ve větvi
feature/moderation-report-evidence má
[úspěšné úplné CI 45703037163](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45703037163).
Dokončily se i dosavadní aplikační/browserové, Rules, B4/B2, moderační,
Business, účtové a Storage sady a sestavení DEV webu. Build není nasazení.
První běh 45702002426 ze zdroje 8a93481 skončil před testy na formátování
jednoho volání v moderačním dialogu; formát je opravený. Tento běh se nepočítá
jako ověření a nic se z něj nenasazuje.
Navazující běh 45702300312 byl řízeně zastavený kvůli společnému ověření
nové opravy pauzy. Ani tento nedokončený běh se nepočítá jako úspěšné CI.
Prošlo také 9 cílených čistých serverových testů, 48 klientských testů,
analýza bez nálezů a 46 kontrol nástrojů/metrik. Paralelní spuštění dvou
Flutter příkazů narazilo na zámek SDK cache; samostatně opakované testy prošly.
Měření a emulátorové případy jsou syntetické, nejde o nové živé uživatele.

**Stále otevřené v již schváleném místním rozsahu, bez dalšího nasazování:**

1. [Webové seznamy jsou připravené místně](#content-lifecycle-read-integration),
   jejich úplné CI 45766451416 prošlo. Zbývá provozní kompatibilita starých
   a nativních klientů. Globální collectionGroup nesmí obejít rodičovskou
   lhůtu; prototyp brány je vypnutý a nesmí předběhnout kompatibilní klienty.
2. Úplné provozní napojení, reálný společný rozpočet současných generací a náklady/dohánění
   dluhu. Místní runner ani příklad 32/10 neurčují produkční kapacitu.
   Pauza a transakční souběh jsou doložené místně, nikoli živým provozem.
3. Přesný přechod existujících zdrojů/hlášení, návaznosti všech starších kopií
   a indexové výjimky bez TTL. Pozdější převzetí živého starého těla nesmí být
   označené jako původní zachování při publikování. Odstraněný obsah se
   nevymýšlí ani neobnovuje z testovacího manifestu.
   Při omezení indexace těla zachovat potřebné dotazy subjectUserIds,
   threadId a content.replyToCommentId pro účtovou anonymizaci;
   emulátor nepotvrzuje dostupnost těchto indexů v cloudu.
4. Před aktivací určit novou právní verzi a kompatibilní přijetí podmínek;
   samotný připravený překlad a staré acceptance_2026_07_25 to neřeší.

**Dohledané vstupy, nová webová varianta je připravená za false:**

| Cesta aplikace | Dosavadní aktivní dotaz | Kritérium nové místní varianty |
|---|---|---|
| Mé komentáře (`lib/src/saved.dart`) | collectionGroup comments podle authorId, potom jednotlivé rodiče | Serverově ověřený konec každého rodiče bez globálního collectionGroup obejití; jeden nepřístupný rodič nesmí shodit celý seznam. Soukromé odpovědi sem nyní nepřidávat. |
| Veřejný profil (`lib/src/following.dart`) | Shouty autora, active se filtruje až v klientu | Zachovat pouze dostupné veřejné položky a dosavadní živé interakce; nevracet cizí smazané tělo jako vlastní historii. |
| Business propagace (`lib/src/business.dart`) | Prvních 50 Shoutů autora, promo filtr až v klientu | Zohlednit konec historie i smazané vlastní položky; odlišit chybu načtení od prázdného výsledku. |
| Aktivní staff přehled (`lib/src/staff_shouts.dart`) | status active, přidělený region, createdAt | Zachovat serverově ověřený rozsah a expiraci; dostupnost moderovaného archivu řešit konkrétním hlášením, ne obecným SDK procházením. |
| Home/promo (`lib/src/home.dart`) | B4 publicStates, při source-v1 návratu přímo shouts | Ověřit oba kontrakty i návrat již otevřeného klienta; přísná brána nesmí předběhnout kompatibilní seznamy. |

Inventura nenahrazuje živou kompatibilitu. Vlastnické čtení smazaného těla
má novou místní Rules variantu níže; přímé detaily, cizí konverzace a nativní
klienti potřebují další přechodové ověření. Výchozí false zůstává povinné.

Žádná nová Function nebyla nasazená, nevznikla živá kolekce ani Scheduler,
nevytvořil se Auth účet a nepoužil se starý pilotní úklid. Nový archiv ani
celý moderační/životní milník nejsou touto přípravou uzavřené. Po MVP platí
výslovný požadavek vlastníka na další revizi tohoto cyklu.

<a id="content-lifecycle-read-integration"></a>

##### Navazující místní kompatibilita čtení – 26. listopadu 2026

Pokračování již schváleného místního rozsahu. Připravené
getLifecycleSourcePage rozlišuje pouze vlastní veřejné komentáře, veřejný
profil, vlastní Business historii, aktivní regionální staff přehled a nejvýše
dosavadních 50 kandidátů pro Home při source-v1 návratu. Soukromé zprávy ani
archiv touto cestou nelze vybírat. Autor Business historie je vždy přihlášený
účet; moderátorský region a aktuální roli ověřuje server i při prázdném výsledku.

Jedna transakce prohlédne nejvýše 50 zdrojů, sdílí rodiče/hlavičky a ověření
autorů a vrací pouze veřejnou projekci. Konec historie hlídá serverový čas,
kontroluje se inkarnace a vazba na archiv. Chybějící rodič se přeskočí;
poškozená vazba skončí chybou. Kurzory váže účet, typ seznamu a jeho výběr.
Prázdná nefinální stránka stále nabídne pokračování, nevyvolá neomezené dohledávání.

Klientský seznam při chybě zachová karty i scroll, zopakuje stejnou stránku,
po úspěšné obnově vrátí začátek. Zahodí odpověď pro starý účet/zrušenou obrazovku.
Dosud načtené položky dostanou živé point odběry pro změny/odstranění;
profil sdílí již existující malý B4 stav s kartou. Výběr nových položek obnoví
otevření seznamu či jeho tlačítko obnovy, nevzniká nový polling.
Home source-v1 zachová původní okno 50 kandidátů a promo hranici 20 km;
pohyb přepočítá vzdálenosti místně, ruční obnova znovu vybere kandidáty.

Rules prototyp zůstane false; po jeho budoucím zapnutí mají seznamy používat
server, přímé point čtení ručně smazaného těla náleží jeho autorovi po dobu
historie. Stávající účastnické čtení cizích konverzací se nerozšiřuje a
moderační archiv zůstává dostupný jen přes konkrétní hlášení.

**Místní výsledky:** 56 cílených klientských testů, analýza bez nálezů,
46 kontrol nástrojů a všech **42** případů společné emulátorové sady prošly,
včetně vlastní historie a nemožnosti převzít komentář předcházející inkarnaci
rodiče. Základní serverový běh má 205 pass / 746 skip bez emulátoru;
skip není ověření příslušné integrační větve. Žádný skutečný UI průchod se netvrdí.
Zdroj **8e059e3899c9658966c4a6d9ce52b11bb3a2e5af** má
[úspěšné úplné CI 45766451416](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45766451416):
formát/analýza, aplikační a browserové testy, nástroje, serverové unit,
Rules/transakce, B4, moderace, společný lifecycle, Business, B2, konečný účtový
purge, Storage i webový build. Skript test:content-lifecycle zahrnuje i reader.
První běh 45764931433 ze zdroje dd06a5b byl řízeně zastavený po dokončené B4
regresi kvůli opravě překladače prázdného Business seznamu a zachování původního
stylu nadpisu komentářů. Nedokončený běh není důkaz úspěšného úplného CI.

Měření pro 50 zdrojů dvou autorů: **108 dokumentových reads / 4 dávková SDK
volání / 0 zápisů**. Nejde o počet HTTP požadavků uživatele ani cloudovou cenu.
Čtení soukromého účtu, 50 zdrojů, tří sdílených záznamů autorů a 50 hlaviček
je započítané; archivační těla se nečtou. Běžné SDK point odběry UI jsou navíc;
profil sdílí malý B4 stav, ostatní seznamy potřebují i dostupnost rodiče/komentáře.
Provozní zátěžový profil a nativní routing tímto nejsou uzavřené.

**Další již schválený místní krok:** volitelné propojení
runContentLifecycleMaintenance se stávající cestou runAccountMaintenanceTick
v functions/shout_expiration.js a jejím DEV wrapperem v
functions/account_deletion_dev.js. Nejprve ověřit společný rozpočet, přednost
splatných účtových povinností, dohánění dluhu běžného úklidu a souběžné
inkarnace/generace. Samotný nový Scheduler ani živá četnost se nezavádí;
konkrétní aktivaci musí předcházet výsledky měření a řízený přechod dat.

**Před aktivací připravit a cloudově ověřit indexový plán:** nový COLLECTION_GROUP
comments(authorId ASC, createdAt DESC) a COLLECTION
shouts(authorId ASC, status ASC, createdAt DESC), včetně implicitního __name__ DESC.
Home status/createdAt a oba staff regionální dotazy už mají deklarované vzory
ve firestore.indexes.json. Bez změny TTL; soubor indexů se nyní nenasazuje ani
nepřepisuje. Emulátor správnost cloudových složených indexů nedokládá.

Nedokončená váha
čtení/provozního napojení je před jeho uzavřením rozdělena na dvě poloviny;
hotové části ani pevná váha MVP milníku se nemění. Žádná nová volba se nezapíná,
nic se nenasazuje, neprobíhá živá migrace a starý pilot zůstává zachovaný.

<a id="content-lifecycle-integration-review"></a>

##### Integrační revize před aktivací společného archivu

Otevřený kontrolní bod: po místním dokončení provozního adaptéru a přípravy
přechodu, před první živou migrací/aktivací v DEV, znovu projít celý nový cyklus.
Ověřit všechny writery a čtenáře, atomické indexové/archivní vazby, původní
účtové termíny, soukromé odpovědi, staré/nativní klienty, Rules, indexový plán,
právní verzi, pokračování úklidu a návrat. Výstup musí uvést přesný commit,
nálezy a jejich řešení; jednotlivá úspěšná CI tento společný bod sama neuzavírají.
Jde o podmínku stávajícího integračního ověření, ne další váhu milníku.
Širší [revize všech dosavadních MVP kroků](LAUNCH_READINESS.md#completed-work-review)
následuje před společnou regresí aplikace.

<a id="content-lifecycle-runtime-local"></a>

##### Místní provozní napojení – pokračování schváleného rozsahu

Připravit volitelnou cestu stávajícího minutového workeru za samostatnou false
volbou. Zachovat původní běh při vypnuté volbě bez dalších databázových operací.
V zapnuté laboratorní variantě rozdělit dosavadní zdrojový rozpočet nejvýše 50
mezi účtovou/expirační stránku a běžný lifecycle, aby trvalá účtová fronta
neblokovala běžný úklid. Účtový krok jde první; běžný úklid pokračuje i při
obsazené účtové frontě. Ověřit omezené jednotlivé transakce do 450 zápisů,
časové/počtové ukončení, studený restart, souběh, vadný záznam a zachování cizích dat.
Měřit skutečné databázové operace a dohánění dluhu; laboratorní rozdělení ani
měkká hranice 32 kroků / 10 s nejsou potvrzená produkční kapacita.
Před živým zapojením je nutné vyhodnotit celý 60s worker včetně indexové údržby.
Bez nového Scheduleru, změny živé četnosti, nasazení nebo migrace.

**Připravené místně, úplné CI nového zdroje ještě čeká:** samostatná
contentLifecycleMaintenanceConfiguration.enabled=false a runtime vazba
contentMaintenance do existujícího resumeAccountDeletionJobsDev. Při false
se původní cesta nemění a nepřibývá IO. V laboratorním zapnutí dostane
účtová/expirační stránka ceil(pageSize/2), běžný úklid floor(pageSize/2);
jejich přidělený součet zůstane nejvýše původních 50. Jednotka běžného úklidu
je nejméně jeden krok, u dávkového mazání počet odstraněných řádků; nejde o
počet všech čtení/zápisů. Každá transakce dál sdílí samostatnou mez 450.
Neobsazená rezerva se zatím nepřelévá do účtové stránky; tento kompromis
musí projít provozním měřením před zapnutím, není určený produkční profil.
Účtová fronta má přednost, po ní proběhne běžný úsek i při chybě zdrojového
čtení. Pauza ingressu zachovává splatný úklid, off jej blokuje. Nový úsek
má měkkých 32 kroků / 10 s mezi kroky; indexová údržba má svůj dosavadní
úsek, takže samotných 10 s není horní mez celého workeru.

**Místní ověření:** 53 emulátorových případů společně zahrnulo nové napojení,
původní archiv, expiraci a skutečný feed runtime. Prošlo rovněž všech
207 serverových unit testů bez emulátoru (756 integračních skip není důkazem
jejich ověření), 25 cílených nástrojových testů a lint celé Functions oblasti.
Dva souběžné workery, studený restart, ztracená odpověď po potvrzeném mazání,
vadný účtový záznam, jednostupňové stránky včetně technického dokončení,
oba generační writery a rollback rozpočtu proběhly bez částečného zápisu.
Interně vytvořený listing klient se vždy zavře; dodaný pager vlastní volající.
První rozšířený měřicí běh měl chybu testovacího proxy pro snapshoty, nikoli
chybu aplikace; po opravě měřiče prošla výše uvedená celá sada.

[Reprodukovatelné místní měření](benchmarks/CONTENT_LIFECYCLE_RUNTIME_2026-11-26.json)
je v functions/content_lifecycle_runtime.integration.test.js. Jeden Shout,
jeden komentář, 65 hlášení a dvě generace, fronta účtu obsazená vadným
záznamem, restart při každém běhu: pageSize 6 potřeboval 30 volání /
408 dokumentových výsledků / 133 zápisů, pageSize 50 potřeboval 5 volání /
276 výsledků / 108 zápisů. V obou případech navíc čtyři listCollections
a dva metadata list požadavky; maximum úspěšné transakce 10, respektive
25 zápisů. Nejde o úplný počet RPC, cenu nebo kapacitu pro 5 000 relací.
Průchody jsou rozdělené mezi konec historie a archivu, nikoli důkaz doby
dohánění skutečného provozního dluhu. Výpadek po potvrzeném zápisu může mít
neúplné souhrnné počty; pokračování vždy vychází z trvalého journalu.

Zbývá přechod dat/starých klientů a jeho integrační revize, cloudové ověření
indexů (také maintenanceState/nextMaintenanceAt pro thread údržbu), právní
verze a před aktivací celý časový/kapacitní profil. Váha dosud nedokončeného
provozního napojení/přechodu a ověření byla rozdělena napůl mezi nynější runtime
a zbývající migraci; hotové váhy i součet rodiče zůstávají zachované.

Browser host je nedostupný; pokus o náhradní čtení otevřeného ShoutOut okna
24. listopadu zastavila automatická kontrola, protože nedokázala spolehlivě
určit aktuální URL. Žádné další UI vstupy neprovedené, nelze to označit za
akceptaci aplikace. Potřebná ruční součinnost zůstala na konec samostatné práce.
Započítané čtyři DEV sekce (sankce, osiřelé resolve, Rules autorita, Business),
živé akceptace a celý moderační milník zůstávají otevřené.

Návrat po uzavření: ponechat serverová API/guardy a obě Rules brány;
web vracet nejdříve na kompatibilní **507c7a0b950b74b2**, nikoli původní
1974e34d52e2945b s přímou moderací. Účtový worker musí rozumět novým fázím;
nevracet false po vstupu jobu. Živý rollback nebyl proveden ani tvrzený.

<a id="moderation-local-ci-complete"></a>

#### Uzavřený místní kontrolní bod – 24. listopadu

Zdroj **95e018f8f14aeb1d1bb9f9244f16c1041e802b25** na
feature/moderation-sanctions má
[úspěšné úplné CI 45283039166](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45283039166).
Prošly klientské testy/analýza, nástroje, serverové unit, celé dosavadní Rules
a transakce, B4, soukromé/veřejné rozhodování, nová 50členná sada, B2,
kompletní purge se všemi novými případy, Storage i webový build. Nejde jen
o místní cílený běh ani dokumentační režim. Dřívější klientská oprava 0cf1b87
má samostatné úspěšné úplné CI 45280367518.

Připravené/ověřené jsou sankce a revokace, ochrana silnější vazby, soukromý
preflight bez čtení cizí konverzace, osiřelé resolve, výchozí vypnuté authorOnly
a nové retenční jádro s oběma návaznostmi. Započítané pouze příslušné kódové
a ověřovací sekce. Společný authority cutover, DEV, živá akceptace, Business
a celý moderační milník zůstávají otevřené. Retenční oprava nepřidává váhu.

Žádný rollout, živý zápis, nový Auth účet, Rules změna, reset kvóty, migrace,
změna prostředků/Scheduleru, main ani produkce. Nové volby stále false.
Další konkrétní místní Business úsek i výše popsaná Rules brána byly následně
schválené 24. listopadu; jejich aktuální výsledky jsou výše. Budoucí DEV rozsah,
testovací data a kompatibilní návrat připravit před jeho samostatným souhlasem.
Ruční testy zatím nepotřebujeme, zůstávají na konec dostupné samostatné práce.

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
ještě není provozně zapojené. [Kontrakt a důkazy](plans/accounts/ACCOUNT_AUTHORITY_AND_EXPIRATION.md).
Nový [místní základ společného archivu](#content-lifecycle-local-foundation)
je za vypnutými volbami; současné DEV chování tím není změněné.

- pravidelně vyhledat Shouty po skončení platnosti podle serverového času,
- změnit stav na expirovaný bez spoléhání na čas zařízení,
- od expiresAt odmítnout nové změny palců Shoutu/komentářů a uložení,
  zachovat čtení a výjimky pro vlastní mazání, moderaci a účtový úklid;
  [schválené upřesnění a ověření](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#expired-interactions),
- po sedmi dnech od expirace či dřívějšího odstranění vyčistit veřejný zdroj
  a potomky; samostatný neveřejný podklad držet dalších 60 dní podle
  [politiky schválené 25. listopadu](#content-lifecycle-retention-review),
- hlášení ani rozhodnutí termín neprodlužují; dřívější závazný účtový konec
  má přednost. Další právní režim se automaticky nezavádí,
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
