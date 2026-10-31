import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PriceDiscount } from '../apps/site/components/price-discount';
import { getModel } from '../apps/site/data/content';
import { catalogModel } from '../apps/site/data/model-utils';

describe('public model badges', () => {
  it.each([
    ['anthropic', 'claude-opus-5-5', 85],
    ['openai', 'gpt-6-astra', 80],
    ['moonshot', 'kimi-k3.1-pro', 80],
    ['deepseek', 'deepseek-flash', 80],
    ['zhipu', 'glm-5.3-flash', 80],
    ['gemini', 'gemini-3.1-flash-image', 50],
    ['grok', 'grok-4.7', 90],
    ['minimax', 'minimax-m3', 90],
  ])('shows the requested discount for %s/%s', (provider, slug, percent) => {
    const html = renderToStaticMarkup(createElement(PriceDiscount, { model: getModel(provider as string, slug as string)! }));
    expect(html).toContain(`aria-label="${percent}% off"`);
    expect(html).toContain(`-${percent}%`);
    expect(html).not.toContain('Deprecated');
  });

  it('replaces discount content with the red Deprecated pill for full and compact model data', () => {
    const deprecated = getModel('moonshot', 'kimi-k2.7-code')!;
    for (const model of [deprecated, catalogModel(deprecated)]) {
      const html = renderToStaticMarkup(createElement(PriceDiscount, { model }));
      expect(html).toContain('model-deprecated');
      expect(html).toContain('text-red-700');
      expect(html).toContain('Deprecated');
      expect(html).not.toMatch(/%|off|price-discount/);
    }
  });
});
