import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import 'feed_body_cache.dart';
import 'feed_delta_client.dart';
import 'feed_delta_live.dart';
import 'feed_public_state_pool.dart';
import 'live_data.dart';
import 'live_shout_state.dart';
import 'web_environment.dart';

FeedDeltaRuntime? _runtime;
FeedDeltaRuntime? get feedDeltaRuntime =>
    kIsWeb && WebEnvironment.current.serverDeltaFeed
    ? _runtime ??= FeedDeltaRuntime(
        FirebaseFirestore.instance,
        FirebaseAuth.instance,
        FirebaseFunctions.instanceFor(region: 'europe-west3'),
      )
    : null;

class FeedDeltaRuntime {
  FeedDeltaRuntime(this.db, this.auth, this.functions) {
    final project = db.app.options.projectId;
    cache = FeedBodyCache(clock: () => DateTime.now().millisecondsSinceEpoch);
    publicStates = FeedPublicStatePool(
      (stamp, id) => confirmed(
        db.doc(
          'feedIndexGenerations/${stamp.substring(0, stamp.indexOf(':'))}/publicStates/$id',
        ),
      ).map((snapshot) => snapshot.data()),
    );
    live = FeedDeltaLive(
      project: project,
      currentUserId: () => auth.currentUser?.uid,
      resolveContext: () async => Map<String, dynamic>.from(
        await send({
              'format': 'delta-v1',
              'expectedUserId': auth.currentUser?.uid,
              'mode': 'liveContext',
            })
            as Map,
      ),
      publicState: (context, id) => publicStates.watch(live.stamp(context), id),
      reaction: (uid, id) => confirmed(
        db.doc('shouts/$id/reactions/$uid'),
      ).map((snapshot) => snapshot.data()),
      saved: (uid, id) => confirmed(
        db.doc('shouts/$id/saves/$uid'),
      ).map((snapshot) => snapshot.exists),
      synchronized: () =>
          liveStreams.watch(liveDataKey('delta-barrier'), db.snapshotsInSync),
      onState: (id, value, stamp) {
        final uid = auth.currentUser?.uid, version = value['bodyVersion'];
        if (uid != null &&
            version is String &&
            cache.scope == FeedBodyScope(project, uid)) {
          cache.updateState(FeedBodyScope(project, uid), id, version, {
            ...value,
            '_generation': stamp,
          });
        }
      },
    );
    client = FeedDeltaClient(
      project: project,
      currentUserId: () => auth.currentUser?.uid,
      send: send,
      cache: cache,
      onContext: live.adopt,
      onBaseline: live.baseline,
      currentState: live.latest,
    );
  }
  final FirebaseFirestore db;
  final FirebaseAuth auth;
  final FirebaseFunctions functions;
  late final FeedBodyCache cache;
  late final FeedDeltaClient client;
  late final FeedDeltaLive live;
  late final FeedPublicStatePool publicStates;
  String? _viewer;
  Future<Object?> send(Map<String, Object?> request) async =>
      (await functions.httpsCallable('getFeedPage').call<Object?>(request))
          .data;
  DocumentReference<Map<String, dynamic>> stateReference(
    Map<String, dynamic> context,
    String id,
  ) => db.doc('feedIndexGenerations/${context['generation']}/publicStates/$id');
  Stream<DocumentSnapshot<Map<String, dynamic>>> confirmed(
    DocumentReference<Map<String, dynamic>> reference,
  ) => reference
      .liveSnapshots(includeMetadataChanges: true)
      .where(
        (snapshot) =>
            !snapshot.metadata.isFromCache &&
            !snapshot.metadata.hasPendingWrites,
      );
  void retainViewer(String? uid) {
    if (_viewer == uid) return;
    _viewer = uid;
    client.retainViewer(uid);
    live.retainViewer(uid);
    publicStates.publish(null, {});
  }

  void eraseAccount(String uid) {
    client.eraseAccount(uid);
    live.eraseAccount(uid);
    publicStates.publish(null, {});
  }

  Future<LiveShoutState> reconcile(
    String uid,
    String id, {
    required bool save,
  }) async {
    final context = await live.context();
    if (auth.currentUser?.uid != uid) throw StateError('Stale reconciliation');
    final result = await db
        .runTransaction((tx) async {
          final parent = await tx.get(stateReference(context, id));
          final own = await tx.get(
            db.doc('shouts/$id/${save ? 'saves' : 'reactions'}/$uid'),
          );
          final value = parent.data();
          return LiveShoutState(
            likes: value?['likesCount'] as int? ?? 0,
            dislikes: value?['dislikesCount'] as int? ?? 0,
            comments: value?['commentsCount'] as int? ?? 0,
            saves: value?['savesCount'] as int? ?? 0,
            saved: save && own.exists,
            reaction: save ? null : own.data()?['type'] as String?,
            contentPurged: value == null || value['status'] == 'deleted',
            status: value?['status'] as String?,
          );
        }, maxAttempts: 1)
        .timeout(const Duration(seconds: 15));
    if (auth.currentUser?.uid != uid) throw StateError('Stale reconciliation');
    return result;
  }
}
