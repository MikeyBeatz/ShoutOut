import { Buffer } from 'node:buffer';
import { HttpsError } from 'firebase-functions/v2/https';

export const businessLogoSize = 512;
export const businessLogoMaximumBytes = 2 * 1024 * 1024;
const invalid = () => new HttpsError('invalid-argument', 'A valid 512 by 512 PNG logo is required.');

// Decode all pixels: reading a MIME type, signature or header alone is not validation.
export async function normalizeBusinessLogo(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > businessLogoMaximumBytes) throw invalid();
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw invalid();
  try {
    // Future cleanup workers can import the core without loading native image
    // processing on every idle invocation. Node caches this module import.
    const { default: sharp } = await import('sharp');
    const input = sharp(bytes, { failOn: 'warning', limitInputPixels: businessLogoSize ** 2, animated: true });
    const meta = await input.metadata();
    if (meta.format !== 'png' || meta.width !== businessLogoSize || meta.height !== businessLogoSize || (meta.pages ?? 1) !== 1) throw invalid();
    const { data, info } = await input.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
    if (png.length > businessLogoMaximumBytes) throw invalid();
    return png; // Re-encoding raw pixels drops ancillary metadata and trailing data.
  } catch { throw invalid(); }
}
