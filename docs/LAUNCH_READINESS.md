# ShoutOut – připravenost před veřejným spuštěním

## Nový právní milník

- [x] Prověřit a naplánovat registraci evropské ochranné známky ShoutOut:
  rešerši kolizí, vlastníka, relevantní třídy výrobků a služeb, rozpočet a termín
  podání u EUIPO; před podáním využít odbornou právní kontrolu.

Tento dokument je hlavní kontrolní seznam pro rozhodnutí, zda lze veřejně
spustit webové MVP pro běžné uživatele a Business účty. Nejde o marketingový
plán. Jednotlivé implementační úkoly a jejich technické podrobnosti zůstávají v
`docs/TODO.md`; povinné ruční scénáře jsou v `docs/TESTING.md`.

Webové MVP zahrnuje všechny současné webové funkce a dokončení rozpracovaných
toků běžného a Business účtu. Moderátorské rozhraní musí umožnit bezpečný
provoz. Mobilní vydání a placená Business monetizace následují po webovém MVP;
jejich postupy a produktová rozhodnutí zůstávají zachované v navazujících
plánech. Změna rozsahu MVP musí být zapsaná současně zde i v `docs/TODO.md`.
Checkboxy pod nadpisy **Pozdější mobilní distribuce** a **Pozdější Business
monetizace** ani produktové metriky v části 7 neblokují webové vydání.

Pořadí práce: produkční webový základ → bezpečnost a právní kontrola → ruční
testy běžných a Business toků → provozní připravenost → startovní brána.

## 1. Produkční prostředí a bezpečné nasazení

- [ ] Vytvořit samostatný produkční Firebase projekt aplikace, oddělený od
  vývojového projektu i od projektu statické prezentace.
- [ ] Přidat bezpečné přepínání vývojové a produkční konfigurace.
- [ ] Zabránit seedovacím, testovacím a migračním nástrojům zasáhnout produkci.
- [ ] Vytvořit minimálně oprávněné service accounts a uložit klíče a hesla mimo
  Git.
- [ ] Prověřit historii Gitu na privátní klíče, hesla a service-account soubory.
- [ ] Připravit a vyzkoušet nasazení, rollback, obnovu a řešení částečného
  selhání.
- [ ] Nastavit rozpočty, nákladové limity, kvóty a upozornění.
- [ ] Připojit vlastní doménu, autorizované Auth domény a správnou Action URL.
- [ ] Nastavit veřejný název, odesílatele a lokalizované e-mailové šablony.
- [ ] Omezit produkční Geoapify klíč na správné domény a nastavit kvótu.
- [ ] Nakonfigurovat App Check pro produkční web, nejprve sledovat
  metriky a až potom zapnout vynucení.
- [ ] Dokončit ochranu webového klienta a registrace proti zneužití.
- [ ] Aktivovat placené serverové služby až po dokončení bezplatných příprav a
  pouze v rozsahu nezbytném pro bezpečné webové MVP.

## 2. Webová aplikace a veřejná distribuce MVP

- [ ] Připravit `social.shoutout-app.eu` a Hosting v produkčním projektu
  aplikace; prezentace na `shoutout-app.eu` zůstává v původním projektu.
- [ ] Sestavit a nasadit produkční web s konfigurací správného Firebase
  projektu, Auth Action URL a autorizovaných domén.
- [ ] Ověřit, že běžný účet má na webu feed a tvorbu Shoutů, Business účet své
  funkce a moderátorské cesty jsou přístupné pouze oprávněným rolím.
- [ ] Ověřit, že veřejné odkazy vedou výhradně do produkčního prostředí.

### Pozdější mobilní distribuce

Podrobný postup a časově citlivé požadavky obchodů zůstávají v plánu
[mobilního testování a distribuce](MOBILE_DISTRIBUTION_PLAN.md); před placením
nebo uploadem je znovu ověřte u Googlu a Applu.

- [ ] Dokončit podepsaný Android release a bezpečně zálohovat produkční klíč.
- [ ] Připravit Google Play záznam, ochranu dat, věkové hodnocení a materiály.
- [ ] Projít požadovaným interním nebo uzavřeným testováním Google Play.
- [ ] Připojit iOS projekt k produkčnímu Firebase a doplnit podpisy, oprávnění,
  polohu a ostatní používané služby.
