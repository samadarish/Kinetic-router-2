import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

const imageSpecs = [
  ['packages/brand-ui/assets/favicon-source-white.png', 1254, 1254, 550_000],
  ['packages/brand-ui/assets/home-hero-river-delta-source.png', 2062, 763, 3_000_000],
  ['packages/brand-ui/assets/home-hero-river-delta-640.webp', 640, 237, 55_000],
  ['packages/brand-ui/assets/home-hero-river-delta-1280.webp', 1280, 474, 190_000],
  ['packages/brand-ui/assets/home-hero-river-delta-2062.webp', 2062, 763, 450_000],
  ['packages/brand-ui/assets/header-mark-light.png', 144, 144, 20_000],
  ['packages/brand-ui/assets/header-mark-dark.png', 144, 144, 20_000],
  ['packages/brand-ui/assets/wordmark-light.png', 360, 136, 12_000],
  ['packages/brand-ui/assets/wordmark-dark.png', 360, 136, 12_000],
  ['packages/brand-ui/assets/mark-light.png', 96, 96, 5_000],
  ['packages/brand-ui/assets/mark-dark.png', 96, 96, 5_000],
  ['packages/brand-ui/assets/favicon-16.png', 16, 16, 1_500],
  ['packages/brand-ui/assets/favicon-32.png', 32, 32, 2_000],
  ['packages/brand-ui/assets/favicon-48.png', 48, 48, 3_000],
  ['packages/brand-ui/assets/apple-icon.png', 180, 180, 12_000],
  ['packages/brand-ui/assets/app-icon-192.png', 192, 192, 14_000],
  ['packages/brand-ui/assets/app-icon.png', 512, 512, 75_000],
  ['packages/brand-ui/assets/social-preview.jpg', 1200, 630, 70_000],
];

for (const name of ['wordmark-light', 'wordmark-dark', 'mark-light', 'mark-dark']) {
  const wordmark = name.startsWith('wordmark');
  imageSpecs.push([`packages/brand-ui/assets/${name}.webp`, wordmark ? 360 : 96, wordmark ? 136 : 96, wordmark ? 12_000 : 5_000]);
}
imageSpecs.push(
  ['packages/brand-ui/assets/home-hero-river-delta-640.avif', 640, 237, 45_000],
  ['packages/brand-ui/assets/home-hero-river-delta-1280.avif', 1280, 474, 130_000],
  ['packages/brand-ui/assets/home-hero-river-delta-2062.avif', 2062, 763, 260_000],
);

for (const [relativePath, expectedWidth, expectedHeight, maxBytes] of imageSpecs) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) {
    failures.push(`${relativePath} is missing`);
    continue;
  }
  const bytes = statSync(path).size;
  const { width, height } = await sharp(path).metadata();
  if (width !== expectedWidth || height !== expectedHeight) {
    failures.push(`${relativePath} is ${width}x${height}; expected ${expectedWidth}x${expectedHeight}`);
  }
  if (bytes > maxBytes) failures.push(`${relativePath} is ${bytes} bytes; maximum is ${maxBytes}`);
}

for (const [relativePath, maxBytes] of [['packages/brand-ui/assets/favicon.ico', 10_000]]) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) failures.push(`${relativePath} is missing`);
  else {
    if (statSync(path).size > maxBytes) failures.push(`${relativePath} exceeds ${maxBytes} bytes`);
    const sizes = icoSizes(readFileSync(path));
    if (sizes.join(',') !== '16,32,48') failures.push(`${relativePath} contains ${sizes.join(',')}; expected 16,32,48`);
  }
}

