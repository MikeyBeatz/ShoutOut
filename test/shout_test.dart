import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/avatar_style.dart';
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
  test('Business Shout keeps its branch name after profile refresh', () {
    final shout = Shout(
      id: 'business-shout',
      authorId: 'business-user',
      author: 'Centrum Brno',
      title: 'Novinka',
      text: 'Text',
      categories: const ['Obecné'],
      distanceKm: 1,
      createdAt: DateTime(2026),
      expiresAt: DateTime(2027),
      businessLocationId: 'brno-centre',
      businessAuthorFormat: 'branch',
    );

    expect(shout.displayedAuthor('Kavárny Novák'), 'Centrum Brno');
  });

  test('legacy Business Shout hides the historical company prefix', () {
    final shout = Shout(
      id: 'legacy-business-shout',
      authorId: 'business-user',
      author: 'Kavárny Novák – Centrum Brno',
      title: 'Novinka',
      text: 'Text',
      categories: const ['Obecné'],
      distanceKm: 1,
      createdAt: DateTime(2026),
      expiresAt: DateTime(2027),
      businessLocationId: 'brno-centre',
    );

    expect(shout.displayedAuthor('Kavárny Novák'), 'Centrum Brno');
  });

  test('new Business branch name may contain its own company prefix', () {
    final shout = Shout(
      id: 'explicit-business-shout',
      authorId: 'business-user',
      author: 'Kavárny Novák – Centrum Brno',
      title: 'Novinka',
      text: 'Text',
      categories: const ['Obecné'],
      distanceKm: 1,
      createdAt: DateTime(2026),
      expiresAt: DateTime(2027),
      businessLocationId: 'brno-centre',
      businessAuthorFormat: 'branch',
    );

    expect(
      shout.displayedAuthor('Kavárny Novák'),
      'Kavárny Novák – Centrum Brno',
    );
  });

  test('regular Shout follows the current public nickname', () {
    final shout = Shout(
      id: 'regular-shout',
      authorId: 'regular-user',
      author: 'Staré jméno',
      title: 'Novinka',
      text: 'Text',
      categories: const ['Obecné'],
      distanceKm: 1,
      createdAt: DateTime(2026),
      expiresAt: DateTime(2027),
    );

    expect(shout.displayedAuthor('Nové jméno'), 'Nové jméno');
  });

  test('normalizes only a lowercase initial title character', () {
    expect(
      titleWithInitialCapital('  sousedská slavnost  '),
      'Sousedská slavnost',
    );
    expect(titleWithInitialCapital('GPS nefunguje'), 'GPS nefunguje');
    expect(titleWithInitialCapital('🛩️ letadlo'), '🛩️ letadlo');
    expect(titleWithInitialCapital('Žluté kolo'), 'Žluté kolo');
  });

  test('feed order uses one compact label in the menu and selected state', () {
    expect(FeedOrder.values.map((order) => order.label), [
      'Nejblíž',
      'Top',
      'Končící',
      'Sledované',
    ]);
  });

  group('Avatar style', () {
    test('offers twenty-four avatars and sixteen background colors', () {
      expect(AvatarStyle.avatarIds, hasLength(24));
      expect(AvatarStyle.colors, hasLength(16));
      expect(AvatarStyle.avatarIds, containsAll(['bear', 'parrot']));
      expect(AvatarStyle.colors.keys, containsAll(['sky', 'slate']));
    });

    test('random styles always use supported colors', () {
      for (var index = 0; index < 100; index++) {
        final style = AvatarStyle.random();
        expect(AvatarStyle.avatarIds, contains(style.avatarId));
        expect(AvatarStyle.colors, contains(style.startColorId));
        expect(AvatarStyle.colors, contains(style.endColorId));
      }
    });

    test('a solid single-color background is supported', () {
      const style = AvatarStyle(
        avatarId: 'fox',
        startColorId: 'teal',
        endColorId: 'teal',
        direction: AvatarGradientDirection.horizontal,
      );

      expect(style.startColor, style.endColor);
      expect(style.toFirestore()['avatarBackgroundStart'], 'teal');
      expect(style.toFirestore()['avatarBackgroundEnd'], 'teal');
    });

    test('legacy profiles receive a compatible gradient', () {
      final style = AvatarStyle.fromProfile({'avatarId': 'owl'});

      expect(style.avatarId, 'owl');
      expect(style.startColorId, AvatarStyle.fallback.startColorId);
      expect(style.endColorId, AvatarStyle.fallback.endColorId);
    });
  });

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
