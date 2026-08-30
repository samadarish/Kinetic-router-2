'use client';

import { useEffect, useState } from 'react';
import { Brand } from './brand';
import { CloseIcon, GlobeIcon, MenuIcon, MoonIcon, SearchIcon, SunIcon } from './icons';

export function DocsHeader() {
  const [dark, setDark] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDark(document.documentElement.classList.contains('dark')));
    return () => cancelAnimationFrame(frame);
  }, []);
  function toggleTheme() { const next = !dark; setDark(next); document.documentElement.classList.toggle('dark', next); document.documentElement.classList.toggle('light', !next); document.documentElement.style.colorScheme = next ? 'dark' : 'light'; localStorage.setItem('kineticrouter-theme', next ? 'dark' : 'light'); }
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-[1440px] items-center px-4 lg:px-6">
        <a href="/" aria-label="kineticRouter home"><Brand className="w-[132px]" /></a>
        <span className="mx-3 h-5 border-l border-border" /><a href="/docs" className="text-sm font-semibold">Docs</a>
        <nav className="ml-8 hidden items-center gap-6 text-xs text-muted-foreground md:flex"><a href="/docs/develop" className="hover:text-foreground">Develop</a><a href="/docs/api" className="hover:text-foreground">API Reference</a><a href="/docs/integrations" className="hover:text-foreground">Integrations</a></nav>
        <button onClick={() => setSearchOpen(true)} className="ml-auto hidden h-9 w-64 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-muted/40 px-3 text-left text-xs text-muted-foreground sm:flex"><SearchIcon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">Search documentation…</span><kbd className="ml-auto shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px]">⌘ K</kbd></button>
        <a href="/models" className="ml-3 hidden text-xs text-muted-foreground hover:text-foreground lg:block">Models</a><a href="https://console.kineticrouter.com/sign-in" className="brand-cta ml-3 rounded-lg px-4 py-2 text-xs font-semibold">Get started</a>
        <button aria-label="Language" className="ml-3 hidden text-muted-foreground sm:block"><GlobeIcon className="h-[17px] w-[17px]" /></button><button aria-label="Toggle theme" onClick={toggleTheme} className="ml-3 text-muted-foreground">{dark ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}</button><button aria-label="Open docs menu" onClick={() => setMenuOpen((value) => !value)} className="ml-2 grid h-9 w-9 place-items-center lg:hidden">{menuOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}</button>
      </div>
      {menuOpen && <nav className="absolute inset-x-3 top-[calc(100%+6px)] rounded-xl border border-border bg-elevated p-2 shadow-2xl lg:hidden">{[['Documentation', '/docs'], ['Develop', '/docs/develop'], ['API Reference', '/docs/api'], ['Integrations', '/docs/integrations'], ['Models', '/models']].map(([label, href]) => <a key={href} href={href} className="block rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{label}</a>)}<button onClick={() => { setMenuOpen(false); setSearchOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"><SearchIcon className="h-4 w-4" />Search docs</button></nav>}
      {searchOpen && <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onMouseDown={() => setSearchOpen(false)}><section className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-elevated shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center gap-3 border-b border-border px-4"><SearchIcon className="h-5 w-5 text-muted-foreground" /><input autoFocus placeholder="Search documentation" className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none" /><button aria-label="Close search" onClick={() => setSearchOpen(false)}><CloseIcon className="h-5 w-5 text-muted-foreground" /></button></div><div className="p-2"><p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick links</p>{[['Quick Start', '/docs/develop'], ['Authentication', '/docs/develop/authentication'], ['Models', '/docs/develop/models'], ['API Reference', '/docs/api'], ['Codex WebSocket', '/docs/integrations/codex/websocket'], ['Claude Code', '/docs/integrations/claude-code']].map(([label, href]) => <a key={href} href={href} className="flex items-center rounded-lg px-3 py-2.5 text-sm hover:bg-muted">{label}<span className="ml-auto text-xs text-muted-foreground">↗</span></a>)}</div></section></div>}
    </header>
  );
}
