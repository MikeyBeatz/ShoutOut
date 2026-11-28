import 'dart:convert';
import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import 'timed_operation_gateway.dart';

typedef ModerationQueueTransport =
    Future<Map<String, dynamic>> Function(
      String operation,
      Map<String, dynamic> payload,
    );

Map<String, dynamic> _map(Object? value) =>
    Map<String, dynamic>.from(value as Map);
bool _hex(Object? v) => v is String && RegExp(r'^[a-f0-9]{64}$').hasMatch(v);
bool _id(Object? v) =>
    v is String && RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(v);
DateTime _time(Object? raw) {
  final data = _map(raw);
  final seconds = data['seconds'], nanos = data['nanoseconds'];
  if (seconds is! int ||
      nanos is! int ||
      seconds < 0 ||
      nanos < 0 ||
      nanos >= 1000000000 ||
      seconds > 253402300799) {
    throw const FormatException('Invalid moderation timestamp');
  }
  return DateTime.fromMicrosecondsSinceEpoch(
    seconds * 1000000 + nanos ~/ 1000,
    isUtc: true,
  );
}

class ModerationCaseRecord {
  ModerationCaseRecord.fromJson(Map<String, dynamic> json)
    : caseId = json['caseId'] as String,
      incarnation = json['incarnation'] as String,
      revision = json['revision'] as int,
      targetType = json['targetType'] as String,
      shoutId = json['shoutId'] as String,
      targetId = json['targetId'] as String,
      pendingCount = json['pendingCount'] as int,
      openCount = json['openCount'] as int,
      escalatedCount = json['escalatedCount'] as int,
      lastAt = _time(json['lastAt']),
      representative = _map(json['representativeReport']),
      activeJobId = json['activeJobId'] as String?,
      appliedDecision = json['appliedDecision'] as String? {
    final collection = const {
      'shout': 'reports',
      'comment': 'commentReports',
      'privateReply': 'privateReplyReports',
    }[targetType];
    final suffix = '_$shoutId${targetType == 'shout' ? '' : '_$targetId'}';
    final reportId = representative['id'];
    if (!_hex(caseId) ||
        !_hex(incarnation) ||
        revision < 1 ||
        !['shout', 'comment', 'privateReply'].contains(targetType) ||
        !_id(shoutId) ||
        !_id(targetId) ||
        targetType == 'shout' && targetId != shoutId ||
        pendingCount < 1 ||
        openCount < 0 ||
        escalatedCount < 0 ||
        openCount + escalatedCount != pendingCount ||
        activeJobId != null && !_hex(activeJobId) ||
        representative['reason'] is! String ||
        reportId is! String ||
        !reportId.endsWith(suffix) ||
        !_id(reportId.substring(0, reportId.length - suffix.length)) ||
        representative['collection'] != collection) {
      throw const FormatException('Invalid moderation case');
    }
  }
  final String caseId, incarnation, targetType, shoutId, targetId;
  final int revision, pendingCount, openCount, escalatedCount;
  final DateTime lastAt;
  final Map<String, dynamic> representative;
  final String? activeJobId, appliedDecision;
}

class ModerationQueueQuery {
  ModerationQueueQuery({
    this.category = 'all',
    this.order = 'mostReported',
    Map<String, dynamic> area = const {'kind': 'all', 'value': ''},
  }) : area = Map.unmodifiable(
         jsonDecode(jsonEncode(area)) as Map<String, dynamic>,
       );
  final String category, order;
  final Map<String, dynamic> area;
  Map<String, dynamic> payload(String uid, Map<String, dynamic>? cursor) => {
    'expectedUserId': uid,
    'category': category,
    'order': order,
    'area': area,
    'cursor': ?cursor,
  };
}

/// Keeps the same cursor on network failure and discards every response from
/// an old account/query/disposed screen. Empty non-final pages remain pageable.
class ModerationQueueController extends ChangeNotifier {
  ModerationQueueController({required this.send, required this.currentUserId});
  final ModerationQueueTransport send;
  final String? Function() currentUserId;
  ModerationQueueQuery query = ModerationQueueQuery();
  List<ModerationCaseRecord> items = const [];
  Map<String, dynamic>? _cursor;
  Object? error;
  bool loading = false, hasMore = false;
  String? _userId;
  int _generation = 0;
  bool _disposed = false;
  bool _failedRefresh = true;
  Future<void>? _flight;

  Future<void> refresh({ModerationQueueQuery? nextQuery}) {
    final changedUser = currentUserId() != _userId;
    if (nextQuery != null || changedUser) items = const [];
    if (nextQuery != null) query = nextQuery;
    _generation++;
    _flight = null;
    return _load(refresh: true);
  }

