# ShoutOut – aktuální TODO a pořadí práce

Reorganizováno 29. října 2026; rozsah práce ani stav milníků se nezměnil.
Aktualizace 31. října: přidaný požadavek na novou logiku feedu a návrh etap
před/po MVP. Vlastník následně vybral celé nové chování před MVP.

## Postup

### Postup do MVP

`███████████████░░░░░░░░░░░░░░░░░░░░░░░░░░` **38 %** — 9 z 24 milníků

Počítají se celé vydávací milníky níže.

### Postup celého backlogu

`███████████████████████████░░░░░░░░░░░░░` **69 %** — 107 ze 156 úkolů

Kanonické checkboxy jsou pouze v [BACKLOG.md](BACKLOG.md).

- Podkroky serverové brány samy nezvyšují počet dokončených milníků.
- Reorganizace nepřidává nové úkoly ani nemění žádný checkbox.
- Nové zadání feedu z 31. října přidává jeden otevřený úkol nad původních 155;
  počet hotových úkolů ani 24 milníků se tím nemění.

## Jak navázat

1. Přečíst [aktuální stav a další krok](PROJECT_STATUS.md).
2. Vybrat úkol níže; jeho podrobnosti hledat v [checkboxové evidenci](BACKLOG.md)
   nebo [serverovém plánu](MVP_SERVER_PLAN.md).
3. Skutečné chování ověřit v kódu a konfiguraci; postup vydávání je v [RELEASING](RELEASING.md).

Historie nasazení a staré protichůdné stavy nepatří do tohoto přehledu.
Původních 1 425 řádků je beze změny v [úplném archivu](archive/TODO_2026-10-29.md);
[archivní index](archive/README.md) uvádí kontrolní součet a rozdělení informací.

## Nejbližší práce – serverová brána

