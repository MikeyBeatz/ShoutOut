import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/moderation_queue_client.dart';
import 'package:shoutout/address_autocomplete.dart';

Map<String, dynamic> row(int n) => {
  'caseId': n.toRadixString(16).padLeft(64, '0'),
  'incarnation': 'a' * 64,
  'revision': 1,
  'targetType': 'shout',
  'shoutId': 's$n',
  'targetId': 's$n',
  'pendingCount': 1,
  'openCount': 1,
  'escalatedCount': 0,
  'lastAt': {'seconds': 100, 'nanoseconds': 0},
  'representativeReport': {
    'collection': 'reports',
    'id': 'p_s$n',
    'reason': 'Synthetic',
  },
};
Map<String, dynamic> page(List<int> ids, [int? cursor]) => {
  'schemaVersion': 1,
  'items': ids.map(row).toList(),
  'cursor': cursor == null ? null : {'page': cursor},
};
void main() {
  test(
    'existing address results optionally carry validated geographic bounds',
    () {
      expect(
        AddressSelection.parseBounds({
          'lon1': 14,
          'lat1': 50,
          'lon2': 15,
          'lat2': 51,
        }),
        [14, 50, 15, 51],
      );
      expect(AddressSelection.parseBounds([170, -10, -170, 10]), [
        170,
        -10,
        -170,
        10,
      ]);
      for (final invalid in [
        null,
        [14, 50, 15],
        [14, 52, 15, 51],
        [14, 50, double.infinity, 51],
      ]) {
        expect(AddressSelection.parseBounds(invalid), null);
      }
    },
  );
  test('malformed cross-type representative never enters the case list', () {
    final data = row(1);
    (data['representativeReport'] as Map)['collection'] = 'privateReplyReports';
    expect(() => ModerationCaseRecord.fromJson(data), throwsFormatException);
  });
  test(
    'a recreated case cannot inherit an older pending intent or be cleared by its late reply',
    () async {
      final old = Completer<Map<String, dynamic>>();
      var starts = 0;
      final client = ModerationCaseDecisionClient(
        currentUserId: () => 'a',
        issuedAt: (_) async => DateTime.utc(2026),
        newNonce: () => 'b' * 32,
        send: (op, data) async {
          if (op == 'startModerationCaseDecision' && ++starts == 1) {
            return old.future;
          }
          throw FirebaseFunctionsException(
            code: 'unavailable',
            message: 'Synthetic',
          );
        },
      );
      final first = client.decide(
        userId: 'a',
        record: ModerationCaseRecord.fromJson(row(1)),
        decision: 'resolve',
        note: 'Old',
      );
      await Future<void>.delayed(Duration.zero);
      final next = row(1)..['incarnation'] = 'd' * 64;
      await expectLater(
        client.decide(
          userId: 'a',
          record: ModerationCaseRecord.fromJson(next),
          decision: 'approve',
          note: 'New',
        ),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      old.complete({'status': 'complete'});
      await first;
      expect(
        client.pendingDecision(
          'a',
          next['caseId'] as String,
          incarnation: 'd' * 64,
        ),
        'approve',
      );
      expect(
        client.pendingDecision(
          'a',
          next['caseId'] as String,
          incarnation: 'a' * 64,
        ),
        null,
      );
    },
  );
  test(
    'expired job releases frozen local intent for a fresh server recovery',
    () async {
      var starts = 0;
      final client = ModerationCaseDecisionClient(
        currentUserId: () => 'a',
        issuedAt: (_) async => DateTime.utc(2026),
        newNonce: () => 'b' * 32,
        send: (op, _) async {
          if (op == 'startModerationCaseDecision') {
            starts++;
            return {'status': 'processing', 'jobId': 'c' * 64};
          }
          throw FirebaseFunctionsException(
            code: 'failed-precondition',
            message: 'operation-expired',
          );
        },
      );
      await expectLater(
        client.decide(
          userId: 'a',
          record: ModerationCaseRecord.fromJson(row(1)),
          decision: 'resolve',
          note: 'Synthetic',
        ),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(starts, 1);
      expect(client.pendingDecision('a', row(1)['caseId'] as String), null);
    },
  );
  test(
    'more than50 cases, duplicate rows and empty nonfinal pages remain reachable',
    () async {
      String? user = 'a';
      var calls = 0;
      final c = ModerationQueueController(
        currentUserId: () => user,
        send: (_, payload) async {
          calls++;
          return switch (payload['cursor']) {
            null => page(List.generate(50, (n) => n + 1), 1),
            {'page': 1} => page([], 2),
            _ => page([50, ...List.generate(20, (n) => n + 51)]),
          };
        },
      );
      await c.refresh();
      await c.loadMore();
      assert(c.hasMore);
      await c.loadMore();
      expect(c.items.length, 70);
      expect(c.hasMore, false);
      expect(calls, 3);
      c.dispose();
    },
  );
  test(
    'failed next page preserves rows and retries the identical cursor',
    () async {
      var calls = 0;
      final cursors = [];
      final c = ModerationQueueController(
        currentUserId: () => 'a',
        send: (_, p) async {
          calls++;
          cursors.add(p['cursor']);
          if (calls == 1) return page([1], 1);
          if (calls == 2) {
            throw FirebaseFunctionsException(
              code: 'unavailable',
              message: 'Synthetic',
            );
          }
          return page([2]);
        },
      );
      await c.refresh();
      await c.loadMore();
      expect(c.items.length, 1);
      expect(c.error, isNotNull);
      await c.loadMore();
      expect(c.items.length, 2);
      expect(cursors[1], cursors[2]);
      c.dispose();
    },
  );
  test(
    'late replies from old query, account or disposed screen cannot reappear',
    () async {
      String? uid = 'a';
      final old = Completer<Map<String, dynamic>>();
      var calls = 0;
      final c = ModerationQueueController(
        currentUserId: () => uid,
        send: (_, p) {
          calls++;
          return calls == 1 ? old.future : Future.value(page([2]));
        },
      );
      final first = c.refresh();
      await Future<void>.delayed(Duration.zero);
      uid = 'b';
      await c.refresh();
      old.complete(page([1], 1));
      await first;
      expect(c.items.single.shoutId, 's2');
      expect(c.hasMore, false);
      c.dispose();
      final late = Completer<Map<String, dynamic>>();
      final other = ModerationQueueController(
        currentUserId: () => uid,
        send: (_, _) => late.future,
      );
      final pending = other.refresh();
      await Future<void>.delayed(Duration.zero);
      other.dispose();
      late.complete(page([3]));
      await pending;
    },
  );
  test('permission rejection clears previously loaded metadata', () async {
    var calls = 0;
    final c = ModerationQueueController(
      currentUserId: () => 'a',
      send: (_, _) async {
        if (++calls == 1) return page([1], 1);
        throw FirebaseFunctionsException(
          code: 'permission-denied',
          message: 'Synthetic',
        );
      },
    );
    await c.refresh();
    await c.loadMore();
    expect(c.items, isEmpty);
    expect(c.hasMore, false);
    c.dispose();
  });
  test(
    'decision lost response retries one timed intent and resumes one job',
    () async {
      final sent = <Map<String, dynamic>>[];
      var starts = 0, steps = 0;
      final client = ModerationCaseDecisionClient(
        currentUserId: () => 'a',
        issuedAt: (_) async => DateTime.utc(2026),
        newNonce: () => 'b' * 32,
        send: (operation, payload) async {
          sent.add(Map.from(payload));
          if (operation == 'startModerationCaseDecision') {
            if (++starts == 1) {
              throw FirebaseFunctionsException(
                code: 'unavailable',
                message: 'Synthetic',
              );
            }
            return {'status': 'processing', 'jobId': 'c' * 64};
          }
          if (++steps == 1) {
            throw FirebaseFunctionsException(
              code: 'unavailable',
              message: 'Synthetic',
            );
          }
          return {'status': 'complete'};
        },
      );
      Future<void> submit() => client.decide(
        userId: 'a',
        record: ModerationCaseRecord.fromJson(row(1)),
        decision: 'resolve',
        note: 'Synthetic',
      );
      await expectLater(submit(), throwsA(isA<FirebaseFunctionsException>()));
      await expectLater(submit(), throwsA(isA<FirebaseFunctionsException>()));
      expect(sent[0], sent[1]);
      await submit();
      expect(starts, 2);
      expect(steps, 2);
      expect(client.pendingDecision('a', row(1)['caseId'] as String), null);
    },
  );
}
