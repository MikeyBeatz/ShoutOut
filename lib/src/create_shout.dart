part of '../main.dart';

class CreateShoutSheet extends StatefulWidget {
  const CreateShoutSheet({super.key});

  @override
  State<CreateShoutSheet> createState() => _CreateShoutSheetState();
}

class _CreateShoutSheetState extends State<CreateShoutSheet> {
  static const _categories = [
    'Obecné',
    'Akce',
    'Sport',
    'Zábava',
    'Pomoc',
    'Upozornění',
    'Dotaz',
    'Doprava',
    'Jídlo a pití',
    'Kultura',
  ];
  final _title = TextEditingController();
  final _text = TextEditingController();
  final Set<String> _selected = {};
  int _hours = 2;
  int _minutes = 0;
  late final FixedExtentScrollController _hoursController;
  late final FixedExtentScrollController _minutesController;

  Duration get _duration => Duration(hours: _hours, minutes: _minutes);

  @override
  void initState() {
    super.initState();
    _hoursController = FixedExtentScrollController(initialItem: _hours);
    _minutesController = FixedExtentScrollController(initialItem: 0);
  }

  @override
  void dispose() {
    _title.dispose();
    _text.dispose();
    _hoursController.dispose();
    _minutesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      20,
      20,
      MediaQuery.viewInsetsOf(context).bottom + 20,
    ),
    child: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  tr(context, 'Nový shout'),
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              IconButton(
                tooltip: tr(context, 'Zavřít'),
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _title,
            maxLength: 60,
            decoration: InputDecoration(
              labelText: tr(context, 'Nadpis'),
              hintText: tr(context, 'Stručně, co se děje?'),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _text,
            maxLength: 220,
            maxLines: 4,
            decoration: InputDecoration(
              labelText: tr(context, 'Text'),
              hintText: tr(context, 'Doplň podrobnosti…'),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            tr(context, 'Kategorie (vyber nejvýše dvě)'),
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: _categories
                .map(
                  (category) => FilterChip(
                    label: Text(tr(context, category)),
                    selected: _selected.contains(category),
                    onSelected: (selected) => setState(() {
                      if (selected && _selected.length < 2) {
                        _selected.add(category);
                      }
                      if (!selected) {
                        _selected.remove(category);
                      }
                    }),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                tr(context, 'Platnost'),
                style: Theme.of(context).textTheme.labelLarge,
              ),
              Text(
                localizedDurationLabel(context, _duration),
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
            ],
          ),
          Container(
            height: 140,
            decoration: BoxDecoration(
              border: Border.all(
                color: Theme.of(context).colorScheme.outlineVariant,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(
                  child: _DurationWheel(
                    controller: _hoursController,
                    values: List.generate(25, (index) => index),
                    suffix: 'h',
                    onChanged: (hours) => _setDuration(hours, _minutes),
                  ),
                ),
                Expanded(
                  child: _DurationWheel(
                    controller: _minutesController,
                    values: const [0, 15, 30, 45],
                    suffix: 'min',
                    twoDigits: true,
                    onChanged: (minutes) => _setDuration(_hours, minutes),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _publish,
            icon: const Icon(Icons.send_outlined),
            label: Text(tr(context, 'Publikovat')),
          ),
        ],
      ),
    ),
  );

  void _publish() {
    if (_title.text.trim().isEmpty ||
        _text.text.trim().isEmpty ||
        _selected.isEmpty) {
      _showMessage(
        tr(context, 'Doplň nadpis, text a alespoň jednu kategorii.'),
      );
      return;
    }
    final now = DateTime.now();
    Navigator.pop(
      context,
      Shout(
        id: now.microsecondsSinceEpoch.toString(),
        author: 'Nový_soused',
        title: _title.text.trim(),
        text: _text.text.trim(),
        categories: _selected.toList(),
        distanceKm: 0,
        createdAt: now,
        expiresAt: now.add(_duration),
      ),
    );
  }

  void _setDuration(int hours, int minutes) {
    var validMinutes = minutes;
    if (hours == 24) validMinutes = 0;
    if (hours == 0 && validMinutes == 0) {
      validMinutes = 15;
      _showMessage(tr(context, 'Shout může mít platnost minimálně 15 minut.'));
    }
    setState(() {
      _hours = hours;
      _minutes = validMinutes;
    });
    final minuteIndex = [0, 15, 30, 45].indexOf(validMinutes);
    if (_minutesController.selectedItem != minuteIndex) {
      _minutesController.jumpToItem(minuteIndex);
    }
  }

  void _showMessage(String message) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(message),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: Text(tr(context, 'Rozumím')),
          ),
        ],
      ),
    );
  }
}

class _DurationWheel extends StatelessWidget {
  const _DurationWheel({
    required this.controller,
    required this.values,
    required this.suffix,
    required this.onChanged,
    this.twoDigits = false,
  });

  final FixedExtentScrollController controller;
  final List<int> values;
  final String suffix;
  final ValueChanged<int> onChanged;
  final bool twoDigits;

  @override
  Widget build(BuildContext context) => CupertinoTheme(
    data: CupertinoThemeData(
      brightness: Theme.of(context).brightness,
      textTheme: CupertinoTextThemeData(
        pickerTextStyle: Theme.of(context).textTheme.titleMedium!,
      ),
    ),
    child: ScrollConfiguration(
      behavior: const MaterialScrollBehavior().copyWith(
        dragDevices: {
          PointerDeviceKind.touch,
          PointerDeviceKind.mouse,
          PointerDeviceKind.stylus,
          PointerDeviceKind.trackpad,
        },
      ),
      child: CupertinoPicker(
        scrollController: controller,
        itemExtent: 36,
        useMagnifier: true,
        magnification: 1.08,
        selectionOverlay: Container(
          margin: const EdgeInsets.symmetric(horizontal: 6),
          decoration: BoxDecoration(
            color: Theme.of(
              context,
            ).colorScheme.primaryContainer.withValues(alpha: .7),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Theme.of(context).colorScheme.primary),
          ),
        ),
        onSelectedItemChanged: (index) => onChanged(values[index]),
        children: values.map((value) {
          final label = twoDigits ? value.toString().padLeft(2, '0') : '$value';
          return Center(child: Text('$label $suffix'));
        }).toList(),
      ),
    ),
  );
}

class ReactionButton extends StatelessWidget {
  const ReactionButton({
    super.key,
    required this.icon,
    required this.value,
    required this.onPressed,
    this.selected = false,
  });
  final IconData icon;
  final int value;
  final VoidCallback onPressed;
  final bool selected;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onPressed,
    borderRadius: BorderRadius.circular(18),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(
            icon,
            size: 19,
            color: selected ? Theme.of(context).colorScheme.primary : null,
          ),
          const SizedBox(width: 5),
          Text('$value'),
        ],
      ),
    ),
  );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title});
  final IconData icon;
  final String title;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 44),
          const SizedBox(height: 12),
          Text(title, textAlign: TextAlign.center),
        ],
      ),
    ),
  );
}

// Shout model declarations are in shout_model.dart.
