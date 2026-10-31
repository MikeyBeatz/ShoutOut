# Mazání účtu – průběh a návrh DEV pilotu

31. října 2026. **Lokální implementace, zatím nenasazená.** Navazuje na
[serverový plán](MVP_SERVER_PLAN.md#account-deletion) a
[zápisové cesty](FEED_WRITER_INTEGRATION.md). Schválení běžných rolloutů
nenahrazuje rozhodnutí o novém plánovači, pracovních datech a tomto pilotu.

## Připravená a ověřená část

- Původní událost nese UID, projekt a createTime žádosti; jiná žádost se nezpracuje.
- Atomické převzetí vytvoří soukromý pracovní záznam a časově omezený zámek.
  Druhý běh nepokračuje, dokud zámek platí; po vypršení může převzít práci.
- Počet skutečně skrytých Shoutů se mění ve stejné transakci jako zdroj a
  případný index. Po pádu tak průběh nepočítá pouze dokončené stránky.
- Každá transakce ověřuje vlastníka zámku. Starý běh po převzetí nezmění
  obsah ani nepřepíše novější dokončení. Zastavení žádosti práci ukončí.
- Existující Auth účet se nemaže. Pouze auth/user-not-found dovolí skrývání;
  výpadky se evidují obecným kódem a propagují bez osobních detailů.
- Omezená kontrola splatných prací pokračuje i po přerušení původní události.
  Rotující kurzor brání trvalému zablokování další práce vadným záznamem.
  Prázdná kontrola bez kurzoru nemá žádné databázové zápisy.

Implementace: `functions/account_deletion_job.js`, `account_deletion_job_scan.js`.
Připravený samostatný vstup `account_deletion_dev.js` není propojený s index.js
ani content.js. Odmítá produkci i jiný živý projekt; emulátor povolí jen pro
shoutout-rules-test na 127.0.0.1:8080. Zdrojové ani klientské mazání se nezapnulo.

## Navržená nová data, pouze DEV

`accountDeletionJobs/{sha256(project,uid,requestCreateTime)}` obsahuje:

- schemaVersion, userId, requestCreateTime;
- phase, attempts, hiddenCount, createdAt, updatedAt, případně completedAt;
- leaseToken, leaseUntil, nextAttemptAt, lastErrorCode;
- retainUntil = serverový createTime žádosti + stávajících 60 dní.

Fáze jsou waiting-auth, hiding-shouts, retry, shouts-hidden, obsolete a
needs-review. **Shouts-hidden není dokončené smazání účtu.** Záznam nenese
e-mail, heslo, token Auth/App Check, text, přezdívku ani polohu.
LeaseToken je náhodný interní identifikátor vlastnictví, nikoli přihlašovací údaj.
`maintenanceState/accountDeletionShoutJobs` drží pouze kurzor kontroly a čas.
Současné Rules obě cesty klientům zakazují; nový test ověřuje čtení i zápisy.
Automatické odstranění těchto metadat po retainUntil ještě není implementované;
pilotní testy zahrnou jejich úklid. Kompletní 60denní proces zůstává otevřený.

## Konkrétní návrh ke schválení před pilotem

| Nastavení | Návrh pouze pro shoutout-dev-46c81 |
|---|---|
| Událost | accountDeletionRequestCreatedDev, vytvoření accountDeletionRequests/{userId} |
| Obnova | resumeAccountDeletionJobsDev, nový Cloud Scheduler každou minutu UTC |
| Rozsah jednoho obnovení | Nejvýše 1 splatná žádost, nejvýše 50 vybraných Shoutů |
| Oba endpointy | europe-west3, min 0 / max 1 instance **každý**, concurrency 1, 256 MiB, 60 s |
| Zámek práce | 120 s; dočasné chyby/další stránka nejdříve za 60 s |
| Auth stále existuje | Čekat nejvýše 24 h od žádosti; poté needs-review bez dalšího automatického zkoušení a bez odstranění Auth |
| Obnova plánovače | retryCount 0; další minutu rozhodne trvalý stav práce |
| Index | Nezapínat indexWriter, nové indexové kolekce ani backfill |

Vstupní Firestore událost má navržené retry:true kvůli selhání před uložením
práce; [Firebase uvádí pro 2. generaci retry okno 24 hodin](https://firebase.google.com/docs/functions/retries).
Po uložení práce pokračuje plánovač i za touto hranicí. Čas čekání na Auth
není nastavení retry okna platformy; jde o samostatnou explicitní volbu.
Při více než 50 Shoutech trvá dokončení několik kol; nejde o garantovanou latenci.
Dosavadní klient skryje vlastní aktivní Shouty ještě před vytvořením žádosti.
Jeho odstranění a ověření nového klientského toku nejsou součástí tohoto pilotu.

Jeden nový Scheduler job stojí mimo bezplatné tři joby na billing account
0,10 USD za 31 dní; nejde o cenu za každé spuštění.
[Oficiální ceník](https://cloud.google.com/scheduler/pricing).
Functions, Firestore a doručení událostí se účtují zvlášť; volnou kvótu účtu
jsme tímto návrhem neověřili. Každá minuta znamená až 43 200 kontrol za 30 dní.
Prázdná kontrola dělá čtení checkpointu a prázdný dotaz, žádné zápisy.
Úspěšné skrytí každého Shoutu přidává jeden zápis průběhu; bez indexu má
plná stránka logicky 50 zdrojových + 50 průběhových + 2 pracovní zápisy.
To nepočítá čtení, transakční opakování nebo budoucí index a není to odhad účtu.
Limity práce/instancí nejsou finanční hard cap.

## Ověření a omezení

- 99 cílených případů: 18 dosavadních account/event, 15 job/scan a 66 Rules;
  žádný přeskočený nebo neúspěšný test. Firestore emulátor, simulovaný Admin Auth.
- Celá Functions sada: 87 pass, 126 emulator-only skip, nula chyb; ESLint čistý.
- Dřívější lokální vzorek plné stránky: 50 skrytých zdrojů s indexem a průběhem,
  první stránka + prázdné potvrzení 4 878 ms. Nejde o měření cloudové latence/ceny.
- Samostatný produkční instalační artefakt lze importovat; SDK manifest potvrzuje
  oba navržené endpointy a jejich prostředky. Žádný endpoint nebyl nasazený.
- Závislosti/lockfile se nemění. npm audit --omit=dev hlásí 6 převzatých
  moderate tranzitivních nálezů (glob/minimatch a navazující Google balíčky),
  žádný high/critical; aktualizace není součástí této změny.

Nevyřešené zůstávají přezdívka, soukromá data, bezpečnostní retence a konečný
60denní úklid, kompletní audit a klientské napojení. Veřejné MVP čeká na ně.

## Přesný rozsah navrhovaného živého ověření

Po samostatném souhlasu a úspěšném CI přesného commitu: pouze projekt
shoutout-dev-46c81, codebase account-deletion, dva výše uvedené endpointy
a jejich nový plánovač. Bez Hostingu, Rules, produkce nebo změn main.
Předem ověřit aktuální výchozí stav a případné existující pending žádosti;
staré žádosti bez události nezpracovávat zpětně automaticky.

Vytvořit **jeden nový jednorázový disabled testovací Auth účet bez možnosti
přihlášení** a tři označené testovací Shouty. Vytvořit jeho testovací žádost,
ověřit čekání, odstranit pouze tento nově vytvořený Auth účet a ověřit následné
skrytí všech tří Shoutů, přesný hiddenCount, opakování a soukromost záznamu.
Nakonec uklidit přesně vytvořené testovací Shouty, žádost a pracovní záznam.
Nikdy k tomuto testu nepoužívat existující uživatelský účet.

Balení připraví [prepare_account_deletion_functions.mjs](../tools/prepare_account_deletion_functions.mjs).
Release musí vzniknout z čisté kopie přesného zeleného commitu podle
[RELEASING](RELEASING.md). Po nasazení ověřit oba ACTIVE endpointy, plán ENABLED,
limity a neveřejný HTTP vstup plánovače. Návrat: zastavit nový plánovač a odstranit
pouze tyto dva DEV endpointy; stávající funkce zůstávají. Data se návratem
automaticky neobnovují, proto živý test pracuje jen s novými disposable fixtures.
