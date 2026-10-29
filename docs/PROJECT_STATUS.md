# ShoutOut – aktuální stav pro navázání práce

Aktualizováno 29. října 2026. Aktuální práce je ve větvi
`feature/server-content-reports`; navazuje na dokončené ukládání a jeho
provozní záznam `5208e58` ve větvi `feature/server-shout-save-client`.
Hosting i Function ukládání byly po souhlasu nasazené 29. října a živé testy
prošly oběma rolemi včetně úklidu. Function hlášení obsahu je nasazená ve vývoji;
klient je aktivní a živé ověření této nové části probíhá.

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
| Zdroj webu | `be5a88f58cbf88870ac5f90a81f088660eebbdaa` |
| Hosting verze | `884138efa765d64a` |
| Release / čas UTC | `1793295581345000` / `2026-10-29T17:39:41.345Z` |
| Předchozí verze pro případ návratu | `8abd91f97aada32f` |
| Ověření | Otisky HTML, JS a konfigurace souhlasily; CI prošlo, živá hlášení ještě nejsou uzavřená. |

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
| Hlášení Shoutu, komentáře a soukromé odpovědi | `79082d8` i aktivace `be5a88f` prošly CI | Function `createcontentreport-00001-yas` a web aktivní; Shout a duplicita ověřené, komentář/soukromá odpověď a fronta/úklid zbývají. |

Sedm nasazených Functions používá Node.js 22, `europe-west3`, 256 MiB, 15 s,
min. 0 / max. 1 instanci a concurrency 1. Callable vyžadují Auth a App Check.
Sedm odpovídajících klientských přepínačů je v `config/dev.json` zapnutých;
produkční konfigurace tyto serverové cesty nezapíná.
Přepínač `serverShoutSaves` má výchozí `false`; vývojový web jej má aktivní,
produkční konfigurace jej nezapíná.
Nový `serverContentReports` je výchozí `false`; vývojový web jej má aktivní.
Produkční konfigurace jej nezapíná.
Hlášení účtů a technických chyb tento přepínač neovládá.

Reakce byly ověřené běžným i Business účtem včetně přidání, změny, odebrání,
receipt, limitů a oznámení. Oprava detailu ověřila 0 → 1 → 0 také při externím
smazání komentáře bez obnovení stránky. Testovací komentáře a čistě testovací
oznámení jsou odstraněné, dočasné Shouty mají `deleted`; původní Test Shout je
zachovaný. Idempotentní receipt zůstaly zachované; jejich retence je otevřená.
Ukládání prošlo vlastním uchovaným Shoutem i cizím aktivním Shoutem. Čtyři
nové receipt a společné rate eventy souhlasí; obě záložky jsou odstraněné,
čítače zpět na 0, dočasný Shout má `deleted` a původní Test Shout zůstal zachovaný.

Přímé zápisy v Rules ještě nejsou uzavřené. Celý milník serverové brány tedy
není hotový. Chybí také serverové hlášení, zbývající změny čítačů včetně
mazání komentářů, retence receipt a prostorový feed; úplná kritéria jsou
v [MVP_SERVER_PLAN](MVP_SERVER_PLAN.md#gateway).

## Poslední ověření a důkazy

- Lokální hlášení obsahu: 189 Flutter testů, 32 Functions unit testů, Functions
  lint, 19 testů nástrojů a 111 emulatorových testů (65 Rules + 46 serverových).
  Ověřený export/balení, souběh, idempotence po moderaci, soukromí, schémata
  a sdílené limity. Čistá analýza/formát a release build dev prošly; CI konkrétního
  commitu před rolloutem ještě potvrdit. [CI `40921153845`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40921153845)
  pro `79082d8c3796b0e5f18335be975fe9f2bbf5a576` prošlo; Function je aktivní,
  limity ověřené a HTTP požadavek bez App Check vrací 401.
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

Vlastník 29. října výslovně schválil Function z `79082d8`, navazující otestovanou
aktivaci `serverContentReports`, vývojový Hosting i obsahová hlášení, moderační
frontu a úklid testovacích dat. Function je aktivní. CI aktivačního commitu
i Hosting rollout jsou hotové: [CI `40922593743`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40922593743)
pro `be5a88f` prošlo, otisky souhlasí. Dokončit živé testy.
Živě ověřit všechny tři druhy cílů, stávající moderační frontu, serverové snapshoty
soukromých zpráv, duplicitní hlášení a sdílený report limit. Následují zbývající
čítače včetně mazání komentářů.
Fixture „MVP hlaseni 29.10.“ s komentářem a soukromou odpovědí existuje;
po přerušení vypršel a je dostupný přes historii komentářů nebo autorovy
Expirované. Ruční hlášení Bright_Otter_182 prošlo ve 20:38 UTC (HTTP 200,
kanonický report/receipt, report count 1, parent beze změny). Duplicita ve 20:41 UTC
vrátila 409; report, receipt a rate dokument se nezměnily.
Původní automatická karta měla App Check MISSING a 401; ručně ověřená karta
funguje i při následném ovládání AI. Pokračovat v aktuální uživatelově kartě,
nikoli ve staré relaci. Příčina chyb reCAPTCHA v původní kartě není uzavřená.
Vlastník byl požádán o přepnutí ověřené karty na TestBusiness a Ctrl+R. Poté
nahlásit komentář, hned vyzkoušet soukromé hlášení před 60 s (429, bez zápisů)
a po cooldownu je dokončit. Nakonec ověřit moderační UI a uklidit fixture.
Ukládání ignoruje historický HTTP výsledek a drží retry klíč jen v paměti relace
domovské obrazovky; obnovení stránky jej nezachová. Limity jsou 120 interakcí/h
a odstup 1 s. Produkce, main ani Rules nebyly rolloutem změněné.

## Rozhodnutí, nejistoty a hranice oprávnění

- MVP je veřejný web pro běžné i Business účty. Mobilní vydání a placené
  Business předplatné jsou po MVP; ruční Business aktivace zůstává.
- První veřejné vydání má být `v1.0.0`, až bude MVP dokončené, otestované
  a výslovně schválené. `main`, tag a produkce vyžadují odpovídající souhlas
  podle [RELEASING](RELEASING.md); souhlas s vývojem je nenahrazuje.
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

## Údržba

Po změně uvést zvlášť připravený kód, úspěšné kontroly a skutečné nasazení.
Při novém release aktualizovat výše uvedený commit/verzi a odkaz na důkazy.
Do tohoto přehledu nepřidávat dlouhou chronologii; původní podrobnosti zůstaly
v nezměněném archivu a nové technické záznamy patří do příslušných dokumentů.
