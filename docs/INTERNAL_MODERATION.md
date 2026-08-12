# ShoutOut – interní role, oprávnění a moderace

Tento dokument je hlavním interním zdrojem pravidel pro role, postihy a
moderátorské postupy. Není určen jako veřejný právní dokument. Veřejná pravidla
komunity a zásady ochrany soukromí musí odpovídat skutečně nasazenému chování,
ale mají vlastní text a schvalovací proces.

## Stav dokumentu

- **Implementováno** znamená, že chování existuje v klientovi nebo Firestore
  Rules a je pokryté automatickými testy.
- **Navrženo** znamená schválený směr, který ještě nemusí mít hotové rozhraní,
  serverovou automatizaci nebo celý proces.
- Produkční nasazení změny pravidel vyžaduje kontrolu pravidel, testů, migrace
  existujících dat a odpovídajících právních textů.

## Úrovně účtů

| Úroveň | Interní role | Účel | Stav |
|---:|---|---|---|
| 0 | návštěvník | Pouze přihlášení nebo registrace, bez veřejného náhledu | Implementováno |
| 1 | `user` | Běžný komunitní účet | Implementováno |
| 2 | `business` | Firemní profil, propagace a vlastní statistiky | Role implementována, funkce navrženy |
| 3 | `moderator` | Každodenní moderace a dočasné postihy | Implementováno částečně |
| 4 | `seniorModerator` | Vedení moderace, dlouhé a trvalé bany, odvolání | Implementováno částečně |
| 5 | `administrator` | Správa systému, rolí, business účtů a dohled | Role implementována, rozhraní navrženo |
| 6 | `owner` | Nejvyšší bezpečnostní a organizační pravomoc | Role implementována, rozhraní navrženo |

Role jsou ukládány v `accountRoles/{uid}`. Klient smí přečíst pouze vlastní
roli a nesmí role vytvářet, měnit ani mazat. Vývojové přiřazení probíhá pouze
přes Admin SDK nástroj `tools/set_role.mjs`. Kolekce `moderators` je pouze
dočasná kompatibilita se staršími vývojovými účty a považuje se za úroveň 3.

Stav účtu, například aktivní ban, omezení tvorby nebo čekající smazání, není
role a nesmí se ukládat jako role.

## Geografický rozsah moderace

- Země používají ISO 3166-1 alpha-2 (`CZ`, `DE`, `US`).
- Hlavní správní oblasti používají ISO 3166-2 (`CZ-10`, `US-CA`).
- Google Geocoding převádí souřadnice na metadata, ale Google Place ID není
  autoritou oprávnění ani trvalou identitou regionu.
- Moderátor a senior pracují v zemích a oblastech uvedených v
  `accountRoles/{uid}.moderationScope`.
- Admin a owner mají globální náhled; admin ho používá primárně pro dohled.
- Firestore Rules kontrolují rozsah při vytvoření postihu. Staré role bez
  `moderationScope` jsou do migrace kompatibilní; při další správě role musí být
  rozsah výslovně uložen.
- Shout bez dokončeného serverového obohacení nemůže moderátor s omezeným
  rozsahem postihnout. Admin a owner mohou globálně řešit chybu obohacení.

Webová sekce **Shouty** nabízí přidělené regiony. Admin a owner mohou zadat
libovolnou zemi, ISO 3166-2 oblast nebo zobrazit celý svět.

Webová sekce **Hlášení** je jedna společná pracovní fronta. Umožňuje filtrovat
Shouty, komentáře a soukromé odpovědi a řadit podle počtu hlášení, nejnovějších
nebo nejstarších případů. Více otevřených hlášení stejného obsahu se seskupí;
po úspěšném rozhodnutí se uzavřou všechna hlášení daného obsahu. Zrušené nebo
neúspěšné rozhodnutí je nesmí uzavřít.

Detail případu obsahuje jednu roletku rozhodnutí. Vedle odstranění obsahu a
postihů dostupných dané roli nabízí také tyto výsledky:

- **Bez postihu – obsah je v pořádku** uzavře všechna seskupená hlášení a vytvoří
  neměnný záznam v `moderationClearances`. Stejný shout, komentář nebo soukromou
  odpověď potom nelze znovu nahlásit.
- **Odeslat senior moderátorovi** změní otevřená hlášení na `escalated`, uloží
  autora a čas eskalace a předá případ do fronty senior moderátorů. Běžnému
  moderátorovi se takový případ už ve frontě nezobrazuje.

Rozhodnutí může obsahovat interní poznámku. Schválení obsahu i uzavření všech
hlášení probíhá atomicky, aby nevzniklo časové okno pro nové nahlášení.

## Matice oprávnění

Legenda: **Ano** – běžná pravomoc, **Dohled** – kontrola bez běžného zpracování,
**Nouzově** – pouze mimořádný zásah s povinným důvodem a auditem, **Návrh** –
role může případ eskalovat, ale ne dokončit.

