import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:shoutout/reaction_gateway.dart';

void main() {
  late List<ReactionRequest> sent;
  late String? uid;
  late int sequence;
  late Future<void> Function(ReactionRequest) transport;
  late ReactionGateway gateway;

  setUp(() {
    sent = [];
    uid = 'alice';
    sequence = 0;
    transport = (_) async {};
    gateway = ReactionGateway(
      currentUserId: () => uid,
      newKey: () => 'key-${++sequence}',
      isDefinitiveFailure: (error) => error == 'rejected',
      send: (request) async {
        sent.add(request);
        await transport(request);
      },
    );
  });

  Future<void> toggle([bool like = true, String shout = 'target']) =>
      gateway.toggle(userId: 'alice', shoutId: shout, like: like);

  test(
    'comment retry retains its target without colliding with its Shout or another comment',
    () async {
      transport = (_) async => throw 'offline';
      await expectLater(
        gateway.toggle(
          userId: 'alice',
          shoutId: 'target',
          commentId: 'first',
          like: true,
        ),
        throwsA('offline'),
      );
      transport = (_) async {};
      await toggle();
      await gateway.toggle(
        userId: 'alice',
        shoutId: 'target',
        commentId: 'second',
        like: true,
      );
      await gateway.toggle(
        userId: 'alice',
        shoutId: 'target',
        commentId: 'first',
        like: true,
      );
      expect(sent.map((r) => r.idempotencyKey), [
        'key-1',
        'key-2',
        'key-3',
        'key-1',
      ]);
      expect(sent.last.toPayload()['commentId'], 'first');
      expect(sent[1].toPayload().containsKey('commentId'), isFalse);
      expect(identical(sent.first, sent.last), isTrue);
    },
  );

  test('in-flight comments in one Shout do not block each other', () async {
    final response = Completer<void>();
    transport = (_) => response.future;
    final first = gateway.toggle(
      userId: 'alice',
      shoutId: 'target',
      commentId: 'first',
      like: true,
    );
    final second = gateway.toggle(
      userId: 'alice',
      shoutId: 'target',
      commentId: 'second',
      like: true,
    );
    final duplicate = gateway.toggle(
      userId: 'alice',
      shoutId: 'target',
      commentId: 'first',
      like: false,
    );
    expect(sent.map((r) => r.commentId), ['first', 'second']);
    response.complete();
    await Future.wait([first, second, duplicate]);
  });

  test(
    'real callable errors preserve ambiguous attempts and discard server rejections',
    () async {
      final calls = <ReactionRequest>[];
      Object? failure;
      final service = ReactionGateway(
        currentUserId: () => 'alice',
        isDefinitiveFailure: isDefinitiveReactionFailure,
        newKey: () => 'key-${++sequence}',
        send: (request) async {
          calls.add(request);
          if (failure != null) throw failure;
        },
      );
      Future<void> click() => service.toggle(
        userId: 'alice',
        shoutId: 'target',
        commentId: 'first',
        like: true,
      );
      for (final code in ['unavailable', 'deadline-exceeded', 'internal']) {
        failure = FirebaseFunctionsException(
          code: code,
          message: 'Test transport failure',
        );
        await expectLater(click(), throwsA(isA<FirebaseFunctionsException>()));
      }
      failure = FirebaseFunctionsException(
        code: 'resource-exhausted',
        message: 'Test rate rejection',
      );
      await expectLater(click(), throwsA(isA<FirebaseFunctionsException>()));
      failure = null;
      await click();
      expect(calls.map((r) => r.idempotencyKey), [
        'key-1',
        'key-1',
        'key-1',
        'key-1',
        'key-2',
      ]);
    },
  );

  test(
    'ambiguous retry keeps immutable payload; next successful click gets a new key',
    () async {
      transport = (_) async => throw 'offline';
      await expectLater(toggle(), throwsA('offline'));
      transport = (_) async {};
      await toggle();
      await toggle();
      expect(identical(sent[0], sent[1]), isTrue);
      expect(sent.map((r) => r.idempotencyKey), ['key-1', 'key-1', 'key-2']);
      expect(sent.first.toPayload(), {
        'expectedUserId': 'alice',
        'shoutId': 'target',
        'button': 'like',
        'idempotencyKey': 'key-1',
      });
    },
  );

  test(
    'definitive rejection clears the attempt for a fresh later click',
    () async {
      transport = (_) async => throw 'rejected';
      await expectLater(toggle(), throwsA('rejected'));
      transport = (_) async {};
      await toggle();
      expect(sent.map((r) => r.idempotencyKey), ['key-1', 'key-2']);
    },
  );

  test(
    'opposite click resolves the ambiguous old toggle before creating a new one',
    () async {
      transport = (_) async => throw 'offline';
      await expectLater(toggle(), throwsA('offline'));
      final resolving = Completer<void>();
      transport = (request) =>
          request.idempotencyKey == 'key-1' ? resolving.future : Future.value();
      final next = toggle(false);
      expect(sent.length, 2);
      expect(sent.last.button, 'like');
      resolving.complete();
      await next;
      expect(sent.map((r) => r.button), ['like', 'like', 'dislike']);
      expect(sent.last.idempotencyKey, 'key-2');
    },
  );

  test('another ambiguous failure prevents the opposite toggle', () async {
    transport = (_) async => throw 'offline';
    await expectLater(toggle(), throwsA('offline'));
    await expectLater(toggle(false), throwsA('offline'));
    expect(sent.map((r) => r.button), ['like', 'like']);
    expect(sequence, 1);
  });

  test(
    'rapid clicks share one in-flight mutation for the same account and Shout',
    () async {
      final response = Completer<void>();
      transport = (_) => response.future;
      final first = toggle();
      final second = toggle(false);
      expect(sent.length, 1);
      response.complete();
      await Future.wait([first, second]);
      await toggle(false);
      expect(sent.map((r) => r.button), ['like', 'dislike']);
    },
  );

  test('independent targets and accounts do not reuse pending keys', () async {
    transport = (_) async => throw 'offline';
    await expectLater(toggle(), throwsA('offline'));
    transport = (_) async {};
    await toggle(true, 'other');
    uid = 'bob';
    await gateway.toggle(userId: 'bob', shoutId: 'target', like: true);
    expect(sent.map((r) => r.idempotencyKey), ['key-1', 'key-2', 'key-3']);
    expect(sent.last.userId, 'bob');
  });

  test('account switch stops a pending retry before sending', () async {
    transport = (_) async => throw 'offline';
    await expectLater(toggle(), throwsA('offline'));
    uid = 'bob';
    await expectLater(toggle(), throwsA(isA<ReactionAccountChanged>()));
    expect(sent.length, 1);
  });

  test(
    'account switch during resolution stops the subsequent opposite toggle',
    () async {
      transport = (_) async => throw 'offline';
      await expectLater(toggle(), throwsA('offline'));
      final response = Completer<void>();
      transport = (_) => response.future;
      final next = toggle(false);
      final check = expectLater(next, throwsA(isA<ReactionAccountChanged>()));
      uid = 'bob';
      response.complete();
      await check;
      expect(sent.length, 2);
    },
  );
}
