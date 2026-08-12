part of '../main.dart';

class BusinessPage extends StatelessWidget {
  const BusinessPage({super.key, required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(businessTr(context, 'Business'))),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _BusinessSectionTile(
          icon: Icons.badge_outlined,
          title: businessTr(context, 'Business profil'),
          subtitle: businessTr(context, 'Veřejný název a fakturační údaje'),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => BusinessProfilePage(userId: userId),
            ),
          ),
        ),
        _BusinessSectionTile(
          icon: Icons.location_on_outlined,
          title: businessTr(context, 'Pobočky'),
          subtitle: businessTr(
            context,
            'Adresy používané při publikování Shoutů',
          ),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => BusinessLocationsPage(userId: userId),
            ),
          ),
        ),
        _BusinessSectionTile(
          icon: Icons.account_balance_wallet_outlined,
          title: businessTr(context, 'Tokeny'),
          subtitle: businessTr(
            context,
            'Zůstatek a nákup tokenů pro propagaci',
          ),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => _BusinessComingSoonPage(
                title: businessTr(context, 'Tokeny'),
                message: businessTr(
                  context,
                  'Nákup tokenů kartou, Apple Pay a Google Pay připravujeme.',
                ),
              ),
            ),
          ),
        ),
        _BusinessSectionTile(
          icon: Icons.receipt_long_outlined,
          title: businessTr(context, 'Nákupy a faktury'),
          subtitle: businessTr(context, 'Doklady vystavené na firmu'),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => _BusinessComingSoonPage(
                title: businessTr(context, 'Nákupy a faktury'),
                message: businessTr(
                  context,
                  'Zatím zde nejsou žádné nákupy ani faktury.',
                ),
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

class _BusinessSectionTile extends StatelessWidget {
  const _BusinessSectionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: Icon(icon),
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    ),
  );
}

class BusinessProfilePage extends StatelessWidget {
  const BusinessProfilePage({super.key, required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(businessTr(context, 'Business profil')),
      actions: [
        StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance
              .collection('businessProfiles')
              .doc(userId)
              .snapshots(),
          builder: (context, snapshot) => IconButton(
            tooltip: businessTr(context, 'Upravit údaje'),
            onPressed: snapshot.data?.data() == null
                ? null
                : () => _editBusinessProfile(
                    context,
                    userId,
                    snapshot.data!.data()!,
                  ),
            icon: const Icon(Icons.edit_outlined),
          ),
        ),
      ],
    ),
    body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('businessProfiles')
          .doc(userId)
          .snapshots(),
      builder: (context, snapshot) {
        final data = snapshot.data?.data();
        if (data == null) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                businessTr(
                  context,
                  'Business profil ještě nebyl dokončen. Údaje se doplní po ověření registrační žádosti.',
                ),
                textAlign: TextAlign.center,
              ),
            ),
          );
        }
        final address = [
          data['registryAddress'],
          data['billingCity'],
          data['billingPostalCode'],
          data['countryCode'],
        ].whereType<String>().where((value) => value.isNotEmpty).join(', ');
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _BusinessValue(
              label: businessTr(context, 'Veřejný název'),
              value: data['displayName'],
            ),
            const Divider(),
            _BusinessValue(
              label: businessTr(context, 'Oficiální název firmy'),
              value: data['officialName'],
            ),
            _BusinessValue(
              label: businessTr(context, 'Registrační číslo / IČO'),
              value: data['registrationNumber'],
            ),
            _BusinessValue(label: 'DIČ / VAT ID', value: data['vatId']),
            _BusinessValue(
              label: businessTr(context, 'Fakturační adresa'),
              value: address,
            ),
            _BusinessValue(
              label: businessTr(context, 'Fakturační e-mail'),
              value: data['billingEmail'],
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: () => _editBusinessProfile(context, userId, data),
              icon: const Icon(Icons.edit_outlined),
              label: Text(businessTr(context, 'Upravit údaje')),
            ),
            const SizedBox(height: 12),
            Text(
              businessTr(
                context,
                'Změna právní firmy nebo registračního čísla vyžaduje nové ověření.',
              ),
            ),
          ],
        );
      },
    ),
  );
}

class _BusinessValue extends StatelessWidget {
  const _BusinessValue({required this.label, required this.value});
  final String label;
  final Object? value;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    title: Text(label),
    subtitle: Text(
      value?.toString().trim().isNotEmpty == true ? '$value' : '—',
    ),
  );
}

class BusinessLocationsPage extends StatelessWidget {
  const BusinessLocationsPage({super.key, required this.userId});

