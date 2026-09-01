'use client';

import { useEffect, useState } from 'react';
import { Brand } from './brand';
import { DocsNavigation } from './docs-navigation';
import { CloseIcon, MenuIcon, MoonIcon, SearchIcon, SunIcon } from './icons';
import { PublicAccountMenu } from './public-account-menu';
import type { DocsNavigationGroup } from '@/data/docs-navigation';
import type { SiteConfig, SiteNavigationItem } from '@/data/site-config';
import { applyTheme, writeStoredTheme } from '@kineticrouter/platform-config/theme';

function routeActive(route: string, href: string) {
  return href === '/docs' ? route === href : route === href || route.startsWith(`${href}/`);
}

type DocsHeaderProps = {
  route: string;
  navigation: DocsNavigationGroup[];
  headerLinks: SiteNavigationItem[];
  brand: SiteConfig['brand'];
};

export function DocsHeader({ route, navigation, headerLinks, brand }: DocsHeaderProps) {
  const [dark, setDark] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDark(document.documentElement.classList.contains('dark')));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function closeOverlays(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      setSearchOpen(false);
    }
    window.addEventListener('keydown', closeOverlays);
    return () => window.removeEventListener('keydown', closeOverlays);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    const theme = next ? 'dark' : 'light';
    applyTheme(document.documentElement, theme);
    try { writeStoredTheme(window.localStorage, theme); } catch { /* Storage can be unavailable. */ }
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex h-full min-w-0 max-w-[1440px] items-center px-3 sm:px-4 lg:px-6">
        <a href="/" aria-label={`${brand.displayName} home`} className="shrink-0"><Brand className="w-[105px] sm:w-[132px]" label={brand.displayName} wordmarkPath={brand.logoWordmarkPath} /></a>
        <span className="mx-2 h-5 shrink-0 border-l border-border sm:mx-3" />

        <div className="docs-header-rail hidden min-w-0 flex-1 md:block">
          <nav className="flex h-full min-w-max items-center gap-5 pr-3 text-xs text-muted-foreground lg:gap-6" aria-label="Documentation sections">
            {headerLinks.map((link) => {
              const active = routeActive(route, link.href);
              return (
                <a key={link.id} href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noreferrer' : undefined} aria-current={active ? 'page' : undefined} className={`relative flex h-full shrink-0 items-center whitespace-nowrap hover:text-foreground ${active ? 'text-foreground' : ''}`}>
                  {link.label}
                  <span className={`absolute inset-x-0 bottom-0 h-0.5 bg-primary ${active ? 'opacity-100' : 'opacity-0'}`} />
                </a>
              );
            })}
          </nav>
        </div>

        <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search documentation" className="ml-auto hidden h-9 w-56 shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-muted/40 px-3 text-left text-xs text-muted-foreground xl:flex">
          <SearchIcon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Search documentation…</span>
          <kbd className="ml-auto shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px]">⌘ K</kbd>
        </button>
        <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search documentation" className="ml-auto hidden h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground lg:grid xl:hidden"><SearchIcon className="h-4 w-4" /></button>
        <PublicAccountMenu className="ml-auto md:ml-2 lg:ml-3" />
        <button type="button" aria-label="Toggle theme" onClick={toggleTheme} className="ml-1 grid h-9 w-9 shrink-0 place-items-center text-muted-foreground sm:ml-2">{dark ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}</button>
        <button type="button" aria-label={menuOpen ? 'Close docs menu' : 'Open docs menu'} aria-expanded={menuOpen} aria-controls="docs-mobile-navigation" onClick={() => setMenuOpen((value) => !value)} className="ml-1 grid h-9 w-9 shrink-0 place-items-center lg:hidden">{menuOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}</button>
      </div>

      {menuOpen && (
        <div id="docs-mobile-navigation" className="docs-mobile-menu absolute inset-x-3 top-[calc(100%+6px)] overflow-hidden rounded-xl border border-border bg-elevated shadow-2xl lg:hidden">
          <nav aria-label="Documentation sections" className="flex gap-1 overflow-x-auto border-b border-border p-2">
            {headerLinks.map((link) => <a key={link.id} href={link.href} className={`shrink-0 rounded-lg px-3 py-2 text-xs ${routeActive(route, link.href) ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}>{link.label}</a>)}
          </nav>
          <div className="flex items-center border-b border-border px-4 py-3">
            <strong className="text-xs">Browse documentation</strong>
            <button type="button" onClick={() => { setMenuOpen(false); setSearchOpen(true); }} className="ml-auto inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted"><SearchIcon className="h-4 w-4" />Search</button>
          </div>
          <DocsNavigation groups={navigation} route={route} className="max-h-[calc(100dvh-11.5rem)] overscroll-contain overflow-y-auto p-4" onNavigate={() => setMenuOpen(false)} />
        </div>
      )}

      {searchOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onMouseDown={() => setSearchOpen(false)}>
          <section className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-elevated shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <SearchIcon className="h-5 w-5 text-muted-foreground" />
              <input autoFocus placeholder="Search documentation" className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none" />
              <button type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}><CloseIcon className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-2">
              <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick links</p>
              {[
                ['Quick Start', '/docs/develop'],
                ['Authentication', '/docs/develop/authentication'],
                ['Models', '/docs/develop/models'],
                ['API Reference', '/docs/api'],
                ['Codex WebSocket', '/docs/integrations/codex/websocket'],
                ['Claude Code', '/docs/integrations/claude-code'],
              ].map(([label, href]) => <a key={href} href={href} className="flex items-center rounded-lg px-3 py-2.5 text-sm hover:bg-muted">{label}<span className="ml-auto text-xs text-muted-foreground">↗</span></a>)}
            </div>
          </section>
        </div>
      )}
    </header>
  );
}
