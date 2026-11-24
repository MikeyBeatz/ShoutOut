import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

DateTime? _date(Object? value) => switch (value) {
  Timestamp value => value.toDate(),
  DateTime value => value.toLocal(),
  _ => null,
};

String _day(DateTime date) =>
    '${date.day.toString().padLeft(2, '0')}.'
    '${date.month.toString().padLeft(2, '0')}.${date.year}';

/// A display of existing enforcement pointers, not a second sanction or an
/// authorization decision. A ban also prevents creating content.
class StaffEnforcementState {
  StaffEnforcementState({
    required Map<String, dynamic>? ban,
    required Map<String, dynamic>? restriction,
    required DateTime now,
    Map<String, Map<String, dynamic>> revocations = const {},
  }) : banActive = _active(ban, now, revocations),
       restrictionActive = _active(restriction, now, revocations),
       activeSanctionIds = {
         for (final pointer in [ban, restriction])
           if (_active(pointer, now, revocations) &&
               pointer?['sanctionId'] is String)
             pointer!['sanctionId'] as String,
       };

  final bool banActive;
  final bool restrictionActive;
  final Set<String> activeSanctionIds;
  bool get creationBlocked => banActive || restrictionActive;

  static bool _active(
    Map<String, dynamic>? pointer,
    DateTime now,
    Map<String, Map<String, dynamic>> revocations,
  ) =>
      pointer != null &&
      !revocations.containsKey(pointer['sanctionId']) &&
      (pointer['expiresAt'] == null ||
          (_date(pointer['expiresAt'])?.isAfter(now) ?? false));
}

class StaffSanctionRecord {
  const StaffSanctionRecord({
    required this.id,
    required this.data,
    this.revocation,
  });

  final String id;
  final Map<String, dynamic> data;
  final Map<String, dynamic>? revocation;
  DateTime? get createdAt => _date(data['createdAt']);
  DateTime? get plannedEnd => _date(data['expiresAt']);
  DateTime? get revokedAt => _date(revocation?['createdAt']);
  DateTime? get effectiveEnd {
    final revoked = revokedAt, planned = plannedEnd;
    if (revoked == null) return planned;
    return planned == null || revoked.isBefore(planned) ? revoked : planned;
  }

  bool active(Set<String> activeIds, DateTime now) =>
      activeIds.contains(id) &&
      revocation == null &&
      (plannedEnd == null || plannedEnd!.isAfter(now));

  String get title => switch (data['type']) {
    'warning' => 'Varování',
    'contentRestriction' => 'Omezení tvorby',
    'accountBan' => data['permanent'] == true ? 'Trvalý ban' : 'Dočasný ban',
    _ => 'Postih',
  };

  String _period(DateTime? end) {
    final start = createdAt;
    if (start == null) return 'Datum udělení neuvedeno';
    if (end != null) return '${_day(start)}–${_day(end)}';
    return data['permanent'] == true ? '${_day(start)}–trvale' : _day(start);
  }

  String get period => _period(effectiveEnd);
  String get plannedPeriod => _period(plannedEnd);
}

/// Keep the existing bounded history window, but do not omit an older active
/// pointer merely because it fell outside the original query's first page.
Future<List<StaffSanctionRecord>> loadStaffSanctionHistory({
  required Iterable<StaffSanctionRecord> initial,
  required StaffEnforcementState enforcement,
  required String userId,
  required int limit,
  required DateTime now,
  required Future<StaffSanctionRecord?> Function(String id) loadMissing,
}) async {
  final records = {for (final record in initial) record.id: record};
  for (final id in enforcement.activeSanctionIds) {
    if (records.containsKey(id)) continue;
    final record = await loadMissing(id);
    if (record != null && record.data['userId'] == userId) records[id] = record;
  }
  final ordered = records.values.toList()
    ..sort((a, b) {
      final active = (b.active(enforcement.activeSanctionIds, now) ? 1 : 0)
          .compareTo(a.active(enforcement.activeSanctionIds, now) ? 1 : 0);
      if (active != 0) return active;
      final time = (b.createdAt?.millisecondsSinceEpoch ?? 0).compareTo(
        a.createdAt?.millisecondsSinceEpoch ?? 0,
      );
      return time != 0 ? time : a.id.compareTo(b.id);
    });
  return ordered.take(limit).toList();
}

class StaffEnforcementSummary extends StatelessWidget {
  const StaffEnforcementSummary({super.key, required this.state});
  final StaffEnforcementState state;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      _status(context, 'Ban', state.banActive),
      _status(
        context,
        'Omezení tvorby',
        state.creationBlocked,
        becauseOfBan: state.banActive,
      ),
    ],
  );

  Widget _status(
    BuildContext context,
    String title,
    bool active, {
    bool becauseOfBan = false,
  }) => Card(
    child: ListTile(
      leading: Icon(
        active ? Icons.check_circle : Icons.check_circle_outline,
        color: active
            ? Theme.of(context).colorScheme.error
            : Theme.of(context).colorScheme.onSurfaceVariant,
      ),
      title: Text(title),
      subtitle: Text(
        !active
            ? 'Není aktivní'
            : becauseOfBan
            ? 'Aktivní kvůli banu'
            : 'Aktivní',
      ),
    ),
  );
}

class StaffSanctionHistoryCard extends StatelessWidget {
  const StaffSanctionHistoryCard({
    super.key,
    required this.record,
    required this.active,
    required this.sourceText,
    this.revokeButton,
  });

  final StaffSanctionRecord record;
  final bool active;
  final String sourceText;
  final Widget? revokeButton;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final foreground = active ? colors.onSurface : null;
    return Card(
      color: active
          ? Color.alphaBlend(
              colors.error.withValues(alpha: .08),
              colors.surface,
            )
          : null,
      shape: active
          ? RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: colors.error),
            )
          : null,
      child: ExpansionTile(
        textColor: foreground,
        collapsedTextColor: foreground,
        iconColor: active ? colors.error : null,
        collapsedIconColor: active ? colors.error : null,
        leading: Icon(
          record.revocation != null ? Icons.undo : Icons.gavel_outlined,
          color: active ? colors.error : null,
        ),
        title: Wrap(
          spacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(
              record.title,
              style: TextStyle(fontWeight: active ? FontWeight.bold : null),
            ),
            Text(record.period),
          ],
        ),
        subtitle: Text(
          '${active ? 'Aktivní · ' : ''}'
          '${record.revocation == null ? record.data['reason'] ?? '' : 'Zrušeno: ${record.revocation?['reason'] ?? ''}'}',
          style: TextStyle(color: foreground),
        ),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          for (final text in [
            'Rozhodnutí: ${record.id}',
            'Zdroj: ${record.data['sourceType'] ?? ''}',
            if (record.revokedAt != null)
              'Původní platnost: ${record.plannedPeriod}',
            sourceText,
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: SelectableText(
                  text,
                  style: TextStyle(color: foreground),
                ),
              ),
            ),
          if (revokeButton != null)
            Align(alignment: Alignment.centerRight, child: revokeButton!),
        ],
      ),
    );
  }
}
