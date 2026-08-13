# ShoutOut – Business monetizace

Tento dokument je jediným zdrojem produktových rozhodnutí o platbách,
Business tokenech, placených funkcích a fakturaci. Ověření firmy je samostatně v
`docs/BUSINESS_VERIFICATION.md`; technické implementační kroky zůstávají v
`TODO.md` a odkazují sem.

## Schválený model

- Business účet nemá pravidelné tarify ani předplatné.
- Firma kupuje pouze tokeny a následně je používá k propagaci Shoutů.
- Cenu tokenů, balíčky, cenu jednotlivých typů propagace, expiraci tokenů a
  pravidla vracení tokenů ještě musíme určit před implementací nákupů.
- Zůstatek nesmí být obyčejné číslo přepisovatelné klientem. Každý nákup,
  čerpání, vrácení nebo administrativní oprava musí mít serverový účetní záznam.

## Bezplatná zaváděcí fáze premium funkcí

- Schválené Business premium funkce se implementují a zpřístupní ještě před
  tokeny bez poplatku: platnost až 48 hodin, zvýrazněný Shout a propagační okénko.
- Uživatelský tok, datový typ propagace a kontrola oprávnění musí být od začátku
  oddělené od ceny. V bezplatné fázi autorizační vrstva vrátí nulovou cenu;
  později ji nahradí serverové odečtení tokenů bez předělání formuláře a feedu.
- Klient si nesmí sám přiznat Business roli ani obcházet limity. „Zdarma“
  znamená nulovou cenu pro důvěryhodně aktivovaný Business účet, nikoli veřejnou
  funkci pro běžné účty.
- Zapnutí tokenů, ceny a plateb je samostatná budoucí změna a nesmí zpětně
  účtovat použití z bezplatné fáze.

## Platební metody

- Primární poskytovatel je Stripe.
- Nákup tokenů má podporovat platební kartu, Apple Pay a Google Pay podle
  dostupnosti dané metody na zařízení, prohlížeči a v zemi zákazníka.
- ShoutOut nikdy neukládá celé číslo karty ani CVC; citlivé platební údaje
  zpracovává poskytovatel plateb.
- Stav nákupu a připsání tokenů se potvrzuje pouze důvěryhodnou serverovou
  událostí poskytovatele. Návrat z platebního dialogu sám o sobě nestačí.

## Ověření karty při registraci

- Do budoucna je navržen Stripe SetupIntent bez účtování částky jako jednoduchý
  signál proti zneužití, nikoli jako právní důkaz oprávnění jednat za firmu.
- Banka může podle vlastních pravidel krátce zobrazit dočasnou ověřovací
  rezervaci, i když ShoutOut neúčtuje žádnou částku.
- Zapojení SetupIntent je odložené, dokud projekt nemůže přejít z Firebase Spark
  na placený plán. Do té doby karta není podmínkou registrace ani aktivace
  Business účtu.

## Platnost Shoutu až 48 hodin

- Pouze Business účet uvidí nad běžným výběrem délky checkbox **Až 48 hodin**.
- Po zaškrtnutí se časové ciferníky rozšíří až na maximálně 48 hodin.
- Funkce bude zpočátku zdarma.
- Později může být placenou funkcí nebo se hradit tokeny. Konkrétní cena ani
  způsob účtování zatím nejsou rozhodnuté.
- Nárok na delší platnost a maximální expiraci musí vždy ověřovat server, aby šlo
  funkci později zpoplatnit bez změny uživatelského toku.

## Fakturace a doklady

- Faktury se vystavují na firmu, nikdy na jednotlivé pobočky.
- Pro doklady se používají fakturační údaje z Business profilu: oficiální název,
  registrační číslo, DIČ/VAT ID, fakturační adresa a fakturační e-mail.
- Změna fakturačních údajů nesmí zpětně měnit již vystavené doklady.
- Sekce **Nákupy a faktury** obsahuje historii nákupů tokenů a související
  doklady ke stažení.

## Business rozhraní

- Sekce **Tokeny** zobrazuje zůstatek, historii pohybů a nákup tokenů.
- Sekce **Nákupy a faktury** zobrazuje nákupy a doklady vystavené na firmu.
- Apple Pay a Google Pay se nabízejí pouze tehdy, když poskytovatel potvrdí jejich
  dostupnost; rozhraní nesmí slibovat metodu, kterou zařízení nepodporuje.

## Otevřená rozhodnutí před implementací plateb

- ceny a velikosti balíčků tokenů;
- cena jednotlivých typů propagace;
- zda tokeny expirují a jak se řeší nevyužitý zůstatek;
- pravidla refundace nákupu a vrácení tokenů při neprovedené propagaci;
- DPH/VAT, měny, číslování dokladů a daňové požadavky jednotlivých zemí;
- zda a kdy se 48hodinová platnost začne hradit tokeny;
- retenční doba účetních záznamů a faktur;
- postup při chargebacku, duplicitní serverové události a nedokončené platbě.

## Pořadí zavedení

1. Dokončit Business registraci, ověření a fakturační údaje bez povinné karty.
2. Po možnosti přejít na placený Firebase plán zapojit serverový Stripe základ a
   případné ověření karty přes SetupIntent.
3. Ještě bez plateb zpřístupnit Business premium funkce zdarma a měřit jejich
   technické používání bez reklamní analytiky nebo profilování uživatelů.
4. Implementovat účetní knihu tokenů, nákup kartou, Apple Pay a Google Pay.
5. Přepnout vybrané typy propagace z nulové ceny na schválenou tokenovou cenu.
6. Až podle reálného používání rozhodnout o zpoplatnění 48hodinových Shoutů.
