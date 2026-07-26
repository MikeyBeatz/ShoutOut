import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/main.dart';

Shout _shout({
  DateTime? createdAt,
  DateTime? expiresAt,
  int likes = 0,
  int dislikes = 0,
  ShoutStatus status = ShoutStatus.active,
  double distanceKm = 0,
}) => Shout(
  id: 'test-shout',
  author: 'Tester',
  title: 'Test',
  text: 'Test content',
  categories: const ['Test'],
  distanceKm: distanceKm,
  createdAt: createdAt ?? DateTime.now().subtract(const Duration(minutes: 5)),
  expiresAt: expiresAt ?? DateTime.now().add(const Duration(hours: 1)),
  likes: likes,
  dislikes: dislikes,
  status: status,
);

void main() {
  group('Shout status', () {
    test('future shout is active', () {
      final shout = _shout(
        expiresAt: DateTime.now().add(const Duration(days: 1)),
      );

      expect(shout.effectiveStatus, ShoutStatus.active);
      expect(shout.isActive, isTrue);
      expect(shout.isRetainedExpired, isFalse);
    });

    test('past shout is retained for seven days', () {
      final shout = _shout(
        expiresAt: DateTime.now().subtract(const Duration(days: 2)),
      );

      expect(shout.effectiveStatus, ShoutStatus.expired);
      expect(shout.isRetainedExpired, isTrue);
      expect(shout.isExpiredBeyondRetention, isFalse);
    });

    test('old shout is beyond retention', () {
      final shout = _shout(
        expiresAt: DateTime.now().subtract(const Duration(days: 8)),
      );

      expect(shout.effectiveStatus, ShoutStatus.expired);
      expect(shout.isExpiredBeyondRetention, isTrue);
      expect(shout.isRetainedExpired, isFalse);
    });

    test('deleted status takes precedence over expiry time', () {
      final shout = _shout(
        expiresAt: DateTime.now().add(const Duration(days: 1)),
        status: ShoutStatus.deleted,
      );

      expect(shout.effectiveStatus, ShoutStatus.deleted);
      expect(shout.isActive, isFalse);
    });
  });

  group('Shout rating thresholds', () {
    test('does not classify fewer than ten reactions as low rated', () {
      final shout = _shout(likes: 0, dislikes: 9);

      expect(shout.isLowRated, isFalse);
      expect(shout.isHiddenByRating, isFalse);
    });

    test('classifies seventy percent dislikes as low rated', () {
      final shout = _shout(likes: 3, dislikes: 7);

      expect(shout.reactionCount, 10);
      expect(shout.dislikeRatio, closeTo(.7, .0001));
      expect(shout.isLowRated, isTrue);
      expect(shout.isHiddenByRating, isFalse);
    });

    test('hides content at fifty reactions and eighty percent dislikes', () {
      final shout = _shout(likes: 10, dislikes: 40);

      expect(shout.reactionCount, 50);
      expect(shout.isLowRated, isTrue);
      expect(shout.isHiddenByRating, isTrue);
    });
  });

  group('Shout distance label', () {
    test('uses metres below one kilometre', () {
      expect(_shout(distanceKm: .42).distanceLabel, '420 m');
    });

    test('removes an unnecessary decimal for whole kilometres', () {
      expect(_shout(distanceKm: 1).distanceLabel, '1 km');
    });

    test('rounds kilometre distance to one decimal place', () {
      expect(_shout(distanceKm: 1.25).distanceLabel, '1.3 km');
    });
  });
}
