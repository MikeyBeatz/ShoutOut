// Real browser HTTP + real server operation + Firestore emulator. The loopback
// harness supplies fixture identity; this does not verify platform Auth/AppCheck.
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shoutout/feed_body_cache.dart';
import 'package:shoutout/feed_delta_client.dart';
import 'package:test/test.dart';

const origin = 'http://127.0.0.1:49328';
void main() {
  test(
    'real cold/warm/refill and interrupted refill preserve body order/cache',
    () async {
      final info =
          jsonDecode((await http.get(Uri.parse('$origin/info'))).body)
              as Map<String, dynamic>;
      final scope = FeedBodyScope(
        info['project'] as String,
        info['uid'] as String,
      );
      final cache = FeedBodyCache(
        clock: () => DateTime.now().millisecondsSinceEpoch,
      );
      var returnedBodies = 0, completions = 0;
      final client = FeedDeltaClient(
        project: scope.project,
        currentUserId: () => scope.uid,
        cache: cache,
        send: (data) async {
          if (data['mode'] == 'complete') completions++;
          final reply = await http.post(
            Uri.parse('$origin/call'),
            headers: {'content-type': 'application/json'},
            body: jsonEncode(data),
          );
          if (reply.statusCode != 200) {
            throw StateError('Local harness refused request');
          }
          final value = jsonDecode(reply.body) as Map<String, dynamic>;
          if (value['bodyPage'] is Map) {
            returnedBodies +=
                ((value['bodyPage'] as Map)['bodies'] as List).length;
          }
          return value;
        },
      );
      final first = await client.load({'context': info['context']});
      final ids = (first['items'] as List).map((item) => item['id']).toList();
      expect(ids.length, 50);
      expect(returnedBodies, 50);
      expect(completions, 0);
      final warm = await client.load({'context': info['context']});
      expect((warm['items'] as List).map((item) => item['id']), ids);
      expect(returnedBodies, 50);
      cache.evict(ids.last as String);
      await http.post(Uri.parse('$origin/fail'));
      await expectLater(
        client.load({'context': info['context']}),
        throwsA(anything),
      );
      expect(cache.isEmpty, isFalse);
      await http.post(Uri.parse('$origin/unblock'));
      final retry = await client.load({'context': info['context']});
      expect((retry['items'] as List).map((item) => item['id']), ids);
      expect(returnedBodies, 51);
      expect(completions, 2);
      final second = await client.load({'cursor': retry['next']});
      expect((second['items'] as List).length, 50);
      final third = await client.load({'cursor': second['next']});
      expect((third['items'] as List).length, 20);
      expect(third['next'], isNull);
    },
  );
}
