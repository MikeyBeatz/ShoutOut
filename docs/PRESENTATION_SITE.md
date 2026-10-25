# Prezentační web ShoutOut

## Rozhodnutý rozsah

Doména **`shoutout-app.eu`** byla pořízena u Hostingeru a slouží jako veřejný
vstupní a prezentační web ShoutOutu. Lokální verze má tlačítko **Otevřít
ShoutOut** s odkazem na `https://go.shoutout-app.eu`; samotná aplikace zůstává
na samostatném Hosting webu. Tlačítko se má nasadit společně se zprovozněním
cílové aplikace, aby veřejně nevedlo na nedostupný cíl.

Prezentační web neobsahuje:

- přihlášení, registraci ani Firebase Authentication,
- komunitní feed, tvorbu Shoutů nebo jiné části Flutter aplikace,
- pracovní rozhraní pro Business, moderaci nebo veřejnou správu,
- odkazy do Google Play nebo App Storu; mobilní aplikace dosud není veřejně
  vydaná.

Tato etapa není vydáním MVP ani veřejným spuštěním aplikace. Produkční webové
MVP vznikne odděleně podle `LAUNCH_READINESS.md`.

## Hosting a doména

- Hostinger je nyní registrátor a správce DNS domény.
- Obsah prezentačního webu hostuje Firebase Hosting v samostatném produkčním
  Firebase projektu sdíleném s budoucí produkční aplikací; není připojen
  k vývojovému projektu `shoutout-dev-46c81`.
- Dne 21. září 2026 byl ve Firebase Console vytvořen projekt `ShoutOut
  Production` s ID `shoutout-production-a1b34`. Má výchozí Firebase Hosting
  site a je na bezplatném plánu Spark. Gemini in Firebase ani Google Analytics
  nejsou zapnuté.
- Statický web je nasazený a dostupný na `https://shoutout-app.eu` i výchozí
  Firebase adrese. Nové lokální tlačítko z 25. října 2026 zatím není nasazené;
  aktuální nasazený obsah nebyl při této změně znovu ověřen.
- Doména `shoutout-app.eu` je připojená k Firebase Hosting a HTTPS funguje.
- `www.shoutout-app.eu` zatím vrací 404; je potřeba jej připojit a nastavit
  přesměrování na `https://shoutout-app.eu`.

## Webová aplikace pro MVP

Veřejná aplikace pro běžné a Business účty bude na
`go.shoutout-app.eu`. Od rozhodnutí 25. října 2026 použije společný projekt
`shoutout-production-a1b34`, ale nový samostatný Hosting web. Výchozí site
`shoutout-production-a1b34` zůstává vstupní stránce. Dne 25. října 2026 byl
vytvořen app site `shoutout-go-a1b34`, propojený s webovou aplikací `ShoutOut
Web Production`; SDK konfigurace je v `config/prod.json`. App build ani vlastní
doména zatím nejsou připravené k veřejnému provozu: build čeká na první release,
doména má ověřený CNAME a Firebase potvrzuje stav `Connected` s platným HTTPS.
Moderátorské
rozhraní bude součástí aplikace s přístupem podle role. Produkční web vyžaduje
vlastní konfiguraci Firebase Authentication, autorizovanou doménu a Action URL
`/auth/action`.

Kořenový `firebase.json` v repozitáři patří Flutter aplikaci, zatímco
`presentation/firebase.json` patří této statické stránce. Nasazení musí vždy
explicitně určit správný adresář, Firebase projekt a Hosting site. Lokální
`presentation/firebase.json` má site vstupní stránky zadaný výslovně; generovaná
konfigurace aplikace nesmí použít stejný site. Podrobnosti jsou ve
[WEB_ENVIRONMENTS.md](WEB_ENVIRONMENTS.md).

## Následující pořadí práce

1. [x] Připravit a nasadit statický obsah prezentačního webu na Firebase
   Hosting.
2. [x] Připojit hlavní doménu ve Firebase Hosting, nastavit DNS v Hostingeru a
   ověřit HTTPS.
3. [ ] Připojit `www.shoutout-app.eu`, nastavit přesměrování a ověřit jej.

Nasazení, vytvoření Firebase projektu a změna DNS jsou externí změny a provádějí
se až po výslovném potvrzení uživatelem.
