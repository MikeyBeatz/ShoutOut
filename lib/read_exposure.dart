/// Full-content coverage only. Storage, identity and UI geometry are separate.
/// A caller must report lifecycle/route occlusion and unexpanded/truncated text.
class ContentSlice {
  const ContentSlice(this.start, this.end);
  final double start;
  final double end;
}

class _ExposureSlice extends ContentSlice {
  const _ExposureSlice(super.start, super.end, this.since);
  final Duration since;
}

class FullContentExposure {
  static const minimumExposure = Duration(seconds: 1);
  static const _epsilon = 0.000001;
  Object? _layout;
  double? _extent;
  Duration? _lastTime;
  List<_ExposureSlice> _visible = [];
  List<ContentSlice> _covered = [];
  bool _complete = false;

  bool get isComplete => _complete;

  /// Coordinates are relative to the entire relevant content, never viewport
  /// percentages. One layout key denotes one text/font/width arrangement.
  bool observe({
    required Duration time,
    required Object layout,
    required double extent,
    required List<ContentSlice> visible,
    required bool active,
    required bool fullContentRendered,
  }) {
    if (time.isNegative ||
        (_lastTime != null && time < _lastTime!) ||
        !extent.isFinite ||
        extent <= 0 ||
        visible.any(
          (slice) =>
              !slice.start.isFinite ||
              !slice.end.isFinite ||
              slice.start < 0 ||
              slice.end > extent ||
              slice.start > slice.end,
        )) {
      throw ArgumentError('Invalid content exposure observation.');
    }
    _lastTime = time;
    if (_complete) return true;
    if (_layout != layout || _extent != extent) {
      _layout = layout;
      _extent = extent;
      _visible = [];
      _covered = [];
    }
    if (!active || !fullContentRendered) {
      _visible = [];
      return false;
    }
    final current = _merge(visible), qualified = <ContentSlice>[];
    final continuing = <_ExposureSlice>[];
    for (final slice in current) {
      final cuts = <double>{slice.start, slice.end};
      for (final previous in _visible) {
        if (previous.start > slice.start && previous.start < slice.end) {
          cuts.add(previous.start);
        }
        if (previous.end > slice.start && previous.end < slice.end) {
          cuts.add(previous.end);
        }
      }
      final points = cuts.toList()..sort();
      for (var i = 0; i + 1 < points.length; i++) {
        final start = points[i], end = points[i + 1];
        var since = time;
        for (final previous in _visible) {
          if (previous.start <= start && previous.end >= end) {
            since = previous.since;
            break;
          }
        }
        if (time - since >= minimumExposure) {
          qualified.add(ContentSlice(start, end));
        }
        continuing.add(_ExposureSlice(start, end, since));
      }
    }
    _covered = _merge([..._covered, ...qualified]);
    // Already qualified points need no timers. This bounds the moving frontier
    // rather than keeping every historical scroll/sample boundary indefinitely.
    _visible = [];
    for (final slice in continuing) {
      var pieces = <ContentSlice>[slice];
      for (final covered in _covered) {
        pieces = [for (final piece in pieces) ..._subtract(piece, covered)];
      }
      for (final piece in pieces) {
        if (_visible.isNotEmpty &&
            _visible.last.end == piece.start &&
            _visible.last.since == slice.since) {
          final last = _visible.removeLast();
          _visible.add(_ExposureSlice(last.start, piece.end, slice.since));
        } else {
          _visible.add(_ExposureSlice(piece.start, piece.end, slice.since));
        }
      }
    }
    _complete =
        _covered.length == 1 &&
        _covered.single.start <= _epsilon &&
        _covered.single.end >= extent - _epsilon;
    return _complete;
  }

  static List<ContentSlice> _subtract(
    ContentSlice slice,
    ContentSlice covered,
  ) {
    if (covered.end <= slice.start || covered.start >= slice.end) {
      return [slice];
    }
    return [
      if (slice.start < covered.start) ContentSlice(slice.start, covered.start),
      if (slice.end > covered.end) ContentSlice(covered.end, slice.end),
    ];
  }

  static List<ContentSlice> _merge(List<ContentSlice> slices) {
    final ordered = slices.where((slice) => slice.end > slice.start).toList()
      ..sort((a, b) => a.start.compareTo(b.start));
    final result = <ContentSlice>[];
    for (final slice in ordered) {
      if (result.isNotEmpty && slice.start <= result.last.end) {
        final last = result.removeLast();
        result.add(
          ContentSlice(last.start, slice.end > last.end ? slice.end : last.end),
        );
      } else {
        result.add(slice);
      }
    }
    return result;
  }
}
