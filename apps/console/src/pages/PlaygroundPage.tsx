import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronDown, Square } from 'lucide-react';
import type { ChannelMonitor, ModelPrice, PlaygroundModel } from '@kineticrouter/portal-contract';
import { Button, ErrorState } from '../components/Ui';
import { PlaygroundHistory } from '../components/PlaygroundHistory';
import { PlaygroundMessage } from '../components/PlaygroundMessage';
import { portalApi, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePlayground } from '../lib/playground-context';
import { usePlaygroundKeys } from '../lib/playground-queries';
import { reportedModelStatus } from '../lib/playground-status';
import './playground.css';


export function PlaygroundPage() {
  const { capabilities, user } = useAuth();
  const { state, store } = usePlayground();
  const { selectedKey, selectedModel, messages, draft, activity, timing, error, persistenceNotice } = state;
  const [params, setParams] = useSearchParams();
  const [olderLoading, setOlderLoading] = useState(false);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [following, setFollowing] = useState(true);
  const transcript = useRef<HTMLDivElement>(null);
  const transcriptContent = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const viewGeneration = useRef(0);
  const scrollIntent = useRef(0);
  const busy = activity === 'Sending' || activity === 'Receiving';
  const keys = usePlaygroundKeys();
  const keyOptions = useMemo(() => keys.data?.pages.flatMap(page => page.items) ?? [], [keys.data]);
  const keyId = selectedKey ?? '';
  const keyReady = keys.isSuccess && keyOptions.some(key => key.id === keyId);
  const models = useQuery({ queryKey: ['playground', 'models', user?.id, keyId], queryFn: ({ signal }) => portalApi<PlaygroundModel[]>(`/playground/models${queryString({ apiKeyId: keyId })}`, { signal }), enabled: keyReady, staleTime: 30_000, refetchOnWindowFocus: true });
  const modelId = selectedModel ?? '';
  const modelReady = Boolean(keyReady && modelId && models.isSuccess && models.data.some(model => model.id === modelId));
  const price = useQuery({ queryKey: ['playground', 'prices', user?.id, keyId, modelId], queryFn: ({ signal }) => portalApi<ModelPrice>(`/model-prices${queryString({ apiKeyId: keyId, model: modelId })}`, { signal }), enabled: ratesOpen && modelReady && capabilities?.modelPlaza === true, staleTime: 60_000, refetchOnWindowFocus: false, retry: false });
  const channels = useQuery({ queryKey: ['channel-status'], queryFn: ({ signal }) => portalApi<ChannelMonitor[]>('/channels/status', { signal }), enabled: modelReady && capabilities?.channelMonitor === true, staleTime: 60_000, refetchInterval: 60_000, refetchIntervalInBackground: false, retry: false });
  const reportedStatus = modelReady && capabilities?.channelMonitor && channels.isSuccess ? reportedModelStatus(channels.data, modelId) : undefined;
  const availablePrice = modelReady && capabilities?.modelPlaza && price.isSuccess && price.data.status === 'available' ? price.data : undefined;

  useEffect(() => { if (state.historyReady && !state.loading && selectedKey === null && keyOptions.length) store.selectKey(keyOptions[0]!.id); }, [selectedKey, keyOptions, store, state.historyReady, state.loading]);
  useEffect(() => { if (state.historyReady && !state.loading && selectedModel === null && models.data?.length) store.selectModel(models.data[0]!.id); }, [selectedModel, models.data, store, state.historyReady, state.loading]);
  const requestedChat = params.get('chat');
  useEffect(() => { if (requestedChat && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestedChat)) void store.open(requestedChat); else setParams({ chat: store.getSnapshot().chatId }, { replace: true }); }, [requestedChat, store, setParams]);
  useEffect(() => { store.refresh(); }, [store]);
  useEffect(() => { viewGeneration.current += 1; setOlderLoading(false); follow.current = true; setFollowing(true); }, [state.chatId]);
  useEffect(() => { if (follow.current && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [messages]);
  useEffect(() => {
    const viewport = transcript.current, content = transcriptContent.current;
    if (!viewport || !content) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (follow.current) viewport.scrollTop = viewport.scrollHeight;
      });
    });
    observer.observe(viewport); observer.observe(content);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = 'auto';
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 140)}px`;
  }, [draft]);

  function jumpToLatest() {
    scrollIntent.current += 1;
    follow.current = true; setFollowing(true);
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }
  const openChat = useCallback((id: string) => { void store.open(id); setParams({ chat: id }); }, [store, setParams]);
  function newChat() { const id = store.newChat(); if (!id) return; setParams({ chat: id }); jumpToLatest(); textarea.current?.focus(); }
  async function loadOlder() {
    const element = transcript.current, id = state.chatId;
    const generation = viewGeneration.current;
    const intent = scrollIntent.current;
    const viewportTop = element?.getBoundingClientRect().top ?? 0;
    const anchor = Array.from(element?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []).find(node => node.getBoundingClientRect().bottom > viewportTop);
    const offset = anchor ? anchor.getBoundingClientRect().top - viewportTop : 0;
    follow.current = false; setFollowing(false); setOlderLoading(true);
    await store.loadOlder();
    if (viewGeneration.current !== generation) return;
    setOlderLoading(false);
    requestAnimationFrame(() => {
      if (element && anchor?.isConnected && !follow.current && scrollIntent.current === intent && store.getSnapshot().chatId === id && viewGeneration.current === generation) {
        element.scrollTop += anchor.getBoundingClientRect().top - element.getBoundingClientRect().top - offset;
      }
    });
  }
  function send(event: FormEvent) {
    event.preventDefault();
    if (!busy && !state.activeChatId && !state.loading && modelReady && draft.trim()) { jumpToLatest(); void store.send(modelReady); }
  }

  return <div className="playground-page">
    <aside className="playground-sidebar" aria-label="Playground controls">
      <div className="playground-title"><h1>Playground</h1></div>
      <PlaygroundHistory onOpen={openChat} onNewChat={newChat}>
      <details className="playground-settings" open={controlsOpen} onToggle={event => setControlsOpen(event.currentTarget.open)}>
        <summary>Status & rates <ChevronDown size={15} /></summary>
        <div className="playground-settings-body">
          <section className="playground-status" aria-label="Model status">
            <h2>Model status</h2>
            <dl><div><dt>Key access</dt><dd>{modelReady ? 'Available' : 'Select a model'}</dd></div><div><dt>Request</dt><dd>{busy && <i className="playground-activity-dot" />}{activity}</dd></div><div><dt>Reported channel</dt><dd>{reportedStatus ?? 'Not available'}</dd></div></dl>
            {reportedStatus && <p className="playground-notice">Reported by channel monitoring; availability for this key may differ.</p>}
            {(timing.firstText !== undefined || timing.elapsed !== undefined) && <div className="playground-timing"><p className="playground-notice">Last request · {timing.model}</p><dl><div><dt>First text</dt><dd>{timing.firstText === undefined ? '—' : seconds(timing.firstText)}</dd></div>{timing.elapsed !== undefined && <div><dt>Duration</dt><dd>{seconds(timing.elapsed)}</dd></div>}</dl></div>}
            {capabilities?.channelMonitor && <Link className="playground-text-button" to="/status">View channel status</Link>}
          </section>
          <div className="playground-billing-note">
            <p>Normal usage charges apply.</p><div><button type="button" className="playground-text-button" aria-expanded={ratesOpen} onClick={() => setRatesOpen(value => !value)}>View rates <ChevronDown size={13} /></button><Link to="/usage">Billed usage ↗</Link></div>
            {ratesOpen && <div className="playground-rates">{price.isFetching && !price.data ? <p>Loading rates…</p> : availablePrice ? <><p>USD per million tokens</p><dl><div><dt>Input</dt><dd>${availablePrice.input}</dd></div><div><dt>Output</dt><dd>${availablePrice.output}</dd></div>{availablePrice.cacheRead !== undefined && <div><dt>Cached input</dt><dd>${availablePrice.cacheRead}</dd></div>}{availablePrice.cacheWrite !== undefined && <div><dt>Cache write</dt><dd>${availablePrice.cacheWrite}</dd></div>}</dl><p>Checked {new Date(availablePrice.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p><button type="button" className="playground-text-button" disabled={price.isFetching} onClick={() => void price.refetch()}>Refresh rates</button></> : <p>Current rates are unavailable. Actual billed costs are in Usage.</p>}</div>}
          </div>
        </div>
      </details>
      </PlaygroundHistory>
    </aside>
    <section className="playground-chat" aria-label="Conversation">
      <div className="playground-transcript" ref={transcript} role="log" aria-label="Messages" aria-live="off" tabIndex={0} onPointerDown={() => { scrollIntent.current += 1; }} onWheel={() => { scrollIntent.current += 1; }} onTouchMove={() => { scrollIntent.current += 1; }} onKeyDown={event => {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) { scrollIntent.current += 1; }
      }} onClickCapture={event => {
        if (event.target instanceof Element && event.target.closest('.playground-message-details summary')) {
          scrollIntent.current += 1; follow.current = false; setFollowing(false);
        }
      }} onScroll={() => {
        const element = transcript.current;
        if (element) { follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; setFollowing(follow.current); }
      }}>
        <div className="playground-transcript-content" ref={transcriptContent}>
        {state.older && <div className="playground-earlier"><button type="button" className="playground-text-button" disabled={olderLoading} onClick={() => void loadOlder()}>{olderLoading ? 'Loading...' : 'Load earlier messages'}</button></div>}
        {state.loading ? <div className="playground-intro"><p>Loading chat...</p></div> : !messages.length ? <div className="playground-intro"><p>What would you like to try?</p></div> : messages.map(message => <PlaygroundMessage key={`${state.chatId}:${message.id}`} message={message} usageDisplay="details" />)}
        </div>
      </div>
      {!following && messages.length > 0 && <button type="button" className="playground-jump" onClick={jumpToLatest}><ArrowDown size={14} /> Jump to latest</button>}
      {state.activeChatId && state.activeChatId !== state.chatId && <p className="playground-notice playground-background">Another chat is responding. <button type="button" className="playground-text-button" onClick={() => openChat(state.activeChatId!)}>Open chat</button><button type="button" className="playground-text-button" onClick={store.stop}>Stop</button></p>}
      {state.omittedTurns > 0 && <p className="playground-notice playground-context">Earlier messages remain saved; the model receives the most recent messages that fit its context limit.</p>}
      <form className="playground-composer" onSubmit={send}>
        {error && <p className="playground-error" role="alert">{error} <button type="button" className="playground-text-button" onClick={store.refresh}>Reload chat</button></p>}
        <label className="sr-only" htmlFor="playground-message">Message</label>
        <textarea id="playground-message" ref={textarea} value={draft} maxLength={32_000} onChange={event => store.setDraft(event.target.value)} placeholder="Message the model…" rows={1} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); if (!busy) event.currentTarget.form?.requestSubmit(); }
        }} />
        <div className="playground-composer-footer">
          <div className="playground-controls">
            <label><span>API key</span><select value={keyId} disabled={busy || !keyOptions.length} onChange={event => { store.selectKey(event.target.value); setRatesOpen(false); }}>
              <option value="" disabled>{keys.isLoading ? 'Loading keys…' : 'Select an API key'}</option>
              {selectedKey && !keyOptions.some(key => key.id === selectedKey) && <option value={selectedKey} disabled>{keys.isLoading ? 'Loading selected key…' : keys.hasNextPage ? 'Selected key — load more keys' : 'Key unavailable — choose another'}</option>}
              {keyOptions.map(key => <option key={key.id} value={key.id}>{key.name}</option>)}
            </select></label>
            <label><span>Model</span><select value={modelId} disabled={busy || !keyReady || !models.isSuccess || !models.data?.length} onChange={event => { store.selectModel(event.target.value); setRatesOpen(false); }}>
              <option value="" disabled>{keyReady && models.isLoading ? 'Loading models…' : 'Select a model'}</option>
              {selectedModel && !models.data?.some(model => model.id === selectedModel) && <option value={selectedModel} disabled>Model unavailable — choose another</option>}
              {models.data?.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select></label>
          </div>
          {busy && state.activeChatId === state.chatId ? <Button type="button" variant="secondary" onClick={store.stop}><Square size={13} /> Stop</Button> : <Button type="submit" disabled={!modelReady || !draft.trim() || busy || Boolean(state.activeChatId) || state.loading || !state.historyReady} aria-label="Send message"><ArrowUp size={16} /> Send</Button>}
        </div>
        <div className="playground-composer-notices">{keys.hasNextPage && <button type="button" className="playground-text-button" disabled={keys.isFetchingNextPage || busy} onClick={() => void keys.fetchNextPage()}>{keys.isFetchingNextPage ? 'Loading…' : 'Load more keys'}</button>}
{keys.error && <ErrorState error={keys.error} retry={() => void keys.refetch()} />}
{keys.isSuccess && !keyOptions.length && <p className="playground-notice">{keys.hasNextPage ? 'No available keys on this page. Load more keys to continue.' : <>Create an active key in <Link to="/api-keys">API Keys</Link> to get started.</>}</p>}
{models.error && <ErrorState error={models.error} retry={() => void models.refetch()} />}
{keyReady && models.isSuccess && !models.data.length && <p className="playground-notice">No Playground models are enabled for this key. Choose another key or contact your administrator.</p>}</div>
        {persistenceNotice && <p className="playground-notice" role="status">{persistenceNotice}</p>}
      </form>
      <p className="playground-keyboard-help">Enter to send &#183; Shift + Enter for a new line</p>
    </section>
    <span className="sr-only" role="status" aria-live="polite">{activity === 'Receiving' ? 'Response started.' : activity === 'Sending' ? 'Request sent.' : activity === 'Complete' ? 'Response complete.' : activity === 'Stopped' ? 'Response stopped.' : activity === 'Failed' ? 'Request failed.' : ''}</span>
  </div>;
}

function seconds(ms: number) { return `${(ms / 1000).toFixed(2)} s`; }
