import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { SupportPresence } from '@kineticrouter/portal-contract';
import { Modal } from './Modal';
import { Button } from './Ui';

type Connection = 'connecting' | 'connected' | 'reconnecting' | 'unavailable';

export function SupportAvailability({ presence, connection, disabled = false }: { presence: SupportPresence; connection: Connection; disabled?: boolean }) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shown = !disabled && !dismissed && (hovered || focused || pinned);
  const [position, setPosition] = useState<{ left: number; top: number; arrow: number; side: 'above' | 'below' } | null>(null);
  const status = connection === 'connected' ? presence.status : 'unavailable';
  const label = status === 'online' ? 'Support is online' : status === 'away' ? 'Support is away' : status === 'offline' ? 'Support is offline' : 'Support status unavailable';
  const fallback = status === 'online' ? 'We are online and ready to help.'
    : status === 'away' ? 'We are away right now. Leave a message and we will get back to you.'
    : status === 'offline' ? 'We are offline right now. Leave a message and we will get back to you.'
    : connection === 'connecting' || connection === 'reconnecting' ? 'Connecting to support. Availability will update when the connection returns.'
    : 'We cannot check support availability right now. You can still leave a message.';
  const text = connection === 'connected' ? presence.statusText?.trim() || fallback : fallback;
  const lastSeenDate = presence.lastSeenAt ? new Date(presence.lastSeenAt) : undefined;
  const lastSeen = lastSeenDate && Number.isFinite(lastSeenDate.getTime()) ? lastSeenDate : undefined;
  const showLastSeen = status === 'away' || status === 'offline';

  function clearTimers() { clearTimeout(hoverTimer.current); clearTimeout(leaveTimer.current); }
  function dismiss() { clearTimers(); setDismissed(true); setHovered(false); setPinned(false); }
  function enter() {
    clearTimers(); setDismissed(false);
    hoverTimer.current = setTimeout(() => setHovered(true), 400);
  }
  function leave() {
    clearTimers();
    leaveTimer.current = setTimeout(() => setHovered(false), 120);
  }
  useEffect(() => () => { clearTimeout(hoverTimer.current); clearTimeout(leaveTimer.current); }, []);

  useLayoutEffect(() => {
    if (!shown) { setPosition(null); return; }
    const place = () => {
      const anchor = trigger.current, panel = tooltip.current;
      if (!anchor || !panel) return;
      if (!anchor.getClientRects().length || anchor.closest('[inert]')) { dismiss(); return; }
      const target = anchor.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
      const margin = 8, gap = 10;
      const left = Math.max(margin, Math.min(target.left + target.width / 2 - bounds.width / 2, innerWidth - bounds.width - margin));
      const above = target.top - bounds.height - gap >= margin;
      const top = Math.max(margin, Math.min(above ? target.top - bounds.height - gap : target.bottom + gap, innerHeight - bounds.height - margin));
      setPosition({ left, top, arrow: Math.max(12, Math.min(target.left + target.width / 2 - left, bounds.width - 12)), side: above ? 'above' : 'below' });
    };
    place();
    const resize = new ResizeObserver(place);
    if (trigger.current) resize.observe(trigger.current);
    if (tooltip.current) resize.observe(tooltip.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { resize.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [shown, text, presence.lastSeenAt, status]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    const outside = (event: PointerEvent) => { if (shown && event.target instanceof Node && !container.current?.contains(event.target) && !tooltip.current?.contains(event.target)) dismiss(); };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside); };
  }, [shown]);

  const explanation = <div ref={tooltip} id={id} role="tooltip" className="support-availability-tooltip" hidden={!shown} data-side={position?.side ?? 'above'}
    style={position ? { left: position.left, top: position.top, '--support-tooltip-arrow': `${position.arrow}px` } as CSSProperties : { visibility: 'hidden' }}
    onPointerEnter={() => { clearTimers(); setHovered(true); }} onPointerLeave={leave}>
    <span>{text}</span>
    {showLastSeen && <span className="support-availability-last-seen">{lastSeen ? <>Last seen <time dateTime={lastSeen.toISOString()}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(lastSeen)}</time></> : 'Last seen unavailable'}</span>}
  </div>;

  return <div ref={container} className="support-availability" onPointerEnter={event => { if (event.pointerType !== 'touch') enter(); }} onPointerLeave={leave}>
    <button ref={trigger} disabled={disabled} type="button" className={`support-availability-button support-availability-${status}`} aria-label={label} aria-expanded={shown} aria-describedby={shown ? id : undefined}
      onFocus={() => { clearTimers(); setFocused(true); setDismissed(false); }} onBlur={() => { setFocused(false); setPinned(false); }}
      onClick={() => { setPinned(!pinned); setDismissed(pinned); }}>
      <span className="support-availability-dot" aria-hidden="true" /><span className="support-availability-label">{label}</span>
    </button>
    {shown ? createPortal(explanation, document.body) : explanation}
  </div>;
}

export function SupportStatusEditor({ initialValue, onSave, onClose, returnFocusRef }: { initialValue: string; onSave(text: string): Promise<void>; onClose(): void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  const [text, setText] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const helpId = useId();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || text.length > 160) return;
    sending.current = true; setBusy(true); setError('');
    try { await onSave(text.trim()); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save your status. Try again.'); }
    finally { sending.current = false; setBusy(false); }
  }
  function close() { if (!sending.current) onClose(); }
  return <Modal open title="Edit status" description="Add a short message customers see with your availability." initialFocusRef={input} returnFocusRef={returnFocusRef} dismissDisabled={busy} onClose={close}>
    <form className="support-status-editor" onSubmit={submit}>
      <label className="field"><span>Status message</span><textarea ref={input} className="field-textarea" aria-label="Status message" aria-describedby={helpId} value={text} maxLength={160} disabled={busy} rows={3} onChange={event => { setText(event.target.value); setError(''); }} placeholder="For example, Back at 3 PM." /></label>
      <div id={helpId} className="support-status-help"><span>Leave blank to use the default message.</span><span>{text.length}/160</span></div>
      {error && <p className="support-notice support-notice-error" role="alert">{error}</p>}
      <div className="support-new-actions"><Button type="button" variant="secondary" onClick={close} disabled={busy}>Cancel</Button><Button disabled={busy || text.length > 160}>{busy ? 'Saving…' : 'Save status'}</Button></div>
    </form>
  </Modal>;
}
