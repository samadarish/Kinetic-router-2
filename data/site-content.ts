import type { Model } from './model-utils';
import type { CSSProperties } from 'react';
import { providerAvailability, providerAvailabilityCheckedAt, type ProviderId } from './provider-availability';
import { normalizeConsoleOrigin, resolvePublicConsoleOrigin } from './public-console-origin.mjs';
import { normalizeSiteHref } from './safe-href.mjs';

export type SiteNavigationItem = {
  id: string;
  label: string;
  href: string;
  enabled: boolean;
  order: number;
  external?: boolean;
};

export type SiteProviderDisplay = {
  id: ProviderId;
  label: string;
  aliases: string[];
  catalogState: 'verified' | 'partial' | 'planned' | 'reference';
  modelAccessState: 'verified' | 'partial' | 'planned' | 'reference';
  apiState: 'verified' | 'partial' | 'planned' | 'reference';
  interactionMode: 'validation' | 'interactive' | 'reference-only';
  badgeLabel: string;
  protocolLabel: string;
  baseUrl?: string;
  previewBaseUrl?: string;
  summary: string;
  evidenceNote: string;
  protocolSources: string[];
  verifiedAt?: string;
  enabled: boolean;
};

export type SiteProviderMap = Record<ProviderId, SiteProviderDisplay>;

export type SiteDocContent = {
  route: string;
  title: string;
  description: string;
  navLabel: string;
  group: string;
  order: number;
  enabled: boolean;
  iconKey?: string;
  bodyMarkdown: string;
  sourceUpdatedAt?: string;
};

export type SiteModelContent = {
  id: string;
  provider: ProviderId;
  slug: string;
  name: string;
  description?: string;
  enabled: boolean;
  order: number;
  contextWindow?: number;
  maxOutput?: number;
  prices: Array<{ component: string; unit: string; usd: number }>;
};

export const siteContentBlockTypes = ['hero', 'richText', 'code', 'cards', 'stats', 'cta', 'providerTabs', 'modelGrid'] as const;

export type SiteContentBlockType = (typeof siteContentBlockTypes)[number];

export type SiteContentDataValue = string | number | boolean | null | SiteContentDataValue[] | { [key: string]: SiteContentDataValue };

export type SiteContentBlock = {
  id: string;
  type: SiteContentBlockType;
  heading?: string;
  bodyMarkdown?: string;
  data: Record<string, SiteContentDataValue>;
};

export type SitePageContent = {
  key: string;
  title: string;
  description: string;
  enabled: boolean;
  blocks: SiteContentBlock[];
};

export type SiteContentDocument = {
  schemaVersion: 1;
  displayOnlyProviderStates: true;
  brand: {
    displayName: string;
    legalName: string;
    tagline: string;
    siteUrl: string;
    apiBaseUrl: string;
    logoMarkPath: string;
    logoWordmarkPath: string;
    supportEmail: null;
  };
  theme: {
    defaultTheme: 'dark' | 'light';
    primaryFrom: string;
    primaryTo: string;
    accent: string;
    background: string;
    gradientAngle: number;
  };
  features: {
    showChat: false;
    showImage: boolean;
    showLanguageSelector: false;
    showOpenChat: false;
    showSupportEmail: false;
  };
  navigation: {
    publicHeader: SiteNavigationItem[];
    portalHeader: SiteNavigationItem[];
    docsHeader: SiteNavigationItem[];
    footerColumns: Array<{ id: string; title: string; links: SiteNavigationItem[] }>;
  };
  home: {
    eyebrow: string;
    title: string;
    description: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
    footerDescription: string;
  };
  providers: SiteProviderMap;
  pages: SitePageContent[];
  docs: SiteDocContent[];
  models: SiteModelContent[];
};

const providerIds: ProviderId[] = ['openai', 'anthropic', 'grok'];
const stateValues = new Set(['verified', 'partial', 'planned', 'reference']);
const interactionValues = new Set(['validation', 'interactive', 'reference-only']);
const blockTypeValues = new Set<SiteContentBlockType>(siteContentBlockTypes);
const contentIdPattern = /^[a-z0-9][a-z0-9._-]*$/i;
const colorPattern = /^#[0-9a-f]{6}$/i;

