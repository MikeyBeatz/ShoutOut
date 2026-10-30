# Datový model Firestore

Připravená serverová callable `createShout` používá `serverOperations/{hash}`
pro idempotenci: `userId`, `action: createShout`, `fingerprint`, `shoutId`,
`createdAt`. Hash ID je odvozen z UID a klíče požadavku. Záznam vzniká atomicky
se Shoutem a existujícím `rateLimits/{uid}/actions/shout`; klient k němu nemá
oprávnění. Neuchovává původní text ani přesné souřadnice. Callable je nasazená
pouze ve vývoji; retenční úklid těchto nových záznamů zatím není dokončený.

Vývojová callable `createComment` používá tutéž kolekci, s action namespace
v hash ID a poli `userId`, `action: createComment`, `fingerprint`, `shoutId`,
`commentId`, `createdAt`. Nevkládá text komentáře do receipt. Komentář,
`shouts.commentsCount`, `rateLimits/{uid}/actions/comment`, receipt a oznámení
vznikají v jediné transakci. Zůstává stávající limit 60 za hodinu a odstup 10 s.
Úklid receipt je i zde otevřený; callable je nasazená pouze ve vývoji.

Vývojová `createPrivateReply` používá action namespace v hash ID a
receipt s poli `userId`, `action: createPrivateReply`, `fingerprint`, `shoutId`,
`privateReplyId`, `createdAt`. Text, přezdívky ani ID zdrojové soukromé zprávy
v něm neuchovává. Vstup obsahuje typ cíle a podle něj `parentCommentId` nebo
`parentPrivateReplyId`; příjemce si klient nevybírá nezávisle na cíli.
`parentPrivateReplyId` slouží pouze k serverovému ověření přijaté zprávy a
jejích účastníků, nepřidává nové pole do uložené soukromé odpovědi.
`parentCommentId` se při pokračování převezme z původní soukromé zprávy a
musí stále odkazovat na existující komentář, stejně jako v současných Rules.
Úložiště zpráv a pravidla jejich čtení se nemění. Callable je nasazená pouze ve vývoji.

Lokální serverová logika `toggleShoutReactionOperation` připravuje akci
`toggleShoutReaction`. Její `serverOperations/{hash}` obsahuje `userId`, `action`,
`fingerprint`, `shoutId`, `result: {type, likes, dislikes}` a `createdAt`. Typ
výsledku může být `null` při odebrání reakce. Hash odděluje UID, název akce a
klíč požadavku. Receipt vrací historický výsledek, nikoli aktuální snapshot po
dalších reakcích. Samotný záznam reakce zachovává `type` a `updatedAt` pod
`shouts/{id}/reactions/{uid}` a sdílený `rateLimits/{uid}/actions/interaction`.
Operace je nasazená jako callable pouze ve vývoji. Volitelné vstupní
`expectedUserId` pouze porovnává očekávaný účet s Auth; neurčuje identitu autora
ani cestu zápisu. Neshoda se odmítne ještě před přístupem k databázi.

Lokálně připravená `toggleCommentReaction` používá samostatný action namespace
a receipt s `userId`, `action: toggleCommentReaction`, `fingerprint`, `shoutId`,
`commentId`, `result: {type, likes, dislikes}` a `createdAt`. Text komentáře
ani přezdívka se do receipt nepřidávají. Reakce zůstává v
`shouts/{shoutId}/comments/{commentId}/reactions/{uid}` a sdílí limit
`rateLimits/{uid}/actions/interaction` s reakcemi na Shouty a ukládáním.
Mění pouze dva čítače příslušného komentáře; rodičovský Shout nepřepisuje.
Oznámení zachovává existující ID
`commentReaction_{type}_{shoutId}_{commentId}` a kanonický veřejný profil.
Tato Function je nasazená pouze ve vývoji. Klientské napojení řídí
`serverCommentReactions` (výchozí `false`); vývojová konfigurace jej po
souhlasu vlastníka zapíná, produkční nikoli.

