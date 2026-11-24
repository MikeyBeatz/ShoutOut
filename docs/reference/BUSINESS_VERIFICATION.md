# Ověření Business účtů

## Současný stav a hranice webového MVP

Klient vytváří `businessApplications/{uid}` s údaji firmy a povinnou první
provozovnou. Po ověření přihlašovacího e-mailu žádost ručně posuzuje
administrátor nebo owner. Schválení atomicky vytvoří Business roli, profil,
první pobočku a audit; vývojový projekt má také chráněný Admin SDK nástroj.
Skutečný tok je v `PRODUCT_FLOWS.md` a technický model v `DATA_MODEL.md`.

Nasazené administrátorské rozhraní umí žádost schválit a aktivovat. Místně je
za vypnutou volbou připravený nový serverový a klientský tok schválení,
zamítnutí, opravy žádosti, pozastavení a opětovné aktivace;
[výsledky a přesné meze](../MVP_SERVER_PLAN.md#business-review-local).
Callable wrapper a živé Business Rules uzavření zatím nejsou aktivované.
Pro veřejné webové MVP musí být ruční kontrola, aktivace,
zamítnutí a případné pozastavení účtu provozně dokončené. Přesná kritéria
kontroly a řešení sporů jsou stále otevřená; před vydáním se musí schválit a
otestovat. Automatické ověřování firem přes ARES, VIES ani jiné registry není v
plánu.

### Schválené chování k doplnění

Vlastník 23. listopadu potvrdil: zamítnutá žádost zobrazí důvod, zachová údaje
a umožní jejich opravu a nové odeslání na stejném účtu. Business oprávnění
vzniknou až po schválení. Pozastavení již aktivního Business účtu zastaví nové
publikování a propagaci, ponechá přístup k údajům a důvodu a nechá starší běžné
Shouty doběhnout. Opětovnou aktivaci smí provést admin/owner. Role se při
pozastavení neodebere, aby se zákaz nedal obejít osobním publikováním.
Místní implementaci a testy vlastník schválil 24. listopadu; tok je připravený,
dosud nenasazený. serverBusinessReview zůstává false a původní přímá cesta platí;
kritéria kontroly firem a řešení sporů tím nejsou rozhodnutá.

## Zásady kontroly

ShoutOut není banka ani tržiště a Business účet nedostává oprávnění nakládat s
majetkem firmy. Kontrola má přiměřeně omezit smyšlené firmy, omyly a vydávání
se za známou značku. Nemá tvrdit, že držitel účtu je statutárním orgánem nebo
ověřeným vlastníkem firmy.

Povinné ověření přihlašovacího e-mailu prokazuje přístup k této schránce.
Kontaktní e-mail může být i u veřejné služby; sám neprokazuje oprávnění jednat
za firmu. Telefon, DNS, video, poštovní dopis ani přístup do datové schránky se
v současném toku nevyžadují.

## Ruční aktivační tok

1. Žadatel zadá identifikační a kontaktní údaje firmy a samostatnou první
   provozovnu. Klient si Business roli nepřiděluje.
2. Po potvrzení přihlašovacího e-mailu zůstane na obrazovce stavu žádosti.
3. Administrátor nebo owner posoudí žádost podle schválených kritérií. Před
   veřejným vydáním je třeba stanovit, jak řešit nesoulad údajů, duplicitu
   firmy, spor o profil a změnu identifikačních údajů.
4. Současné schválení atomicky vytvoří roli 2, Business profil, první pobočku,
   stav žádosti a audit. Nové místní jádro doplňuje verzi žádosti, ověření
   skutečného Auth e-mailu a důvod zamítnutí/pozastavení. Oprava zůstane na
   stejném účtu bez Business oprávnění do nového schválení. Audit má pouze
   původní applicationId/administratorId vazby a snímky stavu/verze, nikoli
   kopie historických identit. Živý přechod ještě neproběhl.

Přidělení a odebrání role zůstává důvěryhodnou operací. Veřejný odznak nesmí
slibovat právní ověření vlastnictví firmy.

## Provozovny

Sídlo ani fakturační adresa firmy nejsou automaticky provozovnou. Registrační
formulář proto obsahuje povinnou samostatnou část **Pobočka/provozovna** s
veřejným názvem a adresou. Shodná adresa sídla a provozovny je povolená, ale
žadatel ji musí zadat nebo potvrdit samostatně. Jeden Business účet může mít
více poboček pod stejným registračním číslem.

- Současný klient přebírá souřadnice vybraného návrhu Geoapify. Před veřejným
  vydáním je třeba dokončit důvěryhodnou kontrolu adresy a polohy.
- Při tvorbě Shoutu se vybírá pobočka; pokud existuje jen jedna, vybere se
  automaticky.
- Shout nese ID pobočky a neměnný snímek její polohy pro feed a moderaci.
- Změna adresy ovlivňuje nové Shouty, nikoli historii publikovaného obsahu.

V první verzi není systém správců ani pozvánek. Business účet má jedno
přihlášení. Sdílení přihlašovacích údajů aplikace aktivně neusnadňuje a neumí
rozlišit, kdo konkrétní změnu provedl.

## Ochrana proti zneužití a spory

- Dosavadní produktový návrh počítá s jedním Business účtem na firmu a více
  pobočkami pod ním. Před veřejným webem je třeba určit, jak při ruční kontrole
  rozpoznat duplicitu a jak pravidlo bezpečně vynutit.
- První žadatel nemá získat neodvolatelné vlastnictví profilu. Převzetí nebo
  změna kontaktního e-mailu vyžaduje potvrzení nového kontaktu a při sporu
  ruční rozhodnutí administrátora; samotný e-mail není právním důkazem.
- Vydávání se za známou značku nebo veřejnou instituci musí mít zvýšenou ruční
  kontrolu. Uživatelé mohou podvodný profil nahlásit; postup vyhodnocení,
  pozastavení, odebrání Business role a odvolání se musí před vydáním dopracovat
  a auditovat.
- Oficiální název firmy, veřejný název a názvy poboček zůstávají oddělené.
  Změna identifikačních údajů nebo provozovny nesmí bez kontroly převést
  oprávnění na jiný subjekt ani zpětně přepsat historii Shoutů.

## Oddělení od monetizace

Ruční aktivace Business účtu a současné bezplatné funkce jsou součástí
webového MVP. Nárok na zvýraznění, propagační okénko a delší platnost musí být
oddělený od budoucí ceny. Předplatné, platby, fakturace a statistiky propagace
navazují později podle `../plans/roadmap/BUSINESS_MONETIZATION.md`; Business tokeny se
nezavádějí.
