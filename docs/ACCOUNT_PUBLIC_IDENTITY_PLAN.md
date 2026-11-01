# Veřejná identita smazaného účtu – lokální úsek

1. listopadu 2026. Navazuje na [dokončený DEV archiv](ACCOUNT_CONTENT_ARCHIVE_PLAN.md)
a [zbývající účtové fáze](ACCOUNT_DELETION_REMAINING_PLAN.md).

## Rozsah schválený vlastníkem

Lokálně připravit serverové jádro, anonymní zobrazení a ochranu SDK čtení
Business loga. Bez zapojení do živého workeru, nových Auth účtů, datové migrace,
nasazení Functions, Hostingu či Rules. V1/v2/v3 joby a jejich schémata se nemění.
Soukromý/Business profil, role a konečný purge jsou navazující úsek.

## Serverové jádro a rezervace

`functions/account_public_identity.js` není exportované z žádného Functions
entry pointu ani kopírované přípravnými skripty do deploy balíků. Lab adaptér
navíc vyžaduje přesně shoutout-rules-test a 127.0.0.1:8080; oba živé projekty odmítne.

Vstup obsahuje UID, projectId a původní Firestore createTime žádosti. Před prací
musí existovat shodná pending žádost a Auth vrátit právě auth/user-not-found.
Jiné Auth chyby ani existující účet neopravňují k zápisu. V transakci se znovu
ověří žádost a povinný callback calleru hlídající lease/progress.

`publicProfiles/{uid}` se nahradí přesně dvěma poli:

```json
{"schemaVersion": 1, "accountStatus": "deleted"}
```

Žádné jméno, avatar, logo, role, datum ani e-mail v markeru nejsou. I chybějící
veřejný profil dostane marker, aby klient nepoužil staré jméno z obsahu.
Původní veřejný profil musí odpovídat soukromému jménu; neznámá pole/vnoření
se zachovají pro review. Chybějící/vadná identita či nevlastněná rezervace
znamená review bez dílčích zápisů. Neprovádí se žádný plošný scan.

Klíč rezervace se čte z aktuálního users.nicknameLower; přesná nicknames
rezervace musí existovat a patřit UID. Její obsah ani updateTime se nemění.
Jádro vrací klíč a původní serverový deadline žádost.createTime + 60 dní pro
budoucí privátní průběh/purge; samo rezervaci neprodlužuje ani neuvolňuje.
Na přesné hranici 60 dní už novou práci odmítne. Je-li profil již minimálním
markerem, replay neprovádí nový zápis ani znovu nezapočítá maskování.
Soukromý profil/legal, Business profil a role zůstávají v tomto helperu beze změny.

## Klient a pravidla

PublicIdentity rozpozná accountStatus deleted, zobrazí lokalizovaný „Smazaný účet“
a neutrální ikonu bez původního avataru, role a loga. Značka má přednost i nad
přebytečnými starými poli. Cache log daného UID se zahodí. Chybějící profil bez
markeru se nepovažuje automaticky za smazaný; zachová se kompatibilní fallback.

PublicIdentityBuilder drží potvrzené smazání pro konkrétní UID přes chyby
streamu. Marker se zachytí už při datové události, i když před dalším snímkem
přijde chyba. Při změně UID se stav i snapshot oddělí, aby se nepřenesla identita
mezi řádky. Mapovaný stream je stabilní přes běžné parent rebuildy.
Volitelný stream dat umožňuje izolované widget testy bez mockování sealed SDK tříd.

Profil s markerem nenabídne nové sledování ani seznam aktivních Shoutů.
Soukromé odpovědi z karet, komentářů a privátních zpráv se skryjí; serverový
recipient guard z předchozí fáze zůstává autoritativní kontrolou doručení.
U již otevřeného privátního konceptu se anonymizuje příjemce a po markeru zmizí
odesílací vstup; koncept lze zavřít původním ovládáním. Běžný veřejný vstup
kvůli tomu žádný nový profilový dotaz nevytváří.
Odebrání dřívějšího sledování ve vlastním seznamu zůstane dostupné, stejně jako
blokování a nahlášení profilu/obsahu. Draft veřejné odpovědi a strukturální
zmínka příjemce používají aktuální identitu; uživatelem napsaný text se nepřepisuje.