| Oprávnění | User 1 | Business 2 | Moderátor 3 | Senior 4 | Admin 5 | Owner 6 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Používat komunitní funkce | Ano | Ano | Ano | Ano | Ano | Ano |
| Spravovat vlastní business profil | Ne | Ano | Ne | Ne | Dohled | Dohled |
| Prohlížet moderátorskou frontu | Ne | Ne | Ano | Ano | Dohled | Dohled |
| Uzavřít hlášení | Ne | Ne | Ano | Ano | Nouzově | Nouzově |
| Skrýt závadný obsah | Ne | Ne | Ano | Ano | Nouzově | Nouzově |
| Obnovit skrytý obsah | Ne | Ne | Navrženo | Ano | Nouzově | Nouzově |
| Udělit varování | Ne | Ne | Ano | Ano | Nouzově | Nouzově |
| Omezit tvorbu do 30 dnů | Ne | Ne | Ano | Ano | Nouzově | Nouzově |
| Omezit tvorbu do 90 dnů | Ne | Ne | Ne | Ano | Nouzově | Nouzově |
| Ban do 30 dnů | Ne | Ne | Ano | Ano | Nouzově | Nouzově |
| Ban do 90 dnů | Ne | Ne | Ne | Ano | Nouzově | Nouzově |
| Trvalý ban | Ne | Ne | Návrh | Ano | Nouzově | Nouzově |
| Zrušit zásah jiného moderátora | Ne | Ne | Ne | Navrženo | Nouzově | Nouzově |
| Řešit odvolání | Ne | Ne | Ne | Navrženo | Dohled | Dohled |
| Kontrolovat práci moderátorů | Ne | Ne | Ne | Navrženo | Ano | Ano |
| Prohlížet technické chyby aplikace | Ne | Ne | Ne | Ne | Ano | Ano |
| Pozastavit moderátorskou roli | Ne | Ne | Ne | Ne | Navrženo | Ano |
| Přidělit moderátora | Ne | Ne | Ne | Ne | Navrženo | Ano |
| Přidělit administrátora | Ne | Ne | Ne | Ne | Ne | Navrženo |
| Měnit auditní historii | Ne | Ne | Ne | Ne | Ne | Ne |

Administrátor není běžný supermoderátor. Jeho hlavní odpovědností je provozní
dohled, nastavení systému, role, business účty, monitoring a řešení zneužití
moderátorských pravomocí. Přímá moderace administrátorem je nouzová operace.

## Webové pracovní prostředí

Všichni používají stejné Firebase přihlášení. Pojmenovaná trasa `/admin`
(ve výchozím Flutter web režimu `/#/admin`) po
přihlášení načte `accountRoles/{uid}` a podle role sestaví pracovní navigaci.
Běžný uživatel ani business účet do pracovní části přístup nemají.

- Moderátor vidí přehled, hlášení a historii postihů.
- Senior moderátor používá stejné prostředí s vyššími pravomocemi postihů.
- Administrátor a owner navíc vidí systémový dohled.
- Evidence technických chyb je součást systémového dohledu pouze pro
  administrátora a ownera. Moderátor ani senior moderátor k ní přístup nemají;
  řeší chování uživatelů a nahlášený obsah.
- Správa rolí a business schvalování jsou v rozhraní označené jako čekající na
  chráněnou serverovou operaci; klient zatím žádný zápis nepředstírá.
- Sekce Uživatelé umožňuje vyhledat přesné UID nebo přezdívku a zobrazit roli,
  aktivní ban či omezení, historii, snímky obsahu a audit zrušení.

Na široké obrazovce se používá postranní navigace, na úzké spodní navigace.
Mobilní moderátorský vstup zůstává dostupný pro rychlé zásahy.

## Typy postihů

### Varování

Varování je zaznamenané upozornění bez automatického omezení účtu. Obsahuje
důvod, moderátora, čas, zdrojové hlášení a vazbu na záznam v `sanctions`.

Stav: **implementováno**.

### Omezení tvorby obsahu

Jedno společné omezení blokuje:

- vytváření Shoutů,
- vytváření komentářů a odpovědí v komentářích,
- vytváření soukromých odpovědí.

Omezený uživatel může dál číst obsah, reagovat, ukládat, hlásit obsah a
spravovat svůj profil. V aplikaci vidí důvod a datum konce omezení.

Předvolby moderátora jsou 1, 7 a 30 dní. Senior moderátor může podle pravidel
udělit omezení až na 90 dní; odpovídající volba v rozhraní ještě není hotová.

Stav: **implementováno částečně**.

### Ban účtu

Ban úplně uzamkne účet. Po otevření aplikace se místo obsahu zobrazí:

- informace, že účet byl zablokován,
- důvod,
- konec blokace nebo informace o trvalém banu,
- číslo moderátorského rozhodnutí,
- možnost odhlášení.

Moderátor může udělit ban na 1, 7 nebo 30 dní. Senior moderátor navíc na 90 dní
nebo trvale. Možnost podat odvolání ještě není implementována.

Stav: **implementováno částečně**.

## Povinný záznam postihu

Každý nový postih vytvořený moderátorským rozhraním má dokument
`sanctions/{sanctionId}` s následujícími údaji:

