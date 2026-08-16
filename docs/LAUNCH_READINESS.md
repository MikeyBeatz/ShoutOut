# ShoutOut – připravenost před veřejným spuštěním

## Nový právní milník

- [ ] Prověřit a naplánovat registraci evropské ochranné známky ShoutOut:
  rešerši kolizí, vlastníka, relevantní třídy výrobků a služeb, rozpočet a termín
  podání u EUIPO; před podáním využít odbornou právní kontrolu.

Tento dokument je hlavní kontrolní seznam pro rozhodnutí, zda lze aplikaci
zpřístupnit prvním skutečným uživatelům a zahájit marketingový pilot. Nejde o
marketingový plán. Jednotlivé implementační úkoly a jejich technické podrobnosti
zůstávají v `docs/TODO.md`; povinné ruční scénáře jsou v `docs/TESTING.md`.

Pořadí práce: produkční základ → podporované platformy → bezpečnost a právní
kontrola → ruční testy → měření → provozní připravenost → startovní brána.

## 1. Produkční prostředí a bezpečné nasazení

- [ ] Vytvořit samostatný produkční Firebase projekt a oddělené aplikace pro
  všechny podporované platformy.
- [ ] Přidat bezpečné přepínání vývojové a produkční konfigurace.
- [ ] Zabránit seedovacím, testovacím a migračním nástrojům zasáhnout produkci.
- [ ] Vytvořit minimálně oprávněné service accounts a uložit klíče, hesla a
  podpisové certifikáty mimo Git.
- [ ] Prověřit historii Gitu na privátní klíče, hesla a service-account soubory.
- [ ] Připravit a vyzkoušet nasazení, rollback, obnovu a řešení částečného
  selhání.
- [ ] Nastavit rozpočty, nákladové limity, kvóty a upozornění.
- [ ] Připojit vlastní doménu, autorizované Auth domény a správnou Action URL.
- [ ] Nastavit veřejný název, odesílatele a lokalizované e-mailové šablony.
- [ ] Omezit produkční Geoapify klíč na správné domény a nastavit kvótu.
- [ ] Nakonfigurovat App Check pro podporované platformy, nejprve sledovat
  metriky a až potom zapnout vynucení.
- [ ] Dokončit Play Integrity pro produkční Android aplikaci a vhodnou ochranu
  webového klienta.
- [ ] Aktivovat placené serverové služby až po dokončení bezplatných příprav a
  pouze v rozsahu nezbytném pro bezpečný pilot.

## 2. Platformy a veřejná distribuce

Podrobný postup a časově citlivé požadavky obchodů jsou v plánu
[mobilního testování a distribuce](MOBILE_DISTRIBUTION_PLAN.md); před placením
nebo uploadem je ověřte znovu u Googlu a Applu.

- [ ] Dokončit podepsaný Android release a bezpečně zálohovat produkční klíč.
- [ ] Připravit Google Play záznam, ochranu dat, věkové hodnocení a materiály.
- [ ] Projít požadovaným interním nebo uzavřeným testováním Google Play.
- [ ] Připojit iOS projekt k produkčnímu Firebase a doplnit podpisy, oprávnění,
  polohu a ostatní používané služby.
- [ ] Otestovat iOS build na skutečném iPhonu.
- [ ] Připravit App Store Connect a projít schválením App Store.
- [ ] Rozhodnout, zda pilot čeká na Android i iOS, nebo formálně začíná jako
  omezený Android/web pilot.
- [ ] Ověřit, že veřejné odkazy vedou výhradně do produkčního prostředí.

## 3. Stabilita hlavních uživatelských cest

- [ ] Ověřit instalaci, první spuštění, přihlášení, odhlášení a návrat do
  aplikace na skutečných telefonech.
- [ ] Ověřit běžnou registraci, potvrzení e-mailu, přezdívku, avatar a onboarding.
- [ ] Ověřit Business registraci, potvrzení e-mailu, čekací stav, zrušení žádosti
  a administrátorské schválení.
- [ ] Ověřit reset hesla včetně neplatného, použitého a expirovaného odkazu.
- [ ] Ověřit smazání účtu, okamžité odhlášení, opětovné použití stejného e-mailu
  a zmizení jeho obsahu z aplikace.