Oznámení s konkrétním actorId ověřují jeho veřejnou identitu jen tehdy, když
se jeho jméno skutečně zobrazuje. Aktivním účtům zůstává původní historický
snapshot jména; u smazaného účtu se anonymizuje. Moderační interní podklady
archivu zůstávají původní. Bez actorId nelze starý snapshot jednoznačně přiřadit;
historická data se v tomto úseku nemigrují.

Lokální Firestore Rules odmítnou vytvořit nový following vztah k markeru,
ale dovolí jeho vlastníku odebrat starý vztah. Klient marker nemůže vytvořit,
odstranit ani obnovit jako běžný profil, ani kdyby už pending žádost chyběla.
Storage Rules nově kontrolují veřejný marker při SDK čtení i vlastnických
zápisech loga. Starý Auth token tak nemůže přepsat soubor či vložit nový
download token. Běžná aktivní i historická chybějící identita mají
dosavadní chování; žádost sama o sobě ještě nepředstírá dokončené odstranění Auth.

Hlavičky a ovládací prvky sdílejí existující live_data dokumentový zdroj,
nevytvářejí samostatné SDK dotazy pro tutéž identitu. Oznámení/zmínky mohou
přidat odběr dalšího skutečně zobrazeného UID. Storage čtení posuzuje jeden
unikátní Firestore profil; vlastnický zápis nejvýše dva různé dokumenty
(profil a role). To jsou logické přístupy, ne změřené účtované čtení;
před živým napojením vyhodnotit skutečné počty a náklady.

## Ověření a zbývající brány

Serverové případy pokrývají Auth přítomnost/výpadek, přesný deadline, cizí
rezervaci, ztracené potvrzení transakce, rollback průběhu, převzatou/expirovanou
lease, výměnu žádosti, replay a neznámá data. Widget testy ověřují anonymizaci,
neutrální avatar, chybu streamu, oddělení UID a zmizení privátní akce.
Rules testy ověřují odmítnutí nového follow i možnost odebrání starého.

`npm --prefix tools run test:storage` spouští oba izolované emulátory; testuje
SDK přístup vlastníka, uživatelů a šesti rolí, odmítnutí podvrženého markeru
i regresi bug screenshotů. Je zapojený do CI se samostatným časovým limitem
a společnou cache obou emulátorů. Firestore plná sada obsahuje i nové jádro.

