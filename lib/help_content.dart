import 'package:flutter/widgets.dart';

class HelpTopic {
  const HelpTopic(this.title, this.body);

  final String title;
  final String body;
}

List<HelpTopic> helpTopics(BuildContext context) =>
    switch (Localizations.localeOf(context).languageCode) {
      'en' => _en,
      'de' => _de,
      'pl' => _pl,
      'sk' => _sk,
      'uk' => _uk,
      'vi' => _vi,
      _ => _cs,
    };

const _cs = <HelpTopic>[
  HelpTopic(
    'Poloha a soukromí',
    'ShoutOut používá polohu zařízení k zobrazení obsahu v okolí a při publikování běžného Shoutu. Ostatním ukazuje vzdálenost, ne přesný bod autora, a nevytváří historii tvého pohybu. Bez povolení polohy můžeš aplikaci procházet, ale některé místní funkce nebudou dostupné.',
  ),
  HelpTopic(
    'Feed, filtry a řazení',
    'Ve feedu můžeš měnit vzdálenost, kategorii a pořadí Shoutů. Řazení Nejblíž pracuje se vzdáleností, Top zohledňuje reakce a Končící zvýrazní obsah před expirací. Vybraný filtr zůstane zachovaný při přepínání karet během aktuálního spuštění aplikace.',
  ),
  HelpTopic(
    'Vytvoření Shoutu',
    'Zadej nadpis, text, kategorii a dobu platnosti. Běžný Shout se publikuje z aktuální polohy zařízení; Business účet vybírá ověřenou pobočku. Pokud publikování selže, formulář zůstane otevřený a zobrazí konkrétní příčinu, například chybějící polohu nebo časový limit.',
  ),
  HelpTopic(
    'Reakce, komentáře a odpovědi',
    'Shouty a komentáře můžeš hodnotit, komentovat a otevřít v detailu. Veřejná odpověď je viditelná ve vlákně, zatímco soukromou odpověď vidí jen její účastníci. Reakci lze změnit nebo odebrat a počty se aktualizují napříč aplikací.',
  ),
  HelpTopic(
    'Sledování a uložený obsah',
    'Profil můžeš sledovat a jeho místní Shouty se pak ve feedu zobrazí před ostatními. Karta Sledované obsahuje uložené Shouty i sledované profily. Zablokování autora současně ukončí jeho sledování a skryje jeho obsah z tvých běžných přehledů.',
  ),
  HelpTopic(
    'Bezpečnost účtu',
    'Používej unikátní heslo a nikomu neposílej ověřovací odkazy ani přihlašovací údaje. Heslo změníš v Upravit profil; zapomenuté heslo obnovíš z přihlašovací obrazovky. Změnu e-mailu nebo podezřelé chování řeš přes podporu a chybu aplikace nahlaš samostatnou dlaždicí v profilu.',
  ),
  HelpTopic(
    'Hlášení, blokace a pravidla',
    'Nevhodný Shout, komentář nebo účet můžeš nahlásit z jeho nabídky a autora můžeš zablokovat. Hlášení posuzuje moderace podle pravidel komunity; samotné nahlášení automaticky neznamená trest. Bezprostřední nebezpečí řeš s místními záchrannými složkami, ne pouze přes aplikaci.',
  ),
  HelpTopic(
    'Business účet',
    'Business účet publikuje za ověřenou pobočku, spravuje firemní údaje a může používat delší platnost Shoutu. Některé propagační funkce budou nejprve zdarma a později mohou používat tokeny. Vlastní logo je připravené, ale jeho trvalé nahrání se zpřístupní až po bezpečném zapnutí úložiště.',
  ),
];

