# ShoutOut promo balíček

Tato složka je samostatný zdroj kontextu pro ChatGPT nebo jiný nástroj, který
má připravit propagační video ShoutOutu. Textový brief je aktualizovaný k
13. srpnu 2026. Přiložené screenshoty jsou starší schválené reference vzhledu;
nezobrazují ještě všechny současné funkce, zejména Sledované profily, Business
sekci a centrum oznámení.

## Jak balíček použít

1. V ChatGPT vytvoř projekt `ShoutOut promo`.
2. Nahraj nejdřív tyto textové soubory:
   - `README.md`
   - `PRODUCT_AND_BRAND_BRIEF.md`
   - `VIDEO_PLAN.md`
   - `CHATGPT_PROMPT.md`
   - `SUBTITLES_CS.srt`
3. Nahraj oba soubory z `branding/` začínající `shoutout-`.
4. Nahraj všech šest souborů ze `screenshots/`.
5. Podle potřeby přidej `branding/brand-tokens.json`, font nebo vybrané avatary.
6. Do chatu vlož obsah `CHATGPT_PROMPT.md`.

Tento základ představuje 13 souborů a vejde se i do projektu s nižším limitem
počtu příloh. Celou složku lze otevřít přímo v ChatGPT Work, pokud má přístup
k lokálnímu projektu.

## Obsah složky

- `PRODUCT_AND_BRAND_BRIEF.md` – účel aplikace, cílová skupina, funkce,
  terminologie, vizuální pravidla a hranice tvrzení.
- `VIDEO_PLAN.md` – doporučený 30sekundový scénář, 15sekundová zkrácená verze,
  texty, zvuk a pravidla střihu.
- `CHATGPT_PROMPT.md` – hotové zadání pro ChatGPT nebo video generátor.
- `SUBTITLES_CS.srt` – připravené české titulky pro 30sekundovou verzi.
- `branding/` – finální loga, přesné barevné tokeny a font Urbanist s licencí.
- `screenshots/` – ověřené obrazovky Android aplikace v rozlišení 1080 × 2400.
- `avatars/` – současná sada avatarů ve vysokém rozlišení.

## Důležitá pravidla

- Logo, barvy ani rozhraní se nesmí redesignovat.
- Průhledné logo se nesmí vkládat do bílé dlaždice nebo cizího kruhu.
- Screenshoty prázdných stavů jsou skutečné reference rozhraní. Ve videu lze
  doplnit ukázkové Shouty uvedené ve `VIDEO_PLAN.md`, ale nesmí se vymýšlet
  nová funkce nebo odlišné rozhraní.
- Před finálním veřejným videem je nutné pořídit nové screenshoty současné
  verze. Starý soubor `04-saved-shouts.png` zachycuje předchůdce dnešní karty
  **Sledované** a nesmí se vydávat za aktuální obrazovku.
- Video nesmí tvrdit, že aplikace je již veřejně vydaná, celosvětově dostupná
  nebo připravená ke stažení.
- Nezobrazovat e-mail, heslo, přesné souřadnice, Firebase konfiguraci ani jiná
  neveřejná data.

## Stav vizuálních referencí

`screenshots/01-android-launcher.png` a `02-android-splash.png` zůstávají
schválené vizuální reference značky. Ostatní screenshoty jsou kompoziční
reference staršího rozhraní, ne aktuální produktová dokumentace. Pro samostatné
zobrazení značky používej přednostně
`branding/shoutout-logo-transparent.png`. Aktuální funkční stav určuje
`../docs/PRODUCT_FLOWS.md` v hlavním repozitáři.
