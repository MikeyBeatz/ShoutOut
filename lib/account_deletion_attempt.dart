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

/// A failed response never proves that a destructive operation did not commit.
/// This coordinator intentionally has no automatic request-delete operation.
/// UI integration must provide a way to resume an existing pending request.
class AccountDeletionAttempt {
  AccountDeletionAttempt(this.userId, this.transport);
  final String userId;
  final AccountDeletionTransport transport;
  Future<AccountDeletionOutcome>? _running;

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
    await transport.reauthenticate(password);
    _guardIdentity();
    AccountDeletionIntent intent;
    try {
      intent = await transport.ensureIntent();
    } catch (_) {
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
    } catch (_) {
      if (transport.currentUserId != null) _guardIdentity();
      return AccountDeletionOutcome.pending;
    }
  }
}

/// Firebase adapter. No client-side Shout hiding and no retention renewal.
/// Not wired to the existing UI until its pending-request recovery is ready.
class FirebaseAccountDeletionTransport implements AccountDeletionTransport {
  FirebaseAccountDeletionTransport({
    required this.auth,
    required this.firestore,
    required this.user,
  });
  final FirebaseAuth auth;
  final FirebaseFirestore firestore;
  final User user;

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
    return firestore.runTransaction((transaction) async {
      _guardIdentity();
      final existing = await transaction.get(reference);
      _guardIdentity();
      if (existing.exists) {
        final data = existing.data()!;
        if (data['userId'] != user.uid || data['status'] != 'pending') {
          throw StateError('invalid-account-deletion-request');
        }
        final marker = data['authDeletionConfirmedAt'];
        if (data.containsKey('authDeletionConfirmedAt') &&
            marker is! Timestamp) {
          throw StateError('invalid-account-deletion-confirmation');
        }
        return AccountDeletionIntent(
          userId: user.uid,
          confirmed: marker is Timestamp,
        );
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
    });
  }

  @override
  Future<void> deleteAuthentication() async {
    _guardIdentity();
    await user.delete();
  }
}
