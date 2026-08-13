# Firebase Storage – plán napojení obrázků k hlášení chyb

Firebase Storage v projektu `shoutout-dev-46c81` zatím není inicializované,
protože jeho zapnutí vyžaduje přechod z plánu Spark na placený plán. Textová
hlášení chyb zůstávají funkční; tlačítko pro obrázek je do aktivace skryté.

## Co je připravené

- výběr obrázku z galerie a lokální náhled;
- možnost obrázek před odesláním odebrat;
- povinné potvrzení, že neobsahuje hesla ani zbytečné osobní údaje;
- JPG, PNG a WebP, maximálně 5 MB a zmenšení na šířku 1920 px;
- zobrazení průběhu uploadu;
- cesta `bugReports/{uid}/{reportId}/screenshot` bez veřejné URL;
- metadata obrázku ve Firestore dokumentu `bugReports/{reportId}`;
- připravená `storage.rules`: zápis pouze vlastníkem hlášení, čtení vlastníkem,
  administrátorem nebo ownerem a zákaz přepsání souboru;
- Firestore pravidla pro shodu cesty, typu a velikosti a retence 60 dní.

## Aktivace po přechodu na placený plán

1. Přepnout vývojový Firebase projekt na placený plán a nastavit rozpočtové
   upozornění a nákladový limit, pokud ho platforma dovoluje.
2. Ve Firebase Console otevřít Storage → **Get Started** a založit výchozí bucket
   v evropské oblasti odpovídající projektu, přednostně `europe-west3`.
3. Ověřit, že název bucketu odpovídá `storageBucket` ve
   `lib/firebase_options.dart`; případnou odlišnost opravit přes FlutterFire CLI.
4. Nasadit pravidla s explicitním prostředím:
   `firebase deploy --only storage --project your-project-id`.
5. Změnit `_imageAttachmentsEnabled` v `lib/src/profile_support.dart` na `true`.
6. Sestavit a nasadit web se stejnými produkčními parametry jako běžné demo.

## Povinné ověření před zapnutím

- textové hlášení bez obrázku projde;
- JPG, PNG a WebP pod 5 MB projdou a zobrazí průběh;
- nepovolený typ, prázdný soubor a soubor nad 5 MB jsou odmítnuté;
- obrázek bez potvrzení osobních údajů se neodešle;
- cizí uživatel, moderátor a senior moderátor soubor nepřečtou;
- vlastník hlášení, administrátor a owner soubor přečtou;
- při selhání Firestore zápisu se již nahraný soubor odstraní;
- pravidelný úklid odstraní dokument i soubor po 60 dnech;
- nastavit monitoring velikosti bucketu, počtu uploadů a nákladů.

## Produkční poznámka

Před veřejným spuštěním je vhodné přesunout mazání expirovaných souborů do
plánované serverové úlohy. Samotná hodnota `expiresAt` soubor ze Storage nemaže.
