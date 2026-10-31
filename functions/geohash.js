// Pure seven-character encoder shared by server operations and DEV tools.
export function encodeGeohash(latitude, longitude) {
  const alphabet = '0123456789bcdefghjkmnpqrstuvwxyz';
  const ranges = [[-180, 180], [-90, 90]];
  let result = '';
  let bits = 0;
  let character = 0;
  for (let index = 0; result.length < 7; index++) {
    const axis = index % 2;
    const range = ranges[axis];
    const midpoint = (range[0] + range[1]) / 2;
    const upper = (axis === 0 ? longitude : latitude) >= midpoint;
    character = (character << 1) | Number(upper);
    range[upper ? 0 : 1] = midpoint;
    if (++bits === 5) {
      result += alphabet[character];
      bits = 0;
      character = 0;
    }
  }
  return result;
}
