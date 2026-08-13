# Produktové a uživatelské toky

Dokument zachycuje skutečné chování současné aplikace. Je doplňkem obrazovek a
testů a má umožnit znovu sestavit stejné uživatelské cesty bez znalosti historie
projektu.

## Běžná registrace

1. Nepřihlášený uživatel otevře přihlášení; výchozí jazyk vychází z podporovaného
   jazyka zařízení, jinak se použije čeština.
2. Registrace vyžaduje e-mail, heslo nejméně 10 znaků a shodné potvrzení.
3. Firebase Authentication vytvoří účet a odešle ověřovací e-mail.
4. Dokud `emailVerified` není pravda a není obnoven ID token, Firestore profil se
   nevytváří a aplikace zůstává na kontrole e-mailu.
5. Uživatel přijme aktuální podmínky, soukromí a komunitní pravidla. Souhlas se
   uloží pod verzí `acceptance_2026_07_25`.
6. Uživatel vybere unikátní přezdívku a avatar. Jedna transakce vytvoří rezervaci
   přezdívky, soukromý profil a veřejný profil.
7. Zobrazí se úvodní nápověda s volbou další zobrazování vypnout.
8. Uživatel vstoupí do feedu.

Ověření e-mailu lze znovu odeslat. Volba opravit e-mail odstraní ještě
nedokončený Authentication účet a vrátí uživatele na začátek. Reset hesla vrací
neutrální zprávu bez prozrazení existence účtu.

## Business registrace

Business registrace je samostatný formulář ve stejném vizuálním stylu. Obsahuje:

- zemi a lokální registrační identifikátor,
- oficiální název a fakturační adresu firmy,
- kontaktní e-mail použitý také pro Authentication,
- povinnou první pobočku/provozovnu s vlastním názvem,
- adresu pobočky vybranou ze seznamu Geoapify, souřadnice a geohash,
- heslo a potvrzení.

Po odeslání vznikne Authentication účet, paralelně se uloží
`businessApplications/{uid}` ve stavu `pending_email` a odešle ověřovací e-mail.
Dokud uživatel odkaz nepotvrdí, nepokračuje stejně jako u běžné registrace. Po
potvrzení se obnoví Firebase uživatel i ID token a zobrazí se samostatný stav
čekající Business žádosti; běžný profilový onboarding se neotevře. Brána se
uvolní až po důvěryhodném přidělení role `business` a vytvoření aktivního
`businessProfiles/{uid}`. Klient si roli nikdy nepřidělí. Současná vývojová
verze nemá automatický serverový převod žádosti na aktivní profil; tento krok je
popsán v `BUSINESS_VERIFICATION.md`.

Ve vývojovém projektu lze po ruční kontrole údajů použít chráněný Admin SDK
nástroj `npm run activate:business`. Ve výchozím režimu pouze vypíše plán a až
po explicitním potvrzení projektu, UID a pobočky atomicky vytvoří roli 2,
Business profil a první pobočku. Tento vývojový postup nenahrazuje cílové
automatické ověření registru.

## Vytvoření Shoutu

Společná pole:

- nadpis 1–60 znaků, počáteční malé písmeno se při zápisu normalizuje,
- text 1–220 znaků,
- jedna nebo dvě kategorie z pevného seznamu,
- platnost nejméně 15 minut,
- výchozí délka 2 hodiny.

Běžný účet smí zvolit maximálně 24 hodin. Při publikování se získá aktuální
poloha zařízení, zaokrouhlí se veřejná souřadnice a vypočte geohash. Business
účet musí zvolit aktivní ověřenou pobočku; jméno autora se zobrazí jako
název pobočky a poloha pochází výhradně z pobočky. Checkbox **Na více než 24
hodin** dovolí Business účtu výběr po celých dnech až na 7 dní. Zvýraznění a
propagační okénko jsou dva kombinovatelné checkboxy.

Formulář zůstává otevřený při rate limitu nebo chybě zápisu. Limity:

| Akce | Běžný účet | Business účet |
|---|---:|---:|
| Shout cooldown | 2 minuty | 1 sekunda |
| Shouty za 24 hodin | 50 | 500 |
| Komentáře | 10 sekund, 60/h | stejné |
| Soukromé odpovědi | 10 sekund, 60/h | stejné |
| Hlášení | 1 minuta, 20/den | stejné |
| Ostatní interakce | 1 sekunda, 120/h | stejné |

