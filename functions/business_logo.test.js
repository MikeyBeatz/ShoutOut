import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { normalizeBusinessLogo } from './business_logo_image.js';
import { validateLogoRequest, updateBusinessLogoOperation } from './business_logo.js';
import { businessLogoStorage } from './business_logo_storage.js';

test('full PNG decode preserves 512px pixels and strips image metadata', async () => {
  const input = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#118877' } }).withMetadata().png().toBuffer();
  const output = await normalizeBusinessLogo(input), meta = await sharp(output).metadata();
  assert.equal(meta.width, 512); assert.equal(meta.height, 512); assert.equal(meta.icc, undefined); assert.equal(meta.exif, undefined);
  assert.equal((await sharp(output).raw().toBuffer())[3], 255);
});
test('MIME-independent validation refuses garbage, truncated PNG, wrong dimensions, JPEG and oversized input', async () => {
  const png = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#118877' } }).png().toBuffer();
  const jpeg = await sharp(png).jpeg().toBuffer(), huge = await sharp({ create: { width: 513, height: 512, channels: 3, background: '#fff' } }).png().toBuffer();
  for (const input of [Buffer.from([1, 2, 3]), png.subarray(0, 50), jpeg, huge, Buffer.alloc(2 * 1024 * 1024 + 1)]) {
    await assert.rejects(normalizeBusinessLogo(input), e => e.code === 'invalid-argument');
  }
});
test('payload rejects arbitrary paths, noncanonical base64, extra fields, oversized encoded data and invalid avatars', () => {
  const base = { expectedUserId: 'owner', idempotencyKey: 'x', mode: 'replace', pngBase64: 'AQID' };
  for (const data of [{ ...base, path: 'foreign' }, { ...base, pngBase64: 'AQ ID' }, { ...base, pngBase64: 'A'.repeat(3000000) },
    { ...base, avatar: {} }, { ...base, mode: 'remove' }, { ...base, mode: 'remove', pngBase64: undefined, avatar: { admin: true } }]) {
    assert.throws(() => validateLogoRequest(data), e => e.code === 'invalid-argument');
  }
  assert.equal(validateLogoRequest(base).bytes.length, 3);
});
test('runtime is off by default and does not touch a database or Storage', async () => {
  await assert.rejects(updateBusinessLogoOperation({}, null, null), e => e.code === 'failed-precondition');
});
test('Storage adapter binds bucket/path, create precondition and immutable generation; late guard failure never deletes a published replay', async () => {
  const bytes = Buffer.from('synthetic'), state = new Map(); let deletes = 0;
  const bucket = { name: 'shoutout-rules-test.appspot.com', file(path) { return {
    async save(data, o) { assert.equal(o.preconditionOpts.ifGenerationMatch, 0); if (state.has(path)) throw Object.assign(Error(), { code: 412 }); state.set(path, { bytes: data, meta: { generation: '7', size: data.length, metadata: o.metadata.metadata } }); },
    async getMetadata() { if (!state.has(path)) throw Object.assign(Error(), { code: 404 }); return [state.get(path).meta]; },
    async download() { return [state.get(path).bytes]; },
    async delete(o) { assert.equal(o.ifGenerationMatch, '7'); deletes++; state.delete(path); },
  }; } };
  const storage = businessLogoStorage(bucket, 'shoutout-rules-test'), path = 'businessLogos/owner/logo-1.png';
  await storage.put('owner', path, bytes, async () => {});
  let guards = 0; await assert.rejects(storage.put('owner', path, bytes, async () => { if (++guards === 2) throw Error('late-ban'); }), /late-ban/);
  assert.equal(deletes, 0); assert(state.has(path));
  await assert.rejects(storage.put('owner', 'businessLogos/foreign/logo-1.png', bytes, async () => {}));
  state.get(path).bytes = Buffer.from('tampered'); await assert.rejects(storage.put('owner', path, bytes, async () => {}));
});
