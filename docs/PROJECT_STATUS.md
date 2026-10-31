# ShoutOut – aktuální stav pro navázání práce

Aktualizováno 31. října 2026. Aktuální plánovací práce je ve větvi
`fix/shout-full-detail`; navazuje na dokončenou retenci
`feature/operation-retention-cleanup`, ověřené CI `079d053`, klientskou retenci
`e42ffbd`, uzavřené živé mazání (`c65338d`), obsahová hlášení
(`c42ed60`) a obnovené metriky postupu (`dd94cc6`).
Hosting i Function ukládání byly po souhlasu nasazené 29. října a živé testy
prošly oběma rolemi včetně úklidu. Obsahová hlášení jsou také nasazená a ověřená
včetně duplicity, cooldownu, moderační fronty a úklidu. Nové mazání komentářů
je lokálně otestované, nasazené a živě ověřené moderátorem, Business i běžným
účtem včetně úklidu. Sedmidenní retence potvrzení je nyní ve vývoji dokončená;
vlastník zvolil celý nový feed před MVP, unread-first pouze v Nejblíž.
R2 o poloze se rozhodne před A2. [Etapy a brány](FEED_IMPLEMENTATION_STAGES.md).
A0 je lokálně hotová: plný detail a zachovaný krátký náhled feedu.
204 Flutter testů a analyzátor prošly. Commit/CI a DEV nasazení se ověřují
samostatně; aktuálně doložený živý web zůstává `079d053`.
Další krok A1: lokální syntetický prototyp a kontrakt stránek; před serverovým
A2 předložit variantu, měření, limity a indexy. [Analýza](FEED_READ_REFRESH_PLAN.md).
Kompatibilní serverová vrstva i klientské časové klíče jsou nasazené z čistého
`079d053d24fe04705d13baad7f8307bd25848094` po úspěšném CI `41136744088`.
Nejdřív všech osm Functions, potom Hosting; všechny ACTIVE, původní provozní
limity a HTTP 401 bez App Check ověřené. HTML/JS/konfigurace odpovídají buildu.
Běžný účet ověřil publikaci, komentář, reakce, záložku a mazání; Business
soukromou odpověď a hlášení. Právě 12 receipt má `keyVersion: 1` a přesně
sedmidenní serverové deadline. Testovací obsah/report/notifikace jsou uklizené.
Cutover `9b748d7d9698f4ef99b2ec718180f338ea979da6` prošel úplným CI
`41139730936` (4 min 40 s, 44 unit / 129 integrací / 20 tools a Flutter/build).
Z čistého zdroje jsou nasazené všechny osm operací bez nových legacy klíčů,
potom `cleanupOperationReceipts`. Denní DEV job je ENABLED, 02:15 UTC,
nejvýše 500 receipt/běh, max. 1 instance; IAM je neveřejné a bez Auth vrací 403.
Živá záložka po cutoveru prošla 0 → 1 → 0 se dvěma dalšími timed receipt.
První ruční běh odstranil 1 izolovaný prošlý receipt a zachoval 14 platných;
opakování odstranilo 0 a všech 14 opět zachovalo. Testovací obsah je uklizený.
Po úklidu se nesmí znovu povolit nový legacy formát; rollback musí zachovat
odmítání starých klíčů. [Důkazy a návrat](TESTING.md#retention-rollout).
Nové CI prošlo dvakrát; druhý běh 3 min 14 s, npm i emulator cache hit potvrzené.
[Podrobnosti CI](TESTING.md#ci-reliability).

## Jak přehled používat

Před pokračováním ověřit `git status`, větev, kód a konfiguraci. Tento soubor
je stručná orientace, nikoli náhrada důkazů nebo oprávnění k nasazení.
[TODO](TODO.md) určuje priority, [BACKLOG](BACKLOG.md) obsahuje všechny původní
checkboxy a [serverový plán](MVP_SERVER_PLAN.md) zachovává podrobné požadavky.
Staré neúspěšné pokusy v [archivu](archive/README.md) nejsou aktuální stav.

## Poslední ověřené nasazení

| Položka | Stav |
|---|---|
| Vývojový projekt i Hosting site | `shoutout-dev-46c81` |
| Vývojová aplikace | https://shoutout-dev-46c81.web.app |
| Zdroj webu | `079d053d24fe04705d13baad7f8307bd25848094` |
| Hosting verze | `02cdb989d4f18ee2` |
| Release / čas UTC | `1793399239632000` / `2026-10-30T22:27:19.632Z` |
| Starší Hosting verze | `8d7e3f3fed920529` má legacy klienta; po cutoveru se nesmí samostatně vrátit. |
| Zdroj aktuálních Functions | `9b748d7d9698f4ef99b2ec718180f338ea979da6`, CI `41139730936` |
| Ověření | Osm callable + soukromý plánovač ACTIVE, limity/401/403 ověřené; všech 8 cest, 14 timed receipt, úklid a bezpečné opakování jobu. |

Produkční aplikace dosud nemá první release. Připravená doména
`go.shoutout-app.eu` a site `shoutout-go-a1b34` jsou v projektu
`shoutout-production-a1b34`, který sdílí s prezentací na `shoutout-app.eu`.
Vývojové změny nebyly nasazené do produkce ani sloučené do `main`.
Podrobnosti a historie verzí: [WEB_ENVIRONMENTS](WEB_ENVIRONMENTS.md).

<a id="serverova-brana"></a>

## Serverová brána – přesný stav částí

| Operace | Kód a testy | Vývojové nasazení a živý test |
|---|---|---|
| Vytvoření Shoutu | Hotovo | Hotovo; `createshout-00001-zik` |
| Veřejný komentář a odpověď | Hotovo | Hotovo; `createcomment-00001-lep` |
| Soukromá odpověď | Hotovo | Hotovo; `createprivatereply-00001-baw` |
| Palce na Shoutu | Hotovo | Hotovo; `toggleshoutreaction-00001-lek` |
| Palce na komentáři | Hotovo | Hotovo; `togglecommentreaction-00001-dit` |
| Uložení/odebrání Shoutu | Hotovo; operace/klient `5fceccb`, aktivace `02b8b28`, obě CI prošla | Hotovo; `toggleshoutsave-00001-fal`, běžný i Business účet, seznam/detail a úklid ověřené. |
| Hlášení Shoutu, komentáře a soukromé odpovědi | Hotovo; `79082d8` i aktivace `be5a88f` prošly CI | Hotovo; `createcontentreport-00001-yas`, 3 cíle, duplicita 409, cooldown 429, moderační UI a úklid. |
| Mazání komentářů a dekrement parentu | Operace `34f7cad`, aktivace `fcbc23d`; obě CI prošla | Hotovo; `deletecomment-00001-zuc`, tři role, počet 3 → 2 → 1 → 0, právě 3 receipt a úklid. |
| Sedmidenní retence – serverový základ | `079d053`, poté cutover `9b748d7`; obě CI prošla | Nové legacy klíče se nepřijímají; všechny Functions ACTIVE. |
| Klientské časově omezené klíče | Osm operací; čas z Auth, immutable payload, očekávaný účet a 7 jazyků | Nasazené; všech osm cest živě ověřených oběma účty včetně úklidu. |
| Zákaz nových legacy klíčů a dávkový úklid | Hotovo; nejvýše 500 receipt/běh, checkpoint a CAS | Denní DEV plánovač aktivní; 1 prošlý testovací receipt odstraněný, opakování 0, 14 platných zachováno. |

Osm nasazených Functions používá Node.js 22, `europe-west3`, 256 MiB, 15 s,
min. 0 / max. 1 instanci a concurrency 1. Callable vyžadují Auth a App Check.
Osm odpovídajících klientských přepínačů je v `config/dev.json` zapnutých;
nasazený web používá všech osm. Produkční konfigurace tyto serverové cesty nezapíná.
Přepínač `serverShoutSaves` má výchozí `false`; vývojový web jej má aktivní,
produkční konfigurace jej nezapíná.
Nový `serverContentReports` je výchozí `false`; vývojový web jej má aktivní.
Produkční konfigurace jej nezapíná.
Hlášení účtů a technických chyb tento přepínač neovládá.

Reakce byly ověřené běžným i Business účtem včetně přidání, změny, odebrání,
receipt, limitů a oznámení. Oprava detailu ověřila 0 → 1 → 0 také při externím
smazání komentáře bez obnovení stránky. Testovací komentáře a čistě testovací
oznámení jsou odstraněné, dočasné Shouty mají `deleted`; původní Test Shout je
zachovaný. Platné idempotentní receipt zůstaly zachované; sedmidenní retence
a denní úklid jsou nyní ve vývoji ověřené, viz výše.
Ukládání prošlo vlastním uchovaným Shoutem i cizím aktivním Shoutem. Čtyři
nové receipt a společné rate eventy souhlasí; obě záložky jsou odstraněné,
čítače zpět na 0, dočasný Shout má `deleted` a původní Test Shout zůstal zachovaný.

Přímé zápisy v Rules ještě nejsou uzavřené. Celý milník serverové brány tedy
není hotový. Mazání komentářů i běžné obsahové čítače jsou ve vývoji ověřené;
chybí prostorový feed a uzavření přímých zápisů.
Úplná kritéria jsou
v [MVP_SERVER_PLAN](MVP_SERVER_PLAN.md#gateway).

## Poslední ověření a důkazy

- Klient časově omezených operací: šest cílených testů gateway, dva překladové
  testy, čistá analýza/formát, všech 202 Flutter testů a release build/manifest prošly.
  Backend navíc přijímá a ověřuje očekávaný účet u publikace Shoutu, komentáře
  a soukromé odpovědi: 41 unit / 123 emulatorových testů prošlo.
  CI `41097603906` na `aeeaec8` selhalo v původním souběžném report testu
  (2 ze 3 stejných pokusů uspěly). Přidaná diagnostika nemění očekávání;
  `89247e9` prošel [CI `41098701651`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41098701651).
  Příčina prvního neúspěchu nebyla potvrzená. Konečný klientský commit musí
  před rolloutem projít vlastním CI; úspěch staršího commitu jej nenahrazuje.
  U `c3ad17dafd916915c0af7e01e935fb61466ec7c7` v CI `41100166067` má
  dokončený log jobu `124215878506` všech 202 Flutter / 41 unit / 123 emulatorových
  / 20 tools testů a build zelené (log skončil v 17:39:49 UTC). Run/check/suite
  metadata ale zůstala `in_progress` bez conclusion a jobs API vracelo 502/504.
  Zrušení bylo odmítnuté jako již dokončený běh; attempt 2 následně selhal při
  downloadu emulatoru. Attempt 4 prošel. Finální `079d053` prošel vlastním CI
  `41136744088` a kompatibilní fáze je z něj nasazená, viz aktuální stav výše.

- První serverová vrstva retence: Functions lint, 40 unit testů a 123
  emulatorových (65 Rules + 58 serverových) prošlo. Nové časově omezené
  klíče jsou ošetřené ve všech osmi operacích; opakování po deadline odmítne
  server i po fyzickém odstranění receipt. Původních 119 scénářů zůstalo zelených.
  Balení modulu a lokální export handleru ověřené. Flutter klient se v tomto
  kroku nemění; CI a nasazení kompatibilní vrstvy teprve následují.

- Lokální mazání komentářů 30. října: 194 Flutter, 35 Functions unit,
  20 tools a 119 emulatorových testů (65 Rules + 54 serverových) prošlo;
  čistá analýza/formát, Functions lint, release build dev a kontrola manifestu.
  Optimalizace čtení rolí prošla osmi cílenými transakčními testy; jejich
  následný CLI shutdown timeout je rozlišený v [TESTING](TESTING.md).
  Export/balení, region/limity a lokální handler bez Auth/App Check ověřené.
  [CI `41090758502`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41090758502)
  pro `34f7cade0489e6fe28811cd88693edc2ea0e619c` prošlo. Po výslovném souhlasu
  je Function nasazená (`deletecomment-00001-zuc`), skutečné limity a HTTP 401
  bez App Check ověřené. Lokální aktivace prošla 19 cílenými Flutter a 20 tools
  testy. Aktivace `fcbc23d58bfd94498131a126059fe58b645c79a4` prošla
  [CI `41091651584`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41091651584),
  release build/manifest i Hosting otisky prošly. Živé mazání dosud neověřené.

- Lokální hlášení obsahu: 189 Flutter testů, 32 Functions unit testů, Functions
  lint, 19 testů nástrojů a 111 emulatorových testů (65 Rules + 46 serverových).
  Ověřený export/balení, souběh, idempotence po moderaci, soukromí, schémata
  a sdílené limity. Čistá analýza/formát a release build dev prošly. [CI `40921153845`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40921153845)
  pro `79082d8c3796b0e5f18335be975fe9f2bbf5a576` prošlo; Function je aktivní,
  limity ověřené a HTTP požadavek bez App Check vrací 401.
- Aktivace `be5a88f` prošla [CI `40922593743`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40922593743).
  Živě prošly 3 reporty/receipt, duplicita bez zápisu, cooldown 429 a úspěch
  po vyčkání. TestModerator viděl 3 případy a jejich detaily. Úklid odstranil
  7 testovacích dokumentů a parent označil `deleted` s čítačem 0; receipt zůstaly.
- Klient ukládání 29. října: 181 Flutter testů, čistá analýza a formát,
  18 testů vývojových nástrojů, Functions lint a 29 unit testů, 104 emulatorových
  testů (65 Rules + 39 serverových), release build vývojového webu a příprava
  Functions artefaktu. [CI `40914821162`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40914821162)
  pro `5fceccb98f145174acd7917b26356d04e65604a1` prošlo.
- [CI aktivace `40916381788`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40916381788)
  pro `02b8b28` prošlo. HTML, JS i konfigurace nasazené verze mají shodné otisky
  s lokálním release buildem; živě ověřené byly záložky i plné serverové čítače.
- Lokální import exportu `toggleShoutSave` ověřil region/provozní limity a
  odmítnutí chybějící Auth nebo App Check přes handler; nejde o živý HTTP test.
- Serverová logika ukládání: lint, 29 unit testů a 104 emulatorových testů
  (65 Rules + 39 serverových), z toho 7 nových scénářů ukládání.
- [CI ukládání `40414165546`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40414165546) prošlo pro `cc62831`.
- Nasazená oprava detailu: 173 Flutter testů, analýza, formát, release build
  a [CI `40411478509`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40411478509).
- Webové nástroje: 17 testů při dokončení komentářových reakcí.
- Manuální a databázové důkazy jsou v [TESTING](TESTING.md); limity a známá
  provozní omezení v [SETUP_AND_OPERATIONS](SETUP_AND_OPERATIONS.md).

## Další konkrétní krok

Navázat retencí receipt/mazáním účtu. Vlastník 30. října schválil sedmidenní
okno bezpečného opakování jedné akce; dosavadní 60denní retence po smazání účtu
se nemění. Dokončit kontroly/CI klientského commitu a nasadit všech osm
kompatibilních Functions z téhož zdroje, teprve potom nový Hosting.
Vybraný zdroj je `c3ad17dafd916915c0af7e01e935fb61466ec7c7`, připravený také
v čistém detached worktree `build/operation-retention-deploy`; obsahový artefakt
a závislosti tam jsou připravené. Kořenový `build/web-dev` je release tohoto
zdroje a manifest prošel kontrolou pro `shoutout-dev-46c81`.
Další dokumentační commit není součástí tohoto zvoleného aplikačního zdroje.
Ověřit živé časové klíče, očekávaný účet a metadata/deadline, dokončit odmítání nových
legacy požadavků. Teprve potom uklidit legacy receipt a dokončit úklid.
Současný `legacyOperationKeysAccepted: true` je výslovně přechodný stav;
existující klienti se nesmějí rozbít a legacy receipt se nesmějí zatím mazat.
Samotné TTL nad současnými klíči nestačí. Produkční rozhodnutí se stále
předkládají vlastníkovi; rutinní vývojové rollouty mají trvalý souhlas po CI.

Mazání je uzavřené: TestModerator po novém otevření aplikace odstranil
testovací komentář bez postihu; Business a Bright_Otter_182 pak odstranili
vlastní komentáře automatizovaně ve fungující kartě `722303372`.
Právě tři receipt a odpovídající delete rate eventy souhlasí. Počet v detailu
šel bez obnovy 2 → 1 → 0; moderátorský krok snížil parent 3 → 2.
Dočasný parent má `deleted`, testovací report je odstraněný, komentáře žádné.
Receipt/rate eventy jsou zachované. Důkazy a poslední fixture state jsou
v TESTING.md a ignorovaném `build/comment-delete-live-state.json`.
Nejde o dokončení celého milníku důvěryhodné moderace ani serverové brány.
Průzkum
30. října nenašel další běžnou webovou mutaci těchto čtyř obsahových čítačů
mimo připravené serverové cesty; staré větve zápisů stále chrání přepínače,
Rules se dosud neuzavírají.
Při čekání na ruční průchod lokální emulatorová zkouška doložila, že prosté
mazání receipt umožní opětovné provedení starého požadavku. Bezpečný návrh
retence a schválené sedmidenní okno jsou v [DATA_MODEL](DATA_MODEL.md#retence-potvrzení-operací--ověřený-problém-a-další-návrh).
Ukládání i hlášení drží retry klíče pouze v paměti relace; obnovení stránky je
nezachová. Retence receipt je ve vývoji uzavřená; zbývá prostorový feed a
závěrečné uzavření přímých zápisů v Rules.

## Rozhodnutí, nejistoty a hranice oprávnění

### Další krok – prostorový feed

**Aktualizace 31. října:** vlastník dodal nový read/refresh požadavek.
Po následné diskusi byl připravený [etapový návrh R1–R3](FEED_IMPLEMENTATION_STAGES.md).
Vlastník v R1 vybral A0–A3 i B1–B4 celé před MVP, v R3 unread-first pouze
v Nejblíž. Top/Končící/Sledované zachovají vlastní řazení. R2 odložil před A2.
A0 lokálně dokončená; A1 může pokračovat bez cloudových změn. Po výsledku A1
předložit serverové dotazy, indexy a limity. Expozice, retence, synchronizace,
polling a nízké hodnocení mají brány před příslušnou etapou B.
Požadavek je zaevidovaný jako jeden nový otevřený backlogový úkol (107/156);
24 milníků MVP se nemění. Původní zadání je zachované a prolinkované.

Pořadí vychází z prvního zbývajícího bodu TODO a kritérií serverové brány.
`lib/src/home.dart::_startFeedListeners` nyní načítá poslední globální stránku
aktivních Shoutů podle createdAt; radius, kategorie a řazení se použijí až
v `lib/src/feed.dart`. Starší místní Shout proto může vypadnout kvůli novějším
vzdáleným záznamům. Navazující práce:

1. Ověřit pokrytí existujících dat důvěryhodným geohashem a stávající chování
   bez polohy, změny radiusu/kategorie, blokací a všech čtyř řazení.
2. Připravit serverové prostorové dotazy a kurzory s omezenou velikostí stránky
   i skenování; zachovat produktové filtry a limit 50. Řešit hranice buněk,
   duplicity a neplatný kurzor bez globálního listeneru či neomezených čtení.
3. Ověřit scénář s více než 50 novějšími vzdálenými záznamy a starším místním
   Shoutem, přechody stránek bez duplicit a živé reakce/čítače na načtených kartách.
4. Napojit klienta přes vývojový přepínač, projít CI a živé ověření podle
   pravidel vydání. Produkční data ani Rules neuzavírat před regresí všech toků.

- Od 30. října jsou další vývojové i produkční rollouty předem schválené
  po úspěšném CI přesného commitu a splnění pravidel vydání. Nový dotaz na každý rollout není
  potřeba; kontrola artefaktu/cíle a živé ověření zůstávají povinné.
  [Rozsah a podmínky](RELEASING.md#trvaly-souhlas-s-rollouty).
  Vlastník výslovně potvrdil vývoj i produkční aplikaci. Tato změna
  nemění zbývající živé testy mazání ani nepovoluje libovolné zásahy do dat.
  Vlastník dále upřesnil, že nová produkční a jiná podstatná rozhodnutí chce
  nadále schvalovat; rutinní rollout po úspěšných kontrolách se znovu neptá.

- MVP je veřejný web pro běžné i Business účty. Mobilní vydání a placené
  Business předplatné jsou po MVP; ruční Business aktivace zůstává.
- První veřejné vydání má být `v1.0.0`, až bude MVP dokončené a otestované,
  se schváleným obsahem vydání a splněnou startovní bránou. Produkční rollout
  má za těchto podmínek trvalý souhlas; `main` a tag stále vyžadují odpovídající
  Git oprávnění podle [RELEASING](RELEASING.md).
- Vlastník stanovil přijatelný náklad nejvýše 5 000 Kč měsíčně a uvedl, že
  současné pojistky zatím stačí. Není to důkaz automatického finančního stropu;
  nastavení a zbývající požadavky ověřovat v [COST_SAFETY](COST_SAFETY.md).
- App Check v automatické relaci občas hlásil `appCheck/recaptcha-error`;
  ruční ověření vlastníkem umožnilo pokračovat. Ochrana nebyla vypnutá.
  Úplné vysvětlení klientské chyby ani globální enforcement Auth/Firestore
  nejsou uzavřené. Přihlášení pro živé testy může vyžadovat asistenci vlastníka.
- Při testu 29. října bylo přihlášení Business údaji z lokální evidence odmítnuté;
  příčina není potvrzená. Vlastník se přihlásil ručně a celý Business průchod
  potom prošel. Heslo se neměnilo; nevyvozovat bez další kontroly neplatnost účtu.
- Dokončení jednorázového srovnání starších čítačů/poloh není tímto přehledem
  potvrzené; [původní ruční krok zůstává evidovaný](MVP_SERVER_PLAN.md#data-reconciliation).
- Testovací údaje a hesla patří jen do ignorované složky `docs/local/`.
- Při hlášeních fungovala právě ručně ověřená uživatelova karta i pro další
  automatické kroky; původní karta neměla App Check token a vracela 401.
  Pro další testy používat aktuálně ověřenou relaci. Podrobnosti jsou v TESTING.md.
- Soukromý moderační detail nadále ukazuje „Neznámý (UID)“ bez přezdívky a
  u testovacích cílů chybí region. UID/text jsou správné; stávající UI a geografické
  omezení nebylo tímto rolloutem opravené. Nezaměňovat je za nový nehotový report tok.

## Údržba

Po změně uvést zvlášť připravený kód, úspěšné kontroly a skutečné nasazení.
Při novém release aktualizovat výše uvedený commit/verzi a odkaz na důkazy.
Do tohoto přehledu nepřidávat dlouhou chronologii; původní podrobnosti zůstaly
v nezměněném archivu a nové technické záznamy patří do příslušných dokumentů.
