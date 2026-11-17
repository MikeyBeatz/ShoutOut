// Local HTTP fault fixture only. No Firebase, Auth, credentials or cloud writes.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readContentHash, readRetentionMillis } from '../functions/read_sync_blocks.js';

export async function startReadSyncTransportFixture(port = 49327) {
  const fixtures = new Map();
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      response.writeHead(403).end(); return;
    }
    response.setHeader('Access-Control-Allow-Origin', origin ?? 'http://localhost');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    const send = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
    };
    try {
      let text = '';
      for await (const chunk of request) {
        text += chunk;
        if (text.length > 8192) throw Error('fixture-body-too-large');
      }
      const body = text ? JSON.parse(text) : {}, path = request.url?.split('/').filter(Boolean) ?? [];
      if (request.method === 'POST' && request.url === '/fixtures') {
        if (!['before', 'after'].includes(body.failure) || fixtures.size >= 2) throw Error('invalid-fixture');
        const id = randomUUID(), expiresAt = Date.now() + 86400000;
        const item = { shoutId: `b2-http-${id}`, title: 'B2 transport fixture', text: 'Local synthetic read marker', expiresAt };
        const fixture = { id, uid: `reader-${id}`, item, hash: readContentHash(item.title, item.text), failure: body.failure,
          healthy: false, attempts: 0, dropped: 0, commits: 0, revision: 0, record: null };
        fixtures.set(id, fixture); send(201, { id, uid: fixture.uid, item }); return;
      }
      const fixture = path[0] === 'fixtures' ? fixtures.get(path[1]) : null;
      if (!fixture || path.length > 3) { send(404, { error: 'unknown-local-fixture' }); return; }
      if (request.method === 'DELETE' && path.length === 2) {
        fixtures.delete(fixture.id); send(200, { deleted: true }); return;
      }
      if (request.method === 'GET' && path[2] === 'state') {
        send(200, { attempts: fixture.attempts, dropped: fixture.dropped, commits: fixture.commits,
          revision: fixture.revision, records: fixture.record ? 1 : 0, confirmedAt: fixture.record?.confirmedAt ?? null }); return;
      }
      if (request.method === 'POST' && path[2] === 'healthy' && Object.keys(body).length === 0) {
        fixture.healthy = true; send(200, { healthy: true }); return;
      }
      if (request.method !== 'POST' || body.expectedUserId !== fixture.uid) throw Error('invalid-fixture-request');
      if (path[2] === 'syncReadBatch') {
        const row = body.items?.[0];
        if (body.items.length !== 1 || row?.shoutId !== fixture.item.shoutId || row.contentHash !== fixture.hash ||
            row.expiresAt !== fixture.item.expiresAt) throw Error('invalid-fixture-marker');
        fixture.attempts++;
        if (!fixture.healthy && fixture.failure === 'before') {
          fixture.dropped++; request.socket.destroy(); return;
        }
        if (!fixture.record) {
          fixture.record = { ...row, confirmedAt: Date.now(), retainUntil: row.expiresAt + readRetentionMillis };
          fixture.commits++; fixture.revision++;
        }
        if (!fixture.healthy) { fixture.dropped++; request.socket.destroy(); return; }
        send(200, { version: 1, revision: fixture.revision, items: [{ ...row, status: 'accepted' }] }); return;
      }
      if (path[2] === 'getReadStatePage') {
        send(200, { version: 1, revision: fixture.revision, next: null,
          items: fixture.record ? [fixture.record] : [] }); return;
      }
      send(404, { error: 'unknown-fixture-operation' });
    } catch {
      if (!response.destroyed) send(400, { error: 'invalid-local-fixture-request' });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(port, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${port}`,
    remaining: () => fixtures.size,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
