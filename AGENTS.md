# ShoutOut – pokyny pro AI agenty

## Základní pravidlo

- Nevymýšlej si stav projektu. Nejdřív jej ověř v kódu, konfiguraci, testech,
  dokumentaci nebo dostupném prostředí.
- Jasně rozlišuj potvrzený fakt, pravděpodobnou příčinu a návrh.
- Když odpověď nelze bezpečně zjistit a volba by podstatně změnila výsledek,
  stručně se zeptej uživatele.

## Zdroje pravdy

- Za skutečné chování považuj aktuální kód a konfiguraci; dokumentace může být
  zastaralá a při rozporu ji oprav.
- Při navazování nejdřív přečti `docs/PROJECT_STATUS.md` a `docs/TODO.md`.
  Ostatní dokumenty vyhledej přes [hlavní rozcestník](docs/README.md).
  Podrobné checkboxy jsou v `docs/BACKLOG.md`, serverové požadavky a kritéria
  dokončení v `docs/MVP_SERVER_PLAN.md`. Archiv v `docs/archive/` zachovává
  historii; jeho staré stavy nejsou důkaz současného chování nebo nasazení.
  Architekturu a provozní postupy ověřuj v
  `docs/ARCHITECTURE.md` a `docs/SETUP_AND_OPERATIONS.md`.
- Před změnou vyhledej existující implementaci, testy a podobné vzory. Nedoplňuj
  nové role, limity, ceny, oprávnění ani produktová pravidla bez podkladu.

## Práce se změnami

- Před úpravami nejdřív ověř stav a předlož konkrétní rozsah změny uživateli
  ke schválení. Do té doby prováděj jen průzkum a kontroly bez změny zdrojů.
  Pokud uživatel konkrétní rozsah už výslovně schválil, pokračuj v něm bez
  opakovaného dotazu; při podstatném rozšíření si vyžádej nový souhlas.
- Zachovej nesouvisející uživatelské změny a upravuj jen rozsah aktuálního úkolu.
- Diagnózu bez výslovné žádosti automaticky neměň na implementaci.
- Při změně chování aktualizuj příslušný dokument a stav v `docs/TODO.md`.
  Připravený kód, výsledky kontrol, skutečné nasazení a další krok stručně
  rozlišuj v `docs/PROJECT_STATUS.md`; dlouhou historii do přehledů nepřidávej.
- Změnu ověř přiměřeným testem, analyzátorem nebo sestavením a uveď, co bylo a
  nebylo ověřeno. Úspěch netvrď bez důkazu.
- Firebase Hosting, pravidla, Functions, data ani jiné externí prostředí
  nenasazuj bez výslovného souhlasu uživatele. Vždy uveď přesný cíl nasazení.
- Od 30. října 2026 uživatel předem schvaluje další rollouty do vývoje
  `shoutout-dev-46c81` i produkční aplikace `go.shoutout-app.eu`
  (projekt `shoutout-production-a1b34`, Hosting site `shoutout-go-a1b34`),
  pokud úspěšně prošlo CI pro přesný nasazovaný commit a platná pravidla vydání.
  V tomto rozsahu se na souhlas s každým rolloutem znovu neptej. Před nasazením
  ověř commit, výsledky CI, odpovídající artefakt a přesný cíl; po nasazení
  ověř skutečný výsledek. Podrobnosti a hranice jsou v
  [RELEASING](docs/RELEASING.md#trvaly-souhlas-s-rollouty).
  První veřejné vydání vyžaduje dokončené MVP a splněnou startovní bránu;
  produkci nadále vydávej z čistého označeného commitu v `main`.
  Souhlas s rolloutem sám nemění pravidla pro
  schvalování implementace, sloučení do `main` a vydávání tagů.
  Uživatel upřesnil, že nová produkční a jiná podstatná rozhodnutí chce
  nadále schvalovat. Trvalý souhlas pokrývá rutinní provedení schváleného
  postupu po úspěšných kontrolách; nové rozhodnutí jím nenahrazuj.

## Výběr změn a publikování

- Před prací s větvemi, vydáním nebo nasazením si přečti
  [docs/RELEASING.md](docs/RELEASING.md). Technické příkazy a prostředí ověř
  také v [docs/WEB_ENVIRONMENTS.md](docs/WEB_ENVIRONMENTS.md).
- Samostatné úkoly vyvíjej v samostatných větvích `feature/<nazev>` nebo
  `fix/<nazev>`. Do `main` patří jen otestované změny schválené uživatelem.
  Rozpracované a neschválené úkoly neslučuj do vydávané verze.
- Před vytvořením nebo přepnutím větve zkontroluj pracovní strom. Existující
  změny na `main` automaticky necommituj, nemaž ani nepřesouvej; jejich
  rozdělení a převod do větví nejdřív navrhni uživateli.
- Produkci sestavuj z konkrétního schváleného commitu v `main`, označeného
  verzí `vX.Y.Z`, a z čisté pracovní kopie včetně kontroly nesledovaných souborů.
  Před nasazením uveď verzi, úplný commit SHA, výsledky kontrol a přesný cíl.
- Souhlas s lokální implementací nebo vývojovým nasazením neopravňuje
  k produkčnímu nasazení. Commit, push, sloučení a vytvoření či publikování tagu
  prováděj jen v uživatelem výslovně schváleném rozsahu.
- Ověř, které pojistky jsou skutečně implementované. Dokumentované pravidlo
  není důkaz automatického vynucení v CI nebo nasazovacím skriptu.

## Komunikace

- Piš uživateli česky, stručně a konkrétně.
- Přiznej nejistotu a chybějící podklady. Pokud děláš odhad, označ jej jako odhad.
- Po dokončení shrň výsledek, ověření a případný zbývající krok.
