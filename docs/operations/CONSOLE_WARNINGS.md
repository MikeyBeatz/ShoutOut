# Diagnostika konzole – fonty, CSP a Firestore

17. listopadu 2026. Vlastník pozastavil B2 a schválil lokální reprodukci dvou
varování a následně cílenou fontovou opravu s ověřením a DEV webem po CI.
Diagnostický checkpoint 80d7466 neobsahoval změnu aplikace; schválená oprava
níže mění pouze dva pevné symboly. [Nástroj a spuštění](../../tools/diagnostics/README.md).

## Potvrzené fontové varování

Flutter 3.44.8 v naší lokální i CI konfiguraci. Engine ve font_fallbacks.dart
vypisuje hlášku při nenalezeném Unicode bodu; jeho font_fallback_data.dart nemá
pokrytí U+FE0F. Jde o variation selector pro emoji prezentaci, nikoli české
písmeno. Stejný problém má [otevřené hlášení Flutter #157831](https://github.com/flutter/flutter/issues/157831).
V repozitářových Dart/ARB textech jsme našli U+FE0F právě u dvou kategorií:
Nabídka a Varování! v lib/src/shout_model.dart. To neinventarizuje uživatelský
obsah databáze. Společná funkce shoutCategoryLabel je používá v menu i kartách.

Skutečný samostatný Flutter renderer bez Firebase v čistém headless Chrome:

| Vzorek | Noto varování | Výsledek |
|---|---:|---|
| České názvy bez symbolů | 0 | První frame vykreslen, bez chyby načítání. |
| Aktuální konstanty načtené ze shout_model.dart | 1 | Potvrzuje skutečné současné hodnoty, nikoli jen ruční vzorek. |
| Oba původní symboly s názvy | 1 | Přesná shoda hlášky vlastníka. |
| Samotná Nabídka s U+FE0F | 1 | Stejná hláška. |
| Samotné Varování! s U+FE0F | 1 | Stejná hláška. |
| Stejné symboly/názvy bez U+FE0F | 0 | Text i symboly zůstávají viditelné. |
| Samotný U+FE0F | 1 | Potvrzuje spouštěč bez kategorie či backendu. |

Žádný z těchto sedmi vzorků neměl runtime výjimku nebo chybu síťového načítání.
Vizuálně zkontrolované PNG categories/without-selector mají v této konfiguraci
stejný viditelný výsledek. Není tím garantována stejná prezentace na všech OS.
Přidání velkého fontového balíku tedy není doloženou nutnou opravou.
[Dokumentace fontů a fallbacků](https://api.flutter.dev/flutter/painting/TextStyle/fontFamilyFallback.html).

### Schválený rozsah opravy

Odstranit pouze U+FE0F ze dvou pevných hodnot shoutCategoryEmoji. Zachovat
samotné symboly, názvy kategorií a ostatní emoji. Neprovádět plošnou úpravu
uživatelského textu, hashů, přečtení či uložených dat a nepřidávat závislosti
nebo fontové assety. Ověřit current-categories načtené přímo ze zdrojového
kódu, srovnávací vzorky, existující kategoriové testy a vzhled menu/karty.
Po příslušném CI může následovat pouze DEV web podle pravidel vydání.
Tato oprava pevného UI neřeší obecnou chybu Flutteru při libovolných emoji
v uživatelském textu; tu nesmí skrývat ani měnit uživatelský obsah.

<a id="category-font-fix"></a>

### Provedení a lokální ověření

Na fix/category-font-warning jsou odstraněné pouze dva selektory U+FE0F
z pevných hodnot shoutCategoryEmoji. Aktuální hodnoty jsou znovu načtené
diagnostickým serverem přímo ze zdroje, nejde o ručně opravený vzorek.
Sedm izolovaných rendererových scénářů dokončilo vykreslení bez runtime
výjimky či síťové chyby: current-categories má 0 Noto varování, stejně jako
oba negativní kontrolní vzorky. Čtyři syntetické vzorky s původním selektorem
mají nadále každý 1 varování; sběr hlášek tedy zůstává funkční.
Log build/category-font-fix-browser.log a fonts-proof.json v diagnostickém
výstupu. Existující test/shout_test.dart prošel. Data, názvy, zbývající symboly,
zabezpečení a síťová konfigurace se nemění. Navazující přesné úplné CI,
čistý release a ověření skutečných nasazených souborů dokládá výsledek rolloutu níže.

## CSP report-only

Read-only HTTP kontrola DEV vrací 200 a žádnou Content-Security-Policy ani
Content-Security-Policy-Report-Only hlavičku. V index.html a firebase.json
není uvedené frame-ancestors pravidlo. main.dart používá standardní
ReCaptchaEnterpriseProvider; [Firebase SDK](https://github.com/firebase/firebase-js-sdk/blob/main/packages/app-check/src/recaptcha.ts)
načítá komponentu z google.com. [frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)
je pravidlo vloženého dokumentu, není to frame-src rodičovské aplikace.
V report-only režimu se tato politika nevynucuje.

Izolované render-only načtení reCAPTCHA přes google.com i recaptcha.net
nevyvolalo dané CSP varování. Render nevyžádal token a není důkazem živé
atestace. Pozitivní lokální kontrola se stejnou report-only direktivou
vyvolala jedno varování a zachytila příslušnou response hlavičku; tedy nejde
jen o nefunkční sběr konzole. Test zachycuje také vnořené iframe targety.
Samotný Google homepage kontrolní frame byl odmítnut na úrovni odpovědi,
nevyvolal ale sledované report-only varování; není to App Check chyba.

Čistý start DEV webu bez přihlášení a s blokovanými Firebase backendy také
varování nevyvolal. Není to průchod přihlášené relace ani získání App Check
tokenu. Vlastník následně potvrdil, že po obnovení CSP hláška zmizela i v jeho
relaci. Přesný původ původního varování zůstává nepotvrzený. Neoznačovat ho
za opravený ani za prokázanou chybu našeho CSP/App Check. Změna domény,
provideru či oslabování CSP nemají podklad. Při opakování potřebujeme čas,
sanitizovanou cestu konkrétního rámu a pouze jeho CSP response hlavičku,
bez tokenů, cookies, query parametrů nebo celého HAR.

## Následně hlášené QUIC spojení Firestore

Vlastník po obnovení zaznamenal na Listen/channel
ERR_QUIC_PROTOCOL_ERROR.QUIC_PEER_GOING_AWAY při HTTP 200.
Celou URL se session parametry nepřenášet do veřejné evidence.
QUIC kód označuje ukončování spojení protistranou, ne diagnózu databázových
oprávnění. HTTP 200 sám nepotvrzuje dokončení dlouhého streamu.
[Firebase popisuje automatické obnovení přerušených spojení](https://firebase.google.com/docs/firestore/real-time_queries_at_scale#understand_automatic_retries).
Z jednoho řádku nevíme, zda SDK úspěšně navázalo nové spojení. Případná
opakovaná chyba nebo zastavené aktualizace vyžadují samostatné ověření.
Nevypínat QUIC v prohlížeči a nezapínat v aplikaci force-long-polling bez
prokázané potřeby; v tomto úseku není taková změna schválená ani provedená.

## Evidence a stav

Ignorované lokální podklady: build/console-warning-diagnostics/proof.json,
recaptcha-proof.json, srovnávací PNG a build/console-warning-diagnostics-*.log.
Konečný renderer má také current-categories pro skutečné konstanty, aby bylo
možné ověřit navazující opravu. Sběr nezapisuje Firebase data, nepoužívá Auth
a neovládá uživatelská okna. Omezené experimenty neuzavírají celý vizuální
audit, B2 akceptaci ani celou síťovou regresi. Dosavadní váhy/procenta se nemění.

Konečný místní běh v Chrome/157.0.8103.79 dokončil 12 scénářů: 7 fontových,
2 CSP kontrolní, 2 render-only reCAPTCHA a 1 nepřihlášený DEV start.
Firebase backend požadavky: 0 povolených / 0 pokusů zachycených guardem.
Samostatný debug build cílového font probe, finální flutter analyze (bez nálezů),
formát, Node syntax a kontrola dokumentace/metrik prošly. Starší samostatný
build i původní šestice zůstávají jen dílčími podklady. Pro samotný diagnostický
checkpoint 80d7466 neběželo úplné CI ani rollout; seskupily se s následnou
schválenou aplikační opravou níže. Diagnostické nástroje samy nemění nasazenou aplikaci.

<a id="category-font-dev-rollout"></a>

## Ověřený DEV rollout fontové opravy

Vlastník schválil úpravu dvou pevných symbolů, testy a pouze DEV web po CI.
Zdroj `9e3828dd37bd8ce68713f87cedb956db0a135124` má
[success úplné CI 44178308912](https://github.com/MikeyBeatz/ShoutOut/actions/runs/44178308912),
13 min 51 s: 375 Flutter, 17 + 2 Chrome, 81 tools, 134 Functions unit
(457 integračních skip mimo emulátor), 450 Rules/server, 34 B2 runtime/retention,
116 purge, 15 Storage a formát/analýzu/lint/build. Lokálně navíc prošlo 26
Shout testů a 7 izolovaných fontových scénářů; aktuální kategorie jsou bez
Noto varování a čtyři staré syntetické vzorky nadále varování zachytí.

Čistý release má 68 manifestových souborů; proti předchozí verzi se změnil
jen main.dart.js. Manifest SHA-256:
`ca882666f1bf3593237b4d2fa37adda8b7d738c7657c2703efb82c1bbe6fe75d`.
Před nasazením byla ověřena původní živá verze i kopie celého releasu bc4a6e1
v build/category-font-rollback-bc4a6e1 pro případný návrat se stejnou IndexedDB v3.

Pouze projekt/site shoutout-dev-46c81: Hosting verze **74d0c3756884ac19**,
release **2026-11-17T21:32:45.315Z**. Po nasazení ověřeno nové metadata verze a
bajty index.html/main.dart.js/app-config.json na web.app i firebaseapp.com.
main.dart.js SHA-256:
`a748a2aa1687178dc43f161c93a73ecdf240ec0e6d9473af748fe976358f1ac9`.
Nezměněný app-config SHA-256:
`6ffed0edd82d141b5f3a7cb85aae40ffb18eee78f692f8bc908c56e50afde8a1`.
To ověřuje publikovaný artefakt; nezaměňovat to s živým přihlášeným UI průchodem.

Functions, Rules, Scheduler, Firebase data, Auth a produkce se tímto rolloutem
neměnily. CSP/QUIC nejsou označené za opravené; jejich podklady a nejistoty
zůstávají výše. Oprava pevných kategorií neodstraňuje variation selectors z
uživatelského obsahu a nezaručuje absenci obecné chyby Flutteru pro každý emoji.

Lokální důkazy: build/category-font-release-proof.json,
category-font-hosting-before.json, category-font-hosting-after.json,
category-font-fix-ci.log a category-font-fix-deploy.log.
Vlastník po nasazení potvrdil, že původní Noto hláška zmizela. Nově doložil
jen deprecation upozornění Intl.v8BreakIterator, rozebrané níže. Toto potvrzení
neuzavírá celé B2 ani celkový vizuální audit.
Pro další B2 práci pozor na starší build/b2-rollout-source-guard.mjs: správně
odmítá nové změny po bc4a6e1, nejen funkční změny. Použít čistý checkout
ověřeného B2 zdroje nebo zvlášť doložit shodu jeho modulů; guard neoslabovat
jen kvůli fontové opravě. B2 má následně od 18. listopadu
[uzavřenou živou akceptaci a úklid](../plans/feed/B2_DEV_ROLLOUT.md#b2-acceptance-complete);
úklid použil čistý původní checkout a nezměněný guard.

<a id="intl-break-iterator"></a>

## Intl.v8BreakIterator – následná diagnóza

Vlastník po obnově doložil deprecation hlášku s odkazem na main.dart.js:7653.
Naše lib/web tento symbol nevolají. Nainstalovaný Flutter 3.44.8 jej má v
engine dom.dart:createV8BreakIterator s type=line a text_fragmenter.dart.
Stejná větev je přítomná v nasazeném release main.dart.js. Řádek 7653 je obecné
JS konstruktorové volání, není to určení vlastní aplikační funkce.

[Flutter #189938](https://github.com/flutter/flutter/issues/189938) obsahuje
shodnou hlášku a potvrzení maintainera, že Intl.Segmenter nepokrývá UAX #14
(zalamování řádků), takže nejde o přímou záměnu API. Issue je při ověření
otevřené; jeho konkrétní scope je wimp. Neodvozovat z něj hotovou opravu pro
náš CanvasKit ani bez měření slibovat, že prostý upgrade Flutteru warning odstraní.
V našem SDK vyvolá lehký Chromium CanvasKit injekci client ICU a segmentText,
které vedle Intl.Segmenter používá pro řádky V8 iterator.

Oficiální [konfigurace Flutter loaderu](https://docs.flutter.dev/platform-integration/web/initialization)
podporuje canvasKitVariant auto/full/chromium. Možná cesta je lokálně porovnat
auto s full, která má vlastní ICU; očekávaný přínos a vliv na start, velikost
a zalamování zatím nejsou v této aplikaci změřené. Změna konfigurace rendereru,
SDK ani bootstrapu není součástí předchozí dvouznakové fontové opravy a zatím
nebyla schválená ani provedená. Konzolové hlášky se nepřepisují/nepotlačují.
