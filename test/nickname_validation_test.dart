import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/nickname_validation.dart';

void main() {
  test('accepts letters used by every supported language', () {
    for (final nickname in [
      'Česká_liška',
      'Šťastný_vĺčik',
      'Fröhlicher_Bär',
      'Żółty_jeż',
      'Đặng_Hoàng',
      'Українська_зірка',
      'English_Fox',
    ]) {
      expect(isValidNickname(nickname), isTrue, reason: nickname);
    }
  });

  test('keeps separators constrained and rejects spaces and symbols', () {
    for (final nickname in [
      'two words',
      '_leading',
      'trailing_',
      'two__parts',
      'emoji😀name',
    ]) {
      expect(isValidNickname(nickname), isFalse, reason: nickname);
    }
  });
}
