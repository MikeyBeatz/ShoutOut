import 'feed_news_runtime.dart';

/// Reattaches the committed page independently of an unfinished host refresh.
/// This owns no transport or timers; the existing runtime owns their lifecycle.
class FeedNewsBinding {
  FeedNewsBinding({
    required this.runtime,
    required this.signalsFor,
    this.onMissingContext,
  });

  final FeedNewsRuntime runtime;
  final FeedNewsSignals? Function(String? baseline) signalsFor;
  final void Function()? onMissingContext;
  String? _missingBaseline;

  void update({
    required String? baseline,
    required bool active,
    required bool loading,
    required bool expired,
    bool freshBaseline = false,
  }) {
    final signals = expired ? null : signalsFor(baseline);
    final canRun = active && !loading && signals != null;
    // Pause first: configuring a page during a refresh must not briefly open
    // subscriptions for a hidden/loading view. Resume can use this same page.
    if (!canRun) runtime.setActive(false);
    if (signals == null) {
      runtime.clear();
      if (!expired && baseline != null && baseline != _missingBaseline) {
        _missingBaseline = baseline;
        onMissingContext?.call();
      }
      return;
    }
    _missingBaseline = null;
    runtime.configure(signals);
    if (canRun) runtime.setActive(true, freshBaseline: freshBaseline);
  }
}
