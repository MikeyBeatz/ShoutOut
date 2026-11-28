# Revize dosavadní práce k MVP – 27. listopadu 2026

## Výsledek a hranice

Revize je dokončená. Ověřený DEV obsahuje vydaný feed B1–B4, serverovou
moderaci/Business a společný archiv s právní verzí 2026-11-27. Dosavadní
implementace a dokončené piloty se neruší. **Celé MVP ani bezpečnostní a
produkční brána uzavřené nejsou.** Revize potvrdila šest technických nálezů,
jednu neuzavřenou volbu rozsahu čtení a neaktuální stavové souhrny.

Vlastník tuto souhrnnou revizi výslovně schválil. Proběhly místní/emulátorové
testy a pouze čtecí kontrola projektu `shoutout-dev-46c81`. Revize neměnila
aplikační chování, živá data, Auth účty, Rules, Functions, Hosting, secrets,
prostředky, retence, `main` ani produkci. Opravy níže jsou návrhy další práce.
Není to penetrační test veškeré infrastruktury ani právní posouzení.

Auditovaný Git základ: **0c81043eecf7139a839b07c93d48f1693c51ff16**.
Pracovní větev: `feature/mvp-completed-work-review`. Místní zdroj byl čistý;
nesouvisející změny kořenové pracovní kopie se do revize neslučovaly.

## Potvrzený stav DEV

