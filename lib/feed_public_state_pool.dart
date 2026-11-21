import 'dart:async';

/// Reuses an authoritative promo query row for an already visible card/detail.
/// A row leaving the bounded query falls back to its individual document.
class FeedPublicStatePool {
  FeedPublicStatePool(this.fallback);
  final Stream<Map<String, dynamic>?> Function(String, String) fallback;
  final _changes = StreamController<void>.broadcast(sync: true);
  String? _stamp;
  Map<String, Map<String, dynamic>> _rows = {};
  void publish(String? stamp, Map<String, Map<String, dynamic>> rows) {
    _stamp = stamp;
    _rows = Map.unmodifiable(rows);
    _changes.add(null);
  }

  Stream<Map<String, dynamic>?> watch(String stamp, String id) =>
      Stream.multi((output) {
        StreamSubscription<Map<String, dynamic>?>? source;
        var disposed = false, binding = 0;
        Future<void> update() async {
          final attempt = ++binding;
          if (_stamp == stamp && _rows.containsKey(id)) {
            final previous = source;
            source = null;
            await previous?.cancel();
            if (!disposed && attempt == binding) output.add(_rows[id]);
          } else if (source == null && !disposed) {
            source = fallback(stamp, id).listen(
              (value) {
                if (!disposed && !(_stamp == stamp && _rows.containsKey(id))) {
                  output.add(value);
                }
              },
              onError: (Object error, StackTrace stack) {
                if (!disposed && !(_stamp == stamp && _rows.containsKey(id))) {
                  output.addError(error, stack);
                }
              },
            );
          }
        }

        void refresh() => unawaited(
          update().catchError((Object error, StackTrace stack) {
            if (!disposed) output.addError(error, stack);
          }),
        );
        final changes = _changes.stream.listen((_) => refresh());
        refresh();
        output.onCancel = () async {
          disposed = true;
          binding++;
          await changes.cancel();
          await source?.cancel();
        };
      });
}
