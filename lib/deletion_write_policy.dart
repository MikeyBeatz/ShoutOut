import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import 'web_environment.dart';

/// DEV deletion writes have moved to the server on every client platform.
/// Feature flags remain applicable outside DEV until its own release cutover.
class DeletionWritePolicy {
  DeletionWritePolicy.forClient({
    required String projectId,
    WebEnvironment? web,
  }) : preparation =
           projectId == 'shoutout-dev-46c81' ||
           web?.serverAccountDeletionPreparation == true,
       finalization =
           projectId == 'shoutout-dev-46c81' ||
           web?.serverAccountDeletionFinalization == true,
       shoutDeletion =
           projectId == 'shoutout-dev-46c81' ||
           web?.serverShoutDeletion == true;

  static DeletionWritePolicy get current => DeletionWritePolicy.forClient(
    projectId: Firebase.app().options.projectId,
    web: kIsWeb ? WebEnvironment.current : null,
  );

  final bool preparation;
  final bool finalization;
  final bool shoutDeletion;
}
