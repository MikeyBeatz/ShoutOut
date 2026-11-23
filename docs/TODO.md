# ShoutOut – priority a milníky

Aktualizováno 23. listopadu 2026. Tento přehled určuje pořadí otevřené práce.
Aktuální kód a ověřené nasazení jsou v [PROJECT_STATUS](PROJECT_STATUS.md),
podrobné úkoly v [BACKLOG](BACKLOG.md), podmínky serverových milníků v
[MVP_SERVER_PLAN](MVP_SERVER_PLAN.md). Neobsahuje chronologii rolloutů.

## Postup

### Postup do MVP

<!-- progress:mvp:start -->
`████████████████████████░░░░░░░░░░░░░░░░` **60,63 %** — vážené dokončení podúseků

Hotové úseky: **195/252**. Celé milníky: **9/24**; rozpracované: 11.
<!-- progress:mvp:end -->

Stupnice započítává i doložené podúseky otevřených milníků. Celé milníky a
startovní brána se tím neobcházejí. [Evidence a pravidla](PROGRESS.md).

### Postup celého backlogu

<!-- progress:backlog:start -->
`███████████████████████████░░░░░░░░░░░░░` **69,82 %** — vážené dokončení podúseků

Hotové úseky: **207/313**. Celé položky: **107/158**; rozpracované: 7.
<!-- progress:backlog:end -->

Původních 157 hlavních položek zůstává zachovaných; 23. listopadu přibyla
jedna nová položka po MVP, celkem nyní 158. Nižší procento po rozšíření
neznamená ztrátu dokončené práce. Podúseky mají pevné váhy a společnou
[evidenci](progress.json); výpočet zahrnuje i práci po MVP.

## Nejbližší práce

