import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/read_state_store.dart';
import 'package:shoutout/read_tracking_controller.dart';
import 'package:shoutout/read_tracking_widgets.dart';

class NarrowClip extends CustomClipper<Rect> {
  @override
  Rect getClip(Size size) => Rect.fromLTWH(0, 0, 10, size.height);
  @override
  bool shouldReclip(NarrowClip oldClipper) => false;
}

void main() {
  late ReadTrackingController controller;
  late MemoryReadStateStore store;
  late ReadContent content;
  setUp(() {
    final scope = ReadScope('dev', 'reader');
    store = MemoryReadStateStore(scope);
    controller = ReadTrackingController(scope, store);
    content = ReadContent(
      shoutId: 'fixture',
      title: 'Title',
      text: 'Body',
      expiresAt: DateTime.now().add(const Duration(days: 1)),
    );
  });
  tearDown(() {
    controller.dispose();
  });
  Widget harness(
    WidgetTester tester, {
    String? text,
    int? maxLines,
    ScrollController? scroll,
    Widget Function(Widget)? wrap,
    double width = 300,
    double height = 220,
    List<NavigatorObserver> observers = const [],
    GlobalKey<NavigatorState>? navigator,
  }) {
    final epoch = tester.binding.clock.now();
    Widget tracked = ReadTrackedContent(
      content: content,
      clock: () => tester.binding.clock.now().difference(epoch),
      title: const Text('Title'),
      body: Text(
        text ?? 'Body',
        maxLines: maxLines,
        overflow: maxLines == null ? TextOverflow.clip : TextOverflow.ellipsis,
      ),
    );
    if (wrap != null) tracked = wrap(tracked);
    return MaterialApp(
      navigatorKey: navigator,
      navigatorObservers: observers,
      builder: (_, child) => ReadTrackingScope(
        controller: controller,
        child: ScrollNotificationObserver(child: child!),
      ),
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: width,
            height: height,
            child: ListView(controller: scroll, children: [tracked]),
          ),
        ),
      ),
    );
  }

  testWidgets(
    'short rendered title and body qualify at one second, not before',
    (tester) async {
      await tester.pumpWidget(harness(tester));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 999));
      expect(controller.contains(content), isFalse);
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pump();
      expect(controller.contains(content), isTrue);
      expect(store.rows.length, 1);
    },
  );
  testWidgets(
    'an ellipsized body never qualifies just because its card is visible',
    (tester) async {
      await tester.pumpWidget(
        harness(
          tester,
          text: List.filled(30, 'Hidden lines of text').join('\n'),
          maxLines: 3,
        ),
      );
      await tester.pump(const Duration(seconds: 3));
      expect(store.rows, isEmpty);
    },
  );
  testWidgets(
    'long text requires the entire scroll range including its last line',
    (tester) async {
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      await tester.pumpWidget(
        harness(
          tester,
          text: List.generate(35, (i) => 'Line $i').join('\n'),
          scroll: scroll,
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(store.rows, isEmpty);
      final max = scroll.position.maxScrollExtent;
      for (var offset = 100.0; offset < max + 100; offset += 100) {
        scroll.jumpTo(math.min(offset, max));
        await tester.pump();
        await tester.pump(const Duration(seconds: 1));
        await tester.pump();
      }
      expect(controller.contains(content), isTrue);
    },
  );
  testWidgets(
    'fast scrolling cannot count intervening text as one second of coverage',
    (tester) async {
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      await tester.pumpWidget(
        harness(
          tester,
          text: List.filled(35, 'Quickly skipped').join('\n'),
          scroll: scroll,
        ),
      );
      await tester.pump();
      scroll.jumpTo(scroll.position.maxScrollExtent);
      await tester.pump();
      await tester.pump(const Duration(seconds: 2));
      expect(store.rows, isEmpty);
    },
  );
  testWidgets('offstage text and a floating occluder do not qualify', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(tester, wrap: (child) => Offstage(child: child)),
    );
    await tester.pump(const Duration(seconds: 2));
    expect(store.rows, isEmpty);
    await tester.pumpWidget(
      harness(
        tester,
        wrap: (child) => Stack(
          children: [
            child,
            const Positioned.fill(
              child: ReadOccluder(child: ColoredBox(color: Colors.red)),
            ),
          ],
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 2));
    expect(store.rows, isEmpty);
  });
  testWidgets('inactive application cancels the pending second', (
    tester,
  ) async {
    await tester.pumpWidget(harness(tester));
    await tester.pump(const Duration(milliseconds: 600));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump(const Duration(seconds: 2));
    expect(store.rows, isEmpty);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 999));
    expect(store.rows, isEmpty);
    await tester.pump(const Duration(milliseconds: 1));
    await tester.pump();
    expect(store.rows.length, 1);
  });
  testWidgets(
    'a modal route suspends covered text, including its reverse animation',
    (tester) async {
      final navigator = GlobalKey<NavigatorState>(),
          observer = ReadNavigationObserver();
      await tester.pumpWidget(
        harness(tester, navigator: navigator, observers: [observer]),
      );
      await tester.pump(const Duration(milliseconds: 600));
      final dialog = showDialog<void>(
        context: navigator.currentContext!,
        builder: (_) => const AlertDialog(content: Text('Overlay')),
      );
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 2));
      expect(store.rows, isEmpty);
      navigator.currentState!.pop();
      await tester.pumpAndSettle();
      await dialog;
      await tester.pump(const Duration(milliseconds: 999));
      expect(store.rows, isEmpty);
      await tester.pump(const Duration(milliseconds: 10));
      await tester.pump();
      expect(store.rows.length, 1);
    },
  );
  testWidgets(
    'disposal cancels the delayed completion and all exposure timers',
    (tester) async {
      await tester.pumpWidget(harness(tester));
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 2));
      expect(store.rows, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'horizontal clipping prevents completion even when every line height is visible',
    (tester) async {
      await tester.pumpWidget(
        harness(
          tester,
          wrap: (child) => ClipRect(clipper: NarrowClip(), child: child),
        ),
      );
      await tester.pump(const Duration(seconds: 2));
      expect(store.rows, isEmpty);
    },
  );

  testWidgets(
    'large text and RTL layouts still qualify only with the actual full text visible',
    (tester) async {
      await tester.pumpWidget(
        harness(
          tester,
          width: 500,
          height: 450,
          text: 'שלום עולם',
          wrap: (child) => MediaQuery(
            data: const MediaQueryData(
              size: Size(800, 600),
              textScaler: TextScaler.linear(2),
            ),
            child: Directionality(
              textDirection: TextDirection.rtl,
              child: child,
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      expect(controller.contains(content), isTrue);
    },
  );

  testWidgets(
    'the actual Material card clip still allows the padded complete text',
    (tester) async {
      await tester.pumpWidget(
        harness(
          tester,
          wrap: (child) => Card(
            clipBehavior: Clip.antiAlias,
            child: Padding(padding: const EdgeInsets.all(16), child: child),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      expect(controller.contains(content), isTrue);
    },
  );

  testWidgets(
    'snackbars pause exposure and root disposal releases outstanding overlay locks',
    (tester) async {
      final sessions = ReadSessions(
        storeFactory: (scope) => MemoryReadStateStore(scope),
      );
      sessions.configure('dev');
      sessions.retainViewer('reader');
      controller.dispose();
      controller = sessions.value!;
      store = controller.store as MemoryReadStateStore;
      final epoch = tester.binding.clock.now();
      final key = GlobalKey();
      await tester.pumpWidget(
        MaterialApp(
          builder: (_, child) =>
              ReadTrackingRoot(sessions: sessions, child: child!),
          home: Scaffold(
            body: Builder(
              key: key,
              builder: (_) => ReadTrackedContent(
                content: content,
                clock: () => tester.binding.clock.now().difference(epoch),
                title: const Text('Title'),
                body: const Text('Body'),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 600));
      ScaffoldMessenger.of(key.currentContext!).showSnackBar(
        const SnackBar(
          content: Text('Overlay'),
          duration: Duration(seconds: 10),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 2));
      expect(store.rows, isEmpty);
      expect(readVisibility.overlays, 1);
      await tester.pumpWidget(const SizedBox());
      expect(readVisibility.overlays, 0);
      sessions.retainViewer(null);
      // The outer tearDown disposes the current controller again safely below.
      controller = ReadTrackingController(
        ReadScope('dev', 'replacement'),
        MemoryReadStateStore(ReadScope('dev', 'replacement')),
      );
    },
  );
}
