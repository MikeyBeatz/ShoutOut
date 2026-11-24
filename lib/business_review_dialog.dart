import 'package:flutter/material.dart';

String businessDecisionLabel(String action) => switch (action) {
  'approve' => 'Schválit a aktivovat',
  'reject' => 'Zamítnout žádost',
  'suspend' => 'Pozastavit Business účet',
  'reactivate' => 'Znovu aktivovat',
  _ => 'Odeslat opravenou žádost',
};

class BusinessReviewDialog extends StatefulWidget {
  const BusinessReviewDialog({
    super.key,
    required this.applicationId,
    required this.decisions,
    required this.submit,
    required this.isCurrent,
    required this.hasPending,
    this.initialReason = '',
    this.initialDecision,
    this.companyName,
  });
  final String applicationId, initialReason;
  final List<String> decisions;
  final String? initialDecision;
  final String? companyName;
  final Future<void> Function(String decision, String reason) submit;
  final bool Function() isCurrent, hasPending;
  @override
  State<BusinessReviewDialog> createState() => _BusinessReviewDialogState();
}

class _BusinessReviewDialogState extends State<BusinessReviewDialog> {
  late final _reason = TextEditingController(text: widget.initialReason);
  late String _decision = widget.initialDecision ?? widget.decisions.first;
  bool _busy = false, _pending = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    _pending = widget.hasPending();
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !widget.isCurrent()) return;
    if (['reject', 'suspend'].contains(_decision) &&
        _reason.text.trim().isEmpty) {
      setState(() => _error = 'Uveď konkrétní důvod rozhodnutí.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.submit(_decision, _reason.text.trim());
      if (mounted) Navigator.pop(context, widget.isCurrent());
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _pending = widget.hasPending();
          _error = _pending
              ? 'Výsledek zatím není potvrzený. Zopakuj původní požadavek.'
              : 'Rozhodnutí se nepodařilo uložit. Obnov stav žádosti a zkus to znovu.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: AlertDialog(
      title: const Text('Business rozhodnutí'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(widget.companyName ?? widget.applicationId),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _decision,
              items: widget.decisions
                  .map(
                    (v) => DropdownMenuItem(
                      value: v,
                      child: Text(businessDecisionLabel(v)),
                    ),
                  )
                  .toList(),
              onChanged: _busy || _pending
                  ? null
                  : (v) {
                      if (v != null) setState(() => _decision = v);
                    },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _reason,
              enabled: !_busy && !_pending,
              maxLength: 500,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Důvod rozhodnutí'),
            ),
            if (_error != null) Text(_error!),
            if (_busy) const LinearProgressIndicator(),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context, false),
          child: const Text('Zpět'),
        ),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: Text(
            _pending ? 'Zopakovat původní požadavek' : 'Uložit rozhodnutí',
          ),
        ),
      ],
    ),
  );
}
