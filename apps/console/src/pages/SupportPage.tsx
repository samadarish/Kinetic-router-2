import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, Check, CheckCheck, ChevronLeft, ChevronRight, CircleCheck, MessageCircle, MessagesSquare, Plus, RotateCcw, Search, Send, Volume2 } from 'lucide-react';
import { SUPPORT_LANGUAGE_CODES, SUPPORT_LANGUAGE_LABELS, type SupportDetail, type SupportLanguage, type SupportMessage, type SupportPresenceMode, type SupportTicket, type SupportTicketPage } from '@kineticrouter/portal-contract';
import { Button, ErrorState, LoadingState } from '../components/Ui';
import { Modal } from '../components/Modal';
import { SupportAvailability, SupportStatusEditor } from '../components/SupportAvailability';
import { WelcomeMessageContent, WelcomeSeenTracker } from '../components/WelcomeMessageContent';
import { RowActionsMenu, type RowAction } from '../components/RowActionsMenu';
import { useSupportImageDraft, SupportImagePicker, SupportMessageImage } from '../components/SupportImageAttachment';
import { jsonBody, portalApi, PortalApiError, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSupport } from '../lib/support-context';
import './support.css';

type SendResult = { ticket: SupportTicket; message: SupportMessage; created: boolean; ownerId: string };
type Draft = { subject: string; preferredLanguage: SupportLanguage; message: string; clientTicketId: string; clientMessageId: string };
type TicketFilter = 'all' | 'open' | 'resolved';

function newDraft(): Draft {
  return { subject: '', preferredLanguage: 'en', message: '', clientTicketId: crypto.randomUUID(), clientMessageId: crypto.randomUUID() };
}

function readDraft(key: string): Draft {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Draft | null;
    if (value && typeof value.subject === 'string' && typeof value.message === 'string'
      && typeof value.clientMessageId === 'string' && typeof value.clientTicketId === 'string') return { ...value, preferredLanguage: SUPPORT_LANGUAGE_CODES.includes(value.preferredLanguage) ? value.preferredLanguage : 'en' };
  } catch { /* Storage may be unavailable in a private browsing session. */ }
  return newDraft();
}

function writeDraft(key: string, value: Draft | null) {
  try {
    if (value) sessionStorage.setItem(key, JSON.stringify(value));
    else sessionStorage.removeItem(key);
  } catch { /* Keep the in-memory draft if browser storage is unavailable. */ }
}

