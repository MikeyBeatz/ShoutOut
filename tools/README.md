# ShoutOut development seed users

This tool creates five **development-only** Firebase Authentication users with
non-deliverable `@shoutout.test` e-mails. Each user is marked as verified and
has an `isTest: true` profile field.

The Firebase service-account JSON must stay outside this repository. Do not
commit it or send it through chat.

## One-time setup

1. Firebase Console → Project settings → Service accounts.
2. Choose **Generate new private key** and save it outside this repository,
   for example `C:\Users\micha\.shoutout-dev-service-account.json`.
3. In a terminal, run `npm install` from this `tools` folder.

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

## Firestore Rules tests

Testy používají pouze lokální Firestore Emulator a projekt
`shoutout-rules-test`; žádná vzdálená data nemění:

```powershell
npm ci
npm run test:rules
```

Je potřeba Java 21 nebo kompatibilní verze v `PATH`. Pokud není instalovaná
samostatně, lze použít `jbr\bin` z Android Studia.
