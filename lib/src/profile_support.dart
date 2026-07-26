part of '../main.dart';

class AvatarImage extends StatelessWidget {
  const AvatarImage({super.key, required this.avatarId, this.radius = 24});

  final String avatarId;
  final double radius;

  @override
  Widget build(BuildContext context) => CircleAvatar(
    radius: radius,
    backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
    child: ClipOval(
      child: Image.asset(
        'assets/avatars/avatar_$avatarId.png',
        width: radius * 2,
        height: radius * 2,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => Icon(Icons.person_outline, size: radius),
      ),
    ),
  );
}

class AvatarPickerSheet extends StatelessWidget {
  const AvatarPickerSheet({super.key, required this.selectedId});

  static const avatarIds = [
    'fox',
    'owl',
    'otter',
    'raccoon',
    'robot',
    'astronaut',
    'cactus',
    'mushroom',
    'moon',
    'comet',
    'cat',
    'dragon',
    'mountain',
    'lightning',
    'controller',
    'octopus',
  ];
  final String selectedId;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: FractionallySizedBox(
      heightFactor: .72,
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
            const SizedBox(height: 16),
            Text(
              tr(context, 'Vyber si avatar'),
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: GridView.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 4,
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                ),
                itemCount: avatarIds.length,
                itemBuilder: (context, index) {
                  final avatarId = avatarIds[index];
                  final selected = avatarId == selectedId;
                  return Semantics(
                    button: true,
                    selected: selected,
                    label: avatarId,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(999),
                      onTap: () => Navigator.pop(context, avatarId),
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: selected
                                ? Theme.of(context).colorScheme.primary
                                : Colors.transparent,
                            width: 3,
                          ),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(3),
                          child: AvatarImage(avatarId: avatarId, radius: 32),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class NotificationsPage extends StatelessWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(tr(context, 'Oznámení'))),
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.notifications_none_rounded,
              size: 48,
              color: Theme.of(context).colorScheme.outline,
            ),
            const SizedBox(height: 12),
            Text(
              tr(context, 'Zatím nemáš žádná oznámení.'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ],
        ),
      ),
    ),
  );
}
