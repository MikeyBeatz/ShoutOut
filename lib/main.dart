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

class ShoutOutHome extends StatefulWidget {
  const ShoutOutHome({super.key});

  @override
  State<ShoutOutHome> createState() => _ShoutOutHomeState();
}

class _ShoutOutHomeState extends State<ShoutOutHome> {
  final List<Shout> _shouts = [];
  Set<String> _blockedUserIds = {};
  Position? _currentPosition;
  bool _isLoadingShouts = true;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _shoutSubscription;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _blockedSubscription;

  int _tab = 0;
  late final Timer _expiryTimer;

  @override
  void initState() {
    super.initState();
    if (Firebase.apps.isNotEmpty) {
      _initializeFeed();
    }
    _expiryTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  Future<void> _initializeFeed() async {
    _startFeedListeners();
    // Location improves distance sorting but must never hold up the feed.
    unawaited(_refreshLocation().then((_) => _loadShouts()));
  }

  void _startFeedListeners() {
    final firestore = FirebaseFirestore.instance;
    final uid = FirebaseAuth.instance.currentUser!.uid;
    _shoutSubscription = firestore
        .collection('shouts')
        .where('status', isEqualTo: 'active')
        .snapshots()
        .listen(
          (snapshot) => _applyShoutDocuments(snapshot.docs),
          onError: (_) {
            if (mounted) setState(() => _isLoadingShouts = false);
          },
        );
    _blockedSubscription = firestore
        .collection('users')
        .doc(uid)
        .collection('blocked')
        .snapshots()
        .listen((snapshot) {
          if (mounted) {
            setState(() {
              _blockedUserIds = snapshot.docs.map((doc) => doc.id).toSet();
            });
          }
        });
  }

  Future<void> _refreshLocation() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return;
      }
      _currentPosition = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.low,
        ),
      ).timeout(const Duration(seconds: 4));
    } catch (_) {
      // The feed can still be used without location permission.
    }
  }

  @override
  void dispose() {
    _expiryTimer.cancel();
    _shoutSubscription?.cancel();
    _blockedSubscription?.cancel();
    super.dispose();
  }

  Future<void> _loadShouts() async {
    final blocked = await FirebaseFirestore.instance
        .collection('users')
        .doc(FirebaseAuth.instance.currentUser!.uid)
        .collection('blocked')
        .get();
    final blockedUserIds = blocked.docs.map((doc) => doc.id).toSet();
    final snapshot = await FirebaseFirestore.instance
        .collection('shouts')
        .where('status', isEqualTo: 'active')
        .get();
    await _applyShoutDocuments(snapshot.docs, blockedUserIds: blockedUserIds);
  }

  Future<void> _applyShoutDocuments(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> documents, {
    Set<String>? blockedUserIds,
  }) async {
    final shouts = documents.map((doc) {
      final data = doc.data();
      final location = data['location'] as GeoPoint?;
      final distanceKm = location == null || _currentPosition == null
          ? 0.0
          : Geolocator.distanceBetween(
                  _currentPosition!.latitude,
                  _currentPosition!.longitude,
                  location.latitude,
                  location.longitude,
                ) /
                1000;
      return Shout.fromDocument(doc, distanceKm: distanceKm);
    }).toList();
    if (mounted) {
      setState(() {
        _shouts
          ..clear()
          ..addAll(shouts);
        if (blockedUserIds != null) _blockedUserIds = blockedUserIds;
        _isLoadingShouts = false;
      });
    }
    // Reaction and save details are secondary UI data. Fetch them after the
    // feed is visible instead of delaying the first screen by many requests.
    for (final shout in shouts) {
      unawaited(
        _loadInteractionState(shout).then((_) {
          if (mounted) setState(() {});
        }),
      );
    }
  }

  Future<void> _loadInteractionState(Shout shout) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    final shoutRef = FirebaseFirestore.instance
        .collection('shouts')
        .doc(shout.id);
    final results = await Future.wait([
      shoutRef.collection('reactions').doc(uid).get(),
      shoutRef.collection('saves').doc(uid).get(),
      shoutRef.collection('reactions').where('type', isEqualTo: 'like').get(),
      shoutRef
          .collection('reactions')
          .where('type', isEqualTo: 'dislike')
          .get(),
      shoutRef.collection('saves').get(),
    ]);
    final reaction = results[0] as DocumentSnapshot<Map<String, dynamic>>;
    final save = results[1] as DocumentSnapshot<Map<String, dynamic>>;
    final likes = results[2] as QuerySnapshot<Map<String, dynamic>>;
    final dislikes = results[3] as QuerySnapshot<Map<String, dynamic>>;
    final saves = results[4] as QuerySnapshot<Map<String, dynamic>>;
    final type = reaction.data()?['type'] as String?;
    shout
      ..isLiked = type == 'like'
      ..isDisliked = type == 'dislike'
      ..isSaved = save.exists
      ..likes = likes.docs.length
      ..dislikes = dislikes.docs.length
      ..saves = saves.docs.length;
  }

  Future<void> _addShout(Shout shout) async {
    if (_currentPosition == null) await _refreshLocation();
    final position = _currentPosition;
    if (position == null) {
      throw StateError('location-unavailable');
    }
    final user = FirebaseAuth.instance.currentUser!;
    final profile = await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get();
    final nickname = profile.data()!['nickname'] as String;
    await FirebaseFirestore.instance.collection('shouts').doc(shout.id).set({
      'authorId': user.uid,
      'authorNickname': nickname,
      'title': shout.title,
      'text': shout.text,
      'categories': shout.categories,
      'location': GeoPoint(
        _publicLocationCoordinate(position.latitude),
        _publicLocationCoordinate(position.longitude),
      ),
      'createdAt': Timestamp.fromDate(shout.createdAt),
      'expiresAt': Timestamp.fromDate(shout.expiresAt),
      'status': 'active',
      'likesCount': 0,
      'dislikesCount': 0,
      'commentsCount': 0,
      'savesCount': 0,
    });
    await _loadShouts();
  }

  // A public Shout is associated with an approximately one-kilometre grid,
  // never with the author's precise device position.
  double _publicLocationCoordinate(double coordinate) =>
      (coordinate * 100).roundToDouble() / 100;

  Future<void> _deleteShout(Shout shout) async {
    await FirebaseFirestore.instance.collection('shouts').doc(shout.id).update({
      'status': 'deleted',
    });
    await _loadShouts();
  }

  Future<void> _toggleSaved(Shout shout) async {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    final saveRef = FirebaseFirestore.instance
        .collection('shouts')
        .doc(shout.id)
        .collection('saves')
        .doc(uid);
    if (shout.isSaved) {
      await saveRef.delete();
    } else {
      await saveRef.set({'createdAt': FieldValue.serverTimestamp()});
    }
    setState(() {
      shout.isSaved = !shout.isSaved;
      shout.saves += shout.isSaved ? 1 : -1;
    });
  }

  Future<void> _toggleReaction(Shout shout, {required bool like}) async {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    final reactionRef = FirebaseFirestore.instance
        .collection('shouts')
        .doc(shout.id)
        .collection('reactions')
        .doc(uid);
    final currentType = shout.isLiked
        ? 'like'
        : shout.isDisliked
        ? 'dislike'
        : null;
    final nextType = like ? 'like' : 'dislike';
    if (currentType == nextType) {
      await reactionRef.delete();
    } else {
      await reactionRef.set({
        'type': nextType,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }
    setState(() {
      if (currentType == nextType) {
        if (like) {
          shout.isLiked = false;
          shout.likes--;
        } else {
          shout.isDisliked = false;
          shout.dislikes--;
        }
      } else if (like) {
        shout.isLiked = true;
        shout.likes++;
        if (shout.isDisliked) {
          shout.isDisliked = false;
          shout.dislikes--;
        }
      } else {
        shout.isDisliked = true;
        shout.dislikes++;
        if (shout.isLiked) {
          shout.isLiked = false;
          shout.likes--;
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final activeShouts = _shouts
        .where(
          (shout) =>
              shout.isActive && !_blockedUserIds.contains(shout.authorId),
        )
        .toList();

    return Scaffold(
      extendBodyBehindAppBar: _tab == 0,
      body: switch (_tab) {
        0 => FeedPage(
          shouts: activeShouts,
          isLoading: _isLoadingShouts,
          onSave: _toggleSaved,
          onReaction: _toggleReaction,
          onNotifications: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const NotificationsPage()),
          ),
        ),
        1 => SavedPage(
          shouts: activeShouts.where((shout) => shout.isSaved).toList(),
          onSave: _toggleSaved,
          onReaction: _toggleReaction,
        ),
        2 => MyShoutsPage(
          shouts: _shouts
              .where(
                (shout) =>
                    shout.authorId == FirebaseAuth.instance.currentUser?.uid,
              )
              .toList(),
          onSave: _toggleSaved,
          onReaction: _toggleReaction,
          onDelete: _deleteShout,
        ),
        _ => const ProfilePage(),
      },
      floatingActionButton: _tab == 0
          ? FloatingActionButton.extended(
              onPressed: () async {
                final shout = await showDialog<Shout>(
                  context: context,
                  builder: (_) => Dialog(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 520),
                      child: const CreateShoutSheet(),
                    ),
                  ),
                );
                if (shout != null) {
                  try {
                    await _addShout(shout);
                  } on StateError catch (error) {
                    if (context.mounted &&
                        error.message == 'location-unavailable') {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Pro publikování Shoutu povol přístup k poloze.',
                          ),
                        ),
                      );
                    }
                  }
                }
              },
              icon: const Icon(Icons.campaign_outlined),
              label: Text(tr(context, 'Přidat shout')),
            )
          : null,
      bottomNavigationBar: Stack(
        clipBehavior: Clip.none,
        children: [
          const Positioned(
            left: 0,
            right: 0,
            top: -10,
            child: IgnorePointer(
              child: SizedBox(
                height: 10,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        Color(0x18074B57),
                        Color(0x38074B57),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          Material(
            color: _shoutSurface,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const DecoratedBox(
                  decoration: BoxDecoration(color: _shoutAccent),
                  child: SizedBox(height: 1),
                ),
                NavigationBar(
                  height: 64,
                  selectedIndex: _tab,
                  onDestinationSelected: (index) =>
                      setState(() => _tab = index),
                  destinations: [
                    NavigationDestination(
                      icon: Transform.rotate(
                        angle: -.14,
                        child: const Icon(Icons.campaign_outlined),
                      ),
                      selectedIcon: Transform.rotate(
                        angle: -.14,
                        child: const Icon(Icons.campaign_rounded),
                      ),
                      label: tr(context, 'Shouty'),
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.bookmark_outline),
                      selectedIcon: Icon(Icons.bookmark),
                      label: tr(context, 'Uložené'),
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.campaign_outlined),
                      selectedIcon: Icon(Icons.campaign),
                      label: tr(context, 'Mé shouty'),
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.person_outline),
                      selectedIcon: Icon(Icons.person),
                      label: tr(context, 'Profil'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class FeedPage extends StatefulWidget {
  const FeedPage({
    super.key,
    required this.shouts,
    required this.isLoading,
    required this.onSave,
    required this.onReaction,
    required this.onNotifications,
  });

  final List<Shout> shouts;
  final bool isLoading;
  final ValueChanged<Shout> onSave;
  final void Function(Shout shout, {required bool like}) onReaction;
  final VoidCallback onNotifications;

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> {
  static const _categories = [
    'Obecné',
    'Akce',
    'Sport',
    'Zábava',
    'Pomoc',
    'Upozornění',
    'Dotaz',
    'Doprava',
    'Jídlo a pití',
    'Kultura',
  ];
  String? _selectedCategory;
  double _radius = 5;
  FeedOrder _order = FeedOrder.nearest;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final filterValueStyle = TextStyle(
      fontSize: 12,
      fontWeight: FontWeight.w600,
      color: colors.onSurface,
    );
    final filterLabelStyle = TextStyle(
      fontSize: 10,
      color: colors.onSurfaceVariant,
    );
    final filteredShouts =
        widget.shouts.where((shout) {
          return shout.distanceKm <= _radius &&
              (_selectedCategory == null ||
                  shout.categories.contains(_selectedCategory));
        }).toList()..sort(
          (a, b) => switch (_order) {
            FeedOrder.nearest => a.distanceKm.compareTo(b.distanceKm),
            FeedOrder.popular => b.likes.compareTo(a.likes),
            FeedOrder.endingSoon => a.expiresAt.compareTo(b.expiresAt),
          },
        );
    final shouts = [
      ...filteredShouts.where((shout) => !shout.isLowRated),
      ...filteredShouts.where((shout) => shout.isLowRated),
    ];

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: _shoutSurface,
      ),
      child: CustomScrollView(
        clipBehavior: Clip.none,
        slivers: [
          SliverToBoxAdapter(
            child: Stack(
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: 18),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Color(0xFF1496A8),
                          _shoutPrimary,
                          _shoutPrimaryDark,
                        ],
                        stops: [0, .4, 1],
                      ),
                    ),
                    child: SafeArea(
                      bottom: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 6, 20, 28),
                        child: Column(
                          children: [
                            Stack(
                              alignment: Alignment.center,
                              children: [
                                Align(
                                  alignment: Alignment.centerLeft,
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Transform.rotate(
                                        angle: -.14,
                                        child: const Icon(
                                          Icons.campaign_rounded,
                                          size: 26,
                                          color: Colors.white,
                                        ),
                                      ),
                                      SizedBox(width: 7),
                                      Text(
                                        'ShoutOut',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w900,
                                          fontSize: 24,
                                          letterSpacing: -.5,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: IconButton(
                                    tooltip: tr(context, 'Oznámení'),
                                    onPressed: widget.onNotifications,
                                    icon: const Icon(
                                      Icons.notifications_none_rounded,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Divider(
                              height: 1,
                              color: Colors.white.withValues(alpha: .2),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: DropdownButtonFormField<double>(
                                    initialValue: _radius,
                                    isExpanded: true,
                                    alignment: AlignmentDirectional.center,
                                    style: filterValueStyle,
                                    decoration: InputDecoration(
                                      hintText: tr(context, 'Vzdálenost'),
                                      hintStyle: filterLabelStyle,
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(12),
                                        borderSide: BorderSide.none,
                                      ),
                                      filled: true,
                                      fillColor: Colors.white,
                                      isDense: true,
                                      contentPadding:
                                          const EdgeInsets.symmetric(
                                            horizontal: 9,
                                            vertical: 8,
                                          ),
                                    ),
                                    items: const [1, 3, 5, 10, 20, 50]
                                        .map(
                                          (value) => DropdownMenuItem(
                                            value: value.toDouble(),
                                            child: Center(
                                              child: Text(
                                                '$value km',
                                                style: filterValueStyle,
                                              ),
                                            ),
                                          ),
                                        )
                                        .toList(),
                                    onChanged: (value) =>
                                        setState(() => _radius = value!),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: DropdownButtonFormField<FeedOrder>(
                                    initialValue: _order,
                                    isExpanded: true,
                                    alignment: AlignmentDirectional.center,
                                    style: filterValueStyle,
                                    decoration: InputDecoration(
                                      hintText: tr(context, 'Řazení'),
                                      hintStyle: filterLabelStyle,
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(12),
                                        borderSide: BorderSide.none,
                                      ),
                                      filled: true,
                                      fillColor: Colors.white,
                                      isDense: true,
                                      contentPadding:
                                          const EdgeInsets.symmetric(
                                            horizontal: 9,
                                            vertical: 8,
                                          ),
                                    ),
                                    items: FeedOrder.values
                                        .map(
                                          (value) => DropdownMenuItem(
                                            value: value,
                                            child: Center(
                                              child: Text(
                                                tr(context, value.label),
                                                style: filterValueStyle,
                                              ),
                                            ),
                                          ),
                                        )
                                        .toList(),
                                    onChanged: (value) =>
                                        setState(() => _order = value!),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: DropdownButtonFormField<String?>(
                                    initialValue: _selectedCategory,
                                    isExpanded: true,
                                    alignment: AlignmentDirectional.center,
                                    style: filterValueStyle,
                                    decoration: InputDecoration(
                                      hintText: tr(context, 'Kategorie'),
                                      hintStyle: filterLabelStyle,
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(12),
                                        borderSide: BorderSide.none,
                                      ),
                                      filled: true,
                                      fillColor: Colors.white,
                                      isDense: true,
                                      contentPadding:
                                          const EdgeInsets.symmetric(
                                            horizontal: 9,
                                            vertical: 8,
                                          ),
                                    ),
                                    items: [
                                      DropdownMenuItem<String?>(
                                        value: null,
                                        child: Center(
                                          child: Text(
                                            tr(context, 'Vše'),
                                            style: filterValueStyle,
                                          ),
                                        ),
                                      ),
                                      ..._categories.map(
                                        (category) => DropdownMenuItem<String?>(
                                          value: category,
                                          child: Center(
                                            child: Text(
                                              tr(context, category),
                                              style: filterValueStyle,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ],
                                    onChanged: (value) => setState(
                                      () => _selectedCategory = value,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                const Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: SizedBox(
                    height: 36,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: _shoutBackground,
                        borderRadius: BorderRadius.vertical(
                          top: Radius.circular(28),
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 24,
                  child: IgnorePointer(
                    child: Container(
                      height: 12,
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Color(0x40074B57), Colors.transparent],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          if (widget.isLoading)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (shouts.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyState(
                icon: Icons.location_off_outlined,
                title: tr(context, 'V tomto okolí zatím nejsou žádné shouty.'),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 180),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate((context, index) {
                  if (index.isOdd) return const SizedBox(height: 12);
                  final shout = shouts[index ~/ 2];
                  return RatedShoutCard(
                    shout: shout,
                    onSave: () => widget.onSave(shout),
                    onReaction: (like) => widget.onReaction(shout, like: like),
                  );
                }, childCount: shouts.length * 2 - 1),
              ),
            ),
        ],
      ),
    );
  }
}

class TealSectionHeader extends StatelessWidget {
  const TealSectionHeader({
    super.key,
    required this.title,
    required this.icon,
    this.controls,
  });

  final String title;
  final IconData icon;
  final Widget? controls;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF1496A8), _shoutPrimary, _shoutPrimaryDark],
              stops: [0, .4, 1],
            ),
          ),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                20,
                6,
                20,
                controls == null ? 20 : 28,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Stack(
                    alignment: Alignment.center,
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Transform.rotate(
                              angle: -.14,
                              child: Icon(icon, color: Colors.white, size: 25),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              title,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                fontSize: 24,
                                letterSpacing: -.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: IconButton(
                          tooltip: tr(context, 'Oznámení'),
                          onPressed: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const NotificationsPage(),
                            ),
                          ),
                          icon: const Icon(
                            Icons.notifications_none_rounded,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Divider(height: 1, color: Colors.white.withValues(alpha: .2)),
                  if (controls != null) ...[
                    const SizedBox(height: 10),
                    controls!,
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
      const Positioned(
        left: 0,
        right: 0,
        bottom: 0,
        child: SizedBox(
          height: 36,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: _shoutBackground,
              borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            ),
          ),
        ),
      ),
      Positioned(
        left: 0,
        right: 0,
        bottom: 24,
        child: IgnorePointer(
          child: Container(
            height: 12,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0x40074B57), Colors.transparent],
              ),
            ),
          ),
        ),
      ),
    ],
  );
}

class SavedPage extends StatelessWidget {
  const SavedPage({
    super.key,
    required this.shouts,
    required this.onSave,
    required this.onReaction,
  });

  final List<Shout> shouts;
  final ValueChanged<Shout> onSave;
  final void Function(Shout shout, {required bool like}) onReaction;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      TealSectionHeader(
        title: tr(context, 'Uložené shouty'),
        icon: Icons.bookmark_rounded,
      ),
      Expanded(
        child: ShoutListPage(
          title: null,
          emptyText: tr(context, 'Zatím nemáš uložené žádné shouty.'),
          emptyIcon: Icons.bookmark_border,
          shouts: shouts,
          onSave: onSave,
          onReaction: onReaction,
        ),
      ),
    ],
  );
}

class MyShoutsPage extends StatefulWidget {
  const MyShoutsPage({
    super.key,
    required this.shouts,
    required this.onSave,
    required this.onReaction,
    required this.onDelete,
  });

  final List<Shout> shouts;
  final ValueChanged<Shout> onSave;
  final void Function(Shout shout, {required bool like}) onReaction;
  final Future<void> Function(Shout shout) onDelete;

  @override
  State<MyShoutsPage> createState() => _MyShoutsPageState();
}

class _MyShoutsPageState extends State<MyShoutsPage> {
  _MyShoutsSection _section = _MyShoutsSection.active;

  @override
  Widget build(BuildContext context) {
    final activeShouts = widget.shouts
        .where((shout) => shout.effectiveStatus == ShoutStatus.active)
        .toList();
    final expiredShouts = widget.shouts
        .where((shout) => shout.isRetainedExpired)
        .toList();
    return Column(
      children: [
        TealSectionHeader(
          title: tr(context, 'Mé shouty'),
          icon: Icons.campaign_rounded,
          controls: SegmentedButton<_MyShoutsSection>(
            expandedInsets: EdgeInsets.zero,
            style: ButtonStyle(
              foregroundColor: WidgetStateProperty.resolveWith(
                (states) => states.contains(WidgetState.selected)
                    ? _shoutPrimaryDark
                    : Colors.white,
              ),
              backgroundColor: WidgetStateProperty.resolveWith(
                (states) => states.contains(WidgetState.selected)
                    ? Colors.white
                    : Colors.white.withValues(alpha: .08),
              ),
              side: const WidgetStatePropertyAll(
                BorderSide(color: Color(0x99FFFFFF)),
              ),
            ),
            segments: [
              ButtonSegment(
                value: _MyShoutsSection.active,
                label: Text(tr(context, 'Aktivní')),
              ),
              ButtonSegment(
                value: _MyShoutsSection.expired,
                label: Text(tr(context, 'Expirované')),
              ),
              ButtonSegment(
                value: _MyShoutsSection.comments,
                label: Text(tr(context, 'Komentáře')),
              ),
            ],
            selected: {_section},
            onSelectionChanged: (values) =>
                setState(() => _section = values.first),
          ),
        ),
        Expanded(
          child: switch (_section) {
            _MyShoutsSection.comments => MyCommentsPage(
              onSave: widget.onSave,
              onReaction: widget.onReaction,
              showTitle: false,
            ),
            _ => ShoutListPage(
              title: null,
              emptyText: tr(context, 'V této části zatím nemáš žádné shouty.'),
              emptyIcon: Icons.campaign_outlined,
              shouts: _section == _MyShoutsSection.active
                  ? activeShouts
                  : expiredShouts,
              onSave: widget.onSave,
              onReaction: widget.onReaction,
              showSaveCount: true,
              showDeleteButton: true,
              onDelete: widget.onDelete,
            ),
          },
        ),
      ],
    );
  }
}

enum _MyShoutsSection { active, expired, comments }

class MyCommentsPage extends StatelessWidget {
  const MyCommentsPage({
    super.key,
    required this.onSave,
    required this.onReaction,
    this.showTitle = true,
  });

  final ValueChanged<Shout> onSave;
  final void Function(Shout shout, {required bool like}) onReaction;
  final bool showTitle;

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collectionGroup('comments')
          .where('authorId', isEqualTo: uid)
          .snapshots(),
      builder: (context, snapshot) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (showTitle)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                child: Text(
                  tr(context, 'Komentáře'),
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            Expanded(
              child: snapshot.hasError
                  ? EmptyState(
                      icon: Icons.comment_outlined,
                      title: tr(
                        context,
                        'Komentáře se nepodařilo načíst. Zkus to prosím znovu.',
                      ),
                    )
                  : !snapshot.hasData
                  ? const Center(child: CircularProgressIndicator())
                  : FutureBuilder<List<_CommentWithShout>>(
                      future: _loadComments(snapshot.data!.docs),
                      builder: (context, commentsSnapshot) {
                        if (commentsSnapshot.hasError) {
                          return EmptyState(
                            icon: Icons.comment_outlined,
                            title: tr(
                              context,
                              'Komentáře se nepodařilo načíst. Zkus to prosím znovu.',
                            ),
                          );
                        }
                        if (!commentsSnapshot.hasData) {
                          return const Center(
                            child: CircularProgressIndicator(),
                          );
                        }
                        final comments = commentsSnapshot.data!;
                        if (comments.isEmpty) {
                          return EmptyState(
                            icon: Icons.comment_outlined,
                            title: tr(
                              context,
                              'Zatím jsi nenapsal/a žádný komentář.',
                            ),
                          );
                        }
                        return ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                          itemCount: comments.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(height: 10),
                          itemBuilder: (context, index) {
                            final item = comments[index];
                            return Card(
                              child: ListTile(
                                leading: const Icon(Icons.comment_outlined),
                                title: Text(
                                  item.shout.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                subtitle: Text(
                                  item.comment.data()['text'] as String,
                                ),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => ShoutDetailPage(
                                      shout: item.shout,
                                      onSave: () => onSave(item.shout),
                                      onReaction: (like) =>
                                          onReaction(item.shout, like: like),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }

  Future<List<_CommentWithShout>> _loadComments(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> comments,
  ) async {
    final items = await Future.wait(
      comments.map((comment) async {
        final shoutDocument = await comment.reference.parent.parent!.get();
        if (!shoutDocument.exists) return null;
        final shout = Shout.fromDocument(shoutDocument);
        if (shout.effectiveStatus == ShoutStatus.deleted ||
            shout.isExpiredBeyondRetention) {
          return null;
        }
        return _CommentWithShout(comment: comment, shout: shout);
      }),
    );
    final visibleItems = items.whereType<_CommentWithShout>().toList()
      ..sort((a, b) {
        final aTime = a.comment.data()['createdAt'] as Timestamp?;
        final bTime = b.comment.data()['createdAt'] as Timestamp?;
        return (bTime?.millisecondsSinceEpoch ?? 0).compareTo(
          aTime?.millisecondsSinceEpoch ?? 0,
        );
      });
    return visibleItems;
  }
}

class _CommentWithShout {
  const _CommentWithShout({required this.comment, required this.shout});

  final QueryDocumentSnapshot<Map<String, dynamic>> comment;
  final Shout shout;
}

class ShoutListPage extends StatelessWidget {
  const ShoutListPage({
    super.key,
    this.title,
    required this.emptyText,
    required this.emptyIcon,
    required this.shouts,
    required this.onSave,
    required this.onReaction,
    this.showSaveCount = false,
    this.showDeleteButton = false,
    this.onDelete,
  });

  final String? title;
  final String emptyText;
  final IconData emptyIcon;
  final List<Shout> shouts;
  final ValueChanged<Shout> onSave;
  final void Function(Shout shout, {required bool like}) onReaction;
  final bool showSaveCount;
  final bool showDeleteButton;
  final Future<void> Function(Shout shout)? onDelete;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      if (title != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
          child: Text(
            title!,
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
      Expanded(
        child: shouts.isEmpty
            ? EmptyState(icon: emptyIcon, title: emptyText)
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                itemCount: shouts.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (context, index) => ShoutCard(
                  shout: shouts[index],
                  onSave: () => onSave(shouts[index]),
                  onReaction: (like) => onReaction(shouts[index], like: like),
                  showSaveCount: showSaveCount,
                  showDeleteButton: showDeleteButton,
                  onDelete: onDelete == null
                      ? null
                      : () => onDelete!(shouts[index]),
                ),
              ),
      ),
    ],
  );
}

class AvatarImage extends StatelessWidget {
  const AvatarImage({super.key, required this.avatarId, this.radius = 24});

  final String avatarId;
  final double radius;

  @override
  Widget build(BuildContext context) => CircleAvatar(
    radius: radius,
    backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
    child: ClipOval(
      child: Image.asset(
        'assets/avatars/avatar_$avatarId.png',
        width: radius * 2,
        height: radius * 2,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => Icon(Icons.person_outline, size: radius),
      ),
    ),
  );
}

class AvatarPickerSheet extends StatelessWidget {
  const AvatarPickerSheet({super.key, required this.selectedId});

  static const avatarIds = [
    'fox',
    'owl',
    'otter',
    'raccoon',
    'robot',
    'astronaut',
    'cactus',
    'mushroom',
    'moon',
    'comet',
    'cat',
    'dragon',
    'mountain',
    'lightning',
    'controller',
    'octopus',
  ];
  final String selectedId;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: FractionallySizedBox(
      heightFactor: .72,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          children: [
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.outlineVariant,
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              tr(context, 'Vyber si avatar'),
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: GridView.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 4,
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                ),
                itemCount: avatarIds.length,
                itemBuilder: (context, index) {
                  final avatarId = avatarIds[index];
                  final selected = avatarId == selectedId;
                  return Semantics(
                    button: true,
                    selected: selected,
                    label: avatarId,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(999),
                      onTap: () => Navigator.pop(context, avatarId),
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: selected
                                ? Theme.of(context).colorScheme.primary
                                : Colors.transparent,
                            width: 3,
                          ),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(3),
                          child: AvatarImage(avatarId: avatarId, radius: 32),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class NotificationsPage extends StatelessWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(tr(context, 'Oznámení'))),
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.notifications_none_rounded,
              size: 48,
              color: Theme.of(context).colorScheme.outline,
            ),
            const SizedBox(height: 12),
            Text(
              tr(context, 'Zatím nemáš žádná oznámení.'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ],
        ),
      ),
    ),
  );
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .snapshots(),
      builder: (context, snapshot) {
        final profile = snapshot.data?.data();
        final nickname = profile?['nickname'] as String? ?? 'Načítání…';
        final avatarId = profile?['avatarId'] as String? ?? 'fox';
        final l10n = AppLocalizations.of(context)!;
        return Column(
          children: [
            ProfileHeader(
              nickname: nickname,
              avatarId: avatarId,
              onEdit: profile == null
                  ? null
                  : () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => EditProfilePage(userId: uid),
                      ),
                    ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 2, 16, 28),
                children: [
                  ProfileTileGrid(userId: uid),
                  const SizedBox(height: 18),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                child: _ProfileWideAction(
                  icon: Icons.logout_rounded,
                  title: l10n.logout,
                  color: _shoutPrimary,
                  onTap: FirebaseAuth.instance.signOut,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class ProfileHeader extends StatelessWidget {
  const ProfileHeader({
    super.key,
    required this.nickname,
    required this.avatarId,
    this.onEdit,
  });

  final String nickname;
  final String avatarId;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF1496A8), _shoutPrimary, _shoutPrimaryDark],
              stops: [0, .4, 1],
            ),
          ),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 38),
              child: Row(
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white,
                      border: Border.all(color: Colors.white70, width: 2),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(5),
                      child: AvatarImage(avatarId: avatarId, radius: 34),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          nickname,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 24,
                          ),
                        ),
                        const SizedBox(height: 4),
                        TextButton.icon(
                          onPressed: onEdit,
                          style: TextButton.styleFrom(
                            foregroundColor: Colors.white,
                            padding: EdgeInsets.zero,
                            visualDensity: VisualDensity.compact,
                          ),
                          icon: const Icon(Icons.edit_outlined, size: 17),
                          label: Text(tr(context, 'Upravit profil')),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      const Positioned(
        left: 0,
        right: 0,
        bottom: 0,
        child: SizedBox(
          height: 36,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: _shoutBackground,
              borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            ),
          ),
        ),
      ),
      Positioned(
        left: 0,
        right: 0,
        bottom: 24,
        child: IgnorePointer(
          child: Container(
            height: 12,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0x40074B57), Colors.transparent],
              ),
            ),
          ),
        ),
      ),
    ],
  );
}

class ProfileTileGrid extends StatelessWidget {
  const ProfileTileGrid({super.key, required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context) =>
      StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection('moderators')
            .doc(userId)
            .snapshots(),
        builder: (context, snapshot) {
          final l10n = AppLocalizations.of(context)!;
          final tiles = <Widget>[
            ProfileActionTile(
              icon: Icons.language_outlined,
              title: l10n.language,
              onTap: () => _selectProfileLanguage(context, userId),
            ),
            ProfileActionTile(
              icon: Icons.lock_outline,
              title: tr(context, 'Změnit heslo'),
              onTap: () => showDialog<void>(
                context: context,
                builder: (_) => const ChangePasswordDialog(),
              ),
            ),
            ProfileActionTile(
              icon: Icons.notifications_outlined,
              title: tr(context, 'Notifikace'),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => NotificationSettingsPage(userId: userId),
                ),
              ),
            ),
            ProfileActionTile(
              icon: Icons.help_outline,
              title: tr(context, 'Nápověda'),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const HelpPage()),
              ),
            ),
            ProfileActionTile(
              icon: Icons.warning_amber_outlined,
              title: tr(context, 'Varování'),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => WarningHistoryPage(userId: userId),
                ),
              ),
            ),
            ProfileActionTile(
              icon: Icons.policy_outlined,
              title: tr(context, 'Právní info'),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const LegalHubPage()),
              ),
            ),
          ];
          if (snapshot.data?.exists == true) {
            tiles.add(
              ProfileActionTile(
                icon: Icons.admin_panel_settings_outlined,
                title: tr(context, 'Moderace'),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const ModerationPage()),
                ),
              ),
            );
          }
          if (tiles.length % 3 != 0) {
            final last = tiles.removeLast();
            tiles.addAll([
              const SizedBox.shrink(),
              last,
              const SizedBox.shrink(),
            ]);
          }
          return LayoutBuilder(
            builder: (context, constraints) => Center(
              child: SizedBox(
                width: constraints.maxWidth > 317 ? 317 : constraints.maxWidth,
                child: GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  mainAxisExtent: 92,
                  children: tiles,
                ),
              ),
            ),
          );
        },
      );
}

