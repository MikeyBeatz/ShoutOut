import { receiptRetentionFields } from './operation_retention.js';
import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';

const fail = (code, message) => { throw new HttpsError(code, message); };
const digest = (value) => createHash('sha256').update(value).digest('hex');
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export function validateCreatePrivateReply(input) {
  const fields = ['idempotencyKey', 'shoutId', 'text', 'targetType',
    'parentCommentId', 'parentPrivateReplyId', 'expectedUserId'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !fields.includes(key)) ||
      !identifier(input.idempotencyKey) || !identifier(input.shoutId) ||
      (input.expectedUserId !== undefined && !identifier(input.expectedUserId)) ||
      typeof input.text !== 'string' || input.text.length > 440 ||
      input.text.trim().length === 0 || [...input.text].length > 220 ||
      !['shout', 'comment', 'privateReply'].includes(input.targetType) ||
      (input.targetType === 'shout' && (input.parentCommentId !== undefined || input.parentPrivateReplyId !== undefined)) ||
      (input.targetType === 'comment' && (!identifier(input.parentCommentId) || input.parentPrivateReplyId !== undefined)) ||
      (input.targetType === 'privateReply' && (!identifier(input.parentPrivateReplyId) || input.parentCommentId !== undefined))) {
    fail('invalid-argument', 'Invalid private reply fields.');
  }
  return Object.fromEntries(fields.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}

// Existing privateReply policy in firestore.rules: 60/hour and 10 seconds.
export function nextPrivateReplyRate(data, now, eventId) {
  if (data) {
    if (!(data.lastAt instanceof Timestamp) || !(data.windowStartedAt instanceof Timestamp) ||
        !Number.isSafeInteger(data.count) || data.count < 1) {
      fail('failed-precondition', 'Invalid stored rate limit.');
    }
    if (now.toMillis() < data.lastAt.toMillis() + 10000) {
      fail('resource-exhausted', 'rate-privateReply-cooldown');
    }
  }
  const reset = !data || now.toMillis() >= data.windowStartedAt.toMillis() + 3600000;
  const count = reset ? 1 : data.count + 1;
  if (count > 60) fail('resource-exhausted', 'rate-privateReply-hourly-limit');
  return { lastAt: now, lastEventId: eventId,
    windowStartedAt: reset ? now : data.windowStartedAt, count };
}

function nickname(value) {
  if (typeof value !== 'string' || value.length === 0) {
    fail('failed-precondition', 'The account profile is incomplete.');
  }
  return value;
}

export async function createPrivateReplyOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request);
  const input = validateCreatePrivateReply(request.data);
  if (input.expectedUserId !== undefined && input.expectedUserId !== uid) {
    fail('unauthenticated', 'The signed-in account changed.');
  }
  const key = digest(`${uid}\ncreatePrivateReply\n${input.idempotencyKey}`);
  const fingerprint = digest(JSON.stringify(input));
  const shoutRef = db.doc(`shouts/${input.shoutId}`);
  const replyRef = shoutRef.collection('privateReplies').doc(key);
  const receiptRef = db.doc(`serverOperations/${key}`);
  const rateRef = db.doc(`rateLimits/${uid}/actions/privateReply`);
  return db.runTransaction(async (transaction) => {
    const now = Timestamp.fromDate(clock());
    const actor = await requireEligibleActor({ request, db, reader: transaction,
      requireContentPermission: true, now: now.toDate() });
    const [receipt, shoutSnapshot, rate] = await transaction.getAll(receiptRef, shoutRef, rateRef);
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) {
      if (receipt.data().action !== 'createPrivateReply' || receipt.data().fingerprint !== fingerprint) {
        fail('already-exists', 'Idempotency key was already used for another payload.');
      }
      return { privateReplyId: key };
    }
    const shout = shoutSnapshot.data();
    if (shout?.status !== 'active' || !(shout.expiresAt instanceof Timestamp) ||
        shout.expiresAt.toMillis() <= now.toMillis()) {
      fail('failed-precondition', 'The Shout is no longer active.');
    }
    if (typeof shout.title !== 'string') fail('failed-precondition', 'Invalid stored Shout.');
    let recipientId = shout.authorId;
    let parentCommentId = input.parentCommentId;
    if (input.targetType === 'comment') {
      const parent = await transaction.get(shoutRef.collection('comments').doc(parentCommentId));
      if (!parent.exists) fail('not-found', 'The parent comment is no longer available.');
      recipientId = parent.data().authorId;
    } else if (input.targetType === 'privateReply') {
      const parent = await transaction.get(shoutRef.collection('privateReplies').doc(input.parentPrivateReplyId));
      const data = parent.data();
      // Match the actual received message, not a caller-supplied recipient or
      // an arbitrary public user. Do not reveal private-message existence.
      if (!parent.exists || data.recipientId !== uid || !identifier(data.authorId) ||
          data.authorId === uid || !Array.isArray(data.participants) ||
          data.participants.length !== 2 || data.participants[0] !== data.authorId ||
          data.participants[1] !== uid) {
        fail('permission-denied', 'The private reply target is unavailable.');
      }
      recipientId = data.authorId;
      parentCommentId = data.parentCommentId;
      if (parentCommentId !== undefined) {
        if (!identifier(parentCommentId) ||
            !(await transaction.get(shoutRef.collection('comments').doc(parentCommentId))).exists) {
          fail('not-found', 'The parent comment is no longer available.');
        }
      }
    }
    if (!identifier(recipientId)) fail('failed-precondition', 'Invalid recipient profile.');
    if (recipientId === uid) fail('invalid-argument', 'A private reply requires another participant.');
    const [recipient, settings] = await transaction.getAll(db.doc(`users/${recipientId}`),
      db.doc(`users/${recipientId}/settings/notifications`));
    if (!recipient.exists) fail('failed-precondition', 'The recipient is no longer available.');
    const authorNickname = nickname(actor.profile.nickname);
    const recipientNickname = nickname(recipient.data().nickname);
    const enabled = settings.data()?.privateReplies;
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      fail('failed-precondition', 'Invalid notification preference.');
    }
    const rateData = nextPrivateReplyRate(rate.data(), now, key);
    transaction.create(replyRef, { authorId: uid, authorNickname, recipientId, recipientNickname,
      participants: [uid, recipientId], text: input.text, createdAt: now, targetType: input.targetType,
      ...(parentCommentId !== undefined ? { parentCommentId } : {}) });
    transaction.set(rateRef, rateData);
    // No private text, participant name or parent private-message ID in receipt.
    transaction.create(receiptRef, { ...retention, userId: uid, action: 'createPrivateReply', fingerprint,
      shoutId: input.shoutId, privateReplyId: key, createdAt: now });
    if (enabled !== false) {
      transaction.set(db.doc(`users/${recipientId}/notifications/privateReply_${input.shoutId}`), {
        kind: 'privateReply', actorId: uid, actorNickname: authorNickname, targetShoutId: input.shoutId,
        targetTitle: shout.title, targetPrivateReplyId: key,
        eventCount: FieldValue.increment(1), createdAt: now, readAt: null,
      }, { merge: true });
    }
    return { privateReplyId: key };
  });
}
