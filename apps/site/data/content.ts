import rawManifest from './reference-manifest.json';
import type { Model } from './model-utils';
import { PENDING_PORTAL_ROUTES, pendingPortalHtml, rebrandValue } from './brand';
import { correctMirroredDocumentation, documentationStatusFor } from './documentation';
import { providerDisplayStatus } from './provider-availability';
export type { Model } from './model-utils';
export { discountRate, formatTokens, formatUsd, priceFor, usdPrice } from './model-utils';

export type PageMeta = { route: string; url: string; title: string; description: string; canonical: string; headings: string[] };
export type DocsContent = { route: string; html: string; text: string };
type Manifest = {
  capturedAt: string;
  officialSources: string[];
  notes: Record<string, string>;
  mainRoutes: string[];
  docsRoutes: string[];
  compatibilityRoutes: string[];
  mainMeta: PageMeta[];
  docsMeta: PageMeta[];
  docsContent: DocsContent[];
  modelFixture: { locale: string; models: Model[]; providers: Array<{ slug: string; label: string; description: string }> };
};

const sourceManifest = rawManifest as unknown as Manifest;

export const sourceProvenance = {
  capturedAt: sourceManifest.capturedAt,
  officialSources: [...sourceManifest.officialSources],
  notes: { ...sourceManifest.notes },
};

export const manifest = rebrandValue(rawManifest) as unknown as Manifest;

const upstreamModelFacts: Record<string, Pick<Model, 'upstreamContextWindow' | 'upstreamMaxOutput' | 'sourceUrl'>> = {
  'openai/gpt-5.3-codex': { upstreamContextWindow: 400_000, upstreamMaxOutput: 128_000, sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-5.3-codex' },
  'openai/gpt-5.4': { upstreamContextWindow: 1_050_000, upstreamMaxOutput: 128_000, sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-5.4' },
  'openai/gpt-5.4-mini': { upstreamContextWindow: 400_000, upstreamMaxOutput: 128_000, sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-5.4-mini' },
  'openai/gpt-5.5': { upstreamContextWindow: 1_050_000, upstreamMaxOutput: 128_000, sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-5.5' },
  'openai/gpt-5.6-luna': { upstreamContextWindow: 1_050_000, upstreamMaxOutput: 128_000, sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna' },
  'openai/gpt-5.6-sol': { upstreamContextWindow: 1_050_000, upstreamMaxOutput: 128_000, sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-5.6-sol' },
  'openai/gpt-5.6-terra': { upstreamContextWindow: 1_050_000, upstreamMaxOutput: 128_000, sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra' },
  'anthropic/claude-sonnet-4.6': { upstreamContextWindow: 1_000_000, upstreamMaxOutput: 128_000, sourceUrl: 'https://platform.claude.com/docs/en/models/sonnet-4-6/overview' },
  'grok/grok-4.6': { upstreamContextWindow: 500_000, upstreamMaxOutput: 0, sourceUrl: 'https://docs.x.ai/developers/grok-4-6' },
};

export const models = manifest.modelFixture.models.map((model) => {
  const upstream = upstreamModelFacts[model.id];
  return {
    ...model,
    gatewayMaxInput: model.contextWindow,
    gatewayMaxOutput: model.maxOutput,
    sourceVerifiedAt: '2026-08-30',
    availability: providerDisplayStatus(model.provider).modelAccessState,
    ...upstream,
    ...(model.id === 'openai/gpt-5.3-codex' ? { inputModalities: ['text', 'image'], outputModalities: ['text'] } : {}),
  };
});
manifest.modelFixture.models = models;
export const docsRoutes = manifest.docsRoutes;
export const docsMeta = manifest.docsMeta;
export const docsContent = manifest.docsContent;
export function getModel(provider: string, slug: string) { return models.find((model) => model.provider === provider && model.slug === slug); }
function normalizedMeta(meta: PageMeta | undefined) {
  return meta ? { ...meta, title: meta.title.replace(/\s+(?:-|\|)\s+(?:kineticrouter\.com|kineticRouter)$/i, '') } : meta;
}
export function getPageMeta(route: string) { return normalizedMeta([...manifest.mainMeta, ...manifest.docsMeta].find((meta) => meta.route === route)); }
export function getDocsPage(route: string) {
  const meta = normalizedMeta(manifest.docsMeta.find((item) => item.route === route));
  const content = manifest.docsContent.find((item) => item.route === route);
  const status = documentationStatusFor(route);
  if (PENDING_PORTAL_ROUTES.has(route) && content) {
    const subject = route.endsWith('/balance') ? 'Balance API' : 'Provider pricing API';
    return {
      meta: meta ? { ...meta, title: `${subject} - Contract pending`, description: `${subject} documentation will be published after its endpoint contract is verified.` } : meta,
      content: { ...content, html: pendingPortalHtml(route), text: 'Endpoint contract pending.' },
      status,
    };
  }
  return { meta, content: content ? { ...content, html: correctMirroredDocumentation(route, content.html) } : content, status };
}