function fallbackProvider(id: ProviderId): SiteProviderDisplay {
  const source = providerAvailability[id];
  return {
    id,
    ...source,
    interactionMode: source.interactionMode === 'live' ? 'interactive' : source.interactionMode,
    verifiedAt: providerAvailabilityCheckedAt,
    enabled: true,
  };
}

export const fallbackSiteContent: SiteContentDocument = {
  schemaVersion: 1,
  displayOnlyProviderStates: true,
  brand: {
    displayName: 'kineticRouter',
    legalName: 'kineticRouter',
    tagline: 'AI for everyone',
    siteUrl: 'https://kineticrouter.com',
    apiBaseUrl: 'https://api.kineticrouter.com/v1',
    logoMarkPath: '/brand/kineticrouter/mark-dark.png',
    logoWordmarkPath: '/brand/kineticrouter/wordmark-dark.png',
    supportEmail: null,
  },
  theme: {
    defaultTheme: 'dark',
    primaryFrom: '#53e1d2',
    primaryTo: '#3789ef',
    accent: '#38b6e8',
    background: '#222220',
    gradientAngle: 135,
  },
  features: {
    showChat: false,
    showImage: false,
    showLanguageSelector: false,
    showOpenChat: false,
    showSupportEmail: false,
  },
  navigation: {
    publicHeader: [
      { id: 'home', label: 'Home', href: '/', enabled: true, order: 10 },
      { id: 'models', label: 'Model pricing', href: '/models', enabled: true, order: 20 },
      { id: 'docs', label: 'Docs', href: '/docs', enabled: true, order: 30 },
    ],
    portalHeader: [],
    docsHeader: [
      { id: 'docs', label: 'Docs', href: '/docs', enabled: true, order: 10 },
      { id: 'develop', label: 'Develop', href: '/docs/develop', enabled: true, order: 20 },
      { id: 'api', label: 'API Reference', href: '/docs/api', enabled: true, order: 30 },
      { id: 'integrations', label: 'Integrations', href: '/docs/integrations', enabled: true, order: 40 },
    ],
    footerColumns: [
      {
        id: 'product',
        title: 'Product',
        links: [
          { id: 'models', label: 'Model pricing', href: '/models', enabled: true, order: 10 },
          { id: 'pricing', label: 'Price comparison', href: '/pricing', enabled: true, order: 20 },
          { id: 'quickstart', label: 'Quick Start', href: '/quickstart', enabled: true, order: 30 },
        ],
      },
      {
        id: 'providers',
        title: 'Providers',
        links: [
          { id: 'openai', label: 'OpenAI', href: '/models/openai', enabled: true, order: 10 },
          { id: 'anthropic', label: 'Anthropic', href: '/models/anthropic', enabled: true, order: 20 },
          { id: 'grok', label: 'Grok', href: '/models/grok', enabled: true, order: 30 },
        ],
      },
      {
        id: 'resources',
        title: 'Resources',
        links: [
          { id: 'docs', label: 'Docs', href: '/docs', enabled: true, order: 10 },
          { id: 'terms', label: 'Terms of Service', href: '/terms-of-service', enabled: true, order: 20 },
          { id: 'privacy', label: 'Privacy Policy', href: '/privacy', enabled: true, order: 30 },
        ],
      },
    ],
  },
  home: {
    eyebrow: '',
    title: 'AI for everyone',
    description: 'One API for leading models, with clear provider availability and request-level billing.',
    primaryCta: { label: 'Get API Key', href: '/account/sign-in' },
    secondaryCta: { label: 'Explore Models', href: '/models' },
    footerDescription: 'AI for everyone',
  },
  providers: {
    openai: fallbackProvider('openai'),
    anthropic: fallbackProvider('anthropic'),
    grok: fallbackProvider('grok'),
  },
  pages: [],
  docs: [],
  models: [],
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown, fallback: string, maximum = 2_000) {
  return typeof value === 'string' && value.trim() && value.length <= maximum ? value.trim() : fallback;
}

