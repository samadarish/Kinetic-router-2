import { useEffect, useId, useRef, type PropsWithChildren, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ open, title, description, children, footer, onClose, wide = false }: PropsWithChildren<{
  open: boolean;
  title: string;
  description?: string;
  footer?: ReactNode;
  onClose(): void;
  wide?: boolean;
}>) {
  const modalRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? []);
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0]!;
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', close);
    const frame = requestAnimationFrame(() => focusable()[0]?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = '';
      window.removeEventListener('keydown', close);
      previousFocus?.focus();
    };
  }, [open]);
  if (!open) return null;
  return <div className="modal-layer" role="presentation">
    <button className="modal-backdrop" tabIndex={-1} aria-label="Close dialog" onClick={onClose} />
    <section ref={modalRef} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="modal-header"><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></header>
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
  return <Modal open={open} title={title} description={description} onClose={onCancel} footer={<><button className="button button-secondary" onClick={onCancel}>Cancel</button><button className={`button ${danger ? 'button-danger' : 'button-primary'}`} disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</button></>}><div className="confirm-note">This action is applied immediately to your Sub2API account.</div></Modal>;
}
