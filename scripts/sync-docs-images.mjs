import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(root, '.cache/docs-images');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'apps/site/data/reference-manifest.json'), 'utf8'));
const origin = 'https://hao.ai';
const refresh = process.argv.includes('--refresh');
const run = promisify(execFile);
const decode = (value) => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"');
function images(html) {
  return [...html.matchAll(/<img\b[^>]*>/gi)].map(([tag]) => {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]));
    const optimized = new URL(attrs.src, origin);
    const asset = optimized.searchParams.get('url') || attrs.src;
    return { src: attrs.src, asset, alt: attrs.alt || '', width: Number(attrs.width), height: Number(attrs.height) };
  });
}
async function fetchBytes(url) {
  if (new URL(url).origin !== origin) throw new Error(`Unexpected image host: ${url}`);
  if (process.platform === 'win32') {
    const { stdout } = await run(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/curl.exe'), ['--ipv4', '--fail', '--silent', '--show-error', '--location', '--max-time', '45', '--retry', '5', '--retry-all-errors', '--retry-delay', '1', url], { encoding: 'buffer', maxBuffer: 25 * 1024 * 1024 });
    return stdout;
  }
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(40000), headers: { 'User-Agent': 'kineticRouter documentation asset import' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) { lastError = error; }
  }
  throw lastError;
}
await fs.mkdir(cache, { recursive: true });
const pages = [];
const queue = [...manifest.docsContent];
async function worker() {
  for (let page = queue.shift(); page; page = queue.shift()) {
    const slug = page.route.replace(/^\/docs\/?/, '') || 'index';
    const pageCache = path.join(cache, `${slug.replaceAll('/', '--')}.html`);
    let html;
    if (!refresh) {
      try { html = await fs.readFile(pageCache, 'utf8'); }
      catch { /* Fetch pages missing from the local cache. */ }
    }
    if (html === undefined) {
      html = (await fetchBytes(origin + page.route)).toString('utf8');
      await fs.writeFile(pageCache, html);
    }
    const article = html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || html.match(/<main\b[\s\S]*?<\/main>/i)?.[0];
    if (!article) throw new Error(`Missing article: ${page.route}`);
    const local = images(page.html);
    const remote = images(article);
    if (local.length !== remote.length) throw new Error(`Image count changed on ${page.route}: local=${local.length}, remote=${remote.length}`);
    const entries = [];
    for (let index = 0; index < local.length; index++) {
      const original = local[index];
      const current = remote[index];
      const sourceUrl = new URL(current.asset, origin).href;
      const filename = path.posix.basename(new URL(sourceUrl).pathname).replace(/hao-?ai/gi, 'kineticrouter').replace(/\.[a-f0-9]{8}(?=\.)/i, '');
      const description = filename.replace(/^(?:\d+-)+/, '').replace(/\.[^.]+$/, '').replaceAll('-', ' ');
      const fallbackAlt = description.charAt(0).toUpperCase() + description.slice(1);
      const relative = `${slug}/${filename}`;
      const sourcePath = path.join(cache, 'originals', relative);
      await fs.mkdir(path.dirname(sourcePath), { recursive: true });
      let cached = false;
      if (!refresh) {
        try { await fs.access(sourcePath); cached = true; }
        catch { /* Download images missing from the local cache. */ }
      }
      if (!cached) await fs.writeFile(sourcePath, await fetchBytes(sourceUrl));
      const metadata = await sharp(sourcePath).metadata();
      entries.push({ index, alt: original.alt || current.alt || fallbackAlt, originalSrc: original.src, sourceUrl, originalFile: path.relative(root, sourcePath).replaceAll('\\', '/'), localSrc: `/docs-assets/${relative}`, width: metadata.width, height: metadata.height, format: metadata.format });
    }
    pages.push({ route: page.route, sourcePage: origin + page.route, images: entries });
    console.log(`${page.route}: ${entries.length} images`);
  }
}
await Promise.all(Array.from({ length: 2 }, worker));
pages.sort((a, b) => a.route.localeCompare(b.route));
await fs.writeFile(path.join(cache, 'inventory.json'), JSON.stringify({ checkedAt: new Date().toISOString(), pages }, null, 2) + '\n');
console.log(`Inventoried ${pages.length} pages; downloaded ${pages.reduce((sum, page) => sum + page.images.length, 0)} images to .cache/docs-images/originals.`);
