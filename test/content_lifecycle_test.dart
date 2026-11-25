import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/main.dart';
import 'package:shoutout/content_lifecycle_policy.dart';
import 'package:shoutout/archived_comment_target.dart';

void main() {
  Map<String, dynamic> row({bool history = true}) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return {
      'id': 'owned',
      'distanceKm': 0,
      'data': <String, dynamic>{
        'authorId': 'owner',
        'authorNickname': 'Owner',
        'title': 'History',
        'text': 'Original text',
        'categories': ['Dotaz'],
        'status': 'deleted',
        'createdAt': now - 1000,
        'expiresAt': now + 86400000,
        if (history) ...{
          'readOnlyHistory': true,
          'historyUntil': now + 604800000,
        },
      },
    };
  }

  test(
    'a manually deleted own history body remains readable but never active',
    () {
      final shout = decodeSpatialFeedItem(row());
      expect(shout.status, ShoutStatus.deleted);
      expect(shout.readOnlyHistory, isTrue);
      expect(shout.isRetainedExpired, isTrue);
      expect(shout.isActive, isFalse);
      expect(shout.text, 'Original text');
      final old = decodeSpatialFeedItem(row(history: false));
      expect(old.isRetainedExpired, isFalse);
      expect(old.historyUntil, isNull);
    },
  );

  test('history deadline is required and must be finite', () {
    for (final value in [null, double.nan, -1, 'later']) {
      final data = row();
      (data['data'] as Map)['historyUntil'] = value;
      expect(() => decodeSpatialFeedItem(data), throwsStateError);
    }
  });

  test(
    'reported Shout decode preserves its title without returning arbitrary archive fields',
    () {
      final decoded = decodeArchivedCommentTarget({
        'archived': true,
        'targetData': {
          'authorId': 'owner',
          'text': 'Evidence',
          'title': 'Archived title',
          'createdAtMillis': 1795520000000,
          'participants': ['owner', 'recipient'],
        },
      });
      expect(decoded['title'], 'Archived title');
      expect(decoded.containsKey('participants'), isFalse);
    },
  );

  test(
    'prepared disclosures cover every supported language and both fixed periods',
    () {
      for (final locale in ['cs', 'en', 'de', 'pl', 'sk', 'uk', 'vi']) {
        final text = contentLifecyclePrivacyBody(locale);
        expect(text, contains('7'));
        expect(text, contains('60'));
        expect(text, contains('Firebase'));
        expect(text, isNot(contains('68')));
      }
    },
  );
}
