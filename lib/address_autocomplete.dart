import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'l10n/business_text.dart';

const _geoapifyApiKey = String.fromEnvironment('GEOAPIFY_API_KEY');

class AddressSelection {
  const AddressSelection({
    required this.formatted,
    required this.addressLine1,
    required this.city,
    required this.postalCode,
    required this.countryCode,
    required this.latitude,
    required this.longitude,
    required this.placeId,
  });

  final String formatted;
  final String addressLine1;
  final String city;
  final String postalCode;
  final String countryCode;
  final double latitude;
  final double longitude;
  final String placeId;

  factory AddressSelection.fromMap(Map<Object?, Object?> data) =>
      AddressSelection(
        formatted: data['formatted'] as String? ?? '',
        addressLine1: data['addressLine1'] as String? ?? '',
        city: data['city'] as String? ?? '',
        postalCode: data['postalCode'] as String? ?? '',
        countryCode: data['countryCode'] as String? ?? '',
        latitude: (data['latitude'] as num).toDouble(),
        longitude: (data['longitude'] as num).toDouble(),
        placeId: data['placeId'] as String? ?? '',
      );
}

class AddressAutocompleteField extends StatefulWidget {
  const AddressAutocompleteField({
    super.key,
    required this.controller,
    required this.countryCode,
    required this.onSelected,
    this.label = 'Adresa',
    this.enabled = true,
  });

  final TextEditingController controller;
  final String countryCode;
  final ValueChanged<AddressSelection> onSelected;
  final String label;
  final bool enabled;

  @override
  State<AddressAutocompleteField> createState() =>
      _AddressAutocompleteFieldState();
}

class _AddressAutocompleteFieldState extends State<AddressAutocompleteField> {
  Timer? _debounce;
  List<AddressSelection> _suggestions = const [];
  bool _loading = false;
  bool _selecting = false;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _search(String value) async {
    if (_selecting) {
      _selecting = false;
      return;
    }
    _debounce?.cancel();
    if (value.trim().length < 3) {
      setState(() => _suggestions = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      if (!mounted) return;
      setState(() => _loading = true);
      try {
        if (_geoapifyApiKey.isEmpty) return;
        final query = <String, String>{
          'text': value.trim(),
          'limit': '5',
          'format': 'json',
          'apiKey': _geoapifyApiKey,
          if (RegExp(r'^[A-Za-z]{2}$').hasMatch(widget.countryCode))
            'filter': 'countrycode:${widget.countryCode.toLowerCase()}',
        };
        final response = await http.get(
          Uri.https('api.geoapify.com', '/v1/geocode/autocomplete', query),
        );
        if (response.statusCode != 200) return;
        final payload = jsonDecode(response.body) as Map<String, dynamic>;
        final items = (payload['results'] as List<dynamic>? ?? const []).map((
          item,
        ) {
          final data = item as Map<String, dynamic>;
          return AddressSelection(
            formatted: data['formatted'] as String? ?? '',
            addressLine1:
                data['address_line1'] as String? ??
                data['formatted'] as String? ??
                '',
            city:
                data['city'] as String? ??
                data['town'] as String? ??
                data['village'] as String? ??
                '',
            postalCode: data['postcode'] as String? ?? '',
            countryCode: (data['country_code'] as String? ?? '').toUpperCase(),
            latitude: (data['lat'] as num).toDouble(),
            longitude: (data['lon'] as num).toDouble(),
            placeId: data['place_id'] as String? ?? '',
          );
        }).toList();
        if (mounted && widget.controller.text.trim() == value.trim()) {
          setState(() => _suggestions = items);
        }
      } catch (_) {
        if (mounted) setState(() => _suggestions = const []);
      } finally {
        if (mounted) setState(() => _loading = false);
      }
    });
  }

  void _select(AddressSelection selection) {
    _selecting = true;
    widget.controller.text = selection.formatted;
    widget.controller.selection = TextSelection.collapsed(
      offset: widget.controller.text.length,
    );
    setState(() => _suggestions = const []);
    widget.onSelected(selection);
  }

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      TextFormField(
        controller: widget.controller,
        enabled: widget.enabled,
        maxLength: 200,
        keyboardType: TextInputType.streetAddress,
        autofillHints: const [AutofillHints.fullStreetAddress],
        onChanged: _search,
        validator: (value) => (value ?? '').trim().isEmpty
            ? businessTr(context, 'Toto pole je povinné.')
            : null,
        decoration: InputDecoration(
          labelText: widget.label,
          suffixIcon: _loading
              ? const Padding(
                  padding: EdgeInsets.all(14),
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.location_searching_outlined),
        ),
      ),
      if (_suggestions.isNotEmpty)
        Card(
          margin: const EdgeInsets.only(top: 2),
          child: Column(
            children: _suggestions
                .map(
                  (item) => ListTile(
                    dense: true,
                    leading: const Icon(Icons.location_on_outlined),
                    title: Text(
                      item.formatted,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    onTap: () => _select(item),
                  ),
                )
                .toList(),
          ),
        ),
    ],
  );
}
