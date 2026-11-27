# Archiv – došetření DEV a návrh společného dokončení

27. listopadu 2026. Navazuje na [hotovou přípravu](ARCHIVE_DEV_READINESS.md).
Průzkum je dokončený, pouze čtecí. Následující implementace a živý rozsah jsou
**výslovně schválený společný dokončovací DEV úsek**. Souhlas s provedením
není důkaz nasazení; etapy níže ještě vyžadují testy a přesné CI.

## Ověřené nálezy

Všech 11 dříve vybraných deleted Shoutů vzniklo v říjnu a má v nadpisu MVP.
U deseti lze navíc dohledat konkrétní místní test. U nejstaršího je doložené
označení MVP a pozdější baseline, nikoli přesně první operace. Do nové evidence
se neukládají nadpisy, texty, kontakty ani tokeny.

- Žádný z 11 nemá dochované komentáře, soukromé odpovědi, reakce, záložky ani
  jinou podkolekci. Seznam podkolekcí je prázdný u všech jedenácti kořenů.
- Cílené dotazy pro těchto 11 ID nenašly serverOperations, sanctions ani
  reports/commentReports/privateReplyReports. Nejde o tvrzení o celé DB.
- U 1b311a4c… je v místním snapshotu deleted již před pozdější změnou záložky;
  současné updateTime odpovídá pozdějšímu zápisu. Není časem odstranění.
  U hodnocení je místní verifiedAt dokonce před SDK časem následného zápisu.
  Místní doklad testu tedy není automaticky přesný serverový doklad odstranění.
- Původní odstranění všech položek se z prohledaných dokladů nepodařilo přesně
  doložit. Nic se nedoplnilo z updateTime, expirace nebo dnešního času.

Navrhuje se **vymezený úklid starých MVP fixture**, nikoli vymyšlené datum nebo
obecné obejití migrace. Právě tento zásah by zrušil dřívější ochranu uvedených
testovacích záznamů; bez nového souhlasu se neprovede.

| Přesné ID navrženého MVP kořene | Dnešní stav |
| --- | --- |
| 1598dfc9f1955190670fd25fe2485dc830d473c2e9aa73f94ac5081cba4244e7 | deleted, bez potomků |
| 1b311a4c980bcd343ad1a5337274aa49e07c8d93acf7b6b76dc195c8cb6b34b1 | deleted, bez potomků |
| 3e9b9eec52ecf775aa47b8d418dda888e6afe82ebaec6f5a912fb93d142f44f7 | deleted, bez potomků |
| 5e1d6e642a6e8a93bf0f80a29be3b9a5568d5b33db75394b5ad7573b807d2105 | deleted, bez potomků |
| 81c63a7efbdc089072a6deae497b133f8d7293f4624a82b92dca386360a03ff0 | deleted, bez potomků |
| 99354ec09f2dbd3f0fbcd5c61013fb4078990aa5ac73299a482706efb3e8ff61 | deleted, bez potomků |
| c3d23b6cddac99cbb92092e9612bedc51667abbb91a2fc7e307f106df6d9f5f5 | deleted, bez potomků |
| mvp_delete_82492300eb2643b5b751bd598d0782c8 | deleted, bez potomků |
| mvp_rating_negative_20261031 | deleted, bez potomků |
| mvp_rating_regular_20261031 | deleted, bez potomků |
| mvp_shout_delete_20261031_business | deleted, bez potomků |

## Skutečný dopad následné aktivace retence

Samotný úklid výše by odstranil jen 11 kořenů a ponechal dalších 28 Shoutů,
99 komentářů a 1 soukromou odpověď. Následná běžná údržba má vlastní dopad:

| Skupina podle dnešních dat | Shouty | Veřejné komentáře | Soukromé odpovědi |
| --- | ---: | ---: | ---: |
| Staré MVP bez doloženého konce – navržený kontrolovaný úklid | 11 | 0 | 0 |
| Známá expirace, konec expirace +67 dní již uplynul | 22 | 97 | 0 |
| Známá expirace, konec archivu ještě neuplynul | 6 | 2 | 1 |

Termíny posledních dvou řádků vycházejí z původních dat, migrace je neobnoví.
U 22 vláken se prošlá těla nezkopírují do nového archivu a běžná údržba je
odstraní. U 6 zůstanou jen do původního konce, se zachováním původního konce
sedmidenní vlastní historie. Aktivace tedy nemůže současně slibovat zachování
všech původních 38 zdrojů bez změn. Zde se tento dopad předkládá výslovně.

