import 'package:flutter/material.dart';

/// Reusable legacy report row action: busy state and errors remain account-bound.
class PrivateReportActionMenu extends StatefulWidget {
  const PrivateReportActionMenu({
    super.key,
    required this.onDecision,
    required this.onError,
    required this.isCurrent,
    required this.hasPendingRemoval,
    required this.resolveLabel,
    required this.removeLabel,
    this.pendingDecision,
  });
  final Future<void> Function(String action) onDecision;
  final void Function(Object) onError;
  final bool Function() isCurrent, hasPendingRemoval;
  final String resolveLabel, removeLabel;
  final String? Function()? pendingDecision;

  @override
  State<PrivateReportActionMenu> createState() =>
      _PrivateReportActionMenuState();
}

class _PrivateReportActionMenuState extends State<PrivateReportActionMenu> {
  bool _busy = false;
  Future<void> _submit(String action) async {
    if (_busy || !widget.isCurrent()) return;
    setState(() => _busy = true);
    final isCurrent = widget.isCurrent, onError = widget.onError;
    try {
      await widget.onDecision(action);
    } catch (error) {
      if (mounted && isCurrent()) onError(error);
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
          itemBuilder: (_) => [
            if (widget.pendingDecision?.call() case final decision?
                when decision != 'resolve')
              const PopupMenuItem(
                enabled: false,
                child: Text('Dokonči původní rozhodnutí v Hlášení.'),
              )
            else ...[
              if (!widget.hasPendingRemoval())
                PopupMenuItem(
                  value: 'resolve',
                  child: Text(
                    widget.pendingDecision?.call() == 'resolve'
                        ? 'Zopakovat původní rozhodnutí'
                        : widget.resolveLabel,
                  ),
                ),
              if (widget.pendingDecision?.call() == null)
                PopupMenuItem(value: 'remove', child: Text(widget.removeLabel)),
            ],
          ],
        );
}
