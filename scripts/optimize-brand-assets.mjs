import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { createOptimizationRun, digest, printSavings } from './image-optimization.mjs';

const assets = 'packages/brand-ui/assets';
const iconNames = new Map([[16, 'favicon-16.png'], [32, 'favicon-32.png'], [48, 'favicon-48.png'], [180, 'apple-icon.png'], [192, 'app-icon-192.png'], [512, 'app-icon.png']]);

export async function optimizeBrandAssets(run) {
  for (const name of ['wordmark-light', 'wordmark-dark', 'mark-light', 'mark-dark']) {
    await run.optimize({
      path: `${assets}/${name}.png`,
      profile: { format: 'png', compressionLevel: 9, adaptiveFiltering: true, palette: false },
      onlyIfSmaller: true,
      encode: (input) => sharp(input).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer(),
    });
    await run.optimize({
      path: `${assets}/${name}.webp`, source: `${assets}/${name}.png`, compareTo: `${assets}/${name}.png`,
      profile: { format: 'webp', lossless: true, effort: 6, alphaQuality: 100 },
      encode: (input) => sharp(input).webp({ lossless: true, effort: 6, alphaQuality: 100 }).toBuffer(),
    });
  }

  const renderedIcons = new Map();
  for (const [size, name] of iconNames) {
    renderedIcons.set(size, await run.optimize({
      path: `${assets}/${name}`, source: `${assets}/favicon-source-white.png`,
      profile: { format: 'png', size, padding: 0.08, transparent: true, encoding: 'smallest-rgba-or-palette-256-q100-v1' },
      encode: (input) => renderIcon(input, size),
    }));
  }
  await run.optimize({
    path: `${assets}/favicon.ico`, source: `${assets}/favicon-source-white.png`,
    profile: { format: 'ico', sizes: [16, 32, 48], padding: 0.08, transparent: true, encoding: 'png-frames-v1', frameHashes: [16, 32, 48].map((size) => digest(renderedIcons.get(size))) },
    encode: () => encodeIco([16, 32, 48].map((size) => ({ size, buffer: renderedIcons.get(size) }))),
  });

  // This delivery poster is already opaque. Keep the transparent authoring PNG.
  await run.optimize({
    path: `${assets}/social-preview.jpg`,
    profile: { format: 'jpeg', quality: 85, progressive: true, chromaSubsampling: '4:4:4', mozjpeg: true },
    onlyIfSmaller: true,
    encode: (input) => sharp(input).jpeg({ quality: 85, progressive: true, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer(),
  });

  for (const [theme, source] of [['dark', 'logog/header dark mode.png'], ['light', 'logog/header ligth more.png']]) {
    await run.optimize({
      path: `${assets}/header-mark-${theme}.png`, source,
      profile: { format: 'png', width: 144, height: 144, lossless: true, transparent: true },
      encode: (input) => sharp(input).resize(144, 144, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
        .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer(),
    });
  }

  for (const width of [640, 1280, 2062]) {
    const resize = (input) => sharp(input).resize({ width, withoutEnlargement: true, kernel: sharp.kernel.lanczos3 });
    await run.optimize({
      path: `${assets}/home-hero-river-delta-${width}.avif`, source: `${assets}/home-hero-river-delta-source.png`,
      profile: { format: 'avif', width, quality: 60, effort: 6, chromaSubsampling: '4:4:4' },
      encode: (input) => resize(input).avif({ quality: 60, effort: 6, chromaSubsampling: '4:4:4' }).toBuffer(),
    });
    await run.optimize({
      path: `${assets}/home-hero-river-delta-${width}.webp`, source: `${assets}/home-hero-river-delta-source.png`,
      profile: { format: 'webp', width, quality: 80, effort: 6, smartSubsample: true },
      onlyIfSmaller: true,
      encode: (input) => resize(input).webp({ quality: 80, effort: 6, smartSubsample: true }).toBuffer(),
    });
  }
}

export async function renderIcon(input, size) {
  const padding = Math.max(1, Math.round(size * 0.08));
  const markSize = size - padding * 2;
  const mark = await sharp(input).resize(markSize, markSize, { fit: 'contain', kernel: sharp.kernel.lanczos3 }).png().toBuffer();
  const image = sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, left: padding, top: padding }]);
  const rgba = await image.clone().png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
  const palette = await image.clone().png({ compressionLevel: 9, effort: 10, palette: true, colours: 256, quality: 100 }).toBuffer();
  return palette.length < rgba.length ? palette : rgba;
}

export function encodeIco(images) {
  const headerSize = 6 + 16 * images.length;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = headerSize;
  images.forEach(({ size, buffer }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(buffer.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += buffer.length;
  });
  return Buffer.concat([header, ...images.map(({ buffer }) => buffer)]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run = await createOptimizationRun();
  await optimizeBrandAssets(run);
  await run.save();
  printSavings('Preferred logo formats', run.results.filter(({ path }) => /\/(?:wordmark|mark)-.*\.webp$/.test(path)));
  printSavings('Preferred hero formats', run.results.filter(({ path }) => path.endsWith('.avif')));
  console.log(`Brand assets: ${run.results.filter(({ status }) => status !== 'unchanged').length} processed; ${run.results.filter(({ status }) => status === 'unchanged').length} unchanged.`);
}
