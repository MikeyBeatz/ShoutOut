import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/live_shout_state.dart';

void main() {
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