- [ ] Otestovat iOS build na skutečném iPhonu.
- [ ] Připravit App Store Connect a projít schválením App Store.
- [ ] Vydat Android i iOS pro běžné i privilegované účty. Produkční web zůstává
  dostupný běžným i Business účtům.

## 3. Stabilita hlavních uživatelských cest

- [ ] Ověřit první otevření, přihlášení, odhlášení a návrat do webové aplikace.
- [ ] Ověřit běžnou registraci, potvrzení e-mailu, přezdívku, avatar a onboarding.
- [ ] Ověřit Business registraci, potvrzení e-mailu, čekací stav, zrušení žádosti
  a administrátorské schválení.
- [ ] Ověřit reset hesla včetně neplatného, použitého a expirovaného odkazu.
- [ ] Ověřit smazání účtu, okamžité odhlášení, opětovné použití stejného e-mailu
  a zmizení jeho obsahu z aplikace.
- [ ] Ověřit vytvoření Shoutu v mobilním i desktopovém prohlížeči mimo
  Litoměřice.
- [ ] Ověřit feed, poloměr, řazení, kategorie, filtry a navigaci.
- [ ] Ověřit Shouty, komentáře, odpovědi, reakce, ukládání a expiraci.
- [ ] Ověřit Follow, veřejné profily, blokování a hlášení.
- [ ] Ověřit oznámení uvnitř aplikace a uživatelské preference.
- [ ] Ověřit Business pobočky, jejich názvy, adresy a polohu Shoutů.
- [ ] Ověřit zvýraznění, propagační okénko a prodlouženou platnost.
- [ ] Ověřit Business ověření, hlášení chyb, postihy, jejich zrušení a audit.
- [ ] Otestovat pomalé a přerušované připojení.
- [ ] Otestovat světlý, tmavý a systémový režim a všech sedm jazyků.
- [ ] Otestovat mobilní web i desktop v podporovaných šířkách.
- [ ] Spustit webový build a relevantní CI a odstranit blokující chyby release
  kandidáta.

Testy fyzického Androidu a iPhonu zůstávají podmínkou pozdějšího mobilního
vydání podle `TESTING.md` a `MOBILE_DISTRIBUTION_PLAN.md`.

## 4. Business základ pro webové MVP

- [ ] Schválit kritéria ruční kontroly Business žádostí, řešení duplicit,
  sporů a změn identifikačních údajů podle `BUSINESS_VERIFICATION.md`.
- [ ] Doplnit a otestovat zamítnutí žádosti a pozastavení Business účtu včetně
  odebrání oprávnění, odůvodnění a auditu; dnes funguje jen schválení.
- [ ] Ověřit celý tok Business účtu od registrace a aktivace přes pobočky a
  vlastní logo až po publikování a bezplatnou propagaci.
- [ ] Dokončit serverová oprávnění a limity současných bezplatných Business
  promo funkcí; nárok a použití oddělit od budoucí ceny.
- [ ] Odstranit položku **Tokeny** a skrýt **Nákupy a faktury** i nefunkční
  statistiky propagace; ověřit, že web nenabízí slepé platební cesty ani
  tokenové texty.

### Pozdější Business monetizace

- [ ] Schválit podobu předplatného, ceny, období a rozsah placených Business
  oprávnění bez tokenového modelu.
- [ ] Zavést serverově řízený stav předplatného, audit a oprávnění, která si
  klient nemůže sám přiznat.
- [ ] Navrhnout a implementovat platební tok předplatného; dosavadní záměr
  Stripe, karty, Apple Pay a Google Pay ověřit pro zvolený model a platformy,
  serverové potvrzení zpracovávat idempotentně.
- [ ] Dokončit fakturaci, DPH/VAT, měny, doklady, refundace a chargebacky.
- [ ] Důvěryhodně měřit a zobrazit Business dosah, zobrazení, rozkliknutí a
  související monetizační metriky.
- [ ] Navrhnout správu předplatného a dokladů v Business rozhraní a uzavřít
  Founder zvýhodnění, případný větší dosah a kosmetickou nabídku.

