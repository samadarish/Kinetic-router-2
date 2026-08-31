import { PublicFooter } from './public-footer';
import { PublicHeader } from './public-header';
import { SiteTheme } from './site-theme';
import { loadPublishedSiteContent, siteThemeStyle, type SiteContentDocument } from '@/data/site-content';

export async function SiteFrame({ children, footer = true, content: providedContent }: { children: React.ReactNode; footer?: boolean; content?: SiteContentDocument }) {
  const content = providedContent ?? await loadPublishedSiteContent();
  return <div className="site-theme-root min-h-screen bg-background text-foreground" data-site-default-theme={content.theme.defaultTheme} style={siteThemeStyle(content.theme)}><SiteTheme defaultTheme={content.theme.defaultTheme} /><PublicHeader content={content} /><main>{children}</main>{footer && <PublicFooter content={content} />}</div>;
}
