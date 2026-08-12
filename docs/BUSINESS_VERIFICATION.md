# Jednoduché automatické ověření business účtů

## Zásada

ShoutOut není banka ani tržiště a business účet nedostává oprávnění nakládat s
majetkem firmy. Ověření proto nemá zjišťovat statutárního zástupce ani skutečného
majitele. Má pouze rozumně omezit smyšlené firmy, omyly a vydávání se za známou
značku.

Celý běžný proces je automatický. Ruční zásah nastává pouze při sporu, hlášení
zneužití nebo zjevné neshodě.

## Automatický proces

1. Uživatel vybere zemi a zadá registrační číslo firmy.
2. Server vyhledá subjekt v oficiálním nebo důvěryhodném registru:
   - Česko: ARES;
   - EU/EEA: BRIS, národní registr a případně VIES jako doplňkový zdroj;
   - další země: podporovaný národní registr nebo komerční globální poskytovatel.
3. Server převezme oficiální název, stav a sídlo. Tyto údaje uživatel nesmí
   libovolně přepsat.
4. Uživatel zadá kontaktní e-mail a otevře jednorázový potvrzovací odkaz. Stačí
   funkční adresa včetně veřejných služeb jako Gmail nebo Seznam. Potvrzení
   dokládá pouze přístup k uvedenému kontaktu, nikoli právní oprávnění jednat za
   firmu.
5. Uživatel vyplní samostatnou povinnou část **Pobočka/provozovna**: veřejný
   název první provozovny a její adresu. Adresa se vybere přes našeptávač a uloží
   se její ověřené souřadnice a geohash.
6. Pokud je firma aktivní, údaje se shodují, kontakt je potvrzený a první
   provozovna je platná, server aktivuje business účet.
7. Pokud registr pro danou zemi není podporovaný, business účet zatím nelze
   automaticky aktivovat. Není vhodné globálně shromažďovat dokumenty a doklady.

## Provozovna

Sídlo ani fakturační adresa firmy nejsou automaticky provozovna. Registrační
formulář proto obsahuje povinnou samostatnou část **Pobočka/provozovna**. Shodná
adresa sídla a provozovny je povolená, ale uživatel ji musí zadat nebo potvrdit
samostatně. Jeden business účet může mít více poboček pod stejným registračním
číslem. Každá pobočka má vlastní veřejný název, adresu a polohu:

- adresa se převede na souřadnice serverovým geocodingem;
- při tvorbě Shoutu se pobočka vybere z nabídky; pokud existuje jen jedna, vybere
  se automaticky;
- autor Shoutu se zobrazí například jako `Název firmy – Litoměřice`;
- Shout nese ID pobočky a neměnný snímek její polohy pro feed a moderaci;
- změna adresy ovlivní nové Shouty, ne historii publikovaného obsahu.

V první verzi není systém správců ani pozvánek. Business účet má jedno
přihlášení. Sdílení přihlašovacích údajů aplikace aktivně neusnadňuje a neumí
rozlišit, kdo konkrétní změnu provedl.

Nevyžadujeme telefon, DNS, video, poštovní dopis ani přístup do datové schránky.

## Co odznak znamená

Odznak se má jmenovat například **„Registrovaný business účet“**, nikoli
„Ověřený vlastník firmy“. Znamená, že:

- zadaný subjekt existuje v registru;
- uživatel potvrdil kontakt spojený s firemní identitou;
- profil prošel automatickými kontrolami ShoutOutu.

Neznamená právní potvrzení, že držitel účtu je statutárním orgánem.

## Ochrana proti zneužití

- Jedna firma má v první verzi jeden business účet bez dalších správcovských rolí.
- První žádost nezíská neodvolatelné vlastnictví. Převzetí se řeší potvrzením
  nového e-mailu; při sporu se účet dočasně pozastaví.
- Známé značky, státní orgány a opakované konflikty se automaticky pozastaví.
- Uživatelé mohou nahlásit vydávání se za firmu.
- Administrátor může účet pozastavit, odebrat business stav nebo zahájit nové
  ověření; každý zásah se audituje.
- Registr se znovu kontroluje pravidelně a při změně názvu, země, registračního
  čísla, kontaktu nebo provozovny.

## Platby a monetizace

Ověření firmy je oddělené od plateb. Jednotná pravidla pro Stripe, ověření karty,
tokeny, Apple Pay, Google Pay, fakturaci a 48hodinové Shouty jsou v
`docs/BUSINESS_MONETIZATION.md`.

## Minimální datový model

`businessProfiles/{uid}`:

- `countryCode`, `registrationNumber`, `officialName`, `registryAddress`;
- `displayName` pro veřejný název odlišný od oficiálního názvu;
- `registrySource`, `registryCheckedAt`, `registryStatus`;
- `emailHash`, `emailVerifiedAt`;
- `status`: `checking`, `contact_pending`, `active`, `suspended`, `rejected`;
- `updatedAt`.

`businessProfiles/{uid}/locations/{locationId}`:

- `displayName`, `address`, `city`, `postalCode`, `countryCode`;
- `latitude`, `longitude`, `geohash`, `active`, `createdAt`, `updatedAt`.

Surové ověřovací kódy se neukládají; ukládá se pouze hash a expirace. Veřejný
profil obsahuje jen nezbytné údaje a stav business účtu.

## Zavádění

1. Začít Českem přes ARES a ověřením firemního kontaktu.
2. Doplnit povinnou první provozovnu a lokalizaci všech business textů do sedmi
   jazyků aplikace.
3. Přidat země EU s použitelným registrem.
4. Platební kroky zavádět podle `docs/BUSINESS_MONETIZATION.md`.
5. Další země zapínat postupně podle dostupnosti kvalitních dat.
6. Pokud bude počet zemí velký, nahradit jednotlivé adaptéry globálním
   poskytovatelem firemních dat; uživatelský tok zůstane stejný.
