'use client';

import { Children, createContext, createElement, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ElementType, type ReactNode } from 'react';
import { DEFAULT_LOCALE, getLocaleSnapshot, readBrowserLocale, setBrowserLocale, subscribeLocale, type Locale } from '@kineticrouter/platform-config/locale';
import { createTranslator, loadCatalog, localizeHtml, translateText, type Catalog, type CatalogNamespace } from './index.js';

type LocaleContextValue = ReturnType<typeof createTranslator> & { locale: Locale; requestedLocale: Locale; pending: boolean; error: boolean; retry(): void; setLocale(locale: Locale): void };
const empty: Catalog = {};
const LocaleContext = createContext<LocaleContextValue>({ ...createTranslator(), locale: DEFAULT_LOCALE, requestedLocale: DEFAULT_LOCALE, pending: false, error: false, retry() {}, setLocale: setBrowserLocale });
const PreserveContext = createContext(false);

export function LocaleProvider({ children, initialLocale = DEFAULT_LOCALE, initialMessages = empty, namespace }: { children: ReactNode; initialLocale?: Locale; initialMessages?: Catalog; namespace: CatalogNamespace }) {
  const requestedLocale = useSyncExternalStore(subscribeLocale, getLocaleSnapshot, () => initialLocale);
  const [loaded, setLoaded] = useState({ locale: initialLocale, catalog: initialMessages });
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (loaded.locale === requestedLocale) return;
    let active = true;
    setError(false);
    void loadCatalog(requestedLocale, namespace).then(catalog => {
      if (active) setLoaded({ locale: requestedLocale, catalog });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [requestedLocale, loaded.locale, namespace, attempt]);
  const value = useMemo<LocaleContextValue>(() => ({
    ...createTranslator(loaded.catalog, loaded.locale), locale: loaded.locale, requestedLocale,
    pending: loaded.locale !== requestedLocale && !error, error,
    retry: () => setAttempt(attempt => attempt + 1), setLocale: setBrowserLocale,
  }), [loaded, requestedLocale, error]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() { return useContext(LocaleContext); }
export function useTranslations() { return useLocale(); }

/** Boundary for user-authored text, identifiers, and code, including nested components. */
export function OriginalText({ children }: { children: ReactNode }) {
  return <PreserveContext.Provider value>{children}</PreserveContext.Provider>;
}

export const LOCALIZED_ATTRIBUTES = ['aria-label', 'aria-description', 'aria-valuetext', 'title', 'alt', 'placeholder', 'label'] as const;
type ElementProps = Record<string, unknown> & { children?: ReactNode; dangerouslySetInnerHTML?: { __html: string }; translate?: 'yes' | 'no' };

function translateChildren(children: ReactNode, text: (source: string) => string): ReactNode {
  if (typeof children === 'string') return text(children);
  if (!Array.isArray(children)) return children;
  // Join adjacent primitives so phrases such as "{count} results" remain one
  // translation unit. Elements keep their identity, keys, and event handlers.
  const result: ReactNode[] = [];
  let run: Array<string | number> = [];
  const flush = () => {
    if (run.length) {
      const source = run.join('');
      const translated = text(source);
      result.push(translated !== source ? translated : run.length === 1 && typeof run[0] === 'number' ? run[0] : run.map(item => typeof item === 'string' ? text(item) : item).join(''));
    }
    run = [];
  };
  for (const child of children) {
    if (typeof child === 'string' || typeof child === 'number') run.push(child);
    else { flush(); result.push(child); }
  }
  flush();
  return Children.toArray(result);
}

/** Text in fragments and router/library links is rendered outside native tags. */
export function Translated({ children }: { children: ReactNode }) {
  const { text } = useLocale();
  const preserve = useContext(PreserveContext);
  return preserve ? children : translateChildren(children, text);
}

/** Used by the app JSX runtimes: translation stays in React, never a DOM observer. */
export function LocalizedElement({ as, elementProps }: { as: string; elementProps: ElementProps }) {
  const { text } = useLocale();
  const inherited = useContext(PreserveContext);
  const preserve = inherited || elementProps.translate === 'no' || ['pre', 'code', 'kbd', 'samp', 'svg', 'math'].includes(as);
  const props = { ...elementProps };
  if (!preserve) {
    for (const name of LOCALIZED_ATTRIBUTES) if (typeof props[name] === 'string') props[name] = text(props[name]);
    if (!props.dangerouslySetInnerHTML) props.children = translateChildren(props.children, text);
  }
  const element = createElement(as as ElementType, props);
  return preserve && !inherited ? <PreserveContext.Provider value>{element}</PreserveContext.Provider> : element;
}

/** Useful for translated HTML owned by a client component. */
export function useLocalizedHtml(html: string, catalog: Catalog) {
  return useMemo(() => localizeHtml(html, catalog), [html, catalog]);
}

export { readBrowserLocale, translateText };
