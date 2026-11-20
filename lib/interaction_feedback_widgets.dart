import 'package:flutter/widgets.dart';
import 'interaction_feedback.dart';

/// A change on another card never rebuilds this card or resets its exposure.
class InteractionFeedbackBuilder extends StatefulWidget {
  const InteractionFeedbackBuilder({
    super.key,
    required this.id,
    required this.feedback,
    required this.builder,
  });
  final String id;
  final InteractionFeedback? feedback;
  final Widget Function(BuildContext, InteractionFeedback?) builder;
  @override
  State<InteractionFeedbackBuilder> createState() =>
      _InteractionFeedbackBuilderState();
}

class _InteractionFeedbackBuilderState
    extends State<InteractionFeedbackBuilder> {
  Object? _signature;
  Object? signature() {
    final f = widget.feedback, id = widget.id;
    if (f == null) return null;
    return (
      f.viewer,
      f.confirmed(id, InteractionKind.reaction),
      f.confirmed(id, InteractionKind.save),
      (
        f.preview(id, InteractionKind.reaction),
        f.pending(id, InteractionKind.reaction),
        f.busy(id, InteractionKind.reaction),
        f.uncertain(id, InteractionKind.reaction),
      ),
      (
        f.preview(id, InteractionKind.save),
        f.pending(id, InteractionKind.save),
        f.busy(id, InteractionKind.save),
        f.uncertain(id, InteractionKind.save),
      ),
    );
  }

  void changed() {
    final next = signature();
    if (_signature != next && mounted) setState(() => _signature = next);
  }

  @override
  void initState() {
    super.initState();
    _signature = signature();
    widget.feedback?.addListener(changed);
  }

  @override
  void didUpdateWidget(covariant InteractionFeedbackBuilder oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.feedback != widget.feedback) {
      oldWidget.feedback?.removeListener(changed);
      widget.feedback?.addListener(changed);
    }
    _signature = signature();
  }

  @override
  void dispose() {
    widget.feedback?.removeListener(changed);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      widget.builder(context, widget.feedback);
}
