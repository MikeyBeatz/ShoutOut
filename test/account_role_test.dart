import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/account_role.dart';

void main() {
  test('account roles preserve the approved hierarchy', () {
    expect(AccountRole.user.level, 1);
    expect(AccountRole.business.level, 2);
    expect(AccountRole.moderator.level, 3);
    expect(AccountRole.seniorModerator.level, 4);
    expect(AccountRole.administrator.level, 5);
    expect(AccountRole.owner.level, 6);
  });

  test('role documents can be parsed by role name or level', () {
    expect(
      AccountRole.fromData({'role': 'business', 'level': 2}),
      AccountRole.business,
    );
    expect(AccountRole.fromData({'level': 5}), AccountRole.administrator);
    expect(AccountRole.fromData(null), AccountRole.user);
  });

  test('higher staff roles inherit lower staff capabilities', () {
    expect(
      AccountRole.seniorModerator.isAtLeast(AccountRole.moderator),
      isTrue,
    );
    expect(AccountRole.business.isAtLeast(AccountRole.moderator), isFalse);
  });
}
