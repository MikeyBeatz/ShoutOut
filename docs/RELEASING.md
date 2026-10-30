# Výběr změn a publikování ShoutOut

Pravidla schválená 25. října 2026. Platí pro další práci agentů společně
s kořenovým [AGENTS.md](../AGENTS.md). Technické příkazy a konfigurace prostředí
jsou v [WEB_ENVIRONMENTS.md](WEB_ENVIRONMENTS.md).

## Kterou verzi vydáváme

Jeden Git repozitář obsahuje společný zdrojový kód aplikace. Vývojový a
produkční build používají oddělené Firebase projekty a konfigurace.

Každé vydání určuje konkrétní Git commit, tedy úplný uložený stav zdrojového
kódu s jednoznačným SHA. Nasazuje se celý build tohoto stavu. Před vydáním se
ověří seznam všech zahrnutých změn; nevybírají se až jednotlivé soubory při
uploadu na Hosting.

`main` obsahuje otestované změny schválené uživatelem. Produkce může běžet na
starší označené verzi z `main`, zatímco novější schválené změny ještě čekají
na vydání. Sloučení do `main` samo o sobě nic nenasazuje a neznamená, že už je
splněná celá startovní brána MVP.

## Postup jednoho úkolu

<a id="trvaly-souhlas-s-vyvojovymi-rollouty"></a>
<a id="trvaly-souhlas-s-rollouty"></a>

### Trvalý souhlas s vývojovými a produkčními rollouty

Dne 30. října 2026 uživatel uvedl: „Pro příští dotazy povoluji všechny rollout
pokud jsou úspěné CI“. Na dotaz po rozsahu potvrdil: „Vývoj i produkce při
splnění pravidel vydání“. Jde o předem udělený souhlas s dalšími rollouty
v rámci schválené práce do vývojového projektu `shoutout-dev-46c81` i produkční
aplikace `go.shoutout-app.eu` (projekt `shoutout-production-a1b34`, app Hosting
site `shoutout-go-a1b34`). Není potřeba
opakovat dotaz na nasazení každé nové Function, klientské aktivace, Hostingu
nebo Rules, pokud úspěšně prošlo CI pro přesný nasazovaný commit a jsou splněna
pravidla vydání pro dané prostředí.

Před nasazením zkontrolovat aktuální SHA a úspěšný konečný stav příslušného
CI běhu, čistou pracovní kopii a shodu artefaktu s daným commitem/prostředím.
Uvést konkrétní změny a cílový projekt/site či endpoint. Po nasazení provést
odpovídající živé ověření a zaznamenat výsledek i návratovou verzi. Chybějící,
běžící nebo neúspěšné CI podmínku nesplňuje; úspěch staršího commitu nestačí.
To nenahrazuje potřebné testy ani automaticky nevynucuje žádnou CI/CD pojistku.

Dosavadní souhlas s testovacím obsahem a úklidem pro právě schválený průchod
zůstává platný. Tato věta sama nepovoluje libovolné mazání dat, migrace,
změny tarifu nebo oprávnění. Schvalování implementace, slučování do `main`
a vytváření/publikování tagů se řídí dosavadním rozsahem oprávnění.

Pro produkci nadále platí schválený obsah vydání, označený commit v `main`,
čistá pracovní kopie, produkční konfigurace/build a všechny kroky níže.
První veřejné vydání vyžaduje dokončené MVP a splněnou startovní bránu.
Samotný rollout po splnění těchto podmínek už nevyžaduje nový dotaz na souhlas;
dosud neschválené Git operace nebo změny rozsahu práce tím nejsou schválené.

### Jednotlivé kroky

1. Ověřit kód, backlog, aktuální větev a pracovní strom. Před úpravami
   předložit konkrétní rozsah uživateli a získat souhlas. Již udělený souhlas
   pro stejný rozsah znovu nevyžadovat.
2. Pracovat v samostatné větvi `feature/<nazev>` nebo `fix/<nazev>` odvozené
   od `main`. Nesouvisející rozpracované úkoly držet v jiných větvích.
3. Provést změnu, odpovídající kontroly a aktualizaci dokumentace. Uživatel
   dostane přehled diffu nebo pull requestu, ověření a známých omezení.
4. V rámci výslovného nebo výše uvedeného trvalého souhlasu nasadit vybranou verzi na vývojový Hosting
   `shoutout-dev-46c81`. Uvést commit a případné lokální změny, které testovaný
   build obsahuje. Před sloučením ověřit konečnou uloženou podobu změny;
   pozdější úpravy vyžadují přiměřené opakování kontrol a schválení.
5. Po schválení výsledku uživatelem sloučit do `main` v autorizovaném rozsahu.
   Pokud oprávnění ke sloučení chybí, předložit konkrétní připravenou změnu
   a vyžádat si je. Neschválená práce zůstává ve své větvi.

