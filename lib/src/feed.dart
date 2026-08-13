part of '../main.dart';

class FeedFilters {
  String? selectedCategory;
  double radius = 5;
  FeedOrder order = FeedOrder.nearest;
}

class FeedPage extends StatefulWidget {
  const FeedPage({
    super.key,
    required this.shouts,
    required this.isLoading,
    required this.onSave,
    required this.onReaction,
    required this.onNotifications,
    required this.filters,
    required this.followedUserIds,
  });

  final List<Shout> shouts;
  final bool isLoading;
  final ValueChanged<Shout> onSave;
  final Future<void> Function(Shout shout, {required bool like}) onReaction;
  final VoidCallback onNotifications;
  final FeedFilters filters;
  final Set<String> followedUserIds;

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _CompactFilterDropdown<T> extends StatelessWidget {
  const _CompactFilterDropdown({
    required this.value,
    required this.items,
    required this.onChanged,
    required this.hint,
    required this.prefixIcon,
    required this.style,
    required this.hintStyle,
    required this.menuWidth,
    this.selectedItemBuilder,
  });

  final T value;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?> onChanged;
  final String hint;
  final IconData prefixIcon;
  final TextStyle style;
  final TextStyle hintStyle;
  final double menuWidth;
  final DropdownButtonBuilder? selectedItemBuilder;

  @override
  Widget build(BuildContext context) {
    return InputDecorator(
      isEmpty: false,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: hintStyle,
        prefixIcon: Icon(prefixIcon, color: _shoutPrimary, size: 18),
        prefixIconConstraints: const BoxConstraints(minWidth: 26),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        filled: true,
        fillColor: Theme.of(context).colorScheme.surface,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 5, vertical: 8),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          items: items,
          selectedItemBuilder: selectedItemBuilder,
          onChanged: onChanged,
          isExpanded: true,
          isDense: true,
          itemHeight: 48,
          menuWidth: menuWidth,
          borderRadius: BorderRadius.circular(14),
          dropdownColor: Theme.of(context).colorScheme.surface,
          iconSize: 20,
          alignment: AlignmentDirectional.center,
          style: style,
        ),
      ),
    );
  }
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
  double _categoryMenuWidth(BuildContext context, TextStyle style) {
    var widest = 0.0;
    for (final category in ['Vše', ..._categories]) {
      final painter = TextPainter(
        text: TextSpan(text: tr(context, category), style: style),
        textDirection: Directionality.of(context),
        maxLines: 1,
      )..layout();
      if (painter.width > widest) widest = painter.width;
    }
    return (widest + 32).clamp(112.0, 168.0);
  }

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
          return shout.distanceKm <= widget.filters.radius &&
              (widget.filters.selectedCategory == null ||
                  shout.categories.contains(widget.filters.selectedCategory));
        }).toList()..sort((a, b) {
          return switch (widget.filters.order) {
            FeedOrder.nearest => a.distanceKm.compareTo(b.distanceKm),
            FeedOrder.popular => b.likes.compareTo(a.likes),
            FeedOrder.endingSoon => a.expiresAt.compareTo(b.expiresAt),
            FeedOrder.followed => () {
              final followedOrder =
                  (widget.followedUserIds.contains(b.authorId) ? 1 : 0)
                      .compareTo(
                        widget.followedUserIds.contains(a.authorId) ? 1 : 0,
                      );
              return followedOrder != 0
                  ? followedOrder
                  : a.distanceKm.compareTo(b.distanceKm);
            }(),
          };
        });
    final spotlightShouts = widget.shouts
        .where((shout) => shout.isActiveSpotlightWithinRange)
        .toList();
    final visibleFeedShouts = filteredShouts
        .where((shout) => !shout.businessSpotlight || shout.businessHighlighted)
        .toList();
    final shouts = [
      ...visibleFeedShouts.where((shout) => !shout.isLowRated),
      ...visibleFeedShouts.where((shout) => shout.isLowRated),
    ];

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value:
          (Theme.of(context).brightness == Brightness.dark
                  ? SystemUiOverlayStyle.light
                  : SystemUiOverlayStyle.dark)
              .copyWith(
                statusBarColor: Colors.transparent,
                systemNavigationBarColor: Theme.of(context).colorScheme.surface,
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
                                      Image.asset(
                                        'assets/branding/feed_mark.png',
                                        width: 44,
                                        height: 44,
                                        fit: BoxFit.contain,
                                        cacheWidth: 160,
                                        filterQuality: FilterQuality.high,
                                        semanticLabel: 'ShoutOut',
                                      ),
                                      SizedBox(width: 7),
                                      Text(
                                        'ShoutOut',
                                        style: TextStyle(
                                          fontFamily: 'Urbanist',
                                          fontWeight: FontWeight.w500,
                                          fontSize: 28,
                                          letterSpacing: -.8,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: NotificationBellButton(
                                    onPressed: widget.onNotifications,
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
                                  child: _CompactFilterDropdown<double>(
                                    value: widget.filters.radius,
                                    menuWidth: 104,
                                    hint: tr(context, 'Vzdálenost'),
                                    prefixIcon: Icons.location_on_outlined,
                                    style: filterValueStyle,
                                    hintStyle: filterLabelStyle,
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
                                    onChanged: (value) => setState(
                                      () => widget.filters.radius = value!,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  flex: 4,
                                  child: _CompactFilterDropdown<FeedOrder>(
                                    value: widget.filters.order,
                                    menuWidth: 112,
                                    hint: tr(context, 'Řazení'),
                                    prefixIcon: Icons.schedule_outlined,
                                    style: filterValueStyle,
                                    hintStyle: filterLabelStyle,
                                    selectedItemBuilder: (context) => FeedOrder
                                        .values
                                        .map(
                                          (value) => Center(
                                            child: Text(
                                              tr(context, value.label),
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
                                    onChanged: (value) => setState(
                                      () => widget.filters.order = value!,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  flex: 5,
                                  child: _CompactFilterDropdown<String?>(
                                    value: widget.filters.selectedCategory,
                                    menuWidth: _categoryMenuWidth(
                                      context,
                                      filterValueStyle,
                                    ),
                                    hint: tr(context, 'Kategorie'),
                                    prefixIcon: Icons.grid_view_rounded,
                                    style: filterValueStyle,
                                    hintStyle: filterLabelStyle,
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
                                      () => widget.filters.selectedCategory =
                                          value,
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
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: SizedBox(
                    height: 36,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: Theme.of(context).scaffoldBackgroundColor,
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

          if (spotlightShouts.isNotEmpty)
            SliverPersistentHeader(
              pinned: true,
              delegate: SpotlightHeaderDelegate(
                child: BusinessSpotlightCarousel(
                  shouts: spotlightShouts,
                  onSave: widget.onSave,
                  onReaction: widget.onReaction,
                ),
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
    required this.onSave,
    required this.onReaction,
    this.controls,
  });

  final String title;
  final IconData icon;
  final ValueChanged<Shout> onSave;
  final Future<void> Function(Shout shout, {required bool like}) onReaction;
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
                                fontFamily: 'Urbanist',
                                color: Colors.white,
                                fontWeight: FontWeight.w500,
                                fontSize: 24,
                                letterSpacing: -.2,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: NotificationBellButton(
                          onPressed: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => NotificationsPage(
                                onSave: onSave,
                                onReaction: onReaction,
                              ),
                            ),
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
      Positioned(
        left: 0,
        right: 0,
        bottom: 0,
        child: SizedBox(
          height: 36,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Theme.of(context).scaffoldBackgroundColor,
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
