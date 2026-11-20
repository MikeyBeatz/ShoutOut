import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:shoutout/interaction_feedback.dart';
import 'package:shoutout/live_shout_state.dart';
import 'package:shoutout/reaction_gateway.dart';

LiveShoutState state({
  int likes = 0,
  int dislikes = 0,
  String? reaction,
  int saves = 0,
  bool saved = false,
}) => LiveShoutState(
  likes: likes,
  dislikes: dislikes,
  comments: 0,
  reaction: reaction,
  saves: saves,
  saved: saved,
);

void main() {
  testWidgets(
    'an overlapping server read does not replace a later coherent live counter from another device',
    (tester) async {
      final f = InteractionFeedback()..retainViewer('alice');
      addTearDown(f.dispose);
      final result = Completer<LiveShoutState>();
      await f.run(
        viewer: 'alice',
        id: 'a',
        kind: InteractionKind.reaction,
        base: state(likes: 2),
        send: () async {},
        definitive: (_) => false,
        reconcile: () => result.future,
      );
      await tester.pump(const Duration(seconds: 2));
      f.observe(
        'alice',
        'a',
        state(likes: 99, dislikes: 4, reaction: 'dislike'),
      );
      result.complete(state(likes: 3, reaction: 'like'));
      await tester.pump();
      expect(f.pending('a', InteractionKind.reaction), false);
      expect(f.confirmed('a', InteractionKind.reaction)!.likes, 99);
      expect(f.confirmed('a', InteractionKind.reaction)!.reaction, 'dislike');
    },
  );
  testWidgets(
    'a late fallback read cannot cross an account change or overwrite the next viewer',
    (tester) async {
      final f = InteractionFeedback()..retainViewer('alice');
      addTearDown(f.dispose);
      final result = Completer<LiveShoutState>();
      await f.run(
        viewer: 'alice',
        id: 'a',
        kind: InteractionKind.save,
        base: state(),
        send: () async {},
        definitive: (_) => false,
        reconcile: () => result.future,
      );
      await tester.pump(const Duration(seconds: 2));
      expect(f.busy('a', InteractionKind.save), true);
      f.retainViewer('bob');
      result.complete(state(saves: 20, saved: true));
      await tester.pump();
      expect(f.confirmed('a', InteractionKind.save), null);
      expect(f.preview('a', InteractionKind.save), null);
      expect(f.pending('a', InteractionKind.save), false);
    },
  );
  testWidgets(
    'slow acknowledgement previews immediately, deduplicates, and waits for coherent live data',
    (tester) async {
      final f = InteractionFeedback()..retainViewer('alice');
      addTearDown(f.dispose);
      final ack = Completer<void>();
      int sends = 0, reads = 0;
      Future<void> start() => f.run(
        viewer: 'alice',
        id: 'a',
        kind: InteractionKind.reaction,
        base: state(likes: 7),
        send: () {
          sends++;
          return ack.future;
        },
        definitive: (_) => true,
        reconcile: () async {
          reads++;
          return state();
        },
      );
      final flight = start();
      expect(f.preview('a', InteractionKind.reaction)!.likes, 8);
      expect(f.busy('a', InteractionKind.reaction), true);
      expect(identical(start(), flight), true);
      expect(sends, 1);
      ack.complete();
      await flight;
      expect(f.preview('a', InteractionKind.reaction)!.likes, 8);
      f.observe('alice', 'a', state(likes: 11, reaction: 'like'));
      await tester.pump(const Duration(seconds: 3));
      expect(f.pending('a', InteractionKind.reaction), false);
      expect(
        reads,
        0,
        reason: 'No extra database reads on the normal live path',
      );
    },
  );

  testWidgets(
    'live update before acknowledgement replaces preview without adding its delta again',
    (tester) async {
      final f = InteractionFeedback()..retainViewer('alice');
      addTearDown(f.dispose);
      final ack = Completer<void>();
      final task = f.run(
        viewer: 'alice',
        id: 'a',
        kind: InteractionKind.reaction,
        base: state(likes: 7),
        send: () => ack.future,
        definitive: (_) => true,
        reconcile: () async => state(),
      );
      f.observe('alice', 'a', state(likes: 20, reaction: 'like'));
      expect(f.preview('a', InteractionKind.reaction), null);
      expect(f.busy('a', InteractionKind.reaction), true);
      // A different device wins while the original call is still in flight.
      f.observe(
        'alice',
        'a',
        state(likes: 19, dislikes: 3, reaction: 'dislike'),
      );
      ack.complete();
      await task;
      await tester.pump();
      expect(f.pending('a', InteractionKind.reaction), false);
      expect(f.confirmed('a', InteractionKind.reaction)!.likes, 19);
    },
  );

  testWidgets(
    'definite rejection discards only preview, not a new live count',
    (tester) async {
      final f = InteractionFeedback()..retainViewer('alice');
      addTearDown(f.dispose);
      final ack = Completer<void>();
      final task = f.run(
        viewer: 'alice',
        id: 'a',
        kind: InteractionKind.save,
        base: state(saves: 4),
        send: () => ack.future,
        definitive: (_) => true,
        reconcile: () async => state(),
      );
      f.observe('alice', 'a', state(saves: 30));
      final expectation = expectLater(task, throwsStateError);
      ack.completeError(StateError('rejected'));
      await expectation;
      expect(f.preview('a', InteractionKind.save), null);
      expect(f.confirmed('a', InteractionKind.save)!.saves, 30);
      await tester.pump();
    },
  );

  testWidgets(
    'ambiguous retry keeps the original gateway request even if another button is tapped',
    (tester) async {
      final f = InteractionFeedback()..retainViewer('alice');
      addTearDown(f.dispose);
      final requests = <ReactionRequest>[];
      final gateway = ReactionGateway(
        currentUserId: () => 'alice',
        isDefinitiveFailure: (_) => false,
        send: (r) async {
          requests.add(r);
          if (requests.length == 1) throw StateError('response lost');
        },
      );
      Future<void> send() =>
          gateway.toggle(userId: 'alice', shoutId: 'a', like: true);
      await expectLater(
        f.run(
          viewer: 'alice',
          id: 'a',
          kind: InteractionKind.reaction,
          base: state(),
          send: send,
          definitive: (_) => false,
          reconcile: () async => state(),
        ),
        throwsStateError,
      );
      expect(f.uncertain('a', InteractionKind.reaction), true);
      expect(f.preview('a', InteractionKind.reaction)!.targetReaction, 'like');
      await f.run(
        viewer: 'alice',
        id: 'a',
        kind: InteractionKind.reaction,
        like: false,
        base: state(),
        send: () => throw StateError('must not mint another action'),
        definitive: (_) => false,
        reconcile: () async => state(),
      );
      expect(requests.length, 2);
      expect(identical(requests.first, requests.last), true);
      f.observe('alice', 'a', state(likes: 1, reaction: 'like'));
      await tester.pump();
      expect(f.pending('a', InteractionKind.reaction), false);
    },
  );

  testWidgets(
    'delayed live channel reconciles once with current server data, never historical receipt counters',
    (tester) async {
      final f = InteractionFeedback()..retainViewer('alice');
      addTearDown(f.dispose);
      int sends = 0, reads = 0;
      await f.run(
        viewer: 'alice',
        id: 'a',
        kind: InteractionKind.reaction,
        base: state(likes: 8),
        send: () async {
          sends++;
        },
        definitive: (_) => false,
        reconcile: () async {
          reads++;
          return state(likes: 42, reaction: 'dislike');
        },
      );
      await tester.pump(const Duration(seconds: 2));
      await tester.pump();
      expect(sends, 1);
      expect(reads, 1);
      expect(f.pending('a', InteractionKind.reaction), false);
      expect(f.confirmed('a', InteractionKind.reaction)!.likes, 42);
      expect(f.confirmed('a', InteractionKind.reaction)!.reaction, 'dislike');
      await tester.pump(const Duration(minutes: 1));
      expect(reads, 1);
    },
  );

  testWidgets(
    'failed reconciliation is retried as a read, with no second toggle',
    (tester) async {
      final f = InteractionFeedback()..retainViewer('alice');
      addTearDown(f.dispose);
      int sends = 0, reads = 0;
      Future<LiveShoutState> read() async {
        reads++;
        if (reads == 1) throw StateError('offline');
        return state(saved: true, saves: 9);
      }

      Future<void> start() => f.run(
        viewer: 'alice',
        id: 'a',
        kind: InteractionKind.save,
        base: state(),
        send: () async {
          sends++;
        },
        definitive: (_) => false,
        reconcile: read,
      );
      await start();
      await tester.pump(const Duration(seconds: 2));
      await tester.pump();
      expect(f.uncertain('a', InteractionKind.save), true);
      await start();
      expect(sends, 1);
      expect(reads, 2);
      expect(f.confirmed('a', InteractionKind.save)!.saves, 9);
      await tester.pump();
    },
  );

  testWidgets(
    'viewer switch discards pending state and late acknowledgements and reconciliation',
    (tester) async {
      final f = InteractionFeedback()..retainViewer('alice');
      addTearDown(f.dispose);
      final ack = Completer<void>();
      var reads = 0;
      final task = f.run(
        viewer: 'alice',
        id: 'a',
        kind: InteractionKind.save,
        base: state(),
        send: () => ack.future,
        definitive: (_) => false,
        reconcile: () async {
          reads++;
          return state(saved: true);
        },
      );
      f.retainViewer('bob');
      f.observe('alice', 'a', state(saved: true));
      ack.complete();
      await task;
      await tester.pump(const Duration(seconds: 3));
      expect(f.preview('a', InteractionKind.save), null);
      expect(f.pending('a', InteractionKind.save), false);
      expect(reads, 0);
      f.confirmOwnDeletion('alice', 'a');
      expect(f.deleted, isEmpty);
    },
  );

  testWidgets(
    'expiration rejection restores preview and save/reaction phases stay independent',
    (tester) async {
      final f = InteractionFeedback()..retainViewer('alice');
      addTearDown(f.dispose);
      final saveAck = Completer<void>();
      final saveTask = f.run(
        viewer: 'alice',
        id: 'a',
        kind: InteractionKind.save,
        base: state(saves: 5),
        send: () => saveAck.future,
        definitive: (_) => true,
        reconcile: () async => state(),
      );
      await expectLater(
        f.run(
          viewer: 'alice',
          id: 'a',
          kind: InteractionKind.reaction,
          base: state(),
          send: () async => throw FirebaseFunctionsException(
            code: 'failed-precondition',
            message: 'expired',
          ),
          definitive: isDefinitiveReactionFailure,
          reconcile: () async => state(),
        ),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(f.pending('a', InteractionKind.reaction), false);
      expect(f.preview('a', InteractionKind.save)!.saves, 6);
      f.observe('alice', 'a', state(saves: 6, saved: true));
      saveAck.complete();
      await saveTask;
      await tester.pump();
    },
  );
}
