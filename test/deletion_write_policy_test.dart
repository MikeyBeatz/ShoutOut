import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/deletion_write_policy.dart';
import 'package:shoutout/web_environment.dart';

Map<String, dynamic> config(String name) =>
    jsonDecode(File('config/$name.json').readAsStringSync())
        as Map<String, dynamic>;

void main() {
  void expectServer(DeletionWritePolicy policy, bool enabled) {
    expect(policy.preparation, enabled);
    expect(policy.finalization, enabled);
    expect(policy.shoutDeletion, enabled);
  }

  test(
    'DEV native clients use the server without accessing web configuration',
    () {
      expectServer(
        DeletionWritePolicy.forClient(projectId: 'shoutout-dev-46c81'),
        true,
      );
    },
  );

  test('DEV cannot re-enable direct writes by disabling deletion flags', () {
    for (final enabled in [false, true]) {
      final web = WebEnvironment.fromJson({
        ...config('dev'),
        'serverAccountDeletionPreparation': enabled,
        'serverAccountDeletionFinalization': enabled,
        'serverShoutDeletion': enabled,
      });
      expectServer(
        DeletionWritePolicy.forClient(
          projectId: web.firebaseOptions.projectId,
          web: web,
        ),
        true,
      );
    }
  });

  test('production configuration keeps its existing disabled routes', () {
    final web = WebEnvironment.fromJson(config('prod'));
    expectServer(
      DeletionWritePolicy.forClient(
        projectId: web.firebaseOptions.projectId,
        web: web,
      ),
      false,
    );
    expectServer(
      DeletionWritePolicy.forClient(projectId: web.firebaseOptions.projectId),
      false,
    );
  });

  test('outside DEV the existing independent web flags remain effective', () {
    final web = WebEnvironment.fromJson({
      ...config('prod'),
      'appCheckSiteKey': config('dev')['appCheckSiteKey'],
      'serverAccountDeletionPreparation': true,
      'serverAccountDeletionFinalization': false,
      'serverShoutDeletion': true,
    });
    final policy = DeletionWritePolicy.forClient(
      projectId: web.firebaseOptions.projectId,
      web: web,
    );
    expect(policy.preparation, true);
    expect(policy.finalization, false);
    expect(policy.shoutDeletion, true);
  });
}