Jeden z 97 prošlých komentářů je od autora s původní pending žádostí a patří do
demo_usti_hugo; obsahový termín tohoto vlákna skončil 3.11.2026 10:24:46 UTC.
[Adopční jádro](../../../functions/content_lifecycle_adoption.js) dnes odmítne
subjekt v mazání i tehdy, kdy by šlo pouze o metadata bez nového těla. Je nutné
lokálně připravit a ověřit úzkou cestu pro již definitivně prošlé tělo: bez
nového textového archivu, nové kontaktní vazby, prodloužení termínu nebo resetu
účtové žádosti/journalů. Neuplynulá či nejasná retence, smazaný profil,
uzavřený purge vstup nebo změněná inkarnace musí dál zastavit transakci.
Stávající Auth kontroly účtového workeru se neoslabí.

## Navržený jeden společný dokončovací úsek

1. Připravit operátor úklidu právě těch 11 MVP: přesný projekt, digest,
   SDK createTime/updateTime a hash, deleted, nuloví potomci, společný indexový
   writer a rozpočet 450 zápisů. Ověřit souběh, restart a ztracenou odpověď;
   nový potomek nebo změněný důkaz nesmí rozšířit mazání.
2. Doplnit popsané převzetí metadat již prošlého zdroje pending autora.
   Ověřit původní v3 worker při přítomném i chybějícím Auth, purge, souběh,
   rollback a nemožnost založit nové tělo či obnovit uzavřenou inkarnaci.
3. Připravit aktivační a kompatibilní návratové zdroje/balíčky a konfigurace;
   zachovat vydanou hru. Návrat po odstranění zdrojů musí dál umět archivní
   čtení a stejnou právní verzi, nikoli vrátit dnešní d119d63. Dokončit místní
   testy, revizi před společným pushem a úplné CI přesných zdrojů jednotlivých
   nezbytných bezpečnostních etap; průběžně nepřidávat nesouvisející změny.
4. Pouze po úspěšných kontrolách provést v **shoutout-dev-46c81** čerstvě
   ověřený plán odstranění 11 kořenů. Ostatní data v této fázi kontrolovat proti
   baseline, nevytvářet náhradní časy smazání nebo falešný archiv fixture.
5. Založit samostatný SHOUTOUT_ARCHIVE_IDENTITY_KEY, 32 náhodných bytů.
   Nevkládat jej do klienta, výpisů ani inventury. Zachovat identity purge po
   prvním zapojení i při omezení ingressu/lookupu, bez závislosti purge na klíči.
6. Čerstvý selektivní indexový plán: 5 složených, 12 výjimek map a 1 skupinový
   array index auditů, dnes 18 akcí. Zachovat TTL a ostatní definice, ověřit
   READY. Staré digesty nejsou slepým souhlasem s novým stavem.
7. Čtyři nové callables observeArchiveIdentity, getArchiveIdentityPage,
   getLifecycleSourcePage a getLifecycleReportEvidence: europe-west3,
   min 0 /max 1, concurrency 1, 256 MiB, 15 s. Aktualizovat potřebných 27
   stávajících Functions včetně obou read-sync endpointů a účtových workerů;
   cílově 31 ACTIVE. Stávající prostředky a dva minutové plánovače beze změny.
8. Řízené servisní okno DEV pro právní verzi 2026-11-27, kompatibilní
   web/server/Rules a capture fence. Doložit doběhnutí starých volání.
   Odhlášení a vlastní smazání bez nového přijetí zůstanou možné; právní
   potvrzení se nesmějí vytvářet za uživatele. Hosting jen shoutout-dev-46c81
   na web.app/firebaseapp.com, databáze (default).
9. Obnovitelná migrace/audit po nejvýše 50 zdrojích /450 zápisech, zpočátku
   se zachováním starých textových kopií. Čtení/údržbu zapnout až po doložené
   kompatibilitě a auditu. Další neprokázaný nález tuto fázi zastaví.
10. Původní běžná údržba uklidí také výše uvedených 22 prošlých vláken a 97
    komentářů, se sdíleným dosavadním rozpočtem, max. 32 lifecycle kroků
    /měkkých 10 sekund. Původní pending žádost, její Auth a vlastní retenční
    termín se nemažou ani neposouvají; nevytvoří se nový archiv prošlého komentáře.
11. Ověřit kompatibilní návrat a pokračování workerů. Až při dostupném klientu
    použít nejvýše 2 nové 24h Shouty, 1 veřejný komentář, 1 soukromou odpověď
    a 1 hlášení pod stávajícími Bright_Otter_182/TestBusiness. Pro odmítnutí
    nové verze a vlastní smazání nejvýše 1 nový dočasný ověřený Auth účet s
    profilem, bez předvyplněného právního přijetí. Žádný další původní Auth
    účet nesmazat. Vymezit syntetické pilotní záznamy manifestem pro úklid;
    potvrzení operací ponechat 7 dní, obecné lhůty ani kvóty neměnit.