function stamp(value: string, short = false) {
  return new Intl.DateTimeFormat(undefined, short
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function failure(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function supportMessageBody(fields: Record<string, string>, image: { blob: Blob; name: string } | null): RequestInit {
  if (!image) return jsonBody(fields);
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  body.set('image', image.blob, image.name);
  return { body };
}

export function mergeSupportMessages(retained: SupportMessage[], incoming: SupportMessage[]) {
  return [...new Map([...retained, ...incoming].map(message => [message.id, message])).values()]
    .sort((a, b) => a.sequence - b.sequence);
}

export function supportThreadEntries(messages: SupportMessage[]) {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const date = new Date(message.createdAt);
    const previousDate = previous ? new Date(previous.createdAt) : undefined;
    const startsDay = !previousDate || date.getFullYear() !== previousDate.getFullYear()
      || date.getMonth() !== previousDate.getMonth() || date.getDate() !== previousDate.getDate();
    const elapsed = previousDate ? date.getTime() - previousDate.getTime() : 0;
    const startsGroup = startsDay || previous?.sender !== message.sender || elapsed < 0 || elapsed > 5 * 60 * 1000;
    return { message, startsDay, startsGroup };
  });
}

export function supportNotificationActions({ admin, soundEnabled, desktopEnabled, mode = 'automatic', toggleSound, enableDesktop, testSound, setPresence, editStatus }: {
  admin: boolean; soundEnabled: boolean; desktopEnabled: boolean; mode?: SupportPresenceMode;
  toggleSound(): void; enableDesktop(): void; testSound(): void; setPresence(mode: SupportPresenceMode): void; editStatus(): void;
}): RowAction[] {
  return [
    { label: soundEnabled ? 'Mute sound' : 'Enable sound', onSelect: toggleSound },
    { label: desktopEnabled ? 'Turn off desktop alerts' : 'Enable desktop alerts', onSelect: enableDesktop },
    ...(admin ? [
      { label: 'Test sound', onSelect: testSound },
      ...(['automatic', 'online', 'away', 'offline'] as const).map(value => ({
        label: `Availability: ${value[0]!.toUpperCase()}${value.slice(1)}${mode === value ? ' (current)' : ''}`,
        disabled: mode === value, onSelect: () => setPresence(value),
      })),
      { label: 'Edit status', onSelect: editStatus },
    ] : []),
  ];
}

export function supportVisibleTickets(items: SupportTicket[], selected?: SupportTicket, filter: TicketFilter = 'all') {
  // Selection never adds a row excluded by the server's filter, search, or page.
  // A newer detail can remove a just-resolved row before the list refresh finishes.
  return items.map(ticket => selected?.id === ticket.id && Date.parse(selected.updatedAt) > Date.parse(ticket.updatedAt)
    ? { ...selected, unreadCount: ticket.unreadCount } : ticket)
    .filter(ticket => filter === 'all' || ticket.status === filter);
}

export function SupportMessageBubble({ message, admin, customerReadSequence = 0, showAuthor = true, customerLabel = 'Customer', conversationVisible = false }: {
  message: SupportMessage; admin: boolean; customerReadSequence?: number; showAuthor?: boolean; customerLabel?: string; conversationVisible?: boolean;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const own = message.sender === (admin ? 'admin' : 'customer');
  const seen = admin && own && message.sequence <= customerReadSequence;
  return <li className={`support-message${own ? ' support-message-own' : ''}${showAuthor ? '' : ' support-message-continuation'}`} data-sequence={message.sequence} data-incoming={!own || undefined}>
    <span className={showAuthor ? 'support-message-author' : 'support-visually-hidden'}>{own ? 'You' : message.sender === 'admin' ? 'kineticRouter Support' : customerLabel}</span>
    <div ref={bubbleRef} className={`support-message-bubble ${message.image ? 'support-message-with-image' : ''}`}>{message.image && <SupportMessageImage image={message.image} />}{message.kind === 'welcome' ? <WelcomeMessageContent body={message.body} /> : message.body && <span className="support-message-text">{message.body}</span>}</div>
    {!admin && message.kind === 'welcome' && <WelcomeSeenTracker bubbleRef={bubbleRef} ticketId={message.ticketId} messageId={message.id} visible={conversationVisible} />}
    <div className="support-message-meta"><time dateTime={message.createdAt} title={stamp(message.createdAt)} aria-label={stamp(message.createdAt)}>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(message.createdAt))}</time>{admin && own && <span className={seen ? 'support-seen' : ''}>{seen ? <CheckCheck size={13} /> : <Check size={13} />}{seen ? 'Seen' : 'Sent'}</span>}</div>
  </li>;
}

