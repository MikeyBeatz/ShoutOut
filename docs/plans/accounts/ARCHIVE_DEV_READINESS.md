# Archiv – příprava DEV přechodu a společná ruční akceptace

27. listopadu 2026. Navazuje na [hotové místní jádro](ARCHIVE_IDENTITY_LOOKUP.md)
a [integrační revizi](CONTENT_LIFECYCLE_INTEGRATION_REVIEW.md).
Vlastník schválil celý přípravný balík níže včetně pouze čtecí DEV inventury,
commit/push a úplného CI. Souhlas nezahrnuje živé zápisy, klíč ani rollout.
Ruční testy vlastník odložil do jednoho
závěrečného bloku; odložení není výsledek testu ani povolení obejít bránu vydání.

## Ověřené podklady

- Archivní zdroj b1ed417c689884b496627eb907788d1b871d5a0d má
  [úspěšné úplné CI](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45970322486).
  Dokumentační HEAD je 6e57ba2277a86953a2cd9348377ec0033701fbcf; runtime se proti
  b1ed417 nezměnil. Všechny nové volby zůstávají false.
- Poslední doložený DEV web d119d63672e8c4c58a60faf90eaeb5af585afda2 obsahuje
  hudbu a opravené ovládání hry. Archivní větev tyto změny dosud nemá.
  Kontrola git apply --check nad přesně 13 publikovanými herními soubory,
  proti aa43ae1 → d119d63, prošla bez konfliktu a bez zápisu do zdrojů.
  Rozpracovaný herní experiment z kořenového HEAD 1d0b03a se nepřebírá.
- Čtrnáct aktuálních unit/nástrojových kontrol legal policy, obou indexových
  plánů a přechodového operátoru prošlo bez selhání či skip. Nešlo o nové CI,
  build, inventuru DEV ani ověření skutečně nasazené revize.
- Porovnání obsahové codebase s doloženým serverovým zdrojem 05fc1ed ukazuje
  22 původních callables a dva nové připravené: getLifecycleSourcePage a
  getLifecycleReportEvidence. Dva identity handlery dosud nejsou callable
  exporty. Budoucí návrh tedy zahrne čtyři nové callables, nikoli jen dvě.
  Aktuální živý seznam musí znovu potvrdit autorizovaná inventura.
- LegalAcceptancePage dovoluje odhlášení, ale ne vlastní smazání. Prepare a
  finalize používají requireEligibleActor s aktuální verzí přijetí. Samotné
  přepnutí verze by existujícímu účtu bez nového potvrzení zablokovalo novou
  žádost o smazání. Tuto produktovou volbu je nutné rozhodnout před aktivací.

## Návrh jednoho společného přípravného balíku

1. Připravit kompatibilního kandidáta s archivem a pouze již publikovanými
   herními změnami. Zachovat oddělenou větev, neslučovat main ani nevydávat tag.
   Ověřit celý diff včetně závislostí a obou podob herního ovládání.
2. Dokončit čtyři callable deklarace a jejich balíčky za vypnutými volbami.
   Ověřit Auth/App Check i správné připojení deklarovaného identity secretu ke
   všem funkcím, které jej skutečně potřebují. Výchozí off cesta nesmí klíč ani
   databázi vyžadovat. Deklarace v kódu není vytvoření skutečného secretu.
3. Připravit verzovaný přechod existujících účtů. Navržená DEV verze je
   **2026-11-27**; v tomto balíku se nezveřejní ani nezapne. Běžné používání a
   nový kontaktní záchyt vyžadují skutečně potvrzenou novou verzi. Odhlášení a
   vlastní žádost existujícího účtu o smazání budou dostupné i bez jejího přijetí;
   ostatní dosavadní bezpečnostní kontroly a potvrzení heslem zůstanou zachované.
   Staré souhlasy se nepřepisují a nové se nevyplňují automaticky za uživatele.
