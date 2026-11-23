// Idempotent cutover renderer. Its deployment is gated by positive client
// compatibility; a prepared source file is not evidence of live Rules.
export function privateReplyDeletionCandidate(source) {
  const before = `        allow update: if false;
        allow delete: if eligibleUser() &&
          (resource.data.authorId == request.auth.uid || isModerator());`;
  const after = `        allow update: if false;
        // Ordinary deletion uses deletePrivateReply in managed environments.
        // Existing moderator removal is closed by a separate decision rollout.
        allow delete: if eligibleUser() &&
          (isModerator() ||
            (!managedFeedProjection() && resource.data.authorId == request.auth.uid));`;
  const normalized = source.replaceAll('\r\n', '\n');
  const oldCount = normalized.split(before).length - 1, newCount = normalized.split(after).length - 1;
  if (oldCount === 0 && newCount === 1) return normalized;
  if (oldCount !== 1 || newCount !== 0) throw new Error('private-reply-delete-proposal-source-drift');
  return normalized.replace(before, after);
}
