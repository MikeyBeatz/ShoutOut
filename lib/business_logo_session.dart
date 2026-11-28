import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'business_logo_gateway.dart';
import 'business_logo_platform.dart';

BusinessLogoGateway? businessLogoSession;
Future<void> resumeBusinessLogo(String? uid) async {
  if (uid == null || businessLogoSession == null) return;
  try {
    await businessLogoSession!.retry(uid);
  } catch (_) {
    debugPrint('Business logo recovery deferred.');
  }
}

Future<void> erasePendingBusinessLogo(String uid) async {
  try {
    if (businessLogoSession case final session?) {
      await session.eraseUser(uid);
    } else {
      // A compatible rollback must also erase previously stored pending bytes.
      await createBusinessLogoPendingStore(
        Firebase.app().options.projectId,
      ).erase(uid);
    }
  } catch (_) {
    // The server's confirmed deletion fence still forbids publication. A local
    // storage failure must not turn successful account deletion into a UI error.
    debugPrint('Business logo local erasure deferred.');
  }
}