export function SupportPage({ admin = false }: { admin?: boolean }) {
  const support = useSupport();
  const { user } = useAuth();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = params.get('ticket') ?? '';
  const creating = !admin && params.get('new') === '1';
  const [filter, setFilter] = useState<TicketFilter>('open');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [controlError, setControlError] = useState('');
  const [editingStatus, setEditingStatus] = useState(false);
  const [mobileList, setMobileList] = useState(false);
  const newTicketOpener = useRef<HTMLElement | null>(null);
  const statusEditorOpener = useRef<HTMLElement | null>(null);
  const prefix = admin ? '/admin/support' : '/support';
  useEffect(() => { setMobileList(false); }, [selected]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 761px)');
    const showConversation = () => { if (desktop.matches) setMobileList(false); };
    desktop.addEventListener('change', showConversation);
    return () => desktop.removeEventListener('change', showConversation);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const tickets = useQuery({
    queryKey: ['support', 'tickets', admin, filter, debouncedSearch, page],
    queryFn: ({ signal }) => portalApi<SupportTicketPage>(`${prefix}/tickets${queryString({ status: filter, search: debouncedSearch, page })}`, { signal }),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['support', 'detail', admin, selected],
    queryFn: ({ signal }) => portalApi<SupportDetail>(`${prefix}/tickets/${encodeURIComponent(selected)}`, { signal }),
    enabled: Boolean(selected), retry: false,
  });
  const status = useMutation({
    mutationFn: ({ ticketId, status: nextStatus }: { ticketId: string; status: SupportTicket['status'] }) => portalApi<{ status: SupportTicket['status'] }>(`${prefix}/tickets/${encodeURIComponent(ticketId)}`, { method: 'PATCH', ...jsonBody({ status: nextStatus }) }),
    onSuccess: (result, variables) => {
      client.setQueryData<SupportDetail>(['support', 'detail', admin, variables.ticketId], current => current ? { ...current, ticket: { ...current.ticket, status: result.status } } : current);
      client.setQueriesData<SupportTicketPage>({ queryKey: ['support', 'tickets', admin] }, current => current ? { ...current, items: current.items.map(ticket => ticket.id === variables.ticketId ? { ...ticket, status: result.status } : ticket) } : current);
      void client.invalidateQueries({ queryKey: ['support'] });
    },
  });
  function openTicket(id?: string) { setMobileList(false); setParams(id ? { ticket: id } : {}); }
  function createTicket() {
    newTicketOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setParams(current => { const next = new URLSearchParams(current); next.set('new', '1'); return next; });
  }
  function closeNewTicket() { setParams(current => { const next = new URLSearchParams(current); next.delete('new'); return next; }, { replace: true }); }
  function editStatus() {
    statusEditorOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingStatus(true);
  }
  async function control(action: () => Promise<void>) {
    setControlError('');
    try { await action(); } catch (error) { setControlError(failure(error)); }
  }
  const settings = supportNotificationActions({
    admin, soundEnabled: support.soundEnabled, desktopEnabled: support.desktopEnabled, mode: support.presence.mode,
    toggleSound: support.toggleSound, enableDesktop: () => void control(support.enableDesktop),
    testSound: () => void control(support.testSound), setPresence: mode => void control(() => support.setPresence(mode)),
    editStatus,
  });
  const selectedTicket = detail.data?.ticket;
  const visibleTickets = supportVisibleTickets(tickets.data?.items ?? [], selectedTicket, filter);
  const workspaceOpen = Boolean(selected) && !mobileList;
  return <div className="support-page">
    <h1 className="support-visually-hidden">{admin ? 'Support inbox' : 'Support'}</h1>
    {(controlError || support.error) && <p className="support-notice support-notice-error" role="alert">{controlError || support.error}</p>}
    {support.connection !== 'connected' && <div className="support-notice" role="status"><span>{support.connection === 'unavailable' ? 'Live updates are unavailable. Refresh to check for replies.' : support.connection === 'reconnecting' ? 'Reconnecting to live updates…' : 'Connecting to live updates…'}</span>{support.connection === 'unavailable' && <Button variant="ghost" onClick={() => void client.invalidateQueries({ queryKey: ['support'] })}><RotateCcw size={14} />Refresh</Button>}</div>}
    {support.soundEnabled && support.soundBlocked && <div className="support-audio-hint" role="status"><Volume2 size={15} /><span>Allow sound to hear new messages in this browser.</span><button type="button" onClick={() => void control(support.enableSound)}>Allow sound</button></div>}
    <div className={`support-workspace ${workspaceOpen ? 'support-workspace-detail' : ''}`} inert={creating || editingStatus || undefined}>
      <aside className="support-sidebar" aria-label="Tickets">
        <div className="support-list-tools"><label className="support-search"><Search size={16} aria-hidden="true" /><input value={search} maxLength={160} onChange={event => setSearch(event.target.value)} placeholder={admin ? 'Search conversations' : 'Search your tickets'} aria-label="Search tickets" /></label>
          {!admin && <div className="support-customer-actions"><SupportAvailability presence={support.presence} connection={support.connection} disabled={creating} /><Button variant="secondary" className="support-new-ticket-button" onClick={createTicket}><Plus size={14} />New ticket</Button></div>}
          {admin && <Link className="support-welcome-report-link" to="/admin/support/welcome"><MessagesSquare size={15} aria-hidden="true" />Welcome messages</Link>}
          <div className="support-filter-row"><div className="support-filters" aria-label="Ticket status">{(['all', 'open', 'resolved'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); }}>{value === 'all' ? 'All' : value === 'open' ? 'Open' : 'Resolved'}</button>)}</div><div className="support-settings"><RowActionsMenu label="Support settings" items={settings} /></div></div>
        </div>
        <div className="support-ticket-scroll" aria-busy={tickets.isFetching}>
          {visibleTickets.length > 0 && <ul className="support-ticket-list">{visibleTickets.map(ticket => {
            const active = selected === ticket.id;
            const owner = ticket.ownerLabel || ticket.ownerEmail || 'Customer';
            return <li key={ticket.id} className={`support-ticket-row${active ? ' support-ticket-active' : ''}`}>
              <button type="button" className="support-ticket" aria-current={active ? 'page' : undefined} aria-describedby={`support-ticket-status-${ticket.id} support-ticket-count-${ticket.id}${ticket.unreadCount > 0 ? ` support-ticket-unread-${ticket.id}` : ''}`} onClick={() => openTicket(ticket.id)}>
                <span className="support-ticket-top"><strong>{ticket.subject}</strong><time dateTime={ticket.updatedAt} title={stamp(ticket.updatedAt)}>{stamp(ticket.updatedAt, true)}</time></span>
                {admin && <span className="support-ticket-owner"><span>{owner}</span>{ticket.ownerEmail && ticket.ownerEmail.toLowerCase() !== owner.toLowerCase() && <span>{ticket.ownerEmail}</span>}</span>}
                {active && admin && <span className="support-ticket-language">Preferred language: {SUPPORT_LANGUAGE_LABELS[ticket.preferredLanguage ?? 'en']}</span>}
              </button>
              <div className="support-ticket-footer">
                <span id={`support-ticket-status-${ticket.id}`} className={`support-ticket-status support-ticket-status-${ticket.status}`}>{ticket.status === 'resolved' ? <CircleCheck size={12} /> : <MessageCircle size={12} />}{ticket.status === 'resolved' ? 'Resolved' : 'Open'}</span>
                <div className="support-ticket-footer-actions">
                  <span id={`support-ticket-count-${ticket.id}`} className="support-ticket-count" aria-label={`${ticket.messageCount} ${ticket.messageCount === 1 ? 'message' : 'messages'}`} title={`${ticket.messageCount} ${ticket.messageCount === 1 ? 'message' : 'messages'}`}><MessagesSquare size={12} aria-hidden="true" />{ticket.messageCount}</span>
                  {ticket.unreadCount > 0 && <span id={`support-ticket-unread-${ticket.id}`} className="support-unread" aria-label={`${ticket.unreadCount} unread messages`}>{ticket.unreadCount > 99 ? '99+' : ticket.unreadCount}</span>}
                  {active && admin && <Button variant="ghost" disabled={status.isPending && status.variables.ticketId === ticket.id} onClick={() => status.mutate({ ticketId: ticket.id, status: ticket.status === 'resolved' ? 'open' : 'resolved' })}>{ticket.status === 'resolved' ? <RotateCcw size={14} /> : <CircleCheck size={14} />}{status.isPending && status.variables.ticketId === ticket.id ? 'Updating…' : ticket.status === 'resolved' ? 'Reopen' : 'Resolve'}</Button>}
                </div>
              </div>
              {active && status.error && status.variables.ticketId === ticket.id && <p className="support-ticket-action-error" role="alert">{failure(status.error)} Try again.</p>}
            </li>;
          })}</ul>}
          {tickets.isLoading ? <LoadingState label="Loading tickets" /> : tickets.error ? <ErrorState error={tickets.error} retry={() => void tickets.refetch()} /> : !visibleTickets.length && <div className="support-list-empty"><strong>{search.trim() ? 'No matching tickets' : filter === 'open' ? 'No open tickets' : filter === 'resolved' ? 'No resolved tickets' : 'No tickets yet'}</strong><p>{search.trim() ? 'Try another search.' : filter === 'resolved' ? 'Resolved tickets will appear here.' : admin ? 'New customer tickets will appear here.' : 'Create a new ticket if you need help.'}</p></div>}
        </div>
        {tickets.data && (page > 1 || tickets.data.total > tickets.data.items.length) && <nav className="support-pagination" aria-label="Ticket pages"><Button variant="ghost" disabled={page <= 1 || tickets.isFetching} onClick={() => setPage(value => value - 1)} aria-label="Previous ticket page"><ChevronLeft size={16} /></Button><span>Page {page}</span><Button variant="ghost" disabled={tickets.isFetching || page * 30 >= tickets.data.total} onClick={() => setPage(value => value + 1)} aria-label="Next ticket page"><ChevronRight size={16} /></Button></nav>}
      </aside>
      <section className="support-conversation" aria-label="Conversation">
        {selected && <div className="support-mobile-toolbar"><Button variant="ghost" className="support-mobile-back" onClick={() => setMobileList(true)} aria-label="Back to tickets"><ArrowLeft size={16} />Back to tickets</Button><div className="support-settings"><RowActionsMenu label="Support settings" items={settings} /></div></div>}
        {selected ? <TicketConversation key={`${admin}:${user?.id}:${selected}`} admin={admin} ticketId={selected} detail={detail} visible={workspaceOpen && !creating && !editingStatus} draftKey={`kinetic-support-draft:${user?.id}:${admin ? 'admin' : 'customer'}:${selected}`} />
          : <div className="support-welcome"><h2>Select a ticket</h2><p>{admin ? 'Choose a ticket on the left to view the conversation.' : 'Choose a ticket or create a new one to get help.'}</p></div>}
      </section>
    </div>
    {!admin && <NewTicket key={`new:${user?.id}`} open={creating} returnFocusRef={newTicketOpener} draftKey={`kinetic-support-draft:${user?.id}:customer:new`} onBack={closeNewTicket} onCreated={id => openTicket(id)} />}
    {admin && editingStatus && <SupportStatusEditor initialValue={support.presence.statusText ?? ''} onSave={support.setStatusText} onClose={() => setEditingStatus(false)} returnFocusRef={statusEditorOpener} />}
  </div>;
}

