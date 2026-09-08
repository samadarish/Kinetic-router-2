import { describe, expect, it } from 'vitest';
import { authoredGuides, authoredGuidesUpdatedAt, documentationPlainText, renderAuthoredGuide } from '../apps/site/data/authored-guides';
import { docsRoutes, getDocsPage } from '../apps/site/data/content';
import { searchDocumentation, type DocsSearchEntry } from '../apps/site/data/docs-search';
import { codexProviderConfig, codexStartCommand } from '../apps/site/data/codex-example';
import { documentationStatusFor } from '../apps/site/data/documentation';
import { readFileSync } from 'node:fs';

describe('authored customer documentation', () => {
  it('replaces inaccurate guides without adding routes or losing heading anchors', () => {
    expect(docsRoutes).toHaveLength(57);
    for (const route of Object.keys(authoredGuides)) {
      expect(docsRoutes).toContain(route);
      const { meta, content } = getDocsPage(route);
      const rendered = renderAuthoredGuide(authoredGuides[route]!);
      expect(content?.text).toBe(rendered.text);
      expect(content?.html).toBe(rendered.html);
      expect(meta?.headings).toEqual(rendered.headings);
      const ids = [...rendered.html.matchAll(/<h2 id="([^"]+)"/g)].map((match) => match[1]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('explains actual key operations, billed usage, and unavailable rates', () => {
    const auth = getDocsPage('/docs/develop/authentication').content!;
    expect(auth.text).toContain('reveal an existing key');
    expect(auth.text).toContain('Opening the menu does not change the key');
    expect(auth.text).not.toMatch(/only (?:displayed|shown) once/i);
    const usage = getDocsPage('/docs/develop/observability/usage-tracking').content!;
    expect(usage.text).toContain('only the rows on the displayed page');
    const pricing = getDocsPage('/docs/develop/observability/pricing').content!;
    expect(pricing.text).toContain('Final rates unavailable');
    expect(pricing.text).not.toMatch(/balance never expires|standardCost|rateMultiplier/);
  });

  it('marks authored guides separately without upgrading provider availability or pending contracts', () => {
    for (const route of Object.keys(authoredGuides)) {
      const status = getDocsPage(route).status;
      expect(status.guide).toEqual({ updatedAt: authoredGuidesUpdatedAt });
      expect(status.status).toBe(documentationStatusFor(route).status);
      expect(status.verifiedAt).toBe(documentationStatusFor(route).verifiedAt);
      expect(status.summary).not.toMatch(/preserves|imported/);
    }
    expect(getDocsPage('/docs/api/openapi/balance').status.status).toBe('planned');
    expect(getDocsPage('/docs/api/openapi/balance').status.guide).toBeUndefined();
    expect(getDocsPage('/docs/api/openai/chat').status.guide).toBeUndefined();
  });

  it('uses credential-aware Codex examples without implying WebSocket support', () => {
    const guide = getDocsPage('/docs/integrations/codex').content!;
    expect(guide.text).toContain(codexProviderConfig);
    expect(guide.text).toContain(codexStartCommand);
    expect(codexProviderConfig).toContain('env_key = "KINETICROUTER_API_KEY"');
    expect(codexProviderConfig).not.toContain('supports_websockets');
    for (const file of ['apps/site/components/home-sections.tsx', 'apps/site/app/vibe-coding/page.tsx']) {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('@/data/codex-example');
      expect(source).not.toMatch(/supports_websockets|Codex WebSocket/);
    }
    for (const file of ['apps/console/src/components/QuickIntegration.tsx', 'apps/site/public/install/codex.sh']) {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('env_key = "KINETICROUTER_API_KEY"');
      expect(source).not.toMatch(/supports_websockets|Codex WebSocket/);
    }
    const installer = readFileSync('apps/site/public/install/codex.sh', 'utf8');
    expect(installer.indexOf('if [ -f "$CONFIG_FILE" ]')).toBeLessThan(installer.indexOf('> "$CONFIG_FILE"'));
    expect(installer).toMatch(/if \[ -f "\$CONFIG_FILE" \]; then[\s\S]*?exit 0[\s\S]*?fi/);
  });

  it('publishes image reference dollar prices without the internal billing factor', () => {
    const page = getDocsPage('/docs/api/openai/images');
    expect(JSON.stringify(page)).not.toMatch(/0\.15|metering--015|multiplier/i);
    for (const price of ['$4.50/M', '$0.75/M', '$1.20/M', '$0.0316', '$0.0247', '$0.0600', '$0.1067']) expect(page.content?.text).toContain(price);
    expect(page.status.status).toBe('reference');
    expect(page.status.summary).toContain('does not confirm image support');
    expect(page.content?.text).toContain('not a quote for your account');
    const entry = { route: '/docs/api/openai/images', title: page.meta!.title, headings: page.meta!.headings, text: page.content!.text };
    expect(searchDocumentation([entry], '0.15')).toEqual([]);
    expect(searchDocumentation([entry], '$4.50/M')).toHaveLength(1);
  });

  it('keeps copyable shell examples structured and account links routed through sign-in', () => {
    const guide = getDocsPage('/docs/develop').content!;
    expect(guide.text).toContain('$env:KINETICROUTER_API_KEY');
    expect(guide.text).toContain('<<JSON\n{"model":"$KINETICROUTER_MODEL"');
    expect(guide.text).toContain('\nJSON\n```');
    expect(guide.html).toContain('/account/sign-in?next=%2Fplayground');
    expect(guide.html).not.toContain('/console/chat');
  });

  it('escapes authored content and omits copy-button text from fallback plain text', () => {
    const guide = renderAuthoredGuide({ title: '<script>alert(1)</script>', description: '&', sections: [{ id: 'test', title: 'A < B', code: [{ label: 'Example', value: '<script>test</script>' }] }] });
    expect(guide.html).not.toContain('<script>');
    expect(guide.html).toContain('&lt;script&gt;');
    expect(documentationPlainText('<h1>Guide</h1><pre><button>Copy code</button><code>a &lt; b</code></pre>')).toBe('Guide\na < b');
  });
});

describe('documentation search', () => {
  const entries: DocsSearchEntry[] = docsRoutes.flatMap((route) => {
    const { meta, content, status } = getDocsPage(route);
    return meta && content && status.status !== 'planned' ? [{ route, title: meta.title, headings: meta.headings, text: documentationPlainText(content.html) }] : [];
  });

  it('searches the effective guide body, with all search terms required', () => {
    expect(searchDocumentation(entries, 'quota bar').some((entry) => entry.route === '/docs/develop/authentication')).toBe(true);
    expect(searchDocumentation(entries, 'Final rates unavailable').some((entry) => entry.route === '/docs/develop/observability/pricing')).toBe(true);
    expect(searchDocumentation(entries, 'impossible-search-value')).toEqual([]);
    expect(searchDocumentation(entries, '   ')).toEqual([]);
  });

  it('ranks titles above body mentions and bounds snippets/results', () => {
    const data = [
      { route: '/body', title: 'First request', headings: [], text: 'The usage guide describes billing.' },
      { route: '/title', title: 'Usage', headings: [], text: 'Billed requests.' },
    ];
    expect(searchDocumentation(data, 'usage').map((entry) => entry.route)).toEqual(['/title', '/body']);
    expect(searchDocumentation(entries, 'model').length).toBeLessThanOrEqual(20);
    expect(searchDocumentation(entries, 'model').every((entry) => entry.snippet.length <= 172)).toBe(true);
  });

  it('indexes readable rendered text while full-page copy retains useful Markdown links', () => {
    const guide = getDocsPage('/docs/develop').content!;
    const entry = entries.find((value) => value.route === '/docs/develop')!;
    expect(guide.text).toContain('[API Keys](/account/sign-in?next=%2Fapi-keys)');
    expect(entry.text).toContain('API Keys');
    expect(entry.text).not.toMatch(/\[API Keys\]|\/account\/sign-in|```|## /);
    const results = searchDocumentation([entry], 'API Keys');
    expect(results).toHaveLength(1);
    expect(results[0]?.snippet).not.toMatch(/\]\(|\/account\/sign-in|```|## /);
  });
});