  final String userId;

  CollectionReference<Map<String, dynamic>> get _locations => FirebaseFirestore
      .instance
      .collection('businessProfiles')
      .doc(userId)
      .collection('locations');

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(businessTr(context, 'Pobočky')),
      actions: [
        IconButton(
          tooltip: businessTr(context, 'Přidat pobočku'),
          onPressed: () => _showLocationDialog(context, _locations),
          icon: const Icon(Icons.add),
        ),
      ],
    ),
    body: Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: FilledButton.icon(
            onPressed: () => _showLocationDialog(context, _locations),
            icon: const Icon(Icons.add),
            label: Text(businessTr(context, 'Přidat pobočku')),
          ),
        ),
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: _locations.orderBy('createdAt').snapshots(),
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return Center(
                  child: Text(
                    businessTr(context, 'Pobočky se nepodařilo načíst.'),
                  ),
                );
              }
              if (!snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              final locations = snapshot.data!.docs
                  .where((document) => document.data()['deleted'] != true)
                  .toList();
              if (locations.isEmpty) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      businessTr(
                        context,
                        'Zatím nemáte žádnou pobočku. Přidejte ji tlačítkem +.',
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                );
              }
              return ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: locations.length,
                itemBuilder: (context, index) => _BusinessLocationCard(
                  reference: locations[index].reference,
                  data: locations[index].data(),
                ),
              );
            },
          ),
        ),
      ],
    ),
  );
}

class _BusinessLocationCard extends StatefulWidget {
  const _BusinessLocationCard({required this.reference, required this.data});
  final DocumentReference<Map<String, dynamic>> reference;
  final Map<String, dynamic> data;

  @override
  State<_BusinessLocationCard> createState() => _BusinessLocationCardState();
}