4. Doplnit obnovitelné místní plánování počátečního pokrytí a autorských vazeb
   veřejného archivu. Kontakt se zachytí pouze z doloženého Auth pozorování po
   skutečném přijetí nové verze. Neprocházet celou historii Auth ani nedomýšlet
   staré kontakty; nepřihlášené účty zůstanou výslovně mimo doložené pokrytí.
   Nové pozorování lze využít pro starší archiv pouze při shodě UID, inkarnace
   Auth/profilu a původních SDK/content důkazů. Jinak výsledek zůstane blocked.
   Nevytvářet falešné callable přihlášení nebo souhlas při běhu operátoru.
5. Plán/apply musí pracovat s digestem, přesným projektem a SDK inkarnacemi,
   zachovat nejvýše 50 zdrojů / 450 zápisů, původní termíny i cizí data.
   Doplnění authorAccountKey nesmí měnit původní tělo, čas publikace nebo
   vymýšlet okamžik odstranění. Mazání během operace musí zápis zastavit;
   opakování po úklidu nesmí vazby znovu založit. Soukromé konverzace se
   neotevírají obecnému procházení.
6. Společně ověřit přechod a návrat s původním minutovým workerem. Po první
   instalaci zůstává identity purge zapnuté i při vypnutí hledání, bez klíče;
   číselné pozice rozpracovaných fází se nesmějí posunout. Zachovat čtení po
   případném scrub; v prvním živém návrhu preferovat preserve textových kopií,
   dokud není doložená kompatibilita všech požadovaných klientů.
7. Udělat emulátorové/klientské a balíčkové kontroly, revizi před společným
   pushem a jedno úplné CI výsledného kandidáta. Ruční test teď není potřeba.

Jde o pokračování cíle MVP. Konkrétní rozšíření o staré vazby a chování při
nepřijetí nové verze je výslovně schválené; rutinní kroky se znovu neschvalují.

## Místní výsledek přípravného balíku

- Zachováno přesně 13 publikovaných herních souborů z d119d63; nepřebírá se
  rozpracovaný experiment kořenové větve. Nastavení archivu zůstává vypnuté.
- Čtyři připravené callable exporty mají dosavadní DEV profil a Auth/App Check.
  Identity secret je pouze deklarovaný; off artefakt jej nemountuje. Zapnutá
  deklarace jej připojí ke všem 17 navazujícím writerům/čtenářům, které runtime
  vytvářejí, a k oběma identity endpointům; workerový UID purge klíč nepotřebuje.
- Připravená právní verze je 2026-11-27, skutečná konfigurace dál 2026-07-25.
  Výjimka pro prepare/finalize přeskočí pouze přijetí podmínek; běžná operace
  tento požadavek vynucuje i při pokusu předat opačnou interní volbu. Auth,
  App Check, ověřený e-mail, profil, zákaz/pending kontroly a heslový klientský
  postup se nemění. Nový formulář nabízí vlastní smazání vedle odhlášení.
- [Operátor starých vazeb](../../../tools/archive_identity_adoption.mjs)
  nevytváří kontakty ani účtové inkarnace a nevolá Auth. Zpracuje nejvýše 50
  existujících veřejných archivních těl, vyžaduje doložené přijetí nové verze,
  existující HMAC pozorování a přesné SDK důkazy. Nejasný řádek blokuje celou
  dávku. Opakování ověří znovu smazání a retenci; po úklidu nic nezaloží.
  Plány obsahují jen cesty, časové identity a hashe. Neobsahují obsah/kontakty.
- U atomického zachycení se inkarnace dokládá společným SDK commitem zdroje
  a archivu, případně původním SDK createTime v přechodové kopii. Čas
  serverového razítka pole se nevydává za přesný SDK čas potvrzení dokumentu.
