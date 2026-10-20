# ShoutOut – Business monetizace

Tento dokument je zdrojem produktových rozhodnutí o budoucí Business
monetizaci. Technické úkoly jsou v `TODO.md`; ruční kontrola firmy je popsaná
v `BUSINESS_VERIFICATION.md`.

## Platné rozhodnutí a současný stav

Dne 20. října 2026 byl dřívější model nákupu a čerpání Business tokenů
zrušen. Business tokeny, jejich balíčky, zůstatky ani účetní kniha nebudou
součástí produktu. Budoucí monetizace Business účtů bude založená na
**předplatném**. Podoba plánu se teprve dopracuje; tento dokument neurčuje
počet tarifů, ceny, fakturační období ani placené nároky.

Webové MVP funguje bez plateb. Aktivní Business účet může používat současné
bezplatné propagační funkce. Produkční oprávnění a limity těchto funkcí se
musí dokončit před veřejným vydáním, ale předplatné a platební rozhraní až v
navazujícím vývoji. Nynější klient ani Firestore Rules předplatné neevidují a
nevynucují. Technické úkoly a hranice vydání jsou v `TODO.md`.

## Bezplatné Business funkce ve webovém MVP

- Pouze důvěryhodně aktivovaný Business účet smí použít delší platnost Shoutu
  až 7 dní, zvýraznění a propagační okénko. Tyto funkce jsou do zavedení
  monetizace zdarma.
- Nárok na funkci, jeho použití, serverové limity a případná budoucí cena
  zůstávají oddělené. Business role sama nemá později automaticky znamenat
  nárok na všechny placené funkce; konkrétní oprávnění předplatného určí
  navazující návrh.
- Klient si nesmí sám přiznat Business roli ani obejít serverový limit.
  Pozdější zavedení předplatného nesmí zpětně účtovat použití z bezplatné fáze
  ani vyžadovat zásadní přestavbu Business profilů a publikování Shoutů.
- Firma může mít nejvýše dva současně aktivní promo Shouty napříč pobočkami.
  Limit je ještě třeba serverově vynutit; zbývá určit, zda kombinace
  zvýraznění a okénka spotřebuje jeden slot.

## Otevřený návrh předplatného po MVP

Před implementací je třeba schválit zejména počet a rozsah plánů, cenu, měnu,
fakturační období, zkušební nebo zvýhodněnou fázi, změnu plánu, zrušení,
obnovení, neúspěšnou platbu a chování po skončení nároku. Teprve potom lze
navrhnout serverově spravovaný stav předplatného, oprávnění funkcí, audit a
odpovídající testy. Klient ani změna veřejné Business role nesmí nárok
samostatně udělit.

Founder zůstává možným samostatným auditovaným zvýhodněním pro vybrané
podniky, nikoli další veřejnou rolí nebo tokenovým zůstatkem. Podmínky
přidělení, odebrání a vztah k předplatnému jsou otevřené. Kosmetická nabídka
zůstává samostatným návrhem; nesmí dávat moderátorská oprávnění ani
bezpečnostní výhodu.

Zda bude předplatné zahrnovat delší platnost, zvýraznění, okénko nebo větší
dosah, není rozhodnuto. Dřívější návrh dokupování vzdálenostních pásem za
tokeny neplatí; o případném rozšíření dosahu je třeba rozhodnout znovu v
rámci předplatného. Současný místní dosah Business Shoutu se nemění.

## Současné propagační funkce a pozdější statistiky

- Po zaškrtnutí **Na více než 24 hodin** pokračuje výběr po celých dnech až do
  7 dní. Jen Business účet může tuto platnost použít.
- Zvýraznění a propagační okénko jsou samostatné volby a lze je kombinovat.
  Bez nich vznikne standardní Business Shout.
- Okénko je připnuté nahoře ve feedu, po 6 sekundách se cyklicky střídá a
  uživatel může položkami listovat. Obsahuje avatar, titulek a vzdálenost od
  pobočky; otevře celý Shout. Bez aktivního okénka do 20 km se prostor
  nezobrazí. Aktivní okénka se v cyklech promíchávají.
- Důvěryhodné statistiky propagace – unikátní dosah, celková zobrazení,
  rozkliknutí a míra prokliku – se zavedou až s monetizací. Klient je nesmí
  sám určovat. Vzdálenostní pásma se ve statistikách nesledují.

## Platby a fakturace po MVP

Dosavadní návrh počítá se Stripe jako platebním poskytovatelem. Konkrétní tok
předplatného, dostupné platební metody včetně karty, Apple Pay a Google Pay a
zapojení budoucích mobilních klientů je nutné před implementací znovu
navrhnout a ověřit. ShoutOut nemá ukládat celé číslo karty ani CVC; stav
platby a nároku smí potvrdit jen důvěryhodná serverová událost, nikoli návrat
z platebního dialogu. Události musí být idempotentní a auditované.

Fakturace je na firmu, ne na jednotlivé pobočky. Pro doklady se použijí
fakturační údaje Business profilu; jejich pozdější změna nesmí přepsat již
vystavené doklady. Před spuštěním plateb je nutné rozhodnout o DPH/VAT,
měnách, číslování a retenci dokladů, refundacích a chargebacku.

Dříve navržený Stripe SetupIntent při Business registraci není součástí
webového MVP. Případné ověření karty bez účtování je otevřená pozdější volba,
nikoli důkaz oprávnění jednat za firmu ani podmínka ruční aktivace.

## Business rozhraní

Ve webovém MVP zůstává funkční sekce **Propagace** s historií bezplatných
funkcí. Nefunkční položka **Tokeny** se odstraní; **Nákupy a faktury** a
prázdné statistiky propagace se před vydáním skryjí. Tokenová sekce se
nevrátí; podobu správy předplatného, plateb a dokladů určí navazující návrh.
Rozhraní nesmí slibovat neimplementovanou platební metodu ani zobrazovat
fiktivní metriky.

## Pořadí zavedení

1. Dokončit bezplatné Business funkce, serverové limity a skrytí odložených
   částí rozhraní pro veřejné webové MVP.
2. Schválit produktový, účetní a provozní návrh předplatného bez Business
   tokenů a jeho vztah k Founder zvýhodnění i případnému většímu dosahu.
3. Navrhnout a implementovat důvěryhodné platby, stav předplatného,
   oprávnění, fakturaci, audit a automatické testy.
4. Teprve s monetizací zapojit a zobrazit důvěryhodné statistiky propagace.