const _en = <HelpTopic>[
  HelpTopic(
    'Location and privacy',
    'ShoutOut uses your device location to show nearby content and publish a regular Shout. Other people see a distance, not the author’s exact point, and the app does not build a movement history. You can browse without location permission, but some local features will be unavailable.',
  ),
  HelpTopic(
    'Feed, filters and sorting',
    'In the feed you can change the distance, category and Shout order. Nearby uses distance, Top considers reactions and Ending highlights content before it expires. Your selected filter remains while you switch tabs during the current app session.',
  ),
  HelpTopic(
    'Creating a Shout',
    'Enter a title, text, category and duration. A regular Shout uses the device’s current location; a Business account selects a verified branch. If publishing fails, the form stays open and shows a specific cause such as missing location or a rate limit.',
  ),
  HelpTopic(
    'Reactions, comments and replies',
    'You can rate and comment on Shouts and comments and open them in detail. A public reply is visible in the thread, while a private reply is visible only to its participants. Reactions can be changed or removed and counts update across the app.',
  ),
  HelpTopic(
    'Following and saved content',
    'You can follow a profile so its local Shouts appear before others in your feed. The Following tab contains both saved Shouts and followed profiles. Blocking an author also unfollows them and hides their content from your regular views.',
  ),
  HelpTopic(
    'Account security',
    'Use a unique password and never share verification links or sign-in details. Change your password under Edit profile or reset a forgotten password from the sign-in screen. Contact support about email changes or suspicious activity and use the separate profile tile to report an app bug.',
  ),
  HelpTopic(
    'Reports, blocking and rules',
    'You can report an inappropriate Shout, comment or account from its menu and block its author. Moderators review reports under the community rules; a report does not automatically cause a penalty. Contact local emergency services for immediate danger instead of relying only on the app.',
  ),
  HelpTopic(
    'Business account',
    'A Business account publishes for a verified branch, manages company details and can use a longer Shout duration. Some promotion features will initially be free and may later use tokens. Custom logo editing is ready, but persistent upload will appear only after storage is enabled securely.',
  ),
];

const _de = <HelpTopic>[
  HelpTopic(
    'Standort und Datenschutz',
    'ShoutOut nutzt den Gerätestandort, um Inhalte in der Nähe anzuzeigen und einen normalen Shout zu veröffentlichen. Andere sehen eine Entfernung, nicht den genauen Punkt des Autors; ein Bewegungsprofil wird nicht erstellt. Ohne Standortfreigabe kannst du die App ansehen, einige lokale Funktionen fehlen jedoch.',
  ),
  HelpTopic(
    'Feed, Filter und Sortierung',
    'Im Feed kannst du Entfernung, Kategorie und Reihenfolge ändern. Nähe nutzt die Distanz, Top berücksichtigt Reaktionen und Endet hebt bald ablaufende Inhalte hervor. Der gewählte Filter bleibt beim Wechseln der Tabs während der aktuellen Sitzung erhalten.',
  ),
  HelpTopic(
    'Einen Shout erstellen',
    'Gib Titel, Text, Kategorie und Laufzeit ein. Ein normaler Shout nutzt den aktuellen Gerätestandort; ein Business-Konto wählt eine bestätigte Filiale. Bei einem Fehler bleibt das Formular geöffnet und zeigt den konkreten Grund, etwa fehlenden Standort oder ein Zeitlimit.',
  ),
  HelpTopic(
    'Reaktionen, Kommentare und Antworten',
    'Shouts und Kommentare können bewertet, kommentiert und im Detail geöffnet werden. Öffentliche Antworten stehen im Thread, private Antworten sehen nur die Beteiligten. Reaktionen lassen sich ändern oder entfernen; die Zahlen werden überall aktualisiert.',
  ),
  HelpTopic(
    'Folgen und gespeicherte Inhalte',
    'Du kannst einem Profil folgen, damit seine lokalen Shouts im Feed weiter oben erscheinen. Der Bereich Gefolgt enthält gespeicherte Shouts und gefolgte Profile. Beim Blockieren wird das Profil zugleich entfolgt und sein Inhalt ausgeblendet.',
  ),
  HelpTopic(
    'Kontosicherheit',
    'Nutze ein einmaliges Passwort und teile niemals Bestätigungslinks oder Anmeldedaten. Das Passwort änderst du unter Profil bearbeiten oder setzt es auf der Anmeldeseite zurück. Wende dich bei verdächtigen Vorgängen an den Support und melde App-Fehler über die eigene Profil-Kachel.',
  ),
  HelpTopic(
    'Meldungen, Blockieren und Regeln',
    'Ungeeignete Shouts, Kommentare oder Konten kannst du über ihr Menü melden und den Autor blockieren. Die Moderation prüft Meldungen nach den Community-Regeln; eine Meldung führt nicht automatisch zu einer Strafe. Bei unmittelbarer Gefahr kontaktiere die örtlichen Notdienste.',
  ),
  HelpTopic(
    'Business-Konto',
    'Ein Business-Konto veröffentlicht für eine bestätigte Filiale, verwaltet Firmendaten und kann längere Shout-Laufzeiten nutzen. Einige Werbefunktionen starten kostenlos und können später Token verwenden. Der Logo-Editor ist bereit; dauerhaftes Hochladen folgt nach sicherer Aktivierung des Speichers.',
  ),
];

