import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:geolocator/geolocator.dart';

import 'auth_gate.dart';
import 'app_locale.dart';
import 'firebase_options.dart';
import 'legal.dart';
import 'l10n/app_localizations.dart';
import 'l10n/text.dart';

part 'src/create_shout.dart';
part 'src/comments.dart';
part 'src/feed.dart';
part 'src/home.dart';
part 'src/moderation.dart';
part 'src/private_replies.dart';
part 'src/profile.dart';
part 'src/profile_support.dart';
part 'src/profile_settings.dart';
part 'src/saved.dart';
part 'src/shout_cards.dart';
part 'src/shout_detail.dart';
part 'src/shout_model.dart';

const _shoutPrimary = Color(0xFF0A6371);
const _shoutPrimaryDark = Color(0xFF074B57);
const _shoutAccent = Color(0xFF0E8EA0);
const _shoutAccentLight = Color(0xFFDDF5F6);
const _shoutBackground = Color(0xFFFAFDFD);
const _shoutSurface = Color(0xFFFFFFFF);
const _shoutBorder = Color(0xFFE3EEEE);
const _shoutText = Color(0xFF1F2933);
const _shoutSecondaryText = Color(0xFF697A84);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const ShoutOutApp());
}

class ShoutOutApp extends StatelessWidget {
  const ShoutOutApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Locale?>(
      valueListenable: appLocale,
      builder: (context, locale, _) => MaterialApp(
        debugShowCheckedModeBanner: false,
        locale: locale,
        onGenerateTitle: (context) => AppLocalizations.of(context)!.appTitle,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        theme: ThemeData(
          colorScheme: const ColorScheme.light(
            primary: _shoutPrimary,
            onPrimary: Colors.white,
            primaryContainer: _shoutAccentLight,
            onPrimaryContainer: _shoutPrimaryDark,
            secondary: _shoutAccent,
            onSecondary: Colors.white,
            secondaryContainer: Color(0xFFEEF8F8),
            onSecondaryContainer: _shoutPrimaryDark,
            tertiary: _shoutPrimary,
            onTertiary: Colors.white,
            error: Color(0xFFB3261E),
            onError: Colors.white,
            surface: _shoutSurface,
            onSurface: _shoutText,
            onSurfaceVariant: _shoutSecondaryText,
            outline: Color(0xFFCDE7E7),
            outlineVariant: _shoutBorder,
          ),
          useMaterial3: true,
          scaffoldBackgroundColor: _shoutBackground,
          dividerColor: const Color(0xFFE6F1F1),
          cardTheme: CardThemeData(
            color: _shoutSurface,
            elevation: 1,
            shadowColor: const Color(0x0D000000),
            surfaceTintColor: Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(22),
              side: const BorderSide(color: Color(0xFFE4F1F2)),
            ),
          ),
          floatingActionButtonTheme: const FloatingActionButtonThemeData(
            backgroundColor: _shoutAccent,
            foregroundColor: Colors.white,
            elevation: 5,
            focusElevation: 6,
            hoverElevation: 6,
          ),
          navigationBarTheme: NavigationBarThemeData(
            height: 64,
            backgroundColor: _shoutSurface,
            elevation: 0,
            indicatorColor: _shoutAccentLight,
            surfaceTintColor: Colors.transparent,
            iconTheme: WidgetStateProperty.resolveWith(
              (states) => IconThemeData(
                color: states.contains(WidgetState.selected)
                    ? _shoutPrimary
                    : const Color(0xFF8A9AA3),
              ),
            ),
            labelTextStyle: WidgetStateProperty.resolveWith(
              (states) => TextStyle(
                color: states.contains(WidgetState.selected)
                    ? _shoutPrimary
                    : const Color(0xFF697A84),
                fontSize: 11,
                fontWeight: states.contains(WidgetState.selected)
                    ? FontWeight.w700
                    : FontWeight.w500,
              ),
            ),
          ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: _shoutSurface,
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Color(0xFFCDE7E7)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: _shoutAccent, width: 1.5),
            ),
          ),
          appBarTheme: const AppBarTheme(
            backgroundColor: _shoutBackground,
            foregroundColor: _shoutText,
            elevation: 0,
            scrolledUnderElevation: 0,
            surfaceTintColor: Colors.transparent,
          ),
        ),
        home: const AuthGate(signedInChild: ShoutOutHome()),
      ),
    );
  }
}

// Feature declarations are organized in the part files above.
