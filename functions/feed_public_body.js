import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
const fail = (code, message) => { throw new HttpsError(code, message); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);

export function publicFeedBody(data) {
  if (typeof data.authorId !== 'string' || typeof data.authorNickname !== 'string' || typeof data.title !== 'string' ||
      typeof data.text !== 'string' || !(data.createdAt instanceof Timestamp) || !(data.expiresAt instanceof Timestamp)) {
    fail('data-loss', 'Invalid feed source.');
  }
  const result = Object.fromEntries(['authorId', 'authorNickname', 'title', 'text', 'categories', 'geohash', 'status',
    'likesCount', 'dislikesCount', 'commentsCount', 'savesCount', 'avatarId', 'avatarBackgroundStart', 'avatarBackgroundEnd',
    'avatarGradientDirection', 'businessLocationId', 'businessAuthorFormat', 'businessHighlighted', 'businessSpotlight',
    'businessExtendedDuration', 'businessPromotion'].filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]]));
  result.createdAt = data.createdAt.toMillis(); result.expiresAt = data.expiresAt.toMillis();
  if (plain(data.geography)) result.geography = Object.fromEntries(['countryCode', 'subdivisionCode', 'localityName', 'providerPlaceId']
    .filter(key => typeof data.geography[key] === 'string').map(key => [key, data.geography[key]]));
  return result;
}

