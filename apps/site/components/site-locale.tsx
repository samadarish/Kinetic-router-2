'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LocaleProvider, useLocale } from '@kineticrouter/i18n/react';
import type { Catalog, Locale } from '@kineticrouter/i18n';

function RefreshLocalizedPage() {
  const { locale } = useLocale();
  const previous = useRef(locale);
  const router = useRouter();
  useEffect(() => {
    if (previous.current === locale) return;
    previous.current = locale;
    router.refresh();
  }, [locale, router]);
  return null;
}

export function SiteLocaleProvider({ children, locale, messages }: { children: ReactNode; locale: Locale; messages: Catalog }) {
  return <LocaleProvider namespace="site" initialLocale={locale} initialMessages={messages}><RefreshLocalizedPage />{children}</LocaleProvider>;
}
