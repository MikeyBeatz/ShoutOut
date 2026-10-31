// Local protocol building block. No callable, persisted session or live key.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { feedSessionLifetimeMillis, FeedSessionExpired } from './feed_session_policy.js';

export class InvalidFeedCursor extends Error {
  constructor() { super('invalid-feed-cursor'); this.name = 'InvalidFeedCursor'; }
}
const invalid = () => { throw new InvalidFeedCursor(); };
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);
const scopeValid = ({ uid, project }) => typeof uid === 'string' && uid.length > 0 && uid.length <= 128 &&
  typeof project === 'string' && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project);

export function feedCursorCodec({ key, maximumBytes = 262144 }) {
  if (!(key instanceof Uint8Array) || key.length < 32 || !Number.isSafeInteger(maximumBytes) ||
      maximumBytes < 256 || maximumBytes > 1048576) throw new Error('invalid-feed-cursor-codec');
  // Copy so a caller changing its buffer cannot silently rotate the codec key.
  key = Buffer.from(key);
  const sign = value => createHmac('sha256', key).update(value).digest();
  function validate(body) {
    if (!plainObject(body) || body.v !== 1 || !scopeValid(body) || !plainObject(body.context) ||
        !plainObject(body.position) || !Number.isSafeInteger(body.startedAt) || body.startedAt < 0 ||
        !Number.isSafeInteger(body.expiresAt) || body.expiresAt - body.startedAt !== feedSessionLifetimeMillis ||
        !plainObject(body.readTime) || !Number.isInteger(body.readTime.seconds) || body.readTime.seconds < 0 ||
        !Number.isInteger(body.readTime.nanoseconds) || body.readTime.nanoseconds < 0 ||
        body.readTime.nanoseconds >= 1000000000 || body.readTime.nanoseconds % 1000 !== 0) invalid();
    const readMillis = body.readTime.seconds * 1000 + Math.floor(body.readTime.nanoseconds / 1000000);
    if (!Number.isSafeInteger(readMillis) || readMillis < body.startedAt || readMillis >= body.expiresAt) invalid();
  }
  function encode(body) {
    validate(body);
    const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
    const content = `f1.${payload}`;
    const result = `${content}.${sign(content).toString('base64url')}`;
    if (Buffer.byteLength(result) > maximumBytes) throw new Error('feed-cursor-too-large');
    return result;
  }
  function decode(token, { uid, project, now }) {
    if (typeof token !== 'string' || token.length > maximumBytes || !scopeValid({ uid, project }) ||
        !Number.isSafeInteger(now) || now < 0) invalid();
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'f1' || !/^[A-Za-z0-9_-]+$/.test(parts[1]) ||
        !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) invalid();
    const supplied = Buffer.from(parts[2], 'base64url'), expected = sign(`f1.${parts[1]}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) invalid();
    let body;
    try { body = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { invalid(); }
    validate(body);
    if (body.uid !== uid || body.project !== project || body.startedAt > now) invalid();
    if (now >= body.expiresAt) throw new FeedSessionExpired();
    return body;
  }
  return {
    start({ uid, project, readTime, context, position = {}, now }) {
      const startedAt = Math.min(now, readTime?.seconds * 1000 + Math.floor(readTime?.nanoseconds / 1000000));
      const expiresAt = startedAt + feedSessionLifetimeMillis;
      if (Number.isSafeInteger(now) && now >= expiresAt) throw new FeedSessionExpired();
      return encode({ v: 1, uid, project, readTime, context, position,
        startedAt, expiresAt });
    },
    decode,
    advance(token, position, scope) {
      // UID/project/context/readTime/deadline are immutable across continuations.
      return encode({ ...decode(token, scope), position });
    },
  };
}