const _pl = <HelpTopic>[
  HelpTopic(
    'Lokalizacja i prywatność',
    'ShoutOut używa lokalizacji urządzenia do pokazywania treści w pobliżu i publikowania zwykłego Shoutu. Inni widzą odległość, a nie dokładny punkt autora; aplikacja nie tworzy historii ruchu. Bez zgody na lokalizację można przeglądać aplikację, lecz część funkcji lokalnych będzie niedostępna.',
  ),
  HelpTopic(
    'Feed, filtry i sortowanie',
    'W feedzie możesz zmienić odległość, kategorię i kolejność Shoutów. Blisko korzysta z odległości, Top uwzględnia reakcje, a Koniec wyróżnia treści przed wygaśnięciem. Wybrany filtr pozostaje podczas przełączania kart w bieżącej sesji.',
  ),
  HelpTopic(
    'Tworzenie Shoutu',
    'Wpisz tytuł, tekst, kategorię i czas trwania. Zwykły Shout używa bieżącej lokalizacji urządzenia, a konto Business wybiera zweryfikowany oddział. Po błędzie formularz pozostaje otwarty i pokazuje konkretną przyczynę, np. brak lokalizacji lub limit czasu.',
  ),
  HelpTopic(
    'Reakcje, komentarze i odpowiedzi',
    'Shouty i komentarze można oceniać, komentować i otwierać w szczegółach. Publiczna odpowiedź jest widoczna w wątku, a prywatna tylko dla uczestników. Reakcję można zmienić lub usunąć, a liczniki aktualizują się w całej aplikacji.',
  ),
  HelpTopic(
    'Obserwowanie i zapisane treści',
    'Możesz obserwować profil, aby jego lokalne Shouty pojawiały się wyżej w feedzie. Karta Obserwowane zawiera zapisane Shouty i obserwowane profile. Zablokowanie autora kończy obserwowanie i ukrywa jego treści.',
  ),
  HelpTopic(
    'Bezpieczeństwo konta',
    'Używaj unikalnego hasła i nie udostępniaj linków weryfikacyjnych ani danych logowania. Hasło zmienisz w Edytuj profil, a zapomniane zresetujesz na ekranie logowania. Podejrzaną aktywność zgłoś wsparciu, a błąd aplikacji przez osobny kafelek profilu.',
  ),
  HelpTopic(
    'Zgłoszenia, blokowanie i zasady',
    'Niewłaściwy Shout, komentarz lub konto możesz zgłosić z menu i zablokować autora. Moderacja ocenia zgłoszenia według zasad społeczności; samo zgłoszenie nie oznacza automatycznej kary. W razie bezpośredniego zagrożenia skontaktuj się z lokalnymi służbami.',
  ),
  HelpTopic(
    'Konto Business',
    'Konto Business publikuje dla zweryfikowanego oddziału, zarządza danymi firmy i może używać dłuższego czasu Shoutu. Część promocji będzie początkowo bezpłatna, a później może używać tokenów. Edytor logo jest gotowy, lecz trwałe przesyłanie wymaga bezpiecznego uruchomienia pamięci.',
  ),
];