- Nový pouze čtecí preflight nepotřebuje captureFenceAt ani řídicí dokument.
  Projde původních devět kolekcí/skupin po 50; pokračování je vázané na digest
  a kontrolní metadata. Výsledek je poradní, nikdy podklad k apply migrace.

Místně ověřeno: 25 transakčních případů včetně přípravy/finalizace smazání,
potom 13 aktuálních případů doplnění/inventury včetně rozšířené dávky 50 a
stránky přes 50; vše bez skip. Dávka 50 pod jedním účtem potřebovala nejvýše
156 dokumentových čtení a 50 zápisů, jednotlivá nejvýše 10 čtení /1 zápis.
Započítaná čtení jsou SDK dokumentová čtení jádra; nejde o cenový odhad ani
záruku počtu účtovaných čtení při transakčních retry. 131 nástrojových testů,
27 cílených Flutter testů, lint a analýza prošly. Serverové unit: 224 pass,
895 integračních skip; skip nenahrazují skutečný běh emulátoru. Po doplnění
připravené konkrétní právní verze následuje závěrečná kontrola a úplné CI
přesného zdroje. Výsledek CI a provedené čtecí inventury je níže; ruční akceptace
zůstává neprovedená.

## Úplné CI a čtecí DEV inventura – 27. listopadu

Zdroj **6e68e03d719aa66e45277204abce9a8bd3a2aa4e** má
[úspěšné úplné CI 45984217529](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45984217529).
Prošlo 600 aplikačních testů, browsery 17 +2, 131 nástrojových, 483
Rules/transakčních, 178 archivních a 151 retenčních případů. Prošly také B4,
moderace, Business, B2, Storage, analýza, lint a webový build. Serverové unit:
225 pass /896 integračních skip; skip nenahrazují skutečně spuštěné emulátorové
sady. Herních 13 souborů se shoduje s vydaným d119d63. Žádný rollout neproběhl.

Čtení projektu shoutout-dev-46c81 po tomto CI potvrdilo:

- Databáze (default), Standard /FIRESTORE_NATIVE, europe-west3.
- 27 Functions ACTIVE; dosavadní profily 256 MiB, max 1 /concurrency 1,
  15 s pro callables a 60 s pro workery zůstávají. Všechny čtyři nové exporty
  jsou nadále pouze v připraveném zdroji.
- Hosting **2075374549f5b49b**, vydaný 26.11.2026 21:57:15 UTC;
  Rules **82d8db43-d9e9-4bd1-ba3f-f530fa78da57**, beze změny proti doloženému DEV.
- Deset stránek devíti kolekcí/skupin: 39 Shoutů, 99 veřejných komentářů,
  1 soukromá odpověď a po jednom reports/commentReports/privateReplyReports.
  accountContentArchive, contentLifecycleArchive a contentLifecycleThreads
  mají v této inventuře 0 záznamů. Nejde o inventuru uživatelských kontaktů/Auth.
- **11 deleted Shoutů nemá přímo doložený původní okamžik odstranění.**
  Jde o konkrétní nález preflightu, nikoli důkaz, že už nelze dohledat jiný
  původní serverový doklad. Datum se nedoplnilo z updateTime/expirace/aktuálního
  času a nevytvořil se náhradní archiv. Před převodem musí existovat ověřitelný
  doklad, nebo výslovně schválený postup pro tyto staré výjimky. Běžné apply
  nesmí nejasné řádky obejít či vydávat za dokončenou migraci.
- Čerstvý indexový návrh: 5 nových složených indexů, 12 vypnutí zbytečné
  indexace map a 1 skupinový array index auditů, celkem 18 akcí. Pending 0;
  TTL a nesouvisející definice se nemění. Nic z návrhu se neaplikovalo.