Lokálně připravená `toggleShoutSaveOperation` používá namespace
`toggleShoutSave` a receipt s `userId`, `action`, `fingerprint`, `shoutId`,
`result: {saved, count}` a `createdAt`. Nevkládá text, polohu ani přezdívky.
Uložení zůstává v `shouts/{id}/saves/{uid}` pouze s `createdAt`; odebrání
dokument odstraní. V jediné transakci se změní záložka, `savesCount`, sdílený
limit `interaction` a receipt; ostatní čítače i obsah Shoutu zůstávají stejné.
Replay vrací historický výsledek, nikoli aktuální stav záložky. Budoucí klient
musí zobrazovat realtime data. Callable i klient jsou nasazené ve vývoji;
aktuální důkazy uvádí [PROJECT_STATUS](PROJECT_STATUS.md). Retence receipt je otevřená.

Ve vývoji nasazené `deleteComment` ukládá do `serverOperations/{hash}` pole
`userId`, `action: deleteComment`, `fingerprint`, `shoutId`, `commentId`,
`authorId`, `result: {deleted: true}` a `createdAt`. Hash má oddělený jmenný
prostor účtu/operace/klíče. `authorId` pochází z mazaného dokumentu; umožňuje
ověřit oprávnění i při replay po smazání, bez textu či přezdívky v receipt.
Aktuální způsobilost účtu a u cizího komentáře také moderátorské oprávnění se
ověřují znovu před každým replay. Změna payloadu pod stejným klíčem se odmítá.
Jedna transakce smaže existující komentář, sníží `commentsCount` nejméně na 0,
zapíše společný limit `delete` a receipt. Ostatní čítače zůstanou stejné.
Samotná odpověď čítač nevrací. Nový klíč pro už neexistující komentář vrací
`not-found` bez zápisů; stejný klíč vrací uložené potvrzení bez dalšího odečtu.
Podkolekce reakcí, odpovědi, hlášení a oznámení tato operace stejně jako původní
klientská transakce nemaže. Retence receipt a další úklid zůstávají otevřené.

### Retence potvrzení operací – ověřený problém a další návrh

Potvrzení se zatím automaticky nemažou. Lokální emulatorová zkouška
30. října doložila, že prosté odstranění receipt a opakování téhož
`toggleShoutSave` znovu přepne záložku (1 → 0). Není to současný výpadek
idempotence při zachovaném receipt, ale překážka zavedení samotného TTL/úklidu.

Před úklidem je potřeba zavést časově omezené identifikátory požadavků,
odmítat prošlé pokusy před mutací i po smazání receipt a bezpečně ukončit
přijímání starého formátu bez časového omezení. Návrh musí řešit nesprávný
čas zařízení, souběh, přepnutí účtu, přerušený rollout a zachování původního
potvrzení během platného okna. Klient nesmí nejistý prošlý pokus automaticky
změnit na novou akci. Vlastník 30. října schválil délku okna 7 dní;
implementace tohoto omezení a úklidu teprve následuje. Dosavadních 60 dní po smazání účtu
se tím nemění. Produkční změna retence vyžaduje odpovídající rozhodnutí.

První lokálně připravená kompatibilní vrstva používá `operation_retention.js`
ve všech osmi operacích. Klíč `op1_<epoch seconds>_<32 hex>` nesmí být z
budoucnosti ani poprvé proveden po sedmi dnech. Receipt dostává `keyVersion: 1`
a `expiresAt` přesně sedm dní od skutečného serverového `createdAt`.
Platný replay se potvrzuje podle tohoto serverového deadline; po něm server
vrací `operation-expired`, i když fyzický úklid ještě neproběhl. Po úklidu
je stejný starý klíč také odmítnutý, takže se akce znovu neprovede.

Přechodný `legacyOperationKeysAccepted: true` zachovává dosavadní klienty;
jejich receipt nedostávají deadline a nesmějí se zatím automaticky mazat.
Vrstva neprovádí cleanup, nemění oprávnění/limity a není ještě nasazená.
Následuje klientský přechod, ověření a ukončení přijímání nových legacy klíčů.

Lokálně připravený `TimedOperationGateway` navazuje původní logický klíč
klienta na neměnný `op1` payload. Epochu odvozuje z `IdTokenResult.issuedAtTime`
(bez force refresh), nikoli z hodin zařízení; nonce má 128 náhodných bitů.
Používá jej všech osm serverových cest. Metadata ani tokeny se do payloadu
neukládají, pouze výsledný klíč a `expectedUserId`; identity Auth zůstává
autoritativní. Volitelnou očekávanou identitu nově přijímají i tři publikační
endpointy a odmítnou přepnutí účtu ještě před přístupem do databáze.

