# ShoutOut development seed users

This tool creates ten **development-only** Firebase Authentication users with
non-deliverable `@shoutout.test` e-mails. Each user is marked as verified and
has an `isTest: true` profile field.

The Firebase service-account JSON must stay outside this repository. Do not
commit it or send it through chat.

## One-time setup

1. Firebase Console → Project settings → Service accounts.
2. Choose **Generate new private key** and save it outside this repository,
   for example `C:\Users\micha\.shoutout-dev-service-account.json`.
3. In a terminal, run `npm ci` from this `tools` folder.

## Seed accounts

In PowerShell from this folder:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH = 'C:\Users\micha\.shoutout-dev-service-account.json'
$env:SHOUTOUT_TEST_PASSWORD = 'choose-a-development-only-password'
node .\seed_test_users.mjs
```

The accounts can then sign in normally in the ShoutOut app. Never use this
tool or these accounts in a production Firebase project.

Seeded profiles receive the default teal-to-navy diagonal avatar background.

## Optional Litoměřice demo activity

Append `--with-demo-data` to create active test Shouts from approximately
0.4 km to 32 km around Litoměřice, including comments, @-style replies,
reactions and a comment that meets the automatic-hide threshold:

```powershell
node .\seed_test_users.mjs --with-demo-data
```

## Add a live test interaction

Use this while the app is open to add a new nearby test Shout, comments and
reactions under several existing demo Shouts:

```powershell
node .\seed_test_users.mjs --live-activity
```

## Reconcile development counters

Po přechodu na souhrnné čítače spusťte jednorázově následující příkaz. Skript
odvodí počty reakcí, komentářů a uložení ze skutečných podkolekcí a zároveň
zaokrouhlí veřejné souřadnice. Má pevnou pojistku a odmítne jiný projekt než
`shoutout-dev-46c81`.

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH = 'C:\Users\micha\.shoutout-dev-service-account.json'
npm run reconcile:data
```

## Backfill veřejných profilů

Po nasazení dynamických avatarů vytvořte jednorázově bezpečné veřejné profily
pro existující uživatele. Skript kopíruje pouze přezdívku a avatarový styl a má
pojistku proti spuštění mimo vývojový projekt:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH = 'C:\Users\micha\.shoutout-dev-service-account.json'
npm run backfill:public-profiles
```

## Firestore Rules tests

Testy používají pouze lokální Firestore Emulator a projekt
`shoutout-rules-test`; žádná vzdálená data nemění:

```powershell
npm ci
npm run test:rules
```

Je potřeba Java 21 nebo kompatibilní verze v `PATH`. Pokud není instalovaná
samostatně, lze použít `jbr\bin` z Android Studia.

## Vývojové přiřazení role

Role jsou uloženy v `accountRoles/{uid}` a klient je nemůže vytvářet ani měnit.
Vývojovou roli lze nastavit pouze Admin SDK skriptem a pouze v projektu
`shoutout-dev-46c81`:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH = 'C:\Users\micha\.shoutout-dev-service-account.json'
npm run set:role -- user@example.com moderator
```

Povolené hodnoty jsou `user`, `business`, `moderator`, `seniorModerator`,
`administrator` a `owner`. Nastavení `user` odstraní privilegovaný dokument role.
Skript `set_moderator.mjs` zůstává jako kompatibilní zkratka pro úroveň 3.

Moderátorské regiony se přiřazují jako ISO kódy:

```powershell
npm run set:role -- moderator@example.com moderator --countries=CZ,DE --subdivisions=CZ-10
```

Administrátor a owner dostanou globální rozsah automaticky. Moderátor a senior
moderátor bez regionu neuvidí regionální pracovní frontu.

## Aktivace čekající Business žádosti ve vývoji

Dokud není nasazené automatické ověření ARES/VIES, lze dokončit skutečnou
Business registraci jedním vývojovým Admin SDK nástrojem. Nástroj odmítne jiný
projekt než `shoutout-dev-46c81`, neověřený nebo odlišný kontaktní e-mail,
neúplnou žádost a přepsání existujícího profilu či první pobočky.

Nejdřív spusťte pouze kontrolní náhled bez zápisu:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH = 'C:\Users\micha\.shoutout-dev-service-account.json'
npm run activate:business -- business@example.com
```

Porovnejte vypsané UID, oficiální název, registrační číslo, pobočku a adresu s
důvěryhodným zdrojem. Teprve potom spusťte zápis s přesným UID z náhledu:

```powershell
npm run activate:business -- business@example.com --apply --confirm-project=shoutout-dev-46c81 --confirm-uid=FIREBASE_UID --confirm-location
```

Jedna Firestore transakce vytvoří roli 2, aktivní Business profil a první
pobočku `initial` a označí žádost jako aktivní. Již existující správná Business
role je zachována. Skript nikdy nepovažuje klientský Geoapify výsledek za
automaticky důvěryhodný; příznak `--confirm-location` vyjadřuje ruční kontrolu
operátorem. Jde pouze o vývojový mezikrok, ne náhradu cílového serverového
ověření registru.

Čistou transformační logiku bez přístupu k Firebase ověří:

```powershell
npm run test:tools
```

## Testovací moderátorská fronta

Příkaz `npm run seed:moderation-queue -- --confirm-project=shoutout-dev-46c81`
vytvoří vývojový obsah a hlášení pro ruční test moderace. Shouty, komentáře a
soukromé odpovědi se záměrně připisují pouze běžným nebo Business testovacím
účtům. Moderátor, senior, administrátor a owner mohou obsah hlásit či přijmout
soukromou odpověď, ale nikdy nejsou autory demonstračního závadného obsahu.

## Doplnění geografických údajů

Po nasazení geografického modelu doplní starší shouty:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH = 'C:\secure\service-account.json'
$env:GOOGLE_MAPS_API_KEY = 'serverovy-klic'
npm run backfill:geography
```

Nástroj zapisuje `geohash` a `geography`, klíč nevypisuje a odmítne jiný projekt
než `shoutout-dev-46c81`.
