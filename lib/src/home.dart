part of '../main.dart';

class ShoutOutHome extends StatefulWidget {
  const ShoutOutHome({super.key});

  @override
  State<ShoutOutHome> createState() => _ShoutOutHomeState();
}

enum _LocationRefreshResult {
  available,
  servicesDisabled,
  permissionDenied,
  permissionDeniedForever,
  timedOut,
  unavailable,
}

class _ShoutOutHomeState extends State<ShoutOutHome> {
  final List<Shout> _shouts = [];
  late final _saveGateway = SaveGateway(
    currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
    send: (request) async {
      await FirebaseFunctions.instanceFor(
        region: 'europe-west3',
      ).httpsCallable('toggleShoutSave').call(request.toPayload());
    },
  );
  late final _reactionGateway = ReactionGateway(
    currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
    send: (request) async {
      await FirebaseFunctions.instanceFor(
        region: 'europe-west3',
      ).httpsCallable('toggleShoutReaction').call(request.toPayload());
    },
    isDefinitiveFailure: isDefinitiveReactionFailure,
  );
  final FeedFilters _feedFilters = FeedFilters();
  Set<String> _blockedUserIds = {};
  Set<String> _followedUserIds = {};
  Position? _currentPosition;
  bool _isLoadingShouts = true;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _shoutSubscription;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _blockedSubscription;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>?
  _followingSubscription;

  List<QueryDocumentSnapshot<Map<String, dynamic>>>? _feedDocuments;
  KeyedLiveState<Shout, _ShoutInteraction>? _interactions;

  int _tab = 0;
  Map<String, dynamic>? _pendingServerShout;
  late final Timer _expiryTimer;