Vazba původního logického klíče na payload přetrvává v paměti této relace
i po potvrzení, aby případný pozdější retry po UI chybě nezaložil novou akci.
Souběžná odeslání se slučují, změna payloadu pod stejným klíčem se odmítne.
Prošlý pokus automaticky nevygeneruje nový klíč; rozhraní v sedmi jazycích
vyzve k obnovení aplikace a kontrole skutečného výsledku. Reload tyto vazby
nezachová; klientské klíče se zatím neukládají trvale. Nic z této nové vrstvy
není ještě nasazené. Rollout musí začít všemi Functions a teprve poté webem;
legacy klienti zůstávají po dobu přechodu kompatibilní.

Tento dokument je katalog dat současné aplikace. Popisuje význam dokumentů,
vlastnictví a vazby potřebné pro rekonstrukci. Přesný povolený seznam polí,
typy, délky a autorizační podmínky jsou vždy závazně definované v
`firestore.rules`; modely a zápisy klienta jsou v `lib/`.

## Konvence

- `uid` je Firebase Authentication UID a je kanonickým identifikátorem účtu.
- Bezpečnostně významné časy určuje server. Klient používá
  `FieldValue.serverTimestamp()` a Rules je porovnávají s `request.time`;
  Admin SDK operace používají `Timestamp` ze serverových hodin.
- Firestore `GeoPoint` je níže označen jako `latlng` a čas jako `timestamp`.
- Veřejné souřadnice mají sedmimístný geohash. Běžný účet ukládá zaokrouhlenou
  polohu, Business účet přesnou ověřenou polohu provozovny.
- Dokument obsahu může nést kopii přezdívky a avataru pro historický fallback,
  ale aktuální identita se čte z `publicProfiles/{uid}`.
- Dokumenty `accountRoles`, aktivní Business profil a serverové lifecycle změny
  nesmí vytvářet běžný klient. Patří Admin SDK nebo důvěryhodnému backendu.

## Identita a účet

| Cesta | ID a důležitá pole | Význam a životní cyklus |
|---|---|---|
| `users/{uid}` | `nickname`, `nicknameLower`, `createdAt`, `emailVerified`, `language`, `themeMode`, `showOnboardingHelp`, `avatarId`, `avatarBackgroundStart`, `avatarBackgroundEnd`, `avatarGradientDirection`, volitelně `businessLogoPath`, `businessLogoVersion` | Soukromý profil a preference vlastníka. Vzniká až po ověření e-mailu a přijetí právních dokumentů. Logo smí přidat pouze aktivní Business účet. |
| `publicProfiles/{uid}` | `nickname`, avatarová pole, volitelné `publicRole`, `businessLogoPath`, `businessLogoVersion` | Minimální veřejná identita. Karty Shoutů a komentářů ji sledují realtime; důvěryhodné nástroje synchronizují veřejnou roli, zatímco klient ji nesmí měnit. |
| Storage `businessLogos/{uid}/logo-{version}.png` | PNG do 2 MiB | Veřejné logo Business účtu dostupné přihlášeným uživatelům; zapisovat a mazat ho smí pouze vlastník s aktivní Business rolí. |
| `nicknames/{nicknameLower}` | `uid`, `nickname`, `nicknameLower`, `createdAt` | Globální rezervace přezdívky. ID je normalizovaná přezdívka; změna probíhá transakcí společně s oběma profily. |
| `accountRoles/{uid}` | `role`, `level` a podle role moderátorský rozsah | Důvěryhodně přidělená role. Úrovně: user 1, business 2, moderator 3, seniorModerator 4, administrator 5, owner 6. |
| `moderators/{uid}` | historická/kompatibilní moderátorská metadata | Klient smí načíst jen vlastní dokument. Nové rozhodování je založené na `accountRoles`. |
| `users/{uid}/legal/acceptance_2026_07_25` | `termsVersion`, `privacyVersion`, `communityRulesVersion`, `ageConfirmed`, `acceptedAt`, `acceptedLanguage` | Neměnný důkaz souhlasu. Aktuální verze všech textů je `2026-07-25`. |
| `accountDeletionRequests/{uid}` | `userId`, `email`, `requestedAt`, `retainUntil`, `status: pending` | Archivní záznam pod původním UID na přibližně 60 dní. Authentication účet se odstraní ihned, takže e-mail lze znovu registrovat; finální serverové pročištění archivních dat zatím není implementované. |

