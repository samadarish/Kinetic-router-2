import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { createOptimizationRun, root } from '../scripts/image-optimization.mjs';
import { encodeIco, renderIcon } from '../scripts/optimize-brand-assets.mjs';

async function fixture(t) {
  const directory = resolve(root, '.cache/image-optimization-tests');
  await mkdir(directory, { recursive: true });
  const workspace = await mkdtemp(resolve(directory, 'run-'));
  t.after(async () => {
    const target = resolve(workspace);
    assert.ok(target.startsWith(directory + sep), 'Test cleanup must stay inside its fixture directory');
    await rm(target, { recursive: true, force: true });
  });
  return workspace;
}

test('repeated runs skip lossy encodes, but changed outputs and profiles invalidate the cache', async (t) => {
  const workspace = await fixture(t);
  await writeFile(resolve(workspace, 'image.webp'), 'original-reviewed-image');
  let encodes = 0;
  const options = { path: 'image.webp', profile: { quality: 88 }, onlyIfSmaller: true, encode: async () => { encodes++; return Buffer.from('optimized'); } };
  let run = await createOptimizationRun(workspace);
  await run.optimize(options);
  await run.save();
  const manifest = await readFile(resolve(workspace, 'scripts/image-optimization-manifest.json'));

  run = await createOptimizationRun(workspace);
  await run.optimize(options);
  await run.save();
  assert.equal(encodes, 1);
  assert.equal(run.results[0].status, 'unchanged');
  assert.deepEqual(await readFile(resolve(workspace, 'scripts/image-optimization-manifest.json')), manifest);
  assert.equal((await readFile(resolve(workspace, 'image.webp'))).toString(), 'optimized');

  await writeFile(resolve(workspace, 'image.webp'), 'new-reviewed-image');
  run = await createOptimizationRun(workspace);
  await run.optimize(options);
  await run.save();
  assert.equal(encodes, 2);
  run = await createOptimizationRun(workspace);
  await run.optimize({ ...options, profile: { quality: 90 } });
  assert.equal(encodes, 3);
});

test('larger recompressions retain the reviewed original and are skipped on repeat runs', async (t) => {
  const workspace = await fixture(t);
  const original = Buffer.from('small');
  await writeFile(resolve(workspace, 'image.webp'), original);
  const options = { path: 'image.webp', profile: { quality: 88 }, onlyIfSmaller: true, encode: async () => Buffer.from('larger-candidate') };
  let run = await createOptimizationRun(workspace);
  await run.optimize(options);
  await run.save();
  assert.equal(run.results[0].retainedOriginal, true);
  assert.deepEqual(await readFile(resolve(workspace, 'image.webp')), original);
  run = await createOptimizationRun(workspace);
  await run.optimize({ ...options, encode: () => { throw new Error('Should not encode again'); } });
  assert.equal(run.results[0].status, 'unchanged');
});

test('derived images regenerate when their authoring master changes', async (t) => {
  const workspace = await fixture(t);
  await writeFile(resolve(workspace, 'master.png'), 'master-one');
  const options = { path: 'logo.webp', source: 'master.png', profile: { lossless: true }, encode: async (input) => input };
  let run = await createOptimizationRun(workspace);
  await run.optimize(options);
  await run.save();
  await writeFile(resolve(workspace, 'master.png'), 'master-two');
  run = await createOptimizationRun(workspace);
  await run.optimize(options);
  assert.equal(run.results[0].status, 'optimized');
  assert.equal((await readFile(resolve(workspace, 'logo.webp'))).toString(), 'master-two');
});

test('a changed source or profile replaces a smaller stale derived output', async (t) => {
  const workspace = await fixture(t);
  await writeFile(resolve(workspace, 'master.png'), 'first');
  const options = { path: 'hero.webp', source: 'master.png', profile: { quality: 80 }, onlyIfSmaller: true, encode: async (input) => input };
  let run = await createOptimizationRun(workspace);
  await run.optimize(options); await run.save();
  await writeFile(resolve(workspace, 'master.png'), 'new-source-with-more-detail');
  run = await createOptimizationRun(workspace);
  await run.optimize(options); await run.save();
  assert.equal((await readFile(resolve(workspace, 'hero.webp'))).toString(), 'new-source-with-more-detail');
  run = await createOptimizationRun(workspace);
  await run.optimize({ ...options, profile: { quality: 90 }, encode: async () => Buffer.from('higher-quality-larger-derived-image') });
  await run.save();
  assert.equal((await readFile(resolve(workspace, 'hero.webp'))).toString(), 'higher-quality-larger-derived-image');
  run = await createOptimizationRun(workspace);
  await run.optimize({ ...options, profile: { quality: 90 }, encode: () => { throw new Error('Repeat must skip encoding'); } });
  assert.equal(run.results[0].status, 'unchanged');
});

test('favicon generation and every ICO frame retain transparent padding and antialiased edges', async () => {
  const source = await sharp(Buffer.from('<svg width="96" height="96"><circle cx="48" cy="48" r="36" fill="#53e1d2"/></svg>')).png().toBuffer();
  const images = [];
  for (const size of [16, 32, 48]) images.push({ size, buffer: await renderIcon(source, size) });
  const ico = encodeIco(images);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  for (let index = 0; index < images.length; index++) {
    const entry = 6 + index * 16;
    const offset = ico.readUInt32LE(entry + 12);
    const length = ico.readUInt32LE(entry + 8);
    const frame = ico.subarray(offset, offset + length);
    assert.deepEqual(frame, images[index].buffer);
    const { width, height, hasAlpha } = await sharp(frame).metadata();
    assert.equal(width, images[index].size);
    assert.equal(height, images[index].size);
    assert.equal(hasAlpha, true);
    const alpha = await sharp(frame).extractChannel(3).raw().toBuffer();
    for (const corner of [0, width - 1, alpha.length - width, alpha.length - 1]) assert.equal(alpha[corner], 0);
    assert.ok(alpha.some((value) => value > 0 && value < 255));
    assert.ok(alpha.some((value) => value === 255));
  }
});
