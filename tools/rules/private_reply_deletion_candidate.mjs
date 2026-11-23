// Local, compilable Rules proposal only. The released firestore.rules stays
// compatible until the server/client cutover has its own acceptance.
export function privateReplyDeletionCandidate(source) {
  const before = `        allow update: if false;
        allow delete: if eligibleUser() &&
          (resource.data.authorId == request.auth.uid || isModerator());`;
  const after = `        allow update: if false;
        // Prototype cutover: ordinary deletion uses deletePrivateReply.
        // Existing moderator removal is closed by a separate decision rollout.
        allow delete: if eligibleUser() &&
          (isModerator() ||
            (!managedFeedProjection() && resource.data.authorId == request.auth.uid));`;
  const normalized = source.replaceAll('\r\n', '\n');
  if (normalized.split(before).length !== 2) throw new Error('private-reply-delete-proposal-source-drift');
  return normalized.replace(before, after);
}
