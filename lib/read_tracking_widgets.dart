import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'read_exposure.dart';
import 'read_state_platform.dart';
import 'read_state_store.dart';
import 'read_tracking_controller.dart';

class ReadVisibility extends ChangeNotifier {
  int overlays = 0;
  final occluders = <Object, RenderBox? Function()>{};
  final animations = <Animation<double>>{};
  bool get transitioning => animations.any(
    (a) =>
        a.status == AnimationStatus.forward ||
        a.status == AnimationStatus.reverse,
  );
  void changed() => notifyListeners();
}

final readVisibility = ReadVisibility();

class ReadNavigationObserver extends NavigatorObserver {
  final _watched =
      <Route<dynamic>, (Animation<double>, AnimationStatusListener)>{};
  void clear() {
    for (final route in _watched.keys.toList()) {
      _remove(route);
    }
  }

  void _watch(Route<dynamic> route) {
    if (route is! TransitionRoute<dynamic> || _watched.containsKey(route)) {
      return;
    }
    final animation = route.animation;
    if (animation == null) return;
    void status(AnimationStatus _) => readVisibility.changed();
    _watched[route] = (animation, status);
    readVisibility.animations.add(animation);
    animation.addStatusListener(status);
  }

  void _remove(Route<dynamic> route) {
    final old = _watched.remove(route);
    if (old != null) {
      old.$1.removeStatusListener(old.$2);
      readVisibility.animations.remove(old.$1);
    }
    readVisibility.changed();
  }

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _watch(route);
    readVisibility.changed();
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    // Keep observing a leaving popup until its reverse animation is gone.
    if (route is TransitionRoute<dynamic>) {
      unawaited(route.completed.then((_) => _remove(route)));
    } else {
      _remove(route);
    }
    readVisibility.changed();
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _remove(route);
  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    if (oldRoute != null) _remove(oldRoute);
    if (newRoute != null) _watch(newRoute);
    readVisibility.changed();
  }
}

final readNavigationObserver = ReadNavigationObserver();

class ReadTrackingScope extends InheritedWidget {
  const ReadTrackingScope({
    super.key,
    required this.controller,
    required super.child,
  });
  final ReadTrackingController? controller;
  static ReadTrackingController? maybeOf(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<ReadTrackingScope>()
      ?.controller;
  @override
  bool updateShouldNotify(ReadTrackingScope oldWidget) =>
      controller != oldWidget.controller;
}

class ReadTrackingRoot extends StatefulWidget {
  const ReadTrackingRoot({
    super.key,
    required this.sessions,
    required this.child,
  });
  final ReadSessions sessions;
  final Widget child;
  @override
  State<ReadTrackingRoot> createState() => _ReadTrackingRootState();
}

class _ReadTrackingRootState extends State<ReadTrackingRoot>
    with WidgetsBindingObserver {
  final _messenger = GlobalKey<ScaffoldMessengerState>();
  ReadTrackingController? _observed;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    browserReadActivity.addListener(_syncActivity);
    widget.sessions.addListener(_changed);
    _changed();
  }

  void _changed() {
    _observed?.removeListener(_fault);
    _observed = widget.sessions.value;
    _observed?.addListener(_fault);
    _syncActivity();
  }

  void _syncActivity() => widget.sessions.setForeground(
    browserReadActivity.value &&
        WidgetsBinding.instance.lifecycleState != AppLifecycleState.paused &&
        WidgetsBinding.instance.lifecycleState != AppLifecycleState.hidden &&
        WidgetsBinding.instance.lifecycleState != AppLifecycleState.inactive,
  );

  @override
  void didUpdateWidget(ReadTrackingRoot oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.sessions != oldWidget.sessions) {
      oldWidget.sessions.removeListener(_changed);
      oldWidget.sessions.setForeground(false);
      widget.sessions.addListener(_changed);
      _changed();
    }
  }

  void _fault() {
    if (_observed?.storageFailed != true) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _observed?.storageFailed != true) return;
      final language = Localizations.localeOf(context).languageCode;
      _messenger.currentState?.showSnackBar(
        SnackBar(
          content: Text(_storageFailure[language] ?? _storageFailure['en']!),
        ),
      );
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _syncActivity();
    if (state == AppLifecycleState.resumed) {
      unawaited(_observed?.retry());
      unawaited(_observed?.prune());
      unawaited(maintainReadNamespaces().catchError((_) {}));
    }
  }

  @override
  void dispose() {
    widget.sessions.removeListener(_changed);
    browserReadActivity.removeListener(_syncActivity);
    widget.sessions.setForeground(false);
    _observed?.removeListener(_fault);
    WidgetsBinding.instance.removeObserver(this);
    readNavigationObserver.clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      ValueListenableBuilder<ReadTrackingController?>(
        valueListenable: widget.sessions,
        builder: (context, controller, child) => ReadTrackingScope(
          controller: controller,
          child: ScrollNotificationObserver(
            child: _ReadMessenger(key: _messenger, child: child!),
          ),
        ),
        child: widget.child,
      );
}

