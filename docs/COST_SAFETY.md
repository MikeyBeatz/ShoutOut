# Nákladové pojistky Firebase a Google Cloud

Tento dokument je povinný checklist před prvním nasazením Cloud Functions a
před veřejným provozem projektu `shoutout-dev-46c81`. Cílem vývojového prostředí
je zůstat v bezplatných kvótách a omezit škodu při chybě nebo zneužití.

## Zásadní omezení

Rozpočet a jeho e-mailové upozornění **nezastaví účtování**. Firebase také nemá
jediný univerzální tvrdý finanční strop. Omezení útraty lze nastavit pro vybrané
služby včetně Cloud Functions běžících na Cloud Run, ale například Firestore,
Cloud Storage a Hosting vlastní peněžní strop nemají. Ani podporovaný spend cap
není absolutní záruka: vyhodnocení nákladů má zpoždění a služba může limit krátce
překročit.

Proto používáme více vrstev současně:

1. malé technické kvóty a limity přímo u každé služby;
2. App Check, bezpečnostní pravidla a serverové rate limity proti zneužití;
3. rozpočtové alerty a Pub/Sub notifikace pro automatickou reakci;
4. spend cap pro Cloud Functions;
5. nouzový postup pro rychlé vypnutí konkrétní placené služby.

Blaze zachovává bezplatné kvóty podporovaných služeb, ale dovolí jejich
překročení. „Blaze“ proto samo o sobě neznamená ani poplatek, ani ochranu před
poplatkem.

## Potvrzený stav k 30. srpnu 2026

- Projekt používá Blaze a Firebase Storage je aktivní.
- Ve vývojovém projektu není nasazená žádná Cloud Function.
- Připravená funkce `enrichShoutGeography` má `minInstances: 0`,
  `maxInstances: 1`, `concurrency: 1`, `retry: false`, paměť 256 MiB a timeout
  15 sekund.
- Funkce má aplikační měsíční limit 9 500 geokódování. Jde o poslední obrannou
  vrstvu pod aktuální bezplatnou měsíční hranicí Google Maps Geocoding, nikoli o
  náhradu kvóty v Google Cloud Console.
- Konfigurace TTL pro technické logy je připravená v repozitáři, ale její
  aktivace nebyla potvrzena. TTL mazání ve Firestore je účtovaná operace a
  nečerpá bezplatnou kvótu mazání.

## Povinné kroky před prvním nasazením Functions

- [ ] V Google Cloud Billing potvrdit správný billing account a rozsah pouze pro
  projekt `shoutout-dev-46c81`.
- [ ] Zapsat schválený provozní rozpočet a nejvyšší přijatelné riziko do tabulky
  níže. Pro vývoj je doporučený výchozí provozní cíl **0 Kč**; číselný nouzový
  strop musí potvrdit vlastník projektu podle nejnižší hodnoty, kterou konzole
  dovolí nastavit.
- [ ] Vytvořit měsíční Google Cloud budget s upozorněními při 1 %, 25 %, 50 %,
  75 %, 90 % a 100 % skutečné útraty a zapnout také forecast alert.
- [ ] Připojit budget notifications do Pub/Sub. Automatizaci nejdřív otestovat
  pouze upozorněním; následně jí dovolit vypnout konkrétní rizikové API nebo
  službu. Vypnutí celého billingu použít jen jako poslední nouzovou možnost,
  protože může poškodit data a není okamžité.
- [ ] V Firebase/Google Cloud nastavit Cloud Functions spend cap na nejnižší
  praktickou hodnotu, nejvýše na schválené riziko. Počítat s možným překročením
  kvůli zpoždění účtování.
- [ ] V Google Maps Platform nastavit pro Geocoding API kvótu nejvýše 100
  požadavků za den a 10 za minutu. Pro jednorázový backfill ji zvýšit pouze na
  schválené časové okno a ihned vrátit.
- [ ] Zakázat nepoužívaná API a každý API klíč omezit pouze na potřebné API a
  správný typ klienta.
- [ ] Ověřit App Check metriky pro Android, iOS a web; enforcement zapínat po
  jednotlivých službách až po potvrzení legitimních klientů.
- [ ] Vytvořit dashboard spotřeby pro Functions, Firestore, Storage, Hosting a
  Maps a ověřit, že upozornění dorazí vlastníkovi projektu.
- [ ] Provést řízený test překročení malé testovací kvóty a zaznamenat, zda se
  požadavky skutečně zastaví. Teprve potom nasadit geografickou Function.

## Navazující pořadí práce zpřístupněné plánem Blaze

Po dokončení a praktickém ověření předchozího checklistu pokračovat v tomto
pořadí. Jednotlivé kroky se neslučují do jednoho nasazení; po každém následuje
kontrola metrik, chyb a spotřeby před otevřením dalšího kroku.

1. **Nasadit `enrichShoutGeography`.** Nejdřív nastavit omezený Geocoding API
   klíč a kvóty, potom Functions secret a samotnou funkci. Ověřit jeden nový
   Shout, regionální data, počet spuštění a nulový nebo očekávaný náklad.