class ProfileActionTile extends StatelessWidget {
  const ProfileActionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: _shoutSurface,
    borderRadius: BorderRadius.circular(18),
    child: InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: _shoutBorder),
        ),
        padding: const EdgeInsets.all(8),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Icon(icon, color: _shoutPrimary, size: 22),
            const SizedBox(height: 7),
            Text(
              title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                height: 1.1,
                fontSize: 12,
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 3),
              Text(
                subtitle!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: _shoutSecondaryText,
                  fontSize: 10,
                ),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}

class _ModeratorProfileTile extends StatelessWidget {
  const _ModeratorProfileTile({required this.userId});
  final String userId;

  @override
  Widget build(BuildContext context) =>
      StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection('moderators')
            .doc(userId)
            .snapshots(),
        builder: (context, snapshot) => snapshot.data?.exists == true
            ? ProfileActionTile(
                icon: Icons.admin_panel_settings_outlined,
                title: tr(context, 'Moderace'),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const ModerationPage()),
                ),
              )
            : const SizedBox.shrink(),
      );
}

class _ProfileWideAction extends StatelessWidget {
  const _ProfileWideAction({
    required this.icon,
    required this.title,
    required this.color,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: _shoutSurface,
    borderRadius: BorderRadius.circular(18),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: _shoutBorder),
        ),
        child: Row(
          children: [
            Icon(icon, color: color),
            const SizedBox(width: 14),
            Text(
              title,
              style: TextStyle(color: color, fontWeight: FontWeight.w700),
            ),
            const Spacer(),
            Icon(Icons.chevron_right_rounded, color: color),
          ],
        ),
      ),
    ),
  );
}

