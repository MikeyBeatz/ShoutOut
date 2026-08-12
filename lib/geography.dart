class ShoutGeography {
  const ShoutGeography({
    required this.geohash,
    this.countryCode,
    this.subdivisionCode,
    this.localityName,
    this.providerPlaceId,
  });

  final String geohash;
  final String? countryCode;
  final String? subdivisionCode;
  final String? localityName;
  final String? providerPlaceId;

  factory ShoutGeography.fromData(Map<String, dynamic>? data) {
    String? value(String key) {
      final raw = data?[key];
      return raw is String && raw.isNotEmpty ? raw : null;
    }

    return ShoutGeography(
      geohash: value('geohash') ?? '',
      countryCode: value('countryCode'),
      subdivisionCode: value('subdivisionCode'),
      localityName: value('localityName'),
      providerPlaceId: value('providerPlaceId'),
    );
  }

  String get regionLabel => [
    if (localityName != null) localityName,
    if (subdivisionCode != null) subdivisionCode,
    if (countryCode != null) countryCode,
  ].join(' · ');
}

/// Encodes a point into a provider-independent geohash.
/// Precision 7 represents cells roughly 150 metres wide at the equator.
String encodeGeohash(double latitude, double longitude, {int precision = 7}) {
  if (!latitude.isFinite || latitude < -90 || latitude > 90) {
    throw RangeError.range(latitude, -90, 90, 'latitude');
  }
  if (!longitude.isFinite || longitude < -180 || longitude > 180) {
    throw RangeError.range(longitude, -180, 180, 'longitude');
  }
  if (precision < 1 || precision > 12) {
    throw RangeError.range(precision, 1, 12, 'precision');
  }
  const alphabet = '0123456789bcdefghjkmnpqrstuvwxyz';
  var latitudeRange = (-90.0, 90.0);
  var longitudeRange = (-180.0, 180.0);
  var evenBit = true;
  var bit = 0;
  var character = 0;
  final result = StringBuffer();

  while (result.length < precision) {
    if (evenBit) {
      final midpoint = (longitudeRange.$1 + longitudeRange.$2) / 2;
      if (longitude >= midpoint) {
        character = (character << 1) | 1;
        longitudeRange = (midpoint, longitudeRange.$2);
      } else {
        character <<= 1;
        longitudeRange = (longitudeRange.$1, midpoint);
      }
    } else {
      final midpoint = (latitudeRange.$1 + latitudeRange.$2) / 2;
      if (latitude >= midpoint) {
        character = (character << 1) | 1;
        latitudeRange = (midpoint, latitudeRange.$2);
      } else {
        character <<= 1;
        latitudeRange = (latitudeRange.$1, midpoint);
      }
    }
    evenBit = !evenBit;
    bit++;
    if (bit == 5) {
      result.write(alphabet[character]);
      bit = 0;
      character = 0;
    }
  }
  return result.toString();
}

/// Reduces a precise device coordinate to the public grid used by Shouts.
double publicLocationCoordinate(double coordinate) {
  if (!coordinate.isFinite) {
    throw ArgumentError.value(coordinate, 'coordinate', 'must be finite');
  }
  return (coordinate * 100).roundToDouble() / 100;
}