Inventurní soubory jsou místní ignorované technické artefakty v
build/archive-readiness, bez textů/kontaktů/tokenů. Poradní plán má digest
f5f86dd2f3135cc706a5cf7c197f50348b21a3f725e30c6c2a783d8a0ba1a233.
SHA-256 souhrnu: 0e892ef56cae5f4abe66a5f28d2a75a166fb5693e77ca912038eee23258371e3.
Indexové plány mají digesty
f1e0f0401ead01cc2fb203adf743089e47a9fef3c0d72b336a6520a00a4a8b8b a
e19d85fd32a5903200068d0665010eff1d4fb1dc19ccf5b0a0cf72223473e484.
Úplný technický snapshot má SHA-256
2248c168d8f93885eb422e40170431b951b2d0bf8ba8c886c1aff9ae9fae25dc.
API při čtení indexů přijalo pouze výchozí page size a vracelo širší seznam;
plánovací pohled byl zúžen až po ověření projektových jmen. Původní úplný
seznam je zachovaný v technickém snapshotu. Neproběhl žádný datový zápis,
založení control/fence, klíče, Auth účtu ani změna Scheduleru či prostředků.

### Konkrétní další pořadí před živým přechodem

1. Vyřešit důkazy nebo konkrétní postup pro uvedených 11 starých výjimek;
   nynější souhlas je neupravuje. Počáteční kontaktní pokrytí zůstává jen pro
   skutečně přihlášené účty po novém přijetí; žádná rekonstrukce historie Auth.
2. Předložit jeden společný živý balík: přesný DEV cíl, samostatný projektový
   HMAC klíč, 18 selektivních indexových akcí s čerstvými digesty/READY,
   kompatibilní web/server/Rules a navržená právní verze. Při všech nových
   aktivačních zdrojích opět úplné CI přesného commitu; main/produkce se nemění.
3. Nasadit kompatibilní základ, pak odděleně informování a capture-only fázi
   s vlastním schváleným fence. Nová verze přijetí se nevytvoří za uživatele.
   Nové čtyři callables by rozšířily dnešních 27 Functions na 31. Přepnutí
   právní politiky musí zahrnout i oba read-sync endpointy, ne jen content
   codebase; účtové workery musí zachovat pokračování a sticky purge.
4. Teprve po úplném důkazním auditu zapnout nové čtení/údržbu. První pilot
   ponechá staré textové kopie; návrat zachová čtení nových archivů a úklid.
   Starý otevřený klient musí mít předem určenou kompatibilní/návratovou cestu.
5. Konkrétní živý pilot schválit s vymezeným obsahem a jedním novým dočasným
   účtem pro test odmítnutí nové verze a vlastního smazání. Fixture vytvořit až
   při dostupném člověku; celý ruční blok níže udělat společně na konci a uklidit.

Tyto kroky jsou připravený další návrh, **ne souhlas s jejich živým provedením**.
Přípravný balík je dokončený; aktivace, řešení starých výjimek a živá akceptace
zůstávají otevřené. Nové služby, další produkční limity nebo placený zátěžový
test se tímto návrhem nepřidávají.

### Navržená pouze čtecí DEV inventura po přípravě

Součástí navrhovaného souhlasu je po místním ověření pouze čtení projektu
**shoutout-dev-46c81**: revize již nasazeného webu/Functions/Rules, úplné indexové
metadata a obnovitelné stránky existujících zdrojů/archivních vazeb. Použít
stávající rozsah devíti kolekcí/skupin a dávky max. 50; zapisovat pouze místní
inventurní soubory s cestami, SDK časy, hashi, počty a důvody blocked.
SDK může číst tělo do paměti kvůli ověření hashe, ale texty, otevřené kontakty,
tokeny a klíče nesmějí být ve výpisu ani inventurním souboru. Žádný listUsers
nebo plošný Auth scan. Původní pending žádost, její účtové běhy a starý pilot
se touto inventurou nemění; nezakládat nové kontrolní dokumenty ani fence v DEV.

