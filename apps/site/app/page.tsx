import { localizedPageMetadata } from '@/data/locale';
import { SeoJsonLd } from '@/components/seo-json-ld';
import { HomeHero } from '@/components/home-hero';
import { HomeSections } from '@/components/home-sections';
import { PublicFooter } from '@/components/public-footer';
import { PublicHeader } from '@/components/public-header';
import { SiteTheme } from '@/components/site-theme';
import { siteConfig } from '@/data/site-config';

export async function generateMetadata() { return localizedPageMetadata('/'); }

export default function HomePage() {
  return <div className="site-theme-root min-h-screen bg-background text-foreground"><SeoJsonLd route="/" /><SiteTheme /><PublicHeader content={siteConfig} /><main><HomeHero home={siteConfig.home} providers={siteConfig.providers} /><HomeSections /></main><PublicFooter content={siteConfig} /></div>;
}
