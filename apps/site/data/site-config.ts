import {
  providerAvailability,
  providerAvailabilityCheckedAt,
  type ProviderId,
  type ProviderInteractionMode,
} from './provider-availability';
import { PRODUCT } from '@kineticrouter/platform-config/brand';
import { OPENAI_API_BASE_URL, PRODUCTION_ORIGINS } from '@kineticrouter/platform-config/origins';

export type SiteNavigationItem = {
  id: string;
  label: string;
  href: string;
  enabled: true;
  order: number;
  external?: boolean;
};

export type SiteProviderDisplay = {
  id: ProviderId;
  label: string;
  aliases: readonly string[];
  catalogState: 'verified' | 'partial' | 'planned' | 'reference';
  modelAccessState: 'verified' | 'partial' | 'planned' | 'reference';
  apiState: 'verified' | 'partial' | 'planned' | 'reference';
  interactionMode: ProviderInteractionMode;
  badgeLabel: string;
  protocolLabel: string;
  baseUrl?: string;
  previewBaseUrl?: string;
  summary: string;
  evidenceNote: string;
  protocolSources: readonly string[];
  verifiedAt?: string;
  enabled: true;
};

export type SiteProviderMap = Record<ProviderId, SiteProviderDisplay>;

export type SiteConfig = {
  brand: {
    displayName: string;
    legalName: string;
    tagline: string;
    siteUrl: string;
    apiBaseUrl: string;
  };
  navigation: {
    publicHeader: SiteNavigationItem[];
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
};

function staticProvider(id: ProviderId): SiteProviderDisplay {
  const provider = providerAvailability[id];
  return {
    id,
    ...provider,
    interactionMode: provider.interactionMode,
    verifiedAt: providerAvailabilityCheckedAt,
    enabled: true,
  };
}

export const siteConfig: SiteConfig = {
  brand: {
    displayName: PRODUCT.name,
    legalName: PRODUCT.legalName,
    tagline: PRODUCT.tagline,
    siteUrl: PRODUCTION_ORIGINS.publicSite,
    apiBaseUrl: OPENAI_API_BASE_URL,
  },
  navigation: {
    publicHeader: [
      { id: 'home', label: 'Home', href: '/', enabled: true, order: 10 },
      { id: 'models', label: 'Model pricing', href: '/models', enabled: true, order: 20 },
      { id: 'playground', label: 'Playground', href: '/account/sign-in?next=%2Fplayground', enabled: true, order: 25 },
      { id: 'docs', label: 'Docs', href: '/docs', enabled: true, order: 30 },
    ],
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
    title: PRODUCT.tagline,
    description: 'One API for leading models, with clear provider availability and request-level billing.',
    primaryCta: { label: 'Get API Key', href: '/account/sign-in' },
    secondaryCta: { label: 'Explore Models', href: '/models' },
    footerDescription: PRODUCT.tagline,
  },
  providers: {
    openai: staticProvider('openai'),
    anthropic: staticProvider('anthropic'),
    grok: staticProvider('grok'),
  },
};
