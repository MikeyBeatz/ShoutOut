import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'archive_identity_policy.dart';

/// Mounted only after the existing profile, legal and deletion gates. A failed
/// background observation never traps the user or disables logout. Publication
/// repeats the trusted observation server-side before any new archive body.
class ArchiveIdentityObservation extends StatefulWidget {
  const ArchiveIdentityObservation({super.key, required this.child});
  final Widget child;
  @override
  State<ArchiveIdentityObservation> createState() =>
      _ArchiveIdentityObservationState();
}

class _ArchiveIdentityObservationState extends State<ArchiveIdentityObservation>
    with WidgetsBindingObserver {
  StreamSubscription<User?>? _subscription;
  bool _busy = false;
  @override
  void initState() {
    super.initState();
    if (!ArchiveIdentityPolicy.enabled) return;
    WidgetsBinding.instance.addObserver(this);
    _subscription = FirebaseAuth.instance.userChanges().listen(
      (_) => unawaited(_observe()),
    );
  }

  Future<void> _observe() async {
    final user = FirebaseAuth.instance.currentUser;
    if (_busy || user == null || !user.emailVerified) return;
    _busy = true;
    try {
      await FirebaseFunctions.instanceFor(region: 'europe-west3')
          .httpsCallable('observeArchiveIdentity')
          .call<Object?>({'expectedUserId': user.uid});
    } catch (_) {
      // No contact, token, response body or archive information in diagnostics.
    } finally {
      _busy = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && ArchiveIdentityPolicy.enabled) {
      unawaited(_observe());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_subscription?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
