# ShoutOut – Nová logika feedu, přečtených Shoutů a obnovování

## 1. Cíl

Upravit fungování hlavního feedu ShoutOutu tak, aby rozlišoval **nepřečtené a přečtené Shouty**, zachoval plynulé scrollování a umožnil uživateli obnovit feed pomocí tlačítka s počítadlem nových Shoutů.

Důležitou prioritou je minimalizace databázových operací ve Firebase Firestore, protože aplikace musí být připravená na růst počtu uživatelů.

Aplikace je vyvíjena ve Flutteru a využívá Firebase.

## 2. Řazení Shoutů

Feed bude rozdělen do dvou logických skupin:

**Nepřečtené Shouty**
- Zobrazují se vždy jako první.
- Řadí se podle vzdálenosti od uživatele, od nejbližšího po nejvzdálenější.

**Přečtené Shouty**
- Zobrazují se až za nepřečtenými.
- Také se řadí podle vzdálenosti, od nejbližšího po nejvzdálenější.

Obě skupiny tvoří jeden souvislý scrollovatelný feed, nikoliv dvě samostatné obrazovky.

Při stejné vzdálenosti použij stabilní sekundární řazení, aby nedocházelo k náhodnému přeskupování.

## 3. Automatické označování jako přečtené

Shout se označí jako přečtený automaticky, jakmile uživatel zobrazí celý jeho obsah.

Pravidla:
- Pokud se celý Shout vejde na obrazovku, musí být celý viditelný.
- Pokud je Shout vyšší než obrazovka, musí uživatel postupně zobrazit všechny jeho části.
- Rychlé přeskočení Shoutu nesmí automaticky znamenat jeho přečtení.
- Pokud Shout obsahuje rozbalitelný text nebo další skrytý obsah, nesmí být označen jako přečtený, dokud uživatel nezobrazí celý relevantní obsah.
- Přečtení se eviduje individuálně pro každého uživatele.
- Změna interního stavu přečtení proběhne okamžitě po splnění podmínek.

**Zásadní pravidlo:** Označení Shoutu jako přečteného nesmí okamžitě změnit jeho pozici v aktuálně zobrazeném feedu.

## 4. Stabilní pořadí při scrollování

Pořadí již načtených Shoutů zůstává během procházení feedu neměnné.

- Scrollování dolů postupně načítá další Shouty pomocí pagination.
- Načtení další stránky nesmí vyvolat nové seřazení již zobrazených Shoutů.
- Změna stavu přečtení nesmí přesouvat Shouty.
- Nově publikované Shouty se automaticky nevkládají doprostřed aktuálního feedu.
- Je nutné zabránit duplicitnímu zobrazení Shoutů a přeskakování položek při stránkování.

Aktuální pořadí feedu se mění pouze při jeho explicitním obnovení nebo při vytvoření nové relace feedu.

## 5. Refresh tlačítko s počítadlem

V horní části uživatelského rozhraní bude tlačítko pro obnovení feedu.

Tlačítko bude obsahovat indikátor počtu nových Shoutů dostupných od posledního obnovení.

Příklad:
- 1 nový Shout → indikátor 1
- 5 nových Shoutů → indikátor 5
- Více než 99 → indikátor 99+

Počítadlo má zobrazovat nové dostupné Shouty, nikoliv celkový počet všech nepřečtených Shoutů.

Nové Shouty musí odpovídat geografickým a ostatním platným filtrům feedu.

Při stisknutí tlačítka:
1. Získat aktuální data feedu.
2. Zohlednit aktuální stavy přečtení.
3. Rozdělit Shouty na nepřečtené a přečtené.
4. Seřadit obě skupiny samostatně podle vzdálenosti.
5. Sestavit nový feed.
6. Vrátit uživatele na začátek feedu.
7. Aktualizovat výchozí bod pro sledování nových Shoutů a resetovat odpovídající počítadlo.

Obnovení musí být plynulé a nesmí vést ke ztrátě stavů přečtení.

## 6. Firebase a optimalizace nákladů

Navrhni řešení s důrazem na nízké provozní náklady při vyšším počtu uživatelů.

Požadavky:
- Nepoužívat zbytečné opakované načítání celého feedu.
- Nezapisovat každé přečtení samostatně do Firestore, pokud existuje efektivnější způsob.
- Preferovat lokální evidenci přečtení a vhodnou dávkovou synchronizaci.
- Stav přečtení musí být oddělený od samotného dokumentu Shoutu.
- Počítadlo nových Shoutů implementovat způsobem, který minimalizuje databázové operace.
- Nepoužívat realtime listenery na celý feed, pokud nejsou nezbytné.
- Zohlednit limity Firestore, velikost dokumentů, indexy a náklady na čtení i zápisy.

Zajisti, aby se stavy přečtení správně zachovávaly při restartu aplikace a pokud možno i při přihlášení na jiném zařízení.

## 7. Okrajové situace

Prověř a ošetři zejména:

- Změnu polohy uživatele během scrollování.
- Nový Shout vzniklý mezi dvěma již načtenými vzdálenostmi.
- Smazání nebo expiraci Shoutu.
- Změnu dostupných geografických oblastí.
- Velký počet nepřečtených Shoutů.
- Přerušení internetového připojení.
- Opakované stisknutí refresh tlačítka.
- Restart aplikace během procházení feedu.
- Příspěvky vyšší než displej.
- Duplicitní načtení stejného Shoutu.

## 8. Postup implementace

Nejprve analyzuj aktuální architekturu feedu, Firestore dotazy, způsob geografického řazení, pagination a případnou existující evidenci přečtení.

Následně:

1. Popiš současné fungování a identifikuj části, které bude nutné změnit.
2. Navrhni datový model pro evidenci přečtených Shoutů.
3. Navrhni mechanismus stabilního stránkování podle vzdálenosti a stavu přečtení.
4. Navrhni efektivní způsob zjišťování počtu nových Shoutů.
5. Odhadni dopad na Firestore reads, writes a další provozní náklady.
6. Upozorni na technická omezení a případné kompromisy.

**Nezačínej zatím implementovat.** Nejprve mi předlož technický návrh, vysvětli rizika a vyjmenuj soubory nebo části aplikace, které bude nutné upravit. Počkej na moje schválení.

## 9. Akceptační kritéria

Řešení musí splňovat následující podmínky:

- Nepřečtené Shouty jsou po obnovení vždy před přečtenými.
- Obě skupiny jsou seřazeny podle vzdálenosti.
- Přečtení se zaznamená až po zobrazení celého obsahu.
- Přečtený Shout se během scrollování nepřesune.
- Načítání dalších Shoutů nezmění pořadí již načtených položek.
- Nové Shouty se po refreshi zařadí na správné místo.
- Refresh tlačítko zobrazuje počet nových dostupných Shoutů.
- Při refreshi se uživatel vrátí nahoru.
- Nedochází k duplicitám ani ke ztrátě Shoutů při stránkování.
- Řešení je optimalizované pro Firebase a budoucí růst ShoutOutu.