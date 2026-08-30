import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';

import 'business_logo_input_normalizer.dart';
import 'l10n/business_text.dart';

const businessLogoOutputSize = 512;
const businessLogoMaximumInputBytes = 10 * 1024 * 1024;
const businessLogoMaximumDecodedDimension = 4096;

typedef BusinessLogoInputNormalizer =
    Future<Uint8List> Function(Uint8List bytes, {required String contentType});

typedef BusinessLogoFileSelector =
    Future<XFile?> Function({List<XTypeGroup> acceptedTypeGroups});

const businessLogoFileTypes = XTypeGroup(
  label: 'JPG, PNG, WebP',
  extensions: <String>['jpg', 'jpeg', 'png', 'webp'],
  mimeTypes: <String>['image/jpeg', 'image/png', 'image/webp'],
  uniformTypeIdentifiers: <String>[
    'public.jpeg',
    'public.png',
    'org.webmproject.webp',
  ],
  webWildCards: <String>['image/*'],
);

Future<XFile?> selectBusinessLogoFile({
  BusinessLogoFileSelector selector = openFile,
}) => selector(acceptedTypeGroups: const <XTypeGroup>[businessLogoFileTypes]);

Size businessLogoBaseDisplaySize({
  required int sourceWidth,
  required int sourceHeight,
  required double viewportSize,
}) {
  final scale = math.max(
    viewportSize / sourceWidth,
    viewportSize / sourceHeight,
  );
  return Size(sourceWidth * scale, sourceHeight * scale);
}

Offset clampBusinessLogoOffset({
  required Offset offset,
  required Size baseDisplaySize,
  required double zoom,
  required double viewportSize,
}) {
  final maximumX = math.max(
    0.0,
    (baseDisplaySize.width * zoom - viewportSize) / 2,
  );
  final maximumY = math.max(
    0.0,
    (baseDisplaySize.height * zoom - viewportSize) / 2,
  );
  return Offset(
    offset.dx.clamp(-maximumX, maximumX),
    offset.dy.clamp(-maximumY, maximumY),
  );
}

Rect businessLogoSourceRect({
  required int sourceWidth,
  required int sourceHeight,
  required double viewportSize,
  required double zoom,
  required Offset offset,
}) {
  final baseSize = businessLogoBaseDisplaySize(
    sourceWidth: sourceWidth,
    sourceHeight: sourceHeight,
    viewportSize: viewportSize,
  );
  final clampedOffset = clampBusinessLogoOffset(
    offset: offset,
    baseDisplaySize: baseSize,
    zoom: zoom,
    viewportSize: viewportSize,
  );
  final displayScale = (baseSize.width / sourceWidth) * zoom;
  final cropSize = viewportSize / displayScale;
  final centerX = sourceWidth / 2 - clampedOffset.dx / displayScale;
  final centerY = sourceHeight / 2 - clampedOffset.dy / displayScale;
  return Rect.fromCenter(
    center: Offset(centerX, centerY),
    width: cropSize,
    height: cropSize,
  );
}

Future<ui.Image> decodeBusinessLogoInput(Uint8List bytes) async {
  if (bytes.isEmpty || bytes.length > businessLogoMaximumInputBytes) {
    throw const FormatException('invalid-business-logo-size');
  }
  final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
  ui.ImageDescriptor? descriptor;
  ui.Codec? codec;
  try {
    descriptor = await ui.ImageDescriptor.encoded(buffer);
    if (descriptor.width < businessLogoOutputSize ||
        descriptor.height < businessLogoOutputSize) {
      throw const FormatException('business-logo-resolution-too-small');
    }
    final scale = math.min(
      1.0,
      businessLogoMaximumDecodedDimension /
          math.max(descriptor.width, descriptor.height),
    );

    codec = await descriptor.instantiateCodec(
      targetWidth: math.max(1, (descriptor.width * scale).round()),
      targetHeight: math.max(1, (descriptor.height * scale).round()),
    );
    final frame = await codec.getNextFrame();
    return frame.image;
  } finally {
    codec?.dispose();
    descriptor?.dispose();
    buffer.dispose();
  }
}

Future<ui.Image> decodeBusinessLogoInputWithFallback(
  Uint8List bytes, {
  required String contentType,
  BusinessLogoInputNormalizer normalizer = normalizeBusinessLogoInput,
}) async {
  try {
    return await decodeBusinessLogoInput(bytes);
  } catch (error) {
    debugPrint('Business logo direct decode failed: $error');
  }

  final normalizedBytes = await normalizer(bytes, contentType: contentType);
  return decodeBusinessLogoInput(normalizedBytes);
}

