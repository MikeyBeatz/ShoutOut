import 'package:flutter/material.dart';
import 'moderation_queue_client.dart';

/// A paged case list. Its controller and open callback own server/Auth policy.
class ModerationQueueView extends StatefulWidget {
  const ModerationQueueView({
    super.key,
    required this.controller,
    required this.onOpen,
    this.locationFilter,
  });
  final ModerationQueueController controller;
  final Future<void> Function(ModerationCaseRecord) onOpen;
  final Widget? locationFilter;
  @override
  State<ModerationQueueView> createState() => _ModerationQueueViewState();
}

class _ModerationQueueViewState extends State<ModerationQueueView> {
  final _scroll = ScrollController();
  String? _opening;
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_changed);
  }

  @override
  void didUpdateWidget(ModerationQueueView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_changed);
      widget.controller.addListener(_changed);
    }
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _refresh({ModerationQueueQuery? query}) async {
    await widget.controller.refresh(nextQuery: query);
    if (mounted && widget.controller.error == null && _scroll.hasClients) {
      _scroll.jumpTo(0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              for (final entry in const {
                'all': 'Vše',
                'shout': 'Shouty',
                'comment': 'Komentáře',
                'privateReply': 'Soukromé odpovědi',
              }.entries)
                ChoiceChip(
                  label: Text(entry.value),
                  selected: c.query.category == entry.key,
                  onSelected: (_) => _refresh(
                    query: ModerationQueueQuery(
                      category: entry.key,
                      order: c.query.order,
                      area: c.query.area,
                    ),
                  ),
                ),
              DropdownButton<String>(
                value: c.query.order,
                items: const [
                  DropdownMenuItem(
                    value: 'mostReported',
                    child: Text('Nejvíce hlášení'),
                  ),
                  DropdownMenuItem(value: 'newest', child: Text('Nejnovější')),
                  DropdownMenuItem(value: 'oldest', child: Text('Nejstarší')),
                ],
                onChanged: (value) {
                  if (value != null) {
                    _refresh(
                      query: ModerationQueueQuery(
                        category: c.query.category,
                        order: value,
                        area: c.query.area,
                      ),
                    );
                  }
                },
              ),
              IconButton(
                tooltip: 'Obnovit hlášení',
                onPressed: c.loading ? null : _refresh,
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        if (widget.locationFilter != null) widget.locationFilter!,
        if (c.loading) const LinearProgressIndicator(),
        if (c.error != null)
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                const Expanded(child: Text('Hlášení se nepodařilo načíst.')),
                TextButton(
                  onPressed: c.loading ? null : c.retry,
                  child: const Text('Zkusit znovu'),
                ),
              ],
            ),
          ),
        Expanded(
          child: ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.all(12),
            itemCount: c.items.length + 1,
            itemBuilder: (context, index) {
              if (index == c.items.length) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: c.hasMore
                        ? FilledButton.tonalIcon(
                            onPressed: c.loading ? null : c.loadMore,
                            icon: const Icon(Icons.expand_more),
                            label: const Text('Načíst další'),
                          )
                        : c.items.isEmpty && !c.loading && c.error == null
                        ? const Text('Žádná otevřená hlášení.')
                        : const SizedBox.shrink(),
                  ),
                );
              }
              final row = c.items[index];
              return Card(
                key: ValueKey(row.caseId),
                child: ListTile(
                  leading: Badge(
                    label: Text('${row.pendingCount}'),
                    child: Icon(switch (row.targetType) {
                      'shout' => Icons.campaign_outlined,
                      'comment' => Icons.comment_outlined,
                      _ => Icons.mark_chat_unread_outlined,
                    }),
                  ),
                  title: Text(row.representative['reason'] as String),
                  subtitle: Text(
                    '${row.pendingCount}× nahlášeno${row.escalatedCount > 0 ? ' · Předáno seniorovi' : ''}${row.activeJobId != null
                        ? '\nRozpracované rozhodnutí'
                        : row.appliedDecision != null
                        ? '\nPokračovat v původním rozhodnutí'
                        : ''}',
                  ),
                  trailing: _opening == row.caseId
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.chevron_right),
                  onTap: _opening != null
                      ? null
                      : () async {
                          setState(() => _opening = row.caseId);
                          try {
                            await widget.onOpen(row);
                          } catch (_) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'Případ se nepodařilo otevřít.',
                                  ),
                                ),
                              );
                            }
                          } finally {
                            if (mounted) setState(() => _opening = null);
                          }
                        },
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
