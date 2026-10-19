'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { SUPPORTED_LOCALES } from '@kineticrouter/platform-config/locale';
import { useLocale } from '@kineticrouter/i18n/react';

export function LanguageSelector({ className = '' }: { className?: string }) {
  const { requestedLocale, setLocale, t, pending, error, retry } = useLocale();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [availableHeight, setAvailableHeight] = useState(530);
  const [horizontalOffset, setHorizontalOffset] = useState(0);
  const label = SUPPORTED_LOCALES.find(item => item.code === requestedLocale)?.label ?? 'English';

  useEffect(() => {
    if (!open) return;
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      setAvailableHeight(Math.max(120, window.innerHeight - (anchor?.bottom ?? 0) - 16));
      setHorizontalOffset(Math.max(0, 12 - ((anchor?.right ?? 0) - Math.min(280, window.innerWidth - 24))));
    };
    position();
    const selected = menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    selected?.focus();
    selected?.scrollIntoView?.({ block: 'nearest' });
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', position);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', position); };
  }, [open]);

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') { setOpen(false); return; }
    const buttons = [...menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
    if (event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (event.key.length === 1 && /\p{L}/u.test(event.key)) {
      for (let offset = 1; offset <= buttons.length; offset++) {
        const index = (current + offset) % buttons.length;
        if (buttons[index]?.textContent?.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())) { next = index; break; }
      }
    }
    if (next >= 0) { event.preventDefault(); buttons[next]?.focus(); }
  }

  return <div ref={root} className={`language-selector ${className}`}>
    <button ref={trigger} type="button" className="language-trigger" aria-label={`${t('chooseLanguage')}: ${label}`} title={t('chooseLanguage')} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 8 6 6m-7 0 6-6 2-4M2 4h12M7 2v2m7 18 5-11 5 11m-8-4h6" transform="translate(-1 0)" /></svg>
    </button>
    {open && <div ref={menu} id={id} className="language-dropdown" role="menu" aria-label={t('chooseLanguage')} style={{ maxHeight: availableHeight, transform: `translateX(${horizontalOffset}px)` }} onKeyDown={navigate}>
      {SUPPORTED_LOCALES.map(item => <button key={item.code} type="button" role="menuitemradio" aria-checked={requestedLocale === item.code} tabIndex={-1} lang={item.code} translate="no" onClick={() => { setLocale(item.code); setOpen(false); trigger.current?.focus(); }}>
        <span>{item.label}</span><span className="language-selected" aria-hidden="true">{requestedLocale === item.code ? '✓' : ''}</span>
      </button>)}
    </div>}
    <span className="language-status" role="status">{pending ? t('loadingLanguage') : ''}</span>
    {error && <div className="language-error" role="alert">{t('languageLoadFailed')} <button type="button" onClick={retry}>{t('retry')}</button></div>}
  </div>;
}
