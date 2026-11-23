# Soukromé odpovědi v Mé shouty → Komentáře

[Navazující plány](README.md) · [Požadavek v backlogu](../../BACKLOG.md#bl-158)

## Rozsah a termín

Vlastník 23. listopadu 2026 požádal zpřístupnit soukromé odpovědi také pod
**Mé shouty → Komentáře** a výslovně zvolil implementaci **až po MVP**.
Stav: naplánováno, neimplementováno. Tento požadavek není podmínkou vydání MVP.

Dnešní MyCommentsPage v lib/src/saved.dart načítá jen veřejné comments.
Soukromé privateReplies jsou dostupné v detailu Shoutu a přes oznámení.
Cílem je přidat jejich dohledání do uvedené osobní sekce, nikoli změnit
soukromé zprávy na veřejné komentáře nebo nyní migrovat jejich úložiště.

## Navržený postup po MVP

1. Před implementací potvrdit uspořádání společného přehledu a určit, zda
   má obsahovat jen vlastní odeslané odpovědi, nebo také přijaté konverzace.
   Zachovat zvolenou cestu Mé shouty → Komentáře a zřetelné označení soukromí.
2. Navrhnout omezené stránkování a otevření správné konverzace/detailu.
   Vycházet z existujících dotazů authorId/recipientId a aktuálních serverových
   kontraktů; ověřit potřebné indexy a náklady před jejich změnou.
3. Doplnit klienta a pouze nutné serverové čtení. Zachovat účastnická oprávnění,
   blokace, dostupnost obsahu, expiraci, mazání a již schválené retenční lhůty.
   Přehled nesmí zpřístupnit cizí konverzace ani interní archiv.
4. Ověřit stránkování, změnu účtu, odebranou dostupnost a navigaci pro běžný
   i Business účet; následně provést samostatně schválené nasazení a akceptaci.

## Kritéria dokončení

- Oprávněný uživatel dohledá soukromou odpověď v Mé shouty → Komentáře
  a otevře odpovídající detail/konverzaci.
- Veřejný a soukromý obsah je rozeznatelný; cizí účet text ani seznam nezíská.
- Přehled neztrácí položky kvůli první stránce, nesmíchá účty a neobnovuje
  smazaný nebo již nedostupný obsah.
- Výsledek je ověřen pro oba typy účtů a doložen podle pravidel vydávání.

Položka bl-158 má vlastní dosud otevřenou váhu jen v celkovém backlogu.
Zapsání plánu samo neuděluje kredit za implementaci, testy, nasazení či akceptaci.