const _storageFailure = {
  'cs': 'Stav přečtení se nepodařilo uložit do zařízení. Zkus to znovu.',
  'en': 'Reading progress could not be saved on this device. Try again.',
  'de':
      'Der Lesestatus konnte auf diesem Gerät nicht gespeichert werden. Versuche es erneut.',
  'pl':
      'Nie udało się zapisać stanu przeczytania na tym urządzeniu. Spróbuj ponownie.',
  'sk': 'Stav prečítania sa nepodarilo uložiť do zariadenia. Skús to znova.',
  'uk':
      'Не вдалося зберегти стан прочитання на цьому пристрої. Спробуй ще раз.',
  'vi': 'Không thể lưu trạng thái đã đọc trên thiết bị này. Hãy thử lại.',
};

class _ReadMessenger extends ScaffoldMessenger {
  const _ReadMessenger({super.key, required super.child});
  @override
  ScaffoldMessengerState createState() => _ReadMessengerState();
}

class _ReadMessengerState extends ScaffoldMessengerState {
  final _pauses = <Object>{};
  void _pause(Future<Object?> closed) {
    final token = Object();
    _pauses.add(token);
    readVisibility.overlays++;
    readVisibility.changed();
    unawaited(
      closed.whenComplete(() {
        if (_pauses.remove(token)) {
          readVisibility.overlays--;
          readVisibility.changed();
        }
      }),
    );
  }

  @override
  void dispose() {
    readVisibility.overlays -= _pauses.length;
    _pauses.clear();
    readVisibility.changed();
    super.dispose();
  }

  @override
  ScaffoldFeatureController<SnackBar, SnackBarClosedReason> showSnackBar(
    SnackBar snackBar, {
    AnimationStyle? snackBarAnimationStyle,
  }) {
    final result = super.showSnackBar(
      snackBar,
      snackBarAnimationStyle: snackBarAnimationStyle,
    );
    _pause(result.closed);
    return result;
  }

  @override
  ScaffoldFeatureController<MaterialBanner, MaterialBannerClosedReason>
  showMaterialBanner(MaterialBanner materialBanner) {
    final result = super.showMaterialBanner(materialBanner);
    _pause(result.closed);
    return result;
  }
}

/// Register non-route floating UI which can cover the text underneath it.
class ReadOccluder extends StatefulWidget {
  const ReadOccluder({super.key, required this.child});
  final Widget child;
  @override
  State<ReadOccluder> createState() => _ReadOccluderState();
}

class _ReadOccluderState extends State<ReadOccluder> {
  @override
  void initState() {
    super.initState();
    readVisibility.occluders[this] = () =>
        context.findRenderObject() as RenderBox?;
  }

  @override
  void dispose() {
    readVisibility.occluders.remove(this);
    readVisibility.changed();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      _ReadPaintObserver(onPaint: readVisibility.changed, child: widget.child);
}

class ReadTrackedContent extends StatefulWidget {
  const ReadTrackedContent({
    super.key,
    required this.content,
    required this.title,
    required this.body,
    this.clock,
  });
  final ReadContent content;
  final Text title, body;
  final Duration Function()? clock;
  @override
  State<ReadTrackedContent> createState() => _ReadTrackedContentState();
}

class _ReadTrackedContentState extends State<ReadTrackedContent>
    with WidgetsBindingObserver {
  final _title = GlobalKey(), _body = GlobalKey();
  final _watch = Stopwatch()..start();
  FullContentExposure _exposure = FullContentExposure();
  ReadTrackingController? _controller;
  ScrollNotificationObserverState? _scrolls;
  Timer? _timer;
  bool _scheduled = false;
  Duration get _time => widget.clock?.call() ?? _watch.elapsed;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    readVisibility.addListener(_visibility);
    browserReadActivity.addListener(_visibility);
  }

  void _scroll(ScrollNotification _) => _schedule();
  void _visibility() {
    _invalidate();
    _schedule();
  }

