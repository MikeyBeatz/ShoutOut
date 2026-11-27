class LegalPolicy {
  LegalPolicy({
    this.archiveDisclosureEnabled = false,
    this.version = legacyVersion,
  }) {
    final date = RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(version)
        ? DateTime.tryParse('${version}T00:00:00Z')
        : null;
    if (date == null ||
        date.toIso8601String().substring(0, 10) != version ||
        (archiveDisclosureEnabled
            ? version == legacyVersion
            : version != legacyVersion)) {
      throw StateError('Invalid legal policy.');
    }
  }

  static const legacyVersion = '2026-07-25';
  static const preparedArchiveVersion = '2026-11-27';
  final bool archiveDisclosureEnabled;
  final String version;
  String get acceptanceDocument => 'acceptance_${version.replaceAll('-', '_')}';
}