Pracovat po [ucelených funkčních úsecích](operations/RELEASING.md#development-checkpoints):
průběžné lokální kontroly, seskupený push/CI před nasazením a následný DEV průchod.

**Drobná oprava IDE dokončená lokálně:** [vyloučení cizích Dart šablon npm](operations/TESTING.md#dart-dependency-templates).
Celá flutter analyze nyní bez nálezů; žádný nový MVP kredit, build či rollout.

**Odbočka ke konzoli – fontová oprava dokončená v DEV:**
[Důkazy](operations/CONSOLE_WARNINGS.md#category-font-dev-rollout): 9e3828d má
success úplné CI 44178308912, verze 74d0c3756884ac19 je nasazená a ověřená
na obou doménách. Sedm místních fontových scénářů, 26 Shout testů a celý CI
průchod prošly. Odstraněné jsou jen dva selektory pevných symbolů; CSP/QUIC
zůstávají samostatnou evidencí a jejich oprava se netvrdí. Celý vizuální audit
není tím hotový; B2 má samostatnou uzavřenou akceptaci níže. Metriky a jejich pevné váhy jsou zachované.
Vlastník potvrdil odstranění fontové hlášky; zbývající
[Intl.v8BreakIterator deprecation](operations/CONSOLE_WARNINGS.md#intl-break-iterator)
je ve Flutter engine. Konkrétní lokální porovnání auto/full rendereru zatím
čeká na schválení; neměnit SDK/bootstrap ani potlačovat hlášky bez ověření.

**Poslední uzavřený živý úsek:** [B4 metadata/cache – DEV akceptace a úklid](plans/feed/B4_DEV_ROLLOUT.md#delta-acceptance-complete).
Vlastník potvrdil oba účty a požadované UI/interakční průchody. Uklizeno
120 nových fixture a 138 jejich cloudových značek; původních 38 zdrojů a
pending žádost beze změny. Předchozí [B3 je také uzavřené](plans/feed/B3_DEV_ROLLOUT.md#b3-acceptance-complete).

1. **Dokončit úspornou obnovu s novinkami v B4.**
   **Právě nasazená oprava:** [živé pořadí v Nejblíž](plans/feed/B4_DEV_ROLLOUT.md#movement-order).
   Vlastník potvrdil aktualizaci vzdáleností, nově schválil i přeskládání karet
   při potvrzeném pohybu. 486 Flutter testů a 7 serverových regresí prošly;
   af4c3aa / úplné CI 45085601243 success, pouze DEV web **37b697da10fbb5b1**.
   Krátká kontrola řazení/kotvy je na žádost vlastníka odložená na později.
   Testovací data zatím zachovat, platnost svévolně neprodlužovat. Bez nového MVP kreditu
   za opravu; společnou akceptaci uzavřít až po skutečném úklidu.
   **Předchozí základ pohybu v DEV:** [výsledky a hranice](plans/feed/B4_DEV_ROLLOUT.md#movement-integration).
   78d6a3f / úplné CI 45077814590 success, Hosting **2d6ae9af70840b03**,
   getFeedPage **00007-moc**. Automatické kontroly, simulace i živý dry-run
   úklidu jsou hotové. Původní ruční průchod vedl k uvedené změně řazení;
   po její závěrečné kontrole restart 50 → původní A/B/C podle manifestů. C2 je již uklizený.
   Ostatní Functions, Rules, prostředky a produkce zachované; neuzavírat
   finální akceptaci před odpovědí a skutečným úklidem.
   **Předchozí ruční dosahy:** [návrat novinek po pauze a zjednodušení](plans/feed/B4_DEV_ROLLOUT.md#news-pause-recovery-results).
   b57f6b9 / úplné CI 45071219942 success, DEV Hosting **6762922852bede94**,
   getFeedPage **00006-niz**. Vlastník potvrdil dosahy 1–50 km, výchozí 50, bez
   Auto/údaje o načteném dosahu a funkční obnovu/detail během 5/paused. Po
   6/active doložené úspěšné klientské volání s Auth/App Check VALID a dalších
   101 s bez změny news kvóty. Návrat novinek uzavřený; zbývá původní úklid.
   Ostatních 19 Functions a Rules zachované.
   V tomto starším b57f6b9 byl pohyb vypnutý. Aktuální zapojení je výše;
   samotný starší prototyp nebyl důkaz jeho živé funkčnosti.
   **Historické Auto hledání, nyní nahrazené ručním 50 km:** [původní chování a výsledky](plans/feed/FEED_DELTA_REFRESH_PLAN.md#automatic-radius).
   Klientská příprava a 38 různých cílených regresí jsou hotové; zdroj 6bef37c
   má success úplné CI 45020677812. DEV Hosting 06df6da99db68e74 je ověřený
   na obou doménách. Vlastník potvrdil fungující Auto v novém anonymním okně;
   původní místní problém není tím vyřešený. Na jeho žádost je připravených
   50 nových 24h restartovacích Shoutů, oddělených od A/B/C pilotu. Anonymní
   restart/Auto průchod vlastník potvrdil; běžné okno stále selhává a jeho
   diagnostiku výslovně odložil. Příčina není potvrzená; neupravovat naslepo
   B2 ani nemazat místní frontu. Po testech uklízet jen příslušný manifest, ne cizí data.
   B4b akceptaci tím nezavírat; po jeho rollbacku obnovit nový Auto web.
   **Nyní nasazené:** metadata/cache B4, feed-v3 a deset Functions ze zdroje
   8b1de68 / úspěšné úplné CI 44935555088, Hosting fa20f566fc0ab82b.
   [Živé důkazy nasazení](plans/feed/B4_DEV_ROLLOUT.md#dev-rollout-results):
   oba účty prošly 50 → 100 → 120, warm 0/refill 1 tělo, promo a serverový
   rollback/nový audit. [UI akceptace i úklid jsou uzavřené](plans/feed/B4_DEV_ROLLOUT.md#delta-acceptance-complete).
   **Nyní:** [schválený lokální B4b](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4b-local-proposal)
   pro úsporné signály/číslovku novinek, klienta a měření; pouze nové publikace.
   [Lokální výsledek a návrh četnosti](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4b-local-results)
   je uzavřený: e8c0c9c / úplné CI 44944929884 success.
   [Konkrétní provozní návrh](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4b-runtime-proposal)
   vlastník schválil celý. [Lokální implementace a měření](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4b-runtime-results)
   jsou uzavřené: oblastní/technický signál, úplné pokrytí, čtecí Rules,
   četnost/adaptace a news kvóta; 3d381f8 / úplné CI 44953434700 success.
   [Konkrétní DEV aktivace a malý společný pilot](plans/feed/B4_DEV_ROLLOUT.md#news-dev-pilot-proposal)
   jsou připravené podle čerstvé čtecí inventury: dvě Functions, tři indexové
   výjimky a tři nové fixture. Vlastník schválil celý úsek včetně nástroje,
   CI a živého ověření. Zdroj 20206c4 má success úplné CI 44959541907;
   [DEV nasazení je ověřené](plans/feed/B4_DEV_ROLLOUT.md#news-dev-rollout-results):
   indexy dokončené, news active / feed control 12, Rules/dvě Functions/drain ověřené,
   Hosting ca327f10112ef349 / news on. Pilotní A i B existují; B vznikl přes klienta
   TestBusiness s validním Auth/App Check a je adoptovaný. Interní count po B je 1.
   Vlastník našel Network / Offline; po obnovení připojení feed i změna dosahu
   fungují, přetrvávající prodleva zatím není změřená. Samostatně reprodukovaná
   blokace B2 odloženou značkou není potvrzenou příčinou tohoto incidentu.
   [Původní selhání C](plans/feed/B4_DEV_ROLLOUT.md#news-ui-diagnosis) vedlo
   k [opravě napojení a lokálnímu modelu pohybu](plans/feed/B4_DEV_ROLLOUT.md#news-ui-fix-results): 468 Flutter,
   99 tools testů, analýza bez nálezů; 34268e5 / úplné CI 45060709344
   success, DEV Hosting 346ea6fb1866da8e je nasazený a zdrojově ověřený.
   [Nový výslovně povolený C potvrdil číslovku 1 a odečtení po expiraci](plans/feed/B4_DEV_ROLLOUT.md#news-positive-acceptance);
   je uklizený a tento dílčí důkaz je započítaný. Hotový test neopakovat.
   Další [konkrétní návrh: zarovnání badge a lokální geografický rebase](plans/feed/B4_DEV_ROLLOUT.md#badge-and-recenter-proposal)
   je schválený a [připravený lokálně](plans/feed/B4_DEV_ROLLOUT.md#badge-and-recenter-results):
   474 Flutter testů, analýza bez nálezů a rebase regrese prošly. Zdroj
   211471b / [success úplné CI 45066405533](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45066405533)
   je pouze na DEV Hostingu **3881ef4d17f67aa8**; soubory/HTTP ověřené, Functions
   a Rules nezměněné. Živý pohyb zatím vypnutý.
   Místní data nemazat a další
   fixture nevytvářet naslepo. [Pauza a starší kompatibilní web prošly ruční kontrolou](plans/feed/B4_DEV_ROLLOUT.md#news-pause-acceptance);
   současný web je vrácený, news **4/active**, bez změn zdrojů/Rules/Functions.
   Vlastník potvrdil návrat UI pod TestBusiness a schválil [opravu návratu po načtení během pauzy](plans/feed/B4_DEV_ROLLOUT.md#news-pause-recovery-proposal).
   [Oprava je nyní nasazená](plans/feed/B4_DEV_ROLLOUT.md#news-pause-recovery-results),
   současný stav je výše. Původní úklid není hotový. Společná finální
   akceptace B4 zahrne i interaktivní UI rollback. Tentýž pilot neopakovat.
   Předchozí [lokální přechod a rollback](plans/feed/B4_DEV_ROLLOUT.md#local-transition-results),
   [klientské zapojení a nákladové meze](plans/feed/FEED_STATE_STORAGE_PROPOSAL.md#client-integration-results),
   [P1 a všechny writery](plans/feed/FEED_STATE_STORAGE_PROPOSAL.md#p1-results) i
   [transakční reader](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4-read-local-results)
   jsou uzavřené; jejich datované vypnuté konfigurace nejsou současný DEV stav.
   Celé B4 zahrnuje verze/metadatové porovnání, přenos rozdílů a cache,
   úsporné signály i oddělený počet novinek, který nemění rozpracované
   pořadí. B2 má schválený přenos při spuštění/obnově feedu; detekce novinek B4 je otevřená.
   [Etapy a závislosti](plans/feed/FEED_IMPLEMENTATION_STAGES.md#aktualni-stav).
   Celé A0–A3 i B1–B4 patří před MVP; uzavření A2/A3 a B1–B3 v DEV nemění
   automaticky celý serverový milník. Doložené podúseky posouvají váženou stupnici
   podle [nové metodiky](PROGRESS.md).
2. **Uzavřít zbývající serverové a předstartovní milníky.** Příští konkrétní
   úsek vždy vybrat podle závislostí v [serverovém plánu](MVP_SERVER_PLAN.md)
   a [startovní bráně](LAUNCH_READINESS.md), ne podle pořadí historických poznámek.
   **Nyní schválené a rozpracované:** [společné schválení/eskalace/uzavření](MVP_SERVER_PLAN.md#moderation-basic-local)
   všech tří typů hlášení, místní server a neaktivní klient, testy a společné CI.
   Bez živých změn a bez otevírání dokončených pilotů. DEV přechod bude mít vlastní plán.
   [Místní výsledek](MVP_SERVER_PLAN.md#moderation-basic-local-results): jádro,
   neaktivní klient a testy hotové; 18 nových emulátorových, 15 purge, 509 Flutter,
   108 nástrojových a 177 unit prošlo. Teď společný push/úplné CI; DEV/živá
   akceptace se tím nezapočítávají. Ostatní moderační cesty ještě brání úplné Rules uzávěře.
   **Poslední uzavřený DEV úsek:** [vlastní mazání soukromých odpovědí](MVP_SERVER_PLAN.md#private-deletion-dev-complete).
   App 9c2e121 / úplné CI 45096691292 success, Rules 9fee32e / úplné CI
   45098775591 success. Oba účty prošly skutečným UI/callable mazáním s Auth
   a App Check VALID. DEV Rules **e16b7a3d-f363-499c-ad40-262471059271** mají
   přesnou shodu zdroje a 8/8 scénářů serverové simulace; přímý autentizovaný
   HTTP DELETE z prohlížeče tato kontrola neměřila. Hosting 813f34b7555e272a,
   Functions/prostředky/plánovače zachované. Nový pilot je uklizený včetně
   notifikací a cloudové read značky, 5 potvrzení ponechaných +7 dní;
   všech 91 původních zdrojů/pending žádost zachované. Manifest cleaned,
   znovu neseedovat. Implementace, ověření, DEV i akceptace této části uzavřené.
   **Nově uzavřený DEV úsek:** [soukromé odstranění bez postihu](MVP_SERVER_PLAN.md#moderation-private-dev-complete).
   App/server 0fa2774 / úplné CI 45147594322 success; samostatný Rules zdroj
   40e127f / úplné CI 45164557897 success. Místních 49/49 emulátorových testů
   a 16/16 serverových simulací vydaného Rules zdroje prošlo.
   Rules **3de8f7d8…de297** mají ověřenou shodu zdroje a uzavřené managed
   private delete/contentRemoved. Vlastník přijal skutečný průchod TestAdmin;
   regionální živé ověření tím netvrdit. Vymezená fixture je uklizená,
   5 potvrzení ponechaných +7 dní, kvóty beze resetu. Původních 91 zdrojů,
   pending žádost, 22 Functions, oba plánovače a web b5703cec19978454 zachované.
   Přijatý manifest je cleaned, původní je jen historický; znovu neseedovat.
   Kompletní DEV/akceptace této operace se započítávají; celý moderační
   milník a ostatní rozhodnutí zůstávají otevřené.
   Další atomická rozhodnutí/regionální autoritu připravit
   podle [auditu](MVP_SERVER_PLAN.md#private-deletion-preparation).
   Nezaměňovat dokončení vlastního mazání za celý obsahový milník.
   Odložený pohybový test a jeho staré fixture jsou samostatné; žádné nové
   testy či prodlužování platnosti tím nejsou schválené.

## Hranice MVP

Kapacitní cíl je 100 000 registrovaných účtů a 5 000 současně aktivních
uživatelů; měřitelné výkonové podmínky ještě určí [startovní brána](LAUNCH_READINESS.md#capacity-target).

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

### Původní základ MVP (9 milníků)

1. ✅ <a id="mvp-01"></a> Základní registrace, ověření e-mailu, právní souhlas a profil.
2. ✅ <a id="mvp-02"></a> Lokální feed, vytvoření a životní stav Shoutu.
3. ✅ <a id="mvp-03"></a> Komentáře, odpovědi, reakce, ukládání, blokace a hlášení.
4. ✅ <a id="mvp-04"></a> Veřejné profily, Follow a oznámení uvnitř aplikace.
5. ✅ <a id="mvp-05"></a> Business registrace, pobočky a důvěryhodná ruční aktivace s auditem.
6. ✅ <a id="mvp-06"></a> Moderátorské rozhraní, role, regionální rozsahy a základní Rules ochrana.
7. ✅ <a id="mvp-07"></a> Web jako funkční vývojový cíl se sedmi jazyky.
8. ✅ <a id="mvp-08"></a> Automatické Flutter a Firestore Rules testy zapojené do CI.
9. ✅ <a id="mvp-09"></a> Připravit `go.shoutout-app.eu` a Hosting pro aplikaci odděleně od
   stávající prezentace. Ověřeno 25. října 2026: samostatný site, propojená
   webová aplikace, DNS a aktivní HTTPS. Produkční release patří do navazujících
   milníků a zatím není nasazený.

### Navazující milníky před MVP (15)

1. ⬜ <a id="mvp-10"></a> Nakonfigurovat aplikaci ve stávajícím projektu `shoutout-production-a1b34`,
   oddělit její Hosting site od vstupní stránky a bezpečně oddělit vývojová
   a produkční data i nástroje.
2. ⬜ <a id="mvp-11"></a> Ověřit doručitelnost e-mailů, produkční Auth domény, Action URL a šablony.
3. ⬜ <a id="mvp-12"></a> Ověřit polohu, feed a publikování v mobilním i desktopovém prohlížeči
   mimo Litoměřice.
4. ⬜ <a id="mvp-13"></a> Nasadit geografické obohacení, provést backfill a ověřit regionální data
   potřebná pro stávající moderaci.
5. ⬜ <a id="mvp-14"></a> Automatizovat expiraci Shoutů, mazání podkolekcí a dokončení 60denní
   retence účtu.
6. ⬜ <a id="mvp-15"></a> Dokončit webový App Check a ochranu registrace; vynucení zapnout až po
   ověření metrik.
7. ⬜ <a id="mvp-16"></a> Zavést důvěryhodnou serverovou bránu pro zápisy obsahu, čítače, polohu,
   idempotenci a limity proti spamu.
8. ⬜ <a id="mvp-17"></a> Dopracovat bezpečné moderátorské operace a jejich audit pro veřejný web,
   včetně zamítnutí a pozastavení Business účtů.
9. ⬜ <a id="mvp-18"></a> Serverově vynutit pravidla současných bezplatných Business funkcí a
    zachovat oddělení oprávnění od budoucí ceny.
10. ⬜ <a id="mvp-19"></a> Dokončit audit překladů, přístupnosti a rozložení webu v mobilní i
    desktopové šířce pro všech sedm jazyků.
11. ⬜ <a id="mvp-20"></a> Projít všechny webové ruční regresní scénáře běžného, Business i
    moderačního účtu včetně pomalé nebo přerušované sítě.
12. ⬜ <a id="mvp-21"></a> Doplnit skutečného provozovatele, podporu, právní kontrolu a proces práv
    subjektů údajů.
13. ⬜ <a id="mvp-22"></a> Nastavit monitoring, rozpočty, kvóty, zálohy, obnovu, rollback a
    minimální provozní metriky bez nadbytečných osobních údajů.
14. ⬜ <a id="mvp-23"></a> Spustit CI a produkční webový build a odstranit blokující vady.
15. ⬜ <a id="mvp-24"></a> Splnit webovou rozhodovací bránu v `docs/LAUNCH_READINESS.md` a výslovně
    přijmout nebo odstranit zbývající rizika.

### Práce po MVP

Po MVP patří vydání Androidu a iOS, kompletní placená Business monetizace,
interaktivní tutorial, telefonní ověření, FCM push a fan-out sledujícím a
obecné žebříčky či gamifikace. Tyto plány se neruší; zůstávají v detailním
backlogu v [BACKLOG.md](BACKLOG.md) se štítkem **Po MVP**.

Nově po MVP: [soukromé odpovědi v Mé shouty → Komentáře](plans/roadmap/PRIVATE_REPLY_HISTORY.md)
podle [bl-158](BACKLOG.md#bl-158). Jde o osobní přehled se zachováním soukromí;
do aktuálního dokončování MVP tuto implementaci nezařazovat.

Osobní přečtení, synchronizace zařízení, unread-first v Nejblíž a číslovaný
indikátor novinek (B1–B4) sem nepatří: vlastník je vybral před MVP.

Navazující mobilní etapa zachovává fyzické testování Androidu, Play Integrity,
podpis a Google Play, stejně jako sestavení iOS na Macu, App Attest, fyzický
iPhone, TestFlight a App Store. Úplný postup je v
`docs/plans/roadmap/MOBILE_DISTRIBUTION_PLAN.md`. Navazující Business etapa zachovává
záměr předplatného, otevřené rozhodnutí o placeném dosahu a Founder
zvýhodnění, platební integraci, fakturaci a důvěryhodné statistiky propagace
podle `docs/plans/roadmap/BUSINESS_MONETIZATION.md`. Business tokeny ani jejich nákup a
čerpání se neplánují. Ověření firmy přes
registry bylo naopak výslovně zrušeno; webové MVP počítá s ruční aktivací.

## Další otevřené oblasti

- [Produkce, App Check, antispam, moderace, retence, monitoring a závěrečná kontrola](MVP_SERVER_PLAN.md).
- [Produktové, grafické, překladové a Business podúkoly včetně všech původních checkboxů](BACKLOG.md).
- [Prezentační web a www přesměrování](BACKLOG.md#prezentační-web-před-mvp).
- [Povinná předstartovní brána](LAUNCH_READINESS.md).
- [Význam štítků a historická rozhodnutí](archive/README.md).

## Údržba dokumentace

Dokončený podkrok vyřadit z nejbližší práce a ponechat odkaz na výsledek v
PROJECT_STATUS nebo příslušném plánu. Nepoužívat názvy „bod 1/2“ bez kontextu.
Nový požadavek nejdřív zařadit do BACKLOG, nikoli do historie TODO.
Role dokumentů a kontrolní příkaz: [DOCUMENTATION_MAINTENANCE](DOCUMENTATION_MAINTENANCE.md).
Úplný předchozí obsah je zachovaný v [archivním indexu](archive/README.md).