function NewTicket({ open, returnFocusRef, draftKey, onBack, onCreated }: { open: boolean; returnFocusRef: RefObject<HTMLElement | null>; draftKey: string; onBack: () => void; onCreated: (id: string) => void }) {
  const client = useQueryClient();
  const { user } = useAuth();
  const [draft, setDraft] = useState(() => readDraft(draftKey));
  const subjectInput = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  const attachment = useSupportImageDraft(draftKey, String(user?.id ?? ''), () => {
    const next = { ...draft, clientMessageId: crypto.randomUUID(), clientTicketId: crypto.randomUUID() };
    setDraft(next); writeDraft(draftKey, next);
    send.reset();
  });
  const send = useMutation({
    mutationFn: () => portalApi<SendResult>('/support/tickets', { method: 'POST', ...supportMessageBody(draft, attachment.image) }),
    onSuccess: async result => { setDraft(newDraft()); writeDraft(draftKey, null); await attachment.clear(); void client.invalidateQueries({ queryKey: ['support'] }); onCreated(result.ticket.id); },
    onSettled: () => { sending.current = false; },
  });
  function change(field: 'subject' | 'message' | 'preferredLanguage', value: string) {
    if (field === 'preferredLanguage' && !SUPPORT_LANGUAGE_CODES.includes(value as SupportLanguage)) return;
    const next = { ...draft, [field]: value, clientMessageId: crypto.randomUUID(), clientTicketId: crypto.randomUUID() };
    setDraft(next); writeDraft(draftKey, next); send.reset();
  }
  function close() { if (!sending.current) onBack(); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || send.isPending || attachment.busy || !draft.subject.trim() || (!draft.message.trim() && !attachment.image)) return;
    sending.current = true; send.mutate();
  }
  return <Modal open={open} title="New ticket" wide onClose={close} dismissDisabled={send.isPending} initialFocusRef={subjectInput} returnFocusRef={returnFocusRef}>
    <form className="support-new-ticket" onSubmit={submit}>
      <label className="field"><span>Subject</span><input ref={subjectInput} className="field-input" aria-label="Subject" value={draft.subject} required maxLength={160} disabled={send.isPending} onChange={event => change('subject', event.target.value)} placeholder="What can we help with?" /></label>
      <label className="field"><span>Preferred language</span><select className="field-select" aria-label="Preferred language" value={draft.preferredLanguage} disabled={send.isPending} onChange={event => change('preferredLanguage', event.target.value)}>{SUPPORT_LANGUAGE_CODES.map(code => <option key={code} value={code}>{SUPPORT_LANGUAGE_LABELS[code]}</option>)}</select></label>
      <label className="field support-new-message"><span>Message</span><textarea className="field-textarea" aria-label="Message" value={draft.message} required={!attachment.image} maxLength={10000} disabled={send.isPending} onChange={event => change('message', event.target.value)} onPaste={event => { if (!sending.current) attachment.onPaste(event); }} placeholder="Describe your question, or paste a screenshot…" rows={6} /></label>
      <SupportImagePicker attachment={attachment} disabled={send.isPending} />
      {(draft.subject || draft.message || attachment.image || draft.preferredLanguage !== 'en') && <p className="support-draft-hint">Your draft is saved in this tab until you send it.</p>}
      {send.error && <p className="support-notice support-notice-error" role="alert">{failure(send.error)} Your draft is saved; try sending again.</p>}
      <div className="support-new-actions"><Button type="button" variant="secondary" onClick={close} disabled={send.isPending}>Cancel</Button><Button disabled={send.isPending || attachment.busy || !draft.subject.trim() || (!draft.message.trim() && !attachment.image)}><Send size={15} />{send.isPending ? 'Sending…' : send.error ? 'Try again' : 'Create ticket'}</Button></div>
    </form>
  </Modal>;
}