class _BusinessLocationCardState extends State<_BusinessLocationCard> {
  final _expansionController = ExpansibleController();
  late final TextEditingController _name;
  late final TextEditingController _address;
  late String _savedAddress;
  AddressSelection? _selectedAddress;
  late bool _active;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.data['displayName'] as String?);
    _address = TextEditingController(text: widget.data['address'] as String?);
    _savedAddress = _address.text.trim();
    _active = widget.data['active'] as bool? ?? true;
  }

  @override
  void dispose() {
    _name.dispose();
    _address.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Card(
    child: ExpansionTile(
      controller: _expansionController,
      leading: Icon(
        _active ? Icons.location_on_outlined : Icons.location_off_outlined,
      ),
      title: Text(
        widget.data['displayName'] as String? ?? businessTr(context, 'Pobočka'),
      ),
      subtitle: Text(widget.data['address'] as String? ?? ''),
      childrenPadding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      children: [
        TextField(
          controller: _name,
          maxLength: 80,
          decoration: InputDecoration(
            labelText: businessTr(context, 'Název pobočky'),
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        AddressAutocompleteField(
          controller: _address,
          countryCode: widget.data['countryCode'] as String? ?? '',
          label: businessTr(context, 'Adresa pobočky'),
          enabled: !_busy,
          onSelected: (selection) => _selectedAddress = selection,
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(businessTr(context, 'Pobočka je aktivní')),
          subtitle: Text(
            businessTr(
              context,
              'Pozastavená pobočka se nenabízí při tvorbě Shoutu.',
            ),
          ),
          value: _active,
          onChanged: _busy ? null : (value) => setState(() => _active = value),
        ),
        Row(
          children: [
            TextButton.icon(
              onPressed: _busy ? null : _delete,
              icon: const Icon(Icons.delete_outline),
              label: Text(tr(context, 'Smazat')),
            ),
            const Spacer(),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(businessTr(context, 'Uložit změny')),
            ),
          ],
        ),
      ],
    ),
  );

  Future<void> _save() async {
    if (_name.text.trim().isEmpty || _address.text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      final address = _address.text.trim();
      final addressChanged = address != _savedAddress;
      final selection = _selectedAddress;
      await widget.reference.update({
        'displayName': _name.text.trim(),
        'address': address,
        'active': _active,
        if (addressChanged)
          'geocodingStatus': selection == null ? 'pending' : 'verified',
        if (addressChanged && selection != null)
          'location': GeoPoint(selection.latitude, selection.longitude),
        if (addressChanged && selection != null)
          'geohash': encodeGeohash(selection.latitude, selection.longitude),
        if (addressChanged && selection != null)
          'providerPlaceId': selection.placeId,
        if (addressChanged && selection != null)
          'countryCode': selection.countryCode,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      _savedAddress = address;
      _selectedAddress = null;
      _expansionController.collapse();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(businessTr(context, 'Změny pobočky byly uloženy.')),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(businessTr(context, 'Smazat pobočku?')),
        content: Text(
          businessTr(
            context,
            'Pobočka zmizí z nabídky. Starší Shouty zůstanou zachované.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(tr(context, 'Zrušit')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(tr(context, 'Smazat')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await widget.reference.update({
      'active': false,
      'deleted': true,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }
}

Future<void> _editBusinessProfile(
  BuildContext context,
  String userId,
  Map<String, dynamic> data,
) async {
  final displayName = TextEditingController(
    text: data['displayName'] as String?,
  );
  final address = TextEditingController(
    text: data['registryAddress'] as String?,
  );
  final city = TextEditingController(text: data['billingCity'] as String?);
  final postalCode = TextEditingController(
    text: data['billingPostalCode'] as String?,
  );
  final email = TextEditingController(text: data['billingEmail'] as String?);
  final save = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(businessTr(context, 'Upravit business profil')),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: displayName,
                decoration: InputDecoration(
                  labelText: businessTr(context, 'Veřejný název'),
                ),
              ),
              TextField(
                controller: address,
                decoration: InputDecoration(
                  labelText: businessTr(context, 'Fakturační adresa'),
                ),
              ),
              TextField(
                controller: city,
                decoration: InputDecoration(
                  labelText: businessTr(context, 'Město'),
                ),
              ),
              TextField(
                controller: postalCode,
                decoration: InputDecoration(
                  labelText: businessTr(context, 'PSČ'),
                ),
              ),
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: InputDecoration(
                  labelText: businessTr(context, 'Fakturační e-mail'),
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: Text(tr(context, 'Zrušit')),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          child: Text(tr(context, 'Uložit')),
        ),
      ],
    ),
  );
  final values = (
    displayName.text.trim(),
    address.text.trim(),
    city.text.trim(),
    postalCode.text.trim(),
    email.text.trim(),
  );
  displayName.dispose();
  address.dispose();
  city.dispose();
  postalCode.dispose();
  email.dispose();
  if (save != true || values.$1.isEmpty || values.$2.isEmpty) return;
  await FirebaseFirestore.instance
      .collection('businessProfiles')
      .doc(userId)
      .update({
        'displayName': values.$1,
        'registryAddress': values.$2,
        'billingCity': values.$3,
        'billingPostalCode': values.$4,
        'billingEmail': values.$5,
        'updatedAt': FieldValue.serverTimestamp(),
      });
}

Future<void> _showLocationDialog(
  BuildContext context,
  CollectionReference<Map<String, dynamic>> locations,
) async {
  final name = TextEditingController();
  final address = TextEditingController();
  AddressSelection? selectedAddress;
  final created = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setDialogState) => AlertDialog(
        title: Text(businessTr(context, 'Přidat pobočku')),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: name,
                  maxLength: 80,
                  decoration: InputDecoration(
                    labelText: businessTr(context, 'Název pobočky'),
                  ),
                ),
                AddressAutocompleteField(
                  controller: address,
                  countryCode: '',
                  label: businessTr(context, 'Adresa pobočky'),
                  onSelected: (selection) =>
                      setDialogState(() => selectedAddress = selection),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(tr(context, 'Zrušit')),
          ),
          FilledButton(
            onPressed: selectedAddress == null
                ? null
                : () => Navigator.pop(dialogContext, true),
            child: Text(businessTr(context, 'Přidat')),
          ),
        ],
      ),
    ),
  );
  final displayName = name.text.trim();
  final locationAddress = address.text.trim();
  name.dispose();
  address.dispose();
  final selection = selectedAddress;
  if (created != true ||
      displayName.isEmpty ||
      locationAddress.isEmpty ||
      selection == null) {
    return;
  }
  await locations.add({
    'displayName': displayName,
    'address': locationAddress,
    'active': true,
    'deleted': false,
    'geocodingStatus': 'verified',
    'location': GeoPoint(selection.latitude, selection.longitude),
    'geohash': encodeGeohash(selection.latitude, selection.longitude),
    'providerPlaceId': selection.placeId,
    'countryCode': selection.countryCode,
    'createdAt': FieldValue.serverTimestamp(),
    'updatedAt': FieldValue.serverTimestamp(),
  });
}

class _BusinessComingSoonPage extends StatelessWidget {
  const _BusinessComingSoonPage({required this.title, required this.message});
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(title)),
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(message, textAlign: TextAlign.center),
      ),
    ),
  );
}
