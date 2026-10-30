import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/comment_deletion_gateway.dart';
import 'package:shoutout/web_environment.dart';

void main() {
  test(
    'ambiguous deletion reuses its immutable request across retries',
    () async {
      final requests = <CommentDeletionRequest>[];
      var keys = 0;
      final gateway = CommentDeletionGateway(
        currentUserId: () => 'author',
        newKey: () => 'key-${++keys}',
        send: (request) async {
          requests.add(request);
          if (requests.length == 1) {
            throw FirebaseFunctionsException(
              code: 'deadline-exceeded',
              message: 'Lost response',
            );
          }
        },
      );
      Future<void> remove() => gateway.delete(
        userId: 'author',
        shoutId: 'shout',
        commentId: 'comment',
      );
      await expectLater(remove(), throwsA(isA<FirebaseFunctionsException>()));
      await remove();
      expect(requests[1], same(requests[0]));
      expect(keys, 1);
      expect(requests[1].toPayload(), {
        'expectedUserId': 'author',
        'shoutId': 'shout',
        'commentId': 'comment',
        'idempotencyKey': 'key-1',
      });
    },
  );

  test(
    'simultaneous clicks share one request; distinct targets stay independent',
    () async {
      final completion = Completer<void>();
      final sent = <CommentDeletionRequest>[];
      final gateway = CommentDeletionGateway(
        currentUserId: () => 'author',
        send: (request) {
          sent.add(request);
          return completion.future;
        },
      );
      final first = gateway.delete(
        userId: 'author',
        shoutId: 'a',
        commentId: 'same',
      );
      final second = gateway.delete(
        userId: 'author',
        shoutId: 'a',
        commentId: 'same',
      );
      final third = gateway.delete(
        userId: 'author',
        shoutId: 'b',
        commentId: 'same',
      );
      expect(sent.length, 2);
      expect(sent[0].idempotencyKey, isNot(sent[1].idempotencyKey));
      completion.complete();
      await Future.wait([first, second, third]);
    },
  );

  test(
    'definitive refusal discards the key so a later permitted attempt is new',
    () async {
      final sent = <CommentDeletionRequest>[];
      var keys = 0;
      final gateway = CommentDeletionGateway(
        currentUserId: () => 'author',
        newKey: () => 'key-${++keys}',
        send: (request) async {
          sent.add(request);
          if (sent.length == 1) {
            throw FirebaseFunctionsException(
              code: 'resource-exhausted',
              message: 'Limit',
            );
          }
        },
      );
      Future<void> remove() =>
          gateway.delete(userId: 'author', shoutId: 'a', commentId: 'b');
      await expectLater(remove(), throwsA(isA<FirebaseFunctionsException>()));
      await remove();
      expect(sent.map((request) => request.idempotencyKey), ['key-1', 'key-2']);
    },
  );

  test(
    'account switch prevents sending a pending deletion under another account',
    () async {
      String? user = 'author';
      var sends = 0;
      final gateway = CommentDeletionGateway(
        currentUserId: () => user,
        send: (_) async {
          sends++;
          throw FirebaseFunctionsException(
            code: 'unavailable',
            message: 'Offline',
          );
        },
      );
      Future<void> remove() =>
          gateway.delete(userId: 'author', shoutId: 'a', commentId: 'b');
      await expectLater(remove(), throwsA(isA<FirebaseFunctionsException>()));
      user = 'business';
      await expectLater(
        remove(),
        throwsA(
          isA<FirebaseFunctionsException>().having(
            (error) => error.code,
            'code',
            'unauthenticated',
          ),
        ),
      );
      user = null;
      await expectLater(remove(), throwsA(isA<FirebaseFunctionsException>()));
      expect(sends, 1);
    },
  );

  test(
    'comment deletion is optional, strictly boolean and independently requires App Check',
    () {
      final config =
          jsonDecode(File('config/dev.json').readAsStringSync())
                as Map<String, dynamic>
            ..remove('serverCommentDeletion');
      expect(WebEnvironment.fromJson(config).serverCommentDeletion, isFalse);
      expect(
        WebEnvironment.fromJson({
          ...config,
          'serverCommentDeletion': true,
        }).serverCommentDeletion,
        isTrue,
      );
      for (final invalid in [null, 'true', 1, {}]) {
        expect(
          () => WebEnvironment.fromJson({
            ...config,
            'serverCommentDeletion': invalid,
          }),
          throwsStateError,
        );
      }
      final withoutAppCheck = {
        ...config,
        for (final key in [
          'serverShoutCreation',
          'serverCommentCreation',
          'serverPrivateReplyCreation',
          'serverShoutReactions',
          'serverCommentReactions',
          'serverShoutSaves',
          'serverContentReports',
        ])
          key: false,
      }..remove('appCheckSiteKey');
      expect(
        WebEnvironment.fromJson(withoutAppCheck).serverCommentDeletion,
        isFalse,
      );
      expect(
        () => WebEnvironment.fromJson({
          ...withoutAppCheck,
          'serverCommentDeletion': true,
        }),
        throwsStateError,
      );
    },
  );
}