class EditProfilePage extends StatelessWidget {
  const EditProfilePage({super.key, required this.userId});
  final String userId;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(tr(context, 'Upravit profil'))),
    body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .snapshots(),
      builder: (context, snapshot) {
        final profile = snapshot.data?.data();
        final nickname = profile?['nickname'] as String? ?? 'Načítání…';
        final avatarId = profile?['avatarId'] as String? ?? 'fox';
        return Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Center(child: AvatarImage(avatarId: avatarId, radius: 58)),
                  const SizedBox(height: 12),
                  Text(
                    nickname,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Card(
                    child: ListTile(
                      leading: const Icon(
                        Icons.face_retouching_natural_outlined,
                      ),
                      title: Text(tr(context, 'Změnit avatar')),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: profile == null
                          ? null
                          : () async {
                              final selected =
                                  await showModalBottomSheet<String>(
                                    context: context,
                                    isScrollControlled: true,
                                    builder: (_) =>
                                        AvatarPickerSheet(selectedId: avatarId),
                                  );
                              if (selected == null || selected == avatarId) {
                                return;
                              }
                              await FirebaseFirestore.instance
                                  .collection('users')
                                  .doc(userId)
                                  .update({'avatarId': selected});
                            },
                    ),
                  ),
                  const SizedBox(height: 10),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.edit_outlined),
                      title: Text(AppLocalizations.of(context)!.changeNickname),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: profile == null
                          ? null
                          : () => _showNicknameChange(
                              context,
                              profile,
                              nickname,
                              userId,
                            ),
                    ),
                  ),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
                child: _ProfileWideAction(
                  icon: Icons.delete_outline,
                  title: AppLocalizations.of(context)!.deleteAccount,
                  color: Colors.red.shade700,
                  onTap: () => _requestAccountDeletion(context),
                ),
              ),
            ),
          ],
        );
      },
    ),
  );
}

