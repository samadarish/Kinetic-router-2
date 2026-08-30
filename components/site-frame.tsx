import { PublicFooter } from './public-footer';
import { PublicHeader } from './public-header';

export function SiteFrame({ children, footer = true }: { children: React.ReactNode; footer?: boolean }) {
  return <div className="min-h-screen bg-background text-foreground"><PublicHeader /><main>{children}</main>{footer && <PublicFooter />}</div>;
}
