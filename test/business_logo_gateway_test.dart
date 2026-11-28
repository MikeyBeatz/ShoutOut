import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/business_logo_gateway.dart';

void main() {
  test(
    'freezes bytes and keeps the original request after an uncertain reply',
    () async {
      final sent = <BusinessLogoRequest>[];
      var fail = true;
      final gateway = BusinessLogoGateway(
        currentUserId: () => 'a',
        newKey: () => 'key',
        send: (r) async {
          sent.add(r);
          if (fail) {
            throw FirebaseFunctionsException(
              code: 'unavailable',
              message: 'Synthetic outage',
            );
          }
        },
      );
      final bytes = Uint8List.fromList([1, 2, 3]);
      await expectLater(
        gateway.update('a', png: bytes),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      bytes[0] = 9;
      fail = false;
      await gateway.retry('a');
      expect(identical(sent[0], sent[1]), true);
      expect(sent.last.pngBase64, base64Encode([1, 2, 3]));
      expect(gateway.hasPending('a'), false);
    },
  );
  test(
    'coalesces concurrent submissions and refuses changing a pending action',
    () async {
      final barrier = Completer<void>();
      var count = 0;
      final gateway = BusinessLogoGateway(
        currentUserId: () => 'a',
        send: (_) {
          count++;
          return barrier.future;
        },
      );
      final a = gateway.update('a', png: Uint8List.fromList([1]));
      final b = gateway.update('a', png: Uint8List.fromList([1]));
      await expectLater(
        gateway.update('a', png: Uint8List.fromList([2])),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      barrier.complete();
      await Future.wait([a, b]);
      expect(count, 1);
    },
  );
  test(
    'a late response from an old account cannot acknowledge the new account',
    () async {
      var uid = 'a';
      final barrier = Completer<void>();
      final gateway = BusinessLogoGateway(
        currentUserId: () => uid,
        send: (_) => barrier.future,
      );
      final first = gateway.update('a', png: Uint8List.fromList([1]));
      final expected = expectLater(
        first,
        throwsA(isA<FirebaseFunctionsException>()),
      );
      uid = 'b';
      barrier.complete();
      await expected;
      expect(gateway.hasPending('a'), false);
    },
  );
  test(
    'avatar removal is immutable and invalid image errors allow a corrected upload',
    () async {
      final sent = <BusinessLogoRequest>[];
      final gateway = BusinessLogoGateway(
        currentUserId: () => 'a',
        send: (r) async {
          sent.add(r);
          if (r.pngBase64 != null) {
            throw FirebaseFunctionsException(
              code: 'invalid-argument',
              message: 'Synthetic invalid PNG',
            );
          }
        },
      );
      await expectLater(
        gateway.update('a', png: Uint8List.fromList([1])),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(gateway.hasPending('a'), false);
      final avatar = {'avatarId': 'fox'};
      await gateway.update('a', avatar: avatar);
      avatar['avatarId'] = 'owl';
      expect(sent.last.toPayload()['mode'], 'remove');
      expect(sent.last.avatar?['avatarId'], 'fox');
    },
  );
}
