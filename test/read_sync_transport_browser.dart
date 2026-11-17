// Explicit isolated headless Chrome suite, not live Firebase acceptance.
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:test/test.dart';
import 'package:web/web.dart' as web;
import 'package:shoutout/indexed_read_state_store.dart';
import 'package:shoutout/read_state_store.dart';
import 'package:shoutout/read_sync_controller.dart';

import 'read_state_store_browser.dart' as persistence;

const origin = 'http://127.0.0.1:49327';

Future<Map<String, dynamic>> post(
  String path,
  Map<String, Object?> body,
) async {
  final response = await http
      .post(
        Uri.parse('$origin$path'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      )
      .timeout(const Duration(seconds: 8));
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw StateError('Local HTTP fixture rejected the request');
  }
  return jsonDecode(response.body) as Map<String, dynamic>;
}

void main() {
  for (final failure in ['before', 'after']) {
    test(
      'real HTTP connection loss $failure commit survives a cold store/controller restart',
      () async {
        final fixture = await post('/fixtures', {'failure': failure});
        final id = fixture['id'] as String, path = '/fixtures/$id';
        final scope = ReadScope('local-http-fixture', fixture['uid'] as String);
        final raw = fixture['item'] as Map<String, dynamic>;
        final item = ReadContent(
          shoutId: raw['shoutId'] as String,
          title: raw['title'] as String,
          text: raw['text'] as String,
          expiresAt: DateTime.fromMillisecondsSinceEpoch(
            raw['expiresAt'] as int,
          ),
        );
        final prefix = 'b2-http-$id';
        final firstStore = IndexedReadStateStore(scope, prefix: prefix);
        final stores = <IndexedReadStateStore>[firstStore];
        final controllers = <ReadSyncController>[];
        addTearDown(() async {
          for (final controller in controllers) {
            controller.dispose();
          }
          for (final store in stores) {
            await store.close();
          }
          for (final name in stores.map((store) => store.name).toSet()) {
            await persistence.drop(name);
          }
          final response = await http.delete(Uri.parse('$origin$path'));
          expect(response.statusCode, 200);
        });
        ReadSyncController controller(IndexedReadStateStore store) {
          final value = ReadSyncController(
            scope: scope,
            store: store,
            currentScope: () => scope,
            upload: (payload) => post('$path/syncReadBatch', payload),
            download: (payload) => post('$path/getReadStatePage', payload),
          )..setActive(true);
          controllers.add(value);
          return value;
        }

        final readAt = DateTime.now();
        await firstStore.put(item, readAt);
        final first = controller(firstStore);
        await first.synchronize();
        expect(first.lastError, isA<http.ClientException>());
        expect(first.synchronizationComplete, isFalse);
        final pending = await firstStore.pending(DateTime.now());
        expect(pending.single.content.key, item.key);
        expect(pending.single.readAtLocal, readAt.millisecondsSinceEpoch);
        final checkpoint = await persistence.readMeta(
          firstStore.name,
          'syncCheckpoint',
        );
        expect(checkpoint, isNotNull);
        final failedResponse = await http.get(Uri.parse('$origin$path/state'));
        final failed = jsonDecode(failedResponse.body) as Map<String, dynamic>;
        expect(failed['dropped'], greaterThanOrEqualTo(1));
        expect(failed['commits'], failure == 'before' ? 0 : 1);
        first.dispose();
        await firstStore.close();

        final restartedStore = IndexedReadStateStore(scope, prefix: prefix);
        stores.add(restartedStore);
        expect(await restartedStore.contains(item, DateTime.now()), isTrue);
        expect(
          (await restartedStore.pending(DateTime.now())).single.readAtLocal,
          readAt.millisecondsSinceEpoch,
        );
        expect(
          await persistence.readMeta(restartedStore.name, 'syncCheckpoint'),
          checkpoint,
        );
        await post('$path/healthy', {});
        final restarted = controller(restartedStore);
        await restarted.synchronize();
        expect(restarted.lastError, isNull);
        expect(restarted.synchronizationComplete, isTrue);
        expect(await restartedStore.pending(DateTime.now()), isEmpty);
        expect(await restartedStore.contains(item, DateTime.now()), isTrue);
        expect(
          await persistence.readMeta(restartedStore.name, 'syncCheckpoint'),
          isNull,
        );
        final response = await http.get(Uri.parse('$origin$path/state'));
        final recovered = jsonDecode(response.body) as Map<String, dynamic>;
        expect(recovered['records'], 1);
        expect(recovered['commits'], 1);
        expect(recovered['revision'], 1);
        expect(recovered['attempts'], greaterThanOrEqualTo(2));
        if (failure == 'after') {
          expect(recovered['confirmedAt'], failed['confirmedAt']);
        }
        final other = IndexedReadStateStore(
          ReadScope(scope.projectId, 'another-reader-$id'),
          prefix: prefix,
        );
        stores.add(other);
        expect(await other.contains(item, DateTime.now()), isFalse);
        // The browser's online hint is recorded, never used as the failure gate.
        // ignore: avoid_print
        print(
          'B2_HTTP_RECOVERY ${jsonEncode({'failure': failure, 'navigatorOnline': web.window.navigator.onLine, 'droppedRequests': failed['dropped'], 'uploadAttempts': recovered['attempts'], 'serverEffects': recovered['commits'], 'coldStoreRestart': true, 'checkpointFinished': true, 'firebaseRequests': 0})}',
        );
      },
      timeout: const Timeout(Duration(seconds: 45)),
    );
  }
}