Future<Uint8List> renderBusinessLogoCrop({
  required ui.Image image,
  required Rect sourceRect,
}) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.drawImageRect(
    image,
    sourceRect,
    Rect.fromLTWH(
      0,
      0,
      businessLogoOutputSize.toDouble(),
      businessLogoOutputSize.toDouble(),
    ),
    Paint()
      ..isAntiAlias = true
      ..filterQuality = FilterQuality.high,
  );
  final picture = recorder.endRecording();
  final output = await picture.toImage(
    businessLogoOutputSize,
    businessLogoOutputSize,
  );
  picture.dispose();
  try {
    final data = await output.toByteData(format: ui.ImageByteFormat.png);
    if (data == null) throw StateError('business-logo-encoding-failed');
    return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
  } finally {
    output.dispose();
  }
}

Future<Uint8List?> pickAndEditBusinessLogo(BuildContext context) async {
  XFile? picked;
  try {
    picked = await selectBusinessLogoFile();
  } catch (error) {
    debugPrint('Business logo file selection failed: $error');
    if (context.mounted) {
      _showBusinessLogoError(
        context,
        businessTr(context, 'Výběr obrázku se nepodařilo otevřít.'),
      );
    }
    return null;
  }
  if (picked == null) return null;
  final contentType = picked.mimeType ?? _businessLogoTypeFromName(picked.name);
  if (!{'image/jpeg', 'image/png', 'image/webp'}.contains(contentType)) {
    if (context.mounted) {
      _showBusinessLogoError(
        context,
        businessTr(context, 'Použij obrázek JPG, PNG nebo WebP.'),
      );
    }
    return null;
  }
  final bytes = await picked.readAsBytes();
  try {
    final image = await decodeBusinessLogoInputWithFallback(
      bytes,
      contentType: contentType!,
    );
    if (!context.mounted) {
      image.dispose();
      return null;
    }
    return Navigator.of(context).push<Uint8List>(
      MaterialPageRoute(builder: (_) => BusinessLogoEditorPage(image: image)),
    );
  } on FormatException catch (error) {
    if (context.mounted) {
      _showBusinessLogoError(
        context,
        error.message == 'business-logo-resolution-too-small'
            ? businessTr(context, 'Obrázek musí mít alespoň 512 × 512 pixelů.')
            : businessTr(context, 'Obrázek může mít nejvýše 10 MB.'),
      );
    }
    return null;
  } catch (_) {
    if (context.mounted) {
      _showBusinessLogoError(
        context,
        businessTr(context, 'Obrázek se nepodařilo načíst.'),
      );
    }
    return null;
  }
}

class BusinessLogoEditorPage extends StatefulWidget {
  const BusinessLogoEditorPage({super.key, required this.image});

  final ui.Image image;

  @override
  State<BusinessLogoEditorPage> createState() => _BusinessLogoEditorPageState();
}

class _BusinessLogoEditorPageState extends State<BusinessLogoEditorPage> {
  static const _maximumZoom = 6.0;
  double _zoom = 1;
  Offset _offset = Offset.zero;
  double _gestureStartZoom = 1;
  Offset _gestureStartOffset = Offset.zero;
  Offset _gestureStartFocal = Offset.zero;
  bool _saving = false;
  double _viewportSize = 300;

