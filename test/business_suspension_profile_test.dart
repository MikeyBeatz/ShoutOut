import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/account_role.dart';
import 'package:shoutout/avatar_style.dart';
import 'package:shoutout/business_access_scope.dart';
import 'package:shoutout/l10n/app_localizations.dart';
import 'package:shoutout/main.dart';

double contrast(Color a, Color b) =>
    (math.max(a.computeLuminance(), b.computeLuminance()) + .05) /
    (math.min(a.computeLuminance(), b.computeLuminance()) + .05);

void main() {
  test(
    'malformed avatar fields use existing defaults and preserve valid fields',
    () {
      for (final value in [1, true, <String>[], <String, String>{}]) {
        final style = AvatarStyle.fromProfile({
          'avatarId': value,
          'avatarBackgroundStart': value,
          'avatarBackgroundEnd': 'coral',
          'avatarGradientDirection': value,
        });
        expect(style.avatarId, AvatarStyle.fallback.avatarId);
        expect(style.startColorId, AvatarStyle.fallback.startColorId);
        expect(style.endColorId, 'coral');
        expect(style.direction, AvatarStyle.fallback.direction);
      }
    },
  );

  for (final brightness in Brightness.values) {
    testWidgets(
      'suspended $brightness profile renders bad avatar and keeps logout usable',
      (tester) async {
        // A compact viewport catches banners pushing the logout below the screen.
        tester.view.physicalSize = const Size(390, 720);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final roles = StreamController<AccountRole>.broadcast();
        addTearDown(roles.close);
        var signedOut = false;
        final theme = ThemeData(brightness: brightness, useMaterial3: true);
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            locale: const Locale('cs'),
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            home: BusinessAccessBoundary(
              publishingAllowed: false,
              reason: 'Private moderation reason',
              child: Scaffold(
                body: ProfileContent(
                  userId: 'fixture',
                  profile: const {
                    'nickname': 'Fixture',
                    'avatarId': 'avatar_01',
                    'avatarBackgroundStart': 1,
                    'avatarBackgroundEnd': 2,
                    'avatarGradientDirection': 'horizontal',
                  },
                  roleStream: roles.stream,
                  onSignOut: () => signedOut = true,
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Fixture'), findsOneWidget);
        expect(find.text('Odhlásit se'), findsOneWidget);
        roles.add(AccountRole.business);
        await tester.pumpAndSettle();
        expect(find.text('Business'), findsOneWidget);
        expect(find.text('Private moderation reason'), findsNothing);
        final tile = tester.widget<ListTile>(
          find.ancestor(
            of: find.text(businessSuspendedLabel),
            matching: find.byType(ListTile),
          ),
        );
        final material = tester.widget<Material>(
          find
              .ancestor(
                of: find.text(businessSuspendedLabel),
                matching: find.byType(Material),
              )
              .last,
        );
        expect(
          contrast(tile.textColor!, material.color!),
          greaterThanOrEqualTo(4.5),
        );
        expect(
          contrast(tile.iconColor!, material.color!),
          greaterThanOrEqualTo(4.5),
        );
        final detail = tester.widget<TextButton>(
          find.widgetWithText(TextButton, 'Detail'),
        );
        expect(
          contrast(
            detail.style!.foregroundColor!.resolve({})!,
            material.color!,
          ),
          greaterThanOrEqualTo(4.5),
        );
        await tester.tap(find.text('Detail'));
        await tester.pumpAndSettle();
        expect(find.text('Private moderation reason'), findsOneWidget);
        await tester.tap(find.text('Zavřít'));
        await tester.pumpAndSettle();
        roles.addError(StateError('role subscription lost'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Odhlásit se'));
        expect(signedOut, isTrue);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets(
    'publication feedback exposes only the short status, preserves active publishing',
    (tester) async {
      var published = 0;
      final allowed = ValueNotifier(false);
      addTearDown(allowed.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: ValueListenableBuilder<bool>(
            valueListenable: allowed,
            builder: (_, active, _) => BusinessAccessBoundary(
              publishingAllowed: active,
              reason: 'Private reason',
              child: Scaffold(
                body: Builder(
                  builder: (context) => TextButton(
                    onPressed: () {
                      if (!showBusinessPublishingRestriction(context)) {
                        published++;
                      }
                    },
                    child: const Text('Publish'),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Publish'));
      await tester.pump();
      expect(published, 0);
      expect(
        find.descendant(
          of: find.byType(SnackBar),
          matching: find.text(businessSuspendedLabel),
        ),
        findsOneWidget,
      );
      expect(find.text('Private reason'), findsNothing);
      allowed.value = true;
      await tester.pumpAndSettle();
      await tester.tap(find.text('Publish'));
      expect(published, 1);
    },
  );
}