function optionalText(value: unknown, maximum = 2_000) {
  return typeof value === 'string' && value.length <= maximum ? value.trim() : undefined;
}

function safeHref(value: unknown, fallback: string) {
  return normalizeSiteHref(value, fallback);
}

function safeHttps(value: unknown, fallback?: string) {
  const candidate = safeHref(value, fallback ?? '');
  return candidate.startsWith('https://') ? candidate : fallback;
}

function safeColor(value: unknown, fallback: string) {
  return typeof value === 'string' && colorPattern.test(value) ? value : fallback;
}

function relativeLuminance(color: string) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function safeThemeBackground(value: unknown, defaultTheme: 'dark' | 'light') {
  const fallback = defaultTheme === 'light' ? '#faf9f6' : fallbackSiteContent.theme.background;
  const candidate = safeColor(value, fallback);
  const foreground = defaultTheme === 'light' ? '#514b3e' : '#cbc6ba';
  return contrastRatio(candidate, foreground) >= 4.5 ? candidate : fallback;
}

function hiddenProductControl(item: Pick<SiteNavigationItem, 'id' | 'label' | 'href'>) {
  const value = `${item.id} ${item.label} ${item.href}`.toLowerCase();
  return /(^|[\s/_-])(chat|open-chat|language|locale)([\s/_-]|$)/.test(value)
    || item.href.startsWith('mailto:');
}

function navigationItems(value: unknown, fallback: SiteNavigationItem[], showImage: boolean) {
  if (!Array.isArray(value)) return fallback;
  const items = value.flatMap((candidate, index) => {
    const item = record(candidate);
    if (!item || item.enabled !== true) return [];
    const normalized: SiteNavigationItem = {
      id: text(item.id, `item-${index}`, 100),
      label: text(item.label, '', 80),
      href: safeHref(item.href, ''),
      enabled: true,
      order: typeof item.order === 'number' && Number.isInteger(item.order) ? item.order : index,
      external: item.external === true,
    };
    if (!normalized.label || !normalized.href || hiddenProductControl(normalized)) return [];
    if (!showImage && /(^|[\s/_-])image([\s/_-]|$)/.test(`${normalized.id} ${normalized.label} ${normalized.href}`.toLowerCase())) return [];
    return [normalized];
  });
  return items.length ? items.sort((a, b) => a.order - b.order) : fallback;
}

function provider(value: unknown, fallback: SiteProviderDisplay, id: ProviderId): SiteProviderDisplay {
  const source = record(value);
  if (!source || source.id !== id) return fallback;
  const baseUrl = safeHttps(source.baseUrl);
  const previewBaseUrl = safeHttps(source.previewBaseUrl);
  if (Boolean(baseUrl) === Boolean(previewBaseUrl)) return fallback;
  const states = ['catalogState', 'modelAccessState', 'apiState'] as const;
  if (states.some((key) => !stateValues.has(String(source[key])))) return fallback;
  if (!interactionValues.has(String(source.interactionMode))) return fallback;
  const protocolSources = Array.isArray(source.protocolSources)
    ? source.protocolSources.flatMap((item) => safeHttps(item) ? [safeHttps(item)!] : []).slice(0, 20)
    : [];
  if (!protocolSources.length) return fallback;
  return {
    id,
    label: text(source.label, fallback.label, 80),
    aliases: Array.isArray(source.aliases) ? source.aliases.filter((item): item is string => typeof item === 'string').slice(0, 20) : fallback.aliases,
    catalogState: String(source.catalogState) as SiteProviderDisplay['catalogState'],
    modelAccessState: String(source.modelAccessState) as SiteProviderDisplay['modelAccessState'],
    apiState: String(source.apiState) as SiteProviderDisplay['apiState'],
    interactionMode: String(source.interactionMode) as SiteProviderDisplay['interactionMode'],
    badgeLabel: text(source.badgeLabel, fallback.badgeLabel, 40),
    protocolLabel: text(source.protocolLabel, fallback.protocolLabel, 80),
    ...(baseUrl ? { baseUrl } : { previewBaseUrl }),
    summary: text(source.summary, fallback.summary),
    evidenceNote: text(source.evidenceNote, fallback.evidenceNote),
    protocolSources,
    ...(typeof source.verifiedAt === 'string' ? { verifiedAt: source.verifiedAt } : {}),
    enabled: source.enabled !== false,
  };
}

