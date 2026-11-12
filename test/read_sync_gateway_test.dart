import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/read_state_store.dart';
import 'package:shoutout/read_sync_controller.dart';
import 'package:shoutout/read_sync_gateway.dart';

void main() {
  final scope = ReadScope('dev', 'alice');
  final payload = <String, Object?>{'expectedUserId': 'alice'};
  FirebaseFunctionsException failure(
    String code,
    String reason, [
    Map<String, Object?> extra = const {},
  ]) => FirebaseFunctionsException(
    message: 'Fixture error',
    code: code,
    details: {'reason': reason, ...extra},
  );

  test(
    'typed work/cursor errors are distinct from rate, Auth and untyped errors',
    () async {
      Object? error;
      final gateway = ReadSyncGateway(
        scope: scope,
        currentUserId: () => 'alice',
        invoke: (_, _) async => throw error!,
      );
      error = failure('resource-exhausted', 'read-sync-work-budget');
      await expectLater(
        gateway.upload(payload),
        throwsA(isA<ReadSyncBatchTooLarge>()),
      );
      await expectLater(gateway.download(payload), throwsA(same(error)));
      error = failure('failed-precondition', 'read-sync-snapshot-expired');
      await expectLater(
        gateway.download({...payload, 'cursor': 'cursor'}),
        throwsA(isA<ReadSyncSnapshotExpired>()),
      );
      await expectLater(gateway.download(payload), throwsA(same(error)));
      for (final reason in [
        'read-sync-paused',
        'read-sync-disabled',
        'read-sync-control-changed',
      ]) {
        error = failure('failed-precondition', reason);
        await expectLater(
          gateway.upload(payload),
          throwsA(isA<ReadSyncUnavailable>()),
        );
      }
      for (final candidate in [
        failure('unauthenticated', 'read-sync-snapshot-expired'),
        failure('permission-denied', 'read-sync-work-budget'),
        failure('resource-exhausted', 'unknown'),
        failure('resource-exhausted', 'read-sync-rate-limit', {
          'retryAfterMs': '1',
        }),
        StateError('network'),
      ]) {
        error = candidate;
        await expectLater(gateway.upload(payload), throwsA(same(candidate)));
      }
    },
  );

  test(
    'rate cooldown suppresses repeated requests without a timer, preserving direction and account isolation',
    () async {
      var now = DateTime.utc(2030), uid = 'alice', calls = 0;
      final gateway = ReadSyncGateway(
        scope: scope,
        currentUserId: () => uid,
        clock: () => now,
        invoke: (name, _) async {
          calls++;
          if (calls == 1) {
            throw failure('resource-exhausted', 'read-sync-rate-limit', {
              'retryAfterMs': 1000,
            });
          }
          return name;
        },
      );
      await expectLater(
        gateway.upload(payload),
        throwsA(isA<ReadSyncRateLimited>()),
      );
      now = now.add(const Duration(milliseconds: 999));
      await expectLater(
        gateway.upload(payload),
        throwsA(isA<ReadSyncRateLimited>()),
      );
      expect(calls, 1);
      expect(await gateway.download(payload), 'getReadStatePage');
      now = now.add(const Duration(milliseconds: 1));
      expect(await gateway.upload(payload), 'syncReadBatch');
      uid = 'bob';
      await expectLater(gateway.upload(payload), throwsStateError);
      expect(calls, 3);
    },
  );

  test(
    'account change during reply rejects data and avoids mapping old account errors',
    () async {
      String? uid = 'alice';
      final reply = Completer<Object?>();
      final gateway = ReadSyncGateway(
        scope: scope,
        currentUserId: () => uid,
        invoke: (_, _) => reply.future,
      );
      final flight = gateway.download(payload);
      final checked = expectLater(flight, throwsStateError);
      uid = 'bob';
      reply.complete({'version': 1, 'items': []});
      await checked;
      await expectLater(
        gateway.upload({...payload, 'expectedUserId': 'bob'}),
        throwsStateError,
      );
    },
  );

  test(
    'quota interruption keeps the exact frontier and an explicit retry resumes after cooldown',
    () async {
      var now = DateTime.utc(2030), allowed = 1, uploads = 0, downloads = 0;
      final store = MemoryReadStateStore(scope);
      for (var i = 0; i < 65; i++) {
        await store.put(
          ReadContent(
            shoutId: 's$i',
            title: 'T$i',
            text: 'text',
            expiresAt: now.add(const Duration(days: 1)),
          ),
          now,
        );
      }
      final gateway = ReadSyncGateway(
        scope: scope,
        currentUserId: () => 'alice',
        clock: () => now,
        invoke: (name, data) async {
          if (name == 'getReadStatePage') {
            downloads++;
            return {'version': 1, 'revision': 1, 'items': [], 'next': null};
          }
          uploads++;
          if (allowed-- <= 0) {
            throw failure('resource-exhausted', 'read-sync-rate-limit', {
              'retryAfterMs': 1000,
            });
          }
          return {
            'version': 1,
            'revision': 1,
            'items': (data['items'] as List)
                .map((r) => {...r as Map, 'status': 'accepted'})
                .toList(),
          };
        },
      );
      final sync = ReadSyncController(
        scope: scope,
        store: store,
        currentScope: () => scope,
        upload: gateway.upload,
        download: gateway.download,
        clock: () => now,
        wait: (duration) async {
          now = now.add(duration);
        },
      )..setActive(true);
      await sync.synchronize();
      expect(sync.synchronizationComplete, isFalse);
      expect(sync.lastError, isA<ReadSyncRateLimited>());
      expect(downloads, 0);
      expect(uploads, 3);
      expect((await store.pending(now)).length, 32);
      now = now.add(const Duration(seconds: 1));
      allowed = 2;
      await sync.synchronize();
      expect(sync.synchronizationComplete, isTrue);
      expect(downloads, 1);
      expect(uploads, 5);
      expect(await store.pending(now), isEmpty);
      sync.dispose();
      await store.close();
    },
  );

  test(
    'server backpressure continues the captured work once per batch, and background/disposal interrupts waiting',
    () async {
      final now = DateTime.utc(2030);
      final content = ReadContent(
        shoutId: 's',
        title: 'Title',
        text: 'Text',
        expiresAt: now.add(const Duration(days: 1)),
      );
      Map<String, Object?> ack(Map<String, Object?> data) => {
        'version': 1,
        'revision': 1,
        'items': (data['items'] as List)
            .map((r) => {...r as Map, 'status': 'accepted'})
            .toList(),
      };
      for (final action in ['continue', 'background', 'dispose']) {
        final store = MemoryReadStateStore(scope);
        await store.put(content, now);
        var uploads = 0, downloads = 0;
        final waiting = Completer<void>(), started = Completer<void>();
        final sync = ReadSyncController(
          scope: scope,
          store: store,
          currentScope: () => scope,
          clock: () => now,
          wait: (_) {
            started.complete();
            return waiting.future;
          },
          upload: (data) async {
            if (++uploads == 1) {
              throw const ReadSyncRateLimited(Duration(seconds: 1));
            }
            return ack(data);
          },
          download: (_) async {
            downloads++;
            return {'version': 1, 'revision': 1, 'items': [], 'next': null};
          },
        )..setActive(true);
        final flight = sync.synchronize();
        await started.future;
        if (action == 'continue') waiting.complete();
        if (action == 'background') sync.setActive(false);
        if (action == 'dispose') sync.dispose();
        await flight;
        expect(uploads, action == 'continue' ? 2 : 1);
        expect(downloads, action == 'continue' ? 1 : 0);
        expect(sync.synchronizationComplete, action == 'continue');
        if (action != 'continue') expect((await store.pending(now)).length, 1);
        sync.dispose();
        if (!waiting.isCompleted) waiting.complete();
        await store.close();
      }
    },
  );
}
