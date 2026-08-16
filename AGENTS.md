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
- Produktové požadavky a stav práce ověřuj v `docs/TODO.md` a souvisejících
  dokumentech v `docs/`. Architekturu a provozní postupy ověřuj v
  `docs/ARCHITECTURE.md` a `docs/SETUP_AND_OPERATIONS.md`.
- Před změnou vyhledej existující implementaci, testy a podobné vzory. Nedoplňuj
  nové role, limity, ceny, oprávnění ani produktová pravidla bez podkladu.

## Práce se změnami

- Zachovej nesouvisející uživatelské změny a upravuj jen rozsah aktuálního úkolu.
- Diagnózu bez výslovné žádosti automaticky neměň na implementaci.
- Při změně chování aktualizuj příslušný dokument a stav v `docs/TODO.md`.
- Změnu ověř přiměřeným testem, analyzátorem nebo sestavením a uveď, co bylo a
  nebylo ověřeno. Úspěch netvrď bez důkazu.
- Firebase Hosting, pravidla, Functions, data ani jiné externí prostředí
  nenasazuj bez výslovného souhlasu uživatele. Vždy uveď přesný cíl nasazení.

## Komunikace

- Piš uživateli česky, stručně a konkrétně.
- Přiznej nejistotu a chybějící podklady. Pokud děláš odhad, označ jej jako odhad.
- Po dokončení shrň výsledek, ověření a případný zbývající krok.
