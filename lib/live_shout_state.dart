import 'live_data.dart';

/// Public counters come from the parent document, including comments outside
/// the visible page. Callable receipts and local increments are not live state.
class LiveShoutState {
  const LiveShoutState({
    required this.likes,
    required this.dislikes,
    required this.comments,
    required this.reaction,
    required this.saves,
    required this.saved,
  });

  final int likes;
  final int dislikes;
  final int comments;
  final String? reaction;
  final int saves;
  final bool saved;
}

Stream<LiveShoutState> watchLiveShoutState(
  Stream<Map<String, dynamic>?> shout,
  Stream<Map<String, dynamic>?> ownReaction, {
  Stream<bool>? ownSave,
}) => combineLatestValues(
  combineLatestValues(
    shout,
    ownReaction,
    (document, reaction) => (document, reaction),
  ),
  ownSave ?? Stream.value(false),
  (state, saved) => LiveShoutState(
    likes: (state.$1?['likesCount'] as num?)?.toInt() ?? 0,
    dislikes: (state.$1?['dislikesCount'] as num?)?.toInt() ?? 0,
    comments: (state.$1?['commentsCount'] as num?)?.toInt() ?? 0,
    reaction: state.$2?['type'] as String?,
    saves: (state.$1?['savesCount'] as num?)?.toInt() ?? 0,
    saved: saved,
  ),
);
