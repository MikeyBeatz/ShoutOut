import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/staff_user_enforcement.dart';

final now = DateTime(2026, 11, 24, 16);
Map<String, dynamic> pointer(String id, [DateTime? expiry]) => {
  'sanctionId': id,
  'expiresAt': expiry == null ? null : Timestamp.fromDate(expiry),
};
StaffSanctionRecord record(
  String id, {
  DateTime? created,
  DateTime? expiry,
  DateTime? revoked,
  String type = 'accountBan',
  String userId = 'target',
  bool permanent = false,
}) => StaffSanctionRecord(
  id: id,
  data: {
    'userId': userId,
    'type': type,
    'reason': 'Důvod rozhodnutí',
    'createdAt': Timestamp.fromDate(created ?? now),
    'expiresAt': expiry == null ? null : Timestamp.fromDate(expiry),
    'permanent': permanent,
  },
  revocation: revoked == null
      ? null
      : {
          'createdAt': Timestamp.fromDate(revoked),
          'reason': 'Předčasně zrušený postih',
        },
);
StaffEnforcementState state({
  Map<String, dynamic>? ban,
  Map<String, dynamic>? restriction,
  Map<String, Map<String, dynamic>> revocations = const {},
}) => StaffEnforcementState(
  ban: ban,
  restriction: restriction,
  revocations: revocations,
  now: now,
);
double contrast(Color a, Color b) =>
    (math.max(a.computeLuminance(), b.computeLuminance()) + .05) /
    (math.min(a.computeLuminance(), b.computeLuminance()) + .05);

