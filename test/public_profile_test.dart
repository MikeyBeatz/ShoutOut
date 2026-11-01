import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/public_profile.dart';
import 'package:shoutout/avatar_style.dart';

void main() {
  testWidgets(
    'a confirmed deleted identity stays anonymous through stream errors and resets for another UID',
    (tester) async {
      final first = StreamController<Map<String, dynamic>?>.broadcast();
      final second = StreamController<Map<String, dynamic>?>.broadcast();
      Widget view(String uid, Stream<Map<String, dynamic>?> snapshots) =>
          MaterialApp(
            home: PublicIdentityBuilder(
              userId: uid,
              profileData: snapshots,
              fallbackNickname: 'Snapshot fallback',
              fallbackAvatarStyle: AvatarStyle.fallback,
              builder: (_, identity) =>
                  Text('${identity.nickname}:${identity.publicRole ?? '-'}'),
            ),
          );
      await tester.pumpWidget(view('first', first.stream));
      first.add({'nickname': 'Current', 'publicRole': 'business'});
      await tester.pumpAndSettle();
      expect(find.text('Current:business'), findsOneWidget);
      first.add({'schemaVersion': 1, 'accountStatus': 'deleted'});
      await tester.pumpAndSettle();
      expect(find.text('Deleted account:-'), findsOneWidget);
      first.addError(StateError('network failed'));
      await tester.pumpAndSettle();
      expect(find.text('Deleted account:-'), findsOneWidget);
      expect(find.text('Snapshot fallback:-'), findsNothing);
      await tester.pumpWidget(view('second', second.stream));
      expect(find.text('Snapshot fallback:-'), findsOneWidget);
      second.add({'nickname': 'Another user'});
      await tester.pumpAndSettle();
      expect(find.text('Another user:-'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      await first.close();
      await second.close();
    },
  );
  testWidgets(
    'private action disappears after deletion and cannot return on a stream error',
    (tester) async {
      final snapshots = StreamController<Map<String, dynamic>?>.broadcast();
      await tester.pumpWidget(
        MaterialApp(
          home: AvailableAccountAction(
            userId: 'target',
            profileData: snapshots.stream,
            child: TextButton(
              onPressed: () {},
              child: const Text('Private reply'),
            ),
          ),
        ),
      );
      snapshots.add({'nickname': 'Active'});
      await tester.pumpAndSettle();
      expect(find.text('Private reply'), findsOneWidget);
      snapshots.add({'accountStatus': 'deleted'});
      await tester.pumpAndSettle();
      expect(find.text('Private reply'), findsNothing);
      snapshots.addError(StateError('offline'));
      await tester.pumpAndSettle();
      expect(find.text('Private reply'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      await snapshots.close();
    },
  );
  test(
    'a deleted identity drops stale names, avatar, role and Business logo',
    () {
      final identity = PublicIdentity.fromProfile(
        {
          'schemaVersion': 1,
          'accountStatus': 'deleted',
          'nickname': 'Must not be displayed',
          'publicRole': 'business',
          'businessLogoPath': 'businessLogos/old/logo-1.png',
          'businessLogoVersion': 1,
        },
        fallbackNickname: 'Old snapshot',
        fallbackAvatarStyle: AvatarStyle.fallback,
        deletedNickname: 'Smazaný účet',
      );
      expect(identity.nickname, 'Smazaný účet');
      expect(identity.isDeleted, isTrue);
      expect(identity.publicRole, isNull);
      expect(identity.businessLogoPath, isNull);
      expect(identity.businessLogoVersion, isNull);
    },
  );
  test(
    'missing legacy identity retains its normal fallback without claiming deletion',
    () {
      final identity = PublicIdentity.fromProfile(
        null,
        fallbackNickname: 'Existing user',
        fallbackAvatarStyle: AvatarStyle.fallback,
        deletedNickname: 'Smazaný účet',
      );
      expect(identity.nickname, 'Existing user');
      expect(identity.isDeleted, isFalse);
      final active = PublicIdentity.fromProfile(
        {'nickname': 'Current', 'publicRole': 'business'},
        fallbackNickname: 'Old',
        fallbackAvatarStyle: AvatarStyle.fallback,
        deletedNickname: 'Smazaný účet',
      );
      expect(active.nickname, 'Current');
      expect(active.publicRole, 'business');
      expect(active.isDeleted, isFalse);
    },
  );
  testWidgets(
    'deleted profile card renders the anonymous avatar without loading Storage',
    (tester) async {
      final identity = PublicIdentity.fromProfile(
        {'accountStatus': 'deleted'},
        fallbackNickname: 'Old',
        fallbackAvatarStyle: AvatarStyle.fallback,
        deletedNickname: 'Smazaný účet',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: PublicProfileCard(identity: identity)),
        ),
      );
      expect(find.text('Smazaný účet'), findsOneWidget);
      expect(find.byIcon(Icons.person_outline), findsOneWidget);
      expect(find.byType(Image), findsNothing);
      expect(find.byType(PublicRoleFlair), findsNothing);
      expect(find.text('Old'), findsNothing);
    },
  );
  test('public role labels preserve the approved visible hierarchy', () {
    const locale = Locale('cs');
    expect(publicRoleLabel(locale, 'business'), 'Business');
    expect(publicRoleLabel(locale, 'moderator'), 'Moderátor');
    expect(publicRoleLabel(locale, 'seniorModerator'), 'Moderátor');
    expect(publicRoleLabel(locale, 'administrator'), 'Admin');
    expect(publicRoleLabel(locale, 'owner'), 'Owner');
    expect(publicRoleLabel(locale, 'user'), isNull);
    expect(publicRoleLabel(locale, 'unknown'), isNull);
  });

  test('public role labels are localized where needed', () {
    expect(publicRoleLabel(const Locale('en'), 'owner'), 'Owner');
    expect(publicRoleLabel(const Locale('de'), 'owner'), 'Owner');
    expect(publicRoleLabel(const Locale('uk'), 'moderator'), 'Модератор');
    expect(publicRoleLabel(const Locale('vi'), 'moderator'), 'Kiểm duyệt viên');
  });
}
