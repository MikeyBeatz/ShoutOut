import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

const _maximumNormalizedDimension = 4096;

Future<Uint8List> normalizeBusinessLogoInput(
  Uint8List bytes, {
  required String contentType,
}) async {
  final source = web.Blob(
    <web.BlobPart>[bytes.toJS].toJS,
    web.BlobPropertyBag(type: contentType),
  );
  final bitmap = await web.window.createImageBitmap(source).toDart;
  try {
    final longestSide = bitmap.width > bitmap.height
        ? bitmap.width
        : bitmap.height;
    final scale = longestSide > _maximumNormalizedDimension
        ? _maximumNormalizedDimension / longestSide
        : 1.0;
    final width = (bitmap.width * scale).round().clamp(
      1,
      _maximumNormalizedDimension,
    );
    final height = (bitmap.height * scale).round().clamp(
      1,
      _maximumNormalizedDimension,
    );
    final canvas = web.OffscreenCanvas(width, height);
    final context =
        canvas.getContext('2d') as web.OffscreenCanvasRenderingContext2D;
    context.drawImage(bitmap, 0, 0, width, height);
    final normalized = await canvas
        .convertToBlob(web.ImageEncodeOptions(type: 'image/png'))
        .toDart;
    final buffer = await normalized.arrayBuffer().toDart;
    return buffer.toDart.asUint8List();
  } finally {
    bitmap.close();
  }
}