function TicketConversation({ admin, ticketId, draftKey, detail, visible }: { admin: boolean; ticketId: string; draftKey: string; detail: UseQueryResult<SupportDetail, Error>; visible: boolean }) {
  const prefix = admin ? '/admin/support' : '/support';
  const customerReadOnly = !admin && detail.data?.ticket.status === 'resolved';
  const client = useQueryClient();
  const { user } = useAuth();
  const queryKey = ['support', 'detail', admin, ticketId];
  const [draft, setDraft] = useState(() => readDraft(draftKey));
  const textarea = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  const attachment = useSupportImageDraft(draftKey, String(user?.id ?? ''), () => {
    const next = { ...draft, clientMessageId: crypto.randomUUID() };
    setDraft(next); writeDraft(draftKey, next);
    reply.reset();
  });
  const [retainedMessages, setRetainedMessages] = useState<SupportMessage[]>([]);
  const [earlierCursor, setEarlierCursor] = useState<number | null | undefined>(undefined);
  const [olderError, setOlderError] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newMessages, setNewMessages] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previousLatest = useRef(0);
  const prependHeight = useRef<number | null>(null);
  const readThrough = useRef(0);
  const reading = useRef(false);
  const messages = useMemo(() => mergeSupportMessages(retainedMessages, detail.data?.messages ?? []), [retainedMessages, detail.data?.messages]);
  // The detail endpoint returns only the newest page. Retain every page already
  // displayed so incoming messages cannot shift older conversation history away.
  useEffect(() => {
    if (detail.data?.messages) setRetainedMessages(current => mergeSupportMessages(current, detail.data!.messages));
  }, [detail.data?.messages]);
  const nextBefore = earlierCursor === undefined ? detail.data?.nextBefore : earlierCursor;
  const reply = useMutation({
    mutationFn: () => portalApi<SendResult>(`${prefix}/tickets/${encodeURIComponent(ticketId)}/messages`, { method: 'POST', ...supportMessageBody({ clientMessageId: draft.clientMessageId, message: draft.message }, admin ? null : attachment.image) }),
    onSuccess: async result => {
      const next = newDraft(); setDraft(next); writeDraft(draftKey, null); nearBottom.current = true;
      await attachment.clear();
      client.setQueryData<SupportDetail>(queryKey, current => current ? { ...current, ticket: result.ticket, messages: [...current.messages.filter(message => message.id !== result.message.id), result.message] } : current);
      void client.invalidateQueries({ queryKey: ['support'] });
    },
    onError: error => {
      if (error instanceof PortalApiError && error.code === 'SUPPORT_TICKET_RESOLVED') {
        client.setQueryData<SupportDetail>(queryKey, current => current ? { ...current, ticket: { ...current.ticket, status: 'resolved' } } : current);
        void client.invalidateQueries({ queryKey: ['support'] });
      }
    },
    onSettled: () => { sending.current = false; },
  });
  useEffect(() => {
    if (!customerReadOnly && reply.error instanceof PortalApiError && reply.error.code === 'SUPPORT_TICKET_RESOLVED') reply.reset();
  }, [customerReadOnly, reply.error, reply.reset]);
  useLayoutEffect(() => {
    const node = textarea.current;
    if (!node) return;
    const resize = () => {
      if (!node.getClientRects().length) return;
      node.style.height = '0px';
      node.style.height = `${Math.min(120, node.scrollHeight + 2)}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    // Portal navigation can continue changing the available width after a
    // window resize. Measure the final wrapping without observing our height.
    const parent = node.parentElement;
    let width = parent?.getBoundingClientRect().width;
    let frame = 0;
    const observer = typeof ResizeObserver === 'undefined' || !parent ? undefined : new ResizeObserver(() => {
      const nextWidth = parent.getBoundingClientRect().width;
      if (nextWidth !== width) {
        width = nextWidth;
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(resize);
      }
    });
    if (parent) observer?.observe(parent);
    return () => { window.removeEventListener('resize', resize); window.cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [draft.message, detail.isSuccess, visible, customerReadOnly]);
  function scrollBottom() {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
    nearBottom.current = true; setNewMessages(false);
  }
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!visible || !node || !messages.length) return;
    if (prependHeight.current !== null) { node.scrollTop += node.scrollHeight - prependHeight.current; prependHeight.current = null; }
    else if (nearBottom.current) scrollBottom();
    else if (messages.at(-1)!.sequence > previousLatest.current) setNewMessages(true);
    previousLatest.current = messages.at(-1)!.sequence;
  }, [messages, visible]);
  useEffect(() => {
    const node = scroller.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      // Keep the latest reply visible when the viewport changes, while leaving
      // customers who are reading earlier messages at their chosen position.
      if (nearBottom.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [detail.isSuccess]);
  useEffect(() => {
    const node = scroller.current;
    if (!visible || !node || typeof IntersectionObserver === 'undefined') return;
    const visibleSequences = new Set<number>();
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function acknowledge() {
      if (disposed || reading.current || document.visibilityState !== 'visible' || !document.hasFocus() || !node!.getClientRects().length || !visibleSequences.size) return;
      const sequence = Math.max(...visibleSequences);
      if (sequence <= readThrough.current) return;
      reading.current = true;
      try {
        await portalApi(`${prefix}/tickets/${encodeURIComponent(ticketId)}/read`, { method: 'POST', ...jsonBody({ sequence }) });
        if (!disposed) { readThrough.current = sequence; void client.invalidateQueries({ queryKey: ['support', 'tickets'] }); void client.invalidateQueries({ queryKey: ['support', 'summary'] }); }
      } catch { /* Reading should never interrupt a conversation. Retry while visible. */ }
      finally { reading.current = false; }
    }
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void acknowledge(), 350); };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const sequence = Number((entry.target as HTMLElement).dataset.sequence);
        if (entry.isIntersecting && entry.intersectionRect.height >= Math.min(70, entry.boundingClientRect.height)) visibleSequences.add(sequence);
        else visibleSequences.delete(sequence);
      }
      schedule();
    }, { root: node, threshold: [0, .25, .5, .75, 1] });
    node.querySelectorAll('[data-incoming]').forEach(message => observer.observe(message));
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', schedule);
    const retry = window.setInterval(schedule, 10_000);
    return () => { disposed = true; clearTimeout(timer); window.clearInterval(retry); observer.disconnect(); window.removeEventListener('focus', schedule); document.removeEventListener('visibilitychange', schedule); };
  }, [messages, prefix, ticketId, client, visible]);
  async function loadEarlier() {
    if (loadingOlder || nextBefore == null) return;
    setLoadingOlder(true); setOlderError('');
    try {
      const result = await portalApi<SupportDetail>(`${prefix}/tickets/${encodeURIComponent(ticketId)}${queryString({ before: nextBefore })}`);
      prependHeight.current = scroller.current?.scrollHeight ?? null;
      setRetainedMessages(current => mergeSupportMessages(current, result.messages)); setEarlierCursor(result.nextBefore);
    } catch (error) { setOlderError(failure(error)); }
    finally { setLoadingOlder(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (customerReadOnly || sending.current || reply.isPending || (!admin && attachment.busy) || (!draft.message.trim() && (admin || !attachment.image))) return;
    // Focus once at submission, so later responses cannot steal focus after
    // someone opens settings or moves to another conversation.
    if (textarea.current?.getClientRects().length) textarea.current.focus({ preventScroll: true });
    sending.current = true;
    reply.mutate();
  }
  if (detail.isLoading) return <LoadingState label="Loading conversation" />;
  if (detail.error || !detail.data) return <ErrorState error={detail.error} retry={() => void detail.refetch()} />;
  const ticket = detail.data.ticket;
  return <>
    <div className="support-message-area"><div className="support-message-scroll" ref={scroller} tabIndex={0} aria-label="Message history" onScroll={() => { const node = scroller.current; if (node) { nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90; if (nearBottom.current) setNewMessages(false); } }}>
      {nextBefore != null && <div className="support-earlier"><Button variant="ghost" disabled={loadingOlder} onClick={() => void loadEarlier()}>{loadingOlder ? 'Loading…' : 'Load earlier messages'}</Button></div>}
      {olderError && <p className="support-notice support-notice-error" role="alert">{olderError} <button type="button" onClick={() => void loadEarlier()}>Try again</button></p>}
      <ol className="support-messages" aria-label="Messages">{supportThreadEntries(messages).map(({ message, startsDay, startsGroup }) => <Fragment key={message.id}>
        {startsDay && <li className="support-date-divider"><time dateTime={message.createdAt}>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(message.createdAt))}</time></li>}
        <SupportMessageBubble message={message} admin={admin} customerReadSequence={ticket.customerReadSequence} showAuthor={startsGroup} customerLabel={ticket.ownerLabel || ticket.ownerEmail || 'Customer'} conversationVisible={visible} />
      </Fragment>)}</ol>
    </div>{newMessages && <Button variant="secondary" className="support-jump" onClick={scrollBottom}><ArrowDown size={14} />New messages</Button>}</div>
    {customerReadOnly ? <div className="support-composer"><p className="support-resolved-note" role="status"><CircleCheck size={14} />This ticket is resolved. Create a new ticket for more help.</p></div> : <form className="support-composer" onSubmit={submit}>
      {ticket.status === 'resolved' && <p className="support-resolved-note"><CircleCheck size={14} />This ticket is resolved. Reopen it if more help is needed.</p>}
      {reply.error && <p className="support-notice support-notice-error" role="alert">{failure(reply.error)} Your message is saved. Try sending again.</p>}
      <div className="support-compose-row"><label className="support-compose-label"><span className="support-visually-hidden">Your message</span><textarea ref={textarea} className="field-textarea" aria-label="Your message" placeholder="Write a message…" rows={1} maxLength={10000} required={admin || !attachment.image} readOnly={reply.isPending} aria-busy={reply.isPending || undefined} value={draft.message} onPaste={admin ? undefined : event => { if (!sending.current) attachment.onPaste(event); }} onChange={event => { const next = { ...draft, message: event.target.value, clientMessageId: crypto.randomUUID() }; setDraft(next); writeDraft(draftKey, next); reply.reset(); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /></label><Button disabled={reply.isPending || (!admin && attachment.busy) || (!draft.message.trim() && (admin || !attachment.image))}><Send size={15} />{reply.isPending ? 'Sending…' : reply.error ? 'Try again' : 'Send'}</Button></div>
      <div className="support-compose-actions">{!admin && <SupportImagePicker attachment={attachment} disabled={reply.isPending} />}<span className="support-compose-hint"><span className="support-key-hint">Enter to send · Shift + Enter for a new line</span>{(draft.message || attachment.image) && <span className="support-mobile-hint">Your draft is saved</span>}</span></div>
    </form>}
  </>;
}