- postižený uživatel,
- typ postihu,
- důvod,
- čas vytvoření,
- konec platnosti nebo příznak trvalého banu,
- moderátor,
- zdrojové hlášení,
- počet dřívějších dohledaných postihů,
- stav postihu,
- plánované datum odstranění `purgeAt`.

Postih může vzniknout z uživatelského hlášení (`sourceType: report`) nebo z
vlastního zjištění moderátora (`sourceType: moderatorObservation`). Přímá
moderace je dostupná přes tlačítko se štítem v detailu Shoutu a u komentáře.
Moderátor musí vybrat druh postihu a ručně uvést konkrétní důvod.

Záznam uchovává také `sourceContentType`, `sourceContentId` a neměnný
`contentSnapshot` posuzovaného Shoutu nebo komentáře. Snímek slouží jako důkaz,
i když autor obsah později odstraní. Má stejné `purgeAt` jako postih a nesmí být
uchováván déle než související moderátorský záznam.

Aktivní omezení je současně uloženo v `contentRestrictions/{uid}` a aktivní ban
v `bans/{uid}`. Zápis historie, aktivního postihu a uzavření hlášení probíhá
atomicky. Firestore Rules odmítnou nový aktivní postih bez odpovídajícího
záznamu v `sanctions`.

Historie je neměnná z běžného klienta. Budoucí zrušení postihu musí vytvořit
novou auditní událost; nesmí přepisovat původní rozhodnutí bez stopy.

### Zrušení aktivního postihu

Zrušení je implementováno jako dokument
`sanctionRevocations/{sanctionId}`. Ve stejné atomické operaci se odstraní
pouze aktivní dokument z `bans/{uid}` nebo `contentRestrictions/{uid}`.
Původní dokument v `sanctions` zůstává beze změny.

- Moderátor může zrušit pouze svůj vlastní dočasný aktivní postih.
- Senior moderátor může zrušit aktivní postih jiného moderátora.
- Zrušení vyžaduje povinný důvod.
- Nelze vytvořit druhé zrušení stejného rozhodnutí.
- Hierarchie účtů se kontroluje také ve Firestore Rules.

## Četnost a opakování

Moderátor má při rozhodování znát počet dřívějších postihů a jejich typy.
Současná implementace ukládá `previousSanctionsCount` do nového postihu a při
výpočtu čte nejvýše 50 dostupných záznamů uživatele.

Moderátorské rozhraní zobrazuje posledních 50 postihů napříč účty. Před novým
varováním, omezením nebo banem ukáže potvrzení s cílovým účtem, důvodem a počtem
dřívějších postihů. Úplné filtrování historie konkrétního účtu a souhrny podle
časových oken jsou zatím navržené.

Navržený serverový stav bude udržovat klouzavé počty za 30, 180 a 365 dní.
Počet postihů může doporučit eskalaci, ale nesmí bez lidského posouzení
automaticky udělit trvalý ban.

## Retence

Aktuální pracovní retenční lhůty:

| Typ | Plánované odstranění detailu |
|---|---|
| Varování | 180 dní od vytvoření |
| Omezení tvorby | 365 dní po skončení |
| Dočasný ban | 730 dní po skončení |
| Trvalý ban | Po dobu blokace a následně podle procesu smazání účtu |

Dokumenty již obsahují `purgeAt`, ale fyzické mazání ještě není implementované.
Musí ho provádět důvěryhodná plánovaná serverová úloha. Po odstranění osobní
historie lze dlouhodobě uchovat pouze anonymní souhrnné statistiky bez vazby na
konkrétní účet. Lhůty musí být před produkcí právně posouzeny a sladěny s
veřejnými dokumenty.

## Povinný postup moderátora

1. Ověřit obsah hlášení a související kontext.
2. Zkontrolovat historii postihů a případné opakování.
3. Zvolit nejmírnější postih, který přiměřeně chrání komunitu.
4. Uvést konkrétní a srozumitelný důvod.
5. U dlouhého nebo trvalého banu znovu potvrdit cílový účet a důkazy.
6. Neřešit případ, ve kterém je moderátor osobně zainteresovaný.
7. Eskalovat nejasný, závažný nebo právně citlivý případ senior moderátorovi.

## Bezpečnostní zásady

- Moderátor nesmí zasáhnout proti účtu se stejnou nebo vyšší správcovskou
  úrovní; technické vynucení ještě musí být doplněno.
- Nikdo nesmí upravovat nebo mazat auditní historii z klienta.
- Každý nouzový zásah administrátora nebo vlastníka musí mít důvod a zvláštní
  auditní označení; nouzové rozhraní ještě není implementováno.
- Citlivé moderátorské operace mají být v produkci přesunuty do důvěryhodné
  serverové brány.
- Admin a owner účty mají před produkcí povinně používat vícefaktorové ověření.

## Změna těchto pravidel

Každá změna rolí, pravomocí, délky postihu nebo retence musí současně upravit:

1. tento dokument,
2. Firestore Rules a jejich negativní i pozitivní testy,
3. klientské nebo webové rozhraní,
4. `TODO.md`, pokud část procesu ještě vyžaduje server,
5. veřejné právní nebo komunitní dokumenty, pokud se jich změna týká.
