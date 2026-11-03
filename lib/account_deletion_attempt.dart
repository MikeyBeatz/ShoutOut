import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

enum AccountDeletionOutcome { completed, pending, confirmedByServer }

class AccountDeletionIntent {
  const AccountDeletionIntent({required this.userId, required this.confirmed});
  final String userId;
  final bool confirmed;
}

abstract interface class AccountDeletionTransport {
  String? get currentUserId;
  Future<void> reauthenticate(String password);
  Future<AccountDeletionIntent> ensureIntent();
  Future<void> deleteAuthentication();
}

class AccountDeletionIdentityChanged implements Exception {}

/// A positive callable reply is not enough to delete Auth: require the actual
/// committed request read from the server. Transport failures never auto-retry.
Future<AccountDeletionIntent> ensureServerAccountDeletionIntent({
  required String userId,
  required Future<AccountDeletionIntent?> Function() readExisting,
  required Future<void> Function() prepare,
  required Future<Object?> Function() finalize,
  required void Function() guardIdentity,
}) async {
  guardIdentity();
  final existing = await readExisting();
  guardIdentity();
  if (existing != null) return existing;
  while (true) {
    await prepare();
    guardIdentity();
    final response = await finalize();
    guardIdentity();
    if (response is! Map ||
        response['userId'] != userId ||
        response['ready'] is! bool ||
        response['confirmed'] is! bool ||
        response['ready'] == false && response['confirmed'] == true) {
      throw StateError('invalid-account-deletion-finalization');
    }
    if (response['ready'] == false) continue;
    final committed = await readExisting();
    guardIdentity();
    if (committed == null || committed.userId != userId) {
      throw StateError('unconfirmed-account-deletion-request');
    }
    return committed;
  }
}

/// Read before preparing, then create conditionally. Existing intents never
/// re-run preparation or acquire a new retention deadline.
Future<AccountDeletionIntent> ensurePreparedAccountDeletionIntent({
  required Future<AccountDeletionIntent?> Function() readExisting,
  required Future<void> Function() prepare,
  required Future<AccountDeletionIntent> Function() createIfMissing,
  required void Function() guardIdentity,
}) async {
  guardIdentity();
  final existing = await readExisting();
  guardIdentity();
  if (existing != null) return existing;
  await prepare();
  guardIdentity();
  final created = await createIfMissing();
  guardIdentity();
  return created;
}

/// A failed response never proves that a destructive operation did not commit.
/// This coordinator intentionally has no automatic request-delete operation.
/// The pending-request gate resumes this attempt after fresh authentication.
class AccountDeletionAttempt {
  AccountDeletionAttempt(this.userId, this.transport, {this.onFailure});
  final String userId;
  final AccountDeletionTransport transport;
  final void Function(String stage, Object error)? onFailure;
  Future<AccountDeletionOutcome>? _running;

  void _failed(String stage, Object error) {
    try {
      onFailure?.call(stage, error);
    } catch (_) {
      // Diagnostics must never alter the operation or its recovery path.
    }
  }

  void _guardIdentity() {
    if (transport.currentUserId != userId) {
      throw AccountDeletionIdentityChanged();
    }
  }

  Future<AccountDeletionOutcome> run(String password) {
    _guardIdentity();
    return _running ??= _run(password).whenComplete(() => _running = null);
  }

  Future<AccountDeletionOutcome> _run(String password) async {
    try {
      await transport.reauthenticate(password);
    } catch (error) {
      _failed('reauthenticate', error);
      rethrow;
    }
    _guardIdentity();
    AccountDeletionIntent intent;
    try {
      intent = await transport.ensureIntent();
    } catch (error) {
      _failed('ensure-request', error);
      _guardIdentity();
      // The request itself might have committed before acknowledgement was lost.
      return AccountDeletionOutcome.pending;
    }
    _guardIdentity();
    if (intent.userId != userId) throw AccountDeletionIdentityChanged();
    if (intent.confirmed) return AccountDeletionOutcome.confirmedByServer;
    try {
      await transport.deleteAuthentication();
      // Auth.delete normally clears currentUser. Do not reject its own success.
      if (transport.currentUserId != null &&
          transport.currentUserId != userId) {
        throw AccountDeletionIdentityChanged();
      }
      return AccountDeletionOutcome.completed;
    } on AccountDeletionIdentityChanged {
      rethrow;
    } catch (error) {
      _failed('delete-auth', error);
      if (transport.currentUserId != null) _guardIdentity();
      return AccountDeletionOutcome.pending;
    }
  }
}

