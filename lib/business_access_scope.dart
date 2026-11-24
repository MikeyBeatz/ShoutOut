import 'package:flutter/material.dart';

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
            color: Theme.of(context).colorScheme.errorContainer,
            child: SafeArea(
              bottom: false,
              child: ListTile(
                leading: const Icon(Icons.pause_circle_outline),
                title: const Text('Business publikování je pozastavené.'),
                subtitle: reason.isEmpty
                    ? null
                    : Text(
                        reason,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                trailing: TextButton(
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