Je-li dosavadní inventurní funkce závislá na existujícím captureFenceAt,
nezakládat jej kvůli inventuře. Připravit oddělený čtecí preflight a tuto
omezenou variantu otestovat místně; digest před zapnutím není potvrzením
úplnosti budoucího migračního průchodu po zapnutí capture.

Výstupem bude skutečný seznam nutných změn, rozsah prokazatelného doplnění,
výjimky a konkrétní návrh živého přechodu. Bez vytváření klíče, změny dat,
nových Auth účtů, nasazení, změny Scheduleru, prostředků, main či produkce.
Pokud přístup/rozsah není v mezích tohoto čtecího souhlasu, krok zastavit.

## Podmínky samostatného živého návrhu

- První skutečný identity HMAC klíč bude samostatný projektový klíč 32 bytů,
  nikoli kopie feed cursor klíče. Konkrétní verzi secretu založit až po souhlasu.
- Předběžný DEV profil čtyř nových callables odpovídá dosavadnímu pilotu:
  europe-west3, min 0 / max 1 instance, concurrency 1, 256 MiB, 15 s. Jde o
  návrh, ne nasazení ani potvrzenou produkční kapacitu 5 000 relací.
- Definice plánují 5 složených indexů, 12 výjimek mapových polí a jeden
  skupinový array index auditů; nejde o skutečný počet změn v DEV. Ten určí
  čerstvá metadata. TTL a nesouvisející indexy se nemění; vyžaduje se READY.
- Přepnutí podmínek, Rules, serveru a klienta vyžaduje přesné pořadí a postup
  pro staré otevřené karty/nativní buildy. V DEV může být navržený krátký řízený
  přechod s nutným obnovením karty; nelze slibovat atomický rollout tří služeb.
- Neprokazatelný starý čas smazání, autorova inkarnace či verze nezískají
  odhadované hodnoty. Nález může zablokovat aktivaci; rozhodnutí o něm se
  nezaměňuje za rutinní technický krok již schváleného balíku.
- Údržba zachová původní job a prostředky. Laboratorní runtime má sdílenou
  zdrojovou dávku 50, z toho při zapnutí 25 pro lifecycle, 32 kroků / měkkých
  10 s. Změřený provozní návrh musí zahrnout i dosavadní indexovou a účtovou
  práci v 60s workeru; tento dokument novou četnost ani vyšší kapacitu nezapíná.

## Jediný odložený ruční blok

Fixture založit až při dostupném klientu a po konkrétním živém souhlasu;
nevytvářet nyní obsah, který do ruční kontroly expiruje. Nepoužívat za člověka
automaticky vytvořené právní potvrzení. Přesná ID a účty určí až pilotní manifest.

| Kontrola | Předpoklad | Stav |
| --- | --- | --- |
| Nová informace a skutečné přijetí verze | schválený DEV web/Rules/server | odloženo, neověřeno |
| Odhlášení a vlastní smazání bez přijetí nové verze | schválený konkrétní dočasný účet a hotová nová cesta | odloženo, neověřeno |
| Archivní detail Shoutu a veřejného vlákna po smazání zdroje | serverem předem ověřený testovací obsah | odloženo, neověřeno |
| Kontaktní dohledání a označení doloženého pokrytí pod Admin/Owner | existující testovací role, skutečný záchyt kontaktu | odloženo, neověřeno |
| Běžná moderace jen přes konkrétní hlášení | stejné podklady, TestModerator | odloženo, neověřeno |
| Herní hudba a viditelné ovládání po návratu kandidáta | zachované publikované herní změny | krátká společná kontrola, neopakovat celou herní diagnostiku |

Před tímto blokem dokončit všechny samostatné automatické kontroly. Již
akceptované feedové, Business a moderační průchody automaticky neopakovat;
přidat jen regresi, kterou nový přechod skutečně zasáhne. Požadované Android/iOS
release a širší závěrečná MVP regrese mají vlastní bránu v
[LAUNCH_READINESS](../../LAUNCH_READINESS.md#completed-work-review).