  Future<void> loadMore() {
    if (currentUserId() != _userId) return refresh();
    if (!hasMore) return Future.value();
    return _flight ?? _load(refresh: false);
  }

  Future<void> retry() => _failedRefresh ? refresh() : loadMore();
  Future<void> _load({required bool refresh}) {
    if (_disposed) return Future.value();
    final uid = currentUserId();
    if (uid == null) {
      items = const [];
      _cursor = null;
      hasMore = false;
      loading = false;
      _userId = null;
      notifyListeners();
      return Future.value();
    }
    final generation = _generation, selection = query;
    _userId = uid;
    final cursor = refresh ? null : _cursor;
    _failedRefresh = refresh;
    loading = true;
    error = null;
    notifyListeners();
    final flight = Future<void>.microtask(() async {
      try {
        final result = await send(
          'getModerationCasePage',
          selection.payload(uid, cursor),
        );
        if (!_current(generation, uid)) return;
        if (result['schemaVersion'] != 1 || result['items'] is! List) {
          throw const FormatException('Invalid moderation page');
        }
        final rows = (result['items'] as List)
            .map((v) => ModerationCaseRecord.fromJson(_map(v)))
            .toList();
        if (rows.length > 50) {
          throw const FormatException('Oversize moderation page');
        }
        final next = result['cursor'] == null ? null : _map(result['cursor']);
        if (next != null && jsonEncode(next) == jsonEncode(cursor)) {
          throw const FormatException('Moderation cursor did not advance');
        }
        final combined = <String, ModerationCaseRecord>{
          if (!refresh)
            for (final r in items) r.caseId: r,
        };
        for (final row in rows) {
          combined[row.caseId] = row;
        }
        items = List.unmodifiable(combined.values);
        _cursor = next;
        hasMore = next != null;
      } catch (e) {
        if (!_current(generation, uid)) return;
        error = e;
        if (e is FirebaseFunctionsException &&
            e.code == 'failed-precondition' &&
            e.message == 'Refresh the moderation queue.') {
          // A control/role revision invalidates the cursor. Keep the rows until
          // a fresh first page succeeds; retrying that old cursor cannot work.
          _failedRefresh = true;
        }
        if (e is FirebaseFunctionsException &&
            ['unauthenticated', 'permission-denied'].contains(e.code)) {
          items = const [];
          _cursor = null;
          hasMore = false;
        }
      } finally {
        if (_current(generation, uid)) {
          loading = false;
          _flight = null;
          notifyListeners();
        }
      }
    });
    _flight = flight;
    return flight;
  }

  bool _current(int generation, String uid) =>
      !_disposed && generation == _generation && currentUserId() == uid;
  @override
  void dispose() {
    _disposed = true;
    _generation++;
    super.dispose();
  }
}

class _CaseAttempt {
  _CaseAttempt(this.payload);
  final Map<String, dynamic> payload;
  final timed = TimedOperationAttempt();
  String? jobId;
  Future<void>? flight;
}

