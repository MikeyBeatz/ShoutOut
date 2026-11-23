import 'package:flutter/material.dart';

/// Account-bound busy/error handling for the legacy public report menus.
class ReportDecisionActionMenu extends StatefulWidget {
  const ReportDecisionActionMenu({
    super.key,
    required this.isCurrent,
    required this.onDecision,
    required this.onError,
    required this.items,
    required this.pendingAction,
  });
  final bool Function() isCurrent;
  final Future<void> Function(String) onDecision;
  final void Function(Object) onError;
  final List<PopupMenuEntry<String>> Function() items;
  final String? Function() pendingAction;
  @override
  State<ReportDecisionActionMenu> createState() =>
      _ReportDecisionActionMenuState();
}

class _ReportDecisionActionMenuState extends State<ReportDecisionActionMenu> {
  bool _busy = false;
  Future<void> _submit(String value) async {
    if (_busy || !widget.isCurrent()) return;
    final pending = widget.pendingAction();
    if (pending != null && pending != value) return;
    setState(() => _busy = true);
    final current = widget.isCurrent, error = widget.onError;
    try {
      await widget.onDecision(value);
    } catch (failure) {
      if (mounted && current()) error(failure);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _busy
      ? const SizedBox.square(
          dimension: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        )
      : PopupMenuButton<String>(
          onSelected: _submit,
          itemBuilder: (_) {
            final pending = widget.pendingAction();
            if (pending == null) return widget.items();
            final filtered = widget
                .items()
                .whereType<PopupMenuItem<String>>()
                .where((item) => item.value == pending)
                .toList();
            return filtered.isNotEmpty
                ? [
                    PopupMenuItem<String>(
                      value: pending,
                      enabled: filtered.first.enabled,
                      child: const Text('Zopakovat původní rozhodnutí'),
                    ),
                  ]
                : [
                    const PopupMenuItem<String>(
                      enabled: false,
                      child: Text('Dokonči původní rozhodnutí v Hlášení.'),
                    ),
                  ];
          },
        );
}
