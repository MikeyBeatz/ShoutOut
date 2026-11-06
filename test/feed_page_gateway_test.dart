import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/feed_page_gateway.dart';
import 'package:shoutout/feed_session.dart';

const near = SpatialFeedContext(
  latitude: 50,
  longitude: 14,
  radiusKm: 5,
  order: 'nearest',
);
const far = SpatialFeedContext(
  latitude: 50,
  longitude: 14,
  radiusKm: 20,
  order: 'nearest',
);
Map<String, Object?> reply(
  List<String> ids, {
  String? next,
  String baseline = 'snapshot',
  String state = 'ready',
}) => {
  'version': 1,
  'state': state,
  'baseline': baseline,
  'expiresAt': 3600000,
  'items': ids.map((id) => {'id': id}).toList(),
  'next': next,
};

void main() {
  test(
    'preparation stays internal and 50 + 50 + 20 uses one prefetched batch without duplicates',
    () async {
      final sent = <Map<String, Object?>>[];
      final pages = [
        reply([], state: 'preparing', next: 'prepared'),
        reply(List.generate(50, (i) => '$i'), next: 'second'),
        reply(List.generate(50, (i) => '${i + 50}'), next: 'third'),
        reply(List.generate(20, (i) => '${i + 100}')),
      ];
      final gateway = FeedPageGateway<String>(
        currentUserId: () => 'reader',
        decodeItem: (item) => item['id'] as String,
        send: (payload) async {
          sent.add(payload);
          return pages.removeAt(0);
        },
      );
      final controller = FeedSessionController<String, SpatialFeedContext>(
        load: gateway.load,
        idOf: (id) => id,
      );
      await controller.refresh(near);
      expect(controller.items.length, 50);
      expect(sent.length, 2);
      expect(sent.first['context'], near.toPayload());
      expect(sent[1]['context'], isNull);
      expect(sent[1]['cursor'], 'prepared');
      await controller.prefetch();
      expect(controller.items.length, 50);
      expect(sent.length, 3);
      await controller.loadMore();
      expect(controller.items.length, 100);
      expect(sent.length, 3);
      await controller.loadMore();
      expect(controller.items, List.generate(120, (i) => '$i'));
      expect(sent.length, 4);
      expect(controller.hasMore, isFalse);
      controller.dispose();
      gateway.dispose();
    },
  );

  test(
    'failed filter/refresh preserves previous cards and context; duplicate refresh shares a flight',
    () async {
      final pending = Completer<Object?>();
      var calls = 0;
      final gateway = FeedPageGateway<String>(
        currentUserId: () => 'reader',
        decodeItem: (item) => item['id'] as String,
        send: (_) {
          calls++;
          return calls == 1
              ? pending.future
              : Future.error(StateError('network'));
        },
      );
      final controller = FeedSessionController<String, SpatialFeedContext>(
        load: gateway.load,
        idOf: (id) => id,
      );
      final first = controller.refresh(near),
          duplicate = controller.refresh(near);
      expect(identical(first, duplicate), isTrue);
      pending.complete(reply(['visible'], next: 'more'));
      await first;
      await expectLater(controller.refresh(far), throwsStateError);
      expect(controller.items, ['visible']);
      expect(controller.context, near);
      expect(calls, 2);
      controller.dispose();
      gateway.dispose();
    },
  );

  test(
    'cursor cannot cross account or filter context and invalid use starts no new request',
    () async {
      String? uid = 'reader';
      var calls = 0;
      final gateway = FeedPageGateway<String>(
        currentUserId: () => uid,
        decodeItem: (item) => item['id'] as String,
        send: (_) async {
          calls++;
          return reply(['one'], next: 'continuation');
        },
      );
      final first = await gateway.load(near, null);
      await expectLater(gateway.load(far, first.next), throwsStateError);
      uid = 'another';
      await expectLater(gateway.load(near, first.next), throwsStateError);
      expect(calls, 1);
      gateway.dispose();
    },
  );

  test(
    'preparation has a finite request budget and cannot return a false empty completed page',
    () async {
      var calls = 0;
      final gateway = FeedPageGateway<String>(
        currentUserId: () => 'reader',
        decodeItem: (item) => item['id'] as String,
        maxPreparationRequests: 2,
        send: (_) async =>
            reply([], state: 'preparing', next: 'work-${++calls}'),
      );
      final controller = FeedSessionController<String, SpatialFeedContext>(
        load: gateway.load,
        idOf: (id) => id,
      );
      await expectLater(controller.refresh(near), throwsStateError);
      expect(calls, 2);
      expect(controller.context, isNull);
      expect(controller.items, isEmpty);
      controller.dispose();
      gateway.dispose();
    },
  );

  test(
    'malformed/oversized and nonadvancing responses are rejected instead of truncated',
    () async {
      final malformed = [
        reply(List.generate(51, (i) => '$i')),
        reply(['private-partial'], state: 'preparing', next: 'work'),
        reply([], state: 'preparing'),
        {...reply([]), 'version': 2},
        {...reply([]), 'next': ''},
      ];
      for (final response in malformed) {
        final gateway = FeedPageGateway<String>(
          currentUserId: () => 'reader',
          decodeItem: (item) => item['id'] as String,
          send: (_) async => response,
        );
        await expectLater(gateway.load(near, null), throwsStateError);
        gateway.dispose();
      }
      final gateway = FeedPageGateway<String>(
        currentUserId: () => 'reader',
        decodeItem: (item) => item['id'] as String,
        send: (_) async => reply(['one'], next: 'same'),
      );
      final first = await gateway.load(near, null);
      await expectLater(gateway.load(near, first.next), throwsStateError);
      gateway.dispose();
    },
  );

  test(
    'leaving feed cancels pending work but preserves cards and permits an immediate fresh attempt',
    () async {
      final pending = Completer<Object?>();
      var calls = 0;
      final gateway = FeedPageGateway<String>(
        currentUserId: () => 'reader',
        decodeItem: (item) => item['id'] as String,
        send: (_) {
          calls++;
          return calls == 2
              ? pending.future
              : Future.value(reply(['page-$calls'], next: 'next-$calls'));
        },
      );
      final controller = FeedSessionController<String, SpatialFeedContext>(
        load: gateway.load,
        idOf: (id) => id,
      );
      await controller.refresh(near);
      final stale = controller.refresh(near);
      final failed = expectLater(stale, throwsStateError);
      gateway.cancelPending();
      controller.cancelPending();
      controller.setActive(false);
      expect(controller.items, ['page-1']);
      controller.setActive(true);
      await controller.refresh(near);
      pending.complete(reply(['stale']));
      await failed;
      expect(controller.items, ['page-3']);
      expect(controller.context, near);
      controller.dispose();
      gateway.dispose();
    },
  );

  test(
    'server expiry marks the session for refresh without discarding existing cards',
    () async {
      var calls = 0;
      final gateway = FeedPageGateway<String>(
        currentUserId: () => 'reader',
        decodeItem: (item) => item['id'] as String,
        send: (_) async {
          if (++calls > 1) throw const FeedSessionExpired();
          return reply(['visible'], next: 'next');
        },
      );
      final controller = FeedSessionController<String, SpatialFeedContext>(
        load: gateway.load,
        idOf: (id) => id,
      );
      await controller.refresh(near);
      await expectLater(
        controller.loadMore(),
        throwsA(isA<FeedSessionExpired>()),
      );
      expect(controller.needsRefresh, isTrue);
      expect(controller.items, ['visible']);
      expect(controller.hasMore, isFalse);
      controller.dispose();
      gateway.dispose();
    },
  );
}
