import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, 'packages/brand-ui/assets');
const faviconSource = resolve(assets, 'favicon-source-white.png');
const appIcon = resolve(assets, 'app-icon.png');

const pngOptions = {
  compressionLevel: 9,
  effort: 10,
  palette: true,
  colours: 256,
  quality: 100,
};

// The white-symbol source is intentionally placed on a neutral dark tile. This
// keeps both halves of the mark legible in light and dark browser chrome.
const iconSizes = [16, 32, 48, 180, 192, 512];
const renderedIcons = new Map();
for (const size of iconSizes) renderedIcons.set(size, await renderIcon(size));

await Promise.all([
  writeFile(resolve(assets, 'favicon-16.png'), renderedIcons.get(16)),
  writeFile(resolve(assets, 'favicon-32.png'), renderedIcons.get(32)),
  writeFile(resolve(assets, 'favicon-48.png'), renderedIcons.get(48)),
  writeFile(resolve(assets, 'favicon.ico'), encodeIco([16, 32, 48].map((size) => ({ size, buffer: renderedIcons.get(size) })))),
  writeFile(resolve(assets, 'apple-icon.png'), renderedIcons.get(180)),
  writeFile(resolve(assets, 'app-icon-192.png'), renderedIcons.get(192)),
  writeFile(appIcon, renderedIcons.get(512)),
  sharp(resolve(assets, 'social-preview.png'))
    .flatten({ background: '#141413' })
    .jpeg({ quality: 88, progressive: true, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toFile(resolve(assets, 'social-preview.jpg')),
]);

console.log('Optimized brand delivery assets.');

async function renderIcon(size) {
  const padding = Math.max(1, Math.round(size * 0.08));
  const markSize = size - (padding * 2);
  const mark = await sharp(faviconSource)
    .resize(markSize, markSize, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: '#141413' },
  })
    .composite([{ input: mark, left: padding, top: padding }])
    .png(pngOptions)
    .toBuffer();
}

function encodeIco(images) {
  const headerSize = 6 + (16 * images.length);
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = headerSize;
  images.forEach(({ size, buffer }, index) => {
    const entry = 6 + (index * 16);
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(buffer.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += buffer.length;
  });

  return Buffer.concat([header, ...images.map(({ buffer }) => buffer)]);
}
