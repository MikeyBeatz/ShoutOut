import 'live_data.dart';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';

import 'avatar_style.dart';

class PublicIdentity {
  const PublicIdentity({
    required this.nickname,
    required this.avatarStyle,
    this.publicRole,
    this.businessLogoPath,
    this.businessLogoVersion,
  });

  final String nickname;
  final AvatarStyle avatarStyle;
  final String? publicRole;
  final String? businessLogoPath;
  final int? businessLogoVersion;
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
          .liveSnapshots(),
      builder: (context, snapshot) {
        final data = snapshot.data?.data();
        if (data == null) return builder(context, fallback);
        return builder(
          context,
          PublicIdentity(
            nickname: data['nickname'] as String? ?? fallbackNickname,
            avatarStyle: AvatarStyle.fromProfile(data),
            publicRole: data['publicRole'] as String?,
            businessLogoPath: data['businessLogoPath'] as String?,
            businessLogoVersion: data['businessLogoVersion'] as int?,
          ),
        );
      },
    );
  }
}

class PublicIdentityAvatar extends StatelessWidget {
  const PublicIdentityAvatar({
    super.key,
    required this.identity,
    required this.radius,
  });

  final PublicIdentity identity;
  final double radius;

  static final Map<String, Future<Uint8List?>> _logoBytes = {};

  @override
  Widget build(BuildContext context) {
    final path = identity.businessLogoPath;
    final version = identity.businessLogoVersion;
    final fallback = AvatarImage(
      avatarId: identity.avatarStyle.avatarId,
      style: identity.avatarStyle,
      radius: radius,
    );
    if (path == null || version == null) return fallback;
    final cacheKey = '$path@$version';
    return FutureBuilder<Uint8List?>(
      future: _logoBytes.putIfAbsent(
        cacheKey,
        () => FirebaseStorage.instance.ref(path).getData(2 * 1024 * 1024),
      ),
      builder: (context, snapshot) {
        final bytes = snapshot.data;
        if (bytes == null) return fallback;
        return ClipOval(
          child: Image.memory(
            bytes,
            width: radius * 2,
            height: radius * 2,
            fit: BoxFit.cover,
            gaplessPlayback: true,
            errorBuilder: (_, _, _) => fallback,
          ),
        );
      },
    );
  }
}

String? publicRoleLabel(Locale locale, String? role) {
  if (role == null) return null;
  final language = locale.languageCode;
  return switch (role) {
    'business' => 'Business',
    'moderator' || 'seniorModerator' => switch (language) {
      'cs' => 'Moderátor',
      'de' => 'Moderator',
      'pl' => 'Moderator',
      'sk' => 'Moderátor',
      'uk' => 'Модератор',
      'vi' => 'Kiểm duyệt viên',
      _ => 'Moderator',
    },
    'administrator' => 'Admin',
    'owner' => 'Owner',
    _ => null,
  };
}

class PublicRoleFlair extends StatelessWidget {
  const PublicRoleFlair({super.key, required this.role});

  final String? role;

  @override
  Widget build(BuildContext context) {
    final label = publicRoleLabel(Localizations.localeOf(context), role);
    if (label == null) return const SizedBox.shrink();
    final colors = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: colors.secondaryContainer,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: colors.outlineVariant),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.clip,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: colors.onSecondaryContainer,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class PublicProfileCard extends StatelessWidget {
  const PublicProfileCard({
    super.key,
    required this.identity,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.avatarRadius = 28,
  });

  final PublicIdentity identity;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final double avatarRadius;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            PublicIdentityAvatar(identity: identity, radius: avatarRadius),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          identity.nickname,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                      ),
                      if (identity.publicRole != null) ...[
                        const SizedBox(width: 7),
                        PublicRoleFlair(role: identity.publicRole),
                      ],
                    ],
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 8), trailing!],
          ],
        ),
      ),
    ),
  );
}
