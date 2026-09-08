import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export type RowAction = { label: string; onSelect(): void; disabled?: boolean; danger?: boolean };

export function menuFocusIndex(key: string, current: number, count: number) {
  if (!count) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return (current + 1) % count;
  if (key === 'ArrowUp') return (current - 1 + count) % count;
  return current;
}

export function RowActionsMenu({ label, items, disabled = false }: { label: string; items: RowAction[]; disabled?: boolean }) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<'first' | 'last'>('first');
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  useLayoutEffect(() => {
    if (!open) return;
    if (disabled) { setOpen(false); return; }
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger) return;
    function positionMenu() {
      if (!menu || !trigger) return;
      const anchor = trigger.getBoundingClientRect();
      const bounds = menu.getBoundingClientRect();
      const below = anchor.bottom + 6;
      const top = below + bounds.height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - bounds.height - 6);
      const left = Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8));
      setPosition({ top, left });
    }
    positionMenu();
    const buttons = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
    (initialFocus.current === 'last' ? buttons.item(buttons.length - 1) : buttons.item(0))?.focus();
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!menu?.contains(target) && !trigger?.contains(target)) setOpen(false);
    }
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open, disabled]);

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab') { close(true); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    const current = buttons.findIndex((button) => button === document.activeElement);
    buttons[menuFocusIndex(event.key, current, buttons.length)]?.focus();
  }

  return <>
    <button
      ref={triggerRef} type="button" aria-label={label} title={label} disabled={disabled}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { initialFocus.current = 'first'; setOpen((value) => !value); }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); initialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first'; setOpen(true);
        }
      }}
    ><MoreHorizontal size={17} /></button>
    {open && !disabled && createPortal(<div id={id} ref={menuRef} role="menu" aria-label={label} className="row-actions-menu" style={position} onKeyDown={navigate}>
      {items.map((item) => <button key={item.label} type="button" role="menuitem" tabIndex={-1} disabled={item.disabled} className={item.danger ? 'danger' : undefined} onClick={() => { close(true); item.onSelect(); }}>{item.label}</button>)}
    </div>, document.body)}
  </>;
}
