import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HomeHero } from '@/components/home-hero';
import { HomeSections } from '@/components/home-sections';
import { PublishedPageBlocks } from '@/components/published-page-blocks';
import { PublicFooter } from '@/components/public-footer';
import { PublicHeader } from '@/components/public-header';
import { SiteTheme } from '@/components/site-theme';
import { hasPublishedPageBlocks, loadPublishedSiteContent, publicCtaHref, publishedPageEntry, siteThemeStyle } from '@/data/site-content';

export async function generateMetadata(): Promise<Metadata> {
  const content = await loadPublishedSiteContent();
  const page = publishedPageEntry(content, 'home');
  return page?.enabled ? { title: page.title, description: page.description || content.home.description } : {};
}

export default async function HomePage() {
  const content = await loadPublishedSiteContent();
  const page = publishedPageEntry(content, 'home');
  if (page && !page.enabled) notFound();
  const home = { ...content.home, primaryCta: { ...content.home.primaryCta, href: publicCtaHref(content.home.primaryCta.href) } };
  return <div className="site-theme-root min-h-screen bg-background text-foreground" data-site-default-theme={content.theme.defaultTheme} style={siteThemeStyle(content.theme)}><SiteTheme defaultTheme={content.theme.defaultTheme} /><PublicHeader content={content} /><main>{hasPublishedPageBlocks(page) ? <PublishedPageBlocks page={page} content={content} /> : <><HomeHero home={home} providers={content.providers} /><HomeSections /></>}</main><PublicFooter content={content} /></div>;
}