/// Preparation is injected for new intents; existing requests are never
/// re-prepared, overwritten or assigned a fresh retention deadline.
class FirebaseAccountDeletionTransport implements AccountDeletionTransport {
  FirebaseAccountDeletionTransport({
    required this.auth,
    required this.firestore,
    required this.user,
    this.prepareBeforeIntent,
    this.finalizeIntent,
  });
  final FirebaseAuth auth;
  final FirebaseFirestore firestore;
  final User user;
  final Future<void> Function()? prepareBeforeIntent;
  final Future<Object?> Function()? finalizeIntent;

  @override
  String? get currentUserId => auth.currentUser?.uid;

  void _guardIdentity() {
    if (currentUserId != user.uid) throw AccountDeletionIdentityChanged();
  }

  @override
  Future<void> reauthenticate(String password) async {
    _guardIdentity();
    final email = user.email;
    if (email == null) throw StateError('account-email-required');
    await user.reauthenticateWithCredential(
      EmailAuthProvider.credential(email: email, password: password),
    );
    _guardIdentity();
  }

  @override
  Future<AccountDeletionIntent> ensureIntent() async {
    _guardIdentity();
    final reference = firestore
        .collection('accountDeletionRequests')
        .doc(user.uid);
    AccountDeletionIntent parse(Map<String, dynamic> data) {
      if (data['userId'] != user.uid || data['status'] != 'pending') {
        throw StateError('invalid-account-deletion-request');
      }
      final marker = data['authDeletionConfirmedAt'];
      if (data.containsKey('authDeletionConfirmedAt') && marker is! Timestamp) {
        throw StateError('invalid-account-deletion-confirmation');
      }
      return AccountDeletionIntent(
        userId: user.uid,
        confirmed: marker is Timestamp,
      );
    }

    Future<AccountDeletionIntent?> readExisting() async {
      // Source.server can reuse an already-current watch target before an
      // external (callable) write reaches that listener. A read-only transaction
      // performs a fresh server read instead. Never write or auto-retry here.
      final snapshot = await firestore.runTransaction(
        (transaction) => transaction.get(reference),
        maxAttempts: 1,
      );
      _guardIdentity();
      if (snapshot.metadata.isFromCache || snapshot.metadata.hasPendingWrites) {
        throw StateError('unconfirmed-account-deletion-request');
      }
      return snapshot.exists ? parse(snapshot.data()!) : null;
    }

    Future<void> prepare() async {
      final prepare = prepareBeforeIntent;
      if (prepare == null) {
        throw StateError('account-deletion-preparation-required');
      }
      await prepare();
    }

    final finalize = finalizeIntent;
    if (finalize != null) {
      return ensureServerAccountDeletionIntent(
        userId: user.uid,
        readExisting: readExisting,
        prepare: prepare,
        finalize: finalize,
        guardIdentity: _guardIdentity,
      );
    }
    return ensurePreparedAccountDeletionIntent(
      guardIdentity: _guardIdentity,
      readExisting: readExisting,
      prepare: prepare,
      createIfMissing: () => firestore.runTransaction((transaction) async {
        _guardIdentity();
        final existing = await transaction.get(reference);
        _guardIdentity();
        if (existing.exists) {
          return parse(existing.data()!);
        }
        transaction.set(reference, {
          'userId': user.uid,
          'email': user.email,
          'requestedAt': FieldValue.serverTimestamp(),
          'retainUntil': Timestamp.fromDate(
            DateTime.now().add(const Duration(days: 60)),
          ),
          'status': 'pending',
        });
        return AccountDeletionIntent(userId: user.uid, confirmed: false);
      }),
    );
  }

  @override
  Future<void> deleteAuthentication() async {
    _guardIdentity();
    await user.delete();
  }
}
