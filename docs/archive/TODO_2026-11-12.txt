# ShoutOut – priority a milníky

Aktualizováno 12. listopadu 2026. Tento přehled určuje pořadí otevřené práce.
Aktuální kód a ověřené nasazení jsou v [PROJECT_STATUS](PROJECT_STATUS.md),
podrobné úkoly v [BACKLOG](BACKLOG.md), podmínky serverových milníků v
[MVP_SERVER_PLAN](MVP_SERVER_PLAN.md). Neobsahuje chronologii rolloutů.

## Postup

### Postup do MVP

`███████████████░░░░░░░░░░░░░░░░░░░░░░░░░░` **38 %** — 9 z 24 milníků

Počítají se celé milníky níže. Dílčí dokončení serverového úklidu nezavírá
celý milník životního cyklu ani serverové brány.

### Postup celého backlogu

`███████████████████████████░░░░░░░░░░░░░` **68 %** — 107 ze 157 úkolů

Jedinou checkboxovou evidencí pro tuto metriku je BACKLOG. Původní základ měl
155 položek; přibylo nové chování feedu a pozdější správa retenčního archivu.
Reorganizace dokumentů nemění jejich stavy ani rozsah MVP.

## Nejbližší práce

1. **Připravit pokračující retenční úklid B2 před DEV aktivací.**
   [Konkrétní runtime úsek](plans/feed/FEED_READING_POLICY.md#b2-runtime-implementation)
   je výslovně schválený a lokálně připravený: control, kvóta 40 + 1/s pro
   každý směr/UID, samostatný host a adaptér za false. 375 Flutter, 127
   Functions unit a 10 různých emulátorových scénářů prošlo. Úsek je uzavřený:
   zdroj cce1e7d má success CI 43284395332 (375 Flutter / 16 Chrome / 448
   Rules/server / 10 runtime, včetně obou velkých front). Znovu jej neschvalovat.
   Nic nebylo nasazené. Před aktivací zbývá fyzický retenční úklid a jeho kapacita,
   potřebná indexace, kompatibilní v3 návrat a konkrétní živý DEV průchod.
   [Konkrétní rozsah](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b2-client-foundation)
   byl schválený a je implementovaný: hranice outboxu, odstranění automatických
   spouštěčů, IndexedDB v3 a atomický checkpoint. Klientský úsek je uzavřený:
   zdroj 049cedc má success CI 43270732252 (369 Flutter / 16 Chrome / 448
   Rules/server), lokálně i 39 cílených regresí.
   [Výsledky](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b2-client-results).
   Transport není zapnutý a nic není nasazené. Serverový runtime je připravený
   výše, kapacita úklidu je další práce; znovu neschvalovat hotový klientský úsek.
   [Návrh verzí, rozdílů, cache a novinek](plans/feed/FEED_DELTA_REFRESH_PLAN.md)
   je zapsaný na základě schválení vlastníka. Určuje návaznosti B2 → B3 → B4,
   nikoli dokončené B2/B3/B4. Další rozsah úklidu ještě předložit konkrétně.
   Cíl 100 000 registrovaných účtů a 5 000 současně aktivních uživatelů
   je schválený. [Kapacitní akceptace](LAUNCH_READINESS.md#capacity-target)
   zahrnuje celou kritickou cestu, automatické škálování i průběžný úklid.
   Současný výkon a cena pro tento profil nejsou prokázané; žádné živé změny.
   [Model a cílené lokální testy](operations/CAPACITY_AND_SCALING.md)
   jsou schválené a připravené: 4 modelové regrese / 4 emulátorové testy,
   55 tools a lint prošly. Úsek je uzavřený: zdroj 4024e49 má success CI
   43254458838 (361 Flutter / 10 Chrome / 55 tools / 448 Rules/server).
   Nové rozhodnutí nahrazuje 10s upload:
   [sync při spuštění/obnově](plans/feed/FEED_READING_POLICY.md#refresh-boundary-policy).
   Dosavadní B2 runtime a kapacita úklidu vyžadují revizi.
   Místní webové B1 je uzavřené v DEV: zdroj 503eea6, success CI 43056516730,
   web 47268ed17fd2eebd; 350 Flutter / 8 skutečných Chrome/IndexedDB.
   Vlastník pod Bright_Otter_182 doložil short/long přečtení se stejnými časy
   před/po znovuotevření. Regrese Uložených je také uzavřená: potvrzené zmizení
   odebrané karty bez obnovy a její nepřítomnost po restartu. Tím je doplněná
   poslední otevřená kontrola společné DEV akceptace A2/A3. Oba nové 24hodinové
   testovací Shouty jsou uklizené přes writer včetně 3 záložek a 9 receipt;
   37 původních zdrojů i Auth zůstaly zachované. Starší testovací skupiny jsou
   rovněž uklizené; neotvírat je znovu jako čekající rollout/test.
   [B1 a důkazy](plans/feed/FEED_READING_POLICY.md#b1-implementation),
   [Uložené](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression).
   Vlastník původně schválil B2 retenci expiresAt + 7 dní, upload 32 / 10 s
   i první lokální implementaci; následně spouštěče změnil podle odkazu výše.
   Ta je připravená na feature/feed-read-sync: transakční bloky a snapshot/delta,
   IndexedDB v2 fronta, retry/ack a soukromý účtový úklid za vypnutým zapojením.
   [Výsledky a hranice](plans/feed/FEED_READING_POLICY.md#b2-local-results).
   Lokální úsek je uzavřený: zdroj 693663d má success CI 43119749520,
   361 Flutter / 10 Chrome / 444 Rules/server / 116 purge / 15 Storage.
   [Provozní návrh](plans/feed/FEED_READING_POLICY.md#b2-runtime-proposal)
   je starší podklad k revizi: ochrany četnosti, pokračování přenosu,
   fyzický úklid, indexace a kompatibilní návrat. Novější schválený runtime je
   uvedený na začátku bodu; jeho ani model/testy znovu neschvalovat.
   Živý DEV pilot následuje po dokončení úklidu, zbývajících bran a přesném CI.
   Implementace B2 není nasazené B2; nic živého se neměnilo.

2. **Po B2 dokončit B3 a úspornou obnovu s novinkami v B4.** B3: nepřečtené
   první jen v Nejblíž; B4: verze/metadatové porovnání, přenos rozdílů a cache,
   úsporné signály i oddělený počet novinek, který nemění rozpracované
   pořadí. B2 má schválený přenos při spuštění/obnově feedu; detekce novinek B4 je otevřená.
   [Etapy a závislosti](plans/feed/FEED_IMPLEMENTATION_STAGES.md#aktualni-stav).
   Celé A0–A3 i B1–B4 patří před MVP; uzavření A2/A3 a B1 v DEV nemění
   automaticky celý serverový milník ani procentní metriku.
3. **Uzavřít zbývající serverové a předstartovní milníky.** Příští konkrétní
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

### Hotové milníky MVP (9)

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

### Zbývající milníky před MVP (15)

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
15. ⬜ Splnit webovou rozhodovací bránu v `docs/LAUNCH_READINESS.md` a výslovně
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