const synchronizedCopies = [
  ['logog/header dark mode.png', 'packages/brand-ui/assets/favicon-source-white.png'],
  ['packages/brand-ui/assets/wordmark-light.png', 'apps/site/public/brand/kineticrouter/wordmark-light.png'],
  ['packages/brand-ui/assets/wordmark-dark.png', 'apps/site/public/brand/kineticrouter/wordmark-dark.png'],
  ['packages/brand-ui/assets/mark-light.png', 'apps/site/public/brand/kineticrouter/mark-light.png'],
  ['packages/brand-ui/assets/mark-dark.png', 'apps/site/public/brand/kineticrouter/mark-dark.png'],
  ['packages/brand-ui/assets/social-preview.jpg', 'apps/site/public/og.jpg'],
  ['packages/brand-ui/assets/favicon-16.png', 'apps/site/public/favicon-16.png'],
  ['packages/brand-ui/assets/favicon-32.png', 'apps/site/public/favicon-32.png'],
  ['packages/brand-ui/assets/favicon-48.png', 'apps/site/public/favicon-48.png'],
  ['packages/brand-ui/assets/favicon.ico', 'apps/site/public/favicon.ico'],
  ['packages/brand-ui/assets/apple-icon.png', 'apps/site/public/apple-icon.png'],
  ['packages/brand-ui/assets/app-icon-192.png', 'apps/site/public/favicon-192.png'],
  ['packages/brand-ui/assets/app-icon.png', 'apps/site/public/icon-512.png'],
  ['packages/brand-ui/assets/wordmark-light.png', 'apps/console/public/brand/kineticrouter/wordmark-light.png'],
  ['packages/brand-ui/assets/wordmark-dark.png', 'apps/console/public/brand/kineticrouter/wordmark-dark.png'],
  ['packages/brand-ui/assets/mark-light.png', 'apps/console/public/brand/kineticrouter/mark-light.png'],
  ['packages/brand-ui/assets/mark-dark.png', 'apps/console/public/brand/kineticrouter/mark-dark.png'],
  ['packages/brand-ui/assets/social-preview.jpg', 'apps/console/public/og.jpg'],
  ['packages/brand-ui/assets/favicon-16.png', 'apps/console/public/favicon-16.png'],
  ['packages/brand-ui/assets/favicon-32.png', 'apps/console/public/favicon-32.png'],
  ['packages/brand-ui/assets/favicon-48.png', 'apps/console/public/favicon-48.png'],
  ['packages/brand-ui/assets/favicon.ico', 'apps/console/public/favicon.ico'],
];

for (const name of ['wordmark-light', 'wordmark-dark', 'mark-light', 'mark-dark']) {
  for (const app of ['site', 'console']) {
    synchronizedCopies.push([`packages/brand-ui/assets/${name}.webp`, `apps/${app}/public/brand/kineticrouter/${name}.webp`]);
  }
}
for (const theme of ['dark', 'light']) {
  for (const app of ['site', 'console']) synchronizedCopies.push([`packages/brand-ui/assets/header-mark-${theme}.png`, `apps/${app}/public/brand/kineticrouter/header-mark-${theme}.png`]);
  const header = resolve(root, `packages/brand-ui/assets/header-mark-${theme}.png`);
  if (existsSync(header)) {
    await checkTransparentIcon(readFileSync(header), `header-mark-${theme}.png`);
    const source = theme === 'dark' ? 'logog/header dark mode.png' : 'logog/header ligth more.png';
    const expected = await sharp(resolve(root, source)).resize(144, 144, { fit: 'contain', kernel: sharp.kernel.lanczos3 }).ensureAlpha().raw().toBuffer();
    const actual = await sharp(header).ensureAlpha().raw().toBuffer();
    if (!expected.equals(actual)) failures.push(`header-mark-${theme}.png changes resized logo pixels`);
  }
}
for (const width of [640, 1280, 2062]) {
  for (const format of ['avif', 'webp']) synchronizedCopies.push([`packages/brand-ui/assets/home-hero-river-delta-${width}.${format}`, `apps/site/public/brand/kineticrouter/home-hero-river-delta-${width}.${format}`]);
}

for (const [source, target] of synchronizedCopies) {
  const sourcePath = resolve(root, source);
  const targetPath = resolve(root, target);
  if (!existsSync(targetPath)) {
    failures.push(`${target} is missing`);
  } else if (digest(sourcePath) !== digest(targetPath)) {
    failures.push(`${target} is not synchronized with ${source}`);
  }
}

for (const retired of [
  'apps/site/public/icon.png',
  'apps/site/public/opengraph-image.png',
  'apps/site/public/og.png',
  'apps/console/public/og.png',
]) {
  if (existsSync(resolve(root, retired))) failures.push(`${retired} is a retired duplicate`);
}

const metadataChecks = [
  ['apps/site/app/layout.tsx', ['/favicon-16.png', '/favicon-32.png', '/favicon-48.png', '/favicon.ico', '/og.jpg']],
  ['apps/site/components/home-hero.tsx', ['/brand/kineticrouter/home-hero-river-delta-640.webp', '/brand/kineticrouter/home-hero-river-delta-1280.webp', '/brand/kineticrouter/home-hero-river-delta-2062.webp']],
  ['apps/console/index.html', ['/favicon-16.png', '/favicon-32.png', '/favicon-48.png', '/favicon.ico', '/og.jpg']],
];
for (const [relativePath, expectedValues] of metadataChecks) {
  const contents = readFileSync(resolve(root, relativePath), 'utf8');
  for (const value of expectedValues) {
    if (!contents.includes(value)) failures.push(`${relativePath} does not reference ${value}`);
  }
}

