# Audit načítání a nákladů

Lokální implementace z 25. října 2026. Prověřen byl Flutter klient, dotazy a
transakce Firestore, Storage, našeptávač adres, připravená geografická Function
a konfigurace webu. Nejde o měření produkčního účtu. Nasazení, fakturace ani
cloudové pojistky nebyly změněné.

Read-only CLI kontrola potvrdila vývojovou databázi `(default)` projektu
`shoutout-dev-46c81`, edici Standard a region `europe-west3`.

## Opravené zbytečné operace

| Místo | Původně | Po úpravě |
|---|---|---|
| Feed a veřejný profil | Každý snapshot znovu načítal vlastní reakce a uložení všech Shoutů: až 100 GETů pro 50 položek. | Stabilní realtime odběry podle ID Shoutu; změna čítače ani nové modely nespustí další hromadné načtení. Dokumenty sdílejí i otevřené obrazovky. |
| Start a smazání Shoutu | Vedle listenerů se znovu četl feed a seznam blokací. | Poloha přepočítá vzdálenosti z přijatých dokumentů. Smazání doručí existující listener. |
| Identita, role, oznámení, komentáře, soukromé odpovědi, Business, moderace, přístupové kontroly | `snapshots()` vytvářené při překreslení restartovaly odběry; někdy uvnitř jiného listeneru. | Shodné aktivní dotazy a dokumenty sdílejí stabilní stream i poslední událost. |
| Historie vlastních komentářů | Rodičovský Shout se četl zvlášť pro každý komentář, znovu i při překreslení. | Jeden rodičovský GET v rámci snapshotu a jeden Future pro stejný snapshot. Nový snapshot obnoví aktuální rodiče. |
| Detail hlášení | Dva FutureBuildery nezávisle načítaly stejný obsah. | Společný Future pro otevřený detail; změna cíle jej obnoví. |
| Zrušení reakce a vypnutá oznámení | Načítaly se podklady oznámení, které se nemělo poslat. | Nastavení, profil odesílatele a u komentáře titulek Shoutu se čtou pouze v potřebných větvích. |

Zápisy dál používají atomické transakce, původní čítače, rate-limit dokumenty
a pravidla. UI přebírá výsledek transakce místo obrácení aktuálního tlačítka
či přičtení k čítači, který už mohl aktualizovat listener. Tím se předchází
dvojímu přepnutí při souběhu potvrzení zápisu a živých událostí.

Lokálně připravená serverová cesta reakcí na Shouty (26. října) se po zapnutí
`serverShoutReactions` řídí pouze realtime stavem, protože receipt vrací
historické čítače. Otevřený detail přidává jeden sdílený dokumentový odběr
Shoutu; vlastní reakci sdílí s existujícím odběrem feedu/profilu. Neprovádí
GET po kliknutí ani nové odběry při překreslení. Dokumentový odběr se nesdílí
s query feedu a jeho čtení je proto nutné započítat zvlášť; končí zavřením
detailu. Přepínač vývojová konfigurace zapíná pro schválený rollout;
produkční jej nezapíná. Dopad nebyl měřen na účtu Firebase.

Připravené komentářové reakce používají dosavadní realtime seznam komentářů
a vlastní reakci; nepřidávají klientské GETy ani listenery. Server navíc
ověřuje existenci rodičovského Shoutu i bez oznámení, aby nevytvářel reakce
na osiřelé komentáře. Jde o kontrolu integrity v transakci. Nový klientský
přepínač je stále vypnutý; provozní dopad této cesty není měřený.

## Životní cyklus a funkce

`lib/live_data.dart` sdílí aktivní zdroje. Poslední odpojení zruší zdroj i
uloženou hodnotu; další návštěva načítá aktuální data. Klíč zahrnuje uživatele,
Firebase aplikaci, ID databáze a celý dotaz nebo referenci. SDK samo nemusí
v rovnosti referencí rozlišovat databáze. Změna účtu také obnoví přístupový
podstrom aplikace. Chyby se předávají odběratelům; opětovné připojení po
běžném výpadku sítě dál řídí Firestore SDK.

Filtry, velikosti stránek, oprávnění, funkce ani časovače expirace/propagace se
nemění. Oba účastnické dotazy soukromých odpovědí zůstávají oddělené.

Test modeluje 50 položek, 100 sekundárních odběrů a 20 nových verzí feedu:
počet zahájených sekundárních zdrojů zůstává 100. Původní kód by pro těchto
20 dalších snapshotů spustil dalších 2 000 GETů. Test ověřuje i změnu vlastní
reakce/uložení z jiného zařízení a odpojování.

