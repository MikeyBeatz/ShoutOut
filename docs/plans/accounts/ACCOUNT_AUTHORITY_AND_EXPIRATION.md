# Odebrání oprávnění a materializace exspirace

## Rozsah připraveného úseku (2. listopadu 2026)

Cíl případného rolloutu je pouze `shoutout-dev-46c81`. Před nasazením musí
projít CI přesného commitu. Produkce, Hosting, Auth konfigurace, délky retence
a staré dokončené joby se tímto úsekem nemění.

### Oprávnění smazaného účtu

Po skutečném `auth/user-not-found` konfirmace v jedné Firestore transakci
zkontroluje původní žádost a aktuální lease, potvrdí odstranění Auth a označí
existující `accountRoles/{uid}` i legacy `moderators/{uid}` pomocí
`accountStatus: deleted`. Ostatní bezpečnostní metadata, role/level a původní
retenční termín zachová. Chybějící role se nevytvářejí. Serverový Timestamp
`rolesRetiredAt` na původní žádosti zabraňuje opakovaným zápisům rolí.
Přítomný Auth, chyba providera, jiná žádost či ztracený lease nic neodeberou.
Není to konečný purge osobních údajů ani archiv Business profilu.

Firestore role helpery odmítnou pravomoci při žádosti o smazání i při neaktivní
roli. Odstranění nepotvrzené žádosti nadále umožní původní klientský rollback;
potvrzenou žádost klient odstranit nemůže. Hierarchie cílového účtu pro moderaci
se nemění. Storage support přístup kontroluje příznak ve stejném dokumentu
role; nepřidává další lookup přes Firestore bridge. Před potvrzením Auth samotná
čekající žádost původní Storage support čtení neblokuje. Po potvrzení je role
neaktivní atomicky a starý ID token pravomoc neobnoví.

### Exspirace Shoutů

Nový helper vybere nejvýše 50 aktivních Shoutů s platným Timestamp `expiresAt`
od epochy do serverového času. Každý znovu ověří v transakci a změní pouze
`status: active → expired`. Zachová obsah, počty, časové značky a všechny
potomky. Souběžné prodloužení, smazání či již změněný stav nepřepíše.
Neplatné typy termínu se nepovažují za platné datum. Případný prostorový writer
lze připojit atomicky; DEV prostorový index zatím není aktivovaný.

Použije existující minutový `resumeAccountDeletionJobsDev`. Účtové joby mají
přednost: pokud tick našel alespoň jeden, další stránku exspirace nespouští.
Nepřibývá plánovač, instance ani druhá plná dávka. Ve výchozím DEV nastavení je
strop 50 kandidátů za volný tick, nikoli scan celé kolekce. Každý úspěšně
expirovaný dokument z dotazu vypadne. Při backlogu proto nejde o přesné
sekundové přepnutí; feed již filtruje uplynulou životnost podle `expiresAt`.
Sedmidenní klientské zobrazení expirovaných Shoutů se nemění.

Potřebný index: kolekce `shouts`, `status ASC, expiresAt ASC`.
Nasazuje se pouze tento konkrétní index, pokud ještě neexistuje. Celý
`firestore.indexes.json` se **nesmí** deploynout: obsahuje další dosud
neschválené TTL konfigurace. Fyzické mazání kořenů a podkolekcí je další úsek.

## Ověření a otevřené návaznosti

Zdroj `91d8d9bc16b45d1a2f6ce7ee1fecff271acd66bc` prošel
[CI 41399389084](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41399389084):
241 Flutter, 37 tools, 107 unit (209 emulator-only skip), 321 Rules/server,
15 Storage, analýza/lint/build. Cílený index je READY; Firestore a Storage
Rules i obě účtové Functions jsou nasazené v DEV. Nový hash Functions je
`b443bd2afc4a879fc846ba36bbdad196f102b1c2`. Limity, Scheduler, Hosting, IAM
i ostatní Functions mají shodu s baseline. Živě je ověřeno 26/26 původních
uplynulých Shoutů: kromě statusu se žádné pole nezměnilo. Izolovaná žádost
automaticky dokončila `content-archived`. Konfirmace, obě neaktivní role,
původní metadata/deadline, stejné soukromé/Business kořeny, rezervace, budoucí
kontrolní Shout a komentář pod expirovaným Shoutem jsou ověřené. Žádný Auth účet
nevznikl. Veškeré fixture kořeny/potomci i vlastní checkpoint jsou uklizené;
původní žádost a inventura requests/jobs/archive mají původní digests.
Důkazy: `build/lifecycle-{ci-proof,artifact-proof,baseline,index-proof,deployed-proof,original-expiry-proof,live-proof,cleanup-proof}.json`.

