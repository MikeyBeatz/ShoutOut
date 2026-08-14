# Dokumentace ShoutOut

Tato složka je hlavní rozcestník produktové a provozní dokumentace projektu.

## Současná implementace

- [Architektura](ARCHITECTURE.md) – hranice systému, moduly, stav, role,
  zabezpečení a nedokončená automatizace.
- [Produktové toky](PRODUCT_FLOWS.md) – skutečné chování registrace, feedu,
  Business účtu, oznámení a moderace.
- [Obrazovky a navigace](UI_SPECIFICATION.md) – rozložení, hlavní komponenty,
  stavy a ovládací prvky klienta.
- [Datový model](DATA_MODEL.md) – kolekce Firestore, vazby, vlastnictví a
  atomické invarianty.
- [Vývojové prostředí a nasazení](SETUP_AND_OPERATIONS.md) – Firebase,
  Geoapify, App Check, testy, Hosting, Android a rekonstrukce od nuly.
- [Testovací strategie](TESTING.md) – automatické vrstvy a povinná ruční
  regresní matice pro účty, feed, Business, oznámení a moderaci.
- [Design archiv](../design/README.md) – logo, barvy, písmo, splash, avatary a
  jejich mapování na runtime assety.
- [Promo balíček](../promo/README.md) – přenositelné marketingové podklady;
  screenshoty jsou verzovaný vizuální snapshot, ne technický zdroj pravdy.
- [Vývojové nástroje](../tools/README.md) – seedování, role, migrace, opravy dat
  a Firestore Rules testy.

## Plánované a specializované oblasti

- [TODO](TODO.md) – jediný projektový backlog a pořadí další práce. Popisuje
  budoucí stav, nikoli automaticky současnou funkčnost.
- [Připravenost ke spuštění](LAUNCH_READINESS.md) – společná předstartovní brána
  pro produkci, distribuci, bezpečnost, právo, testování a provoz.
- [Mobilní testování, distribuce a technický rozpočet](MOBILE_DISTRIBUTION_PLAN.md)
  – ověřený postup pro Google Play, cloudový Mac, TestFlight a veřejné vydání
  včetně Firebase, domény, nákladů a požadavků na skutečná zařízení.
- [Business monetizace](BUSINESS_MONETIZATION.md) – jednotný návrh nákupů,
  tokenů a placených funkcí.
- [Ověření business účtů](BUSINESS_VERIFICATION.md) – registrační a ověřovací
  proces business účtů.
- [Interní moderace](INTERNAL_MODERATION.md) – role, pravomoci, postihy a audit.
- [Napojení Firebase Storage](FIREBASE_STORAGE_SETUP.md) – postup aktivace po
  přechodu na placený plán.

## Zdroj pravdy

Při rekonstrukci začněte kořenovým `README.md`, pokračujte architekturou,
produktovými toky, datovým modelem a provozním runbookem. `firestore.rules`,
`storage.rules`, `firestore.indexes.json`, implementace v `lib/` a automatické
testy jsou konečným zdrojem technické pravdy. Dokumentace vysvětluje jejich
význam a požadovaný výsledek; backlog zachycuje pouze to, co ještě zbývá.

## Lokální dokumenty

Složka `local/` je ignorovaná Gitem. Obsahuje neveřejné pracovní dokumenty a
dočasné údaje pro vývojový projekt, například přehled testovacích účtů nebo
interní marketingový plán. Testovací účty se před vytvořením produkčního
prostředí odstraní a lokální přístupové údaje se nesmějí převzít do produkce.
