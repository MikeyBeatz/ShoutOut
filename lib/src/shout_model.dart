part of '../main.dart';

enum FeedOrder { nearest, popular, endingSoon }

extension on FeedOrder {
  String get label => switch (this) {
    FeedOrder.nearest => 'Nejbližší',
    FeedOrder.popular => 'Oblíbené',
    FeedOrder.endingSoon => 'Brzy končí',
  };

  String get compactLabel => switch (this) {
    FeedOrder.nearest => 'Nejblíž',
    FeedOrder.popular => 'Top',
    FeedOrder.endingSoon => 'Končící',
  };
}

enum ShoutStatus { active, expired, deleted }

const _expiredShoutRetention = Duration(days: 7);

class Shout {
  Shout({
    required this.id,
    this.authorId = '',
    required this.author,
    required this.title,
    required this.text,
    required this.categories,
    required this.distanceKm,
    required this.createdAt,
    required this.expiresAt,
    this.likes = 0,
    this.dislikes = 0,
    this.comments = 0,
    this.saves = 0,
    this.status = ShoutStatus.active,
  });

  factory Shout.fromDocument(
    DocumentSnapshot<Map<String, dynamic>> document, {
    double distanceKm = 0,
  }) {
    final data = document.data()!;
    return Shout(
      id: document.id,
      authorId: data['authorId'] as String,
      author: data['authorNickname'] as String,
      title: data['title'] as String,
      text: data['text'] as String,
      categories: List<String>.from(data['categories'] as List),
      distanceKm: distanceKm,
      createdAt: (data['createdAt'] as Timestamp).toDate(),
      expiresAt: (data['expiresAt'] as Timestamp).toDate(),
      likes: data['likesCount'] as int? ?? 0,
      dislikes: data['dislikesCount'] as int? ?? 0,
      comments: data['commentsCount'] as int? ?? 0,
      saves: data['savesCount'] as int? ?? 0,
      status: switch (data['status']) {
        'deleted' => ShoutStatus.deleted,
        'expired' => ShoutStatus.expired,
        _ => ShoutStatus.active,
      },
    );
  }
  final String id;
  final String authorId;
  final String author;
  final String title;
  final String text;
  final List<String> categories;
  final double distanceKm;
  final DateTime createdAt;
  final DateTime expiresAt;
  int likes;
  int dislikes;
  int comments;
  int saves;
  bool isSaved = false;
  bool isLiked = false;
  bool isDisliked = false;
  ShoutStatus status;
  ShoutStatus get effectiveStatus {
    if (status == ShoutStatus.deleted) return ShoutStatus.deleted;
    return expiresAt.isAfter(DateTime.now())
        ? ShoutStatus.active
        : ShoutStatus.expired;
  }

  bool get isActive => effectiveStatus == ShoutStatus.active;

  bool get isExpiredBeyondRetention =>
      effectiveStatus == ShoutStatus.expired &&
      DateTime.now().isAfter(expiresAt.add(_expiredShoutRetention));

  bool get isRetainedExpired =>
      effectiveStatus == ShoutStatus.expired && !isExpiredBeyondRetention;

  int get reactionCount => likes + dislikes;
  double get dislikeRatio => reactionCount == 0 ? 0 : dislikes / reactionCount;
  bool get isLowRated => reactionCount >= 10 && dislikeRatio >= .7;
  bool get isHiddenByRating => reactionCount >= 50 && dislikeRatio >= .8;
  String get distanceLabel => distanceKm < 1
      ? '${(distanceKm * 1000).round()} m'
      : '${distanceKm.toStringAsFixed(1).replaceAll('.0', '')} km';
  String get ageLabel {
    final minutes = DateTime.now().difference(createdAt).inMinutes;
    return minutes < 1 ? 'teď' : 'před $minutes min';
  }

  String expiryLabel(BuildContext context) {
    final difference = expiresAt.difference(DateTime.now());
    if (!difference.isNegative) {
      return switch (Localizations.localeOf(context).languageCode) {
        'en' => 'ending in ${localizedDurationLabel(context, difference)}',
        'de' => 'endet in ${localizedDurationLabel(context, difference)}',
        'pl' => 'wygasa za ${localizedDurationLabel(context, difference)}',
        'sk' => 'končí o ${localizedDurationLabel(context, difference)}',
        'uk' =>
          'завершується через ${localizedDurationLabel(context, difference)}',
        'vi' => 'kết thúc sau ${localizedDurationLabel(context, difference)}',
        _ => 'končí za ${localizedDurationLabel(context, difference)}',
      };
    }
    final past = localizedDurationLabel(context, difference.abs());
    return switch (Localizations.localeOf(context).languageCode) {
      'en' => 'expired $past ago',
      'de' => 'vor $past abgelaufen',
      'pl' => 'wygasł $past temu',
      'sk' => 'platnosť vypršala pred $past',
      'uk' => 'термін дії минув $past тому',
      'vi' => 'đã hết hạn $past trước',
      _ => 'expiroval před $past',
    };
  }
}

String localizedDurationLabel(BuildContext context, Duration duration) {
  final language = Localizations.localeOf(context).languageCode;
  final (days, hours, minutes) = switch (language) {
    'en' => ('days', 'h', 'min'),
    'de' => ('Tagen', 'Std.', 'Min.'),
    'pl' => ('dni', 'godz.', 'min'),
    'sk' => ('dní', 'h', 'min'),
    'uk' => ('дн.', 'год', 'хв'),
    'vi' => ('ngày', 'giờ', 'phút'),
    _ => ('dny', 'h', 'min'),
  };
  if (duration.inDays >= 1) {
    final remainingHours = duration.inHours.remainder(24);
    return remainingHours == 0
        ? '${duration.inDays} $days'
        : '${duration.inDays} $days $remainingHours $hours';
  }
  if (duration.inHours >= 1 && duration.inMinutes.remainder(60) > 0) {
    return '${duration.inHours} $hours ${duration.inMinutes.remainder(60)} $minutes';
  }
  if (duration.inHours >= 1) return '${duration.inHours} $hours';
  return '${duration.inMinutes} $minutes';
}
