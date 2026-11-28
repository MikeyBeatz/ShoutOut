import 'package:flutter/material.dart';
import 'moderation_queue_client.dart';
import 'moderation_sanction_gateway.dart';

class ModerationCaseDecisionPanel extends StatefulWidget {
  const ModerationCaseDecisionPanel({
    super.key,
    required this.record,
    required this.isSenior,
    required this.client,
    required this.currentUserId,
    required this.decisionItems,
    required this.failureText,
    required this.onComplete,
  });
  final ModerationCaseRecord record;
  final bool isSenior;
  final ModerationCaseDecisionClient client;
  final String? Function() currentUserId;
  final List<DropdownMenuItem<String>> Function(String?) decisionItems;
  final String Function(BuildContext, Object) failureText;
  final VoidCallback onComplete;
  @override
  State<ModerationCaseDecisionPanel> createState() =>
      _ModerationCaseDecisionPanelState();
}

class _ModerationCaseDecisionPanelState
    extends State<ModerationCaseDecisionPanel> {
  final _note = TextEditingController();
  String? _decision, _error;
  bool _saving = false;
  int _processed = 0, _total = 0;
  @override
  void initState() {
    super.initState();
    final uid = widget.currentUserId();
    _decision =
        widget.record.appliedDecision ??
        (uid == null
            ? null
            : widget.client.pendingDecision(
                uid,
                widget.record.caseId,
                incarnation: widget.record.incarnation,
              ));
    if (uid != null) {
      _note.text =
          widget.client.pendingNote(
            uid,
            widget.record.caseId,
            incarnation: widget.record.incarnation,
          ) ??
          '';
    }
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final uid = widget.currentUserId();
    if (_saving || uid == null) return;
    final continuing = widget.record.activeJobId != null;
    final decision = _decision;
    if (!continuing && decision == null) return;
    final pending = widget.client.pendingDecision(
      uid,
      widget.record.caseId,
      incarnation: widget.record.incarnation,
    );
    if (!continuing &&
        pending == null &&
        widget.record.appliedDecision == null &&
        moderationSanctionActions.contains(decision) &&
        _note.text.trim().isEmpty) {
      setState(() => _error = 'Vyplň důvod postihu.');
      return;
    }
    if (!continuing &&
        pending == null &&
        widget.record.appliedDecision == null &&
        moderationSanctionActions.contains(decision)) {
      final confirmation = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Potvrdit postih'),
          content: const Text(
            'Potvrdit zvolený postih autora tohoto nahlášeného obsahu?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Zrušit'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Potvrdit rozhodnutí'),
            ),
          ],
        ),
      );
      if (confirmation != true || !mounted || widget.currentUserId() != uid) {
        return;
      }
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    void progress(int count, int total) {
      if (mounted && widget.currentUserId() == uid) {
        setState(() {
          _processed = count;
          _total = total;
        });
      }
    }

    try {
      if (continuing) {
        await widget.client.resume(
          userId: uid,
          jobId: widget.record.activeJobId!,
          caseId: widget.record.caseId,
          incarnation: widget.record.incarnation,
          onProgress: progress,
        );
      } else {
        await widget.client.decide(
          userId: uid,
          record: widget.record,
          decision: decision!,
          note: widget.record.appliedDecision != null
              ? 'Dokončení původního rozhodnutí.'
              : _note.text,
          onProgress: progress,
        );
      }
      if (mounted && widget.currentUserId() == uid) {
        setState(() => _saving = false);
        widget.onComplete();
      }
    } catch (e) {
      if (mounted && widget.currentUserId() == uid) {
        setState(() {
          _saving = false;
          _error = widget.failureText(context, e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final record = widget.record;
    final uid = widget.currentUserId();
    final pending = uid == null
        ? null
        : widget.client.pendingDecision(
            uid,
            record.caseId,
            incarnation: record.incarnation,
          );
    final recovery = record.appliedDecision != null,
        continuing = record.activeJobId != null;
    if (record.escalatedCount > 0 &&
        !widget.isSenior &&
        !continuing &&
        !recovery &&
        pending == null) {
      return const Text('Tento případ vyžaduje senior moderátora.');
    }
    final selected = widget
        .decisionItems(_decision)
        .where((item) => item.value == _decision)
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('Celkem ${record.pendingCount} hlášení'),
        if (continuing || recovery)
          const Text(
            'Pokračuje se pouze v původním rozhodnutí; postih se neopakuje.',
          ),
        if (!continuing && (recovery || pending != null))
          InputDecorator(
            decoration: const InputDecoration(labelText: 'Rozhodnutí'),
            child: selected.isEmpty
                ? const Text('Původní rozhodnutí')
                : selected.first.child,
          ),
        if (!continuing && !recovery && pending == null)
          DropdownButtonFormField<String>(
            initialValue: _decision,
            decoration: const InputDecoration(labelText: 'Rozhodnutí'),
            items: widget.decisionItems(_decision),
            onChanged: _saving || recovery || pending != null
                ? null
                : (value) => setState(() => _decision = value),
          ),
        if (!continuing && !recovery)
          TextField(
            controller: _note,
            enabled: !_saving && pending == null,
            maxLength: 500,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Interní poznámka nebo důvod',
            ),
          ),
        if (_saving) ...[
          const LinearProgressIndicator(),
          Text(
            _total > 0
                ? 'Vyřizuji $_processed z $_total hlášení…'
                : 'Připravuji rozhodnutí…',
          ),
        ],
        if (_error != null)
          Text(
            _error!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton.icon(
            onPressed: _saving || (!continuing && _decision == null)
                ? null
                : _submit,
            icon: const Icon(Icons.check),
            label: Text(
              continuing || recovery || pending != null
                  ? 'Pokračovat v rozhodnutí'
                  : 'Uložit rozhodnutí',
            ),
          ),
        ),
      ],
    );
  }
}
