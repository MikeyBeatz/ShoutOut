# Odebrání reakcí mazaného účtu

Rozhodnutí vlastníka 2. listopadu 2026: po potvrzeném odstranění Auth odebrat
palce účtu u cizích Shoutů a komentářů a upravit počty. Nezachovávat anonymní
agregované hlasy. Technické bezpečnostní podklady smějí zůstat jen do
původního serverového termínu žádosti + 60 dní; nové zpracování jej neobnovuje.

## Transakční jádro

`functions/account_reaction_removal.js` zpracuje výhradně interně vybraných
1–50 konkrétních cest, nikoli klientský seznam nebo globální scan. Ověří
chybějící Auth, původní žádost/createTime, serverovou konfirmaci, pevný termín
a transakční lease guard. V jedné transakci zkopíruje podklad do existujícího
serverového `accountContentArchive`, odebere reakci a upraví jen odpovídající
likesCount/dislikesCount i trvalý pokrok volajícího. Nové archive kind jsou
`shoutReaction` a `commentReaction`. Klientům se tím neotevírá žádné čtení archivu.

Opakování a souběžné odebrání téže reakce odečte počet jen jednou. Cizí nové
hlasy se neztratí. Reakce na vlastní obsah se přeskočí pro jeho samostatný
životní cyklus; objevovací kurzor musí postupovat i přes přeskočené položky.
Chybějící rodič nebo nezměněný list ze starší inkarnace rodiče se uklidí bez
zásahu do nových počtů. List pozměněný po znovuvytvoření rodiče je nejednoznačný
a vyžaduje kontrolu. Podtečení počtu, chybná data, ztracený lease či konflikt
archivu nic částečně nezapíšou. Neočekávaní potomci se zachovají pro kontrolu.
Mimo protokol nesmí Admin vytvářet nové podkolekce zdrojových reakcí.

Shout counter změnu lze atomicky skládat se spatial indexWriter; komentářová
reakce nemění souhrny Shoutu. Jádro neodstraňuje historická oznámení, stejně
jako běžné odkliknutí palce. Jejich osobní snapshoty musí řešit konečný purge.

**V5 zapojení je nasazené v DEV z d0e43c5 po CI 41493498292 a živém pilotu.**
Dosavadní joby se nepřepisují. Výsledek selection-processed neznamená, že jsou
prohledané všechny reakce účtu; pokrývá jen vybranou stránku.

## Vlastnické vyhledávání

Tři nasazené stávající callables zapisují do reakcí/záložek také serverové
`userId` shodné s Auth UID a ID dokumentu. Payload ani odpověď API se nemění,
nepřidává se další dokumentový zápis. Rules vyžadují totéž pole i od přímého
zapisovače; nesmí být vynechané, podvržené ani odstraněné přepsáním reakce.
Stejné UID doplňují i dosavadní klientské fallbacky, pokud serverový přepínač
není aktivovaný; tím zůstávají kompatibilní s novými Rules.
Čtení starých položek a jejich odstranění zůstává možné. DEV má všechny tři
serverové přepínače již zapnuté, takže aktuální klient neposílá původní tělo.

Nasazené indexy jsou pouze collection-group ASC pro `reactions.userId` a
`saves.userId`. `planOwnedActivityIndexes` zachová existující indexy a používá
jen updateMask indexConfig; TTL nemění. Celý firestore.indexes.json se nesmí
plošně nasadit, protože má také další neschválené TTL konfigurace.

Po přesném úspěšném CI lze rutinně aktualizovat pouze toggleShoutReaction,
toggleCommentReaction, toggleShoutSave, příslušné Rules a tyto dva indexy
v `shoutout-dev-46c81` a kompatibilní vývojový web. Účetní Functions, Scheduler
a produkce se tímto přípravným úsekem nemění. Před potvrzením pokrytí vyčkat dokončení
starých invokací a ověřit stav indexů i novou inventuru.

Read-only DEV preflight našel 0 reakcí a 3 záložky bez userId, žádné neznámé
schéma. Nic nezapsal. Plán v build/lifecycle-ownership-plan.json má digest
`beccfc90b96db71330b6c54611886476aba5d90aa35a41491c34743a031136f0`.
Oprava těchto tří existujících záložek vyžadovala zvlášť konkrétní
proveditelný plán, updateTime preconditions a souhlas s opravou dat; samotný
rollout ji neprovádí. Připravený nástroj `tools/activity_ownership_repair.mjs`
má pět emulátorových testů: dry-run bez zápisů, atomické UID-only doplnění,
zastaralý plán, souběh v commit, lost-ack replay a odmítnutí cizích cest/projektu.
Vyžaduje přesný digest, podporuje jen DEV a starou updateTime; nemění rodiče,
počty, typ reakce ani původní timestampy. Vlastník schválil tento přesný digest;
živé apply atomicky doplnilo 3/3 záložky. Ověřena shoda všech původních polí,
nová inventura má 3 indexované záložky a žádnou chybějící UID položku.
Před nasazením workeru musí být doložená úplnost jeho
konkrétního objevovacího dotazu, ne pouze přítomnost indexu.

## Ověření a další krok

Lokálně 12 skutečných emulátorových scénářů jádra a 3 adversariální Rules
scénáře pro vlastnictví; úplná sada 336 Rules/server prošla bez chyb. Ověřené
jsou také standardní serverové add/switch/remove a nové UID v záložce.
Lint prošel. Indexový plán má test zachování existujících konfigurací a TTL.
CI, skutečné nasazení a následující integraci eviduje PROJECT_STATUS.