Souhlas s implementací, Git operacemi a nasazením jsou různé rozsahy oprávnění.
Uživatel je může schválit společně, pokud je výslovně uvede. Není potřeba
opakovat potvrzení pro již schválený konkrétní krok a cíl.

## Produkční vydání

1. Vybrat schválený commit v historii `main`, zkontrolovat všechny změny od
   předchozí produkční verze a určit verzi `vX.Y.Z`, například `v0.1.0`.
   Označení verze je příklad, zatím nejde o existující vydání.
2. Připravit samostatnou čistou pracovní kopii vybraného commitu. Ověřit
   `git status --porcelain` včetně nesledovaných souborů a úplné SHA pomocí
   `git rev-parse HEAD`. Konfigurace použitá pro build musí odpovídat vydání;
   ignorované tajné hodnoty zůstávají mimo Git a nesmějí přepnout prostředí.
3. Spustit povinné kontroly a produkční build podle provozní dokumentace.
   Výsledek testu staršího nebo jiného commitu nedokládá tento release.
   Pro první veřejné vydání navíc splnit [LAUNCH_READINESS.md](LAUNCH_READINESS.md).
4. Předložit uživateli konkrétní vydání: verzi, úplné SHA, obsah změn,
   výsledky kontrol, známé vady, projekt, Hosting site, doménu a předchozí
   verzi pro případ návratu. Souhlas s produkčním rolloutem je výše udělený
   předem při splnění CI a pravidel vydání; nevyžadovat jej znovu. Případné
   dosud neschválené Git operace vyžadují odpovídající oprávnění.
5. Schválený commit označit tagem `vX.Y.Z`; existující vydaný tag nepřesouvat.
   Nasadit přesně ověřený artefakt. Dodatečná změna zdrojů nebo buildu vyžaduje
   nové ověření; podstatná změna obsahu také nové schválení.
6. Ověřit dostupnost a nasazenou verzi. Do zprávy o nasazení zaznamenat verzi,
   SHA, datum, Firebase projekt/site, výsledek ověření a způsob návratu.
   Sdílený záznam patří k vydání nebo do jeho dokumentace v autorizovaném
   rozsahu. Neuvádět hesla, privátní klíče ani osobní data.

| Prostředí | Cíl |
|---|---|
| Vývoj | projekt/site `shoutout-dev-46c81` |
| Produkční aplikace | projekt `shoutout-production-a1b34`, site `shoutout-go-a1b34`, doména `go.shoutout-app.eu` (`Connected`, platné HTTPS, první release zatím chybí) |
| Prezentace | projekt `shoutout-production-a1b34`, vlastní `presentation/firebase.json` |

Alias `web` označuje společný produkční projekt a nevybírá Hosting web.
Při nasazení aplikace musí být explicitně vybraný její app site; site
`shoutout-production-a1b34` je vyhrazený vstupní stránce. Předchozí souhlas s vývojovým Hostingem neopravňuje k nasazení
produkční aplikace, prezentace, Rules, Functions ani k zásahům do dat.

## Co už kontrolují nástroje

`tools/web_environment.mjs` ověřuje prostředí, cílový projekt, release režim,
shodu konfigurace a SHA-256 otisky souborů buildu. Nasazení má predeploy
kontrolu a bez `--apply` jde pouze o místní náhled cíle.

GitHub Actions spouštějí testy, analýzu, kontrolu formátu a vývojový webový
build. Automatické nasazování není nakonfigurované.

Vazba buildu na Git commit, čistá pracovní kopie, schválení změn, release tag
a ochrana `main` nejsou tímto skriptem automaticky vynucované. Do doplnění
automatických pojistek jde o povinné ruční kontroly agenta a uživatele.
Tento dokument ani úprava `AGENTS.md` nemění nastavení ochrany větví na GitHubu.

## Přechod ze současného pracovního stromu

Při zavedení pravidel jsou na `main` lokální necommitnuté změny z předchozích
úkolů. Nejde o doložené produkční vydání. Před dalším vývojem navrhnout jejich
rozdělení do logických commitů a větví a získat souhlas s konkrétními Git
operacemi. Žádné změny automaticky nemazat, neukládat do stashe ani neslučovat
do jednoho commitu jen kvůli vytvoření čistého pracovního stromu.

Pokyny jsou zatím v této pracovní kopii. Aby je jiné pracovní kopie mohly
používat, musí být po schválení commitnuté a přenesené přes Git. Dostupnost
instrukcí v jiných AI nástrojích závisí na jejich podpoře a nastavení;
`AGENTS.md` není univerzální technická záruka dodržování pravidel.
