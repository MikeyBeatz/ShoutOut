// Prototype: close only private removal, after server/client compatibility proof.
export function privateReportRemovalCandidate(source) {
  let result = source.replaceAll('\r\n', '\n');
  const replacements = [
    [`        // Ordinary deletion uses deletePrivateReply in managed environments.
        // Existing moderator removal is closed by a separate decision rollout.
        allow delete: if eligibleUser() &&
          (isModerator() ||
            (!managedFeedProjection() && resource.data.authorId == request.auth.uid));`,
    `        // Managed deletion uses deletePrivateReply / removeReportedPrivateReply.
        allow delete: if eligibleUser() && !managedFeedProjection() &&
          (resource.data.authorId == request.auth.uid || isModerator());`],
    [`      allow update: if validReportUpdate(
        reportId,
        'privateReply_' + resource.data.shoutId + '_' +
          resource.data.privateReplyId
      );`,
    `      // contentRemoved and its audit are written atomically by the server.
      // Existing approve/escalate/resolve/sanction decisions remain separate.
      allow update: if validReportUpdate(
        reportId,
        'privateReply_' + resource.data.shoutId + '_' +
          resource.data.privateReplyId
      ) && (!managedFeedProjection() ||
        request.resource.data.get('resolution', '') != 'contentRemoved');`],
  ];
  for (const [before, after] of replacements) {
    const oldCount = result.split(before).length - 1, newCount = result.split(after).length - 1;
    if (oldCount === 0 && newCount === 1) continue;
    if (oldCount !== 1 || newCount !== 0) throw Error('private-report-removal-rules-source-drift');
    result = result.replace(before, after);
  }
  return result;
}
