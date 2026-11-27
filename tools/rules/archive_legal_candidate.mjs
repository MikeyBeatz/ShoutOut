// Emulator-only materialization of an explicitly chosen policy. Does not edit
// firestore.rules or expose an apply/deploy entry point.
import { legalPolicy, legacyLegalVersion } from '../../functions/legal_policy.js';
export function archiveLegalRulesCandidate(source, input) {
  const policy = legalPolicy(input);
  if (typeof source !== 'string' || source.split('acceptance_2026_07_25').length !== 3 || source.split("'2026-07-25'").length !== 4) throw new Error('legal-rules-baseline-changed');
  if (!policy.archiveDisclosureEnabled) return source;
  return source.replaceAll('acceptance_2026_07_25', policy.acceptanceDocument).replaceAll(`'${legacyLegalVersion}'`, `'${policy.version}'`);
}
