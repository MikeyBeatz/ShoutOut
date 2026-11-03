# Firebase Storage – Business loga a obrázky k hlášením chyb

Firebase Storage ve vývojovém projektu `shoutout-dev-46c81` slouží pro Business
loga i obrázky přiložené k hlášením chyb. Textová hlášení zůstávají funkční i
bez přílohy. Produkční webové MVP potřebuje vlastní bucket, pravidla a nákladové
pojistky v existujícím projektu `shoutout-production-a1b34`, který aplikace
sdílí s prezentací. Samostatný je Hosting site aplikace, nikoli další projekt.

## Business loga

- Aktivní Business účet může uložit vlastní logo na cestu
  `businessLogos/{uid}/logo-{version}.png`. Klient vytváří čtvercové PNG o
  rozměrech 512 × 512 px; Storage Rules přijímají soubor do 2 MiB.
- Logo mohou číst přihlášení uživatelé, pokud vlastník nemá veřejný marker
  smazaného účtu. Zapsat a smazat ho může pouze vlastník
  s aktivní Business rolí; cesta a verze se ukládají do soukromého i veřejného
  profilu. Podrobnosti jsou v `DATA_MODEL.md`.

## Obrázky k hlášením chyb

- výběr obrázku z galerie a lokální náhled;
- možnost obrázek před odesláním odebrat;
- povinné potvrzení, že neobsahuje hesla ani zbytečné osobní údaje;
- JPG, PNG a WebP, maximálně 2 MB a zmenšení na šířku 1920 px;
- zobrazení průběhu uploadu;
- cesta `bugReports/{uid}/{reportId}/screenshot` bez veřejné URL;
- metadata obrázku ve Firestore dokumentu `bugReports/{reportId}`;
- připravená `storage.rules`: zápis pouze vlastníkem hlášení, čtení vlastníkem,
  administrátorem nebo ownerem a zákaz přepsání souboru;
- Firestore pravidla pro shodu cesty, typu a velikosti a retence 60 dní.

## Stav po aktivaci Blaze a postup pro nové prostředí

Blaze i vývojový Storage bucket jsou aktivní. Následující postup zůstává
zachovaný pro obnovu nebo založení dalšího prostředí; nákladové pojistky se řídí
samostatným dokumentem `docs/COST_SAFETY.md`.

1. Ověřit Blaze, správný billing account a dokončený checklist nákladových
   pojistek. Samotné rozpočtové upozornění účtování nezastaví.
2. Ve Firebase Console otevřít Storage → **Get Started** a založit výchozí bucket.
   Vývojový bucket je v bezplatném umístění `US-EAST1`; evropské umístění by bylo
   účtované, proto nebylo zvoleno.
3. Při prvním nasazení pravidel používajících `firestore.get()` nebo
   `firestore.exists()` potvrdit výzvu Firebase CLI k přidělení role
   `roles/firebaserules.firestoreServiceAgent` Storage service agentovi. Bez této
   role se přihlášenému Business účtu upload zamítne jako `storage/unauthorized`.
4. Ověřit, že název bucketu odpovídá `storageBucket` ve
   `lib/firebase_options.dart`; případnou odlišnost opravit přes FlutterFire CLI.
5. Nasadit pravidla s explicitním prostředím:
   `firebase deploy --only storage --project your-project-id`.
6. Ověřit, že `_imageAttachmentsEnabled` v `lib/src/profile_support.dart` je `true`
   pro přílohy hlášení chyb, a samostatně ověřit upload Business loga.
7. Web sestavit s konfigurací cílového projektu; produkční aplikace patří na
   app site `shoutout-go-a1b34` pro `go.shoutout-app.eu`, nikoli na Hosting site
   statické prezentace ve stejném produkčním projektu.

## Povinné ověření před zapnutím příloh a log

- aktivní Business účet nahraje a nahradí logo; běžný uživatel ani cizí Business
  účet ho nezapíše a přihlášený uživatel ho může zobrazit;
- textové hlášení bez obrázku projde;
- JPG, PNG a WebP do 2 MB projdou a zobrazí průběh;
- nepovolený typ, prázdný soubor a soubor nad 2 MB jsou odmítnuté;
- obrázek bez potvrzení osobních údajů se neodešle;
- cizí uživatel, moderátor a senior moderátor soubor nepřečtou;
- vlastník hlášení, administrátor a owner soubor přečtou;
- při selhání Firestore zápisu se již nahraný soubor odstraní;
- pravidelný úklid odstraní dokument i soubor po 60 dnech;
- nastavit monitoring velikosti bucketu, počtu uploadů a nákladů.

## Produkční poznámka

V DEV je od dokončení account purge schváleně vypnutý soft delete bucketu,
aby budoucí smazání účtových souborů po 60 dnech nepřidávalo obnovitelných
sedm dní. Produkční politika tím není rozhodnutá. Account purge je ověřený
pro vlastní businessLogos/bugReports prefix, nikoli obecný cleanup všech
hlášení aktivních účtů. [Protokol a důkazy](ACCOUNT_RETENTION_PURGE_PLAN.md).

Před veřejným spuštěním je vhodné přesunout mazání expirovaných souborů do
plánované serverové úlohy. Samotná hodnota `expiresAt` soubor ze Storage nemaže.
