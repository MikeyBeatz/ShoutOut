# Archiv projektové dokumentace

Archiv zachovává historii a původní požadavky. Není zdrojem aktuálního stavu.
Pro navázání začít v [PROJECT_STATUS](../PROJECT_STATUS.md) a [TODO](../TODO.md),
skutečnost ověřit v kódu, konfiguraci, testech a provozních důkazech.

## Úplný původní TODO před reorganizací 29. října 2026

- [TODO_2026-10-29.md](TODO_2026-10-29.md) je **nezměněná úplná kopie** původního TODO.
- Zdrojový commit: `cc62831c5fe999721b39a0ce9c1a2fe0a28ded5d`.
- Rozsah: **1 425 řádků, 97 962 bajtů**, včetně původních CRLF konců řádků.
- SHA-256: `3b0b96e495e7622f0487c907a8c37204061a6add65804dc8295319aaef0553ba`.
- Obsahuje všech původních **155 checkboxů (107 hotových, 48 otevřených)**,
  všechny textové poznámky, rozhodnutí, limity, čísla verzí i výsledky kontrol.
- Soubor nepřepisovat; `.gitattributes` chrání jeho bajty před převodem řádků Gitem.
  Případnou opravu aktuálního stavu zapsat do současné dokumentace.

## Úplné snímky před úklidem 3. listopadu 2026

Zdroj je commit `fc4c4ba`. Následující soubory zachovávají všechny původní
bajty, rozhodnutí, výsledky a tehdejší rozpory; nejsou aktuálním plánem:

- [TODO_2026-11-03.txt](TODO_2026-11-03.txt) – priority i nahromaděná historie před zkrácením.
- [PROJECT_STATUS_2026-11-03.txt](PROJECT_STATUS_2026-11-03.txt) – úplný stav včetně starších kapitol a důkazů.
- [MVP_SERVER_PLAN_2026-11-03.txt](MVP_SERVER_PLAN_2026-11-03.txt) – původní serverový plán před odstraněním neaktuálních pokynů.
- [Registr velikostí a SHA-256](snapshots.json) – kontroluje jej tools/check_docs.mjs.

Jde o plaintext, aby původní relativní odkazy v přesné kopii nevytvářely
falešnou aktuální navigaci. Význam tehdejších cest je relativní k původnímu
souboru v docs/. Snímky chrání `.gitattributes`; jejich obsah nepřepisovat.

## Snímky před souhrnnou revizí 27. listopadu 2026

Zdroj 0c81043eecf7139a839b07c93d48f1693c51ff16. Úplné původní souhrny včetně nahromaděných
checkpointů a jejich rozporů zůstávají zachované:

- [PROJECT_STATUS_2026-11-27.txt](PROJECT_STATUS_2026-11-27.txt).
- [TODO_2026-11-27.txt](TODO_2026-11-27.txt).

Nové souhrny mají jeden současný stav a odkazují na
[výsledek revize](../operations/MVP_COMPLETED_WORK_REVIEW_2026-11-27.md). Snímky chrání registr a .gitattributes;
nejsou aktuálními pokyny pro nasazení.

## Aktuální umístění informací z původního TODO

Před změnou metodiky stupnic 12. listopadu 2026 byly uloženy přesné snímky
[TODO](TODO_2026-11-12.txt) a [BACKLOG](BACKLOG_2026-11-12.txt) ze zdroje
`e8c835e496d0ae5c5ce8917f2cdb122690180c3a`. Zachovávají výchozích 9/24 a
107/157 i všechny tehdejší texty. Jejich bajty chrání registr snapshots.json;
nová metodika je v [PROGRESS](../PROGRESS.md), staré procento není aktuální stav.

| Původní oblast | Aktuální umístění |
|---|---|
| Pořadí práce, hranice MVP a 24 milníků | [TODO](../TODO.md) |
| Poslední kód, nasazení, ověření a další krok | [PROJECT_STATUS](../PROJECT_STATUS.md) |
| Všech 155 checkboxů | [BACKLOG](../BACKLOG.md), beze změny textu checkboxů a jejich stavů |
| Kontext otevřených checkboxových bloků | [BACKLOG](../BACKLOG.md), celé původní bloky |
| Podrobnosti uzavřených bloků | Tento úplný archiv; z BACKLOG na ně vedou odkazy. |
| Všech deset serverových/produkčních oblastí a kritéria dokončení | [MVP_SERVER_PLAN](../MVP_SERVER_PLAN.md) |
| Dřívější rozhodnutí o rozsahu, mobilním/webovém MVP a Business modelu | Úplný archiv, sekce Historie rozhodnutí o rozsahu |
| Dřívější pokusy App Check, rollbacky, commity, testy a dokončená práce | Úplný archiv; návazné důkazy také v [TESTING](../operations/TESTING.md) a [WEB_ENVIRONMENTS](../operations/WEB_ENVIRONMENTS.md) |
| Původní jednorázový ruční krok ve vývoji | [MVP_SERVER_PLAN](../MVP_SERVER_PLAN.md#data-reconciliation), stav výslovně k potvrzení |

Staré formulace „zatím vypnuté“, „nebylo nasazené“, „dnes nebyl spuštěn“ nebo
tehdejší počty testů platí pro popisovanou fázi. Nelze je bez další kontroly
přenést na současný provoz ani jimi přepsat novější ověřené výsledky.
Relativní archivní odkaz na mobilní plán zachovává pomocný rozcestník
[MOBILE_DISTRIBUTION_PLAN](MOBILE_DISTRIBUTION_PLAN.md).

## Nahrazené návrhy

- [Původní návrh A2](FEED_A2_PROPOSAL.md) – výslovně nahrazený úplný průchod
  okolí před první stránkou. Platný je [progresivní feed](../plans/feed/FEED_PROGRESSIVE_PLAN.md).
  Původní laboratorní limity nejsou schválené provozní limity.

## Význam štítků

- **MVP**: otevřená položka nebo podúkol blokuje veřejné webové vydání.
- **Po MVP**: zůstává plánovaná, ale neblokuje webové MVP.
- Dokončené položky se zpětně neštítkují. Nový otevřený checkbox musí mít
  zařazení; chybějící štítek je chyba evidence.
- Požadavky backlogu zůstávají v BACKLOG.md, jeho aktuální stav a procento
  generuje [jednotná evidence podúseků](../PROGRESS.md). Archivní kopie
  ani souhrny milníků se znovu nezapočítávají.
