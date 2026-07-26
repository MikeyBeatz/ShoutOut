# ShoutOut – backend TODO

Tento seznam zachycuje funkce, které jsou v klientovi nebo datovém modelu
připravené, ale před produkčním vydáním vyžadují důvěryhodné serverové
zpracování. Neimplementovat je pouze v klientovi – uživatel může klientský kód
obejít.

## 1. Oddělit vývojové a produkční prostředí

- vytvořit samostatný produkční Firebase projekt,
- vytvořit samostatné Android a webové Firebase aplikace,
- nepřenášet testovací uživatele ani demo data do produkce,
- zdokumentovat bezpečné přepínání konfigurace při buildu,
- nastavit rozpočtové limity a upozornění,
- ověřit, že administrační service account není v repozitáři ani historii Gitu.

Hotovo, když nelze omylem spustit vývojové seedovací skripty proti produkci a
vývojový build nepoužívá produkční data.

## 2. Zpracování žádosti o smazání účtu

Klient nyní zapisuje dokument do `accountDeletionRequests` a přístup do aplikace
zablokuje `DeletionRequestGate`.

Serverová automatizace musí:

- atomicky převzít novou žádost a zaznamenat stav zpracování,
- okamžitě skrýt veřejné Shouty a další veřejný obsah uživatele,
- zneplatnit aktivní relace a zakázat další přihlášení,
- odstranit nebo deaktivovat Firebase Authentication účet,
- uvolnit nebo bezpečně rezervovat přezdívku podle výsledné produktové politiky,
- odstranit soukromá data, která není nutné uchovávat,
- označit bezpečnostní záznamy retenčním termínem 60 dnů,
- po uplynutí lhůty data odstranit nebo nevratně anonymizovat,
- bezpečně opakovat zpracování bez dvojích nebo nekonzistentních změn,
- zaznamenat auditní výsledek bez ukládání nadbytečných osobních údajů.

Hotovo, když automatizovaný integrační test pokryje běžnou žádost, opakované
spuštění, částečné selhání a dokončení 60denní retence.

## 3. Čištění expirovaných Shoutů

- pravidelně vyhledat Shouty po skončení platnosti,
- změnit jejich stav bez spoléhání na čas klientského zařízení,
- po sedmi dnech odstranit Shout a jeho podkolekce,
- respektovat obsah dočasně zadržený kvůli hlášení nebo bezpečnostnímu auditu,
- doplnit potřebné Firestore indexy,
- měřit počet úspěšných a chybných zpracování.

Firestore nemaže podkolekce automaticky. Mazání musí explicitně zahrnout
komentáře, reakce, uložení a soukromé odpovědi.

Hotovo, když testovací Shout projde stavy aktivní → expirovaný → odstraněný a
nezůstanou po něm osiřelé dokumenty.

## 4. Push notifikace a centrum oznámení

Klient už ukládá uživatelské preference v `users/{uid}/settings/notifications`
a obsahuje stránku oznámení.

Zbývá:

- přidat Firebase Cloud Messaging a správu tokenů zařízení,
- bezpečně odstraňovat neplatné a odhlášené tokeny,
- vytvářet oznámení pro relevantní komentáře, odpovědi, soukromé odpovědi,
  varování a moderátorské události,
- respektovat jednotlivé uživatelské preference,
- zabránit tomu, aby notifikace prozradila obsah blokovaného uživatele,
- ukládat stav přečtení pro centrum oznámení,
- omezit četnost a slučovat nadbytečné události,
- neodesílat testovací notifikace skutečným uživatelům.

Hotovo, když lze notifikaci doručit na Android i web, vypnutí preference ji
spolehlivě zastaví a odhlášení odstraní nebo deaktivuje token.

## 5. Moderace a důvěryhodné serverové operace

- ponechat přidělení moderátora pouze v Admin SDK nebo jiném zabezpečeném toku,
- přesunout citlivé vícekrokové moderátorské akce do serverové operace,
- auditovat varování, bany, odstranění obsahu a uzavření hlášení,
- zajistit idempotenci moderátorských akcí,
- doplnit rate limiting hlášení a ochranu proti spamu,
- rozhodnout, které automatické prahy jsou pouze UI pomůcka a které se mají
  vynucovat serverově.

Hotovo, když běžný klient nemůže vytvořit moderátora, obejít ban ani podvrhnout
auditní údaje moderátorské akce.

## 6. Bezpečnost a provoz

- přidat automatické testy Firestore Rules přes Firebase Emulator Suite,
- zapnout a ověřit Firebase App Check pro podporované klienty,
- nastavit monitoring chyb, alerty a audit provozních automatizací,
- stanovit zálohování a obnovu Firestore,
- definovat retenční politiku logů a exportů,
- otestovat nákladové limity pro dotazy, listenery a plánované úlohy,
- provést bezpečnostní kontrolu před produkčním nasazením.

Hotovo, když CI ověřuje pravidla proti sadě povolených i zakázaných operací a
provozní selhání vyvolá dohledatelné upozornění.

## 7. Předprodukční kontrola

- právní texty odpovídají skutečně nasazeným retenčním procesům,
- podporované platformy mají vlastní produkční Firebase konfiguraci,
- všechny serverové úlohy mají lokální/emulátorové testy,
- existuje postup nasazení, návratu verze a řešení částečného selhání,
- produkce neobsahuje `@shoutout.test` účty ani demo data z Litoměřic.
