import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:geolocator/geolocator.dart';

import 'auth_gate.dart';
import 'app_locale.dart';
import 'firebase_options.dart';
import 'l10n/app_localizations.dart';
import 'l10n/text.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const ShoutOutApp());
}

class ShoutOutApp extends StatelessWidget {
  const ShoutOutApp({super.key});

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFFFF5A5F);
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
          colorScheme: ColorScheme.fromSeed(seedColor: seed),
          useMaterial3: true,
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
    await _loadShouts();
    await _refreshLocation();
    await _loadShouts();
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
      );
    } catch (_) {
      // The feed can still be used without location permission.
    }
  }

  @override
  void dispose() {
    _expiryTimer.cancel();
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
    final shouts = snapshot.docs.map((doc) {
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
    await Future.wait(shouts.map(_loadInteractionState));
    if (mounted) {
      setState(() {
        _shouts
          ..clear()
          ..addAll(shouts);
        _blockedUserIds = blockedUserIds;
        _isLoadingShouts = false;
      });
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
        _roundCoordinate(position.latitude),
        _roundCoordinate(position.longitude),
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

  double _roundCoordinate(double coordinate) =>
      (coordinate * 1000).roundToDouble() / 1000;

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
      appBar: AppBar(
        title: const Text(
          'ShoutOut',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        actions: [
          IconButton(
            tooltip: tr(context, 'Oznámení'),
            onPressed: () {},
            icon: const Icon(Icons.notifications_none_rounded),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: switch (_tab) {
        0 => FeedPage(
          shouts: activeShouts,
          isLoading: _isLoadingShouts,
          onSave: _toggleSaved,
          onReaction: _toggleReaction,
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
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (index) => setState(() => _tab = index),
        destinations: [
          NavigationDestination(
            icon: Icon(Icons.near_me_outlined),
            selectedIcon: Icon(Icons.near_me),
            label: tr(context, 'Okolí'),
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
  });

  final List<Shout> shouts;
  final bool isLoading;
  final ValueChanged<Shout> onSave;
  final void Function(Shout shout, {required bool like}) onReaction;

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
  final Set<String> _selectedCategories = {};
  double _radius = 5;
  FeedOrder _order = FeedOrder.nearest;

  @override
  Widget build(BuildContext context) {
    final shouts =
        widget.shouts.where((shout) {
          return shout.distanceKm <= _radius &&
              (_selectedCategories.isEmpty ||
                  shout.categories.any(_selectedCategories.contains));
        }).toList()..sort(
          (a, b) => switch (_order) {
            FeedOrder.nearest => a.distanceKm.compareTo(b.distanceKm),
            FeedOrder.popular => b.likes.compareTo(a.likes),
            FeedOrder.endingSoon => a.expiresAt.compareTo(b.expiresAt),
          },
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
          child: Text(
            tr(context, 'Co se děje v okolí?'),
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<double>(
                  initialValue: _radius,
                  decoration: InputDecoration(
                    labelText: tr(context, 'Vzdálenost'),
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: const [1, 3, 5, 10, 20, 50]
                      .map(
                        (value) => DropdownMenuItem(
                          value: value.toDouble(),
                          child: Text('$value km'),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => setState(() => _radius = value!),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: DropdownButtonFormField<FeedOrder>(
                  initialValue: _order,
                  decoration: InputDecoration(
                    labelText: tr(context, 'Řazení'),
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: FeedOrder.values
                      .map(
                        (value) => DropdownMenuItem(
                          value: value,
                          child: Text(tr(context, value.label)),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => setState(() => _order = value!),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 40,
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            scrollDirection: Axis.horizontal,
            itemCount: _categories.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final category = _categories[index];
              return FilterChip(
                label: Text(tr(context, category)),
                selected: _selectedCategories.contains(category),
                onSelected: (selected) => setState(() {
                  selected
                      ? _selectedCategories.add(category)
                      : _selectedCategories.remove(category);
                }),
              );
            },
          ),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: widget.isLoading
              ? const Center(child: CircularProgressIndicator())
              : shouts.isEmpty
              ? EmptyState(
                  icon: Icons.location_off_outlined,
                  title: tr(
                    context,
                    'V tomto okolí zatím nejsou žádné shouty.',
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                  itemCount: shouts.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (context, index) => ShoutCard(
                    shout: shouts[index],
                    onSave: () => widget.onSave(shouts[index]),
                    onReaction: (like) =>
                        widget.onReaction(shouts[index], like: like),
                  ),
                ),
        ),
      ],
    );
  }
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
  Widget build(BuildContext context) => ShoutListPage(
    title: tr(context, 'Uložené shouty'),
    emptyText: tr(context, 'Zatím nemáš uložené žádné shouty.'),
    emptyIcon: Icons.bookmark_border,
    shouts: shouts,
    onSave: onSave,
    onReaction: onReaction,
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
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: SegmentedButton<_MyShoutsSection>(
            expandedInsets: EdgeInsets.zero,
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
            ),
            _ => ShoutListPage(
              title: tr(context, 'Mé shouty'),
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
  });

  final ValueChanged<Shout> onSave;
  final void Function(Shout shout, {required bool like}) onReaction;

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
    required this.title,
    required this.emptyText,
    required this.emptyIcon,
    required this.shouts,
    required this.onSave,
    required this.onReaction,
    this.showSaveCount = false,
    this.showDeleteButton = false,
    this.onDelete,
  });

  final String title;
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
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
        child: Text(
          title,
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
        final l10n = AppLocalizations.of(context)!;
        final profile = snapshot.data?.data();
        final nickname = profile?['nickname'] as String? ?? 'Načítání…';
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const CircleAvatar(
              radius: 34,
              child: Icon(Icons.person_outline, size: 34),
            ),
            const SizedBox(height: 12),
            Text(
              nickname,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              l10n.nicknameChangeHint,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
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
              onTap: () {},
            ),
          ],
        );
      },
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

  @override
  void dispose() {
    _commentController.dispose();
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
              final data = comment.data();
              final isOwnComment =
                  data['authorId'] == FirebaseAuth.instance.currentUser?.uid;
              return ListTile(
                leading: const CircleAvatar(child: Icon(Icons.person_outline)),
                title: Row(
                  children: [
                    Text(data['authorNickname'] as String),
                    if (data['authorId'] == widget.shout.authorId)
                      Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: Chip(
                          label: Text(tr(context, 'Autor')),
                          visualDensity: VisualDensity.compact,
                        ),
                      ),
                  ],
                ),
                subtitle: Text(data['text'] as String),
                trailing: isOwnComment
                    ? IconButton(
                        tooltip: tr(context, 'Smazat komentář'),
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => comment.reference.delete(),
                      )
                    : null,
              );
            }),
          ],
        );
      },
    ),
    bottomNavigationBar: SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _commentController,
                maxLength: 220,
                decoration: InputDecoration(
                  hintText: tr(context, 'Napiš veřejný komentář'),
                  border: OutlineInputBorder(),
                  counterText: '',
                ),
              ),
            ),
            IconButton(
              onPressed: () async {
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
                    });
                _commentController.clear();
              },
              icon: const Icon(Icons.send_outlined),
            ),
          ],
        ),
      ),
    ),
  );

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
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Nahlásit Shout'),
        content: TextField(
          controller: controller,
          maxLength: 500,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'Stručně popiš důvod hlášení',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Zrušit'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Odeslat'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (reason == null || reason.isEmpty) return;
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
          Text(
            tr(context, 'Nový shout'),
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
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
    FeedOrder.popular => 'Nejoblíbenější',
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