  void _invalidate() {
    _timer?.cancel();
    _exposure.pause(_time);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final controller = ReadTrackingScope.maybeOf(context);
    if (_controller != controller) {
      _controller = controller;
      _exposure = FullContentExposure();
    }
    final scrolls = ScrollNotificationObserver.maybeOf(context);
    if (scrolls != _scrolls) {
      _scrolls?.removeListener(_scroll);
      _scrolls = scrolls;
      _scrolls?.addListener(_scroll);
    }
    unawaited(_controller?.load(widget.content));
    _schedule();
  }

  @override
  void didUpdateWidget(ReadTrackedContent oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.content.key != widget.content.key ||
        oldWidget.content.expiresAt != widget.content.expiresAt) {
      _exposure = FullContentExposure();
      unawaited(_controller?.load(widget.content));
    }
    _schedule();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _invalidate();
    if (state == AppLifecycleState.resumed) _schedule();
  }

  @override
  void didChangeMetrics() {
    _invalidate();
    _schedule();
  }

  void _schedule() {
    if (!mounted ||
        _scheduled ||
        _controller?.enabled != true ||
        _controller!.contains(widget.content)) {
      return;
    }
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduled = false;
      if (mounted) _sample();
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  RenderParagraph? _paragraph(GlobalKey key) {
    final render = key.currentContext?.findRenderObject();
    if (render is RenderParagraph) return render;
    RenderParagraph? result;
    void visit(RenderObject child) {
      if (child is RenderParagraph) {
        result ??= child;
      } else {
        child.visitChildren(visit);
      }
    }

    render?.visitChildren(visit);
    return result;
  }

  Rect _clip(RenderParagraph paragraph) {
    final media = MediaQuery.of(context);
    var clip = Rect.fromLTWH(
      0,
      0,
      media.size.width,
      (media.size.height - media.viewInsets.bottom).clamp(0, double.infinity),
    );
    RenderObject node = paragraph;
    while (node.parent != null) {
      final parent = node.parent!;
      if (parent is RenderOffstage && parent.offstage ||
          parent is RenderOpacity && parent.opacity < 1 ||
          parent is RenderAnimatedOpacity && parent.opacity.value < 1) {
        return Rect.zero;
      }
      final local = parent is RenderClipRect
          ? parent.clipBehavior == Clip.none
                ? null
                : parent.clipper?.getClip(parent.size) ??
                      (Offset.zero & parent.size)
          : parent is RenderClipRRect && parent.clipBehavior != Clip.none
          ? (parent.clipper?.getClip(parent.size) ??
                    parent.borderRadius
                        .resolve(parent.textDirection)
                        .toRRect(Offset.zero & parent.size))
                .safeInnerRect
          : parent.describeApproximatePaintClip(node);
      if (local != null) {
        clip = clip.intersect(
          MatrixUtils.transformRect(parent.getTransformTo(null), local),
        );
      }
      node = parent;
    }
    return clip;
  }

  List<(Path, Matrix4)>? _shapeClips(RenderParagraph paragraph) {
    final result = <(Path, Matrix4)>[];
    RenderObject node = paragraph;
    while (node.parent != null) {
      final parent = node.parent!;
      Path? path;
      CustomClipper<Path>? clipper;
      if (parent is RenderClipPath && parent.clipBehavior != Clip.none) {
        clipper = parent.clipper;
      } else if (parent is RenderPhysicalShape &&
          parent.clipBehavior != Clip.none) {
        clipper = parent.clipper;
      } else if (parent is RenderClipOval && parent.clipBehavior != Clip.none) {
        path = Path()
          ..addOval(
            parent.clipper?.getClip(parent.size) ?? (Offset.zero & parent.size),
          );
      } else if (parent is RenderPhysicalModel &&
          parent.clipBehavior != Clip.none) {
        path = Path();
        if (parent.shape == BoxShape.circle) {
          path.addOval(Offset.zero & parent.size);
        } else {
          path.addRRect(
            (parent.borderRadius ?? BorderRadius.zero).toRRect(
              Offset.zero & parent.size,
            ),
          );
        }
      }
      if (clipper != null) {
        // Corners suffice only for a known convex boundary. An arbitrary
        // custom path can contain holes despite a full approximate clip rect.
        if (clipper is! ShapeBorderClipper) return null;
        final shape = clipper.shape;
        if (!(shape is RoundedRectangleBorder ||
            shape is RoundedSuperellipseBorder ||
            shape is BeveledRectangleBorder ||
            shape is ContinuousRectangleBorder ||
            shape is StadiumBorder ||
            shape is CircleBorder ||
            shape is OvalBorder)) {
          return null;
        }
        path = clipper.getClip((parent as RenderBox).size);
      }
      if (path != null) result.add((path, paragraph.getTransformTo(parent)));
      node = parent;
    }
    return result;
  }

  void _sample() {
    _timer?.cancel();
    if (_controller?.enabled != true || _controller!.contains(widget.content)) {
      return;
    }
    final route = ModalRoute.of(context),
        lifecycle = WidgetsBinding.instance.lifecycleState;
    if ((route != null && !route.isCurrent) ||
        readVisibility.transitioning ||
        readVisibility.overlays > 0 ||
        !TickerMode.valuesOf(context).enabled ||
        !browserReadActivity.value ||
        (lifecycle != null && lifecycle != AppLifecycleState.resumed)) {
      _invalidate();
      return;
    }
    final paragraphs = [_paragraph(_title), _paragraph(_body)];
    if (paragraphs.any(
      (p) => p == null || !p.attached || !p.hasSize || p.didExceedMaxLines,
    )) {
      _invalidate();
      return;
    }
    final visible = <ContentSlice>[], layout = <Object>[widget.content.key];
    var extent = 0.0;
    final occlusions = readVisibility.occluders.values
        .map((getBox) => getBox())
        .whereType<RenderBox>()
        .where((box) => box.attached && box.hasSize)
        .map(
          (box) => MatrixUtils.transformRect(
            box.getTransformTo(null),
            Offset.zero & box.size,
          ),
        )
        .toList();
    for (final paragraph in paragraphs.cast<RenderParagraph>()) {
      final boxes = paragraph.getBoxesForSelection(
        TextSelection(
          baseOffset: 0,
          extentOffset: paragraph.text.toPlainText().length,
        ),
      );
      final transform = paragraph.getTransformTo(null), clip = _clip(paragraph);
      final shapes = _shapeClips(paragraph);
      layout.addAll([
        paragraph.size,
        paragraph.textScaler,
        paragraph.text.style ?? '',
      ]);
      for (final box in boxes) {
        final local = box.toRect();
        if (local.isEmpty) continue;
        layout.add(local);
        final global = MatrixUtils.transformRect(transform, local);
        if (!clip.isEmpty &&
            clip.left <= global.left + .001 &&
            clip.top <= global.top + .001 &&
            clip.right >= global.right - .001 &&
            clip.bottom >= global.bottom - .001 &&
            shapes != null &&
            shapes.every((shape) {
              final rect = MatrixUtils.transformRect(
                shape.$2,
                local,
              ).deflate(.001);
              return [
                rect.topLeft,
                rect.topRight,
                rect.bottomLeft,
                rect.bottomRight,
              ].every(shape.$1.contains);
            }) &&
            !occlusions.any((r) => r.overlaps(global))) {
          visible.add(ContentSlice(extent, extent + 1));
        }
        extent++;
      }
    }
    if (extent == 0) {
      _invalidate();
      return;
    }
    if (_exposure.observe(
      time: _time,
      layout: layout.join('|'),
      extent: extent,
      visible: visible,
      active: true,
      fullContentRendered: true,
    )) {
      _controller!.mark(widget.content);
      return;
    }
    final due = _exposure.untilNextQualification;
    if (due != null) {
      _timer = Timer(
        due < const Duration(milliseconds: 1)
            ? const Duration(milliseconds: 1)
            : due,
        _schedule,
      );
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _scrolls?.removeListener(_scroll);
    readVisibility.removeListener(_visibility);
    browserReadActivity.removeListener(_visibility);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _ReadPaintObserver(
    onPaint: _schedule,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        KeyedSubtree(key: _title, child: widget.title),
        const SizedBox(height: 6),
        KeyedSubtree(key: _body, child: widget.body),
      ],
    ),
  );
}

class _ReadPaintObserver extends SingleChildRenderObjectWidget {
  const _ReadPaintObserver({required this.onPaint, required super.child});
  final VoidCallback onPaint;
  @override
  RenderObject createRenderObject(BuildContext context) =>
      _ReadPaintBox(onPaint);
  @override
  void updateRenderObject(BuildContext context, _ReadPaintBox renderObject) =>
      renderObject.onPaint = onPaint;
}

class _ReadPaintBox extends RenderProxyBox {
  _ReadPaintBox(this.onPaint);
  VoidCallback onPaint;
  @override
  void paint(PaintingContext context, Offset offset) {
    super.paint(context, offset);
    onPaint();
  }
}