| Vrstva | Ověřený stav / podklad |
|---|---|
| Projekt / web | `shoutout-dev-46c81`, `shoutout-dev-46c81.web.app`; Hosting `14a0f588585839e2` |
| Web a 29 Functions | Zdroj `5435855847bc81c76a05f1e6f18d5b68b636367b`, [úplné CI 46013597685 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46013597685) |
| Dva účtové workery | Zdroj `bd81e98ddab2b5e0e6f62410e302e9824e547f18`, [úplné CI 46020290663 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46020290663) |
| Firestore Rules | Zdroj `c361526adeeec77328a7c1d640b43dd693e970bd`, [úplné CI 46043558742 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46043558742); ruleset `88a94380-2b88-4f37-8ed9-47dc9ab88a89`, SHA-256 `a262952b15fdf1f8e5172182d787213a362f1b108849158bacf6e582ca59f9d2` |
| Storage Rules | Ruleset `e2b2becb-fe6b-4c83-8dc5-a4b2295afba6`, SHA-256 `f93132c429b55e803ec8b65f4da6805d8e9b51c421eedd1fa58e0e157612f891`; nasazený text odpovídá `storage.rules` |
| Vlastní historie / index | Zdroj `7c6a1229ced05803498a7f6f9bba7acb1045ea93`, [úplné CI 46065640727 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46065640727); dotaz přes `publicUntil` je zahrnutý |
| Runtime | 31 ACTIVE Functions, Node 22, min 0 / max 1 instance, concurrency 1, 256 MiB; 28 callables 15 s, tři workery 60 s |
| Plánovače | Dvě existující ENABLED minutové úlohy: `cleanupOperationReceipts` a `resumeAccountDeletionJobsDev`; revize je neměnila |
| Archiv a podmínky | Capture, čtení, identita a údržba aktivní; skutečné právní přijetí 2026-11-27, žádná automatická potvrzení |
| Poslední pilot | [Živá akceptace a vymezený úklid dokončené](../plans/accounts/ARCHIVE_LEGACY_DEV_ASSESSMENT.md#archive-dev-pilot-results); oba dočasné Auth odstraněné, primární úlohy `content-archived`, privátní purge ponechaný na původních termínech 26.01.2027 |

Rules byly pro audit znovu staženy z aktuálních releases. Emulátorové
protipříklady používají **skutečný nasazený text**, nikoli neaktivní šablonu
s lokálními výchozími přepínači. Živá metadata znovu potvrzují Hosting, 31
Functions i oba plánovače. Kontrola nesčetla odlišné zdroje vrstev do jednoho
neexistujícího releasu.

## Potvrzené nálezy

### F-01 – vysoká priorita: ban nezavírá všechny privilegované přímé přístupy

**Fakt:** `hasRoleLevel` v [Firestore Rules](../../firestore.rules) kontroluje
roli, smazaný účet a pending žádost, ale ne aktivní ban ani úplnou způsobilost
staff účtu. Některé cizí čtecí cesty používají jen `isModerator()` místo
`eligibleModerator()`: například `businessApplications`, `businessProfiles`
a `accountDeletionRequests`. `supportStaff()` ve [Storage Rules](../../storage.rules)
obdobně neověřuje ban.

**Důkaz:** v izolovaném emulátoru aktivně zabanovaný administrátor přečetl
cizí Business žádost, profil a žádost o smazání; přímé čtení cizího `users`
dokumentu i serverový `requireEligibleActor` jej správně odmítly. Ve Storage
stejný stav dovolil cizí screenshot hlášení chyby, běžného cizího uživatele
odmítl. Neprokázali jsme anonymní přístup ani získání nové role.

**Dopad:** část citlivého staff přístupu zůstane funkční po banu. Role je
doložená serverovým dokumentem; chyba je v nejednotném ověření stavu účtu.

**Návrh:** sjednotit způsobilost pro cizí privilegované přístupy. Zachovat
vlastní čtení nutné pro obrazovku banu, podmínek a smazání. Zvlášť ověřit
pending, zrušenou roli, chybějící profil, právní verzi a možnosti Storage
guardu. Nerozšiřovat ani automaticky neměnit schválené role.

### F-02 – vysoká priorita: stará přímá cesta vytváření oznámení zůstává otevřená

**Fakt:** validace `users/{uid}/notifications` v [Firestore Rules](../../firestore.rules)
povoluje klientovi vytvořit oznámení ze staré existující reakce a správně
spotřebovaného limitu. Nevynucuje spravovanou serverovou cestu, novou změnu
události ani dostupnost příjemce podle stejného guardu jako server.

**Důkaz:** při aktivním spravovaném feedu byl přímý zápis reakce zamítnutý,
ale oznámení ze stejné nezměněné reakce u expirovaného Shoutu vzniklo.
`updateTime` reakce zůstal stejný. Druhý test vytvořil oznámení příjemci
s pending žádostí, zatímco serverový `readNotificationRecipients` jej označil
za nedostupného. Test nezměnil počty reakcí ani roli.

**Dopad:** upravený klient může generovat zastaralá oznámení mimo serverové
rozhodnutí a znovu zapisovat do účtu čekajícího na smazání. Platí existující
časový/početní limit interakcí; nejde o neomezený zápis.

**Návrh:** po kontrole kompatibility uzavřít staré klientské create/event
update cesty ve spravovaném režimu; zachovat příjemcovo označení přečtení.
Ověřit aktivní i expirovaný zdroj, replay a souběh s účtovým úklidem.

### F-03 – střední priorita: Business loga nemají omezený počet platných objektů

**Fakt:** [Storage Rules](../../storage.rules) povolují Business vlastníkovi
nové názvy `logo-[0-9]+.png` s limitem 2 MiB na soubor. Nový objekt není
svázaný s aktuální verzí loga ve Firestore; není zde početní/četnostní kontrola
ani ověření skutečného obrazového formátu. Aktivní ban upload nezastaví.

**Důkaz:** stejný Business účet uložil tři různé objekty bez jediné změny
profilových metadat. Rules přijaly tři bajty označené MIME `image/png`.
Samostatný test potvrdil nový upload aktivně zabanovaného Business účtu.
Anonymní uživatel tuto Business roli nemá.

**Návrh:** autorizované dokončení uploadu, vazba na používanou verzi,
ověření skutečného souboru a úklid nedokončených/osiřelých objektů. Konkrétní
nové limity, prostředky a způsob nahrávání předem navrhnout; revize je neurčuje.
Tento nález je o současných logách, ne o budoucích fotografiích přes R2.

### F-04 – střední priorita: moderační fronta není úplná při více než 50 hlášeních

**Fakt:** [staff_reports.dart](../../lib/src/staff_reports.dart) načte
`limit(50)` jednotlivých hlášení bez stránkování a bez serverového řazení.
Seskupení, počty i uživatelské řazení vznikají teprve z této neúplné množiny.
Role 3 správně dotazuje `open`, vyšší role `open` a `escalated`; problém není
v dodatečném filtrování eskalací.

**Důkaz:** 50 hlášení jednoho cíle vyplnilo první výsledek; 51. dokument
novějšího jiného případu se do UI dotazu nedostal a klient nemá pokračování.
Server rozhodnutí celou skupinu znovu načítá a při překročení schválených 50
bezpečně odmítne celý zápis. Tato správná pojistka nenahrazuje úplnost fronty.

**Návrh:** stránkovat případy a spolehlivě zobrazovat jejich počty; zachovat
limit 50 pro jedno atomické rozhodnutí. Způsob řešení větší skupiny určit
výslovně, limit potichu nezvyšovat. Přehled postihů v `staff_users.dart` má
podobné omezení prvních 50; tuto návaznost zahrnout do příští regrese, nebyla
zde samostatně reprodukovaná na 51 postizích.

### F-05 – střední priorita: klient může sám označit souřadnice pobočky za ověřené

**Fakt:** Rules vlastnímu Business účtu dovolují uložit pobočku
s `geocodingStatus: verified`, `location`, `geohash` a textovým
`providerPlaceId`. [create_shout.js](../../functions/create_shout.js)
následně považuje tuto kombinaci za ověřenou polohu pobočky.

**Důkaz:** klientský zápis uložil syntetickou pobočku na 1°/1° s libovolným
provider ID a skutečné serverové jádro vytvořilo Shout na těchto souřadnicích.
To neprokazuje možnost ověřit skutečnou fyzickou polohu zařízení; jde o chybějící
serverové doložení vazby adresy, poskytovatele a polohy pobočky.

**Návrh:** autoritu ověření pobočky přesunout na server se zvoleným
poskytovatelem a měřenými náklady; zachovat funkční Business publikování.
Souvisí s již otevřenými souřadnicemi v mvp-16 a geografickým milníkem mvp-13.

### F-06 – podmíněná kompatibilita: pending autor není všude stejnou čtecí bariérou

**Fakt:** [feed_delta.js](../../functions/feed_delta.js) v autorově politice
kontroluje blokace a `publicProfiles.accountStatus == deleted`, ale ne
pending žádost. Podobná kontrola je v
[get_saved_shouts.js](../../functions/get_saved_shouts.js). Přímé veřejné
čtení a lifecycle reader pending autora naopak vylučují.

**Důkaz:** při syntetickém starém/obnoveném stavu „pending žádost + zbývající
aktivní zdroj“ Rules čtenáři zdroj odmítly, ale studená delta cesta vrátila
celé tělo. Pro Uložené jde o doložený vzor v kódu, samostatný protipříklad
Uložených zde spuštěný nebyl.

**Důležitá hranice:** současná příprava nejdřív skryje aktivní Shouty a nová
finalizace transakčně odmítne vytvořit žádost, pokud nějaký aktivní Shout
zbývá. Souběžné publikování i finalizace byly znovu pozitivně otestované.
Nález tedy **neprokazuje obejití běžného nového smazání**; týká se sjednocení
ochrany starých/obnovených stavů, které projekt také podporuje. Živý únik
obsahu během této revize zjištěný nebyl.

**Návrh:** sjednotit autorovu dostupnost ve všech cold/warm, saved, news a
recenter cestách bez posunu původních lhůt; ověřit i původní pending žádosti.

## Q-01 – produktové upřesnění před změnou oprávnění

Regionální moderátor dnes přímo přečte metadata hlášení z jiné země, včetně
důvodu hlášení. Emulátor potvrdil CZ roli nad DE `privateReplyReports`.
Archivní tělo a serverové rozhodnutí mají samostatnou geografickou kontrolu;
jejich obejití tento test neprokázal. [Interní dokument](../reference/INTERNAL_MODERATION.md)
současně popisuje přidělené regiony i jednu společnou frontu.

Je potřeba rozhodnout, zda společná fronta znamená i globálně čitelná
metadata/důvody, nebo jen případy v přiděleném rozsahu. Bez této odpovědi se
pravidla nemění a nález není vydávaný za potvrzený přístup ke všem soukromým
konverzacím.

## Známé otevřené brány a menší dluh

- **Geografie mvp-13:** `enrichShoutGeography` existuje ve zdroji, ale není
  mezi 31 nasazenými Functions. Regionální zásah do nového Shoutu bez doložené
  geografie se správně odmítá; admin globální zásah zůstává možný. Nasazení,
  bezpečné doplnění při aktivním indexu a regionální ověření ještě zbývají.
- **Kapacita mvp-22:** DEV max 1 / concurrency 1 ani místní testy neprokazují
  5 000 aktivních uživatelů. Starší [kapacitní model](CAPACITY_AND_SCALING.md)
  předchází úplnému B4/archivu; před cloudovým testem jej přepočítat na současné
  operace, zápisové oblasti, návraty klientů a dohánění úklidového dluhu.
  Placený test ani vyšší prostředky tato revize neschválila/nepoužila.
- **Provoz a produkce:** monitoring `needs-review`, rozpočty, obnova záloh,
  produkční Auth/App Check, právní/provozovatelské údaje a společná ruční
  regrese zůstávají ve [startovní bráně](../LAUNCH_READINESS.md). Jejich
  produkční stav se touto DEV revizí neověřoval; netvrdíme, že infrastruktura
  určitě chybí, ani že už je připravená.
- **Diagnostika:** klientské `Feed request failed: code=unknown` nerozlišuje
  některé lokální chyby; účtový worker u části `needs-review` ukládá jen
  obecné `processing-failed`. Zlepšit bezpečné kódy/stage a dohled bez textů,
  kontaktů a tokenů. Příčinu uživatelem odložené chyby jednoho prohlížeče
  tato revize neurčila.
- **Fixture:** starší `moderation_business_pilot.js` nemá plnou rezervaci
  přezdívky jako běžná registrace. Budoucí piloty sjednotit na ověřený builder;
  běžný registrační kód rezervaci již atomicky vytváří. První neúplný
  archivní testovací profil byl opraven dříve, nikoli při této revizi.
- **UI:** tmavý vzhled a rozdílné ovládání soukromých odpovědí zůstávají
  uživatelem nahlášené otevřené body. Vlastní Shout jde mazat v jeho detailu
  a v Mé shouty; chybějící ikona přímo na feedové kartě je současné rozložení,
  nikoli odebrané serverové oprávnění. Viditelné ovládání hudby je potvrzené,
  aktuální přehrávání v posledním archivním průchodu výslovně potvrzené nebylo.

## Testy, důkazy a jejich meze

Technické podklady jsou lokálně v `build/mvp-review-2026-11-27/` auditní
pracovní kopie; jsou ignorované Gitem. Obsahují nasazené Rules, metadata
revizí, pomocné testy a protokoly bez přihlašovacích údajů. Scénáře nálezů jsou
popsané výše, aby zůstaly dohledatelné i bez pracovního adresáře. Při opravě
je převést na trvalé regresní testy očekávající odmítnutí chybné cesty.

Výstup této revize je dokumentační. Odkazy, stupnice a registrované snímky
jsou ověřené místně; nový úplný aplikační CI/build ani rollout kvůli zprávě
neproběhl. Další implementace bude mít vlastní přesné CI před nasazením.

| Kontrola | Výsledek | Co tím není doložené |
|---|---|---|
| Přesné nasazené Rules + protipříklady | 26/26: deset cílených diagnostických případů, sedm existujících lifecycle Rules scénářů a devět Storage scénářů | Protipříklad úspěchem **potvrzuje mezeru**, nikoli bezpečnost |
| Klientské regrese | 123/123, třináct Flutter souborů: delta/stránky, read tracking, účtové fáze, identita/archiv, lifecycle gateway, reakce, Business, živé odběry | Nový fyzický telefon ani skutečný browser IndexedDB test |
| Společné serverové regrese | 127 behaviorálních případů prošlo; TAP navíc započetl jeden pouhý import modulu. Jeden Chrome scénář byl přeskočený, žádné selhání | Celá historická CI sada, přeskočený browser ani výkon cloudu |
| Skutečné DEV dotazy | 10/10 úspěšně: Home/profil/Business/komentáře/staff globál+CZ+CZ-42, vlastní Aktivní/Expirované a Uložené; všechny výsledky prázdné | Jde o interní testovací kontext a skutečná Admin čtení; ne klientské Auth/App Check ani živé stránkování nad 50 položek |
| Runtime / Rules / předchozí CI | Znovu čtené aktuální DEV metadata a přesné Rules; návaznost zdrojů vrstev uvedená výše | Nové nasazení, produkční audit IAM či zátěžový test |

### Strukturované hodnocení Rules

Hodnocení použité podle postupu `firebase-security-rules-auditor` je **2/5**
pro kontrolované Firestore/Storage hranice. Je to kvalitativní výsledek
vybraných scénářů, nikoli procento napadnutelnosti celé aplikace. Rozhodující
jsou prokázané rozdíly ban/privilegované čtení a zbylý klientský zápis.

```json
{
  "score": 2,
  "summary": "Existující role a serverové transakce mají ochrany, ale přímé Rules cesty nejsou jednotné. Bez opravy hlavních nálezů není vhodné uzavřít veřejnou bezpečnostní bránu.",
  "findings": [
    {"check":"F-01 authority and eligibility","severity":"major","issue":"Aktivní ban nezastaví některé cizí privilegované Firestore/Storage čtení.","recommendation":"Sjednotit způsobilost staff přístupu a zachovat potřebné vlastní čtení."},
    {"check":"F-02 create/update and event authority","severity":"major","issue":"Starý klientský notification writer přijme oznámení bez nové platné události i pending příjemci.","recommendation":"Uzavřít legacy event zápisy ve spravovaném režimu a ověřit serverovou kompatibilitu."},
    {"check":"F-03 type safety and resource exhaustion","severity":"moderate","issue":"Business loga nejsou vázaná na používanou verzi, MIME neověřuje skutečný obrázek a ban upload nezastaví.","recommendation":"Navrhnout autorizované dokončení, validaci a úklid osiřelých objektů s předem určenými mezemi."},
    {"check":"F-05 ownership versus trusted fields","severity":"moderate","issue":"Vlastnictví pobočky dovoluje klientovi tvrdit, že její souřadnice jsou serverově ověřené.","recommendation":"Oddělit klientské zadání od serverového potvrzení adresy a polohy."}
  ]
}
```

Kontrola zahrnula rozdíly create/update, autoritu rolí, obchodní podmínky,
omezení zdrojů, typy a rozdíl mezi vlastnictvím dokumentu a oprávněním tvrdit
důvěryhodná pole. F-04/F-06 jsou navazující aplikační/kompatibilitní nálezy;
Q-01 potřebuje produktové rozhodnutí, proto nejsou přidávány jako dokázaná
Rules eskalace.

## Doporučené pořadí další práce

1. **Společný bezpečnostní úsek F-01 + F-02 + F-06:** sjednotit způsobilost
   přímého čtení, zavřít klientská event oznámení a doplnit staré pending
   čtecí stavy. Nejprve emulátor a klientská kompatibilita, společné CI,
   potom řízený DEV přechod bez nových rolí a lhůt. Vyjasnit Q-01 před
   jakoukoli změnou regionálního čtení.
2. **Dokončení stávající moderace a Business:** úplná fronta F-04, autorita
   poboček F-05, bezpečný upload současných log F-03 a již otevřená geografie
   mvp-13. Podle poskytovatele a uploadu předložit konkrétní provozní volby.
3. **Společná regrese a produkční příprava:** aktuální kapacitní podklad,
   bezpečnější diagnostika a provozní pojistky, právní/UX/překladové minimum,
   potom jeden souhrnný ruční blok pro běžný, Business a staff účet včetně
   sítě a kompatibilního návratu. Teprve poté rozhodnutí mvp-24.

### Navazující regresní matice

| Oblast | Automatická podmínka | Závěrečný ruční průchod |
|---|---|---|
| Oprávnění | Ban/pending/role/legal na všech cizích privilegovaných cestách; vlastní výjimky | Přihlášení staff, ban, návrat a přístup jen do povolených sekcí |
| Obsah / oznámení | Serverový event, odmítnutý raw replay, expirace a pending příjemce | Běžná reakce/komentář a doručené oznámení, změna účtu |
| Feed / staré stavy | Cold/warm/refill/recenter/saved a pending autor; bez oživení kopií | Stránky, přečtení, obnova, pohyb, síť a otevřený klient po návratu |
| Moderace | Více než 50 dokumentů/případů, souběh a hranice jedné skupiny | Úplná fronta, rozhodnutí v regionu, archivní podklad po smazání |
| Business | Doložená pobočka, upload/validace/osiřelé objekty a ban | Žádost/oprava/pozastavení, pobočka, logo a publikování |
| Retence | Původní termíny, restart, replay a nepřítomný Auth; dohánění dluhu | Vlastní historie, čitelný oprávněný archiv a dostupné vlastní smazání |
| Produkce | Přesný commit/CI, prostředky, monitoring, záloha/obnova a kapacitní důkazy | Schválený produkční smoke až po startovní bráně |

Revize doplňuje důkazy do existujících otevřených podúseků. Nemění jejich
váhy, neoznačuje nalezenou vadu za opravenou a nezapočítává se znovu jako
hotová ruční regrese. Současné MVP procento se samotným auditem nezvyšuje.

Navazující [schválená oprava F-01/F-02/F-06 z 28. listopadu](MVP_AUTHORITY_READ_FIX_2026-11-28.md)
má vlastní implementační a nasazovací záznam. Tento původní protokol zachovává
stav a reprodukce před opravou; ostatní nálezy ani produkční bránu neuzavírá.
