part of '../main.dart';

class _StaffShouts extends StatefulWidget {
  const _StaffShouts({required this.role});
  final AccountRole role;

  @override
  State<_StaffShouts> createState() => _StaffShoutsState();
}

class _StaffShoutsState extends State<_StaffShouts> {
  final _countryController = TextEditingController();
  final _subdivisionController = TextEditingController();
  final _previewAddressController = TextEditingController();
  String? _countryCode;
  String? _subdivisionCode;
  AddressSelection? _previewLocation;
  double _previewRadiusKm = 10;

  bool get _hasGlobalAccess => widget.role.isAtLeast(AccountRole.administrator);

  @override
  void dispose() {
    _countryController.dispose();
    _subdivisionController.dispose();
    _previewAddressController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('accountRoles')
          .doc(uid)
          .snapshots(),
      builder: (context, roleSnapshot) {
        if (roleSnapshot.hasError) {
          return const Center(
            child: Text('Regionální oprávnění se nepodařilo načíst.'),
          );
        }
        if (!roleSnapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final rawScope = roleSnapshot.data!.data()?['moderationScope'];
        final scope = rawScope is Map<String, dynamic>
            ? rawScope
            : const <String, dynamic>{};
        final countries = _stringList(scope['countries']);
        final subdivisions = _stringList(scope['subdivisions']);
        final global = _hasGlobalAccess || scope['global'] == true;
        return Column(
          children: [
            _RegionFilter(
              global: global,
              countries: countries,
              subdivisions: subdivisions,
              countryController: _countryController,
              subdivisionController: _subdivisionController,
              selectedCountry: _countryCode,
              selectedSubdivision: _subdivisionCode,
              onApply: (country, subdivision) => setState(() {
                _countryCode = country;
                _subdivisionCode = subdivision;
                _previewLocation = null;
                _previewAddressController.clear();
              }),
              previewAddressController: _previewAddressController,
              previewLocation: _previewLocation,
              previewRadiusKm: _previewRadiusKm,
              onPreviewSelected: (selection) =>
                  setState(() => _previewLocation = selection),
              onPreviewRadiusChanged: (radius) =>
                  setState(() => _previewRadiusKm = radius),
              onPreviewCleared: () => setState(() {
                _previewLocation = null;
                _previewAddressController.clear();
              }),
            ),
            Expanded(
              child: !global && countries.isEmpty && subdivisions.isEmpty
                  ? const _MissingRegionAssignment()
                  : _RegionalShoutList(
                      countryCode: _countryCode,
                      subdivisionCode: _subdivisionCode,
                      global: global,
                      allowedCountries: countries,
                      allowedSubdivisions: subdivisions,
                      previewLocation: _previewLocation,
                      previewRadiusKm: _previewRadiusKm,
                    ),
            ),
          ],
        );
      },
    );
  }
}

List<String> _stringList(Object? value) => value is List
    ? value.whereType<String>().where((item) => item.isNotEmpty).toList()
    : const [];

class _RegionFilter extends StatelessWidget {
  const _RegionFilter({
    required this.global,
    required this.countries,
    required this.subdivisions,
    required this.countryController,
    required this.subdivisionController,
    required this.selectedCountry,
    required this.selectedSubdivision,
    required this.onApply,
    required this.previewAddressController,
    required this.previewLocation,
    required this.previewRadiusKm,
    required this.onPreviewSelected,
    required this.onPreviewRadiusChanged,
    required this.onPreviewCleared,
  });

