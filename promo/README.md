# ShoutOut promo balíček

Tato složka je samostatný zdroj kontextu pro ChatGPT nebo jiný nástroj, který
má připravit propagační video ShoutOutu. Materiály odpovídají vývojové verzi
aplikace k 26. červenci 2026.

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
- Video nesmí tvrdit, že aplikace je již veřejně vydaná, celosvětově dostupná
  nebo připravená ke stažení.
- Nezobrazovat e-mail, heslo, přesné souřadnice, Firebase konfiguraci ani jiná
  neveřejná data.

## Známé vizuální body čekající na opravu

Tyto věci jsou v projektovém backlogu a nemají být zvýrazněné v promo videu:

- na některých Android launcherech se kolem ikony může objevit světlý proužek;
- přihlašovací a registrační obrazovka ještě čeká na úplné sjednocení loga se
  záhlavím feedu;
- font záhlaví Uložené Shouty, Mé Shouty a Profil se může později změnit;
- při prvním načtení profilu se může krátce ukázat výchozí avatar.

`screenshots/01-android-launcher.png` a `02-android-splash.png` jsou schválené
vizuální reference. Pro samostatné zobrazení značky používej přednostně
`branding/shoutout-logo-transparent.png`.
