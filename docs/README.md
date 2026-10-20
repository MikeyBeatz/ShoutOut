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
- [Prezentační web](PRESENTATION_SITE.md) – statická stránka na
  `shoutout-app.eu` a oddělení od webového MVP na `social.shoutout-app.eu`.
- [Připravenost ke spuštění](LAUNCH_READINESS.md) – společná předstartovní brána
  veřejné webové aplikace pro produkci, bezpečnost, právo, testování a provoz.
- [Mobilní testování, distribuce a technický rozpočet](MOBILE_DISTRIBUTION_PLAN.md)
  – navazující postup pro Google Play, cloudový Mac, TestFlight a mobilní vydání
  včetně Firebase, domény, nákladů a požadavků na skutečná zařízení.
- [Business monetizace](BUSINESS_MONETIZATION.md) – bezplatný základ webového
  MVP a otevřený návrh budoucího předplatného bez Business tokenů.
- [Ověření business účtů](BUSINESS_VERIFICATION.md) – současná ruční aktivace
  a otevřená kritéria kontroly před veřejným webem.
- [Interní moderace](INTERNAL_MODERATION.md) – role, pravomoci, postihy a audit.
- [Napojení Firebase Storage](FIREBASE_STORAGE_SETUP.md) – současná pravidla pro
  Business loga a přílohy hlášení chyb a příprava produkčního bucketu.
- [Vyhodnocení externích událostí](EXTERNAL_EVENTS_EVALUATION.md) – výběr zdroje,
  limity, licence a podmínky případného pilotu.
- [Model gamifikace](GAMIFICATION_MODEL.md) – oddělení karmy, předplatného,
  achievementů a kosmetických odměn.
- [Plán evropské ochranné známky](EU_TRADEMARK_PLAN.md) – rešerše, třídy,
  rozpočet a rozhodovací brána před podáním.

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
