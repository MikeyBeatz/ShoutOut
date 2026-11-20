import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

// B4a laboratory core: deliberately not imported by the active feed gateway.
String canonicalFeedBody(Object? value) {
  if (value == null || value is String || value is bool || value is int) {
    return jsonEncode(value);
  }
  if (value is double && value.isFinite && value == value.truncateToDouble()) {
    return jsonEncode(value.toInt());
  }
  if (value is double && value.isFinite) return jsonEncode(value);
  if (value is List) return '[${value.map(canonicalFeedBody).join(',')}]';
  if (value is Map<String, dynamic>) {
    final keys = value.keys.toList()..sort();
    return '{${keys.map((key) => '${jsonEncode(key)}:${canonicalFeedBody(value[key])}').join(',')}}';
  }
  throw const FormatException('Unsupported feed body value');
}

Object _identityTokens(Object? value) {
  if (value == null) return ['null'];
  if (value is num && value.isFinite) {
    final bytes = ByteData(8)..setFloat64(0, value == 0 ? 0 : value.toDouble());
    final hex = bytes.buffer
        .asUint8List()
        .map((b) => b.toRadixString(16).padLeft(2, '0'))
        .join();
    return ['number', hex];
  }
  if (value is String) return ['string', value];
  if (value is bool) return ['boolean', value];
  if (value is List) return ['array', value.map(_identityTokens).toList()];
  if (value is Map<String, dynamic>) {
    final keys = value.keys.toList()..sort();
    return [
      'object',
      keys.map((k) => [k, _identityTokens(value[k])]).toList(),
    ];
  }
  throw const FormatException('Unsupported feed identity value');
}

String feedBodyVersion(Map<String, dynamic> body) => sha256
    .convert(
      utf8.encode(
        canonicalFeedBody(_identityTokens({'schema': 1, 'body': body})),
      ),
    )
    .toString();

class FeedBodyScope {
  const FeedBodyScope(this.project, this.uid);
  final String project;
  final String uid;
  @override
  bool operator ==(Object other) =>
      other is FeedBodyScope && other.project == project && other.uid == uid;
  @override
  int get hashCode => Object.hash(project, uid);
}

class FeedBodyDescriptor {
  FeedBodyDescriptor({
    required this.id,
    required this.version,
    required this.read,
    this.distanceKm,
    this.selectionVersion,
    this.frozenContentHash,
    required Map<String, dynamic> state,
  }) : state = jsonEncode(state);
  final String id;
  final String version;
  final bool read;
  final double? distanceKm;
  final String? selectionVersion;
  final String? frozenContentHash;
  // Serialized copies prevent caller mutation of validated state.
  final String state;
  Map<String, dynamic> get stateData =>
      jsonDecode(state) as Map<String, dynamic>;
}

class FeedBodyPayload {
  FeedBodyPayload(this.id, this.version, Map<String, dynamic> body)
    : encoded = canonicalFeedBody(body);
  final String id;
  final String version;
  final String encoded;
  Map<String, dynamic> get body => jsonDecode(encoded) as Map<String, dynamic>;
  void validate() {
    if (feedBodyVersion(body) != version) {
      throw const FormatException('Feed body hash mismatch');
    }
  }
}

class _CachedBody {
  _CachedBody(this.payload, this.until, this.bytes);
  final FeedBodyPayload payload;
  final int until;
  final int bytes;
}

/// RAM only. Eviction cannot alter already assembled/frozen cards.
class FeedBodyCache {
  FeedBodyCache({
    required this.clock,
    this.maximumBytes = 4 * 1024 * 1024,
    this.maximumAgeMillis = 3600000,
  }) {
    if (maximumBytes < 1 ||
        maximumAgeMillis < 1 ||
        maximumAgeMillis > 3600000) {
      throw ArgumentError('Invalid body cache budget');
    }
  }
  final int Function() clock;
  final int maximumBytes;
  final int maximumAgeMillis;
  final _entries = <String, _CachedBody>{};
  FeedBodyScope? _scope;
  int _bytes = 0;
  int _epoch = 0;
  int _lastClock = -1;
  int get bytes => _bytes;
  int get epoch => _epoch;
  FeedBodyScope? get scope => _scope;

  int _now() {
    final now = clock();
    if (now < _lastClock) {
      clear(); // Clock rollback must not extend cached authorization context.
    }
    _lastClock = now;
    return now;
  }

  void bind(FeedBodyScope? scope) {
    if (_scope != scope) {
      clear();
      _scope = scope;
    }
  }

