# ShoutOut – aktuální stav pro navázání práce

Souhrn k 27. listopadu 2026. Dokládá poslední ověřené výsledky; před dalším
nasazením znovu ověřit Git, CI a skutečný cíl. Úplná starší chronologie je v
[archivním indexu](archive/README.md), priority v [TODO](TODO.md).

## Další konkrétní krok

**Přípravný balík archivu dokončený:** [výsledky a další pořadí](plans/accounts/ARCHIVE_DEV_READINESS.md#úplné-ci-a-čtecí-dev-inventura--27-listopadu).
Zdroj **6e68e03d719aa66e45277204abce9a8bd3a2aa4e** má
[úspěšné úplné CI 45984217529](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45984217529):
600 aplikačních, 178 archivních, 483 Rules/transakčních a 151 retenčních
případů, browsery, ostatní sady, analýza, lint i build. Unit 225 pass /896 skip
nenahrazují emulátor. Vydaná hra zachovaná; vlastní smazání bez nového
přijetí a operátor doložených starých vazeb jsou připravené místně.
Čtecí DEV inventura potvrzuje 27 ACTIVE Functions, stejný web/Rules,
39 Shoutů /99 komentářů /1 soukromou odpověď a 18 indexových akcí v návrhu.
**Další brána:** 11 deleted Shoutů nemá přímo doložený původní čas
odstranění. Doložit původní důkaz nebo předložit konkrétní výjimky; datum
neodhadovat a migraci neobcházet. Pak konkrétní živý balík ke schválení.
Bez nasazení, nového klíče nebo živých zápisů. Nové volby false a skutečná
právní verze 2026-07-25; ruční testy na konec, dosud neověřené.

**Upřesnění archivu schválené 27. listopadu:** dohledání podle kontaktu
jen administrátor/owner; současné konečné termíny smazání zachovat.
[Konkrétní návrh dalšího místního úseku](plans/accounts/ARCHIVE_IDENTITY_LOOKUP.md).
Celý společný místní implementační úsek i testy jsou výslovně schválené.
Místní implementace a ověření jsou uzavřené ve větvi feature/archive-identity-integration;
zdroj **b1ed417c689884b496627eb907788d1b871d5a0d** má
[úspěšné úplné CI 45970322486](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45970322486).
Převzetí starého rodiče, oddělená právní informace, soukromý index a klient
zůstávají vypnuté; žádný rollout, živá migrace ani nový secret se neprovádí.


**MVP: společná místní integrace a dohledání účtů ověřené úplným CI.**
[Výsledek a přesné meze](MVP_SERVER_PLAN.md#archive-identity-local-integration).
Převzetí prvního rodiče, samostatná právní informace, návrat čtení po scrub,
kontaktní index a admin/owner náhled jsou otestované. Přesné CI doložilo 165
archivních případů, 583 aplikačních, 129 nástrojových, 482 Rules/transakčních a
151 retenčních; prošly také B4, moderace, B2, Storage, browsery, analýza, lint
a webový build. Serverové unit mají 222 pass /882 integračních skip; skip
nenahrazují výše uvedené skutečně spuštěné emulátorové sady.
Aktivní pracovní kopie je build/reviews/content-lifecycle-0421, izolovaná od hry
a nesouvisejících změn v kořenové větvi. Nic se nenasazuje; nové volby jsou false.


**Hotová společná místní příprava migrace:**
[rozsah a přechodové fáze](MVP_SERVER_PLAN.md#content-lifecycle-transition-preparation).
Připravené capture-only oddělení, staré účtové běhy a nativní čtení,
metadata vazeb hlášení bez kopií těl, indexový plán a obnovitelný operátor.
Zdroj **4544366dfc26a11c7f83c79ab8d406147abbcc6c** má
[úspěšné úplné CI 45883719658](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45883719658):
140 archivních případů, 482 Rules/transakcí, 150 případů konečného úklidu,
127 nástrojových a 216 serverových unit případů; prošly také aplikační/browserové
sady, analýza, lint a webový build. 858 integračních skip v unit kroku není důkazem
jejich ověření; výše uvedené emulátorové sady skutečně běžely bez selhání.
Operátor i kompatibilita mají uzavřenou implementaci a ověření ve stupnici.
Nové volby zůstávají false; nic z tohoto cyklu není nasazené ani živě inventarizované.

**Před jakoukoli aktivací zůstává samostatná provozní brána:**
[kontrolní bod](MVP_SERVER_PLAN.md#content-lifecycle-integration-review), poté konkrétní
provozní/návratový plán. Místní rodič/rollback regrese jsou připravené výše;
zvlášť určit veřejnou právní verzi, počáteční kontaktní/archivní pokrytí, živé
wrappery/klíč/indexy a fyzické nativní release podmínky. Tato provozní brána
ani živé nasazení se samotným CI neuzavírají.

**Aktuální místní práce – společný archiv obsahu:**
[základ a otevřené návaznosti](MVP_SERVER_PLAN.md#content-lifecycle-local-foundation),
větev feature/moderation-report-evidence. Připravené atomické kopie všech
tří typů obsahu, čtení konkrétního hlášení po smazání zdroje, účtové vazby,
anonymizace cizích odpovědí a obnovitelný běžný purge. Vlastní deleted historie
má vypnutou variantu jen ke čtení; právní texty jsou připravené v sedmi jazycích.
Nový serverový/klientský přepínač i Rules brána zůstávají false. Nic z toho
není nasazené ani migrované. Místní testy zahrnuly oba zapnuté účtové průchody,
50 zdrojů / 450 zápisů a skutečný indexový writer. Zdroj
**cea00c02035963da42208db30c99cec5c7ce1e59** má
[úspěšné úplné CI 45703037163](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45703037163),
včetně aplikačních/browserových a serverových sad i webového buildu.
Pauza nových těl zachovává splatný úklid; prošel také souběh dvou workerů.
**Navazující místní webové čtení připravené a ověřené:**
[serverové seznamy a web](MVP_SERVER_PLAN.md#content-lifecycle-read-integration)
pro Mé komentáře, profil, Business historii, staff a Home source-v1. Dávka
50 zdrojů má při dvou autorech 108 dokumentových reads / 4 dávková volání /
0 zápisů; nepočítá živé SDK odběry ani cloudový provoz. Ověřená řídká stránka,
kurzory, role/region, scroll, opakování a odmítnutí staré odpovědi. Zdroj
**8e059e3899c9658966c4a6d9ce52b11bb3a2e5af** má
[úspěšné úplné CI 45766451416](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45766451416),
včetně všech serverových regresí a webového buildu. Vše je off; živá UI akceptace
ani nativní kompatibilita se tím netvrdí.
**Další krok ve schváleném rozsahu:** řízený přechod existujících dat a
kompatibilita starých klientů; před aktivací také indexy, provozní profil a návrat.
Přísnější Rules jsou stále místní prototyp a nezapínají se.
Podrobný přechod starých dat a nová právní verze patří před jakoukoli aktivaci.
Po MVP je zapsaná další revize cyklu. Starý živý pilot zůstává zachovaný.

**Místní provozní adaptér připravený a ověřený:** [výsledky](MVP_SERVER_PLAN.md#content-lifecycle-runtime-local)
ve stejném minutovém workeru za samostatnou false volbou. Připravené sdílení
zdrojového rozpočtu, aby účtová fronta běžný úklid trvale neblokovala; ověřování
souběhu, restartu a operací prošlo v 53 emulátorových případech. Dvě generace,
ztracená odpověď a rozpočet 450 bez částečného zápisu; 207 unit pass / 756 skip,
25 nástrojových kontrol a lint prošly. Zdroj
**134cb960480de410841a069dacf91a45f42ae6ff** má
[úspěšné úplné CI 45815002033](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45815002033),
včetně celé dosavadní regrese a webového buildu.
Žádný rollout ani živá data. V plánu je
[integrační revize před DEV archivem](MVP_SERVER_PLAN.md#content-lifecycle-integration-review)
a [souhrnná revize hotových MVP kroků](LAUNCH_READINESS.md#completed-work-review)
po tomto cyklu před společnou regresí; obě zatím otevřené.

**Místní jádro převzetí zdrojů připravené a ověřené:** [rozsah a otevřené části](MVP_SERVER_PLAN.md#content-lifecycle-source-adoption).
Připravený přesný digest dávky do 50 zdrojů, původní termíny, SDK inkarnace,
společný indexový writer a odlišení pozdější kopie od atomického zápisu.
Nejasné staré smazání a probíhající účtový úklid se nepřevádí odhadem.
Starých hlášení/účtových kopií se tato dávka nedotýká; celkový přechod,
klientská kompatibilita a integrační audit zůstávají otevřené. Prošlo 14 cílených
migračních případů, společná archivní sada 52 případů a 18 klientských testů;
analýza bez nálezů. Zdroj **8d5b8906dac5141a23ddc3d9b07f2e6a3bc0a054** má
[úspěšné úplné CI 45826502401](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45826502401),
včetně společné regrese a webového buildu. Nové volby jsou false, bez nasazení
a živé migrace. Navazující přiřazení hlášení je shrnuté níže;
celý přechod dat a klientů není uzavřený.

**Místní vazby starých hlášení připravené a ověřené:** [rozsah a otevřené části](MVP_SERVER_PLAN.md#content-lifecycle-report-adoption).
Připravený převod metadat do 50 hlášení bez dalších kopií textů. Verze cíle
i rodiče se prokazuje přesnými SDK časy; geografie se neodvozuje z dnešního
rodiče. Prošlo 22 cílených případů, společný archivní běh 73 případů, 212
serverových unit testů a lint. Zdroj **0d6602f2d0fdd902522fd3ebe85d048fe0f4a418** má
[úspěšné úplné CI 45838228232](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45838228232),
včetně konečné společné archivní sady 77 případů a webového buildu.
Další krok: staré účtové kopie, celkový migrační operátor/audit a klientská
kompatibilita. Nativní detail stále čte původní textové pole hlášení;
bez jeho přechodu nelze nový datový cyklus aktivovat pro tyto klienty.
Žádné nasazení, Rules změny nebo živá data; nové volby zůstávají false.

**Místní termíny starých účtových kopií připravené a ověřené:** [rozsah, důkazy a návaznosti](MVP_SERVER_PLAN.md#content-lifecycle-account-adoption).
Převod metadat do 50 kopií zachová původní žádost, SDK identity a pendingArchiveId;
těla se neduplikují. Dřívější běžný termín omezí původních účtových 60 dní,
mezistav dávkového purge neodstaví úklid účtu. Prošlo 96 společných případů
včetně 19 nových, 214 serverových unit pass / 811 integračních skip a lint.
Naměřeno 112 dokumentových SDK reads / 6 čtecích volání / 50 zápisů u 50 kopií
jednoho rodiče; nejde o cloudovou kapacitu. Zdroj
**12785580e87241dd7a393bc96e111fc95ee7bb27** má
[úspěšné úplné CI 45861268034](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45861268034),
včetně 96 archivních případů a webového buildu.
Navazující zachování důkazu těla a společný reader jsou shrnuté níže.
Následují celý operátor/audit, staré účtové běhy, klienti a
indexový plán; tyto části zůstávají otevřené. Nové volby false, žádná živá data
ani nasazení; původní pilot zůstává zachovaný.

**Místní zachování verzí a společné čtení účtových kopií připravené:**
[kontrakt a otevřené brány](MVP_SERVER_PLAN.md#content-lifecycle-account-evidence).
Marker v2 zachovává původní SDK updateTime/hash před změnou metadat; v1
nepředstírá důkaz těla. Reader používá konkrétní hlášení, původní region a
pevné termíny; audit/receipt rozlišují skutečné účtové úložiště. Neznámá
verze či náhradní zdroj/kopie se odmítá. Klient má samostatné označení původu.
Zdroj **98323a2c9eeecfdd610a6d33b5e431f3ab5a0f01** má
[úspěšné úplné CI 45868647751](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45868647751):
115 archivních případů včetně 19 nových, 215 serverových unit pass / 830
integračních skip, dosavadní regrese/Rules, účtový/Storage úklid a webový build.
Místně prošly také lint, 4 klientské testy, analýza bez nálezů, 11 testů metrik
a 3 kontroly balíčku. Vnitřní čtení 11 SDK dokumentových reads / 5 volání,
opakování v téže transakci bez dalších reads; nejde o cloudové účtování.
Nic se nenasazuje; nové volby jsou false. Další konkrétní práce: řízený
operátor/inventura s indexovým plánem, poté kompatibilita starých účtových
běhů a klientů a závěrečná integrace. Celá migrace zůstává otevřená.

**Stupnice zpřesněná podle schválení vlastníka:** původních 98 +98 migračních
bodů je rozděleno do sedmi implementačních/ověřovacích celků. První tři jsou
doložené dosavadními úplnými CI; nasazení a akceptace zůstávají otevřené.
Metriky generuje nástroj z progress.json; nyní jsou doložené i implementace
a úplné ověření čtvrtého celku (verze těl/čtení). Podrobnosti v [metodice](PROGRESS.md).

**Společný DEV přechod moderace a Business je nasazený a technicky ověřený.**
[Důkazy, pořadí a návrat](MVP_SERVER_PLAN.md#moderation-business-dev-results).
Serverový zdroj **05fc1eddf51a2594524774b3ea4857d0e6ae2d1b**, větev
feature/moderation-business-dev, [úplné CI 45375019177 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45375019177).
Pouze shoutout-dev-46c81: tři nové callables, šest aktualizovaných Functions,
původní web **507c7a0b950b74b2** a Rules **82d8db43-d9e9-4bd1-ba3f-f530fa78da57**.
API/web → vyřazení starých revizí → uzavření přímých Rules zápisů → účtová
retenční údržba. Nové DEV volby jsou true; produkční konfigurace nezměněná.

**Předchozí DEV web:** [oprava pozastaveného Profilu](MVP_SERVER_PLAN.md#business-suspension-ui-repair-results),
zdroj **3ffe71ade738f3c80cc66c70a0970bb485382052**, fix/business-suspension-profile,
[úplné CI 45424330633 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45424330633),
Hosting **2edf6b744dcbe95e**. Bezpečný avatar parser, čitelná neutrální lišta
„Účet pozastaven“, důvod přes Detail, krátký stav při pokusu publikovat
a kontrastní dostupné odhlášení. Server/Rules/prostředky se tímto rolloutem neměnily.

**Aktuální DEV web – přehled detailu uživatele:**
[stav banu/tvorby a historie](MVP_SERVER_PLAN.md#moderation-user-history-ui).
Zdroj **aa43ae18e3ebd0b5ed9a0be77d2c8f00010c6a74**, fix/moderation-user-history,
[úplné CI 45491348488 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45491348488),
Hosting **f8f0b0338d6eb03d**. Shoda 67 app souborů a osm HTTP kontrol obou
domén ověřené; všech 27 Functions, oba plánovače i Rules beze změny.
23 cílených testů, analýza bez nálezů, následná barevná regrese a vizuální
kontrola skutečného světlého/tmavého tématu prošly. Vlastník potvrdil nový
přehled i celý závěrečný ruční blok; žádné datum auditu se nepřepisuje.

Všech devět skutečných source archivů přesně odpovídá release balíčkům;
27 ACTIVE Functions, ostatních 18 beze změny. Prostředky a oba minutové
plánovače zachované, provoz 100 % na nových revizích. Webové otisky i osm HTTP
kontrol obou domén souhlasí. Nad publikovanými Rules prošlo 20 simulací;
nejsou náhradou živého přihlášeného pilotu. Tři nová API bez ověření odmítla 401.
Původních 38 Shoutů/pending žádost beze změny, žádné účtové joby.

**Probíhá schválený společný živý pilot, potom úklid.** Vlastník potvrdil
přihlášení TestAdmin; vytvořen právě jeden nový dočasný ověřený Auth účet
a jeho profil/právní přijetí/Business žádost „MVP Business 926a31d2“.
Manifest v docs/local má fázi content-ready; reaktivace potvrzená active/revize 5,
Business profil active, zachovaná role 2 i aktivní první pobočka. Připraven právě jeden pilotní
Shout, dva komentáře, jedna soukromá odpověď a tři hlášení. Tři postihy už uložené:
varování / ban 7 dní / ban 1 den; kratší nezkrátil původní sedmidenní ban.
TestAdmin jej následně zrušil 24. listopadu 21:05 UTC: aktivní pointer odstraněný,
audit zrušení i +7denní receipt správné, jednodenní historie zachovaná.
**Odchylka pilotu:** všechny provedl it_admin nad Shoutem (varování report,
bany přímé pozorování), nikoli it_moderator nad druhým komentářem.
Vlastník výslovně přijal přesně tato tři potvrzení jako admin průchod.
[Úprava ověřování/úklidu](MVP_SERVER_PLAN.md#moderation-business-observed-admin-proposal)
je místně ověřená: 24 emulátorových / 115 nástrojových kontrol a lint prošly.
Samostatný místní důkaz váže původní digest, konkrétní UID, tři přesné receipts
a jejich otisky; výchozí guard zůstává přísný. Zdroj **3ec9664cf406fb18cdb531a0cad84689a5e07361** má
[úspěšné úplné CI 45486072998](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45486072998).
Audit, role ani živá data se touto opravou nemění.
Regionální sankční oprávnění tím nejsou živě prokázaná. Vlastník potvrdil
obrazovku banu do 1. prosince a dostupné odhlášení.
První zamítnutí TestAdmin už potvrzené klientem, auditem/receipt a HTTP 200
s Auth/App Check VALID. Resubmit je také potvrzený auditem/receipt a HTTP 200
s platným Auth/App Check. Vlastník mohl dodatek názvu zapomenout; chyba ukládání
není potvrzená a změna pole v živém resubmit zatím není ověřená. Schválení TestAdmin
má správný audit/receipt a HTTP 200 s platným Auth/App Check. Pozastavení má také
správný audit/receipt a platné Auth/App Check; dřívější Shout zůstává active.
**UI nález opravený v DEV a potvrzený vlastníkem.** Šedý Profil byl
reprodukovaný z chyby generátoru fixture (barvy avataru jako int). Po výslovném
souhlasu a úplném CI atomicky opraveny jen avatarId a dvě barvy ve users/publicProfiles
jediného dočasného UID, fox/teal/navy. Změna skutečně zasáhla dva dokumenty;
19 kontrolovaných pilotních dokumentů/jejich updateTime a neavatarová pole
obou opravených dokumentů beze změny. Při této UI opravě nové účty/obsah/postihy nevznikly.
Místně 15 klientských / 23 emulátorových / 113 nástrojových kontrol, oba vzhledy
vizuálně prověřené; celý následný CI prošel. Webové otisky a osm HTTP kontrol
na obou doménách souhlasí. Vlastník potvrdil „vše funguje“ u čitelnosti/Detailu,
krátkého stavu při publikování a Profil → Odhlásit se s návratem na přihlášení.
Reaktivace TestAdmin potvrzená klientem, auditem i HTTP 200 s Auth/App Check VALID;
všech pět Business receipts/revizí/aktérů a původní 7denní lhůta souhlasí.
Po úplném CI nástroje připraven osiřelý cíl: odstraněný pouze první fixture
komentář přes writer, druhý zachovaný, počet i živá projekce **2 → 1**,
jeho hlášení bylo následně uzavřené správným TestModerator. Nový seed ani Auth nevznikl.
**Závěrečný ruční blok prošel:** přehled/obnovený přístup/formulář bez publikace
i obě rozhodnutí. Server potvrdil TestAdmin resolve soukromého hlášení a
TestModerator resolve osiřelého komentáře, 2×POST HTTP 200, Auth/App Check VALID,
oba receipts s původními +7 dny. Všechna tři hlášení resolved.
[Podklady a nový nález](MVP_SERVER_PLAN.md#moderation-business-final-client-results).
**Úklid odložený kvůli kontrole podkladů.** Vlastník požaduje čitelný nahlášený
obsah i po odstranění zdroje. [Ověřená mezera a navržený místní úsek](MVP_SERVER_PLAN.md#reported-content-evidence-proposal):
veřejné reporty mají pouze reference, běžné mazání komentář fyzicky odstraní;
účtový archiv nevzniká při jednotlivém mazání. Samotný pilotní Shout stále existuje.
Vlastník schválil místní úsek podkladů hlášení, ale místo lhůty od prvního
hlášení požaduje prověřit obecný cyklus všech Shoutů: platnost → 7 dní vlastní
historie → 60 dní archivu. [Výsledek kontroly a sjednocený návrh](MVP_SERVER_PLAN.md#content-lifecycle-retention-review).
Obecný +60denní archiv po historii v původní dokumentaci není; dosavadní
„všechny zprávy/komentáře“ se týká smazání účtu. Současný kód běžně dovolí až
24 h, Business až 7 dní, ručně deleted Shout z vlastní historie vyřadí hned.
Předložené rozšíření místního úseku: neveřejná kopie při vytvoření všech Shoutů/
komentářů/soukromých odpovědí, historie 7 dní od skutečného konce včetně ručního
smazání, pevný purge o 60 dní později; obvykle +68 dní, Business až +74 dní.
Vlastník 25. listopadu schválil celý širší místní rozsah a požaduje jeho
revizi po MVP. Začala implementace za vypnutou volbou; neproběhlo nasazení,
živá migrace ani změna dat. Místní ověření a společné CI ještě nejsou hotové.
Pilotní úklid zůstává odložený.
Další obsah nezakládat. Původních 38 zdrojů
a původní žádost zachované; celý rozsah již schválený, znovu se nedotazovat.
Browser host je nedostupný;
24. listopadu náhradní ovládání zastavila automatická kontrola neověřitelné URL.
Další UI vstupy až po novém ověření dostupnosti; nejde o závadu aplikace.
Ruční průchody zůstaly na konci samostatné práce. Živá akceptace, Business
kritéria duplicit/sporů a celý moderační milník zůstávají otevřené.

Předchozí místní kontrolní body a výsledky jsou v
[serverovém plánu](MVP_SERVER_PLAN.md#moderation-business-dev-next-proposal).
První CI db13fed / 45374082977 selhalo na dvou starších konfiguračních testech;
opravené pouze fixture, celých 543 Flutter testů i nové úplné CI prošly.
Tento neúspěšný zdroj se nenasazoval. Metriky započítávají samostatně čtyři
DEV sekce, nikoli živou akceptaci. Staré cleaned piloty znovu nevytvářet.

## Předchozí uzavřené úseky

**Veřejné moderační odstranění má uzavřenou DEV akceptaci i úklid.**
[Důkazy a pokračování](MVP_SERVER_PLAN.md#moderation-public-dev-complete).
Zdroj **87d6687f17eafa670dcaf115665439bdd5597227** má
[úspěšné úplné CI 45238613178](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45238613178).
Nová removeReportedPublicContent **00001-yaw**, cleanup **00008-fal**, web
**1974e34d52e2945b**; serverPublicReportRemoval true jen DEV. Prostředky a
100 % provozu ověřené; oba zdrojové archivy přesně odpovídají 67 souborům
balíčku. Všech 67 app souborů a 8 HTTP kontrol obou domén odpovídá buildu;
bez Auth/App Check callable odmítá 401. Ostatních 22 Functions, oba plánovače,
Rules, feed/news, 38 původních Shoutů/pending žádost i jejich updateTime zachované.
Nasazení nezakládalo fixture ani Auth účty a nezasáhlo produkci/main.

**Dokončeno 23. listopadu 22:21 SEČ:** vlastník pod přesným TestModerator
potvrdil obě odstranění bez chyby. Komentář nejdřív: **2 → 1**, kontrolní
komentář zachovaný, živá projekce/audit správné; potom Shout jako deleted.
Oba receipts/audity propojené, role 3, dvě POST HTTP 200 a Auth/App Check VALID.
Úklid přes writer odstranil pouze 1 Shout, kontrolní komentář, 2 hlášení a
1 oznámení; žádné fixture potomky, živé stavy ani cloudové read klíče nezůstaly.
Všech **28 receipts a 26 rate dokumentů** při úklidu beze změny včetně updateTime;
21 původních receipts také zachovaných, cizí read položky beze změny. Původních
38 Shoutů/pending žádost, všech 24 Functions, oba plánovače, Hosting, Rules,
feed/news zachované. Žádná Auth mutace, nový rollout, reset kvót ani zásah do main/produkce.
Jediný manifest je v čisté release kopii
build/public-removal-release-87d6687/docs/local/public-report-removal-pilot.json;
fáze **cleaned**, digest **c8e37fd7…c0639cc8**; nikdy znovu neseedovat. Tato kopie má přesný zdroj/úplné CI pro mutační CLI, následný
dokumentační commit je nenahrazuje. Návratový kompatibilní web 565880d4664da7b2.

Výše uvedený veřejný pilot je historicky uzavřený. Aktuální další krok a
živý stav společné moderace jsou v úvodu tohoto přehledu.

**Právě dokončený místní úsek:** [veřejné moderační odstranění](MVP_SERVER_PLAN.md#moderation-public-local-results),
větev feature/report-public-removal. Atomické odstranění Shoutu/komentáře,
celá skupina do 50 hlášení, audit, 7denní replay a neaktivní klient jsou hotové.
16/16 nových konečných případů, navíc 33 stávajících rozhodovacích/purge
regresí; 519 Flutter, 110 nástrojových a 179 unit prošlo, analyze/lint čisté.
Širší místní běh měl jeden opravený testový předpoklad rozpočtového guardu;
netvrdí se jeden lokální konečný 49/49 průchod. Zdroj
**ea1fde9b9460b018d21570ff551da790faa9bf9f** je commitnutý/pushnutý a má
[úspěšné úplné CI 45230513178](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45230513178),
včetně nových/starších serverových regresí, Rules, retence a webového buildu.
serverPublicReportRemoval false v DEV i prod, bez wrapperu,
nasazení, živých dat/Auth/Rules nebo změn prostředků. Připravený je
[konkrétní další DEV návrh](MVP_SERVER_PLAN.md#moderation-public-dev-proposal),
který vlastník následně schválil a připravuje se výše. Zbývají také sankce, osiřelá hlášení a společný
audit/cutover autority; celý moderační milník není uzavřený.

**Právě uzavřeno: [B4 a finální DEV regrese celého feedu](plans/feed/B4_DEV_ROLLOUT.md#feed-final-acceptance-complete).**
TestBusiness potvrdil živé řazení při pohybu i zachování čtené karty na
aktuálním webu 33853a9. Počáteční chyba načtení odezněla; příčina nepotvrzená.
Úklidový zdroj **a8d13ebd99836f1c1b9b14ccc716e1b4f02e3b0a** /
[úplné CI 45218543240 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45218543240),
větev fix/feed-pilot-cleanup, 3/3 místní emulátorové a 2/2 manifestové testy,
lint čistý. Opravené nástroje zachovávají sedmidenní receipts i při replay.
Po úplném CI uklizeno pouze DEV: **50 restartovacích + 3 A/B/C Shouty a 54
cloudových read klíčů**, přes společný writer. Oba aktuální manifesty cleaned,
nikdy znovu neseedovat; původní restartovací manifest zůstal beze změny.
Závěrečná inventura 18:01 SEČ: **38 původních Shoutů a pending žádost**,
všechny jejich updateTime, **21 receipts**, cizí read položky a pasivní kvóty
zachované; 0 fixture kořenů/publicStates/potomků/read klíčů.
Všech **23 Functions**, oba plánovače, web **565880d4664da7b2**, Rules
**3de8f7d8…de297**, feed 12/news 6/active beze změny. Žádná Auth mutace,
nový rollout, změna produkce/main/tagů ani prodloužení testovacích dat.
Navazující veřejné serverové odstranění má nyní místní výsledek výše;
živý přechod, sankce a společný Rules cutover zbývají. Regionální
regrese soukromého odstranění a diagnóza původního běžného okna jsou
samostatně odložené. Kapacitní/startovní brána zůstává otevřená.

Následující datované checkpointy zachovávají důkazy dřívějších úseků;
jejich tehdejší počty a otevřené feed testy nejsou současná inventura.

**Právě uzavřený DEV úsek:** [společná moderační rozhodnutí – akceptace a úklid](MVP_SERVER_PLAN.md#moderation-basic-dev-complete).
Zdroj **44e07a5d18570ef2fc416d8387ed459bd55dd853** / [úplné CI 45196844737 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45196844737).
Aktuální web **565880d4664da7b2** z opravného zdroje **33853a9** /
[úplné CI 45202922410 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45202922410),
serverContentReportDecisions true jen DEV. Server zůstal na 44e07a5.
Nová decideContentReports **00001-yak**; cleanup **00007-hoz**, account-created
**00015-viw**, recovery **00015-huw**, prostředky ověřené / 100 % provozu.
Zdrojové archivy všech čtyř Functions odpovídají balíčkům, 67 app souborů
a 8 HTTP kontrol odpovídá release; chybějící Auth/App Check je odmítnut 401.
Ostatních 19 Functions, oba plánovače, Rules, indexová konfigurace, všech 91
původních zdrojů a pending žádost zachované; žádné rozpracované účtové/purge joby.
Vlastník potvrdil všechna čtyři rozhodnutí. Správný TestModerator provedl
approve Shoutu, resolve komentáře a escalate soukromé odpovědi; TestAdmin
dokončil soukromé resolve. Serverové receipts/audity a 4×HTTP 200 s Auth/App
Check VALID ověřené, obsah zůstal do úklidu nezměněný. Úklid odstranil jen
3 zdroje, 3 hlášení, 1 clearance a 2 oznámení; žádné potomky/read klíče.
Všech **10 receipts a 23 rate dokumentů** zachováno včetně updateTime.
Jediný manifest je **cleaned**, nikdy znovu neseedovat, a zůstává v čisté
release kopii build/report-decisions-release-44e07a5/docs/local/content-report-decision-pilot.json,
digest **90be6018…57e30d02**. Mutace spouštět z této přesné kopie s úplným CI,
nikoli z následného dokumentačního commitu. Závěrečná inventura 16:42 SEČ:
91 původních zdrojů a jejich updateTime, pending žádost, všech 23 Functions,
oba plánovače, web 565880d4664da7b2 a Rules zachované. Produkce/main/Auth beze změny.
**Další krok:** předložit konkrétní rozsah serverového veřejného odstranění;
sankce a společný kompatibilní Rules cutover jsou další otevřené části
celého moderačního milníku. Jeho celé uzavření se tím zatím netvrdí.
Prohlížeč nepoužívat bez nového ověření dostupnosti; předchozí ovládání
zastavila kontrola neověřené URL. Produkce/main/Auth beze změny.

**Právě uzavřený místní úsek:** [společná bezpostihová rozhodnutí](MVP_SERVER_PLAN.md#moderation-basic-local)
pro Shouty, komentáře a soukromé odpovědi, včetně neaktivního klienta a testů.
V tehdejším zdroji byl serverContentReportDecisions false; bez wrapperu, nasazení, živých
dat, Auth změn a změn Rules. Níže uvedený dokončený pilot tím znovu neotevírat.
**Místně hotovo:** společné approve/escalate/resolve, celé skupiny 50/51,
audit/replay, neaktivní klient a účtové scrub fáze. 18 nových emulátorových
případů a 15 purge regresí prošlo; rozšířený skutečný purge průchod také.
509 Flutter, 108 nástrojových, 177 serverových unit testů, analyze a lint čisté.
618 integračních případů bez emulátoru přeskočeno. [Důkazy a konkrétní návrh
DEV navázání](MVP_SERVER_PLAN.md#moderation-basic-local-results). Zdroj
**7746bbdc56b2db1abdd9965f9cea348ae82243f3** je commitnutý a pushnutý ve
feature/report-decisions; [úplné CI 45177013854](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45177013854)
skončilo **success**, včetně 18 nových případů, celého 142testového retenčního
průchodu a webového buildu. Tehdejší runtime jádro bylo mimo balíček Functions;
aktuální schválená příprava wrapperu a aktivace je popsaná výše.
**Navazující DEV přechod už vlastník schválil, viz výše;**
veřejné odstranění a sankce ještě brání úplnému uzavření moderačních Rules.
Tento starší místní checkpoint sám nasazení nedokládal; navazující DEV výsledek je výše.

**Dříve odložená ruční kontrola feedu je nyní uzavřená výše.** Vlastník
23. listopadu nejprve požádal pokračovat samostatně a vrátit se později;
následně potvrdil řazení/kotvu a schválený úklid skutečně proběhl.
Platnost se neprodlužovala a nové živé fixture nevznikly.
Nezávislý [audit soukromého mazání](MVP_SERVER_PLAN.md#private-deletion-preparation)
vedl k následně schválenému a nyní dokončenému DEV přechodu níže.

**Předchozí uzavřený DEV úsek:** [vlastní soukromé mazání – akceptace a úklid](MVP_SERVER_PLAN.md#private-deletion-dev-complete).
App zdroj **9c2e121** / úplné CI **45096691292 success**, Rules zdroj
**9fee32e** / úplné CI **45098775591 success**. Hosting **813f34b7555e272a**,
deletePrivateReply **00001-koz**, cleanup **00005-goh**; prostředky i ostatních
19 Functions a oba minutové plánovače zachované. Vlastník potvrdil obě vlastní
mazání; obě mají serverová potvrzení, Auth/App Check VALID a HTTP 200.
Následně nasazen DEV ruleset **e16b7a3d-f363-499c-ad40-262471059271**,
přesná shoda zdroje a 8/8 scénářů oficiálního serverového simulátoru ověřené.
Přímý autentizovaný HTTP DELETE z prohlížeče nebyl součástí této kontroly.

Uklizen pouze nový Shout, dvě notifikace a 1 cloudový read klíč; obě soukromé
zprávy už smazali vlastníci. 5 potvrzení ponechaných do +7 dní, kvóty beze
resetu. Manifest je **cleaned**, znovu neseedovat. Závěrečná kontrola 06:45 SEČ:
všech **91 původních zdrojů**, jejich updateTime, původní pending žádost a feed
12/news 6/active zachované. Žádná Auth změna, produkce/main beze změny.
Důkazy build/private-deletion-final-proof.json a související audit/simulace.
Kompatibilní návratový web 813f34b7555e272a, návratový ruleset 476d216c…a3e9.

**Poslední uzavřený DEV úsek:** [soukromé odstranění bez postihu – akceptace a úklid](MVP_SERVER_PLAN.md#moderation-private-dev-complete).
App/server **0fa2774** / úplné CI **45147594322 success**; samostatné Rules a
úklidový nástroj **40e127f** / [úplné CI 45164557897 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45164557897).
Místních 49/49 cílených emulátorových testů prošlo; celý CI průchod zahrnuje
aplikační testy, Rules, ostatní serverové regrese i webový build.
DEV Rules **3de8f7d8-6658-4b24-951f-043eac8de297** mají ověřenou shodu zdroje
a 16/16 scénářů oficiálního serverového simulátoru. Managed přímé private
delete a contentRemoved jsou uzavřené, ostatní rozhodnutí/čtení zachované.
Přímý autentizovaný HTTP DELETE z prohlížeče nebyl součástí této kontroly.

Vlastník potvrdil živý průchod a výslovně přijal skutečného aktéra **TestAdmin**
namísto plánovaného TestModerator. Serverová receipt/audit, Auth/App Check
VALID, HTTP 200, nezměněné podklady a zachovaná druhá zpráva byly ověřené.
Regionální živé oprávnění se tím netvrdí; jeho ruční regrese zůstává otevřená.
Doplňkový manifest 873e936e…2d4770a je **cleaned**, původní c5801fcb…05c059d9
zůstal beze změny jako historický podklad. Ani jeden znovu neseedovat.
Uklizen pouze nový Shout, kontrolní zpráva, hlášení a příslušné notifikace;
první zprávu už odstranilo skutečné rozhodnutí. Žádné potomky ani fixture
cloudové read klíče nezůstaly. **5 potvrzení** ponechaných +7 dní beze změny,
kvóty se neresetovaly. Všech **91 původních zdrojů a jejich updateTime**,
původní pending žádost, feed 12/news 6/active, všech **22 Functions**,
oba minutové plánovače a Hosting **b5703cec19978454** zachované.
Callable **00001-zec** / cleanup **00006-lum**, prostředky beze změny.
Důkazy build/private-moderation-rules-final.json a private-moderation-cleanup-check.json.
Návratový ruleset **e16b7a3d…59271**; starší raw-delete web vracet až po
odpovídajícím rollbacku Rules. Produkce, main, tagy a Auth účty beze změny.

**Další práce:** zbývající atomická moderační rozhodnutí/sankce, regionální
regrese a produkční aktivace podle [serverového plánu](MVP_SERVER_PLAN.md#moderation).
Celý moderační milník se tím neuzavírá. Tehdy odložený pohybový test
a jeho staré fixture jsou následně uzavřené ve finální feed akceptaci výše.
Historické lokální výsledky a schválené mezikroky jsou u
[přípravy](MVP_SERVER_PLAN.md#moderation-private-local),
[nasazení](MVP_SERVER_PLAN.md#moderation-private-dev-rollout) a
[přijetí TestAdmin](MVP_SERVER_PLAN.md#moderation-private-cutover-prepared).

Mé shouty → Komentáře dnes zahrnuje pouze veřejné komentáře; soukromé odpovědi
jsou v detailu/oznámeních. Vlastník 23. listopadu zařadil jejich doplnění do
této sekce [až po MVP](plans/roadmap/PRIVATE_REPLY_HISTORY.md), položka bl-158.
Plán je zapsaný, implementace se nyní nezahajuje. Nová otevřená položka rozšiřuje
jen celkový backlog ze 157 na 158; váhy dosavadních úseků a MVP se nemění.

**Předchozí uzavřený místní úsek:** [vlastní mazání soukromé odpovědi](MVP_SERVER_PLAN.md#private-deletion-local).
Serverové jádro, session gateway, UI průběh/chyby a odvozený návrh Rules jsou
hotové. 493 Flutter testů, 104 nástrojových testů, analýza/lint a 40 cílených
serverových/Rules regresí prošly. Nová operace má 8 SDK reads / 3 writes,
potvrzené opakování 6 / 0; nejde o cloudové měření ceny či výkonu.
Zdroj **282666562e034bc18314a3becfe9d8c203b05712** má
[success úplné CI 45091447773](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45091447773),
včetně nového soukromého kroku a webového buildu; doložen čistý přesný commit.
Implementace/ověření započtené, DEV/živá akceptace otevřené.
V tomto předchozím místním checkpointu byl přepínač false, bez wrapperu a změn
Rules. Moderaci tato
operace nenahrazuje; žádné nasazení, živé fixture/Auth či retenční změny.
Navazující nasazení výše zahrnuje i aktualizaci stávající cleanupOperationReceipts
pro nový typ potvrzení, se stejným rozpočtem/časováním.
**Celý DEV přechod vlastník 23. listopadu výslovně schválil:** [rozsah a podmínky](MVP_SERVER_PLAN.md#private-deletion-dev-proposal).
Čerstvá čtecí inventura v 01:26 UTC potvrzuje 20 Functions, 2 minutové
plánovače, dosavadní Hosting/Rules/control, 91 zdrojů (50 aktivních) a
nezměněných 38 původních zdrojů/pending žádost. Žádné živé zápisy. Navržené
pilotní data vzniknou až při připraveném klientu; UI důkaz podmiňuje živé Rules.

**Ověření přípravy schváleného DEV přechodu:** wrapper, DEV aktivace a omezený pilotní
nástroj jsou připravené; 493 Flutter testů, analýza bez nálezů, 106 nástrojových
testů, lint, 170 serverových unit testů (579 integračních mimo emulátor přeskočeno)
a 21 cílených emulátorových regresí prošly. Následné úplné CI a nasazení jsou
doložené výše. Z DEV váhy 5 nyní započtené Functions 2, web 1 i Rules 2;
samostatná živá akceptace vlastní soukromé operace je také uzavřená.

**Předchozí nasazená oprava feedu, součást novějšího webu:** [řazení při pohybu](plans/feed/B4_DEV_ROLLOUT.md#movement-order).
Vlastník potvrdil změnu vzdáleností a požádal také o živé pořadí v Nejblíž.
Klient při potvrzeném přesunu řadí nepřečtené/přečtené podle nové vzdálenosti,
zachová viditelnou kotvu a vloží další serverové stránky na správná místa.
Kurzor se průběžně dorovnává k viditelné části i přes stránky obsahující pouze
již ponechané karty. 486 Flutter testů, analýza bez nálezů, 7 serverových
regresí a lint prošly. Zdroj **af4c3aa06fc65b7d429497cca73817d2d4529be2** má
[success úplné CI 45085601243](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45085601243).
Nasazený pouze DEV Hosting **37b697da10fbb5b1**, ověřeno 67 app souborů a 8 HTTP
odpovědí obou domén. Všech 20 Functions včetně getFeedPage **00007-moc**, Rules
a prostředky beze změny; původních 38 zdrojů/pending žádost zachované, celkem
91 zdrojů, feed 12/news 6/active. Návratový web **2d6ae9af70840b03**.
Tehdy odložená ruční kontrola řazení/kotvy i úklid jsou následně uzavřené
výše. Prohlížečový host byl při tomto starším checkpointu nedostupný.

**Předchozí nasazení pohybu:** [pohyb v DEV + připravený poslední úklid](plans/feed/B4_DEV_ROLLOUT.md#movement-integration).
Zdroj **78d6a3f3d5bbf80df7c31bebc92ea4fe45a6df88**, [success úplné CI 45077814590](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45077814590).
Hosting **2d6ae9af70840b03**, getFeedPage **getfeedpage-00007-moc**, 100 % provozu;
staré revize retired, ostatních 19 Functions/Rules/prostředky zachované.
Shodných 67 app souborů a 8 HTTP kontrol, serverFeedMovement true pouze DEV.
Meze 30 s / 250 m + nejistota obou fixů, fix do 30 s a přesnost do 100 m.
Automaticky ověřený je i první snímek, velké vložení/odebrání a návrat z pozadí;
vlastník následně potvrdil změnu vzdáleností a přibližný průběh pohybu, ale
požádal o změnu pořadí (viz aktuální oprava výše). [Závěrečná ruční kontrola](plans/feed/B4_DEV_ROLLOUT.md#movement-order)
je až na konci; po ní restart úklid 50 → původní A/B/C podle manifestů.
Nástroj úklidu má místní/emulátorové testy a živý dry-run 50 kandidátů / 0 zápisů.
C2 již uklizený: 1 zdroj / 0 read klíčů. Čerstvá inventura 91 zdrojů,
38 původních a pending žádost zachované; feed control 12, news 6/active.
Žádné nové fixture/Auth, migrace či produkční změny. Návratový web 6762922852bede94.

**Předchozí DEV úsek B4:** [návrat novinek po pauze a ruční dosahy](plans/feed/B4_DEV_ROLLOUT.md#news-pause-recovery-results).
Zdroj **b57f6b9793b70530369384cb07eee7f4e56af9c4** má
[success úplné CI 45071219942](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45071219942).
Nasazený a ověřený je pouze DEV web **6762922852bede94** a getFeedPage
**getfeedpage-00006-niz**; ostatních 19 Functions, Rules a prostředky zachované.
Vlastník potvrdil ruční dosahy 1–50 km s výchozími 50, bez Auto/údaje o načteném
dosahu, a funkční obnovu/detail během news **5/paused**. Po přechodu na **6/active**
server doložil úspěšné klientské volání bez další obnovy stránky, Auth/App Check
VALID. Feed control zůstává 12, všech 92 zdrojů včetně 38 původních a pending
žádost zachované, žádné nové fixture/Auth ani úklid. Dalších 101 s bez změny
news kvóty potvrzuje ukončení úspěšných count kontrol v klidu; automatický návrat
je samostatně uzavřený. Následuje původní úklid; společná B4 akceptace zůstává otevřená.

**Pohyb má zapojený DEV kód, ale čeká živá akceptace:** původní hlášku
„Poloha se změnila…“ aktivovaná větev nepoužívá. Při výpadku zachová poslední
potvrzené okolí s jedním stavem. Nasazení ani simulace nenahrazují ruční průchod;
starší vypnuté prototypy níže jsou historické checkpointy.

**Předchozí dokončený úsek:** [jednotné číslovky + místní geografický rebase](plans/feed/B4_DEV_ROLLOUT.md#badge-and-recenter-results).
Zdroj **211471bbdb9df36fde9b233adb4149f2e45adfc8**, [success úplné CI 45066405533](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45066405533),
DEV Hosting **3881ef4d17f67aa8**. Ověřeny hashe 67 app souborů a 8 HTTP odpovědí;
Rules i 20 Functions zůstaly beze změny, návratový web **346ea6fb1866da8e**.
474 Flutter testů, analýza bez nálezů a emulátorové rebase regrese prošly.
Obě plovoucí číslovky používají stejnou vnější kotvu. Pohyb je pouze místní
prototyp: Home/GPS jej nevolají, serverová volba false, žádné Functions
se nenasadily. Před aktivací určit četnost/přesnost a pořadí při pohybu;
stabilita kotvy není důkaz úplného globálního pořadí nenačtených karet.
Bez nových živých fixture/Auth či změn dat. Nová ruční UI akceptace se netvrdí.
Další práce B4: pauza/návrat, kompatibilní web a úklid původních manifestů;
hotovou kladnou/expirační akceptaci neopakovat. Metriky zůstávají 60,33 % MVP.

**Poslední uzavřený obsahový úsek: přímé zápisy v managed feedu.**
[Důkazy a hranice](MVP_SERVER_PLAN.md#authority-audit): soukromé odpovědi,
komentářové palce/čítače a tvorba tří typů hlášení nyní vyžadují serverovou cestu.
Zdroj **17317e9aede8f6aa286c12365ac335d597a6867f** má
[success úplné CI 45056112263](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45056112263); místně 11/11 cílených
a 475/475 širších testů. Pouze DEV Rules shoutout-dev-46c81 jsou nasazené,
ruleset **476d216c-9208-4e5c-9143-f583cb82a3e9**, shoda zdroje ověřená přes API.
Hosting 06df6da99db68e74 a všech 20 Functions zůstaly beze změny; bez nových
Auth účtů a živých testovacích zápisů. Čtení, role, retence, moderace a vlastní
soukromé mazání zůstávají zachované. Návratový ruleset 5dde23bc-6ede-4c90-a2e4-7e47ff3034d2.

**Poslední potvrzený klientský úsek:** [obnovené sledování, číslovka 1 a expirace](plans/feed/B4_DEV_ROLLOUT.md#news-positive-acceptance).
Pod TestBusiness prošel Profil → feed skutečným callable (Auth/App Check VALID,
HTTP 200 / 0,421 s). Vlastník zvlášť povolil jeden nový C na 60 s a potvrdil
tečky → 1 → tečky → bez čísla. Tento C je uklizený: 1 zdroj / 0 read značek,
38 původních zdrojů a pending žádost zachované; žádné Auth mutace.
Zdroj **34268e5f2e2416f6c3e7c3f23cc4f82a4bd20d43**, success úplné CI 45060709344,
DEV Hosting **346ea6fb1866da8e** a jeho 67 app souborů / 8 HTTP kontrol jsou ověřené.
Rules i všech 20 Functions beze změny; návratový web 06df6da99db68e74.

**Připomínky k badge a pohybu:** [schválený úsek je dokončený](plans/feed/B4_DEV_ROLLOUT.md#badge-and-recenter-results).
Oba plovoucí badge už obalují celý FAB; historický rozdíl ikonové kotvy je
opravený. Serverový/klientský pohybový prototyp je místně ověřený, ale zůstává
vypnutý. GPS hláška proto zatím používá dosavadní porovnání souřadnic;
nepovažovat ji za cílové chování ani lokální prototyp za živou aktivaci.
Společná B4b/finální feed akceptace zůstává otevřená: pauza/návrat, kompatibilní
web a úklid původních manifestů. Neopakovat hotový kladný/expirační test.
Běžné okno feedu je na žádost vlastníka odložené, bez smazání místní fronty.
Samostatný další serverový návrh je soukromé mazání/moderace.

**Samostatná serverová kontrola závěrečného feedu prošla:** oba účty 50 + 2,
52 jedinečných karet, jedna baseline přes stránky, potvrzené unread-first
a warm 0 / refill 1 tělo. TestBusiness v tomto snapshotu 31 read / 21 unread,
Bright_Otter 2 read / 50 unread. Čteno interním jádrem nad živým DEV bez
zápisů; nejde o platformní callable ani UI akceptaci. Podklad
build/feed-final-read-proof.json. Vlastník potvrdil anonymní restart/Auto průchod;
C/pauzu/návrat ani úklid zatím neprovádět bez připraveného pozorujícího klienta.
B4b/finální feed akceptace zůstávají otevřené.

**Auto hledání má potvrzený anonymní DEV průchod.**
[Rozsah a důkazy](plans/feed/FEED_DELTA_REFRESH_PLAN.md#automatic-radius):
výchozí prostorový dosah Auto/max. 50 km, pokrytí načtených karet a nabídka
rozšíření prázdného ručního okruhu. Používá stávající serverový index/kurzor,
bez nových Functions/Rules/dat. Šest nových testů + dosavadní cílené regrese
(celkem 38 různých testů) prošlo, včetně úzké obrazovky/překladů.
Místní celá sada před posledním layout testem měla 461 úspěchů; analýza bez
nálezů. Zdroj **6bef37c5af4410a3b87da9946005c70a71bbc1b6** má
[success úplné CI 45020677812](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45020677812).
Hosting **06df6da99db68e74** je ověřený: 69 souborů (67 app + 2 Firebase),
shoda gzip/raw hashů a 8 HTTP kontrol na obou DEV doménách. Backend zůstává
níže uvedené B4b 20206c4. Vlastník dostal jediný UI průchod Auto → ručních
5 km → nabídka rozšíření. **V novém anonymním okně vlastník potvrdil, že Auto
feed funguje dobře.** Původní okno hlásilo chybu; jeho místní stav a přesná
příčina zůstávají otevřené. Poslední serverová
volání v 17:14 UTC mají HTTP 200 a Auth/App Check VALID. TestBusiness read
meta zůstává revision 8 / 0 entries; lokálně je reprodukovaná blokace skutečné
feed bariéry odloženou starou značkou, ale příčina v jeho prohlížeči není
potvrzená. Místní IndexedDB/fronty se nemazaly, zdroje aplikace se neměnily.
**Na výslovnou žádost vznikla nová restartovací dávka:** 50 Shoutů
„MVP restart 22.11. 001–050“ na 24 hodin, zvláštní manifest
docs/local/feed-restart-2026-11-22.json. Všech 50 zdrojů a publicStates je
ověřených; původních 40 zdrojů (včetně A/B) a 1 žádost mají původní updateTime.
Čtecí příprava i následná atomická publikace přes společný writer tří generací
plánovaly/provedly 110 zápisů včetně jednoho publication headu. Interní reader
vrací 50 karet a další kurzor. Karty expirují 23. listopadu 18:23:34 CET.
Vlastník po restartovací dávce znovu potvrdil fungující anonymní průchod.
Původní běžné okno stále selhává; na jeho žádost je diagnostika odložená.
Příčina uloženým stavem není prokázaná, IndexedDB/frontu nemažeme a B2
bariéru neuvolňujeme. B4b akceptace zůstává samostatně otevřená. [Důkazy a hranice](plans/feed/FEED_DELTA_REFRESH_PLAN.md#automatic-radius).
Spojení pro Browser Use
je nedostupné; tuto akceptaci nenahrazovat HTTP ověřením. Návratový web je
ca327f10112ef349; po budoucím B4b rollback pilotu obnovit nynější Auto artefakt,
nikoli historický web uložený v build/b4b-dev-release. Produkce/main nezměněné.

**B4b je [nasazené a aktivní v DEV](plans/feed/B4_DEV_ROLLOUT.md#news-dev-rollout-results); živá akceptace pokračuje.**
Zdroj **20206c4a4d8b186c54947c04212d6a4c6ec5625f** má
[úspěšné úplné CI 44959541907](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44959541907).
Čistá release kopie je build/b4b-dev-release. Všechny tři indexové operace jsou
dokončené bez TTL změny. News control **revision 2 / active**, feed control
**revision 12 / feed-v3**, mirror a technický head jsou ověřené. Rules **5dde23bc-6ede-4c90-a2e4-7e47ff3034d2**
jsou nasazené a zdrojově ověřené. Nové ACTIVE revize jsou createShout
**createshout-00007-viz** a getFeedPage **getfeedpage-00005-res**; prostředky stejné,
100 % traffic a všech 10 starších revizí RETIRED. Ostatních 18 Functions i oba
plánovače jsou porovnané beze změny. Hosting **ca327f10112ef349 / news on**:
69 vzdálených souborů (67 app + 2 Firebase), gzip hashe i 8 skutečných HTTP
odpovědí na obou doménách odpovídají artefaktu. Původních 38 Shoutů a jedna žádost
jsou ověřené beze změny. Pilotní A vznikl nástrojem, B následně skutečným klientem
TestBusiness (Auth/App Check VALID, HTTP 200, 24 h); B je adoptovaný do manifestu.
Před publikací B oběma účtům interní jádro
vrací 1 kartu, news kontext s 36 heads a count 0 (30 SDK reads / 1 quota zápis).
Nejde o validní callable/UI důkaz. Auth účty, produkce/main nezměněné.
Po B vrací interní count běžnému účtu 1 (48 SDK reads); nejde o UI důkaz.
**Vlastník následně zjistil Network / Offline:** po obnovení připojení feed
funguje a dosah lze změnit, ale změna podle něj trvá dlouho. Prodleva zatím
není změřená ani připsaná konkrétní fázi. Původní chybu nyní neopravovat
uvolněním synchronizační podmínky. Lokální diagnostický test reprodukuje
samostatné riziko odložené B2 značky nedostupného starého obsahu; není
potvrzenou příčinou tohoto uživatelského incidentu. Bez změny aplikačního kódu.
Podrobné důkazy a další krok jsou v [pilotním výsledku](plans/feed/B4_DEV_ROLLOUT.md#news-dev-rollout-results).
Zatím nevytvářet C: 60s okno začít až při připraveném pozorujícím klientu.
Následuje ověření číslovky/odečtení/obnovy, otevřeného UI při pauze/návratu
a úklid těchto tří slotů. B4 ani finální feed akceptaci zatím neuzavírat.
Původní metadata/cache pilot neopakovat.

**Schválený lokální provozní úsek B4b je uzavřený včetně úplného CI.**
Větev feature/feed-b4-news-runtime má [výsledek a měření](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4b-runtime-results):
atomický publication head, samostatnou UID kvótu 40/1s, úplné pokrytí,
historickou baseline hlaviček, připravené get-only Rules a aktivním feedem
řízený 2/15/5s adaptér s hysterézí. V klidu při nule neběží periodický count;
pozastavení detekce neblokuje načítání feedu. Nové lokální regrese zahrnují
rollback 450 zápisů, opakování createShout, více zařízení, R5 a odvolání
oprávnění otevřeného odběru. Naměřený report výslovně odděluje model fanoutu
od cloudového účtu/kapacity. Tři indexové výjimky bez TTL jsou jen připravené.
Lokální doplňkový test vyžádal technický `_control` head pro okamžité probuzení
při pauze/návratu; stále nejvýše 64 odběrů celkem. První CI 44952312294 je
zrušené kvůli této opravě, neoznačovat je jako hotové úplné ověření.
Zdroj **3d381f820b22162cf38eb58b757a80e2c9459b7f** je pushnutý a má
[úspěšné úplné CI 44953434700](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44953434700).
Prošlo 456 Flutter, 89 tools, 167 Functions unit (548 integration skipped v
unit běhu), 464 Rules/server, 9 reader, 14 card, 13 transport/Rules/Chrome,
12 přechodových, 20 news, 34 B2, 142 purge a 15 Storage scénářů; analýza,
formát, lint, browser persistence i webový build. Ověřen přesný SHA a
conclusion success; místní výpis je build/b4-news-runtime-ci-proof.json.
Další je konkrétní DEV aktivační/pilotní plán včetně inventury App Check,
bezpečného založení controlu a doběhnutí starších publikačních revizí.
Žádné nasazení nebo živé zápisy; všechny news přepínače zůstávají off.
Níže doložený DEV metadata/cache a produkce/main jsou nezměněné.

**Lokální B4b je uzavřené včetně úplného CI ve feature/feed-b4-news-local.**
Zdroj **e8c0c9c722049d989021ff5cc0339c3260b43a14** má
[úspěšné úplné CI 44944929884](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44944929884).
Vlastník schválil ucelený výpočet číslovky/klientský badge a měření dvou
způsobů detekce a zvolil jen nově publikované příspěvky. [Rozsah a kontrakt](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4b-local-proposal).
[Výsledky a naměřené meze](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4b-local-results):
445 Flutter, 89 tools, 165 unit, 9 nových emulátorových a 11 transportních
včetně Chromu. Count dotaz nečte těla a nic nezapisuje; 19–23 reads v klidu,
30–36 při teplé kontrole jedné novinky v měřeném rozsahu 50/200/2 000 zdrojů.
Konečné CI potvrdilo i celé dosavadní serverové/Rules/B2/purge/Storage sady
a webový build. Navazující provozní rozsah už vlastník schválil;
jeho aktuální implementace a čekající kontrolní bod jsou výše.
Konkrétní četnost/odběry nejsou aktivované. Serverový i klientský
přepínač zůstává false. Bez nasazení, živých dat, Rules, nových služeb/Auth či změny retence.
Níže uvedený dokončený B4 metadata/cache rollout je stále skutečný DEV stav.

**Nyní: metadata/cache B4 mají uzavřenou DEV akceptaci i úklid.**
Zdroj **8b1de6824e116358c4d364785e4b94f57f52fc9d**, [úplné CI 44935555088 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44935555088),
Hosting **fa20f566fc0ab82b**, pouze shoutout-dev-46c81. Dokončeno 14 indexových
kroků bez TTL, deset Functions, ověřený drain všech starších revizí a Rules.
Feed-v3 je po živém rollbacku, novém auditu a reaktivaci readerem/card readerem;
control revision 11, všechny tři generace se udržují. Oba plánovače a prostředky
nezměněné. [Důkazy a přesné meze](plans/feed/B4_DEV_ROLLOUT.md#dev-rollout-results).
Interní živý pilot pro oba účty prošel 50 → 100 → 120, warm 0 těl/refill 1,
přečtením, promo a serverovým resetem rozpracovaného požadavku při návratu.
Původních 38 zdrojů i pending žádost mají nezměněné updateTime, bez Auth mutací.
Vlastník potvrdil UI průchod obou účtů bez chyby. Následně uklizeno všech
120 fixture a 138 cloudových read klíčů; 120 publicStates chybí a čerstvý feed
oběma účtům správně vrací 0 karet. Původní data znovu ověřená beze změny.
[Akceptace, logy a přesné meze](plans/feed/B4_DEV_ROLLOUT.md#delta-acceptance-complete).
Computer Use bylo zastavené kontrolou URL; UI doložil vlastník, Auth/App Check
VALID i HTTP 200 pro feed a reakce serverové logy. Interaktivní UI rollback
zbývá ve společné finální regresi B4; technický rollback i klientská regrese prošly.
**Další:** připravit konkrétní DEV aktivaci/pilot B4b výše; původní count i
provozní lokální napojení mají úspěšná úplná CI. Celé B4 ani celý milník nejsou uzavřené.
Produkce/main nezměněné; tentýž pilot znovu nezakládat.

**Předchozí lokální přechod B4 je uzavřený včetně úplného CI.**
Zdroj **cd21019d846aa018c8d7939ca62c994ba6082520** má
[success úplné CI 44929196473](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44929196473).
Větev feature/feed-b4-transition má řízený operátor, platnost a integritu
auditu, ochranu inkarnací všech zachovaných generací a kompatibilitu již
otevřeného klienta při rollbacku. [Připravené změny a jejich meze](plans/feed/B4_DEV_ROLLOUT.md#local-transition-results).
Prošlo 432 Flutter, 87 nástrojových, 159 Functions unit, 464 Rules/server,
9 reader, 14 card, 13 transport/Rules/Chrome, 8 přechodových, 34 B2 runtime,
142 purge a 15 Storage testů, analýza/lint/formát i webový build.
Tento předchozí zdroj má přepínače vypnuté a žádné živé změny.
Navazující DEV přechod je schválený; aktuální příprava je popsaná výše.
Předchozí 44928809756 selhalo na pořadí instalace závislostí; opraveno a
ověřeno konečným během. 44928446576 bylo zrušeno po doplnění měření.

**Předchozí lokální klientské zapojení B4 je uzavřené včetně úplného CI.**
Zdroj **62fc8feb0bbded06c5f116867bbbd61ec0848b5b** má
[success úplné CI 44917393562](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44917393562).
Větev feature/feed-b4-client-integration má skutečný delta transport/RAM cache,
společný malý stav karty/detailu/Mé/Uložených, náhradu Home promo odběru,
lokální Rules a návrh indexů. Prošlo 429 Flutter, 159 Functions unit,
464 Rules/server, 9 reader, 14 card/backfill, 13 nových B4, 34 B2 runtime,
142 purge a 15 Storage testů, nástroje, browser, analýza/lint/formát i build.
Nové testy zahrnují Chrome proti emulátoru a vlastní bariéru po změně účtu.
[Výsledky a přesné meze](plans/feed/FEED_STATE_STORAGE_PROPOSAL.md#client-integration-results).
Nové přepínače jsou vypnuté, nic se nenasazovalo.
[Konkrétní přechodový úsek](plans/feed/B4_DEV_ROLLOUT.md#local-transition-proposal)
vlastník schválil; jeho aktuální stav je výše. Živá migrace má vlastní bránu.
Čtecí DEV inventura 21. listopadu 15:25 UTC potvrdila STANDARD/europe-west3,
control revision 6 / reader feed-v2 / writery feed-v1+feed-v2 a původních
38 zdrojů (0 active), 1 žádost. [Podklady a chybějící nástroje](plans/feed/B4_DEV_ROLLOUT.md#read-only-inventory).
Žádné zápisy do Firebase. enrichShoutGeography není v seznamu nasazených
Functions; případný B4 rollout ji nesmí mimoděk založit přes index.js.

**Předchozí lokální P1 B4 je uzavřený včetně úplného CI.**
Zdroj **d2cac88313c914f4d4fbf0780f0b0862d77da04e**, větev
feature/feed-b4-state-storage, [úplné CI 44908128699 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44908128699).
Prošlo 419 Flutter, 158 Functions unit, 464 Rules/transakčních, 9 B4 reader,
14 nových card/backfill, 34 B2 runtime, 142 purge a 15 Storage testů;
browser, nástroje, analýza/lint/formát i webový build také.
[Implementace, měření a hranice](plans/feed/FEED_STATE_STORAGE_PROPOSAL.md#p1-results)
pokrývají nový formát, všechny serverové writery, geografii, R5/history/purge,
obnovitelné doplnění a audit. SDK počty se v CI shodují s lokálními 50/200/2 000
fixture; JSON bajty závislé na serverových časech nejsou byte-for-byte srovnání.
Celkový účet ani kapacita 5 000 relací nejsou tím prokázané.
Runtime má **cardStateEnabled: false**. Žádné nasazení, živá data, Rules,
Auth účty, Scheduler ani prostředky se v tomto úseku neměnily.
[Konkrétní návrh klientského úseku](plans/feed/FEED_STATE_STORAGE_PROPOSAL.md#client-integration-proposal)
je schválený a jeho implementace je popsaná ve výsledcích výše. Neopakovat
P1 ani hotové piloty. Signály/číslovka novinek zůstávají navazující blok B4.

Předchozí [transakční reader a jeho úplné výsledky](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4-read-local-results)
jsou rovněž uzavřené: 0b2d004 / úplné CI 44825059479 success. Jeho silnější
kontroly volajícího/B3 nejsou součástí nového užšího header benchmarku;
čísla různě vymezených měření nesrovnávat přímo.

**Předchozí lokální základ B4a:**
[Rozsah, nálezy v kódu, laboratorní meze a výstupy](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4a-proposal)
zahrnují celé body oddělené od stavu, omezený výběr/doplnění, RAM cache,
porovnání blokové/kompaktní živé projekce a všechny zápisové cesty včetně
geografie/komentářových odpočtů. Průzkum našel také původní plný Home dotaz
vedle prostorového feedu. Bez jeho započítání a živých odběrů by byl odhad
úspory neúplný. [Výsledky, měření a matice zbývající integrace](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b4a-local-results):
8 serverových, 8 Dart a 6 emulátorových scénářů; lint a lib/test analýza čisté.
Zdroj **13bfe74c182e266eb4ed7c86ca7c1f1dfcecfc64** má
[success úplné CI 44816457563](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44816457563):
416 Flutter testů, 152 Functions unit testů, 464 transakčních, 34 B2 runtime,
142 purge a 15 Storage testů i webový build. CI měření B4a se přesně shoduje
s uloženým lokálním benchmarkem. Předchozí běh a3ebdad byl zrušen po nahrazení
finální opravou TTL cache; není důkazem dokončení.
Bloková varianta má 0 zdrojových těl při warm obnově, ale cold/refill režie
zatím brání tvrdit plošnou úsporu reads. Individual projekce pro výběr je dražší;
hybrid zmenšuje model živého přenosu za cenu dalších zápisů. Aktivní hostitelé,
Home, Rules, živá data a zdroj DEV webu zůstávají beze změny. Další je návrh
provozní integrace a levnější cold/refill cesty, nikoli nasazení laboratorních bucketů.

**Samostatná oprava IDE je lokálně dokončená:** po souhlasu vlastníka
analysis_options.yaml vylučuje cizí npm šablony přes `**/node_modules/**`.
Celá lokální flutter analyze prošla bez nálezů (před opravou 6 chyb šablony).
[Příčina, doložená historie a meze](operations/TESTING.md#dart-dependency-templates).
Pravidla lib/test, závislosti a Firebase se nemění; editorový panel nebyl
ovládán. Původní fix/dart-analysis-dependencies je zahrnutý v tomto společném
checkpointu 0b2d004; push i úplné CI jsou úspěšné. Nic se nenasazovalo.

B3 má **uzavřenou živou DEV akceptaci i úklid**. Vlastník potvrdil okamžitou
odezvu závěrečného průchodu. Server doložil u 119 palec/záložku 0 → 1 → 0,
smazání a výsledné 0/0/0. Následný schválený úklid odstranil 120 testovacích
zdrojů a 144 cloudových read klíčů, včetně příslušných potomků/receipt/oznámení.
Nezávislá kontrola 19:38 UTC našla 0 zdrojů/receipt/read klíčů pilotu;
původních 38 zdrojů a 1 pending žádost mají nezměněné updateTime.
[Konečná akceptace a důkazy](plans/feed/B3_DEV_ROLLOUT.md#b3-acceptance-complete).
Oba pilot-state mají phase cleaned. **Neopakovat seed, migraci, akceptaci
čtení ani úklid téhož pilotu.** Historické kořeny mají standardní retenci;
klientská IndexedDB a skutečná historie přečtení se plošně nečistily.

Další B4 určuje [schválený směr a otevřené technické volby](plans/feed/FEED_DELTA_REFRESH_PLAN.md):
nejprve verze obsahu, manifest/porovnání a bezpečné opakované využití cache,
potom úsporné signály a přesný počet nových relevantních Shoutů do 99+.
Před navazující provozní integrací předložit konkrétní schéma, ověření a nákladové meze;
B3 je neurčuje. B4, společná finální regrese a kapacitní brána nejsou hotové.

**Poslední ověřený DEV web se nemění:**
Zdroj **fc795adba3aa9092a8afe3d7c82272da07a2b5ab** z fix/interaction-feedback má
[success úplné CI 44788753267](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44788753267).
DEV Hosting projekt/site shoutout-dev-46c81 je ve verzi **5b4d711b715a85e3**,
release 20. listopadu **19:17:37 UTC**. Všech 68 souborů buildu je ověřených,
pět kritických souborů na obou originech odpovídá SHA-256 manifestu.
[Implementace a meze](plans/feed/B3_DEV_ROLLOUT.md#interaction-feedback-implementation),
[důkaz nasazení a další průchod](plans/feed/B3_DEV_ROLLOUT.md#interaction-feedback-dev).
Palec/záložka mají oddělený okamžitý náhled, bezpečný retry a indikátor;
potvrzené vlastní mazání odebere kartu i z připravených stránek se stabilním
scrollem. Expirace vrátí zobrazení k potvrzeným počtům. Prošlo 69 cílených /
408 celkových Flutter testů, analýza/formát i emulátorová regrese čtení pod
uzavřenými Rules. Functions, Rules, prostředky, retence, main a produkce se neměnily.

[Diagnóza prodlevy](plans/feed/B3_DEV_ROLLOUT.md#interaction-feedback-diagnosis)
rozlišuje studený start a nezměřený zbytek. Vlastník má No throttling a hlásil
QUIC/400 Listen chyby; jejich oprava ani příčinná souvislost nejsou potvrzené.

**Předchozí oprava měření a barevného stavu — potvrzená v UI i na serveru.**
Vlastník potvrdil stránky i oddělovač, ale nahlásil nepřečtené „MVP B3 070“.
Na fix/b3-read-feedback jsou reprodukované a opravené dva klientské
nedostatky: překreslení statického plovoucího ovládání restartovalo měření
sekundy a ovládání zakrytého feedu mohlo blokovat čtení otevřeného detailu.
Prošlo 34 cílených a všech 389 Flutter testů; lib/test analýza je čistá.
Nasazené je okamžité jemné barevné rozlišení bez
změny pořadí a zpráva při serverem potvrzené prázdné nepřečtené skupině.
[Souhlas, diagnóza a výsledky](plans/feed/B3_DEV_ROLLOUT.md#read-feedback-fix).
Zdroj **ab27253d1da7a0b1666caee04483ec5c4606a4d9** má
[success úplné CI 44684384849](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44684384849).
Byl původně na DEV Hostingu ve verzi **1f3dc2f8355c02ce**, dnes nahrazené fc795ad.
Pět souborů na obou
originech odpovídá release manifestu; všech 68 souborů lokálně ověřeno.
Functions, Rules, indexy, konfigurační přepínače a produkce se neměnily.
Uživatel potvrdil živou změnu pozadí a správné řazení po obnově; všechny
testovací Shouty vidí pod oddělovačem. Server ověřil Bright 120/120, včetně
070 s confirmedAt 2026-11-20T15:46:09.289Z; při této kontrole měl Business 20/120,
při novější závěrečné kontrole výše 24/120 včetně 119.
Skutečné požadavky getFeedPage/syncReadBatch mají HTTP 200 / Auth VALID /
App Check VALID. [Akceptace opravy a zbývající test](plans/feed/B3_DEV_ROLLOUT.md#read-feedback-acceptance).
Navazující průchod původního pilotu je funkčně ověřený; nové výhrady k odezvě
a vlastnímu smazání jsou popsané výše. Neopakovat migraci, seed ani úspěšné
UI čtení; navazující odezva i celá B3 akceptace jsou nyní uzavřené výše.

**Původní B3 rollout — navazující UI akceptace a úklid nyní uzavřené:**
Aktivační zdroj **1db4631e424c3333553c12ebbfbba5e2aa54cca0** má
[success úplné CI 44620011513](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44620011513).
getFeedPage je ACTIVE na revizi getfeedpage-00003-tux; prvotní DEV Hosting verzi
62bd3a157ab5342b nahradila výše uvedená oprava ab27253.
serverUnreadFeed a B2 jsou zapnuté. Kompatibilních sedm Functions ze zdroje
1a4d184 / CI 44614605147 a skutečný rollback → resume → nový audit → activate
jsou ověřené; control revision 6 čte feed-v2 a udržuje oba writery.

V rámci [schváleného pilotu](plans/feed/B3_DEV_ROLLOUT.md#dev-rollout-results)
vzniklo přesně 120 nových 24h syntetických Shoutů a 90 testovacích značek
přečtení. Živé interní jádro oběma účtům vrátilo 50 → 100 → 120, staré
negrupované i B3 pořadí: na začátku měl Bright_Otter_182 50 nepřečtených, TestBusiness 100.
Tento původní důkaz sám nenahrazoval veřejný Auth/App Check a UI. Uživatel potvrdil další
stránky a oddělovač; zjištěná regrese měření a vizuální doplnění mají rozsah
výše. Po jejich nasazení proběhly klientské kontroly i schválený úklid.
Původních 38 zdrojů a původní žádost jsou zachované; žádná Auth mutace.
Browser host byl nedostupný a nativní automatická kontrola zastavila Chrome
kvůli neověřené URL; ve stejném tahu tuto kontrolu neobcházet jinou cestou.

Čistý izolovaný checkout nasazeného 1db4631 je v ignorovaném
build/b3-dev/release-1db4631, jeho místní i hlavní pilot-state mají phase cleaned.
Úklid odsud proběhl s přesným CI 44620011513 a digestem uloženého plánu;
další práce tímto CLI není potřeba. Stav je synchronizovaný v obou checkout.
Nezakládat nový pilot ani neopakovat migraci. Návratový v3 web bez B3 je
ověřený. Produkce/main/Rules/indexová konfigurace/Auth účty/Scheduler se nemění.

**Předchozí provozní příprava — uzavřená:**

Na feature/feed-b3-operator je schválená
[provozní příprava B3](plans/feed/B3_DEV_ROLLOUT.md#operator-preparation):
řízený CLI s digestem, kontrolou přesného úplného CI a zdrojové inkarnace,
společné vypnuté hostitelské zapojení a oddělená omezená read cache.
Prošlo 22 emulátorových a 6 unit regresí; oba Functions artefakty zachovaly
oddělení migračního nástroje od živého hostitele. Zdroj
**16e2ea524f565a43e2bbc43f9e83f8e0b69c4ded** má
[success úplné CI 44607375041](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44607375041):
381 Flutter, 17 browserových + 2 transportní, 82 tools, 141 Functions unit
(486 integračních mimo emulátor přeskočeno), 457 Rules/server, 34 B2 runtime,
138 purge/runtime a 15 Storage testů, lint/formát/analyzátor i webový build.
Skutečný CI doklad prošel ověřením CLI a vypnutý režim odmítl mutaci před
otevřením databáze; test navíc databázovou factory nepodmíněně blokoval.
Přípravný úsek je uzavřený, nevracet se k jeho implementaci.
[Měření](plans/feed/B3_DEV_ROLLOUT.md#operator-preparation) má 5 scénářů / 35
výběrů: hustá historie 10 000 značek znamenala 284 SDK dokumentových čtení
na první stránku/novou obnovu, další stránka 80; vždy včetně 50 těl.
Nejde o cenu ani potvrzení kapacity 5 000 aktivních uživatelů.

Read-only DEV inventura: Standard/europe-west3, control active/revision 1,
jediná generace feed-v1, 38 Shoutů / 0 active. Všech sedm dotčených Functions
je ACTIVE; žádné cloudové zápisy. Je připravený
[konkrétní živý DEV návrh](plans/feed/B3_DEV_ROLLOUT.md#dev-pilot-proposal)
feed-v1 → feed-v2 s digestem 6db86498…b329347c, sedmi kompatibilními Functions,
návratem a pilotem na 120 nových 24h syntetických Shoutech. Živý rozsah
je již schválený výše. Nové B3 přepínače zatím zůstávají false; main/produkce/Rules,
Auth účty a Scheduler se nemění. Dnešní lokální příprava nic nenasazuje.

**Předchozí přechodové jádro — uzavřené po CI:**

Kontrola po přerušení 19. listopadu potvrdila success zdrojového CI 44419427913
i dokumentačního CI 44421327266, shodu pushnutých commitů a čistý pracovní strom.
Předchozí lokální B3 bylo dokončené. Vlastník následně schválil
[lokální přechod obou formátů](plans/feed/B3_DEV_ROLLOUT.md#local-transition-proposal).
Na feature/feed-b3-transition je kompatibilní writer, obnovitelné doplnění,
audit úplných projekcí, přepnutí/návrat a kompatibilita starých kurzorů.
Zdroj **7191502b29b57c063c1e40f714df1ee9f98d4e78** má
[success úplné CI 44565313452](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44565313452):
381 Flutter, 17 browserových + 2 transportní, 82 tools, 135 Functions unit
(482 integračních mimo emulátor přeskočeno), 457 Rules/server, 34 B2 runtime,
134 purge/runtime včetně všech 18 přechodových a 15 Storage testů;
také formát, analyzátor, lint a webový build.
[Podrobné výsledky](plans/feed/B3_DEV_ROLLOUT.md#local-transition-results)
rozlišují lokální důkazy a provozní meze. Nové B3 flags zůstávají vypnuté;
žádné nasazení ani živá migrace neproběhly.

Řízený provozní vstup a návrh živého DEV přechodu jsou připravené výše.
Interní jádro není součástí nasazovaných Functions. Živý rozsah vyžaduje zvláštní souhlas;
hotové lokální implementace ani B2 testy neopakovat.

**Předchozí základ B3 — lokální implementace a automatické ověření uzavřené po CI.**
[Rozsah a upřesnění vlastníka](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b3-local):
zmrazené globální pořadí, dvě skupiny podle vzdálenosti a oddělovač Přečtené.
Číslovka nově příchozích Shoutů patří do navazujícího B4. Na feature/feed-b3
je opt-in propojení skutečných B2 bloků s historickým prostorovým snapshotem
a bariéra úplné synchronizace v klientu. Živé flag/wrappery se nezměnily;
nový režim vyžaduje označenou generaci s otiskem obsahu. Prošlo 62 širších
emulátorových a po poslední změně 17 cílených API/cache testů, 80 Flutter,
23 cílených unit/tools, ESLint a analyzátor. Celý lokální balíček má 82 tools
a 135 Functions unit (464 integračních mimo emulátor přeskočeno).
Zdroj **c2cdb48aedcd0584eeb675935b4694af8b46701e** má
[success úplné CI 44419427913](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44419427913)
včetně Flutter/browser, Rules/server, B2 runtime, purge, Storage a webového
sestavení. Dřívější chyba modulového grafu účtového artefaktu z CI 44418757494
je opravená oddělením čistého otisku od B2 kodeku; kontrola balíčků zůstala.
Pracovní strom je po zdrojových commitech čistý; nejde o nasazení.
[Lokální výsledky a naměřené náklady](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b3-local-results)
odlišují studenou cestu od opakovaných stránek s cache. Před DEV aktivací
zbývá posoudit studený náklad a doložit živý plán společného přechodu.

[Závěrečná akceptace a úklid](plans/feed/B2_DEV_ROLLOUT.md#b2-acceptance-complete)
dokládají přenos/import mezi dvěma klientskými relacemi, zachování fronty při
zablokovaném callable a úplném znovunačtení aplikace, potom skutečný HTTP 200
s platným Auth/App Check. Opakování zachovalo serverovou revizi, confirmedAt
i retenci. Původní pilotní helper z čistého bc4a6e1 přes indexový writer
uklidil oba Shouty, čtyři záložky, související potvrzení a testovací cloudové
read záznamy. Následná verify má phase=cleaned; 38 původních zdrojů je beze změny,
žádná Auth mutace. Dočasný checkout je odstraněný. Místní potvrzené testovací
značky mají původní expiraci +7 dní; žádná neodeslaná fronta nezůstala.

Backend bc4a6e1d38f7d46c2144fe31521c1cdbe91e507a má success úplné CI 44099715617;
nasazení i čtyři field výjimky jsou doložené v [rolloutu](plans/feed/B2_DEV_ROLLOUT.md#dev-rollout-results).
DEV read sync, účtový read úklid i minutová retence zůstávají aktivní. Dnes se
nenasazovalo; produkce, main, Rules a původní pending žádost se neměnily.
[Izolované HTTP regrese](plans/feed/B2_DEV_ROLLOUT.md#http-recovery-tests) mají
success úplné CI 44157663737 a doplňují živý průchod. Ověřený restart znamená
nový dokument/Flutter aplikaci přes Ctrl+R, nikoli celý proces Chrome nebo
odpojení operačního systému. Nevytvářet znovu fixture ani neopakovat hotové B2.

Hotový lokální rozsah B3 ani B2 neopakovat. Další je po CI a schválení provést
připravený řízený DEV přechod a živé ověření. B3/B4 ani
produkční kapacita 100 000 účtů / 5 000 aktivních relací hotové v DEV nejsou.

Fontová oprava je také uzavřená v DEV: zdroj
9e3828dd37bd8ce68713f87cedb956db0a135124, success úplné CI 44178308912,
Hosting 74d0c3756884ac19. Vlastník potvrdil zmizení Noto hlášky;
[důkazy a oba v3 návraty](operations/CONSOLE_WARNINGS.md#category-font-dev-rollout)
zůstávají platné. Intl.v8BreakIterator je [diagnostikovaný ve Flutter engine](operations/CONSOLE_WARNINGS.md#intl-break-iterator);
SDK/bootstrap se nemění. CSP/QUIC a pozdější Listen 400 mají samostatnou
evidenci a jejich oprava se netvrdí. Následující datované přípravy jsou
historické podklady, jejich vypnuté flags nejsou stavem dnešního DEV.

**Příprava DEV B2 je uzavřená po CI; skutečné spouštění a pilot čekají.**
Na feature/b2-dev-preparation je vypnutý retenční adaptér s 24h klidem,
odděleným controlem a transakční ochranou. Účtový read úklid je explicitně false;
čistý plánovač pokrývá jen čtyři DEV field výjimky bez TTL. 68 emulátorových
regresí a 17 Chrome/IndexedDB testů prošlo včetně neaktivního v3 návratu.
Zdroj `405be7d8218d628a85a93d529cdf391d7085bf3c` má
[success CI 44077124957](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44077124957):
81 tools / 131 Functions unit (457 skip mimo emulátor) / 450 Rules/server /
34 B2 runtime/retention / 116 purge / 15 Storage a Flutter/browser/formát/analýzu/build.
Čistý neaktivní release ze stejného SHA má ověřenou kopii 68 souborů v
build/b2-v3-rollback-405be7d8, s manifestem/proofem a kontrolovanými SHA-256.
[Rozsah a pořadí DEV pilotu](plans/feed/B2_DEV_ROLLOUT.md). Skutečné spouštění,
aktivace a živá ověření nejsou tímto úsekem povolené. Žádné nasazení či živé zápisy.
Další je rozhodnutí o spouštění úklidu a konkrétní vymezený DEV pilot podle plánu;
lokální přípravu neopakovat. Produkční kapacita a živá akceptace nejsou prokázané.

**Lokální retenční úklid B2 je uzavřený po přesném CI; není nasazený.**
Na feature/b2-retention-cleanup jsou oddělené read/receipt runnery s atomickým
kurzorem a lease, měřením a čtyřmi připravenými indexovými výjimkami bez TTL.
28 cílených emulátorových regresí, 129 Functions unit, 79 tools a lint prošlo.
Zdroj `5f3ed5ce014ef303ae163d9034fd1ae6a23e03a3` má
[success CI 44060619655](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44060619655):
129 Functions unit (447 integračních přeskočeno mimo emulátor), 448 Rules/server,
26 B2 runtime/retention, 116 purge, 15 Storage a Flutter/browser/formát/analýzu/build.
650 receipt se odčerpalo v 5 úsecích, 1 000 značek bylo 19 bloků.
[Rozsah, důkazy a návrh kapacity](plans/feed/FEED_READING_POLICY.md#b2-retention-implementation).
Živý plánovač, Rules, Auth, přepínače ani data se nemění. Implementace i
automatické ověření jsou v metrice uzavřené. Další je provozní spouštění/rozpočet,
dokončení indexace, účtové zapojení, v3 návrat a konkrétní DEV pilot.

Vlastník schválil [větší funkční úseky a seskupené push/CI](operations/RELEASING.md#development-checkpoints).
Průběžné lokální kontroly a samostatné brány rizikových přechodů zůstávají;
implementační priorita je nadále provozní dokončení B2. Jde o pracovní pravidlo, ne nové
dokončení produktového úseku nebo změnu nasazení.

**Údržba CI je uzavřená po ověření obou režimů; další je B2 úklid.**
Na fix/selective-ci má zdroj `27f46e8cd98c195471e68cc6bdedb592a75fc819`
[úspěšné úplné CI 44053527899](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44053527899)
za 13 min 7 s: 22 cílených regresí, 79 tools a všechny původní aplikační,
serverové, emulátorové kontroly i webový build. Dokumentační commit
`fe50d95e5c7280a1680970693961275adc189575` má
[úspěšné lehké CI 44053648299](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44053648299)
za 11 s, s 22 testy, čistou dokumentací a skutečně přeskočenými těžkými kroky.
[Režimy a hranice](operations/TESTING.md#dva-rezimy-ci). Aplikace, Firebase ani
procenta se neměnily; nic se nenasazovalo. Další produktový úkol je B2 úklid níže.

**Nová metodika stupnic je uzavřená po přesném CI; další je B2 úklid.**
Feature/progress-substeps zachovává 24 MVP milníků a 157 backlogových položek,
ale eviduje jejich podúseky s pevnými vahami. Registry, podklady a generátor
jsou v [PROGRESS](PROGRESS.md); aktuální procenta se odvozují jen do TODO/BACKLOG.
Zdroj `dad4ecd4ebaceecf09a0349e15c0e8f668f72e34` má
[success CI 44044929954](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44044929954):
68 tools včetně 11 cílených regresí výpočtu, 375 Flutter / 16 Chrome /
127 Functions unit (431 integračních přeskočeno mimo emulátor) / 448 Rules/server /
10 B2 runtime / 116 purge / 15 Storage a formát/analýza/lint/build.
Dokumentace a šest snímků jsou bez chyb; všech 157 checkboxů a 24 kritérií je
zachovaných. Nové procento zachycuje i již doložené podúseky, ne další hotové
milníky. Nic aplikačního ani živého se neměnilo. Vrátit se k B2 úklidu níže.

**Schválená serverová obsluha B2 je uzavřená po přesném CI; není nasazená.**
Na feature/read-sync-runtime jsou izolované callable obálky, control
off/active/paused, kvóta 40 + 1/s pro každý směr/UID a klientský adaptér za false
v DEV i produkční konfiguraci. 375 Flutter / 127 Functions unit, 10 různých
emulátorových scénářů napříč dvěma běhy a 24 cílených tools prošlo; analýza/lint čisté.
Test 1 000 značek prošel bez quota čekání, 10 000 zachoval všechna data přes
přerušení/restart; obnova beze změn má 14 reads + 1 rate write.
Zdroj `cce1e7d49f12b8a79374cb3117bd1dbc2f10b6a9` má
[success CI 43284395332](https://github.com/MikeyBeatz/ShoutOut/actions/runs/43284395332):
375 Flutter / 16 Chrome / 57 tools / 127 Functions unit (431 integračních
přeskočeno mimo emulátor) / 448 Rules/server / 10 runtime / 116 purge / 15 Storage
a formát/analýza/lint/build. CI zopakovalo stejné SDK počty obou velkých front.
[Konkrétní rozsah, počty a omezení](plans/feed/FEED_READING_POLICY.md#b2-runtime-implementation).
Současné živé artefakty nový host neimportují; žádné Functions, Rules,
Scheduler ani živá data se neměnily. Následuje kapacitně navržený
retenční úklid před aktivací. B2–B4 ani celá kapacitní brána nejsou uzavřené.

**Schválený klientský úsek B2 je uzavřený po přesném CI; není nasazený.**
Na feature/read-sync-boundaries je hranice outboxu a sync při startupu/obnově,
IndexedDB v3 s atomickou migrací v1/v2, import/checkpoint s CAS a cold restart.
369 Flutter / 16 Chrome, 39 cílených regresí prošlo; fronta 1 025 značek má
33 dávek bez skenování od začátku, pozdější značka čeká. Selhání migrace,
souběžné karty, disková chyba i erase jsou ověřené. Zdroj
`049cedc4cb4ec01b8a24ac93b04e8b9399205290` má
[success CI 43270732252](https://github.com/MikeyBeatz/ShoutOut/actions/runs/43270732252):
369 Flutter, 16 Chrome, 55 tools, 124 Functions unit (421 integračních testů
přeskočeno mimo emulátor), 448 Rules/server, 116 purge, 15 Storage
a formát/analýza/lint/build. CI fronta 1 025 značek: 33 dávek, 655 ms lokálně.
[Rozsah a důkazy](plans/feed/FEED_DELTA_REFRESH_PLAN.md#b2-client-results).
Transport je stále null; Functions/Rules/konfigurace ani živá data se neměnily.
V3 zatím není nasazené a návratový artefakt musí v3 podporovat. Runtime navazuje
ve výše uvedeném úseku, úklid a propojení obnovy zbývají; B2–B4 jsou otevřené.

**Společný plán úsporné obnovy je zapsaný.**
Vlastník schválil připravit kontrakt nyní a realizovat jej v pořadí B2 → B3 → B4.
[Kontrakt](plans/feed/FEED_DELTA_REFRESH_PLAN.md) odděluje verze obsahu/čítačů,
bloková metadata, cache, dostupnost a baseline novinek. Do B4 patří přenos
rozdílů a úsporná detekce s číslovkou; další cache podle měřeného přínosu.
Tento dokumentační krok nemění implementaci, nasazení ani stav milníků.

**Kapacitní lokální úsek je uzavřený po přesném CI.**
Vlastník schválil model/testy pro 100 000 účtů / 5 000 aktivních uživatelů
a [upřesnil synchronizaci](plans/feed/FEED_READING_POLICY.md#refresh-boundary-policy):
pouze při spuštění/skutečné obnově feedu; nahrazuje 10s upload/resume pull.
Přečtení místně zůstává ihned, číselný indikátor obnovy B4 není hotový.
Na feature/capacity-model je offline nástroj a čtyři nové emulátorové testy:
4 modelové regrese, 4/4 cílené emulátorové průchody, 55 tools a lint prošly.
Zdroj `4024e496d017ebd6705b9ccd4d5dc697ac26b3c8` má
[success CI 43254458838](https://github.com/MikeyBeatz/ShoutOut/actions/runs/43254458838):
361 Flutter, 10 Chrome, 55 tools, 124 Functions unit (421 integračních
testů přeskočeno mimo emulátor), 448 Rules/server, 116 purge, 15 Storage
a formát/analýza/lint/build. Nejde o cloudový test 5 000 uživatelů.
[Výsledky a návrh škálování](operations/CAPACITY_AND_SCALING.md) rozlišují
model, skutečné SDK pokusy a neověřenou cloudovou kapacitu. Souběžné zápisy
jsou správné, opakování transakcí stojí operace; pevný úklid 500 receipt/den
neodpovídá modelové zátěži. Další je konkrétní revize runtime B2/úklidu
podle výsledků; bez implementace B4 nebo nové provozní datové vrstvy.
Aplikační chování, konfigurace a živá prostředí zůstaly beze změny.

**Starší základ B2a je uzavřený; novější klient/runtime jsou popsané výše.**
Schválený lokální úsek je na `feature/feed-read-sync`: transakční bloky,
stránkovaný snapshot/delta, IndexedDB v2 outbox a připravené klientské napojení.
360 Flutter, 10 Chrome/IndexedDB, 49 cílených emulátorových regresí, 124 Functions
unit a 51 tools prošlo; přidaný test slučování souběžných požadavků prochází
v 11 cílených testech. Analýza/lint čisté, debug web sestavený a otisky ověřené.
Zdroj `693663d0c25c7106a7bfbb8efcc9bdc947b955cc` má
[success CI 43119749520](https://github.com/MikeyBeatz/ShoutOut/actions/runs/43119749520):
361 Flutter, 10 Chrome, 51 tools, 124 Functions unit (417 integračních testů
se v neemulátorové fázi přeskakuje), 444 Rules/server, 116 purge, 15 Storage
a formát/analýza/lint/build. B2 nemá exportované Functions,
syncFactory je v aplikaci null a účtový readSyncEnabled je false. Nic nebylo
nasazené ani zapsané do živého prostředí. Výsledky a omezení jsou v
[B2 checkpointu](plans/feed/FEED_READING_POLICY.md#b2-local-results).
[Provozní návrh B2](plans/feed/FEED_READING_POLICY.md#b2-runtime-proposal)
uchovává starší podklad k četnosti, pokračování, dennímu úklidu, indexaci a návratu.
Novější trigger politika, klient v3 a schválená serverová obsluha jej nahrazují
v rozsahu svých výše uvedených výsledků. Fyzický úklid a konkrétní živý DEV plán
nadále zbývají; staré limity nebo tehdejší stav runtime nepřebírat jako aktuální.

**Poslední živé nasazení — B1 a regrese Uložených, uzavřené v DEV.**
Aktuální zdroj `503eea672db85fb06200115488a4e313cd751d48` na
`feature/feed-read-tracking` má
[success CI 43056516730](https://github.com/MikeyBeatz/ShoutOut/actions/runs/43056516730):
350 Flutter, 8 skutečných Chrome/IndexedDB, 51 tools, 119 Functions unit,
436 Rules/server, 116 purge a 15 Storage; formát/analýza/lint/build prošly.
Z čistého releasu byl 11. listopadu v 17:26 SEČ nasazen pouze DEV Hosting
`47268ed17fd2eebd` na projekt/site `shoutout-dev-46c81`. Čtyři soubory obou
originů souhlasí s manifestem. API porovnání před/po potvrzuje stejných
18 Functions i Firestore ruleset `d5193d0b-e957-4c76-ab46-54b0f9a8beac`.
Produkce, main, Auth, Rules a prostředky Functions se neměnily.
Návratová verze webu je `de78cfc631c1acc1`.

B1 měří úplnou expozici nadpisu/textu a ukládá místní značky do IndexedDB
podle projektu/UID; při běžném odhlášení je zachová do expiresAt + 7 dní,
při potvrzené žádosti o smazání účtu je odstraní. Zahrnuje úklid prošlých
značek dřívějších účtů; nové Firebase operace samotná evidence nepřidává.
Produkční přepínač se neměnil. Přes indexový writer vznikly právě dva
schválené 24hodinové Shouty `mvp-read-20261111-{short,long}`, po jednom pod
existujícími Bright_Otter_182/TestBusiness. Živé jádro oběma účtům ověřilo
záložky, odebrání/obnovení a idempotentní replay; nejde o HTTP/UI důkaz.
Vlastník pod Bright_Otter_182 potvrdil zmizení krátké karty bez ruční obnovy
i její nepřítomnost po znovuotevření. Dva read-only IndexedDB výpisy potvrzují
short i long jako přečtené se stejnými časy před/po restartu (1794414568452 /
1794414596259). TestBusiness nemá v tomto originu databázi; jeho živé čtení
netvrdit. Oddělení účtů, logout, vymazání i souběh pokrývá browserová/lokální sada.
Oba testovací Shouty jsou uklizené přes indexový writer: 2 kořeny, 3 záložky,
9 receipt, nulový zůstatek zdrojů/receipt i aktuálních indexových metadat.
Původních 37 zdrojů má stejná updateTime; 0 nových/smazaných Auth účtů.
Dvě místní testovací značky uživateli ručně nemažeme; platí jejich původní
expiresAt + 7 dní. Důkaz: build/read-tracking-ui-proof.json a cleanup proof.
Log první akce ukazuje start instance asi 3,3 s a vlastní volání 0,69 s,
Auth/App Check VALID. Jde o diagnózu latence, žádná změna prostředků nebyla provedena.
[Podrobnosti B1](plans/feed/FEED_READING_POLICY.md#b1-implementation).
Společná DEV akceptace A2/A3 i webové B1 jsou uzavřené. Vlastník následně
schválil B2 retenci expiresAt + 7 dní, upload nejvýše 32 / první termín 10 s,
přenos při loginu/návratu/obnově bez prázdného pollingu a první lokální úsek.
Ten je připravený podle checkpointu výše; nejde o živé B2 ani dokončení B3/B4.
Živá/provozní brána, denní fyzický úklid a konkrétní DEV pilot ještě zbývají.

Předchozí oprava Uložených dbf2aad / CI 42932603771 / web de78cfc631c1acc1
je základem této verze. Její dva starší `mvp-saved-20261111-*` fixture jsou
od 16:11 SEČ uklizené: 2 kořeny, 4 záložky a 8 receipt; aktuální index bez
jejich metadat, původních 37 zdrojů se stejným updateTime. Dřívější chybějící
UI důkaz nyní doplňuje výše uvedený nový test, nikoli další opakování starých dat.
[Checkpoint Uložených](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#saved-client-regression).

**Předchozí uzavřená část: vlastní seznam a expired interakce.**
Vlastní stránky, menší pokračování až za poslední kartou a zámek interakcí
po expiraci jsou uzavřené v DEV. Zdroj `14b7885b35b89f62633a3d7496e10483fa91a739`
na `feature/expired-shout-read-only` má
[success CI 42902048239](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42902048239):
316 Flutter, 50 tools, 119 Functions unit, 434 Rules/server, 116 purge a 15 Storage,
formát/analýza/lint/build. Nasazené jsou pouze tři Functions, Rules a DEV web
`831e3baaea8a8df3`; zdrojové archivy, prostředky, HTTP 401 i oba webové originy
souhlasí s čistým releasem. Vlastník potvrdil tlačítko za kartami, zachování
scrollu i neaktivní interakce při zachovaném čtení detailu. Browser host je
nedostupný; jde o jeho UI potvrzení, ne automatizovaný browserový průchod.
Živé jádro přes Admin SDK ověřilo dva schválené krátce platné Shouty:
před expirací interakce prošly, po ní pět nových akcí na každém selhalo,
čítače i vedlejší data zůstaly stejné a původní receipt se opakoval bez zápisu.
Nejde o náhradu HTTP Auth/App Check testu. Oba nové Shouty, 10 potomků a 18
vedlejších záznamů jsou uklizené. Po UI potvrzení je uklizených také původních
120 fixture, 27 receipt a 1 oznámení; v aktuálním indexu nezůstala jejich metadata.
Původních 37 Shoutů má shodné updateTime; Auth účty se nevytvářely ani nemazaly.
Výjimky pro vlastní mazání, moderaci a účtový úklid platí; retence se nemění.
Chování Uložených při čekání/chybě/pokračování řeší novější úsek výše;
jeho živé UI potvrzení i úklid nové dvojice B1 jsou uzavřené podle checkpointu výše.
B2–B4 ani celý milník hotové nejsou.
[Pravidlo, hranice a testy](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#expired-interactions).

Dosavadní nasazené vlastní stránky: vlastník schválil konkrétní opravu
„Mé shouty“ 10. listopadu. Na `fix/own-shouts-pagination` je dokončený
getOwnShouts, vlastní klientské stránky i živé karty/mazání. Celá Flutter sada
313/313, analýza a lint čisté, 9/9 cílených serverových regresí (6 own / 3 saved),
16/16 cílených klientských regresí a 2/2 testy balíčků. Zdroj
`4e7e5bdfd9e026a2ff76b253a9a233fee2022f65` má
[success CI 42884625807](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42884625807).
Pouze v DEV byl nasazený jeden dotazový index READY, Function getOwnShouts
`00001-fik` a web `4c61d6a850b330b7`; 42 modulů Function i otisky webu na
obou originech souhlasí s čistým releasem. Živé jádro přes Admin SDK vrátilo
vlastní expired stránky 50 + 10 běžnému účtu a 50 + 11 Business (60 fixture
a jeden původní Shout), bez duplicit/cizích autorů a od nejnovějších.
Query Explain: první stránka 50 dokumentů / 51 indexových položek / 51 read
operations; nejde o celkovou cenu celé callable včetně kontrol účtu.
Vlastník ověřil Business další stránku až na konec, palce a mazání. Tlačítko
bylo nenápadné a pokračování přesunulo seznam nahoru. Příčina je lokálně
reprodukovaná: vložení progress indikátoru znovu vytvořilo neoznačený Expanded
a ScrollPosition (offset 3716 → 0). Oprava stabilní identity obsahu a výraznějšího
tlačítka má 17/17 cílených regresí včetně skutečně čekající síťové odpovědi,
314/314 celé Flutter sady a čistou analýzu. Zdroj
`ce6b07a6ca0670235da8da3ab44bbcf91fa98b40` má
[success CI 42890208984](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42890208984)
a byl nasazený pouze na DEV Hosting `fa0a450ecbce236e`; obě adresy souhlasily
s čistým release manifestem. První testy
vracely Future ihned, takže přechodový loading frame nepokryly.
Logy potvrzují platné Auth/App Check a HTTP 200 pro stránky/palce/mazání;
rychlé palce občas vrátily 429, v souladu se stávajícím odstupem 1 sekundy.
Limity ani obecná hláška se neměnily. Před závěrečným úklidem byly dva fixture
deleted, 118 expired, bez podkolekcí, původních 37 zdrojů beze změny;
uložení a okamžitou změnu počtu vlastník mezitím potvrdil. Změnu tlačítka
a novou politiku expired uzavírá úsek výše včetně úklidu.
Test záložky u expired se týkal ikony/počtu v Mé shouty;
sekce Uložené podle dosavadní politiky vrací jen aktivní obsah.
Na `feature/feed-page-integration` je
nový prostorový feed skutečně zapojený v `shoutout-dev-46c81`: osm Functions,
Rules, podpisový klíč, indexy, aktivní generace `feed-v1` i web.
Aktivační zdroj **ccc879f485caa24374cadc1dba49ddcec50a4a95** má
[success CI 42358058964](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42358058964).
Nasazovalo se z čisté samostatné kopie v pořadí server → index → web.
Obsah nasazených Functions byl porovnaný se zdroji (41/37 modulů), web
s release manifestem; konkrétní revize jsou v tabulce níže.

Živý serverový test pod existujícími Bright_Otter_182/TestBusiness prošel:
50 → 100 → 120, žádné duplicity, vzdálenost, kategorie, radius, Top/Končící/
Sledované, odmítnutí cizího kurzoru, idempotentní reakce, záložka/odebrání
a stabilní pořadí až do obnovy. Jde o test jádra přes Admin SDK, nikoli
náhradu klientského Auth/App Check. Vlastník samostatně potvrdil zobrazení
po zvětšení dosahu i načítání dalších stránek v Business webu; serverové logy
to potvrzují platným Auth/App Check a třemi HTTP 200 (0,52–1,07 s na serveru).
Minutový worker běží na nové revizi bez chyb; rozvrh a obsahová dávka se neměnily.

**Read-only kontrola před úklidem 11. listopadu:** z původních 120 Shoutů
`mvp-feed-20261107-*` bylo 118 expired a 2 deleted, bez konfliktů a podkolekcí;
1 testovací oznámení, 37 původních zdrojů se shodným updateTime a feed-v1 active.
Důkaz `build/feed-resume-inventory.json` předcházel úklidu; aktuální nulový
zůstatek dokládá `build/own-shouts-cleanup-proof.json`. Žádný Auth účet se
nevytvářel ani nemazal. Identifikace fixture a výsledky jsou v
[záznamu rolloutu](plans/feed/FEED_INSTALLATION_AND_ROLLOUT.md#dev-rollout-results).
Plovoucí obnova je nyní **pouze ikona vpravo nahoře**, ze zdroje
`f08abf97cf34686a7c776848c01bb7627ca08719` na `fix/feed-refresh-top-right`,
[success CI 42363878639](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42363878639).
Lokálně 15/15 widget/session testů a čistá analýza, včetně šířky 320 bodů,
nekolidujícího zvonku a chování scrollu. Oba DEV originy odpovídají manifestu
nového release; vlastník tuto polohu potvrdil a požaduje stejný plovoucí
styl také pro oznámení. **Plovoucí zvonek je od 10. listopadu nasazený** vlevo
od obnovy se stejným odznakem a jediným dosavadním odběrem. Zdroj
`1fbf2ae40d34802069c365559c74d402a26f0b37` na `fix/feed-floating-notifications`
má [success CI 42365663624](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42365663624).
Lokálně 15/15 widget/session testů a čistá analýza; ověřený dosah obou
tlačítek po scrollu a otevření oznámení bez dalšího načtení feedu.
Přerušení ponechalo hotový build před nasazením; před navázáním bylo ověřené,
že DEV stále vydával předchozí f08abf9. Nyní oba DEV originy odpovídají
novému manifestu. Vlastník nyní potvrdil hotový zvonek; tato UI připomínka je uzavřená.
Functions, Rules ani data se těmito UI rollouty neměnily.
Regrese Uložených, vlastní reakce/uložení, nové tlačítko, zámek expired
i úklid jsou uzavřené. Celý feed/milník tím není hotový; B2–B4 zbývají.
Jeden lokální SDK vzorek měl 65,8 s;
příčina není potvrzená, toto měření není cloudová latence ani cenový benchmark.

Produkce/main se neměnily. Produkční účtový wrapper a provozní konfigurace
nadále patří do startovní brány. Před MVP dál zbývají B2–B4; B1, regrese
Uložených i vlastní zdroj Aktivní/Expirované jsou uzavřené v DEV. Starší R6 výsledky níže
popisují tehdejší lokální etapy; současné zapnutí dokládá tento rollout.

[R6e](plans/feed/FEED_RUNTIME_PROPOSAL.md#r6e-results) je lokálně uzavřené na
feature/feed-runtime-adapter. Zdroj 9a054bb66f4e871de305d4af02ebcd41a9ec6188 má
[success CI 42292159081](https://github.com/MikeyBeatz/ShoutOut/actions/runs/42292159081):
293 Flutter, 47 tools, 115 Functions unit, 398 Rules/server, 106 purge,
15 Storage, analýza/formát/lint a DEV web build. Lokálně také 47/47 závěrečných
regresí a načtení obou artefaktů se shodnými exporty. Společná factory writeru,
časné fronty a koordinátoru je ve wrapperech za **vypnutou** volbou; při off
nevznikají nové databázové přístupy. Lab ochrany, dávka 50 a retence zůstávají.
Důkazy: build/feed-runtime-ci.{json,log}, build/feed-runtime-local-proof.json
a lokální logy uvedené v R6e. Žádné nasazení, živá data, Rules, Scheduler ani nové Auth účty.
Navazující provozní plánování, instalační nástroj a API/klient jsou nyní
připravené ve výše uvedené integraci. Pouhé přepnutí volby na true není
hotový rollout; živý datový/klíčový přechod má vlastní schvalovací bránu.

[R6d koordinace purge](plans/feed/FEED_RUNTIME_PROPOSAL.md#r6d-results) je lokálně
připravená na feature/feed-purge-proof-coordinator. Volitelný koordinátor
využije aktuální doklad bez globálního rescanu, jinak obnoví omezenou práci;
po původním termínu dočistí targets a atomicky smaže hlavičku s žádostí.
Finalizing brání obnově dokladů během dočišťování; purgeRevision chrání
recovery checkpoint proti návratu UID. Původní Auth/lease/retence zůstávají;
bez koordinátoru dosavadní cesta. Finálních 14/14 regresí, unit 114 pass,
lint čistý. Žádné nasazení, živá data, Rules, plánovač ani nové Auth účty.
Důkazy: build/feed-purge-coordinator-{final,unit-final,lint-final}.log.
R6d je lokálně uzavřená: zdroj c7c1fef708e93a5a50ca73d6549d22d777d33543 má
success CI 42258910004 — 293 Flutter, 45 tools, 114 Functions unit,
397 Rules/server, 95 purge, 15 Storage, analýza/formát/lint a DEV build.
Strojové důkazy: build/feed-purge-coordinator-ci.{json,log} a
build/feed-purge-coordinator-local-proof.json. Zdroj i dokumentace jsou pushnuté.

[R6c časná fronta](plans/feed/FEED_RUNTIME_PROPOSAL.md#r6c-results) je připravená
na feature/feed-early-erasure-queue. Pouze emulátor: nezávislé recovery,
lease/guard, stránkované generace, inkarnace/digest, R6a řez a atomický doklad
se zavřením R5 journalu. Lokálně 18/18 závěrečných testů a předchozí společná
regrese 29/29, Functions unit 113 pass a lint. Primární obsah/archiv/žádost
zůstaly v testu shodné včetně updateTime; původní deadline se neprodlužuje.
Živý worker doklad dosud nekonzumuje; lokální volitelné zapojení přidává R6d
výše. Žádné živé změny, plánovač, Rules ani nové Auth účty.
Důkazy: build/feed-early-queue-{final,regression,unit-final,lint-final}.log.
R6c je lokálně uzavřená: zdroj 75ce8f35c7fb335fca16c08324aaad8394015610 má
success CI 42251697874 — 293 Flutter, 45 tools, 113 Functions unit,
397 Rules/server, 81 purge, 15 Storage, analýza/formát/lint a DEV build.
Strojové důkazy: build/feed-early-queue-ci.{json,log} a
build/feed-early-queue-local-proof.json. Zdroj i dokumentace jsou pushnuté.

[R6b Admin ochrana](plans/feed/FEED_RUNTIME_PROPOSAL.md#r6b-results) je lokálně
připravená na feature/feed-admin-write-guard: striktní kontrolní kontrakt,
transakční kontrola off/žádná generace, updateTime preconditions čtyř opravných
CLI a staré geohash opravy; tři seed/reset CLI blokované před první mutací.
11/11 emulátorových regresí, 112 Functions unit, 45 tools, lint/syntaxe prošly.
Žádný živý řídicí dokument, generace, opravy, Auth účty či nasazení.
Důkazy: build/feed-admin-guard-{regression,unit,tools,lint}.log.
R6b je lokálně uzavřená: zdroj e646d79ea730f45f7da95de9b192e737f80132a7 má
success CI 42243312876 — 293 Flutter, 45 tools, 112 Functions unit,
397 Rules/server, 63 purge, 15 Storage, analýza/formát/lint a DEV build.
Stav a úplný log: build/feed-admin-guard-ci.{json,log}; souhrn
build/feed-admin-guard-local-proof.json. Pracovní změny jsou commitnuté a pushnuté.

[Schválený lokální R6a runner](plans/feed/FEED_RUNTIME_PROPOSAL.md#r6a-results)
je připravený na feature/feed-retention-runner. Nejvýše 32 kroků / 10 s mezi
transakcemi, dávky 32/16, povinný transakční guard; žádný nový lease/scheduler.
Závěrečných 11/11 runner testů a předchozí společná regrese 46/46 prošly,
unit 109 pass a lint čistý. Včetně guardu naměřeno 34 kroků ve dvou řezech,
908 čtení / 61 zápisů / 246 delete; nejde o cloudovou latenci ani úsporu čtení.
Chyby zachovají cause a dílčí metriky, ztracený commit ack neznamená rollback.
Dokončení journalu zůstává vnější atomický krok. Bez živých dat, Auth či nasazení.
Důkazy: build/feed-retention-runner-{regression,final,unit,lint}.log a
[benchmark](benchmarks/FEED_RETENTION_RUNNER_2026-11-05.json).
Zdroj 7079cdd74d615b05c7c7e3029df89fc9adfcf230 má success CI 42114669640:
42 tools, 109 Functions unit, 389 Rules/server, 63 purge a 15 Storage,
Flutter testy/analýza/formát/lint i DEV web build. R6a je lokálně uzavřená;
provozní adaptér ani živá aktivace tím nejsou schválené.
Důkazy: build/feed-retention-runner-ci.{json,log} a
build/feed-retention-runner-local-proof.json.

Provozní návrh z 69f2b770dcf2dce13dc172de035daf60f3ca21aa má success CI 42112092816.
Čtyři emulátorové vzorky
měří celou R5 inventory i zavření journalu: 15–116 kroků, 161–3 919 čtení,
33–244 zápisů a 21–1 071 mazání. Model jednoho kroku/min drží oblast 8–79 minut;
takto živě nezapínat. Studený restart každého kroku, odstranění autora,
cizí kontrolní zdroj a audit prošly, fixture jsou uklizené. DEV databáze
read-only potvrzena Standard/europe-west3; produkční dotaz vrátil 403, parametry
nejsou ověřené. Regionální sazby/SKU, cloudové index entries/runtime a konkrétní
pilot zůstávají neověřené. Důkazy a návrh včetně Admin zápisů/migrace/návratu:
[měření](benchmarks/FEED_RUNTIME_2026-11-05.json). Žádné nasazení ani živá data.
Lokální měření prošlo ve všech čtyřech vzorcích; ochrana nástroje bez emulátoru
odmítá spuštění. Prošlo 42/42 tools testů, syntaxe nástroje, diff-check a
kontrola dokumentace (522 odkazů, žádná chyba/osiřelý dokument, archivy shodné).

Moderační indexový úsek na feature/feed-moderation-index je lokálně uzavřený:
zdroj cda647e575090711b2a87944f8a45523dbfd7de9 má success CI 42107616925:
293 Flutter, 42 tools, 108 unit, 389 Rules/server, 52 purge/15 Storage,
analýza/lint/formát/build. Lokálně také 35/35 cílených testů (11 nových).
Opravený neplatný plán a mazání/expirace zachovaného zdroje po R5; role,
oprávnění a retence zůstávají stejné. Nic se nenasazovalo a živý index je
stále mimo tento souhlas. Celé serverové rozhodnutí/report/audit je jiný milník.
Důkazy: build/feed-moderation-index-ci.{json,log}, build/feed-moderation-index-local-proof.json.
[Nálezy a přesný rozsah](plans/feed/FEED_WRITER_INTEGRATION.md#moderation-regression).

R5 je schválené a lokálně připravené na feature/feed-account-retention:
verze dotčených oblastí, ochrana autora, pokračovatelný fyzický úklid bloků,
cache/kurzory a volitelné dokončení přes skutečný účtový worker. Zdroj
2909874312f0e72f48d09c9ad468817cbdb10877 má success CI 42076107087: 293 Flutter,
42 tools, 108 unit, 389 Rules/server, 41 purge/15 Storage, analýza/lint/formát/build.
Lokálně také konečná regrese 61/61 včetně 15 R5 případů a skutečného účtového
workeru; tento předchozí lokální úsek je uzavřený. Provozní brána indexu
zůstává otevřená. Důkazy: build/feed-account-retention-ci.{json,log}
a build/feed-account-retention-local-proof.json. Nic se nenasazovalo.
R5 umožňuje dřívější obnovu dotčené relace, nezavádí další hodinovou retenci.
Provozní brána zůstává otevřená: včasná příprava, globální inventory/náklady,
serializace úklidu a délka dočasné blokace zápisů ve stejné oblasti.
[Rozhodnutí, protokol a meze](plans/feed/FEED_INDEX_RETENTION.md#account-retention-proposal).
Maintenance/purge i dávková příprava mají lokální propojení. Živý index ani
migrace dosud nejsou schválené. Účtová DEV část je včetně závěrečného pilotu
uzavřená, její fixture je uklizená. Kritéria a důkazy:
[účtový plán](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#aktualni-stav).

Na feature/feed-maintenance-index-writer je dokončené předání writeru přes celý
tick, ošetření již anonymizovaného Shoutu v konečném purge a indexové odpočty
bez zbytečných změn při odebrání záložky. Zdroj c410ce3f46403c35f87d04befee4d8358acf396d
má CI 42063945148 success: 293 Flutter, 42 tools, 107 unit, 389 Rules/server,
25 purge/15 Storage, analýza/lint/formát/build. Lokálně prošlo 45/45 cílených
emulátorových testů (10 nových) a kontrola dokumentace; lokální úsek je uzavřený.
Zahrnuje rollback, lost ack a zachování cizího obsahu. Živý wrapper index
nepředává, žádné nasazení ani živá data. Hodinová historie sama negarantuje
pevnou účtovou retenci; to zůstává povinná brána, nikoli změna schválené lhůty.
[Kontrakt a meze](plans/feed/FEED_WRITER_INTEGRATION.md#maintenance-purge).
Důkazy: build/feed-maintenance-ci.{json,log}, build/feed-maintenance-local-proof.json.

Na feature/feed-batch-index-writer je dokončený schválený lokální prepareBatch
a volitelné zapojení do prepareAccountDeletion, zdroj
1ba2b4ac94ecc6d1f519e168e794172e3260d0aa. CI 42053726540 success: 293 Flutter,
42 tools, 107 Functions unit, 389 Rules/server, 15 purge/15 Storage, analýza/lint/build.
Lokálně také konečných 18 cílených emulátorových testů a předchozích 38 indexových
regresí. Pro
50 Shoutů v jedné oblasti naměřena 3 indexová čtení, 1 nový blok/kořen/archiv;
celkem 54 zápisů včetně zdrojů a receipt. Dávkový lokální úsek je uzavřený.
Živý wrapper writer nepředává; nic se nenasazovalo a žádná živá data neměnila.
[Kontrakt, měření a meze](plans/feed/FEED_WRITER_INTEGRATION.md#batch-preparation).

Vlastník schválil další lokální úsek 4. listopadu: povinné serverové mazání
účtu/Shoutu pro všechny DEV klienty a zákaz přímých zápisů v emulátoru. Kód
a testy jsou dokončené na fix/dev-deletion-server-cutover, zdroj
7ab60c88892921101215076690a73837e15b94b4. CI 41915977658 success: 293 Flutter,
42 tools, 107 Functions, 375 Rules/server, 15 purge/15 Storage, analýza/lint/build.
Lokálně také konečných 48 cílených worker/cutover testů a čistý DEV release build,
ověřený manifest/cíl shoutout-dev-46c81. Pracovní i release kopie jsou čisté.
Po navazujícím souhlasu vlastníka je tento web i Firestore Rules nasazený pouze
v DEV: Hosting f5c7ef14f1b5e04b, ruleset c70b6f10-a51e-415d-aef5-8f8b685adb3d,
normalizovaný hash e93fee381fd8a96f3a3c02a87211c0e5a4989e7bc28502cb7a5754dd24c30dc0.
Oba originy odpovídají čistému release; Functions/Storage Rules/IAM/plánovače
a původní účtová inventura zůstaly shodné. Jeden nový dočasný Auth účet měl
schválené dva vlastní Shouty, cizí kontrolní Shout a cizí komentář. Vlastní čtení
vrací 200, čtyři přímé zápisy 403 PERMISSION_DENIED bez změny dat/updateTime.
Vlastník potvrdil první UI pokus s návratem na přihlášení bez problému a odmítnuté
další přihlášení. Server potvrdil Auth absent, jednu přípravu před žádostí,
Auth/App Check VALID, content-archived, marker a purge scheduled v původním +60d.
Dřívější token smí číst vlastní žádost, ale její smazání/změna retence vrací 403
bez změny dat/updateTime. Cizí obsah je zachovaný; kontrolní Shout během přerušení
pouze řádně expiroval, jeho ostatní pole odpovídají původnímu digestu.
Fixture včetně přihlašovacích údajů a dočasného klientského tokenu je uklizená.
Oba originy, nezměněné ostatní vrstvy a původní inventura po úklidu znovu ověřené.
UI provedl vlastník kvůli nedostupnému browser hostu. Důkazy:
build/deletion-cutover-post-cleanup-proof.json a build/deletion-cutover-live-test/.
[Kompatibilita, rozsah a návrat](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#dev-deletion-cutover).

DEV má zapnutou přípravu po 50 Shoutech, společný první/resume pokus a potvrzení
s blokujícím průběhem. Nový i starší kompatibilní tok byly živě ověřené a fixture
uklizené. Potvrzení/průběh i oprava odběrů mají widgetové testy, shodu artefaktů
a nový živý průchod bez Uncaught Error.
Nasazené vrstvy a důkazy jsou níže; účtový DEV cutover i závěrečný test jsou uzavřené.

DEV má zapnutou serverovou finalizaci a9ff425: atomická kontrola vlastních aktivních
Shoutů a založení žádosti, potom klientské potvrzení commitu před Auth.delete.
Oba přepínače přípravy/finalizace jsou true. Function je ACTIVE a anonymní volání
odmítá HTTP 401. Vlastník zrušil omezení na lokální práci a schválil průběžné DEV
rollouty s kontrolami. Následný cutover výše uzavírá žádosti a přímé skrytí Shoutu;
ostatní obsahové přímé zápisy ještě neuzavírá.

Web c2409e0587c42bcbc34008c881395a06c294549f nahrazuje zastaralé Source.server čtení
žádosti čtecí transakcí s maxAttempts=1, bez zápisů či změny oprávnění. Selhání
ensure-request / unconfirmed-account-deletion-request se podařilo vysvětlit
reprodukcí opožděného Watch stavu v emulátoru (5/5); dva nové regresní testy prošly.
CI 41715769367 success: 280 Flutter, 42 tools, 107 unit, 369 Rules/server,
15 purge/15 Storage, analýza/lint/build. Bezpečné konzolové stage/code zůstávají,
bez zpráv výjimek, osobních údajů, tokenů či nového ukládání dat.

Po této opravě vlastník potvrdil průběh a přihlášení při resume. Server ověřil
odstraněný Auth, právě jednu přípravu a žádost, validní Auth/App Check + HTTP 200,
zachovaný cizí obsah, content-archived, minimální veřejný marker a purge scheduled
s původním +60denním termínem. Fixture včetně údajů je uklizená, původní inventura
shodná. Důkazy jsou v ignorovaném build/account-finalization-diagnostic-recovery-test;
happyPathVerified=false, protože šlo o pokračování po předchozí chybě.

Kontrola 4. listopadu znovu potvrdila oba originy proti čistému release,
Hosting a59b75f1d27dc90d, stejné Functions/Rules/IAM/plánovače a původní inventuru.
Nový první pokus vlastník dokončil s návratem na přihlášení. Server potvrdil Auth
absent, jedinou přípravu před žádostí, validní callable, zachovaný cizí obsah,
content-archived, marker a purge scheduled s původním termínem. Test i údaje jsou
uklizené a původní inventura shodná. Důkazy build/account-finalization-first-attempt-test
mají happyPathVerified=true pro funkční tok; neznamená to konzoli bez chyb.
Vlastník doložil 3 Uncaught Error z Firestore Watch při reauth/sign-out a chyby
feed interakcí permission-denied. Dva odběry blocked/following v home.dart neměly
onError; konkrétní odběratel třetí dokumentové chyby ze starého stacku není potvrzený.
Noto fonty jsou samostatné upozornění.
Vlastník 4. listopadu schválil opravu odběrů, CI/DEV web a jeden nový dočasný Auth
test včetně smazání a úklidu. Na fix/account-live-subscription-lifecycle je lokálně
hotová obsluha chyb blocked/following, ukončení starých UID scope při Auth změně,
guard doručování/pozastavených událostí u dokumentů/dotazů/rolí a bezpečný teardown.
Aktivní chyby se dál předávají UI; autentizační odběr ani jiné app scope se neruší.
19 cílených testů, konečných 289 Flutter, formátování a analyzátor prošly.
Zdroj 776e147e46d98c8b9f8d3eb5409e87bb381d013e má success CI 41908033275:
289 Flutter, 42 tools, 107 unit, 369 Rules/server, 15 purge/15 Storage, lint/analyze/build.
DEV Hosting b274e8c83ebd616a je nasazený; oba originy shodné s čistým release,
nové diagnostické markery v JS ověřené, backend/Rules/IAM/plánovače a původní inventura
nezměněné. Vlastník potvrdil logout/relogin i smazání bez Uncaught Error. Server
potvrzuje Auth absent, jedinou přípravu před žádostí, zachovaný cizí obsah,
Auth/App Check VALID a HTTP 200. Worker dokončil content-archived, marker a purge
scheduled s původním +60denním termínem. Jen tato fixture včetně údajů je uklizená;
původní inventura shodná. Oba originy a nezměněné Functions/Rules/IAM/plánovače
jsou po úklidu znovu ověřené. Důkazy v ignorovaném build/account-live-lifecycle-test
obsahují pilot/cleanup proof a explicitní UI console-review od vlastníka.
Native pipe i Browser access host jsou nedostupné; UI průchod provedl vlastník.
Oprava odběrů je uzavřená. Noto upozornění zůstává samostatně evidované. Další
krok: kompatibilita klientů, uzavření přímých zápisů a závěrečný test.
Historie přípravy, původní piloty, CI a meze ověření zůstávají v účtovém plánu.
[Kontrakt, meze a další brána](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#lokální-atomické-založení-žádosti--schváleno-3-listopadu-2026).

Reorganizace dokumentace je dokončená; [pravidla a kontrola](DOCUMENTATION_MAINTENANCE.md).
Neměnila aplikaci, nasazení ani data a není novým otevřeným MVP úkolem.

<a id="posledni-overene-nasazeni"></a>

## Poslední ověřené nasazení

| Vrstva | Poslední ověřený DEV stav |
|---|---|
| Projekt / Hosting site | `shoutout-dev-46c81` |
| Aplikace | https://shoutout-dev-46c81.web.app |
| Webový zdroj / Hosting verze | `78d6a3f3d5bbf80df7c31bebc92ea4fe45a6df88` / `2d6ae9af70840b03`; úplné CI 45077814590 success. B2/B3/B4 a pohyb aktivní pouze DEV; 67 app souborů / 8 HTTP kontrol. Ruční dosahy 1–50 km, výchozí 50. |
| Finalizace žádosti | Zdroj `a9ff425bb6b01e2d7420f45915b6ea977895fa43`, ACTIVE, revize `finalizeaccountdeletion-00001-wav`, hash `21288ad667885c01f4bbf46dbdfee7a5a7c3025b`; min0/max1, concurrency1, 256 MiB/15 s |
| Příprava mazání | Zdroj `8b1de68`, ACTIVE `prepareaccountdeletion-00004-jeh`; společný B4 writer |
| Receipt/read cleanup | `bc4a6e1`, ACTIVE `cleanupoperationreceipts-00004-zel`; původní job každou minutu, nový continuing runner, controls/24h klid a prošlé fixture ověřené. ZIP shodný se 49 soubory balíčku. |
| Účtové Functions | `8b1de68`, obě ACTIVE; request `00014-sux`, recovery `00014-pof`; 43 zdrojových modulů ověřeno, prostředky/read úklid zachované. |
| B2 čtecí Functions | `bc4a6e1`, ACTIVE `syncreadbatch-00001-fox` / `getreadstatepage-00001-xub`, klíč v1, min0/max1/concurrency1/256 MiB/15 s, oba HTTP 401 bez identity/attestace; ZIP shodné s 10 soubory balíčku. |
| Čtecí Functions | `78d6a3f`: ACTIVE `getfeedpage-00007-moc`, delta/V1, newsRecovery a podepsaný rebase/retained metadata; stávající klíč/limity, 100 % provozu, staré revize retired. getSavedShouts `00001-tav` a getOwnShouts `00001-fik` zachované. |
| Obsahové writery | ACTIVE `createshout-00007-viz` z 20206c4, `deleteshout-00004-wos`, `toggleshoutreaction-00010-toz`; společný B4 writer. Recovery rollout je neměnil. |
| Další B4 writery | `8b1de68`: ACTIVE `createcomment-00005-ziz`, `deletecomment-00005-xec`, `toggleshoutsave-00007-kiz`; obsahový artefakt má 57 zdrojových modulů. toggleCommentReaction, createContentReport a createPrivateReply se tímto rolloutem neaktualizovaly. |
| Firestore Rules | `476d216c-9208-4e5c-9143-f583cb82a3e9`, zdroj 17317e9; uzavření přímých obsahových zápisů, B4 publicStates a ochrany čítačů/ukládání. Recovery rollout je neměnil. |
| Prostorový index / news | Feed control 12 / active, reader/card reader `feed-v3`, writery `[feed-v1, feed-v2, feed-v3]`, card writer feed-v3. News control **6/active** po řízeném průchodu 5/paused. Generace i indexová konfigurace zachované, bez změny TTL. |
| Vlastní stránky | Index `CICAgLiT_JAK` READY: authorId/status ASC, createdAt/expiresAt/__name__ DESC; bez TTL nebo field změn |
| Storage | DEV soft delete 0 z dřívějšího schváleného kroku; tento rollout Storage neměnil |

Aktuální recovery důkazy jsou v [živém protokolu](plans/feed/B4_DEV_ROLLOUT.md#news-pause-recovery-results);
původní desetifunkční přechod B4 v [dřívějším protokolu](plans/feed/B4_DEV_ROLLOUT.md#dev-rollout-results).
Poslední úsek aktualizoval pouze getFeedPage a web; ostatní nespojovat
do jednoho nového artefaktu. Návrat webu tohoto úseku: 6762922852bede94.
Celkový návrat B4: operátorem reader feed-v2, zachovat
všechny tři writery, přepnout kompatibilní web jen podle plánu; předchozí
Hosting je 5b4d711b715a85e3 / fc795ad.
Návrat B2: pozastavit readSyncControl a použít ověřený neaktivní v3 artefakt
405be7d podle [plánu](plans/feed/B2_DEV_ROLLOUT.md#neaktivní-web-a-návrat).
Starší v1/v2 weby, včetně historických ce6b07a/7ab60c8, po upgradu IndexedDB
automaticky nevracet. Zachovat místní fronty, nové indexy, read úklid, obsahové
writery, generaci a ochranné Rules. Účtové a cleanup Functions mají 60 s,
obsahové/čtecí callable 15 s; všechny uvedené DEV prostředky jsou min0/max1,
concurrency1, 256 MiB, Node22, europe-west3. Účtový minutový job je zachovaný;
původní receipt job nově běží také každou minutu. Další Scheduler job nevznikl.
Rules změnila uvedená B4 fáze; Storage ne. Podpisový klíč zůstává existující v1.

Produkční aplikace na `go.shoutout-app.eu` dosud nemá první release.
Projekt `shoutout-production-a1b34` sdílí s prezentací, app site je
`shoutout-go-a1b34`. Vývojová práce nebyla sloučená do main ani vydaná do
produkce. Podrobnosti prostředí jsou v [WEB_ENVIRONMENTS](operations/WEB_ENVIRONMENTS.md).

<a id="serverova-brana"></a>

## Stav implementace a otevřené části

| Oblast | Potvrzené dokončení | Co ještě zbývá |
|---|---|---|
| Obsahové operace | DEV klient používá serverovou tvorbu, reakce, ukládání, hlášení i mazání; přepínače v config/dev.json jsou zapnuté. | Závěrečné uzavření přímých Rules zápisů a celý milník serverové brány. |
| Technická potvrzení | Sedmidenní timed klíče, zákaz nových legacy klíčů a pokračující DEV cleanup každou minutu, max. 500 dokumentů / 10 s na fázi, po dokončení 24h klid. | Produkční nastavení a společná vydávací brána. |
| Mazání účtu | DEV serverové fáze včetně purge, povinné směrování, Rules cutover, závěrečný UI/serverový test a úklid dokončené. | Produkční aktivace pod společnou vydávací bránou; žádný rozpracovaný DEV pilot. |
| Exspirace Shoutů | Serverová změna statusu se společným indexovým writerem a zámek běžných interakcí po expiresAt v DEV. | Sedmidenní fyzický úklid Shoutů a potomků včetně indexu. |
| Feed | B1/B2/B3 akceptace uzavřené. B4 metadata/cache a feed-v3 mají uzavřený interní/UI pilot i úklid. | Signály/číslovka novinek a závěrečná společná B4 brána včetně interaktivního UI rollbacku. Regrese Uložených uzavřená v DEV. |
| Produkce a spuštění | Oddělený app site, SDK konfigurace a dříve ověřené DNS/HTTPS. | Runtime služby a zbývající bezpečnostní, právní, provozní a ruční kontroly. |

Aktuální stupnice jsou generované v [TODO](TODO.md#postup) z
[evidence podúseků](PROGRESS.md). Dílčí dokončení posouvá vážené procento;
konečný account purge sám neuzavírá celý životní cyklus ani serverovou bránu.
[Kritéria serveru](MVP_SERVER_PLAN.md), [etapy feedu](plans/feed/FEED_IMPLEMENTATION_STAGES.md),
[startovní brána](LAUNCH_READINESS.md).

## Poslední ověření a jeho hranice

- Bezpečná konzolová diagnostika: [CI 41710073555](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41710073555)
  pro 712da1b success, DEV Hosting e69064a6c3110b2a. Oba originy (index, main,
  bootstrap, config) odpovídají čistému release; Functions/Rules/IAM/plánovače
  a inventura zachované. Příčina první chyby dosud není určená; nový test čeká.
- Atomické založení žádosti: [CI 41696994668](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41696994668)
  pro a9ff425 success, celá Rules/server sada 367/367. Function je nově nasazená;
  aktivace [CI 41705303226](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41705303226)
  pro 8289dce také success (276 Flutter, 42 tools, 107 unit, 367 Rules/server,
  15 purge, 15 Storage, analýza/lint/build). Nasazení a zachování ostatních vrstev
  jsou ověřené; přihlášený nový tok zatím není dokončený.
- UX potvrzení/průběhu: [CI 41688450535](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41688450535)
  pro 97d4b3f success; DEV Hosting 603bbdd9239e03d4, čtyři veřejné soubory
  (včetně bootstrapu) na obou originech shodné s čistým release manifestem.
  Původní 77dad6e CI bylo záměrně zrušené po doplnění mobilní opravy; nebylo nasazené.
- Nová příprava: [CI 41671609764](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41671609764)
  pro a57ae9b a [CI 41675834244](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41675834244)
  pro 7976e2f success. Neúspěšné CI 34250ec zachytilo dvě staré testovací konfigurace;
  oprava nemění aplikační chování a celý nový běh je zelený. Nový endpoint odmítl
  anonymní požadavek HTTP 401. Kontrola po rolloutu potvrdila shodu původní účtové
  inventury, ostatních Functions, obou plánovačů, IAM a Rules. Nový přihlášený
  callable tok i starší kompatibilní cesta jsou živě ověřené a obě fixture
  uklizené. Po úklidu znovu ověřené oba originy a nezměněný backend/Rules/IAM.
  Dokončený pilot nenahrazuje Rules cutover nebo zkoušku souběžného publikování.
  Ukazatel průběhu je následně dokončený samostatným UX rolloutem výše.
  [Důkazy a UX oprava](plans/accounts/ACCOUNT_DELETION_REMAINING_PLAN.md#navazující-dev-rollout-a-živý-ui-test).
- Příprava f81eaf4: [CI 41538976226](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41538976226).
  Aktivace 96b0782: [CI 41539164008](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41539164008).
  Obě success: 254 Flutter, 40 tools, 107 unit, 355 Rules/server, 15 purge,
  15 Storage; analýza/lint/build. Lokálně také 355/355 Rules a 15/15 purge.
- Skutečný DEV trigger/Scheduler dokončil nový syntetický UID bez Auth účtu
  do content-archived se třemi archivními kořeny a původním +60denním termínem.
  Stejný kernel nad reálným Firestore/Storage s řízeným časem ověřil konečný
  úklid, cizí anonymní kontext a terminální replay; nejde o čekání 60 dní na
  hodinách Scheduleru. Fixture uklizená, původní inventura shodná.
- Samostatně schválená oprava doplnila userId do tří starých DEV záložek;
  neměnila obsah, createdAt ani počty. Dřívější oprava 17 geohashů je také
  dokončená; nejde o prostorový indexový backfill.

Podrobné důkazy: [konečný úklid](plans/accounts/ACCOUNT_RETENTION_PURGE_PLAN.md#uzavření-bodu-1-v-dev--3-listopadu-2026),
[palce a vlastnictví](plans/accounts/ACCOUNT_REACTION_REMOVAL_PLAN.md),
[testovací strategie](operations/TESTING.md). Staré pending žádosti a historické joby
se automaticky nemigrovaly. Lokální moduly feedu nebyly nasazeny jako query API.

## Platná rozhodnutí a omezení

- Celé nové chování feedu A0–A3/B1–B4 před MVP; poslední bod pouze v otevřené
  aplikaci, relace 1 hodina, expozice každé části 1 sekundu; unread-first jen
  v Nejblíž. Nízké hodnocení mimo Top mění sbalení, nikoli pořadí. Interval
  kontrol novinek ani provozní rozpočet API nejsou tímto souhrnem schválené.
- Účtová retence je původní createTime +60 dní, pevná i pro otevřená hlášení.
  Celý dostupný Business profil i zahrnuté zprávy/komentáře do tohoto termínu;
  potom minimální veřejný marker, uvolnění jen stále vlastní přezdívky a
  anonymní Shout kontext pro cizí konverzace. Správa archivu v administraci
  je samostatný otevřený backlogový úkol.
- Rozpočet vlastníka je nejvýše 5 000 Kč měsíčně; nejde o automaticky
  vynucený finanční strop. [Nákladové pojistky](operations/COST_SAFETY.md).
- App Check v automatické relaci může potřebovat ruční asistenci; ochranu
  kvůli testu nevypínat. Globální enforcement Auth/Firestore není uzavřený.
- Jednorázové srovnání starších čítačů/poloh není potvrzené. Není automaticky
  dalším příkazem k provedení; [stav inventury](MVP_SERVER_PLAN.md#data-reconciliation).
- Rutinní rollout po přesném CI má trvalý souhlas, nové produktové/provozní
  volby a první veřejné vydání mají vlastní brány. [RELEASING](operations/RELEASING.md).
  Lokální účty/hesla zůstávají pouze v ignorovaném docs/local/.

## Údržba

Tento soubor má jeden další krok a jednu tabulku posledního ověřeného nasazení.
Nový výsledek nahradí předchozí souhrn; dlouhá historie patří k plánu nebo do
[archivu](archive/README.md). Role dokumentů a kontrola:
[DOCUMENTATION_MAINTENANCE](DOCUMENTATION_MAINTENANCE.md).