function docs(value: unknown): SiteDocContent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index) => {
    const item = record(candidate);
    if (!item || typeof item.enabled !== 'boolean' || typeof item.route !== 'string' || !item.route.startsWith('/docs')) return [];
    const bodyMarkdown = optionalText(item.bodyMarkdown, 100_000) ?? '';
    if (item.enabled && !bodyMarkdown) return [];
    return [{
      route: item.route,
      title: text(item.title, 'Documentation', 200),
      description: optionalText(item.description) ?? '',
      navLabel: text(item.navLabel, text(item.title, 'Documentation', 120), 120),
      group: text(item.group, 'Documentation', 120),
      order: typeof item.order === 'number' && Number.isInteger(item.order) ? item.order : index,
      enabled: item.enabled,
      ...(typeof item.iconKey === 'string' ? { iconKey: item.iconKey } : {}),
      bodyMarkdown,
      ...(typeof item.sourceUpdatedAt === 'string' ? { sourceUpdatedAt: item.sourceUpdatedAt } : {}),
    }];
  });
}

function models(value: unknown): SiteModelContent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index) => {
    const item = record(candidate);
    if (!item || typeof item.enabled !== 'boolean' || typeof item.id !== 'string' || !providerIds.includes(item.provider as ProviderId)) return [];
    const parsedPrices = Array.isArray(item.prices) ? item.prices.flatMap((candidate) => {
      const price = record(candidate);
      const component = optionalText(price?.component, 100);
      const unit = optionalText(price?.unit, 80);
      const usd = price?.usd;
      if (!component || !/^[a-z0-9][a-z0-9._-]*$/i.test(component) || !unit || typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0 || usd > 1_000_000) return [];
      return [{ component, unit, usd }];
    }).slice(0, 30) : [];
    return [{
      id: item.id,
      provider: item.provider as ProviderId,
      slug: text(item.slug, item.id.split('/').at(-1) ?? item.id, 100),
      name: text(item.name, item.id, 160),
      ...(optionalText(item.description) ? { description: optionalText(item.description) } : {}),
      enabled: item.enabled,
      order: typeof item.order === 'number' && Number.isInteger(item.order) ? item.order : index,
      ...(typeof item.contextWindow === 'number' && Number.isInteger(item.contextWindow) && item.contextWindow > 0 ? { contextWindow: item.contextWindow } : {}),
      ...(typeof item.maxOutput === 'number' && Number.isInteger(item.maxOutput) && item.maxOutput > 0 ? { maxOutput: item.maxOutput } : {}),
      prices: parsedPrices,
    }];
  });
}

function contentDataValue(value: unknown, depth = 0): SiteContentDataValue | undefined {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length <= 100_000 ? value : undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (depth >= 5) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 100).flatMap((item) => {
      const normalized = contentDataValue(item, depth + 1);
      return normalized === undefined ? [] : [normalized];
    });
  }
  const source = record(value);
  if (!source) return undefined;
  const normalized: Record<string, SiteContentDataValue> = {};
  for (const [key, item] of Object.entries(source).slice(0, 100)) {
    if (!key || key.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    const child = contentDataValue(item, depth + 1);
    if (child !== undefined) normalized[key] = child;
  }
  return normalized;
}

function pageBlocks(value: unknown): SiteContentBlock[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 100).flatMap((candidate) => {
    const block = record(candidate);
    if (!block || typeof block.id !== 'string' || !contentIdPattern.test(block.id) || seen.has(block.id)) return [];
    if (typeof block.type !== 'string' || !blockTypeValues.has(block.type as SiteContentBlockType)) return [];
    seen.add(block.id);
    const heading = optionalText(block.heading, 200);
    const bodyMarkdown = optionalText(block.bodyMarkdown, 100_000);
    const normalizedData = contentDataValue(block.data);
    const data = record(normalizedData) as Record<string, SiteContentDataValue> | undefined;
    return [{
      id: block.id,
      type: block.type as SiteContentBlockType,
      ...(heading ? { heading } : {}),
      ...(bodyMarkdown !== undefined ? { bodyMarkdown } : {}),
      data: data ?? {},
    }];
  });
}

