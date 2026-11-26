import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import 'web_environment.dart';

/// Shared read/history routing. The native release gate defaults to off and
/// cannot activate another project through a DEV compile flag.
class LifecycleClientPolicy {
  LifecycleClientPolicy.forClient({
    required String projectId,
    WebEnvironment? web,
    bool nativeEnabled = false,
  }) : enabled = web?.serverContentLifecycle ?? nativeEnabled {
    if (enabled && projectId != 'shoutout-dev-46c81') {
      throw StateError('Content lifecycle requires a checked DEV release.');
    }
  }

  static LifecycleClientPolicy get current {
    const native = bool.fromEnvironment('SHOUTOUT_CONTENT_LIFECYCLE');
    if (!kIsWeb && !native) {
      return LifecycleClientPolicy.forClient(projectId: '');
    }
    final web = kIsWeb ? WebEnvironment.current : null;
    return LifecycleClientPolicy.forClient(
      projectId:
          web?.firebaseOptions.projectId ?? Firebase.app().options.projectId,
      web: web,
      nativeEnabled: native,
    );
  }

  final bool enabled;
}