Rate-limit zápis a obsah musí vzniknout atomicky. Při omezení tvorby obsahu jsou
zakázané Shouty, komentáře a soukromé odpovědi, nikoli čtení.

## Feed a řazení

Feed načítá nejvýše 50 aktivních Shoutů a filtruje blokované autory. Uživatel
volí poloměr, kategorii a řazení: nejbližší, top, končící nebo sledované. Výběr
se zachová při přechodu mezi kartami po celou relaci. Vzdálenost se počítá vůči
aktuální poloze, ale nedostupná poloha nesmí zablokovat načtení feedu.

## Detail, komentáře a reakce

Detail používá stejné údaje a ovládání jako karta ve feedu. Uživatel může:

- like/dislike Shout nebo komentář; druhá stejná reakce ji odstraní,
- uložit Shout vlaječkou,
- napsat veřejný komentář,
- odpovědět veřejně na konkrétní komentář,
- poslat soukromou odpověď autorovi Shoutu nebo komentáře,
- nahlásit obsah nebo zablokovat autora.

Komentář a aktualizace `commentsCount` jsou jedna atomická operace. Totéž platí
pro reakce, saves a jejich souhrnné čítače. Soukromá odpověď je čitelná pouze
autorem, příjemcem a oprávněnou moderací.

## Follow, ukládání a veřejný profil

Kliknutí na přezdívku otevře veřejný profil s aktuální identitou a aktivními
Shouty. Nabízí Follow/unfollow, blokaci a hlášení účtu. Blokace současně ukončí
Follow. Karta **Sledované** obsahuje dvě sekce:

- Shouty označené vlaječkou; po expiraci zmizí z aktivního seznamu,
- sledované profily a jejich aktivní Shouty.

Řazení „Sledované“ ve feedu umístí Shouty sledovaných autorů před ostatní a
uvnitř skupin zachová zvolená pravidla.

## Oznámení

Kategorie nastavení: komentáře/odpovědi, reakce, soukromé odpovědi, Shouty
sledovaných profilů a Shouty v okolí. Poslední dvě kategorie jsou připravené v
UI, ale zatím se bez serverového fan-outu nevytvářejí.

Funkční in-app události jsou reakce na Shout, komentář na vlastní Shout,
odpověď na komentář, soukromá odpověď a reakce na komentář. Vlastní aktivita
oznámení nevytváří. Opakované události stejného typu a cíle se slučují,
zvyšují počet a znovu označí souhrn jako nepřečtený. Kliknutí otevře živý detail
a u komentářové události poslední relevantní komentář. Nedostupný Shout zobrazí
srozumitelnou hlášku.

## Profil a systém

Profil zobrazuje přezdívku, aktuální avatar a datum vzniku účtu. Identitu lze
měnit; přezdívka je po první změně omezená 30denním intervalem. Avatar se
aktualizuje realtime přes veřejný profil.

Dlaždice **Systém** obsahuje jazyk, změnu hesla, preference oznámení a vzhled
system/light/dark. Aplikace podporuje `cs`, `en`, `de`, `pl`, `sk`, `uk` a `vi`.
Právní informace jsou oddělené od uživatelské nápovědy.

## Business profil a pobočky

Dlaždice Business je viditelná pouze roli 2. Obsahuje:

- veřejný a oficiální název, registrační číslo, VAT ID a fakturační údaje,
- seznam poboček,
- připravené sekce Tokeny a Nákupy/faktury.

Pobočka má název, Geoapify adresu, bod, geohash, stav geocodingu, aktivní stav a
soft-delete. Pozastavená nebo smazaná pobočka není ve formuláři Shoutu. Změna
adresy musí být znovu vybrána z našeptávače. Faktury jsou vždy na firmu, ne na
pobočku.

## Moderace a technický dohled

Moderátorské toky, hierarchie, sankce, regionální rozsah a audit jsou popsány v
`INTERNAL_MODERATION.md`. Role 3–4 řeší chování a obsah. Technické chybové logy
smějí prohlížet pouze administrator a owner; každé otevření vytvoří audit.

## Smazání a retence

Žádost o smazání přepne účet do blokujícího stavu a požaduje přibližně 60denní
retenci. Expirovaný Shout je v klientském modelu držen sedm dní. Fyzické
serverové dokončení obou procesů zatím není nasazené a nesmí být považováno za
hotové pouze podle klientského stavu.
