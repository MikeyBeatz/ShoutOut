# ShoutOut – priority a milníky

Aktualizováno 20. listopadu 2026. Tento přehled určuje pořadí otevřené práce.
Aktuální kód a ověřené nasazení jsou v [PROJECT_STATUS](PROJECT_STATUS.md),
podrobné úkoly v [BACKLOG](BACKLOG.md), podmínky serverových milníků v
[MVP_SERVER_PLAN](MVP_SERVER_PLAN.md). Neobsahuje chronologii rolloutů.

## Postup

### Postup do MVP

<!-- progress:mvp:start -->
`████████████████████████░░░░░░░░░░░░░░░░` **60,13 %** — vážené dokončení podúseků

Hotové úseky: **154/215**. Celé milníky: **9/24**; rozpracované: 11.
<!-- progress:mvp:end -->

Stupnice započítává i doložené podúseky otevřených milníků. Celé milníky a
startovní brána se tím neobcházejí. [Evidence a pravidla](PROGRESS.md).

### Postup celého backlogu

<!-- progress:backlog:start -->
`████████████████████████████░░░░░░░░░░░░` **70,21 %** — vážené dokončení podúseků

Hotové úseky: **185/293**. Celé položky: **107/157**; rozpracované: 7.
<!-- progress:backlog:end -->

Původních 157 hlavních položek zůstává zachovaných. Jejich podúseky mají pevné
váhy a společnou [evidenci](progress.json); výpočet zahrnuje i práci po MVP.

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

**Poslední uzavřený úsek:** [B3 – živá DEV akceptace a úklid](plans/feed/B3_DEV_ROLLOUT.md#b3-acceptance-complete).
Původní podrobný [checkpoint je zachovaný](plans/feed/B3_DEV_ROLLOUT.md#todo-b3-preacceptance-history)
v plánu; není další otevřenou prací. Uklizeno 120 fixture a 144 cloudových
značek přečtení, původních 38 zdrojů a pending žádost beze změny.

1. **Dokončit úspornou obnovu s novinkami v B4.**
   **Poslední dokončený úsek:** [lokální základ B4a](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4a-local-results),
   zdroj 13bfe74 / úspěšné úplné CI 44816457563. **Další:** konkrétní návrh
   [finálního transakčního sestavení stránky](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4a-read-integration-proposal)
   a potřebných metadat. [Lokální reader a měření](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4-read-local-results)
   jsou připravené se skutečnými guardy; čeká společné úplné CI. Potom zbývá
   provozní layout a zapojení writerů/úklidu. Živý datový přechod je samostatná brána.
   Protokol výběr/doplnění, verze celého těla, pouze RAM cache a lokální srovnání
   stavové projekce se započtením existujících živých/Home odběrů jsou lokálně
   připravené. Další integrace musí zlevnit cold/refill a pokrýt všechny writery;
   individual varianta pro výběr se nedoporučuje. Žádný nový rollout nebo živé kolekce.
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
