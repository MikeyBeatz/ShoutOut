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

Cílený lokální běh: 22/22 testů konfirmace, rolí a exspirace prošlo v reálném
Firestore emulátoru. Zahrnuje opakování, lease, pevný deadline, legacy roli,
aktivní rollback, nepřepsání souběhu a sdílený rozpočet maintenance ticku.
Úplné CI a skutečný rollout se evidují v [aktuálním stavu](PROJECT_STATUS.md).

Před závěrečnou retenční fází čekají produktové odpovědi: rozsah soukromého
Business archivu, životnost minimálního veřejného markeru po purge a vztah
pevné 60denní lhůty k otevřeným hlášením/explicitnímu holdu. Bez odpovědí se
retence nerozšiřuje. Zůstává také klientská obnova po ztraceném potvrzení
Auth smazání a fyzické odstranění potomků. Celý milník zatím není dokončený.
