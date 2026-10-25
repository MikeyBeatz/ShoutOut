import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';

const fail = (code, message) => { throw new HttpsError(code, message); };
const digest = (value) => createHash('sha256').update(value).digest('hex');
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export function validateCreateComment(input) {
  const fields = ['idempotencyKey', 'shoutId', 'text', 'replyToCommentId'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !fields.includes(key)) ||
      !identifier(input.idempotencyKey) || !identifier(input.shoutId) ||
      (input.replyToCommentId !== undefined && !identifier(input.replyToCommentId)) ||
      typeof input.text !== 'string' || input.text.trim().length === 0 ||
      [...input.text].length > 220) {
    fail('invalid-argument', 'Invalid comment fields.');
  }
  return Object.fromEntries(fields.filter((key) => input[key] !== undefined)
    .map((key) => [key, input[key]]));
}

// Matches rateCooldown/rateWindow/rateMaximum('comment') in firestore.rules.
export function nextCommentRate(data, now, eventId) {
  if (data) {
    if (!(data.lastAt instanceof Timestamp) || !(data.windowStartedAt instanceof Timestamp) ||
        !Number.isSafeInteger(data.count) || data.count < 1) {
      fail('failed-precondition', 'Invalid stored rate limit.');
    }
    if (now.toMillis() < data.lastAt.toMillis() + 10000) {
      fail('resource-exhausted', 'rate-comment-cooldown');
    }
  }
  const reset = !data || now.toMillis() >= data.windowStartedAt.toMillis() + 3600000;
  const count = reset ? 1 : data.count + 1;
  if (count > 60) fail('resource-exhausted', 'rate-comment-hourly-limit');
  return { lastAt: now, lastEventId: eventId,
    windowStartedAt: reset ? now : data.windowStartedAt, count };
}

function nickname(value) {
  if (typeof value !== 'string' || value.length === 0) {
    fail('failed-precondition', 'The author profile is incomplete.');
  }
  return value;
}

export async function createCommentOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request);
  const input = validateCreateComment(request.data);
  // The action namespace prevents a Shout key from colliding with a comment.
  const key = digest(`${uid}\ncreateComment\n${input.idempotencyKey}`);
  const fingerprint = digest(JSON.stringify(input));
  const shoutRef = db.doc(`shouts/${input.shoutId}`);
  const commentRef = shoutRef.collection('comments').doc(key);
  const receiptRef = db.doc(`serverOperations/${key}`);
  const rateRef = db.doc(`rateLimits/${uid}/actions/comment`);
  return db.runTransaction(async (transaction) => {
    const now = Timestamp.fromDate(clock());
    const actor = await requireEligibleActor({ request, db, reader: transaction,
      requireContentPermission: true, now: now.toDate() });
    const [receipt, shoutSnapshot, rate] = await transaction.getAll(receiptRef, shoutRef, rateRef);
    if (receipt.exists) {
      if (receipt.data().action !== 'createComment' || receipt.data().fingerprint !== fingerprint) {
        fail('already-exists', 'Idempotency key was already used for another payload.');
      }
      return { commentId: key };
    }
    const shout = shoutSnapshot.data();
    if (shout?.status !== 'active' || !(shout.expiresAt instanceof Timestamp) ||
        shout.expiresAt.toMillis() <= now.toMillis()) {
      fail('failed-precondition', 'The Shout is no longer active.');
    }
    if (!identifier(shout.authorId) || typeof shout.title !== 'string') {
      fail('failed-precondition', 'Invalid stored Shout.');
    }
    const count = shout.commentsCount ?? 0;
    if (!Number.isSafeInteger(count) || count < 0 || count === Number.MAX_SAFE_INTEGER) {
      fail('failed-precondition', 'Invalid stored comment count.');
    }
    const authorNickname = nickname(actor.profile.nickname);
    const reply = {};
    let replyRecipientId;
    if (input.replyToCommentId !== undefined) {
      const parent = await transaction.get(shoutRef.collection('comments').doc(input.replyToCommentId));
      if (!parent.exists) fail('not-found', 'The parent comment is no longer available.');
      reply.replyToCommentId = input.replyToCommentId;
      reply.replyToNickname = nickname(parent.data().authorNickname);
      replyRecipientId = parent.data().authorId;
      if (!identifier(replyRecipientId)) fail('failed-precondition', 'Invalid parent comment author.');
    }
    const recipients = [];
    if (shout.authorId !== uid) recipients.push({ uid: shout.authorId, kind: 'comment' });
    if (replyRecipientId && replyRecipientId !== uid && replyRecipientId !== shout.authorId) {
      recipients.push({ uid: replyRecipientId, kind: 'reply' });
    }
    const settings = recipients.length === 0 ? [] : await transaction.getAll(
      ...recipients.map((recipient) => db.doc(`users/${recipient.uid}/settings/notifications`)),
    );
    const rateData = nextCommentRate(rate.data(), now, key);
    transaction.create(commentRef, { authorId: uid, authorNickname, text: input.text,
      createdAt: now, likesCount: 0, dislikesCount: 0, ...reply });
    transaction.update(shoutRef, { commentsCount: count + 1 });
    transaction.set(rateRef, rateData);
    transaction.create(receiptRef, { userId: uid, action: 'createComment', fingerprint,
      shoutId: input.shoutId, commentId: key, createdAt: now });
    for (const [index, recipient] of recipients.entries()) {
      // The current client uses the 'replies' preference for both public kinds.
      const enabled = settings[index].data()?.replies;
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        fail('failed-precondition', 'Invalid notification preference.');
      }
      if (enabled === false) continue;
      transaction.set(db.doc(`users/${recipient.uid}/notifications/${recipient.kind}_${input.shoutId}`), {
        kind: recipient.kind, actorId: uid, actorNickname: authorNickname,
        targetShoutId: input.shoutId, targetTitle: shout.title, targetCommentId: key,
        ...(recipient.kind === 'reply' ? { parentCommentId: input.replyToCommentId } : {}),
        eventCount: FieldValue.increment(1), createdAt: now, readAt: null,
      }, { merge: true });
    }
    return { commentId: key };
  });
}
