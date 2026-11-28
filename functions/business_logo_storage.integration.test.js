import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { businessLogoStorage } from './business_logo_storage.js';

test('real Storage emulator preserves generation-precondition uploads and authenticated PNG bytes', {
  skip: process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199',
}, async () => {
  const projectId = 'shoutout-rules-test', app = initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` }, 'logo-storage-adapter');
  const bucket = getStorage(app).bucket(), storage = businessLogoStorage(bucket, projectId), uid = randomUUID(), path = `businessLogos/${uid}/logo-1.png`;
  try {
    const bytes = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#118877' } }).png().toBuffer();
    const a = await storage.put(uid, path, bytes, async () => {}), b = await storage.put(uid, path, bytes, async () => {});
    assert.equal(a.generation, b.generation); assert.deepEqual(await storage.inspect(uid, path), a);
    const [meta] = await bucket.file(path).getMetadata(); assert.equal(meta.metadata?.firebaseStorageDownloadTokens, undefined);
    await assert.rejects(storage.remove(uid, path, String(Number(a.generation) + 1), async () => {}));
    assert(await storage.inspect(uid, path)); await storage.remove(uid, path, a.generation, async () => {});
    assert.equal(await storage.inspect(uid, path), null);
  } finally { await bucket.file(path).delete({ ignoreNotFound: true }); await deleteApp(app); }
});