Jde o klientské operace, nikoli změřenou fakturu. Počáteční čtení, skutečné
změny, reconnecty a závislé čtení bezpečnostních pravidel mohou být účtované.
Viz [účtování Firestore](https://firebase.google.com/docs/firestore/pricing)
a [životní cyklus StreamBuilder](https://api.flutter.dev/flutter/widgets/StreamBuilder-class.html).

## Navazující kroky

1. **Ověření na vývojovém webu po schváleném nasazení.** Dvě relace stejného
   účtu, reakce, uložení, profily, oznámení, komentáře, soukromé odpovědi a změna
   účtu. Porovnat síťové přenosy a Firestore metriky v řízeném scénáři.
2. **Serverový prostorový feed.** Aktuálně se stále odebírá posledních 50
   aktivních Shoutů a geografický filtr běží lokálně. Prostorové buňky,
   kurzory a gateway jsou v MVP backlogu. Vyžadují změnu datového toku a testy
   hranic; snížení limitu nebo nahrazení realtime intervalem by omezilo funkce.
3. **Cache webového buildu.** Neversionovaný `main.dart.js` má `no-store`.
   Před změnou ověřit verzování/revalidaci, návrat vydání a Auth handlery;
   dlouhá cache bez ověření by mohla ponechat uživatele na starém klientovi.
4. **Nákladová brána před veřejným Blaze provozem.** Celkový rozpočet,
   doručení alertů, rezerva pod maximem, technické kvóty a nouzový postup podle
   [COST_SAFETY.md](COST_SAFETY.md). Uvedených 5 000 Kč měsíčně není nastavený
   ani garantovaný tvrdý limit.
5. **Ochrana proti zneužití.** Webový App Check nejdřív měřit, potom zapnout
   enforcement; doplnit serverové limity napříč účty/IP a omezení API klíčů.
   Klientské sdílení streamů nebrání útoku přímo na API.
6. **Měřit společnou spotřebu.** Hosting přenosy, Firestore včetně Rules,
   Storage, Functions a geokódování. Návštěvnost sama cenu neurčuje.

Našeptávač adres už má prodlevu 350 ms a minimální délku; hromadné označení
oznámení zapisuje pouze nepřečtená; loga se znovu používají podle cesty/verze;
screenshot podpory se stahuje na vyžádání. Geografická Function má nulové
minimum, omezené instance, vypnuté opakování a aplikační kvótu. Tyto existující
mechanismy nebyly v rámci auditu aktivované nebo měněné v cloudu.

## Ověření

`test/live_data_test.dart` pokrývá sdílení, překreslování, pozdní odběr,
odpojení, nové načtení, chyby/obnovu, klíče skutečného SDK, oddělení účtů a
databází i životní cyklus 50 položek. Testovací závislost
`firebase_core_platform_interface` poskytuje oficiální mock Firebase Core;
verze runtime balíčků se kvůli tomu nezměnily.

Dokončené kontroly této lokální změny:

- `flutter test --no-pub`: všech 145 testů prošlo, z toho 10 testů datových
  streamů; žádný se nepřipojuje k živé Firestore databázi.
- `flutter analyze --no-pub`: bez chyb a upozornění.
- `dart format --output=none --set-exit-if-changed lib test`: všech 83 souborů
  bez potřebné změny; `git diff --check` prošel.
- `node tools/web_environment.mjs build dev --debug` i release varianta
  `node tools/web_environment.mjs build dev`: úspěšně sestaveno do
  `build/web-dev`; release používá stávající lokální vývojovou konfiguraci
  našeptávání adres. Samostatný Wasm build nebyl ověřovaný.
- `node tools/web_environment.mjs check dev --project=shoutout-dev-46c81`:
  ověřený release artefakt pro přesný vývojový cíl, bez nasazení.

Vývojový release byl 25. října 2026 nasazen pouze na Hosting site a projekt
`shoutout-dev-46c81`. Firebase potvrdil vydání verze
`c8ec155e05b4a3b3` do live kanálu. Následná kontrola přes HTTPS potvrdila, že
`/`, `/main.dart.js`, `/app-config.json` a `/auth/action` mají status 200 a
jejich SHA-256 přesně odpovídá ověřenému lokálnímu buildu.

V existující přihlášené Business relaci se načetl feed, profil, Business
nabídka, dvě pobočky, sledované Shouty/profily a prázdná oznámení. Nebyly
prováděné zápisy ani změna účtu, proto nasazení zatím neověřuje reakce, uložení,
souběžnou druhou relaci ani skutečný počet účtovaných operací. Testy ani tento
základní průchod neprokazují dodržení celkového rozpočtu.