Ruční akceptace zůstane jeden poslední blok až po všech samostatných kontrolách.
Nové role, sankce, limity, služby, četnost jobů, globální App Check, main, tagy
a produkce nejsou součástí. DEV profil nedokládá kapacitu 5 000 relací.
Nespouští se placený zátěžový test ani Phone Auth/R2.

<a id="finishing-implementation"></a>

## Dokončovací implementace a pořadí vydání

### Ověřený první zdroj a provedené živé kroky

Zdroj **ebae0e321e6aa536b68a90e8610f1eb37bb824bf** má
[úspěšné úplné CI 46000078269](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46000078269).
První b9f193a běh skončil na chybějící vygenerované tabulce důkazů; následný
commit ji doplnil a ručně spuštěné úplné CI ověřilo celý přesný ebae zdroj.
Čistá nasazovací kopie: build/releases/archive-capture-ebae0e3.

V DEV již provedené (27.11.2026 kolem 13:00 UTC):

- Přesných 11 MVP kořenů odstraněno v jedné transakci; 129 ostatních zdrojů
  včetně pending žádosti chráněno. Kontrola: 28 Shoutů /99 komentářů /1 soukromá
  odpověď, archivních těl zatím 0. Původní žádost má stejné SDK verze.
- Nový samostatný SHOUTOUT_ARCHIVE_IDENTITY_KEY, verze 1, 32 náhodných bytů
  zapsaných jako hex64. Hodnota nebyla vypsaná ani zapsaná do místního souboru.
- Přesných 18 selektivních indexových operací dokončeno; všechny požadované
  indexy READY, TTL beze změny. Ověřeno i dokončení všech 18 long-running operací.
- 31 Functions ACTIVE v profilu capture, stejné min0/max1/concurrency1/256 MiB,
  callables 15 s, tři worker endpointy 60 s. Stejné dva minutové Scheduler joby.
  100 % provozu nové revize; všech 27 předchozích služeb má všechny starší
  revize ve stavu Active=CONDITION_FAILED / revisionReason=RETIRED. Závěr není
  odvozený jen z času nebo chybějících metrik.
- Hosting **806c5134994f9acd**, veřejný main.dart.js SHA-256
  9d2af5eb747679da367ad1b3a0e9ad10789b5fb63245512b2bb9272bc6c5708e
  shodný s release artefaktem. Rules **7834bb01-d63c-4639-af6a-03d53f3600d9**,
  hash 116a5ebdc44c268908bcc34e0e798de636cc8156d613f3aa565706c02128211b.
  Právní verze 2026-11-27; nové čtení a obsahová údržba vypnuté.
  Všechny čtyři nové callables vracejí bez identity/attestace HTTP 401.
- Capture fence spuštěný až po všech výše uvedených důkazech; digest startu
  ef378488275a6c7d4e49cbea14be9858f5289f324555d41ed891bb88a908cf52.
  Inventura dokončená: 131 původních záznamů /10 stránek, digest
  427b1119bcc72a5983852e4c8a9eece5d6e4d3f99b284fb8ad77074e988d72b9.

### Regrese provozního operátoru před první adopcí

První zdrojová dávka má 28 kořenů: 6 otevřených termínů pro kopii a 22 pouze
prošlých vazeb. Její apply se zastavil **před prvním zápisem** na
invalid-feed-runtime-enabled: operátor vypnul capture, ale zdědil zapnutou
inlineParentAdoption z instalovaného profilu. Oprava odvozuje výchozí inline
volbu od již vyřešeného capture parametru; výslovně rozporné volby dál odmítá.
Regrese spouští skutečný modulový graf v active i rollback profilu a ověřuje
metadata-only konstruktor bez IO. Prošly 4 profilové testy, lint a serverové
unit 229 pass /903 integračních skip. Nejde o důkaz provedené migrace.

Oprava se spojí s již připravenou druhou etapou do nového přesného úplného CI.
Potom může schválená adopce pokračovat při zachování textových zdrojů;
nasazení active zůstává podmíněné úplným auditem a vyřešením tří hlášení níže.

Původní pending požadavek nemá odpovídající Auth účet již **před** těmito
změnami (čtecí kontrola 12:41 UTC), ani primární job. Žádný původní Auth účet
se touto prací neodstranil a požadavek se nemaže, nepřepisuje ani nespouští.

