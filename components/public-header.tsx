'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Brand } from './brand';
import { CloseIcon, GlobeIcon, MenuIcon, MoonIcon, SunIcon } from './icons';

const links = [['Home', '/'], ['Chat', '/console/chat'], ['Image', '/console/image'], ['Model pricing', '/models'], ['Docs', '/docs']] as const;
function isActive(pathname: string, href: string) { return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`); }

export function PublicHeader({ compact = false }: { compact?: boolean }) {
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

  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="page-container flex h-12 items-center md:h-14">
          <a href="/" aria-label="kineticRouter home" className="mr-auto shrink-0"><Brand className="w-[112px] sm:w-[142px]" /></a>
          <div className="hidden h-full items-center gap-8 md:flex">
            {links.map(([label, href]) => {
              const active = isActive(pathname, href);
              return <a key={href} href={href} className={`relative flex h-full items-center text-[13px] font-medium transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}<span className={`absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-transform ${active ? 'scale-x-100' : 'scale-x-0'}`} /></a>;
            })}
            <button aria-label="Switch language" title="English" className="text-muted-foreground transition hover:text-foreground"><GlobeIcon className="h-[17px] w-[17px]" /></button>
            <button aria-label="Toggle color theme" onClick={toggleTheme} className="text-muted-foreground transition hover:text-foreground">{dark ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}</button>
          </div>
          <a href="https://console.kineticrouter.com/sign-in" className="brand-cta ml-3 rounded-lg px-3 py-2 text-[11px] font-semibold shadow-sm sm:ml-5 sm:px-5 sm:text-[13px]">Get started</a>
          <button aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} onClick={() => setMenu((value) => !value)} className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg sm:ml-2 md:hidden">{menu ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}</button>
        </div>
        {menu && (
          <div className="absolute right-3 top-[calc(100%+5px)] w-64 rounded-xl border border-border bg-elevated p-2 shadow-2xl md:hidden">
            {links.map(([label, href]) => <a key={href} href={href} className={`flex rounded-lg px-3 py-2 text-sm font-medium ${isActive(pathname, href) ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{label}</a>)}
            <div className="my-2 border-t border-border" />
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"><GlobeIcon className="h-4 w-4" /> English</button>
            <button onClick={toggleTheme} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">{dark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />} {dark ? 'Light mode' : 'Dark mode'}</button>
          </div>
        )}
      </nav>
      <div aria-hidden="true" style={{ height: compact ? 48 : 56 }} />
    </>
  );
}
