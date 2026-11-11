# ShoutOut – priority a milníky

Aktualizováno 11. listopadu 2026. Tento přehled určuje pořadí otevřené práce.
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

1. **Dokončit zbývající klientskou regresi Uložených před uzavřením A2/A3.**
   Konkrétní oprava `dbf2aad` má success CI 42932603771 a je nasazená pouze
   na DEV web `de78cfc631c1acc1`; Functions/Rules beze změny. Živé jádro
   prošlo pod oběma stávajícími testovacími účty. Výsledek ručního UI průchodu
   zatím není potvrzený; dva mezitím vypršelé fixture `mvp-saved-20261111-*`
   jsou uklizené včetně 4 záložek a 8 receipt. Čerstvý test předem vymezit.
   [Checkpoint](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression).
   Vlastní Aktivní/Expirované, kompaktní pokračování za poslední kartou,
   zachování scrollu a zámek expired interakcí jsou v DEV ověřené a potvrzené
   vlastníkem. Zdroj 14b7885 prošel CI 42902048239 a je nasazený: tři Functions,
   Rules a web. Původních 120 i dva nové krátce platné testovací Shouty jsou
   uklizené včetně vedlejších dat; 37 původních zdrojů i Auth účty zachované.
   [Důkazy a výjimky zámku](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#expired-interactions).
   Tuto hotovou část znovu neotevírat jako čekající rollout/úklid. Zbývá
   živá UI akceptace opravených Uložených; lokální regrese čekání/chyb,
   pokračování a změny účtu už prošly. Původní fixture jsou odstraněné,
   novější dva jsou také uklizené. Čerstvý průchod je nyní schválený spolu
   s B1: právě dva 24hodinové syntetické Shouty pod stávajícími účty a úklid.
   Potom uzavřít společnou
   akceptaci A2/A3 a přejít na B.

2. **Dokončit osobní přečtení a indikátor novinek.** B1: skutečná expozice
   a trvalé osobní ukládání; B2: synchronizace zařízení; B3: globální
   unread-first v Nejblíž; B4: oddělený počet novinek. Konkrétní úložiště,
   [webové B1](plans/feed/FEED_READING_POLICY.md#b1-proposal) je schválené
   (IndexedDB, místní značky a expiresAt + 7 dní, bez cloudových operací).
   Implementace a lokální testy probíhají; nasazení zatím není provedeno.
   [Checkpoint](plans/feed/FEED_READING_POLICY.md#b1-implementation).
   Cloudová retence/synchronizace a polling zůstávají rozhodnutím pro B2/B4.
   Další závislosti jsou podle
   [etap](plans/feed/FEED_IMPLEMENTATION_STAGES.md#aktualni-stav). Celé A0–A3
   i B1–B4 zůstává před MVP; dílčí rollout neuzavírá celý milník.
3. **Uzavřít zbývající serverové a předstartovní milníky.** Příští konkrétní
   úsek vždy vybrat podle závislostí v [serverovém plánu](MVP_SERVER_PLAN.md)
   a [startovní bráně](LAUNCH_READINESS.md), ne podle pořadí historických poznámek.

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
