import { PublicFooter } from './public-footer';
import { PublicHeader } from './public-header';
import { SiteTheme } from './site-theme';
import { siteConfig } from '@/data/site-config';

export function SiteFrame({ children, footer = true }: { children: React.ReactNode; footer?: boolean }) {
  return <div className="site-theme-root min-h-screen bg-background text-foreground"><SiteTheme /><PublicHeader content={siteConfig} /><main>{children}</main>{footer && <PublicFooter content={siteConfig} />}</div>;
}
