import { memo, useCallback, useId, useRef, useState, type ReactNode } from 'react';
import type { Conversation } from '@kineticrouter/portal-contract';
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from './Ui';
import { Modal } from './Modal';
import { RowActionsMenu } from './RowActionsMenu';
import { usePlayground } from '../lib/playground-context';

export function PlaygroundHistory({ onOpen, onNewChat, children }: { onOpen(id: string): void; onNewChat(): void; children?: ReactNode }) {
  const { state, store } = usePlayground();
  const [removing, setRemoving] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const historyId = useId();
  const newButton = useRef<HTMLDivElement>(null);
  const chatsButton = useRef<HTMLButtonElement>(null);
  const openChat = useCallback((id: string) => {
    onOpen(id); setExpanded(false);
    requestAnimationFrame(() => { if (chatsButton.current?.offsetParent) chatsButton.current.focus({ preventScroll: true }); });
  }, [onOpen]);
  const requestRemoval = useCallback((id: string) => { setError(''); setRemoving(id); }, []);
  function newChat() { onNewChat(); setExpanded(false); }
  async function remove() {
    if (!removing || working) return;
    setWorking(true); setError('');
    try {
      if (!await store.remove(removing)) return;
      if (removing === store.getSnapshot().chatId) newChat();
      setRemoving(null);
      requestAnimationFrame(() => newButton.current?.querySelector('button')?.focus());
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The chat could not be removed.'); }
    finally { setWorking(false); }
  }
  async function importChat() {
    setWorking(true); setError('');
    try { const id = await store.importLegacy(); if (id) openChat(id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The chat could not be saved.'); }
    finally { setWorking(false); }
  }
  return <>
    <div ref={newButton} className="playground-history-actions"><Button variant="secondary" className="playground-new-chat" onClick={newChat}><Plus size={15} /> New chat</Button><button ref={chatsButton} type="button" className="playground-chats-toggle" aria-expanded={expanded} aria-controls={historyId} onClick={() => setExpanded(value => !value)}>Chats <ChevronDown size={14} /></button></div>
    <div id={historyId} className={`playground-sidebar-body${expanded ? ' is-open' : ''}`}>
    <nav className="playground-history" aria-label="Saved chats">
      <div className="playground-history-heading"><h2>Your chats</h2><button className="playground-text-button" type="button" disabled={state.listLoading} onClick={() => void store.refreshList()}>Refresh</button></div>
      <div className="playground-history-list">
        <SavedChatRows conversations={state.conversations} selectedId={state.chatId} onOpen={openChat} onRemove={requestRemoval} />
        {!state.conversations.length && !state.listError && <p className="playground-notice">{state.listLoading ? 'Loading chats…' : 'Your chats will appear here.'}</p>}
      </div>
      {state.listError && <p className="playground-error" role="alert">{state.listError}</p>}
      {state.nextCursor && <button type="button" className="playground-text-button" disabled={state.listLoading} onClick={() => void store.refreshList(true)}>{state.listLoading ? 'Loading…' : 'Load more chats'}</button>}
    </nav>
    {state.legacy && state.legacyDismissed && <button className="playground-text-button" type="button" onClick={() => { setError(''); store.showLegacy(); }}>Open previous tab chat</button>}
    {children}
    </div>
    <Modal open={removing !== null} title="Delete this chat?" description="This conversation will no longer appear in your chat history." onClose={() => { if (!working) setRemoving(null); }} footer={<><Button variant="secondary" disabled={working} onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" disabled={working} onClick={() => void remove()}>{working ? 'Deleting…' : 'Delete'}</Button></>}>
      {error && <p className="playground-error" role="alert">{error}</p>}
    </Modal>
    <Modal open={Boolean(state.legacy && !state.legacyDismissed)} title="Save your previous chat?" description="This chat is still in this browser tab. Saving adds it to your account history." onClose={() => { if (!working) store.dismissLegacy(); }} footer={<><Button variant="secondary" disabled={working} onClick={() => store.dismissLegacy()}>Keep in this tab</Button><Button disabled={working} onClick={() => void importChat()}>{working ? 'Saving…' : 'Save chat'}</Button></>}>
      <div className="playground-legacy-preview">{state.legacy?.messages.map(message => <div key={message.id}><strong>{message.role === 'user' ? 'You' : message.model ?? 'Model'}</strong><p>{message.content}</p></div>)}</div>
      {error && <p className="playground-error" role="alert">{error}</p>}
    </Modal>
  </>;
}

const SavedChatRows = memo(function SavedChatRows({ conversations, selectedId, onOpen, onRemove }: {
  conversations: Conversation[]; selectedId: string; onOpen(id: string): void; onRemove(id: string): void;
}) {
  return conversations.map(chat => <div key={chat.id} className={`playground-history-row ${chat.id === selectedId ? 'is-selected' : ''}`}>
    <button type="button" className="playground-history-open" aria-current={chat.id === selectedId ? 'page' : undefined} title={chat.title} onClick={() => onOpen(chat.id)}><span>{chat.title}</span><small>{chat.active ? 'Responding' : new Date(chat.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></button>
    <RowActionsMenu label={`Actions for ${chat.title}`} items={[{ label: 'Delete', danger: true, onSelect: () => onRemove(chat.id) }]} />
  </div>);
});
