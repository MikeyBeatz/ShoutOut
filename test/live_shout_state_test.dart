import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/live_shout_state.dart';

void main() {
  test(
    'bookmark and full save count follow independent live updates and cancel all subscriptions',
    () async {
      final documents = StreamController<Map<String, dynamic>?>();
      final reactions = StreamController<Map<String, dynamic>?>();
      final saves = StreamController<bool>();
      final events = <LiveShoutState>[];
      final subscription = watchLiveShoutState(
        documents.stream,
        reactions.stream,
        ownSave: saves.stream,
      ).listen(events.add);
      reactions.add(null);
      saves.add(false);
      documents.add({'savesCount': 0});
      await Future<void>.delayed(Duration.zero);
      saves.add(true);
      documents.add({'savesCount': 1});
      await Future<void>.delayed(Duration.zero);
      expect(events.last.saved, isTrue);
      expect(events.last.saves, 1);
      // Another account changes the full count without changing our bookmark.
      documents.add({'savesCount': 8});
      await Future<void>.delayed(Duration.zero);
      expect(events.last.saved, isTrue);
      expect(events.last.saves, 8);
      saves.add(false);
      documents.add({'savesCount': 7});
      await Future<void>.delayed(Duration.zero);
      expect(events.last.saved, isFalse);
      expect(events.last.saves, 7);
      await subscription.cancel();
      expect(documents.hasListener, isFalse);
      expect(reactions.hasListener, isFalse);
      expect(saves.hasListener, isFalse);
      await documents.close();
      await reactions.close();
      await saves.close();
    },
  );
  test(
    'external comment changes update the full counter without any reaction or local callback',
    () async {
      final documents = StreamController<Map<String, dynamic>?>();
      final reactions = StreamController<Map<String, dynamic>?>();
      final events = <LiveShoutState>[];
      final subscription = watchLiveShoutState(
        documents.stream,
        reactions.stream,
      ).listen(events.add);
      reactions.add(null);
      for (final count in [0, 1, 0, 73, 72]) {
        documents.add({
          'likesCount': 4,
          'dislikesCount': 2,
          'commentsCount': count,
        });
        await Future<void>.delayed(Duration.zero);
      }
      expect(events.map((e) => e.comments), [0, 1, 0, 73, 72]);
      expect(
        events.every(
          (e) => e.likes == 4 && e.dislikes == 2 && e.reaction == null,
        ),
        isTrue,
      );
      reactions.add({'type': 'like'});
      await Future<void>.delayed(Duration.zero);
      expect(events.last.comments, 72);
      expect(events.last.reaction, 'like');
      await subscription.cancel();
      expect(documents.hasListener, isFalse);
      expect(reactions.hasListener, isFalse);
      await documents.close();
      await reactions.close();
    },
  );

  test(
    'old documents without counters start at zero and current data replaces them',
    () async {
      final events = await watchLiveShoutState(
        Stream.fromIterable([
          <String, dynamic>{},
          {'commentsCount': 8},
        ]),
        Stream.value(null),
      ).toList();
      expect(events.first.comments, 0);
      expect(events.last.comments, 8);
      expect(events.last.likes, 0);
    },
  );
}
