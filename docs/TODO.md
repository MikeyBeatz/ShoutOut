# ShoutOut – priority a milníky

Aktualizováno 27. listopadu 2026. Tento přehled určuje pořadí otevřené práce.
Aktuální kód a ověřené nasazení jsou v [PROJECT_STATUS](PROJECT_STATUS.md),
podrobné úkoly v [BACKLOG](BACKLOG.md), podmínky serverových milníků v
[MVP_SERVER_PLAN](MVP_SERVER_PLAN.md). Neobsahuje chronologii rolloutů.

## Postup

### Postup do MVP

<!-- progress:mvp:start -->
`████████████████████████░░░░░░░░░░░░░░░░` **62,01 %** — vážené dokončení podúseků

Hotové úseky: **242/294**. Celé milníky: **9/24**; rozpracované: 11.
<!-- progress:mvp:end -->

Stupnice započítává i doložené podúseky otevřených milníků. Celé milníky a
startovní brána se tím neobcházejí. [Evidence a pravidla](PROGRESS.md).

### Postup celého backlogu

<!-- progress:backlog:start -->
`████████████████████████████░░░░░░░░░░░░` **70,14 %** — vážené dokončení podúseků

Hotové úseky: **210/313**. Celé položky: **108/158**; rozpracované: 7.
<!-- progress:backlog:end -->

Původních 157 hlavních položek zůstává zachovaných; 23. listopadu přibyla
jedna nová položka po MVP, celkem nyní 158. Nižší procento po rozšíření
neznamená ztrátu dokončené práce. Podúseky mají pevné váhy a společnou
[evidenci](progress.json); výpočet zahrnuje i práci po MVP.

## Nejbližší práce