  @override
  void initState() {
    super.initState();
    RegistrationTiming.finish('first-app-screen');
    if (Firebase.apps.isNotEmpty) {
      _interactions = _shoutInteractions(
        onChanged: () {
          if (mounted) setState(() {});
        },
        onError: (error, stack) {
          // Transient disconnects are retried by the Firestore SDK.
          debugPrint('Feed interaction subscription failed: $error');
        },
      );
      _initializeFeed();
    }
    _expiryTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  Future<void> _initializeFeed() async {
    _startFeedListeners();
    // Location improves distance sorting but must never hold up the feed.
    unawaited(
      _refreshLocation().then((_) {
        if (mounted && _feedDocuments != null) {
          _applyShoutDocuments(_feedDocuments!);
        }
      }),
    );
  }

  void _startFeedListeners() {
    final firestore = FirebaseFirestore.instance;
    final uid = FirebaseAuth.instance.currentUser!.uid;
    _shoutSubscription = firestore
        .collection('shouts')
        .where('status', isEqualTo: 'active')
        .orderBy('createdAt', descending: true)
        .limit(_feedPageSize)
        .liveSnapshots()
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
        .limit(_blockedUsersPageSize)
        .liveSnapshots()
        .listen((snapshot) {
          if (mounted) {
            setState(() {
              _blockedUserIds = snapshot.docs.map((doc) => doc.id).toSet();
            });
          }
        });
    _followingSubscription = firestore
        .collection('users')
        .doc(uid)
        .collection('following')
        .limit(_followedProfilesPageSize)
        .liveSnapshots()
        .listen((snapshot) {
          if (mounted) {
            setState(() {
              _followedUserIds = snapshot.docs.map((doc) => doc.id).toSet();
            });
          }
        });
  }

  Future<_LocationRefreshResult> _refreshLocation({
    Duration timeout = const Duration(seconds: 8),
    LocationAccuracy accuracy = LocationAccuracy.medium,
  }) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        return _LocationRefreshResult.servicesDisabled;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.deniedForever) {
        return _LocationRefreshResult.permissionDeniedForever;
      }
      if (permission == LocationPermission.denied) {
        return _LocationRefreshResult.permissionDenied;
      }
      _currentPosition = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(accuracy: accuracy),
      ).timeout(timeout);
      return _LocationRefreshResult.available;
    } on TimeoutException {
      return _LocationRefreshResult.timedOut;
    } catch (_) {
      // The feed can still be used without location permission.
      return _LocationRefreshResult.unavailable;
    }
  }

  @override
  void dispose() {
    _expiryTimer.cancel();
    _shoutSubscription?.cancel();
    _blockedSubscription?.cancel();
    _followingSubscription?.cancel();
    unawaited(_interactions?.dispose());
    super.dispose();
  }

  void _applyShoutDocuments(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> documents,
  ) {
    if (!mounted) return;
    _feedDocuments = documents;
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
    _interactions?.update(shouts);
    if (mounted) {
      setState(() {
        _shouts
          ..clear()
          ..addAll(shouts);
        _isLoadingShouts = false;
      });
    }
  }

  Future<void> _addShout(Shout shout) async {
    final user = FirebaseAuth.instance.currentUser!;
    final firestore = FirebaseFirestore.instance;
    final roleSnapshot = await firestore
        .collection('accountRoles')
        .doc(user.uid)
        .get();
    final role = AccountRole.fromData(roleSnapshot.data());
    final isBusiness = role == AccountRole.business;
    final useServer = kIsWeb && WebEnvironment.current.serverShoutCreation;
    if (useServer && _pendingServerShout?['idempotencyKey'] == shout.id) {
      await _publishServerShout(_pendingServerShout!);
      return;
    }
    Position? position;
    if (!isBusiness) {
      // Personal Shouts always use a fresh device position.
      final locationResult = await _refreshLocation(
        timeout: const Duration(seconds: 15),
        accuracy: LocationAccuracy.high,
      );
      position = _currentPosition;
      if (locationResult != _LocationRefreshResult.available ||
          position == null) {
        throw StateError('location-${locationResult.name}');
      }
    } else if (shout.businessLocationId == null) {
      throw StateError('business-location-required');
    }
    if (useServer) {
      final payload = <String, dynamic>{
        'idempotencyKey': shout.id,
        'title': shout.title,
        'text': shout.text,
        'categories': shout.categories,
        'durationMinutes': shout.expiresAt
            .difference(shout.createdAt)
            .inMinutes,
        if (isBusiness) ...{
          'businessLocationId': shout.businessLocationId,
          'businessHighlighted': shout.businessHighlighted,
          'businessSpotlight': shout.businessSpotlight,
          'businessExtendedDuration': shout.businessExtendedDuration,
        } else
          'location': {
            'latitude': position!.latitude,
            'longitude': position.longitude,
          },
      };
      _pendingServerShout = payload;
      await _publishServerShout(payload);
      return;
    }
    final shoutReference = firestore.collection('shouts').doc(shout.id);
    final profileReference = firestore.collection('users').doc(user.uid);
    final rateReference = _rateLimitReference('shout');
    final duration = shout.expiresAt.difference(shout.createdAt);
    await firestore.runTransaction((transaction) async {
      final profile = await transaction.get(profileReference);
      final rateSnapshot = await transaction.get(rateReference);
      final rateData = rateSnapshot.data();
      final lastShoutAt = rateData?['lastAt'] as Timestamp?;
      final windowStartedAt = rateData?['windowStartedAt'] as Timestamp?;
      final rateCount = rateData?['count'] as int? ?? 0;
      final now = DateTime.now().toUtc();
      final shoutCooldown = isBusiness
          ? _businessShoutCooldown
          : _shoutCooldown;
      final shoutDailyMaximum = isBusiness
          ? _businessShoutDailyMaximum
          : _shoutDailyMaximum;
      if (lastShoutAt != null &&
          now.isBefore(lastShoutAt.toDate().toUtc().add(shoutCooldown))) {
        throw StateError('rate-shout-cooldown');
      }
      if (windowStartedAt != null &&
          now.isBefore(
            windowStartedAt.toDate().toUtc().add(_shoutRateWindow),
          ) &&
          rateCount >= shoutDailyMaximum) {
        throw StateError('rate-shout-daily-limit');
      }
      var nickname = profile.data()!['nickname'] as String;
      GeoPoint publicationLocation;
      String publicationGeohash;
      final data = <String, dynamic>{};
      if (isBusiness) {
        final businessReference = firestore
            .collection('businessProfiles')
            .doc(user.uid);
        final locationReference = businessReference
            .collection('locations')
            .doc(shout.businessLocationId);
        final business = await transaction.get(businessReference);
        final location = await transaction.get(locationReference);
        final businessData = business.data();
        final locationData = location.data();
        if (businessData == null ||
            locationData == null ||
            locationData['active'] != true ||
            locationData['deleted'] == true ||
            locationData['geocodingStatus'] != 'verified' ||
            locationData['location'] is! GeoPoint ||
            locationData['geohash'] is! String) {
          throw StateError('business-location-unavailable');
        }
        nickname = locationData['displayName'] as String;
        publicationLocation = locationData['location'] as GeoPoint;
        publicationGeohash = locationData['geohash'] as String;
        data['businessLocationId'] = shout.businessLocationId;
        data['businessAuthorFormat'] = 'branch';
        if (shout.businessHighlighted) data['businessHighlighted'] = true;
        if (shout.businessSpotlight) data['businessSpotlight'] = true;
        if (shout.businessExtendedDuration) {
          data['businessExtendedDuration'] = true;
        }
      } else {
        publicationLocation = GeoPoint(
          publicLocationCoordinate(position!.latitude),
          publicLocationCoordinate(position.longitude),
        );
        publicationGeohash = encodeGeohash(
          publicationLocation.latitude,
          publicationLocation.longitude,
        );
      }
      transaction
        ..set(shoutReference, {
          ...data,
          'authorId': user.uid,
          'authorNickname': nickname,
          'avatarId': profile.data()!['avatarId'],
          'avatarBackgroundStart': profile.data()!['avatarBackgroundStart'],
          'avatarBackgroundEnd': profile.data()!['avatarBackgroundEnd'],
          'avatarGradientDirection': profile.data()!['avatarGradientDirection'],
          'title': shout.title,
          'text': shout.text,
          'categories': shout.categories,
          'location': publicationLocation,
          'geohash': publicationGeohash,
          'createdAt': FieldValue.serverTimestamp(),
          'expiresAt': Timestamp.fromDate(DateTime.now().add(duration)),
          'status': 'active',
          'likesCount': 0,
          'dislikesCount': 0,
          'commentsCount': 0,
          'savesCount': 0,
        })
        ..set(
          rateReference,
          _nextRateLimitData(
            snapshot: rateSnapshot,
            eventId: shout.id,
            window: _shoutRateWindow,
          ),
        );
    });
  }

  Future<void> _deleteShout(Shout shout) async {
    await FirebaseFirestore.instance.collection('shouts').doc(shout.id).update({
      'status': 'deleted',
    });
    // The active feed listener removes this document without another query.
  }

  Future<void> _publishServerShout(Map<String, dynamic> payload) async {
    try {
      await FirebaseFunctions.instanceFor(
        region: 'europe-west3',
      ).httpsCallable('createShout').call<Map<String, dynamic>>(payload);
      _pendingServerShout = null;
    } on FirebaseFunctionsException catch (error) {
      if (error.code == 'resource-exhausted' &&
          [
            'rate-shout-cooldown',
            'rate-shout-daily-limit',
          ].contains(error.message)) {
        throw StateError(error.message!);
      }
      if (error.code == 'failed-precondition' &&
          error.message == 'business-location-unavailable') {
        throw StateError('business-location-unavailable');
      }
      rethrow;
    }
  }

  Future<void> _toggleSaved(Shout shout) async {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    if (kIsWeb && WebEnvironment.current.serverShoutSaves) {
      try {
        await _saveGateway.toggle(userId: uid, shoutId: shout.id);
      } on SaveAccountChanged {
        return;
      } on FirebaseException {
        if (mounted) _showWriteFailure();
      }
      return;
    }
    final firestore = FirebaseFirestore.instance;
    final shoutRef = firestore.collection('shouts').doc(shout.id);
    final actualSaveRef = shoutRef.collection('saves').doc(uid);
    final rateRef = _rateLimitReference('interaction');
    final eventId = _saveEventId(shout.id);
    late ({bool saved, int count}) result;
    try {
      result = await firestore.runTransaction((transaction) async {
        final rateSnapshot = await transaction.get(rateRef);
        final shoutSnapshot = await transaction.get(shoutRef);
        final saveSnapshot = await transaction.get(actualSaveRef);
        final currentSaves = shoutSnapshot.data()?['savesCount'] as int? ?? 0;
        if (saveSnapshot.exists) {
          transaction
            ..delete(actualSaveRef)
            ..update(shoutRef, {
              'savesCount': currentSaves > 0 ? currentSaves - 1 : 0,
            });
        } else {
          transaction
            ..set(actualSaveRef, {'createdAt': FieldValue.serverTimestamp()})
            ..update(shoutRef, {'savesCount': currentSaves + 1});
        }
        transaction.set(
          rateRef,
          _nextRateLimitData(
            snapshot: rateSnapshot,
            eventId: eventId,
            window: _interactionRateWindow,
          ),
        );
        return (
          saved: !saveSnapshot.exists,
          count: saveSnapshot.exists
              ? (currentSaves > 0 ? currentSaves - 1 : 0)
              : currentSaves + 1,
        );
      });
    } on FirebaseException {
      _showWriteFailure();
      return;
    }
    if (!mounted) return;
    setState(() {
      for (final target in {
        shout,
        ..._shouts.where((item) => item.id == shout.id),
      }) {
        target
          ..isSaved = result.saved
          ..saves = result.count;
      }
    });
  }

  Future<void> _toggleReaction(Shout shout, {required bool like}) async {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    if (kIsWeb && WebEnvironment.current.serverShoutReactions) {
      try {
        await _reactionGateway.toggle(
          userId: uid,
          shoutId: shout.id,
          like: like,
        );
      } on ReactionAccountChanged {
        return;
      } on FirebaseException {
        if (mounted) _showWriteFailure();
      }
      return;
    }
    final firestore = FirebaseFirestore.instance;
    final shoutRef = firestore.collection('shouts').doc(shout.id);
    final reactionRef = shoutRef.collection('reactions').doc(uid);
    final actorProfileRef = firestore.collection('publicProfiles').doc(uid);
    final notificationSettingsRef = firestore
        .collection('users')
        .doc(shout.authorId)
        .collection('settings')
        .doc('notifications');
    final nextType = like ? 'like' : 'dislike';
    final notificationRef = firestore
        .collection('users')
        .doc(shout.authorId)
        .collection('notifications')
        .doc('reaction_${nextType}_${shout.id}');
    final rateRef = _rateLimitReference('interaction');
    final eventId = _shoutReactionEventId(shout.id);
    late ({String? type, int likes, int dislikes}) result;
    try {
      result = await firestore.runTransaction((transaction) async {
        final rateSnapshot = await transaction.get(rateRef);
        final shoutSnapshot = await transaction.get(shoutRef);
        final reactionSnapshot = await transaction.get(reactionRef);
        final shouldNotify =
            shout.authorId != uid &&
            reactionSnapshot.data()?['type'] != nextType;
        final notificationSettingsSnapshot = !shouldNotify
            ? null
            : await transaction.get(notificationSettingsRef);
        final notificationsEnabled =
            shouldNotify &&
            (notificationSettingsSnapshot?.data()?['reactions'] as bool? ??
                true);
        final actorProfileSnapshot = !notificationsEnabled
            ? null
            : await transaction.get(actorProfileRef);
        final storedType = reactionSnapshot.data()?['type'] as String?;
        var likes = shoutSnapshot.data()?['likesCount'] as int? ?? 0;
        var dislikes = shoutSnapshot.data()?['dislikesCount'] as int? ?? 0;
        if (storedType == nextType) {
          if (storedType == 'like' && likes > 0) likes--;
          if (storedType == 'dislike' && dislikes > 0) dislikes--;
          transaction.delete(reactionRef);
        } else {
          if (storedType == 'like' && likes > 0) likes--;
          if (storedType == 'dislike' && dislikes > 0) dislikes--;
          if (nextType == 'like') likes++;
          if (nextType == 'dislike') dislikes++;
          transaction.set(reactionRef, {
            'type': nextType,
            'updatedAt': FieldValue.serverTimestamp(),
          });
          if (shout.authorId != uid &&
              actorProfileSnapshot?.exists == true &&
              (notificationSettingsSnapshot?.data()?['reactions'] as bool? ??
                  true)) {
            transaction.set(notificationRef, {
              'kind': 'reaction',
              'actorId': uid,
              'actorNickname': actorProfileSnapshot!.data()!['nickname'],
              'targetShoutId': shout.id,
              'targetTitle': shoutSnapshot.data()!['title'],
              'reactionType': nextType,
              'eventCount': FieldValue.increment(1),
              'createdAt': FieldValue.serverTimestamp(),
              'readAt': null,
            }, SetOptions(merge: true));
          }
        }
        transaction
          ..update(shoutRef, {'likesCount': likes, 'dislikesCount': dislikes})
          ..set(
            rateRef,
            _nextRateLimitData(
              snapshot: rateSnapshot,
              eventId: eventId,
              window: _interactionRateWindow,
            ),
          );
        return (
          type: storedType == nextType ? null : nextType,
          likes: likes,
          dislikes: dislikes,
        );
      });
    } on FirebaseException {
      _showWriteFailure();
      return;
    }
    if (!mounted) return;
    setState(() {
      for (final target in {
        shout,
        ..._shouts.where((item) => item.id == shout.id),
      }) {
        target
          ..isLiked = result.type == 'like'
          ..isDisliked = result.type == 'dislike'
          ..likes = result.likes
          ..dislikes = result.dislikes;
      }
    });
  }

  void _showWriteFailure() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          tr(context, 'Akci se nepodařilo dokončit. Zkus to znovu.'),
        ),
      ),
    );
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
      body: _BrandedTabBackground(
        child: switch (_tab) {
          0 => FeedPage(
            shouts: activeShouts,
            isLoading: _isLoadingShouts,
            onSave: _toggleSaved,
            onReaction: _toggleReaction,
            onNotifications: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => NotificationsPage(
                  onSave: _toggleSaved,
                  onReaction: _toggleReaction,
                ),
              ),
            ),
            filters: _feedFilters,
            followedUserIds: _followedUserIds,
          ),
          1 => FollowedPage(
            shouts: activeShouts.where((shout) => shout.isSaved).toList(),
            onSave: _toggleSaved,
            onReaction: _toggleReaction,
            followedUserIds: _followedUserIds,
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
      ),
      floatingActionButton: _tab == 0
          ? FloatingActionButton.extended(
              onPressed: () async {
                completeInteractiveTutorialAction(3);
                final shout = await showDialog<Shout>(
                  context: context,
                  builder: (_) => Dialog(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 520),
                      child: CreateShoutSheet(onPublish: _addShout),
                    ),
                  ),
                );
                if (shout != null) {
                  try {
                    await _addShout(shout);
                  } on StateError catch (error) {
                    await _recordClientError(
                      action: 'publish_shout',
                      error: error,
                    );
                    if (context.mounted &&
                        error.message.toString().startsWith('location-')) {
                      final message = switch (error.message) {
                        'location-servicesDisabled' =>
                          'Zapni polohové služby a zkus Shout publikovat znovu.',
                        'location-permissionDeniedForever' =>
                          'Povol aplikaci přístup k poloze v nastavení zařízení.',
                        'location-permissionDenied' =>
                          'Pro publikování Shoutu povol přístup k poloze.',
                        'location-timedOut' =>
                          'Polohu se nepodařilo zjistit včas. Přejdi na otevřené místo a zkus to znovu.',
                        _ =>
                          'Polohu se nepodařilo zjistit. Zkontroluj připojení a polohové služby.',
                      };
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(tr(context, message)),
                          action:
                              error.message ==
                                  'location-permissionDeniedForever'
                              ? SnackBarAction(
                                  label: tr(context, 'Otevřít nastavení'),
                                  onPressed: Geolocator.openAppSettings,
                                )
                              : null,
                        ),
                      );
                    } else if (context.mounted &&
                        error.message == 'business-location-unavailable') {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            tr(
                              context,
                              'Vybraná pobočka není dostupná. Zkontrolujte její adresu a aktivní stav.',
                            ),
                          ),
                        ),
                      );
                    } else if (context.mounted &&
                        error.message == 'rate-shout-cooldown') {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            tr(
                              context,
                              'Mezi dvěma Shouty je potřeba počkat alespoň 2 minuty.',
                            ),
                          ),
                        ),
                      );
                    } else if (context.mounted &&
                        error.message == 'rate-shout-daily-limit') {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            tr(
                              context,
                              'Byl dosažen denní limit 50 Shoutů pro tento účet.',
                            ),
                          ),
                        ),
                      );
                    }
                  } on FirebaseException catch (error) {
                    await _recordClientError(
                      action: 'publish_shout',
                      error: error,
                    );
                    if (context.mounted) {
                      final message = switch (error.code) {
                        'permission-denied' =>
                          'Shout se nepodařilo publikovat kvůli oprávnění účtu. Zkontroluj ověření e-mailu a stav účtu.',
                        'unavailable' || 'deadline-exceeded' =>
                          'Služba je dočasně nedostupná. Zkontroluj připojení a zkus to znovu.',
                        _ => 'Akci se nepodařilo dokončit. Zkus to znovu.',
                      };
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(tr(context, message))),
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
            color: Theme.of(context).colorScheme.surface,
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
                  onDestinationSelected: (index) {
                    setState(() => _tab = index);
                    if (index == 3) completeInteractiveTutorialAction(4);
                  },
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
                      label: tr(context, 'Sledované'),
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

class _BrandedTabBackground extends StatelessWidget {
  const _BrandedTabBackground({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      ColoredBox(color: Theme.of(context).scaffoldBackgroundColor),
      IgnorePointer(
        child: ExcludeSemantics(
          child: Align(
            alignment: const Alignment(2.2, .35),
            child: FractionallySizedBox(
              widthFactor: .75,
              child: Opacity(
                opacity: .03,
                child: ColorFiltered(
                  colorFilter: const ColorFilter.mode(
                    _shoutPrimary,
                    BlendMode.srcIn,
                  ),
                  child: Image.asset(
                    'assets/branding/feed_mark.png',
                    fit: BoxFit.contain,
                    filterQuality: FilterQuality.high,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      child,
    ],
  );
}
