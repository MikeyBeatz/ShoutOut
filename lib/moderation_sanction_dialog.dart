import 'package:flutter/material.dart';

/// Keeps the decision visible while the server confirms it. An uncertain
/// request locks its original reason/action and offers an explicit retry.
class ModerationSanctionDialog extends StatefulWidget {
  const ModerationSanctionDialog({
    super.key,
    required this.title,
    required this.userId,
    required this.actions,
    required this.label,
    required this.initialReason,
    required this.isCurrent,
    required this.hasPending,
    required this.onSubmit,
    this.initialAction,
    this.previousCount,
  });
  final String title, userId, initialReason;
  final List<String> actions;
  final String Function(String) label;
  final String? initialAction;
  final int? previousCount;
  final bool Function() isCurrent, hasPending;
  final Future<void> Function(String, String) onSubmit;

  @override
  State<ModerationSanctionDialog> createState() =>
      _ModerationSanctionDialogState();
}

class _ModerationSanctionDialogState extends State<ModerationSanctionDialog> {
  late final TextEditingController _reason;
  late String _action;
  bool _busy = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    _reason = TextEditingController(text: widget.initialReason);
    _action = widget.initialAction ?? widget.actions.first;
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !widget.isCurrent()) return;
    final reason = _reason.text.trim();
    if (reason.isEmpty || reason.runes.length > 500) {
      setState(() => _error = 'Vyplň konkrétní důvod, nejvýše 500 znaků.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.onSubmit(_action, reason);
      if (mounted && ModalRoute.of(context)?.isCurrent == true) {
        Navigator.pop(context, widget.isCurrent());
      }
    } catch (_) {
      if (!mounted) return;
      if (!widget.isCurrent()) {
        if (ModalRoute.of(context)?.isCurrent == true) {
          Navigator.pop(context, false);
        }
        return;
      }
      setState(() {
        _busy = false;
        _error = widget.hasPending()
            ? 'Výsledek se nepodařilo potvrdit. Zopakuj původní rozhodnutí.'
            : 'Rozhodnutí se nepodařilo uložit. Ověř oprávnění a zkus to znovu.';
      });
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: AlertDialog(
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Uživatel: ${widget.userId}'),
            if (widget.previousCount != null)
              Text('Dřívější postihy: ${widget.previousCount}'),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _action,
              decoration: const InputDecoration(labelText: 'Rozhodnutí'),
              items: [
                for (final action in widget.actions)
                  DropdownMenuItem(
                    value: action,
                    child: Text(widget.label(action)),
                  ),
              ],
              onChanged:
                  _busy || widget.hasPending() || widget.actions.length == 1
                  ? null
                  : (value) {
                      if (value != null) setState(() => _action = value);
                    },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _reason,
              enabled: !_busy && !widget.hasPending(),
              maxLength: 500,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Důvod rozhodnutí'),
            ),
            if (_error != null)
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context, false),
          child: const Text('Zrušit'),
        ),
        FilledButton.icon(
          onPressed: _busy ? null : _submit,
          icon: _busy
              ? const SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.check),
          label: Text(
            widget.hasPending()
                ? 'Zopakovat původní rozhodnutí'
                : 'Potvrdit rozhodnutí',
          ),
        ),
      ],
    ),
  );
}
