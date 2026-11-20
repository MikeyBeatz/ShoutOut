import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/main.dart';
import 'package:shoutout/interaction_feedback.dart';
import 'package:shoutout/interaction_feedback_widgets.dart';
import 'package:shoutout/live_shout_state.dart';
import 'package:shoutout/l10n/app_localizations.dart';

LiveShoutState live({
  int likes = 3,
  String? reaction,
  int saves = 2,
  bool saved = false,
}) => LiveShoutState(
  likes: likes,
  dislikes: 0,
  comments: 0,
  reaction: reaction,
  saves: saves,
  saved: saved,
);

void main() {
  testWidgets(
    'expiration during an outstanding action hides tentative counts and leaves all interactions disabled',
    (tester) async {
      final f = InteractionFeedback()..retainViewer('alice');
      addTearDown(f.dispose);
      final ack = Completer<void>();
      final shout = Shout(
        id: 'a',
        author: 'Fixture',
        title: 'Expiring',
        text: 'Body',
        categories: [],
        distanceKm: 1,
        createdAt: DateTime.now(),
        expiresAt: DateTime.now().add(const Duration(hours: 1)),
        likes: 3,
        saves: 2,
      );
      final task = f.run(
        viewer: 'alice',
        id: 'a',
        kind: InteractionKind.reaction,
        base: live(),
        send: () => ack.future,
        definitive: (_) => true,
        reconcile: () async => live(),
      );
      Widget view() => MaterialApp(
        home: Scaffold(
          body: ShoutCard(
            shout: shout,
            feedback: f,
            onSave: () {},
            onReaction: (_) async {},
          ),
        ),
      );
      await tester.pumpWidget(view());
      expect(
        tester
            .widgetList<ReactionButton>(find.byType(ReactionButton))
            .first
            .value,
        4,
      );
      shout.status = ShoutStatus.expired;
      await tester.pumpWidget(view());
      final like = tester
          .widgetList<ReactionButton>(find.byType(ReactionButton))
          .first;
      expect(
        like.value,
        3,
        reason:
            'Expired cards show confirmed state even while an old action remains unresolved',
      );
      expect(like.onPressed, null);
      expect(
        tester
            .widget<IconButton>(
              find.widgetWithIcon(IconButton, Icons.bookmark_outline),
            )
            .onPressed,
        null,
      );
      f.retainViewer(null);
      ack.complete();
      await task;
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'failed delete restores its control and shows an error without an unhandled future',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AsyncActionIconButton(
              feedbackEnabled: true,
              icon: const Icon(Icons.delete_outline),
              onPressed: () async => throw StateError('offline'),
            ),
          ),
        ),
      );
      await tester.tap(find.byType(IconButton));
      await tester.pump();
      expect(find.byType(SnackBar), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(
        tester.widget<IconButton>(find.byType(IconButton)).onPressed,
        isNotNull,
      );
      expect(tester.takeException(), null);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  for (final brightness in Brightness.values) {
    testWidgets(
      'instant reaction/save feedback preserves read tint and geometry in ${brightness.name}',
      (tester) async {
        final f = InteractionFeedback()..retainViewer('alice');
        addTearDown(f.dispose);
        final shout = Shout(
          id: 'a',
          feedRead: true,
          author: 'Fixture',
          title: 'Read card',
          text: 'Body',
          categories: ['Dotaz'],
          distanceKm: 1,
          createdAt: DateTime.now(),
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
          likes: 3,
          saves: 2,
        );
        final reactionAck = Completer<void>(), saveAck = Completer<void>();
        var reactionCalls = 0, saveCalls = 0;
        Future<void> react(bool like) => f.run(
          viewer: 'alice',
          id: 'a',
          kind: InteractionKind.reaction,
          like: like,
          base: live(),
          send: () {
            reactionCalls++;
            return reactionAck.future;
          },
          definitive: (_) => true,
          reconcile: () async => live(),
        );
        void save() => unawaited(
          f.run(
            viewer: 'alice',
            id: 'a',
            kind: InteractionKind.save,
            base: live(),
            send: () {
              saveCalls++;
              return saveAck.future;
            },
            definitive: (_) => true,
            reconcile: () async => live(),
          ),
        );
        await tester.pumpWidget(
          MaterialApp(
            locale: const Locale('cs'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: ThemeData(brightness: brightness),
            home: Scaffold(
              body: ShoutCard(
                shout: shout,
                feedback: f,
                showSaveCount: true,
                onReaction: react,
                onSave: save,
              ),
            ),
          ),
        );
        await tester.pump();
        final rect = tester.getRect(find.byType(Card)),
            color = tester.widget<Card>(find.byType(Card)).color;
        await tester.tap(find.byIcon(Icons.thumb_up_outlined));
        await tester.pump();
        final likeButton = tester
            .widgetList<ReactionButton>(find.byType(ReactionButton))
            .first;
        expect(likeButton.value, 4);
        expect(likeButton.selected, true);
        expect(likeButton.onPressed, null);
        expect(reactionCalls, 1);
        expect(
          shout.likes,
          3,
          reason:
              'Tentative state must never overwrite the authoritative model',
        );
        await tester.tap(find.byIcon(Icons.bookmark_outline));
        await tester.pump();
        expect(saveCalls, 1);
        expect(find.byIcon(Icons.bookmark), findsOneWidget);
        expect(find.text('3 Uložené'), findsOneWidget);
        expect(tester.getRect(find.byType(Card)), rect);
        expect(tester.widget<Card>(find.byType(Card)).color, color);
        reactionAck.complete();
        saveAck.complete();
        await tester.pump();
        // Both independent listeners have received their coherent server state.
        shout
          ..likes = 10
          ..isLiked = true
          ..saves = 8
          ..isSaved = true;
        f.observe(
          'alice',
          'a',
          live(likes: 10, reaction: 'like', saves: 8, saved: true),
        );
        await tester.pump();
        expect(
          tester
              .widgetList<ReactionButton>(find.byType(ReactionButton))
              .first
              .value,
          10,
        );
        expect(find.text('8 Uložené'), findsOneWidget);
        expect(find.byType(CircularProgressIndicator), findsNothing);
        expect(shout.feedRead, true);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets(
    'feedback changes only the target card and detaches after disposal',
    (tester) async {
      final f = InteractionFeedback()..retainViewer('alice');
      addTearDown(f.dispose);
      var builds = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: InteractionFeedbackBuilder(
            id: 'a',
            feedback: f,
            builder: (_, _) {
              builds++;
              return const Text('a');
            },
          ),
        ),
      );
      final ack = Completer<void>();
      final task = f.run(
        viewer: 'alice',
        id: 'other',
        kind: InteractionKind.save,
        base: live(),
        send: () => ack.future,
        definitive: (_) => true,
        reconcile: () async => live(),
      );
      await tester.pump();
      expect(builds, 1);
      await tester.pumpWidget(const SizedBox.shrink());
      f.retainViewer('bob');
      ack.complete();
      await task;
      await tester.pump();
      expect(tester.takeException(), null);
    },
  );

  testWidgets(
    'delete button immediately shows progress, suppresses duplicate clicks, and tolerates removal',
    (tester) async {
      final ack = Completer<void>();
      var calls = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AsyncActionIconButton(
              feedbackEnabled: true,
              icon: const Icon(Icons.delete_outline),
              onPressed: () {
                calls++;
                return ack.future;
              },
            ),
          ),
        ),
      );
      await tester.tap(find.byType(IconButton));
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      await tester.tap(find.byType(IconButton));
      expect(calls, 1);
      await tester.pumpWidget(const SizedBox.shrink());
      ack.complete();
      await tester.pump();
      expect(tester.takeException(), null);
    },
  );
}
