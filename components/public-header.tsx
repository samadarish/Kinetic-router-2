'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Brand } from './brand';
import { CloseIcon, MenuIcon, MoonIcon, SunIcon } from './icons';
import { PublicAccountMenu } from './public-account-menu';
import type { SiteConfig } from '@/data/site-config';

function isActive(pathname: string, href: string) { return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`); }

export function PublicHeader({ content, compact = false }: { content: SiteConfig; compact?: boolean }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDark(document.documentElement.classList.contains('dark'));
    });
    return () => cancelAnimationFrame(frame);
  }, [compact]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    document.documentElement.classList.toggle('light', !next);
    document.documentElement.style.colorScheme = next ? 'dark' : 'light';
    localStorage.setItem('kineticrouter-theme', next ? 'dark' : 'light');
  }

  const links = content.navigation.publicHeader;
  const brand = content.brand;

  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="page-container flex h-12 min-w-0 items-center md:h-14">
          <a href="/" aria-label={`${brand.displayName} home`} className="mr-4 shrink-0"><Brand className="w-[112px] sm:w-[142px]" label={brand.displayName} wordmarkPath={brand.logoWordmarkPath} /></a>
          <div className="public-header-rail hidden min-w-0 flex-1 lg:block">
            <div className="flex h-full min-w-max items-center justify-end gap-8 px-1">
              {links.map((link) => {
                const active = isActive(pathname, link.href);
                return <a key={link.id} href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noreferrer' : undefined} aria-current={active ? 'page' : undefined} className={`relative flex h-full shrink-0 items-center whitespace-nowrap text-[13px] font-medium transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{link.label}<span className={`absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-transform ${active ? 'scale-x-100' : 'scale-x-0'}`} /></a>;
              })}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center lg:ml-5">
            <button type="button" aria-label="Toggle color theme" onClick={toggleTheme} className="grid h-9 w-9 place-items-center text-muted-foreground transition hover:text-foreground">{dark ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}</button>
            <PublicAccountMenu className="ml-1 sm:ml-3" />
            <button type="button" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} onClick={() => setMenu((value) => !value)} className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg sm:ml-2 lg:hidden">{menu ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}</button>
          </div>
        </div>
        {menu && (
          <div className="absolute right-3 top-[calc(100%+5px)] w-64 rounded-xl border border-border bg-elevated p-2 shadow-2xl lg:hidden">
            {links.map((link) => <a key={link.id} href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noreferrer' : undefined} aria-current={isActive(pathname, link.href) ? 'page' : undefined} className={`flex rounded-lg px-3 py-2 text-sm font-medium ${isActive(pathname, link.href) ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{link.label}</a>)}
            <div className="my-2 border-t border-border" />
            <button type="button" onClick={toggleTheme} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">{dark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />} {dark ? 'Light mode' : 'Dark mode'}</button>
          </div>
        )}
      </nav>
      <div aria-hidden="true" style={{ height: compact ? 48 : 56 }} />
    </>
  );
}
