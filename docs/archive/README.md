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

## Kde jsou informace po rozdělení

| Původní oblast | Aktuální umístění |
|---|---|
| Pořadí práce, hranice MVP a 24 milníků | [TODO](../TODO.md) |
| Poslední kód, nasazení, ověření a další krok | [PROJECT_STATUS](../PROJECT_STATUS.md) |
| Všech 155 checkboxů | [BACKLOG](../BACKLOG.md), beze změny textu checkboxů a jejich stavů |
| Kontext otevřených checkboxových bloků | [BACKLOG](../BACKLOG.md), celé původní bloky |
| Podrobnosti uzavřených bloků | Tento úplný archiv; z BACKLOG na ně vedou odkazy. |
| Všech deset serverových/produkčních oblastí a kritéria dokončení | [MVP_SERVER_PLAN](../MVP_SERVER_PLAN.md) |
| Dřívější rozhodnutí o rozsahu, mobilním/webovém MVP a Business modelu | Úplný archiv, sekce Historie rozhodnutí o rozsahu |
| Dřívější pokusy App Check, rollbacky, commity, testy a dokončená práce | Úplný archiv; návazné důkazy také v [TESTING](../TESTING.md) a [WEB_ENVIRONMENTS](../WEB_ENVIRONMENTS.md) |
| Původní jednorázový ruční krok ve vývoji | [MVP_SERVER_PLAN](../MVP_SERVER_PLAN.md#data-reconciliation), stav výslovně k potvrzení |

Staré formulace „zatím vypnuté“, „nebylo nasazené“, „dnes nebyl spuštěn“ nebo
tehdejší počty testů platí pro popisovanou fázi. Nelze je bez další kontroly
přenést na současný provoz ani jimi přepsat novější ověřené výsledky.
Relativní archivní odkaz na mobilní plán zachovává pomocný rozcestník
[MOBILE_DISTRIBUTION_PLAN](MOBILE_DISTRIBUTION_PLAN.md).

## Zachované pravidlo štítků

- **MVP**: otevřená položka nebo podúkol blokuje veřejné webové vydání.
- **Po MVP**: zůstává plánovaná, ale neblokuje webové MVP.
- Dokončené položky se zpětně neštítkují. Nový otevřený checkbox musí mít
  zařazení; chybějící štítek je chyba evidence.
- Celkové procento evidovaného backlogu se odvozuje pouze z kanonického
  BACKLOG.md. Archivní kopie a souhrny milníků se znovu nezapočítávají.