String _languageName(BuildContext context, AppLocalizations l10n) =>
    switch (Localizations.localeOf(context).languageCode) {
      'en' => l10n.english,
      'de' => l10n.german,
      'pl' => l10n.polish,
      _ => l10n.czech,
    };

Future<void> _selectProfileLanguage(BuildContext context, String userId) async {
  final l10n = AppLocalizations.of(context)!;
  final language = await showModalBottomSheet<String>(
    context: context,
    builder: (sheetContext) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            title: Text(l10n.czech),
            trailing: const Text('CS'),
            onTap: () => Navigator.pop(sheetContext, 'cs'),
          ),
          ListTile(
            title: Text(l10n.english),
            trailing: const Text('EN'),
            onTap: () => Navigator.pop(sheetContext, 'en'),
          ),
          ListTile(
            title: Text(l10n.german),
            trailing: const Text('DE'),
            onTap: () => Navigator.pop(sheetContext, 'de'),
          ),
          ListTile(
            title: Text(l10n.polish),
            trailing: const Text('PL'),
            onTap: () => Navigator.pop(sheetContext, 'pl'),
          ),
        ],
      ),
    ),
  );
  if (language == null) return;
  await FirebaseFirestore.instance.collection('users').doc(userId).update({
    'language': language,
  });
  appLocale.value = Locale(language);
}

Future<void> _showNicknameChange(
  BuildContext context,
  Map<String, dynamic> profile,
  String nickname,
  String userId,
) async {
  if (!_nicknameChangeAvailable(profile)) {
    final changedAt = (profile['nicknameChangedAt'] as Timestamp?)?.toDate();
    final nextDate = changedAt?.add(const Duration(days: 30));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          nextDate == null
              ? tr(context, 'Přezdívku zatím nelze změnit.')
              : '${tr(context, 'Další změna přezdívky bude možná')} ${_shortDate(nextDate)}.',
        ),
      ),
    );
    return;
  }
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(AppLocalizations.of(dialogContext)!.changeNickname),
      content: Text(
        tr(
          dialogContext,
          'Tuto změnu je možné provést pouze jednou za 30 dní. Chceš pokračovat?',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: Text(tr(dialogContext, 'Zrušit')),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          child: Text(tr(dialogContext, 'Ano')),
        ),
      ],
    ),
  );
  if (confirmed == true && context.mounted) {
    await showDialog<void>(
      context: context,
      builder: (_) =>
          ChangeNicknameDialog(currentNickname: nickname, userId: userId),
    );
  }
}

Future<void> _requestAccountDeletion(BuildContext context) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(tr(dialogContext, 'Smazat účet?')),
      content: Text(
        tr(
          dialogContext,
          'Veřejný obsah bude při serverovém zpracování skryt. Potřebné bezpečnostní záznamy zůstanou 60 dnů, potom budou odstraněny nebo anonymizovány.',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: Text(tr(dialogContext, 'Zrušit')),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          child: Text(tr(dialogContext, 'Požádat o smazání')),
        ),
      ],
    ),
  );
  if (confirmed != true || !context.mounted) return;
  final user = FirebaseAuth.instance.currentUser!;
  await FirebaseFirestore.instance
      .collection('accountDeletionRequests')
      .doc(user.uid)
      .set({
        'userId': user.uid,
        'email': user.email,
        'requestedAt': FieldValue.serverTimestamp(),
        'retainUntil': Timestamp.fromDate(
          DateTime.now().add(const Duration(days: 60)),
        ),
        'status': 'pending',
      });
  await FirebaseAuth.instance.signOut();
}

class LegacyProfilePage extends StatelessWidget {
  const LegacyProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .snapshots(),
      builder: (context, snapshot) {
        final l10n = AppLocalizations.of(context)!;
        final profile = snapshot.data?.data();
        final nickname = profile?['nickname'] as String? ?? 'Načítání…';
        final avatarId = profile?['avatarId'] as String? ?? 'fox';
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Center(child: AvatarImage(avatarId: avatarId, radius: 40)),
            const SizedBox(height: 12),
            Text(
              nickname,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Center(
              child: OutlinedButton.icon(
                onPressed: profile == null
                    ? null
                    : () async {
                        final selected = await showModalBottomSheet<String>(
                          context: context,
                          isScrollControlled: true,
                          builder: (_) =>
                              AvatarPickerSheet(selectedId: avatarId),
                        );
                        if (selected == null || selected == avatarId) return;
                        await FirebaseFirestore.instance
                            .collection('users')
                            .doc(uid)
                            .update({'avatarId': selected});
                      },
                icon: const Icon(Icons.face_retouching_natural_outlined),
                label: Text(tr(context, 'Změnit avatar')),
              ),
            ),
            const SizedBox(height: 28),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: Text(l10n.changeNickname),
              onTap: profile == null
                  ? null
                  : () async {
                      if (!_nicknameChangeAvailable(profile)) {
                        final changedAt =
                            (profile['nicknameChangedAt'] as Timestamp?)
                                ?.toDate();
                        final nextDate = changedAt?.add(
                          const Duration(days: 30),
                        );
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              nextDate == null
                                  ? tr(context, 'Přezdívku zatím nelze změnit.')
                                  : '${tr(context, 'Další změna přezdívky bude možná')} ${_shortDate(nextDate)}.',
                            ),
                          ),
                        );
                        return;
                      }
                      final confirmed = await showDialog<bool>(
                        context: context,
                        builder: (dialogContext) => AlertDialog(
                          title: Text(l10n.changeNickname),
                          content: Text(
                            tr(
                              dialogContext,
                              'Tuto změnu je možné provést pouze jednou za 30 dní. Chceš pokračovat?',
                            ),
                          ),
                          actions: [
                            TextButton(
                              onPressed: () =>
                                  Navigator.pop(dialogContext, false),
                              child: Text(tr(dialogContext, 'Zrušit')),
                            ),
                            FilledButton(
                              onPressed: () =>
                                  Navigator.pop(dialogContext, true),
                              child: Text(tr(dialogContext, 'Ano')),
                            ),
                          ],
                        ),
                      );
                      if (confirmed == true && context.mounted) {
                        await showDialog<void>(
                          context: context,
                          builder: (_) => ChangeNicknameDialog(
                            currentNickname: nickname,
                            userId: uid,
                          ),
                        );
                      }
                    },
            ),
            ListTile(
              leading: const Icon(Icons.language_outlined),
              title: Text(l10n.language),
              trailing: Text(switch (Localizations.localeOf(
                context,
              ).languageCode) {
                'en' => l10n.english,
                'de' => l10n.german,
                'pl' => l10n.polish,
                _ => l10n.czech,
              }),
              onTap: () async {
                final language = await showModalBottomSheet<String>(
                  context: context,
                  builder: (context) => SafeArea(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ListTile(
                          title: Text(l10n.czech),
                          trailing: const Text('CS'),
                          onTap: () => Navigator.pop(context, 'cs'),
                        ),
                        ListTile(
                          title: Text(l10n.english),
                          trailing: const Text('EN'),
                          onTap: () => Navigator.pop(context, 'en'),
                        ),
                        ListTile(
                          title: Text(l10n.german),
                          trailing: const Text('DE'),
                          onTap: () => Navigator.pop(context, 'de'),
                        ),
                        ListTile(
                          title: Text(l10n.polish),
                          trailing: const Text('PL'),
                          onTap: () => Navigator.pop(context, 'pl'),
                        ),
                      ],
                    ),
                  ),
                );
                if (language != null) {
                  await FirebaseFirestore.instance
                      .collection('users')
                      .doc(uid)
                      .update({'language': language});
                  appLocale.value = Locale(language);
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.lock_outline),
              title: Text(tr(context, 'Změnit heslo')),
              onTap: () => showDialog<void>(
                context: context,
                builder: (_) => const ChangePasswordDialog(),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.notifications_outlined),
              title: Text(tr(context, 'Nastavení notifikací')),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => NotificationSettingsPage(userId: uid),
                ),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.help_outline),
              title: Text(tr(context, 'Nápověda')),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const HelpPage()),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.warning_amber_outlined),
              title: Text(tr(context, 'Moje varování')),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => WarningHistoryPage(userId: uid),
                ),
              ),
            ),
            StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
              stream: FirebaseFirestore.instance
                  .collection('moderators')
                  .doc(uid)
                  .snapshots(),
              builder: (context, moderator) => moderator.data?.exists == true
                  ? ListTile(
                      leading: const Icon(Icons.admin_panel_settings_outlined),
                      title: Text(tr(context, 'Moderace')),
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const ModerationPage(),
                        ),
                      ),
                    )
                  : const SizedBox.shrink(),
            ),
            ListTile(
              leading: const Icon(Icons.policy_outlined),
              title: Text(tr(context, 'Právní informace')),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const LegalHubPage()),
              ),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout),
              title: Text(l10n.logout),
              onTap: FirebaseAuth.instance.signOut,
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: Colors.red),
              title: Text(
                l10n.deleteAccount,
                style: TextStyle(color: Colors.red),
              ),
              onTap: () async {
                final confirmed = await showDialog<bool>(
                  context: context,
                  builder: (dialogContext) => AlertDialog(
                    title: Text(tr(dialogContext, 'Smazat účet?')),
                    content: Text(
                      tr(
                        dialogContext,
                        'Veřejný obsah bude při serverovém zpracování skryt. Potřebné bezpečnostní záznamy zůstanou 60 dní, potom budou odstraněny nebo anonymizovány.',
                      ),
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(dialogContext, false),
                        child: Text(tr(dialogContext, 'Zrušit')),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.pop(dialogContext, true),
                        child: Text(tr(dialogContext, 'Požádat o smazání')),
                      ),
                    ],
                  ),
                );
                if (confirmed != true || !context.mounted) return;
                final user = FirebaseAuth.instance.currentUser!;
                await FirebaseFirestore.instance
                    .collection('accountDeletionRequests')
                    .doc(user.uid)
                    .set({
                      'userId': user.uid,
                      'email': user.email,
                      'requestedAt': FieldValue.serverTimestamp(),
                      'retainUntil': Timestamp.fromDate(
                        DateTime.now().add(const Duration(days: 60)),
                      ),
                      'status': 'pending',
                    });
                await FirebaseAuth.instance.signOut();
              },
            ),
          ],
        );
      },
    );
  }
}