  @override
  void dispose() {
    widget.image.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(businessTr(context, 'Upravit business logo'))),
    body: SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          _viewportSize = math.min(360.0, constraints.maxWidth - 32);
          final baseSize = businessLogoBaseDisplaySize(
            sourceWidth: widget.image.width,
            sourceHeight: widget.image.height,
            viewportSize: _viewportSize,
          );
          _offset = clampBusinessLogoOffset(
            offset: _offset,
            baseDisplaySize: baseSize,
            zoom: _zoom,
            viewportSize: _viewportSize,
          );
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                businessTr(
                  context,
                  'Posuň a přibliž obrázek tak, aby důležitá část zůstala uvnitř kruhu.',
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              Center(
                child: SizedBox.square(
                  dimension: _viewportSize,
                  child: GestureDetector(
                    onScaleStart: (details) {
                      _gestureStartZoom = _zoom;
                      _gestureStartOffset = _offset;
                      _gestureStartFocal =
                          details.localFocalPoint -
                          Offset(_viewportSize / 2, _viewportSize / 2);
                    },
                    onScaleUpdate: (details) {
                      final zoom = (_gestureStartZoom * details.scale).clamp(
                        1.0,
                        _maximumZoom,
                      );
                      final focal =
                          details.localFocalPoint -
                          Offset(_viewportSize / 2, _viewportSize / 2);
                      final contentAtFocal =
                          (_gestureStartFocal - _gestureStartOffset) /
                          _gestureStartZoom;
                      final offset = focal - contentAtFocal * zoom;
                      setState(() {
                        _zoom = zoom;
                        _offset = clampBusinessLogoOffset(
                          offset: offset,
                          baseDisplaySize: baseSize,
                          zoom: zoom,
                          viewportSize: _viewportSize,
                        );
                      });
                    },
                    child: ClipRect(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Theme.of(
                            context,
                          ).colorScheme.surfaceContainerHighest,
                          border: Border.all(
                            color: Theme.of(context).colorScheme.outlineVariant,
                          ),
                        ),
                        child: CustomPaint(
                          foregroundPainter: _BusinessLogoCropGuidePainter(
                            color: Theme.of(context).colorScheme.primary,
                            overlayColor: Theme.of(
                              context,
                            ).colorScheme.scrim.withValues(alpha: 0.42),
                          ),
                          child: Center(
                            child: Transform.translate(
                              offset: _offset,
                              child: Transform.scale(
                                scale: _zoom,
                                child: OverflowBox(
                                  minWidth: 0,
                                  minHeight: 0,
                                  maxWidth: double.infinity,
                                  maxHeight: double.infinity,
                                  child: RawImage(
                                    image: widget.image,
                                    width: baseSize.width,
                                    height: baseSize.height,
                                    fit: BoxFit.fill,
                                    filterQuality: FilterQuality.high,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  const Icon(Icons.zoom_out),
                  Expanded(
                    child: Slider(
                      value: _zoom,
                      min: 1,
                      max: _maximumZoom,
                      onChanged: _saving
                          ? null
                          : (zoom) => setState(() {
                              _zoom = zoom;
                              _offset = clampBusinessLogoOffset(
                                offset: _offset,
                                baseDisplaySize: baseSize,
                                zoom: zoom,
                                viewportSize: _viewportSize,
                              );
                            }),
                    ),
                  ),
                  const Icon(Icons.zoom_in),
                ],
              ),
              TextButton.icon(
                onPressed: _saving
                    ? null
                    : () => setState(() {
                        _zoom = 1;
                        _offset = Offset.zero;
                      }),
                icon: const Icon(Icons.restart_alt),
                label: Text(businessTr(context, 'Obnovit výřez')),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.crop),
                label: Text(
                  businessTr(context, _saving ? 'Připravuji…' : 'Použít výřez'),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                businessTr(
                  context,
                  'Výsledkem je nový obrázek 512 × 512 px. Původní metadata ani části mimo výřez se neukládají.',
                ),
                textAlign: TextAlign.center,
              ),
            ],
          );
        },
      ),
    ),
  );

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final sourceRect = businessLogoSourceRect(
        sourceWidth: widget.image.width,
        sourceHeight: widget.image.height,
        viewportSize: _viewportSize,
        zoom: _zoom,
        offset: _offset,
      );
      final bytes = await renderBusinessLogoCrop(
        image: widget.image,
        sourceRect: sourceRect,
      );
      if (mounted) Navigator.pop(context, bytes);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              businessTr(context, 'Výřez se nepodařilo připravit.'),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _BusinessLogoCropGuidePainter extends CustomPainter {
  const _BusinessLogoCropGuidePainter({
    required this.color,
    required this.overlayColor,
  });

  final Color color;
  final Color overlayColor;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = math.min(size.width, size.height) / 2 - 5;
    final overlay = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & size)
      ..addOval(Rect.fromCircle(center: center, radius: radius));
    canvas.drawPath(overlay, Paint()..color = overlayColor);
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
  }

  @override
  bool shouldRepaint(_BusinessLogoCropGuidePainter oldDelegate) =>
      color != oldDelegate.color || overlayColor != oldDelegate.overlayColor;
}

String? _businessLogoTypeFromName(String name) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

void _showBusinessLogoError(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