  void clear() {
    _entries.clear();
    _bytes = 0;
    _epoch++;
  }

  FeedBodyPayload? get(FeedBodyScope scope, String id, String version) {
    final now = _now();
    if (_scope != scope) throw StateError('Foreign body cache scope');
    final entry = _entries.remove(id);
    if (entry == null) return null;
    _bytes -= entry.bytes;
    if (now >= entry.until || entry.payload.version != version) return null;
    entry.payload.validate();
    _entries[id] = entry;
    _bytes += entry.bytes;
    return entry.payload;
  }

  void put(FeedBodyScope scope, FeedBodyPayload payload, int deadline) {
    payload.validate();
    final now = _now();
    if (_scope != scope) throw StateError('Foreign body cache scope');
    final old = _entries.remove(payload.id);
    if (old != null) _bytes -= old.bytes;
    final size =
        utf8.encode(payload.encoded).length +
        utf8.encode(payload.id).length +
        64;
    if (size > maximumBytes || deadline <= now) return;
    while (_bytes + size > maximumBytes && _entries.isNotEmpty) {
      _bytes -= _entries.remove(_entries.keys.first)!.bytes;
    }
    final until = [
      deadline,
      now + maximumAgeMillis,
      if (old != null &&
          old.until > now &&
          old.payload.version == payload.version)
        old.until,
    ].reduce((a, b) => a < b ? a : b);
    _entries[payload.id] = _CachedBody(payload, until, size);
    _bytes += size;
  }
}

class FeedBodyPage {
  FeedBodyPage({
    required this.scope,
    required this.context,
    required this.deadline,
    required this.token,
    this.unreadFirst = false,
    this.generation = '',
    this.incarnation = '',
    required List<FeedBodyDescriptor> rows,
    List<FeedBodyPayload> bodies = const [],
  }) : rows = List.unmodifiable(rows),
       bodies = List.unmodifiable(bodies);
  final FeedBodyScope scope;
  final String context;
  final int deadline;
  final String token;
  final bool unreadFirst;
  final String generation;
  final String incarnation;
  final List<FeedBodyDescriptor> rows;
  final List<FeedBodyPayload> bodies;

  factory FeedBodyPage.fromWire(Map<String, dynamic> wire) {
    bool text(String key) =>
        wire[key] is String && (wire[key] as String).isNotEmpty;
    if (wire['schema'] != 1 ||
        wire['expiresAt'] is! int ||
        wire['unreadFirst'] is! bool ||
        ![
          'project',
          'uid',
          'context',
          'generation',
          'incarnation',
          'token',
        ].every(text) ||
        wire['rows'] is! List ||
        wire['bodies'] is! List ||
        (wire['rows'] as List).length > 50 ||
        (wire['bodies'] as List).length > 50) {
      throw const FormatException('Invalid body page envelope');
    }
    return FeedBodyPage(
      scope: FeedBodyScope(wire['project'] as String, wire['uid'] as String),
      context: wire['context'] as String,
      deadline: wire['expiresAt'] as int,
      token: wire['token'] as String,
      unreadFirst: wire['unreadFirst'] as bool,
      generation: wire['generation'] as String,
      incarnation: wire['incarnation'] as String,
      rows: (wire['rows'] as List)
          .map((value) {
            if (value is! Map<String, dynamic> ||
                value['id'] is! String ||
                value['bodyVersion'] is! String ||
                value['read'] is! bool ||
                value['state'] is! Map<String, dynamic>) {
              throw const FormatException('Invalid body page row');
            }
            final distance = value['distanceKm'];
            if (distance != null &&
                (distance is! num || !distance.isFinite || distance < 0)) {
              throw const FormatException('Invalid body page distance');
            }
            for (final key in ['selectionVersion', 'frozenContentHash']) {
              final identity = value[key];
              if (identity != null &&
                  (identity is! String ||
                      !RegExp(r'^[a-f0-9]{64}$').hasMatch(identity))) {
                throw const FormatException('Invalid body selection identity');
              }
            }
            return FeedBodyDescriptor(
              id: value['id'] as String,
              version: value['bodyVersion'] as String,
              read: value['read'] as bool,
              distanceKm: (distance as num?)?.toDouble(),
              selectionVersion: value['selectionVersion'] as String?,
              frozenContentHash: value['frozenContentHash'] as String?,
              state: value['state'] as Map<String, dynamic>,
            );
          })
          .toList(growable: false),
      bodies: (wire['bodies'] as List)
          .map((value) {
            if (value is! Map<String, dynamic> ||
                value['id'] is! String ||
                value['bodyVersion'] is! String ||
                value['body'] is! Map<String, dynamic>) {
              throw const FormatException('Invalid body page payload');
            }
            return FeedBodyPayload(
              value['id'] as String,
              value['bodyVersion'] as String,
              value['body'] as Map<String, dynamic>,
            );
          })
          .toList(growable: false),
    );
  }
}

