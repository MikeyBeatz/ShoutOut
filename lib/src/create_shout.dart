part of '../main.dart';

class CreateShoutSheet extends StatefulWidget {
  const CreateShoutSheet({super.key, this.onPublish});

  final Future<void> Function(Shout shout)? onPublish;

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
  String? _businessLocationId;
  AccountRole? _accountRole;
  bool _publishing = false;
  bool _extendedBusinessDuration = false;
  bool _businessHighlighted = false;
  bool _businessSpotlight = false;
  late final FixedExtentScrollController _hoursController;
  late final FixedExtentScrollController _minutesController;

  Duration get _duration => Duration(hours: _hours, minutes: _minutes);
  List<int> get _hourOptions =>
      businessDurationHourOptions(_extendedBusinessDuration);

  @override
  void initState() {
    super.initState();
    _hoursController = FixedExtentScrollController(initialItem: _hours);
    _minutesController = FixedExtentScrollController(initialItem: 0);
    _loadAccountRole();
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
                onPressed: _publishing ? null : () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _title,
            textCapitalization: TextCapitalization.sentences,
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
            textCapitalization: TextCapitalization.sentences,
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
          if (_accountRole == AccountRole.business) ...[
            Text(
              businessTr(context, 'Propagace'),
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 6),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(businessTr(context, 'Zvýraznit Shout')),
              subtitle: Text(
                businessTr(
                  context,
                  'Celá karta bude ve feedu vizuálně zvýrazněná.',
                ),
              ),
              value: _businessHighlighted,
              onChanged: _publishing
                  ? null
                  : (value) =>
                        setState(() => _businessHighlighted = value ?? false),
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(businessTr(context, 'Propagační okénko')),
              subtitle: Text(
                businessTr(
                  context,
                  'Ve feedu se zobrazí kompaktní okénko; celý Shout se otevře po kliknutí.',
                ),
              ),
              value: _businessSpotlight,
              onChanged: _publishing
                  ? null
                  : (value) =>
                        setState(() => _businessSpotlight = value ?? false),
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(businessTr(context, 'Na více než 24 hodin')),
              subtitle: Text(
                businessTr(
                  context,
                  'Po 24 hodinách pokračuje výběr po celých dnech až na 7 dní.',
                ),
              ),
              value: _extendedBusinessDuration,
              onChanged: _publishing
                  ? null
                  : (value) => _setExtendedBusinessDuration(value ?? false),
            ),
            const SizedBox(height: 4),
          ],
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
                    values: _hourOptions,
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
          StreamBuilder<AccountRole>(
            stream: _watchAccountRole(FirebaseAuth.instance.currentUser!.uid),
            builder: (context, roleSnapshot) {
              if (roleSnapshot.data != AccountRole.business) {
                return const SizedBox.shrink();
              }
              final uid = FirebaseAuth.instance.currentUser!.uid;
              return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                stream: FirebaseFirestore.instance
                    .collection('businessProfiles')
                    .doc(uid)
                    .collection('locations')
                    .where('active', isEqualTo: true)
                    .snapshots(),
                builder: (context, locationSnapshot) {
                  final locations =
                      locationSnapshot.data?.docs
                          .where(
                            (document) =>
                                document.data()['deleted'] != true &&
                                document.data()['geocodingStatus'] ==
                                    'verified',
                          )
                          .toList() ??
                      const [];
                  if (locations.length == 1 && _businessLocationId == null) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted && _businessLocationId == null) {
                        setState(
                          () => _businessLocationId = locations.first.id,
                        );
                      }
                    });
                  }
                  return DropdownButtonFormField<String>(
                    initialValue:
                        locations.any(
                          (document) => document.id == _businessLocationId,
                        )
                        ? _businessLocationId
                        : null,
                    decoration: const InputDecoration(
                      labelText: 'Vybrat pobočku',
                      border: OutlineInputBorder(),
                    ),
                    items: locations
                        .map(
                          (document) => DropdownMenuItem(
                            value: document.id,
                            child: Text(
                              document.data()['displayName'] as String,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: locations.isEmpty
                        ? null
                        : (value) =>
                              setState(() => _businessLocationId = value),
                    hint: Text(
                      locations.isEmpty
                          ? 'Nejdříve přidejte aktivní pobočku'
                          : 'Zvolte pobočku',
                    ),
                  );
                },
              );
            },
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _publishing ? null : _publish,
            icon: _publishing
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send_outlined),
            label: Text(tr(context, _publishing ? 'Publikuji…' : 'Publikovat')),
          ),
        ],
      ),
    ),
  );

  Future<void> _publish() async {
    if (_accountRole == null) {
      _showMessage(tr(context, 'Počkejte prosím na načtení účtu.'));
      return;
    }
    if (_accountRole == AccountRole.business && _businessLocationId == null) {
      _showMessage(tr(context, 'Pro publikování vyberte aktivní pobočku.'));
      return;
    }
    if (_title.text.trim().isEmpty ||
        _text.text.trim().isEmpty ||
        _selected.isEmpty) {
      _showMessage(
        tr(context, 'Doplň nadpis, text a alespoň jednu kategorii.'),
      );
      return;
    }
    final now = DateTime.now();
    final shout = Shout(
      id: now.microsecondsSinceEpoch.toString(),
      author: 'Nový_soused',
      title: titleWithInitialCapital(_title.text),
      text: _text.text.trim(),
      categories: _selected.toList(),
      distanceKm: 0,
      createdAt: now,
      expiresAt: now.add(_duration),
      businessLocationId: _businessLocationId,
      businessHighlighted: _businessHighlighted,
      businessSpotlight: _businessSpotlight,
      businessExtendedDuration:
          _extendedBusinessDuration && _duration > const Duration(hours: 24),
    );
    if (widget.onPublish == null) {
      Navigator.pop(context, shout);
      return;
    }
    setState(() => _publishing = true);
    try {
      await widget.onPublish!(shout);
      if (mounted) Navigator.pop(context);
    } on StateError catch (error) {
      await _recordClientError(action: 'publish_shout', error: error);
      if (!mounted) return;
      final message = switch (error.message) {
        'rate-shout-cooldown' =>
          _accountRole == AccountRole.business
              ? 'Před dalším Shoutem počkejte jednu sekundu.'
              : 'Mezi dvěma Shouty je potřeba počkat alespoň 2 minuty.',
        'rate-shout-daily-limit' =>
          _accountRole == AccountRole.business
              ? 'Byl dosažen denní limit Business účtu.'
              : 'Byl dosažen denní limit 50 Shoutů.',
        'business-location-unavailable' =>
          'Vybraná pobočka není dostupná. Zkontrolujte její adresu a aktivní stav.',
        'location-servicesDisabled' =>
          'Zapněte polohové služby a zkuste to znovu.',
        'location-permissionDenied' || 'location-permissionDeniedForever' =>
          'Pro publikování Shoutu povolte přístup k poloze.',
        _ => 'Shout se nepodařilo publikovat. Zkuste to znovu.',
      };
      _showMessage(tr(context, message));
    } on FirebaseException catch (error) {
      await _recordClientError(action: 'publish_shout', error: error);
      if (!mounted) return;
      _showMessage(
        tr(
          context,
          error.code == 'permission-denied'
              ? 'Shout se nepodařilo publikovat kvůli oprávnění účtu.'
              : 'Shout se nepodařilo publikovat. Zkuste to znovu.',
        ),
      );
    } finally {
      if (mounted) setState(() => _publishing = false);
    }
  }

  Future<void> _loadAccountRole() async {
    final role = await _watchAccountRole(
      FirebaseAuth.instance.currentUser!.uid,
    ).first;
    if (mounted) setState(() => _accountRole = role);
  }

  void _setDuration(int hours, int minutes) {
    var validMinutes = minutes;
    if (hours >= 24) validMinutes = 0;
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

  void _setExtendedBusinessDuration(bool enabled) {
    setState(() {
      _extendedBusinessDuration = enabled;
      if (!enabled && _hours > 24) {
        _hours = 24;
        _minutes = 0;
      }
    });
    if (!enabled && _hours > 24) {
      _hoursController.jumpToItem(24);
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
          final label = value > 24
              ? localizedDurationLabel(context, Duration(hours: value))
              : '${twoDigits ? value.toString().padLeft(2, '0') : value} $suffix';
          return Center(child: Text(label));
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
