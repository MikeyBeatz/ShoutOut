import 'package:flutter/material.dart';

/// Drawn geometry, independent of a possibly cached MaterialIcons font subset.
class FlightSoundIcon extends StatelessWidget {
  const FlightSoundIcon({super.key, required this.muted, required this.color});
  final bool muted;
  final Color color;

  @override
  Widget build(BuildContext context) => CustomPaint(
    size: const Size.square(24),
    painter: _SoundPainter(muted, color),
  );
}

class _SoundPainter extends CustomPainter {
  const _SoundPainter(this.muted, this.color);
  final bool muted;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 24, size.height / 24);
    final speaker = Path()
      ..moveTo(3, 9)
      ..lineTo(7, 9)
      ..lineTo(12, 5)
      ..lineTo(12, 19)
      ..lineTo(7, 15)
      ..lineTo(3, 15)
      ..close();
    canvas.drawPath(speaker, Paint()..color = color);
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    if (muted) {
      canvas.drawLine(const Offset(16, 9), const Offset(21, 15), stroke);
      canvas.drawLine(const Offset(21, 9), const Offset(16, 15), stroke);
    } else {
      canvas.drawPath(
        Path()
          ..moveTo(16, 8)
          ..quadraticBezierTo(20, 12, 16, 16),
        stroke,
      );
      canvas.drawPath(
        Path()
          ..moveTo(19, 5)
          ..quadraticBezierTo(26, 12, 19, 19),
        stroke,
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_SoundPainter oldDelegate) =>
      oldDelegate.muted != muted || oldDelegate.color != color;
}
