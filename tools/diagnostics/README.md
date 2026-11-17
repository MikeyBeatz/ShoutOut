# Izolovaná diagnostika konzole

Schválený lokální úsek, ne součást startu aplikace nebo běžného CI.
[Výsledky, omezení a návrh opravy](../../docs/operations/CONSOLE_WARNINGS.md).

Z kořene projektu:

```sh
flutter build web --debug --target tools/diagnostics/font_warning_probe.dart --output build/console-warning-probe-web --no-wasm-dry-run
node tools/diagnostics/run_console_warning_diagnostics.mjs --fonts-only
```

Vyžaduje místní Flutter a Node 22, nainstalovaný Chrome a závislosti projektu.
CHROME_EXECUTABLE může určit existující binární soubor Chrome. Nový prohlížeč
se spouští jako vlastní headless proces s jednorázovým profilem pod build,
ovládání jde pouze přes pipe tohoto procesu. Nepřipojuje se k uživatelskému
prohlížeči, existujícím profilům ani debug portu. Při ukončení se vlastní
profil odstraní až po kontrole absolutní cílové cesty.

HTTP server je vázaný na 127.0.0.1 s náhodným portem. Flutter probe neimportuje
main.dart a nespouští Firebase. Varianta current-categories načte přes tento
server jen dvě konstanty ze zdrojového shout_model.dart. Ostatní vzorky jsou
pevné srovnávací Unicode texty, nikoli skutečné Shouty.

```sh
node tools/diagnostics/run_console_warning_diagnostics.mjs --recaptcha-only
```

Tato varianta načte veřejný DEV site key z config/dev.json a vykreslí Google
komponentu přes google.com a recaptcha.net. Nepoužívá Firebase SDK a nevolá
execute() ani getToken(). Render callback není důkazem získání tokenu ani
funkčnosti App Check na localhost. Klíč a parametry třetích stran se nelogují.
Pozitivní kontrola vloží vlastní lokální dokument s report-only pravidlem do
jiného lokálního originu a musí vyvolat skutečné CSP varování. Další oddělený
kontrolní vzorek zkouší veřejnou domovskou stránku Googlu; jeho odmítnutí není
chyba reCAPTCHA. Zachycují se i vnořené cross-origin iframe targety.

Volitelná kombinace --dev-readonly načte startovací stránku pouze na pevném
shoutout-dev-46c81.web.app, bez přihlášení či akcí. Sama aplikace může zkusit
reCAPTCHA execute; výměna App Check i Firebase backendy jsou blokované před
odesláním přes browser request interception. Počty blokovaných pokusů se
zaznamenají odděleně, jejich chyby nejsou produkční regresí. Produkční doménu
ani jinou adresu nástroj nepřijímá. Bez této volby se DEV aplikace nenačítá.

Výsledky a dva srovnávací PNG jsou v build/console-warning-diagnostics.
URL mají odstraněné query/fragment, hlavičky obsahují jen frame-ancestors,
runtime text má redakci dlouhých hodnot; request/response bodies, cookies,
Auth a tokeny se neukládají. Běh po dokončení zastaví vlastní Chrome i server.
Úspěšný běh znamená provedení kontrol, ne automaticky nepřítomnost všech
varování. Závislost na síti a komponentách Googlu se nezapojuje do CI.
