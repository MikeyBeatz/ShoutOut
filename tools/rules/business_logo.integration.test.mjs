import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch, getDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject, updateMetadata } from 'firebase/storage';
import { businessLogoCandidate } from './business_logo_candidate.mjs';
const projectId = 'shoutout-rules-test';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9199');
let env;
before(async () => { env = await initializeTestEnvironment({ projectId,
  firestore: { host: '127.0.0.1', port: 8080, rules: businessLogoCandidate(readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')) },
  storage: { host: '127.0.0.1', port: 9199, rules: businessLogoCandidate(readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8')) },
}); });
beforeEach(async () => { await env.clearFirestore(); await env.clearStorage(); });
after(async () => { await env.clearFirestore(); await env.clearStorage(); await env.cleanup(); });
const actor = uid => env.authenticatedContext(uid, { email: 'fixture@example.test', email_verified: true });
const path = 'businessLogos/owner/logo-1.png';
const avatar = { avatarId: 'fox', avatarBackgroundStart: 'teal', avatarBackgroundEnd: 'navy', avatarGradientDirection: 'horizontal' };
async function seed() {
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore(), p = { nickname: 'Owner', nicknameLower: 'owner', ...avatar, businessLogoPath: path, businessLogoVersion: 1 };
    await setDoc(doc(db, 'users/owner'), p); const { nicknameLower, ...pub } = p; void nicknameLower;
    await setDoc(doc(db, 'publicProfiles/owner'), pub); await setDoc(doc(db, 'users/owner/legal/acceptance_2026_07_25'), {});
    await setDoc(doc(db, 'accountRoles/owner'), { role: 'business', level: 2 });
    await uploadBytes(ref(c.storage(), path), new Uint8Array([1, 2, 3]), { contentType: 'image/png' });
    await uploadBytes(ref(c.storage(), 'businessLogos/owner/logo-2.png'), new Uint8Array([4]), { contentType: 'image/png' });
  });
}
test('active candidate denies upload, overwrite, metadata tokens and direct object deletion, including owners', async () => {
  await seed(); const s = actor('owner').storage();
  await assertFails(uploadBytes(ref(s, 'businessLogos/owner/logo-3.png'), new Uint8Array([1]), { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(s, path), new Uint8Array([1]), { contentType: 'image/png' }));
  await assertFails(updateMetadata(ref(s, path), { customMetadata: { firebaseStorageDownloadTokens: 'forged' } }));
  await assertFails(deleteObject(ref(s, path)));
});
test('only the current logo is readable; unpublished, obsolete, anonymous and deleted-owner objects are unavailable', async () => {
  await seed(); await assertSucceeds(getBytes(ref(actor('reader').storage(), path)));
  await assertFails(getBytes(ref(actor('reader').storage(), 'businessLogos/owner/logo-2.png')));
  await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), path)));
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'publicProfiles/owner'), { schemaVersion: 1, accountStatus: 'deleted' }));
  await assertFails(getBytes(ref(actor('reader').storage(), path)));
});
test('owners cannot atomically forge or remove both profile logo references; avatar changes preserving the logo still work', async () => {
  await seed(); const db = actor('owner').firestore();
  for (const patch of [{ businessLogoPath: 'businessLogos/owner/logo-2.png', businessLogoVersion: 2 }, { businessLogoPath: deleteField(), businessLogoVersion: deleteField() }]) {
    const b = writeBatch(db); for (const c of ['users', 'publicProfiles']) b.update(doc(db, c + '/owner'), patch); await assertFails(b.commit());
  }
  const b = writeBatch(db); for (const c of ['users', 'publicProfiles']) b.update(doc(db, c + '/owner'), { avatarId: 'owl' }); await assertSucceeds(b.commit());
  await assertFails(setDoc(doc(db, 'businessProfiles/owner/logoState/current'), { pending: { path } }));
  await assertFails(getDoc(doc(db, 'businessProfiles/owner/logoState/current')));
});
