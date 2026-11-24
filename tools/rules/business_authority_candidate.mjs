// Checked static variants, never a runtime flag or a live write.
function gate(source, marker, enabled) {
  const off = `return false; // ${marker}`, on = `return true; // ${marker}`;
  const a = source.split(off).length - 1, b = source.split(on).length - 1;
  if (a + b !== 1) throw Error(`${marker}-rules-source-drift`);
  return source.replace(enabled ? off : on, enabled ? on : off);
}
export const businessAuthorityCandidate = source => gate(source, 'business-authority-gate', true);
// Only the historical allow-tests use this baseline. Active variants have their
// own complete deny/read/server integration suites. No deployed file is written.
export const legacyModerationRules = source => gate(gate(source, 'business-authority-gate', false), 'moderation-authority-gate', false);