class ModerationPage extends StatelessWidget {
  const ModerationPage({super.key});
  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 2,
    child: Scaffold(
      appBar: AppBar(
        title: Text(tr(context, 'Moderace')),
        bottom: TabBar(
          tabs: [
            Tab(text: tr(context, 'Shouty')),
            Tab(text: tr(context, 'Komentáře')),
          ],
        ),
      ),
      body: TabBarView(
        children: [
          _ReportList(collection: 'reports'),
          _ReportList(collection: 'commentReports'),
        ],
      ),
    ),
  );
}

class _ReportList extends StatelessWidget {
  const _ReportList({required this.collection});
  final String collection;
  @override
  Widget build(BuildContext context) =>
      StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection(collection)
            .where('status', isEqualTo: 'open')
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError)
            return Center(
              child: Text(tr(context, 'Hlášení se nepodařilo načíst.')),
            );
          if (!snapshot.hasData)
            return const Center(child: CircularProgressIndicator());
          final reports = snapshot.data!.docs;
          if (reports.isEmpty)
            return Center(child: Text(tr(context, 'Žádná otevřená hlášení.')));
          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: reports.length,
            itemBuilder: (context, index) {
              final report = reports[index];
              final data = report.data();
              return Card(
                child: ListTile(
                  title: Text(data['reason'] as String? ?? ''),
                  subtitle: Text(
                    '${tr(context, 'Nahlásil/a')}: ${data['reporterId'] ?? ''}',
                  ),
                  trailing: PopupMenuButton<String>(
                    onSelected: (action) => _act(context, report, action),
                    itemBuilder: (context) => [
                      PopupMenuItem(
                        value: 'resolve',
                        child: Text(tr(context, 'Označit jako vyřešené')),
                      ),
                      PopupMenuItem(
                        value: 'remove',
                        child: Text(tr(context, 'Odstranit z veřejnosti')),
                      ),
                      PopupMenuItem(
                        value: 'warning',
                        child: Text(tr(context, 'Udělit varování')),
                      ),
                      PopupMenuItem(
                        value: 'ban1d',
                        child: Text(tr(context, 'Ban na 1 den')),
                      ),
                      PopupMenuItem(
                        value: 'banPermanent',
                        child: Text(tr(context, 'Trvalý ban')),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      );

  Future<void> _act(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> report,
    String action,
  ) async {
    final data = report.data();
    final shoutRef = FirebaseFirestore.instance
        .collection('shouts')
        .doc(data['shoutId'] as String);
    final target = collection == 'reports'
        ? shoutRef
        : shoutRef.collection('comments').doc(data['commentId'] as String);
    final targetSnapshot = await target.get();
    final authorId = targetSnapshot.data()?['authorId'] as String?;
    if (action == 'remove') {
      if (collection == 'reports') {
        await target.update({'status': 'deleted'});
      } else {
        await target.delete();
      }
    }
    if (authorId != null && action == 'warning') {
      await FirebaseFirestore.instance.collection('warnings').add({
        'userId': authorId,
        'reason': data['reason'],
        'createdAt': FieldValue.serverTimestamp(),
        'moderatorId': FirebaseAuth.instance.currentUser!.uid,
      });
    }
    if (authorId != null && action.startsWith('ban')) {
      await FirebaseFirestore.instance.collection('bans').doc(authorId).set({
        'userId': authorId,
        'reason': data['reason'],
        'createdAt': FieldValue.serverTimestamp(),
        'expiresAt': action == 'ban1d'
            ? Timestamp.fromDate(DateTime.now().add(const Duration(days: 1)))
            : null,
        'moderatorId': FirebaseAuth.instance.currentUser!.uid,
      });
    }
    await report.reference.update({
      'status': 'resolved',
      'resolvedAt': FieldValue.serverTimestamp(),
    });
  }
}

class WarningHistoryPage extends StatelessWidget {
  const WarningHistoryPage({super.key, required this.userId});
  final String userId;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(tr(context, 'Moje varování'))),
    body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('warnings')
          .where('userId', isEqualTo: userId)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData)
          return const Center(child: CircularProgressIndicator());
        final warnings = snapshot.data!.docs;
        if (warnings.isEmpty)
          return Center(child: Text(tr(context, 'Nemáš žádná varování.')));
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: warnings.length,
          itemBuilder: (context, index) {
            final warning = warnings[index].data();
            return Card(
              child: ListTile(
                leading: const Icon(Icons.warning_amber_outlined),
                title: Text(warning['reason'] as String? ?? ''),
                subtitle: Text(tr(context, 'Varování od moderace')),
              ),
            );
          },
        );
      },
    ),
  );
}

class ChangePasswordDialog extends StatefulWidget {
  const ChangePasswordDialog({super.key});

  @override
  State<ChangePasswordDialog> createState() => _ChangePasswordDialogState();
}

class _ChangePasswordDialogState extends State<ChangePasswordDialog> {
  final _currentPassword = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirmPassword = TextEditingController();
  String? _error;
  bool _saving = false;

  @override
  void dispose() {
    _currentPassword.dispose();
    _newPassword.dispose();
    _confirmPassword.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(tr(context, 'Změnit heslo')),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 46,
          child: TextField(
            controller: _currentPassword,
            obscureText: true,
            decoration: _passwordDecoration(tr(context, 'Aktuální heslo')),
          ),
        ),
        const SizedBox(height: 9),
        SizedBox(
          height: 46,
          child: TextField(
            controller: _newPassword,
            obscureText: true,
            decoration: _passwordDecoration(tr(context, 'Nové heslo')),
          ),
        ),
        const SizedBox(height: 9),
        SizedBox(
          height: 46,
          child: TextField(
            controller: _confirmPassword,
            obscureText: true,
            decoration: _passwordDecoration(tr(context, 'Potvrdit nové heslo')),
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
      ],
    ),
    actions: [
      TextButton(
        onPressed: _saving ? null : () => Navigator.pop(context),
        child: Text(tr(context, 'Zrušit')),
      ),
      FilledButton(
        onPressed: _saving ? null : _changePassword,
        child: Text(tr(context, 'Uložit')),
      ),
    ],
  );

  InputDecoration _passwordDecoration(String label) => InputDecoration(
    labelText: label,
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
  );

  Future<void> _changePassword() async {
    final user = FirebaseAuth.instance.currentUser!;
    final hasPasswordProvider = user.providerData.any(
      (provider) => provider.providerId == 'password',
    );
    if (!hasPasswordProvider || user.email == null) {
      setState(
        () => _error = tr(context, 'Heslo účtu Google změň přímo u Google.'),
      );
      return;
    }
    if (_newPassword.text.length < 6) {
      setState(() => _error = tr(context, 'Zvol silnější heslo.'));
      return;
    }
    if (_newPassword.text != _confirmPassword.text) {
      setState(() => _error = tr(context, 'Hesla se neshodují.'));
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final credential = EmailAuthProvider.credential(
        email: user.email!,
        password: _currentPassword.text,
      );
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(_newPassword.text);
      if (mounted) Navigator.pop(context);
    } on FirebaseAuthException {
      if (mounted) {
        setState(
          () => _error = tr(
            context,
            'Heslo se nepodařilo změnit. Zkontroluj aktuální heslo.',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class NotificationSettingsPage extends StatelessWidget {
  const NotificationSettingsPage({super.key, required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context) {
    final reference = FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection('settings')
        .doc('notifications');
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'Nastavení notifikací'))),
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: reference.snapshots(),
        builder: (context, snapshot) {
          final settings = snapshot.data?.data();
          final replies = settings?['replies'] as bool? ?? true;
          final reactions = settings?['reactions'] as bool? ?? true;
          final nearbyShouts = settings?['nearbyShouts'] as bool? ?? true;
          Future<void> save({
            bool? nextReplies,
            bool? nextReactions,
            bool? nextNearby,
          }) => reference.set({
            'replies': nextReplies ?? replies,
            'reactions': nextReactions ?? reactions,
            'nearbyShouts': nextNearby ?? nearbyShouts,
          });
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                tr(
                  context,
                  'Uložené preference se použijí po zapnutí oznámení.',
                ),
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              SwitchListTile(
                value: replies,
                onChanged: (value) => save(nextReplies: value),
                title: Text(tr(context, 'Odpovědi na komentáře')),
              ),
              SwitchListTile(
                value: reactions,
                onChanged: (value) => save(nextReactions: value),
                title: Text(tr(context, 'Reakce na mé Shouty')),
              ),
              SwitchListTile(
                value: nearbyShouts,
                onChanged: (value) => save(nextNearby: value),
                title: Text(tr(context, 'Nové Shouty v okolí')),
              ),
            ],
          );
        },
      ),
    );
  }
}

class HelpPage extends StatelessWidget {
  const HelpPage({super.key});

