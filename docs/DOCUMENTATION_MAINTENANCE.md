# Pravidla a kontrola projektové dokumentace

Schválený úklid dokumentace dokončený 3. listopadu 2026. Nemění funkce aplikace,
data, schválené produktové volby ani stavy milníků pouhým přeskládáním textu.

## Odpovědnosti dokumentů

| Dokument | Účel | Co do něj nepatří |
|---|---|---|
| [TODO](TODO.md) | Priority, metriky, nejbližší otevřená práce a souhrn milníků. | Chronologie testů/rolloutů, seznam všech dokončených podkroků. |
| [BACKLOG](BACKLOG.md) | Jediná checkboxová evidence požadavků, zachované akceptační podmínky. | Kopie metrik z jiných checklistů nebo automatické zaškrtnutí podle nového textu. |
| [PROJECT_STATUS](PROJECT_STATUS.md) | Jeden další krok, aktuální implementace a poslední ověřené nasazení s hranicemi důkazů. | Několik současných „dalších kroků“ z různých dnů, dlouhá historie. |
| [MVP_SERVER_PLAN](MVP_SERVER_PLAN.md) | Serverové požadavky a kritéria dokončení. | Dočasný pracovní příkaz vydávaný za povinný další krok. |
| Specializovaný plán | Rozhodnutí, závislosti, otevřené části a důkazy dané oblasti. | Nerozlišený původní návrh a pozdější schválené řešení. |
| [Archiv](archive/README.md) | Neměnné historické snímky a nahrazené návrhy. | Aktuální pokyny k nasazení nebo nové úkoly odvozené ze starého stavu. |

Kód a konfigurace dokazují skutečné chování; test neprokazuje nasazení.
Nasazení doložit zdrojem, CI a kontrolou výsledku. U neověřeného rozporu
zapsat nejistotu, nevymýšlet nové rozhodnutí ani měnit checkbox.

## Provedený postup úklidu

Mapa je výslovně schválená vlastníkem 3. listopadu 2026:
[přesné rozdělení](DOCUMENTATION_LAYOUT_PROPOSAL.md). Přesuny lze provést
v uvedeném rozsahu, bez dalšího dotazu na jednotlivé soubory.

1. Srovnat hlavní přehledy, účtové/feedové plány a metriky. Zachovat úplné
   původní texty před zkrácením a stabilní kotvy používané odkazy.
2. Prověřit ostatní dokumenty: jejich účel, současnost tvrzení, návaznosti,
   duplicity a odkazy z celého repozitáře.
3. Předložit konkrétní mapu složek a přesunů vlastníkovi. Před jejím schválením
   nepřesouvat existující plány a provozní/reference dokumenty.
4. Po schválení přesunout soubory, aktualizovat všechny odkazy a rozcestníky
   včetně AGENTS/README a znovu spustit kontrolu.

Všechny čtyři části jsou dokončené. Přesunuto 37 schválených dokumentů,
vytvořeny tematické rozcestníky. TODO je zkrácené z 305 na přibližně 145 řádků,
PROJECT_STATUS z 830 na přibližně 110; úplné původní texty jsou v archivu.
Opravené rozpory zahrnují dokončení účtového purge, retenci receipt,
historické „žádné Functions“, produkční sdílený projekt a staré pořadí práce.

Závěrečná kontrola: 64 Markdown souborů (55 v docs), všechny dokumenty v docs
dohledatelné z hlavního indexu a interní odkazy/kotvy bez chyb. Metriky
107/157 a 9/24 zůstávají stejné; zachované jsou všechny checkboxové řádky
(s přepočtenými schválenými cestami) i čtyři registrované snímky.
Negativní zkouška potvrdila odmítnutí chybějícího souboru, kotvy a osiřelého
dokumentu. Aplikační testy nebyly kvůli této dokumentační změně lokálně opakovány;
nejde o nové ověření živých služeb ani cen/právních podmínek externích zdrojů.

## Jak aktualizovat stav při další práci

- Nový požadavek: zařadit do BACKLOG s hranicí MVP/po MVP a navázat na plán.
- Rozhodnutí: zaznamenat jednou do příslušného plánu; přehledy na něj odkazují.
- Připravený kód: uvést odděleně od výsledků kontrol a živého nasazení.
- Dokončený podkrok: v TODO nahradit dalším otevřeným úkolem; důkazy zachovat
  v plánu/testovací dokumentaci. Použít věcný název, nikoli „bod 1“ z chatu.
- Dokončený milník: zkontrolovat celé kritérium, upravit jeho stav i odvozené
  metriky. Lokální příprava není dokončená cloudová funkce.
- Historie: před odstraněním unikátní informace uložit odkazovaný snímek nebo
  ji přenést do příslušného plánu. Nové snímky registrovat v snapshots.json.
- Přesuny: použít schválenou mapu, opravit vstupní i výstupní odkazy,
  indexovat nový dokument z hlavního nebo dílčího rozcestníku.

## Opakovatelná kontrola

Z kořene repozitáře: `node tools/check_docs.mjs` nebo `npm --prefix tools run check:docs`.
Audit s úplnou inventurou: `node tools/check_docs.mjs --audit --json`.

Kontrola ověřuje interní Markdown odkazy, velikost písmen cest, kotvy nadpisů
a HTML ID, dohledatelnost z README/AGENTS/hlavního rozcestníku, počty úkolů
a milníků a SHA-256 registrovaných snímků. Pracuje s verzovanými a novými
neignorovanými soubory. Neprochází docs/local, tajemství, externí webové URL
ani obsah historických plaintext snímků. Neumí sama potvrdit pravdivost
produktového tvrzení, nasazení ani právní aktuálnost; to vyžaduje věcnou kontrolu.

Původní archivní TODO má pevný hash. Nové úplné plaintext snímky neinterpretují
staré relativní odkazy jako aktuální navigaci; archivní index uvádí původní
zdroj/commit a kontrolní součty. Jejich obsah se nepřepisuje.
