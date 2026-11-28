# Oprava autority a čtecích ochran – 28. listopadu 2026

## Schválený rozsah

Vlastník po [souhrnné revizi](MVP_COMPLETED_WORK_REVIEW_2026-11-27.md)
schválil společný úsek F-01/F-02/F-06. Implementace vychází z revizního
checkpointu `52c9043135696537bc1d5d7ffdf345e4b6df06cc`, ve větvi
`fix/mvp-authority-read-fences`. Žádné nové role, regionální rozsahy,
kvóty, lhůty, služby ani živé testovací účty/obsah.

F-03 (loga), F-04 (fronta), F-05 (pobočky) a Q-01 (regionální metadata)
nejsou součástí této opravy. Zejména se nezavádí globální nebo regionální
oprávnění navíc. Produkce a main se nemění.

## Implementované změny

- **F-01 Firestore:** pět cizích get cest (`bans`, `contentRestrictions`,
  `accountDeletionRequests`, `businessApplications`, `businessProfiles`)
  používá existující `eligibleModerator`. Aktivní ban, pending stav,
  chybějící profil/aktuální právní přijetí a zrušená role privilegovaný
  přístup odmítnou. Vlastní čtení stavů pro blokaci/odhlášení/smazání zůstává.
- **F-01 Storage:** cizí screenshot hlášení chyby vyžaduje současnou roli
  admin/owner a nepřítomný nebo skutečně prošlý ban. Trvalý/vadný ban odmítne
  přístup; vlastní screenshot zůstane dostupný. Kontrola používá dva unikátní
  dokumenty (role + ban), což odpovídá
  [limitu Storage Rules](https://firebase.google.com/docs/rules/rules-behavior?hl=en).
  Není to tvrzení úplné parity se všemi Firestore account guardy: dosavadní
  pending/retired přechod role ve Storage se nemění. Přidání nového souhrnného
  autorizačního dokumentu či serverového downloadu tato oprava nezavádí.
- **F-02:** při přítomnosti spravovaného feed controlu odmítnout klientský
  create/event update oznámení. Příjemcův update pouze `readAt` zůstává.
  Anonymní/neověřený create se odmítne před čtením control dokumentu;
  ověřený managed pokus končí před dražšími validačními čteními události.
  Serverové operace oznámení dál zapisují atomicky. V režimu bez controlu
  zůstává dosavadní validovaná cesta; pauza/rollback se nemaže control dokument.
- **F-06:** společný dávkový čtecí helper ověřuje veřejný marker a existenci
  jakékoli deletion žádosti. Platí pro delta/cached refill, kompatibilní
  reader, news, pohyb i Uložené. Nevyžaduje zpětně existenci starého veřejného
  profilu, nic nezapisuje a nemá procesovou cache měnitelných guardů.
  Uložené čtou zdroje a autory ve společném read-only snapshotu a zachovají
  kontrolu vlastního aktéra po síťovém čekání.

Při neplatnosti původní feedové relace se použije dosavadní
`feed-session-expired`, nikoli dodání těla z cache. Zvláštní starý stav
pending autora se stále aktivním indexovým záznamem může vyžadovat dokončení
účtové/indexové údržby; oprava sama nemigruje ani nemaže původní žádosti.
Běžná nová finalizace již vyžaduje skrytí aktivních Shoutů a zůstává beze změny.

## Náklady a kompatibilita

Kontrola je podle unikátních autorů: 50 karet jednoho autora znamená dva
guard dokumenty na jedno dávkové ověření, nikoli 100. Proti dřívějšímu markeru přibývá nejvýše jeden
request dokument na unikátního kontrolovaného autora a fázi. Field mask
čte jen `accountStatus`; z žádosti potřebuje pouze existenci, nikoli kontakt
nebo text. Prázdná množina autorů nevolá databázi. Klidná news cesta bez
nových metadat tuto dodatečnou autorskou kontrolu nepotřebuje.

Zdrojová těla se dál přenášejí jen pro vybrané/chybějící karty. Writeři,
rozpočet 450 zápisů, dávka 50, lhůty a prostředky se nemění. Měření emulátoru
není doklad cloudové ceny nebo kapacity 5 000 aktivních relací.

Čtecí kontrola nasazeného `app-config.json` potvrdila aktivní serverové
cesty pro reakce Shoutu/komentáře, komentáře, soukromé odpovědi a hlášení.
DEV web proto nevytváří event oznámení přes zavíraný přímý writer. Staré
nativní buildy nemají nový distribuční souhlas; jejich přímé obsahové zápisy
už blokuje předchozí managed cutover. Nový webový build není potřeba.

## Ověření a další checkpoint

První cílený společný běh: **84 pass /1 browser skip /0 fail** nad Rules,
Storage, delta/body readerem, pohybem, news a Uloženými. Unit helperu **2/2**
pro deduplikaci, minimální field mask, prázdnou množinu a neplatné identity.
Lint Functions prošel. Poslední změnu Uložených, kompatibilní reader a skutečné
serverové reakce/oznámení ověřil samostatný běh **32/32 bez skipů**, včetně
banu vloženého po načtení saved snapshotu. Běhy mají překryv; jejich počty
se nesčítají jako počet unikátních scénářů. Následné úplné CI a skutečné
nasazení jsou doložené v závěrečné části tohoto protokolu.

První úplný běh 46116557242 byl řízeně zrušen před nasazením po doplnění
výše uvedeného ověření identity před control lookupem. Nejde o úspěšné
finální CI; tuto podmínku následně splnil commit ec371188 v CI 46117687063.
Konečná podoba této Rules matice znovu prošla místně **15/15 bez skipů**,
včetně anonymního/neověřeného create a všech níže uvedených útočných variant.

Testy zahrnují dočasný/trvalý/vadný/prošlý ban, původní i legacy role,
chybějící profil/právo, vlastní výjimky, podvržení role, cizí Business update,
raw replay oznámení, pending příjemce, čtení serverového oznámení a zakázané
změny jeho typu/aktéra/času/počtu/polí. Vše v emulátoru `shoutout-rules-test`.

### Útočná kontrola Rules

| Vektor | Konkrétní scénář v regresi |
|---|---|
| Veřejné listování | Anonymní dotaz na Business žádosti |
| Neoprávněné čtení/zápis | Pět cizích staff get cest v neplatném stavu a cizí Business update |
| Obejití přes update | Serverové oznámení přepsané příjemcem mimo jediné readAt |
| Podvržení vlastníka při create | Vlastní udělení role a cizí actorId oznámení |
| Podvržení vlastníka při update | Změna actorId uloženého serverového oznámení |
| Změna neměnného času | Přepsání createdAt |
| Typové poškození | Řetězec místo časového readAt |
| Rozdíl create/update | Neúplný create a odstranění kind z platného serverového dokumentu |
| Vyčerpání zdrojů | Velký actorNickname / nadbytečný text mimo povolený update; staticky také auth před control lookupem |
| Chybějící povinná pole | Neúplné oznámení a deleteField(kind) |

Povolené protějšky: způsobilá současná/legacy role, prošlý ban, vlastní
stavové gety a příjemcovo readAt. Samotné zamítnutí útoku by bez těchto
pozitivních scénářů nedokládalo funkční aplikaci. Prototyp pravidel tak
ověřuje konkrétní hranice; před veřejným vydáním zůstává společná kontrola
a startovní brána, nikoli tvrzení absolutní bezpečnosti.

**Schválený postup DEV (provedený níže):** po úspěšném úplném CI přesného commitu připravit čistý
archivní active artefakt; pouze v `shoutout-dev-46c81` aktualizovat
`getFeedPage` a `getSavedShouts`, potom materializované Firestore Rules
s právní verzí 2026-11-27 a Storage Rules. Beze změny prostředků, ostatních
29 Functions, Hostingu, plánovačů, indexů, klíčů či živých fixture.
Před/po ověřit skutečné zdroje, hashe Rules a prostředky; čtecí dotazy
nenahrazují přihlášený klientský průchod. Ruční regrese se dál sdruží na konec.

Při návratu nepoužít staré Rules, které znovu otevřou F-01/F-02. Použít
kompatibilní archivní konfiguraci se zachovanými opravenými guardy; serverové
vrstvy případně vracet samostatně. Celý obecný rollback/produkční gate tím
není automaticky přijatý.

Zápis a oprava těchto vad nemění pevné váhy ani nepřidává další kredit
uzavřeným pilotům. Zbylá autorita, celá moderační regrese a produkční brána
zůstávají ve stupnici otevřené.

## Dokončené DEV nasazení a ověření

**Hotovo 28. listopadu 2026.** Přesný zdroj
`ec371188b5aa82c04002b17210f11a1b265c317f` má
[úspěšné úplné CI 46117687063](https://github.com/MikeyBeatz/ShoutOut/actions/runs/46117687063).
Před nasazením znovu ověřený head SHA, úspěšné těžké CI kroky, čistá pracovní
kopie a hashe všech souborů připraveného active artefaktu. Starší zrušené CI
nebylo použité jako podklad vydání.

| Vrstva | Skutečný výsledek v shoutout-dev-46c81 |
|---|---|
| getFeedPage | Revize `getfeedpage-00010-nay`, předchozí `00009-fej`; 87 skutečně nahraných zdrojových souborů souhlasí s čistým artefaktem |
| getSavedShouts | Revize `getsavedshouts-00004-biv`, předchozí `00003-peq`; stejných 87 souborů ověřených proti vlastnímu cloudovému source archivu |
| Provoz starých revizí | 100 % na nové revizi, bez tagů; všech 9/3 starších revizí má Cloud Run Active = CONDITION_FAILED /RETIRED |
| Firestore Rules | `8cbacbed-2456-48f7-9a2f-46bb66e8481b`, SHA-256 `5b33f52df1832fd5d14890d0e77a76fb96866830ba8afeaf4bcf2c80a52e97f1` |
| Storage Rules | `fb4848ff-2673-482e-84df-f1c1caa74c9f`, SHA-256 `d9c230499a65d2b4efb6572ac27c08e78316d4992e46ccf11f657c46cb53102c` |
| Zachování konfigurace | Ostatních 29 Functions přesně shodných s baseline; vybrané dvě zachovaly CPU, paměť, min/max, concurrency, timeout, service account, ingress, secret bindings/verze i IAM policy |
| Hosting / plánovače | Hosting stále `14a0f588585839e2`, oba původní minutové joby ENABLED beze změny |
| Data / jiná prostředí | Žádné nové fixture/Auth účty, žádné aplikační datové zápisy ani migrace; produkce a main beze změny |

Úplné CI mimo jiné potvrdilo **500/500 Rules/transakčních**, **16/16 Storage**,
**14/14 delta/Chrome**, **38/38 news/pohybových**, **194/194 archivních**,
**155/155 purge** a **34/34 B2** případů bez skipů v těchto sadách. Prošly také
ostatní moderační/Business sady, Flutter testy, browserová persistence,
analýza, lint, 140 tools testů a webový build. Unit běh Functions vykázal
231 pass /917 integračních skip; přeskočené testy se nepočítají jako spuštěné
a integrační sady mají výše samostatné skutečné běhy. Sady se překrývají,
proto se jejich počty nesčítají do jednoho údajného počtu unikátních testů.

Po nasazení uspělo deset skutečných read-only DEV dotazů Home/profil/Business/
komentáře/staff/vlastní Aktivní/Expirované/Uložené. Všechny byly prázdné:
nejde o živou zkoušku stránkování velké sady ani přihlášené UI. Oba nasazené
čtecí endpointy na anonymní platný callable envelope odpověděly
401/UNAUTHENTICATED. Negativní scénáře banu/pending a správné serverové
oznámení jsou doložené emulátorem, nikoli nově založeným živým účtem.

Technické podklady v auditní pracovní kopii: `build/authority-ci-proof.json`,
`build/authority-ci-test-summary.log`, `build/authority-candidate.json`,
`build/authority-before.json`, `build/authority-after.json`,
`build/authority-live-query-coverage.json`, `build/authority-endpoints.json`
a oba deploy logy. Metadata ověřovala zdroje/Rules pouze GET požadavky;
nezměnila původní žádosti, lhůty, kvóty nebo souhlasy.

**Další navržený úsek:** úplnost moderační fronty F-04, před změnou
regionálního čtení vyjasnit Q-01. F-03/F-05, geografie, produkční kapacita,
provozní brána a společná ruční regrese zůstávají otevřené. Tento backendový
úsek nevyžaduje nový ruční pilot s daty; povinná celková regrese tím uzavřená není.