Změna přezdívky musí atomicky odstranit starou rezervaci, vytvořit novou a
aktualizovat soukromý i veřejný profil. Avatar se obdobně zapisuje do obou
profilů, aby se bez přepisování historie změnil všude, kde se autor zobrazuje.

## Business účet a provozovny

| Cesta | Důležitá pole | Význam |
|---|---|---|
| `businessApplications/{uid}` | `countryCode`, `registrationNumber`, `submittedCompanyName`, fakturační adresa, `initialLocationName`, adresa a země provozovny, `initialLocation`, `initialLocationGeohash`, `initialLocationProviderPlaceId`, `contactEmail`, `status`, `submittedAt`; po ruční aktivaci `activatedAt`, `activatedBy`, `activationMethod` | Žádost vzniká ve stavu `pending_email`, po ověření přechází do `checking`. Administrátor nebo owner ji může ručně schválit; vývojový Admin SDK nástroj zvládá jen ověřený `pending_email`. Zamítnutí a pozastavení zatím chybí. |
| `businessActivationAudits/{id}` | `applicationId`, `administratorId`, `action: activate`, `createdAt` | Neměnný audit ruční aktivace Business účtu z administrátorského rozhraní. |
| `businessProfiles/{uid}` | `displayName`, `officialName`, `registrationNumber`, `vatId`, `countryCode`, `registryAddress`, `billingCity`, `billingPostalCode`, `billingEmail`, `status`, časová pole | Aktivní firemní profil a společné fakturační údaje. Roli a profil vytváří důvěryhodný administrátorský zápis pod kontrolou Rules nebo vývojový Admin SDK nástroj; běžný klient smí měnit jen vybrané kontaktní a zobrazované údaje. Název pole `registryAddress` neznamená automatické ověření registru. |
| `businessProfiles/{uid}/locations/{locationId}` | `displayName`, `address`, `active`, `deleted`, `geocodingStatus`, `location`, `geohash`, `providerPlaceId`, `countryCode`, `createdAt`, `updatedAt` | Pobočka/provozovna. Ověřená adresa má `geocodingStatus: verified`; pozastavení mění `active`, odstranění je soft-delete přes `deleted`. |

Při Business Shoutu musí `businessLocationId`, zobrazované jméno, bod a geohash
přesně odpovídat aktivní, nesmazané a ověřené provozovně. Sídlo firmy nikdy
automaticky nenahrazuje první provozovnu.

Ruční schválení v administrátorském rozhraní používá deterministické ID první
pobočky `initial` a `activationMethod: manual_admin`. Atomicky zapíše
`accountRoles/{uid}` s rolí 2, aktivní Business profil, pobočku, stav žádosti a
`businessActivationAudits/{id}`. Vývojový nástroj používá
`activationMethod: manual_development` a audit nevytváří. Produkční ruční
kontrola, zamítnutí a pozastavení se musí před webovým MVP dokončit; ověření
firem přes registry není v plánu.

Současný datový model nemá kolekci ani pravidla pro předplatné nebo placené
Business nároky. Jejich důvěryhodný model se navrhne až pro monetizaci po MVP;
Business tokeny se nezavádějí.

## Shout a konverzace

### `shouts/{shoutId}`

Povinná pole:

- `authorId`, `authorNickname`, `title`, `text`, `categories`;
- `location: latlng`, `geohash`, `createdAt`, `expiresAt`, `status`;
- `likesCount`, `dislikesCount`, `commentsCount`, `savesCount`;
- avatarová fallback pole.
- volitelné pravdivé příznaky `businessHighlighted`, `businessSpotlight` a
  `businessExtendedDuration` pouze pro aktivní Business účet; chybějící příznak
  znamená neaktivní funkci a zvýraznění s okénkem lze kombinovat.

Business Shout navíc nese `businessLocationId`. Serverová Function může po
vytvoření doplnit mapu `geography` se `schemaVersion`, `countryCode`,
`subdivisionCode`, názvem lokality, providerem, place ID a `resolvedAt`.

