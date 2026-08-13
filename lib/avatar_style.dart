import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'business_logo_editor.dart';
import 'l10n/business_text.dart';
import 'l10n/text.dart';

enum AvatarGradientDirection { horizontal, diagonal, vertical }

class AvatarStyle {
  const AvatarStyle({
    required this.avatarId,
    required this.startColorId,
    required this.endColorId,
    required this.direction,
  });

  static const avatarIds = [
    'fox',
    'owl',
    'otter',
    'raccoon',
    'cat',
    'dragon',
    'octopus',
    'bear',
    'panda',
    'rabbit',
    'penguin',
    'frog',
    'dog',
    'hedgehog',
    'parrot',
    'robot',
    'astronaut',
    'cactus',
    'mushroom',
    'moon',
    'comet',
    'mountain',
    'lightning',
    'controller',
  ];

  static const colors = <String, Color>{
    'teal': Color(0xFF1496A8),
    'navy': Color(0xFF074B57),
    'aqua': Color(0xFF72DDE5),
    'purple': Color(0xFF7E57C2),
    'coral': Color(0xFFEF6C5B),
    'gold': Color(0xFFF9B84A),
    'green': Color(0xFF43A047),
    'rose': Color(0xFFC83D6B),
    'sky': Color(0xFF42A5F5),
    'indigo': Color(0xFF3949AB),
    'pink': Color(0xFFEC407A),
    'orange': Color(0xFFF57C00),
    'lime': Color(0xFF9ECA2E),
    'mint': Color(0xFF35C9A5),
    'brown': Color(0xFF795548),
    'slate': Color(0xFF546E7A),
  };

  static const fallback = AvatarStyle(
    avatarId: 'fox',
    startColorId: 'teal',
    endColorId: 'navy',
    direction: AvatarGradientDirection.diagonal,
  );

  final String avatarId;
  final String startColorId;
  final String endColorId;
  final AvatarGradientDirection direction;

  Color get startColor => colors[startColorId] ?? colors['teal']!;
  Color get endColor => colors[endColorId] ?? colors['navy']!;

  Alignment get begin => switch (direction) {
    AvatarGradientDirection.horizontal => Alignment.centerLeft,
    AvatarGradientDirection.diagonal => Alignment.topLeft,
    AvatarGradientDirection.vertical => Alignment.topCenter,
  };

  Alignment get end => switch (direction) {
    AvatarGradientDirection.horizontal => Alignment.centerRight,
    AvatarGradientDirection.diagonal => Alignment.bottomRight,
    AvatarGradientDirection.vertical => Alignment.bottomCenter,
  };

  Map<String, String> toFirestore() => {
    'avatarId': avatarId,
    'avatarBackgroundStart': startColorId,
    'avatarBackgroundEnd': endColorId,
    'avatarGradientDirection': direction.name,
  };

  Map<String, String> publicProfileData(String nickname) => {
    'nickname': nickname,
    ...toFirestore(),
  };

  static AvatarStyle fromProfile(Map<String, dynamic>? profile) {
    final avatarId = profile?['avatarId'] as String?;
    final start = profile?['avatarBackgroundStart'] as String?;
    final end = profile?['avatarBackgroundEnd'] as String?;
    final directionName = profile?['avatarGradientDirection'] as String?;
    return AvatarStyle(
      avatarId: avatarIds.contains(avatarId) ? avatarId! : fallback.avatarId,
      startColorId: colors.containsKey(start) ? start! : fallback.startColorId,
      endColorId: colors.containsKey(end) ? end! : fallback.endColorId,
      direction: AvatarGradientDirection.values.firstWhere(
        (value) => value.name == directionName,
        orElse: () => fallback.direction,
      ),
    );
  }

  static AvatarStyle random([Random? source]) {
    final random = source ?? Random.secure();
    final colorIds = colors.keys.toList();
    final startIndex = random.nextInt(colorIds.length);
    final endIndex = random.nextInt(colorIds.length);
    return AvatarStyle(
      avatarId: avatarIds[random.nextInt(avatarIds.length)],
      startColorId: colorIds[startIndex],
      endColorId: colorIds[endIndex],
      direction: AvatarGradientDirection
          .values[random.nextInt(AvatarGradientDirection.values.length)],
    );
  }