Osm Storage testů výslovně zachycuje omezení: dříve získané tokenové URL po
samotném markeru stále stáhne soubor, zatímco SDK čtení i získání nového URL
už jsou odmítnuté. Nic tedy netvrdí úplnou revokaci všech způsobů přístupu.
Firebase popisuje [dlouhodobý odvolatelný odkaz](https://firebase.google.com/docs/reference/swift/firebasestorage/api/reference/Classes/StorageReference.html).
Před živým napojením je nutný serverový krok pro odvolání dříve vydaných URL
a bezpečné pořadí pozdějšího fyzického smazání loga před odstraněním markeru.

Tři prověřené Admin SDK zapisovače veřejné/Business identity a rolí mají
novou schválenou [lokální ochranu](#admin-write-guards). Nástroje nad živými
daty spuštěné nebyly a nejde o ochranu libovolného jiného Admin SDK kódu.
Integrace také musí vyřešit starý Auth token a odvolání pending žádosti po
potvrzeném odstranění Auth; samotný veřejný marker není obecná serverová
eligibility kontrola všech soukromých a obsahových zápisů.
Rozšíření jobu, migrace jeho starých verzí, nový datový/Auth
pilot a politika veřejného markeru po dočištění nejsou tímto schválené.
Nejde o hotovou minimalizaci všech osobních dat ani dokončený účtový milník.
Rules jsou cílený lokální prototyp; před veřejným vydáním vyžadují celkovou
bezpečnostní kontrolu podle MVP_SERVER_PLAN.

Lokální výsledky: 241 Flutter, 94 serverových unit (182 emulator-only skip),
35 tools, osm Storage případů a analyzátor/lint bez chyby. Plná Rules/server
sada 261/261 prošla; po doplnění nezměnitelnosti markeru prošla znovu celá
Rules sada 73/73. Lokální úsek je dokončený, zdroj
da264992945f694fd68ed95f83a5fb757044b443 má
[CI 41328636468 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41328636468)
včetně 241 Flutter, 262 Rules/server a 8 Storage případů, unit/tools a buildu.
Živě není zapojený ani nasazený; uvedené integrační brány zůstávají otevřené.
[Aktuální stav](PROJECT_STATUS.md), [testovací evidence](TESTING.md).

<a id="admin-write-guards"></a>

## Ochrana tří důvěryhodných zapisovačů – lokální doplnění

Vlastník 1. listopadu výslovně schválil opravu tří nástrojů bez živého
spuštění, nasazení, nových Auth účtů nebo změn existujících jobů. Žádná role,
oprávnění, Business podmínka, retenční lhůta ani prostředek se nemění.

`tools/identity_write_fence.mjs` čte accountDeletionRequests a publicProfiles
pro cílové UID uvnitř téže Firestore transakce jako zápis. Jakákoli žádost
(i jiný stav než pending) nebo accountStatus deleted změnu odmítne.
Dokumenty jsou součástí read setu; souběžná změna podléhá transakčnímu pořadí
Firestore, nikoli pouze starému výsledku Auth lookupu. Povoluje jen stávající
DEV projekt nebo explicitně zapnutý emulátor shoutout-rules-test.

- Backfill nově enumeruje ID users a pro každý účet čte aktuální users/role
  a guard. Původní hromadný snapshot profilu/rolí se pro zápis nepoužije.
  Mazané účty se počítají jako přeskočené; ostatní chyby se neskrývají.
  Zachovává se merge běžných avatarových/jmenných polí, veřejná role a logo.
- Role helper zapisuje roli účtu i veřejný štítek atomicky; původní CLI
  nadále sestavuje stejné role/úrovně/rozsahy a timestampy. Downgrade user
  odstraňuje pouze roli a veřejný štítek, jako dosud.
- Business helper používá původní validační builder a nezměněné podmínky
  aktivace. Profil, initial location, role a změna žádosti jsou společná
  transakce s guardem. Zachovává chybějící běžný profil při počáteční aktivaci,
  nepoškozuje existující privilegovanou roli a neobnovuje existující Business data.
  Původní dry run i potvrzovací CLI přepínače zůstávají zachované.

Změna je úmyslně konzistentnější, nikoli prokázaně levnější údržba: enumerace
users ID má dokumentová čtení, kandidát backfillu typicky další čtyři
(žádost, veřejný profil, users a role) a jeden zápis. Zablokovaný účet má
jen dvě kontrolní čtení. Odpadl scan celé kolekce rolí. Zpracování je po účtech
sekvenční; transakční retry může přidat práci. Role/Business operace přidávají
dvě kontrolní čtení. Jde o ruční nástroje, ne běžný feed ani nový plánovač;
nejsou to cenové stropy ani ověřené cloudové náklady. Živý backfill vyžaduje
vlastní konkrétní datový souhlas a posouzení rozsahu před spuštěním.

Lokálně 22 integračních případů ověřuje běžný backfill, všechny původní role,
Business aktivaci před vznikem běžného profilu, zachování existujících dat,
pending/historickou žádost i marker a šest souběhů zahájená práce → mazání
před kontrolními čteními transakce. Kontrola zahrnuje data i updateTime a rollback
částečné role/Business změny; jiný účet se nemění. Celá tools sada má 37 pass
včetně dev-only guardů skutečných CLI s neplatnými syntetickými credentials.
Všechny fixture jsou pouze emulátorové; žádný Auth SDK účet nevzniká.
Testy jsou zapojené do test:tools a plné test:rules sady v CI.
Lokální úsek je uzavřený ve zdroji a0a9117b8e53cc349f1248fd0bb264f787afbf85,
commitnutý a pushnutý. [CI 41347854953 success](https://github.com/MikeyBeatz/ShoutOut/actions/runs/41347854953)
ověřilo celou sadu včetně 284 Rules/server případů a web buildu;
úplné výsledky a důkazy jsou v [TESTING](TESTING.md).

Zbývají revokace starých URL loga, nezrušitelný potvrzený stav mazání,
integrace jobu a ostatní osobní/Business data, role, fyzický purge a klientský
cutover. Ochrana těchto tří nástrojů sama účtový milník neuzavírá.
