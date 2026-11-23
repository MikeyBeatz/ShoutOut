import 'package:flutter/material.dart';

/// The list's live stream removes a confirmed message. An uncertain request
/// stays in the caller's session gateway even if this button is disposed.
class PrivateReplyDeleteButton extends StatefulWidget {
  const PrivateReplyDeleteButton({
    super.key,
    required this.onDelete,
    required this.onError,
    required this.isCurrent,
    required this.tooltip,
  });
  final Future<void> Function() onDelete;
  final void Function(Object) onError;
  final bool Function() isCurrent;
  final String tooltip;

  @override
  State<PrivateReplyDeleteButton> createState() =>
      _PrivateReplyDeleteButtonState();
}

class _PrivateReplyDeleteButtonState extends State<PrivateReplyDeleteButton> {
  bool _busy = false;
  Future<void> _delete() async {
    if (_busy || !widget.isCurrent()) return;
    setState(() => _busy = true);
    // Bind this attempt's callbacks. A reused widget must not report an old
    // request's error in a new account's UI.
    final isCurrent = widget.isCurrent, onError = widget.onError;
    try {
      await widget.onDelete();
    } catch (error) {
      if (mounted && isCurrent()) onError(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: widget.tooltip,
    visualDensity: VisualDensity.compact,
    onPressed: _busy ? null : _delete,
    icon: _busy
        ? const SizedBox(
            width: 19,
            height: 19,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : const Icon(Icons.delete_outline, size: 19),
  );
}
