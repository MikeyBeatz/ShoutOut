import { HttpsError } from 'firebase-functions/v2/https';

export const legacyLegalVersion = '2026-07-25';
// Approved preparation only; configuration stays on the legacy policy.
export const preparedArchiveLegalVersion = '2026-11-27';
// Activation chooses the public version separately. This preparation changes
// neither the live document text nor the acceptance document used by clients.
export const legalPolicyConfiguration = Object.freeze({ archiveDisclosureEnabled: false, version: legacyLegalVersion });

export function legalPolicy({ archiveDisclosureEnabled = false, version = legacyLegalVersion } = {}) {
  const date = typeof version === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(version) ? new Date(version + 'T00:00:00.000Z') : null;
  if (typeof archiveDisclosureEnabled !== 'boolean' || !date || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== version || (archiveDisclosureEnabled ? version === legacyLegalVersion : version !== legacyLegalVersion)) {
    throw new Error('invalid-legal-policy');
  }
  return Object.freeze({ archiveDisclosureEnabled, version, acceptanceDocument: `acceptance_${version.replaceAll('-', '_')}` });
}
export const currentLegalPolicy = () => legalPolicy(legalPolicyConfiguration);

export function assertCaptureDisclosure(policy, enabled) {
  if (typeof enabled !== 'boolean') throw new Error('invalid-capture-disclosure-option');
  if (enabled && !legalPolicy(policy).archiveDisclosureEnabled) {
    throw new HttpsError('failed-precondition', 'Archive disclosure must precede content capture.');
  }
}
