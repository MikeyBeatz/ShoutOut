# Dokumentace ShoutOut

Tato složka je hlavní rozcestník produktové a provozní dokumentace projektu.

## Navázání práce

1. [Aktuální stav](PROJECT_STATUS.md) – kódový základ, poslední ověřené nasazení,
   hotové části, omezení a konkrétní další krok.
2. [TODO](TODO.md) – stručné pořadí práce a původních 24 milníků MVP.
3. [Podrobná evidence](BACKLOG.md) nebo [serverový plán](MVP_SERVER_PLAN.md) –
   otevřít jen podrobnosti relevantní pro vybraný úkol.

[Úplný archiv původního TODO](archive/README.md) zachovává všechna rozhodnutí,
požadavky a historii. Jeho kontrolní součet ověřuje zachování původního souboru;
staré provozní poznámky nejsou náhradou aktuálního stavu a kódu.

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
- [Pravidla vydávání](RELEASING.md) – větve, schvalování změn, konkrétní Git
  commit, verze a ruční kontroly před produkčním nasazením.
- [Oddělení webových prostředí](WEB_ENVIRONMENTS.md) – konfigurace, buildy,
  technické kontroly cíle nasazení a otevřené produkční kroky.
- [Testovací strategie](TESTING.md) – automatické vrstvy a povinná ruční
  regresní matice pro účty, feed, Business, oznámení a moderaci.
- [Design archiv](../design/README.md) – logo, barvy, písmo, splash, avatary a
  jejich mapování na runtime assety.
- [iOS launch screen assety](../ios/Runner/Assets.xcassets/LaunchImage.imageset/README.md)
  – pomocný návod Flutter šablony k výměně obrázků úvodní obrazovky iOS.
- [Promo balíček](../promo/README.md) – přenositelné marketingové podklady;
  screenshoty jsou verzovaný vizuální snapshot, ne technický zdroj pravdy.
- [Vývojové nástroje](../tools/README.md) – seedování, role, migrace, opravy dat
  a Firestore Rules testy.

## Plánované a specializované oblasti

- [TODO](TODO.md) – hlavní přehled priorit a milníků; podrobnosti jsou
  v [BACKLOG](BACKLOG.md) a [MVP_SERVER_PLAN](MVP_SERVER_PLAN.md).
- [Nová logika feedu, přečtení a refresh](FEED_READ_REFRESH_PLAN.md) – analýza
  zadání z 31. října 2026, návrh návazností na prostorové stránkování,
  nákladové varianty a rozhodnutí před implementací; obsahuje odkaz na úplné zadání.
- [Implementační etapy feedu](FEED_IMPLEMENTATION_STAGES.md) – všechny etapy před MVP.
  R3 schválené jen v Nejblíž; R2 a technická brána před A2. A0 lokálně hotová.
- [Prezentační web](PRESENTATION_SITE.md) – statická stránka na
  `shoutout-app.eu` a oddělení od webového MVP na `go.shoutout-app.eu`.
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

Při navazování začněte PROJECT_STATUS.md a TODO.md. Při rekonstrukci začněte
kořenovým `README.md`, pokračujte architekturou,
produktovými toky, datovým modelem a provozním runbookem. `firestore.rules`,
`storage.rules`, `firestore.indexes.json`, implementace v `lib/` a automatické
testy jsou konečným zdrojem technické pravdy. Dokumentace vysvětluje jejich
význam a požadovaný výsledek; backlog zachycuje pouze to, co ještě zbývá.

## Lokální dokumenty

Složka `local/` je ignorovaná Gitem. Obsahuje neveřejné pracovní dokumenty a
dočasné údaje pro vývojový projekt, například přehled testovacích účtů nebo
interní marketingový plán. Testovací účty se před vytvořením produkčního
prostředí odstraní a lokální přístupové údaje se nesmějí převzít do produkce.
