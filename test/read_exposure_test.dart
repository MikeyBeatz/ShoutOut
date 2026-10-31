import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/read_exposure.dart';

void main() {
  bool show(
    FullContentExposure tracker,
    int millis,
    List<ContentSlice> visible, {
    bool active = true,
    bool expanded = true,
    String layout = 'layout',
    double extent = 100,
  }) => tracker.observe(
    time: Duration(milliseconds: millis),
    layout: layout,
    extent: extent,
    visible: visible,
    active: active,
    fullContentRendered: expanded,
  );
  const full = [ContentSlice(0, 100)];

  test(
    'whole short content needs exactly one continuous foreground second',
    () {
      final tracker = FullContentExposure();
      expect(show(tracker, 0, full), false);
      expect(show(tracker, 999, full), false);
      expect(show(tracker, 1000, full), true);
      expect(show(tracker, 2000, [], active: false), true);
    },
  );
  test(
    'long content needs qualified coverage of every portion, including gaps',
    () {
      final tracker = FullContentExposure();
      show(tracker, 0, [ContentSlice(0, 40)]);
      expect(show(tracker, 1000, [ContentSlice(0, 40)]), false);
      show(tracker, 1001, [ContentSlice(60, 100)]);
      expect(show(tracker, 2001, [ContentSlice(60, 100)]), false);
      show(tracker, 2002, [ContentSlice(39, 61)]);
      expect(show(tracker, 3002, [ContentSlice(39, 61)]), true);
    },
  );
  test(
    'quick scrolling and alternating portions cannot add fragmented dwell times',
    () {
      final tracker = FullContentExposure();
      show(tracker, 0, full);
      show(tracker, 900, []);
      show(tracker, 1000, full);
      expect(show(tracker, 1900, full), false);
      expect(show(tracker, 2000, full), true);
    },
  );
  test(
    'background, hidden route and truncation reset pending exposure without marking',
    () {
      for (final hiddenBy in ['background', 'collapsed']) {
        final tracker = FullContentExposure();
        show(tracker, 0, full);
        expect(
          show(
            tracker,
            5000,
            full,
            active: hiddenBy != 'background',
            expanded: hiddenBy != 'collapsed',
          ),
          false,
        );
        expect(show(tracker, 6000, full), false);
        expect(show(tracker, 6999, full), false);
        expect(show(tracker, 7000, full), true);
      }
    },
  );
  test(
    'only the continuously intersecting part qualifies as viewport edges move',
    () {
      final tracker = FullContentExposure();
      show(tracker, 0, [ContentSlice(0, 60)]);
      show(tracker, 1000, [ContentSlice(40, 100)]);
      expect(tracker.isComplete, false);
      show(tracker, 2000, [ContentSlice(40, 100)]);
      show(tracker, 2001, [ContentSlice(0, 40)]);
      expect(show(tracker, 3001, [ContentSlice(0, 40)]), true);
    },
  );
  test('font or width layout change discards old coordinate coverage', () {
    final tracker = FullContentExposure();
    show(tracker, 0, [ContentSlice(0, 50)]);
    show(tracker, 1000, [ContentSlice(0, 50)]);
    show(tracker, 1001, [ContentSlice(50, 100)], layout: 'new-font');
    expect(
      show(tracker, 2001, [ContentSlice(50, 100)], layout: 'new-font'),
      false,
    );
  });
  test(
    'invalid coordinates or backwards elapsed clock cannot manufacture completion',
    () {
      final tracker = FullContentExposure();
      show(tracker, 10, full);
      expect(() => show(tracker, 9, full), throwsArgumentError);
      expect(
        () => show(tracker, 20, [ContentSlice(-1, 100)]),
        throwsArgumentError,
      );
      expect(tracker.isComplete, false);
    },
  );
}
