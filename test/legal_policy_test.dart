import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/legal_policy.dart';
import 'package:shoutout/web_environment.dart';
import 'package:shoutout/archive_identity_disclosure.dart';

void main() {
  test(
    'identity stays off and requires independent disclosure and lifecycle gates',
    () {
      final config =
          jsonDecode(File('config/dev.json').readAsStringSync())
              as Map<String, dynamic>;
      expect(WebEnvironment.fromJson(config).serverArchiveIdentity, isFalse);
      for (final value in [null, 'true', 1]) {
        expect(
          () => WebEnvironment.fromJson({
            ...config,
            'serverArchiveIdentity': value,
          }),
          throwsStateError,
        );
      }
      expect(
        () =>
            WebEnvironment.fromJson({...config, 'serverArchiveIdentity': true}),
        throwsStateError,
      );
      final prepared = WebEnvironment.fromJson({
        ...config,
        'serverArchiveIdentity': true,
        'serverContentLifecycle': true,
        'archiveDisclosureEnabled': true,
        'legalVersion': '2099-01-01',
      });
      expect(prepared.serverArchiveIdentity, isTrue);
      expect(
        () => WebEnvironment.fromJson({...config, 'legalVersion': null}),
        throwsStateError,
      );
      for (final language in ['cs', 'en', 'de', 'pl', 'sk', 'uk', 'vi']) {
        expect(archiveIdentityDisclosure(language).length, greaterThan(150));
      }
    },
  );
  test('approved archive version is prepared without activation', () {
    final prepared = LegalPolicy(
      archiveDisclosureEnabled: true,
      version: LegalPolicy.preparedArchiveVersion,
    );
    expect(prepared.acceptanceDocument, 'acceptance_2026_11_27');
    expect(LegalPolicy().version, LegalPolicy.legacyVersion);
  });
  test('inactive policy preserves the current version and acceptance', () {
    final policy = LegalPolicy();
    expect(policy.version, '2026-07-25');
    expect(policy.acceptanceDocument, 'acceptance_2026_07_25');
    expect(() => LegalPolicy(version: '2099-01-01'), throwsStateError);
    expect(() => LegalPolicy(archiveDisclosureEnabled: true), throwsStateError);
    expect(
      () => LegalPolicy(archiveDisclosureEnabled: true, version: '2099-02-31'),
      throwsStateError,
    );
  });
  test(
    'archive disclosure is independently prepared before enabling lifecycle readers',
    () {
      final config =
          jsonDecode(File('config/dev.json').readAsStringSync())
              as Map<String, dynamic>;
      final inactive = WebEnvironment.fromJson(config);
      expect(inactive.legalPolicy.archiveDisclosureEnabled, isFalse);
      final disclosure = WebEnvironment.fromJson({
        ...config,
        'archiveDisclosureEnabled': true,
        'legalVersion': '2099-01-01',
        'serverContentLifecycle': false,
      });
      expect(disclosure.serverContentLifecycle, isFalse);
      expect(disclosure.legalPolicy.archiveDisclosureEnabled, isTrue);
      expect(
        disclosure.legalPolicy.acceptanceDocument,
        'acceptance_2099_01_01',
      );
    },
  );
}