const hero = readFileSync(resolve(root, 'apps/site/components/home-hero.tsx'), 'utf8');
for (const width of [640, 1280, 2062]) {
  if (!hero.includes(`/brand/kineticrouter/home-hero-river-delta-${width}.avif`)) failures.push(`Hero has no ${width}w AVIF source`);
}

// Lossless logo delivery must retain every alpha sample and visible RGB pixel.
for (const name of ['wordmark-light', 'wordmark-dark', 'mark-light', 'mark-dark']) {
  const pngPath = resolve(root, `packages/brand-ui/assets/${name}.png`);
  const webpPath = resolve(root, `packages/brand-ui/assets/${name}.webp`);
  if (!existsSync(webpPath)) continue;
  const original = await sharp(pngPath).ensureAlpha().raw().toBuffer();
  const optimized = await sharp(webpPath).ensureAlpha().raw().toBuffer();
  for (let index = 0; index < original.length; index += 4) {
    if (original[index + 3] !== optimized[index + 3]
      || (original[index + 3] > 0 && !original.subarray(index, index + 3).equals(optimized.subarray(index, index + 3)))) {
      failures.push(`${name}.webp changes logo pixels or transparency`);
      break;
    }
  }
}

for (const name of ['favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-icon.png', 'app-icon-192.png', 'app-icon.png']) {
  const path = resolve(root, 'packages/brand-ui/assets', name);
  if (existsSync(path)) await checkTransparentIcon(readFileSync(path), name);
}
const icoPath = resolve(root, 'packages/brand-ui/assets/favicon.ico');
if (existsSync(icoPath)) {
  const ico = readFileSync(icoPath);
  for (let index = 0; index < ico.readUInt16LE(4); index++) {
    const entry = 6 + index * 16;
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    const frame = ico.subarray(offset, offset + length);
    await checkTransparentIcon(frame, `favicon.ico frame ${index + 1}`);
    const size = ico.readUInt8(entry) || 256;
    const pngPath = resolve(root, `packages/brand-ui/assets/favicon-${size}.png`);
    if (!existsSync(pngPath) || !frame.equals(readFileSync(pngPath))) failures.push(`favicon.ico ${size}px frame differs from its PNG favicon`);
  }
}

const manifestPath = resolve(root, 'scripts/image-optimization-manifest.json');
if (!existsSync(manifestPath)) failures.push('Image optimization manifest is missing');
else {
  const { assets } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const [relativePath, record] of Object.entries(assets)) {
    const path = resolve(root, relativePath);
    if (!existsSync(path) || digest(path) !== record.outputHash) failures.push(`${relativePath} does not match its optimized output hash; run npm run optimize:images`);
  }
  const screenshots = JSON.parse(readFileSync(resolve(root, 'apps/site/data/documentation-images.json'), 'utf8'));
  for (const image of Object.values(screenshots)) {
    const relativePath = `apps/site/public${image.src}`;
    const path = resolve(root, relativePath);
    if (!existsSync(path)) { failures.push(`${image.src} is missing`); continue; }
    const { width, height } = await sharp(path).metadata();
    if (width !== image.width || height !== image.height) failures.push(`${image.src} dimensions disagree with documentation metadata`);
    if (digest(path).slice(0, 12) !== image.revision) failures.push(`${image.src} has a stale revision`);
    if (!assets[relativePath]) failures.push(`${image.src} has not been optimized`);
  }
}

if (failures.length) {
  console.error(`Brand asset checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Image dimensions, budgets, lossless logo pixels, transparent icons, documentation revisions, hashes, and synchronized copies are valid.');

async function checkTransparentIcon(buffer, name) {
  const metadata = await sharp(buffer).metadata();
  if (!metadata.hasAlpha) { failures.push(`${name} has no alpha channel`); return; }
  const { data, info } = await sharp(buffer).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const corners = [0, info.width - 1, data.length - info.width, data.length - 1];
  if (corners.some((index) => data[index] !== 0)) failures.push(`${name} has opaque corners`);
  if (!data.some((value) => value > 0)) failures.push(`${name} is empty`);
  if (!data.some((value) => value > 0 && value < 255)) failures.push(`${name} has no antialiased alpha edges`);
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function icoSizes(buffer) {
  if (buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return [];
  const count = buffer.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const size = buffer.readUInt8(6 + (index * 16));
    return size === 0 ? 256 : size;
  }).sort((left, right) => left - right);
}