Ukládání Shoutů je dokončené ve vývoji: operace a klient `5fceccb`, aktivace
`02b8b28`, obě CI i živé testy běžným/Business účtem prošly včetně úklidu.
[Podrobný aktuální stav](PROJECT_STATUS.md#serverova-brana).

Mazání komentářů je hotové ve vývoji: `34f7cad`, aktivace `fcbc23d`, obě CI,
živé průchody třemi rolemi a úklid prošly. [Důkazy](PROJECT_STATUS.md).

Retence potvrzení je ve vývoji dokončená: klient `079d053`, cutover a úklid
`9b748d7`, obě CI a živé testy osmi cest prošly. Nové legacy klíče se odmítají;
DEV plánovač běží denně 02:15 UTC, nejvýše 500 receipt/běh. První zkouška
odstranila 1 prošlý testovací receipt, opakování 0; všech 14 platných zůstalo.
Sedmidenní okno nemění ostatní 60denní požadavky mazání účtu; samotný account
deletion worker zůstává samostatným otevřeným milníkem. [Důkazy](TESTING.md#retention-rollout).
Celý milník serverové brány ještě hotový není; metriky se tímto podkrokem nemění.

1. **R1/R3 rozhodnuto:** celé A0–A3 i B1–B4 před MVP; nepřečtené první jen
   v Nejblíž. Top/Končící/Sledované zachovají vlastní řazení. R2 schválené: poslední bod otevřené aplikace s upozorněním, jinak výzva k poloze.
   [Etapy a kontrolní brány](FEED_IMPLEMENTATION_STAGES.md).
2. A0 lokálně dokončená: celý detail, 204 Flutter testů a analyzátor prošly.
   A0 nasazená na DEV z `b56fbbe` po CI `41189106879`. A1 lokálně dokončený:
   deset testů a 24 měření. [Kontrakt, výsledky a meze](FEED_A1_RESULTS.md).
   Progresivní směr následně schválený; serverové jádro a klientský koordinátor
   připravené a lokálně ověřené. [Stav a nákladový problém](FEED_PROGRESSIVE_PLAN.md).
   Sdílený index byl následně schválený pro lokální návrh a ověření; hotovo:
   [model, měření a hranice](FEED_BLOCK_INDEX_PLAN.md). Další krok před napojením:
   R4 a lokální historie/GC jsou doplněné ([ověření](FEED_INDEX_RETENTION.md)).
   Následuje pokrytí všech zapisovacích cest, provozní rozpočet a migrační dry-run.
   Serverové mazání Shoutů má nasazenou DEV Function; aktivace webu a živá regrese
   ještě zbývají. Tři serverové cesty mají lokálně ověřené skládání s indexem;
   [konkrétní stav zápisových cest](FEED_WRITER_INTEGRATION.md).
   Živý feed je původní; nové sbírky/backfill nejsou tímto schválené.
3. Po kontrolní bráně A1 dokončit schválené prostorové načítání (A2), ruční
   obnovu a regresi (A3). Zachovat současné filtry, živé interakce, čtyři řazení
   a Business výjimky; žádné tiché omezení celého okolí na 50.
4. Dokončit B1–B4 před veřejným MVP: přečtení, synchronizaci, osobní pořadí
   a číslovaný indikátor. Expozice, retence a nákladové limity mají vlastní brány.
5. Po ověření dotčených toků uzavřít přímé klientské obsahové zápisy v Rules.
   Osobní metadata potřebují soukromá oprávnění; veřejné MVP čeká na celé B.

Hlášení obsahu je ve vývoji hotové: operace/klient `79082d8`, aktivace `be5a88f`,
obě CI a živé testy všech tří cílů, duplicity, cooldownu, moderační fronty i úklidu
prošly. Celý milník serverové brány zůstává otevřený do dokončení bodů výše.

Serverové podkroky rozpracovávají existující milník. Read/refresh UX je nový
požadavek z 31. října, který vlastník celý zařadil před MVP;
nesmí být považovaný za již implementované chování.
[Úplná kritéria serverové brány](MVP_SERVER_PLAN.md#gateway).
Vývojové i produkční rollouty mají od 30. října trvalý souhlas po úspěšném CI
přesného commitu a splnění pravidel vydání; nevyžadují nový dotaz. První veřejné
vydání nadále vyžaduje dokončené MVP. [Podmínky](RELEASING.md#trvaly-souhlas-s-rollouty).

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
`docs/MOBILE_DISTRIBUTION_PLAN.md`. Navazující Business etapa zachovává
záměr předplatného, otevřené rozhodnutí o placeném dosahu a Founder
zvýhodnění, platební integraci, fakturaci a důvěryhodné statistiky propagace
podle `docs/BUSINESS_MONETIZATION.md`. Business tokeny ani jejich nákup a
čerpání se neplánují. Ověření firmy přes
registry bylo naopak výslovně zrušeno; webové MVP počítá s ruční aktivací.

## Další otevřené oblasti

- [Produkce, App Check, antispam, moderace, retence, monitoring a závěrečná kontrola](MVP_SERVER_PLAN.md).
- [Produktové, grafické, překladové a Business podúkoly včetně všech původních checkboxů](BACKLOG.md).
- [Prezentační web a www přesměrování](BACKLOG.md#prezentační-web-před-mvp).
- [Povinná předstartovní brána](LAUNCH_READINESS.md).
- [Význam štítků a historická rozhodnutí](archive/README.md).

## Údržba dokumentace

TODO zachovává priority a souhrn milníků. Aktuální commit, nasazené verze,
potvrzené výsledky a další krok aktualizovat v PROJECT_STATUS.md. Podrobné
požadavky patří do BACKLOG.md a MVP_SERVER_PLAN.md; technické důkazy do TESTING.md
a WEB_ENVIRONMENTS.md. Archivní snapshot nepřepisovat. Starý neúspěšný pokus
ani připravený kód nesmějí být zaměněné za současné úspěšné nasazení.
