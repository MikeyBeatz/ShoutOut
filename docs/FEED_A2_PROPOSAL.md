# A2 – návrh dalšího ověřovacího úseku

31. října 2026. **Historický návrh, nahrazený následným rozhodnutím vlastníka.**
Aktuální směr: [progresivní feed](FEED_PROGRESSIVE_PLAN.md). Vlastník odmítl
úplný průchod okolí před první stránkou a schválil rozšiřování podle potřeby.
Níže uvedené pracovní limity nejsou schválenými provozními limity. Nové jádro
je lokálně připravené, ale není napojené na živou aplikaci. Původní text zůstává
pro zachování historie; jeho staré stavy nejsou aktuálními pokyny.
Vychází z [výsledků A1](FEED_A1_RESULTS.md) a platných [etap](FEED_IMPLEMENTATION_STAGES.md).

## Doporučení A2a

Nejdřív ověřit lokální geografický adaptér a konzistenci dotazů, teprve potom
schvalovat datový model živé serverové relace. A1 dokázal správnost pořadí
na rovinných datech, nikoli ceny skutečných geohashových dotazů nebo konzistenci
několika serverových čtení. Tuto mezeru nelze obejít úspěchem lokálního benchmarku.

Navržený konkrétní rozsah A2a:

- Čistý serverový query modul a testovací repository, bez exportu veřejné Function,
  bez přepnutí aplikace a bez změn existujících obsahových operací.
- Geohashové rozsahy přes oficiální helper `geofire-common` (novou závislost
  zafixovat v lockfile), přesná sférická vzdálenost, odstranění překryvů.
- Čtení `shouts` podle `status` a rozsahu `geohash`; připravit lokální návrh
  složeného indexu `status ASC, geohash ASC`, nic nenasazovat. Kategorie,
  expirace, blokace a Business výjimky musí mít stejný význam jako dosud.
- Neměnný kontext projektu/UID/polohy/filtrů a snapshot řadicích klíčů; nejvýše
  50 výsledků na stránku. Pevný `readTime` nebo společná read-only transakce
  se musí prokázat proti souběžným zápisům; při nedostupném snapshotu explicitní
  chyba, nikoli nenápadný přechod na nekonzistentní čtení.
- Experimentální pracovní parametry: nejvýše 1 000 načtených kandidátů na krok,
  10 000 na celou přípravu, nejvýše 100 skutečných query požadavků na přípravu.
  Počítat překryvy znovu i při deduplikaci výsledků. Vyčerpání kroku vrací
  `preparing`; překročení celkové meze vrací `capacity-exceeded` bez vydání
  neúplného seznamu. Žádné automatické nekonečné opakování.
- Tyto limity platí pouze pro lokální ověření. **Nejsou schválenou kapacitou
  veřejného MVP** a nesmějí se bez dalšího rozhodnutí zapnout do živého feedu.
  Délku skutečné přípravy měřit; délku životnosti serverové relace zatím neurčovat.
- Testy pouze proti izolovanému emulátoru a syntetickým datům: 100/1 000/10 000,
  husté/řídké okolí, hranice buněk, antimeridián, vysoké zeměpisné šířky,
  shody časů, vložení/smazání mezi dotazy, opakování a překročení limitů.
  Read-first experiment pouze v Nejblíž; neuzavřenou prioritu nízkého hodnocení
  před B3 neprohlašovat za produktové rozhodnutí.

Výstup: správnost proti úplné referenci, reálný počet query požadavků a kandidátů
(včetně prázdných rozsahů/překryvů), objem a doba přípravy, návrh uložení relace,
indexy a konkrétní návrh provozních limitů A2b. Emulátor nenahrazuje Query Explain
ani měření cloudové fakturace; účtované index entries mohou zůstat neověřené.

## Co tento souhlas nezahrnuje

Žádné nové živé kolekce, trvalé ukládání polohy, migrace historických Shoutů,
TTL/Scheduler, nová placená služba ani nasazení query Function. A2b zvlášť
předloží soukromí/retenci, ukládání relace a kurzorů, rate limity a model celkových
nákladů vůči rozpočtu 5 000 Kč. Samotný limit na jedno volání nestačí omezit účet.

R2 je již rozhodnuté: poslední známý bod otevřené aplikace s upozorněním,
jinak výzva k poloze; ostatní sekce zůstanou použitelné. Zde se toto UI nemění.

Rozdělení A2 na A2a/A2b je navržené upřesnění kontrolní brány na základě A1,
nikoli souhlas s celým serverovým rolloutem. Před změnou serverového kódu A2a
vyžádat souhlas s tímto konkrétním rozsahem podle AGENTS.md.
