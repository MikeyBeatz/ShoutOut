import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { reactionTransition, nextInteractionRate } from './toggle_shout_reaction.js';

const fail = (code, message) => { throw new HttpsError(code, message); };
const digest = (value) => createHash('sha256').update(value).digest('hex');
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const counter = (value) => Number.isSafeInteger(value) && value >= 0;

export function validateCommentReaction(input) {
  const fields = ['idempotencyKey', 'shoutId', 'commentId', 'button', 'expectedUserId'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !fields.includes(key)) ||
      !identifier(input.idempotencyKey) || !identifier(input.shoutId) || !identifier(input.commentId) ||
      !['like', 'dislike'].includes(input.button) ||
      (input.expectedUserId !== undefined && !identifier(input.expectedUserId))) {
    fail('invalid-argument', 'Invalid comment reaction fields.');
  }
  return Object.fromEntries(fields.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}

export async function toggleCommentReactionOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request);
  const input = validateCommentReaction(request.data);
  if (input.expectedUserId !== undefined && input.expectedUserId !== uid) {
    fail('unauthenticated', 'The signed-in account changed.');
  }
  const key = digest(`${uid}\ntoggleCommentReaction\n${input.idempotencyKey}`);
  const fingerprint = digest(JSON.stringify(input));
  const receiptRef = db.doc(`serverOperations/${key}`);
  const shoutRef = db.doc(`shouts/${input.shoutId}`);
  const commentRef = shoutRef.collection('comments').doc(input.commentId);
  const reactionRef = commentRef.collection('reactions').doc(uid);
  const rateRef = db.doc(`rateLimits/${uid}/actions/interaction`);
  return db.runTransaction(async (transaction) => {
    const now = Timestamp.fromDate(clock());
    // Current Rules use eligibleUser(), not the content-creation restriction.
    await requireEligibleActor({ request, db, reader: transaction, now: now.toDate() });
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists) {
      const data = receipt.data();
      if (data.action !== 'toggleCommentReaction' || data.fingerprint !== fingerprint) {
        fail('already-exists', 'Idempotency key was already used for another payload.');
      }
      if (data.userId !== uid || data.shoutId !== input.shoutId || data.commentId !== input.commentId ||
          ![null, 'like', 'dislike'].includes(data.result?.type) ||
          !counter(data.result?.likes) || !counter(data.result?.dislikes)) {
        fail('failed-precondition', 'Invalid stored operation result.');
      }
      return data.result;
    }
    const [shout, comment, reaction, rate] = await transaction.getAll(shoutRef, commentRef, reactionRef, rateRef);
    if (!shout.exists || !comment.exists) fail('not-found', 'The comment or its Shout is no longer available.');
    // Retained expired/deleted Shouts remain valid reaction targets, as in Rules.
    const data = comment.data();
    const oldType = reaction.exists ? reaction.data().type : null;
    const result = reactionTransition(oldType, input.button, data.likesCount ?? 0, data.dislikesCount ?? 0);
    const rateData = nextInteractionRate(rate.data(), now, `commentReaction_${input.shoutId}_${input.commentId}`);
    let publicProfile;
    if (result.type !== null && data.authorId !== uid) {
      if (!identifier(data.authorId)) fail('failed-precondition', 'Invalid stored comment author.');
      const settings = await transaction.get(db.doc(`users/${data.authorId}/settings/notifications`));
      const enabled = settings.data()?.reactions;
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        fail('failed-precondition', 'Invalid notification preference.');
      }
      if (enabled !== false) {
        publicProfile = await transaction.get(db.doc(`publicProfiles/${uid}`));
        if (publicProfile.exists && (typeof publicProfile.data().nickname !== 'string' ||
            typeof shout.data().title !== 'string')) {
          fail('failed-precondition', 'Invalid public profile or Shout title.');
        }
      }
    }
    if (result.type === null) transaction.delete(reactionRef);
    else transaction.set(reactionRef, { type: result.type, updatedAt: now });
    transaction.update(commentRef, { likesCount: result.likes, dislikesCount: result.dislikes });
    transaction.set(rateRef, rateData);
    transaction.create(receiptRef, { userId: uid, action: 'toggleCommentReaction', fingerprint,
      shoutId: input.shoutId, commentId: input.commentId, result, createdAt: now });
    if (publicProfile?.exists) {
      transaction.set(db.doc(`users/${data.authorId}/notifications/commentReaction_${result.type}_${input.shoutId}_${input.commentId}`), {
        kind: 'commentReaction', actorId: uid, actorNickname: publicProfile.data().nickname,
        targetShoutId: input.shoutId, targetTitle: shout.data().title, targetCommentId: input.commentId,
        reactionType: result.type, eventCount: FieldValue.increment(1), createdAt: now, readAt: null,
      }, { merge: true });
    }
    return result;
  });
}
