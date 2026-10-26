import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/publication_attempt.dart';

void main() {
  test(
    'retry reuses one key while changed content starts another operation',
    () {
      final attempt = PublicationAttempt(clock: () => DateTime(2026));
      final first = attempt.keyFor([
        'title',
        'body',
        ['Dotaz'],
        120,
      ]);
      expect(
        attempt.keyFor([
          'title',
          'body',
          ['Dotaz'],
          120,
        ]),
        first,
      );
      final edited = attempt.keyFor([
        'title',
        'edited',
        ['Dotaz'],
        120,
      ]);
      expect(edited, isNot(first));
      expect(
        attempt.keyFor([
          'title',
          'edited',
          ['Dotaz'],
          120,
        ]),
        edited,
      );
      expect(
        attempt.keyFor([
          'title',
          'body',
          ['Dotaz'],
          120,
        ]),
        isNot(first),
      );
    },
  );

  test('draft delimiters cannot make different content reuse the same key', () {
    final attempt = PublicationAttempt(clock: () => DateTime(2026));
    final first = attempt.keyFor(['a, b', 'c']);
    expect(attempt.keyFor(['a', 'b, c']), isNot(first));
  });

  test('comment retry keys include account, Shout and public reply target', () {
    final attempt = PublicationAttempt(clock: () => DateTime(2026));
    final initial = attempt.keyFor(['uid', 'shout', 'text', null]);
    expect(attempt.keyFor(['uid', 'shout', 'text', null]), initial);
    final reply = attempt.keyFor(['uid', 'shout', 'text', 'parent']);
    expect(reply, isNot(initial));
    final otherShout = attempt.keyFor(['uid', 'other', 'text', 'parent']);
    expect(otherShout, isNot(reply));
    expect(
      attempt.keyFor(['other-uid', 'other', 'text', 'parent']),
      isNot(otherShout),
    );
  });

  test(
    'private retries keep their key while changing source starts a new operation',
    () {
      final attempt = PublicationAttempt(clock: () => DateTime(2026));
      final draft = [
        'privateReply',
        'uid',
        'shout',
        'text',
        'shout',
        null,
        null,
      ];
      final key = attempt.keyFor(draft);
      expect(attempt.keyFor(draft), key);
      final comment = attempt.keyFor([
        'privateReply',
        'uid',
        'shout',
        'text',
        'comment',
        'parent',
        null,
      ]);
      expect(comment, isNot(key));
      expect(
        attempt.keyFor([
          'privateReply',
          'uid',
          'shout',
          'text',
          'privateReply',
          null,
          'source',
        ]),
        isNot(comment),
      );
    },
  );
}
