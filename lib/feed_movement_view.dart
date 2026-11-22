import 'package:flutter/material.dart';

/// Movement viewport used by the enabled spatial feed.
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
    this.leadingSlivers = const [],
    this.trailingSlivers = const [],
    this.refreshRevision = 0,
    this.clipBehavior = Clip.hardEdge,
    this.onVisibleItem,
  });
  final List<T> items;
  final String Function(T) idOf;
  final Widget Function(T) card;
  final int revision;
  final ScrollController controller;
  final List<Widget> leadingSlivers, trailingSlivers;
  final int refreshRevision;
  final Clip clipBehavior;
  final ValueChanged<String?>? onVisibleItem;

  @override
  State<FeedMovementView<T>> createState() => _FeedMovementViewState<T>();
}

class _FeedMovementViewState<T> extends State<FeedMovementView<T>> {
  final _center = GlobalKey();
  final _cards = <String, GlobalKey>{};
  String? _anchor;
  int _layout = 0;
  bool _visibilityScheduled = false;
  final _mountedCards = <String>{};

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_scheduleVisibility);
  }

  void _scheduleVisibility() {
    if (!mounted || _visibilityScheduled || widget.onVisibleItem == null) {
      return;
    }
    _visibilityScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _visibilityScheduled = false;
      if (!mounted) return;
      final viewport = context.findRenderObject();
      if (viewport is! RenderBox || !viewport.hasSize) return;
      final top = viewport.localToGlobal(Offset.zero).dy,
          bottom = viewport.localToGlobal(Offset(0, viewport.size.height)).dy;
      String? visible;
      double? best;
      // Only mounted lazy children, not the full historical list on every frame.
      for (final id in _mountedCards) {
        final box = _cards[id]?.currentContext?.findRenderObject();
        if (box is! RenderBox || !box.attached || !box.hasSize) continue;
        final y = box.localToGlobal(Offset.zero).dy;
        if (y + box.size.height > top &&
            y < bottom &&
            (best == null || y > best)) {
          visible = id;
          best = y;
        }
      }
      widget.onVisibleItem?.call(visible);
    });
  }

  @override
  void dispose() {
    widget.controller.removeListener(_scheduleVisibility);
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant FeedMovementView<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_scheduleVisibility);
      widget.controller.addListener(_scheduleVisibility);
    }
    if (oldWidget.refreshRevision != widget.refreshRevision) {
      _anchor = null;
      ++_layout;
      return;
    }
    final ids = widget.items.map(widget.idOf).toSet();
    var appendedOnly = oldWidget.items.length <= widget.items.length;
    for (var i = 0; appendedOnly && i < oldWidget.items.length; i++) {
      appendedOnly =
          widget.idOf(oldWidget.items[i]) == widget.idOf(widget.items[i]);
    }
    if (!widget.controller.hasClients ||
        oldWidget.revision == widget.revision && appendedOnly) {
      return;
    }
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
    // Normalize the new center before layout. Keeping the old positive offset
    // here can make lazy slivers oscillate while estimating their new extent.
    // The measured card position, including concurrent later scrolling, is
    // restored in the same frame below.
    widget.controller.position.correctPixels(before == null ? 0 : top - before);
    final offset = widget.controller.offset, revision = ++_layout;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || revision != _layout || !widget.controller.hasClients) {
        return;
      }
      final box = _cards[candidate]?.currentContext?.findRenderObject();
      if (before != null && box is RenderBox && box.attached) {
        final scroll = widget.controller;
        final expectedY =
            before -
            (scroll.position.isScrollingNotifier.value
                ? scroll.offset - offset
                : 0);
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
    _scheduleVisibility();
    if (widget.items.isEmpty) {
      return CustomScrollView(
        controller: widget.controller,
        clipBehavior: widget.clipBehavior,
        slivers: [...widget.leadingSlivers, ...widget.trailingSlivers],
      );
    }
    var centerIndex = widget.items.indexWhere(
      (item) => widget.idOf(item) == _anchor,
    );
    if (centerIndex < 0) centerIndex = 0;
    Widget row(int index) {
      final item = widget.items[index], id = widget.idOf(item);
      return KeyedSubtree(
        key: _cards.putIfAbsent(id, GlobalKey.new),
        child: _MountedMovementCard(
          id: id,
          registry: _mountedCards,
          child: widget.card(item),
        ),
      );
    }

    final positions = {
      for (var i = 0; i < widget.items.length; i++)
        widget.idOf(widget.items[i]): i,
    };
    final keyPositions = {
      for (final entry in _cards.entries)
        if (positions.containsKey(entry.key))
          entry.value: positions[entry.key]!,
    };

    if (_anchor == null) {
      return CustomScrollView(
        controller: widget.controller,
        clipBehavior: widget.clipBehavior,
        center: _center,
        slivers: [
          SliverToBoxAdapter(key: _center, child: const SizedBox.shrink()),
          ...widget.leadingSlivers,
          SliverList.builder(
            key: const ValueKey('movement-initial'),
            itemCount: widget.items.length,
            findChildIndexCallback: (key) => keyPositions[key],
            itemBuilder: (_, index) => row(index),
          ),
          ...widget.trailingSlivers,
        ],
      );
    }
    return CustomScrollView(
      controller: widget.controller,
      clipBehavior: widget.clipBehavior,
      center: _center,
      slivers: [
        ...widget.leadingSlivers,
        SliverList.builder(
          key: const ValueKey('movement-before'),
          itemCount: centerIndex,
          findChildIndexCallback: (key) {
            final i = keyPositions[key];
            return i != null && i < centerIndex ? centerIndex - 1 - i : null;
          },
          itemBuilder: (_, index) => row(centerIndex - 1 - index),
        ),
        SliverToBoxAdapter(key: _center, child: row(centerIndex)),
        SliverList.builder(
          key: const ValueKey('movement-after'),
          itemCount: widget.items.length - centerIndex - 1,
          findChildIndexCallback: (key) {
            final i = keyPositions[key];
            return i != null && i > centerIndex ? i - centerIndex - 1 : null;
          },
          itemBuilder: (_, index) => row(centerIndex + 1 + index),
        ),
        ...widget.trailingSlivers,
      ],
    );
  }
}

class _MountedMovementCard extends StatefulWidget {
  const _MountedMovementCard({
    required this.id,
    required this.registry,
    required this.child,
  });
  final String id;
  final Set<String> registry;
  final Widget child;
  @override
  State<_MountedMovementCard> createState() => _MountedMovementCardState();
}

class _MountedMovementCardState extends State<_MountedMovementCard> {
  @override
  void initState() {
    super.initState();
    widget.registry.add(widget.id);
  }

  @override
  void dispose() {
    widget.registry.remove(widget.id);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
