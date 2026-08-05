enum AccountRole {
  user(1, 'user'),
  business(2, 'business'),
  moderator(3, 'moderator'),
  seniorModerator(4, 'seniorModerator'),
  administrator(5, 'administrator'),
  owner(6, 'owner');

  const AccountRole(this.level, this.storageValue);

  final int level;
  final String storageValue;

  bool isAtLeast(AccountRole minimum) => level >= minimum.level;

  static AccountRole fromData(Map<String, dynamic>? data) {
    final value = data?['role'];
    final level = data?['level'];
    for (final role in values) {
      if (value == role.storageValue || level == role.level) return role;
    }
    return AccountRole.user;
  }
}