  AvatarStyle copyWith({
    String? avatarId,
    String? startColorId,
    String? endColorId,
    AvatarGradientDirection? direction,
  }) => AvatarStyle(
    avatarId: avatarId ?? this.avatarId,
    startColorId: startColorId ?? this.startColorId,
    endColorId: endColorId ?? this.endColorId,
    direction: direction ?? this.direction,
  );
}

class AvatarImage extends StatelessWidget {
  const AvatarImage({
    super.key,
    required this.avatarId,
    this.style,
    this.radius = 24,
  });

  final String? avatarId;
  final AvatarStyle? style;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final avatarId = this.avatarId;
    if (avatarId == null) {
      return CircleAvatar(
        radius: radius,
        backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
        child: Icon(
          Icons.person_outline,
          size: radius,
          color: Theme.of(context).colorScheme.outline,
        ),
      );
    }
    final effectiveStyle =
        style?.copyWith(avatarId: avatarId) ??
        AvatarStyle.fallback.copyWith(avatarId: avatarId);
    return ClipOval(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: effectiveStyle.begin,
            end: effectiveStyle.end,
            colors: [effectiveStyle.startColor, effectiveStyle.endColor],
          ),
        ),
        child: Image.asset(
          'assets/avatars/avatar_$avatarId.png',
          width: radius * 2,
          height: radius * 2,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => SizedBox.square(
            dimension: radius * 2,
            child: Icon(Icons.person_outline, size: radius),
          ),
        ),
      ),
    );
  }
}

class AvatarPickerSheet extends StatefulWidget {
  const AvatarPickerSheet({
    super.key,
    required this.initialStyle,
    this.showBusinessLogoAction = false,
    this.onBusinessLogoSelected,
  });

  final AvatarStyle initialStyle;
  final bool showBusinessLogoAction;
  final Future<void> Function(Uint8List bytes)? onBusinessLogoSelected;

  @override
  State<AvatarPickerSheet> createState() => _AvatarPickerSheetState();
}

class _AvatarPickerSheetState extends State<AvatarPickerSheet> {
  late AvatarStyle _style = widget.initialStyle;
  final ScrollController _avatarScrollController = ScrollController();

