/// Inactive wording; activation and its public version require a separate decision.
String archiveIdentityDisclosure(String language) => switch (language) {
  'en' =>
    'We retain proven links between verified contacts and account incarnations until the applicable account deletion deadline. Only administrators and the owner may use an exact contact to find retained accounts and their public-content archive. Access is audited. This does not provide general access to private conversations and cannot restore deleted data or contact history that was never captured.',
  'de' =>
    'Nachgewiesene Verknüpfungen zwischen bestätigten Kontaktdaten und Konten werden bis zur geltenden Kontolöschfrist aufbewahrt. Nur Administratoren und der Eigentümer dürfen über einen genauen Kontakt erhaltene Konten und deren Archiv öffentlicher Inhalte suchen. Zugriffe werden protokolliert. Dies gewährt keinen allgemeinen Zugang zu privaten Unterhaltungen und stellt gelöschte Daten oder nie erfasste Kontaktverläufe nicht wieder her.',
  'pl' =>
    'Udokumentowane powiązania zweryfikowanych kontaktów z kontami przechowujemy do obowiązującego terminu usunięcia danych konta. Tylko administratorzy i właściciel mogą wyszukiwać zachowane konta i ich archiwum treści publicznych według dokładnego kontaktu. Dostęp jest rejestrowany. Nie daje to ogólnego dostępu do rozmów prywatnych ani nie przywraca usuniętych danych lub nigdy niezapisanej historii kontaktów.',
  'sk' =>
    'Doložené väzby overených kontaktov na jednotlivé účty uchovávame do záväzného termínu odstránenia účtových údajov. Iba administrátor a vlastník môžu podľa presného kontaktu dohľadať uchované účty a ich archív verejného obsahu. Prístupy sa zaznamenávajú. Nejde o všeobecný prístup k súkromným konverzáciám a nemožno obnoviť odstránené údaje ani nezachytenú históriu kontaktov.',
  'uk' =>
    'Підтверджені зв’язки перевірених контактів з окремими обліковими записами зберігаються до обов’язкового строку видалення даних облікового запису. Лише адміністратори та власник можуть за точним контактом знаходити збережені облікові записи та їхній архів публічного вмісту. Доступ реєструється. Це не надає загального доступу до приватних розмов і не відновлює видалені дані чи історію контактів, яку ніколи не зберігали.',
  'vi' =>
    'Chúng tôi giữ các liên kết đã được chứng minh giữa thông tin liên hệ đã xác minh và từng tài khoản đến hạn xóa dữ liệu tài khoản. Chỉ quản trị viên và chủ sở hữu được tìm tài khoản còn lưu cùng kho nội dung công khai bằng thông tin liên hệ chính xác. Mọi truy cập được ghi nhận. Điều này không cho phép duyệt mọi cuộc trò chuyện riêng tư và không khôi phục dữ liệu đã xóa hoặc lịch sử liên hệ chưa từng được lưu.',
  _ =>
    'Doložené vazby ověřených kontaktů na jednotlivé účty uchováváme do závazného termínu odstranění účtových údajů. Jen administrátor a vlastník mohou podle přesného kontaktu dohledat uchované účty a jejich archiv veřejného obsahu. Přístupy se zaznamenávají. Nejde o obecný přístup k soukromým konverzacím a nelze obnovit definitivně smazané údaje ani nezachycenou historii kontaktů.',
};
