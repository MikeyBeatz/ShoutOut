// Query filters only: these cells never grant moderation authority.
import { HttpsError } from 'firebase-functions/v2/https';
import { moderationFilterToken } from './moderation_queue.js';
const alphabet = '0123456789bcdefghjkmnpqrstuvwxyz';
const invalid = () => { throw new HttpsError('invalid-argument', 'Invalid moderation geographic filter.'); };
export function moderationGeohashBox(prefix) {
  if (typeof prefix !== 'string' || prefix.length > 7 || [...prefix].some(c => !alphabet.includes(c))) invalid();
  const box = [-180, -90, 180, 90]; let axis = 0;
  for (const c of prefix) for (let bit = 4; bit >= 0; bit--) {
    const n = alphabet.indexOf(c), middle = (box[axis] + box[axis + 2]) / 2;
    box[axis + ((n >> bit) & 1 ? 0 : 2)] = middle; axis = 1 - axis;
  }
  return box;
}
function rectangles(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) ||
      bounds[0] < -180 || bounds[0] > 180 || bounds[2] < -180 || bounds[2] > 180 ||
      bounds[1] < -90 || bounds[3] > 90 || bounds[1] >= bounds[3] || bounds[0] === bounds[2]) invalid();
  return bounds[0] < bounds[2] ? [bounds] : [[bounds[0], bounds[1], 180, bounds[3]], [-180, bounds[1], bounds[2], bounds[3]]];
}
const intersects = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const contained = (a, b) => b[0] <= a[0] && b[1] <= a[1] && b[2] >= a[2] && b[3] >= a[3];
/** Complete disjoint cover, capped by Firestore's 30 OR disjunction limit.
 * Coarse boundary cells are subsequently filtered using the public hash centre.
 */
export function moderationGeohashCover(bounds) {
  const rects = rectangles(bounds), prefixes = [''];
  for (;;) {
    let chosen = null;
    for (let index = 0; index < prefixes.length; index++) {
      const prefix = prefixes[index], box = moderationGeohashBox(prefix);
      if (prefix.length === 7 || rects.some(r => contained(box, r))) continue;
      const children = [...alphabet].map(c => prefix + c).filter(p => rects.some(r => intersects(moderationGeohashBox(p), r)));
      if (!children.length || prefixes.length - 1 + children.length > 30) continue;
      const area = (box[2] - box[0]) * (box[3] - box[1]);
      if (!chosen || area > chosen.area || area === chosen.area && prefix < chosen.prefix) chosen = { index, prefix, children, area };
    }
    if (!chosen) break;
    prefixes.splice(chosen.index, 1, ...chosen.children);
  }
  return prefixes.sort();
}
export function moderationAreaTokens(level, category, area) {
  if (area?.kind !== 'bounds') return [moderationFilterToken(level, category, area)];
  return moderationGeohashCover(area.value).map(prefix => moderationFilterToken(level, category, prefix ? { kind: 'geohash', value: prefix } : { kind: 'all', value: '' }));
}
export function moderationAreaContains(area, geohash) {
  if (area.kind !== 'bounds') return true;
  if (typeof geohash !== 'string' || !/^[0123456789bcdefghjkmnpqrstuvwxyz]{7}$/.test(geohash)) return false;
  const b = moderationGeohashBox(geohash), longitude = (b[0] + b[2]) / 2, latitude = (b[1] + b[3]) / 2;
  return rectangles(area.value).some(r => longitude >= r[0] && longitude <= r[2] && latitude >= r[1] && latitude <= r[3]);
}