  @override
  void dispose() {
    _avatarScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: FractionallySizedBox(
      heightFactor: .92,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          children: [
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.outlineVariant,
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    tr(context, 'Vyber si avatar'),
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            SizedBox(
              width: 142,
              height: 116,
              child: Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.center,
                children: [
                  AvatarImage(
                    avatarId: _style.avatarId,
                    style: _style,
                    radius: 54,
                  ),
                  Positioned(
                    right: 0,
                    bottom: 2,
                    child: IconButton.filledTonal(
                      tooltip: tr(context, 'Náhodný avatar'),
                      onPressed: () =>
                          setState(() => _style = AvatarStyle.random()),
                      icon: const Icon(Icons.casino_outlined),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            if (widget.showBusinessLogoAction) ...[
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  key: const Key('business-logo-action'),
                  onPressed: _selectBusinessLogo,
                  icon: Icon(
                    Icons.add_photo_alternate_outlined,
                    color: widget.onBusinessLogoSelected == null
                        ? Theme.of(context).colorScheme.outline
                        : null,
                  ),
                  label: Text(
                    businessTr(context, 'Nahrát vlastní logo'),
                    style: widget.onBusinessLogoSelected == null
                        ? TextStyle(
                            color: Theme.of(context).colorScheme.outline,
                          )
                        : null,
                  ),
                ),
              ),
              const SizedBox(height: 10),
            ],
            Expanded(
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 170),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: Theme.of(context).colorScheme.outlineVariant,
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: Scrollbar(
                      controller: _avatarScrollController,
                      thumbVisibility: true,
                      child: GridView.builder(
                        controller: _avatarScrollController,
                        padding: const EdgeInsets.only(right: 10, bottom: 8),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 4,
                              mainAxisExtent: 68,
                              mainAxisSpacing: 10,
                              crossAxisSpacing: 10,
                            ),
                        itemCount: AvatarStyle.avatarIds.length,
                        itemBuilder: (context, index) {
                          final avatarId = AvatarStyle.avatarIds[index];
                          final selected = avatarId == _style.avatarId;
                          return Center(
                            child: SizedBox.square(
                              dimension: 66,
                              child: InkWell(
                                customBorder: const CircleBorder(),
                                onTap: () => setState(
                                  () => _style = _style.copyWith(
                                    avatarId: avatarId,
                                  ),
                                ),
                                child: DecoratedBox(
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: selected
                                          ? Theme.of(
                                              context,
                                            ).colorScheme.primary
                                          : Theme.of(
                                              context,
                                            ).colorScheme.outlineVariant,
                                      width: selected ? 3 : 1.5,
                                    ),
                                  ),
                                  child: Padding(
                                    padding: const EdgeInsets.all(3),
                                    child: AvatarImage(
                                      avatarId: avatarId,
                                      style: _style,
                                      radius: 27,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _ColorSelector(
                    title: tr(context, 'První barva'),
                    selectedId: _style.startColorId,
                    onSelected: (id) => setState(
                      () => _style = _style.copyWith(startColorId: id),
                    ),
                  ),
                ),
                IconButton(
                  tooltip: tr(context, 'Prohodit barvy'),
                  visualDensity: VisualDensity.compact,
                  onPressed: () => setState(
                    () => _style = _style.copyWith(
                      startColorId: _style.endColorId,
                      endColorId: _style.startColorId,
                    ),
                  ),
                  icon: const Icon(Icons.swap_horiz),
                ),
                Expanded(
                  child: _ColorSelector(
                    title: tr(context, 'Druhá barva'),
                    selectedId: _style.endColorId,
                    onSelected: (id) => setState(
                      () => _style = _style.copyWith(endColorId: id),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              tr(context, 'Směr přechodu'),
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            SegmentedButton<AvatarGradientDirection>(
              segments: const [
                ButtonSegment(
                  value: AvatarGradientDirection.horizontal,
                  icon: Icon(Icons.trending_flat),
                ),
                ButtonSegment(
                  value: AvatarGradientDirection.diagonal,
                  icon: Icon(Icons.north_east),
                ),
                ButtonSegment(
                  value: AvatarGradientDirection.vertical,
                  icon: Icon(Icons.south),
                ),
              ],
              selected: {_style.direction},
              onSelectionChanged: (selection) => setState(
                () => _style = _style.copyWith(direction: selection.single),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              tr(
                context,
                'Opačný směr vytvoříš prohozením první a druhé barvy.',
              ),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.pop(context, _style),
                child: Text(tr(context, 'Uložit')),
              ),
            ),
          ],
        ),
      ),
    ),
  );

  Future<void> _selectBusinessLogo() async {
    final onSelected = widget.onBusinessLogoSelected;
    if (onSelected == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            businessTr(
              context,
              'Vlastní logo připravujeme. Zatím můžeš použít některý z našich avatarů.',
            ),
          ),
        ),
      );
      return;
    }
    final bytes = await pickAndEditBusinessLogo(context);
    if (bytes != null) await onSelected(bytes);
  }
}

class _ColorSelector extends StatelessWidget {
  const _ColorSelector({
    required this.title,
    required this.selectedId,
    required this.onSelected,
  });

  final String title;
  final String selectedId;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Flexible(
        child: Text(
          title,
          style: Theme.of(context).textTheme.titleSmall,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      const SizedBox(width: 6),
      PopupMenuButton<String>(
        tooltip: title,
        onSelected: onSelected,
        itemBuilder: (menuContext) => [
          PopupMenuItem<String>(
            enabled: false,
            height: 210,
            padding: const EdgeInsets.all(10),
            child: SizedBox(
              width: 190,
              height: 190,
              child: GridView.count(
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 4,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                children: AvatarStyle.colors.entries.map((entry) {
                  final selected = entry.key == selectedId;
                  return Semantics(
                    label: entry.key,
                    selected: selected,
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: () => Navigator.pop(menuContext, entry.key),
                      child: Container(
                        decoration: BoxDecoration(
                          color: entry.value,
                          shape: BoxShape.circle,
                          border: selected
                              ? Border.all(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurface,
                                  width: 3,
                                )
                              : null,
                        ),
                        child: selected
                            ? const Icon(
                                Icons.check,
                                color: Colors.white,
                                size: 18,
                              )
                            : null,
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
        ],
        child: Container(
          height: 38,
          padding: const EdgeInsets.only(left: 7, right: 2),
          decoration: BoxDecoration(
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: AvatarStyle.colors[selectedId],
                  shape: BoxShape.circle,
                ),
              ),
              const Icon(Icons.arrow_drop_down, size: 22),
            ],
          ),
        ),
      ),
    ],
  );
}
