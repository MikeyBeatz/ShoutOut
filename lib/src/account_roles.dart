part of '../main.dart';

final _accountRoleStreams = <String, Stream<AccountRole>>{};

Stream<AccountRole> _watchAccountRole(String userId) => _accountRoleStreams
    .putIfAbsent(userId, () => _loadAccountRole(userId).asBroadcastStream());

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
