part of '../main.dart';

class FeedPage extends StatefulWidget {
  const FeedPage({
    super.key,
    required this.shouts,
    required this.isLoading,
    required this.onSave,
    required this.onReaction,
    required this.onNotifications,
  });

  final List<Shout> shouts;
  final bool isLoading;
  final ValueChanged<Shout> onSave;
  final void Function(Shout shout, {required bool like}) onReaction;
  final VoidCallback onNotifications;

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> {
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
  String? _selectedCategory;
  double _radius = 5;
  FeedOrder _order = FeedOrder.nearest;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final filterValueStyle = TextStyle(
      fontSize: 12,
      fontWeight: FontWeight.w600,
      color: colors.onSurface,
    );
    final filterLabelStyle = TextStyle(
      fontSize: 10,
      color: colors.onSurfaceVariant,
    );
    final filteredShouts =
        widget.shouts.where((shout) {
          return shout.distanceKm <= _radius &&
              (_selectedCategory == null ||
                  shout.categories.contains(_selectedCategory));
        }).toList()..sort(
          (a, b) => switch (_order) {
            FeedOrder.nearest => a.distanceKm.compareTo(b.distanceKm),
            FeedOrder.popular => b.likes.compareTo(a.likes),
            FeedOrder.endingSoon => a.expiresAt.compareTo(b.expiresAt),
          },
        );
    final shouts = [
      ...filteredShouts.where((shout) => !shout.isLowRated),
      ...filteredShouts.where((shout) => shout.isLowRated),
    ];

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: _shoutSurface,
      ),
      child: CustomScrollView(
        clipBehavior: Clip.none,
        slivers: [
          SliverToBoxAdapter(
            child: Stack(
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: 18),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Color(0xFF1496A8),
                          _shoutPrimary,
                          _shoutPrimaryDark,
                        ],
                        stops: [0, .4, 1],
                      ),
                    ),
                    child: SafeArea(
                      bottom: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 6, 20, 28),
                        child: Column(
                          children: [
                            Stack(
                              alignment: Alignment.center,
                              children: [
                                Align(
                                  alignment: Alignment.centerLeft,
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Transform.rotate(
                                        angle: -.14,
                                        child: const Icon(
                                          Icons.campaign_rounded,
                                          size: 26,
                                          color: Colors.white,
                                        ),
                                      ),
                                      SizedBox(width: 7),
                                      Text(
                                        'ShoutOut',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w900,
                                          fontSize: 24,
                                          letterSpacing: -.5,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: IconButton(
                                    tooltip: tr(context, 'Oznámení'),
                                    onPressed: widget.onNotifications,
                                    icon: const Icon(
                                      Icons.notifications_none_rounded,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Divider(
                              height: 1,
                              color: Colors.white.withValues(alpha: .2),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  flex: 4,
                                  child: DropdownButtonFormField<double>(
                                    initialValue: _radius,
                                    isExpanded: true,
                                    iconSize: 20,
                                    alignment: AlignmentDirectional.center,
                                    style: filterValueStyle,
                                    decoration: InputDecoration(
                                      hintText: tr(context, 'Vzdálenost'),
                                      hintStyle: filterLabelStyle,
                                      prefixIcon: const Icon(
                                        Icons.location_on_outlined,
                                        color: _shoutPrimary,
                                        size: 18,
                                      ),
                                      prefixIconConstraints:
                                          const BoxConstraints(minWidth: 26),
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(12),
                                        borderSide: BorderSide.none,
                                      ),
                                      filled: true,
                                      fillColor: Colors.white,
                                      isDense: true,
                                      contentPadding:
                                          const EdgeInsets.symmetric(
                                            horizontal: 5,
                                            vertical: 8,
                                          ),
                                    ),
                                    items: const [1, 3, 5, 10, 20, 50]
                                        .map(
                                          (value) => DropdownMenuItem(
                                            value: value.toDouble(),
                                            child: Center(
                                              child: Text(
                                                '$value km',
                                                style: filterValueStyle,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                          ),
                                        )
                                        .toList(),
                                    onChanged: (value) =>
                                        setState(() => _radius = value!),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  flex: 4,
                                  child: DropdownButtonFormField<FeedOrder>(
                                    initialValue: _order,
                                    isExpanded: true,
                                    iconSize: 20,
                                    alignment: AlignmentDirectional.center,
                                    style: filterValueStyle,
                                    decoration: InputDecoration(
                                      hintText: tr(context, 'Řazení'),
                                      hintStyle: filterLabelStyle,
                                      prefixIcon: const Icon(
                                        Icons.schedule_outlined,
                                        color: _shoutPrimary,
                                        size: 18,
                                      ),
                                      prefixIconConstraints:
                                          const BoxConstraints(minWidth: 26),
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(12),
                                        borderSide: BorderSide.none,
                                      ),
                                      filled: true,
                                      fillColor: Colors.white,
                                      isDense: true,
                                      contentPadding:
                                          const EdgeInsets.symmetric(
                                            horizontal: 5,
                                            vertical: 8,
                                          ),
                                    ),
                                    selectedItemBuilder: (context) => FeedOrder
                                        .values
                                        .map(
                                          (value) => Center(
                                            child: Text(
                                              tr(context, value.compactLabel),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: filterValueStyle,
                                            ),
                                          ),
                                        )
                                        .toList(),
                                    items: FeedOrder.values
                                        .map(
                                          (value) => DropdownMenuItem(
                                            value: value,
                                            child: Center(
                                              child: Text(
                                                tr(context, value.label),
                                                style: filterValueStyle,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                          ),
                                        )
                                        .toList(),
                                    onChanged: (value) =>
                                        setState(() => _order = value!),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  flex: 5,
                                  child: DropdownButtonFormField<String?>(
                                    initialValue: _selectedCategory,
                                    isExpanded: true,
                                    iconSize: 20,
                                    alignment: AlignmentDirectional.center,
                                    style: filterValueStyle,
                                    decoration: InputDecoration(
                                      hintText: tr(context, 'Kategorie'),
                                      hintStyle: filterLabelStyle,
                                      prefixIcon: const Icon(
                                        Icons.grid_view_rounded,
                                        color: _shoutPrimary,
                                        size: 18,
                                      ),
                                      prefixIconConstraints:
                                          const BoxConstraints(minWidth: 26),
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(12),
                                        borderSide: BorderSide.none,
                                      ),
                                      filled: true,
                                      fillColor: Colors.white,
                                      isDense: true,
                                      contentPadding:
                                          const EdgeInsets.symmetric(
                                            horizontal: 5,
                                            vertical: 8,
                                          ),
                                    ),
                                    items: [
                                      DropdownMenuItem<String?>(
                                        value: null,
                                        child: Center(
                                          child: Text(
                                            tr(context, 'Vše'),
                                            style: filterValueStyle,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      ),
                                      ..._categories.map(
                                        (category) => DropdownMenuItem<String?>(
                                          value: category,
                                          child: Center(
                                            child: Text(
                                              tr(context, category),
                                              style: filterValueStyle,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ],
                                    onChanged: (value) => setState(
                                      () => _selectedCategory = value,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                const Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: SizedBox(
                    height: 36,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: _shoutBackground,
                        borderRadius: BorderRadius.vertical(
                          top: Radius.circular(28),
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 24,
                  child: IgnorePointer(
                    child: Container(
                      height: 12,
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Color(0x40074B57), Colors.transparent],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          if (widget.isLoading)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (shouts.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyState(
                icon: Icons.location_off_outlined,
                title: tr(context, 'V tomto okolí zatím nejsou žádné shouty.'),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 180),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate((context, index) {
                  if (index.isOdd) return const SizedBox(height: 12);
                  final shout = shouts[index ~/ 2];
                  return RatedShoutCard(
                    shout: shout,
                    onSave: () => widget.onSave(shout),
                    onReaction: (like) => widget.onReaction(shout, like: like),
                  );
                }, childCount: shouts.length * 2 - 1),
              ),
            ),
        ],
      ),
    );
  }
}

class TealSectionHeader extends StatelessWidget {
  const TealSectionHeader({
    super.key,
    required this.title,
    required this.icon,
    this.controls,
  });

  final String title;
  final IconData icon;
  final Widget? controls;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF1496A8), _shoutPrimary, _shoutPrimaryDark],
              stops: [0, .4, 1],
            ),
          ),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                20,
                6,
                20,
                controls == null ? 20 : 28,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Stack(
                    alignment: Alignment.center,
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Transform.rotate(
                              angle: -.14,
                              child: Icon(icon, color: Colors.white, size: 25),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              title,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                fontSize: 24,
                                letterSpacing: -.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: IconButton(
                          tooltip: tr(context, 'Oznámení'),
                          onPressed: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const NotificationsPage(),
                            ),
                          ),
                          icon: const Icon(
                            Icons.notifications_none_rounded,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Divider(height: 1, color: Colors.white.withValues(alpha: .2)),
                  if (controls != null) ...[
                    const SizedBox(height: 10),
                    controls!,
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
      const Positioned(
        left: 0,
        right: 0,
        bottom: 0,
        child: SizedBox(
          height: 36,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: _shoutBackground,
              borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            ),
          ),
        ),
      ),
      Positioned(
        left: 0,
        right: 0,
        bottom: 24,
        child: IgnorePointer(
          child: Container(
            height: 12,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0x40074B57), Colors.transparent],
              ),
            ),
          ),
        ),
      ),
    ],
  );
}
