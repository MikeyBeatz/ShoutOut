import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/public_profile.dart';

void main() {
  test('public role labels preserve the approved visible hierarchy', () {
    const locale = Locale('cs');
    expect(publicRoleLabel(locale, 'business'), 'Business');
    expect(publicRoleLabel(locale, 'moderator'), 'Moderátor');
    expect(publicRoleLabel(locale, 'seniorModerator'), 'Moderátor');
    expect(publicRoleLabel(locale, 'administrator'), 'Admin');
    expect(publicRoleLabel(locale, 'owner'), 'Owner');
    expect(publicRoleLabel(locale, 'user'), isNull);
    expect(publicRoleLabel(locale, 'unknown'), isNull);
  });

  test('public role labels are localized where needed', () {
    expect(publicRoleLabel(const Locale('en'), 'owner'), 'Owner');
    expect(publicRoleLabel(const Locale('de'), 'owner'), 'Owner');
    expect(publicRoleLabel(const Locale('uk'), 'moderator'), 'Модератор');
    expect(publicRoleLabel(const Locale('vi'), 'moderator'), 'Kiểm duyệt viên');
  });
}
