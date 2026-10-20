# Karma, achievementy a kosmetické odměny

## Schválené oddělení hodnot

- **Karma** je nereálná reputační veličina. Nelze ji koupit, převést, utratit ani
  směnit za nárok k Business předplatnému a sama neuděluje moderátorská
  oprávnění.
- **Business monetizace** bude po webovém MVP řešená předplatným podle
  `BUSINESS_MONETIZATION.md`. Business tokeny se nezavádějí. Případné kosmetické
  coiny jsou samostatný nerozhodnutý návrh, nikoli platební prostředek pro
  Business funkce.
- **Kosmetika** mění pouze vzhled avatara/profilu. Nesmí zvýšit dosah, pořadí ve
  feedu, limity, viditelnost ani pravomoci.

## Důvěryhodné události

Karma může v budoucnu vznikat pouze ze serverově ověřených událostí s unikátním
ID: potvrzené užitečné reakce od různých účtů, dlouhodobě bezproblémová pomoc a
schválený komunitní přínos. Samotné publikování, zobrazení, Follow, počet
komentářů ani vzájemné reakce stejné malé skupiny se neodměňují.

Negativní událost smí vzniknout až z pravomocného moderátorského rozhodnutí, ne
ze samotného hlášení nebo dislike. Zrušený postih vytvoří kompenzační záznam;
historie se nepřepisuje.

## Ochrana proti farmení

- serverová účetní kniha s idempotentním ID události a denními/stropními limity;
- žádná odměna mezi blokovanými účty, za vlastní obsah ani z čerstvých či
  propojených účtů bez dostatečné historie;
- detekce opakovaných dvojic a shluků, ochlazení po změně účtu a možnost
  auditovaného odebrání podvodně získané hodnoty;
- karma se nezobrazuje jako přesný globální žebříček a nepoužívá se pro automatické
  trestání ani potlačení obsahu.

## Achievementy a prezentace

První sada může obsahovat malé odznaky za bezpečné milníky typu dokončený profil,
ověřený Business profil nebo dlouhodobý přínos potvrzený více nezávislými
událostmi. Uživatel si zvolí nejvýše jeden veřejný odznak u avatara. Každý má
textový název, ikonu rozlišitelnou bez barvy a lokalizaci do všech sedmi jazyků.

Názvy a ikony podléhají moderaci a nesmějí napodobovat flairy Business,
Moderátor, Admin nebo Owner. Globální ani Follow žebříček se nyní nezavádí;
nejprve musí existovat serverová kniha a data dokazující, že metrika není snadno
farmitelná.
