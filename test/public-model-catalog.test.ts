import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { activeProviderIds } from '@kineticrouter/platform-config/providers';
import { publicModelChoices, openAICompatibleExamples } from '@kineticrouter/platform-config/models';
import { getModel, manifest, models } from '../apps/site/data/content';
import { discountRate, formatUsd, usdPrice } from '../apps/site/data/model-utils';
import { indexableRoutes, pageMetadata } from '../apps/site/data/seo';

describe('current public model catalog', () => {
  it('publishes the requested roster without changing the locked archive', () => {
    const archive = readFileSync('apps/site/data/reference-manifest.json', 'utf8').replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(archive).digest('hex').toUpperCase()).toBe('0E34F76F9BC701DF878CD202683F5B9F3952D5D1A41BA9016F601463EB2ACC8C');
    expect(models).toHaveLength(36);
    expect(new Set(models.map((model) => model.id)).size).toBe(36);
    const expected: Record<string, string[]> = {
      openai: ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna'],
      anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5'],
      grok: ['grok-4.7'], deepseek: ['deepseek-flash', 'deepseek-v4-pro'],
      zhipu: ['glm-5.3'], moonshot: ['kimi-k3', 'kimi-k2.7-code'], minimax: ['minimax-m3'],
      gemini: [
        'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-thinking', 'gemini-2.5-pro',
        'gemini-3-flash', 'gemini-3-flash-agent', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite',
        'gemini-3.1-pro-high', 'gemini-3.1-pro-low', 'gemini-3.5-flash-extra-low', 'gemini-3.5-flash-lite', 'gemini-3.5-flash-low',
        'gemini-3.6-flash-high', 'gemini-3.6-flash-low', 'gemini-3.6-flash-medium',
        'gemini-3.7-flash-high', 'gemini-3.7-flash-low', 'gemini-3.7-flash-medium',
        'gemini-3.8-flash', 'gemini-3.8-flash-high', 'gemini-3.8-flash-low', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-tiered',
      ],
    };
    for (const [provider, slugs] of Object.entries(expected)) expect(models.filter((model) => model.provider === provider).map((model) => model.slug).sort()).toEqual([...slugs].sort());
    expect(publicModelChoices.map((model) => model.id)).toEqual(models.map((model) => model.id));
  });

  it('prices every component and tier at one tenth of its official reference', () => {
    const priceIds = models.flatMap((model) => model.prices.map((price) => price.id));
    expect(new Set(priceIds).size).toBe(priceIds.length);
    for (const model of models) {
      expect(discountRate(model)).toBeCloseTo(.1);
      for (const official of model.prices.filter((price) => price.role === 'official')) {
        const sell = model.prices.find((price) => price.role === 'sell' && price.component === official.component && price.tierLabel === official.tierLabel && price.unit === official.unit)!;
        expect(sell, model.id).toBeDefined();
        expect(sell.priceMicroUsd * 10, model.id).toBeCloseTo(official.priceMicroUsd, 6);
        expect(official.sourceRef).toMatch(/^https:\/\//);
      }
    }
    expect(usdPrice(getModel('openai', 'gpt-6-astra')!, 'sell', 'input')).toBe(1);
    expect(usdPrice(getModel('openai', 'gpt-6.1-sol')!, 'sell', 'output')).toBe(1);
    expect(usdPrice(getModel('openai', 'gpt-6-luna')!, 'sell', 'input')).toBe(.01);
    expect(usdPrice(getModel('moonshot', 'kimi-k2.7-code')!, 'sell', 'input')).toBe(.095);
    expect(usdPrice(getModel('gemini', 'gemini-3.1-flash-image')!, 'sell', 'image_output')).toBe(6);
    expect(formatUsd(usdPrice(getModel('deepseek', 'deepseek-flash')!, 'sell', 'cache_read'))).toBe('$0.0006/M');
    expect(getModel('gemini', 'gemini-3.1-pro-high')!.prices.some((price) => price.tierLabel === 'Over 200K input tokens')).toBe(true);
    expect(usdPrice(getModel('gemini', 'gemini-3.8-flash-high')!, 'official', 'input')).toBe(usdPrice(getModel('gemini', 'gemini-3.8-flash')!, 'official', 'input'));
  });

  it('uses the shared /v1 SDK examples for all models and rejects invalid selections', () => {
    for (const model of models) for (const base of ['https://api.kineticrouter.com/v1', 'https://cdn-api.kineticrouter.com/v1']) {
      const examples = openAICompatibleExamples(model.id, base);
      for (const code of Object.values(examples)) {
        expect(code).toContain(model.id);
        expect(code).toContain(base);
        expect(code).toContain('KINETICROUTER_API_KEY');
        expect(code).not.toMatch(/\.com\/(?:anthropic|grok)|\/v1\/v1|@anthropic-ai|anthropic-version/);
      }
      expect(examples.python).toContain('from openai import OpenAI');
      expect(examples.curl).toContain('/v1/chat/completions');
    }
    expect(() => openAICompatibleExamples('missing', 'https://api.kineticrouter.com/v1')).toThrow('Unknown public model');
    expect(() => openAICompatibleExamples(models[0].id, 'https://api.kineticrouter.com/anthropic')).toThrow('/v1');
  });

  it('publishes every active route and inventory entry and retires old model routes', () => {
    for (const provider of activeProviderIds) expect(indexableRoutes()).toContain(`/models/${provider}`);
    for (const model of models) {
      const path = `/models/${model.provider}/${model.slug}`;
      expect(manifest.mainRoutes.filter((route) => route === path)).toHaveLength(1);
      expect(indexableRoutes()).toContain(path);
      expect(pageMetadata(path).alternates?.canonical).toBe('https://kineticrouter.com' + path);
      for (const file of ['llms.txt', 'llms-full.txt']) expect(readFileSync(`apps/site/public/${file}`, 'utf8')).toContain('https://kineticrouter.com' + path);
    }
    for (const path of ['/models/openai/gpt-5.4', '/models/anthropic/claude-fable-5-1', '/models/grok/grok-4.6']) {
      expect(indexableRoutes()).not.toContain(path);
      expect(pageMetadata(path).robots).toMatchObject({ index: false });
    }
    expect(indexableRoutes()).not.toContain('/models/meta');
  });
});
