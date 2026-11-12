# Kapacita a automatické škálování ShoutOut

Lokální kapacitní úsek, 12. listopadu 2026. Cíl vlastníka je **100 000
registrovaných účtů a 5 000 současně aktivních uživatelů**. [Startovní
akceptace](../LAUNCH_READINESS.md#capacity-target) není dosud splněná.
Tento dokument dokládá model a omezené emulátorové testy, ne cloudovou
propustnost, cenu nebo nové nasazení. Aplikační runtime, Rules a živá data
se tímto úsekem nemění. [Aktuální politika obnovy/přečtení](../plans/feed/FEED_READING_POLICY.md#refresh-boundary-policy)
má přednost před starším automatickým desetisekundovým uploadem.

## Reprodukovatelný model

Spuštění z kořene: `node tools/capacity_model.mjs --json`, případně
`npm --prefix tools run model:capacity`. Export `modelCapacity(overrides)`
umožňuje měnit předpoklady; neznámé/neplatné parametry se odmítnou.
Nástroj nemá Firebase import, přihlašování ani síťový přístup.

Deterministický seznam 100 000 syntetických identit má SHA-256
`9a5ebb8a8b15560672f0eefee75d18179c39492d78b9f6affd0174477627b142`.
V databázi se nevytváří 100 000 profilů; jde o model velikosti populace,
nikoli měření dotazů nad takto velkou databází. Nových Auth účtů je nula.

**Předpoklady základního scénáře, nikoli odhad návštěvnosti:**

- 5 000 aktivních relací po dobu 600 s; otevření rozložená do 60 s.
- Na relaci čtyři úvodní feed stránky po 50 kartách, jedna ruční obnova
  v polovině okna, ta načte první stránku. Špička obnov je modelována rozložením
  do 60 s. Nejde o časovou simulaci cloudových front.
- 60 nových značek přečtení vzniká rovnoměrně během okna. Při spuštění
  není čekající outbox; při obnově se odešle prvních 30 značek, zbývajících 30
  zůstane místně do dalšího spuštění/obnovy. Cloudové přečtení tedy není okamžité.
- Dávka 32; pro download důsledně označený návrh 32 bloků na stránku.
  První snapshot předpokládá 21 bloků (vzorek B2 pro 1 000 značek), delta jeden
  blok. Nejde o zaručený počet bloků všech uživatelů nebo dnů expirace.
- Průměrné akce na relaci: dvě reakce, jedno uložení, 0,1 komentáře a 0,02
  publikace. Zlomky vyjadřují podíl celého souboru, ne necelý zápis jednoho člověka.

| Výstup za modelové desetiminutové okno | Výsledek | Hranice |
|---|---:|---|
| Feed stránky | 25 000 | Včetně dalšího stránkování a ruční obnovy. |
| Celé dokumenty vybraných karet | nejméně 1 250 000 | Bez indexových uzlů, kontrol dostupnosti, dalších načtení, listenerů a retry. Platí pro plné stránky; reuse beze změn nyní není zapojené. |
| B2 upload požadavky | 5 000 | Jedna dávka při obnově; místně zůstává 150 000 později vzniklých značek. |
| B2 download požadavky | 10 000 | Spuštění + obnova, předpokládaný stav se vejde do jedné stránky. |
| B2 průměr během 60s hranice obnov | 83,3 uploadů/s + 83,3 downloadů/s | Nezaručuje rovnoměrné příchozí požadavky ani naměřenou propustnost. |
| B2 download dokumentové reads ve starším návrhu ochran | 310 000 + 10 000 rate writes | Předpokládá 20 pevných reads/call; wrapper dosud není implementovaný. Bez uploadu/indexových položek/retry. |
| Nová technická potvrzení obsahových akcí | 15 600 | Model uvedených akcí, nikoli read markerů. |
| Jejich odčerpání dnešní kapacitou 500/den | nejméně 32 běhů po dozrání | Předpokládá žádné další přírůstky, přeskočené záznamy ani poruchu; jde o nevhodnou kapacitu pro tento scénář. |

Výstup obsahuje i variantu s 1 000 čekajícími značkami na účet, návrat všech
klientů během jedné sekundy a nulovou uživatelskou zátěž. Kontroluje zachování
počtu značek mezi původní frontou, novým čtením, uploadem a zbývající frontou.
Četnosti představují nabídnutou práci při uvedeném rozložení; model nesimuluje
časovou osu token bucketu, front serveru, backoff ani zpětný tlak. Například
1 000 čekajících značek potřebuje 32 uploadů na účet; starší návrh burst 6 /
doplnění 1 za 5 s je nemůže všechny přijmout během první minuty. Nejkratší
čekání na 32. token je 130 s od plného počátečního bucketu, bez dalších
požadavků téhož účtu a bez latence obsluhy. Nelze tím blokovat rychlou obnovu
a zároveň slibovat okamžitý úplný read snapshot. Před implementací B2 revidovat
admission/burst i průchod velkou frontou; tento limit zatím není živě zapnutý.
Starý 10s upload je jen srovnávací ilustrace (300 000 požadavků, kdyby každý
tick měl nové značky); má jinou čerstvost serverových dat. Nevydávat rozdíl
za univerzální procento úspory při stejné službě.

Číslo B4 nemá zvolený detekční protokol ani četnost. Model je označuje jako
neznámé, nikoli zdarma. Stejně nezahrnuje celý objem listenerů, přílohy,
Auth/App Check, cloudový výpočet, indexové položky či přenosy do ceny.
Bez denní aktivity a rozdělení expirací nelze z cíle účtů určit denní úklid.

## Emulátorové ověření existujících jader

`functions/capacity.integration.test.js` běží jen s přesným
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` a projektem `shoutout-rules-test`.
Používá maximálně čtyři souběžné publikace/reakce a malé izolované fixture;
nesimuluje 5 000 síťových uživatelů. Žádné skutečné Auth účty nevytváří.
Testy jsou zahrnuté v `npm --prefix tools run test:rules`.

| Průchod | Výsledek |
|---|---|
| Čtyři autoři publikují ve stejné geohash oblasti | Všech pět zdrojů včetně původního zůstalo v indexu, starší snapshot obsahoval jen původní kartu. |
| Čtyři účty reagují na stejný Shout a opakují totožné požadavky | Počet 4, čtyři osobní reakce i správný Top index; replay nepřidal žádný zápis. |
| Dvě zařízení jednoho UID + druhé UID | První účet má sjednocené tři značky, druhý pouze vlastní čtvrtou; revize 2/1, replay beze změny. |
| 503 starých potvrzení + neznámé a čerstvé | První běh prohlédl 500 / odstranil 499, nový worker pokračoval dalšími čtyřmi; čerstvé/neznámé zachované a opakování bezpečné. |

Poslední cílený lokální běh: **4/4 prošly**. Zachycené SDK operace:

| Úsek bez přípravy fixture | Reads včetně pokusů | Pokusy transakcí / commit | Pokusy zápisů / potvrzené mutace |
|---|---:|---:|---:|
| Publikace do stejné oblasti | 88 | 8 / 4 | 48 / 24 |
| Reakce a replay | 200 | 15 / 8 | 77 / 28 |
| B2 uploady/downloady a replay | 79 | 7 / 6 | 8 / 6 |

Počítají se skutečné SDK get/getAll a dotazové dokumenty (minimum 1 pro
prázdný dotaz), opakované pokusy i commitované mutace. Nejde o fakturační
Query Explain ani čtení indexových položek; počty mohou s retry kolísat.
Zachycené opakování je důvod zkoumat konflikty, ne důkaz konkrétní cloudové
latence nebo nutnosti okamžité změny schématu. První pokus B2 testu měl
nesladěný fixture clock s historickým readTime; opravený test používá čas
emulátoru pro kurzor, aplikační kód se kvůli tomu neměnil.
Lokální důkazy: build/capacity-emulator-final.log a výstup modelu;
čtyři modelové regrese a 55 tools testů prošly, Functions lint čistý.
Zdroj `4024e496d017ebd6705b9ccd4d5dc697ac26b3c8` má
[úspěšné CI 43254458838](https://github.com/MikeyBeatz/ShoutOut/actions/runs/43254458838):
361 Flutter, 10 skutečných Chrome/IndexedDB, 55 tools, 124 Functions unit
(421 integračních přeskočeno v neemulátorové fázi), 448 Rules/server,
116 purge a 15 Storage; formát, analýza, lint i webový build prošly.
Lokální úsek je tím uzavřený, bez nasazení a bez tvrzení o cloudové kapacitě.
CI potvrdilo stejnou správnost s jiným počtem retry: publikace 77 reads /
7 pokusů / 4 commity, reakce+replay 136 reads / 11 pokusů / 8 commitů.
To podporuje nutnost započítat proměnlivou konfliktní práci, ne slib fixní ceny.

## Revize škálování a B2 — konkrétní směr, zatím bez aktivace

1. Zachovat úsporný provoz při malé zátěži; uživatelské Functions mohou mít
   minInstances 0 a dle zátěže přidávat instance do ověřeného maxima. Společný
   algoritmus neznamená stejná čísla pro DEV/produkci nebo čtení/zápisy/úklid.
   Testovat více souběžných požadavků na instanci; hodnoty vybrat podle CPU,
   paměti, DB konfliktů a skutečné odezvy, ne prostým násobením počtu účtů.
2. Nástroj poskytuje citlivostní tabulku z Littleova vztahu: instance přibližně
   ceil(příchody/s × doba obsluhy / souběh / využití). Doby 250/1 000/3 000 ms,
   souběh 1/8/16 a využití 60 % jsou jen vstupy modelu. Například při 83,3
   požadavcích/s, jedné sekundě obsluhy a souběhu 8 vychází 18 instancí pro
   daný endpoint. Není to doporučené produkční nastavení ani záruka paralelismu.
3. Znovu navrhnout kapacitu úklidu potvrzení/read bloků a indexové historie
   podle přírůstku a stáří dluhu. Stávající 500 receipt/den ani dříve navržených
   5 000 read bloků/den nepovažovat za produkční řešení tohoto cíle. Potřebujeme
   omezené pokračování práce při dluhu a úsporné prázdné běhy; konkrétní frontu,
   frekvenci, prostředky a případnou službu předložit po změření nákladů.
4. Před runtime B2 změnit trigger politiku na spuštění/obnovu, zachovat outbox,
   checkpoint/retry a oddělení UID. Pro B3 musí obnova zachytit potvrzený úplný
   read snapshot; dnešní unawaited hook tuto podmínku neplní. Selhání nesmí
   ztratit místní značky ani vydávat částečný stav za úplný.
5. Mikrooptimalizace k samostatnému ověření: sloučení duplicitních požadavků,
   reuse neměnných indexových bloků mezi requesty a potvrzení beze změny,
   inkrementální detekce B4 místo stahování celých Shoutů. Dnešní factory
   vytváří nový blockCache se store; sdílení vyžaduje zachovat retenční fence,
   rozpočty paměti a souběh. Nikdy necachovat oprávnění nebo dostupnost tak,
   aby obešla smazání, blokaci či moderaci.
6. Živý test před spuštěním: postup 100/500/1 000/2 500/5 000 aktivních relací,
   rozložený provoz i hustá oblast a nárazový návrat. Zvlášť teplé/studené odezvy,
   p95/p99, chyby, fronty, retry, čítače, náklady/akci a schopnost odčerpat dluh.
   Konkrétní SLO, doby a finanční maximum testu musí být připravené a schválené;
   tento úsek placené ověření ani produkční změny nespouští.

Pracovní návrh SLO k pozdějšímu schválení: pro známou polohu a načtenou aplikaci
první feed stránka i běžný obsahový zápis p95 do 2 s / p99 do 5 s od požadavku
po použitelný výsledek, při ustálené zátěži. Studené starty vykazovat zvlášť
(návrh p95 do 5 s / p99 do 10 s), nikoli je zahodit z reportu. Neplánované chyby
pod 0,1 %; kapacitní 429/5xx a timeouty počítat jako chyby. Očekávané odmítnutí
neplatného požadavku či vyčerpané osobní kvóty sledovat odděleně. Správnost
čítačů, neopakování zápisů a oddělení účtů musí platit při každé dokončené akci.
Je to návrh měřitelných kritérií, nikoli již schválený příslib nebo výsledek.
Navržený průběh cloudového testu: stupně s dvouminutovým rozběhem, na cíli
10 minut ustálené práce, samostatný nárazový návrat a následná kontrola zotavení
a dluhu. Placený test nespustit bez konkrétního rozpočtu a izolovaných fixture.

Při nulovém používání má model nula uživatelských požadavků, ale stávající
minutový worker stále představuje až 1 440 plánovaných vyvolání denně a
receipt cleanup jedno denně. Nezaměňovat nulový uživatelský provoz za nulový účet.
Pro další zdrojovou změnu připravit konkrétní runtime návrh s měřitelnou úsporou;
nasadit až jeho přesný otestovaný commit podle RELEASING.
