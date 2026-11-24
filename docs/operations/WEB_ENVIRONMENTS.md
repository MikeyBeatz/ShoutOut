# Vývojový a produkční web

**Aktuální DEV společná moderace a Business, 24. listopadu:**
[Nasazení a technické ověření](../MVP_SERVER_PLAN.md#moderation-business-dev-results).
Zdroj **05fc1eddf51a2594524774b3ea4857d0e6ae2d1b**, úplné CI **45375019177 success**;
Hosting **507c7a0b950b74b2**, Rules **82d8db43-d9e9-4bd1-ba3f-f530fa78da57**.
Tři nové/šest aktualizovaných Functions, celkem 27 ACTIVE; skutečné balíčky,
revize/100 % provozu i web ověřené, původní prostředky a oba plánovače zachované.
DEV serverContentSanctions/serverBusinessReview a obě Rules brány true;
účtová retenční údržba nasazená až po uzavření přímých zápisů.
Živý pilot právě začal jediným novým dočasným Auth účtem po potvrzení
připraveného TestAdmin; akceptace a úklid stále čekají. Produkce a main beze změny.
Nejstarší kompatibilní návratový web po tomto Rules cutoveru je **507c7a0b950b74b2**;
nevracet původní přímé moderační zápisy ani worker bez nových retenčních fází.
Následující datované inventury jsou historické, nikoli aktuální release.

**Předchozí DEV veřejná moderace, 23. listopadu 19:48 SEČ:**
[nasazení, živá akceptace i úklid dokončené](../MVP_SERVER_PLAN.md#moderation-public-dev-complete).
Zdroj **87d6687f17eafa670dcaf115665439bdd5597227** / úplné CI **45238613178 success**;
web **1974e34d52e2945b**, serverPublicReportRemoval true jen DEV.
Nová removeReportedPublicContent **00001-yaw**, cleanup **00008-fal**, prostředky
a 100 % provozu ověřené; oba zdrojové archivy shodné s balíčkem. 67 app souborů,
8 HTTP kontrol a 401 bez Auth/App Check ověřené. Ostatních 22 Functions,
oba plánovače, Rules, 38 původních Shoutů/pending žádost i jejich updateTime
beze změny. Žádná nová fixture/Auth, změna indexů, produkce nebo main.
Pilot dokončený 22:21 SEČ: TestModerator provedl komentář 2 → 1 a potom
Shout, oba audity a 2×POST HTTP 200 / Auth/App Check VALID ověřené. Úklid
odstranil vymezených 5 dokumentů, všech 28 receipts a 26 rate dokumentů
beze změny včetně updateTime, cizí read položky zachované. Manifest cleaned,
znovu neseedovat. Původních 38 zdrojů/pending žádost i provozní konfigurace
zachované. Další ruční test tohoto pilotu není potřeba. Browser host je
nedostupný a Windows UI kontrola zastavila pokus kvůli neověřitelné URL.
Návratový kompatibilní web **565880d4664da7b2**.
Následující datované inventury jsou starší checkpointy.

**Aktuální inventura po závěrečném feed úklidu, 23. listopadu 18:01 SEČ:**
[B4 a finální DEV akceptace uzavřené](../plans/feed/B4_DEV_ROLLOUT.md#feed-final-acceptance-complete).
Uklizeno pouze 50 restartovacích a 3 A/B/C Shouty, 54 read klíčů; zůstává
38 původních zdrojů a pending žádost, všech 21 receipts beze změny.
Žádné nové nasazení: web **565880d4664da7b2** / zdroj **33853a9**, server
nadále **44e07a5**, 23 Functions, oba minutové plánovače, Rules
**3de8f7d8-6658-4b24-951f-043eac8de297**, feed 12/news 6/active beze změny.
Úklidový zdroj **a8d13eb** / úplné CI **45218543240 success** se nenasazoval.
Následující datované počty 91 zdrojů jsou před tímto schváleným úklidem.

**Aktuální DEV společná moderace, 23. listopadu:** [uzavřená akceptace a úklid](../MVP_SERVER_PLAN.md#moderation-basic-dev-complete).
Zdroj 44e07a5d18570ef2fc416d8387ed459bd55dd853 / úplné CI 45196844737 success,
Aktuální Hosting **565880d4664da7b2** z opravného webového zdroje
33853a9d0eb6fca61368217cf053140f5c6f3de4 / úplné CI 45202922410 success;
server zůstal na 44e07a5. Opravená je dostupnost resolve v hlavním panelu,
serverContentReportDecisions true jen DEV.
decideContentReports 00001-yak, cleanup 00007-hoz, account-created 00015-viw,
recovery 00015-huw; prostředky, zdroje a 100 % provozu ověřené. 67 app souborů
a 8 HTTP odpovědí shodných, 401 bez identity/App Check. Celkem 23 Functions;
ostatních 19, oba plánovače, Rules, 91 původních zdrojů a pending žádost zachované.
Pilot **cleaned**: všechny 4 akce správných TestModerator/Admin ověřené,
4×HTTP 200 a Auth/App Check VALID. Nový Shout/komentář/soukromá odpověď,
3 hlášení, clearance a 2 oznámení uklizené, 0 potomků/cloudových read klíčů.
10 receipts a 23 rate dokumentů beze změny, 91 původních zdrojů/pending
žádost zachované. Znovu neseedovat, společný Rules cutover ještě není hotový.
Návratový web b5703cec19978454, produkce/main/Auth beze změny.

**Předchozí DEV soukromá moderace, 23. listopadu:** [uzavřená akceptace a úklid](../MVP_SERVER_PLAN.md#moderation-private-dev-complete).
Zdroj **0fa2774be634db27013e37ca511e8523c6a9f7c7**, success úplné CI **45147594322**.
Hosting **b5703cec19978454**, serverPrivateReportRemoval true pouze DEV;
nová callable **removereportedprivatereply-00001-zec**, cleanup **00006-lum**,
schválené prostředky/100 % provozu. Celkem 22 Functions, ostatních 20 a oba
minutové plánovače zachované, 67 app souborů a 8 HTTP odpovědí odpovídá artefaktu.
Samostatné Rules ze zdroje **40e127ff52f076b912179427c932a908da62d162** / success
úplné CI **45164557897**: **3de8f7d8-6658-4b24-951f-043eac8de297**.
Shoda zdroje a 16/16 serverových simulací vydané verze ověřené; managed
přímé private delete/contentRemoved uzavřené. Pilot TestAdmin vlastník přijal,
vymezená data uklizená, 5 potvrzení ponechaných +7 dní; původních 91 zdrojů
a pending žádost zachované. Regionální živý průchod se tím netvrdí.
Návratový ruleset **e16b7a3d…59271**; starší raw-delete web lze vrátit až po
odpovídajícím rollbacku Rules. Produkce/main/Auth beze změny.

**Předchozí DEV web a vlastní soukromé mazání, 23. listopadu:** [uzavřená akceptace a úklid](../MVP_SERVER_PLAN.md#private-deletion-dev-complete).
Zdroj 9c2e121706ea824d10282f06c778249b9b4a0f05, success úplné CI 45096691292.
Hosting **813f34b7555e272a**, serverPrivateReplyDeletion true; 67 veřejných app
souborů a 8 HTTP kontrol shodných s artefaktem. Nová deletePrivateReply
**deleteprivatereply-00001-koz**, cleanupOperationReceipts **00005-goh**, obě
100 % provozu, schválené prostředky. Ostatních 19 Functions, oba minutové
Scheduler joby, feed 12/news 6/active, všech 91 zdrojů a původní žádosti zachované.
Rules **e16b7a3d-f363-499c-ad40-262471059271** ze zdroje **9fee32e** /
samostatné úplné CI **45098775591 success** jsou nasazené, přesná shoda ověřena.
Oba účty prošly skutečným UI/callable mazáním s Auth/App Check VALID;
8/8 scénářů nad vydaným Rules zdrojem ověřil oficiální simulátor, nikoli
autentizovaný HTTP DELETE z klienta. Pilot uklizený: 1 Shout, 2 notifikace,
1 cloudový read klíč; 5 potvrzení ponecháno do +7 dní, žádné Auth změny.
Manifest je cleaned, znovu neseedovat. Kompatibilní návratový web
813f34b7555e272a, návratový ruleset 476d216c…a3e9. Starší web bez gateway
samostatně po cutoveru nevracet. Produkce/main beze změny;
odložený pohybový test a jeho úklid nadále otevřené.

**Předchozí DEV web – pořadí při pohybu 23. listopadu:** [důkazy a čekající kontrola](../plans/feed/B4_DEV_ROLLOUT.md#movement-order).
Zdroj **af4c3aa06fc65b7d429497cca73817d2d4529be2**, success úplné CI **45085601243**,
Hosting **37b697da10fbb5b1**. Shoda 67 app souborů a 8 HTTP odpovědí obou domén.
Všech 20 Functions zachováno včetně getFeedPage **getfeedpage-00007-moc**;
Rules 476d216c…a3e9, prostředky, plánovače, feed 12/news 6/active beze změny.
Čerstvá inventura 91 zdrojů / 38 původních a pending žádost zachované; žádné
nové fixture/Auth ani datové zápisy. Ruční řazení/kotva a úklid zůstávají
otevřené. Návratový web **2d6ae9af70840b03**, uložený původní manifest v
build/feed-movement-order-rollback-manifest.json. Produkce/main se neměnily.

**Předchozí DEV web a reader – pohyb 22. listopadu:** [důkazy a čekající akceptace](../plans/feed/B4_DEV_ROLLOUT.md#movement-integration).
Zdroj 78d6a3f3d5bbf80df7c31bebc92ea4fe45a6df88, success úplné CI 45077814590,
Hosting **2d6ae9af70840b03**, getFeedPage **getfeedpage-00007-moc**, 100 % provozu.
67 shodných app souborů / 8 HTTP kontrol. Ostatních 19 Functions, Rules,
prostředky a plánovače zachované. Feed 12 / news 6/active; DEV pohyb zapnutý,
produkční flag false a produkce nenasazená. Ruční UI akceptace čeká.
Návratový kompatibilní web **6762922852bede94**; zachovat serverové protokoly,
generace i místní fronty. Operátorský čistý checkout je
build/feed-movement-release-47720ec, skutečný HEAD **78d6a3f** (název složky není SHA důkaz).

**Předchozí DEV web a reader – obnova po pauze 22. listopadu:** [důkazy](../plans/feed/B4_DEV_ROLLOUT.md#news-pause-recovery-results).
Zdroj b57f6b9793b70530369384cb07eee7f4e56af9c4, success úplné CI 45071219942,
Hosting **6762922852bede94**, getFeedPage **getfeedpage-00006-niz**.
Shodných 67 app souborů a 8 HTTP kontrol; ostatních 19 Functions, Rules
476d216c-9208-4e5c-9143-f583cb82a3e9 a prostředky zachované. Feed control 12,
news **6/active**. Ruční dosahy 1/3/5/10/20/50 km, výchozí 50; Auto a údaj
o načteném dosahu odstraněné. Automatický geografický přesun zůstává vypnutý.
Návratový kompatibilní web **3881ef4d17f67aa8**; starší záznamy níže jsou historie.

**Předchozí DEV web – sjednocení číslovek 22. listopadu:** [důkazy](../plans/feed/B4_DEV_ROLLOUT.md#badge-and-recenter-results).
Zdroj 211471bbdb9df36fde9b233adb4149f2e45adfc8, success úplné CI 45066405533, Hosting **3881ef4d17f67aa8**.
Ověřeno 67 app souborů / 8 HTTP odpovědí. Rules a všech 20 Functions beze změny;
návrat **346ea6fb1866da8e**. Automatický geografický přesun je pouze místní,
Home/GPS jej nevolají a žádný serverový host jej nezapíná. Následující weby jsou historie.

**Aktuální DEV web – napojení novinek 22. listopadu:** [důkazy a hranice](../plans/feed/B4_DEV_ROLLOUT.md#news-ui-fix-results).
Zdroj 34268e5f2e2416f6c3e7c3f23cc4f82a4bd20d43, success úplné CI 45060709344, Hosting
**346ea6fb1866da8e**. Všech 69 souborů / 8 HTTP odpovědí odpovídá release artefaktu.
Auto/cache zůstávají součástí webu; pohybový prototyp se v aplikaci nepoužívá.
Rules 476d216c-9208-4e5c-9143-f583cb82a3e9 i 20 Functions beze změny.
Návratový web 06df6da99db68e74. Starší datované weby níže jsou historie.

**Aktuální DEV Rules k 22. listopadu:** [uzavření přímých obsahových zápisů](../MVP_SERVER_PLAN.md#authority-audit)
ze zdroje 17317e9aede8f6aa286c12365ac335d597a6867f, úplné CI 45056112263 success,
ruleset 476d216c-9208-4e5c-9143-f583cb82a3e9. Shoda zdroje ověřená; Hosting a všech
20 Functions beze změny. Žádné nové Auth účty ani živé testovací datové zápisy.
Soukromé mazání a moderace zůstávají samostatně otevřené.

**Aktuální DEV web k 22. listopadu:** [Auto dosah/max. 50 km](../plans/feed/FEED_DELTA_REFRESH_PLAN.md#automatic-radius)
ze zdroje **6bef37c5af4410a3b87da9946005c70a71bbc1b6**, success úplné
CI 45020677812, Hosting **06df6da99db68e74**. Všech 67 aplikačních souborů
i osm HTTP kontrol na obou doménách odpovídá release artefaktu. Živý UI
průchod v anonymním okně je potvrzený; problém běžného okna je odložený.
Backend/indexy/plánovače se neměnily, novější Rules cutover je uvedený výše. Návratový
web ca327f10112ef349 zůstává evidovaný. Při B4b rollback pilotu následně
obnovit nový Auto artefakt, nikoli starý web v b4b-dev-release.

**Aktuální DEV k 22. listopadu:** [B4b je aktivní, akceptace pokračuje](../plans/feed/B4_DEV_ROLLOUT.md#news-dev-rollout-results).
Zdroj 20206c4 / úplné CI 44959541907 success, Hosting ca327f10112ef349 / serverFeedNews true.
CreateShout revize createshout-00007-viz, getFeedPage getfeedpage-00005-res,
news control 2/active a feed control 12/feed-v3. Indexy i Rules ověřené,
prostředky/18 ostatních Functions/plánovače nezměněné. Pilot má A i skutečně publikovaný B;
neoznačovat celé B4 za dokončené. Produkce/main nezměněné.

**Aktuální DEV k 21. listopadu:** [B4 metadata/cache jsou nasazené](../plans/feed/B4_DEV_ROLLOUT.md#dev-rollout-results)
ze zdroje 8b1de68 / úplné CI 44935555088 success, Hosting fa20f566fc0ab82b.
DEV serverDeltaFeed je true, reader feed-v3, control revision 11 a tři writery.
Deset Functions, připravené Rules a selektivní indexy jsou ověřené; prostředky,
plánovače a produkce nezměněné. [Metadata/cache UI akceptace i úklid jsou uzavřené](../plans/feed/B4_DEV_ROLLOUT.md#delta-acceptance-complete).
Následující starší datované rollouty zůstávají historií.

Od 19. listopadu je [B3 reader a web nasazený v DEV](../plans/feed/B3_DEV_ROLLOUT.md#dev-rollout-results)
ze zdroje 1db4631 po success úplném CI 44620011513, Hosting 62bd3a157ab5342b.
B2 a serverUnreadFeed jsou true. getFeedPage-00003-tux a kompatibilní šestice
z 1a4d184 používají feed-v2 / oba writery. Po navazujících klientských opravách
je aktuální DEV web **fc795ad**, success úplné CI **44788753267**, Hosting
**5b4d711b715a85e3**. [Živá B3 akceptace a úklid](../plans/feed/B3_DEV_ROLLOUT.md#b3-acceptance-complete)
jsou od 20. listopadu uzavřené: 120 fixture / 144 read klíčů uklizeno,
původních 38 zdrojů a pending žádost zachované. Nezakládat znovu tentýž pilot.
Návratový v3 web bez B3 z 1a4d184 je ověřený; návrat
readeru vyžaduje kompatibilní rollback podle B3 plánu, nikoli starý backend.
Přesné aktuální revize určuje PROJECT_STATUS; následující starší záznamy jsou datované.

[B2 je od 17. listopadu nasazené v DEV](../plans/feed/B2_DEV_ROLLOUT.md#dev-rollout-results)
původně ze zdroje bc4a6e1. Klient používá IndexedDB v3 a aktivní cloudovou synchronizaci;
[DEV akceptace a úklid jsou od 18. listopadu uzavřené](../plans/feed/B2_DEV_ROLLOUT.md#b2-acceptance-complete).
Ověřený výpadek znamená cílenou blokaci callable a restart dokumentu/aplikace.
Upgrade místní DB není
podmíněný cloudovým přepínačem. Návratový neaktivní v3 artefakt 405be7d je
ověřený; staré v1/v2 buildy po upgradu automaticky nevracet. Při návratu
zachovat účtový i retenční read úklid a místní fronty podle plánu.

Web od 17. listopadu obsahuje také [fontovou opravu](CONSOLE_WARNINGS.md#category-font-dev-rollout):
zdroj 9e3828d, success úplné CI 44178308912, Hosting 74d0c3756884ac19.
Proti předchozímu releasu se změnil pouze main.dart.js; index/config i assety
zůstávají shodné. B2 synchronizace je zapnutá. Kopie předchozího aktivního v3
webu bc4a6e1 je ověřená v build/category-font-rollback-bc4a6e1.

Pro poslední ověřený zdroj/revize použít [PROJECT_STATUS](../PROJECT_STATUS.md#posledni-overene-nasazeni).
Tento dokument uchovává technické postupy a datované rollouty. Staré revize,
probes a tehdejší vypnuté přepínače níže nejsou současnou konfigurací.
V config/dev.json jsou nyní aktivní serverové operace včetně mazání Shoutu
a archivního lookupu; produkční přepínače tím zapnuté nejsou.

Lokální příprava oddělení prostředí je implementovaná. Od 25. října 2026
aplikace i vstupní stránka používají společný produkční Firebase projekt
`shoutout-production-a1b34`, oddělený od vývoje. Každá má vlastní Hosting web
a konfiguraci. Dne 25. října 2026 byl vytvořen app site `shoutout-go-a1b34`,
propojený s registrovanou aplikací `ShoutOut Web Production`. Veřejná SDK
konfigurace je uložená v `config/prod.json`. Doména `go.shoutout-app.eu` je
přidaná k app site a DNS CNAME na Hostingeru je nastavený; Firebase DNS uznal
a potvrzuje stav `Connected` s platným HTTPS. Na app site zatím není první
release a nastavení provozních služeb aplikace není ověřené.

| Účel | Firebase projekt | Veřejná adresa |
|---|---|---|
| Vývoj | `shoutout-dev-46c81` | `https://shoutout-dev-46c81.web.app` |
| Produkční aplikace | `shoutout-production-a1b34` | `https://go.shoutout-app.eu` |
| Prezentace | `shoutout-production-a1b34` | `https://shoutout-app.eu` |

## Registrované produkční prostředky

Opakovaná read-only kontrola 25. října 2026: Hosting API potvrdilo oba sites
a správné app ID; doména `go.shoutout-app.eu` má `HOST_ACTIVE`,
`OWNERSHIP_ACTIVE`, `CERT_ACTIVE`. DNS resolvery Google a Cloudflare vracejí
`shoutout-go-a1b34.web.app`. HTTPS spojení prošlo standardním ověřením
certifikátu pro vlastní doménu (platnost do 22. ledna 2027).
App site dosud nemá žádný release a vrací Firebase 404. Prezentace vrací 200,
její aktuální verze je `a5262058f34f0154`; odkaz do aplikace zatím neobsahuje.
Tím je dokončená příprava domény a samostatného Hostingu, nikoli konfigurace
provozních služeb nebo první produkční nasazení. Devět testů
`tools/web_environment.test.mjs` prošlo. Nebyla provedena externí změna.

Ověřeno 25. října 2026 přes Firebase CLI:

- projekt: `shoutout-production-a1b34`, číslo `391665039159`,
- vstupní Hosting site: `shoutout-production-a1b34` (výchozí site),
- app Hosting site: `shoutout-go-a1b34`,
- registrovaná webová aplikace: `ShoutOut Web Production`,
- app ID: `1:391665039159:web:ee4fea2f25a49d04ec0cb2`,
- výchozí app Hosting URL: `https://shoutout-go-a1b34.web.app`.

Vytvoření site není nasazení aplikace. Na novém site zatím není publikovaný
Flutter build. Doména `go.shoutout-app.eu` má nastavený CNAME; stav ověření
a HTTPS je popsaný v posledním záznamu níže. Hodnota
`storageBucket` převzatá z SDK konfigurace sama nepotvrzuje existenci ani
připravenost Storage služby.

## Konfigurace

### Historie přechodu operací 25.–31. října

Následující zdroje/revize popisují jednotlivé uskutečněné fáze; aktuální web
je f81eaf4 a účtové Functions 96b0782. Ostatní Functions mohou pocházet
z různých kompatibilních zdrojů. Společný stav tabulky je v PROJECT_STATUS.

Retence `op1` je ve vývoji nasazená z čistého `079d053d24fe04705d13baad7f8307bd25848094`
po CI `41136744088`: nejdřív osm kompatibilních Functions, potom web. Klient
bere čas z Auth a server určuje sedmidenní deadline; dvanáct testovacích
receipt má `keyVersion: 1` a přesný interval 604800000 ms. Legacy příjem,
Rules a stávající feature flags se touto fází nemění; úklid ještě neběží.
Hosting `02cdb989d4f18ee2`, release `1793399239632000` z
`2026-10-30T22:27:19.632Z`, má shodné otisky HTML/JS/konfigurace s release buildem.
Starší Hosting verze `8d7e3f3fed920529` používá legacy klíče. Po cutoveru
ji samostatně nevracet a nepovolovat znovu legacy příjem; bezpečný návrat
musí zachovat striktní server a timed klienta. [Postup](TESTING.md#retention-rollout).
Nové revize: createShout `00002-tug`, createComment `00002-qid`,
createPrivateReply `00002-low`, toggleShoutReaction `00002-jan`,
toggleCommentReaction `00002-yoj`, toggleShoutSave `00002-nub`,
createContentReport `00002-pas`, deleteComment `00002-cet` (s názvem služby jako prefixem).
ACTIVE, Node 22, europe-west3, min. 0 / max. 1 instance, concurrency 1,
256 MiB, 15 s a HTTP 401 bez App Check jsou ověřené. Business průchod i úklid prošly;
[aktuální důkazy](TESTING.md#retention-rollout). Produkce se neměnila.

Následný cutover `9b748d7d9698f4ef99b2ec718180f338ea979da6` prošel CI
`41139730936` a je nasazený ve vývoji: createShout `00003-vex`, createComment
`00003-vel`, createPrivateReply `00003-cit`, toggleShoutReaction `00003-gos`,
toggleCommentReaction `00003-tuc`, toggleShoutSave `00003-cet`,
createContentReport `00003-jay`, deleteComment `00003-woz` (prefix je název služby).
Všech osm ACTIVE, původní limity a 401 ověřené. Klient zůstává `079d053`.
Po těchto aktualizacích je nasazený soukromý plánovač
`cleanupoperationreceipts-00001-nuh` (Node 22, europe-west3, 256 MiB, 60 s,
min. 0 / max. 1, concurrency 1). Job je ENABLED, denně 02:15 UTC, bez retry,
nejvýše 500 receipt/běh; anonymní POST 403 a OIDC invoker ověřené. První běh
odstranil 1 prošlý testovací receipt a zachoval 14 platných, opakování 0.
Hosting, Rules a produkce se při tomto cutoveru neměnily.

Lokálně připravené mazání komentářů má volitelný boolean `serverCommentDeletion`
(výchozí `false`); při `true` musí být nastavený App Check klíč. Nová callable
`deleteComment` v `europe-west3` je po souhlasu z 30. října nasazená z `34f7cad`
(CI `41090758502`), revize `deletecomment-00001-zuc`. Parametry 256 MiB, 15 s,
min. 0 / max. 1 instance a concurrency 1 i HTTP 401 bez App Check jsou ověřené.
Aktivace `fcbc23d58bfd94498131a126059fe58b645c79a4` prošla CI `41091651584`.
Hosting `8d7e3f3fed920529`, release `1793378523613000` z
`2026-10-30T16:42:03.613Z`, je nasazený a HTML/JS/konfigurace souhlasí s lokálním
release buildem. Návratová Hosting verze je `884138efa765d64a`.
Živé mazání a úklid jsou dokončené: TestModerator, TestBusiness a běžný účet,
počet 3 → 2 → 1 → 0, právě tři receipt; dočasný parent soft-deleted a testovací
report odstraněný. Po problému s App Check pomohlo nové otevření aplikace;
ochrany se nezměnily. Důkazy jsou v [TESTING](TESTING.md).
Produkční konfigurace cestu nezapíná. Po aktivaci společný helper autora i moderátora používá
server; při chybě nepřechází na přímý zápis. Klient uchovává nejasný pokus
v paměti relace i po zániku komentářové dlaždice, souběžná kliknutí sdílí požadavek.
Obnovení stránky klíč nezachová. Odpověď neobsahuje čítač; aktuální počet
v detailu dodává živý parent stream. Výslovný souhlas zahrnuje následnou
otestovanou aktivaci a vývojové testy s úklidem.

Hlášení Shoutů, komentářů a soukromých odpovědí má volitelný boolean
`serverContentReports` (výchozí `false`), který vyžaduje App Check klíč.
Klient pak volá `createContentReport` v `europe-west3` a při chybě nepřechází
na přímý Firestore zápis. Odešle pouze cíl, důvod, očekávaný účet a klíč operace;
identitu, časy, stav a soukromý snapshot přidává server. Nejasný pokus se stejným
důvodem drží neměnný klíč po dobu otevřeného detailu; změna důvodu má nový klíč,
ale stávající deterministické ID hlášení brání přepsání již založeného případu.
Vlastník 29. října schválil vývojový rollout i testovací obsah, hlášení, moderační
frontu a úklid. Zdroj `79082d8c3796b0e5f18335be975fe9f2bbf5a576` prošel CI
`40921153845`; nasazená Function je `ACTIVE`, revize `createcontentreport-00001-yas`,
Node.js 22, 256 MiB, 15 s, min. 0 / max. 1 instance a concurrency 1. HTTP požadavek
bez App Check vrací 401. Aktivační commit `be5a88f58cbf88870ac5f90a81f088660eebbdaa`
prošel CI `40922593743` a byl nasazený pouze na dev Hosting, verze `884138efa765d64a`,
release `1793295581345000`, čas UTC `2026-10-29T17:39:41.345Z`. HTML, JS i konfigurace
mají shodné otisky s lokálním release buildem; návratová verze je `8abd91f97aada32f`.
`serverContentReports` je ve vývoji zapnutý, produkční jej nezapíná. Hlášení Shoutu
běžným účtem prošlo 20:38 UTC (200, jeden report/receipt a limit count 1).
Opakování v právě ručně ověřené kartě vrátilo 409 bez změny reportu nebo limitu.
Původní automatická karta vracela 401 s Auth VALID a App Check MISSING; příčina
starších chyb reCAPTCHA není potvrzená. Business hlášení komentáře prošlo 200,
rychlé soukromé hlášení vrátilo 429 bez zápisů a po vyčkání prošlo 200 s důvěryhodným
snapshotem. Business report bucket má count 2. TestModerator ověřil všechny tři
případy i jejich detaily bez uložení rozhodnutí. Úklid odstranil 3 reporty,
komentář, soukromou zprávu a 2 čistě testovací notifikace; dočasný Shout má
`deleted` a commentsCount 0. Tři report receipt zůstaly. Fronta se živě vyprázdnila.
Tento vývojový rollout je ověřený a uzavřený; produkce, main a Rules se nezměnily.
Hlášení účtů a technických chyb nejsou součástí této migrace. Moderační kolekce,
schémata, clearance i společný limit 20 hlášení/den s odstupem 1 minuty se zachovávají.

Ukládání Shoutů má volitelný boolean `serverShoutSaves` (výchozí `false`).
Při zapnutí vyžaduje `appCheckSiteKey` a volá `toggleShoutSave` v `europe-west3`;
chyba callable nevede k přímému zápisu do Firestore. Klient ignoruje historický
HTTP výsledek a stav záložky i čítač zobrazuje z realtime dat. Nejasný pokus
opakuje se stejným klíčem v paměti domovské obrazovky, rychlé souběžné kliknutí
slučuje. Obnovení aplikace klíč nezachová. V detailu se odběr vlastní záložky
zapíná jen pro tuto serverovou cestu a sdílí existující realtime zdroje.
Vlastník 29. října schválil vývojový rollout včetně aktivace klienta a testů.
Zdroj `5fceccb98f145174acd7917b26356d04e65604a1` prošel CI `40914821162`;
nasazená Function je `ACTIVE`, revize `toggleshoutsave-00001-fal`, Node.js 22,
256 MiB, 15 s, min. 0 / max. 1 instance a concurrency 1. Požadavek bez App Check
vrací 401; ostatních pět Functions zůstalo na předchozích revizích.
Aktivační commit `02b8b2846c6b4488188e1f58f84fb06db3320e52` prošel CI
`40916381788` a je nasazený pouze na vývojovém Hostingu: verze `8abd91f97aada32f`,
release `1793293260043000`, čas UTC `2026-10-29T17:01:00.043Z`. Otisky HTML,
JavaScriptu a konfigurace odpovídají lokálnímu release buildu. Předchozí verze
pro návrat je `a6756b787e4655de`. `serverShoutSaves` je ve vývoji zapnutý;
produkční konfigurace jej nezapíná. Běžný účet ověřil vlastní uchovaný Shout
a Business cizí aktivní Shout včetně seznamu uložených a otevřeného detailu.
Databáze potvrdila čtyři serverové receipt, kanonické časy, společné rate eventy,
počty 0 → 1 → 0 a zachování ostatních polí. Obě testovací záložky jsou odstraněné,
dočasný Shout má `deleted`, původní Test Shout je zachovaný a receipt se ponechaly.
Produkce, `main` a Rules se nezměnily; samostatný souhlas pokrýval tento rollout.

Reakce na Shouty používají volitelný boolean
`serverShoutReactions` (výchozí `false`). Vyžaduje `appCheckSiteKey` a volá
`toggleShoutReaction` v `europe-west3` bez přímého fallbacku. Vlastník schválil
26. října vývojové nasazení, aktivaci a testy včetně úklidu. Function ze zdrojů
`52627843cc1547229d7b40fb9b137b00f97336fc` je `ACTIVE`, revize
`toggleshoutreaction-00001-lek`, Node.js 22, 256 MiB, timeout 15 s,
min. 0 / max. 1 instanci a concurrency 1. Předchozí tři Functions zůstaly na
stejných revizích. `config/dev.json` zapíná schválený rollout; produkční
konfigurace jej nezapíná. Implementace prošla CI `40370550763`.
Aktivační commit `eea077a347b17d9a902f23835beb7ab6658a430e` prošel CI
`40405135293` a byl nasazen pouze na vývojový site. Hosting verze
`a03706f90b97706c`, release `1793050577697000`, čas `2026-10-26T21:36:17.697Z`.
Otisky HTML, JavaScriptu a veřejné konfigurace odpovídají lokálnímu release
buildu. Předchozí Hosting verze pro návrat je `ebede43dc57e569c`.
Požadavek bez App Check byl odmítnut 401. Automatická relace při obnovení
nejprve hlásila `appCheck/recaptcha-error`; první pokus nevytvořil receipt.
Po ručním ověření vlastníkem prošel celý cyklus nahoru → dolů → odebrání
běžným i Business účtem. Šest serverových receipt, rate eventy, čítače a
realtime stav ve feedu/detailu odpovídají. Vlastní reakce neoznámila sebe sama;
dvě Business oznámení autorovi měla kanonickou veřejnou identitu. Reakce jsou
zpět na nule, dvě čistě testovací notifikace byly odstraněné a dočasný Shout
označený `deleted`; původní Test Shout zůstal zachovaný. Ochrana se nevypínala.
Reakce na komentáře tento přepínač neovládá. Produkce, `main` a Rules se neměnily.

Nezávislý `serverCommentReactions` (výchozí `false`) volá
`toggleCommentReaction` v `europe-west3` a vyžaduje App Check klíč.
Vlastník schválil vývojové nasazení, aktivaci a testovací obsah včetně úklidu.
Function ze zdrojů `8a8d05733d00ef0e099723e2453cccf493549f17` prošla CI
`40408691708` a je ve vývoji `ACTIVE`, revize `togglecommentreaction-00001-dit`,
Node.js 22, 256 MiB, timeout 15 s, min. 0 / max. 1 instance, concurrency 1.
Předchozí čtyři Functions zůstaly na stejných revizích. Vývojová konfigurace
zapíná schválenou aktivaci, produkční ji nezapíná. Aktivační commit
`45a5d024c3cbe7c234c20793116e91d94bf51395` prošel CI `40409557055` a byl na
vývojovém Hostingu, verze `3fc2f80232d34ff3`, release `1793052566828000`
z `2026-10-26T22:09:26.828Z`. Tři hlavní otisky odpovídají release buildu;
návratová verze je `a03706f90b97706c`. Živě prošel celý cyklus palců autora
komentáře i druhého účtu: šest receipt, odpovídající limity, nezměněný text a
Shoutové čítače, žádné vlastní oznámení a dvě kanonická oznámení druhému účtu.
Komentář a dvě čistě testovací notifikace byly odstraněné, parent je `deleted`;
receipt zůstávají. Při externím úklidu se projevilo zastaralé číslo u ikony
komentářů v otevřeném detailu. Lokální oprava čte `commentsCount` ze stávajícího
odběru Shoutu a vynechává lokální inkrementy. Oprava z commitu
`987398f2f60f5375b0413402322ab829970bcff3` prošla CI `40411478509` a je nyní
nasazená pouze na vývojovém site: verze `a6756b787e4655de`, release
`1793053435595000`, čas `2026-10-26T22:23:55.595Z`. Tři hlavní otisky souhlasí
s release buildem. Návratová verze je `3fc2f80232d34ff3`. Živý test potvrdil
0 → 1 → 0 na ikoně i v hlavičce bez obnovení detailu, včetně externího smazání
komentáře. Nevznikla druhá lokální jednička. Regresní komentář byl odstraněný,
jeho dočasný Shout smazaný běžnou UI akcí, receipt zachované. Functions se
při opravě neaktualizovaly; produkce, `main` a Rules zůstaly beze změny.
Klient nemá přímý fallback, HTTP výsledek ignoruje a počty i vlastní reakci
zobrazuje z existujících realtime odběrů komentářů a vlastních reakcí.
Retry drží neměnný klíč v paměti otevřeného detailu; zavření detailu nebo
obnovení stránky jej nezachová. Souhlas platí jen pro vývojový projekt/site
`shoutout-dev-46c81`, nikoli produkci nebo Rules.

Aktuální vývojové nastavení po opravě Service Usage a IAM: uživatelská
diagnostika získala platný App Check token a callable jej přijala, pak správně
odmítla chybějící Auth. `config/dev.json` znovu aktivuje registrovaný provider
a serverové vytváření Shoutů. Přihlášený Business test úspěšně vytvořil
Shout přes callable a následně jej odstranil. Firestore potvrdil serverové ID,
kanonické údaje ověřené pobočky, čítače, geohash, idempotentní záznam a limit
se společným časem zápisu; po úklidu potvrdil stav `deleted`.
Předchozí klient již obsahoval soukromé odpovědi a opravu čítače detailu:
commit `9545946983c284a344a273aab231608677529eb5`, Hosting verze `ebede43dc57e569c`,
release `1793032800630000` z `2026-10-26T16:40:00.630Z`.
Otisky HTML, JavaScriptu a konfigurace odpovídají lokálnímu release buildu.
CI implementace `40230321972`, aktivace `40230718884` a opravy `40355266790`
prošlo; soukromé odpovědi prošly CI `40359475834` a aktivace `40360446321`.
Diagnostická stránka není součástí tohoto běžného buildu.
Produkční konfigurace se tím nemění. Starší neúspěšné pokusy a rollback níže
jsou historie, včetně tehdy vypnutého přepínače a čekajícího ověření.

Volitelný `appCheckSiteKey` nastavuje veřejný reCAPTCHA Enterprise klíč a při
startu webu aktivuje App Check. Volitelný boolean `serverShoutCreation`
přepíná vytvoření Shoutu na callable `createShout` v `europe-west3`; vyžaduje
App Check klíč. Bez přepínače zůstává současný přímý zápis. Při chybě callable
se klient nepřepne na přímý zápis. Retry stejného konceptu drží stejné ID a
původní polohu, úprava konceptu vytvoří nové ID.

Nezávislý `serverCommentCreation` připravuje stejný přechod veřejných komentářů
a odpovědí na `createComment` v `europe-west3`. Vyžaduje App Check klíč;
výchozí hodnota je `false`; `config/dev.json` jej po souhlasu vlastníka zapíná
pro vývojový rollout. Produkční konfigurace jej nezapíná. Soukromé
odpovědi tím nejsou přepnuté. Při chybě callable klient nepoužije přímý fallback.
Příprava prošla vývojovým release buildem. Dne 25. října vlastník výslovně
schválil nasazení nové Function, aktivaci klienta a živé komentářové testy
včetně úklidu pouze ve `shoutout-dev-46c81`. Function je `ACTIVE`, revize
`createcomment-00001-lep`, zdroje `4dce3d2`, Node.js 22, 256 MiB, 15 s a max.
jedna instance/souběžný požadavek. Živý test komentáře a veřejné odpovědi prošel
kontrolou databáze (autor, rodič, receipt, přesné zvýšení limitu a čítače).
Testovací komentáře byly odstraněné; původní Shout uživatele zůstává zachovaný.
`createShout` nebyla aktualizovaná. Produkce ani Rules se neměnily.

Oprava čítače z 26. října prošla automatickými kontrolami a nasazením; vlastník
následně ručně potvrdil přechod 0 → 1 → 0 ve stejném detailu bez opuštění stránky.
Nová automatizovaná relace při startu hlásila `appCheck/recaptcha-error`
a testovací komentář nevytvořila. Příčina nedokončeného odeslání není potvrzená.
API App Check bylo opakovaně ověřené jako `ENABLED`; prázdná výměna tokenu
správně vrací `400 INVALID_ARGUMENT`. Serverový provider ani jeho ochrana
se při tomto ověření neměnily.

`serverPrivateReplyCreation` připravuje přechod soukromých odpovědí
na `createPrivateReply` v `europe-west3`. Má výchozí `false`, vyžaduje platný
App Check klíč; vývojová konfigurace jej zapíná pro samostatně schválený rollout.
Produkční konfigurace jej nezapíná. Veřejné komentáře i Shouty
mají vlastní nezávislé přepínače. Nová Function vyžaduje samostatný souhlas
s vývojovým nasazením a následným živým testem mezi dvěma testovacími účty.
Vlastník dne 26. října výslovně schválil nasazení pouze nové Function
`createPrivateReply`, navazující zapnutí klienta a testy mezi dvěma testovacími
účty včetně úklidu ve vývoji. Function je `ACTIVE`, revize
`createprivatereply-00001-baw`, zdroje `113050f`, Node.js 22, 256 MiB, 15 s,
max. jedna instance/souběžný požadavek. Existující dvě Functions se neměnily.
Živý průchod dvěma účty prošel pro všechny tři cíle i přepnutí ze soukromé na
veřejnou odpověď. Metadata serverových operací a oznámení odpovídají databázi.
Pět testovacích obsahových dokumentů a čtyři čistě testovací agregáty oznámení
byly odstraněné; původní Shout zůstal zachovaný a čítač je na výchozí hodnotě.
Produkce, `main` a Firestore Rules se neměnily.

Dne 25. října 2026 byl ve vývojovém projektu po souhlasu vlastníka zapnutý
reCAPTCHA Enterprise API a registrovaný webový App Check. Registrovaný klíč
dovoluje pouze obě vývojové Firebase domény a `localhost`.
Token TTL je 3600 s, práh zůstává výchozí 0,5. Globální enforcement Firestore
ani Auth se neměnil a `serverShoutCreation` je zatím `false`.

Vývojový rollout z 25. října byl vrácen: browserový smoke test na localhostu
i skutečné vývojové doméně hlásil `appCheck/recaptcha-error`. Klíč proto není
aktivovaný v `config/dev.json` a serverové publikování zůstává vypnuté.
Hosting byl přes ověřené API vrácen na verzi `c8ec155e05b4a3b3` (release
`1792942480312000`). Callable zůstává nasazená s povinným App Check; nesmí se
obejít vypnutím její ochrany. Příčina chyby získávání reCAPTCHA tokenu zatím
není potvrzená.

Následná verze `63c6c0ab3e299be3` ve vývoji obsahuje opravenou právní bránu a
výslovně přibalenou stránku `/__dev/app-check.html`. App Check v hlavní
aplikaci ani serverové publikování nejsou zapnuté. Přestože byla doplněná
chybějící servisní identita App Check s úzkou standardní rolí, izolovaný test
na `web.app` stále selhal před výměnou tokenu. Dokončení ověření v aktivním
prohlížeči zůstává otevřené; ochrana callable nebyla vypnutá.

`config/dev.json` je společný zdroj veřejné webové Firebase konfigurace,
návratové adresy e-mailů a Hosting site ID. Produkční šablona je
`config/prod.json.example`; její prázdné SDK hodnoty ji záměrně činí
nepoužitelnou pro build. Skutečný `config/prod.json` obsahuje veřejnou SDK
konfiguraci získanou přes Firebase CLI a ověřené propojení webové aplikace
s app site. Neobsahuje serverové credentials.
Veřejná klientská konfigurace může být verzovaná, serverové klíče do ní nepatří.

Nástroj `tools/web_environment.mjs` kontroluje prostředí a projekt. Produkce
vyžaduje `shoutout-production-a1b34`, odmítá vývojové číslo projektu a jinou
návratovou doménu než `go.shoutout-app.eu`. Aplikace nesmí použít Hosting site
`shoutout-production-a1b34`, který patří vstupní stránce, ani vývojový site.
App site je `shoutout-go-a1b34`; jeho vlastnictví a vazba na produkční app ID
byly ověřené výpisem Firebase Hosting. Firebase `authDomain` zůstává
`<projectId>.firebaseapp.com`; to je jiná položka než doména aplikace nebo Auth
Action URL. Projektové číslo v `appId` musí souhlasit s `messagingSenderId`.

Výsledná definice `SHOUTOUT_CONFIG` je předaná Flutteru přes soubor a stejná
konfigurace se zapisuje do `app-config.json` pro `/auth/action`. Na webu bez
konfigurace inicializace selže před připojením Firebase. Kontrola hostitele
odmítá vývojový build na produkční doméně a opačně. Vývoj dovoluje také
`localhost`, `127.0.0.1`, IPv6 loopback a vlastní Firebase Hosting domény;
produkční aplikace je připravená pouze pro `go.shoutout-app.eu`.

Android a iOS nadále používají vývojové `lib/firebase_options.dart` a původní
návratovou URL. Produkční mobilní konfigurace není součástí webového MVP.
Produkční FlutterFire konfigurací nepřepisujte stávající mobilní soubory.

## Lokální spuštění

Z kořene repozitáře:

```powershell
node tools/web_environment.mjs prepare dev
$geoConfig = Get-Content -Raw -Encoding UTF8 .geoapify.json | ConvertFrom-Json
flutter run -d chrome --dart-define-from-file=build/environments/dev.defines.json --dart-define="GEOAPIFY_API_KEY=$($geoConfig.GEOAPIFY_API_KEY)"
```

`prepare` pouze připraví definice pro Flutter. Samostatný HTML Auth handler
potřebuje také vygenerovaný `app-config.json`, který vzniká při buildu; jeho
testování provádějte nad sestaveným webem. Ověřovací e-mail se vrací do
nasazeného vývojového webu, ne na localhost.

## Build a kontrola před nasazením

```powershell
node tools/web_environment.mjs build dev --debug
node tools/web_environment.mjs build dev
node tools/web_environment.mjs deploy dev --project=shoutout-dev-46c81
```

Poslední příkaz je jen lokální kontrola a náhled cíle. Release vyžaduje
`.geoapify.json`, produkční release samostatný `.geoapify.prod.json`; oba soubory
jsou ignorované Gitem. Debug build bez Geoapify klíče je možný, ale neověřuje
adresní formuláře. Klíče je nutné omezit na domény příslušného prostředí.

Výstupy jsou oddělené v `build/web-dev` a `build/web-prod`.
Před buildem se čistí pouze výstup právě zvoleného prostředí, aby ve vydání
nezůstaly staré soubory nebo lokální diagnostika. Druhý výstup se nemaže.
Manifest mimo
veřejný web uchovává konfiguraci, typ buildu a SHA-256 otisky všech souborů.
Neúspěšný pokus o build zneplatní předchozí manifest. Nasazovací kontrola
odmítne debug build, chybějící manifest, změněné soubory, změněnou konfiguraci
a jiný cílový projekt. CI používá stejný nástroj pro debug build.

## Nasazení až po výslovném souhlasu

Výběr schváleného kódu, větve, commitu a verze upravuje
[RELEASING.md](RELEASING.md). Níže uvedená kontrola buildu zatím automaticky
nevynucuje čistý Git strom, release tag ani vazbu artefaktu na commit.

Pro vývojový Hosting je přesný cíl projekt i site `shoutout-dev-46c81`:

```powershell
node tools/web_environment.mjs deploy dev --project=shoutout-dev-46c81 --apply
```

Nástroj vygeneruje Hosting konfiguraci s explicitním site ID a spustí pouze
`--only hosting`. Firebase predeploy hook znovu ověří projekt z `GCLOUD_PROJECT`,
adresář z `RESOURCE_DIR` a celý build. Kořenový `firebase.json` míří pouze na
vývojový build a používá stejnou kontrolu. Běžné `flutter build web` není
připravený artefakt pro nasazení tímto postupem.

Produkční příkazy používají `prod` a project ID `shoutout-production-a1b34`.
Produkční konfigurace i app site už jsou doplněné. Release navíc vyžaduje
samostatný `.geoapify.prod.json`, který zatím není připravený. Samotná lokální kontrola
neověřuje vlastnictví Hosting site, IAM, DNS ani nastavení Firebase služeb.
Kontroly jsou pojistkou proti omylu v tomto workflow; nenahrazují IAM a Rules
a lze je obejít úmyslnou změnou skriptů či jinou konfigurací CLI.

Vstupní stránka používá `presentation/firebase.json`, který má explicitní site
`shoutout-production-a1b34`. Aplikace generuje vlastní konfiguraci pouze se svým
site. Alias `web` v `.firebaserc` ukazuje na společný produkční projekt,
nevybírá však Hosting web. Pro nasazení vždy použít explicitní project ID
a odpovídající konfiguraci se site.

Oba produkční weby sdílejí projektové služby, oprávnění a kvóty. Oddělené
Hosting konfigurace rozdělují obsah a nasazování; nevytvářejí samostatné
bezpečnostní ani nákladové prostředí. Statická vstupní stránka neobsahuje
Firebase SDK a nedostává tím automaticky přístup k uživatelským datům.

## Vývojové Admin SDK nástroje

Starší skripty `enable_test_user_tutorial.mjs`, `round_shout_locations.mjs` a
`set_moderator.mjs` nově odmítají credentials jiného projektu ještě před
inicializací Admin SDK a explicitně nastavují vývojové project ID. Ostatní
existující Admin SDK nástroje už kontrolu cílového projektu obsahují.
Negativní testy používají pouze syntetické credentials a nevolají Firebase.

Od R6b čtyři opravné CLI a stará oprava geohashů navíc kontrolují stav indexu
v každé zapisující transakci a vyžadují původní updateTime zdrojů. Legacy zápis
je povolený pouze bez udržované indexové generace. `seed_test_users.mjs`,
`reset_integration_scenario.mjs` a `seed_moderation_queue.mjs` jsou zablokované
před credentials/první mutací; starý reset dry-run také. Nepoužívat je jako
aktuální postup tvorby fixture. [Kontrakt, ověření a meze](../plans/feed/FEED_RUNTIME_PROPOSAL.md#r6b-results).
Tato příprava nástrojů není povolení spustit opravu živých dat.

## Další externí kroky

Po samostatném schválení prověřit služby projektu `shoutout-production-a1b34`.
Webová aplikace i druhý Hosting web už jsou vytvořené. Před případným
vytvořením Firestore zvolit region databáze a nastavit potřebné
Authentication, Firestore, Storage a Hosting služby. Testovací účty a demo
data se nepřenášejí. CNAME pro `go.shoutout-app.eu` už odpovídá požadavku
Firebase Hostingu a HTTPS je platné; zbývá autorizovaná Auth doména. Vlastní
Auth Action URL má být `https://go.shoutout-app.eu/auth/action`.

Před veřejným provozem dokončit nákladové pojistky, IAM, pravidla, App Check,
testy e-mailů, rollback a ostatní brány v `../LAUNCH_READINESS.md` a
`COST_SAFETY.md`. Lokální příprava žádný z těchto externích kroků nepotvrzuje.

## Ověření lokální přípravy 24. října 2026

Následující záznam popisuje původní variantu před rozhodnutím o společném
produkčním projektu z 25. října; aktuální kontroly jsou uvedené níže.

Prošly Flutter testy, cílené testy webové konfigurace, 11 testů nástrojů,
`flutter analyze` i nový debug a release build vývojového webu. Lokální náhled
ověřil shodu release buildu a vývojového cíle; negativní kontroly odmítly debug
artefakt, projekt prezentace, nesprávný adresář a chybějící produkční konfiguraci.

Formát upravených Dart souborů prošel. Celorepozitářový formát má existující
nálezy v nezměněných `lib/l10n/text_sk.dart` a `lib/l10n/text_uk.dart`; tyto
soubory nebyly v této změně upravené. CI tím zatím může zůstat blokované.
Ruční test v prohlížeči, skutečné produkční služby a externí nasazení nebyly
provedené.

## Ověření společného produkčního projektu 25. října 2026

Prošlo 137 Flutter testů, 12 testů nástrojů, `flutter analyze` a debug build
vývojového webu. Testy pokrývají povolení společného produkčního projektu,
odmítnutí site vstupní stránky pro aplikaci, odmítnutí cizího projektu,
vygenerování konfigurace pouze pro vybraný app site a konfiguraci Auth handleru.
Produkční SDK hodnoty v testech jsou syntetické; služby Firebase se nevolají.

Tlačítko **Otevřít ShoutOut** bylo vizuálně ověřené v lokálním Chrome při
desktopové šířce 1440 px a mobilní šířce 390 px. Odkaz míří na
`https://go.shoutout-app.eu`; mobilní stránka nemá vodorovné přetékání.
Upravené Dart soubory a diff prošly kontrolou formátu. Dříve popsané nálezy
formátu v nezměněných překladech zůstávají mimo tuto změnu.

Tento záznam předcházel následnému zřízení prostředků níže. Dostupnost cílové
domény a provozních služeb ani externí nasazení zatím nebyly ověřené či
provedené. Tlačítko je připravené lokálně pro nasazení po zprovoznění aplikace.

## Zřízení Hosting webu a SDK konfigurace 25. října 2026

Po výslovném souhlasu uživatele byla přes Firebase CLI 15.34.1 registrována
webová aplikace `ShoutOut Web Production` a vytvořen site `shoutout-go-a1b34`
s vazbou na její app ID. Následný výpis potvrdil oba produkční Hosting weby
včetně původního výchozího site vstupní stránky. SDK konfigurace byla získána
příkazem `apps:sdkconfig WEB` a potvrzena opakovaným čtením; uložena je
v `config/prod.json`. Nový Firebase projekt se nezakládal.

Prošly lokální `prepare prod`, validace konfigurace a skutečný produkční
**debug** build `node tools/web_environment.mjs build prod --debug`, stejně
jako všech 12 testů nástrojů. Vygenerovaný `app-config.json` odpovídá zdroji
v `config/prod.json` a Hosting konfigurace vybírá pouze app site.

Release vyžaduje vlastní `.geoapify.prod.json`, který zatím chybí. Debug build
není povolený podklad pro nasazení. Žádný obsah nebyl na nový site nasazený,
DNS nebylo změněné a doména nebyla připojená. Firestore, Auth, Storage, IAM,
App Check a ostatní provozní nastavení nebyly v tomto kroku ověřené ani měněné.
Název Storage bucketu dodaný Firebase SDK není doklad jeho provisioningu.

## Připojení domény a DNS 25. října 2026

Po obnovení relace s Hostinger konektorem byla ve Firebase Console přidaná
vlastní doména `go.shoutout-app.eu` k site `shoutout-go-a1b34` v projektu
`shoutout-production-a1b34`, bez přesměrování na jinou stránku. Firebase Quick
setup vyžádal tento záznam:

| Typ | Název v DNS zóně `shoutout-app.eu` | Hodnota | TTL |
|---|---|---|---|
| CNAME | `go` | `shoutout-go-a1b34.web.app` | 300 s |

Hostinger DNS validace prošla a záznam byl přidán s `overwrite: false`.
Následné čtení potvrdilo nový záznam a zachování původních záznamů `www` CNAME,
kořenového A a ověřovacího TXT. Nameservery nebyly měněné. CNAME byl ověřen
na autoritativním serveru `aurora.dns-parking.com` i přes veřejné resolvery
Cloudflare `1.1.1.1` a Google `8.8.8.8`. Cílový Hosting web vrací DNS A
`199.36.158.100`; tato IP nebyla ručně vkládaná do zóny pro `go`.

Firebase po propagaci oznámil `Custom domain setup successfully`; průvodce
byl dokončen tlačítkem Finish. Následná kontrola potvrdila stav `Connected`,
platný TLS certifikát a HTTPS odpověď cílového webu. Odpověď je zatím očekávané
404, protože app site stále čeká na první release. Flutter build, Auth,
Firestore ani jiné služby v tomto kroku nasazené nebyly.
