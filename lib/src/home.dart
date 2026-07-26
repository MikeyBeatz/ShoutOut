part of '../main.dart';

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
