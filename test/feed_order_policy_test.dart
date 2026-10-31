import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/main.dart';

Shout row(
  String id, {
  double distance = 1,
  int likes = 0,
  int dislikes = 0,
  int ends = 20,
  int created = 1,
  String author = 'author',
}) => Shout(
  id: id,
  authorId: author,
  author: author,
  title: id,
  text: 'Text',
  categories: ['Dotaz'],
  distanceKm: distance,
  createdAt: DateTime(2026, 1, created),
  expiresAt: DateTime(2026, 2, ends),
  likes: likes,
  dislikes: dislikes,
);
List<String> ids(List<Shout> rows) => rows.map((shout) => shout.id).toList();
void main() {
  test('negative content retains correct nearest/time/followed position', () {
    final negative = row(
      'negative',
      distance: 1,
      likes: 1,
      dislikes: 99,
      ends: 1,
    );
    final positive = row('positive', distance: 2, likes: 10, ends: 2);
    for (final mode in [
      FeedOrder.nearest,
      FeedOrder.endingSoon,
      FeedOrder.followed,
    ]) {
      expect(ids(orderedFeedShouts([positive, negative], mode)), [
        'negative',
        'positive',
      ]);
    }
    expect(negative.isHiddenByRating, true);
    expect(ids(orderedFeedShouts([negative, positive], FeedOrder.popular)), [
      'positive',
      'negative',
    ]);
  });
  test(
    'unread negative Shout stays among unread; other modes ignore read grouping',
    () {
      final read = row('read', distance: 1, likes: 10),
          unread = row('unread', distance: 2, likes: 1, dislikes: 99);
      expect(
        ids(
          orderedFeedShouts(
            [read, unread],
            FeedOrder.nearest,
            readIds: {'read'},
          ),
        ),
        ['unread', 'read'],
      );
      expect(
        ids(
          orderedFeedShouts(
            [unread, read],
            FeedOrder.popular,
            readIds: {'read'},
          ),
        ),
        ['read', 'unread'],
      );
    },
  );
  test(
    'ties use creation time then ID without mutating source or reacting to read changes',
    () {
      final source = [row('b'), row('a'), row('new', created: 2)];
      final read = <String>{};
      final snapshot = orderedFeedShouts(
        source,
        FeedOrder.nearest,
        readIds: read,
      );
      expect(ids(snapshot), ['new', 'a', 'b']);
      expect(ids(source), ['b', 'a', 'new']);
      read.add('new');
      expect(ids(snapshot), ['new', 'a', 'b']);
    },
  );
}
