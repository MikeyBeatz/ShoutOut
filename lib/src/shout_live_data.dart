part of '../main.dart';

class _ShoutInteraction {
  const _ShoutInteraction(this.reaction, this.saved);

  final String? reaction;
  final bool saved;

  void apply(Shout shout) {
    shout
      ..isLiked = reaction == 'like'
      ..isDisliked = reaction == 'dislike'
      ..isSaved = saved;
  }
}

Stream<_ShoutInteraction> _watchShoutInteraction(String shoutId, String uid) {
  final reference = FirebaseFirestore.instance
      .collection('shouts')
      .doc(shoutId);
  return combineLatestValues(
    reference.collection('reactions').doc(uid).liveSnapshots(),
    reference.collection('saves').doc(uid).liveSnapshots(),
    (reaction, save) =>
        _ShoutInteraction(reaction.data()?['type'] as String?, save.exists),
  );
}

KeyedLiveState<Shout, _ShoutInteraction> _shoutInteractions({
  required VoidCallback onChanged,
  required void Function(Object, StackTrace) onError,
}) {
  final uid = FirebaseAuth.instance.currentUser!.uid;
  return KeyedLiveState(
    keyOf: (shout) => shout.id,
    watch: (id) => _watchShoutInteraction(id, uid),
    apply: (shout, state) => state.apply(shout),
    onChanged: onChanged,
    onError: onError,
  );
}
