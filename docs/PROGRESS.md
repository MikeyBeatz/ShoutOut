# Jak se počítá postup projektu

Metodika schválená 12. listopadu 2026. [TODO](TODO.md) ukazuje dvě stupnice;
[BACKLOG](BACKLOG.md) zachovává všechna původní zadání a checkboxy.
Strojovým zdrojem jejich stavů a metrik je [progress.json](progress.json).
Aktuální implementaci a nasazení nadále určuje [PROJECT_STATUS](PROJECT_STATUS.md),
veřejné vydání [startovní brána](LAUNCH_READINESS.md).

## Pevné váhy a podúseky

- Každý ze 24 MVP milníků má jednu stejnou váhu. Nezávisle má stejnou váhu
  každá ze 157 backlogových položek, včetně historicky samostatných vnořených
  checkboxů. Obě stupnice jsou oddělené pohledy, nesčítají se dohromady.
- Váha rodiče je technicky 10 000 bodů. Jeho podúseky si ji rozdělí; součet
  musí zůstat přesně 10 000. Žádný nový podúsek nepřidává rodiči další váhu.
- Procento = součet vah dokončených podúseků / součet vah všech rodičů × 100.
  Příklad: rodič se čtyřmi stejnými podúseky je po uzavření jednoho na 25 %;
  do celé MVP stupnice přispěje 25 % / 24, tedy přibližně 1,04 procentního bodu.
- Stejný úsek smí být jednou v MVP a jednou v backlogu, ale nikdy dvakrát
  uvnitř téhož pohledu. Historické vnořené checkboxy zůstaly samostatnými
  rodiči; nově jim nepřidělujeme opětovný kredit v nadřazených položkách.
- Váhy jsou evidence dokončení kritérií, **nikoli odhad času, ceny nebo
  procento připravenosti infrastruktury**. Délky práce se mezi úseky liší.
  Rozpad se plánuje před prací, nezpětně podle žádoucího procenta.

Při potřebě jemnějšího členění rozděl pouze zbývající nedokončenou váhu.
Hotové části a váhy zachovej. Skutečné přidání rozsahu může změnit celkový
jmenovatel a musí být výslovně popsané; neodstraňuj nesplněné podmínky, aby
stupnice rostla. Nový rozpad nepovoluje implementaci nebo nasazení daného úkolu.

## Co znamená hotovo

Úsek má stabilní ID, věcný název, fázi, stav, podklady a případné závislosti.
Samostatně se eviduje implementace, automatické ověření, nasazení a živá
akceptace. Hotová lokální implementace s CI tedy může posunout stupnici,
ale nezavře čekající nasazení ani celý nadřazený milník.

Uzavřený úsek potřebuje alespoň jeden existující místní podklad. Odkaz na CI
nebo commit může být navíc; vlastní nové souhrny nejsou důkazem samy pro sebe.
Kontrola umí odhalit chybějící soubor/kotvu, nikoli potvrdit pravdivost textu
nebo skutečný výsledek externího CI/nasazení. To musí ověřit řešitel úkolu.

Zpětný převod zachovává všech 107 původně hotových backlogových položek a
9 hotových MVP milníků podle [původního TODO](archive/TODO_2026-11-12.txt) a
[BACKLOG](archive/BACKLOG_2026-11-12.txt), zdroj e8c835e. Jde o převzatý stav,
ne nové testování všech historických funkcí. Nově jsou zapsané doložené části
účtového toku, serverových operací, feedu A/B, geografie, konfigurací a dalších
rozpracovaných oblastí. Neověřené části zůstávají otevřené.

## Postup při uzavření každého úseku

1. Ověř výsledek podle příslušného plánu, testu, přesného CI či živého průchodu.
2. V progress.json změň stav konkrétního úseku a doplň odkazy na důkazy.
   Při novém členění zachovej součet váhy a nezapočítej stejnou práci dvakrát.
3. Spusť `node tools/project_progress.mjs --write`. Aktualizuje oba pruhy
   v TODO, souhrn v BACKLOG, stavy rodičovských checkboxů/ikon a tabulky níže.
4. Spusť `node tools/check_docs.mjs` a `node tools/project_progress.mjs --check`.
   CI odmítne neplatná data, nesplněné závislosti nebo zastaralý výstup.
5. Do PROJECT_STATUS zapiš skutečný výsledek a další krok; procenta neopisuj
   ručně. Úplný milník se uzavře až po všech jeho úsecích.

Výpisy mají dvě desetinná místa a počet hotových úseků. Textový pruh má
40 polí, proto se políčko nemusí změnit po každém úseku; počet ano. Dokud
zbývá otevřená část, zaokrouhlení nesmí ukázat 100 %. Release gate platí
nezávisle na procentu. Původní skupiny 9 + 15 milníků v TODO se zachovávají
kvůli návaznostem; o aktuálním stavu rozhodují generované ikony a souhrn.

## Automaticky odvozený přehled

Implementace metodiky je uzavřená 17. listopadu 2026: zdroj
`dad4ecd4ebaceecf09a0349e15c0e8f668f72e34` má
[úspěšné CI 44044929954](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44044929954).
Prošlo 68 nástrojových testů včetně 11 cílených regresí metrik a celá dosavadní
aplikační/serverová sada s webovým buildem. Tato změna nic nenasazuje.

<!-- progress:details:start -->
### MVP podle hlavních milníků

