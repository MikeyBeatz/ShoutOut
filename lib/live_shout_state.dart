import 'live_data.dart';

/// Public counters come from the parent document, including comments outside
/// the visible page. Callable receipts and local increments are not live state.
class LiveShoutState {
  const LiveShoutState({
    required this.likes,
    required this.dislikes,
    required this.comments,
    required this.reaction,
  });

  final int likes;
  final int dislikes;
  final int comments;
  final String? reaction;
}

Stream<LiveShoutState> watchLiveShoutState(
  Stream<Map<String, dynamic>?> shout,
  Stream<Map<String, dynamic>?> ownReaction,
) => combineLatestValues(
  shout,
  ownReaction,
  (document, reaction) => LiveShoutState(
    likes: (document?['likesCount'] as num?)?.toInt() ?? 0,
    dislikes: (document?['dislikesCount'] as num?)?.toInt() ?? 0,
    comments: (document?['commentsCount'] as num?)?.toInt() ?? 0,
    reaction: reaction?['type'] as String?,
  ),
);
