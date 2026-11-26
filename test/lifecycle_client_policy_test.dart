import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/lifecycle_client_policy.dart';
import 'package:shoutout/web_environment.dart';

void main() {
  test('native lifecycle defaults off without touching Firebase', () {
    expect(LifecycleClientPolicy.current.enabled, isFalse);
    expect(
      LifecycleClientPolicy.forClient(projectId: 'shoutout-dev-46c81').enabled,
      isFalse,
    );
    expect(
      LifecycleClientPolicy.forClient(
        projectId: 'shoutout-production-a1b34',
      ).enabled,
      isFalse,
    );
  });
  test('explicit native flag activates only the checked DEV project', () {
    expect(
      LifecycleClientPolicy.forClient(
        projectId: 'shoutout-dev-46c81',
        nativeEnabled: true,
      ).enabled,
      isTrue,
    );
    for (final project in ['shoutout-production-a1b34', 'other', '']) {
      expect(
        () => LifecycleClientPolicy.forClient(
          projectId: project,
          nativeEnabled: true,
        ),
        throwsStateError,
      );
    }
  });
  test(
    'web routing uses its own checked configuration rather than the native flag',
    () {
      final config =
          jsonDecode(File('config/dev.json').readAsStringSync())
              as Map<String, dynamic>;
      final off = WebEnvironment.fromJson(config);
      expect(
        LifecycleClientPolicy.forClient(
          projectId: off.firebaseOptions.projectId,
          web: off,
          nativeEnabled: true,
        ).enabled,
        isFalse,
      );
      final on = WebEnvironment.fromJson({
        ...config,
        'serverContentLifecycle': true,
      });
      expect(
        LifecycleClientPolicy.forClient(
          projectId: on.firebaseOptions.projectId,
          web: on,
        ).enabled,
        isTrue,
      );
      expect(
        () => LifecycleClientPolicy.forClient(projectId: 'other', web: on),
        throwsStateError,
      );
    },
  );
}
