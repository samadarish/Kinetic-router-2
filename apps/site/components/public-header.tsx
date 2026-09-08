'use client';

import { SiteLink } from './site-link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Brand } from './brand';
import { CloseIcon, MenuIcon, MoonIcon, SunIcon } from './icons';
import { PublicAccountMenu } from './public-account-menu';
import { usePublicSession } from './use-public-session';
import { playgroundDestination } from '@/data/public-session-cache.mjs';
import type { SiteConfig } from '@/data/site-config';
import { applyTheme, writeStoredTheme } from '@kineticrouter/platform-config/theme';

function isActive(pathname: string, href: string) { return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`); }

export function PublicHeader({ content, compact = false }: { content: SiteConfig; compact?: boolean }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(true);
  const header = useRef<HTMLElement>(null);
  const { session, consoleOrigin, playgroundEnabled } = usePublicSession();

  useEffect(() => {
    if (!menu) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); header.current?.querySelector<HTMLButtonElement>('[aria-controls="public-mobile-menu"]')?.focus(); } };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !header.current?.contains(event.target)) setMenu(false); };
    document.addEventListener('keydown', escape); document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside); };
  }, [menu]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDark(document.documentElement.classList.contains('dark'));
    });
    return () => cancelAnimationFrame(frame);
  }, [compact]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    const theme = next ? 'dark' : 'light';
    applyTheme(document.documentElement, theme);
    try { writeStoredTheme(window.localStorage, theme); } catch { /* Storage can be unavailable. */ }
  }

  const links = content.navigation.publicHeader.filter(link => link.id !== 'playground' || playgroundEnabled).map(link => link.id === 'playground' ? { ...link, href: playgroundDestination(consoleOrigin, session) } : link);
  const brand = content.brand;

  return (
    <>
      <nav ref={header} aria-label="Main navigation" className="public-header fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="public-header-inner page-container flex min-w-0 items-center lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <SiteLink href="/" aria-label={`${brand.displayName} home`} className="mr-4 shrink-0 lg:mr-0 lg:justify-self-start"><Brand className="w-[112px] sm:w-[142px]" label={brand.displayName} /></SiteLink>
          <div className="public-header-rail hidden min-w-0 lg:block lg:justify-self-center">
            <div className="public-header-links">
              {links.map((link) => {
                const active = isActive(pathname, link.href);
                return <SiteLink key={link.id} href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noreferrer' : undefined} aria-current={active ? 'page' : undefined} className={`public-header-link relative flex h-full shrink-0 items-center whitespace-nowrap text-[13px] font-medium transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{link.label}<span className={`absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-transform ${active ? 'scale-x-100' : 'scale-x-0'}`} /></SiteLink>;
              })}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center lg:ml-0 lg:justify-self-end">
            <button type="button" aria-label="Toggle color theme" onClick={toggleTheme} className="public-theme-toggle grid h-9 w-9 place-items-center text-muted-foreground transition hover:text-foreground">{dark ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}</button>
            <PublicAccountMenu className="ml-1 sm:ml-3" />
            <button type="button" aria-label={menu ? 'Close menu' : 'Open menu'} aria-controls="public-mobile-menu" aria-expanded={menu} onClick={() => setMenu((value) => !value)} className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg sm:ml-2 lg:hidden">{menu ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}</button>
          </div>
        </div>
        {menu && (
          <div id="public-mobile-menu" className="absolute right-3 top-[calc(100%+5px)] w-64 rounded-xl border border-border bg-elevated p-2 shadow-2xl lg:hidden">
            {links.map((link) => <SiteLink key={link.id} href={link.href} onClick={() => setMenu(false)} target={link.external ? '_blank' : undefined} rel={link.external ? 'noreferrer' : undefined} aria-current={isActive(pathname, link.href) ? 'page' : undefined} className={`public-mobile-link flex rounded-lg px-3 py-2 text-sm font-medium ${isActive(pathname, link.href) ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{link.label}</SiteLink>)}
            <div className="my-2 border-t border-border" />
            <button type="button" onClick={toggleTheme} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">{dark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />} {dark ? 'Light mode' : 'Dark mode'}</button>
          </div>
        )}
      </nav>
      <div aria-hidden="true" className="public-header-spacer" />
    </>
  );
}