2. **Provést geografický backfill.** Nejdřív spočítat dokumenty bez `geography`,
   odhadnout počet API volání a nastavit dávku. Backfill spouštět po částech,
   kontrolovat chybějící ISO 3166-2 a po dokončení vrátit dočasně zvýšenou kvótu.
3. **Aktivovat připravené TTL politiky.** Předem změřit objem technických logů a
   schválit odhad ceny, protože TTL mazání je účtované. Po aktivaci ověřit stav
   politik, skutečné mazání a denní náklad.
4. **Začít serverovou automatizací expirace a mazání účtů.** Nejprve expirace
   Shoutů a bezpečné dávkové mazání podkolekcí, potom idempotentní zpracování
   `accountDeletionRequests` a dokončení 60denní retence. Každá úloha musí mít
   limit dávky, `maxInstances`, ochranu proti opakování, audit a test částečného
   selhání.

Pořadí je závazné pro vývojové prostředí. Produkce vznikne jako samostatný
projekt a projde stejnou nákladovou bránou s vlastními limity.

## Limity jednotlivých služeb

### Cloud Functions

Vývojové funkce ponechat na `minInstances: 0` a `maxInstances: 1`. Retry povolit
jen pro idempotentní operaci s vlastním limitem. Každá nová funkce musí mít
explicitní timeout, paměť, maximální počet instancí a odhad nejhorší ceny.
Spouštěče nad Firestore musí zabránit rekurzivnímu zápisu a nekonečné smyčce.

### Firestore

Firestore nemá peněžní spend cap. Ochranu proto tvoří Rules, App Check, omezené
dotazy, stránkování, serverové rate limity a monitoring čtení, zápisů i mazání.
Ve vývoji nezapínat TTL jen proto, že je dostupné: nejdřív změřit objem logů a
odhadnout účtovaná TTL mazání. Pro nízký objem lze TTL přijmout jako vědomý
náklad; jinak navrhnout řízený úklid běžnými mazáními v rámci dostupné kvóty.

### Cloud Storage

Zachovat limity typu, velikosti a cesty ve Storage Rules i v klientovi. Nastavit
monitoring velikosti bucketu, počtu operací a přenesených dat. Automatický úklid
musí být omezený dávkou a nesmí při chybě opakovaně procházet celý bucket.

### Hosting

Nasazovat jen ověřené buildy, mazat nepotřebné preview kanály podle retenčního
plánu a sledovat přenos dat. Hosting nemá vlastní peněžní strop.

### Google Maps a ostatní externí API

Konzolová denní a minutová kvóta je hlavní ochrana; aplikační limit 9 500 za
měsíc je záloha. Klíč pro serverové geokódování nesmí být ve Flutter klientu.
Stejné pravidlo platí pro každé budoucí placené API, včetně Stripe nebo SMS:
před aktivací musí mít vlastní limit, monitoring, nouzové vypnutí a vlastníka.

## Nouzový postup při růstu nákladů

1. Ověřit službu a metriku, která náklad vytváří; nespoléhat jen na opožděný
   billing graf.
2. Vypnout nebo snížit kvótu konkrétního API. U Functions zastavit rizikovou
   funkci nebo její trigger a ponechat nedotčené služby běžet.
3. Pokud útok pokračuje, zpřísnit App Check/Rules a dočasně uzavřít registraci či
   zápis, ne mazat data.
4. Teprve když selektivní zásah nestačí, použít automatizované vypnutí billingu.
   Počítat s prodlevou a s tím, že může odstavit aplikaci i související zdroje.
5. Zapsat incident, skutečnou cenu, příčinu a upravit limit před obnovením.

## Evidence nastavení

| Položka | Cílová hodnota | Aktuální stav | Ověřeno |
|---|---|---|---|
| Vývojový provozní cíl | 0 Kč, využívat bezplatné kvóty | čeká na potvrzení | — |
| Nejvyšší přijatelné riziko | určí vlastník před deployem | neurčeno | — |
| Billing budget a alerty | 1/25/50/75/90/100 % + forecast | neověřeno | — |
| Pub/Sub automatická reakce | otestovaná, selektivní vypnutí | nenastaveno | — |
| Functions spend cap | nejnižší praktická hodnota | nenastaveno | — |
| Geocoding quota | max. 100/den a 10/min | neověřeno | — |
| Functions runtime limity | 0–1 instance, bez retry, 15 s | připraveno v kódu | 30. 8. 2026 |
| Functions deploy | žádná před dokončením checklistu | žádná nasazená | 30. 8. 2026 |
| Firestore TTL | aktivovat až po odhadu ceny | konfigurace připravena | 30. 8. 2026 |

## Oficiální podklady

- [Firebase: jak se vyhnout neočekávaným účtům](https://firebase.google.com/docs/projects/billing/avoid-surprise-bills)
- [Firebase FAQ: možnosti omezení nákladů](https://firebase.google.com/support/faq/)
- [Google Cloud Billing budgets a automatizace](https://cloud.google.com/billing/docs/how-to/budgets)
- [Firebase cenové plány a bezplatné kvóty](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Firestore ceny a účtování TTL](https://firebase.google.com/docs/firestore/pricing)
- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
