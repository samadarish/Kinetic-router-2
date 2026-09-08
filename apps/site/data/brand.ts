import { providerAvailability } from './provider-availability';
import { PRODUCT } from '@kineticrouter/platform-config/brand';
import { PRODUCTION_ORIGINS } from '@kineticrouter/platform-config/origins';
import { localizeDocumentationImages } from './documentation-images';

const openAiBaseUrl = providerAvailability.openai.baseUrl!;
const anthropicBaseUrl = providerAvailability.anthropic.previewBaseUrl!;
const grokBaseUrl = providerAvailability.grok.previewBaseUrl!;

export const BRAND = {
  name: PRODUCT.name,
  legalName: PRODUCT.legalName,
  siteUrl: PRODUCTION_ORIGINS.publicSite,
  apiKeyEnv: PRODUCT.apiKeyEnv,
  providerId: PRODUCT.providerId,
  api: {
    root: PRODUCTION_ORIGINS.api,
    openai: openAiBaseUrl,
    anthropic: anthropicBaseUrl,
    grokRoot: grokBaseUrl.replace(/\/v1$/, ''),
    grok: grokBaseUrl,
  },
} as const;

export function rebrandText(value: string) {
  return value
    .replace(/https?:\/\/kineticrouter\.com\/console\/api-keys\/?/gi, 'https://console.kineticrouter.com/api-keys')
    .replace(/https?:\/\/kineticrouter\.com\/console\/overview\/?/gi, 'https://console.kineticrouter.com/dashboard')
    .replace(/(?<![\w./-])kineticrouter\.com\/console\/api-keys\b/gi, 'console.kineticrouter.com/api-keys')
    .replace(/(?<![\w./-])kineticrouter\.com\/console\/overview\b/gi, 'console.kineticrouter.com/dashboard')
    .replace(/official Telegram community/gi, 'kineticRouter support')
    .replace(/official community channels/gi, 'official support channels');
}

export function rebrandHtml(value: string) {
  const withoutEmailLinks = value.replace(
    /<a\b[^>]*href=["']mailto:[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    '$1',
  );
  const withoutLegacyExternalLinks = withoutEmailLinks.replace(
    /<a\b[^>]*href=["']https:\/\/(?:t\.me|x\.com|github\.com)\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    '$1',
  );
  return rebrandText(localizeDocumentationImages(withoutLegacyExternalLinks));
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
  return `<article><div class="nextra-breadcrumb">API Reference</div><h1 id="${route.endsWith('/balance') ? 'balance-api' : 'provider-pricing-api'}">${subject}</h1><div class="docs-pending-callout"><strong>Endpoint documentation pending</strong><p>The customer console is connected, but this public endpoint has not completed compatibility verification. The request path and response schema will be published after verification.</p></div><h2 id="available-now">Available now</h2><p>The authenticated console shows account balance and actual billed usage. Playground shows verified final model rates when available and explicitly identifies unavailable pricing. No unverified public balance or provider-pricing URL is exposed here.</p></article>`;
}
