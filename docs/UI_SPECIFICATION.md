# Specifikace obrazovek a navigace

Tento dokument popisuje informační architekturu současného klienta. Neurčuje
každý pixel; přesné barvy, fonty, logo, splash, watermark a assety jsou v
`design/README.md` a `design/brand-tokens.json`. Produktové podmínky jednotlivých
akcí jsou v `PRODUCT_FLOWS.md`.

## Globální rámec

- Aplikace je Material 3, podporuje light/dark/system a sedm jazyků.
- Android je portrait. Webový obsah je centrovaný a má maximum 840 px; okolí
  vyplňuje barva pozadí. Dialogy a formuláře mají užší stabilní šířku a při
  otevření našeptávače adres nesmějí měnit rozměr.
- Hlavní značkové záhlaví používá tyrkysový gradient, transparentní znak a
  Urbanist Medium pro logotyp. Hlavní karty sdílejí velmi jemný watermark v
  pozadí, nikoli uvnitř obsahových karet.
- Primární akce je `FilledButton`, sekundární `OutlinedButton` nebo
  `TextButton`; destruktivní akce vždy vyžaduje potvrzení.
- Asynchronní obrazovka musí rozlišit načítání, prázdný stav, chybu a obsah.
  Neúspěšný formulář zachovává už vyplněné hodnoty.
- Zvoneček otevírá centrum oznámení a badge ukazuje počet nepřečtených.

## Vstupní tok

### Přihlášení a běžná registrace

Jedna značková obrazovka přepíná režim Přihlásit/Registrovat. Formulář je
vertikální: e-mail, heslo s ikonou zobrazení, při registraci potvrzení hesla,
hlavní tlačítko a textové přepnutí režimu. Přihlášení nabízí **Zapomenuté
heslo?**; registrace odkaz na samostatný Business formulář. Chyba se zobrazí u
formuláře s lokalizovanou, bezpečnou zprávou.

### Ověření e-mailu

Centrální karta ukazuje cílovou adresu a čtyři akce: **Už jsem e-mail ověřil/a**,
znovu odeslat, vrátit se a opravit e-mail, odhlásit se. Kontrola obnoví Firebase
uživatele i token; neověřený účet nepokračuje.

### Právní souhlas a profil

Právní brána zobrazí podmínky, ochranu soukromí, pravidla komunity a potvrzení
věku. Následuje obrazovka přezdívky (maximum 24 znaků, průběžná dostupnost),
výběr jednoho z 24 avatarů, dvou barev a směru pozadí. Uložení je atomické.

### Úvodní nápověda

Stránkovaný průvodce má záhlaví Nápověda, indikátor stránky, Zpět/Další a na
poslední stránce checkbox „znovu neukazovat“. Stejná nápověda je později
dostupná z Profilu bez duplikování právních textů.

### Business registrace

Samostatná scrollovatelná stránka zachovává značkový styl registrace. Pořadí:

1. země z celosvětového country pickeru;
2. registrační číslo, oficiální název, fakturační ulice/adresa, město a PSČ;
3. oddělený blok **Pobočka/provozovna** s veřejným názvem a Geoapify adresou;
4. kontaktní/přihlašovací e-mail, heslo a potvrzení;
5. hlavní registrační tlačítko;
6. text „V případě potíží kontaktujte podporu“ s kontaktní adresou.

Návrh adresy je povinné vybrat; zobrazený řádek může obsahovat diakritiku a
formát země poskytovatele. Dialog nemění šířku podle délky návrhů.

## Hlavní aplikace

Spodní `NavigationBar` je vždy ve stejném pořadí:

1. megafon **Shouty**;
2. vlaječka **Sledované**;
3. megafon **Mé shouty**;
4. osoba **Profil**.

Přepnutí karty zachovává filtry feedu i vnitřní stav obrazovek po dobu relace.
Plovoucí tlačítko **Přidat shout** je pouze na první kartě.

### Shouty

Záhlaví obsahuje značku a zvoneček. Pod ním je v jednom kompaktním řádku:

- vzdálenost 1, 3, 5, 10, 20 nebo 50 km (výchozí 5 km);
- řazení Nejbližší, Top, Končící, Sledované;
- kategorii Vše nebo jednu z deseti kategorií.

Následuje scrollovaný seznam společných Shout karet. Bez polohy se feed načte,
ale vzdálenost je neznámá. Prázdný, načítací a chybový stav zabírá obsahovou
plochu pod záhlavím.

### Společná Shout karta

Karta ve feedu, Sledovaných, Mých Shoutech a veřejném profilu má stejnou
funkčnost a vzhled:

- aktuální avatar, klikací přezdívku/Business název, vzdálenost, datum a
  zbývající platnost;
- vlaječku vpravo;
- nadpis, text a jeden/dva category chips;
- řádek like, dislike a komentáře se souhrnnými počty.

Kliknutí mimo přímá tlačítka otevře detail. Tlačítka musí realtime zobrazit
nový stav bez zavření detailu nebo profilu. Smazaný/automaticky skrytý obsah
zobrazuje odpovídající stav místo původního textu.

### Nový Shout

Modální dialog v pořadí obsahuje:

1. Nadpis 60 znaků a Text 220 znaků, oba s kapitalizací věty;
2. volbu nejvýše dvou kategorií přes chips;
3. pouze Business checkbox **Až 48 hodin**;
4. dvousloupcový výběr hodin/minut a souhrnnou Platnost;
5. pouze Business dropdown **Vybrat pobočku**;
6. tlačítko **Publikovat** se stavem **Publikuji…**.

Pobočka je bezprostředně nad publikováním. Chyba oprávnění, sítě nebo limitu
zobrazí zprávu nad stále otevřeným a vyplněným dialogem; tlačítko lze po
uvolnění cooldownu použít znovu.