const _sk = <HelpTopic>[
  HelpTopic(
    'Poloha a súkromie',
    'ShoutOut používa polohu zariadenia na zobrazenie obsahu v okolí a publikovanie bežného Shoutu. Ostatní vidia vzdialenosť, nie presný bod autora, a aplikácia nevytvára históriu pohybu. Bez povolenia polohy môžeš aplikáciu prezerať, niektoré miestne funkcie však nebudú dostupné.',
  ),
  HelpTopic(
    'Feed, filtre a radenie',
    'Vo feede môžeš meniť vzdialenosť, kategóriu a poradie Shoutov. Blízko používa vzdialenosť, Top zohľadňuje reakcie a Končí zvýrazní obsah pred vypršaním. Vybraný filter zostane pri prepínaní kariet počas aktuálnej relácie.',
  ),
  HelpTopic(
    'Vytvorenie Shoutu',
    'Zadaj nadpis, text, kategóriu a dobu platnosti. Bežný Shout používa aktuálnu polohu zariadenia; Business účet vyberá overenú pobočku. Pri chybe zostane formulár otvorený a zobrazí konkrétnu príčinu, napríklad chýbajúcu polohu alebo časový limit.',
  ),
  HelpTopic(
    'Reakcie, komentáre a odpovede',
    'Shouty a komentáre môžeš hodnotiť, komentovať a otvoriť v detaile. Verejná odpoveď je vo vlákne, súkromnú vidia iba účastníci. Reakciu možno zmeniť alebo odobrať a počty sa aktualizujú v celej aplikácii.',
  ),
  HelpTopic(
    'Sledovanie a uložený obsah',
    'Profil môžeš sledovať, aby sa jeho miestne Shouty zobrazili vo feede vyššie. Karta Sledované obsahuje uložené Shouty aj sledované profily. Zablokovanie autora zároveň ukončí sledovanie a skryje jeho obsah.',
  ),
  HelpTopic(
    'Bezpečnosť účtu',
    'Používaj jedinečné heslo a nezdieľaj overovacie odkazy ani prihlasovacie údaje. Heslo zmeníš v Upraviť profil alebo ho obnovíš na prihlasovacej obrazovke. Podozrivú aktivitu rieš s podporou a chybu aplikácie nahlás samostatnou dlaždicou profilu.',
  ),
  HelpTopic(
    'Hlásenia, blokovanie a pravidlá',
    'Nevhodný Shout, komentár alebo účet môžeš nahlásiť z ponuky a autora zablokovať. Moderácia posudzuje hlásenia podľa pravidiel komunity; samotné hlásenie automaticky neznamená trest. Pri bezprostrednom nebezpečenstve kontaktuj miestne záchranné zložky.',
  ),
  HelpTopic(
    'Business účet',
    'Business účet publikuje za overenú pobočku, spravuje firemné údaje a môže používať dlhšiu platnosť Shoutu. Niektoré propagačné funkcie budú najprv zdarma a neskôr môžu používať tokeny. Editor loga je pripravený, trvalé nahratie však čaká na bezpečné zapnutie úložiska.',
  ),
];

const _uk = <HelpTopic>[
  HelpTopic(
    'Місцезнаходження та приватність',
    'ShoutOut використовує місцезнаходження пристрою, щоб показувати дописи поблизу та публікувати звичайний Shout. Інші бачать відстань, а не точну точку автора; історія пересувань не створюється. Без дозволу можна переглядати застосунок, але частина локальних функцій буде недоступна.',
  ),
  HelpTopic(
    'Стрічка, фільтри та сортування',
    'У стрічці можна змінити відстань, категорію та порядок Shout. Поруч використовує відстань, Топ враховує реакції, а Завершується виділяє дописи перед закінченням. Вибраний фільтр зберігається під час перемикання вкладок у поточному сеансі.',
  ),
  HelpTopic(
    'Створення Shout',
    'Введіть заголовок, текст, категорію та тривалість. Звичайний Shout використовує поточне місцезнаходження пристрою, а бізнес-акаунт обирає перевірену філію. У разі помилки форма залишається відкритою та показує конкретну причину.',
  ),
  HelpTopic(
    'Реакції, коментарі та відповіді',
    'Shout і коментарі можна оцінювати, коментувати та відкривати докладно. Публічну відповідь видно у гілці, приватну — лише її учасникам. Реакцію можна змінити або видалити, а лічильники оновлюються в усьому застосунку.',
  ),
  HelpTopic(
    'Стеження та збережений вміст',
    'Можна стежити за профілем, щоб його місцеві Shout з’являлися вище у стрічці. Вкладка Стеження містить збережені Shout і профілі. Блокування автора також припиняє стеження та приховує його вміст.',
  ),
  HelpTopic(
    'Безпека акаунта',
    'Використовуйте унікальний пароль і не передавайте посилання підтвердження чи дані входу. Пароль змінюється в Редагувати профіль або відновлюється на екрані входу. Про підозрілу активність повідомте підтримку, а про помилку застосунку — окремою плиткою профілю.',
  ),
  HelpTopic(
    'Скарги, блокування та правила',
    'Неприйнятний Shout, коментар або акаунт можна поскаржити через меню та заблокувати автора. Модерація розглядає скарги за правилами спільноти; скарга не означає автоматичного покарання. У разі негайної небезпеки звертайтеся до місцевих екстрених служб.',
  ),
  HelpTopic(
    'Бізнес-акаунт',
    'Бізнес-акаунт публікує від перевіреної філії, керує даними компанії та може подовжувати Shout. Деякі функції просування спочатку будуть безкоштовними, а пізніше можуть використовувати токени. Редактор логотипа готовий, але постійне завантаження потребує безпечного сховища.',
  ),
];