Stavy jsou v klientovi především `active` a `deleted`; expirace vychází z
`expiresAt`. Nadpis má 1–60 znaků, text 1–220, kategorie jsou jedna až dvě z:
Událost, Dotaz, Nabídka, Pomoc, Ztráty a nálezy, Tip, Doprava, Diskuze,
Varování! a Ostatní. Emoji je pouze součástí prezentace v klientovi, ne uložené
hodnoty. Běžná platnost je 15 minut až 24 hodin, Business až 7 dní při použití
`businessExtendedDuration`.

| Cesta pod Shoutem | Pole | Oprávnění a invarianta |
|---|---|---|
| `comments/{commentId}` | `authorId`, `authorNickname`, `text`, `createdAt`, `likesCount`, `dislikesCount`; volitelně `replyToCommentId`, `replyToNickname` | Vytvoření/smazání musí ve stejném batchi upravit `shouts.commentsCount`. |
| `comments/{commentId}/reactions/{uid}` | `type: like\|dislike`, `updatedAt` | Vlastní reakce uživatele; změna musí atomicky upravit oba čítače komentáře. |
| `privateReplies/{replyId}` | `authorId`, `authorNickname`, `recipientId`, `recipientNickname`, `participants`, `text`, `createdAt`, `targetType`; volitelně `parentCommentId` | Čtou pouze oba účastníci. `participants` je dvojice autor/příjemce, ne veřejný chat. |
| `reactions/{uid}` | `type: like\|dislike`, `updatedAt` | Jedna reakce uživatele na Shout; atomicky mění `likesCount`/`dislikesCount`. |
| `saves/{uid}` | `createdAt` | Vlaječka vlastněná uživatelem; atomicky mění `savesCount`. |

Čítače jsou denormalizované kvůli feedu. Nejsou autoritativní samy o sobě:
pravidla dovolí změnu pouze při odpovídajícím vytvoření, změně nebo smazání
podřízeného dokumentu. Skript `tools/reconcile_counters.mjs` umí vývojová data
srovnat.

## Sociální vazby, blokace a nastavení

| Cesta | Pole | Význam |
|---|---|---|
| `users/{uid}/following/{targetUid}` | `targetUserId`, `createdAt` | Uživatel sleduje veřejný profil. ID pole i dokumentu se musí shodovat; vlastní účet nelze sledovat. |
| `users/{uid}/blocked/{targetUid}` | `createdAt` | Blokace cílového účtu; feed jeho obsah odfiltruje a klient zruší Follow. |
| `users/{uid}/settings/notifications` | booleany `replies`, `reactions`, `privateReplies`, `followedProfiles`, `nearbyShouts` | Preference kategorií. První tři dnes ovlivňují in-app zápisy, poslední dvě čekají na serverový fan-out. |

Uložený Shout není kopie v profilu; vlastnictví je v `shouts/{id}/saves/{uid}`.
Seznam vlastníků proto nelze klientem vypsat, ale uživatel smí načíst svůj
konkrétní save.

## Oznámení

Cesta je `users/{recipientUid}/notifications/{notificationId}`. Společná pole:

- `kind`, `actorId`, `actorNickname`;
- `targetShoutId`, `targetTitle`;
- `eventCount`, `createdAt`, `readAt`;
- podle druhu `reactionType`, `targetCommentId`, `parentCommentId` nebo
  `targetPrivateReplyId`.

| Druh | Stabilní ID série |
|---|---|
| reakce na Shout | `reaction_{like|dislike}_{shoutId}` |
| komentáře pod Shoutem | `comment_{shoutId}` |
| odpovědi na komentáře | `reply_{shoutId}` |
| soukromé odpovědi | `privateReply_{shoutId}` |
| reakce na komentář | `commentReaction_{like|dislike}_{shoutId}_{commentId}` |

První událost vytvoří `eventCount: 1`. Další událost stejné série provede merge,
zvýší počet, uloží posledního aktéra a čas a vrátí `readAt` na `null`. Oznámení
vzniká ve stejné transakci/batchi jako zdrojová akce a vlastní akce uživatele ho
nevytváří. Příjemce smí měnit pouze `readAt`.

## Rate limiting