/// The complete logical intent is frozen while its result is uncertain.
/// Server-issued Auth time is reused through the existing timed-key gateway.
class ModerationCaseDecisionClient {
  ModerationCaseDecisionClient({
    required this.send,
    required this.currentUserId,
    required this.issuedAt,
    String Function()? newNonce,
  }) : newNonce = newNonce ?? _nonce;
  final ModerationQueueTransport send;
  final String? Function() currentUserId;
  final Future<DateTime> Function(String) issuedAt;
  final String Function() newNonce;
  final _pending = <(String, String), _CaseAttempt>{};
  static String _nonce() {
    final random = Random.secure();
    return List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  String? pendingDecision(String uid, String caseId, {String? incarnation}) =>
      _intent(uid, caseId, incarnation)?['decision'] as String?;
  String? pendingNote(String uid, String caseId, {String? incarnation}) =>
      _intent(uid, caseId, incarnation)?['note'] as String?;
  Map<String, dynamic>? _intent(
    String uid,
    String caseId,
    String? incarnation,
  ) {
    final payload = _pending[(uid, caseId)]?.payload;
    return incarnation == null || payload?['expectedIncarnation'] == incarnation
        ? payload
        : null;
  }

  void forgetUser(String uid) =>
      _pending.removeWhere((key, _) => key.$1 == uid);

  Future<void> decide({
    required String userId,
    required ModerationCaseRecord record,
    required String decision,
    required String note,
    void Function(int processed, int total)? onProgress,
  }) {
    if (currentUserId() != userId) {
      return Future.error(StateError('The signed-in account changed.'));
    }
    final scope = (userId, record.caseId);
    if (_pending[scope]?.payload['expectedIncarnation'] != record.incarnation) {
      _pending.remove(scope);
    }
    final previous = _pending[scope];
    if (previous != null &&
        (previous.payload['decision'] != decision ||
            previous.payload['note'] != note.trim())) {
      return Future.error(StateError('Continue the original decision first.'));
    }
    final attempt = _pending.putIfAbsent(
      scope,
      () => _CaseAttempt({
        'expectedUserId': userId,
        'caseId': record.caseId,
        'expectedIncarnation': record.incarnation,
        'expectedRevision': record.revision,
        'decision': decision,
        'note': note.trim(),
        'idempotencyKey': newNonce(),
      }),
    );
    return attempt.flight ??= _run(
      scope,
      attempt,
      onProgress,
    ).whenComplete(() => attempt.flight = null);
  }

  Future<void> _run(
    (String, String) scope,
    _CaseAttempt attempt,
    void Function(int, int)? progress,
  ) async {
    final (uid, _) = scope;
    void clear() {
      if (identical(_pending[scope], attempt)) _pending.remove(scope);
    }

    void guard() {
      if (currentUserId() != uid) {
        throw StateError('The signed-in account changed.');
      }
    }

    try {
      guard();
      Map<String, dynamic>? state;
      if (attempt.jobId == null) {
        final timed = TimedOperationGateway(
          currentUserId: currentUserId,
          issuedAt: issuedAt,
          newNonce: newNonce,
          send: (operation, payload) async {
            state = await send(operation, payload);
          },
        );
        await timed.call(
          attempt: attempt.timed,
          userId: uid,
          operation: 'startModerationCaseDecision',
          payload: attempt.payload,
        );
        guard();
        if (state?['status'] == 'complete') {
          clear();
          return;
        }
        if (!_hex(state?['jobId'])) {
          throw const FormatException('Invalid moderation job');
        }
        attempt.jobId = state!['jobId'] as String;
      }
      for (;;) {
        guard();
        state = await send('stepModerationCaseDecision', {
          'expectedUserId': uid,
          'jobId': attempt.jobId,
        });
        guard();
        if (state!['status'] == 'complete') {
          clear();
          return;
        }
        if (state!['status'] != 'processing' ||
            state!['processedCount'] is! int ||
            state!['totalCount'] is! int) {
          throw const FormatException('Invalid moderation progress');
        }
        progress?.call(
          state!['processedCount'] as int,
          state!['totalCount'] as int,
        );
      }
    } catch (e) {
      if (currentUserId() != uid) clear();
      // Even a role rejection can occur after an applied effect; keep its job.
      // Only a definitive start rejection with no committed job drops intent.
      if (attempt.jobId == null &&
          e is FirebaseFunctionsException &&
          [
            'invalid-argument',
            'permission-denied',
            'unauthenticated',
            'failed-precondition',
          ].contains(e.code)) {
        clear();
      }
      if (e is FirebaseFunctionsException &&
          e.code == 'failed-precondition' &&
          [
            'operation-expired',
            'The decision is no longer available.',
          ].contains(e.message)) {
        clear();
      }
      rethrow;
    }
  }

  Future<void> resume({
    required String userId,
    required String jobId,
    String? caseId,
    String? incarnation,
    void Function(int, int)? onProgress,
  }) async {
    if (!_hex(jobId)) throw const FormatException('Invalid moderation job');
    for (;;) {
      if (currentUserId() != userId) {
        throw StateError('The signed-in account changed.');
      }
      final result = await send('stepModerationCaseDecision', {
        'expectedUserId': userId,
        'jobId': jobId,
      });
      if (currentUserId() != userId) {
        throw StateError('The signed-in account changed.');
      }
      if (result['status'] == 'complete') {
        _pending.removeWhere(
          (scope, attempt) =>
              scope.$1 == userId &&
              (attempt.jobId == jobId ||
                  caseId == scope.$2 &&
                      incarnation != null &&
                      attempt.payload['expectedIncarnation'] == incarnation),
        );
        return;
      }
      if (result['status'] != 'processing' ||
          result['processedCount'] is! int ||
          result['totalCount'] is! int) {
        throw const FormatException('Invalid moderation progress');
      }
      onProgress?.call(
        result['processedCount'] as int,
        result['totalCount'] as int,
      );
    }
  }
}