  @override
  Widget build(BuildContext context) {
    final topics = [
      (
        'Jak fungují Shouty?',
        'Shout se zobrazuje lidem v okolí po dobu, kterou nastavíš při publikování.',
      ),
      (
        'Jak fungují komentáře?',
        'Na komentář můžeš odpovědět přes @přezdívku, hodnotit ho nebo nahlásit.',
      ),
      (
        'Bezpečnost a pravidla',
        'Nesdílej veřejně citlivé kontakty. Nevhodný obsah nahlas nebo autora zablokuj.',
      ),
      (
        'Účet a soukromí',
        'Používáme přezdívku místo skutečného jména. Nastavení účtu najdeš v profilu.',
      ),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'Nápověda'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ...topics.map(
            (topic) => Card(
              child: ExpansionTile(
                title: Text(tr(context, topic.$1)),
                childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(tr(context, topic.$2)),
                  ),
                ],
              ),
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.gavel_outlined),
              title: Text(tr(context, 'Pravidla komunity')),
              subtitle: Text(
                tr(context, 'Bezpečné používání ShoutOutu pro všechny.'),
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const CommunityRulesPage()),
              ),
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.article_outlined),
              title: Text(tr(context, 'Podmínky použití')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      const LegalDocumentPage(type: LegalDocumentType.terms),
                ),
              ),
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.privacy_tip_outlined),
              title: Text(tr(context, 'Zásady ochrany soukromí')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      const LegalDocumentPage(type: LegalDocumentType.privacy),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class CommunityRulesPage extends StatelessWidget {
  const CommunityRulesPage({super.key});

  @override
  Widget build(BuildContext context) {
    final rules = [
      (
        Icons.people_outline,
        'Respektuj ostatní',
        'Neobtěžuj, nevyhrožuj, neponižuj ani nediskriminuj jiné lidi.',
      ),
      (
        Icons.no_accounts_outlined,
        'Chraň soukromí',
        'Nezveřejňuj cizí osobní údaje, kontakty, přesnou adresu ani soukromé zprávy.',
      ),
      (
        Icons.block_outlined,
        'Žádný nelegální obsah',
        'Nezveřejňuj nabídky drog, zbraní, podvodů ani jinou nezákonnou činnost.',
      ),
      (
        Icons.favorite_border,
        '16+ bez explicitního obsahu',
        'Flirt a neexplicitní debata jsou v pořádku. Pornografie, nahota, sexuální nabídky, obtěžování a obsah týkající se nezletilých jsou zakázané.',
      ),
      (
        Icons.forum_outlined,
        'Piš veřejně a férově',
        'Shouty a komentáře jsou veřejné. Neposílej spam, manipuluj s hodnocením ani neobcházej blokování a bany.',
      ),
      (
        Icons.flag_outlined,
        'Nahlaš problém',
        'Nevhodný Shout nebo komentář nahlas. Autora můžeš také zablokovat. Závažné či opakované porušení může vést k omezení nebo trvalému zablokování účtu.',
      ),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'Pravidla komunity'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            tr(
              context,
              'ShoutOut je komunitní prostor pro lidi od 16 let. Pomoz udržet feed užitečný a bezpečný.',
            ),
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: 12),
          ...rules.map(
            (rule) => Card(
              child: ListTile(
                leading: Icon(rule.$1),
                title: Text(tr(context, rule.$2)),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(tr(context, rule.$3)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

bool _nicknameChangeAvailable(Map<String, dynamic> profile) {
  final count = profile['nicknameChangeCount'] as int? ?? 0;
  if (count == 0) return true;
  final changedAt = (profile['nicknameChangedAt'] as Timestamp?)?.toDate();
  return changedAt != null &&
      !DateTime.now().isBefore(changedAt.add(const Duration(days: 30)));
}

String _shortDate(DateTime date) =>
    '${date.day.toString().padLeft(2, '0')}.${date.month.toString().padLeft(2, '0')}.${date.year}';

class ChangeNicknameDialog extends StatefulWidget {
  const ChangeNicknameDialog({
    super.key,
    required this.currentNickname,
    required this.userId,
  });

  final String currentNickname;
  final String userId;

  @override
  State<ChangeNicknameDialog> createState() => _ChangeNicknameDialogState();
}

class _ChangeNicknameDialogState extends State<ChangeNicknameDialog> {
  final _controller = TextEditingController();
  Timer? _availabilityTimer;
  bool? _isAvailable;
  bool _saving = false;

  @override
  void dispose() {
    _availabilityTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(AppLocalizations.of(context)!.changeNickname),
    content: TextField(
      controller: _controller,
      autofocus: true,
      maxLength: 24,
      onChanged: _checkAvailabilityLater,
      decoration: InputDecoration(
        labelText: tr(context, 'Přezdívka'),
        border: const OutlineInputBorder(),
        helperText: _isAvailable == null
            ? null
            : _isAvailable!
            ? tr(context, 'Přezdívka je volná')
            : tr(context, 'Tato přezdívka je obsazená'),
        helperStyle: TextStyle(
          color: _isAvailable == false ? Colors.red : Colors.green,
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _saving ? null : () => Navigator.pop(context),
        child: Text(tr(context, 'Zrušit')),
      ),
      FilledButton(
        onPressed: _saving ? null : _save,
        child: Text(tr(context, 'Uložit')),
      ),
    ],
  );

  void _checkAvailabilityLater(String value) {
    _availabilityTimer?.cancel();
    final normalized = value.trim().toLowerCase();
    if (!_isValidNickname(value.trim()) ||
        normalized == widget.currentNickname.toLowerCase()) {
      setState(() => _isAvailable = null);
      return;
    }
    _availabilityTimer = Timer(const Duration(milliseconds: 350), () async {
      final exists = await FirebaseFirestore.instance
          .collection('nicknames')
          .doc(normalized)
          .get();
      if (mounted && _controller.text.trim().toLowerCase() == normalized) {
        setState(() => _isAvailable = !exists.exists);
      }
    });
  }

  Future<void> _save() async {
    final nickname = _controller.text.trim();
    if (!_isValidNickname(nickname)) {
      _showError(
        tr(
          context,
          'Použij 3–24 znaků. Pomlčka a podtržítko mohou být jen mezi částmi přezdívky.',
        ),
      );
      return;
    }
    final nicknameLower = nickname.toLowerCase();
    if (nicknameLower == widget.currentNickname.toLowerCase()) {
      _showError(tr(context, 'Zadej jinou přezdívku.'));
      return;
    }

    setState(() => _saving = true);
    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final db = FirebaseFirestore.instance;
        final userRef = db.collection('users').doc(widget.userId);
        final newNicknameRef = db.collection('nicknames').doc(nicknameLower);
        final oldNicknameRef = db
            .collection('nicknames')
            .doc(widget.currentNickname.toLowerCase());
        if ((await transaction.get(newNicknameRef)).exists) {
          throw StateError('taken');
        }
        transaction.set(newNicknameRef, {
          'uid': widget.userId,
          'nickname': nickname,
          'nicknameLower': nicknameLower,
          'createdAt': FieldValue.serverTimestamp(),
        });
        transaction.delete(oldNicknameRef);
        transaction.update(userRef, {
          'nickname': nickname,
          'nicknameLower': nicknameLower,
          'nicknameChangedAt': FieldValue.serverTimestamp(),
          'nicknameChangeCount': FieldValue.increment(1),
        });
      });
      if (!mounted) return;
      Navigator.pop(context);
    } on StateError catch (error) {
      if (!mounted) return;
      if (error.message == 'taken') {
        _showError(tr(context, 'Tato přezdívka už je obsazená.'));
      } else {
        _showError(tr(context, 'Přezdívku se nepodařilo změnit.'));
      }
    } catch (_) {
      if (!mounted) return;
      _showError(tr(context, 'Přezdívku se nepodařilo změnit.'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }
}

bool _isValidNickname(String nickname) => RegExp(
  r'^(?=.{3,24}$)[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*$',
).hasMatch(nickname);

class RatedShoutCard extends StatefulWidget {
  const RatedShoutCard({
    super.key,
    required this.shout,
    required this.onSave,
    required this.onReaction,
  });

  final Shout shout;
  final VoidCallback onSave;
  final ValueChanged<bool> onReaction;

  @override
  State<RatedShoutCard> createState() => _RatedShoutCardState();
}

class _RatedShoutCardState extends State<RatedShoutCard> {
  bool _revealed = false;

  @override
  Widget build(BuildContext context) {
    final isAuthor =
        widget.shout.authorId == FirebaseAuth.instance.currentUser?.uid;
    if (widget.shout.isHiddenByRating && !isAuthor && !_revealed) {
      return Card(
        child: ListTile(
          leading: const Icon(Icons.visibility_off_outlined),
          title: Text(tr(context, 'Shout s nízkým hodnocením')),
          subtitle: Text(
            tr(
              context,
              'Tento Shout byl sbalen kvůli výrazně negativnímu hodnocení.',
            ),
          ),
          trailing: TextButton(
            onPressed: () => setState(() => _revealed = true),
            child: Text(tr(context, 'Zobrazit')),
          ),
        ),
      );
    }
    return ShoutCard(
      shout: widget.shout,
      onSave: widget.onSave,
      onReaction: widget.onReaction,
    );
  }
}

class ShoutCard extends StatelessWidget {
  const ShoutCard({
    super.key,
    required this.shout,
    required this.onSave,
    required this.onReaction,
    this.showSaveCount = false,
    this.showDeleteButton = false,
    this.onDelete,
    this.openOnTap = true,
  });

  final Shout shout;
  final VoidCallback onSave;
  final ValueChanged<bool> onReaction;
  final bool showSaveCount;
  final bool showDeleteButton;
  final Future<void> Function()? onDelete;
  final bool openOnTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    void openComments() {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ShoutDetailPage(
            shout: shout,
            onSave: onSave,
            onReaction: onReaction,
          ),
        ),
      );
    }

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: openOnTap ? openComments : null,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    backgroundColor: accent.withValues(alpha: .14),
                    child: Icon(Icons.person_outline, color: accent),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          shout.author,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          '${shout.distanceLabel} · ${shout.ageLabel} · ${shout.expiryLabel(context)}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: onSave,
                    tooltip: shout.isSaved
                        ? tr(context, 'Odebrat z uložených')
                        : tr(context, 'Uložit shout'),
                    icon: Icon(
                      shout.isSaved ? Icons.bookmark : Icons.bookmark_outline,
                    ),
                  ),
                  if (showDeleteButton)
                    IconButton(
                      onPressed: () async {
                        final confirmed = await showDialog<bool>(
                          context: context,
                          builder: (context) => AlertDialog(
                            title: Text(tr(context, 'Smazat shout?')),
                            content: Text(
                              tr(context, 'Shout zmizí z veřejného feedu.'),
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(context, false),
                                child: Text(tr(context, 'Zrušit')),
                              ),
                              FilledButton(
                                onPressed: () => Navigator.pop(context, true),
                                child: Text(tr(context, 'Smazat')),
                              ),
                            ],
                          ),
                        );
                        if (confirmed == true) await onDelete?.call();
                      },
                      tooltip: tr(context, 'Smazat shout'),
                      icon: const Icon(Icons.delete_outline),
                    ),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                shout.title,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              Text(shout.text, style: theme.textTheme.bodyLarge),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: shout.categories
                    .map(
                      (category) => Chip(
                        label: Text(tr(context, category)),
                        visualDensity: VisualDensity.compact,
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  ReactionButton(
                    icon: Icons.thumb_up_outlined,
                    value: shout.likes,
                    selected: shout.isLiked,
                    onPressed: () => onReaction(true),
                  ),
                  const SizedBox(width: 12),
                  ReactionButton(
                    icon: Icons.thumb_down_outlined,
                    value: shout.dislikes,
                    selected: shout.isDisliked,
                    onPressed: () => onReaction(false),
                  ),
                  const SizedBox(width: 12),
                  StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                    stream: FirebaseFirestore.instance
                        .collection('shouts')
                        .doc(shout.id)
                        .collection('comments')
                        .snapshots(),
                    builder: (context, snapshot) => ReactionButton(
                      icon: Icons.chat_bubble_outline,
                      value: snapshot.data?.docs.length ?? shout.comments,
                      onPressed: openComments,
                    ),
                  ),
                  const Spacer(),
                  if (showSaveCount)
                    Text(
                      '${shout.saves} ${tr(context, 'Uložené')}',
                      style: theme.textTheme.bodySmall,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ShoutDetailPage extends StatefulWidget {
  const ShoutDetailPage({
    super.key,
    required this.shout,
    required this.onSave,
    required this.onReaction,
  });

  final Shout shout;
  final VoidCallback onSave;
  final ValueChanged<bool> onReaction;

  @override
  State<ShoutDetailPage> createState() => _ShoutDetailPageState();
}

class _ShoutDetailPageState extends State<ShoutDetailPage> {
  final _commentController = TextEditingController();
  final _commentFocusNode = FocusNode();
  final Map<String, GlobalKey<_CommentTileState>> _commentKeys = {};
  String? _replyToCommentId;
  String? _replyToNickname;

  @override
  void dispose() {
    _commentController.dispose();
    _commentFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(tr(context, 'Shout')),
      actions: [
        if (widget.shout.authorId != FirebaseAuth.instance.currentUser?.uid)
          IconButton(
            onPressed: _blockAuthor,
            tooltip: 'Blokovat autora',
            icon: const Icon(Icons.person_off_outlined),
          ),
        if (widget.shout.authorId == FirebaseAuth.instance.currentUser?.uid)
          IconButton(
            onPressed: _deleteShout,
            tooltip: tr(context, 'Smazat shout'),
            icon: const Icon(Icons.delete_outline),
          ),
        IconButton(
          onPressed: _reportShout,
          tooltip: tr(context, 'Nahlásit'),
          icon: const Icon(Icons.flag_outlined),
        ),
      ],
    ),
    body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('shouts')
          .doc(widget.shout.id)
          .collection('comments')
          .orderBy('createdAt')
          .snapshots(),
      builder: (context, snapshot) {
        final comments = snapshot.data?.docs ?? [];
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            ShoutCard(
              shout: widget.shout,
              onSave: () {
                widget.onSave();
                setState(() {});
              },
              onReaction: (like) {
                widget.onReaction(like);
                setState(() {});
              },
              openOnTap: false,
            ),
            const SizedBox(height: 16),
            Text(
              '${tr(context, 'Komentáře')} (${comments.length})',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            ...comments.map((comment) {
              return CommentTile(
                key: _commentKey(comment.id),
                comment: comment,
                shoutAuthorId: widget.shout.authorId,
                onReply: _replyTo,
                onReport: () => _reportComment(comment),
                onJumpToReply: _jumpToComment,
              );
            }),
          ],
        );
      },
    ),
    bottomNavigationBar: SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_replyToNickname != null)
              Align(
                alignment: Alignment.centerLeft,
                child: InputChip(
                  label: Text('${tr(context, 'Odpovídáš')} @$_replyToNickname'),
                  onDeleted: () => setState(() {
                    _replyToCommentId = null;
                    _replyToNickname = null;
                    _commentController.clear();
                  }),
                ),
              ),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _commentController,
                    focusNode: _commentFocusNode,
                    maxLength: 220,
                    decoration: InputDecoration(
                      hintText: tr(context, 'Napiš veřejný komentář'),
                      border: const OutlineInputBorder(),
                      counterText: '',
                    ),
                  ),
                ),
                IconButton(
                  onPressed: _sendComment,
                  icon: const Icon(Icons.send_outlined),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );

  GlobalKey<_CommentTileState> _commentKey(String commentId) =>
      _commentKeys.putIfAbsent(commentId, GlobalKey<_CommentTileState>.new);

  void _replyTo(String commentId, String nickname) {
    setState(() {
      _replyToCommentId = commentId;
      _replyToNickname = nickname;
    });
    _commentController
      ..text = '@$nickname '
      ..selection = TextSelection.collapsed(offset: nickname.length + 2);
    FocusScope.of(context).requestFocus(_commentFocusNode);
  }

  Future<void> _jumpToComment(String commentId) async {
    final target = _commentKeys[commentId]?.currentContext;
    if (target == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(tr(context, 'Odkazovaný komentář už není dostupný.')),
        ),
      );
      return;
    }
    await Scrollable.ensureVisible(
      target,
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeInOut,
      alignment: .25,
    );
    _commentKeys[commentId]?.currentState?.highlight();
  }

  Future<void> _sendComment() async {
    final comment = _commentController.text.trim();
    if (comment.isEmpty) return;
    final user = FirebaseAuth.instance.currentUser!;
    final profile = await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get();
    await FirebaseFirestore.instance
        .collection('shouts')
        .doc(widget.shout.id)
        .collection('comments')
        .add({
          'authorId': user.uid,
          'authorNickname': profile.data()!['nickname'],
          'text': comment,
          'createdAt': FieldValue.serverTimestamp(),
          if (_replyToCommentId != null) 'replyToCommentId': _replyToCommentId,
          if (_replyToNickname != null) 'replyToNickname': _replyToNickname,
        });
    if (!mounted) return;
    setState(() {
      _commentController.clear();
      _replyToCommentId = null;
      _replyToNickname = null;
    });
  }

  Future<void> _deleteShout() async {
    await FirebaseFirestore.instance
        .collection('shouts')
        .doc(widget.shout.id)
        .update({'status': 'deleted'});
    widget.shout.status = ShoutStatus.deleted;
    if (mounted) Navigator.pop(context, true);
  }

  Future<void> _blockAuthor() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Blokovat autora?'),
        content: const Text(
          'Jeho Shouty se přestanou zobrazovat ve tvém feedu.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Zrušit'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Blokovat'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await FirebaseFirestore.instance
        .collection('users')
        .doc(FirebaseAuth.instance.currentUser!.uid)
        .collection('blocked')
        .doc(widget.shout.authorId)
        .set({'createdAt': FieldValue.serverTimestamp()});
    if (mounted) Navigator.pop(context, true);
  }

  Future<void> _reportShout() async {
    final reason = await _askReportReason('Nahlásit Shout');
    if (reason == null) return;
    await FirebaseFirestore.instance.collection('reports').add({
      'reporterId': FirebaseAuth.instance.currentUser!.uid,
      'shoutId': widget.shout.id,
      'reason': reason,
      'createdAt': FieldValue.serverTimestamp(),
      'status': 'open',
    });
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Hlášení bylo odesláno.')));
    }
  }

  Future<void> _reportComment(
    QueryDocumentSnapshot<Map<String, dynamic>> comment,
  ) async {
    final reason = await _askReportReason('Nahlásit komentář');
    if (reason == null) return;
    await FirebaseFirestore.instance.collection('commentReports').add({
      'reporterId': FirebaseAuth.instance.currentUser!.uid,
      'shoutId': widget.shout.id,
      'commentId': comment.id,
      'reason': reason,
      'createdAt': FieldValue.serverTimestamp(),
      'status': 'open',
    });
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr(context, 'Hlášení bylo odesláno.'))),
      );
    }
  }

  Future<String?> _askReportReason(String title) async {
    const reasons = [
      'Nelegální obsah nebo drogy',
      'Obtěžování, nenávist nebo vyhrožování',
      'Osobní údaje nebo soukromí',
      'Spam, podvod nebo manipulace',
      'Explicitní nebo nevhodný obsah',
      'Jiné',
    ];
    final detail = TextEditingController();
    var selected = reasons.first;
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(tr(context, title)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: selected,
                items: reasons
                    .map(
                      (reason) => DropdownMenuItem(
                        value: reason,
                        child: Text(tr(context, reason)),
                      ),
                    )
                    .toList(),
                onChanged: (value) => setDialogState(() => selected = value!),
                decoration: InputDecoration(
                  labelText: tr(context, 'Důvod hlášení'),
                ),
              ),
              TextField(
                controller: detail,
                maxLength: 400,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: tr(context, 'Volitelně doplň podrobnosti'),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(tr(context, 'Zrušit')),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(
                context,
                detail.text.trim().isEmpty
                    ? selected
                    : '$selected: ${detail.text.trim()}',
              ),
              child: Text(tr(context, 'Odeslat')),
            ),
          ],
        ),
      ),
    );
    detail.dispose();
    return result;
  }
}

