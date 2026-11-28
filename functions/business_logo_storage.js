import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';

export const logoDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const validLogoPath = (uid, path) => typeof path === 'string' &&
  new RegExp(`^businessLogos/${uid}/logo-[0-9]+\\.png$`).test(path);
const generation = value => /^[1-9][0-9]*$/.test(String(value));
const conflict = () => new HttpsError('failed-precondition', 'The logo object changed.');

// No download tokens or public URLs. Existing authenticated getData reads remain.
export function businessLogoStorage(bucket, projectId) {
  if (!bucket || ![`${projectId}.appspot.com`, `${projectId}.firebasestorage.app`].includes(bucket.name)) throw Error('business-logo-bucket-mismatch');
  return {
    async list(uid, { limit = 50, pageToken = null } = {}) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !Number.isInteger(limit) || limit < 1 || limit > 50) throw conflict();
      const [files, next] = await bucket.getFiles({ prefix: `businessLogos/${uid}/`, maxResults: limit, autoPaginate: false, ...(pageToken ? { pageToken } : {}) });
      if (files.length > limit) throw conflict();
      const rows = [];
      for (const file of files) {
        if (!validLogoPath(uid, file.name)) throw conflict();
        const m = file.metadata ?? (await file.getMetadata())[0];
        if (!generation(m.generation)) throw conflict();
        rows.push({ path: file.name, generation: String(m.generation) });
      }
      return { rows, pageToken: next?.pageToken ?? null };
    },
    async inspect(uid, path) {
      if (!validLogoPath(uid, path)) throw conflict();
      try {
        const [m] = await bucket.file(path).getMetadata();
        if (!generation(m.generation)) throw conflict();
        return { generation: String(m.generation), digest: m.metadata?.shoutoutLogoDigest ?? null };
      } catch (e) { if (e.code === 404) return null; throw e; }
    },
    async put(uid, path, bytes, guard) {
      if (!validLogoPath(uid, path)) throw conflict();
      await guard();
      const file = bucket.file(path), digest = logoDigest(bytes);
      let present = false;
      try { await file.getMetadata(); present = true; }
      catch (e) { if (e.code !== 404) throw e; }
      try { if (!present) {
        await file.save(bytes, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 },
          metadata: { contentType: 'image/png', cacheControl: 'private,max-age=31536000,immutable', metadata: { shoutoutLogoDigest: digest } } });
      }
      } catch (e) { if (e.code !== 412) throw e; }
      const [m] = await file.getMetadata();
      if (!generation(m.generation) || m.metadata?.shoutoutLogoDigest !== digest || Number(m.size) !== bytes.length) throw conflict();
      // Verify the exact stored generation, including after an ambiguous upload reply.
      const [stored] = await bucket.file(path, { generation: String(m.generation) }).download();
      if (logoDigest(stored) !== digest) throw conflict();
      // A failed guard leaves an unpublished object in the durable pending
      // slot. Maintenance checks current profile references before deleting it;
      // an overlapping successful replay may already have published this path.
      await guard();
      return { generation: String(m.generation), digest };
    },
    async remove(uid, path, expectedGeneration, guard) {
      if (!validLogoPath(uid, path) || !generation(expectedGeneration)) throw conflict();
      await guard();
      try {
        const [m] = await bucket.file(path).getMetadata();
        if (String(m.generation) !== expectedGeneration) throw conflict();
      } catch (e) { if (e.code === 404) return; throw e; }
      try { await bucket.file(path).delete({ ifGenerationMatch: expectedGeneration }); }
      catch (e) { if (e.code !== 404) throw e; }
    },
  };
}