## 5. Důvěryhodné serverové procesy

- [ ] Zajistit okamžité skrytí obsahu zablokovaného nebo smazaného účtu.
- [ ] Automatizovat dokončení žádosti o smazání účtu a 60denní retenci.
- [ ] Automatizovat expiraci Shoutů a odstranění jejich podkolekcí.
- [ ] Zabránit upravenému klientovi podvrhnout autora, čas, polohu nebo čítače.
- [ ] Zavést serverové limity, idempotenci a základní ochranu proti spamu.
- [ ] Přesunout citlivé moderátorské operace do serverového toku s auditem.
- [ ] Zapnout geografické obohacení pro regionální moderaci a provést backfill.
- [ ] Monitorovat selhání automatizací a bezpečně opakovat nedokončené operace.
- [ ] Před veřejným provozem výslovně schválit případná zbývající rizika.

## 6. Právní a provozní připravenost

- [ ] Doplnit skutečného provozovatele, funkční kontaktní adresu a podporu.
- [ ] Zkontrolovat podmínky, zásady ochrany osobních údajů a pravidla komunity.
- [ ] Sladit právní texty se skutečným zpracováním dat a retencí.
- [ ] Připravit proces pro přístup, opravu, export a odstranění osobních dat.
- [ ] Určit odpovědnost za hlášení, moderaci, Business ověřování a incidenty.
- [ ] Připravit eskalace, odvolání a reakci na právní požadavky.
- [ ] Nastavit zálohování Firestore a prakticky ověřit obnovu.
- [ ] Provést kontrolu Rules, IAM, service accounts, tajemství,
  závislostí, logů a záloh.
- [ ] Odstranit z produkce testovací účty, demo data a vývojové přístupy.

## 7. Měření pro navazující produktový rozvoj

Provozní monitoring, náklady a bezpečnostní signály jsou podmínkou webového
MVP v části 1. Následující produktové a akviziční metriky zůstávají plánované
pro navazující vyhodnocování a marketing.

- [ ] Definovat aktivního uživatele, aktivního autora a užitečnou akci.
- [ ] Měřit dokončenou registraci a první užitečnou akci během prvního dne.
- [ ] Měřit aktivní autory, nové Shouty a reakce do dvou hodin.
- [ ] Měřit návrat uživatele po týdnu a ve čtvrtém týdnu.
- [ ] Označit zdroje uživatelů a akviziční kanály.
- [ ] Připravit jednoduchý interní dashboard a týdenní výstup.
- [ ] Ověřit správnost měření a minimalizaci osobních údajů.
- [ ] Určit vlastníka dashboardu a pravidelný termín kontroly.

## 8. Historický rozsah neblokující původní omezený pilot

Následující seznam zachovává původní rozhodnutí pro dříve uvažovaný omezený
Android/web pilot. Rozšířená definice MVP z 30. srpna 2026 jej následně
nahradila. Od 20. října 2026 je platným cílem veřejné webové MVP; mobilní
distribuce a placená Business monetizace následují až po něm.

- původně zvažované Business tokeny (20. října 2026 zrušené), ceny, platby a
  Stripe; budoucí monetizace má mít podobu předplatného;
- skutečné zpoplatnění Business funkcí;
- vlastní Business logo ukládané ve Firebase Storage;
- obrázkové přílohy hlášení chyby;
- karma, achievementy a žebříčky;
- velké placené kampaně a rozšiřování do dalších měst.

## 9. Rozhodovací brána

Veřejné webové MVP lze spustit, pouze pokud:

- [ ] produkční web na dohodnuté subdoméně je veřejný a stabilní;
- [ ] produkční prostředí je oddělené a chráněné;
- [ ] hlavní uživatelské cesty prošly ručními i automatickými testy;
- [ ] funguje právní, bezpečnostní a provozní minimum;
- [ ] funguje provozní a bezpečnostní monitoring s odpovědnou osobou;
- [ ] byly výslovně přijaty nebo odstraněny všechny známé blokující závady.

Po splnění této brány se příprava komunity, autorů, partnerů, propagačních
materiálů a samotný pilot řídí marketingovým plánem v
`docs/local/ShoutOut_marketingovy_plan_spusteni.docx`.