const _vi = <HelpTopic>[
  HelpTopic(
    'Vị trí và quyền riêng tư',
    'ShoutOut dùng vị trí thiết bị để hiển thị nội dung gần bạn và đăng Shout thông thường. Người khác chỉ thấy khoảng cách, không thấy điểm chính xác của tác giả; ứng dụng không tạo lịch sử di chuyển. Bạn vẫn có thể xem ứng dụng khi không cấp quyền, nhưng một số tính năng địa phương sẽ không dùng được.',
  ),
  HelpTopic(
    'Bảng tin, bộ lọc và sắp xếp',
    'Trong bảng tin, bạn có thể đổi khoảng cách, danh mục và thứ tự Shout. Gần dùng khoảng cách, Top xét phản ứng và Sắp hết làm nổi bật nội dung sắp hết hạn. Bộ lọc đã chọn được giữ khi chuyển tab trong phiên hiện tại.',
  ),
  HelpTopic(
    'Tạo Shout',
    'Nhập tiêu đề, nội dung, danh mục và thời hạn. Shout thông thường dùng vị trí hiện tại của thiết bị; tài khoản doanh nghiệp chọn chi nhánh đã xác minh. Nếu đăng thất bại, biểu mẫu vẫn mở và hiển thị nguyên nhân cụ thể như thiếu vị trí hoặc giới hạn tần suất.',
  ),
  HelpTopic(
    'Phản ứng, bình luận và trả lời',
    'Bạn có thể đánh giá, bình luận và mở chi tiết Shout hoặc bình luận. Trả lời công khai xuất hiện trong luồng, còn trả lời riêng chỉ người tham gia thấy. Phản ứng có thể đổi hoặc xóa và số liệu được cập nhật trong toàn ứng dụng.',
  ),
  HelpTopic(
    'Theo dõi và nội dung đã lưu',
    'Bạn có thể theo dõi hồ sơ để Shout địa phương của họ xuất hiện trước trong bảng tin. Tab Theo dõi chứa cả Shout đã lưu và hồ sơ đang theo dõi. Chặn tác giả cũng hủy theo dõi và ẩn nội dung của họ.',
  ),
  HelpTopic(
    'Bảo mật tài khoản',
    'Hãy dùng mật khẩu riêng và không chia sẻ liên kết xác minh hay thông tin đăng nhập. Đổi mật khẩu trong Chỉnh sửa hồ sơ hoặc đặt lại từ màn hình đăng nhập. Liên hệ hỗ trợ khi có hoạt động đáng ngờ và báo lỗi ứng dụng bằng ô riêng trong hồ sơ.',
  ),
  HelpTopic(
    'Báo cáo, chặn và quy tắc',
    'Bạn có thể báo cáo Shout, bình luận hoặc tài khoản không phù hợp từ menu và chặn tác giả. Nhóm kiểm duyệt xem xét theo quy tắc cộng đồng; báo cáo không tự động dẫn đến hình phạt. Khi có nguy hiểm tức thời, hãy liên hệ dịch vụ khẩn cấp địa phương.',
  ),
  HelpTopic(
    'Tài khoản doanh nghiệp',
    'Tài khoản doanh nghiệp đăng cho chi nhánh đã xác minh, quản lý thông tin công ty và có thể dùng thời hạn Shout dài hơn. Một số tính năng quảng bá ban đầu miễn phí và sau này có thể dùng token. Trình chỉnh sửa logo đã sẵn sàng, nhưng tải lên lâu dài cần kho lưu trữ an toàn.',
  ),
];
