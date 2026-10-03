import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { createOptimizationRun, digest, printSavings, root } from './image-optimization.mjs';
import { optimizeBrandAssets } from './optimize-brand-assets.mjs';

const run = await createOptimizationRun();
await optimizeBrandAssets(run);

const metadataPath = resolve(root, 'apps/site/data/documentation-images.json');
const originalMetadata = await readFile(metadataPath, 'utf8');
const metadata = JSON.parse(originalMetadata);
const paths = [...new Set(Object.values(metadata).map(({ src }) => src))];
let next = 0;
// Work only on finalized public screenshots, including reviewed translations.
// Limit decoder concurrency to keep large captures from exhausting memory.
await Promise.all(Array.from({ length: 3 }, async () => {
  while (next < paths.length) {
    const src = paths[next++];
    if (!src.startsWith('/docs-assets/') || src.includes('..')) throw new Error(`Invalid docs image path: ${src}`);
    const path = `apps/site/public${src}`;
    const input = await readFile(resolve(root, path));
    const { hasAlpha } = await sharp(input).metadata();
    const options = hasAlpha ? { lossless: true, effort: 6, alphaQuality: 100 } : { quality: 88, effort: 6, smartSubsample: true, alphaQuality: 100 };
    const output = await run.optimize({ path, profile: { format: 'webp', ...options }, onlyIfSmaller: true, encode: (buffer) => sharp(buffer).webp(options).toBuffer() });
    const { width, height } = await sharp(output).metadata();
    for (const image of Object.values(metadata).filter((image) => image.src === src)) {
      if (image.width !== width || image.height !== height) throw new Error(`Screenshot dimensions changed: ${src}`);
      image.revision = digest(output).slice(0, 12);
    }
  }
}));

const updatedMetadata = JSON.stringify(metadata, null, 2) + '\n';
if (updatedMetadata !== originalMetadata.replaceAll('\r\n', '\n')) {
  await writeFile(metadataPath, originalMetadata.includes('\r\n') ? updatedMetadata.replaceAll('\n', '\r\n') : updatedMetadata);
}
await run.save();

printSavings('Documentation screenshots (across all pages)', run.results.filter(({ path }) => path.startsWith('apps/site/public/docs-assets/')));
printSavings('Preferred logo formats', run.results.filter(({ path }) => /\/(?:wordmark|mark)-.*\.webp$/.test(path)));
printSavings('Preferred hero formats', run.results.filter(({ path }) => path.endsWith('.avif')));
printSavings('WebP hero fallbacks', run.results.filter(({ path }) => /home-hero-\d+\.webp$/.test(path)));
printSavings('Social poster', run.results.filter(({ path }) => path.endsWith('.jpg')));
console.log(`${run.results.filter(({ status }) => status !== 'unchanged').length} images processed; ${run.results.filter(({ status }) => status === 'unchanged').length} unchanged. Transparent icon output takes priority over retaining smaller opaque tiles.`);
