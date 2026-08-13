# Datový model Firestore

Tento dokument je katalog dat současné aplikace. Popisuje význam dokumentů,
vlastnictví a vazby potřebné pro rekonstrukci. Přesný povolený seznam polí,
typy, délky a autorizační podmínky jsou vždy závazně definované v
`firestore.rules`; modely a zápisy klienta jsou v `lib/`.

## Konvence

- `uid` je Firebase Authentication UID a je kanonickým identifikátorem účtu.
- Všechny bezpečnostně významné časy zapisuje `FieldValue.serverTimestamp()` a
  pravidla je porovnávají s `request.time`.
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
| `users/{uid}` | `nickname`, `nicknameLower`, `createdAt`, `emailVerified`, `language`, `themeMode`, `showOnboardingHelp`, `avatarId`, `avatarBackgroundStart`, `avatarBackgroundEnd`, `avatarGradientDirection` | Soukromý profil a preference vlastníka. Vzniká až po ověření e-mailu a přijetí právních dokumentů. |
| `publicProfiles/{uid}` | `nickname`, avatarová pole, `updatedAt` | Minimální veřejná identita. Karty Shoutů a komentářů ji sledují realtime. |
| `nicknames/{nicknameLower}` | `uid`, `nickname`, `nicknameLower`, `createdAt` | Globální rezervace přezdívky. ID je normalizovaná přezdívka; změna probíhá transakcí společně s oběma profily. |
| `accountRoles/{uid}` | `role`, `level` a podle role moderátorský rozsah | Důvěryhodně přidělená role. Úrovně: user 1, business 2, moderator 3, seniorModerator 4, administrator 5, owner 6. |
| `moderators/{uid}` | historická/kompatibilní moderátorská metadata | Klient smí načíst jen vlastní dokument. Nové rozhodování je založené na `accountRoles`. |
| `users/{uid}/legal/acceptance_2026_07_25` | `termsVersion`, `privacyVersion`, `communityRulesVersion`, `ageConfirmed`, `acceptedAt`, `acceptedLanguage` | Neměnný důkaz souhlasu. Aktuální verze všech textů je `2026-07-25`. |
| `accountDeletionRequests/{uid}` | `userId`, `email`, `requestedAt`, `retainUntil`, `status: pending` | Blokuje vstup do aplikace. Retence je přibližně 60 dní; finální serverové smazání zatím není implementované. |

Změna přezdívky musí atomicky odstranit starou rezervaci, vytvořit novou a
aktualizovat soukromý i veřejný profil. Avatar se obdobně zapisuje do obou
profilů, aby se bez přepisování historie změnil všude, kde se autor zobrazuje.

## Business účet a provozovny

| Cesta | Důležitá pole | Význam |
|---|---|---|
| `businessApplications/{uid}` | `countryCode`, `registrationNumber`, `submittedCompanyName`, fakturační adresa, `initialLocationName`, adresa a země provozovny, `initialLocation`, `initialLocationGeohash`, `initialLocationProviderPlaceId`, `contactEmail`, `status`, `submittedAt`; po ruční aktivaci `activatedAt`, `activatedBy`, `activationMethod` | Žádost vytvořená při Business registraci ve stavu `pending_email`. Vývojový Admin SDK nástroj ji po kontrole atomicky přepne na `active`; klient ji měnit nesmí. |
| `businessProfiles/{uid}` | `displayName`, `officialName`, `registrationNumber`, `vatId`, `countryCode`, `registryAddress`, `billingCity`, `billingPostalCode`, `billingEmail`, `status`, časová pole | Aktivní firemní profil a společné fakturační údaje. Vytvoření/aktivace je serverová operace; klient smí měnit jen vybrané kontaktní a zobrazované údaje. |
| `businessProfiles/{uid}/locations/{locationId}` | `displayName`, `address`, `active`, `deleted`, `geocodingStatus`, `location`, `geohash`, `providerPlaceId`, `countryCode`, `createdAt`, `updatedAt` | Pobočka/provozovna. Ověřená adresa má `geocodingStatus: verified`; pozastavení mění `active`, odstranění je soft-delete přes `deleted`. |

Při Business Shoutu musí `businessLocationId`, zobrazované jméno, bod a geohash
přesně odpovídat aktivní, nesmazané a ověřené provozovně. Sídlo firmy nikdy
automaticky nenahrazuje první provozovnu.

Vývojová ruční aktivace používá deterministické ID první pobočky `initial` a
`activationMethod: manual_development`. Společně zapíše `accountRoles/{uid}` s
rolí 2, aktivní Business profil, pobočku a stav žádosti. Automatická produkční
aktivace později použije vlastní auditovaný serverový proces.

## Shout a konverzace

### `shouts/{shoutId}`

Povinná pole:

- `authorId`, `authorNickname`, `title`, `text`, `categories`;
- `location: latlng`, `geohash`, `createdAt`, `expiresAt`, `status`;
- `likesCount`, `dislikesCount`, `commentsCount`, `savesCount`;
- avatarová fallback pole.

Business Shout navíc nese `businessLocationId`. Serverová Function může po
vytvoření doplnit mapu `geography` se `schemaVersion`, `countryCode`,
`subdivisionCode`, názvem lokality, providerem, place ID a `resolvedAt`.

Stavy jsou v klientovi především `active` a `deleted`; expirace vychází z
`expiresAt`. Nadpis má 1–60 znaků, text 1–220, kategorie jsou jedna až dvě z:
Obecné, Akce, Sport, Zábava, Pomoc, Upozornění, Dotaz, Doprava, Jídlo a pití,
Kultura. Běžná platnost je 15 minut až 24 hodin, Business až 48 hodin.

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
| `reports` | Hlášení Shoutu se snapshotem důležitých údajů a stavem zpracování. |
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

## Indexy, TTL a Storage

`firestore.indexes.json` definuje:

- aktivní Shouty podle `status + createdAt`;
- regionální pracovní fronty podle `status + geography.countryCode + createdAt`
  a `status + geography.subdivisionCode + createdAt`;
- collection-group index komentářů podle `authorId`;
- TTL pole `expiresAt` pro technické logy a audity přístupů.

Storage cesta připraveného screenshotu je
`bugReports/{uid}/{reportId}/screenshot`. Povolené typy jsou JPEG, PNG a WebP,
maximum 5 MiB. Aktivace je odložená a popsaná v `FIREBASE_STORAGE_SETUP.md`.

## Co je zdroj pravdy

Při rozporu použijte v tomto pořadí:

1. `firestore.rules` pro oprávnění, povinná pole a atomické invarianty;
2. `firestore.indexes.json` a `storage.rules` pro indexy, TTL a soubory;
3. zápisové operace v `lib/` a `functions/index.js` pro skutečný tok;
4. tento dokument pro význam a vazby;
5. `TODO.md` pouze pro budoucí stav, nikoli současnou implementaci.