  final bool global;
  final List<String> countries;
  final List<String> subdivisions;
  final TextEditingController countryController;
  final TextEditingController subdivisionController;
  final String? selectedCountry;
  final String? selectedSubdivision;
  final void Function(String? country, String? subdivision) onApply;
  final TextEditingController previewAddressController;
  final AddressSelection? previewLocation;
  final double previewRadiusKm;
  final ValueChanged<AddressSelection> onPreviewSelected;
  final ValueChanged<double> onPreviewRadiusChanged;
  final VoidCallback onPreviewCleared;

  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).colorScheme.surfaceContainerLowest,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Wrap(
        spacing: 12,
        runSpacing: 12,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          if (global) ...[
            SizedBox(
              width: 150,
              child: TextField(
                controller: countryController,
                textCapitalization: TextCapitalization.characters,
                maxLength: 2,
                decoration: const InputDecoration(
                  labelText: 'Země (ISO)',
                  counterText: '',
                ),
              ),
            ),
            SizedBox(
              width: 190,
              child: TextField(
                controller: subdivisionController,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'Oblast (ISO 3166-2)',
                ),
              ),
            ),
            FilledButton.icon(
              onPressed: () => onApply(
                _normalizedCode(countryController.text),
                _normalizedCode(subdivisionController.text),
              ),
              icon: const Icon(Icons.filter_alt_outlined),
              label: const Text('Použít'),
            ),
            TextButton(
              onPressed: () {
                countryController.clear();
                subdivisionController.clear();
                onApply(null, null);
              },
              child: const Text('Celý svět'),
            ),
          ] else ...[
            const Text('Přidělené regiony:'),
            for (final code in countries)
              FilterChip(
                label: Text(code),
                selected: selectedCountry == code,
                onSelected: (_) => onApply(code, null),
              ),
            for (final code in subdivisions)
              FilterChip(
                label: Text(code),
                selected: selectedSubdivision == code,
                onSelected: (_) => onApply(null, code),
              ),
          ],
          SizedBox(
            width: 340,
            child: AddressAutocompleteField(
              controller: previewAddressController,
              countryCode:
                  selectedCountry ??
                  (selectedSubdivision?.split('-').first) ??
                  (countries.isNotEmpty ? countries.first : ''),
              label: 'Ruční poloha pro náhled',
              onSelected: onPreviewSelected,
            ),
          ),
          DropdownButton<double>(
            value: previewRadiusKm,
            items: const [5.0, 10.0, 25.0, 50.0]
                .map(
                  (radius) => DropdownMenuItem(
                    value: radius,
                    child: Text('${radius.toInt()} km'),
                  ),
                )
                .toList(),
            onChanged: (radius) {
              if (radius != null) onPreviewRadiusChanged(radius);
            },
          ),
          if (previewLocation != null)
            TextButton.icon(
              onPressed: onPreviewCleared,
              icon: const Icon(Icons.my_location_outlined),
              label: const Text('Zrušit ruční polohu'),
            ),
        ],
      ),
    ),
  );
}

String? _normalizedCode(String value) {
  final normalized = value.trim().toUpperCase();
  return normalized.isEmpty ? null : normalized;
}

class _MissingRegionAssignment extends StatelessWidget {
  const _MissingRegionAssignment();
  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(24),
      child: Text(
        'Nemáte přidělený žádný moderátorský region. Obraťte se na administrátora.',
        textAlign: TextAlign.center,
      ),
    ),
  );
}

class _RegionalShoutList extends StatelessWidget {
  const _RegionalShoutList({
    required this.countryCode,
    required this.subdivisionCode,
    required this.global,
    required this.allowedCountries,
    required this.allowedSubdivisions,
    required this.previewLocation,
    required this.previewRadiusKm,
  });

  final String? countryCode;
  final String? subdivisionCode;
  final bool global;
  final List<String> allowedCountries;
  final List<String> allowedSubdivisions;
  final AddressSelection? previewLocation;
  final double previewRadiusKm;

  @override
  Widget build(BuildContext context) {
    var effectiveCountry = countryCode;
    var effectiveSubdivision = subdivisionCode;
    if (!global) {
      if (effectiveSubdivision == null && effectiveCountry == null) {
        if (allowedSubdivisions.isNotEmpty) {
          effectiveSubdivision = allowedSubdivisions.first;
        } else if (allowedCountries.isNotEmpty) {
          effectiveCountry = allowedCountries.first;
        }
      }
      if (effectiveCountry != null &&
          !allowedCountries.contains(effectiveCountry)) {
        return const _MissingRegionAssignment();
      }
      if (effectiveSubdivision != null &&
          !allowedSubdivisions.contains(effectiveSubdivision)) {
        return const _MissingRegionAssignment();
      }
    }

    Query<Map<String, dynamic>> query = FirebaseFirestore.instance
        .collection('shouts')
        .where('status', isEqualTo: 'active');
    if (effectiveSubdivision != null) {
      query = query.where(
        'geography.subdivisionCode',
        isEqualTo: effectiveSubdivision,
      );
    } else if (effectiveCountry != null) {
      query = query.where('geography.countryCode', isEqualTo: effectiveCountry);
    }
    query = query.orderBy('createdAt', descending: true).limit(50);
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: query.snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return const Center(
            child: Text('Shouty se nepodařilo načíst. Zkontrolujte indexy.'),
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final documents = snapshot.data!.docs.where((document) {
          final preview = previewLocation;
          if (preview == null) return true;
          final point = document.data()['location'];
          if (point is! GeoPoint) return false;
          final distanceMeters = Geolocator.distanceBetween(
            preview.latitude,
            preview.longitude,
            point.latitude,
            point.longitude,
          );
          return distanceMeters <= previewRadiusKm * 1000;
        }).toList();
        if (documents.isEmpty) {
          return const Center(
            child: Text('V tomto regionu nejsou aktivní shouty.'),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: documents.length,
          itemBuilder: (context, index) {
            final shout = Shout.fromDocument(documents[index]);
            final region = shout.geography.regionLabel;
            return Card(
              child: ListTile(
                leading: const Icon(Icons.campaign_outlined),
                title: Text(shout.title),
                subtitle: Text(
                  '${shout.author} · ${region.isEmpty ? 'region se zpracovává' : region}\n${shout.text}',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
                isThreeLine: true,
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => ShoutDetailPage(
                      shout: shout,
                      onSave: () {},
                      onReaction: (_) async {},
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}
