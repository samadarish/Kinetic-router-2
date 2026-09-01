import type { Metadata, Viewport } from 'next';
import { THEME_BOOTSTRAP_SCRIPT } from '@kineticrouter/platform-config/theme';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://kineticrouter.com'),
  title: {
    default: 'kineticRouter — OpenAI-compatible API and model reference',
    template: '%s — kineticRouter',
  },
  description: 'OpenAI-compatible API access with a transparent model and pricing reference catalog. Native Anthropic and Grok routes are planned.',
  applicationName: 'kineticRouter',
  alternates: { canonical: '/' },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/favicon-192.png', type: 'image/png' }, { url: '/favicon.ico' }],
    apple: '/apple-icon.png',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'kineticRouter',
    title: 'kineticRouter — OpenAI-compatible API and model reference',
    description: 'OpenAI-compatible API access with a transparent model and pricing reference catalog.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'kineticRouter' }],
  },
  twitter: { card: 'summary_large_image', title: 'kineticRouter — OpenAI-compatible API and model reference', description: 'OpenAI-compatible access with a transparent reference catalog.', images: ['/og.png'] },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#141413' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} /></head>
      <body>{children}</body>
    </html>
  );
}
