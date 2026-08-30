import { providerAvailability } from './provider-availability';

const openAiBaseUrl = providerAvailability.openai.baseUrl!;
const anthropicBaseUrl = providerAvailability.anthropic.previewBaseUrl!;
const grokBaseUrl = providerAvailability.grok.previewBaseUrl!;

export const BRAND = {
  name: 'Kinetic Router',
  legalName: 'Kinetic Router',
  siteUrl: 'https://kineticrouter.com',
  supportEmail: 'support@kineticrouter.com',
  apiKeyEnv: 'KINETICROUTER_API_KEY',
  providerId: 'kineticrouter',
  api: {
    root: 'https://api.kineticrouter.com',
    openai: openAiBaseUrl,
    anthropic: anthropicBaseUrl,
    grokRoot: grokBaseUrl.replace(/\/v1$/, ''),
    grok: grokBaseUrl,
  },
} as const;

const replacements: ReadonlyArray<readonly [string, string]> = [
  ['YOUR_HAOAI_API_KEY', 'YOUR_KINETICROUTER_API_KEY'],
  ['HAOAI_API_KEY', BRAND.apiKeyEnv],
  ['https://api.hao.ai', BRAND.api.root],
  ['support@hao.ai', BRAND.supportEmail],
  ['https://hao.ai', BRAND.siteUrl],
  ['hao.ai', 'kineticrouter.com'],
  ['HaoAI LLC', BRAND.legalName],
  ['Hao.ai', BRAND.name],
  ['HaoAI', BRAND.name],
];

export function rebrandText(value: string) {
  let result = value;
  for (const [from, to] of replacements) result = result.replaceAll(from, to);
  return result
    .replace(/\bhaoai(?=[-_]|\b)/g, BRAND.providerId)
    .replace(/official Telegram community/gi, 'support email')
    .replace(/official community channels/gi, 'official support channels');
}

export function rebrandHtml(value: string) {
  const withoutLegacyExternalLinks = value.replace(
    /<a\b[^>]*href=["']https:\/\/(?:t\.me|x\.com|github\.com)\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    '$1',
  );
  const withoutUnavailableSources = withoutLegacyExternalLinks.replace(
    /<source\b[^>]*(?:\/docs\/|%2Fdocs%2F|kineticrouter\.com\/docs\/)[^>]*>/gi,
    '',
  );
  const withScreenshotCallouts = withoutUnavailableSources.replace(
    /<img\b[^>]*(?:\/docs\/|%2Fdocs%2F|kineticrouter\.com\/docs\/)[^>]*>/gi,
    '<div class="docs-image-note">This screenshot will be refreshed with Kinetic Router branding during the integration documentation pass.</div>',
  );
  return rebrandText(withScreenshotCallouts);
}

export function rebrandValue<T>(value: T): T {
  if (typeof value === 'string') return rebrandText(value) as T;
  if (Array.isArray(value)) return value.map((item) => rebrandValue(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rebrandValue(item)])) as T;
  }
  return value;
}

export const PENDING_PORTAL_ROUTES = new Set([
  '/docs/api/openapi/balance',
  '/docs/api/openapi/provider-pricing',
]);

export function pendingPortalHtml(route: string) {
  const subject = route.endsWith('/balance') ? 'Balance API' : 'Provider pricing API';
  return `<article><div class="nextra-breadcrumb">API Reference</div><h1 id="${route.endsWith('/balance') ? 'balance-api' : 'provider-pricing-api'}">${subject}</h1><div class="docs-pending-callout"><strong>Sub2API endpoint contract pending</strong><p>The customer portal is connected, but this public platform endpoint has not been verified against the pinned Sub2API backend contract. The request path and response schema will be published only after that verification.</p></div><h2 id="available-now">Available now</h2><p>Account balances and pricing are available in the authenticated customer console. No unverified public balance or provider-pricing URL is exposed here.</p></article>`;
}
