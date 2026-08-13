import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/auth_gate.dart';

void main() {
  final now = DateTime.utc(2026, 8, 13, 20);

  test('permanent ban is always active', () {
    expect(isAccountBanActive({'permanent': true}, now), isTrue);
    expect(isAccountBanActive({'expiresAt': null}, now), isTrue);
  });

  test('temporary ban is active only before its expiry', () {
    expect(
      isAccountBanActive({
        'permanent': false,
        'expiresAt': Timestamp.fromDate(now.add(const Duration(minutes: 1))),
      }, now),
      isTrue,
    );
    expect(
      isAccountBanActive({
        'permanent': false,
        'expiresAt': Timestamp.fromDate(now),
      }, now),
      isFalse,
    );
  });

  test('invalid expiry value does not lock the account', () {
    expect(isAccountBanActive({'expiresAt': 'invalid'}, now), isFalse);
  });
}