Po této vrstvě byla přidána stránkovaná objevovací cesta a verzovaná fáze workeru
se stejným společným rozpočtem 50 položek. Musí mít trvalý kurzor, atomické
počty a bezpečný replay, respektovat původní joby a original deadline. Teprve
po integračních testech, CI, ověření pokrytí a živém pilotu bylo automatické
odebrání palců uzavřeno v DEV (viz níže). Sedmidenní Shout purge a konečný
60denní account purge tím nebyly implementované; navazující account purge
je od 3. listopadu dokončený v DEV v [samostatném plánu](ACCOUNT_RETENTION_PURGE_PLAN.md).

## V5 worker a ověřená předchozí vrstva

DEV vlastnická vrstva je nasazená z 62a51b04b67c487023b10e387b21a4b590382150
po CI 41487516001. Tři callables ACTIVE, Rules 59ba2602-0710-4e37-8a29-97d5c74a9ae7,
Hosting 20af65bc04ae5c35, oba indexy READY. Živý query probe ověřil přesný
UID filtr a dokumentový kurzor; všechny 3 fixture listy jsou uklizené.
Záznamy původní účetní inventury zůstaly shodné. TTL, Scheduler, IAM,
Storage Rules a account Functions se tímto rolloutem nezměnily.

Nový interní account_actor_reactions_job používá collectionGroup reactions
s userId rovností, orderBy documentId a trvalým relativním dokumentovým
kurzorem. Je za skrytím vlastních Shoutů a před soukromou/content fází;
nejvýše 50 kandidátů za invokaci sdílí dosavadní rozpočet workeru. Přeskočené
vlastní hlasy posunou kurzor, odstraněné listy lze použít jako kurzor. Krátká
či prázdná stránka dokončí fázi. Každý skutečný odpočet i jeho druhový počet
v jobu jsou ve stejné transakci; kurzor postupuje až po úspěchu celé stránky.
Při částečném úspěchu se již odebrané zdroje znovu neodečtou.

Nové joby dostanou schemaVersion 5 pouze při reactionRemovalEnabled.
V1–v4 se nepřepisují ani znovu neotevírají; vypnutí přepínače v5 pozastaví
bez zápisu. Podtečení či neznámá data jdou na needs-review. Potvrzení Auth,
request createTime, původní deadline a lease platí před každým odpočtem.
Nové fields: actorReactionCursor, actorReactionsRemovedAt a tři počty
removedShoutReactionCount/removedCommentReactionCount/removedOrphanReactionCount.
Před živým aktivováním vyžadujeme emulátorové regrese, přesné úspěšné CI,
READY index, potvrzené UID pokrytí a samostatný pilot s úklidem.
Prostředky obou account Functions a minutového plánovače se nemění.

### Dokončený DEV pilot 2. listopadu 2026

Zdroj d0e43c558428cb45976bb5326bbf476cf3ea1cc6 má success CI 41493498292:
252 Flutter, 38 tools, 107 unit, 348 Rules/server, 15 Storage, analýza/lint/build.
Aktualizovány pouze accountDeletionRequestCreatedDev (00008-pay) a
resumeAccountDeletionJobsDev (00008-vig), hash
b2c8a1f7df60cf86b1937fdb1532321e9e10ba62. Obě ACTIVE, Node22,
min0/max1, concurrency1, 256 MiB/60 s. Ostatní Functions, IAM, Scheduler,
Hosting a Rules mají shodu s předchozí vrstvou.

Pilot vytvořil nový syntetický UID bez Auth účtu, veřejný/soukromý profil,
rezervaci, jeden vlastní Shout, jeden oddělený cizí kontext a šest reakcí.
Skutečná DEV Function potvrdila Auth user-not-found; trigger a existující
plánovač dokončily v5 content-archived. Test také ručně vyvolal týž Scheduler
až po splatnosti jobu, bez změny konfigurace nebo minimální retry prodlevy.
Odebrán 1 Shout palec a 1 komentářový palec s přesným odpočtem, 1 osiřelý
hlas bez změny čítače. Cizí hlas zůstal, vlastní hlas na vlastním Shoutu se
přeskočil a vlastní hlas na vlastním komentáři následně převzal content archiv.
Současně ověřeno skrytí Shoutu, soukromý úklid, kopie komentáře/zprávy,
celkem 5 archivních rootů a jedna podřízená reakce, všechny s původním
request createTime +60 dní. Nevznikl ani nebyl smazán žádný Auth účet.

Fixture včetně archivů/jobu/žádosti jsou uklizené, dotaz na jejich UID vrací
0 reakcí. Původní pending žádost a celá původní účetní inventura mají stejný
digest. Soukromé důkazy běhu jsou v ignorovaných build/actor-*-proof.json;
schválená oprava 3 záložek má zvlášť build/lifecycle-ownership-apply-proof.json
a zachovaný původní schválený plán. Automatický konečný 60denní purge
vlastních reakcí/záložek a ostatních retenčních dat následně dokončil
[96b0782 s živým DEV pilotem](ACCOUNT_RETENTION_PURGE_PLAN.md); klientský cutover zbývá.

### Návrat po aktivaci v5

Jakmile existuje v5 job, nevracet samotný account backend na starou v4
binárku z 91d8d9b: starý validator v5 neumí. Bezpečná pauza je nový přesně
otestovaný commit se zachovanou podporou v5 a reactionRemovalEnabled false;
ten v5 pouze čte a vrátí reaction-removal-disabled bez ztráty pokroku.
V1–v4 mají původní cestu. Nasazené UID writery, kompatibilní klient a Rules
se při pauze nevracejí na těla bez UID. Již provedený odpočet a jeho podklad
se automaticky neobracejí; případná oprava dat musí mít vlastní plán.
