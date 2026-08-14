# ShoutOut – plán mobilního testování a distribuce

Tento runbook popisuje cestu od současného vývoje ve Windows k testování přes
Google Play a TestFlight a následně k veřejné distribuci. Podmínky obchodů byly
ověřené 14. srpna 2026. Protože se mohou změnit, před placením účtů a před každým
prvním odesláním znovu projděte odkazy v části **Aktuální oficiální požadavky**.

## Co zůstává společné

Hlavní vývoj pokračuje ve Windows ve VS Code a Flutteru. Android Emulator je
vhodný pro každodenní vývoj; iOS kód, Firebase konfiguraci, lokalizace a většinu
společné logiky lze připravovat také ve Windows. Obchodní build ale vždy musí
vzniknout z přesně označeného commitu, s produkční Firebase konfigurací a bez
vývojových účtů nebo tajemství v repozitáři.

Před první distribucí obou platforem:

1. Splnit [produkční bránu](LAUNCH_READINESS.md) a povinné scénáře v
   [testovací strategii](TESTING.md).
2. Vytvořit oddělený produkční Firebase projekt a produkční mobilní aplikace.
3. Připravit zásady soukromí, kontakty podpory, popis zpracování dat, věkové
   hodnocení, screenshoty a přístup pro kontrolora k funkcím vyžadujícím účet.
4. Zajistit verzování, podepisování, zálohu klíčů a možnost dohledat zdrojový
   commit každého distribuovaného buildu.
5. Testovat také na skutečných telefonech. Emulátor nenahradí ověření GPS,
   systémových oprávnění, e-mailových odkazů, výkonu, přerušení aplikace ani
   chování konkrétních výrobců.

## Android přes Google Play

### Aktuální stav projektu

`android/app/build.gradle.kts` přebírá `compileSdk` a `targetSdk` z Flutteru.
Používaný Flutter 3.44.8 nastavuje obě hodnoty na API 36, takže projekt již
cílí na Android 16. Před uploadem to znovu ověřte ve výsledku sestavení; při
změně Flutter SDK se nespoléhejte pouze na tento záznam.

Od 31. srpna 2026 musí nové telefonní aplikace a jejich aktualizace odesílané na
Google Play cílit na Android 16 / API 36 nebo vyšší. Vyšší `targetSdk` nestačí
jen nastavit: před distribucí je nutná regrese změn chování Androidu 16.

### Účet a zařízení

- Play Console vyžaduje ověřený vývojářský účet.
- Nový osobní účet musí ověřit identitu a kontaktní údaje.
- Google u nových osobních účtů vyžaduje ověření přístupu k fyzickému,
  nerootovanému Android telefonu s Androidem 10 nebo novějším přes mobilní
  aplikaci Play Console. Telefon lze pro tento krátký krok půjčit; nemusí být
  trvalou součástí vývojové sestavy.
- Fyzický Android telefon tedy není nutný pro každodenní vývoj, ale úplně bez
  přístupu k němu nelze u nového osobního účtu spoléhat na dokončení distribuce.

### Postup

1. Založit a ověřit správný typ Play Console účtu.
2. Vytvořit produkční Firebase Android aplikaci a bezpečné přepínání konfigurace.
3. Vytvořit vlastní upload keystore podle
   [provozního runbooku](SETUP_AND_OPERATIONS.md), zálohovat ho mimo Git a v Play
   Console použít Play App Signing.
4. Ověřit API 36, oprávnění a změny chování Androidu 16 na emulátoru i skutečném
   telefonu.
5. Zvýšit verzi v `pubspec.yaml` a z označeného commitu vytvořit podepsaný AAB:

   ```powershell
   $geoConfig = Get-Content -Raw -Encoding UTF8 .geoapify.json | ConvertFrom-Json
   flutter build appbundle --release --dart-define="GEOAPIFY_API_KEY=$($geoConfig.GEOAPIFY_API_KEY)"
   ```

6. V Play Console založit ShoutOut, doplnit store listing, Data safety, věkové
   hodnocení, zásady soukromí, cílové publikum a instrukce/přihlašovací účet pro
   kontrolu aplikace.
7. Nahrát AAB do **Internal testing**, přidat malou skupinu a opravit první
   instalační, přihlašovací a provozní chyby. Internal testing je doporučený,
   nikoli povinný.
