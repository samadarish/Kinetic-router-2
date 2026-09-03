import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

const imageSpecs = [
  ['packages/brand-ui/assets/favicon-source-white.png', 1254, 1254, 550_000],
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

for (const [relativePath, expectedWidth, expectedHeight, maxBytes] of imageSpecs) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) {
    failures.push(`${relativePath} is missing`);
    continue;
  }
  const bytes = statSync(path).size;
  const { width, height } = imageDimensions(readFileSync(path));
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
  ['apps/console/index.html', ['/favicon-16.png', '/favicon-32.png', '/favicon-48.png', '/favicon.ico', '/og.jpg']],
];
for (const [relativePath, expectedValues] of metadataChecks) {
  const contents = readFileSync(resolve(root, relativePath), 'utf8');
  for (const value of expectedValues) {
    if (!contents.includes(value)) failures.push(`${relativePath} does not reference ${value}`);
  }
}

if (failures.length) {
  console.error(`Brand asset checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Brand asset dimensions, budgets, metadata, and synchronized copies are valid.');

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function imageDimensions(buffer) {
  if (buffer.subarray(1, 4).toString('ascii') === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += length + 2;
    }
  }
  throw new Error('Unsupported image format');
}

function icoSizes(buffer) {
  if (buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return [];
  const count = buffer.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const size = buffer.readUInt8(6 + (index * 16));
    return size === 0 ? 256 : size;
  }).sort((left, right) => left - right);
}
