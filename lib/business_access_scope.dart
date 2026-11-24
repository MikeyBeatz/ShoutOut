import 'package:flutter/material.dart';

const businessSuspendedLabel = 'Účet pozastaven';

bool showBusinessPublishingRestriction(BuildContext context) {
  if (BusinessAccessScope.maybeOf(context)?.publishingAllowed != false) {
    return false;
  }
  ScaffoldMessenger.of(
    context,
  ).showSnackBar(const SnackBar(content: Text(businessSuspendedLabel)));
  return true;
}

class BusinessAccessScope extends InheritedWidget {
  const BusinessAccessScope({
    super.key,
    required this.publishingAllowed,
    required this.reason,
    required super.child,
  });
  final bool publishingAllowed;
  final String reason;
  static BusinessAccessScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<BusinessAccessScope>();
  @override
  bool updateShouldNotify(BusinessAccessScope oldWidget) =>
      publishingAllowed != oldWidget.publishingAllowed ||
      reason != oldWidget.reason;
}

/// Suspended accounts retain their ordinary navigation, profile and deletion
/// controls. The publication restriction is also enforced by the server.
class BusinessAccessBoundary extends StatelessWidget {
  const BusinessAccessBoundary({
    super.key,
    required this.publishingAllowed,
    required this.reason,
    required this.child,
  });
  final bool publishingAllowed;
  final String reason;
  final Widget child;
  @override
  Widget build(BuildContext context) => BusinessAccessScope(
    publishingAllowed: publishingAllowed,
    reason: reason,
    child: Column(
      children: [
        if (!publishingAllowed)
          Material(
            color: Theme.of(context).colorScheme.surfaceContainerHigh,
            child: SafeArea(
              bottom: false,
              child: ListTile(
                iconColor: Theme.of(context).colorScheme.onSurface,
                textColor: Theme.of(context).colorScheme.onSurface,
                leading: const Icon(Icons.pause_circle_outline),
                title: const Text(businessSuspendedLabel),
                trailing: TextButton(
                  style: TextButton.styleFrom(
                    foregroundColor: Theme.of(context).colorScheme.onSurface,
                  ),
                  onPressed: () => showDialog<void>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Pozastavení Business účtu'),
                      content: Text(
                        reason.isEmpty
                            ? 'Pro další informace kontaktuj podporu.'
                            : reason,
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('Zavřít'),
                        ),
                      ],
                    ),
                  ),
                  child: const Text('Detail'),
                ),
              ),
            ),
          ),
        Expanded(key: const ValueKey('business-content'), child: child),
      ],
    ),
  );
}
