import 'package:flutter/material.dart';

/// Prepared movement viewport. Not used by Home until movement activation.
/// A center sliver keeps a surviving visible card available for measurement,
/// even when a large number of variable-height cards enter above the viewport.
class FeedMovementView<T> extends StatefulWidget {
  const FeedMovementView({
    super.key,
    required this.items,
    required this.idOf,
    required this.card,
    required this.revision,
    required this.controller,
  });
  final List<T> items;
  final String Function(T) idOf;
  final Widget Function(T) card;
  final int revision;
  final ScrollController controller;

  @override
  State<FeedMovementView<T>> createState() => _FeedMovementViewState<T>();
}

class _FeedMovementViewState<T> extends State<FeedMovementView<T>> {
  final _center = GlobalKey();
  final _cards = <String, GlobalKey>{};
  String? _anchor;
  int _layout = 0;

  @override
  void didUpdateWidget(covariant FeedMovementView<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.revision == widget.revision ||
        !widget.controller.hasClients) {
      return;
    }
    final ids = widget.items.map(widget.idOf).toSet();
    final viewport = context.findRenderObject();
    if (viewport is! RenderBox || !viewport.hasSize) return;
    final top = viewport.localToGlobal(Offset.zero).dy;
    String? candidate;
    double? before;
    for (final item in oldWidget.items) {
      final id = oldWidget.idOf(item);
      if (!ids.contains(id)) continue;
      final box = _cards[id]?.currentContext?.findRenderObject();
      if (box is! RenderBox || !box.attached || !box.hasSize) continue;
      final y = box.localToGlobal(Offset.zero).dy;
      if (y + box.size.height > top) {
        candidate = id;
        before = y;
        break;
      }
    }
    _anchor =
        candidate ??
        (widget.items.isEmpty ? null : widget.idOf(widget.items.first));
    final offset = widget.controller.offset, revision = ++_layout;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || revision != _layout || !widget.controller.hasClients) {
        return;
      }
      final box = _cards[candidate]?.currentContext?.findRenderObject();
      if (before != null && box is RenderBox && box.attached) {
        final scroll = widget.controller;
        final expectedY = before - (scroll.offset - offset);
        final target =
            scroll.offset + box.localToGlobal(Offset.zero).dy - expectedY;
        scroll.jumpTo(
          target.clamp(
            scroll.position.minScrollExtent,
            scroll.position.maxScrollExtent,
          ),
        );
      }
      _cards.removeWhere((id, _) => !ids.contains(id));
    });
  }

  @override
  Widget build(BuildContext context) {
    if (widget.items.isEmpty) return const SizedBox.shrink();
    var centerIndex = widget.items.indexWhere(
      (item) => widget.idOf(item) == _anchor,
    );
    if (centerIndex < 0) centerIndex = 0;
    Widget row(int index) {
      final item = widget.items[index], id = widget.idOf(item);
      return KeyedSubtree(
        key: _cards.putIfAbsent(id, GlobalKey.new),
        child: widget.card(item),
      );
    }

    return CustomScrollView(
      controller: widget.controller,
      center: _center,
      slivers: [
        SliverList.builder(
          itemCount: centerIndex,
          itemBuilder: (_, index) => row(centerIndex - 1 - index),
        ),
        SliverToBoxAdapter(key: _center, child: row(centerIndex)),
        SliverList.builder(
          itemCount: widget.items.length - centerIndex - 1,
          itemBuilder: (_, index) => row(centerIndex + 1 + index),
        ),
      ],
    );
  }
}
