import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'web_environment.dart';

class ArchiveIdentityPolicy {
  static bool get enabled {
    const native = bool.fromEnvironment('SHOUTOUT_ARCHIVE_IDENTITY');
    if (!kIsWeb && !native) return false;
    final web = kIsWeb ? WebEnvironment.current : null;
    final active = web?.serverArchiveIdentity ?? native;
    if (active &&
        (web?.firebaseOptions.projectId ?? Firebase.app().options.projectId) !=
            'shoutout-dev-46c81') {
      throw StateError('Archive identity requires a checked DEV release.');
    }
    return active;
  }
}
