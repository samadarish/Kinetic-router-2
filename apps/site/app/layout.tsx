import type { Metadata, Viewport } from 'next';
import { THEME_BOOTSTRAP_SCRIPT } from '@kineticrouter/platform-config/theme';
import { LOCALE_BOOTSTRAP_SCRIPT } from '@kineticrouter/platform-config/locale';
import { loadCatalog } from '@kineticrouter/i18n';
import { getRequestLocale, translateMetadata } from '@/data/locale';
import { SiteLocaleProvider } from '@/components/site-locale';
import './globals.css';
import { SITE_ORIGIN } from '@/data/seo-policy.mjs';
import { AnalyticsTracker } from '@/components/analytics-tracker';
import { SupportNotifications } from '@/components/support-notifications';

const baseMetadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: 'kineticRouter — OpenAI-compatible API and model reference',
    template: '%s — kineticRouter',
  },
  description: 'OpenAI-compatible, Anthropic-native, and Grok API access with a transparent model and pricing reference catalog.',
  applicationName: 'kineticRouter',
  verification: process.env.GOOGLE_SITE_VERIFICATION?.trim() ? { google: process.env.GOOGLE_SITE_VERIFICATION.trim() } : undefined,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-48.png', type: 'image/png', sizes: '48x48' },
      { url: '/favicon.ico', type: 'image/x-icon', sizes: 'any' },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'kineticRouter',
    title: 'kineticRouter — OpenAI-compatible API and model reference',
    description: 'OpenAI-compatible API access with a transparent model and pricing reference catalog.',
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'kineticRouter' }],
  },
  twitter: { card: 'summary_large_image', title: 'kineticRouter — OpenAI-compatible API and model reference', description: 'OpenAI-compatible access with a transparent reference catalog.', images: ['/og.jpg'] },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#000000' };

// The same URLs render the visitor's saved locale. Never cache cookie-dependent
// HTML or RSC output as a single public, English response.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return translateMetadata(baseMetadata, await loadCatalog(locale, 'site'), locale);
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();
  const messages = await loadCatalog(locale, 'site');
  return (
    // Browser auto-translation can rewrite server HTML before hydration. The
    // local catalogs own language selection and translation on both sites.
    <html lang={locale} translate="no" className="dark notranslate" suppressHydrationWarning>
      <head><link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /><script dangerouslySetInnerHTML={{ __html: `${THEME_BOOTSTRAP_SCRIPT}\n${LOCALE_BOOTSTRAP_SCRIPT}` }} /></head>
      <body><SiteLocaleProvider locale={locale} messages={messages}>{children}<AnalyticsTracker /><SupportNotifications /></SiteLocaleProvider></body>
    </html>
  );
}