function pages(value: unknown): SitePageContent[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 100).flatMap((candidate) => {
    const page = record(candidate);
    if (!page || typeof page.key !== 'string' || !contentIdPattern.test(page.key) || seen.has(page.key) || typeof page.enabled !== 'boolean') return [];
    seen.add(page.key);
    return [{
      key: page.key,
      title: text(page.title, 'kineticRouter', 200),
      description: optionalText(page.description, 2_000) ?? '',
      enabled: page.enabled,
      blocks: pageBlocks(page.blocks),
    }];
  });
}

function resolveAssetPath(value: string, origin: string) {
  if (value.startsWith('/portal/v1/site-content/assets/')) return new URL(value, `${origin}/`).toString();
  return value;
}

export function normalizeSiteContent(value: unknown, origin: string): SiteContentDocument {
  const source = record(value);
  if (!source || source.schemaVersion !== 1 || source.displayOnlyProviderStates !== true) return fallbackSiteContent;
  const rawFeatures = record(source.features);
  const showImage = rawFeatures?.showImage === true;
  const rawBrand = record(source.brand);
  const rawTheme = record(source.theme);
  const rawNavigation = record(source.navigation);
  const rawHome = record(source.home);
  const rawProviders = record(source.providers);
  const fallback = fallbackSiteContent;
  const defaultTheme = rawTheme?.defaultTheme === 'light' ? 'light' : 'dark';
  const logoMarkPath = safeHref(rawBrand?.logoMarkPath, fallback.brand.logoMarkPath);
  const logoWordmarkPath = safeHref(rawBrand?.logoWordmarkPath, fallback.brand.logoWordmarkPath);
  const footerColumns = Array.isArray(rawNavigation?.footerColumns)
    ? rawNavigation.footerColumns.flatMap((candidate, index) => {
      const column = record(candidate);
      if (!column) return [];
      const links = navigationItems(column.links, [], showImage);
      if (!links.length) return [];
      return [{ id: text(column.id, `column-${index}`, 100), title: text(column.title, 'Links', 80), links }];
    })
    : [];

  return {
    schemaVersion: 1,
    displayOnlyProviderStates: true,
    brand: {
      displayName: text(rawBrand?.displayName, fallback.brand.displayName, 100),
      legalName: text(rawBrand?.legalName, fallback.brand.legalName, 160),
      tagline: text(rawBrand?.tagline, fallback.brand.tagline, 200),
      siteUrl: safeHttps(rawBrand?.siteUrl, fallback.brand.siteUrl)!,
      apiBaseUrl: safeHttps(rawBrand?.apiBaseUrl, fallback.brand.apiBaseUrl)!,
      logoMarkPath: resolveAssetPath(logoMarkPath, origin),
      logoWordmarkPath: resolveAssetPath(logoWordmarkPath, origin),
      supportEmail: null,
    },
    theme: {
      defaultTheme,
      primaryFrom: safeColor(rawTheme?.primaryFrom, fallback.theme.primaryFrom),
      primaryTo: safeColor(rawTheme?.primaryTo, fallback.theme.primaryTo),
      accent: safeColor(rawTheme?.accent, fallback.theme.accent),
      background: safeThemeBackground(rawTheme?.background, defaultTheme),
      gradientAngle: typeof rawTheme?.gradientAngle === 'number' && Number.isInteger(rawTheme.gradientAngle) && rawTheme.gradientAngle >= 0 && rawTheme.gradientAngle <= 360 ? rawTheme.gradientAngle : fallback.theme.gradientAngle,
    },
    features: {
      showChat: false,
      showImage,
      showLanguageSelector: false,
      showOpenChat: false,
      showSupportEmail: false,
    },
    navigation: {
      publicHeader: navigationItems(rawNavigation?.publicHeader, fallback.navigation.publicHeader, showImage),
      portalHeader: [],
      docsHeader: navigationItems(rawNavigation?.docsHeader, fallback.navigation.docsHeader, showImage),
      footerColumns: footerColumns.length ? footerColumns : fallback.navigation.footerColumns,
    },
    home: {
      eyebrow: optionalText(rawHome?.eyebrow, 200) ?? fallback.home.eyebrow,
      title: text(rawHome?.title, fallback.home.title, 300),
      description: optionalText(rawHome?.description) ?? fallback.home.description,
      primaryCta: {
        label: text(record(rawHome?.primaryCta)?.label, fallback.home.primaryCta.label, 80),
        href: safeHref(record(rawHome?.primaryCta)?.href, fallback.home.primaryCta.href),
      },
      secondaryCta: {
        label: text(record(rawHome?.secondaryCta)?.label, fallback.home.secondaryCta.label, 80),
        href: safeHref(record(rawHome?.secondaryCta)?.href, fallback.home.secondaryCta.href),
      },
      footerDescription: optionalText(rawHome?.footerDescription) ?? text(rawBrand?.tagline, fallback.home.footerDescription, 2_000),
    },
    providers: {
      openai: provider(rawProviders?.openai, fallback.providers.openai, 'openai'),
      anthropic: provider(rawProviders?.anthropic, fallback.providers.anthropic, 'anthropic'),
      grok: provider(rawProviders?.grok, fallback.providers.grok, 'grok'),
    },
    pages: pages(source.pages),
    docs: docs(source.docs),
    models: models(source.models),
  };
}

