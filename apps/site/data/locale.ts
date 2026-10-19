import { cache } from 'react';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, parseLocale, type Locale } from '@kineticrouter/platform-config/locale';
import { createTranslator, loadCatalog, type Catalog } from '@kineticrouter/i18n';
import { pageMetadata } from './seo';

export const getRequestLocale = cache(async (): Promise<Locale> => parseLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE);

/** Only human-readable metadata fields are translated; URLs and identifiers stay exact. */
export function translateMetadata(metadata: Metadata, catalog: Catalog, locale: Locale): Metadata {
  const { text } = createTranslator(catalog, locale);
  const titleText = (value: string) => {
    const suffix = /\s+[—–|]\s+kineticRouter$/.exec(value)?.[0];
    return suffix ? `${text(value.slice(0, -suffix.length))}${suffix}` : text(value);
  };
  const prose = (value: string) => {
    const translated = text(value);
    return translated === value ? value.split(/(?<=[.!?])\s+/).map(text).join(' ') : translated;
  };
  const title = metadata.title;
  const translatedTitle = typeof title === 'string' ? titleText(title) : title && 'absolute' in title
    ? { ...title, absolute: titleText(title.absolute) } : title && 'default' in title
      ? { ...title, default: titleText(title.default) } : title;
  return {
    ...metadata, title: translatedTitle,
    description: metadata.description ? prose(metadata.description) : metadata.description,
    openGraph: metadata.openGraph ? {
      ...metadata.openGraph,
      title: typeof metadata.openGraph.title === 'string' ? titleText(metadata.openGraph.title) : metadata.openGraph.title,
      description: metadata.openGraph.description ? prose(metadata.openGraph.description) : metadata.openGraph.description,
      locale: locale === 'zh-CN' ? 'zh_CN' : locale,
    } : metadata.openGraph,
    twitter: metadata.twitter ? {
      ...metadata.twitter,
      title: typeof metadata.twitter.title === 'string' ? titleText(metadata.twitter.title) : metadata.twitter.title,
      description: metadata.twitter.description ? prose(metadata.twitter.description) : metadata.twitter.description,
    } : metadata.twitter,
  };
}

export async function localizedPageMetadata(route: string): Promise<Metadata> {
  const locale = await getRequestLocale();
  const catalog = await loadCatalog(locale, 'site');
  const base = translateMetadata(pageMetadata(route), catalog, locale);
  if (route.startsWith('/docs')) {
    const canonicalRoute = route === '/docs/en' ? '/docs' : route;
    const docCatalog = await loadCatalog(locale, `docs:${canonicalRoute}`).catch(() => ({}));
    return translateMetadata(base, docCatalog, locale);
  }
  return base;
}
