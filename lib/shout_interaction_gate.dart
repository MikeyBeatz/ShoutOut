import 'dart:async';

import 'package:flutter/widgets.dart';

/// One deadline timer per mounted view, with no polling or database reads.
/// The server remains authoritative if the device clock is wrong.
class ShoutInteractionGate extends StatefulWidget {
  const ShoutInteractionGate({
    super.key,
    required this.expiresAt,
    required this.enabled,
    required this.builder,
  });

  final DateTime expiresAt;
  final bool enabled;
  final Widget Function(BuildContext context, bool open) builder;

  @override
  State<ShoutInteractionGate> createState() => _ShoutInteractionGateState();
}

class _ShoutInteractionGateState extends State<ShoutInteractionGate>
    with WidgetsBindingObserver {
  Timer? _timer;
  bool _open = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _schedule();
  }

  void _schedule() {
    _timer?.cancel();
    final remaining = widget.expiresAt.difference(DateTime.now());
    _open = widget.enabled && remaining > Duration.zero;
    if (_open) {
      _timer = Timer(remaining, () {
        if (mounted) setState(() => _open = false);
      });
    }
  }

  @override
  void didUpdateWidget(covariant ShoutInteractionGate oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.expiresAt != oldWidget.expiresAt ||
        widget.enabled != oldWidget.enabled) {
      _schedule();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) setState(_schedule);
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, _open);
}
