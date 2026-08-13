import assert from 'node:assert/strict';
import test from 'node:test';

import {
  eligibleModerationContentAuthors,
  moderationSeedUserAt,
} from './moderation_seed.mjs';

const users = [
  ['user', 'User'],
  ['business', 'Business'],
  ['moderator', 'Moderator'],
  ['admin', 'Admin'],
];
const staffUserIds = new Set(['moderator', 'admin']);

test('objectionable seed content cycles only through non-staff authors', () => {
  const authors = eligibleModerationContentAuthors(users, staffUserIds);

  assert.deepEqual(
    Array.from({ length: 12 }, (_, index) => moderationSeedUserAt(authors, index)[0]),
    ['user', 'business', 'user', 'business', 'user', 'business', 'user', 'business', 'user', 'business', 'user', 'business'],
  );
});

test('author selection fails closed when every seed account is staff', () => {
  assert.throws(
    () => eligibleModerationContentAuthors(users.slice(2), staffUserIds),
    /at least one non-staff author/,
  );
});

test('seed user selection rejects an empty candidate list', () => {
  assert.throws(() => moderationSeedUserAt([], 0), /empty seed list/);
});