Cesta `rateLimits/{uid}/actions/{action}` drží posuvné okno a poslední bezpečné
ID události. Klient používá akce `shout`, `comment`, `privateReply`, `report`,
`interaction` a `delete`. Každý dokument má přesně `lastAt`, `lastEventId`,
`windowStartedAt` a `count`.

Obsah/interakce a příslušná změna rate-limit dokumentu musí být atomická.
Konkrétní limity jsou v `PRODUCT_FLOWS.md`; algoritmus a konečná validace ve
funkcích `validRateLimitWrite` a `consumedRate` ve `firestore.rules`.

## Hlášení, moderace a audit

| Kolekce | Účel |
|---|---|
| `reports` | Hlášení Shoutu s odkazem na cíl, důvodem a stavem zpracování. |
| `commentReports` | Hlášení komentáře. |
| `privateReplyReports` | Prioritní hlášení soukromé odpovědi, které smí založit její příjemce. |
| `accountReports` | Jedno otevřené hlášení cílového účtu na dvojici reporter–target. |
| `bugReports` | Popis chyby, stav a 60denní retence; volitelná metadata screenshotu. |
| `moderationClearances` | Audit uzavření reportu bez postihu. |
| `sanctions` | Neměnný záznam warning/contentRestriction/accountBan včetně zdroje a snapshotu. |
| `warnings` | Aktivní odvozený záznam upozornění uživatele. |
| `contentRestrictions/{uid}` | Aktivní časově omezený zákaz tvorby obsahu. |
| `bans/{uid}` | Aktivní dočasný nebo trvalý zákaz účtu. |
| `sanctionRevocations/{sanctionId}` | Neměnný audit zrušení postihu a důvodu. |
| `clientErrorLogs` | Technická chyba klienta, viditelná jen rolím administrator/owner, TTL 60 dní. |
| `technicalLogAccessAudits` | Audit každého otevření technických logů, TTL 60 dní. |

Podrobné stavy, hierarchie rolí, regionální rozsah a postup zpracování jsou v
`INTERNAL_MODERATION.md`. Schémata reportů a sankcí jsou záměrně přísně
validována pravidly a nemají se reimplementovat jen podle této tabulky.

Lokálně připravená callable `createContentReport` zachovává ID
`{reporterUid}_{shoutId}` nebo `{reporterUid}_{shoutId}_{childId}` a stávající
pole těchto tří obsahových kolekcí. Privátní snapshot `authorId`/`text` čte
server z původní zprávy a dovolí jej pouze příjemci. Stav je `open`, priorita
soukromého hlášení `high`, čas je serverový. Hlášení, společný rate bucket
`report` a receipt zapisuje jedna transakce. Receipt obsahuje odkaz na případ
a hash vstupu, nikoli důvod nebo soukromý text. Jeho historický replay případ
znovu neotevře. Existence clearance brání novému hlášení. Function je po souhlasu
nasazená pouze ve vývoji a `serverContentReports` je aktivní na vývojovém Hostingu.
Produkční přepínač je vypnutý. Živé ověření všech tří typů, duplicity, cooldownu,
moderační fronty i úklidu prošlo 29. října 2026.

## Indexy, TTL a Storage

`firestore.indexes.json` definuje:

- aktivní Shouty podle `status + createdAt`;
- regionální pracovní fronty podle `status + geography.countryCode + createdAt`
  a `status + geography.subdivisionCode + createdAt`;
- collection-group index komentářů podle `authorId`;
- TTL pole `expiresAt` pro technické logy a audity přístupů.

Storage cesta připraveného screenshotu je
`bugReports/{uid}/{reportId}/screenshot`. Povolené typy jsou JPEG, PNG a WebP,
maximum 2 MiB. Aktivace a provozní omezení jsou popsané v `FIREBASE_STORAGE_SETUP.md`.

## Co je zdroj pravdy

Při rozporu použijte v tomto pořadí:

1. `firestore.rules` pro oprávnění, povinná pole a atomické invarianty;
2. `firestore.indexes.json` a `storage.rules` pro indexy, TTL a soubory;
3. zápisové operace v `lib/` a `functions/index.js` pro skutečný tok;
4. tento dokument pro význam a vazby;
5. `TODO.md` pouze pro budoucí stav, nikoli současnou implementaci.