### Dodatečný nález – tři vyřízená stará pilotní hlášení

Všechna tři stávající hlášení byla ověřena proti původnímu manifestu pilotu
MVP modbiz 926a31d2. U hlášení komentáře již zdroj neexistuje a report nemá
textovou kopii. Rodič všech tří byl změněný až po jejich vytvoření; současný
SDK updateTime proto nesplňuje důkaz původní verze, aniž by se něco odhadlo.
Původní text se nedoplňuje a audit se nesmí obejít.

Vlastník následně **výslovně schválil** nejmenší postup: uklidit právě tato tři
resolved testovací hlášení, včetně jejich vložených rozhodnutí, s přesnými
SDK/hash pojistkami a novým přesným CI. Parent Shout, zbylý komentář,
soukromá odpověď, postihy a technická potvrzení se zachovají. Nejde o nové
obecné pravidlo pro skutečná hlášení. Živý úklid vyžaduje přesné CI operátoru.
První nezávislé kroky výše zůstávají schválené; konečný migrační audit a
zapnutí čtení/údržby závisejí na vyřešení tohoto nálezu.

Druhá etapa active a oddělené návratové balíčky jsou připravené z čistého
zdroje a221749f5c01c8603309e0128b7f1098f30fb80c. Jeho
[úplné CI 46009552516](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46009552516)
je úspěšné. Release web prošel místní kontrolou v active i rollback profilu;
Rules i klientský kontrakt jsou shodné, pouze návratová údržba je vypnutá.
Tato etapa dosud není nasazená. Pilotní data ani právní potvrzení se nezakládají.

### Provedené převzetí zdrojů a schválená výjimka hlášení

Ze samostatné čisté kopie build/releases/archive-active-a221749 byl po přesném
CI proveden původní plán kořenů cc010734f12f4ccb7565d990965b13d84ae4f5aece76e77bcfa25199185914a1
a dvě nové dávky potomků po 50. Celkem 128 zdrojů: 28 kořenů /99 komentářů /
1 soukromá odpověď. Výsledky 62 +53 +50 zápisů; vzniklo 28 thread hlaviček a
9 dosud retenčně platných archivních těl (6 Shoutů, 2 komentáře, 1 soukromá
odpověď). Zbylých 119 zdrojů má pouze prošlou vazbu, bez obnovení textu.
Texty zdrojů se v této etapě zachovávají; čtení a obsahový purge se neaktivují.
Následuje úplný audit a samostatné ověření původních termínů/pending žádosti.

[Pevný operátor tří hlášení](../../../tools/archive_report_cleanup.mjs) odmítá
jiné cesty, nevyřízený stav, jiné testovací označení, potomky hlášení a drift
SDK verzí/hashů celé omezené baseline. V jedné transakci odstraní právě tři
reporty včetně vložených rozhodnutí, zvýší legacyRevision a uloží sedmidenní
technické potvrzení ve stávajícím kontraktu cleanupLegacyArchiveFixtures.
Původní inventura i audit se tím zneplatní; před aktivací je nutná nová úplná
inventura. Opakování vyžaduje potvrzení a nepřítomnost všech tří původních
reportů, novou inkarnaci nikdy nemaže. Žádné nové obecné retenční pravidlo.

Místní emulátorové ověření: 5 transakčních případů (souběh, rollback, změna
zdroje/reportu/controlu, neznámí potomci, ztracená odpověď, znovuvytvořený
report, zachování obsahu/postihů/pending žádosti/receipts, zneplatnění inventury)
a 1 CLI kontrakt, celkem 6 pass /0 skip. Nové přesné úplné CI této výjimky
musí předcházet jejímu živému použití. Ostatní právní, pilotní a retenční
podmínky schváleného balíku zůstávají platné.

Celý výše uvedený rozsah byl následně výslovně schválen. Připravené zdroje:

- [Pevný operátor 11 fixture](../../../tools/archive_legacy_cleanup.mjs):
  SDK verze/hash, nuloví potomci, související důkazy a úplná omezená baseline
  ostatních zdrojů i pending žádosti. Jedna transakce přes společný writer;
  vlastní technické potvrzení stejného úklidu zůstává 7 dní. Není vydáváno za
  uživatelskou operaci ani datum původního odstranění. Bez potvrzení se pouhá
  nepřítomnost zdroje nepovažuje za úspěch; nová inkarnace se nikdy nesmaže.