### Připravený klientský retry tok

Větev `fix/account-deletion-retry-flow` připravuje `AccountDeletionAttempt`
a Firebase adaptér. Původní jádro `dddb65c8b5dbd86e37de0d87d3e0b27fc10a8fdb`
má úspěšné CI 41401111113. Navazující UI je nyní nasazené: první žádost už
při nejasné chybě Auth automaticky nemaže intent a blokující obrazovka nabízí
pokračování s heslem. Známá žádost se neztratí při chybě streamu ani chybějící
cache/lokálním pending delete. Odemknout může až potvrzená serverová absence;
změna UID starý latch resetuje. Serverová konfirmace skryje možnost opakování.
Jeden dialog pro první i opakovanou žádost vlastní svůj controller až do
skutečného unmountu, nikoli jen do dokončení pop future.
Jedenáct cílených testů a analyzátor prošly. Zdroj
`23f20438c64e8eedfcd06761d8fd9158b56e8257` má success CI 41472129925
(252 Flutter, 37 tools, 107 unit/209 skip, 321 Rules/server, 15 Storage,
analýza/lint/build). DEV Hosting verze `d2573a279275eb72`, oba originy
ověřené proti čistému release artefaktu; backend/Rules/Scheduler/IAM beze změny.
Jeden nový vlastní Auth fixture s již existující žádostí uživatel ručně
přihlásil a dokončil přes pokračování s heslem. UI se vrátilo na přihlášení;
server potvrdil Auth nepřítomný, původní žádost/createTime/deadline,
konfirmaci a terminální job. Fixture i jeho potomci jsou uklizené a původní
inventura má stejný digest. Testovací heslo odstraněno ze stavu fixture.
V automatizovaném formuláři chyběl prefix mvp; App Check warnings samy
nedokazovaly příčinu neúspěšného přihlášení.

Před každou další akcí se znovu ověřuje stejné UID. Heslo je jen vstupem
reauthenticate, ne součástí žádosti či uloženého stavu. Transakční adaptér
existující žádost pouze přečte; původní createTime/termín se neobnovuje.
Při ztraceném potvrzení žádosti se Auth naslepo nemaže. Při nejasném výsledku
Auth.delete se žádost automaticky neruší. Dvojí klik sdílí jeden běžící pokus.
Po serverové konfirmaci se další Auth.delete nevysílá.

Ztracené odpovědi/výpadky jsou pokryté simulovanými testy; živý průchod měl
skutečné přihlášení/reauth/Auth.delete a Firestore transakci, bez síťové injekce.
Dosavadní první lokální skrytí Shoutů je zachované; uzavření přímých Rules
zápisů a celý serverový cutover tím ještě nejsou provedené. Retence se nemění.

## Návrat verze

Při problému s exspirací vypnout pouze její flag v role-aware zdroji a po CI
aktualizovat stejné dvě Functions. Původní `b685ac4` je funkční návratový zdroj
Functions; nová Firestore/Storage pravidla se přitom zachovají, aby odebrané
role nezískaly oprávnění zpět. Už uplynulé Shouty plošně nevracet do active.
Hosting lze vrátit na předchozí verzi 6147a1b814165dad, ale obnoví starý klientský
rollback; není to návrat bezpečnostních pravidel, dat ani retenčních termínů.

Cílený lokální běh: 22/22 testů konfirmace, rolí a exspirace prošlo v reálném
Firestore emulátoru. Zahrnuje opakování, lease, pevný deadline, legacy roli,
aktivní rollback, nepřepsání souběhu a sdílený rozpočet maintenance ticku.
Úplné CI a skutečný rollout se evidují v [aktuálním stavu](../../PROJECT_STATUS.md).

Vlastník 2. listopadu schválil celý existující Business profil včetně poboček
a dostupných fakturačních podkladů ve stávajících 60 dnech; lhůta je pevná
i pro otevřená hlášení, automatický hold se nezavádí. Implementace této fáze
naváže. Minimální trvalý marker po purge následně výslovně schválil.
Vlastník následně schválil odebrání palců i úpravu počtů u cizího obsahu.
Vlastnická UID vrstva, Rules a CG indexy jsou v DEV nasazené; schválená oprava
3 starých záložek je dokončená. [Navazující v5 worker a skutečné ověření](ACCOUNT_REACTION_REMOVAL_PLAN.md).
Zůstává konečný fyzický úklid potomků. Celý milník zatím není dokončený.
