export const SUPPORT_IMAGE_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export type PreparedSupportImage = { blob: Blob; width: number; height: number; name: string };

export function supportImageDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width * height > 32_000_000) {
    throw new Error('This image is too large to prepare. Choose an image under 32 megapixels.');
  }
  return { width, height };
}

export function validateSupportImageFile(file: Pick<File, 'size' | 'type'>) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (!file.size) throw new Error('This image is empty. Choose another image.');
  if (file.size > SUPPORT_IMAGE_MAX_SOURCE_BYTES) throw new Error('Choose an image smaller than 10 MB.');
}

async function decodeImage(file: File): Promise<{ width: number; height: number; close(): void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file), image = new Image();
  try {
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

/** Upload original bytes; canvas privacy protections can alter browser-encoded pixels. */
export async function prepareSupportImage(file: File): Promise<PreparedSupportImage> {
  validateSupportImageFile(file);
  let decoded: Awaited<ReturnType<typeof decodeImage>>;
  try { decoded = await decodeImage(file); }
  catch { throw new Error('This image could not be opened. Try another JPG, PNG, or WebP image.'); }
  try {
    const size = supportImageDimensions(decoded.width, decoded.height);
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    return { blob: file, ...size, name: `image.${extension}` };
  } finally { decoded.close(); }
}
