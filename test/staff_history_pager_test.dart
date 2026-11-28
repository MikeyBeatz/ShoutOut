import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/staff_history_pager.dart';
import 'package:shoutout/staff_user_enforcement.dart';

StaffSanctionRecord row(String id, int n, {bool active = false}) =>
    StaffSanctionRecord(
      id: id,
      data: {
        'userId': 'target',
        'createdAt': DateTime.utc(2026, 1, 1).subtract(Duration(days: n)),
        'type': 'accountBan',
        'expiresAt': active ? DateTime.utc(2100) : DateTime.utc(2026),
      },
    );
void main() {
  test(
    'all pages remain available and an old active pointer stays at the top',
    () async {
      final pager = StaffHistoryPager(
        currentUserId: () => 'mod',
        activeIds: {'active'},
        loadPage: (cursor) async => cursor == null
            ? StaffHistoryPage([
                row('active', 999, active: true),
                ...List.generate(50, (n) => row('$n', n)),
              ], 1)
            : StaffHistoryPage([
                row('49', 49),
                ...List.generate(20, (n) => row('${n + 50}', n + 50)),
              ], null),
      );
      await pager.loadMore();
      await pager.loadMore();
      expect(pager.records.length, 71);
      expect(pager.records.first.id, 'active');
      expect(pager.hasMore, false);
      pager.dispose();
    },
  );
  test(
    'retry preserves cursor and account changes discard stale responses',
    () async {
      String? actor = 'first';
      var calls = 0;
      final cursors = [];
      final delayed = Completer<StaffHistoryPage>();
      final pager = StaffHistoryPager(
        currentUserId: () => actor,
        loadPage: (cursor) async {
          cursors.add(cursor);
          if (++calls == 1) return StaffHistoryPage([row('1', 1)], 1);
          if (calls == 2) throw Exception('Synthetic network failure');
          if (calls == 3) return delayed.future;
          return StaffHistoryPage([row('new', 1)], null);
        },
      );
      await pager.loadMore();
      await pager.loadMore();
      expect(pager.records.length, 1);
      expect(pager.error, isNotNull);
      final old = pager.loadMore();
      await Future<void>.delayed(Duration.zero);
      actor = 'second';
      await pager.loadMore();
      delayed.complete(StaffHistoryPage([row('old', 0)], 2));
      await old;
      expect(cursors[1], cursors[2]);
      expect(pager.records.single.id, 'new');
      pager.dispose();
    },
  );
  testWidgets(
    'history footer stays after records and append preserves scroll',
    (tester) async {
      final pager = StaffHistoryPager(
        currentUserId: () => 'mod',
        loadPage: (cursor) async => cursor == null
            ? StaffHistoryPage(List.generate(20, (n) => row('$n', n)), 1)
            : StaffHistoryPage(
                List.generate(20, (n) => row('${n + 20}', n + 20)),
                null,
              ),
      );
      await pager.loadMore();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PagedStaffHistory(
              pager: pager,
              cardBuilder: (record) =>
                  SizedBox(height: 70, child: Text('Sanction ${record.id}')),
            ),
          ),
        ),
      );
      expect(find.text('Načíst další'), findsNothing);
      await tester.scrollUntilVisible(find.text('Načíst další'), 500);
      final before = tester
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .pixels;
      await tester.tap(find.text('Načíst další'));
      await tester.pumpAndSettle();
      final after = tester
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .pixels;
      expect((after - before).abs(), lessThan(8));
      expect(pager.records.length, 40);
      await tester.pumpWidget(const SizedBox());
      pager.dispose();
    },
  );
}