- [Adopce](../../../functions/content_lifecycle_adoption.js): pouze veřejný
  komentář po definitivním původním obsahovém termínu. Existující pending
  žádost, starší inkarnace profilu a případný platný dosud neotevřený purge job
  jsou znovu ověřené a svázané SDK verzemi s plánem. Smazaný/chybějící profil,
  později vytvořený zdroj, uzavřený vstup a nejasný job zůstávají odmítnuté.
  Žádné nové tělo, kontakt ani zápis do účtové žádosti/jobu.
- [Selektivní indexový nástroj](../../../tools/archive_dev_indexes.mjs):
  čerstvý plán, přesné CI a digest; jen známých nejvýše 18 indexových akcí.
  Restart pokračuje zbývajícími shodnými akcemi, jiný nový návrh zastaví běh.
  PATCH používá výhradně updateMask=indexConfig, bez změny TTL.
- [Nasazovací profil](../../../functions/archive_deployment.js) je omezený
  na přesný DEV projekt; lokální emulátor a produkce zůstávají neaktivní.
  První commit vybírá capture: archivace/identita/úklid identity a právní verze,
  avšak bez nového čtení a obsahové údržby. Druhý po úspěšném auditu vybere
  active. Každý nasazovaný zdroj potřebuje vlastní přesné úplné CI.
- [Materializace balíčku](../../../tools/archive_dev_release.mjs) spojuje
  tři skutečné modulové grafy /31 Functions, jejich hashe, Git SHA/čistotu,
  Rules a konfiguraci webu. Web se připravuje/buildí/kontroluje/nasazuje s
  `--archive`; přednasazovací kontrola musí zvolit stejný profil. CI sestavuje
  právě tuto variantu. Vydaná hra zůstává zachovaná.
- Kompatibilní návrat z active dovoluje pouze rollback profil: zachová čtení,
  zachytávání, identitu, její purge a právní verzi; zastaví obsahovou údržbu.
  Nemůže přepnout capture na active ani vypnout zavedenou retenci identity.
  Po odstranění zdrojů se nepoužije původní d119 web. Návratový balíček se
  připraví a ověří před aktivací údržby.

Lokální důkazy: dvě cílené sady s překryvem – 31 emulátorových případů
úklidu/adopce/operátoru a 33 případů adopce, přípravy/finalizace účtu a kombinací Rules
(stará/nová právní verze × vypnuté/zapnuté archivní čtení). Prošly také
cílené testy indexů, balíčků, profilů a webové konfigurace i serverové unit/lint
(227 pass /903 integračních skip; skip nenahrazují emulátor). Nový adopční plán
má verzi 2; starý plán bez účtových SDK pojistek se nepřijme.
Úplné CI tohoto nového zdroje a živé etapy ještě nejsou tímto výsledkem doložené.
Již započtené místní podúseky nedostávají druhý kredit; DEV/akceptace zůstávají
otevřené. Všechny pilotní fixture a skutečné právní souhlasy až na konec.

<a id="dev-finishing-deployment"></a>

## Dokončené DEV nasazení, otevřená provozní a ruční akceptace

Zdroj **5435855847bc81c76a05f1e6f18d5b68b636367b** má
[úspěšné úplné CI 46013597685](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46013597685).
Po něm operátor s digestem
39abd11208683c6b8ac57d16deccc9c80a7c845ace7be680104d9c4123bb66b2
odstranil přesná tři vyřízená pilotní hlášení, zachoval 217 chráněných záznamů
a atomicky nastavil legacyRevision 1. Pět zápisů zahrnuje tři reporty, control
a vlastní sedmidenní potvrzení; původní rozhodnutí/postihy mimo tyto reporty
se nepřepisovaly. Žádná Auth mutace.

Čerstvý audit s digestem inventury
47173f8a04788df149ea6b39d71fce95f360f9e26772f66ad9ff334b100faa24
ověřil všech **165 záznamů**, blocked [], legacyText 0, ready true. Nejde o
automatické aktivační oprávnění; navazující rollout je proveden v rozsahu
výslovného souhlasu vlastníka a přesného úspěšného CI.

Nasazení proběhlo ve třech krocích: 27 obsahových Functions +2 read-sync,
potom Rules/web s živým ověřením, nakonec 2 účtové Functions s údržbou.
Hosting **14a0f588585839e2**, Rules **1b29a656-f990-42f5-b335-ef35c44c0997**
(SHA-256 0175189e016f072c9d9229caeca0899ee622b952a0d5d7ed2cbb69fac2a5b8e8).
Ověřeno 68 aplikačních cest a dvě standardní rezervované Firebase init cesty,
8 HTTP hash kontrol obou DEV domén a 4×401 bez Auth/App Check.
Všech 31 Functions ACTIVE/Node22/active profil, 100 % nové revize; všechny
starší revize 31 endpointů RETIRED. Skutečných 31 zdrojových ZIP archivů
souhlasí se všemi hashi připravených modulů, balíčků a env souborů.
Min0/max1, concurrency1, 256 MiB, callables 15 s /workery 60 s i dva minutové
plánovače zůstaly stejné. Podpisové klíče, Storage a produkce beze změny.

