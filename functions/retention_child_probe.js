// One metadata page, never a recursive traversal or an auto-paginated listing.
import { v1 } from 'firebase-admin/firestore';

export function createRetentionChildProbe(db, { client = null } = {}) {
  const base = `projects/${db.projectId}/databases/${db.databaseId ?? '(default)'}/documents/`;
  let owned;
  return {
    async hasChildren(path) {
      const parts = path.split('/');
      if (parts.length % 2 || parts.some(p => !p || p === '.' || p === '..')) throw new Error('invalid-retention-path');
      const parent = base + path;
      if (process.env.FIRESTORE_EMULATOR_HOST) {
        if (db.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('invalid-retention-emulator');
        const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/${parent}:listCollectionIds`, {
          method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageSize: 1 }), signal: globalThis.AbortSignal.timeout(20000),
        });
        if (!response.ok) throw new Error('retention-child-probe-failed');
        const data = await response.json();
        if (!Array.isArray(data.collectionIds ?? [])) throw new Error('invalid-retention-child-response');
        return !!((data.collectionIds ?? []).length || data.nextPageToken);
      }
      const api = client ?? (owned ??= new v1.FirestoreClient({ projectId: db.projectId }));
      const [ids, next] = await api.listCollectionIds({ parent, pageSize: 1 }, { autoPaginate: false });
      if (!Array.isArray(ids) || ids.length > 1) throw new Error('invalid-retention-child-response');
      return !!(ids.length || next?.pageToken);
    },
    async close() { if (owned) await owned.close(); },
  };
}
