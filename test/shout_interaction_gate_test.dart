import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/main.dart';
import 'package:shoutout/shout_interaction_gate.dart';

void main() {
  testWidgets(
    'a mounted card closes votes and saves at expiry while its counts and content remain readable',
    (tester) async {
      final now = DateTime.now();
      var saves = 0, votes = 0;
      final shout = Shout(
        id: 'expiry-card',
        author: 'Fixture',
        title: 'Expiry card',
        text: 'Readable text',
        categories: const ['Dotaz'],
        distanceKm: 1,
        createdAt: now,
        expiresAt: now.add(const Duration(seconds: 2)),
        likes: 20,
        dislikes: 2,
        comments: 3,
        saves: 4,
      );
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('cs'),
          home: Scaffold(
            body: ShoutCard(
              shout: shout,
              showSaveCount: true,
              onSave: () => saves++,
              onReaction: (_) async => votes++,
            ),
          ),
        ),
      );
      ReactionButton vote() =>
          tester.widgetList<ReactionButton>(find.byType(ReactionButton)).first;
      IconButton save() => tester.widget<IconButton>(
        find.widgetWithIcon(IconButton, Icons.bookmark_outline),
      );
      expect(vote().onPressed, isNotNull);
      expect(save().onPressed, isNotNull);
      vote().onPressed!();
      save().onPressed!();
      expect(votes, 1);
      expect(saves, 1);
      await tester.pump(const Duration(seconds: 3));
      expect(vote().onPressed, isNull);
      expect(save().onPressed, isNull);
      expect(find.text('20'), findsOneWidget);
      expect(find.text('Readable text'), findsOneWidget);
      expect(shout.likes, 20);
      expect(shout.comments, 3);
      expect(shout.saves, 4);
      // Opening comments remains available for reading even when writing closes.
      expect(
        tester
            .widgetList<ReactionButton>(find.byType(ReactionButton))
            .last
            .onPressed,
        isNotNull,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'expired, disabled, replaced and disposed deadlines cannot reopen or retain timers',
    (tester) async {
      final now = DateTime.now();
      Widget view(DateTime end, {bool enabled = true}) => MaterialApp(
        home: ShoutInteractionGate(
          expiresAt: end,
          enabled: enabled,
          builder: (_, open) => Text(open ? 'open' : 'closed'),
        ),
      );
      await tester.pumpWidget(view(now.subtract(const Duration(seconds: 1))));
      expect(find.text('closed'), findsOneWidget);
      await tester.pumpWidget(
        view(now.add(const Duration(minutes: 1)), enabled: false),
      );
      expect(find.text('closed'), findsOneWidget);
      await tester.pumpWidget(view(now.add(const Duration(minutes: 2))));
      expect(find.text('open'), findsOneWidget);
      await tester.pumpWidget(view(now.add(const Duration(seconds: 1))));
      await tester.pump(const Duration(seconds: 2));
      expect(find.text('closed'), findsOneWidget);
      await tester.pumpWidget(view(now.add(const Duration(minutes: 3))));
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(minutes: 4));
      expect(tester.takeException(), isNull);
    },
  );
}
