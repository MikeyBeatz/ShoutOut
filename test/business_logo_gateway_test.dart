import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/business_logo_gateway.dart';
import 'package:shoutout/business_logo_pending_store.dart';
import 'package:shoutout/timed_operation_gateway.dart';

void main() {
  test(
    'oversized PNG is rejected before encoding, persistence or transport',
    () async {
      final store = MemoryBusinessLogoPendingStore();
      var calls = 0;
      final gateway = BusinessLogoGateway(
        currentUserId: () => 'a',
        store: store,
        send: (_) async {
          calls++;
        },
      );
      await expectLater(
        gateway.update('a', png: Uint8List(2 * 1024 * 1024 + 1)),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(await store.read('a'), isNull);
      expect(calls, 0);
    },
  );

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
  test(
    'restart and two clients preserve the same timed key before any send',
    () async {
      final store = MemoryBusinessLogoPendingStore();
      final sent = <Map<String, dynamic>>[];
      var offline = true, nonce = 0;
      BusinessLogoGateway make() {
        final transport = TimedOperationGateway(
          currentUserId: () => 'a',
          issuedAt: (_) async => DateTime.utc(2026, 11, 28),
          newNonce: () => (++nonce).toRadixString(16).padLeft(32, '0'),
          send: (_, data) async {
            sent.add(data);
            if (offline) throw StateError('offline');
          },
        );
        return BusinessLogoGateway(
          currentUserId: () => 'a',
          store: store,
          send: (r) => transport.call(
            attempt: r.attempt,
            userId: r.userId,
            operation: 'updateBusinessLogo',
            payload: r.toPayload(),
          ),
        );
      }

      await expectLater(
        make().update('a', png: Uint8List.fromList([1, 2, 3])),
        throwsStateError,
      );
      final original = sent.single['idempotencyKey'];
      offline = false;
      await Future.wait([make().retry('a'), make().retry('a')]);
      expect(sent.map((r) => r['idempotencyKey']).toSet(), {original});
      expect(await store.read('a'), isNull);
    },
  );
  test(
    'quota failure retains payload, account switch pauses, confirmed erasure prevents resurrection',
    () async {
      final store = MemoryBusinessLogoPendingStore();
      var uid = 'a', calls = 0;
      final gateway = BusinessLogoGateway(
        currentUserId: () => uid,
        store: store,
        send: (_) async {
          calls++;
          throw FirebaseFunctionsException(
            code: 'resource-exhausted',
            message: 'logo-upload-quota',
          );
        },
      );
      await expectLater(
        gateway.update('a', png: Uint8List.fromList([1])),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      uid = 'b';
      await expectLater(
        gateway.retry('a'),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(calls, 1);
      expect(await store.read('a'), isNotNull);
      uid = 'a';
      await gateway.eraseUser('a');
      await expectLater(
        gateway.update('a', png: Uint8List.fromList([1])),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(await store.read('a'), isNull);
      expect(calls, 1);
    },
  );
  test(
    'expired pending bytes are pruned without sending or minting a new operation',
    () async {
      final store = MemoryBusinessLogoPendingStore();
      var sends = 0;
      await store.insert('a', {
        'key': 'old',
        'pngBase64': 'AQ==',
        'avatar': null,
        'expiresAt': 1,
      });
      final gateway = BusinessLogoGateway(
        currentUserId: () => 'a',
        store: store,
        clock: () => DateTime.fromMillisecondsSinceEpoch(2),
        send: (_) async {
          sends++;
        },
      );
      await gateway.retry('a');
      expect(sends, 0);
      expect(await store.read('a'), isNull);
    },
  );
  test(
    'binding storage failure blocks network and preserves the exact image for recovery',
    () async {
      final backing = MemoryBusinessLogoPendingStore();
      final failing = BindingFailStore(backing);
      var sends = 0;
      final transport = TimedOperationGateway(
        currentUserId: () => 'a',
        issuedAt: (_) async => DateTime.utc(2026, 11, 28),
        newNonce: () => '0' * 32,
        send: (_, _) async {
          sends++;
        },
      );
      final gateway = BusinessLogoGateway(
        currentUserId: () => 'a',
        store: failing,
        send: (r) => transport.call(
          attempt: r.attempt,
          userId: r.userId,
          operation: 'updateBusinessLogo',
          payload: r.toPayload(),
        ),
      );
      await expectLater(
        gateway.update('a', png: Uint8List.fromList([1])),
        throwsStateError,
      );
      expect(sends, 0);
      expect((await backing.read('a'))!['pngBase64'], 'AQ==');
      failing.fail = false;
      await gateway.retry('a');
      expect(sends, 1);
      expect(await backing.read('a'), isNull);
    },
  );
}

class BindingFailStore implements BusinessLogoPendingStore {
  BindingFailStore(this.backing);
  final BusinessLogoPendingStore backing;
  bool fail = true;
  @override
  Future<Map<String, dynamic>> bind(
    String uid,
    String key,
    Map<String, dynamic> binding,
  ) {
    if (fail) throw StateError('Synthetic quota/storage failure');
    return backing.bind(uid, key, binding);
  }

  @override
  Future<Map<String, dynamic>> insert(String uid, Map<String, dynamic> row) =>
      backing.insert(uid, row);
  @override
  Future<Map<String, dynamic>?> read(String uid) => backing.read(uid);
  @override
  Future<void> erase(String uid) => backing.erase(uid);
  @override
  Future<void> prune(int nowMillis) => backing.prune(nowMillis);
  @override
  Future<void> remove(String uid, String key) => backing.remove(uid, key);
}