class CommentTile extends StatefulWidget {
  const CommentTile({
    super.key,
    required this.comment,
    required this.shoutAuthorId,
    required this.onReply,
    required this.onReport,
    required this.onJumpToReply,
  });

  final QueryDocumentSnapshot<Map<String, dynamic>> comment;
  final String shoutAuthorId;
  final void Function(String commentId, String nickname) onReply;
  final VoidCallback onReport;
  final ValueChanged<String> onJumpToReply;

  @override
  State<CommentTile> createState() => _CommentTileState();
}

class _CommentTileState extends State<CommentTile> {
  bool _revealed = false;
  bool _highlighted = false;

  void highlight() {
    setState(() {
      _revealed = true;
      _highlighted = true;
    });
    Future<void>.delayed(const Duration(milliseconds: 1200), () {
      if (mounted) setState(() => _highlighted = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.comment.data();
    final ownComment =
        data['authorId'] == FirebaseAuth.instance.currentUser?.uid;
    final reactions = widget.comment.reference.collection('reactions');
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: reactions.snapshots(),
      builder: (context, snapshot) {
        final reactionDocs = snapshot.data?.docs ?? [];
        final likes = reactionDocs
            .where((doc) => doc.data()['type'] == 'like')
            .length;
        final dislikes = reactionDocs
            .where((doc) => doc.data()['type'] == 'dislike')
            .length;
        String? ownType;
        for (final doc in reactionDocs) {
          if (doc.id == FirebaseAuth.instance.currentUser?.uid) {
            ownType = doc.data()['type'] as String?;
            break;
          }
        }
        final total = likes + dislikes;
        final hidden = !ownComment && total >= 10 && dislikes / total >= .7;
        if (hidden && !_revealed) {
          return Card(
            child: ListTile(
              leading: const Icon(Icons.visibility_off_outlined),
              title: Text(tr(context, 'Skrytý komentář')),
              subtitle: Text(
                tr(context, 'Komentář byl skryt kvůli negativnímu hodnocení.'),
              ),
              trailing: TextButton(
                onPressed: () => setState(() => _revealed = true),
                child: Text(tr(context, 'Zobrazit')),
              ),
            ),
          );
        }
        return Card(
          color: _highlighted
              ? Theme.of(context).colorScheme.primaryContainer
              : null,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const CircleAvatar(
                      radius: 16,
                      child: Icon(Icons.person_outline),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 6,
                        children: [
                          Text(
                            data['authorNickname'] as String,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          if (data['authorId'] == widget.shoutAuthorId)
                            Chip(
                              label: Text(tr(context, 'Autor')),
                              visualDensity: VisualDensity.compact,
                            ),
                        ],
                      ),
                    ),
                    if (ownComment)
                      IconButton(
                        tooltip: tr(context, 'Smazat komentář'),
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => widget.comment.reference.delete(),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                _commentText(context, data),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 14,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    ReactionButton(
                      icon: Icons.thumb_up_outlined,
                      value: likes,
                      selected: ownType == 'like',
                      onPressed: () => _toggleReaction('like'),
                    ),
                    ReactionButton(
                      icon: Icons.thumb_down_outlined,
                      value: dislikes,
                      selected: ownType == 'dislike',
                      onPressed: () => _toggleReaction('dislike'),
                    ),
                    TextButton.icon(
                      onPressed: () => widget.onReply(
                        widget.comment.id,
                        data['authorNickname'] as String,
                      ),
                      icon: const Icon(Icons.reply_outlined, size: 18),
                      label: Text(tr(context, 'Odpovědět')),
                    ),
                    TextButton.icon(
                      onPressed: widget.onReport,
                      icon: const Icon(Icons.flag_outlined, size: 18),
                      label: Text(tr(context, 'Nahlásit')),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _toggleReaction(String type) async {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    final reference = widget.comment.reference.collection('reactions').doc(uid);
    final current = await reference.get();
    if (current.data()?['type'] == type) {
      await reference.delete();
    } else {
      await reference.set({
        'type': type,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }
  }

  Widget _commentText(BuildContext context, Map<String, dynamic> data) {
    final text = data['text'] as String;
    final replyToNickname = data['replyToNickname'] as String?;
    final replyToCommentId = data['replyToCommentId'] as String?;
    if (replyToNickname == null || replyToCommentId == null) {
      return Text(text);
    }
    final prefix = '@$replyToNickname';
    final remainingText = text.startsWith(prefix)
        ? text.substring(prefix.length).trimLeft()
        : text;
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        InkWell(
          onTap: () => widget.onJumpToReply(replyToCommentId),
          borderRadius: BorderRadius.circular(4),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 1),
            child: Text(
              prefix,
              style: TextStyle(
                color: Theme.of(context).colorScheme.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        if (remainingText.isNotEmpty) Text(' $remainingText'),
      ],
    );
  }
}

class CreateShoutSheet extends StatefulWidget {
  const CreateShoutSheet({super.key});

  @override
  State<CreateShoutSheet> createState() => _CreateShoutSheetState();
}

class _CreateShoutSheetState extends State<CreateShoutSheet> {
  static const _categories = [
    'Obecné',
    'Akce',
    'Sport',
    'Zábava',
    'Pomoc',
    'Upozornění',
    'Dotaz',
    'Doprava',
    'Jídlo a pití',
    'Kultura',
  ];
  final _title = TextEditingController();
  final _text = TextEditingController();
  final Set<String> _selected = {};
  int _hours = 2;
  int _minutes = 0;
  late final FixedExtentScrollController _hoursController;
  late final FixedExtentScrollController _minutesController;

  Duration get _duration => Duration(hours: _hours, minutes: _minutes);

  @override
  void initState() {
    super.initState();
    _hoursController = FixedExtentScrollController(initialItem: _hours);
    _minutesController = FixedExtentScrollController(initialItem: 0);
  }

  @override
  void dispose() {
    _title.dispose();
    _text.dispose();
    _hoursController.dispose();
    _minutesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      20,
      20,
      MediaQuery.viewInsetsOf(context).bottom + 20,
    ),
    child: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  tr(context, 'Nový shout'),
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              IconButton(
                tooltip: tr(context, 'Zavřít'),
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _title,
            maxLength: 60,
            decoration: InputDecoration(
              labelText: tr(context, 'Nadpis'),
              hintText: tr(context, 'Stručně, co se děje?'),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _text,
            maxLength: 220,
            maxLines: 4,
            decoration: InputDecoration(
              labelText: tr(context, 'Text'),
              hintText: tr(context, 'Doplň podrobnosti…'),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            tr(context, 'Kategorie (vyber nejvýše dvě)'),
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: _categories
                .map(
                  (category) => FilterChip(
                    label: Text(tr(context, category)),
                    selected: _selected.contains(category),
                    onSelected: (selected) => setState(() {
                      if (selected && _selected.length < 2) {
                        _selected.add(category);
                      }
                      if (!selected) {
                        _selected.remove(category);
                      }
                    }),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                tr(context, 'Platnost'),
                style: Theme.of(context).textTheme.labelLarge,
              ),
              Text(
                localizedDurationLabel(context, _duration),
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
            ],
          ),
          Container(
            height: 140,
            decoration: BoxDecoration(
              border: Border.all(
                color: Theme.of(context).colorScheme.outlineVariant,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(
                  child: _DurationWheel(
                    controller: _hoursController,
                    values: List.generate(25, (index) => index),
                    suffix: 'h',
                    onChanged: (hours) => _setDuration(hours, _minutes),
                  ),
                ),
                Expanded(
                  child: _DurationWheel(
                    controller: _minutesController,
                    values: const [0, 15, 30, 45],
                    suffix: 'min',
                    twoDigits: true,
                    onChanged: (minutes) => _setDuration(_hours, minutes),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _publish,
            icon: const Icon(Icons.send_outlined),
            label: Text(tr(context, 'Publikovat')),
          ),
        ],
      ),
    ),
  );

  void _publish() {
    if (_title.text.trim().isEmpty ||
        _text.text.trim().isEmpty ||
        _selected.isEmpty) {
      _showMessage(
        tr(context, 'Doplň nadpis, text a alespoň jednu kategorii.'),
      );
      return;
    }
    final now = DateTime.now();
    Navigator.pop(
      context,
      Shout(
        id: now.microsecondsSinceEpoch.toString(),
        author: 'Nový_soused',
        title: _title.text.trim(),
        text: _text.text.trim(),
        categories: _selected.toList(),
        distanceKm: 0,
        createdAt: now,
        expiresAt: now.add(_duration),
      ),
    );
  }

  void _setDuration(int hours, int minutes) {
    var validMinutes = minutes;
    if (hours == 24) validMinutes = 0;
    if (hours == 0 && validMinutes == 0) {
      validMinutes = 15;
      _showMessage(tr(context, 'Shout může mít platnost minimálně 15 minut.'));
    }
    setState(() {
      _hours = hours;
      _minutes = validMinutes;
    });
    final minuteIndex = [0, 15, 30, 45].indexOf(validMinutes);
    if (_minutesController.selectedItem != minuteIndex) {
      _minutesController.jumpToItem(minuteIndex);
    }
  }

  void _showMessage(String message) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(message),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: Text(tr(context, 'Rozumím')),
          ),
        ],
      ),
    );
  }
}

class _DurationWheel extends StatelessWidget {
  const _DurationWheel({
    required this.controller,
    required this.values,
    required this.suffix,
    required this.onChanged,
    this.twoDigits = false,
  });

  final FixedExtentScrollController controller;
  final List<int> values;
  final String suffix;
  final ValueChanged<int> onChanged;
  final bool twoDigits;

  @override
  Widget build(BuildContext context) => CupertinoTheme(
    data: CupertinoThemeData(
      brightness: Theme.of(context).brightness,
      textTheme: CupertinoTextThemeData(
        pickerTextStyle: Theme.of(context).textTheme.titleMedium!,
      ),
    ),
    child: ScrollConfiguration(
      behavior: const MaterialScrollBehavior().copyWith(
        dragDevices: {
          PointerDeviceKind.touch,
          PointerDeviceKind.mouse,
          PointerDeviceKind.stylus,
          PointerDeviceKind.trackpad,
        },
      ),
      child: CupertinoPicker(
        scrollController: controller,
        itemExtent: 36,
        useMagnifier: true,
        magnification: 1.08,
        selectionOverlay: Container(
          margin: const EdgeInsets.symmetric(horizontal: 6),
          decoration: BoxDecoration(
            color: Theme.of(
              context,
            ).colorScheme.primaryContainer.withValues(alpha: .7),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Theme.of(context).colorScheme.primary),
          ),
        ),
        onSelectedItemChanged: (index) => onChanged(values[index]),
        children: values.map((value) {
          final label = twoDigits ? value.toString().padLeft(2, '0') : '$value';
          return Center(child: Text('$label $suffix'));
        }).toList(),
      ),
    ),
  );
}

class ReactionButton extends StatelessWidget {
  const ReactionButton({
    super.key,
    required this.icon,
    required this.value,
    required this.onPressed,
    this.selected = false,
  });
  final IconData icon;
  final int value;
  final VoidCallback onPressed;
  final bool selected;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onPressed,
    borderRadius: BorderRadius.circular(18),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(
            icon,
            size: 19,
            color: selected ? Theme.of(context).colorScheme.primary : null,
          ),
          const SizedBox(width: 5),
          Text('$value'),
        ],
      ),
    ),
  );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title});
  final IconData icon;
  final String title;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 44),
          const SizedBox(height: 12),
          Text(title, textAlign: TextAlign.center),
        ],
      ),
    ),
  );
}