### Detail Shoutu

Horní část opakuje plně interaktivní kartu. Pod ní jsou veřejné komentáře,
editor nového komentáře a kontextové akce odpovědět veřejně/soukromě, nahlásit,
blokovat nebo podle vlastnictví/role smazat. Odpověď na komentář jasně zobrazuje
cílovou přezdívku. Soukromé odpovědi jsou vizuálně oddělené od veřejného vlákna.

### Veřejný profil

Kliknutí na autora otevře větší modal/bottom sheet: avatar, přezdívku, tlačítko
Follow nebo Sledováno, overflow menu **Blokovat** a **Nahlásit**, a sekci
**Aktivní Shouty**. Každý Shout je standardní plně klikací karta. Vlastní profil
nenabízí Follow, blokaci ani hlášení.

### Sledované

Tyrkysové záhlaví s ikonou vlaječky a názvem **Sledované** obsahuje segmenty:

- **Shouty** – aktivní položky označené vlaječkou;
- **Profily** – seznam sledovaných identit, po rozkliknutí jejich aktivní Shouty.

Expirace cizí uložený Shout z aktivního seznamu odstraní. Segmentace nezmění
stav karty Mé Shouty.

### Mé shouty

Samostatné záhlaví a tři segmenty:

- **Aktivní** – vlastní živé Shouty;
- **Expirované** – vlastní Shouty v sedmidenním klientském retenčním okně;
- **Komentáře** – vlastní komentáře načtené collection-group dotazem a jejich
  rodičovský Shout.

Vlastník zde může Shout smazat; reakce používají stejné sdílené callbacky jako
feed.

## Profil a nastavení

Záhlaví profilu ukazuje velký avatar, přezdívku, řádek **Členem od …** a tlačítko
**Upravit profil**. Pod ním jsou dlaždice v tomto významu:

- **Nápověda** – opakované otevření průvodce;
- **Varování** – vlastní historii upozornění/postihů;
- **Právní info** – právní dokumenty a informace, ne nápovědu;
- **Systém** – jazyk, Změnit heslo, Notifikace a Vzhled aplikace;
- **Business** – pouze role 2;
- **Moderace** – pouze role 3–6, na webu vede také do `/admin`;
- odhlášení.

### Upravit profil

Obsahuje samostatné řádky **Změnit avatar**, **Změnit přezdívku** a **Smazat
účet**. Změna přezdívky ukáže 30denní omezení před potvrzením. Smazání vysvětlí
skrytí obsahu a přibližně 60denní retenci.

### Systém

- Jazyk otevře bottom sheet se jmény jazyků a kódy CS, EN, DE, PL, SK, UK, VI.
  `UK` je ISO 639 kód ukrajinštiny; nejde o zkratku země.
- Změnit heslo vyžaduje nové heslo a shodné potvrzení, zobrazení znaků a podle
  Firebase stavu případnou opětovnou autentizaci.
- Notifikace nabízí switche Odpovědi, Reakce, Soukromé odpovědi, Shouty
  sledovaných a Shouty v okolí; poslední dvě čekají na backend.
- Vzhled vybírá Podle systému, Světlý nebo Tmavý a ukládá profil.

### Business

Role 2 otevře čtyři funkční/rezervované oblasti:

- **Business profil** – veřejný název, oficiální a registrační/fakturační údaje,
  ikona tužky v AppBar i tlačítko Upravit údaje;
- **Pobočky** – plus v AppBar a seznam rozbalovacích provozoven; editor má
  název, Geoapify adresu, aktivní stav, uložit a smazat. Po uložení se sbalí;
- **Tokeny** – placeholder budoucí monetizace;
- **Nákupy a faktury** – placeholder budoucích firemních dokladů.

## Centrum oznámení

Seznam je řazený nejnovější aktualizací, maximum 50. Nepřečtená karta má
zvýrazněné pozadí a tečku, text složený z typu, posledního aktéra, počtu a
zkráceného názvu cíle, plus lokalizované datum/čas. Obrazovka nabízí označení
všech jako přečtené. Kliknutí označí položku a otevře živý detail; nedostupný cíl
zobrazí hlášku bez pádu nebo prázdné navigace.

## Moderátorský pracovní prostor

Trasa `/#/admin` používá stejné přihlášení a globální 840px rámec. Navigace se
sestaví podle role:

- přehled a regionální náhled;
- Shouty v přiděleném území;
- společná fronta hlášení s filtrem typu a pořadím;
- uživatel/detail postihů;
- pouze administrator/owner systémový dohled a technické logy.

Detail případu zachová snapshot obsahu, kontext regionu, interní poznámku a
jednu roletku rozhodnutí. Přesná matice dostupných akcí je v
`INTERNAL_MODERATION.md`; UI nesmí zobrazit akci, kterou pravidla dané roli
stejně zamítnou.

## Přístupnost a lokalizace

- Ikonová tlačítka mají lokalizovaný tooltip a dotykovou plochu odpovídající
  Material doporučením.
- Text respektuje systémovou velikost; dlouhé německé/ukrajinské/vietnamské
  popisky se zalomí nebo bezpečně zkrátí, nikdy nepřekryjí ovládání.
- Stav není sdělen jen barvou: selected ikony/chips, texty chyb a unread tečka
  mají další vizuální význam.
- Textová pole používají správný typ klávesnice, autofill a akci Next/Done;
  nové heslo se nesmí logovat ani ukládat do Firestore.
- Diakritika je UTF-8 v celém projektu a font pro běžné UI musí mít znaky všech
  podporovaných jazyků; Urbanist je určen hlavně logotypu.
