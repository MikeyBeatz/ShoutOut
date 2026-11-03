# Vyhodnocení API událostí v okolí

Aktualizováno 25. srpna 2026. Tento dokument uzavírá průzkum zdroje externích
událostí; neznamená zapnutí integrace.

## Rozhodnutí

Pro případný omezený pilot použít jako první zdroj **Ticketmaster Discovery API
v2**. Podporuje hledání podle geobodu, poloměru, data, země a locale, zahrnuje
Česko, Německo, Polsko, Slovensko, Itálii a další cílové země a výchozí klíč má
limit 5 000 požadavků denně. PredictHQ ponechat jen jako budoucí placenou
alternativu: výsledky závisejí na rozsahu předplatného a pro současný požadavek
nulových nákladů není vhodný.

Zdroje:

- Ticketmaster Discovery API v2: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
- podmínky a výchozí limity Ticketmaster: https://developer.ticketmaster.com/products-and-docs/apis/getting-started/
- PredictHQ Events API: https://docs.predicthq.com/api/events/search-events

## Podmínky případné implementace

- Volat API pouze ze serveru; klíč nevkládat do Flutter web buildu.
- Cachovat odpověď podle geobuňky, časového okna a locale nejméně 15 minut a
  zastavit požadavky před denním limitem poskytovatele.
- Ukládat `provider`, stabilní `providerEventId`, zdrojovou URL, čas poslední
  synchronizace a hash normalizovaného názvu, místa a začátku pro deduplikaci.
- Ticketmaster záznam vždy označit štítkem **Externí událost · Ticketmaster** a
  nepřipisovat mu autora, reakce, komentáře ani karmu ShoutOutu.
- Detail ukáže zdroj, čas poslední aktualizace a externí odkaz. Zrušenou,
  přesunutou nebo zmizelou událost cache skryje při další synchronizaci.
- Text poskytovatele nepřekládat strojově ani nemíchat locale. Chybějící locale
  zobrazit v dodaném jazyce a viditelně uvést zdroj.
- Před pilotem znovu zkontrolovat aktuální Partner API Terms, branding a právo
  cachovat texty a obrázky. Bez této kontroly se data nesmí publikovat.

Integrace není prioritou před dokončením vlastního lokálního obsahu. Výsledek
průzkumu je proto **technicky proveditelné, ale odložené**.