enum FeedOrder { nearest, popular, endingSoon }

extension on FeedOrder {
  String get label => switch (this) {
    FeedOrder.nearest => 'Nejbližší',
    FeedOrder.popular => 'Oblíbené',
    FeedOrder.endingSoon => 'Brzy končí',
  };
}

enum ShoutStatus { active, expired, deleted }

const _expiredShoutRetention = Duration(days: 7);

class Shout {
  Shout({
    required this.id,
    this.authorId = '',
    required this.author,
    required this.title,
    required this.text,
    required this.categories,
    required this.distanceKm,
    required this.createdAt,
    required this.expiresAt,
    this.likes = 0,
    this.dislikes = 0,
    this.comments = 0,
    this.saves = 0,
    this.status = ShoutStatus.active,
  });

  factory Shout.fromDocument(
    DocumentSnapshot<Map<String, dynamic>> document, {
    double distanceKm = 0,
  }) {
    final data = document.data()!;
    return Shout(
      id: document.id,
      authorId: data['authorId'] as String,
      author: data['authorNickname'] as String,
      title: data['title'] as String,
      text: data['text'] as String,
      categories: List<String>.from(data['categories'] as List),
      distanceKm: distanceKm,
      createdAt: (data['createdAt'] as Timestamp).toDate(),
      expiresAt: (data['expiresAt'] as Timestamp).toDate(),
      likes: data['likesCount'] as int? ?? 0,
      dislikes: data['dislikesCount'] as int? ?? 0,
      comments: data['commentsCount'] as int? ?? 0,
      saves: data['savesCount'] as int? ?? 0,
      status: switch (data['status']) {
        'deleted' => ShoutStatus.deleted,
        'expired' => ShoutStatus.expired,
        _ => ShoutStatus.active,
      },
    );
  }
  final String id;
  final String authorId;
  final String author;
  final String title;
  final String text;
  final List<String> categories;
  final double distanceKm;
  final DateTime createdAt;
  final DateTime expiresAt;
  int likes;
  int dislikes;
  int comments;
  int saves;
  bool isSaved = false;
  bool isLiked = false;
  bool isDisliked = false;
  ShoutStatus status;
  ShoutStatus get effectiveStatus {
    if (status == ShoutStatus.deleted) return ShoutStatus.deleted;
    return expiresAt.isAfter(DateTime.now())
        ? ShoutStatus.active
        : ShoutStatus.expired;
  }

  bool get isActive => effectiveStatus == ShoutStatus.active;

  bool get isExpiredBeyondRetention =>
      effectiveStatus == ShoutStatus.expired &&
      DateTime.now().isAfter(expiresAt.add(_expiredShoutRetention));

  bool get isRetainedExpired =>
      effectiveStatus == ShoutStatus.expired && !isExpiredBeyondRetention;

  int get reactionCount => likes + dislikes;
  double get dislikeRatio => reactionCount == 0 ? 0 : dislikes / reactionCount;
  bool get isLowRated => reactionCount >= 10 && dislikeRatio >= .7;
  bool get isHiddenByRating => reactionCount >= 50 && dislikeRatio >= .8;
  String get distanceLabel => distanceKm < 1
      ? '${(distanceKm * 1000).round()} m'
      : '${distanceKm.toStringAsFixed(1).replaceAll('.0', '')} km';
  String get ageLabel {
    final minutes = DateTime.now().difference(createdAt).inMinutes;
    return minutes < 1 ? 'teď' : 'před $minutes min';
  }

  String expiryLabel(BuildContext context) {
    final difference = expiresAt.difference(DateTime.now());
    if (!difference.isNegative) {
      return switch (Localizations.localeOf(context).languageCode) {
        'en' => 'ending in ${localizedDurationLabel(context, difference)}',
        'de' => 'endet in ${localizedDurationLabel(context, difference)}',
        'pl' => 'wygasa za ${localizedDurationLabel(context, difference)}',
        _ => 'končí za ${localizedDurationLabel(context, difference)}',
      };
    }
    final past = localizedDurationLabel(context, difference.abs());
    return switch (Localizations.localeOf(context).languageCode) {
      'en' => 'expired $past ago',
      'de' => 'vor $past abgelaufen',
      'pl' => 'wygasł $past temu',
      _ => 'expiroval před $past',
    };
  }
}

String localizedDurationLabel(BuildContext context, Duration duration) {
  final language = Localizations.localeOf(context).languageCode;
  final (days, hours, minutes) = switch (language) {
    'en' => ('days', 'h', 'min'),
    'de' => ('Tagen', 'Std.', 'Min.'),
    'pl' => ('dni', 'godz.', 'min'),
    _ => ('dny', 'h', 'min'),
  };
  if (duration.inDays >= 1) {
    final remainingHours = duration.inHours.remainder(24);
    return remainingHours == 0
        ? '${duration.inDays} $days'
        : '${duration.inDays} $days $remainingHours $hours';
  }
  if (duration.inHours >= 1 && duration.inMinutes.remainder(60) > 0) {
    return '${duration.inHours} $hours ${duration.inMinutes.remainder(60)} $minutes';
  }
  if (duration.inHours >= 1) return '${duration.inHours} $hours';
  return '${duration.inMinutes} $minutes';
}
