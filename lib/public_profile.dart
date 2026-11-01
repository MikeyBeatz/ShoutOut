import 'live_data.dart';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';

import 'avatar_style.dart';
import 'l10n/text.dart';

class PublicIdentity {
  const PublicIdentity({
    required this.nickname,
    required this.avatarStyle,
    this.publicRole,
    this.businessLogoPath,
    this.businessLogoVersion,
    this.isDeleted = false,
  });

  final String nickname;
  final AvatarStyle avatarStyle;
  final String? publicRole;
  final String? businessLogoPath;
  final int? businessLogoVersion;
  final bool isDeleted;

  static PublicIdentity fromProfile(
    Map<String, dynamic>? data, {
    required String fallbackNickname,
    required AvatarStyle fallbackAvatarStyle,
    required String deletedNickname,
  }) {
    if (data?['accountStatus'] == 'deleted') {
      return PublicIdentity(
        nickname: deletedNickname,
        avatarStyle: AvatarStyle.fallback,
        isDeleted: true,
      );
    }
    if (data == null) {
      return PublicIdentity(
        nickname: fallbackNickname,
        avatarStyle: fallbackAvatarStyle,
      );
    }
    return PublicIdentity(
      nickname: data['nickname'] as String? ?? fallbackNickname,
      avatarStyle: AvatarStyle.fromProfile(data),
      publicRole: data['publicRole'] as String?,
      businessLogoPath: data['businessLogoPath'] as String?,
      businessLogoVersion: data['businessLogoVersion'] as int?,
    );
  }
}

class PublicIdentityBuilder extends StatefulWidget {
  const PublicIdentityBuilder({
    super.key,
    required this.userId,
    required this.fallbackNickname,
    required this.fallbackAvatarStyle,
    required this.builder,
    this.profileData,
  });

  final String userId;
  final String fallbackNickname;
  final AvatarStyle fallbackAvatarStyle;
  final Widget Function(BuildContext context, PublicIdentity identity) builder;
  final Stream<Map<String, dynamic>?>? profileData;

  @override
  State<PublicIdentityBuilder> createState() => _PublicIdentityBuilderState();
}

class _PublicIdentityBuilderState extends State<PublicIdentityBuilder> {
  bool _knownDeleted = false;
  late Stream<Map<String, dynamic>?> _profiles;

  Stream<Map<String, dynamic>?> _source() {
    if (widget.userId.isEmpty) return const Stream.empty();
    final uid = widget.userId;
    final source =
        widget.profileData ??
        FirebaseFirestore.instance
            .collection('publicProfiles')
            .doc(uid)
            .liveSnapshots()
            .map((snapshot) => snapshot.data());
    return source.map((data) {
      // Observe the event before StreamBuilder coalesces frames/errors.
      if (mounted &&
          widget.userId == uid &&
          data?['accountStatus'] == 'deleted') {
        _knownDeleted = true;
      }
      return data;
    });
  }

  @override
  void initState() {
    super.initState();
    _profiles = _source();
  }

  @override
  void didUpdateWidget(covariant PublicIdentityBuilder oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.userId != widget.userId) _knownDeleted = false;
    if (oldWidget.userId != widget.userId ||
        oldWidget.profileData != widget.profileData) {
      _profiles = _source();
    }
  }

  @override
  Widget build(BuildContext context) {
    final fallback = PublicIdentity(
      nickname: widget.fallbackNickname,
      avatarStyle: widget.fallbackAvatarStyle,
    );
    if (widget.userId.isEmpty) return widget.builder(context, fallback);
    return StreamBuilder<Map<String, dynamic>?>(
      key: ValueKey(widget.userId),
      stream: _profiles,
      builder: (context, snapshot) {
        final data = snapshot.data;
        if (data?['accountStatus'] == 'deleted') _knownDeleted = true;
        final identity = PublicIdentity.fromProfile(
          _knownDeleted ? const {'accountStatus': 'deleted'} : data,
          fallbackNickname: widget.fallbackNickname,
          fallbackAvatarStyle: widget.fallbackAvatarStyle,
          deletedNickname: tr(context, 'Smazaný účet'),
        );
        if (identity.isDeleted) {
          PublicIdentityAvatar.forgetUserLogo(widget.userId);
        }
        return widget.builder(context, identity);
      },
    );
  }
}

/// Shares the same live document as the author header; no second SDK query.
class AvailableAccountAction extends StatelessWidget {
  const AvailableAccountAction({
    super.key,
    required this.userId,
    required this.child,
    this.profileData,
  });
  final String userId;
  final Widget child;
  final Stream<Map<String, dynamic>?>? profileData;

  @override
  Widget build(BuildContext context) => PublicIdentityBuilder(
    userId: userId,
    profileData: profileData,
    fallbackNickname: '',
    fallbackAvatarStyle: AvatarStyle.fallback,
    builder: (context, identity) =>
        identity.isDeleted ? const SizedBox.shrink() : child,
  );
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

  static void forgetUserLogo(String userId) {
    _logoBytes.removeWhere(
      (key, _) => key.startsWith('businessLogos/$userId/'),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (identity.isDeleted) {
      return CircleAvatar(
        radius: radius,
        child: Icon(Icons.person_outline, size: radius),
      );
    }
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
