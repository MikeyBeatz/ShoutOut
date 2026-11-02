import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/main.dart';

void main() {
  test(
    'minimal purged context parses without identity, text or location fields',
    () {
      final shout = Shout.fromData('anonymous-context', {
        'schemaVersion': 1,
        'status': 'deleted',
        'contentPurged': true,
      });
      expect(shout.id, 'anonymous-context');
      expect(shout.status, ShoutStatus.deleted);
      expect(shout.authorId, isEmpty);
      expect(shout.author, isEmpty);
      expect(shout.title, isEmpty);
      expect(shout.text, isEmpty);
      expect(shout.categories, isEmpty);
      expect(shout.isActive, isFalse);
      expect(shout.geography.geohash, isEmpty);
    },
  );
}
