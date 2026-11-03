import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/account_deletion_diagnostics.dart';

void main() {
  test(
    'diagnostics identify SDK and known invariant errors without messages',
    () {
      expect(
        accountDeletionDiagnosticCode(
          FirebaseException(
            plugin: 'cloud_firestore',
            code: 'permission-denied',
            message: 'sensitive payload',
          ),
        ),
        'firebase/cloud_firestore/permission-denied',
      );
      expect(
        accountDeletionDiagnosticCode(
          StateError('unconfirmed-account-deletion-request'),
        ),
        'state/unconfirmed-account-deletion-request',
      );
    },
  );
  test(
    'arbitrary error messages, plugin names and malformed codes are never exposed',
    () {
      expect(
        accountDeletionDiagnosticCode(
          FirebaseException(
            plugin: 'private@example.test',
            code: 'token=sensitive',
            message: 'private',
          ),
        ),
        'firebase/unknown/unknown',
      );
      expect(
        accountDeletionDiagnosticCode(StateError('password or token')),
        'state/unknown',
      );
      expect(
        accountDeletionDiagnosticCode(Exception('personal data')),
        'unknown',
      );
    },
  );
}
