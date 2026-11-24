// Checked static activation prototype. No live control document or deployment.
export function moderationAuthorityCandidate(source) {
  const off = 'return false; // moderation-authority-gate', on = 'return true; // moderation-authority-gate';
  const oldCount = source.split(off).length - 1, newCount = source.split(on).length - 1;
  if (oldCount === 0 && newCount === 1) return source;
  if (oldCount !== 1 || newCount !== 0) throw new Error('moderation-authority-rules-source-drift');
  return source.replace(off, on);
}
