# Archiv – došetření DEV a návrh společného dokončení

27. listopadu 2026. Navazuje na [hotovou přípravu](ARCHIVE_DEV_READINESS.md).
Průzkum je dokončený, pouze čtecí. Následující implementace a živý rozsah jsou
**návrh ke schválení**, nikoli provedená změna nebo automatický souhlas.

## Ověřené nálezy

Všech 11 dříve vybraných deleted Shoutů vzniklo v říjnu a má v nadpisu MVP.
U deseti lze navíc dohledat konkrétní místní test. U nejstaršího je doložené
označení MVP a pozdější baseline, nikoli přesně první operace. Do nové evidence
se neukládají nadpisy, texty, kontakty ani tokeny.

- Žádný z 11 nemá dochované komentáře, soukromé odpovědi, reakce, záložky ani
  jinou podkolekci. Seznam podkolekcí je prázdný u všech jedenácti kořenů.
- Cílené dotazy pro těchto 11 ID nenašly serverOperations, sanctions ani
  reports/commentReports/privateReplyReports. Nejde o tvrzení o celé DB.
- U 1b311a4c… je v místním snapshotu deleted již před pozdější změnou záložky;
  současné updateTime odpovídá pozdějšímu zápisu. Není časem odstranění.
  U hodnocení je místní verifiedAt dokonce před SDK časem následného zápisu.
  Místní doklad testu tedy není automaticky přesný serverový doklad odstranění.
- Původní odstranění všech položek se z prohledaných dokladů nepodařilo přesně
  doložit. Nic se nedoplnilo z updateTime, expirace nebo dnešního času.

Navrhuje se **vymezený úklid starých MVP fixture**, nikoli vymyšlené datum nebo
obecné obejití migrace. Právě tento zásah by zrušil dřívější ochranu uvedených
testovacích záznamů; bez nového souhlasu se neprovede.

| Přesné ID navrženého MVP kořene | Dnešní stav |
| --- | --- |
| 1598dfc9f1955190670fd25fe2485dc830d473c2e9aa73f94ac5081cba4244e7 | deleted, bez potomků |
| 1b311a4c980bcd343ad1a5337274aa49e07c8d93acf7b6b76dc195c8cb6b34b1 | deleted, bez potomků |
| 3e9b9eec52ecf775aa47b8d418dda888e6afe82ebaec6f5a912fb93d142f44f7 | deleted, bez potomků |
| 5e1d6e642a6e8a93bf0f80a29be3b9a5568d5b33db75394b5ad7573b807d2105 | deleted, bez potomků |
| 81c63a7efbdc089072a6deae497b133f8d7293f4624a82b92dca386360a03ff0 | deleted, bez potomků |
| 99354ec09f2dbd3f0fbcd5c61013fb4078990aa5ac73299a482706efb3e8ff61 | deleted, bez potomků |
| c3d23b6cddac99cbb92092e9612bedc51667abbb91a2fc7e307f106df6d9f5f5 | deleted, bez potomků |
| mvp_delete_82492300eb2643b5b751bd598d0782c8 | deleted, bez potomků |
| mvp_rating_negative_20261031 | deleted, bez potomků |
| mvp_rating_regular_20261031 | deleted, bez potomků |
| mvp_shout_delete_20261031_business | deleted, bez potomků |

## Skutečný dopad následné aktivace retence

Samotný úklid výše by odstranil jen 11 kořenů a ponechal dalších 28 Shoutů,
99 komentářů a 1 soukromou odpověď. Následná běžná údržba má vlastní dopad:

| Skupina podle dnešních dat | Shouty | Veřejné komentáře | Soukromé odpovědi |
| --- | ---: | ---: | ---: |
| Staré MVP bez doloženého konce – navržený kontrolovaný úklid | 11 | 0 | 0 |
| Známá expirace, konec expirace +67 dní již uplynul | 22 | 97 | 0 |
| Známá expirace, konec archivu ještě neuplynul | 6 | 2 | 1 |

Termíny posledních dvou řádků vycházejí z původních dat, migrace je neobnoví.
U 22 vláken se prošlá těla nezkopírují do nového archivu a běžná údržba je
odstraní. U 6 zůstanou jen do původního konce, se zachováním původního konce
sedmidenní vlastní historie. Aktivace tedy nemůže současně slibovat zachování
všech původních 38 zdrojů bez změn. Zde se tento dopad předkládá výslovně.

Jeden z 97 prošlých komentářů je od autora s původní pending žádostí a patří do
demo_usti_hugo; obsahový termín tohoto vlákna skončil 3.11.2026 10:24:46 UTC.
[Adopční jádro](../../../functions/content_lifecycle_adoption.js) dnes odmítne
subjekt v mazání i tehdy, kdy by šlo pouze o metadata bez nového těla. Je nutné
lokálně připravit a ověřit úzkou cestu pro již definitivně prošlé tělo: bez
nového textového archivu, nové kontaktní vazby, prodloužení termínu nebo resetu
účtové žádosti/journalů. Neuplynulá či nejasná retence, smazaný profil,
uzavřený purge vstup nebo změněná inkarnace musí dál zastavit transakci.
Stávající Auth kontroly účtového workeru se neoslabí.

## Navržený jeden společný dokončovací úsek

1. Připravit operátor úklidu právě těch 11 MVP: přesný projekt, digest,
   SDK createTime/updateTime a hash, deleted, nuloví potomci, společný indexový
   writer a rozpočet 450 zápisů. Ověřit souběh, restart a ztracenou odpověď;
   nový potomek nebo změněný důkaz nesmí rozšířit mazání.