**Hotovo: indexová oprava Mé shouty v DEV; pokračuje stejný archivní pilot.**
[Příčina a kontrolní bod](plans/accounts/ARCHIVE_LEGACY_DEV_ASSESSMENT.md#own-history-index-fix).
Jeden pilotní Shout A pod TestBusiness je archivovaný a autorsky navázaný;
jeho skutečné přijetí podmínek je ověřené. Aktivní/Expirované blokuje chybějící
publicUntil index. Zdroj 7c6a122 má úspěšné úplné CI 46065640727; jediný nový
DEV index CICAgNjpr5sK je READY a oba živé dotazy i kurzory prošly.
Uživatel potvrdil opravené Mé shouty/detail pod TestBusiness. Nyní ověřuje
jediný veřejný komentář a soukromou odpověď, obojí připravené/archivované pod
Bright_Otter_182; žádný nový Auth. Čeká nahlášení testovacího komentáře.
Dohledání/detail pod TestAdmin už potvrzené včetně auditů.
Samotná indexová oprava nevytvořila fixture/Auth a nezměnila web/Functions/Rules/TTL ani retenci.

**Hotovo: oprava přímého čtení veřejných zdrojů v DEV.**
[Nálezy, regrese a nasazení](plans/accounts/ARCHIVE_LEGACY_DEV_ASSESSMENT.md#public-source-read-fix):
zdroj c361526 /[úplné CI 46043558742 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46043558742),
Rules 88a94380-2b88-4f37-8ed9-47dc9ab88a89 a 22 serverových simulací vydané verze.
Vlastní historie a účastnické soukromé čtení zachované; web/Functions/job beze
změny. Tento Rules úsek nevytvořil fixture/Auth; navazující pilot už běží výše.

**Dosavadní automatická DEV část archivu je hotová; zbývá společný ruční pilot.**
[Nasazení, převod a provozní důkazy](plans/accounts/ARCHIVE_LEGACY_DEV_ASSESSMENT.md#gc-dev-verification).
Archivní web a 29 Functions: zdroj 5435855847bc81c76a05f1e6f18d5b68b636367b /
[úplné CI 46013597685 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46013597685).
Dva účtové workery: opravený GC zdroj bd81e98ddab2b5e0e6f62410e302e9824e547f18 /
[úplné CI 46020290663 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46020290663).
Aktivní vývoj: fix/archive-own-history-index, build/reviews/content-lifecycle-0421.

**Živý stav:** Hosting 14a0f588585839e2, Rules 88a94380-2b88-4f37-8ed9-47dc9ab88a89.
31 ACTIVE Functions, ověřené skutečné zdrojové archivy, starší revize RETIRED,
stejné prostředky a dva plánovače. Čtení/identita/capture/údržba a právní verze
2026-11-27 zapnuté. Úklid 11 MVP kořenů a tří hlášení, převod 128 zdrojů,
čerstvý audit 165 položek ready a 18 selektivních indexových operací bez TTL hotové.

První obsahový dluh doběhl podle původních termínů: 125 zdrojových kopií pryč,
9 platných archivních těl zachovaných; zůstávají 1 Shout /1 komentář /1 soukromá
odpověď a 6 platných hlaviček. Původní pending žádost nezměněná, její Auth
chyběl už před prací, původní joby absent. GC nález uzavřený: dva skutečné běhy
nové revize INFO /gc:complete, všechny chybové příznaky 0, lifecycle idle.

**Další krok:** společný ruční pilot archivu/identity, podkladu hlášení po
smazání zdroje a vlastního smazání bez přijetí nové verze; potom vymezený úklid
a naplánovaná souhrnná revize před MVP regresí. Nové pilotní fixture/Auth dosud
nevytvořené; právní souhlasy se nikdy nevyplnily za uživatele. Kontaktní pokrytí
vzniká z doloženého Auth pozorování po skutečném přijetí. Živá akceptace
stále otevřená; nasazení je ve stupnici započtené samostatně. Produkce/main
beze změny. Návratový profil zachovává nové čtení/capture/právo/identitu.

Pracovat po [ucelených funkčních úsecích](operations/RELEASING.md#development-checkpoints):
průběžné lokální kontroly, seskupený push/CI před nasazením a následný DEV průchod.

**Nyní: schválený místní společný archiv Shoutů, komentářů a soukromých odpovědí.**
[Základ a pravidla cyklu](MVP_SERVER_PLAN.md#content-lifecycle-local-foundation):
konec platnosti +7 dní vlastní historie +60 dní archivu, dřívější účtový termín
má přednost. Připravené a úplným CI ověřené jsou jádro,
[webové seznamy](MVP_SERVER_PLAN.md#content-lifecycle-read-integration),
[worker](MVP_SERVER_PLAN.md#content-lifecycle-runtime-local),
[převzetí zdrojů](MVP_SERVER_PLAN.md#content-lifecycle-source-adoption),
[vazby hlášení](MVP_SERVER_PLAN.md#content-lifecycle-report-adoption) a
[termíny účtových kopií](MVP_SERVER_PLAN.md#content-lifecycle-account-adoption).
Přesné zdroje a důkazy jsou v plánu a [PROJECT_STATUS](PROJECT_STATUS.md).

**Doložené předchozí jádro:** [původní verze těl a společné čtení účtových
kopií pro moderaci](MVP_SERVER_PLAN.md#content-lifecycle-account-evidence).
Původní SDK čas/hash se zachová před zápisem metadat; nejasná verze se neodhaduje.
Zdroj 98323a2 má [úspěšné úplné CI 45868647751](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45868647751)
se 115 archivními případy včetně 19 nových a webovým buildem.

**Dokončený společný místní úsek:** [řízený operátor/inventura,
indexový plán a kompatibilita](MVP_SERVER_PLAN.md#content-lifecycle-transition-preparation)
starých účtových běhů a nativního čtení. Zdroj 4544366 má
[úspěšné úplné CI 45883719658](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45883719658),
včetně 140 archivních případů a webového buildu. Nyní naváže závěrečná integrace
a provozní/návratový plán. Před DEV aktivací také archivní
integrační revize. Nové přepínače a Rules brána jsou false; nic z tohoto cyklu
není nasazené ani živě migrované. Celý milník ani původní pilotní úklid se
tím neuzavírá; po MVP zůstává další revize cyklu.

Stupnice má od 26. listopadu schválené jemnější členění stejné zbývající váhy:
zdroje, hlášení, účtové termíny, verze/čtení, operátor/indexy, kompatibilita,
závěrečná integrace. Doložené místní celky se započítávají samostatně;
nasazení a živá akceptace zůstávají oddělené a otevřené.

**Naplánovaná souhrnná revize dosavadní práce:** po dokončení nynějšího
archivního/moderačního cyklu a před společnou regresí mvp-20 provést
[kontrolu hotových kroků a jejich návazností](LAUNCH_READINESS.md#completed-work-review).
Před DEV aktivací archivu také jeho samostatná integrační revize; nyní se
žádný z těchto auditů neoznačuje za dokončený.

**Drobná oprava IDE dokončená lokálně:** [vyloučení cizích Dart šablon npm](operations/TESTING.md#dart-dependency-templates).
Celá flutter analyze nyní bez nálezů; žádný nový MVP kredit, build či rollout.

**Odbočka ke konzoli – fontová oprava dokončená v DEV:**
[Důkazy](operations/CONSOLE_WARNINGS.md#category-font-dev-rollout): 9e3828d má
success úplné CI 44178308912, verze 74d0c3756884ac19 je nasazená a ověřená
na obou doménách. Sedm místních fontových scénářů, 26 Shout testů a celý CI
průchod prošly. Odstraněné jsou jen dva selektory pevných symbolů; CSP/QUIC
zůstávají samostatnou evidencí a jejich oprava se netvrdí. Celý vizuální audit
není tím hotový; B2 má samostatnou uzavřenou akceptaci níže. Metriky a jejich pevné váhy jsou zachované.
Vlastník potvrdil odstranění fontové hlášky; zbývající
[Intl.v8BreakIterator deprecation](operations/CONSOLE_WARNINGS.md#intl-break-iterator)
je ve Flutter engine. Konkrétní lokální porovnání auto/full rendereru zatím
čeká na schválení; neměnit SDK/bootstrap ani potlačovat hlášky bez ověření.

**Předchozí uzavřený živý úsek:** [B4 metadata/cache – DEV akceptace a úklid](plans/feed/B4_DEV_ROLLOUT.md#delta-acceptance-complete).
Vlastník potvrdil oba účty a požadované UI/interakční průchody. Uklizeno
120 nových fixture a 138 jejich cloudových značek; původních 38 zdrojů a
pending žádost beze změny. Předchozí [B3 je také uzavřené](plans/feed/B3_DEV_ROLLOUT.md#b3-acceptance-complete).

**Uzavřený feed:** [B4 a finální DEV regrese](plans/feed/B4_DEV_ROLLOUT.md#feed-final-acceptance-complete).
Vlastník přijal řazení při pohybu i stabilní čtenou kartu. Po úplném CI
45218543240 success ze zdroje a8d13eb uklizeno 53 testovacích Shoutů a 54
cloudových read klíčů. Původních 38 zdrojů/pending žádost, 21 receipts,
ostatní data a provozní konfigurace zachované. Manifesty cleaned; znovu
neseedovat. Nové rollouty ani Auth účty nevznikly. A0–A3/B1–B4 mají hotovou
společnou DEV akceptaci; kapacitní a produkční brány tím uzavřené nejsou.
Diagnóza původního běžného okna zůstává samostatně odložená, bez mazání
místní fronty; příčina počáteční přechodné chyby nebyla potvrzená.

1. **Uzavřít zbývající serverové a předstartovní milníky.** Příští konkrétní
   úsek vždy vybrat podle závislostí v [serverovém plánu](MVP_SERVER_PLAN.md)
   a [startovní bráně](LAUNCH_READINESS.md), ne podle pořadí historických poznámek.
   **Probíhá společný sankční a Business úsek** na feature/moderation-business-dev:
   [Společný DEV přechod moderace a Business je nasazený](MVP_SERVER_PLAN.md#moderation-business-dev-results):
   **05fc1ed / úplné CI 45375019177 success**, tři nové a šest aktualizovaných
   Functions, web 507c7a0b950b74b2 a obě aktivní Rules brány. Údržba až po
   uzavření přímých zápisů; skutečné zdroje, revize, prostředky a plánovače
   ověřené. Původních 38 Shoutů/pending žádost zachované.
   **Probíhá jediný již schválený živý pilot, pak úklid.** TestAdmin ověřil
   zamítnutí; dočasný účet provedl resubmit, server checking/revize 2 se správným
   auditem. Vlastník mohl dodatek názvu zapomenout; změna pole živě neověřená,
   chyba nepotvrzená. Schválení TestAdmin ověřené: active/revize 3, profil/role 2
   a první pobočka. Manifest content-ready: 1 Shout / 2 komentáře / 1 zpráva /
   3 hlášení. Pozastavení TestAdmin ověřené: suspended/revize 4,
   zachovaná role 2/pobočka/starší Shout. [Oprava UI a fixture nasazená v DEV](MVP_SERVER_PLAN.md#business-suspension-ui-repair-results):
   **3ffe71a / úplné CI 45424330633 success**, web **2edf6b744dcbe95e**.
   Atomicky opraveny jen 3 avatarová pole ve dvou dokumentech dočasného UID;
   parser chrání Profil, lišta/odhlášení čitelné, důvod přes Detail a krátký stav
   při publikování. Server/Rules, 19 kontrolovaných dokumentů a původní data zachované.
   Vlastník potvrdil celou ruční kontrolu opravy (lišta/Detail, krátká zpráva při
   publikování, Profil/odhlášení). **Reaktivace TestAdmin ověřená** active/revize 5,
   všech pět Business auditů/receipts správně. Tři postihy uložené, kratší ban
   nezkrátil sedmidenní; jeho následná revokace TestAdmin také ověřená.
   **Odchylka:** všechny TestAdmin nad Shoutem,
   nikoli plánovaný TestModerator/komentář. [Vlastník přijal přesné admin důkazy](MVP_SERVER_PLAN.md#moderation-business-observed-admin-proposal);
   úzká volitelná výjimka nástroje prošla 24 emulátorovými / 115 nástrojovými
   kontrolami a lintem; **3ec9664 / úplné CI 45486072998 success**. Žádné změny auditu/rolí,
   regionální sankční průchod se netvrdí. Ban UI do 1. prosince i odhlášení
   potvrzené. Osiřelý komentář připraven, druhý zachovaný, počet/projekce 2 → 1.
   [UI stavů a historie je nasazené v DEV](MVP_SERVER_PLAN.md#moderation-user-history-ui):
   **aa43ae1 / úplné CI 45491348488 success**, web **f8f0b0338d6eb03d**.
   Otisky/8 HTTP kontrol ověřené, server/Rules/prostředky zachované.
   Vlastník potvrdil celý závěrečný ruční blok, oba resolve receipts/aktéři a
   2×HTTP 200 / Auth/App Check VALID ověřené; všechna hlášení resolved.
   **Nový nález před úklidem:** [neveřejné zachování nahlášeného obsahu po samostatném smazání](MVP_SERVER_PLAN.md#reported-content-evidence-proposal).
   Veřejná hlášení mají nyní jen reference, samostatné mazání není účtový archiv.
   Místní podklady hlášení schválené; místo lhůty od hlášení vlastník navrhl
   archiv všech Shoutů po sedmidenní historii. [Ověřená dokumentace a nový společný návrh](MVP_SERVER_PLAN.md#content-lifecycle-retention-review):
   60 dní po konci historie, nikoli pevně +68 dní pro libovolnou platnost;
   Business až +74 dní, ruční smazání nově 7 dní v historii. Rozšíření na
   všechny Shouty/komentáře/soukromé odpovědi schválené 25. listopadu včetně
   místní implementace/testů. Probíhá práce za vypnutou volbou; bez migrace
   či rolloutu. Po MVP proběhne revize cyklu. Úklid jediné fixture je odložený.
   Nové sankce ani obsah nezakládat.
   Předepsaný klientský průchod dokončený; úklid a nová retenční návaznost otevřené.
   Browser host nedostupný, náhradní ovládání zastavila kontrola URL.
   Ruční průchody jsou nyní na konci samostatné práce; nový souhlas není potřeba.
   Započítané pouze DEV aktivace, živá akceptace a celý milník stále otevřené.
   Sankce zachovají silnější aktivní postih; Business zamítnutí dovolí opravu
   a opětovné podání, pozastavení blokuje nové publikování bez odebrání role.
   Místní výsledky a historické úplné CI jsou v příslušných částech plánu.
   **Veřejné moderační odstranění má hotový [místní úsek](MVP_SERVER_PLAN.md#moderation-public-local-results):**
   jádro, neaktivní obě klientské obrazovky, 16/16 nových případů, 519 Flutter,
   110 tools a 179 unit, analyze/lint. Zdroj **ea1fde9** má
   [úspěšné úplné CI 45230513178](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45230513178).
   [DEV nasazení je ověřené](MVP_SERVER_PLAN.md#moderation-public-dev-results):
   zdroj 87d6687 / úplné CI 45238613178 success, nová veřejná callable,
   aktualizovaný cleanup a web 1974e34d52e2945b. Ostatní provoz a původní data
   zachované. [Živá akceptace i úklid jsou uzavřené](MVP_SERVER_PLAN.md#moderation-public-dev-complete):
   TestModerator, komentář 2 → 1 / kontrolní zachovaný, potom odstranění Shoutu;
   oba audity a 2×HTTP 200 s Auth/App Check VALID ověřené. Manifest **ada057d3**
   cleaned; všech 28 receipts a 26 rate dokumentů při úklidu zachováno, žádná
   fixture/read klíč nezůstaly. Pro tento pilot další ruční test není potřeba.
   Další otevřené části
   jsou živá akceptace sankcí/Business/osiřelých hlášení a celková předstartovní regrese.
   Níže jsou důkazy dříve uzavřených částí.
   **Místní úsek dokončený:** [společné schválení/eskalace/uzavření](MVP_SERVER_PLAN.md#moderation-basic-local)
   všech tří typů hlášení, místní server a neaktivní klient, testy a společné CI.
   Jde o historický místní checkpoint; navazující DEV přechod je uzavřený níže.
   [Místní výsledek](MVP_SERVER_PLAN.md#moderation-basic-local-results): jádro,
   neaktivní klient a testy hotové; 18 nových emulátorových, 15 purge, 509 Flutter,
   108 nástrojových a 177 unit prošlo. Zdroj 7746bbd má
   [úspěšné úplné CI 45177013854](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45177013854),
   včetně 142 retenčních testů a webového buildu.
   **Navazující DEV je uzavřený:** [akceptace a úklid](MVP_SERVER_PLAN.md#moderation-basic-dev-complete).
   Server 44e07a5 / úplné CI 45196844737 success; opravený web 33853a9 /
   úplné CI 45202922410 success, Hosting 565880d4664da7b2. Všechny 4 živé
   akce správných TestModerator/TestAdmin mají audit, HTTP 200 a platný
   Auth/App Check. Jediný pilot je cleaned; 10 receipts a 23 rate dokumentů,
   91 původních zdrojů/pending žádost zachované. Další konkrétní rozsah:
   veřejné odstranění, následně sankce a společný Rules cutover. Celý
   moderační milník zůstává otevřený; cleaned fixture znovu nevytvářet.
   **Poslední uzavřený DEV úsek:** [vlastní mazání soukromých odpovědí](MVP_SERVER_PLAN.md#private-deletion-dev-complete).
   App 9c2e121 / úplné CI 45096691292 success, Rules 9fee32e / úplné CI
   45098775591 success. Oba účty prošly skutečným UI/callable mazáním s Auth
   a App Check VALID. DEV Rules **e16b7a3d-f363-499c-ad40-262471059271** mají
   přesnou shodu zdroje a 8/8 scénářů serverové simulace; přímý autentizovaný
   HTTP DELETE z prohlížeče tato kontrola neměřila. Hosting 813f34b7555e272a,
   Functions/prostředky/plánovače zachované. Nový pilot je uklizený včetně
   notifikací a cloudové read značky, 5 potvrzení ponechaných +7 dní;
   všech 91 původních zdrojů/pending žádost zachované. Manifest cleaned,
   znovu neseedovat. Implementace, ověření, DEV i akceptace této části uzavřené.
   **Nově uzavřený DEV úsek:** [soukromé odstranění bez postihu](MVP_SERVER_PLAN.md#moderation-private-dev-complete).
   App/server 0fa2774 / úplné CI 45147594322 success; samostatný Rules zdroj
   40e127f / úplné CI 45164557897 success. Místních 49/49 emulátorových testů
   a 16/16 serverových simulací vydaného Rules zdroje prošlo.
   Rules **3de8f7d8…de297** mají ověřenou shodu zdroje a uzavřené managed
   private delete/contentRemoved. Vlastník přijal skutečný průchod TestAdmin;
   regionální živé ověření tím netvrdit. Vymezená fixture je uklizená,
   5 potvrzení ponechaných +7 dní, kvóty beze resetu. Původních 91 zdrojů,
   pending žádost, 22 Functions, oba plánovače a web b5703cec19978454 zachované.
   Přijatý manifest je cleaned, původní je jen historický; znovu neseedovat.
   Kompletní DEV/akceptace této operace se započítávají; celý moderační
   milník a ostatní rozhodnutí zůstávají otevřené.
   Další atomická rozhodnutí/regionální autoritu připravit
   podle [auditu](MVP_SERVER_PLAN.md#private-deletion-preparation).
   Nezaměňovat dokončení vlastního mazání za celý obsahový milník.
   Pohybový test i staré feed fixture jsou nyní uzavřené výše. Regionální
   živá regrese soukromého odstranění zůstává otevřená; přijatý TestAdmin
   průchod a novější approve/resolve/escalate ji nenahrazují.

## Hranice MVP

Kapacitní cíl je 100 000 registrovaných účtů a 5 000 současně aktivních
uživatelů; měřitelné výkonové podmínky ještě určí [startovní brána](LAUNCH_READINESS.md#capacity-target).

MVP je pro tento projekt **produkčně provozovatelná veřejná webová aplikace
ShoutOut pro běžné uživatele a Business účty**. Obě části stávajícího webového
rozhraní musí být dokončené a funkční: registrace a správa účtu, feed a tvorba
Shoutů, interakce, veřejné profily, Business registrace a aktivace, pobočky,
loga a dosavadní bezplatné propagační funkce. Současné webové moderační
rozhraní musí umožnit bezpečný provoz této veřejné aplikace. Všechny
rozpracované toky, které tyto funkce potřebují, se dokončí před vydáním.

Webová aplikace bude na `go.shoutout-app.eu` ve stávajícím produkčním projektu
`shoutout-production-a1b34`, který sdílí se vstupní stránkou na `shoutout-app.eu`.
Každá část bude mít vlastní Hosting site, obsah a nasazování. Vývojový web a
data zůstávají v projektu `shoutout-dev-46c81`. Produkční SDK konfigurace je
v `config/prod.json`; app Hosting site `shoutout-go-a1b34` je vytvořený a
propojený s registrovanou webovou aplikací. Vlastní doména je `Connected` a má
platné HTTPS; runtime služby a první nasazení aplikace ještě zbývají.

Android a iOS, jejich distribuce a Business monetizace formou předplatného
zůstávají v plánu po webovém MVP. Již při webovém MVP musí mít bezplatné
Business funkce bezpečná oprávnění a datový základ oddělený od ceny, aby
pozdější předplatné, platby a fakturace nevyžadovaly zásadní změnu účtů. Veřejné
vydání webu nadále vyžaduje produkční, bezpečnostní, právní, testovací a
provozní minimum v `docs/LAUNCH_READINESS.md`.

### Původní základ MVP (9 milníků)

1. ✅ <a id="mvp-01"></a> Základní registrace, ověření e-mailu, právní souhlas a profil.
2. ✅ <a id="mvp-02"></a> Lokální feed, vytvoření a životní stav Shoutu.
3. ✅ <a id="mvp-03"></a> Komentáře, odpovědi, reakce, ukládání, blokace a hlášení.
4. ✅ <a id="mvp-04"></a> Veřejné profily, Follow a oznámení uvnitř aplikace.
5. ✅ <a id="mvp-05"></a> Business registrace, pobočky a důvěryhodná ruční aktivace s auditem.
6. ✅ <a id="mvp-06"></a> Moderátorské rozhraní, role, regionální rozsahy a základní Rules ochrana.
7. ✅ <a id="mvp-07"></a> Web jako funkční vývojový cíl se sedmi jazyky.
8. ✅ <a id="mvp-08"></a> Automatické Flutter a Firestore Rules testy zapojené do CI.
9. ✅ <a id="mvp-09"></a> Připravit `go.shoutout-app.eu` a Hosting pro aplikaci odděleně od
   stávající prezentace. Ověřeno 25. října 2026: samostatný site, propojená
   webová aplikace, DNS a aktivní HTTPS. Produkční release patří do navazujících
   milníků a zatím není nasazený.

### Navazující milníky před MVP (15)

1. ⬜ <a id="mvp-10"></a> Nakonfigurovat aplikaci ve stávajícím projektu `shoutout-production-a1b34`,
   oddělit její Hosting site od vstupní stránky a bezpečně oddělit vývojová
   a produkční data i nástroje.
2. ⬜ <a id="mvp-11"></a> Ověřit doručitelnost e-mailů, produkční Auth domény, Action URL a šablony.
3. ⬜ <a id="mvp-12"></a> Ověřit polohu, feed a publikování v mobilním i desktopovém prohlížeči
   mimo Litoměřice.
4. ⬜ <a id="mvp-13"></a> Nasadit geografické obohacení, provést backfill a ověřit regionální data
   potřebná pro stávající moderaci.
5. ⬜ <a id="mvp-14"></a> Automatizovat expiraci Shoutů, mazání podkolekcí a dokončení 60denní
   retence účtu.
6. ⬜ <a id="mvp-15"></a> Dokončit webový App Check a ochranu registrace; vynucení zapnout až po
   ověření metrik.
7. ⬜ <a id="mvp-16"></a> Zavést důvěryhodnou serverovou bránu pro zápisy obsahu, čítače, polohu,
   idempotenci a limity proti spamu.
8. ⬜ <a id="mvp-17"></a> Dopracovat bezpečné moderátorské operace a jejich audit pro veřejný web,
   včetně zamítnutí a pozastavení Business účtů.
9. ⬜ <a id="mvp-18"></a> Serverově vynutit pravidla současných bezplatných Business funkcí a
    zachovat oddělení oprávnění od budoucí ceny.
10. ⬜ <a id="mvp-19"></a> Dokončit audit překladů, přístupnosti a rozložení webu v mobilní i
    desktopové šířce pro všech sedm jazyků.
11. ⬜ <a id="mvp-20"></a> Projít všechny webové ruční regresní scénáře běžného, Business i
    moderačního účtu včetně pomalé nebo přerušované sítě.
12. ⬜ <a id="mvp-21"></a> Doplnit skutečného provozovatele, podporu, právní kontrolu a proces práv
    subjektů údajů.
13. ⬜ <a id="mvp-22"></a> Nastavit monitoring, rozpočty, kvóty, zálohy, obnovu, rollback a
    minimální provozní metriky bez nadbytečných osobních údajů.
14. ⬜ <a id="mvp-23"></a> Spustit CI a produkční webový build a odstranit blokující vady.
15. ⬜ <a id="mvp-24"></a> Splnit webovou rozhodovací bránu v `docs/LAUNCH_READINESS.md` a výslovně
    přijmout nebo odstranit zbývající rizika.

### Práce po MVP

Po MVP patří vydání Androidu a iOS, kompletní placená Business monetizace,
interaktivní tutorial, telefonní ověření, FCM push a fan-out sledujícím a
obecné žebříčky či gamifikace. Tyto plány se neruší; zůstávají v detailním
backlogu v [BACKLOG.md](BACKLOG.md) se štítkem **Po MVP**.

Nově po MVP: [soukromé odpovědi v Mé shouty → Komentáře](plans/roadmap/PRIVATE_REPLY_HISTORY.md)
podle [bl-158](BACKLOG.md#bl-158). Jde o osobní přehled se zachováním soukromí;
do aktuálního dokončování MVP tuto implementaci nezařazovat.

Osobní přečtení, synchronizace zařízení, unread-first v Nejblíž a číslovaný
indikátor novinek (B1–B4) sem nepatří: vlastník je vybral před MVP.

Navazující mobilní etapa zachovává fyzické testování Androidu, Play Integrity,
podpis a Google Play, stejně jako sestavení iOS na Macu, App Attest, fyzický
iPhone, TestFlight a App Store. Úplný postup je v
`docs/plans/roadmap/MOBILE_DISTRIBUTION_PLAN.md`. Navazující Business etapa zachovává
záměr předplatného, otevřené rozhodnutí o placeném dosahu a Founder
zvýhodnění, platební integraci, fakturaci a důvěryhodné statistiky propagace
podle `docs/plans/roadmap/BUSINESS_MONETIZATION.md`. Business tokeny ani jejich nákup a
čerpání se neplánují. Ověření firmy přes
registry bylo naopak výslovně zrušeno; webové MVP počítá s ruční aktivací.

## Další otevřené oblasti

- [Produkce, App Check, antispam, moderace, retence, monitoring a závěrečná kontrola](MVP_SERVER_PLAN.md).
- [Produktové, grafické, překladové a Business podúkoly včetně všech původních checkboxů](BACKLOG.md).
- [Prezentační web a www přesměrování](BACKLOG.md#prezentační-web-před-mvp).
- [Povinná předstartovní brána](LAUNCH_READINESS.md).
- [Význam štítků a historická rozhodnutí](archive/README.md).

## Údržba dokumentace

Dokončený podkrok vyřadit z nejbližší práce a ponechat odkaz na výsledek v
PROJECT_STATUS nebo příslušném plánu. Nepoužívat názvy „bod 1/2“ bez kontextu.
Nový požadavek nejdřív zařadit do BACKLOG, nikoli do historie TODO.
Role dokumentů a kontrolní příkaz: [DOCUMENTATION_MAINTENANCE](DOCUMENTATION_MAINTENANCE.md).
Úplný předchozí obsah je zachovaný v [archivním indexu](archive/README.md).
