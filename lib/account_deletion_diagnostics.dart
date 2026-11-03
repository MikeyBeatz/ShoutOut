import 'package:firebase_core/firebase_core.dart';

/// Console diagnostics contain codes only, never error messages or payloads.
String accountDeletionDiagnosticCode(Object error) {
  if (error is FirebaseException) {
    const plugins = {
      'firebase_auth',
      'cloud_firestore',
      'cloud_functions',
      'firebase_app_check',
      'firebase_functions',
    };
    final plugin = plugins.contains(error.plugin) ? error.plugin : 'unknown';
    final code = error.code;
    return RegExp(r'^[a-zA-Z0-9_-]{1,80}$').hasMatch(code)
        ? 'firebase/$plugin/$code'
        : 'firebase/$plugin/unknown';
  }
  if (error is StateError) {
    const known = {
      'invalid-account-deletion-finalization',
      'unconfirmed-account-deletion-request',
      'invalid-account-deletion-request',
      'invalid-account-deletion-confirmation',
      'account-deletion-preparation-required',
      'account-email-required',
      'operation-clock-unavailable',
    };
    final message = error.message;
    if (known.contains(message)) return 'state/$message';
    return 'state/unknown';
  }
  return 'unknown';
}
