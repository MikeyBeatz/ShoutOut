import 'dart:ui' as ui;
import 'dart:typed_data';
import 'dart:convert';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/avatar_style.dart';
import 'package:shoutout/business_logo_editor.dart';
import 'package:shoutout/l10n/app_localizations.dart';

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
    expect(
      businessLogoBaseDisplaySize(
        sourceWidth: 600,
        sourceHeight: 1200,
        viewportSize: 300,
      ),
      const Size(300, 600),
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

  test('business logo uses the standard file selector image filters', () async {
    List<XTypeGroup>? receivedTypes;
    final expected = XFile.fromData(
      Uint8List.fromList([1]),
      name: 'logo.png',
      mimeType: 'image/png',
    );

    final selected = await selectBusinessLogoFile(
      selector: ({acceptedTypeGroups = const <XTypeGroup>[]}) async {
        receivedTypes = acceptedTypeGroups;
        return expected;
      },
    );

    expect(selected, same(expected));
    expect(receivedTypes, hasLength(1));
    expect(
      receivedTypes!.single.extensions,
      containsAll(['jpg', 'png', 'webp']),
    );
    expect(receivedTypes!.single.mimeTypes, contains('image/png'));
    expect(receivedTypes!.single.webWildCards, contains('image/*'));
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

  testWidgets('ordinary logo bypasses browser normalization', (tester) async {
    await tester.runAsync(() async {
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      canvas.drawColor(Colors.teal, BlendMode.src);
      final source = await recorder.endRecording().toImage(512, 512);
      final data = await source.toByteData(format: ui.ImageByteFormat.png);
      source.dispose();

      final image = await decodeBusinessLogoInputWithFallback(
        data!.buffer.asUint8List(),
        contentType: 'image/png',
        normalizer: (bytes, {required contentType}) async =>
            throw StateError('normalizer must not run'),
      );
      addTearDown(image.dispose);

      expect(image.width, 512);
      expect(image.height, 512);
    });
  });

  testWidgets('failed direct decode uses normalized fallback', (tester) async {
    await tester.runAsync(() async {
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      canvas.drawColor(Colors.teal, BlendMode.src);
      final source = await recorder.endRecording().toImage(512, 512);
      final data = await source.toByteData(format: ui.ImageByteFormat.png);
      source.dispose();
      var fallbackCalled = false;

      final image = await decodeBusinessLogoInputWithFallback(
        Uint8List.fromList([1, 2, 3]),
        contentType: 'image/png',
        normalizer: (bytes, {required contentType}) async {
          fallbackCalled = true;
          return data!.buffer.asUint8List();
        },
      );
      addTearDown(image.dispose);

      expect(fallbackCalled, isTrue);
      expect(image.width, 512);
      expect(image.height, 512);
    });
  });

  testWidgets('Business avatar editor exposes the custom logo action', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        locale: Locale('cs'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: Scaffold(
          body: AvatarPickerSheet(
            initialStyle: AvatarStyle.fallback,
            showBusinessLogoAction: true,
          ),
        ),
      ),
    );

    expect(find.byKey(const Key('business-logo-action')), findsOneWidget);
    expect(find.text('Nahrát vlastní logo'), findsOneWidget);
    await tester.tap(find.byKey(const Key('business-logo-action')));
    await tester.pump();
    expect(
      find.text(
        'Vlastní logo připravujeme. Zatím můžeš použít některý z našich avatarů.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('regular avatar editor does not expose custom logo action', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: AvatarPickerSheet(initialStyle: AvatarStyle.fallback),
        ),
      ),
    );

    expect(find.byKey(const Key('business-logo-action')), findsNothing);
  });

  testWidgets('cropped business logo is only saved after Save is tapped', (
    tester,
  ) async {
    final logo = base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    );
    Uint8List? savedLogo;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AvatarPickerSheet(
            initialStyle: AvatarStyle.fallback,
            showBusinessLogoAction: true,
            pickBusinessLogo: (_) async => logo,
            onBusinessLogoSelected: (bytes) async {
              savedLogo = bytes;
              return true;
            },
          ),
        ),
      ),
    );

    await tester.tap(find.byKey(const Key('business-logo-action')));
    await tester.pumpAndSettle();

    expect(savedLogo, isNull);
    expect(
      find.byKey(const Key('pending-business-logo-preview')),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('save-avatar')));
    await tester.pumpAndSettle();
    expect(savedLogo, logo);
  });

  testWidgets('choosing a built-in avatar discards the pending logo', (
    tester,
  ) async {
    final logo = base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    );
    var logoWasSaved = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AvatarPickerSheet(
            initialStyle: AvatarStyle.fallback,
            showBusinessLogoAction: true,
            pickBusinessLogo: (_) async => logo,
            onBusinessLogoSelected: (_) async {
              logoWasSaved = true;
              return true;
            },
          ),
        ),
      ),
    );

    await tester.tap(find.byKey(const Key('business-logo-action')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('avatar-option-fox')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('save-avatar')));
    await tester.pumpAndSettle();

    expect(logoWasSaved, isFalse);
  });

  testWidgets(
    'active business logo is the initial preview until avatar choice',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AvatarPickerSheet(
              initialStyle: AvatarStyle.fallback.copyWith(avatarId: 'owl'),
              showBusinessLogoAction: true,
              initialBusinessLogoPreview: const ColoredBox(
                key: Key('current-business-logo'),
                color: Colors.teal,
              ),
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('current-business-logo')), findsOneWidget);

      await tester.tap(find.byKey(const Key('avatar-option-fox')));
      await tester.pump();

      expect(find.byKey(const Key('current-business-logo')), findsNothing);
    },
  );
}
