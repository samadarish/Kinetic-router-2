import { SeoJsonLd } from './seo-json-ld';
import { PublicFooter } from './public-footer';
import { PublicHeader } from './public-header';
import { SiteTheme } from './site-theme';
import { siteConfig } from '@/data/site-config';

export function SiteFrame({ children, footer = true, seoRoute }: { children: React.ReactNode; footer?: boolean; seoRoute?: string }) {
  return <div className="site-theme-root min-h-screen bg-background text-foreground">{seoRoute && <SeoJsonLd route={seoRoute} />}<SiteTheme /><PublicHeader content={siteConfig} /><main>{children}</main>{footer && <PublicFooter content={siteConfig} />}</div>;
}
