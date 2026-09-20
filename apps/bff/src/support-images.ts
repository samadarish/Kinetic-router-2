import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { SupportError, type SupportImageRecord } from './support-store.js';

export const SUPPORT_IMAGE_MAX_BYTES = 512 * 1024;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 32_000_000;
const MAX_EDGE = 1600;
let processing = 0;
const invalid = (message: string) => new SupportError(400, 'SUPPORT_IMAGE_INVALID', message);

function animatedPng(source: Buffer) {
  // libvips may expose only the default frame of APNG, so check its animation control chunk.
  for (let offset = 8; offset + 12 <= source.length;) {
    const length = source.readUInt32BE(offset);
    if (length > source.length - offset - 12) return false;
    const type = source.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    offset += length + 12;
  }
  return false;
}

/** Process only after authentication, write limiting, and (for replies) ticket ownership checks. */
export async function prepareSupportImage(file: File): Promise<SupportImageRecord> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw invalid('Choose a JPG, PNG, or WebP image.');
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw invalid('Choose a non-empty image no larger than 10 MiB.');
  if (processing >= 4) throw new SupportError(503, 'SUPPORT_IMAGE_BUSY', 'Images are being processed. Please retry in a moment.');
  processing++;
  try {
    const source = Buffer.from(await file.arrayBuffer());
    const isJpeg = source.length >= 3 && source[0] === 0xff && source[1] === 0xd8 && source[2] === 0xff;
    const isPng = source.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp = source.length >= 12 && source.toString('ascii', 0, 4) === 'RIFF' && source.toString('ascii', 8, 12) === 'WEBP';
    if (!isJpeg && !isPng && !isWebp) throw invalid('Choose a valid JPG, PNG, or WebP image.');
    if (isPng && animatedPng(source)) throw invalid('Choose one still image, not an animation.');
    const options = { limitInputPixels: MAX_SOURCE_PIXELS, failOn: 'warning' as const, sequentialRead: true };
    const metadata = await sharp(source, options).metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || !metadata.width || !metadata.height
      || metadata.width * metadata.height > MAX_SOURCE_PIXELS || (metadata.pages ?? 1) > 1) {
      throw invalid('Choose one still image no larger than 32 megapixels.');
    }
    // Retry identity uses uploaded bytes so it stays stable across encoder upgrades.
    // Only the digest and normalized pixels are retained; source bytes are never persisted.
    const sha256 = createHash('sha256').update(source).digest('hex');
    let previousEdge = Infinity;
    for (const edge of [MAX_EDGE, 1280, 1024]) {
      const outputEdge = Math.min(edge, Math.max(metadata.width, metadata.height));
      if (outputEdge === previousEdge) continue;
      previousEdge = outputEdge;
      for (const quality of [80, 70, 60]) {
        // Decode the original directly: browser canvas protection cannot alter its pixels.
        // rotate() applies EXIF orientation; Sharp strips metadata by default.
        const result = await sharp(source, options).rotate()
          .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
          .webp({ quality, effort: 3 }).timeout({ seconds: 5 }).toBuffer({ resolveWithObject: true });
        if (result.data.length <= SUPPORT_IMAGE_MAX_BYTES) return {
          bytes: result.data, mimeType: 'image/webp', width: result.info.width, height: result.info.height,
          byteSize: result.data.length, sha256,
        };
      }
    }
    throw invalid('This image cannot fit within 512 KiB. Crop it or choose a smaller image.');
  } catch (error) {
    if (error instanceof SupportError) throw error;
    throw invalid('This image could not be opened. Choose a valid JPG, PNG, or WebP image.');
  } finally { processing--; }
}
