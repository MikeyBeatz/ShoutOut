import 'dart:async';

import 'package:flutter/material.dart';

import 'l10n/text.dart';

/// Keep the pending-request gate behind a modal until the operation completes.
/// Auth may rebuild the original screen before the operation's future settles.
Future<T> runAccountDeletionWithProgress<T>(
  BuildContext context, {
  required String userId,
  required Stream<String?> identities,
  required Future<T> Function() operation,
}) async {
  final navigator = Navigator.of(context, rootNavigator: true);
  final route = DialogRoute<void>(
    context: context,
    barrierDismissible: false,
    builder: (context) => PopScope(
      canPop: false,
      child: AlertDialog(
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 20),
            Text(tr(context, 'Probíhá mazání…')),
          ],
        ),
      ),
    ),
  );
  var closed = false;
  void close() {
    // Never pop a different route if Auth or navigation already removed ours.
    if (closed) return;
    closed = true;
    if (navigator.mounted && route.isActive) {
      if (route.isCurrent) {
        navigator.pop();
      } else {
        navigator.removeRoute(route);
      }
    }
  }

  navigator.push(route);
  final subscription = identities.listen((uid) {
    if (uid != userId) close();
  }, onError: (Object _) {});
  try {
    return await operation();
  } finally {
    close();
    unawaited(subscription.cancel());
  }
}
