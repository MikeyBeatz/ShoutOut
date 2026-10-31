import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { encodeGeohash } from './create_shout.js';
import { openSpatialRepository } from './feed_spatial_repository.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'spatial-feed-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });

test('spatial queries pin membership and rank keys across concurrent writes', { skip: !enabled }, async () => {
  const first = db.collection('shouts').doc(`spatial-${randomUUID()}`);
  const later = db.collection('shouts').doc(`spatial-${randomUUID()}`);
  const location = new GeoPoint(80, -40), geohash = encodeGeohash(80, -40);
  const data = { status: 'active', location, geohash, authorId: 'fixture',
    createdAt: Timestamp.fromMillis(1000), expiresAt: Timestamp.fromMillis(2000), categories: [] };
  try {
    await first.create(data);
    const repo = await openSpatialRepository(db);
    await first.update({ createdAt: Timestamp.fromMillis(1500) });
    await later.create(data);
    const result = await repo.readRange({ start: geohash, end: geohash, limit: 50, snapshot: repo.snapshot });
    assert.equal(result.rows.find(row => row.id === first.id)?.createdAt, 1000);
    assert(!result.rows.some(row => row.id === later.id));
  } finally {
    await Promise.all([first.delete(), later.delete()]);
  }
});
