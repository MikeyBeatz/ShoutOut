import 'package:flutter/foundation.dart';

// Temporary release switch. Keep progress data so development can resume later.
const bool interactiveTutorialEnabled = false;

final ValueNotifier<int?> interactiveTutorialStep = ValueNotifier<int?>(null);

void completeInteractiveTutorialAction(int expectedStep) {
  if (interactiveTutorialStep.value == expectedStep) {
    interactiveTutorialStep.value = expectedStep + 1;
  }
}
