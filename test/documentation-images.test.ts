import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import manifest from '../apps/site/data/reference-manifest.json';
import assets from '../apps/site/data/documentation-images.json';
import { localizeDocumentationImages } from '../apps/site/data/documentation-images';

describe('documentation screenshots', () => {
  it('restores every captured image without retaining the external optimizer or its srcset', () => {
    let total = 0;
    for (const page of manifest.docsContent) {
      const before = [...page.html.matchAll(/<img\b[^>]*>/gi)];
      const html = localizeDocumentationImages(page.html);
      const after = [...html.matchAll(/<img\b[^>]*>/gi)];
      expect(after.length, page.route).toBe(before.length);
      for (const [tag] of after) {
        expect(tag, page.route).toMatch(/src="\/docs-assets\//);
        expect(tag, page.route).not.toMatch(/srcset|_next\/image|background-image/);
        expect(tag, page.route).toContain('loading="lazy"');
        expect(tag, page.route).toMatch(/alt="[^"]+"/);
      }
      total += after.length;
    }
    expect(total).toBe(105);
    expect(Object.keys(assets)).toHaveLength(total);
  });

  it('ships decodable local files with matching intrinsic dimensions', async () => {
    for (const image of Object.values(assets)) {
      const file = path.resolve('apps/site/public', image.src.slice(1));
      expect(existsSync(file), image.src).toBe(true);
      const metadata = await sharp(file).metadata();
      expect(image.width, image.src).toBe(metadata.width);
      expect(image.height, image.src).toBe(metadata.height);
      expect(image.width).toBeGreaterThan(0);
      expect(image.height).toBeGreaterThan(0);
      expect(image.revision).toBe(createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12));
    }
  });

  it('preserves surrounding article content and exposes a keyboard-accessible full-size link', () => {
    const entry = Object.entries(assets)[0];
    const html = localizeDocumentationImages(`<p>Before</p><img src="${entry[0].replaceAll('&', '&amp;')}" srcset="/obsolete 2x" style="background-image:url(old)"><p>After</p>`);
    expect(html).toMatch(/^<p>Before<\/p><a /);
    expect(html).toContain(`href="${entry[1].src}?v=${entry[1].revision}"`);
    expect(html).toContain(`src="${entry[1].src}?v=${entry[1].revision}"`);
    expect(html).toContain('aria-label="Open full-size image: ');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toMatch(/<\/a><p>After<\/p>$/);
  });

  it('preserves mobile screenshot thumbnail widths without losing intrinsic dimensions', () => {
    const [source, image] = Object.entries(assets).find(([, value]) => value.src.includes('08-09-mobile-settings'))!;
    const html = localizeDocumentationImages(`<img src="${source}" width="200">`);
    expect(html).toContain('style="width:200px;max-width:100%"');
    expect(html).toContain(`width="${image.width}" height="${image.height}"`);
  });
});
