import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:shoutout/feed_body_cache.dart';
import 'package:shoutout/feed_delta_client.dart';
import 'package:shoutout/feed_delta_live.dart';
import 'package:shoutout/feed_public_state_pool.dart';

const deadline = 10000000;
Map<String, dynamic> state(String version, {int revision = 0, int count = 1}) =>
    {
      'schema': 1,
      'bodyVersion': version,
      'authorId': 'writer',
      'status': 'active',
      'createdAt': 100,
      'expiresAt': deadline,
      'selectionVersion': 'a' * 64,
      'revision': revision,
      'likesCount': count,
      'dislikesCount': 0,
      'commentsCount': 2,
      'savesCount': 3,
    };
Map<String, dynamic> liveContext(String generation) => {
  'project': 'project',
  'uid': 'viewer',
  'generation': generation,
  'incarnation': '[1,0]',
};
Map<String, dynamic> reply({
  bool body = true,
  String generation = 'g',
  String id = 'one',
  int count = 1,
}) {
  final content = <String, dynamic>{'title': 'Title', 'text': 'Body'};
  final version = feedBodyVersion(content);
  final full = state(version, count: count);
  return {
    'version': 2,
    'state': 'ready',
    'baseline': 'base',
    'expiresAt': deadline,
    'next': null,
    'bodyPage': {
      'schema': 1,
      'project': 'project',
      'uid': 'viewer',
      'context': 'ctx',
      'generation': generation,
      'incarnation': '[1,0]',
      'expiresAt': deadline,
      'token': 'proof',
      'unreadFirst': false,
      'live': liveContext(generation),
      'rows': [
        {
          'id': id,
          'bodyVersion': version,
          'read': false,
          'distanceKm': 1.0,
          'selectionVersion': 'a' * 64,
          'state': body
              ? full
              : (Map<String, dynamic>.from(full)
                  ..remove('revision')
                  ..remove('commentsCount')
                  ..remove('savesCount')),
        },
      ],
      'bodies': [
        if (body) {'id': id, 'bodyVersion': version, 'body': content},
      ],
    },
  };
}

