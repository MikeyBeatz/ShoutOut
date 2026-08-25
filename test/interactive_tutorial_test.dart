import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/interactive_tutorial.dart';

void main() {
  tearDown(() => interactiveTutorialStep.value = null);

  test('tutorial advances only after the expected action', () {
    interactiveTutorialStep.value = 0;

    completeInteractiveTutorialAction(1);
    expect(interactiveTutorialStep.value, 0);

    completeInteractiveTutorialAction(0);
    expect(interactiveTutorialStep.value, 1);
  });
}