function configuredContentOrigin() {
  const configured = process.env.KINETICROUTER_SITE_CONTENT_ORIGIN
    ?? process.env.KINETICROUTER_CONSOLE_ORIGIN
    ?? process.env.KINETICROUTER_CONSOLE_URL
    ?? process.env.NEXT_PUBLIC_KINETICROUTER_CONSOLE_ORIGIN;
  return normalizeConsoleOrigin(configured)
    ?? resolvePublicConsoleOrigin(undefined, undefined, process.env.NODE_ENV === 'development');
}

let cached: { content: SiteContentDocument; expiresAt: number } | undefined;
let lastKnownPublished: SiteContentDocument | undefined;
let inFlight: Promise<{ content: SiteContentDocument; fresh: boolean }> | undefined;

function unavailableSiteContent() {
  return { content: lastKnownPublished ?? fallbackSiteContent, fresh: false };
}

async function fetchPublishedSiteContent() {
  const origin = configuredContentOrigin();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_200);
  try {
    const response = await fetch(new URL('/portal/v1/site-content/current', `${origin}/`), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return unavailableSiteContent();
    const payload = record(await response.json());
    const release = record(payload?.data);
    if (typeof release?.version !== 'number' || release.version <= 0) return unavailableSiteContent();
    const content = normalizeSiteContent(release.content, origin);
    if (content === fallbackSiteContent) return unavailableSiteContent();
    lastKnownPublished = content;
    return { content, fresh: true };
  } catch {
    return unavailableSiteContent();
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadPublishedSiteContent() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.content;
  if (!inFlight) inFlight = fetchPublishedSiteContent();
  const result = await inFlight;
  inFlight = undefined;
  cached = { content: result.content, expiresAt: now + (result.fresh ? 60_000 : 15_000) };
  return result.content;
}

export function siteThemeStyle(theme: SiteContentDocument['theme']) {
  return {
    '--brand-gradient': `linear-gradient(${theme.gradientAngle}deg, ${theme.primaryFrom} 0%, ${theme.primaryTo} 100%)`,
    '--primary': theme.accent,
    '--primary-hover': theme.primaryTo,
    '--brand-sky': theme.accent,
    '--site-background': theme.background,
  } as CSSProperties;
}

export function publicCtaHref(href: string) {
  if (href.startsWith('/account/') || href.includes('console.kineticrouter.com')) return '/account/sign-in';
  return safeHref(href, '/account/sign-in');
}

export function publishedDoc(content: SiteContentDocument, route: string) {
  return content.docs.find((item) => item.enabled && item.route === route);
}

export function publishedDocEntry(content: SiteContentDocument, route: string) {
  return content.docs.find((item) => item.route === route);
}

export function publishedPage(content: SiteContentDocument, key: string) {
  return content.pages.find((item) => item.enabled && item.key === key);
}

export function publishedPageEntry(content: SiteContentDocument, key: string) {
  return content.pages.find((item) => item.key === key);
}

export function hasPublishedPageBlocks(page: SitePageContent | undefined): page is SitePageContent {
  return Boolean(page?.enabled && page.blocks.length);
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function inlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      const safe = safeHref(href.replaceAll('&amp;', '&'), '');
      return safe ? `<a href="${escapeHtml(safe)}">${label}</a>` : label;
    });
}

