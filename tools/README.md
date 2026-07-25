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

## Optional Litoměřice demo activity

Append `--with-demo-data` to create active test Shouts from approximately
0.4 km to 32 km around Litoměřice, including comments, @-style replies,
reactions and a comment that meets the automatic-hide threshold:

```powershell
node .\seed_test_users.mjs --with-demo-data
```
