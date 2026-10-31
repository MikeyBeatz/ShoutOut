# Dokončení mazání účtu – rozhodnutí, ochrany a pořadí

31. října 2026. Navazuje na [živě ověřený DEV pilot](ACCOUNT_DELETION_DEV_PROPOSAL.md)
a [kritéria účtového milníku](MVP_SERVER_PLAN.md#account-deletion).
Zdrojem deklarované retence je také `lib/legal.dart`, česká sekce
„Uložení a doba uchování“: skrytí veřejného obsahu a potřebné bezpečnostní údaje
60 dní; nejde o povolení uchovat bez rozlišení všechny preference či cizí obsah.

## Rozhodnutí vlastníka 31. října

- **Aktuální přezdívku rezervovat do konce stávající 60denní lhůty a pak uvolnit.**
  Použít serverový deadline žádosti, který už používá DEV job (createTime + 60 dní).
  Uvolnění smí odstranit pouze rezervaci stále vlastněnou původním UID.
  Není to souhlas měnit politiku obyčejného přejmenování nebo rezervovat cizí aliasy.
- **Soukromé zprávy po smazání účtu skrýt oběma účastníkům a následně dočistit.**
  Potřebné podklady hlášení mají být pouze v interní retenční části.
  Samotné schválení ještě neznamená, že jsou staré zprávy přemístěné či skryté.

## Stav a návaznosti

| Úsek | Stav | Kritérium uzavření |
|---|---|---|
| Skrytí vlastních Shoutů a trvalý průběh | DEV hotovo, pilot 3/3 | Důkazy v předchozím dokumentu. |
| Zastavení nových serverových oznámení/zpráv pro mazající se účet | Připravené v tomto úseku | Čtyři Functions, transakční kontrola příjemce, CI a cílený DEV rollout. |
| Vlastní nepotřebné soukromé podkolekce | Emulátorový prototyp, nelze spustit živě | Rozšířit stavový automat jobu, ověřit všechny příchozí zapisovače a samostatně schválit datový test. |
| Soukromé zprávy a veřejné komentáře účtu | Rozhodnutý směr, implementace zbývá | Bezpečný interní archiv/skrytí, přesné počty, hlášení a test obou účastníků. |
| Identita, rezervace přezdívky a zbývající osobní data | Částečně rozhodnuto, implementace zbývá | Minimální retenční údaje, správné odkazy/fallbacky, uvolnění pouze vlastní rezervace po lhůtě. |
| Konečný 60denní úklid | Zbývá | Opakovatelný běh včetně podkolekcí a Storage, vypořádání hlášení/holdů, audit a test přesné hranice. |
| Klient a uzavření přímých zápisů | Zbývá | Nový tok od začátku do konce, ověření přerušené sítě, teprve pak Rules cutover. |

## Ochrana příjemce

`functions/notification_recipient.js` čte v téže transakci existenci profilu,
existenci accountDeletionRequests a nastavení oznámení. Jakákoli žádost znamená
nedostupný účet, stejně jako u vlastní eligibility. Chybějící profil také
nesmí vést k vytvoření nové osiřelé schránky po skončení retence.

- createComment zachová veřejný komentář a čítač; přeskočí jen nedostupné příjemce.
  Druhý aktivní příjemce veřejné odpovědi dostane své oznámení dál.
- toggleShoutReaction/toggleCommentReaction zachovají reakci, čítače, limity a receipt;
  nedostupnému autorovi nevytvoří ani neaktualizují oznámení.
- createPrivateReply nedostupnému příjemci odmítne novou zprávu bez zápisu obsahu,
  receipt, limitu či oznámení. Již potvrzený replay nic nevytváří znovu.

Nevzniká procesová cache stavu mazání. Tím, že se příjemce čte uvnitř transakce,
vznik žádosti a oznámení mají konzistentní pořadí. Na příjemce přibývají dvě
nezbytná dokumentová čtení pro veřejná oznámení, jedno pro soukromou odpověď;
nepřidává se Auth API volání ani plošné hledání uživatelů. Jediné getAll používá
fieldMask pro nickname a tři relevantní preference; e-mail ani celý profil se
kvůli těmto kontrolám nenačítá.

Staré přímé klientské zápisy/Rules tím nejsou uzavřené. Před úplným dočištěním
je nutné pokrýt i tyto zapisovače; samotný nový serverový helper není důkazem
neexistence všech možných příchozích zápisů.

## Emulátorový soukromý úklid

`functions/account_private_cleanup_lab.js` vyžaduje shoutout-rules-test a přesný
lokální emulator host. DEV/produkci odmítá. Není součástí žádného deploy artefaktu.
Před zahájením vyžaduje shodnou pending žádost, dokončenou fázi shouts-hidden
a skutečně chybějící Auth (v emulátorovém testu simulovaný Admin Auth).

| Data | Připravený postup |
|---|---|
| users/{uid}/notifications | Odstranit vlastní schránku, nikoli oznámení jiných účtů. |
| users/{uid}/following, blocked | Odstranit vlastní seznamy, nepřepisovat cizí vazby. |
| users/{uid}/settings/notifications | Ponechat minimální pětici false jako ochranu starých klientů; absence by znamenala jejich výchozí true. |
| users/{uid}, legal, nicknames | V tomto helperu zachovat; minimalizace/retence má vlastní následující krok. |
| Ostatní kolekce, reporty a neznámá vnořená data | Bez automatického mazání tímto helperem. |

Jedna stránka vybírá nejvýše 50 dokumentů a dotazuje jen jejich reference.
Odstranění je transakční s updateTime preconditions; změna jediného kandidáta
vrátí conflict bez částečného smazání. Opakování se znovu dotáže zbývajících
dokumentů. Před smazáním odmítne neočekávané podkolekce; neznámé klíče nastavení
také zachová a předá ke kontrole. Svévolné souběžné Admin zápisy do starého UID
musí být při živém zapojení mimo tento protokol zablokované/provozně vyloučené.
Helper ještě nemá vlastní trvalý stav fáze a neprohlašuje celé smazání za hotové.

## Další větší úsek

1. Zapojit privátní fázi do verzovaného jobu se zachováním dosavadních živých
   shouts-hidden záznamů a původního requestCreateTime/retainUntil.
2. Připravit interní archiv a atomické odstranění původních soukromých zpráv,
   kde je účet jedním z účastníků; zachovat podklady reportů pouze interně.
   Nezahrnout svévolně konverzace dvou jiných lidí jen podle vlastníka Shoutu.
3. Obdobně skrýt vlastní veřejné komentáře a přesně jednou upravit commentsCount;
   samotný filtr v UI není přístupová ochrana ani odstranění podkolekcí.
4. Vyřešit veřejný profil, historické kopie jména, Business profil/logo, role a
   sociální odkazy. Nepovažovat smazání rodiče ve Firestore za smazání jeho potomků.
5. Dopsat přesný rozsah nezbytných retenčních záznamů a konečné odstranění po
   60 dnech včetně vlastnické kontroly přezdívky. Vztah k reportům a případným
   právním holdům musí být rozhodnutý, ne nahrazený novou neomezenou retencí.

Nový archiv, rozšíření živého mazání dat a další testovací Auth účty se
předkládají ke konkrétnímu schválení před živým použitím. Stávající souhlas
s prvním jednorázovým DEV Auth pilotem není neomezené povolení mazat jiné účty.
