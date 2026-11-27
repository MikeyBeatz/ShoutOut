# Společný archiv – integrační revize před aktivací

První část revize, 27. listopadu 2026. Kontrolovaný archivní zdroj:
**0421b83c9aa95485c77e75a84cd36c3718a7ec58**. Archivní Functions, migrační
nástroje, Rules a níže uvedené klientské soubory jsou shodné i v pracovní
větvi s vedlejší úpravou hry. Nejde o inventuru živých dat ani o souhlas s aktivací.

[Celková integrační brána](../../MVP_SERVER_PLAN.md#content-lifecycle-integration-review)
zůstává otevřená. Tato část řeší tři předem označené přechodové otázky;
nenahrazuje úplnou revizi všech writerů, čtenářů a účtového purge.

**Zpřesnění vlastníka 27. listopadu:** okamžitý archiv a dohledatelnost účtů
přes kontakt mají [samostatný návrh](ARCHIVE_IDENTITY_LOOKUP.md). Schválený je
přístup administrátora/ownera a zachování současných retenčních termínů;
celý navazující místní implementační úsek a testy jsou nyní výslovně schválené.
Následující tři nálezy popisují původní zdroj 0421b83; jejich aktuální řešení
je v [místním dokončení](#local-integration-results).

## 1. Starý rodič a nový komentář

**Potvrzeno:** capture-only writer odmítne nové potomky nepřevedeného Shoutu.
Změna počtu i vznik komentáře/soukromé odpovědi se odmítnou společně.
Je to bezpečné odmítnutí, nikoli důkaz plynulého přechodu pro uživatele.

Podklady: [writer](../../../functions/content_lifecycle.js),
[převod zdrojů](../../../functions/content_lifecycle_adoption.js),
[emulátorová regrese nepřevedeného rodiče](../../../functions/content_lifecycle_staging.integration.test.js).

**Otevřeno:** provozní postup nyní nemá vyřešené přijímání nových potomků mezi
zapnutím capture a převodem jejich rodiče. Souběžné změny starých zdrojů navíc
posouvají legacyRevision a zneplatňují rozpracovanou inventuru.

**Návrh k samostatnému schválení:** ověřitelného starého rodiče převzít přímo
v transakci prvního nového potomka. Použít stejné důkazy, původní termíny a
společný rozpočet 450 zápisů; nejasný nebo již smazaný původ dál odmítat.
Převzetí musí zneplatnit starý inventurní průchod. Nezavádět odhad času smazání.
Jde o novou cestu vůči současnému bezpečnému odmítnutí, zatím neimplementovanou.

## 2. Informování uživatelů před prvním capture

**Potvrzeno:** [privacy text](../../../lib/content_lifecycle_policy.dart) je
připravený v sedmi jazycích, ale jeho výběr v [legal.dart](../../../lib/legal.dart)
řídí stejná [klientská volba](../../../lib/lifecycle_client_policy.dart) jako
nové čtení/historii. Verze i dokument přijetí zůstávají `2026-07-25`.
Serverový `captureEnabled` je od tohoto klientského přepínače oddělený.

**Otevřeno:** zapnutí samotného zachování těl by starému klientovi samo o sobě
nový text ani novou verzi přijetí nezobrazilo. Souhlas operátora s kompatibilními
writery není dokladem vyřešené právní verze; aktuální nástroj ji neověřuje.
Tato revize neurčuje právní základ ani nové produktové pravidlo přijetí.

**Další krok:** oddělit zveřejnění nové informace od zapnutí readeru a připravit
verzovaný přechod. Konkrétní verzi a postup pro stávající účty určit před aktivací;
zatím zachovat všechny přepínače vypnuté a dnešní přijetí neměnit.

## 3. Návrat po odstranění starých textových kopií

**Potvrzeno:** [operátor](../../../tools/content_lifecycle_transition.mjs) standardně
používá `preserve`; `scrub` vyžaduje kompatibilní čtenáře a plně zapnutý serverový
kontrakt. [Převod](../../../functions/content_lifecycle_report_compatibility.js)
kontroluje přesný původ, nemění retenční termín a odstraňuje pole textu bez nové kopie.

[Klient](../../../lib/src/moderation.dart) při vypnutém lifecycle readeru přechází
na staré zdroje. Po odstranění zdroje a textové kopie tedy libovolný starý web
není kompatibilní návratovou verzí. Nativní routing je připravený, nikoli fyzicky
ověřený podepsaný Android/iOS release.

**Další krok:** před `scrub` připravit a integračně ověřit návrat, který zachová
nové čtení. Ověřit pauzu příjmu a samostatné vypnutí údržby, čtení již navázaného
hlášení po ztrátě rodiče, otevřeného klienta a pokračování původních účtových běhů.
Nevydávat obyčejné vypnutí readeru za návrat po destruktivním převodu.

## Kontroly a další pořadí

Při této revizi prošlo **11 nástrojových** a **12 serverových unit** případů,
bez selhání a bez skip: transition/index plan a lifecycle/adoption/report provenance.
Emulátorové sady nebyly v této dokumentační části opakovány; jejich předchozí
důkazy jsou v [místních výsledcích](../../MVP_SERVER_PLAN.md#content-lifecycle-transition-preparation).
Nebyl proveden build, rollout, živá inventura, migrace ani změna dat nebo Auth.

Nejprve schválit navazující lokální změny a regresní scénáře, potom dokončit
zbývající matici writerů/čtenářů, účtových termínů, Rules/indexů a celé údržby.
Až po uzavření těchto nálezů připravit konkrétní DEV plán včetně právní verze,
kompatibilního návratu a samostatného živého souhlasu. Integrační metrika zůstává
otevřená; tento dílčí výstup nepřidává dokončovací kredit.

<a id="local-integration-results"></a>
## Společné místní dokončení integrace

**27. listopadu, feature/archive-identity-integration:** původní tři nálezy mají
implementované místní řešení. Všechny nové provozní volby zůstávají false;
právní verze je nadále 2026-07-25. Zdroj b1ed417 má
[úspěšné úplné CI 45970322486](https://github.com/MikeyBeatz/ShoutOut/actions/runs/45970322486);
živá akceptace a startovní brána nejsou místním testem nahrazené.

1. **První nový potomek:** ověřitelný aktivní pre-fence rodič se převezme v téže
   transakci jako veřejný komentář či soukromá odpověď, s původním tělem,
   SDK důkazy, termíny a zneplatněním legacy inventury. Smazaný, prošlý, částečně
   navázaný nebo účtově uzavřený rodič způsobí rollback. Platí max. 50 zdrojů /
   450 zápisů včetně archivní práce; výchozí dosavadní odmítnutí zůstává beze změny.
2. **Informování:** samostatná legal policy v klientu i serveru dovolí zveřejnit
   informaci před novým readerem. Capture/operátor vyžaduje připravenou samostatnou
   novou verzi. Současná verze ani přijetí se nemění; text kontaktového indexu
   je připraven v sedmi jazycích. Emulator-only kandidát Rules testuje stejný
   dokument přijetí a verze polí. Konkrétní veřejnou verzi/aktivaci schválit zvlášť.
3. **Kompatibilní návrat:** po odstranění textové kopie hlášení i živého rodiče
   a odpovědi čte tentýž klientský kontrakt původní podklad z archivu. Návrat
   ponechává reader, pauzuje capture a zvlášť vypíná údržbu; obyčejný starý web
   s vypnutým archivním readerem není přípustným návratem. Původní v3 účtový běh
   pokračuje s týmž původním termínem. Podepsaný Android/iOS release se netvrdí.

[Rozšířený soukromý index a jeho meze](ARCHIVE_IDENTITY_LOOKUP.md#místní-implementace-a-ověřené-meze)
mají vlastní serverové/klientské testy. Chybějící stará autorova inkarnace se
nevymýšlí; před aktivací vyžaduje konkrétní plán počátečního pokrytí.

### Matice writerů a čtenářů

| Cesta | Vazba při zapnutí | Kontrolní důkaz |
| --- | --- | --- |
| Nový Shout / veřejný komentář | společný runtime, čerstvý Auth důkaz, atomický archiv i index | archive_identity / lifecycle / runtime integrační sady |
| Nová soukromá odpověď | stejný lifecycle runtime a důkaz, privátní archive body | archive_identity a staging sady |
| První potomek starého rodiče | inline převzetí nebo úplné odmítnutí, posun legacyRevision | content_lifecycle_staging.integration.test.js |
| Palce, záložky, počty | žádné nové tělo při pouhé změně počtu; zachované veřejné projekce | lifecycle a runtime sady |
| Vlastní odstranění / veřejná a soukromá moderace / postih | stejný transakční runtime, archivní stav a původní termín | lifecycle + moderační sady v úplném CI |
| Hlášení / převod textových kopií | přesná verze a vlákno, default preserve; scrub pouze kompatibilním readerům | report adoption / compatibility / staging |
| Expirace / běžný purge | společný runtime a oddělená maintenance volba | content_lifecycle_runtime.integration.test.js |
| Účtová archivace / staré v3 joby / konečný purge | původní inkarnace žádosti; nové identity fáze pouze na konci | staging + account_purge.integration.test.js |
| Opravné a historické seed nástroje | stávající transakční managed-feed ochrany; žádný nový obtok | původní R6b testy v úplném CI |
| Vlastní/Mé/Business/Home/regionální moderace | dosavadní lifecycle source reader a read-only historie | sources + klientské sady |
| Konkrétní nahlášený obsah po smazání zdroje | archive reader se zachovanou rolí/geografií i při pauze | staging / evidence sady |
| Obecné kontaktní hledání a veřejný archiv | pouze 5/6, nejvýše 50, audit, žádný privateReply browse | archive_identity / Rules / klientské sady |

Příslušné zdroje jsou v [hlavním implementačním přehledu](../../MVP_SERVER_PLAN.md#archive-identity-local-integration).
Matice rozlišuje přímý nový test od následné úplné regrese; sama není důkazem
skutečného nasazení nebo fyzického mobilního testu.
