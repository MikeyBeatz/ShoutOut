import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/business_logo_editor.dart';

void main() {
  test('cover layout fills the square crop viewport', () {
    expect(
      businessLogoBaseDisplaySize(
        sourceWidth: 1200,
        sourceHeight: 600,
        viewportSize: 300,
      ),
      const Size(600, 300),
    );
  });

  test('offset is clamped so the crop never leaves the image', () {
    expect(
      clampBusinessLogoOffset(
        offset: const Offset(500, -500),
        baseDisplaySize: const Size(600, 300),
        zoom: 1,
        viewportSize: 300,
      ),
      const Offset(150, 0),
    );
  });

  test('source crop follows zoom and position', () {
    expect(
      businessLogoSourceRect(
        sourceWidth: 1200,
        sourceHeight: 600,
        viewportSize: 300,
        zoom: 1,
        offset: Offset.zero,
      ),
      const Rect.fromLTWH(300, 0, 600, 600),
    );
    expect(
      businessLogoSourceRect(
        sourceWidth: 1200,
        sourceHeight: 600,
        viewportSize: 300,
        zoom: 2,
        offset: const Offset(150, 0),
      ),
      const Rect.fromLTWH(300, 150, 300, 300),
    );
  });

  testWidgets('rendered crop is exactly 512 by 512 pixels', (tester) async {
    await tester.runAsync(() async {
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      canvas.drawRect(
        const Rect.fromLTWH(0, 0, 1024, 768),
        Paint()..color = Colors.teal,
      );
      final source = await recorder.endRecording().toImage(1024, 768);
      addTearDown(source.dispose);

      final bytes = await renderBusinessLogoCrop(
        image: source,
        sourceRect: const Rect.fromLTWH(128, 0, 768, 768),
      );
      final codec = await ui.instantiateImageCodec(bytes);
      addTearDown(codec.dispose);
      final frame = await codec.getNextFrame();
      addTearDown(frame.image.dispose);
      expect(frame.image.width, businessLogoOutputSize);
      expect(frame.image.height, businessLogoOutputSize);
    });
  });
}