void main() {
  test(
    'ban blocks both activities; independent restriction survives ban end',
    () {
      final active = state(
        ban: pointer('ban', now.add(const Duration(days: 7))),
      );
      expect(active.banActive, isTrue);
      expect(active.creationBlocked, isTrue);
      expect(active.restrictionActive, isFalse);
      expect(active.activeSanctionIds, {'ban'});
      final restricted = state(
        ban: pointer('expired', now),
        restriction: pointer('restriction', now.add(const Duration(days: 1))),
      );
      expect(restricted.banActive, isFalse);
      expect(restricted.creationBlocked, isTrue);
      expect(restricted.activeSanctionIds, {'restriction'});
      expect(state().creationBlocked, isFalse);
      expect(state(ban: pointer('permanent')).banActive, isTrue);
      expect(
        state(ban: pointer('revoked'), revocations: {'revoked': {}}).banActive,
        isFalse,
      );
      expect(state(ban: {'expiresAt': 'bad'}).banActive, isFalse);
    },
  );

  test(
    'history dates use actual early end without altering original audit',
    () {
      final planned = DateTime(2026, 12, 1), revoked = DateTime(2026, 11, 25);
      final ended = record('ended', expiry: planned, revoked: revoked);
      expect(ended.period, '24.11.2026–25.11.2026');
      expect(ended.plannedPeriod, '24.11.2026–01.12.2026');
      expect((ended.data['expiresAt'] as Timestamp).toDate(), planned);
      expect(ended.active({'ended'}, now), isFalse);
      expect(
        record(
          'late',
          expiry: planned,
          revoked: DateTime(2026, 12, 2),
        ).effectiveEnd,
        planned,
      );
      expect(record('permanent', permanent: true).period, '24.11.2026–trvale');
      expect(
        record('permanent-ended', permanent: true, revoked: revoked).period,
        '24.11.2026–25.11.2026',
      );
      expect(record('warning', type: 'warning').period, '24.11.2026');
    },
  );

  test(
    'older current sanctions lead the bounded history without duplicate reads',
    () async {
      final active = state(
        ban: pointer('old-ban'),
        restriction: pointer('old-restriction'),
      );
      final reads = <String>[];
      final history = await loadStaffSanctionHistory(
        initial: [
          record(
            'old-restriction',
            created: DateTime(2026, 10, 3),
            permanent: true,
          ),
          for (var i = 0; i < 50; i++)
            record(
              'new-$i',
              created: now.add(Duration(minutes: i)),
              expiry: now.add(const Duration(days: 1)),
            ),
        ],
        enforcement: active,
        userId: 'target',
        limit: 50,
        now: now,
        loadMissing: (id) async {
          reads.add(id);
          return record(id, created: DateTime(2026, 10, 2), permanent: true);
        },
      );
      expect(reads, ['old-ban']);
      expect(history.length, 50);
      expect(history.take(3).map((r) => r.id), [
        'old-restriction',
        'old-ban',
        'new-49',
      ]);
      expect(history.map((r) => r.id).toSet().length, 50);
    },
  );

  test(
    'missing or foreign pointer cannot import another user history',
    () async {
      final history = await loadStaffSanctionHistory(
        initial: [record('own', type: 'warning')],
        enforcement: state(
          ban: pointer('foreign'),
          restriction: pointer('missing'),
        ),
        userId: 'target',
        limit: 50,
        now: now,
        loadMissing: (id) async =>
            id == 'missing' ? null : record(id, userId: 'other'),
      );
      expect(history.map((r) => r.id), ['own']);
      await expectLater(
        loadStaffSanctionHistory(
          initial: [],
          enforcement: state(ban: pointer('error')),
          userId: 'target',
          limit: 50,
          now: now,
          loadMissing: (_) async => throw StateError('read-failed'),
        ),
        throwsStateError,
      );
    },
  );

  for (final brightness in Brightness.values) {
    testWidgets('summary and active history are readable in $brightness', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final base = ThemeData(brightness: brightness, useMaterial3: true);
      // The app may use the same strong red for error and errorContainer.
      // A highlighted card must still show its text, gavel and expand arrow.
      final theme = base.copyWith(
        colorScheme: base.colorScheme.copyWith(
          errorContainer: base.colorScheme.error,
          onErrorContainer: base.colorScheme.onError,
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: theme,
          home: Scaffold(
            body: ListView(
              children: [
                StaffEnforcementSummary(state: state(ban: pointer('active'))),
                StaffSanctionHistoryCard(
                  record: record('active', expiry: DateTime(2026, 12, 1)),
                  active: true,
                  sourceText: 'Obsah',
                ),
              ],
            ),
          ),
        ),
      );
      expect(find.text('Ban'), findsOneWidget);
      expect(find.text('Omezení tvorby'), findsOneWidget);
      expect(find.text('Aktivní kvůli banu'), findsOneWidget);
      final icons = tester.widgetList<Icon>(find.byIcon(Icons.check_circle));
      expect(icons.length, 2);
      expect(
        icons.every((icon) => icon.color == theme.colorScheme.error),
        isTrue,
      );
      final card = tester.widget<Card>(
        find
            .ancestor(of: find.text('Dočasný ban'), matching: find.byType(Card))
            .first,
      );
      expect(card.color, isNot(theme.colorScheme.surface));
      expect(
        contrast(theme.colorScheme.onSurface, card.color!),
        greaterThanOrEqualTo(4.5),
      );
      expect(
        contrast(
          tester.widget<Icon>(find.byIcon(Icons.gavel_outlined)).color!,
          card.color!,
        ),
        greaterThanOrEqualTo(3),
      );
      expect(find.text('24.11.2026–01.12.2026'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(
        MaterialApp(
          theme: theme,
          home: Scaffold(
            body: ListView(
              children: [
                StaffEnforcementSummary(state: state()),
                StaffSanctionHistoryCard(
                  record: record(
                    'revoked',
                    expiry: DateTime(2026, 12, 1),
                    revoked: DateTime(2026, 11, 25),
                  ),
                  active: false,
                  sourceText: 'Obsah',
                ),
              ],
            ),
          ),
        ),
      );
      expect(find.text('Není aktivní'), findsNWidgets(2));
      expect(find.byIcon(Icons.check_circle), findsNothing);
      expect(find.text('24.11.2026–25.11.2026'), findsOneWidget);
      await tester.tap(find.text('Dočasný ban'));
      await tester.pumpAndSettle();
      expect(
        find.text('Původní platnost: 24.11.2026–01.12.2026'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });
  }
}
