# Prezentační web ShoutOut

## Rozhodnutý rozsah

Doména **`shoutout-app.eu`** byla pořízena u Hostingeru. V první etapě bude
sloužit výhradně jako veřejný prezentační web ShoutOutu.

Web nyní nebude obsahovat:

- přihlášení, registraci ani Firebase Authentication,
- komunitní feed, tvorbu Shoutů nebo jiné části Flutter aplikace,
- pracovní rozhraní pro Business, moderaci nebo veřejnou správu,
- odkazy do Google Play nebo App Storu; mobilní aplikace dosud není veřejně
  vydaná.

Tato etapa není vydáním MVP ani veřejným spuštěním aplikace. Je samostatná od
produkčního prostředí aplikace popsaného v `LAUNCH_READINESS.md`.

## Hosting a doména

- Hostinger je nyní registrátor a správce DNS domény.
- Obsah prezentačního webu hostuje Firebase Hosting v samostatném produkčním
  Firebase projektu; **není** připojen k vývojovému projektu
  `shoutout-dev-46c81`.
- Dne 21. září 2026 byl ve Firebase Console vytvořen projekt `ShoutOut
  Production` s ID `shoutout-production-a1b34`. Má výchozí Firebase Hosting
  site a je na bezplatném plánu Spark. Gemini in Firebase ani Google Analytics
  nejsou zapnuté.
- Statický web je nasazený a dostupný na `https://shoutout-app.eu` i výchozí
  Firebase adrese. Obsah lokálního `presentation/` odpovídá nasazené verzi.
- Doména `shoutout-app.eu` je připojená k Firebase Hosting a HTTPS funguje.
- `www.shoutout-app.eu` zatím vrací 404; je potřeba jej připojit a nastavit
  přesměrování na `https://shoutout-app.eu`.

## Co patří až k MVP

Po vydání MVP se odděleně rozhodne o webovém přístupu Business účtů a rolí
moderace či veřejné správy. Doporučené je pro něj samostatné subdoménové
rozhraní (například `app.shoutout-app.eu` nebo `admin.shoutout-app.eu`), ale
název ani technické zapojení zatím nejsou rozhodnuté.

Až tato část vznikne, bude vyžadovat vlastní návrh přihlašovací brány, nastavení
Firebase Authentication autorizovaných domén a případně globální Action URL
`/auth/action`. Tyto kroky nejsou součástí prezentačního webu.

## Následující pořadí práce

1. [x] Připravit a nasadit statický obsah prezentačního webu na Firebase
   Hosting.
2. [x] Připojit hlavní doménu ve Firebase Hosting, nastavit DNS v Hostingeru a
   ověřit HTTPS.
3. [ ] Připojit `www.shoutout-app.eu`, nastavit přesměrování a ověřit jej.

Nasazení, vytvoření Firebase projektu a změna DNS jsou externí změny a provádějí
se až po výslovném potvrzení uživatelem.
