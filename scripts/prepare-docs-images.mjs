import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

// Run the source importer first. Optional JSON arguments map originalFile to an
// inspected ImageGen output path; generated images become high-quality WebP assets.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventory = JSON.parse(await fs.readFile(path.join(root, '.cache/docs-images/inventory.json'), 'utf8'));
const translations = {};
for (const mappingFile of process.argv.slice(2)) {
  Object.assign(translations, JSON.parse(await fs.readFile(mappingFile, 'utf8')));
}
const assets = {};
for (const page of inventory.pages) {
  for (const image of page.images) {
    const translated = translations[image.originalFile];
    const source = translated ? path.resolve(translated) : path.join(root, image.originalFile);
    const target = path.join(root, 'apps/site/public', image.localSrc);
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (translated) await sharp(source).webp({ quality: 92, smartSubsample: true, effort: 5 }).toFile(target);
    else {
      // Preserve reviewed translations on later imports. Only an explicit
      // translation mapping may replace an existing public screenshot.
      try { await fs.access(target); }
      catch { await fs.copyFile(source, target); }
    }
    const { width, height } = await sharp(target).metadata();
    // Older source-cache entries used a generic label for uncaptioned phone
    // images. Derive a descriptive label rather than shipping empty alt text.
    const description = path.basename(image.localSrc).replace(/^(?:\d+-)+/, '').replace(/\.[^.]+$/, '').replaceAll('-', ' ');
    const alt = !image.alt || /^Configuration step \d+$/.test(image.alt)
      ? description.charAt(0).toUpperCase() + description.slice(1)
      : image.alt;
    const revision = createHash('sha256').update(await fs.readFile(target)).digest('hex').slice(0, 12);
    assets[image.originalSrc] = { src: image.localSrc, alt, width, height, revision };
  }
}
await fs.writeFile(path.join(root, 'apps/site/data/documentation-images.json'), JSON.stringify(assets, null, 2) + '\n');
console.log(`Prepared ${Object.keys(assets).length} local docs images (${Object.keys(translations).length} edited).`);