void main() {
  test(
    'viewer replacement obtains its own SDK synchronization barrier',
    () async {
      String? uid = 'viewer';
      final barriers = {
        'viewer': StreamController<void>.broadcast(),
        'other': StreamController<void>.broadcast(),
      };
      final bound = <String>[];
      final registry = FeedDeltaLive(
        project: 'project',
        currentUserId: () => uid,
        resolveContext: () async => {...liveContext('g'), 'uid': uid},
        publicState: (_, _) => Stream.value(state('a' * 64)),
        reaction: (_, _) => Stream.value(null),
        saved: (_, _) => Stream.value(false),
        synchronized: () {
          bound.add(uid!);
          return barriers[uid]!.stream;
        },
      );
      final first = Completer<void>(), second = Completer<void>();
      final a = registry.watch('one').listen((_) {
        if (!first.isCompleted) first.complete();
      });
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      barriers['viewer']!.add(null);
      await first.future.timeout(const Duration(seconds: 2));
      uid = 'other';
      registry.retainViewer(uid);
      final b = registry.watch('one').listen((_) {
        if (!second.isCompleted) second.complete();
      });
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      barriers['other']!.add(null);
      await second.future.timeout(const Duration(seconds: 2));
      expect(bound, ['viewer', 'other']);
      await a.cancel();
      await b.cancel();
      for (final barrier in barriers.values) {
        await barrier.close();
      }
    },
  );
  test('late manifest cannot replace newer live counters', () async {
    final version = feedBodyVersion({'title': 'Title', 'text': 'Body'});
    final client = FeedDeltaClient(
      project: 'project',
      currentUserId: () => 'viewer',
      cache: FeedBodyCache(clock: () => 1000),
      send: (_) async => reply(),
      currentState: (_, _) => state(version, revision: 5, count: 9),
    );
    expect(
      ((await client.load({}))['items'] as List).single['data']['likesCount'],
      9,
    );
  });

  test(
    'retired generation rebinds once and old account queued events are discarded',
    () async {
      String? uid = 'viewer';
      var generation = 'g', resolves = 0;
      final sources = <String, StreamController<Map<String, dynamic>?>>{};
      final registry = FeedDeltaLive(
        project: 'project',
        currentUserId: () => uid,
        resolveContext: () async {
          resolves++;
          return liveContext(generation);
        },
        publicState: (context, _) {
          final source = StreamController<Map<String, dynamic>?>();
          sources[context['generation'] as String] = source;
          return source.stream;
        },
        reaction: (_, _) => Stream.value(null),
        saved: (_, _) => Stream.value(false),
      );
      final values = <int>[], failures = <Object>[];
      final sub = registry
          .watch('one')
          .listen(
            (value) => values.add(value.likes),
            onError: (Object error) => failures.add(error),
          );
      await Future<void>.delayed(Duration.zero);
      sources['g']!.add(state('a' * 64, revision: 2));
      await Future<void>.delayed(Duration.zero);
      generation = 'next';
      sources['g']!.addError(
        FirebaseException(plugin: 'cloud_firestore', code: 'permission-denied'),
      );
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      sources['next']!.add(state('a' * 64, revision: 0, count: 7));
      await Future<void>.delayed(Duration.zero);
      expect(resolves, 2);
      expect(values, [1, 7]);
      expect(failures, isEmpty);
      uid = 'other';
      registry.retainViewer(uid);
      sources['next']!.add(state('a' * 64, revision: 1, count: 9));
      await Future<void>.delayed(Duration.zero);
      expect(values, [1, 7]);
      await sub.cancel();
      for (final source in sources.values) {
        await source.close();
      }
    },
  );

  test(
    '50 cards plus their details share 50 combinations; promo overlap needs no document reads',
    () async {
      var publicStarts = 0, reactionStarts = 0, saveStarts = 0;
      final pool = FeedPublicStatePool((_, _) {
        publicStarts++;
        return Stream.value(state('a' * 64));
      });
      pool.publish('g:[1,0]', {
        for (var i = 0; i < 10; i++) '$i': state('a' * 64),
      });
      final registry = FeedDeltaLive(
        project: 'project',
        currentUserId: () => 'viewer',
        resolveContext: () async => liveContext('g'),
        publicState: (context, id) => pool.watch('g:[1,0]', id),
        reaction: (_, _) {
          reactionStarts++;
          return Stream.value(null);
        },
        saved: (_, _) {
          saveStarts++;
          return Stream.value(false);
        },
      );
      final subscriptions = [
        for (var i = 0; i < 50; i++) ...[
          registry.watch('$i').listen((_) {}),
          registry.watch('$i').listen((_) {}),
        ],
      ];
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect([publicStarts, reactionStarts, saveStarts], [40, 50, 50]);
      for (final subscription in subscriptions) {
        await subscription.cancel();
      }
    },
  );
  test(
    'promo query supplies card state without duplicate document subscription',
    () async {
      var starts = 0, stops = 0;
      final docs = <StreamController<Map<String, dynamic>?>>[];
      final pool = FeedPublicStatePool((stamp, id) {
        starts++;
        final source = StreamController<Map<String, dynamic>?>(
          onCancel: () {
            stops++;
          },
        );
        docs.add(source);
        return source.stream;
      });
      pool.publish('g', {
        'one': {'revision': 1},
      });
      final revisions = <int>[];
      final sub = pool
          .watch('g', 'one')
          .listen((data) => revisions.add(data!['revision'] as int));
      await Future<void>.delayed(Duration.zero);
      expect(starts, 0);
      pool.publish('g', {
        'one': {'revision': 2},
      });
      await Future<void>.delayed(Duration.zero);
      expect(revisions, [1, 2]);
      pool.publish('g', {});
      await Future<void>.delayed(Duration.zero);
      expect(starts, 1);
      docs.single.add({'revision': 3});
      await Future<void>.delayed(Duration.zero);
      expect(revisions.last, 3);
      pool.publish('g', {
        'one': {'revision': 4},
      });
      await Future<void>.delayed(Duration.zero);
      expect(stops, 1);
      expect(revisions.last, 4);
      await sub.cancel();
      for (final source in docs) {
        await source.close();
      }
    },
  );
  test(
    'cold, warm and one refill preserve confirmed counts without fake zeros',
    () async {
      String? uid = 'viewer';
      var calls = 0, completion = 0;
      final cache = FeedBodyCache(clock: () => 1000);
      final client = FeedDeltaClient(
        project: 'project',
        currentUserId: () => uid,
        cache: cache,
        send: (request) async {
          calls++;
          if (request['mode'] == 'complete') {
            completion++;
            expect(request['missing'], ['two']);
            return reply(id: 'two');
          }
          return reply(body: calls == 1, id: calls == 3 ? 'two' : 'one');
        },
      );
      expect(
        ((await client.load({}))['items'] as List).single['data']['savesCount'],
        3,
      );
      expect(
        ((await client.load({}))['items'] as List)
            .single['data']['commentsCount'],
        2,
      );
      await client.load({});
      expect(completion, 1);
      uid = 'other';
      client.retainViewer(uid);
      expect(cache.isEmpty, isTrue);
    },
  );

  test('late UID response cannot fill the new account cache', () async {
    String? uid = 'viewer';
    final flight = Completer<Object?>();
    final cache = FeedBodyCache(clock: () => 1000);
    final client = FeedDeltaClient(
      project: 'project',
      currentUserId: () => uid,
      cache: cache,
      send: (_) => flight.future,
    );
    final pending = client.load({});
    uid = 'different';
    client.retainViewer(uid);
    flight.complete(reply());
    await expectLater(pending, throwsStateError);
    expect(cache.isEmpty, isTrue);
  });

  test(
    'new generation refills body/state pair; counters do not renew body lifetime',
    () async {
      var now = 1000, generation = 'g', completions = 0;
      final cache = FeedBodyCache(clock: () => now, maximumAgeMillis: 100);
      final client = FeedDeltaClient(
        project: 'project',
        currentUserId: () => 'viewer',
        cache: cache,
        send: (request) async {
          if (request['mode'] == 'complete') {
            completions++;
            return reply(generation: generation);
          }
          return reply(body: cache.isEmpty, generation: generation);
        },
      );
      await client.load({});
      generation = 'next';
      await client.load({});
      expect(completions, 1);
      now = 1099;
      final version = feedBodyVersion({'title': 'Title', 'text': 'Body'});
      cache.updateState(
        const FeedBodyScope('project', 'viewer'),
        'one',
        version,
        {...state(version), '_generation': 'next:[1,0]'},
      );
      now = 1100;
      expect(
        cache.get(const FeedBodyScope('project', 'viewer'), 'one', version),
        isNull,
      );
      client.eraseAccount('viewer');
      await expectLater(client.load({}), throwsStateError);
    },
  );

  test(
    'shared card/detail source, revision guard, generation retirement and last cancellation',
    () async {
      String? uid = 'viewer';
      var starts = 0, stops = 0;
      final states = <String, StreamController<Map<String, dynamic>?>>{};
      final registry = FeedDeltaLive(
        project: 'project',
        currentUserId: () => uid,
        resolveContext: () async => liveContext('g'),
        publicState: (context, id) {
          starts++;
          final controller = StreamController<Map<String, dynamic>?>(
            onCancel: () {
              stops++;
            },
          );
          states[context['generation'] as String] = controller;
          return controller.stream;
        },
        reaction: (_, _) => Stream.value({'type': 'like'}),
        saved: (_, _) => Stream.value(true),
      );
      final first = <int>[], second = <int>[];
      final a = registry.watch('one').listen((value) => first.add(value.likes));
      final b = registry
          .watch('one')
          .listen((value) => second.add(value.likes));
      await Future<void>.delayed(Duration.zero);
      expect(starts, 1);
      states['g']!.add(state('a' * 64, revision: 4, count: 4));
      states['g']!.add(state('a' * 64, revision: 3, count: 3));
      await Future<void>.delayed(Duration.zero);
      expect(first, [4]);
      expect(second, [4]);
      registry.adopt(liveContext('next'));
      await Future<void>.delayed(Duration.zero);
      states['next']!.add(state('a' * 64, revision: 0, count: 8));
      await Future<void>.delayed(Duration.zero);
      expect(first, [4, 8]);
      expect(starts, 2);
      expect(stops, 1);
      await a.cancel();
      expect(stops, 1);
      await b.cancel();
      expect(stops, 2);
      uid = null;
      registry.retainViewer(uid);
      for (final controller in states.values) {
        await controller.close();
      }
    },
  );
}