function headingId(value: string, index: number) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${index}`;
}

export function siteDocMarkdownToHtml(doc: SiteDocContent) {
  const lines = doc.bodyMarkdown.replaceAll('\r\n', '\n').split('\n');
  const output: string[] = [];
  let index = 0;
  let sawHeading = false;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]);
      index += 1;
      output.push(`<pre><code${fence[1] ? ` data-language="${escapeHtml(fence[1])}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const label = heading[2].trim();
      sawHeading = true;
      output.push(`<h${level} id="${headingId(label, index)}">${inlineMarkdown(label)}</h${level}>`);
      index += 1;
      continue;
    }
    const unordered = /^[-*]\s+/.test(line);
    const ordered = /^\d+\.\s+/.test(line);
    if (unordered || ordered) {
      const tag = ordered ? 'ol' : 'ul';
      const pattern = ordered ? /^\d+\.\s+(.+)$/ : /^[-*]\s+(.+)$/;
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(pattern);
        if (!match) break;
        items.push(`<li>${inlineMarkdown(match[1])}</li>`);
        index += 1;
      }
      output.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+|^```|^[-*]\s+|^\d+\.\s+/.test(lines[index])) paragraph.push(lines[index++].trim());
    output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
  }
  if (!sawHeading) output.unshift(`<h1 id="${headingId(doc.title, 0)}">${escapeHtml(doc.title)}</h1>`);
  return `<article><div class="nextra-breadcrumb">${escapeHtml(doc.group)}</div><main>${output.join('\n')}</main></article>`;
}

export function applyPublishedModelContent(baseModels: Model[], content: SiteContentDocument) {
  if (!content.models.length) return baseModels;
  const overrides = new Map(content.models.map((model) => [model.id, model]));
  const originalOrder = new Map(baseModels.map((model, index) => [model.id, index]));
  return baseModels.filter((model) => overrides.get(model.id)?.enabled === true).map((model) => {
    const override = overrides.get(model.id);
    if (!override || override.provider !== model.provider) return model;
    return {
      ...model,
      name: override.name,
      tagline: override.description || model.tagline,
      contextWindow: override.contextWindow ?? model.contextWindow,
      maxOutput: override.maxOutput ?? model.maxOutput,
      gatewayMaxInput: override.contextWindow ?? model.gatewayMaxInput,
      gatewayMaxOutput: override.maxOutput ?? model.gatewayMaxOutput,
      prices: [
        ...model.prices.filter((price) => price.role !== 'sell' || Boolean(price.tierLabel)),
        ...override.prices.map((price, index) => ({
          id: -(index + 1),
          modelId: model.id,
          role: 'sell' as const,
          billingMode: model.billingMode,
          component: price.component,
          unit: price.unit,
          tierLabel: '',
          priceMicroUsd: Math.round(price.usd * 1_000_000),
          source: 'site-content',
          version: 1,
          active: true,
        })),
      ],
    };
  }).sort((a, b) => (overrides.get(a.id)?.order ?? 100_000 + (originalOrder.get(a.id) ?? 0)) - (overrides.get(b.id)?.order ?? 100_000 + (originalOrder.get(b.id) ?? 0)));
}
