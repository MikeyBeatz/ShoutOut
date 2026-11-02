// Metadata-only, bounded listing. Includes documents missing their own fields
// but still owning descendants; ordinary queries silently omit those documents.
import { v1 } from 'firebase-admin/firestore';

export function createPurgeDocumentPager(db, { client = null } = {}) {
  const base = `projects/${db.projectId}/databases/${db.databaseId ?? '(default)'}/documents`;
  let ownedClient;
  return {
    async list(path, pageToken = null) {
      const parts = path.split('/');
      if (parts.length % 2 !== 1 || parts.some(p => !p || p === '.' || p === '..') ||
          pageToken !== null && typeof pageToken !== 'string') throw new Error('invalid-purge-list-path');
      const request = { parent: base + (parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : ''),
        collectionId: parts.at(-1), pageSize: 1, showMissing: true, mask: { fieldPaths: [] },
        ...(pageToken ? { pageToken } : {}) };
      let documents, next;
      if (process.env.FIRESTORE_EMULATOR_HOST) {
        if (db.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
          throw new Error('invalid-purge-emulator-target');
        }
        const url = new URL(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/${request.parent}/${request.collectionId}`);
        url.searchParams.set('pageSize', '1'); url.searchParams.set('showMissing', 'true');
        url.searchParams.set('mask.fieldPaths', '__name__');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        // Emulator-only Admin identity, never used for a live request.
        const response = await fetch(url, { headers: { Authorization: 'Bearer owner' }, signal: globalThis.AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`purge-list-failed-${response.status}`);
        const body = await response.json(); documents = body.documents ?? []; next = body.nextPageToken ?? null;
      } else {
        const api = client ?? (ownedClient ??= new v1.FirestoreClient({ projectId: db.projectId }));
        const [rows, continuation] = await api.listDocuments(request, { autoPaginate: false });
        documents = rows; next = continuation?.pageToken ?? null;
      }
      if (documents.length > 1 || next !== null && (typeof next !== 'string' || next === pageToken)) {
        throw new Error('invalid-purge-list-response');
      }
      const paths = documents.map(doc => {
        if (typeof doc.name !== 'string' || !doc.name.startsWith(`${base}/${path}/`) ||
            doc.name.slice(`${base}/${path}/`.length).includes('/')) throw new Error('invalid-purge-listed-document');
        return doc.name.slice(base.length + 1);
      });
      return { paths, next };
    },
    async close() { if (ownedClient) await ownedClient.close(); },
  };
}
