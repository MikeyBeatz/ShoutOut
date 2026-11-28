import test from 'node:test';
import assert from 'node:assert/strict';
import { moderationGeohashBox, moderationGeohashCover, moderationAreaContains, moderationAreaTokens } from './moderation_queue_geography.js';
import { encodeGeohash } from './geohash.js';
test('bounded disjoint covers include every sampled point including the antimeridian', () => {
  for (const bounds of [[14.1, 50.5, 14.2, 50.6], [-1, 48, 1, 52], [175, -20, -175, 0], [-180, -90, 180, 90]]) {
    const prefixes = moderationGeohashCover(bounds); assert(prefixes.length <= 30); assert(prefixes.length > 0);
    for (const a of prefixes) for (const b of prefixes) if (a !== b) assert(!a.startsWith(b));
    const east = bounds[0] < bounds[2] ? bounds[2] : bounds[2] + 360;
    for (let x = 0; x <= 20; x++) for (let y = 0; y <= 10; y++) {
      let lon = bounds[0] + (east - bounds[0]) * x / 20; if (lon > 180) lon -= 360;
      const lat = bounds[1] + (bounds[3] - bounds[1]) * y / 10, cell = encodeGeohash(lat, lon);
      assert(prefixes.some(p => cell.startsWith(p)), `${bounds}:${lat}:${lon}:${cell}`);
    }
  }
});
test('boundary cell filtering uses public geohash, not an invented precise location', () => {
  const cell = encodeGeohash(50.53, 14.13), box = moderationGeohashBox(cell);
  const area = { kind: 'bounds', value: [14.1, 50.5, 14.2, 50.6] };
  assert(box[0] < 14.13 && box[2] > 14.13); assert(moderationAreaContains(area, cell));
  assert(!moderationAreaContains(area, encodeGeohash(0, 0))); assert(!moderationAreaContains(area, null));
  assert(moderationAreaTokens(3, 'all', area).length <= 30);
  assert.throws(() => moderationGeohashCover([0, 1, 0, 2]), { code: 'invalid-argument' });
});