2. Doplnit popsané převzetí metadat již prošlého zdroje pending autora.
   Ověřit původní v3 worker při přítomném i chybějícím Auth, purge, souběh,
   rollback a nemožnost založit nové tělo či obnovit uzavřenou inkarnaci.
3. Připravit aktivační a kompatibilní návratové zdroje/balíčky a konfigurace;
   zachovat vydanou hru. Návrat po odstranění zdrojů musí dál umět archivní
   čtení a stejnou právní verzi, nikoli vrátit dnešní d119d63. Dokončit místní
   testy, revizi před společným pushem a úplné CI přesných zdrojů jednotlivých
   nezbytných bezpečnostních etap; průběžně nepřidávat nesouvisející změny.
4. Pouze po úspěšných kontrolách provést v **shoutout-dev-46c81** čerstvě
   ověřený plán odstranění 11 kořenů. Ostatní data v této fázi kontrolovat proti
   baseline, nevytvářet náhradní časy smazání nebo falešný archiv fixture.
5. Založit samostatný SHOUTOUT_ARCHIVE_IDENTITY_KEY, 32 náhodných bytů.
   Nevkládat jej do klienta, výpisů ani inventury. Zachovat identity purge po
   prvním zapojení i při omezení ingressu/lookupu, bez závislosti purge na klíči.
6. Čerstvý selektivní indexový plán: 5 složených, 12 výjimek map a 1 skupinový
   array index auditů, dnes 18 akcí. Zachovat TTL a ostatní definice, ověřit
   READY. Staré digesty nejsou slepým souhlasem s novým stavem.
7. Čtyři nové callables observeArchiveIdentity, getArchiveIdentityPage,
   getLifecycleSourcePage a getLifecycleReportEvidence: europe-west3,
   min 0 /max 1, concurrency 1, 256 MiB, 15 s. Aktualizovat potřebných 27
   stávajících Functions včetně obou read-sync endpointů a účtových workerů;
   cílově 31 ACTIVE. Stávající prostředky a dva minutové plánovače beze změny.
8. Řízené servisní okno DEV pro právní verzi 2026-11-27, kompatibilní
   web/server/Rules a capture fence. Doložit doběhnutí starých volání.
   Odhlášení a vlastní smazání bez nového přijetí zůstanou možné; právní
   potvrzení se nesmějí vytvářet za uživatele. Hosting jen shoutout-dev-46c81
   na web.app/firebaseapp.com, databáze (default).
9. Obnovitelná migrace/audit po nejvýše 50 zdrojích /450 zápisech, zpočátku
   se zachováním starých textových kopií. Čtení/údržbu zapnout až po doložené
   kompatibilitě a auditu. Další neprokázaný nález tuto fázi zastaví.
10. Původní běžná údržba uklidí také výše uvedených 22 prošlých vláken a 97
    komentářů, se sdíleným dosavadním rozpočtem, max. 32 lifecycle kroků
    /měkkých 10 sekund. Původní pending žádost, její Auth a vlastní retenční
    termín se nemažou ani neposouvají; nevytvoří se nový archiv prošlého komentáře.
11. Ověřit kompatibilní návrat a pokračování workerů. Až při dostupném klientu
    použít nejvýše 2 nové 24h Shouty, 1 veřejný komentář, 1 soukromou odpověď
    a 1 hlášení pod stávajícími Bright_Otter_182/TestBusiness. Pro odmítnutí
    nové verze a vlastní smazání nejvýše 1 nový dočasný ověřený Auth účet s
    profilem, bez předvyplněného právního přijetí. Žádný další původní Auth
    účet nesmazat. Vymezit syntetické pilotní záznamy manifestem pro úklid;
    potvrzení operací ponechat 7 dní, obecné lhůty ani kvóty neměnit.

Ruční akceptace zůstane jeden poslední blok až po všech samostatných kontrolách.
Nové role, sankce, limity, služby, četnost jobů, globální App Check, main, tagy
a produkce nejsou součástí. DEV profil nedokládá kapacitu 5 000 relací.
Nespouští se placený zátěžový test ani Phone Auth/R2.

## Důkazy a hranice dnešního výsledku

Pouze technické ignorované výstupy v build/archive-readiness:

- legacy-deletion-audit.json SHA-256
  e28dc6347b0d0b913643e3b6a59f3140cedc9591f89f03f256a604fafd6e9bae.
- legacy-migration-scope-v2.json SHA-256
  6b7d49d6100f633dc6c9654bd8eb1f4ffe934522ed7f6067da588ab1a00b5207.
- legacy-cleanup-tree-inventory.json SHA-256
  2e9376855eef1e3d82f69fb454a0798f880be1c5059d898fa042299a0d8d7dcf.
- Návrh úklidu 11 má digest
  80a327b955aea5446db07974a67e9430fd3a5ac375cbb846a68efd9c65a5deae;
  není apply oprávněním. Před provedením musí existovat čerstvý plán.

Runtime zůstává 6e68e03 s úplným CI 45984217529; průzkum nic nenasazuje,
nemění živá data a netvrdí nové úplné CI. Nemá nový kredit za již započtenou
přípravu. Nový souhlas pro navržený společný úsek vyžaduje AGENTS.md:
„při podstatném rozšíření si vyžádej nový souhlas“ – nový migrační případ,
zrušení ochrany konkrétních testovacích dat a první živý archiv/klíč.