- [ ] Dokončit test vytvoření Shoutu na fyzickém zařízení mimo Litoměřice.
- [ ] Ověřit feed, poloměr, řazení, kategorie, filtry a navigaci.
- [ ] Ověřit Shouty, komentáře, odpovědi, reakce, ukládání a expiraci.
- [ ] Ověřit Follow, veřejné profily, blokování a hlášení.
- [ ] Ověřit oznámení uvnitř aplikace a uživatelské preference.
- [ ] Ověřit Business pobočky, jejich názvy, adresy a polohu Shoutů.
- [ ] Ověřit zvýraznění, propagační okénko a prodlouženou platnost.
- [ ] Ověřit Business ověření, hlášení chyb, postihy, jejich zrušení a audit.
- [ ] Otestovat pomalé a přerušované připojení.
- [ ] Otestovat světlý, tmavý a systémový režim a všech sedm jazyků.
- [ ] Otestovat úzký Android, různé rozměry iPhonu, mobilní web a desktop.
- [ ] Spustit kompletní CI a odstranit všechny chyby release kandidáta.

## 4. Důvěryhodné serverové procesy

- [ ] Zajistit okamžité skrytí obsahu zablokovaného nebo smazaného účtu.
- [ ] Automatizovat dokončení žádosti o smazání účtu a 60denní retenci.
- [ ] Automatizovat expiraci Shoutů a odstranění jejich podkolekcí.
- [ ] Zabránit upravenému klientovi podvrhnout autora, čas, polohu nebo čítače.
- [ ] Zavést serverové limity, idempotenci a základní ochranu proti spamu.
- [ ] Přesunout citlivé moderátorské operace do serverového toku s auditem.
- [ ] Zapnout geografické obohacení pro regionální moderaci a provést backfill.
- [ ] Monitorovat selhání automatizací a bezpečně opakovat nedokončené operace.
- [ ] Před veřejným provozem výslovně schválit případná zbývající rizika.

## 5. Právní a provozní připravenost

- [ ] Doplnit skutečného provozovatele, funkční kontaktní adresu a podporu.
- [ ] Zkontrolovat podmínky, zásady ochrany osobních údajů a pravidla komunity.
- [ ] Sladit právní texty se skutečným zpracováním dat a retencí.
- [ ] Připravit proces pro přístup, opravu, export a odstranění osobních dat.
- [ ] Určit odpovědnost za hlášení, moderaci, Business ověřování a incidenty.
- [ ] Připravit eskalace, odvolání a reakci na právní požadavky.
- [ ] Nastavit zálohování Firestore a prakticky ověřit obnovu.
- [ ] Provést kontrolu Rules, IAM, service accounts, podpisů, tajemství,
  závislostí, logů a záloh.
- [ ] Odstranit z produkce testovací účty, demo data a vývojové přístupy.

## 6. Měření potřebné pro rozhodování

- [ ] Definovat aktivního uživatele, aktivního autora a užitečnou akci.
- [ ] Měřit dokončenou registraci a první užitečnou akci během prvního dne.
- [ ] Měřit aktivní autory, nové Shouty a reakce do dvou hodin.
- [ ] Měřit návrat uživatele po týdnu a ve čtvrtém týdnu.
- [ ] Označit zdroje uživatelů a akviziční kanály.
- [ ] Připravit jednoduchý interní dashboard a týdenní výstup.
- [ ] Ověřit správnost měření a minimalizaci osobních údajů.
- [ ] Určit vlastníka dashboardu a pravidelný termín kontroly.

## 7. Co neblokuje uzavřený pilot

Následující funkce mohou zůstat odložené, pokud jejich absence neporušuje
bezpečnost ani právní povinnosti:

- tokeny, ceny, platby a Stripe;
- skutečné zpoplatnění Business funkcí;
- vlastní Business logo ukládané ve Firebase Storage;
- obrázkové přílohy hlášení chyby;
- karma, achievementy a žebříčky;
- automatické ARES/VIES ověření, pokud funguje důvěryhodná ruční kontrola;
- velké placené kampaně a rozšiřování do dalších měst.

## 8. Rozhodovací brána

Uzavřený marketingový pilot lze zahájit, pouze pokud:

- [ ] jsou veřejné a stabilní formálně dohodnuté platformy;
- [ ] produkční prostředí je oddělené a chráněné;
- [ ] hlavní uživatelské cesty prošly ručními i automatickými testy;
- [ ] funguje právní, bezpečnostní a provozní minimum;
- [ ] máme spolehlivé měření a osobu odpovědnou za jeho kontrolu;
- [ ] byly výslovně přijaty nebo odstraněny všechny známé blokující závady.

Po splnění této brány se příprava komunity, autorů, partnerů, propagačních
materiálů a samotný pilot řídí marketingovým plánem v
`docs/local/ShoutOut_marketingovy_plan_spusteni.docx`.