Release web z a221749 byl použit po doložené shodě všech webových zdrojů,
konfigurace, Rules a serverových balíčků mezi a221749 a 5435855; poslední
commit přidal jen úklidový nástroj, jeho testy a dokumentaci. Nejde o tvrzení
nového sestavení změněné aplikace. Active i rollback balíčky jsou připravené;
rollback zachová čtení/capture/identitu/právní verzi a zastaví obsahovou údržbu.
Živý návrat otevřeného klienta zatím není novou ruční akceptací doložený.

Obsahová údržba je skutečně aktivní: 14:44–14:48 UTC pět ticků continuation,
každý 25 kroků /25 jednotek ze sdílených 50 (druhá polovina pro účtové zdroje),
max32 kroků /měkkých10 s zachované. lifecycleFailed 0 /lifecycleNeedsReview 0.
Průběžný stav 14:48:46 UTC: 22 zdrojových Shoutů /64 komentářů /1 soukromá
odpověď, všech **9 platných archivních těl zachovaných**. To není konečný počet:
na původní časové ose skončila historie u 27 zdrojů Shoutů /98 komentářů;
z toho 22 Shoutů /97 komentářů má prošlý i konečný archivní termín, dalších
5 Shoutů /1 komentář pouze přechází ze zdroje do zachovaného archivu.
Původní pending žádost má stejné SDK verze, oba původní joby stále absent;
její Auth chyběl už před prací. Její termín, stav ani běh se nepřepisoval.

### Nález staré indexové údržby (následně uzavřený)

Při první kontrole byl souhrn workeru WARNING kvůli **indexFailed 1**, nikoli kvůli obsahovému
archivu. Čtecí reprodukce bez zápisu potvrdila invalid-normal-gc-generation.
[Spouštěč GC](../../../functions/feed_normal_gc.js) v tehdy nasazeném guardu uznával jen
marker.v === 1, zatímco feed-v3 má již podporované v2/cardProjection1.
[Vlastní GC jádro](../../../functions/feed_index_gc_store.js) formáty 1/2
podporuje. V tomto kontrolním bodě ještě nebylo doložené bezchybné provozní ověření celého workeru; následné úspěšné ověření je uvedené níže.

Předložený další konkrétní úsek: ověřovat podporované kombinace přes existující
generationCardProjection, doplnit v1/v2 regrese zachování živých a hodinově
chráněných stromů, restartu/souběhu a vadného formátu; po přesném úplném CI
pouze dvě existující účtové Functions v DEV. Bez nových dat, Rules, webu,
prostředků, limitů či retence. Vlastník tuto další opravu **výslovně schválil**.
Nález je podmínkou další
provozní akceptace, nikoli důvodem skrýt varovné logy nebo navýšit stupnici
živé akceptace.

Ruční pilot zůstává odložený. Nové fixture, Auth účet ani právní potvrzení
se nevytvořily. Další pořadí: vyřešit GC, jeden společný archivní/identity/
právní průchod dle schválených mezí, úklid nových fixture a plánovaná souhrnná
revize před společnou MVP regresí. DEV nasazení je samostatně doložené;
živá akceptace a produkce zůstávají otevřené.

### Schválená lokální oprava GC formátu a další vydání

V guardu spouštěče se nyní používají stávající generationContentIdentity a
generationCardProjection; tím přijme platný v1 i v2 a odmítne nepodporovanou
verzi či rozporné příznaky. Žádná změna GC algoritmu, hodinové ochrany,
lease/retry/batch mezí, rolí nebo retencí. Historie Git dokládá původní v1
podmínku již v cc262af z 6. listopadu; nejde o nově přidané archivační pravidlo.

Všech **9 emulátorových případů** v
[feed_normal_gc.integration.test.js](../../../functions/feed_normal_gc.integration.test.js)
prošlo bez skip: původní v1, skutečné v2 uzly, studené pokračování, současní
workeři, aktuální i hodinově chráněné stromy, odmítnuté vadné kombinace a
průchod přes skutečný zapnutý archivní createFeedRuntime/indexMaintenance
s indexFailed 0 a bez obsahové mutace. Lint také prošel.

