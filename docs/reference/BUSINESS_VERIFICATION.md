# Ověření Business účtů

## Současný stav a hranice webového MVP

Klient vytváří `businessApplications/{uid}` s údaji firmy a povinnou první
provozovnou. Po ověření přihlašovacího e-mailu žádost ručně posuzuje
administrátor nebo owner. Schválení atomicky vytvoří Business roli, profil,
první pobočku a audit; vývojový projekt má také chráněný Admin SDK nástroj.
Skutečný tok je v `PRODUCT_FLOWS.md` a technický model v `DATA_MODEL.md`.

Serverový a klientský tok schválení, zamítnutí, opravy žádosti, pozastavení
a opětovné aktivace je nasazený pouze v DEV a má uzavřený klientský pilot.
[Nasazení a audit](../MVP_SERVER_PLAN.md#moderation-business-dev-results),
[aktuální revize](../operations/MVP_COMPLETED_WORK_REVIEW_2026-11-27.md).
serverBusinessReview i Business Rules brána jsou v DEV aktivní; starou přímou
aktivační cestu nelze považovat za současnou autoritu. Produkční aktivace,
kritéria kontroly firem a řešení sporů zůstávají otevřené. Automatické ověření
přes ARES/VIES ani jiné registry se neplánuje.

### Schválené a v DEV ověřené chování

Zamítnutá žádost zobrazí důvod, zachová údaje a umožní opravu/nové odeslání
na stejném účtu. Business oprávnění vzniknou až schválením. Pozastavení
zastaví nové publikování a propagaci, ponechá firemní údaje i detail důvodu
a nechá starší běžné Shouty doběhnout. Role se neodebere; reaktivuje admin/owner.
Oprava kontrastu a Profilu i reaktivace jsou potvrzené uživatelem. Živý pilot
potvrdil nové odeslání; konkrétní změnu názvu uživatel při tomto průchodu
neprovedl, proto ji nevydáváme za samostatně živě ověřenou editaci.

Vlastník 28.11. upřesnil F-05: firma si sama volí provozovnu nebo oblast
působení, včetně samotného města, bez dalšího ověřování adresy či přítomnosti.
Sídlo je samostatný fakturační údaj. Současný výběr měst funguje a zůstává;
`geocodingStatus: verified` zde neprokazuje skutečné působení firmy.
[Bezpečné ukládání současných log F-03](../plans/BUSINESS_LOGO_SAFETY.md)
má schválenou pouze místní přípravu, bez DEV aktivace.

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
  kopie historických identit. Tento tok má doložený DEV přechod podle úvodu.

Přidělení a odebrání role zůstává důvěryhodnou operací. Veřejný odznak nesmí
slibovat právní ověření vlastnictví firmy.

## Provozovny

Sídlo ani fakturační adresa firmy nejsou automaticky provozovnou. Registrační
formulář proto obsahuje povinnou samostatnou část **Pobočka/provozovna** s
veřejným názvem a adresou. Shodná adresa sídla a provozovny je povolená, ale
žadatel ji musí zadat nebo potvrdit samostatně. Jeden Business účet může mít
více poboček pod stejným registračním číslem.

- Současný klient přebírá souřadnice vybraného návrhu Geoapify. Firma volí
  přesnou adresu nebo oblast (například město); další dokazování se nevyžaduje.
  Oblast je pro nynější feed zastoupená vybraným mapovým bodem.
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