8. Přejít na **Closed testing**. Pokud jde o osobní účet vytvořený po
   13. listopadu 2023, musí zůstat nejméně 12 testerů přihlášených nepřetržitě
   posledních 14 dní. Je rozumné pozvat rezervu nad 12 lidí, hlídat jejich stav
   a uchovat konkrétní zpětnou vazbu a přehled provedených oprav.
9. Po splnění podmínek požádat o Production access. Samotných 12 přihlášených
   účtů nezaručuje schválení; Google se ptá na zapojení testerů, zpětnou vazbu,
   změny po testu a připravenost aplikace.
10. Po udělení přístupu provést poslední release kontrolu a aplikaci vydat
    postupně, ideálně staged rolloutem.

Zkrácená cesta:

`Windows → Flutter/Android Emulator → fyzická kontrola → podepsaný AAB → Internal testing → Closed testing → Production access → Google Play`

## iOS bez vlastního Macu

### Co už je připravené

Vývojová iOS aplikace je ve Firebase zaregistrovaná jako
`cz.shoutout.app.dev`. Repozitář obsahuje vývojovou Firebase konfiguraci,
oprávnění, Google OAuth URL schéma, App Check providery, ikony a startovní
obrazovku. Pro veřejnou distribuci se vytvoří samostatná produkční identita;
vývojový bundle ID ani vývojový Firebase projekt se do App Storu nepoužijí.

### Účet a Mac

- TestFlight a App Store vyžadují aktivní členství v Apple Developer Programu.
- Mac není nutné vlastnit, ale sestavení, podpis, archivace a upload iOS aplikace
  vyžadují macOS a Xcode. Lze použít pronajatý cloudový Mac.
- Od 28. dubna 2026 musí být uploady do App Store Connect sestavené pomocí
  Xcode 26 nebo novějšího a iOS 26 SDK nebo novějšího. Při skutečném pronájmu
  vždy ověřit tehdy platný požadavek a konkrétní verzi obrazu cloudového Macu.
- Vlastní iPhone je potřeba pro věrohodný fyzický test; ShoutOut jej už má k
  dispozici.

Apple členství má smysl zaplatit až blízko prvnímu TestFlight buildu, aby
z ročního období zbytečně neubíhaly měsíce. Je ale vhodné nechat rezervu na
ověření identity. Cloudový Mac pronajímat jen na dobu buildů a oprav nativní
konfigurace.

### Bezpečnost cloudového Macu

1. Použít důvěryhodného poskytovatele s aktuálním Xcode a izolovaným účtem.
2. Projekt přenést přes soukromý Git a checkout přesného tagu/commitu; neposílat
   zip se soubory obsahujícími hesla nebo lokální konfiguraci.
3. Podpisové certifikáty, provisioning profily a App Store Connect klíče nikdy
   necommitovat. Upřednostnit automatickou správu podpisu v Xcode a nejmenší
   nutná oprávnění.
4. Po práci se odhlásit z Apple účtu, odstranit lokální klíče a projekt a ukončit
   nebo zrušit cloudovou instanci. Při pochybnostech certifikát či relaci odvolat.

### Postup

1. Založit Apple Developer Program jako správný typ subjektu. U individuálního
   účtu se jako prodejce zobrazuje občanské jméno; organizace potřebuje právní
   subjekt a D‑U‑N‑S číslo.
2. Vytvořit produkční Firebase iOS aplikaci a konečný Bundle ID, přenést projekt
   přes Git na cloudový Mac a nainstalovat kompatibilní Flutter SDK.
3. Spustit `flutter pub get`, sestavit iOS variantu a otevřít
   `ios/Runner.xcworkspace` v aktuálním Xcode.
4. Nastavit Team, Signing & Capabilities, produkční Bundle ID, App Check,
   oprávnění a případné Associated Domains nebo push notifikace podle skutečně
   zapnutých funkcí.
5. Ověřit debug build na vlastním iPhonu, projít hlavní scénáře a teprve potom
   vytvořit release Archive.
6. Z Xcode nahrát archiv do App Store Connect a vyplnit App Privacy, věkové
   hodnocení, exportní kryptografické otázky, údaje pro EU/DSA, screenshoty,
   kontakty a instrukce pro kontrolu.
7. Pro vlastní test použít interní TestFlight skupinu. Externí testeři mohou
   vyžadovat Beta App Review; první build přidaný do externí skupiny se ke
   kontrole odesílá. Jeden TestFlight build je použitelný nejvýše 90 dní.
