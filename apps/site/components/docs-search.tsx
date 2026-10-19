'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { decodeDocsSearchIndex, searchDocumentation, searchResultFocusIndex, type DocsSearchEntry } from '@/data/docs-search';
import { CloseIcon, SearchIcon } from './icons';
import { useLocale } from '@kineticrouter/i18n/react';
import type { Locale } from '@kineticrouter/platform-config/locale';

const cachedIndexes = new Map<Locale, DocsSearchEntry[]>();

export function DocsSearch({ onClose }: { onClose(): void }) {
  const { locale } = useLocale();
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState<{ locale: Locale; entries: DocsSearchEntry[] } | undefined>(() => {
    const entries = cachedIndexes.get(locale);
    return entries ? { locale, entries } : undefined;
  });
  const entries = loaded?.locale === locale ? loaded.entries : cachedIndexes.get(locale);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const root = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const results = useMemo(() => searchDocumentation(entries ?? [], query), [entries, query]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.querySelector('input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      const controls = [...root.current?.querySelectorAll<HTMLElement>('input,button,a[href]') ?? []].filter((node) => !node.hasAttribute('disabled'));
      const current = controls.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'Tab' && controls.length) {
        if (event.shiftKey && current <= 0) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && current === controls.length - 1) { event.preventDefault(); controls[0]?.focus(); }
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const links = [...root.current?.querySelectorAll<HTMLAnchorElement>('[data-search-result]') ?? []];
        if (!links.length) return;
        event.preventDefault();
        const index = links.indexOf(document.activeElement as HTMLAnchorElement);
        links[searchResultFocusIndex(event.key, index, links.length)]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    if (cachedIndexes.has(locale)) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    fetch(`/docs/search-index.json?locale=${encodeURIComponent(locale)}`, { signal }).then(async (response) => {
      if (!response.ok) throw new Error('Search unavailable');
      const data = decodeDocsSearchIndex(await response.json());
      if (!signal.aborted) { cachedIndexes.set(locale, data); setLoaded({ locale, entries: data }); setError(false); }
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt, locale]);

  return createPortal(<div className="docs-search-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={root} role="dialog" aria-modal="true" aria-label="Search documentation" className="docs-search-dialog">
      <div className="docs-search-input"><SearchIcon className="h-5 w-5" /><input aria-label="Search documentation" placeholder="Search documentation" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" aria-label="Close search" onClick={onClose}><CloseIcon className="h-5 w-5" /></button></div>
      <div className="docs-search-results">
        {error ? <p role="alert">Search is unavailable. <button type="button" onClick={() => { setError(false); setAttempt((value) => value + 1); }}>Try again</button></p>
          : !entries ? <p role="status">Loading documentation…</p>
            : !query.trim() ? <><p>Quick links</p>{[{ route: '/docs/develop', title: 'Quick start' }, { route: '/docs/develop/authentication', title: 'API keys' }, { route: '/docs/develop/observability/usage-tracking', title: 'Usage and billed costs' }].map((entry) => <Link data-search-result key={entry.route} href={entry.route} onClick={onClose}>{entry.title}</Link>)}</>
              : <><p role="status">{results.length ? `${results.length} results` : 'No matching guides. Try a model, feature, or error.'}</p>{results.map((entry) => <Link data-search-result key={entry.route} href={entry.route} onClick={onClose}><strong>{entry.title}</strong><span>{entry.snippet}</span></Link>)}</>}
      </div>
    </section>
  </div>, document.body);
}
