# Testovací strategie a regresní matice

`test/live_data_test.dart` ověřuje stabilní sdílení realtime zdrojů, oddělení
účtů/databází, chyby a opětovné načtení, rušení odběrů a zachování živých
interakcí při opakovaných aktualizacích 50 položek. Modelové počty odběrů
nejsou měřením účtovaných čtení; viz [READ_COST_AUDIT.md](READ_COST_AUDIT.md).

Testy v tomto projektu jsou současně bezpečnostní síť a spustitelná technická
specifikace. Nová implementace není ekvivalentní ShoutOutu, dokud neprojde
automatickými vrstvami i hlavními ručními scénáři níže.

<a id="ci-reliability"></a>

## Spolehlivost CI – 30. října 2026

Schválená změna ve větvi `feature/ci-reliability` zachovává všechny dosavadní
testovací příkazy a vydávací podmínky. Node 22.23.4 určuje `.nvmrc`, Firebase
CLI 15.31.0 je lokální přesná závislost tools s lockfilem, shodná pro CI i
`npm run test:rules`. Přibyly npm cache pro oba lockfily, cache emulatorových
binárek, limity kroků a upload diagnostiky při selhání/zrušení. Provedení a
umístění artifactu popisuje [runbook](SETUP_AND_OPERATIONS.md#automatické-kontroly).
Úspěch konkrétní verze musí dokládat její dokončený GitHub Actions běh;
samotná konfigurace nedokazuje cache hit ani provedený upload při chybě.
Lokálně prošel actionlint 1.7.12, kontrola diffu, Functions lint, 41 unit testů
(58 integračních bez emulatoru správně přeskočeno) a 20 tools testů pod
Node 22.23.4; CLI výpis potvrzuje projektovou instalaci 15.31.0.
Úplné [CI 41136220552](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41136220552)
pro `48247fea2cf557731fef1b9fb6c9841f4a51e2dc` prošlo za 3 min 42 s
(22:09:40–22:13:22 UTC): Flutter formát/analýza/testy, 20 tools, 41 unit,
123 emulatorových testů a debug build. Log potvrzuje Node 22.23.4 a CLI 15.31.0.
První běh uložil npm i emulator cache; opakovaný průchod ověřuje její obnovení.
Upload při selhání nebyl lokálně simulovaný. Audit Functions má 0 nálezů;
tools včetně CLI hlásí 21 nálezů v tranzitivních vývojových závislostech
(9 moderate, 12 high), jejich plošná aktualizace není součástí tohoto kroku.

Výchozí debug průchod `41100166067`, attempt 4, job `124324799559` pro přesný
zdroj `c3ad17dafd916915c0af7e01e935fb61466ec7c7` skončil `success`:
21:33:43–21:38:02 UTC, tedy 4 min 19 s. Emulatorový krok trval 89 s, build
49 s; npm/CLI instalace dohromady přibližně 45 s. Flutter cache již fungovala.
Pokus 2 selhal při stahování `cloud-firestore-emulator-v1.21.0.jar` před testy;
bez uloženého podrobného logu nelze určit příčinu stažení. Cache primárně
omezuje opakovanou závislost na tomto downloadu. Souběžné transakční testy
(jednotlivě přibližně 3–7 s) zůstávají beze změny. Zrychlení nové konfigurace
je nutné měřit zvlášť pro studenou a naplněnou cache.

## První kompatibilní serverová vrstva retence 30. října 2026

Navazující klient `timed_operation_gateway_test.dart` pokrývá ztracenou odpověď
a změnu Auth času při retry, opakování i po potvrzení, současné získávání času,
přepnutí účtu během await, změnu/mutaci payloadu, pořadí JSON klíčů, prošlý
nejistý pokus bez nového klíče a oddělení účtů/operací. Šest scénářů prošlo.
Dva `operation_text_test.dart` ověřují recovery v sedmi jazycích a zachování
ostatních chyb. Všech osm klientských cest je napojených; pro tři publikace
přibyl test očekávané identity před DB přístupem. Celkem 41 unit a 123
emulatorových testů a všech 202 Flutter testů prošlo, analýza/formát jsou čisté.
Release build dev i kontrola manifestu prošly. Nový zdroj zatím není živě nasazený.

Klientský commit `c3ad17dafd916915c0af7e01e935fb61466ec7c7`, run `41100166067`:
dokončený log prvního jobu `124215878506` dokládá 202 Flutter, 41 unit, 123
emulatorových a 20 tools testů, čistou analýzu a build; skončil v 17:39:49 UTC.
Metadata runu/checku/suite ale zůstala `in_progress` bez výsledku a prázdných
kroků, jobs API vracelo 502/504 a rozhraní také načítalo. Příkaz cancel byl
odmítnutý, protože backend považoval běh za dokončený. Re-run stejného commitu
byl přijat; attempt 2 následně selhal při stahování emulatoru a attempt 4
jednoznačně prošel (viz výše). Lokální log prvního pokusu je v ignorovaném
`build/timed-operation-ci-job-attempt1.log`. Příčina rozporu není potvrzená;
žádný rollout neproběhl. Samotný pozitivní log nenahrazuje požadovaný
jednoznačný konečný stav CI, který už čtvrtý pokus doložil.

První CI serverové vrstvy `41097603906` (`aeeaec8`) selhalo v dosavadním
souběžném testu hlášení, protože z 3 stejných žádostí uspěly 2. Lokální běhy
prošly. Test dostal výpis kódu/zprávy odmítnutých pokusů, jeho přísné očekávání
se neměnilo; `89247e9` prošel CI `41098701651`. Příčina prvního selhání není
potvrzená a nesmí být zaměněná za ověřenou opravu produkčního chování.

Pět unit testů `operation_retention.test.js` pokrývá přesnou sedmidenní
hranici, pozdější první provedení, opakování před/po deadline i po fyzickém
úklidu, budoucí/poškozené klíče a neplatná či prodloužená serverová metadata.
Výslovně rozlišují kompatibilní legacy režim od jeho budoucího ukončení.
Čtyři emulatorové testy `operation_retention.integration.test.js` ověřují
odmítnutí prošlého nového klíče všemi osmi operacemi bez obsahového/rate/receipt
zápisu; skutečné uložení, smazání receipt a starý retry bez druhého přepnutí;
deadline i před fyzickým úklidem; a prioritu současné způsobilosti účtu/banů.

Functions lint, všech 40 unit a 123 emulatorových testů (65 Rules + 58 serverových)
prošlo. Původních 119 scénářů prošlo beze změny očekávání; legacy klient zůstává
kompatibilní. Příprava obsahového artefaktu zahrnuje nový modul a lokální import
exportu ověřil region/limity a odmítnutí bez Auth/App Check. Flutter zdroje se
v tomto kroku nemění. CI, nasazení této vrstvy a nové živé klíče ještě čekají;
úklid receipt není touto změnou zapnutý.

## Lokální příprava mazání komentářů 30. října 2026

`functions/delete_comment.test.js` ověřuje striktní payload bez klientské
identity autora či čítače, Auth/App Check, ověřený e-mail a očekávaný účet,
poškozené rate dokumenty a přesné hranice 1 s / 120 za hodinu. Osm scénářů v
`delete_comment.integration.test.js` provádí skutečné transakce nad emulátorem:
autor, současné retry, soupeřící klíče/účty, cizí komentář i vlastník parentu,
Business, důvěryhodné role 3–5 a legacy moderátor, odebrání role před replay,
ban či nedokončený účet, chybějící cíle a vadné čítače bez částečného zápisu,
neaktivní parent, clamp na 0, tvorbová restrikce a sdílený dosavadní delete bucket.
Ověřují zachování ostatních čítačů a navazujících dokumentů; historický replay
nesmí měnit novější parent stav ani spotřebovat další limit.

`test/comment_deletion_gateway_test.dart` ověřuje neměnný klíč při nejasném
výsledku, sloučení současných kliknutí, oddělení targetů, nový pokus po
definitivním odmítnutí, přepnutí/odhlášení účtu a samostatnou konfiguraci.
Klíč přežívá zánik dlaždice díky session helperu, ne obnovení stránky.
Klient nedostává čítač z callable; detail odebírá živý parent i při samostatně
aktivovaném `serverCommentDeletion`. Chyba serveru nespouští přímý fallback.

Lokálně prošlo 194 Flutter testů, čistá analýza a formát 96 souborů, Functions
lint a 35 unit testů, 20 testů nástrojů a 119 emulatorových testů (65 Rules +
54 serverových), včetně osmi nových. Po odstranění dvou zbytečných čtení rolí
při mazání vlastního komentáře prošlo znovu všech osm cílených transakčních
testů a tři unit testy. U tohoto cíleného běhu Firebase CLI po úspěšném scriptu
ohlásilo timeout při ukončování emulátoru; předchozí plný běh skončil kódem 0.
Release build dev a kontrola manifestu/otisků pro `shoutout-dev-46c81` prošly.
Lokální import připraveného obsahového artefaktu ověřil export, region,
provozní limity a odmítnutí bez Auth/App Check. Nejde o živý HTTP test.
CI `41090758502` pro `34f7cad` prošlo. Výslovný souhlas z 30. října pokrývá
samostatnou Function i následnou otestovanou aktivaci a vývojové živé testy
s úklidem. Function je nasazená (`deletecomment-00001-zuc`); API potvrdilo
limity i živé HTTP odmítnutí bez App Check 401. Připravená aktivace prošla
19 cílenými Flutter a 20 tools testy. Aktivační commit
`fcbc23d58bfd94498131a126059fe58b645c79a4` prošel CI `41091651584`.
Release build, manifest a shoda HTML/JS/konfigurace na nasazeném Hostingu
`8d7e3f3fed920529` prošly. Předchozí Hosting verze je `884138efa765d64a`.

Živé mazání zatím nebylo provedeno. Po reloadu původní ručně ověřené karty
`722302950` zůstalo rozhraní na načítání (5 prázdných Flutter semantics uzlů,
centrální prvek velikosti spinneru); screenshot API jednou vypršelo. Zachycená
konzole obsahovala starší App Check 401 a Firestore transport warnings před
nasazením, ne důkaz nové chyby endpointu. Vlastník je požádán o ruční Ctrl+R
a potvrzení TestModerator. Ochrany zůstaly zapnuté.
Samostatná schválená fixture „MVP mazani 30.10.“ má 3 dosud zachované komentáře
a 1 otevřený report. `build/comment-delete-live-state.json` a
`build/comment_delete_live.cjs` v ignorované složce zachovávají baseline a
podmíněné ověření/úklid. Běžný, Business a moderátorský průchod ani úklid
nesmějí být označené za dokončené bez navazujících důkazů.

Později 30. října se moderátorská karta načetla. Schválený pokus „Skrýt obsah
bez postihu“ na výhradně testovacím komentáři vrátil „Rozhodnutí se nepodařilo
uložit“. Log požadavku z `2026-10-30T16:53:41Z` má HTTP 401; strukturované
ověření potvrzuje Auth VALID / App Check MISSING. Další dva požadavky v
16:58 UTC mají stejný stav ověření. Všechny 3 komentáře a parent čítač 3
zůstaly zachované. Vlastník je požádán o ruční uložení bez sankce.
App Check API přijímá požadavky (prázdný token správně vrací 400), klíč je typu
SCORE s povolenými vývojovými doménami a `minValidScore: 0.5`; běžné JS adresy
vracejí 200. To neprokazuje úspěšnou attestation v konkrétní relaci. Nic z
nastavení nebylo změněné. Jedno čtení Logging API vrátilo 429, pozdější prošlo.

Lokální `build/receipt_expiry_probe.mjs` nad izolovaným emulátorem prokázal
riziko prostého úklidu receipt: první uložení vrátí `{saved:true,count:1}`,
po smazání jeho receipt stejný požadavek vrátí `{saved:false,count:0}`.
Skript i emulátor skončily kódem 0, externí data nebyla dotčená. Potvrzuje to
potřebu odmítnout prošlé požadavky před zavedením úklidu; nejde o schválenou
implementaci retence. [Návrh a otevřené rozhodnutí](DATA_MODEL.md#retence-potvrzení-operací--ověřený-problém-a-další-návrh).

Živý průchod mazání je následně dokončený. Po zavření původní aplikace a
novém otevření vlastníkem (`722303372`) TestModerator uložil odstranění bez
postihu. REST ověření doložilo smazaný cíl, uzavřený report, právě jeden receipt,
správný actor/author a nezměněné ostatní parent fields; počet 3 → 2.
Ve stejné ručně ověřené kartě automatizovaně prošlo vlastní mazání TestBusiness
(2 → 1) i Bright_Otter_182 (1 → 0), vždy živě v otevřeném detailu bez reloadu.
Business u cizího komentáře neměl ovládání mazání; serverové odmítnutí cizího
autora pokrývá emulatorový test, nikoli živý pokus o podvržené volání.
HTTP log má úspěchy 200 v `17:02:17`, `17:05:57`, `17:07:39` UTC.
Každý ze tří cílů má právě jeden receipt a správný delete rate event.

Podmíněný úklid `17:08:02Z` ověřil nulové komentáře a nezměněný parent, poté
atomicky označil výhradně dočasný parent `deleted` a odstranil vyřešený
testovací report. Tři receipt a skutečné rate eventy ponechal zachované.
Ignorované důkazy: `comment-delete-live-state.json`, `comment-delete-http-proof.json`
a snímky `comment-delete-moderation-proof.jpg`, `comment-delete-business-proof.jpg`,
`comment-delete-personal-proof.jpg` v `build/`. Úplné zavření a otevření stránky
pomohlo této relaci; úplná příčina původní App Check chyby zůstává neurčená.
Vlastník také schválil 7denní okno opakování; 60denní retence účtu se nemění.

## Lokální příprava obsahových hlášení 29. října 2026

`functions/create_content_report.test.js` ověřuje pouze tři povolené druhy
cílů, odmítnutí podvržené identity, soukromého snapshotu, stavu, času a priority,
Unicode délku důvodu, Auth/App Check, očekávaný účet a hranice společného limitu
20/den s odstupem jedné minuty. Sedm scénářů v
`create_content_report.integration.test.js` ověřuje všechna tři stávající
schémata a ID, důvěryhodný soukromý snapshot jen pro příjemce, zákaz vlastních
hlášení a clearance, neexistující cíle, nezměněné čítače, souběh stejných i různých
klíčů, nezávislé reportéry, cooldown a sdílení report/bug-report bucketu, denní
reset a neplatné účty či poškozená data bez částečných zápisů. Replay po moderaci
nezmění uzavřený případ ani limit; replay po banu je odmítnutý. Receipt nekopíruje
soukromý text ani důvod hlášení. Testy běží jen v projektu `shoutout-rules-test`
s přesným lokálním emulator hostem; bez něj jsou integrační testy přeskočené.

`test/report_gateway_test.dart` pokrývá neměnný retry, změnu důvodu, rozlišení
cílů a účtů, sloučení rychlých odeslání, chybu sdílenou oběma volajícími a změnu
účtu/odhlášení. Klient odešle pouze cíl, důvod, očekávaný účet a klíč; nemůže dodat
autora nebo soukromý snapshot. Konfigurace v Dartu i Node testuje výchozí vypnutí,
booleany včetně odmítnutí explicitního null a samostatnou podmínku App Check.

Prošlo 189 Flutter testů, 32 Functions unit testů, lint Functions a 19 testů
vývojových nástrojů. Celá emulatorová sada prošla 111/111 (65 Rules + 46 serverových).
Prošly také analýza, formát a release build vývojového webu. Po sjednocení
validace typu přepínače byly cílené konfigurační testy i analýza/build opakované
úspěšně; šlo pouze o lokální přípravu, nikoli nasazení.
Lokální import callable ověřil region, provozní limity a odmítnutí chybějící
identity či App Check přes handler; autorizovaný report tok a moderační UI
zatím živě ověřené nejsou. Artefakt zahrnuje `create_content_report.js` a syntaxe
prošla. CI `40921153845` pro `79082d8` prošlo. Po souhlasu byla nasazená jediná
nová Function ve vývoji, revize `createcontentreport-00001-yas`; API potvrdilo
limity a HTTP požadavek bez App Check byl odmítnut 401. Aktivace
`be5a88f58cbf88870ac5f90a81f088660eebbdaa` prošla CI `40922593743` a je nasazená na
dev Hostingu jako `884138efa765d64a`, release `1793295581345000`, čas UTC
`2026-10-29T17:39:41.345Z`. Otisky HTML, JS i konfigurace souhlasí s lokálním
release buildem. Produkční konfigurace přepínač nezapíná. Kontroly konfigurace
po aktivaci prošly (14 Dart, 19 nástrojových).
Hlášení účtů a technických chyb zůstávají na současné cestě. Před nasazením
vyžadovat CI konkrétního commitu; souhlas s tímto vývojovým rolloutem, případy
v moderační frontě a úklidem vlastník výslovně udělil 29. října.

TestBusiness přes aplikaci vytvořil dočasný „MVP hlaseni 29.10.“; Bright_Otter_182
přidal „MVP report comment“ a zprávu „MVP report private“ pro TestBusiness.
Databáze potvrdila kanonické účastníky. Během přerušení Shout vypršel, ale
zůstal dostupný přes Mé shouty → Komentáře. První testovací hlášení 20:27 UTC
skončilo 401 a nevytvořilo report ani receipt. Log serveru potvrdil Auth VALID,
App Check MISSING; prohlížeč měl starší chyby reCAPTCHA. Vlastník byl požádán
o ruční Ctrl+R a stejné testovací hlášení. Příčina potíží reCAPTCHA není uzavřená,
ochrana se nevypínala. Ruční hlášení 20:38 UTC potom prošlo 200; databáze
potvrdila kanonický report, receipt, společný rate event, count 1 a nezměněný
parent. Původní automatická karta i další pokus v ní vrátily 401. Vlastník použil
jinou kartu; po převzetí právě této ručně ověřené relace prošel test duplicity
409 ve 20:41 UTC. Report, receipt i rate dokument zůstaly přesně stejné.
Příčinu chyb App Check v původní kartě to samo o sobě nevysvětluje; nezaměňovat
odmítnutí bez tokenu za ověření aplikačního limitu nebo duplicity.
Po ručním přihlášení TestBusiness prošlo hlášení komentáře 21:04 UTC (200,
kanonický report/receipt, count 1). Hlášení přijaté soukromé odpovědi před minutou
vrátilo 429 v 21:05 UTC; report ani receipt nevznikly a rate dokument zůstal
přesně stejný. Opakování v 21:06 UTC prošlo 200, count 2, `priority: high`,
autor i text odpovídají původní zprávě. Receipt neobsahuje důvod ani soukromý
text. Všechna hlášení zachovala celý parent dokument beze změny.
Lokální údaje TestModerator byly odmítnuté z nepotvrzené příčiny; vlastník se
přihlásil ručně. Moderační fronta zobrazila všechny 3 případy, každý 1× nahlášený.
Všechny detaily byly otevřené bez výběru rozhodnutí nebo uložení postihu.
Shout a komentář zobrazily správný obsah/autora, soukromý report správný text
a UID autora z důvěryhodného snapshotu. Stávající `_ReportDetailDialog` u
soukromého snapshotu nemá přezdívku, proto ukazuje „Neznámý (UID)“ a obecný
titulek Detail Shoutu; všechny testovací cíle mají „Region není doplněný“.
Jde o dosavadní UI/datová omezení, nikoli opravu provedenou tímto rolloutem
(soubor moderation.dart se nezměnil). Návazné geografické a moderační milníky
zůstávají otevřené. Nevykazovat nové hlášení jako vyřešení těchto omezení.

Úklid ověřil shodu dokumentů, jejich verze a absenci nesouvisejících interakcí.
Jedním atomickým commitem odstranil 7 testovacích dokumentů (3 reporty,
komentář, soukromá odpověď a 2 notifikace) a dočasný Shout označil `deleted`
s commentsCount 0. API potvrdilo odstranění všech 7 dokumentů a zachování
3 report receipt. Fronta se bez obnovení změnila na „Žádná otevřená hlášení“.
Nebyl uložen postih, rozhodnutí ani změna role; produkce, main a Rules zůstaly
beze změny. Toto vývojové ověření je dokončené; obecná serverová brána zatím ne.

## Lokální příprava serverových reakcí 26. října 2026

Lokální příprava serverových reakcí na Shouty (26. října):
`test/reaction_gateway_test.dart` pokrývá nejasný retry se stejným klíčem,
nový klíč po úspěchu nebo definitivním odmítnutí, pořadí při změně palce,
sloučení souběžných kliknutí, nezávislé cíle a účty a změnu účtu před retry
i během něj. Functions test kontroluje očekávaný účet před přístupem k DB;
emulátor prověřuje úspěšnou akci s tímto polem. Konfigurační testy Dart i Node
ověřují výchozí vypnutí, typ přepínače a povinný App Check.
Schválený vývojový rollout klienta `eea077a` prošel CI `40405135293` a byl
nasazen jako Hosting verze `a03706f90b97706c`; otisky tří hlavních souborů
odpovídají release buildu. Function `toggleshoutreaction-00001-lek` je aktivní
se schválenými limity. Požadavek bez App Check vrací 401. Automatická relace
nejprve hlásila `appCheck/recaptcha-error`; první pokus nevytvořil receipt.
Po ručním ověření vlastníkem prošlo přidání, změna i odebrání běžným účtem
na uchovaném Test Shoutu a Business účtem na novém dočasném Shoutu. Šest
receipt, serverové čítače a rate eventy odpovídají šesti akcím. Realtime stav
byl ověřen v seznamu i otevřeném detailu; vlastní reakce neoznámila autora
sobě, Business reakce vytvořily dvě kanonická oznámení autorovi. Obě reakce
jsou odstraněné, čítače na výchozí nule, dvě čistě testovací notifikace byly
odstraněné a dočasný Shout je `deleted`. Původní Test Shout byl zachovaný,
receipt se nemažou (retence je otevřená). Reálný výpadek s nejasným potvrzením
ani živý souběh nebyly simulované; ty pokrývají automatické testy.
HTTP odpověď obsahuje historické čítače a klient ji musí ignorovat.
Lokální výsledek úseku: 167 Flutter testů, čistá analýza a formát, Functions
lint a 24 unit testů, 90 emulatorových testů (65 Rules + 25 serverových),
10 testů webových nástrojů a úspěšný vývojový release build webu.

## Lokální serverové reakce na komentáře 26. října 2026

`functions/toggle_comment_reaction.test.js` ověřuje striktní vstup a kontrolu
identity před přístupem k databázi. Sedm scénářů v
`functions/toggle_comment_reaction.integration.test.js` ověřuje přidání,
změnu a odebrání, zachování textu i rodičovských čítačů, kanonické oznámení
autorovi komentáře, souběh a idempotenci, odlišné receipt namespace při
sdíleném limitu s reakcemi na Shout, preference, vlastní reakce, poškozená
data a nedostupné cíle bez částečných zápisů. Replay neobchází ban a vrací
historický snapshot, který si klient nesmí promítnout zpět do UI. Uchované
neaktivní Shouty a omezení tvorby obsahu zachovávají dosavadní interakční politiku.
Lokálně prošel lint, 26 Functions unit testů a 97 emulatorových testů
(65 Rules + 32 serverových), příprava artefaktu a kontrola syntaxe.
Navazující klient používá sdílený `ReactionGateway` s klíčem UID/Shout/komentář.
Testy navíc ověřují izolaci různých komentářů a Shoutu, souběžné kliknutí
a klasifikaci skutečných `FirebaseFunctionsException`: transportní chyby
drží klíč, definitivní odmítnutí dovolí nový pokus. Celkem prošlo 171 Flutter
testů, čistá analýza, formát, 17 testů vývojových nástrojů a vývojový release
build webu. CI serverové části
`40407708443` i klienta `40408691708` prošla. Nová Function je po souhlasu
ve vývoji `ACTIVE`, revize `togglecommentreaction-00001-dit`, se schválenými
limity. `serverCommentReactions` má výchozí `false`; dev konfigurace zapíná
schválenou aktivaci, produkční nikoli. CI aktivace `40409557055` prošlo;
klient `45a5d02` byl nasazen jako Hosting verze `3fc2f80232d34ff3`, otisky tří
hlavních souborů odpovídají release buildu. Testovací komentář vznikl přes
`createComment` pod dočasným Business Shoutem. Autorský i cizí cyklus nahoru
→ dolů → odebrání prošel kontrolou šesti receipt, limitů, časů, čítačů a
zachování textu. Vlastní reakce neoznámily autora sobě; cizí vytvořily dvě
kanonická oznámení s cílem komentáře. Úklid odstranil komentář a dvě čistě
testovací notifikace, rodiče označil `deleted` a zachoval šest receipt.

Externí odstranění komentáře odhalilo rozdíl mezi hlavičkou Komentáře (0)
a starou jedničkou u ikony na kartě. `test/live_shout_state_test.dart`
ověřuje společný realtime zdroj čítačů včetně externího 0 → 1 → 0, počty
73 → 72 nezávisle na limitu zobrazených komentářů, nezávislou vlastní reakci
a ukončení obou odběrů. Oprava nepřičítá lokální jedničku ani neaplikuje starší
výsledek mazání, pokud je zapnuté live zobrazení. Prošlo 173 Flutter testů,
čistá analýza, formát, release build a CI `40411478509`. Oprava `987398f`
byla nasazená na vývojový site jako verze `a6756b787e4655de`; hlavní otisky
souhlasí s buildem. Na novém dočasném Shoutu byl živě ověřen začátek 0,
serverové vytvoření jediného komentáře a ikona i hlavička 1, následně externí
atomické smazání komentáře a dekrement parentu na 0. Bez návratu nebo obnovy
stránky se oba počty změnily na 0. Nedošlo k dvojímu lokálnímu přičtení.
Dočasný Shout byl poté smazaný přes UI a databáze potvrdila `deleted`, nulový
čítač, nepřítomnost komentáře a zachování obou create receipt. Produkce,
`main`, Rules ani Functions se při této opravě neměnily.

## Lokální klient ukládání Shoutů 29. října 2026

`test/save_gateway_test.dart` pokrývá ztracené potvrzení se stejným neměnným
klíčem, nový klíč po potvrzení nebo definitivním odmítnutí, transportní chyby,
sloučení rychlých kliknutí včetně chyby sdílené oběma volajícími, nezávislé cíle,
změnu účtu a odhlášení. `test/live_shout_state_test.dart` navíc ověřuje samostatné
změny vlastní záložky a celkového počtu od dalších účtů a ukončení všech tří
odběrů. Detail používá tyto live hodnoty, nikoli historický výsledek callable.
Testy konfigurace v Dartu i Node ověřují výchozí vypnutí `serverShoutSaves`,
boolean typ a nezávislou podmínku App Check.

Prošlo 181 Flutter testů, čistá analýza a formát, 18 testů vývojových nástrojů,
Functions lint a 29 unit testů, 104 emulatorových testů (65 Rules + 39 serverových)
a release build webu pro dev. Příprava artefaktu zahrnuje `toggle_shout_save.js`;
syntaxe prošla. Lokální import callable exportu ověřil region, limity a odmítnutí
Auth/App Check přes handler bez databázového zápisu. Lokální prostředí použilo
Node 24.13.1; CI používá podporovaný Node 22.
CI `40914821162` pro `5fceccb` prošlo. Po souhlasu byla nasazená pouze Function
do vývoje, revize `toggleshoutsave-00001-fal`. Její limity byly ověřené přes API
a skutečný HTTP požadavek bez App Check byl odmítnut 401. Aktivační commit
`02b8b2846c6b4488188e1f58f84fb06db3320e52` prošel CI `40916381788` a byl nasazený
jako Hosting verze `8abd91f97aada32f`, release `1793293260043000`. Otisky tří
hlavních souborů souhlasí; přepínač je zapnutý pouze ve vývojové konfiguraci.
Dosavadní provozní revize ostatních Functions se nezměnily.

Běžný účet uložil vlastní uchovaný Test Shout v seznamu (0 → 1), poté jej odebral
v otevřeném detailu bez obnovení; seznam i databáze potvrdily návrat na 0.
TestBusiness uložil cizí dočasný aktivní Shout, ověřil jeho přítomnost ve
Sledované → Shouty a odebral jej přímo v detailu. Tlačítko se živě přepnulo zpět
na Uložit a položka zmizela ze seznamu uložených. Čtyři nové receipt odpovídají
čtyřem akcím, výsledkům, časům záložek a `lastAt`/`lastEventId` ve společném
interaction bucketu; ostatní pole Shoutů se nezměnila. Živý souběh, nejasný retry
a vyčerpání hodinového limitu nebyly simulované; pokrývají je automatické testy.
Lokálně evidované Business přihlášení bylo odmítnuté z nepotvrzené příčiny,
vlastník se přihlásil ručně; žádné heslo ani ochrana se neměnily.
Úklid ověřil nepřítomnost obou záložek a nulové čítače, původní Test Shout
zachoval a dočasný „MVP ukladani 29.10.“ označil `deleted` s kontrolou aktuální
verze dokumentu a prázdných podkolekcí. Čtyři receipt zůstaly zachované.
Produkce, `main` a Rules se nezměnily.

## Lokální serverová logika ukládání Shoutů

`functions/toggle_shout_save.test.js` ověřuje striktní vstup, Auth/App Check,
ověřený e-mail a očekávaný účet před přístupem k databázi, přesné přechody
uložit/odebrat a neplatné čítače. Sedm scénářů v
`functions/toggle_shout_save.integration.test.js` ověřuje atomický celý cyklus,
historický replay bez dalšího přepnutí nebo čerpání limitu, ban při replay,
konflikt klíče s jiným cílem, souběžná opakování, odlišné aktéry, společné
limity s reakcemi při nezávislém namespace receipt, chybná data a účet bez
částečných zápisů, reset hodinového limitu a zachování interakční politiky.
Lokálně prošel Functions lint, 29 unit testů a 104 emulatorových testů
(65 Rules + 39 serverových). Nové scénáře jsou součástí CI přes `test:rules`.
Testy používají pouze lokální projekt `shoutout-rules-test`. Klientské,
callable a živé ověření nejsou součástí tohoto omezeného úseku.

## Živý vývojový test serverového publikování 25. října 2026

Hosting `shoutout-dev-46c81`, commit
`36f42e241ce9d6d43175db076a3c726d0c306b0b`, verze `d9c867abfdb9e20e`:
App Check diagnostika získala token a nepřihlášený callable požadavek správně
odmítla Auth vrstva. Přihlášený Business účet následně v běžné aplikaci
vytvořil jediný Shout s ověřenou pobočkou. Read-only kontrola Firestore
potvrdila serverové ID, kanonickou identitu i polohu pobočky, nulové čítače,
geohash a odpovídající receipt i rate limit se shodnými timestampy.
Odstranění přes aplikaci bylo ověřené stavem `deleted`; žádný obsah nebyl
vytvořen administrátorským zápisem. Navazující uživatelský test osobního Shoutu
„Test Shout“ také prošel kontrolou serverového ID, kanonického autora,
zaokrouhlené veřejné polohy, geohashe, nulových čítačů a atomického receipt/limitu.
Přechodný problém při přepisování hesla po odhlášení se nepodařilo potvrdit
jako chybu kódu; uživatel následně pokračoval v přihlášení bez změny aplikace.
Živý test souběžných retry a ostatních obsahových operací tento průchod nepokrývá.
Souběh a idempotenci pokrývají lokální emulatorové testy uvedené níže.

## Automatické vrstvy

`functions/toggle_shout_reaction.test.js` testuje přechody přidat/změnit/odebrat,
odmítnutí podvržených polí a existující limit 120/h s odstupem 1 s. Šest scénářů
v `toggle_shout_reaction.integration.test.js` běží pouze v izolovaném emulatoru
`shoutout-rules-test` na `127.0.0.1:8080`: souběžná retry, starý retry po novější
akci, více aktérů nad jedním Shoutem, společný interaction limit, atomické čítače
a oznámení, preference a poškozená data. Ověřují také zachování současné politiky
pro omezení tvorby obsahu a uchované neaktivní Shouty. Bez emulatoru jsou
integrační testy přeskočené. Prošlo 23 unit testů Functions, lint a všech 90
emulatorových testů (65 Rules + 25 serverových). Klient ani nový callable zatím neexistují;
živé ověření reakcí tímto krokem není prokázané.

`functions/create_private_reply.integration.test.js` přidává osm scénářů pro
všechny tři druhy cílů, kanonické identity (včetně Business pobočky), ověření
účastníků, cizí Shout, souběžná retry, cooldown, preference a slučování
oznámení, neaktivní cíl, poškozená data a blokované účty. Soukromý text nesmí
být v receipt ani v oznámení a veřejný čítač nesmí být změněn. Retry po smazání
výsledku jej neobnovuje. Nový Rules scénář kontroluje čtení serverového formátu
oběma účastníky a zamítnutí třetího účtu i enumerace celé kolekce. Receipt nemůže
číst ani autor zprávy. Lokálně prošlo celkem 84 emulatorových testů, 20 unit
testů Functions, 158 Flutter testů, lint, analyzátor a 9 testů webových nástrojů.
Nová callable je po samostatném souhlasu nasazená pouze ve vývoji jako
`createprivatereply-00001-baw`; klient `9545946` má přepínač ve vývoji zapnutý.
CI implementace `40359475834` a aktivace `40360446321` prošlo.
Živý průchod 26. října prošel dvěma účty pro Shout, komentář i pokračování
přijaté soukromé zprávy v opačném směru. Firestore potvrdil serverová ID,
kanonické identity, účastníky, receipt, limit a správná oznámení bez privátního
textu. Příjemce viděl zprávu i akci odpovědi. Regresní přepnutí ze soukromé na
veřejnou odpověď vytvořilo veřejný komentář a žádnou soukromou kopii textu.
Po ověření se v jediné transakci odstranilo pět testovacích obsahových dokumentů
a čtyři oznámení, jejichž přesný počet událostí, poslední cíl, autor i čas
odpovídaly výhradně fixture. Čtení potvrdilo smazání, zachovaný původní Shout
a nulový čítač; feed následně také ukázal nulu. Receipt se kvůli idempotenci
nemažou. Živý test třetího účtu není provedený; odmítnutí cizího čtení a
enumerace soukromých zpráv je potvrzené emulatorovými Rules testy.

`functions/create_comment.integration.test.js` používá stejný izolovaný
emulator jako Shout testy. Sedm scénářů pokrývá souběžná retry, cooldown,
atomické čítače/limity/oznámení, rodiče odpovědi, preference a slučování
oznámení, vlastní obsah, neaktivní Shout, poškozená data a blokované účty.
Retry po smazání výsledku jej znovu nevytvoří. Sada běží v `npm run test:rules`;
bez emulatoru je přeskočená. Celkem prošlo 75 emulatorových testů, 18 Functions
unit testů, 156 Flutter testů, lint, analyzátor a vývojový release build.
Následné vývojové nasazení `createComment` (`createcomment-00001-lep`) a
Hostingu commitu `9d85327` prošlo živým testem komentáře a veřejné odpovědi.
Firestore potvrdil kanonického autora, rodiče odpovědi, nulové čítače reakcí,
receipt a přesné zvýšení limitu i počtu komentářů o dvě. Po odstranění obou
testovacích komentářů je databázový čítač na výchozí hodnotě. CI implementace
`40230321972` a aktivace `40230718884` prošlo. Živý test proběhl pod jedním
účtem na vlastním Shoutu; příjemce oznámení mezi účty ověřuje emulator.

Regresní scénář opravy detailu: vytvořit testovací komentář, ve stejném
otevřeném detailu jej odstranit a bez opuštění stránky ověřit shodu čísla na
kartě se seznamem a Firestore. Smazání předává potvrzený čítač z transakce,
nikoli počet položek omezeného dotazu. Ověřit i selhání zápisu bez falešného
lokálního snížení a bezpečný callback po realtime odstranění widgetu.
Oprava `4a1a7a0` prošla 156 Flutter testy, analyzátorem, release buildem a CI
`40355266790`; vývojové nasazení odpovídá lokálním otiskům. Automatizované
opakování živého scénáře 26. října se nedokončilo a nevytvořilo komentář;
start nové relace zaznamenal `appCheck/recaptcha-error`. Vlastník následně
ručně potvrdil přechod čísla na kartě 0 → 1 → 0 ve stejném otevřeném detailu
bez návratu na feed. Oprava UI je tedy živě ověřená uživatelským průchodem.

`test/legal_acceptance_state_test.dart` ověřuje rozdíl mezi chybějící cache
a serverem potvrzeným chybějícím právním souhlasem, čekání na potvrzení zápisu,
známý souhlas v offline režimu a chyby streamu. Widgetový scénář kontroluje,
že při pomalém spojení neproblikne formulář souhlasu. Metadata listenery mají
oddělený klíč od běžných dokumentových streamů a nadále se sdílí.

Celokořenový analyzátor ignoruje generované `build/**`; projektové `lib/` a
`test/` zůstávají kontrolované. Tím se vyloučí i Dart ukázky staženého Firebase
CLI, které nejsou zdrojem aplikace.

`functions/create_shout.integration.test.js` běží pouze s lokálním emulator
hostem `127.0.0.1:8080` a pevným izolovaným projektem `shoutout-rules-test`.
Ověřuje souběžnou idempotenci, transakční limity, serverovou identitu/polohu,
Business pobočku a postihy. `npm run test:rules` spouští tuto sadu i Rules
sekvenčně, protože Rules testy mezi scénáři čistí databázi. Před tímto příkazem
je nutné provést `npm ci` také ve `functions/`. Samostatné `npm test` bez
emulatoru tyto čtyři integrační testy přeskočí; přeskočení není důkaz ověření.

| Vrstva | Umístění | Co ověřuje |
|---|---|---|
| Dart unit testy | `test/account_role_test.dart`, `account_ban_test.dart`, `app_theme_test.dart`, `geography_test.dart`, `profile_tile_layout_test.dart`, `shout_test.dart` | Role, aktivitu dočasných a trvalých banů, téma, geohash, veřejné zaokrouhlení, profilové řádky po třech, životní cyklus a řazení Shoutu, avatary a normalizaci nadpisu. |
| Flutter widget testy | `test/widget_test.dart`, `localization_test.dart`, `business_logo_editor_test.dart` | Hlavní UI, zachování filtrů, avatar, datum profilu, onboarding, tematické dialogy Nápovědy, běžnou kartu, spuštění a trvalý lokální rekord Shout Flight, systém, heslo, Storage feature flag, všech sedm jazyků a geometrii i 512px výstup Business loga. |
| Firestore Rules integrační testy | `tools/rules/firestore.rules.test.mjs` | Pozitivní i útočné scénáře registrace, rolí, Business poboček, obsahu, čítačů, limitů, soukromí, oznámení a moderace. |
| Vývojové nástroje | `tools/business_activation.test.mjs`, `moderation_seed.test.mjs`, `web_environment.test.mjs` | Odmítnutí neověřeného nebo odlišného e-mailu, neplatného stavu a pobočky, sestavení atomické Business aktivace a vyloučení staff rolí z autorů závadného seed obsahu; oddělení prostředí, integritu buildu, shodu cíle nasazení, oddělení app a vstupního Hosting site ve společném produkčním projektu, konfiguraci Auth handleru a odmítnutí produkčních credentials třemi staršími vývojovými Admin SDK skripty. |
| Functions unit testy a lint | `functions/index.test.js`, `callable_security.test.js`, `eslint.config.js` | Normalizaci ISO regionu; Auth, App Check, profil, právní souhlas, ban, žádost o smazání a omezení tvorby; fail-closed chování poškozených postihů a použití transakčního readeru. |
| Statická kontrola a build | `dart format`, `flutter analyze`, `node tools/web_environment.mjs build dev --debug` | Konzistenci zdroje, typové/lint chyby a sestavitelnost webu. |

`test/web_environment_test.dart` navíc pokrývá společnou Firebase konfiguraci a
návratovou URL e-mailů, odmítnutí neúplné konfigurace a záměny vývojové a
produkční domény. Tyto testy neprokazují nastavení skutečného produkčního projektu.

CI workflow `.github/workflows/flutter.yml` používá Node.js 22 a spouští Flutter
vrstvu, čisté testy vývojových nástrojů, Rules, Functions lint a unit testy i
web build při každém pushi a pull requestu. Přesné příkazy a závislosti jsou v
`SETUP_AND_OPERATIONS.md`.

Počet testů není cílová metrika. Test přidejte vždy, když opravujete regresi,
měníte Firestore zápis/pravidlo nebo přidáváte větev s uživatelsky důležitým
výsledkem. Neduplicujte stejnou podmínku v několika widget testech, pokud ji lze
levněji a přesněji pokrýt unit testem.

## Povinné ruční scénáře

### Účet a registrace

- běžná registrace, doručení ověřovacího e-mailu, návrat do aplikace a vytvoření
  právního souhlasu, přezdívky a avataru;
- Business registrace zůstane před potvrzením na ověření e-mailu a po potvrzení
  na stavu žádosti; do profilového onboardingu pokračuje až s rolí 2 a aktivním
  Business profilem;
- kontrolní spuštění Business aktivace nic nezapíše; potvrzené spuštění vytvoří
  roli 2, profil a první pobočku společně a druhé spuštění pouze oznámí, že je
  žádost již aktivní;
- chybné/krátké heslo, rozdílné potvrzení, obsazená přezdívka a opětovné použití
  existujícího e-mailu;
- reset hesla na existujícím i neexistujícím e-mailu bez úniku existence účtu;
- změna avataru a přezdívky na jednom zařízení a realtime změna ve starších
  Shoutech/komentářích na druhém zařízení;
- odhlášení, nové přihlášení a čekající smazání účtu.

### Feed a Shout

- povolená, zamítnutá a nedostupná poloha; feed musí fungovat i bez přesné
  vzdálenosti, publikování běžného Shoutu ji vyžaduje;
- poloměr, kategorie a všechna řazení; filtry zůstávají při přepnutí všech čtyř
  karet a resetují se až novou relací aplikace;
- nadpis i text na mobilní klávesnici začnou velkým písmenem; uložený nadpis je
  normalizovaný i při vložení textu;
- limity délky, jedna/dvě kategorie, minimum 15 minut, maximum 24 hodin a hláška
  rate limitu bez zavření či vymazání formuláře;
- like, dislike, odebrání reakce, vlaječka a čítače se shodují ve feedu, detailu,
  Mé Shouty i detailu sledovaného profilu bez znovuotevření obrazovky;
- expirovaný nebo smazaný Shout zmizí z aktivních seznamů a deep link zobrazí
  nedostupný stav.

### Business

- registrace ze zařízení v každém podporovaném jazyce, povinné odlišení sídla a
  první pobočky/provozovny;
- Geoapify návrhy pro českou i zahraniční adresu, diakritika, stabilní šířka
  dialogu a zákaz uložení pouhého ručně napsaného textu;
- přidání, úprava, pozastavení a soft-delete pobočky; po uložení se rozbalený
  editor zavře a změna se objeví bez reloadu;
- Business dlaždice zůstává po přechodu Profil → Shouty → Profil;
- pouze aktivní Business účet vidí v editoru avatara tlačítko vlastního loga;
  nahrání 512px PNG se projeví ve veřejné identitě a nahrazení odstraní starý soubor;
- formulář Shoutu nabízí jen aktivní ověřené pobočky; viditelné jméno autora je
  název vybrané pobočky a poloha odpovídá této pobočce, ne zařízení ani sídlu;
- načtení veřejného Business profilu nesmí přepsat název pobočky názvem firmy;
  realtime se na Business Shoutu aktualizuje avatar, u běžného Shoutu i přezdívka;
- starší Business Shout uložený jako „firma – pobočka“ se zobrazí jen jako
  „pobočka“, zatímco nový název pobočky obsahující pomlčku zůstane beze změny;
- publikování rychle po sobě respektuje 1s cooldown a 500/24 h; Business
  checkboxy se běžnému účtu nezobrazí.
- Business formulář dovolí kombinovat zvýraznění a okénko; bez checkboxů je
  Shout standardní. Okénka do 20 km jsou připnutá, po 6 sekundách rotují,
  reagují na tah do stran a cyklicky se opakují. Bez okénka prostor zmizí.
- delší platnost nabízí po 24 hodinách pouze celé dny 2–7; běžný účet nesmí
  propagaci ani prodloužení zapsat a nepravdivé příznaky pravidla odmítnou.
- Business → Propagace uvádí použité bezplatné funkce bez ceny. Před webovým
  MVP se nesmí zobrazit položka **Tokeny**, nefunkční **Nákupy a faktury** ani
  prázdné metriky dosahu, zobrazení, rozkliknutí a míry prokliku. Ověřit
  mobilní i desktopový web a nápovědu ve všech sedmi jazycích bez slibů
  tokenového nákupu; statistiky se vrátí až s důvěryhodným měřením po zavedení
  monetizace.

### Follow, komunikace a oznámení

- veřejný profil z přezdívky, Follow/unfollow, blokace a hlášení účtu;
- karta Sledované přepíná uložené Shouty a profily; Shout v profilu otevře plný
  detail s komentáři a reakcemi;
- veřejný komentář, odpověď na komentář a soukromá odpověď jsou viditelné jen
  zamýšlenému publiku;
- dva účty/zařízení ověří realtime změny reakcí a avataru;
- každý druh události vytvoří oznámení jen cizímu příjemci a respektuje jeho
  preference;
- více like nebo komentářů stejného typu a cíle zvýší jednu sérii, aktualizuje
  posledního aktéra, vrátí ji nahoru a označí nepřečteně;
- jiné Shouty a jiné komentáře mají vlastní série;
- kliknutí na oznámení otevře správný Shout a relevantní komentář, po expiraci
  zobrazí srozumitelný nedostupný stav.

### Moderace a administrace

- `/admin` odmítne role 1–2 a zobrazí jen sekce povolené rolím 3–6;
- regionální moderátor vidí/potrestá jen obsah v přiděleném ISO rozsahu a nikdy
  uživatele stejné nebo vyšší role;
- warning, omezení tvorby, dočasný/trvalý ban, zrušení postihu, eskalace a
  označení obsahu jako v pořádku zachovají neměnný audit;
- technické logy nevidí moderátor ani senior; administrator/owner při otevření
  vytvoří `technicalLogAccessAudits`;
- ruční náhled polohy role 3–6 mění pouze prohlížené území, ne jejich scope ani
  místo publikovaného Shoutu.

## Zařízení a zobrazení

Před vydáním webového MVP ověřte minimálně:

- Chrome v mobilní šířce a desktopový Chrome alespoň 1920 px široký;
- maximální šířku celé aplikace 840 px, centrování a užší, rozměrově stabilní
  dialogy;
- světlý, tmavý i systémový režim;
- češtinu, angličtinu, němčinu, polštinu, slovenštinu, ukrajinštinu a
  vietnamštinu včetně diakritiky a delších popisků;
- feed watermark a všech 24 avatarů podle `design/README.md`.

Před pozdějším mobilním vydáním navíc ověřte úzký Android telefon v portrait,
otevřenou klávesnici, změnu orientace zakázanou manifestem, rozměry iPhonu,
launcher a splash podle `design/README.md`.

## Testovací data

Automatické Rules testy používají pouze lokální projekt
`shoutout-rules-test`. Seedovací skripty smějí pracovat jen s vývojovým
projektem `shoutout-dev-46c81` a mají pojistku proti produkci. Jejich návod je v
`tools/README.md`.

Konkrétní ruční účty a hesla patří výhradně do ignorované složky `docs/local/`.
Nejsou součástí přenositelné dokumentace ani historie Gitu a před produkcí se
odstraní.
