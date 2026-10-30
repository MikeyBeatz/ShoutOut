import { receiptRetentionFields } from './operation_retention.js';
import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';

const fail = (code, message) => { throw new HttpsError(code, message); };
const digest = (value) => createHash('sha256').update(value).digest('hex');
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const counter = (value) => Number.isSafeInteger(value) && value >= 0;

export function validateShoutReaction(input) {
  const fields = ['idempotencyKey', 'shoutId', 'button', 'expectedUserId'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !fields.includes(key)) ||
      !identifier(input.idempotencyKey) || !identifier(input.shoutId) ||
      !['like', 'dislike'].includes(input.button) ||
      (input.expectedUserId !== undefined && !identifier(input.expectedUserId))) {
    fail('invalid-argument', 'Invalid reaction fields.');
  }
  return Object.fromEntries(fields.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}

export function reactionTransition(storedType, button, likes, dislikes) {
  if (![null, 'like', 'dislike'].includes(storedType) ||
      !['like', 'dislike'].includes(button) || !counter(likes) || !counter(dislikes)) {
    fail('failed-precondition', 'Invalid stored reaction or counters.');
  }
  const type = storedType === button ? null : button;
  const result = { type,
    likes: likes + Number(type === 'like') - Number(storedType === 'like'),
    dislikes: dislikes + Number(type === 'dislike') - Number(storedType === 'dislike') };
  if (!counter(result.likes) || !counter(result.dislikes)) {
    fail('failed-precondition', 'Inconsistent stored reaction counters.');
  }
  return result;
}

// Shared legacy 'interaction' bucket: reactions and saves, 120/hour, 1 second.
export function nextInteractionRate(data, now, eventId) {
  if (data) {
    if (!(data.lastAt instanceof Timestamp) || !(data.windowStartedAt instanceof Timestamp) ||
        !Number.isSafeInteger(data.count) || data.count < 1) {
      fail('failed-precondition', 'Invalid stored rate limit.');
    }
    if (now.toMillis() < data.lastAt.toMillis() + 1000) {
      fail('resource-exhausted', 'rate-interaction-cooldown');
    }
  }
  const reset = !data || now.toMillis() >= data.windowStartedAt.toMillis() + 3600000;
  const count = reset ? 1 : data.count + 1;
  if (count > 120) fail('resource-exhausted', 'rate-interaction-hourly-limit');
  return { lastAt: now, lastEventId: eventId,
    windowStartedAt: reset ? now : data.windowStartedAt, count };
}

export async function toggleShoutReactionOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request);
  const input = validateShoutReaction(request.data);
  // A retry must not run under a different account after a client-side switch.
  // This is only a safety check; Auth remains the authoritative identity.
  if (input.expectedUserId !== undefined && input.expectedUserId !== uid) {
    fail('unauthenticated', 'The signed-in account changed.');
  }
  const key = digest(`${uid}\ntoggleShoutReaction\n${input.idempotencyKey}`);
  const fingerprint = digest(JSON.stringify(input));
  const receiptRef = db.doc(`serverOperations/${key}`);
  const shoutRef = db.doc(`shouts/${input.shoutId}`);
  const reactionRef = shoutRef.collection('reactions').doc(uid);
  const rateRef = db.doc(`rateLimits/${uid}/actions/interaction`);
  return db.runTransaction(async (transaction) => {
    const now = Timestamp.fromDate(clock());
    // Reactions use eligibleUser(), not canCreateContent(), in current Rules.
    await requireEligibleActor({ request, db, reader: transaction, now: now.toDate() });
    const receipt = await transaction.get(receiptRef);
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) {
      const data = receipt.data();
      if (data.action !== 'toggleShoutReaction' || data.fingerprint !== fingerprint) {
        fail('already-exists', 'Idempotency key was already used for another payload.');
      }
      if (data.userId !== uid || data.shoutId !== input.shoutId ||
          ![null, 'like', 'dislike'].includes(data.result?.type) ||
          !counter(data.result?.likes) || !counter(data.result?.dislikes)) {
        fail('failed-precondition', 'Invalid stored operation result.');
      }
      return data.result;
    }
    const [shout, reaction, rate] = await transaction.getAll(shoutRef, reactionRef, rateRef);
    if (!shout.exists) fail('not-found', 'The Shout is no longer available.');
    const data = shout.data();
    if (!counter(data.commentsCount) || !counter(data.savesCount)) {
      fail('failed-precondition', 'Invalid stored Shout counters.');
    }
    // Existing Rules permit interactions on retained Shouts regardless of status.
    const oldType = reaction.exists ? reaction.data().type : null;
    const result = reactionTransition(oldType, input.button, data.likesCount ?? 0, data.dislikesCount ?? 0);
    const rateData = nextInteractionRate(rate.data(), now, `shoutReaction_${input.shoutId}`);
    let publicProfile;
    if (result.type !== null && data.authorId !== uid) {
      if (!identifier(data.authorId) || typeof data.title !== 'string') {
        fail('failed-precondition', 'Invalid stored Shout author.');
      }
      const settings = await transaction.get(db.doc(`users/${data.authorId}/settings/notifications`));
      const enabled = settings.data()?.reactions;
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        fail('failed-precondition', 'Invalid notification preference.');
      }
      if (enabled !== false) {
        publicProfile = await transaction.get(db.doc(`publicProfiles/${uid}`));
        if (publicProfile.exists && typeof publicProfile.data().nickname !== 'string') {
          fail('failed-precondition', 'Invalid public author profile.');
        }
      }
    }
    if (result.type === null) transaction.delete(reactionRef);
    else transaction.set(reactionRef, { type: result.type, updatedAt: now });
    transaction.update(shoutRef, { likesCount: result.likes, dislikesCount: result.dislikes });
    transaction.set(rateRef, rateData);
    transaction.create(receiptRef, { ...retention, userId: uid, action: 'toggleShoutReaction', fingerprint,
      shoutId: input.shoutId, result, createdAt: now });
    if (publicProfile?.exists) {
      transaction.set(db.doc(`users/${data.authorId}/notifications/reaction_${result.type}_${input.shoutId}`), {
        kind: 'reaction', actorId: uid, actorNickname: publicProfile.data().nickname,
        targetShoutId: input.shoutId, targetTitle: data.title, reactionType: result.type,
        eventCount: FieldValue.increment(1), createdAt: now, readAt: null,
      }, { merge: true });
    }
    return result;
  });
}
