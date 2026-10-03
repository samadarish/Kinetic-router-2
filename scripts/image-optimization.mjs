import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function readOptional(path) {
  try { return await readFile(path); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

// Committed output hashes prevent a second lossy encode of finalized screenshots
// and JPEGs. Source hashes also invalidate derived assets when a master changes.
export async function createOptimizationRun(workspace = root) {
  const manifestPath = resolve(workspace, 'scripts/image-optimization-manifest.json');
  const saved = await readOptional(manifestPath);
  const manifest = saved ? JSON.parse(saved.toString()) : { version: 1, assets: {} };
  if (manifest.version !== 1) throw new Error('Unsupported image optimization manifest version');
  const results = [];

  async function optimize({ path, source, compareTo, profile, encode, onlyIfSmaller = false }) {
    const target = resolve(workspace, path);
    const current = await readOptional(target);
    const input = source ? await readFile(resolve(workspace, source)) : current;
    if (!input) throw new Error(`Missing image input: ${source ?? path}`);
    const sourceHash = source ? digest(input) : undefined;
    const previous = manifest.assets[path];
    const currentHash = current && digest(current);
    if (previous && currentHash === previous.outputHash
      && sourceHash === previous.sourceHash
      && JSON.stringify(profile) === JSON.stringify(previous.profile)) {
      results.push({ path, ...previous, status: 'unchanged' });
      return current;
    }

    const baseline = current ?? (compareTo && await readFile(resolve(workspace, compareTo))) ?? (source && input);
    const candidate = await encode(input);
    // A derived file belongs to its source and encoding profile. A stale smaller
    // output must never win over newly supplied artwork or a changed profile.
    const canRetain = !source || (previous?.sourceHash === sourceHash
      && JSON.stringify(previous.profile) === JSON.stringify(profile));
    const output = onlyIfSmaller && canRetain && current && candidate.length >= current.length ? current : candidate;
    if (!current || !current.equals(output)) {
      if (current) {
        const backup = resolve(workspace, '.cache/image-optimization/before', path);
        if (!await readOptional(backup)) {
          await mkdir(dirname(backup), { recursive: true });
          await copyFile(target, backup);
        }
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, output);
    }
    const record = {
      profile,
      ...(sourceHash ? { sourceHash } : { inputHash: digest(input) }),
      outputHash: digest(output),
      originalBytes: previous?.originalBytes ?? baseline?.length ?? output.length,
      bytes: output.length,
      retainedOriginal: output === current,
    };
    manifest.assets[path] = record;
    results.push({ path, ...record, status: output === current ? 'retained' : 'optimized' });
    return output;
  }

  async function save() {
    const ordered = { version: 1, assets: Object.fromEntries(Object.entries(manifest.assets).sort(([a], [b]) => a.localeCompare(b))) };
    const contents = JSON.stringify(ordered, null, 2) + '\n';
    if (saved?.toString() !== contents) {
      await mkdir(dirname(manifestPath), { recursive: true });
      await writeFile(manifestPath, contents);
    }
  }

  return { optimize, save, results };
}

export function printSavings(label, records) {
  const before = records.reduce((total, asset) => total + asset.originalBytes, 0);
  const after = records.reduce((total, asset) => total + asset.bytes, 0);
  const percent = before ? ((before - after) / before * 100).toFixed(1) : '0.0';
  console.log(`${label}: ${before.toLocaleString('en-US')} -> ${after.toLocaleString('en-US')} bytes (${percent}% smaller)`);
}
