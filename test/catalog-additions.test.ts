import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import archive from '../apps/site/data/reference-manifest.json';
import additions from '../apps/site/data/catalog-additions.json';
import { getModel, manifest, models } from '../apps/site/data/content';
import { displayContextWindow, usdPrice } from '../apps/site/data/model-utils';
import { providerDisplayStatus } from '../apps/site/data/provider-availability';
import { indexableRoutes, pageMetadata, structuredData } from '../apps/site/data/seo';

const route = '/models/openai/gpt-6-astra';

describe('supplementary catalog references', () => {
  it('adds current models without modifying or removing historical model records', () => {
    expect(archive.modelFixture.models).toHaveLength(20);
    expect(archive.modelFixture.models.some((model) => model.id === 'openai/gpt-6-astra')).toBe(false);
    expect(models).toHaveLength(22);
    expect(models[0].id).toBe('openai/gpt-6-astra');
    expect(new Set(models.map((model) => model.id)).size).toBe(22);
    for (const historical of archive.modelFixture.models) {
      const current = models.find((model) => model.id === historical.id)!;
      expect(current.prices).toEqual(historical.prices);
      expect(current.date).toBe(historical.date);
    }
  });

  it('preserves exact standard prices and distinguishes upstream and captured gateway limits', () => {
    const model = getModel('openai', 'gpt-6-astra')!;
    expect(getModel('anthropic', 'gpt-6-astra')).toBeUndefined();
    expect(model.date).toBe('2026-09-03');
    expect(model.catalogCapturedAt).toBe('2026-09-11');
    expect(model.sourceVerifiedAt).toBe('2026-09-11');
    expect(displayContextWindow(model)).toBe(1_050_000);
    expect(model.gatewayMaxInput).toBe(1_000_000);
    expect(model.upstreamMaxOutput).toBe(128_000);
    for (const [component, sell, official] of [['input', 1.5, 10], ['output', 7.5, 50], ['cache_read', .15, 1], ['cache_creation', 1.875, 12.5]] as const) {
      expect(usdPrice(model, 'sell', component)).toBe(sell);
      expect(usdPrice(model, 'official', component)).toBe(official);
    }
    const prices = models.flatMap((item) => item.prices).filter((price) => price.active);
    expect(prices).toHaveLength(208);
    expect(new Set(prices.map((price) => price.id)).size).toBe(208);
  });

  it('uses kineticRouter configuration and keeps runtime availability separate from source capabilities', () => {
    const model = getModel('openai', 'gpt-6-astra')!;
    expect(model.compatIcons).toEqual(['OpenAI']);
    expect(model.availability).toBe(providerDisplayStatus('openai').modelAccessState);
    expect(model.inputModalities).toEqual(['text', 'image']);
    expect(model.outputModalities).toEqual(['text']);
    expect(model.codeExamples).toHaveLength(3);
    for (const example of model.codeExamples) {
      expect(example.code).toContain('https://api.kineticrouter.com/v1');
      expect(example.code).toContain('openai/gpt-6-astra');
      expect(example.code).toContain('KINETICROUTER_API_KEY');
    }
    expect(model.codeExamples.find((example) => example.language === 'python')?.code).toContain('os.environ["KINETICROUTER_API_KEY"]');
    expect(model.faq.find((item) => item.kind === 'api_access')?.a).toContain('remains planned');
    expect(additions.sourceRef).toBe('docs/catalog-updates.md');
  });

  it('publishes a canonical detail route, structured data, and inventory entries', () => {
    expect(manifest.mainRoutes.filter((path) => path === route)).toHaveLength(1);
    expect(indexableRoutes()).toContain(route);
    expect(pageMetadata(route).alternates?.canonical).toBe('https://kineticrouter.com' + route);
    expect(pageMetadata(route).title).toMatchObject({ absolute: 'GPT-6 Astra API & Reference Pricing — kineticRouter' });
    expect(structuredData(route)?.['@graph'].some((item) => item.url === 'https://kineticrouter.com' + route)).toBe(true);
    for (const path of ['apps/site/public/llms.txt', 'apps/site/public/llms-full.txt']) expect(readFileSync(path, 'utf8')).toContain('https://kineticrouter.com' + route);
  });

  it('includes the newest Anthropic reference with exact cache pricing and a working SEO route', () => {
    const model = getModel('anthropic', 'claude-fable-5-1')!;
    expect(model.date).toBe('2026-09-01');
    expect(model.catalogCapturedAt).toBe('2026-09-11');
    expect(model.availability).toBe(providerDisplayStatus('anthropic').modelAccessState);
    expect(displayContextWindow(model)).toBe(1_000_000);
    expect(model.upstreamMaxOutput).toBe(128_000);
    for (const [component, sell, official] of [['input', 2.5, 10], ['output', 12.5, 50], ['cache_read', .0625, .25], ['cache_creation', 3.125, 12.5], ['cache_creation_5m', 3.125, 12.5], ['cache_creation_1h', 5, 20]] as const) {
      expect(usdPrice(model, 'sell', component)).toBe(sell);
      expect(usdPrice(model, 'official', component)).toBe(official);
    }
    const path = '/models/anthropic/claude-fable-5-1';
    expect(manifest.mainRoutes.filter((route) => route === path)).toHaveLength(1);
    expect(indexableRoutes()).toContain(path);
    expect(pageMetadata(path).alternates?.canonical).toBe('https://kineticrouter.com' + path);
    for (const file of ['apps/site/public/llms.txt', 'apps/site/public/llms-full.txt']) expect(readFileSync(file, 'utf8')).toContain('https://kineticrouter.com' + path);
  });
});
