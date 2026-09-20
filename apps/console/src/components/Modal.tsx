import { useEffect, useId, useRef, type PropsWithChildren, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';

export function Modal({ open, title, description, children, footer, onClose, wide = false, dismissDisabled = false, initialFocusRef, returnFocusRef }: PropsWithChildren<{
  open: boolean;
  title: string;
  description?: string;
  footer?: ReactNode;
  onClose(): void;
  wide?: boolean;
  dismissDisabled?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}>) {
  const modalRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const dismissDisabledRef = useRef(dismissDisabled);
  const titleId = useId();
  closeRef.current = onClose;
  dismissDisabledRef.current = dismissDisabled;
  useEffect(() => {
    if (!open) return;
    const previousFocus = returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const focusable = () => Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? []);
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!dismissDisabledRef.current) closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); modalRef.current?.focus({ preventScroll: true }); return; }
      const first = items[0]!;
      const last = items.at(-1)!;
      if (document.activeElement === modalRef.current || !modalRef.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', close);
    const frame = requestAnimationFrame(() => (initialFocusRef?.current ?? focusable()[0])?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', close);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open, initialFocusRef, returnFocusRef]);
  if (!open) return null;
  return <div className="modal-layer" role="presentation">
    <button className="modal-backdrop" tabIndex={-1} aria-label="Close dialog" disabled={dismissDisabled} onClick={onClose} />
    <section ref={modalRef} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={dismissDisabled || undefined} tabIndex={-1}>
      <header className="modal-header"><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" aria-label="Close dialog" disabled={dismissDisabled} onClick={onClose}><X size={18} /></button></header>
      <div className="modal-content">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </section>
  </div>;
}

export function ConfirmDialog({ open, title, description, confirmLabel, danger = false, busy = false, onCancel, onConfirm }: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  return <Modal open={open} title={title} description={description} onClose={onCancel} footer={<><button className="button button-secondary" onClick={onCancel}>Cancel</button><button className={`button ${danger ? 'button-danger' : 'button-primary'}`} disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</button></>}><div className="confirm-note">This action takes effect immediately.</div></Modal>;
}
