# Diagnostika konzole – fonty, CSP a Firestore

17. listopadu 2026. Vlastník pozastavil B2 a schválil lokální reprodukci dvou
varování a přípravu konkrétní opravy. Zatím bez změn aplikace, zabezpečení,
nasazení či živých dat. [Nástroj a spuštění](../../tools/diagnostics/README.md).

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

### Konkrétní návrh opravy, zatím neprovedeno

Odstranit pouze U+FE0F ze dvou pevných hodnot shoutCategoryEmoji. Zachovat
samotné symboly, názvy kategorií a ostatní emoji. Neprovádět plošnou úpravu
uživatelského textu, hashů, přečtení či uložených dat a nepřidávat závislosti
nebo fontové assety. Ověřit current-categories načtené přímo ze zdrojového
kódu, srovnávací vzorky, existující kategoriové testy a vzhled menu/karty.
Po příslušném CI může následovat pouze DEV web podle pravidel vydání.
Tato oprava pevného UI neřeší obecnou chybu Flutteru při libovolných emoji
v uživatelském textu; tu nesmí skrývat ani měnit uživatelský obsah.

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
build i původní šestice zůstávají jen dílčími podklady. Úplné CI ani rollout se
pro tento lokální diagnostický checkpoint nespouštějí; při schválené opravě
se seskupí s aplikační změnou. Žádná z těchto změn není oprava nasazené
aplikace ani nový release.