class FeedBodyCard {
  const FeedBodyCard(this.descriptor, this.payload);
  final FeedBodyDescriptor descriptor;
  final FeedBodyPayload payload;
}

/// A failed/late response never yields a partially assembled page. Transport
/// hosts must bind the signed proof to the same generation and feed context.
class FeedBodyPageAssembler {
  FeedBodyPageAssembler(this.cache);
  final FeedBodyCache cache;
  int _request = 0;
  bool _disposed = false;
  void cancel() => _request++;
  void dispose() {
    _disposed = true;
    cancel();
    cache.bind(null);
  }

  void _validate(FeedBodyPage page) {
    if (page.rows.length > 50 ||
        page.rows.map((row) => row.id).toSet().length != page.rows.length) {
      throw const FormatException('Invalid body page size');
    }
    var read = false;
    for (final row in page.rows) {
      final state = row.stateData;
      if (!RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(row.id) ||
          !RegExp(r'^[a-f0-9]{64}$').hasMatch(row.version) ||
          state['bodyVersion'] != row.version ||
          state['status'] != 'active' ||
          state['expiresAt'] is! num ||
          !(state['expiresAt'] as num).isFinite ||
          (state['expiresAt'] as num) <= cache.clock() ||
          (page.unreadFirst && read && !row.read)) {
        throw const FormatException('Invalid body descriptor');
      }
      read |= row.read;
    }
  }

  Future<List<FeedBodyCard>> assemble(
    FeedBodyPage selected, {
    required Future<FeedBodyPage> Function(String token, List<String> missing)
    complete,
  }) async {
    final request = ++_request, epoch = cache.epoch;
    void guard() {
      if (_disposed ||
          request != _request ||
          epoch != cache.epoch ||
          selected.scope != cache.scope ||
          cache.clock() >= selected.deadline) {
        throw StateError('Stale feed body response');
      }
    }

    guard();
    _validate(selected);
    final available = <String, FeedBodyPayload>{};
    void take(List<FeedBodyPayload> bodies) {
      for (final body in bodies) {
        final rows = selected.rows.where((row) => row.id == body.id);
        if (rows.isEmpty ||
            rows.single.version != body.version ||
            available.containsKey(body.id)) {
          throw const FormatException('Unexpected body response');
        }
        body.validate();
        available[body.id] = body;
      }
    }

    take(selected.bodies);
    for (final row in selected.rows) {
      if (!available.containsKey(row.id)) {
        final cached = cache.get(selected.scope, row.id, row.version);
        if (cached != null) available[row.id] = cached;
      }
    }
    guard();
    final missing = selected.rows
        .where((row) => !available.containsKey(row.id))
        .map((row) => row.id)
        .toList(growable: false);
    var result = selected;
    if (missing.isNotEmpty) {
      result = await complete(selected.token, List.unmodifiable(missing));
      guard();
      _validate(result);
      if (result.scope != selected.scope ||
          result.context != selected.context ||
          result.deadline != selected.deadline ||
          result.token != selected.token ||
          result.unreadFirst != selected.unreadFirst ||
          result.generation != selected.generation ||
          result.incarnation != selected.incarnation ||
          result.rows.length != selected.rows.length) {
        throw const FormatException('Changed body selection');
      }
      for (var i = 0; i < result.rows.length; i++) {
        final a = selected.rows[i], b = result.rows[i];
        if (a.id != b.id ||
            a.version != b.version ||
            a.read != b.read ||
            a.distanceKm != b.distanceKm ||
            a.selectionVersion != b.selectionVersion ||
            a.frozenContentHash != b.frozenContentHash) {
          throw const FormatException('Changed body order');
        }
      }
      take(result.bodies);
    }
    if (available.length != selected.rows.length) {
      throw const FormatException('Incomplete body response');
    }
    guard();
    final cards = List<FeedBodyCard>.unmodifiable(
      result.rows.map((row) => FeedBodyCard(row, available[row.id]!)),
    );
    for (final card in cards) {
      cache.put(selected.scope, card.payload, selected.deadline);
    }
    return cards;
  }
}