8. Opravy vydávat jako nové buildy se zvýšeným build number. Až bude kandidát
   připravený, vybrat ho pro App Review a po schválení řízeně vydat do App Storu.

Zkrácená cesta:

`Windows → Git → cloudový Mac → Flutter/Xcode → fyzický iPhone → Archive → App Store Connect → TestFlight → App Review → App Store`

## Aktuální oficiální požadavky

- [Google Play – target API level](https://developer.android.com/google/play/requirements/target-sdk)
- [Google Play – požadavky testování nových osobních účtů](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Google Play – ověření fyzického Android zařízení](https://support.google.com/googleplay/android-developer/answer/14316361?hl=en)
- [Apple – aktuální požadavky Xcode a SDK](https://developer.apple.com/news/upcoming-requirements/)
- [Apple – TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)

## Technické náklady na první veřejnou verzi

Odhad používá kurz **25 Kč/USD**. Počítá s vydáním na Google Play i App Storu,
jednoduchým veřejným webem na vlastní `.cz` doméně a současnou architekturou
Firebase. Marketing, placení testeři, mzdy a provize z případného prodeje nejsou
zahrnuté.

### První oficiálně distribuovaná verze

| Položka | Odhad |
|---|---:|
| Google Play – plná distribuce | 625 Kč jednorázově |
| Apple Developer Program | 2 475 Kč na první rok |
| cloudový Mac pro první iOS build a odeslání | 625 Kč |
| `.cz` doména na první rok | 300 Kč |
| e-mail na vlastní doméně na první měsíc | 100 Kč |
| Firebase Hosting, SSL a nasazení jednoduchého webu | 0 Kč |
| Firebase/Google Cloud – první skutečná spotřeba | 0–500 Kč |
| **očekávaný přímý výdaj** | **4 100–4 700 Kč** |
| **rezerva na daň, kurz, opakovaný iOS build a cloudové překročení** | **2 300–2 900 Kč** |
| **doporučená hotovost pro první veřejnou verzi** | **7 000 Kč** |

Sedm tisíc je konečný rozpočet prvního vydání včetně rezervy, nikoli částka, ke
které se má ještě přičíst další „první měsíc“.

### Měsíční provoz do 10 000 aktivních uživatelů

Pro odhad znamená 10 000 **měsíčně aktivních uživatelů**, přibližně 2 000 denně
aktivních, dvě návštěvy aplikace denně, nejvýše 100 Firestore čtení na návštěvu,
300 nových Shoutů denně a jen jednotky GiB screenshotů hlášení a Business log.

| Položka | Odhad za měsíc |
|---|---:|
| Apple členství a `.cz` doména rozpočítané na měsíce | 230 Kč |
| e-mail na vlastní doméně | 0–100 Kč |
| cloudový Mac / iOS release buildy | 0–625 Kč |
| Firebase Auth, App Check, FCM a Crashlytics | 0 Kč |
| Firestore, Functions, Storage, Hosting a přenos dat | 0–500 Kč |
| Google geocoding do 10 000 volání a Geoapify do 3 000 kreditů denně s povinnou atribucí | 0 Kč |
| **očekávaný technický provoz** | **500–1 500 Kč** |
| **provozní rezerva** | **1 500 Kč** |
| **doporučený měsíční rozpočet včetně rezervy** | **3 000 Kč** |

Rozpočet 3 000 Kč platí jen při uvedeném využití. Největší rizika překročení jsou
častější znovunačítání Firestore listenerů, více než 10 000 nových Shoutů a tedy
geocodingů měsíčně, velké obrázky a neočekávaný přenos dat. Před spuštěním Blaze
se proto nastaví billing alerty a API kvóty; samotný alert účet automaticky
nezastaví.

Aktuální podklady: [Google Play](https://support.google.com/android-developer-console/answer/16640817?hl=en),
[Apple](https://developer.apple.com/programs/enroll/),
[MacinCloud](https://checkout.macincloud.com/select),
[Firebase](https://firebase.google.com/pricing),
[Firestore](https://cloud.google.com/firestore/pricing),
[Google Maps](https://developers.google.com/maps/billing-and-pricing/pricing),
[Geoapify](https://www.geoapify.com/pricing/) a
[`.cz` doména](https://www.forpsi.com/domain/).
