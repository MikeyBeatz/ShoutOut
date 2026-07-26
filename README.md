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

## Vývojová testovací data

Skripty ve složce `tools` umí vytvořit vývojové uživatele a demo aktivitu kolem
Litoměřic. Podrobný postup je v `tools/README.md`.

Firebase service-account JSON musí zůstat mimo repozitář. Neukládejte jej do
projektu, neposílejte jej do chatu a nikdy jej necommitujte.

## Struktura projektu

- `lib/` – aplikace, autentizace, právní texty a lokalizace
- `assets/avatars/` – vestavěné uživatelské avatary
- `test/` – automatizované Flutter testy
- `tools/` – vývojové administrační a seedovací skripty
- `firestore.rules` – oprávnění a validace Firestore dat
- `BACKEND_TODO.md` – funkce odložené do serverové části

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