Předem stanovený kontrolní bod: po společném pushi úplné CI přesného zdroje, potom
pouze accountDeletionRequestCreatedDev a resumeAccountDeletionJobsDev v DEV;
ostatních 29 Functions, web, Rules a provozní prostředky zůstávají na právě
ověřené verzi. Tato místní regrese sama nebyla důkazem živého úspěchu; následuje skutečný výsledek.

<a id="gc-dev-verification"></a>

### GC oprava nasazená a skutečně ověřená v DEV

Zdroj **bd81e98ddab2b5e0e6f62410e302e9824e547f18** má
[úspěšné úplné CI 46020290663](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46020290663),
včetně finální retenční sady s devíti GC případy. Po něm byly aktualizované
pouze accountDeletionRequestCreatedDev **00019-gap** a resumeAccountDeletionJobsDev
**00019-vel**. Skutečné oba zdrojové ZIP archivy odpovídají novému balíčku;
jediný změněný runtime soubor je feed_normal_gc.js. Ostatních 29 Functions má
stejné revize a jejich předchozí zdrojová verifikace zůstává platná.
Všech 31 endpointů ACTIVE, starší revize RETIRED, stejné prostředky i dva joby.

Nová revize workeru 15:23:08 a 15:24:05 UTC vykázala **INFO /gc:complete**,
indexSteps 32 a 2, indexFailed/indexNeedsReview 0. Také všechny ostatní
chybové příznaky v obou bězích jsou 0 a obsahový lifecycle je idle.
Web 14a0f588585839e2 a Rules 1b29a656-f990-42f5-b335-ef35c44c0997 byly znovu
ověřeny jako beze změny. Provozní nález v1/v2 je tím uzavřený; předchozí
WARNING zůstává historickým důkazem, ne aktuální závadou.

Před opravou GC již doběhl první obsahový dluh: odstraněno přesně 125
zdrojových kopií (27 Shoutů /98 komentářů) po konci historie a 22 definitivně
prošlých thread hlaviček. Všech 119 definitivně prošlých těl zůstalo bez nové
kopie. Zůstávají 3 zdroje (1 Shout /1 komentář /1 soukromá odpověď), 9 platných
archivních těl a 6 hlaviček. Čtecí kontrola všech původních plánů potvrdila
hash/SDK identity zachovaných těl a původní publicUntil/historyUntil/retainUntil;
po opravě GC jsou stejné počty, pending žádost beze změny a původní joby absent.

DEV implementace, převod, nasazení a samostatné provozní kontroly jsou hotové.
**Společná ruční akceptace stále není hotová:** nové skutečné přijetí podmínek,
kontakt/archiv pod adminem, nahlášený obsah po odstranění zdroje a vlastní
smazání bez nového souhlasu. Nové kontaktní vazby vznikají jen z doloženého
Auth pozorování po skutečném novém přijetí; chybějící staré kontakty se
nedoplňovaly odhadem. Případné staré autorské vazby vyžadují příslušné
doložené pozorování a teprve potom původní adopční operátor.
Nové pilotní fixture ani Auth účet zatím nevznikly. Po dostupnosti klienta
jeden společný průchod v již schválených mezích, vymezený úklid a plánovaná
souhrnná revize před společnou MVP regresí. Produkce/main se neměnily.

<a id="public-source-read-fix"></a>

## Oprava veřejné čtecí brány po předběžné revizi

Vlastník 27. listopadu schválil jeden společný opravný úsek včetně commit/push,
úplného CI a následně pouze Rules pro DEV shoutout-dev-46c81. Bez živých
fixture, Auth účtů, změny Functions/webu, rolí, retence nebo produkce.
Společný ruční pilot a celková revize před MVP regresí zůstávají otevřené.

Před opravou bylo 12 syntetickými emulátorovými sondami potvrzeno:

- AR-READ-01: cizí oprávněný klient se znalostí ID nesměl číst deleted Shout,
  ale mohl přímo číst a vypsat jeho veřejné komentáře do historyUntil.
- AR-READ-02: pending žádost autora Shoutu ještě nebránila přímému čtení
  jeho dosud active Shoutu a veřejných komentářů tohoto rodiče. Během
  dávkového účtového úklidu je takový přechodný stav možný.

Hash reprodukovaných Rules odpovídal tehdy nasazenému rulesetu
1b29a656-f990-42f5-b335-ef35c44c0997. Serverový content_lifecycle_sources.js
už ověřoval dostupnost autora a vlastnictví deleted rodiče; přímé Rules
zaostávaly. Jde o přístup ke zdrojovým kopiím, nikoli o otevření soukromého archivu.

