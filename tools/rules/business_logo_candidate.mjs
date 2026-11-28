// Local candidate only. The checked-in and deployed gates remain false.
export function businessLogoCandidate(source) {
  const marker = 'return false; // business-logo-gate';
  if (source.split(marker).length !== 2) throw Error('business-logo-gate-source-drift');
  return source.replace(marker, 'return true; // business-logo-gate');
}
