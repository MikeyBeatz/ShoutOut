# Odebrání reakcí mazaného účtu

Rozhodnutí vlastníka 2. listopadu 2026: po potvrzeném odstranění Auth odebrat
palce účtu u cizích Shoutů a komentářů a upravit počty. Nezachovávat anonymní
agregované hlasy. Technické bezpečnostní podklady smějí zůstat jen do
původního serverového termínu žádosti + 60 dní; nové zpracování jej neobnovuje.

## Připravené jádro

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

**Zatím není zapojené do živého account workeru ani jeho deploy artefaktu.**
Dosavadní joby se nepřepisují. Výsledek selection-processed neznamená, že jsou
prohledané všechny reakce účtu; pokrývá jen vybranou stránku.

## Vlastnické vyhledávání

Připravené tři stávající callables zapisují do reakcí/záložek také serverové
`userId` shodné s Auth UID a ID dokumentu. Payload ani odpověď API se nemění,
nepřidává se další dokumentový zápis. Rules vyžadují totéž pole i od přímého
zapisovače; nesmí být vynechané, podvržené ani odstraněné přepsáním reakce.
Stejné UID doplňují i dosavadní klientské fallbacky, pokud serverový přepínač
není aktivovaný; tím zůstávají kompatibilní s novými Rules.
Čtení starých položek a jejich odstranění zůstává možné. DEV má všechny tři
serverové přepínače již zapnuté, takže aktuální klient neposílá původní tělo.

Připravené indexy jsou pouze collection-group ASC pro `reactions.userId` a
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
Případná oprava těchto tří existujících záložek potřebuje zvlášť konkrétní
proveditelný plán, updateTime preconditions a souhlas s opravou dat; samotný
rollout ji neprovádí. Připravený nástroj `tools/activity_ownership_repair.mjs`
má pět emulátorových testů: dry-run bez zápisů, atomické UID-only doplnění,
zastaralý plán, souběh v commit, lost-ack replay a odmítnutí cizích cest/projektu.
Vyžaduje přesný digest, podporuje jen DEV a starou updateTime; nemění rodiče,
počty, typ reakce ani původní timestampy. Zatím živě nebyl spuštěný s apply.
Před nasazením workeru musí být doložená úplnost jeho
konkrétního objevovacího dotazu, ne pouze přítomnost indexu.

## Ověření a další krok

Lokálně 12 skutečných emulátorových scénářů jádra a 3 adversariální Rules
scénáře pro vlastnictví; úplná sada 336 Rules/server prošla bez chyb. Ověřené
jsou také standardní serverové add/switch/remove a nové UID v záložce.
Lint prošel. Indexový plán má test zachování existujících konfigurací a TTL.
CI, skutečné nasazení a následující integraci eviduje PROJECT_STATUS.

Po této vrstvě navazuje stránkovaná objevovací cesta a verzovaná fáze workeru
se stejným společným rozpočtem 50 položek. Musí mít trvalý kurzor, atomické
počty a bezpečný replay, respektovat původní joby a original deadline. Teprve
po integračních testech, CI, ověření pokrytí a živém pilotu lze prohlásit
automatické odebrání palců za nasazené. Sedmidenní Shout purge a konečný
60denní account purge tím nejsou implementované.