| Milník | Dokončení | Úseky |
|---|---:|---:|
| [mvp-01: Základní registrace, ověření e-mailu, právní souhlas a profil.](TODO.md#mvp-01) | 100,00 % | 1/1 |
| [mvp-02: Lokální feed, vytvoření a životní stav Shoutu.](TODO.md#mvp-02) | 100,00 % | 1/1 |
| [mvp-03: Komentáře, odpovědi, reakce, ukládání, blokace a hlášení.](TODO.md#mvp-03) | 100,00 % | 1/1 |
| [mvp-04: Veřejné profily, Follow a oznámení uvnitř aplikace.](TODO.md#mvp-04) | 100,00 % | 1/1 |
| [mvp-05: Business registrace, pobočky a důvěryhodná ruční aktivace s auditem.](TODO.md#mvp-05) | 100,00 % | 1/1 |
| [mvp-06: Moderátorské rozhraní, role, regionální rozsahy a základní Rules ochrana.](TODO.md#mvp-06) | 100,00 % | 1/1 |
| [mvp-07: Web jako funkční vývojový cíl se sedmi jazyky.](TODO.md#mvp-07) | 100,00 % | 1/1 |
| [mvp-08: Automatické Flutter a Firestore Rules testy zapojené do CI.](TODO.md#mvp-08) | 100,00 % | 1/1 |
| [mvp-09: Připravit `go.shoutout-app.eu` a Hosting pro aplikaci odděleně od stávající prezentace. Ověřeno 25. října 2026: samostatný site, propojená webová aplikace, DNS a aktivní HTTPS. Produkční release patří do navazujících milníků a zatím není nasazený.](TODO.md#mvp-09) | 100,00 % | 1/1 |
| [mvp-10: Nakonfigurovat aplikaci ve stávajícím projektu `shoutout-production-a1b34`, oddělit její Hosting site od vstupní stránky a bezpečně oddělit vývojová a produkční data i nástroje.](TODO.md#mvp-10) | 40,00 % | 2/5 |
| [mvp-11: Ověřit doručitelnost e-mailů, produkční Auth domény, Action URL a šablony.](TODO.md#mvp-11) | 20,00 % | 1/5 |
| [mvp-12: Ověřit polohu, feed a publikování v mobilním i desktopovém prohlížeči mimo Litoměřice.](TODO.md#mvp-12) | 50,00 % | 2/4 |
| [mvp-13: Nasadit geografické obohacení, provést backfill a ověřit regionální data potřebná pro stávající moderaci.](TODO.md#mvp-13) | 50,00 % | 4/8 |
| [mvp-14: Automatizovat expiraci Shoutů, mazání podkolekcí a dokončení 60denní retence účtu.](TODO.md#mvp-14) | 70,60 % | 12/17 |
| [mvp-15: Dokončit webový App Check a ochranu registrace; vynucení zapnout až po ověření metrik.](TODO.md#mvp-15) | 57,16 % | 4/7 |
| [mvp-16: Zavést důvěryhodnou serverovou bránu pro zápisy obsahu, čítače, polohu, idempotenci a limity proti spamu.](TODO.md#mvp-16) | 98,46 % | 134/138 |
| [mvp-17: Dopracovat bezpečné moderátorské operace a jejich audit pro veřejný web, včetně zamítnutí a pozastavení Business účtů.](TODO.md#mvp-17) | 50,00 % | 4/8 |
| [mvp-18: Serverově vynutit pravidla současných bezplatných Business funkcí a zachovat oddělení oprávnění od budoucí ceny.](TODO.md#mvp-18) | 50,01 % | 3/6 |
| [mvp-19: Dokončit audit překladů, přístupnosti a rozložení webu v mobilní i desktopové šířce pro všech sedm jazyků.](TODO.md#mvp-19) | 40,00 % | 2/5 |
| [mvp-20: Projít všechny webové ruční regresní scénáře běžného, Business i moderačního účtu včetně pomalé nebo přerušované sítě.](TODO.md#mvp-20) | 0,00 % | 0/4 |
| [mvp-21: Doplnit skutečného provozovatele, podporu, právní kontrolu a proces práv subjektů údajů.](TODO.md#mvp-21) | 0,00 % | 0/3 |
| [mvp-22: Nastavit monitoring, rozpočty, kvóty, zálohy, obnovu, rollback a minimální provozní metriky bez nadbytečných osobních údajů.](TODO.md#mvp-22) | 22,23 % | 2/9 |
| [mvp-23: Spustit CI a produkční webový build a odstranit blokující vady.](TODO.md#mvp-23) | 0,00 % | 0/3 |
| [mvp-24: Splnit webovou rozhodovací bránu v `docs/LAUNCH_READINESS.md` a výslovně přijmout nebo odstranit zbývající rizika.](TODO.md#mvp-24) | 0,00 % | 0/3 |

### Rozpracované backlogové položky

| Položka | Dokončení | Úseky |
|---|---:|---:|
| [bl-005: Navrhnout a po schválení zavést přečtení Shoutů, stabilní feed a refresh s počtem novinek. MVP — vlastník potvrdil celé A0–A3 i B1–B4 před vydáním.](BACKLOG.md#bl-005) | 99,66 % | 91/93 |
| [bl-019: Přepracovat onboarding na interaktivní tutorial. Po MVP *(Rozpracováno, automatické spuštění je dočasně deaktivované.)*](BACKLOG.md#bl-019) | 25,00 % | 1/4 |
| [bl-038: MVP — Splnit webovou předstartovní bránu v `docs/LAUNCH_READINESS.md`. Tento dokument sdružuje produkční, bezpečnostní, právní, testovací a provozní předpoklady veřejné aplikace. Mobilní distribuce a placená monetizace jsou samostatné navazující etapy; jednotlivé úkoly zůstávají v tomto backlogu. Provozní akceptace zahrnuje schválený cíl 100 000 registrovaných účtů a 5 000 současně aktivních uživatelů; [profil akcí a ověření této zátěže](LAUNCH_READINESS.md#capacity-target) se musí určit zvlášť. Kapacita zatím není prokázaná.](BACKLOG.md#bl-038) | 50,00 % | 2/4 |
| [bl-048: MVP — Blaze je aktivní; před nasazením připravené Firestore TTL konfigurace pro fyzické odstranění `clientErrorLogs` a `technicalLogAccessAudits` změřit objem a schválit účtovaná TTL mazání podle `docs/operations/COST_SAFETY.md`. Do té doby jsou starší záznamy bezpečně nečitelné.](BACKLOG.md#bl-048) | 33,34 % | 1/3 |
| [bl-059: MVP — Po připojení `go.shoutout-app.eu` k produkčnímu projektu `shoutout-production-a1b34` přepnout jeho globální Firebase Authentication Action URL na připravený `/auth/action`. Handler už bezpečně obsluhuje ověření e-mailu, reset hesla i obnovení změněné adresy; výchozí domény projektu Firebase při ukládání vlastní Action URL odmítá. Prezentační projekt není cílem této změny.](BACKLOG.md#bl-059) | 33,34 % | 1/3 |
| [bl-072: Dokončit Business účet, provozovny a ruční aktivaci pro veřejný web. MVP](BACKLOG.md#bl-072) | 50,00 % | 2/4 |
| [bl-133: MVP — Ověřit produkční web pro běžné i Business účty včetně přístupu běžného uživatele k feedu a publikování. Moderátorské trasy `/admin` dál vyžadují odpovídající roli v klientovi, pravidlech a testech. Dřívější plán omezit celý web pouze na Business a moderaci byl 20. října 2026 nahrazen cílem veřejné webové aplikace.](BACKLOG.md#bl-133) | 40,00 % | 2/5 |

### Dílčí evidence mimo původní uzavřené položky

| ID a úsek | Fáze | Stav | Důkazy |
|---|---|---|---|
| bl-004-work: Dopracovat: Před MVP, samostatná etapa — připojit a přesměrovat `www.shoutout-app.eu` na hlavní doménu. | implementation | ⬜ | — |
| bl-004-accept: Ověřit celé kritérium: Před MVP, samostatná etapa — připojit a přesměrovat `www.shoutout-app.eu` na hlavní doménu. | acceptance | ⬜ | — |
| bl-007-work: Dopracovat: Rozhodnout o případném větším dosahu v rámci předplatného. Po MVP | planning | ⬜ | — |
| bl-007-accept: Ověřit celé kritérium: Rozhodnout o případném větším dosahu v rámci předplatného. Po MVP | acceptance | ⬜ | — |
| bl-010-work: Dopracovat: Prověřit nedoručený ověřovací e-mail na Email.cz. MVP | verification | ⬜ | — |
| bl-010-accept: Ověřit celé kritérium: Prověřit nedoručený ověřovací e-mail na Email.cz. MVP | acceptance | ⬜ | — |
| bl-012-work: Dopracovat: MVP — Doručitelnost na Email.cz ověřit mimo klienta podle Firebase/Auth provozu, spamu a případného odmítnutí příjemcem; bez poštovních logů ji nelze potvrdit. | verification | ⬜ | — |
| bl-012-accept: Ověřit celé kritérium: MVP — Doručitelnost na Email.cz ověřit mimo klienta podle Firebase/Auth provozu, spamu a případného odmítnutí příjemcem; bez poštovních logů ji nelze potvrdit. | acceptance | ⬜ | — |
| bl-013-work: Dopracovat: Přidat postupné ověření telefonního čísla přes Firebase Phone Auth. Po MVP | implementation | ⬜ | — |
| bl-013-accept: Ověřit celé kritérium: Přidat postupné ověření telefonního čísla přes Firebase Phone Auth. Po MVP | acceptance | ⬜ | — |
| bl-020-work: Dopracovat: Doplnit uživatelskou zpětnou vazbu a metriky obsahu. Po MVP | implementation | ⬜ | — |
| bl-020-accept: Ověřit celé kritérium: Doplnit uživatelskou zpětnou vazbu a metriky obsahu. Po MVP | acceptance | ⬜ | — |
| bl-025-work: Dopracovat: Rozhodnout, zda vůbec zavést kosmetické coiny nebo obchod. Po MVP | planning | ⬜ | — |
| bl-025-accept: Ověřit celé kritérium: Rozhodnout, zda vůbec zavést kosmetické coiny nebo obchod. Po MVP | acceptance | ⬜ | — |
| bl-027-work: Dopracovat: Navrhnout Founder balíček pro nové podniky. Po MVP | planning | ⬜ | — |
| bl-027-accept: Ověřit celé kritérium: Navrhnout Founder balíček pro nové podniky. Po MVP | acceptance | ⬜ | — |
| bl-034-work: Dopracovat: MVP — Před prvním nasazením Functions nastavit a prakticky otestovat nákladové pojistky podle `docs/operations/COST_SAFETY.md`: servisní kvóty, Functions spend cap, rozpočtová upozornění, Pub/Sub nouzovou reakci a odpovědnou osobu. Po splnění pokračovat oddělenými kontrolovanými kroky: nasadit `enrichShoutGeography`, provést dávkový geografický backfill, aktivovat po cenové kontrole TTL a poté implementovat serverovou expiraci Shoutů a mazání účtů. Přesná výstupní kritéria jsou v `docs/operations/COST_SAFETY.md`. | implementation | ⬜ | — |
| bl-034-accept: Ověřit celé kritérium: MVP — Před prvním nasazením Functions nastavit a prakticky otestovat nákladové pojistky podle `docs/operations/COST_SAFETY.md`: servisní kvóty, Functions spend cap, rozpočtová upozornění, Pub/Sub nouzovou reakci a odpovědnou osobu. Po splnění pokračovat oddělenými kontrolovanými kroky: nasadit `enrichShoutGeography`, provést dávkový geografický backfill, aktivovat po cenové kontrole TTL a poté implementovat serverovou expiraci Shoutů a mazání účtů. Přesná výstupní kritéria jsou v `docs/operations/COST_SAFETY.md`. | acceptance | ⬜ | — |
| bl-039-work: Dopracovat: Po MVP — Marketingový pilot zahájit až po splnění startovní brány a dále jej řídit samostatným plánem `docs/local/ShoutOut_marketingovy_plan_spusteni.docx`. | planning | ⬜ | — |
| bl-039-accept: Ověřit celé kritérium: Po MVP — Marketingový pilot zahájit až po splnění startovní brány a dále jej řídit samostatným plánem `docs/local/ShoutOut_marketingovy_plan_spusteni.docx`. | acceptance | ⬜ | — |
| bl-043-work: Dopracovat: Po MVP — Dokončit ruční kontrolu na fyzickém zařízení s běžným účtem mimo Litoměřice; dosavadní opakované pokusy uživateli procházejí. | implementation | ⬜ | — |
| bl-043-accept: Ověřit celé kritérium: Po MVP — Dokončit ruční kontrolu na fyzickém zařízení s běžným účtem mimo Litoměřice; dosavadní opakované pokusy uživateli procházejí. | acceptance | ⬜ | — |
| bl-058-work: Dopracovat: MVP — Samostatně ověřit přirozeně expirovaný odkaz po uplynutí jeho platnosti ve webovém toku obnovy hesla. | verification | ⬜ | — |
| bl-058-accept: Ověřit celé kritérium: MVP — Samostatně ověřit přirozeně expirovaný odkaz po uplynutí jeho platnosti ve webovém toku obnovy hesla. | acceptance | ⬜ | — |
| bl-081-work: Dopracovat: MVP — Doplnit kontrolované zamítnutí a pozastavení Business žádosti nebo aktivního účtu, včetně bezpečných stavových přechodů v Rules, odebrání oprávnění, odůvodnění, auditu a odpovídajícího stavu v klientovi. | implementation | ⬜ | — |
| bl-081-accept: Ověřit celé kritérium: MVP — Doplnit kontrolované zamítnutí a pozastavení Business žádosti nebo aktivního účtu, včetně bezpečných stavových přechodů v Rules, odebrání oprávnění, odůvodnění, auditu a odpovídajícího stavu v klientovi. | acceptance | ⬜ | — |
| bl-092-work: Dopracovat: Po MVP — Po zapojení důvěryhodného serveru měřit unikátní dosah, celková zobrazení a rozkliknutí propagačních okének; v Business → Propagace zobrazit také vypočtenou míru prokliku. Vzdálenostní pásma se nesledují. | implementation | ⬜ | — |
| bl-092-accept: Ověřit celé kritérium: Po MVP — Po zapojení důvěryhodného serveru měřit unikátní dosah, celková zobrazení a rozkliknutí propagačních okének; v Business → Propagace zobrazit také vypočtenou míru prokliku. Vzdálenostní pásma se nesledují. | acceptance | ⬜ | — |
| bl-093-work: Dopracovat: Po MVP — Schválit model předplatného: rozsah plánů, cenu, období, placená oprávnění, změnu a ukončení plánu, Founder zvýhodnění a případný větší dosah. Žádné Business tokeny ani jejich balíčky neplánovat. | implementation | ⬜ | — |
| bl-093-accept: Ověřit celé kritérium: Po MVP — Schválit model předplatného: rozsah plánů, cenu, období, placená oprávnění, změnu a ukončení plánu, Founder zvýhodnění a případný větší dosah. Žádné Business tokeny ani jejich balíčky neplánovat. | acceptance | ⬜ | — |
| bl-094-work: Dopracovat: Po MVP — Zavést serverově řízený stav předplatného, auditovaná oprávnění a idempotentní změny stavu; klient si nesmí nárok přiznat sám. | implementation | ⬜ | — |
| bl-094-accept: Ověřit celé kritérium: Po MVP — Zavést serverově řízený stav předplatného, auditovaná oprávnění a idempotentní změny stavu; klient si nesmí nárok přiznat sám. | acceptance | ⬜ | — |
| bl-095-work: Dopracovat: Po MVP — Navrhnout a zapojit důvěryhodný platební tok předplatného; dosavadní volbu Stripe, kartu, Apple Pay a Google Pay ověřit pro zvolený model a platformy. Řešit serverové potvrzení, duplicity, selhání a chargebacky; případný SetupIntent posoudit zvlášť. | verification | ⬜ | — |
| bl-095-accept: Ověřit celé kritérium: Po MVP — Navrhnout a zapojit důvěryhodný platební tok předplatného; dosavadní volbu Stripe, kartu, Apple Pay a Google Pay ověřit pro zvolený model a platformy. Řešit serverové potvrzení, duplicity, selhání a chargebacky; případný SetupIntent posoudit zvlášť. | acceptance | ⬜ | — |
| bl-096-work: Dopracovat: Po MVP — Dokončit DPH/VAT, měny, doklady a fakturaci na firmu, účetní retenci a bezpečné refundace bez zpětné změny vystavených dokladů. | implementation | ⬜ | — |
| bl-096-accept: Ověřit celé kritérium: Po MVP — Dokončit DPH/VAT, měny, doklady a fakturaci na firmu, účetní retenci a bezpečné refundace bez zpětné změny vystavených dokladů. | acceptance | ⬜ | — |
| bl-097-work: Dopracovat: Po MVP — Navrhnout a dokončit správu předplatného a firemních dokladů v Business rozhraní; placený nárok navázat na stávající bezplatný tok propagace bez tokenové sekce. | planning | ⬜ | — |
| bl-097-accept: Ověřit celé kritérium: Po MVP — Navrhnout a dokončit správu předplatného a firemních dokladů v Business rozhraní; placený nárok navázat na stávající bezplatný tok propagace bez tokenové sekce. | acceptance | ⬜ | — |
| bl-102-work: Dopracovat: Napojit Follow a uživatelské preference na oznámení. Po MVP | implementation | ⬜ | — |
| bl-102-accept: Ověřit celé kritérium: Napojit Follow a uživatelské preference na oznámení. Po MVP | acceptance | ⬜ | — |
| bl-108-work: Dopracovat: Po MVP — Přes Cloud Functions rozesílat nový Shout sledovaného profilu a později relevantní Shouty v okolí; tyto události mají více příjemců a klient je nesmí rozesílat sám. | implementation | ⬜ | — |
| bl-108-accept: Ověřit celé kritérium: Po MVP — Přes Cloud Functions rozesílat nový Shout sledovaného profilu a později relevantní Shouty v okolí; tyto události mají více příjemců a klient je nesmí rozesílat sám. | acceptance | ⬜ | — |
| bl-109-work: Dopracovat: Po MVP — Přidat FCM push mimo otevřenou aplikaci, systémová/moderátorská oznámení a omezení četnosti. | implementation | ⬜ | — |
| bl-109-accept: Ověřit celé kritérium: Po MVP — Přidat FCM push mimo otevřenou aplikaci, systémová/moderátorská oznámení a omezení četnosti. | acceptance | ⬜ | — |
| bl-112-work: Dopracovat: Po MVP — Volitelně později zvážit žebříček pouze mezi sledovanými profily; před implementací vyřešit soukromí, ochranu výsledků a náklady Firestore. | implementation | ⬜ | — |
| bl-112-accept: Ověřit celé kritérium: Po MVP — Volitelně později zvážit žebříček pouze mezi sledovanými profily; před implementací vyřešit soukromí, ochranu výsledků a náklady Firestore. | acceptance | ⬜ | — |
| bl-132-work: Dopracovat: Později, termín k rozhodnutí — Navrhnout a implementovat správu neveřejného 60denního archivu zpráv/komentářů smazaných účtů. | planning | ⬜ | — |
| bl-132-accept: Ověřit celé kritérium: Později, termín k rozhodnutí — Navrhnout a implementovat správu neveřejného 60denního archivu zpráv/komentářů smazaných účtů. | acceptance | ⬜ | — |
| bl-140-work: Dopracovat: Po MVP — Na Macu sestavit nepodepsaný iOS build a odstranit případné chyby nativních závislostí; ve Windows tento krok nelze spolehlivě provést. | implementation | ⬜ | — |
| bl-140-accept: Ověřit celé kritérium: Po MVP — Na Macu sestavit nepodepsaný iOS build a odstranit případné chyby nativních závislostí; ve Windows tento krok nelze spolehlivě provést. | acceptance | ⬜ | — |
| bl-141-work: Dopracovat: Po MVP — Přes Xcode s Apple Personal Team nainstalovat debug build na vlastní iPhone, zaregistrovat App Check debug token a projít hlavní uživatelské cesty. | implementation | ⬜ | — |
| bl-141-accept: Ověřit celé kritérium: Po MVP — Přes Xcode s Apple Personal Team nainstalovat debug build na vlastní iPhone, zaregistrovat App Check debug token a projít hlavní uživatelské cesty. | acceptance | ⬜ | — |
| bl-142-work: Dopracovat: Po MVP — Pro distribuci zaregistrovat iOS aplikaci v produkčním Firebase projektu aplikace, vytvořit produkční Apple identitu, podpisy a App Store konfiguraci; vývojovou konfiguraci nepoužít veřejně. | implementation | ⬜ | — |
| bl-142-accept: Ověřit celé kritérium: Po MVP — Pro distribuci zaregistrovat iOS aplikaci v produkčním Firebase projektu aplikace, vytvořit produkční Apple identitu, podpisy a App Store konfiguraci; vývojovou konfiguraci nepoužít veřejně. | acceptance | ⬜ | — |
| bl-143-work: Dopracovat: Po MVP — Připravit produkční Android/iOS Firebase aplikace, bezpečné build varianty a mobilní konfigurace bez přístupu k vývojovým datům. | implementation | ⬜ | — |
| bl-143-accept: Ověřit celé kritérium: Po MVP — Připravit produkční Android/iOS Firebase aplikace, bezpečné build varianty a mobilní konfigurace bez přístupu k vývojovým datům. | acceptance | ⬜ | — |
| bl-144-work: Dopracovat: Po MVP — Dokončit podepsaný Android release, bezpečnou správu klíče, Play Integrity a produkční App Check; ověřit hlavní cesty na fyzickém zařízení. | verification | ⬜ | — |
| bl-144-accept: Ověřit celé kritérium: Po MVP — Dokončit podepsaný Android release, bezpečnou správu klíče, Play Integrity a produkční App Check; ověřit hlavní cesty na fyzickém zařízení. | acceptance | ⬜ | — |
| bl-145-work: Dopracovat: Po MVP — Připravit Google Play záznam, zásady ochrany dat, věkové hodnocení, testovací kanál a vydání Androidu pro běžné i privilegované role. | implementation | ⬜ | — |
| bl-145-accept: Ověřit celé kritérium: Po MVP — Připravit Google Play záznam, zásady ochrany dat, věkové hodnocení, testovací kanál a vydání Androidu pro běžné i privilegované role. | acceptance | ⬜ | — |
| bl-146-work: Dopracovat: Po MVP — Dokončit produkční iOS podpis, App Attest a fyzickou regresi, připravit TestFlight, App Store Connect a veřejné vydání iOS. | implementation | ⬜ | — |
| bl-146-accept: Ověřit celé kritérium: Po MVP — Dokončit produkční iOS podpis, App Attest a fyzickou regresi, připravit TestFlight, App Store Connect a veřejné vydání iOS. | acceptance | ⬜ | — |
| bl-147-work: Dopracovat: MVP — Udělit varování běžnému uživateli a ověřit záznam v historii postihů. | verification | ⬜ | — |
| bl-147-accept: Ověřit celé kritérium: MVP — Udělit varování běžnému uživateli a ověřit záznam v historii postihů. | acceptance | ⬜ | — |
| bl-148-work: Dopracovat: MVP — Udělit dočasné omezení tvorby a ověřit blokaci Shoutů i komentářů. | verification | ⬜ | — |
| bl-148-accept: Ověřit celé kritérium: MVP — Udělit dočasné omezení tvorby a ověřit blokaci Shoutů i komentářů. | acceptance | ⬜ | — |
| bl-149-work: Dopracovat: MVP — Skrýt závadný komentář a ověřit jeho stav ve vlákně. | verification | ⬜ | — |
| bl-149-accept: Ověřit celé kritérium: MVP — Skrýt závadný komentář a ověřit jeho stav ve vlákně. | acceptance | ⬜ | — |
| bl-150-work: Dopracovat: MVP — Eskalovat případ senior moderátorovi a ověřit oddělení obou front. | verification | ⬜ | — |
| bl-150-accept: Ověřit celé kritérium: MVP — Eskalovat případ senior moderátorovi a ověřit oddělení obou front. | acceptance | ⬜ | — |
| bl-151-work: Dopracovat: MVP — Senior rolí ověřit 90denní a trvalý ban. | verification | ⬜ | — |
| bl-151-accept: Ověřit celé kritérium: MVP — Senior rolí ověřit 90denní a trvalý ban. | acceptance | ⬜ | — |
| bl-152-work: Dopracovat: MVP — Označit obsah jako v pořádku a ověřit nemožnost dalšího hlášení. | verification | ⬜ | — |
| bl-152-accept: Ověřit celé kritérium: MVP — Označit obsah jako v pořádku a ověřit nemožnost dalšího hlášení. | acceptance | ⬜ | — |
| bl-153-work: Dopracovat: MVP — Ověřit zrušení dočasného postihu a zachování neměnné auditní historie. | verification | ⬜ | — |
| bl-153-accept: Ověřit celé kritérium: MVP — Ověřit zrušení dočasného postihu a zachování neměnné auditní historie. | acceptance | ⬜ | — |
| feed-a0-code: Úplný detail Shoutu A0 – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_IMPLEMENTATION_STAGES.md#aktualni-stav) |
| feed-a0-check: Úplný detail Shoutu A0 – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_IMPLEMENTATION_STAGES.md#aktualni-stav) |
| feed-a0-dev: Úplný detail Shoutu A0 – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/plans/feed/FEED_IMPLEMENTATION_STAGES.md#aktualni-stav) |
| feed-a0-accept: Úplný detail Shoutu A0 – živá akceptace DEV | acceptance | ✅ | [1](../docs/plans/feed/FEED_IMPLEMENTATION_STAGES.md#aktualni-stav) |
| feed-a1-reference: Referenční lokální ověření A1 | verification | ✅ | [1](../docs/plans/feed/FEED_A1_RESULTS.md) |
| feed-progressive-code: Progresivní hledání podle geohashů – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_PROGRESSIVE_PLAN.md) |
| feed-progressive-check: Progresivní hledání podle geohashů – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_PROGRESSIVE_PLAN.md) |
| feed-blocks-code: Sdílený prostorový index – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_BLOCK_INDEX_PLAN.md) |
| feed-blocks-check: Sdílený prostorový index – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_BLOCK_INDEX_PLAN.md) |
| feed-r4-code: Retence indexu R4 – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_INDEX_RETENTION.md) |
| feed-r4-check: Retence indexu R4 – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_INDEX_RETENTION.md) |
| feed-batch-writer-code: Atomický dávkový writer pro 50 Shoutů – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_WRITER_INTEGRATION.md#batch-preparation) |
| feed-batch-writer-check: Atomický dávkový writer pro 50 Shoutů – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_WRITER_INTEGRATION.md#batch-preparation) |
| feed-r5-code: Retenční fence a historické cache R5 – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_INDEX_RETENTION.md#account-retention-proposal) |
| feed-r5-check: Retenční fence a historické cache R5 – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_INDEX_RETENTION.md#account-retention-proposal) |
| feed-moderation-regression: Regrese mazání/moderace a opravy indexu | verification | ✅ | [1](../docs/plans/feed/FEED_WRITER_INTEGRATION.md#moderation-regression) |
| feed-r6a-code: Omezený runner – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_RUNTIME_PROPOSAL.md#r6a-results) |
| feed-r6a-check: Omezený runner – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_RUNTIME_PROPOSAL.md#r6a-results) |
| feed-r6b-code: Řízení generací a ochrana nástrojů – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_RUNTIME_PROPOSAL.md#r6b-results) |
| feed-r6b-check: Řízení generací a ochrana nástrojů – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_RUNTIME_PROPOSAL.md#r6b-results) |
| feed-r6c-code: Časná indexová fronta – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_RUNTIME_PROPOSAL.md#r6c-results) |
| feed-r6c-check: Časná indexová fronta – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_RUNTIME_PROPOSAL.md#r6c-results) |
| feed-r6d-code: Koordinace s konečným purge – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_RUNTIME_PROPOSAL.md#r6d-results) |
| feed-r6d-check: Koordinace s konečným purge – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_RUNTIME_PROPOSAL.md#r6d-results) |
| feed-r6e-code: Provozní adaptér indexu – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_RUNTIME_PROPOSAL.md#r6e-results) |
| feed-r6e-check: Provozní adaptér indexu – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_RUNTIME_PROPOSAL.md#r6e-results) |
| feed-api-code: Podepsané stránkované API – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#dev-rollout-results) |
| feed-api-check: Podepsané stránkované API – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#dev-rollout-results) |
| feed-client-code: Napojení Home a stabilní stránky – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#dev-rollout-results) |
| feed-client-check: Napojení Home a stabilní stránky – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#dev-rollout-results) |
| feed-install-dev: Trvalá instalace feed-v1, writerů a API do DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#dev-rollout-results) |
| feed-a2a3-accept: Společná živá akceptace A2/A3 a úklid fixture | acceptance | ✅ | [1](../docs/plans/feed/FEED_IMPLEMENTATION_STAGES.md#aktualni-stav) |
| feed-own-code: Vlastní Aktivní/Expirované a stránkování – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_IMPLEMENTATION_STAGES.md#aktualni-stav) |
| feed-own-check: Vlastní Aktivní/Expirované a stránkování – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_IMPLEMENTATION_STAGES.md#aktualni-stav) |
| feed-own-dev: Vlastní Aktivní/Expirované a stránkování – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/plans/feed/FEED_IMPLEMENTATION_STAGES.md#aktualni-stav) |
| feed-own-accept: Vlastní Aktivní/Expirované a stránkování – živá akceptace DEV | acceptance | ✅ | [1](../docs/plans/feed/FEED_IMPLEMENTATION_STAGES.md#aktualni-stav) |
| feed-saved-code: Uložené: scroll, chyby a potvrzené odebrání – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression) |
| feed-saved-check: Uložené: scroll, chyby a potvrzené odebrání – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression) |
| feed-saved-dev: Uložené: scroll, chyby a potvrzené odebrání – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression) |
| feed-saved-accept: Uložené: scroll, chyby a potvrzené odebrání – živá akceptace DEV | acceptance | ✅ | [1](../docs/plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression) |
| feed-b1-code: Osobní přečtení B1, retence a restart – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_READING_POLICY.md#b1-implementation) |
| feed-b1-check: Osobní přečtení B1, retence a restart – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_READING_POLICY.md#b1-implementation) |
| feed-b1-dev: Osobní přečtení B1, retence a restart – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/plans/feed/FEED_READING_POLICY.md#b1-implementation) |
| feed-b1-accept: Osobní přečtení B1, retence a restart – živá akceptace DEV | acceptance | ✅ | [1](../docs/plans/feed/FEED_READING_POLICY.md#b1-implementation) |
| feed-b2a-code: Cloudové jádro a blokový kontrakt B2a – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_READING_POLICY.md#b2-local-results) |
| feed-b2a-check: Cloudové jádro a blokový kontrakt B2a – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_READING_POLICY.md#b2-local-results) |
| feed-b2-v3-code: Hranice fronty, migrace v3 a checkpoint – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#b2-client-results) |
| feed-b2-v3-check: Hranice fronty, migrace v3 a checkpoint – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#b2-client-results) |
| feed-b2-runtime-code: B2 serverová obsluha, kvóta a vypnutý adaptér – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_READING_POLICY.md#b2-runtime-implementation) |
| feed-b2-runtime-check: B2 serverová obsluha, kvóta a vypnutý adaptér – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_READING_POLICY.md#b2-runtime-implementation) |
| feed-b2-cleanup-code: Pokračující retenční úklid B2 – implementace | implementation | ✅ | [1](../functions/retention_cleanup.js), [2](../docs/plans/feed/FEED_READING_POLICY.md#b2-retention-implementation) |
| feed-b2-cleanup-check: Pokračující retenční úklid B2 – automatické ověření | verification | ✅ | [1](../functions/retention_cleanup.integration.test.js), [2](../docs/plans/feed/FEED_READING_POLICY.md#b2-retention-implementation) |
| feed-b2-prep-code: Vypnutý adaptér B2, indexový plán a účtové zapojení – implementace | implementation | ✅ | [1](../functions/retention_runtime.js), [2](../tools/read_sync_index_plan.mjs), [3](../docs/plans/feed/B2_DEV_ROLLOUT.md#preparation-results) |
| feed-b2-prep-check: Příprava DEV B2 – automatické ověření | verification | ✅ | [1](../functions/retention_runtime.integration.test.js), [2](../tools/read_sync_index_plan.test.mjs), [3](../docs/plans/feed/B2_DEV_ROLLOUT.md#preparation-results) |
| feed-b2-indexes: Živá indexace a aktivace účtového read úklidu | deployment | ✅ | [1](../docs/plans/feed/B2_DEV_ROLLOUT.md#dev-rollout-results) |
| feed-b2-rollback: Kompatibilní neaktivní v3 artefakt a ověřený návrat | verification | ✅ | [1](../test/read_state_store_browser.dart), [2](../docs/plans/feed/B2_DEV_ROLLOUT.md#preparation-results) |
| feed-b2-dev: Nasazení a zapnutí celého B2 do DEV | deployment | ✅ | [1](../docs/plans/feed/B2_DEV_ROLLOUT.md#dev-rollout-results) |
| feed-b2-accept: Živá synchronizace zařízení, recovery a úklid testu | acceptance | ✅ | [1](../docs/plans/feed/B2_DEV_ROLLOUT.md#b2-acceptance-complete) |
| feed-b3-code: Globální unread-first pouze v Nejblíž – implementace | implementation | ✅ | [1](../functions/feed_b3_pilot.js), [2](../tools/feed_b3_pilot.mjs), [3](../functions/feed_read_snapshot.js), [4](../functions/get_feed_page.js), [5](../lib/read_tracking_controller.dart), [6](../functions/feed_generation_transition.js), [7](../functions/feed_generation_format.js), [8](../functions/feed_transition_operator.js), [9](../functions/feed_serving_options.js), [10](../tools/feed_generation_transition.mjs), [11](../docs/plans/feed/B3_DEV_ROLLOUT.md#operator-preparation), [12](../docs/plans/feed/B3_DEV_ROLLOUT.md#local-transition-results), [13](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#b3-local-results), [14](../docs/plans/feed/B3_DEV_ROLLOUT.md#read-feedback-fix), [15](../lib/read_tracking_widgets.dart), [16](../lib/interaction_feedback.dart), [17](../lib/interaction_feedback_widgets.dart), [18](../docs/plans/feed/B3_DEV_ROLLOUT.md#interaction-feedback-implementation) |
| feed-b3-check: Globální unread-first pouze v Nejblíž – automatické ověření | verification | ✅ | [1](../functions/feed_b3_pilot.integration.test.js), [2](../functions/get_feed_page.integration.test.js), [3](../functions/feed_read_snapshot.test.js), [4](../functions/feed_generation_transition.integration.test.js), [5](../functions/feed_transition_operator.integration.test.js), [6](../functions/feed_transition_operator.test.js), [7](../docs/benchmarks/FEED_B3_2026-11-19.json), [8](../docs/plans/feed/B3_DEV_ROLLOUT.md#operator-preparation), [9](../test/spatial_feed_view_test.dart), [10](../test/read_sync_boundary_test.dart), [11](../docs/plans/feed/B3_DEV_ROLLOUT.md#local-transition-results), [12](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#b3-local-results), [13](../docs/plans/feed/B3_DEV_ROLLOUT.md#read-feedback-fix), [14](../test/read_feedback_test.dart), [15](../test/read_tracking_widgets_test.dart), [16](../test/interaction_feedback_test.dart), [17](../test/interaction_feedback_widgets_test.dart), [18](../tools/rules/feed_runtime_access.integration.test.mjs), [19](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44788753267) |
| feed-b3-dev: Globální unread-first pouze v Nejblíž – nasazení DEV | deployment | ✅ | [1](../docs/plans/feed/B3_DEV_ROLLOUT.md#dev-rollout-results), [2](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44620011513), [3](../docs/plans/feed/B3_DEV_ROLLOUT.md#read-feedback-fix), [4](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44684384849), [5](../docs/plans/feed/B3_DEV_ROLLOUT.md#interaction-feedback-dev), [6](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44788753267) |
| feed-b3-accept: Globální unread-first pouze v Nejblíž – živá akceptace DEV | acceptance | ✅ | [1](../docs/plans/feed/B3_DEV_ROLLOUT.md#read-feedback-acceptance), [2](../docs/plans/feed/B3_DEV_ROLLOUT.md#interaction-feedback-implementation), [3](../docs/plans/feed/B3_DEV_ROLLOUT.md#interaction-feedback-dev), [4](../docs/plans/feed/B3_DEV_ROLLOUT.md#b3-acceptance-complete) |
| feed-b4a-core-code: B4a – schválený lokální protokol, RAM cache a projekční plán | implementation | ✅ | [1](../functions/feed_body_contract.js), [2](../functions/feed_body_lab.js), [3](../lib/feed_body_cache.dart), [4](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4a-local-results) |
| feed-b4a-core-check: B4a – kontraktové a emulátorové ověření, srovnání projekcí | verification | ✅ | [1](../functions/feed_body_contract.test.js), [2](../functions/feed_body_lab.integration.test.js), [3](../test/feed_body_cache_test.dart), [4](../test/fixtures/feed_body_page.json), [5](../docs/benchmarks/FEED_B4A_2026-11-20.json), [6](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44816457563) |
| feed-b4-read-code: B4 – finální čtecí transakce a metadata dostupnosti | implementation | ✅ | [1](../functions/feed_body_reader.js), [2](../functions/feed_body_state.js), [3](../lib/feed_body_cache.dart), [4](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4-read-local-results) |
| feed-b4-read-check: B4 – regrese finálního readeru a úplné počty operací | verification | ✅ | [1](../functions/feed_body_reader.integration.test.js), [2](../functions/feed_body_state.test.js), [3](../functions/feed_body_contract.test.js), [4](../test/feed_body_cache_test.dart), [5](../docs/benchmarks/FEED_B4_READ_2026-11-20.json), [6](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44825059479) |
| feed-b4-state-code: Serverová vrstva B4 – atomická integrace všech writerů | implementation | ✅ | [1](../docs/plans/feed/FEED_STATE_STORAGE_PROPOSAL.md#p1-results), [2](../functions/feed_card_state.js), [3](../functions/feed_card_backfill.js), [4](../functions/feed_runtime.js), [5](../functions/feed_card_transition_operator.js), [6](../functions/feed_card_transition_validation.js), [7](../tools/feed_card_transition.mjs), [8](../tools/feed_card_index_plan.mjs) |
| feed-b4-delta-code: Metadata/verze a cache – klientské zapojení a sdílené odběry | implementation | ✅ | [1](../lib/feed_delta_client.dart), [2](../lib/feed_delta_live.dart), [3](../functions/feed_delta.js), [4](../docs/plans/feed/FEED_STATE_STORAGE_PROPOSAL.md#client-integration-results) |
| feed-b4-state-check: Serverová vrstva B4 – automatické ověření writerů a doplnění | verification | ✅ | [1](../functions/feed_card_state.integration.test.js), [2](../docs/benchmarks/FEED_B4_STATE_2026-11-21.json), [3](../docs/plans/feed/FEED_STATE_STORAGE_PROPOSAL.md#p1-results), [4](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44908128699), [5](../functions/feed_card_transition.integration.test.js), [6](../tools/feed_card_transition.test.mjs), [7](../docs/plans/feed/B4_DEV_ROLLOUT.md#local-transition-results), [8](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44929196473) |
| feed-b4-delta-check: Metadata/verze a cache – automatické ověření celé integrace | verification | ✅ | [1](../test/feed_delta_client_test.dart), [2](../test/feed_delta_transport_browser.dart), [3](../tools/rules/feed_delta_access.integration.test.mjs), [4](../functions/feed_delta.integration.test.js), [5](../docs/benchmarks/FEED_B4_CLIENT_2026-11-21.json), [6](../docs/plans/feed/FEED_STATE_STORAGE_PROPOSAL.md#client-integration-results), [7](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44917393562), [8](../docs/plans/feed/B4_DEV_ROLLOUT.md#local-transition-results), [9](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44929196473) |
| feed-b4-news-local-code: B4b lokální výpočet, klient a srovnání detekce – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4b-local-results), [2](../functions/feed_news.js), [3](../lib/feed_news_driver.dart) |
| feed-b4-news-local-check: B4b lokální jádro a měření – úplné automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4b-local-results), [2](../functions/feed_news.integration.test.js), [3](../docs/benchmarks/FEED_NEWS_2026-11-21.json) |
| feed-b4-badge-code: Provozní napojení úsporných signálů a číslovky – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4b-runtime-results), [2](../functions/feed_news_signals.js), [3](../functions/feed_news_meter.js), [4](../lib/feed_news_runtime.dart), [5](../docs/plans/feed/B4_DEV_ROLLOUT.md#badge-and-recenter-results) |
| feed-b4-badge-check: Provozní napojení signálů a číslovky – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4b-runtime-results), [2](../functions/feed_news_runtime.integration.test.js), [3](../tools/rules/feed_news_access.integration.test.mjs), [4](../test/feed_news_runtime_test.dart), [5](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44953434700), [6](../docs/plans/feed/B4_DEV_ROLLOUT.md#badge-and-recenter-results), [7](../test/feed_action_badge_test.dart), [8](../functions/feed_recenter.integration.test.js), [9](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45066405533) |
| feed-b4-delta-dev: B4 metadata/cache a kompatibilni prechod - nasazeni DEV | deployment | ✅ | [1](../docs/plans/feed/B4_DEV_ROLLOUT.md#dev-rollout-results), [2](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni) |
| feed-b4-dev: Nasazení úsporné obnovy a novinek do DEV | deployment | ✅ | [1](../docs/plans/feed/B4_DEV_ROLLOUT.md#news-dev-rollout-results), [2](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44959541907), [3](../docs/plans/feed/B4_DEV_ROLLOUT.md#badge-and-recenter-results), [4](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45066405533), [5](../docs/plans/feed/B4_DEV_ROLLOUT.md#news-pause-recovery-results), [6](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45071219942) |
| feed-b4-delta-accept: B4 metadata/cache a prechod - ziva akceptace DEV | acceptance | ✅ | [1](../docs/plans/feed/B4_DEV_ROLLOUT.md#delta-acceptance-complete) |
| feed-b4-news-positive-accept: Živá číslovka novinek a odečtení po expiraci po opravě | acceptance | ✅ | [1](../docs/plans/feed/B4_DEV_ROLLOUT.md#news-positive-acceptance) |
| feed-b4-compatible-web-accept: Kompatibilní web bez news a návrat aktuálního UI | acceptance | ✅ | [1](../docs/plans/feed/B4_DEV_ROLLOUT.md#news-pause-acceptance) |
| feed-b4-recovery-accept: Automatický návrat novinek po načtení během pauzy | acceptance | ✅ | [1](../docs/plans/feed/B4_DEV_ROLLOUT.md#news-pause-recovery-results) |
| feed-b4-accept: Živá společná akceptace B4, baseline a novinek | acceptance | ⬜ | [1](../docs/plans/feed/B4_DEV_ROLLOUT.md#news-ui-diagnosis), [2](../docs/plans/feed/B4_DEV_ROLLOUT.md#news-ui-fix-results), [3](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45060709344), [4](../docs/plans/feed/B4_DEV_ROLLOUT.md#badge-and-recenter-results), [5](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45066405533), [6](../docs/plans/feed/B4_DEV_ROLLOUT.md#news-pause-acceptance), [7](../docs/plans/feed/B4_DEV_ROLLOUT.md#news-pause-recovery-results) |
| feed-auto-radius-code: Automatický dosah a nabídka rozšíření – klientská implementace | implementation | ✅ | [1](../lib/src/feed.dart), [2](../lib/src/home.dart), [3](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#automatic-radius) |
| feed-auto-radius-check: Automatický dosah – automatické regrese | verification | ✅ | [1](../test/feed_automatic_radius_test.dart), [2](../test/spatial_feed_view_test.dart), [3](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#automatic-radius), [4](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45020677812) |
| feed-auto-radius-dev: Automatický dosah – DEV Hosting | deployment | ✅ | [1](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#automatic-radius), [2](../docs/operations/WEB_ENVIRONMENTS.md), [3](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45020677812) |
| feed-auto-radius-accept: Automatický dosah – živá akceptace | acceptance | ✅ | [1](../docs/plans/feed/FEED_DELTA_REFRESH_PLAN.md#automatic-radius) |
| feed-movement-code: Zapojení pohybu do Home a přesných metadat – implementace | implementation | ✅ | [1](../docs/plans/feed/B4_DEV_ROLLOUT.md#movement-integration), [2](../lib/feed_movement_controller.dart), [3](../tools/feed_restart_cleanup.mjs), [4](../docs/plans/feed/B4_DEV_ROLLOUT.md#movement-order), [5](../lib/feed_session.dart) |
| feed-movement-check: Zapojení pohybu a scoped úklid – automatické ověření | verification | ✅ | [1](../docs/plans/feed/B4_DEV_ROLLOUT.md#movement-integration), [2](../test/feed_movement_controller_test.dart), [3](../test/spatial_feed_view_test.dart), [4](../functions/feed_recenter.integration.test.js), [5](../functions/feed_news_pilot.integration.test.js), [6](../docs/plans/feed/B4_DEV_ROLLOUT.md#movement-order), [7](../test/feed_movement_order_test.dart), [8](../test/feed_movement_view_test.dart) |
| feed-movement-dev: Zapojení pohybu do DEV – nasazení | deployment | ✅ | [1](../docs/plans/feed/B4_DEV_ROLLOUT.md#movement-integration), [2](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45077814590) |
| feed-final-accept: Společná finální regrese celého nového feedu | acceptance | ⬜ | [1](../docs/plans/feed/B4_DEV_ROLLOUT.md#movement-integration) |
| expired-lock-code: Zámek běžných interakcí po expiraci – implementace | implementation | ✅ | [1](../docs/plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#expired-interactions) |
| expired-lock-check: Zámek běžných interakcí po expiraci – automatické ověření | verification | ✅ | [1](../docs/plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#expired-interactions) |
| expired-lock-dev: Zámek běžných interakcí po expiraci – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#expired-interactions) |
| expired-lock-accept: Zámek běžných interakcí po expiraci – živá akceptace DEV | acceptance | ✅ | [1](../docs/plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#expired-interactions) |
| environment-isolation-code: Oddělení SDK konfigurací a bezpečné cílení nástrojů – implementace | implementation | ✅ | [1](../docs/operations/WEB_ENVIRONMENTS.md) |
| environment-isolation-check: Oddělení SDK konfigurací a bezpečné cílení nástrojů – automatické ověření | verification | ✅ | [1](../docs/operations/WEB_ENVIRONMENTS.md) |
| production-services: Produkční runtime služby, přístupy a tajemství | deployment | ⬜ | — |
| production-accounts: Minimální service accounts a audit oprávnění | verification | ⬜ | — |
| production-isolation-accept: Živá akceptace oddělení aplikace a prostředí | acceptance | ⬜ | — |
| production-web-general: Produkční průchod běžného účtu | acceptance | ⬜ | — |
| production-web-business: Produkční průchod Business účtu | acceptance | ⬜ | — |
| production-web-staff: Produkční průchod staff účtu | acceptance | ⬜ | — |
| auth-action-handler: Připravený webový handler a návratové adresy Auth | implementation | ✅ | [1](../docs/archive/BACKLOG_2026-11-12.txt), [2](../lib/web_environment.dart) |
| auth-action-production: Přepnutí globální produkční Action URL | deployment | ⬜ | — |
| auth-action-accept: Živý produkční reset/ověření a návrat do aplikace | acceptance | ⬜ | — |
| email-templates: Produkční odesílatel a lokalizované šablony | implementation | ⬜ | — |
| email-delivery: Ověřit doručitelnost včetně Email.cz | acceptance | ⬜ | — |
| web-location-mobile: Poloha/feed/publikace mimo Litoměřice na mobilním webu | acceptance | ⬜ | — |
| web-location-desktop: Poloha/feed/publikace mimo Litoměřice na desktopu | acceptance | ⬜ | — |
| geography-api: Geocoding API a serverový secret | deployment | ⬜ | — |
| geography-deploy: Nasazení obohacení, Rules a indexů | deployment | ⬜ | — |
| geography-backfill: Kontrolovaný geografický backfill | deployment | ⬜ | — |
| geography-accept: Ověřit regiony, ISO fallback a moderaci | acceptance | ⬜ | — |
| account-lifecycle-code: Mazání účtu, archiv, identita a 60denní purge – implementace | implementation | ✅ | [1](../docs/plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#aktualni-stav) |
| account-lifecycle-check: Mazání účtu, archiv, identita a 60denní purge – automatické ověření | verification | ✅ | [1](../docs/plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#aktualni-stav) |
| account-lifecycle-dev: Mazání účtu, archiv, identita a 60denní purge – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#aktualni-stav) |
| account-lifecycle-accept: Mazání účtu, archiv, identita a 60denní purge – živá akceptace DEV | acceptance | ✅ | [1](../docs/plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#aktualni-stav) |
| shout-expiration-code: Serverová materializace exspirace s writerem – implementace | implementation | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| shout-expiration-check: Serverová materializace exspirace s writerem – automatické ověření | verification | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| shout-expiration-dev: Serverová materializace exspirace s writerem – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/PROJECT_STATUS.md#serverova-brana) |
| shout-expiration-accept: Serverová materializace exspirace s writerem – živá akceptace DEV | acceptance | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| expired-cleanup-code: Sedmidenní fyzický úklid Shoutů a potomků – implementace | implementation | ⬜ | — |
| expired-cleanup-check: Sedmidenní fyzický úklid Shoutů a potomků – automatické ověření | verification | ⬜ | — |
| expired-cleanup-dev: Sedmidenní fyzický úklid Shoutů a potomků – nasazení DEV | deployment | ⬜ | — |
| expired-cleanup-accept: Sedmidenní fyzický úklid Shoutů a potomků – živá akceptace DEV | acceptance | ⬜ | — |
| lifecycle-production: Produkční aktivace a akceptace životního cyklu | acceptance | ⬜ | — |
| appcheck-content-code: App Check pro DEV obsahové operace – implementace | implementation | ✅ | [1](../docs/operations/SETUP_AND_OPERATIONS.md#4-app-check) |
| appcheck-content-check: App Check pro DEV obsahové operace – automatické ověření | verification | ✅ | [1](../docs/operations/SETUP_AND_OPERATIONS.md#4-app-check) |
| appcheck-content-dev: App Check pro DEV obsahové operace – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/operations/SETUP_AND_OPERATIONS.md#4-app-check) |
| appcheck-content-accept: App Check pro DEV obsahové operace – živá akceptace DEV | acceptance | ✅ | [1](../docs/operations/SETUP_AND_OPERATIONS.md#4-app-check) |
| registration-abuse: Ochrana registrace proti zneužití | implementation | ⬜ | — |
| appcheck-production: Produkční provider a metriky App Check | deployment | ⬜ | — |
| appcheck-enforcement: Ověřený produkční enforcement | acceptance | ⬜ | — |
| content-create-shout-code: Tvorba Shoutu – implementace | implementation | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-create-shout-check: Tvorba Shoutu – automatické ověření | verification | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-create-shout-dev: Tvorba Shoutu – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-create-shout-accept: Tvorba Shoutu – živá akceptace DEV | acceptance | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-create-comment-code: Tvorba komentáře – implementace | implementation | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-create-comment-check: Tvorba komentáře – automatické ověření | verification | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-create-comment-dev: Tvorba komentáře – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-create-comment-accept: Tvorba komentáře – živá akceptace DEV | acceptance | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-create-private-reply-code: Soukromé odpovědi – implementace | implementation | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-create-private-reply-check: Soukromé odpovědi – automatické ověření | verification | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-create-private-reply-dev: Soukromé odpovědi – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-create-private-reply-accept: Soukromé odpovědi – živá akceptace DEV | acceptance | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-shout-reaction-code: Reakce Shoutu – implementace | implementation | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-shout-reaction-check: Reakce Shoutu – automatické ověření | verification | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-shout-reaction-dev: Reakce Shoutu – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-shout-reaction-accept: Reakce Shoutu – živá akceptace DEV | acceptance | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-comment-reaction-code: Reakce komentáře – implementace | implementation | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-comment-reaction-check: Reakce komentáře – automatické ověření | verification | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-comment-reaction-dev: Reakce komentáře – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-comment-reaction-accept: Reakce komentáře – živá akceptace DEV | acceptance | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-shout-save-code: Uložení Shoutu – implementace | implementation | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-shout-save-check: Uložení Shoutu – automatické ověření | verification | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-shout-save-dev: Uložení Shoutu – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-shout-save-accept: Uložení Shoutu – živá akceptace DEV | acceptance | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-content-report-code: Hlášení obsahu – implementace | implementation | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-content-report-check: Hlášení obsahu – automatické ověření | verification | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-content-report-dev: Hlášení obsahu – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-content-report-accept: Hlášení obsahu – živá akceptace DEV | acceptance | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-delete-comment-code: Mazání komentáře – implementace | implementation | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-delete-comment-check: Mazání komentáře – automatické ověření | verification | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-delete-comment-dev: Mazání komentáře – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-delete-comment-accept: Mazání komentáře – živá akceptace DEV | acceptance | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-delete-shout-code: Mazání Shoutu – implementace | implementation | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-delete-shout-check: Mazání Shoutu – automatické ověření | verification | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-delete-shout-dev: Mazání Shoutu – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/PROJECT_STATUS.md#serverova-brana) |
| content-delete-shout-accept: Mazání Shoutu – živá akceptace DEV | acceptance | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| timed-operations-code: Sedmidenní idempotence a potvrzení operací – implementace | implementation | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| timed-operations-check: Sedmidenní idempotence a potvrzení operací – automatické ověření | verification | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| timed-operations-dev: Sedmidenní idempotence a potvrzení operací – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/PROJECT_STATUS.md#serverova-brana) |
| timed-operations-accept: Sedmidenní idempotence a potvrzení operací – živá akceptace DEV | acceptance | ✅ | [1](../docs/PROJECT_STATUS.md#serverova-brana) |
| shout-rules-cutover-code: Uzavření přímé tvorby a palců Shoutu – implementace | implementation | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni) |
| shout-rules-cutover-check: Uzavření přímé tvorby a palců Shoutu – automatické ověření | verification | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni) |
| shout-rules-cutover-dev: Uzavření přímé tvorby a palců Shoutu – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni) |
| shout-rules-cutover-accept: Uzavření přímé tvorby a palců Shoutu – živá akceptace DEV | acceptance | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni) |
| content-managed-cutover-code: Spravovaný feed – uzavření přímých odpovědí, reakcí a hlášení | implementation | ✅ | [1](../docs/MVP_SERVER_PLAN.md#authority-audit) |
| content-managed-cutover-check: Uzavření přímých obsahových zápisů – regrese | verification | ✅ | [1](../docs/MVP_SERVER_PLAN.md#authority-audit) |
| content-managed-cutover-dev: Uzavření přímých obsahových zápisů – ověřené DEV Rules | deployment | ✅ | [1](../docs/MVP_SERVER_PLAN.md#authority-audit) |
| content-remaining-authority: Zbývající přímé zápisy, čítače, limity a souřadnice | implementation | ⬜ | — |
| content-production-accept: Kompletní produkční akceptace obsahové brány | acceptance | ⬜ | — |
| moderation-archive-target-code: Auditovaný detail nahlášeného archivovaného komentáře – implementace | implementation | ✅ | [1](../docs/plans/accounts/ACCOUNT_CONTENT_ARCHIVE_PLAN.md) |
| moderation-archive-target-check: Auditovaný detail nahlášeného archivovaného komentáře – automatické ověření | verification | ✅ | [1](../docs/plans/accounts/ACCOUNT_CONTENT_ARCHIVE_PLAN.md) |
| moderation-archive-target-dev: Auditovaný detail nahlášeného archivovaného komentáře – nasazení DEV | deployment | ✅ | [1](../docs/PROJECT_STATUS.md#posledni-overene-nasazeni), [2](../docs/plans/accounts/ACCOUNT_CONTENT_ARCHIVE_PLAN.md) |
| moderation-archive-target-accept: Auditovaný detail nahlášeného archivovaného komentáře – živá akceptace DEV | acceptance | ✅ | [1](../docs/plans/accounts/ACCOUNT_CONTENT_ARCHIVE_PLAN.md) |
| moderation-decision: Atomické serverové rozhodnutí a audit | implementation | ⬜ | — |
| moderation-business: Zamítnutí/pozastavení Business účtu a audit | implementation | ⬜ | — |
| moderation-regression: Úplná ruční regrese rolí, rozsahů a postihů | acceptance | ⬜ | — |
| moderation-production: Produkční aktivace moderace | acceptance | ⬜ | — |
| business-deletion-fence-code: Ochrana Business aktivace proti návratu smazaného účtu – implementace | implementation | ✅ | [1](../docs/plans/accounts/ACCOUNT_PUBLIC_IDENTITY_PLAN.md) |
| business-deletion-fence-check: Ochrana Business aktivace proti návratu smazaného účtu – automatické ověření | verification | ✅ | [1](../docs/plans/accounts/ACCOUNT_PUBLIC_IDENTITY_PLAN.md) |
| business-endtoend: Dopracovat všechna zbývající Business kritéria | implementation | ⬜ | — |
| business-endtoend-accept: Živá akceptace celého Business toku | acceptance | ⬜ | — |
| business-promo-limit-code: Serverový limit současně aktivního firemního promo obsahu – implementace | implementation | ⬜ | — |
| business-promo-limit-check: Serverový limit současně aktivního firemního promo obsahu – automatické ověření | verification | ⬜ | — |
| business-authority-final: Úplná serverová oprávnění a produkční akceptace bezplatných funkcí | acceptance | ⬜ | — |
| translation-full-audit: Audit všech sedmi jazyků a všech obrazovek | verification | ⬜ | — |
| accessibility-audit: Audit přístupnosti webu | verification | ⬜ | — |
| web-layout-accept: Mobilní/desktopové rozložení a vizuální regrese | acceptance | ⬜ | [1](../docs/operations/CONSOLE_WARNINGS.md#category-font-dev-rollout), [2](../tools/diagnostics/font_warning_probe.dart) |
| translation-accept: Finální kontrola přetečení, diakritiky a plurálů | acceptance | ⬜ | — |
| regression-general: Závěrečná ruční regrese běžného účtu | acceptance | ⬜ | [1](../docs/operations/CONSOLE_WARNINGS.md) |
| regression-business: Závěrečná ruční regrese Business účtu | acceptance | ⬜ | — |
| regression-staff: Závěrečná ruční regrese staff účtu | acceptance | ⬜ | — |
| regression-network: Závěrečná regrese pomalé/přerušované sítě | acceptance | ⬜ | — |
| legal-operator: Skutečný provozovatel a kontakty podpory | implementation | ⬜ | — |
| legal-review: Právní kontrola veřejných textů | verification | ⬜ | — |
| legal-subject-rights: Postup práv subjektů údajů a provozní odpovědnost | acceptance | ⬜ | — |
| capacity-local-code: Reprodukovatelný model kapacity a cílené emulátorové ověření – implementace | implementation | ✅ | [1](../docs/operations/CAPACITY_AND_SCALING.md) |
| capacity-local-check: Reprodukovatelný model kapacity a cílené emulátorové ověření – automatické ověření | verification | ✅ | [1](../docs/operations/CAPACITY_AND_SCALING.md) |
| capacity-cloud: Schválený cloudový test 100 000 účtů / 5 000 aktivních relací | acceptance | ⬜ | — |
| capacity-autoscaling: Měřená konfigurace automatického škálování | implementation | ⬜ | — |
| maintenance-capacity: Kapacita a pokračování retenční údržby | verification | ⬜ | — |
| ops-monitoring: Produkční monitoring a minimální metriky | deployment | ⬜ | — |
| ops-budget: Produkční rozpočty, kvóty a upozornění | deployment | ⬜ | — |
| ops-backup: Zálohy a ověřená obnova | acceptance | ⬜ | — |
| ops-rollback: Ověřený produkční rollback a incident postup | acceptance | ⬜ | — |
| release-ci: CI přesného produkčního release kandidáta | verification | ⬜ | — |
| release-build: Čistý produkční webový build | verification | ⬜ | — |
| release-defects: Odstranění blokujících vad release kandidáta | acceptance | ⬜ | — |
| launch-gate: Kompletní předstartovní checklist a rozhodnutí o rizicích | acceptance | ⬜ | — |
| launch-release: Schválený main/tag a produkční nasazení | deployment | ⬜ | — |
| launch-smoke: Živá povydávací kontrola veřejného webu | acceptance | ⬜ | — |
| technical-ttl-config: Připravená TTL konfigurace technických logů | implementation | ✅ | [1](../firestore.indexes.json) |
| technical-ttl-cost: Změřit a schválit účtovaná TTL mazání | verification | ⬜ | — |
| technical-ttl-activate: Cílená aktivace TTL a ověření | acceptance | ⬜ | — |
| tutorial-existing: Připravený kontextový průvodce v klientu | implementation | ✅ | [1](../lib/interactive_tutorial.dart), [2](../docs/archive/BACKLOG_2026-11-12.txt) |
| tutorial-complete: Dokončit celé schválené zadání průvodce | implementation | ⬜ | — |
| tutorial-verify: Ověřit přerušení, návrat a persistence | verification | ⬜ | — |
| tutorial-activate: Aktivace a živý průchod | acceptance | ⬜ | — |
<!-- progress:details:end -->