### Implementace a místní ověření

V [firestore.rules](../../../firestore.rules) sdílí get Shoutu a get/list
jeho veřejných komentářů nový lifecyclePublicSourceReadable /
lifecyclePublicThreadReadable. Při zapnutém readeru vyžadují platné
historyUntil, dostupného autora rodiče (bez pending žádosti/deleted profilu)
a u deleted rodiče totožnost vlastníka. Existující availableAccountTarget
zachovává kompatibilitu chybějícího starého publicProfiles dokumentu.
Soukromé odpovědi používají původní oddělenou účastnickou/history bránu.
Autor jednotlivého komentáře nepřidává do dotazu další SDK lookup; tento
úsek opravuje dvě doložené mezery v dostupnosti rodičovského Shoutu.

[content_lifecycle.integration.test.mjs](../../../tools/rules/content_lifecycle.integration.test.mjs)
má **7 prošlých testů bez skip**, včetně tří nových matic active/rollback/capture
a jednoho přechodu otevřeného odběru. Matice pokrývají get/list cizího i vlastního
obsahu, admin bez přímého bypassu, pending/deleted profil autora rodiče,
chybějícího rodiče, neplatný/prošlý historyUntil, 50 různých komentujících,
skutečné první/poslední dotazy detailu, odmítnutí limitu 51, anonymního čtení
a klientského přepsání vlastnictví. Přímý archiv a cizí soukromá zpráva zůstávají
nepřístupné. Nový event otevřeného komentářového odběru po pending žádosti
skončí permission-denied; emulátor sám spolehlivě nepřehodnocuje závislé
dokumenty bez dalšího zdrojového eventu, proto test tento event vyvolá.
Tím se netvrdí zpětné odstranění již staženého obsahu z klientské paměti.

**19 klientských testů** live_data_test.dart a live_data_lifecycle_test.dart
prošlo, včetně permission-denied, změny účtu a zániku obrazovky bez uncaught
error. Existující StreamBuilder/liveSnapshots API a serverové archivní
moderování se nemění. Kontroly útoků v rozsahu: anonymní list/get, cizí
get/list smazaného rodiče, parent pending/deleted, osiřelé podkolekce,
podvržení authorId, přímé archivní čtení/zápis a staff bypass jsou odmítnuté;
platné běžné dotazy i vlastní historie jsou kladné kontrolní případy.

Před nasazením: úplné CI přesného čistého zdroje, materializace active
pravidel s právní verzí 2026-11-27, kontrola úzkého diffu proti aktuálnímu
rulesetu a nasazení pouze firestore:rules do shoutout-dev-46c81. Potom
čtecí ověření skutečného rulesetu/hashů a serverové simulace s výhradně
syntetickým kontextem. Pro simulace se použije
[Firebase Rules test API](https://firebase.google.com/docs/reference/rules/rest/v1/projects/test)
s explicitními mocks; žádná živá fixture ani právní potvrzení nevznikne.
Návratový ruleset je výše uvedená předchozí verze; návrat by znovu otevřel
tyto nálezy, proto jej použít jen při prokázané kompatibilitní regresi.
Tento úzký opravený prototyp Rules nenahrazuje celkovou předstartovní revizi.
V evidenci se doplňují důkazy stávajících částí, nikoli nový kredit či živá akceptace.

## Důkazy původního čtecího došetření

Pouze technické ignorované výstupy v build/archive-readiness:

- legacy-deletion-audit.json SHA-256
  e28dc6347b0d0b913643e3b6a59f3140cedc9591f89f03f256a604fafd6e9bae.
- legacy-migration-scope-v2.json SHA-256
  6b7d49d6100f633dc6c9654bd8eb1f4ffe934522ed7f6067da588ab1a00b5207.
- legacy-cleanup-tree-inventory.json SHA-256
  2e9376855eef1e3d82f69fb454a0798f880be1c5059d898fa042299a0d8d7dcf.
- Návrh úklidu 11 má digest
  80a327b955aea5446db07974a67e9430fd3a5ac375cbb846a68efd9c65a5deae;
  není apply oprávněním. Před provedením musí existovat čerstvý plán.

V době původního čtecího průzkumu byl runtime 6e68e03 s CI 45984217529;
průzkum sám nic nenasazoval. Následující schválené a provedené kroky jsou
uvedené výše. Příprava nedostává druhý kredit. Původní souhlas pro společný
úsek byl následně udělen podle AGENTS.md:
„při podstatném rozšíření si vyžádej nový souhlas“ – nový migrační případ,
zrušení ochrany konkrétních testovacích dat a první živý archiv/klíč.
