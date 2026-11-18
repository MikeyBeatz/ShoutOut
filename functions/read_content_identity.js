// Shared content identity only; no private read-block layout or runtime host.
import { createHash } from 'node:crypto';

export const readContentHash = (title, text) => createHash('sha256').update(JSON.stringify([title, text])).digest('hex');
