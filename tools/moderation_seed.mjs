export function eligibleModerationContentAuthors(users, staffUserIds) {
  const authors = users.filter(([uid]) => !staffUserIds.has(uid));
  if (authors.length === 0) {
    throw new Error('Moderation seed requires at least one non-staff author.');
  }
  return authors;
}

export function moderationSeedUserAt(users, index) {
  if (users.length === 0) {
    throw new Error('Cannot select a user from an empty seed list.');
  }
  return users[index % users.length];
}
