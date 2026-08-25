import 'package:flutter/widgets.dart';

const bugReportTextKeys = <String>[
  'Nahlásit chybu',
  'Co se stalo?',
  'Popiš postup, očekávaný výsledek a co se zobrazilo místo něj.',
  'Přidat obrázek',
  'Odebrat obrázek',
  'Zkontroloval/a jsem, že obrázek neobsahuje hesla ani zbytečné osobní údaje.',
  'Povolené formáty: JPG, PNG a WebP. Maximum 2 MB. Hlášení a obrázek se uchovávají nejvýše 60 dní.',
  'Přiložení obrázku připravujeme. Textové hlášení můžeš odeslat už nyní.',
  'Odesílám…',
  'Odeslat hlášení',
  'Hlášení chyby bylo odesláno.',
  'Hlášení se nepodařilo odeslat.',
  'Použij obrázek JPG, PNG nebo WebP.',
  'Obrázek může mít nejvýše 2 MB.',
  'Popiš chybu alespoň 10 znaky.',
  'Před přiložením obrázku potvrď jeho obsah.',
];

String bugReportTr(BuildContext context, String czech) {
  final language = Localizations.localeOf(context).languageCode;
  return _translations[language]?[czech] ?? czech;
}

const _translations = <String, Map<String, String>>{
  'en': {
    'Nahlásit chybu': 'Report a bug',
    'Co se stalo?': 'What happened?',
    'Popiš postup, očekávaný výsledek a co se zobrazilo místo něj.':
        'Describe the steps, the expected result, and what appeared instead.',
    'Přidat obrázek': 'Add image',
    'Odebrat obrázek': 'Remove image',
    'Zkontroloval/a jsem, že obrázek neobsahuje hesla ani zbytečné osobní údaje.':
        'I checked that the image contains no passwords or unnecessary personal data.',
    'Povolené formáty: JPG, PNG a WebP. Maximum 2 MB. Hlášení a obrázek se uchovávají nejvýše 60 dní.':
        'Allowed formats: JPG, PNG, and WebP. Maximum 2 MB. The report and image are retained for up to 60 days.',
    'Přiložení obrázku připravujeme. Textové hlášení můžeš odeslat už nyní.':
        'Image attachments are coming soon. You can submit a text report now.',
    'Odesílám…': 'Sending…',
    'Odeslat hlášení': 'Submit report',
    'Hlášení chyby bylo odesláno.': 'Bug report sent.',
    'Hlášení se nepodařilo odeslat.': 'The report could not be sent.',
    'Použij obrázek JPG, PNG nebo WebP.': 'Use a JPG, PNG, or WebP image.',
    'Obrázek může mít nejvýše 2 MB.': 'The image can be at most 2 MB.',
    'Popiš chybu alespoň 10 znaky.':
        'Describe the bug using at least 10 characters.',
    'Před přiložením obrázku potvrď jeho obsah.':
        'Confirm the image contents before attaching it.',
  },
  'de': {
    'Nahlásit chybu': 'Fehler melden',
    'Co se stalo?': 'Was ist passiert?',
    'Popiš postup, očekávaný výsledek a co se zobrazilo místo něj.':
        'Beschreibe die Schritte, das erwartete Ergebnis und was stattdessen angezeigt wurde.',
    'Přidat obrázek': 'Bild hinzufügen',
    'Odebrat obrázek': 'Bild entfernen',
    'Zkontroloval/a jsem, že obrázek neobsahuje hesla ani zbytečné osobní údaje.':
        'Ich habe geprüft, dass das Bild keine Passwörter oder unnötigen personenbezogenen Daten enthält.',
    'Povolené formáty: JPG, PNG a WebP. Maximum 2 MB. Hlášení a obrázek se uchovávají nejvýše 60 dní.':
        'Erlaubte Formate: JPG, PNG und WebP. Maximal 2 MB. Meldung und Bild werden höchstens 60 Tage gespeichert.',
    'Přiložení obrázku připravujeme. Textové hlášení můžeš odeslat už nyní.':
        'Bildanhänge werden vorbereitet. Eine Textmeldung kannst du bereits senden.',
    'Odesílám…': 'Wird gesendet…',
    'Odeslat hlášení': 'Meldung senden',
    'Hlášení chyby bylo odesláno.': 'Fehlermeldung wurde gesendet.',
    'Hlášení se nepodařilo odeslat.':
        'Die Meldung konnte nicht gesendet werden.',
    'Použij obrázek JPG, PNG nebo WebP.':
        'Verwende ein Bild im Format JPG, PNG oder WebP.',
    'Obrázek může mít nejvýše 2 MB.': 'Das Bild darf höchstens 2 MB groß sein.',
    'Popiš chybu alespoň 10 znaky.':
        'Beschreibe den Fehler mit mindestens 10 Zeichen.',
    'Před přiložením obrázku potvrď jeho obsah.':
        'Bestätige vor dem Anhängen den Inhalt des Bildes.',
  },
  'pl': {
    'Nahlásit chybu': 'Zgłoś błąd',
    'Co se stalo?': 'Co się stało?',
    'Popiš postup, očekávaný výsledek a co se zobrazilo místo něj.':
        'Opisz kroki, oczekiwany wynik i to, co pojawiło się zamiast niego.',
    'Přidat obrázek': 'Dodaj obraz',
    'Odebrat obrázek': 'Usuń obraz',
    'Zkontroloval/a jsem, že obrázek neobsahuje hesla ani zbytečné osobní údaje.':
        'Potwierdzam, że obraz nie zawiera haseł ani zbędnych danych osobowych.',
    'Povolené formáty: JPG, PNG a WebP. Maximum 2 MB. Hlášení a obrázek se uchovávají nejvýše 60 dní.':
        'Dozwolone formaty: JPG, PNG i WebP. Maksymalnie 2 MB. Zgłoszenie i obraz są przechowywane do 60 dni.',
    'Přiložení obrázku připravujeme. Textové hlášení můžeš odeslat už nyní.':
        'Załączniki graficzne są w przygotowaniu. Już teraz możesz wysłać zgłoszenie tekstowe.',
    'Odesílám…': 'Wysyłanie…',
    'Odeslat hlášení': 'Wyślij zgłoszenie',
    'Hlášení chyby bylo odesláno.': 'Zgłoszenie błędu zostało wysłane.',
    'Hlášení se nepodařilo odeslat.': 'Nie udało się wysłać zgłoszenia.',
    'Použij obrázek JPG, PNG nebo WebP.':
        'Użyj obrazu w formacie JPG, PNG lub WebP.',
    'Obrázek může mít nejvýše 2 MB.': 'Obraz może mieć maksymalnie 2 MB.',
    'Popiš chybu alespoň 10 znaky.': 'Opisz błąd co najmniej 10 znakami.',
    'Před přiložením obrázku potvrď jeho obsah.':
        'Przed załączeniem potwierdź zawartość obrazu.',
  },
  'sk': {
    'Nahlásit chybu': 'Nahlásiť chybu',
    'Co se stalo?': 'Čo sa stalo?',
    'Popiš postup, očekávaný výsledek a co se zobrazilo místo něj.':
        'Opíš postup, očakávaný výsledok a čo sa zobrazilo namiesto neho.',
    'Přidat obrázek': 'Pridať obrázok',
    'Odebrat obrázek': 'Odstrániť obrázok',
    'Zkontroloval/a jsem, že obrázek neobsahuje hesla ani zbytečné osobní údaje.':
        'Skontroloval/a som, že obrázok neobsahuje heslá ani zbytočné osobné údaje.',
    'Povolené formáty: JPG, PNG a WebP. Maximum 2 MB. Hlášení a obrázek se uchovávají nejvýše 60 dní.':
        'Povolené formáty: JPG, PNG a WebP. Maximum 2 MB. Hlásenie a obrázok sa uchovávajú najviac 60 dní.',
    'Přiložení obrázku připravujeme. Textové hlášení můžeš odeslat už nyní.':
        'Priloženie obrázka pripravujeme. Textové hlásenie môžeš odoslať už teraz.',
    'Odesílám…': 'Odosielam…',
    'Odeslat hlášení': 'Odoslať hlásenie',
    'Hlášení chyby bylo odesláno.': 'Hlásenie chyby bolo odoslané.',
    'Hlášení se nepodařilo odeslat.': 'Hlásenie sa nepodarilo odoslať.',
    'Použij obrázek JPG, PNG nebo WebP.': 'Použi obrázok JPG, PNG alebo WebP.',
    'Obrázek může mít nejvýše 2 MB.': 'Obrázok môže mať najviac 2 MB.',
    'Popiš chybu alespoň 10 znaky.': 'Opíš chybu aspoň 10 znakmi.',
    'Před přiložením obrázku potvrď jeho obsah.':
        'Pred priložením obrázka potvrď jeho obsah.',
  },
  'uk': {
    'Nahlásit chybu': 'Повідомити про помилку',
    'Co se stalo?': 'Що сталося?',
    'Popiš postup, očekávaný výsledek a co se zobrazilo místo něj.':
        'Опишіть кроки, очікуваний результат і те, що відобразилося натомість.',
    'Přidat obrázek': 'Додати зображення',
    'Odebrat obrázek': 'Видалити зображення',
    'Zkontroloval/a jsem, že obrázek neobsahuje hesla ani zbytečné osobní údaje.':
        'Я перевірив(-ла), що зображення не містить паролів або зайвих персональних даних.',
    'Povolené formáty: JPG, PNG a WebP. Maximum 2 MB. Hlášení a obrázek se uchovávají nejvýše 60 dní.':
        'Дозволені формати: JPG, PNG і WebP. Максимум 2 МБ. Звіт і зображення зберігаються до 60 днів.',
    'Přiložení obrázku připravujeme. Textové hlášení můžeš odeslat už nyní.':
        'Додавання зображень готується. Текстовий звіт можна надіслати вже зараз.',
    'Odesílám…': 'Надсилання…',
    'Odeslat hlášení': 'Надіслати звіт',
    'Hlášení chyby bylo odesláno.': 'Звіт про помилку надіслано.',
    'Hlášení se nepodařilo odeslat.': 'Не вдалося надіслати звіт.',
    'Použij obrázek JPG, PNG nebo WebP.':
        'Використайте зображення JPG, PNG або WebP.',
    'Obrázek může mít nejvýše 2 MB.':
        'Розмір зображення не може перевищувати 2 МБ.',
    'Popiš chybu alespoň 10 znaky.': 'Опишіть помилку щонайменше 10 символами.',
    'Před přiložením obrázku potvrď jeho obsah.':
        'Підтвердьте вміст зображення перед додаванням.',
  },
  'vi': {
    'Nahlásit chybu': 'Báo cáo lỗi',
    'Co se stalo?': 'Đã xảy ra chuyện gì?',
    'Popiš postup, očekávaný výsledek a co se zobrazilo místo něj.':
        'Mô tả các bước, kết quả mong đợi và nội dung đã xuất hiện thay thế.',
    'Přidat obrázek': 'Thêm hình ảnh',
    'Odebrat obrázek': 'Xóa hình ảnh',
    'Zkontroloval/a jsem, že obrázek neobsahuje hesla ani zbytečné osobní údaje.':
        'Tôi đã kiểm tra rằng hình ảnh không chứa mật khẩu hoặc dữ liệu cá nhân không cần thiết.',
    'Povolené formáty: JPG, PNG a WebP. Maximum 2 MB. Hlášení a obrázek se uchovávají nejvýše 60 dní.':
        'Định dạng cho phép: JPG, PNG và WebP. Tối đa 2 MB. Báo cáo và hình ảnh được lưu giữ tối đa 60 ngày.',
    'Přiložení obrázku připravujeme. Textové hlášení můžeš odeslat už nyní.':
        'Tính năng đính kèm hình ảnh đang được chuẩn bị. Bạn có thể gửi báo cáo bằng văn bản ngay bây giờ.',
    'Odesílám…': 'Đang gửi…',
    'Odeslat hlášení': 'Gửi báo cáo',
    'Hlášení chyby bylo odesláno.': 'Đã gửi báo cáo lỗi.',
    'Hlášení se nepodařilo odeslat.': 'Không thể gửi báo cáo.',
    'Použij obrázek JPG, PNG nebo WebP.':
        'Hãy dùng hình ảnh JPG, PNG hoặc WebP.',
    'Obrázek může mít nejvýše 2 MB.': 'Hình ảnh không được vượt quá 2 MB.',
    'Popiš chybu alespoň 10 znaky.': 'Hãy mô tả lỗi bằng ít nhất 10 ký tự.',
    'Před přiložením obrázku potvrď jeho obsah.':
        'Hãy xác nhận nội dung hình ảnh trước khi đính kèm.',
  },
};
