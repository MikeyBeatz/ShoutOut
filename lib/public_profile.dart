import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/widgets.dart';

import 'avatar_style.dart';

class PublicIdentity {
  const PublicIdentity({required this.nickname, required this.avatarStyle});

  final String nickname;
  final AvatarStyle avatarStyle;
}

class PublicIdentityBuilder extends StatelessWidget {
  const PublicIdentityBuilder({
    super.key,
    required this.userId,
    required this.fallbackNickname,
    required this.fallbackAvatarStyle,
    required this.builder,
  });

  final String userId;
  final String fallbackNickname;
  final AvatarStyle fallbackAvatarStyle;
  final Widget Function(BuildContext context, PublicIdentity identity) builder;

  @override
  Widget build(BuildContext context) {
    final fallback = PublicIdentity(
      nickname: fallbackNickname,
      avatarStyle: fallbackAvatarStyle,
    );
    if (userId.isEmpty) return builder(context, fallback);
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('publicProfiles')
          .doc(userId)
          .snapshots(),
      builder: (context, snapshot) {
        final data = snapshot.data?.data();
        if (data == null) return builder(context, fallback);
        return builder(
          context,
          PublicIdentity(
            nickname: data['nickname'] as String? ?? fallbackNickname,
            avatarStyle: AvatarStyle.fromProfile(data),
          ),
        );
      },
    );
  }
}
