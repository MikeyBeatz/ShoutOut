part of '../main.dart';

Stream<AccountRole> _watchAccountRole(String userId) =>
    _loadAccountRole(userId);

Stream<AccountRole> _loadAccountRole(String userId) async* {
  await for (final snapshot
      in FirebaseFirestore.instance
          .collection('accountRoles')
          .doc(userId)
          .snapshots()) {
    if (snapshot.exists) {
      yield AccountRole.fromData(snapshot.data());
      continue;
    }

    // Compatibility for staff accounts created before hierarchical roles.
    final legacyModerator = await FirebaseFirestore.instance
        .collection('moderators')
        .doc(userId)
        .get();
    yield legacyModerator.exists ? AccountRole.moderator : AccountRole.user;
  }
}
