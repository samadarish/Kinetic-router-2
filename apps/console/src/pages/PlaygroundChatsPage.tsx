import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminConversation, ConversationDetail, ConversationPage } from '@kineticrouter/portal-contract';
import { Button, ErrorState, PageHeader } from '../components/Ui';
import { Modal } from '../components/Modal';
import { PlaygroundMessage } from '../components/PlaygroundMessage';
import { portalApi, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import { conversationMessages } from '../lib/playground-conversations';
import './playground.css';
import './playground-chats.css';

export function PlaygroundChatsPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [model, setModel] = useState('');
  const [filters, setFilters] = useState({ search: '', model: '', deleted: 'all', start: '', end: '' });
  const [selected, setSelected] = useState<string | null>(null);
  const [earlier, setEarlier] = useState<ConversationDetail<AdminConversation>['turns']>([]);
  const [before, setBefore] = useState<number | null>(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const timer = setTimeout(() => setFilters(current => ({ ...current, search, model })), 300); return () => clearTimeout(timer); }, [search, model]);
  const root = ['admin', 'playground-chats', user?.id];
  const list = useInfiniteQuery({
    queryKey: [...root, 'list', filters], initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) => portalApi<ConversationPage<AdminConversation>>(`/admin/playground/conversations${queryString({ ...filters, cursor: pageParam })}`, { signal }),
    getNextPageParam: page => page.nextCursor ?? undefined, staleTime: 15_000,
  });
  const detail = useQuery({
    queryKey: [...root, 'detail', selected], enabled: Boolean(selected),
    queryFn: ({ signal }) => portalApi<ConversationDetail<AdminConversation>>(`/admin/playground/conversations/${selected}`, { signal }),
    refetchInterval: query => query.state.data?.conversation.active ? 5_000 : false,
    refetchIntervalInBackground: false, staleTime: 0,
  });
  const chat = detail.data?.conversation;
  const rows = useMemo(() => list.data?.pages.flatMap(page => page.items) ?? [], [list.data]);
  const messages = useMemo(() => {
    if (!detail.data) return [];
    const seen = new Set<string>();
    const turns = [...earlier, ...detail.data.turns].filter(turn => {
      if (seen.has(turn.id)) return false;
      seen.add(turn.id); return true;
    }).sort((a, b) => a.sequence - b.sequence);
    return conversationMessages({ ...detail.data, turns });
  }, [detail.data, earlier]);
  function open(id: string) { setSelected(id); setEarlier([]); setBefore(null); setError(''); }
  async function loadOlder() {
    if (!selected || olderBusy) return;
    const id = selected, cursor = before ?? detail.data?.nextBefore;
    if (!cursor) return;
    setOlderBusy(true); setError('');
    try {
      const page = await portalApi<ConversationDetail<AdminConversation>>(`/admin/playground/conversations/${id}${queryString({ before: cursor })}`);
      // This action runs in the selected inspector; switching is disabled until it settles.
      setEarlier(current => [...page.turns, ...current]); setBefore(page.nextBefore ?? 0);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Earlier messages could not be loaded.'); }
    finally { setOlderBusy(false); }
  }
  async function purge() {
    if (!chat?.deletedAt || purging) return;
    const id = chat.id; setPurging(true); setError('');
    try {
      await portalApi(`/admin/playground/conversations/${id}`, { method: 'DELETE' });
      client.removeQueries({ queryKey: [...root, 'detail', id] });
      setSelected(null); setEarlier([]); setPurgeOpen(false);
      await client.invalidateQueries({ queryKey: [...root, 'list'] });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The chat could not be permanently deleted.'); }
    finally { setPurging(false); }
  }
  return <>
    <PageHeader title="Playground chats" description="Inspect submitted conversations. This view cannot send or edit messages." action={<Button variant="secondary" disabled={list.isFetching} onClick={() => { void list.refetch(); if (selected) void detail.refetch(); }}>Refresh</Button>} />
    <div className="chat-inspector-filters">
      <label>Search<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Chat title, customer or email" maxLength={200} /></label>
      <label>Model<input value={model} onChange={event => setModel(event.target.value)} placeholder="Exact model ID" maxLength={200} /></label>
      <label>History<select value={filters.deleted} onChange={event => setFilters(current => ({ ...current, deleted: event.target.value }))}><option value="all">All chats</option><option value="active">In customer history</option><option value="deleted">Removed by customer</option></select></label>
      <label>From<input type="date" value={filters.start} onChange={event => setFilters(current => ({ ...current, start: event.target.value }))} /></label>
      <label>Through<input type="date" value={filters.end} onChange={event => setFilters(current => ({ ...current, end: event.target.value }))} /></label>
    </div>
    <div className="chat-inspector">
      <nav className="chat-inspector-list" aria-label="Customer chats">
        {list.error && <ErrorState error={list.error} retry={() => void list.refetch()} />}
        {!rows.length && !list.error && <p className="playground-notice">{list.isPending ? 'Loading chats…' : 'No chats match these filters.'}</p>}
        {rows.map(row => <button key={row.id} disabled={olderBusy || purging} className={row.id === selected ? 'is-selected' : ''} onClick={() => open(row.id)} aria-current={row.id === selected ? 'page' : undefined}><strong>{row.title}</strong><span>{row.ownerLabel}</span><small>{new Date(row.updatedAt).toLocaleString()} · {row.turnCount} {row.turnCount === 1 ? 'turn' : 'turns'}{row.active ? ' · Responding' : ''}{row.deletedAt ? ' · Removed' : ''}{row.imported ? ' · Imported' : ''}</small></button>)}
        {list.hasNextPage && <Button variant="secondary" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? 'Loading…' : 'Load more chats'}</Button>}
      </nav>
      <section className="chat-inspector-detail" aria-label="Read-only transcript">
        {!selected ? <p className="playground-notice">Select a chat to inspect its messages.</p> : detail.isPending ? <p className="playground-notice">Loading transcript…</p> : detail.error ? <ErrorState error={detail.error} retry={() => void detail.refetch()} /> : chat && <>
          <header><div><h2>{chat.title}</h2><p>{chat.ownerLabel} · Account {chat.ownerId}</p><p>{chat.selectedModel ?? 'No model'} · {chat.active ? 'Responding' : 'Saved'}{chat.imported ? ' · Imported transcript; usage is not verified' : ''}</p>{chat.deletedAt && <p>Removed from customer history {new Date(chat.deletedAt).toLocaleString()}</p>}</div>{chat.deletedAt && <Button variant="danger" onClick={() => { setError(''); setPurgeOpen(true); }}>Permanently delete</Button>}</header>
          {(before ?? detail.data?.nextBefore) ? <div className="playground-earlier"><button className="playground-text-button" disabled={olderBusy} onClick={() => void loadOlder()}>{olderBusy ? 'Loading…' : 'Load earlier messages'}</button></div> : null}
          {messages.map(message => <PlaygroundMessage key={message.id} message={message} userLabel={chat.ownerLabel} />)}
          {error && !purgeOpen && <p className="playground-error" role="alert">{error}</p>}
        </>}
      </section>
    </div>
    <Modal open={purgeOpen} title="Permanently delete this archived chat?" description="The transcript will be erased from storage. This cannot be undone. The administrative action remains in the audit log." onClose={() => { if (!purging) setPurgeOpen(false); }} footer={<><Button variant="secondary" disabled={purging} onClick={() => setPurgeOpen(false)}>Cancel</Button><Button variant="danger" disabled={purging} onClick={() => void purge()}>{purging ? 'Deleting…' : 'Permanently delete'}</Button></>}>
      {error && <p className="playground-error" role="alert">{error}</p>}
    </Modal>
  </>;
}
