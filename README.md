# ShoutOut

ShoutOut je komunitní Flutter aplikace pro sdílení časově omezených příspěvků
z okolí uživatele. Příspěvky lze řadit podle vzdálenosti, popularity nebo
zbývající doby platnosti. Aplikace podporuje komentáře, reakce, soukromé
odpovědi, ukládání, blokování uživatelů, hlášení obsahu a moderaci.

## Aktuálně podporované platformy

- Android
- web

Projekt obsahuje také výchozí Flutter projekty pro iOS, Windows, macOS a Linux,
ale Firebase pro ně zatím není nakonfigurovaný. Tyto platformy proto nejsou
součástí aktuálně podporovaného vývojového prostředí.

## Technologie

- Flutter a Dart
- Firebase Authentication
- Cloud Firestore
- Geolocator
- Material 3

Vývojová Firebase konfigurace používá projekt `shoutout-dev-46c81`. Produkční
prostředí musí před vydáním používat samostatný Firebase projekt.

## Požadavky

- Flutter SDK odpovídající `pubspec.yaml`
- Android Studio nebo Android SDK pro Android
- Chrome pro webový vývoj
- Node.js pouze pro pomocné skripty ve složce `tools`
- přístup k vývojovému Firebase projektu

Stav prostředí lze zkontrolovat příkazem:

```powershell
flutter doctor
```

## První spuštění

Nainstalujte závislosti:

```powershell
flutter pub get
```

Zkontrolujte dostupná zařízení:

```powershell
flutter devices
```

Spusťte Android aplikaci na připojeném zařízení nebo emulátoru:

```powershell
flutter run
```

Spusťte webovou variantu:

```powershell
flutter run -d chrome
```

Aplikace žádá o přístup k poloze. Pokud uživatel oprávnění nepovolí nebo poloha
není dostupná, feed se stále načte, pouze nemá přesný výpočet vzdálenosti.

## Kontroly před commitem

```powershell
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
Push-Location tools
npm ci
npm run test:rules
Pop-Location
flutter build web --debug
```

Stejné základní kontroly spouští také GitHub Actions.

## Firebase a data

Hlavní kolekce ve Firestore:

- `users`, `nicknames`
- `shouts` s podkolekcemi `comments`, `privateReplies`, `reactions` a `saves`
- `reports`, `commentReports`, `privateReplyReports`
- `moderators`, `warnings`, `bans`
- `accountDeletionRequests`

Bezpečnostní pravidla jsou v `firestore.rules` a indexy v
`firestore.indexes.json`.

Nasazení pravidel a indexů:

```powershell
firebase deploy --only firestore:rules,firestore:indexes
```

Před nasazením vždy ověřte, že Firebase CLI míří na správný projekt. Produkční
pravidla se nemají nasazovat z neověřené pracovní větve.

### Bezpečnostní pravidla a lokální emulátor

Testy v `tools/rules` spouštějí Firestore Emulator proti izolovanému projektu
`shoutout-rules-test`; nemění vývojová ani produkční data:

```powershell
Push-Location tools
npm ci
npm run test:rules
Pop-Location
```

Firebase Emulator vyžaduje Javu 21 nebo kompatibilní verzi v `PATH`. Android
Studio ji standardně obsahuje ve složce `jbr`.

Zápisy obsahu a interakcí používají atomické rate-limit dokumenty. Proto musí
být změny klienta a `firestore.rules` nasazeny společně až po průchodu testů.
Před zpřísněním pravidel nad existujícími vývojovými daty spusťte jednorázové
srovnání veřejných čítačů podle návodu v `tools/README.md`.

### Firebase App Check

Android debug build používá App Check debug provider, release build používá
Play Integrity. Vynucení App Check se nesmí zapnout naslepo: nejdřív
zaregistrujte pouze vlastní debug tokeny, ověřte metriky a až potom zapínejte
enforcement po jednotlivých Firebase službách. Webový provider a produkční
enforcement jsou zapsané v `BACKEND_TODO.md`.

### Android release podpis

Release build už nikdy nepoužívá společný Flutter debug klíč. Pro podepsaný
release zkopírujte `android/key.properties.example` na
`android/key.properties`, doplňte cestu k vlastnímu `.jks` a hesla. Skutečný
soubor i keystore jsou ignorované Gitem a musí mít samostatnou bezpečnou zálohu.

## Vývojová testovací data

Skripty ve složce `tools` umí vytvořit vývojové uživatele a demo aktivitu kolem
Litoměřic. Podrobný postup je v `tools/README.md`.

Firebase service-account JSON musí zůstat mimo repozitář. Neukládejte jej do
projektu, neposílejte jej do chatu a nikdy jej necommitujte.

## Struktura projektu

- `lib/main.dart` – inicializace aplikace, společné téma a registrace částí
- `lib/src/` – feed, profil, moderace, Shouty, komentáře a sdílené modely
- `lib/auth_gate.dart` – přihlášení, registrace a vstupní uživatelské brány
- `lib/legal.dart` – právní souhlasy a dokumenty
- `lib/l10n/` – stávající lokalizační vrstva
- `assets/avatars/` – vestavěné uživatelské avatary
- `test/` – automatizované Flutter testy
- `tools/` – vývojové administrační a seedovací skripty
- `firestore.rules` – oprávnění a validace Firestore dat
- `BACKEND_TODO.md` – jediný společný projektový backlog

## Lokalizace

Aplikace podporuje češtinu, angličtinu, němčinu a polštinu. Lokalizační systém
je propojený se stávajícím profilem a vývojovým tokem aplikace; jeho změny musí
být prováděny samostatně a ověřeny také s geolokačním feedem.

## Odložená serverová část

Některé operace jsou v klientovi a Firestore připravené, ale vyžadují budoucí
serverovou automatizaci – například úplné zpracování smazání účtu, retenční
lhůty, čištění expirovaného obsahu a push notifikace. Přesný seznam a podmínky
dokončení jsou v `BACKEND_TODO.md`.

## Licence

Projekt je licencován podle souboru `LICENSE`.
