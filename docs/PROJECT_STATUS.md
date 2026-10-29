# ShoutOut – aktuální stav pro navázání práce

Přehled sestaven 29. října 2026. Kódový základ je commit
`cc62831c5fe999721b39a0ce9c1a2fe0a28ded5d` ve větvi `feature/server-shout-saves`.
Dokumentační větev `feature/docs-project-overview` na něj navazuje.
Provozní údaje níže jsou poslední ověřený stav z 26. října; tato reorganizace
neprovádí nové cloudové ověření, nasazení ani změnu dat.

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
| Zdroj webu | `987398f2f60f5375b0413402322ab829970bcff3` |
| Hosting verze | `a6756b787e4655de` |
| Release / čas UTC | `1793053435595000` / `2026-10-26T22:23:55.595Z` |
| Předchozí verze pro případ návratu | `3fc2f80232d34ff3` |
| Ověření | Otisky HTML, JS a konfigurace souhlasily; živé průchody a CI prošly. |

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
| Uložení/odebrání Shoutu | Jen serverová operace a testy v `cc62831` | Chybí export, balení, klient, přepínač, nasazení a živý test. |

Pět nasazených Functions používá Node.js 22, `europe-west3`, 256 MiB, 15 s,
min. 0 / max. 1 instanci a concurrency 1. Callable vyžadují Auth a App Check.
Pět odpovídajících klientských přepínačů je v `config/dev.json` zapnutých;
produkční konfigurace tyto serverové cesty nezapíná.
Ukládání v klientu stále používá původní Firestore transakci.

Reakce byly ověřené běžným i Business účtem včetně přidání, změny, odebrání,
receipt, limitů a oznámení. Oprava detailu ověřila 0 → 1 → 0 také při externím
smazání komentáře bez obnovení stránky. Testovací komentáře a čistě testovací
oznámení jsou odstraněné, dočasné Shouty mají `deleted`; původní Test Shout je
zachovaný. Idempotentní receipt zůstaly zachované; jejich retence je otevřená.

Přímé zápisy v Rules ještě nejsou uzavřené. Celý milník serverové brány tedy
není hotový. Chybí také serverové hlášení, zbývající změny čítačů včetně
mazání komentářů, retence receipt a prostorový feed; úplná kritéria jsou
v [MVP_SERVER_PLAN](MVP_SERVER_PLAN.md#gateway).

## Poslední ověření a důkazy

- Serverová logika ukládání: lint, 29 unit testů a 104 emulatorových testů
  (65 Rules + 39 serverových), z toho 7 nových scénářů ukládání.
- [CI ukládání `40414165546`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40414165546) prošlo pro `cc62831`.
- Nasazená oprava detailu: 173 Flutter testů, analýza, formát, release build
  a [CI `40411478509`](https://github.com/MikeyBeatz/ShoutOut/actions/runs/40411478509).
- Webové nástroje: 17 testů při dokončení komentářových reakcí.
- Manuální a databázové důkazy jsou v [TESTING](TESTING.md); limity a známá
  provozní omezení v [SETUP_AND_OPERATIONS](SETUP_AND_OPERATIONS.md).

## Další konkrétní krok

Navázat na `functions/toggle_shout_save.js`: doplnit callable export a balení,
klientské napojení, výchozí vypnutý přepínač a testy retry/realtime stavu.
Receipt vrací historický výsledek, který nesmí přepsat aktuální záložku a čítač.
Zachovat společný limit interakcí 120/h a odstup 1 s. Nasazení ukládání
nebylo schválené; pro konkrétní vývojový rollout získat samostatný souhlas.
Další práci seskupovat do souvisejících ověřitelných balíků.

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
- Dokončení jednorázového srovnání starších čítačů/poloh není tímto přehledem
  potvrzené; [původní ruční krok zůstává evidovaný](MVP_SERVER_PLAN.md#data-reconciliation).
- Testovací údaje a hesla patří jen do ignorované složky `docs/local/`.

## Údržba

Po změně uvést zvlášť připravený kód, úspěšné kontroly a skutečné nasazení.
Při novém release aktualizovat výše uvedený commit/verzi a odkaz na důkazy.
Do tohoto přehledu nepřidávat dlouhou chronologii; původní podrobnosti zůstaly
v nezměněném archivu a nové technické záznamy patří do příslušných dokumentů.
