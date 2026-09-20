import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SupportEvent, SupportMessage, SupportPresence, SupportPresenceMode, SupportTicketPage, SupportWelcomeResult } from '@kineticrouter/portal-contract';
import { useAuth } from './auth';
import { jsonBody, portalApi } from './api';
import { clearSupportDrafts, consumeSupportStream } from './support-stream';
import { claimSupportAlert, isIncomingSupportMessage, readSupportPreferences, supportPreferenceKey } from './support-alerts';
import { SupportAudio, SupportAudioBlockedError } from './support-audio';
import { clearSupportImageDrafts } from './support-image-drafts';
import { scheduleSupportWelcome } from './support-welcome';

type Connection = 'connecting' | 'connected' | 'reconnecting' | 'unavailable';
type SupportContextValue = {
  presence: SupportPresence; connection: Connection; unreadCount: number;
  soundEnabled: boolean; soundReady: boolean; soundBlocked: boolean; desktopEnabled: boolean; error?: string;
  enableSound(): Promise<void>; toggleSound(): void; testSound(): Promise<void>;
  enableDesktop(): Promise<void>; setPresence(mode: SupportPresenceMode): Promise<void>;
  setStatusText(text: string): Promise<void>;
};
const SupportContext = createContext<SupportContextValue | null>(null);
function localStore() { try { return window.localStorage; } catch { return undefined; } }

export function SupportProvider({ children }: PropsWithChildren) {
  const { user } = useAuth(), client = useQueryClient(), navigate = useNavigate(), location = useLocation();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const userId = user!.id, admin = user!.role === 'admin' && user!.status === 'active';
  const prefix = admin ? '/admin/support' : '/support';
  const [connection, setConnection] = useState<Connection>('connecting');
  const [presence, setPresenceState] = useState<SupportPresence>({ status: 'offline', ...(admin ? { mode: 'automatic' as const } : {}) });
  const [preferences, setPreferences] = useState(() => readSupportPreferences(userId, localStore()));
  const [soundReady, setSoundReady] = useState(false), [soundBlocked, setSoundBlocked] = useState(false), [error, setError] = useState<string>();
  const [notice, setNotice] = useState<SupportMessage>(), [restart, setRestart] = useState(0);
  const [welcomeNotice, setWelcomeNotice] = useState<SupportMessage>();
  const [welcomeRestart, setWelcomeRestart] = useState(0);
  const alertRef = useRef<((message: SupportMessage, welcome?: boolean) => void) | undefined>(undefined);
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  const welcomeTask = useRef<ReturnType<typeof scheduleSupportWelcome> | undefined>(undefined);
  const audioRef = useRef<SupportAudio | null>(null), audioQueue = useRef(Promise.resolve()), audioEpoch = useRef(0);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const session = useQuery({ queryKey: ['support', 'summary', userId, admin], queryFn: ({ signal }) => portalApi<SupportTicketPage>(`${prefix}/tickets?page=1`, { signal }), enabled: connection === 'connected', retry: false });
  const unreadCount = session.data?.unreadCount ?? 0;
  const getAudio = useCallback(() => audioRef.current ?? (audioRef.current = new SupportAudio(state => { setSoundReady(state.ready); setSoundBlocked(state.blocked); })), []);
  const cancelAudio = useCallback(() => { audioEpoch.current++; audioRef.current?.cancel(); }, []);
  const savePreferences = useCallback((value: { sound: boolean; desktop: boolean }) => {
    if (!value.sound) cancelAudio();
    preferencesRef.current = value; setPreferences(value);
    try { localStore()?.setItem(supportPreferenceKey(userId), JSON.stringify(value)); } catch { /* Keep this tab's preference. */ }
  }, [cancelAudio, userId]);
  const enableSound = useCallback(async () => {
    savePreferences({ ...preferencesRef.current, sound: true });
    try { await getAudio().activate(); }
    catch (cause) { if (!(cause instanceof SupportAudioBlockedError)) setError((cause as Error).message); }
  }, [getAudio, savePreferences]);
  const testSound = useCallback(async () => {
    const audio = getAudio(), epoch = audioEpoch.current;
    try { await audio.prepare(); await audio.whenIdle(); if (epoch === audioEpoch.current) await audio.start(); }
    catch (cause) { if (!(cause instanceof SupportAudioBlockedError)) setError((cause as Error).message); }
  }, [getAudio]);
  const toggleSound = useCallback(() => {
    if (!preferencesRef.current.sound) { void enableSound(); return; }
    savePreferences({ ...preferencesRef.current, sound: false });
  }, [enableSound, savePreferences]);
  const enableDesktop = useCallback(async () => {
    if (!('Notification' in window)) { setError('Desktop notifications are unavailable in this browser. Message sounds still work.'); return; }
    if (preferencesRef.current.desktop) { savePreferences({ ...preferencesRef.current, desktop: false }); return; }
    try {
      const permission = await Notification.requestPermission();
      savePreferences({ ...preferencesRef.current, desktop: permission === 'granted' });
      setError(permission === 'granted' ? undefined : 'Desktop notifications are blocked. You can allow them in your browser’s site settings.');
    } catch { setError('Desktop notifications are unavailable. Message sounds still work.'); }
  }, [savePreferences]);

  useEffect(() => {
    const storage = (event: StorageEvent) => {
      if (event.key === supportPreferenceKey(userId)) {
        const value = readSupportPreferences(userId, localStore());
        if (!value.sound) cancelAudio();
        preferencesRef.current = value; setPreferences(value);
      }
      if (event.key === `kinetic-support-logout:${userId}`) window.dispatchEvent(new CustomEvent('portal:unauthorized'));
    };
    const activate = (event: Event) => {
      if (event.isTrusted && preferencesRef.current.sound) void getAudio().activate().catch(() => {});
    };
    window.addEventListener('storage', storage);
    window.addEventListener('click', activate, { capture: true }); window.addEventListener('keydown', activate, { capture: true });
    return () => {
      window.removeEventListener('storage', storage);
      window.removeEventListener('click', activate, { capture: true }); window.removeEventListener('keydown', activate, { capture: true });
      audioEpoch.current++; audioRef.current?.close(); audioRef.current = null;
    };
  }, [cancelAudio, getAudio, userId]);

  useEffect(() => {
    const controller = new AbortController(), received = new Set<string>();
    let stopped = false, retryTimer: ReturnType<typeof setTimeout> | undefined, failures = 0;
    const stop = () => { stopped = true; controller.abort(); clearTimeout(retryTimer); audioEpoch.current++; audioRef.current?.close(); audioRef.current = null; setNotice(undefined); setWelcomeNotice(undefined); try { clearSupportDrafts(window.sessionStorage); } catch { /* Restricted storage. */ } void clearSupportImageDrafts(userId); };
    const signedOut = () => { stop(); try { localStore()?.setItem(`kinetic-support-logout:${userId}`, `${Date.now()}:${Math.random()}`); } catch { /* The server also expires streams. */ } };
    const retryLogout = () => { setRestart(value => value + 1); setWelcomeRestart(value => value + 1); };
    const refresh = () => { void client.invalidateQueries({ queryKey: ['support'] }); void portalApi<SupportPresence>(`${prefix}/presence`, { signal: controller.signal }).then(value => { if (!stopped) setPresenceState(value); }).catch(() => {}); };
    const alert = (message: SupportMessage, welcome = false) => {
      if (stopped || !isIncomingSupportMessage(message, admin) || received.has(message.id)) return;
      received.add(message.id); if (received.size > 1000) received.delete(received.values().next().value!);
      const selected = new URLSearchParams(window.location.search).get('ticket');
      if (!window.location.pathname.endsWith('/support') || selected !== message.ticketId) {
        if (welcome) setWelcomeNotice(message);
        else setNotice(message);
      }
      const prefs = preferencesRef.current;
      const wantsSound = prefs.sound, epoch = audioEpoch.current, receivedAt = Date.now();
      const wantsDesktop = prefs.desktop && 'Notification' in window && Notification.permission === 'granted' && (!document.hasFocus() || document.hidden);
      if (!wantsSound && !wantsDesktop) return;
      audioQueue.current = audioQueue.current.catch(() => {}).then(async () => {
        if (stopped) return;
        const eligible = () => !stopped && epoch === audioEpoch.current && preferencesRef.current.sound && Date.now() - receivedAt < 15000;
        if (wantsSound && eligible()) {
            try {
              const audio = getAudio();
              await audio.whenIdle();
              if (eligible()) {
                // Resume/decode outside the lock: a blocked tab never holds up a ready tab.
                await audio.prepare();
                let finished: Promise<void> | undefined;
                await claimSupportAlert(userId, `${message.id}:sound`, async () => {
                  if (!eligible()) return false;
                  finished = audio.start();
                }, localStore(), navigator.locks);
                await finished;
              }
            } catch (cause) {
              // Discard already queued alerts when activation is denied. A later
              // gesture enables only future messages, without replaying old ones.
              if (cause instanceof SupportAudioBlockedError) audioEpoch.current++;
              else if (!stopped) setError((cause as Error).message);
            }
        }
        if (wantsDesktop && preferencesRef.current.desktop && !stopped && (!document.hasFocus() || document.hidden)) {
          await claimSupportAlert(userId, `${message.id}:desktop`, async () => {
            try {
              const notification = new Notification(welcome ? 'Welcome to kineticRouter' : 'New support message', { body: welcome ? 'Questions about the API? Open your welcome conversation to reach us.' : admin ? 'A customer sent you a message.' : 'kineticRouter Support replied to your ticket.', tag: `support-${message.id}`, silent: true, icon: '/favicon-48.png' });
              notification.onclick = () => { window.focus(); navigateRef.current(`${admin ? '/admin/support' : '/support'}?ticket=${encodeURIComponent(message.ticketId)}`); notification.close(); };
            } catch { throw new Error('Desktop notifications are unavailable.'); }
          }, localStore(), navigator.locks).catch(() => {});
        }
      });
    };
    alertRef.current = alert;
    const onEvent = (event: SupportEvent) => {
      if (stopped) return;
      if (event.type === 'ready') { failures = 0; setConnection('connected'); refresh(); }
      else if (event.type === 'presence' && event.presence) setPresenceState(previous => ({ ...previous, ...event.presence }));
      else { void client.invalidateQueries({ queryKey: ['support'] }); if (event.type === 'message' && event.message && event.message.kind !== 'welcome') alert(event.message); }
    };
    async function connect() {
      while (!stopped) {
        try {
          const response = await fetch(`/portal/v1${prefix}/events`, { credentials: 'include', headers: { Accept: 'text/event-stream' }, signal: controller.signal });
          if (response.status === 401 || response.status === 403) {
            setConnection('unavailable'); if (response.status === 401) window.dispatchEvent(new CustomEvent('portal:unauthorized')); return;
          }
          if (!response.ok || !response.body) { setConnection(response.status === 503 ? 'unavailable' : 'reconnecting'); throw new Error('Support is unavailable.'); }
          await consumeSupportStream(response.body, onEvent, controller.signal);
          if (!stopped) setConnection('reconnecting');
        } catch { if (stopped) return; setConnection(current => current === 'unavailable' ? current : 'reconnecting'); }
        if (stopped) return;
        await new Promise<void>(resolve => {
          const done = () => { clearTimeout(retryTimer); controller.signal.removeEventListener('abort', done); resolve(); };
          retryTimer = setTimeout(done, Math.min(30000, 1000 * 2 ** Math.min(failures++, 5)));
          controller.signal.addEventListener('abort', done, { once: true });
        });
      }
    }
    window.addEventListener('portal:signing-out', stop); window.addEventListener('portal:signed-out', signedOut); window.addEventListener('portal:unauthorized', stop); window.addEventListener('portal:sign-out-failed', retryLogout);
    void connect();
    // Reconcile after a lost publication, browser resume, or a temporary Redis interruption.
    const interval = setInterval(refresh, 60000), reconnect = () => { if (!stopped) setRestart(value => value + 1); }, resumed = () => { if (!document.hidden) reconnect(); };
    window.addEventListener('online', reconnect); document.addEventListener('visibilitychange', resumed);
    return () => {
      stopped = true; controller.abort(); clearTimeout(retryTimer); clearInterval(interval);
      if (alertRef.current === alert) alertRef.current = undefined;
      window.removeEventListener('portal:signing-out', stop); window.removeEventListener('portal:signed-out', signedOut); window.removeEventListener('portal:unauthorized', stop); window.removeEventListener('portal:sign-out-failed', retryLogout);
      window.removeEventListener('online', reconnect); document.removeEventListener('visibilitychange', resumed);
    };
  }, [admin, client, getAudio, prefix, restart, userId]);

  useEffect(() => {
    if (admin) return;
    let pendingNotice: SupportMessage | undefined;
    const eligible = () => connectionRef.current === 'connected' && document.visibilityState === 'visible' && document.hasFocus();
    const flush = () => {
      if (!pendingNotice || !eligible() || !alertRef.current) return;
      alertRef.current(pendingNotice, true);
      pendingNotice = undefined;
    };
    const task = scheduleSupportWelcome({
      eligible,
      ensure: signal => portalApi<SupportWelcomeResult>('/support/welcome', { method: 'POST', ...jsonBody({}), signal }),
      receive: message => { pendingNotice = message; void client.invalidateQueries({ queryKey: ['support'] }); flush(); },
    });
    const resume = () => { flush(); task.refresh(); };
    const stop = () => { task.stop(); pendingNotice = undefined; setWelcomeNotice(undefined); };
    const controls = { refresh: resume, stop };
    welcomeTask.current = controls;
    window.addEventListener('focus', resume); window.addEventListener('blur', resume);
    window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume);
    window.addEventListener('portal:signing-out', stop); window.addEventListener('portal:signed-out', stop); window.addEventListener('portal:unauthorized', stop);
    return () => {
      task.stop(); pendingNotice = undefined;
      if (welcomeTask.current === controls) welcomeTask.current = undefined;
      window.removeEventListener('focus', resume); window.removeEventListener('blur', resume);
      window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('portal:signing-out', stop); window.removeEventListener('portal:signed-out', stop); window.removeEventListener('portal:unauthorized', stop);
    };
  }, [admin, client, welcomeRestart, userId]);
  useEffect(() => { welcomeTask.current?.refresh(); }, [connection]);
  useEffect(() => {
    if (welcomeNotice && location.pathname === '/support' && new URLSearchParams(location.search).get('ticket') === welcomeNotice.ticketId) setWelcomeNotice(undefined);
  }, [location.pathname, location.search, welcomeNotice]);

  useEffect(() => {
    if (!admin || connection !== 'connected') return;
    const tabId = crypto.randomUUID(); let active = !document.hidden && document.hasFocus(), disposed = false;
    const activity = () => { if (!document.hidden && document.hasFocus()) active = true; };
    const heartbeat = () => { if (disposed) return; const recent = active; active = false; void portalApi(`${prefix}/heartbeat`, { method: 'POST', ...jsonBody({ tabId, active: recent }) }).catch(() => {}); };
    const focus = () => { activity(); heartbeat(); };
    ['pointerdown', 'keydown', 'scroll', 'pointermove'].forEach(name => window.addEventListener(name, activity, { passive: true }));
    window.addEventListener('focus', focus); heartbeat(); const interval = setInterval(heartbeat, 30000);
    return () => { disposed = true; clearInterval(interval); ['pointerdown', 'keydown', 'scroll', 'pointermove'].forEach(name => window.removeEventListener(name, activity)); window.removeEventListener('focus', focus); };
  }, [admin, connection, prefix]);
  useEffect(() => { const original = document.title; document.title = unreadCount ? `(${unreadCount}) kineticRouter` : 'kineticRouter'; return () => { document.title = original; }; }, [unreadCount]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(undefined), 6500); return () => clearTimeout(timer); }, [notice]);
  const setPresence = useCallback(async (mode: SupportPresenceMode) => { const value = await portalApi<SupportPresence>(`${prefix}/presence`, { method: 'PATCH', ...jsonBody({ mode }) }); setPresenceState(value); }, [prefix]);
  const setStatusText = useCallback(async (statusText: string) => { const value = await portalApi<SupportPresence>(`${prefix}/presence`, { method: 'PATCH', ...jsonBody({ statusText }) }); setPresenceState(value); }, [prefix]);
  return <SupportContext.Provider value={{ presence, connection, unreadCount, soundEnabled: preferences.sound, soundReady, soundBlocked, desktopEnabled: preferences.desktop && typeof Notification !== 'undefined' && Notification.permission === 'granted', error, enableSound, toggleSound, testSound, enableDesktop, setPresence, setStatusText }}>
    {children}
    <div className="support-message-notices">
    {welcomeNotice && <div className="support-message-toast support-welcome-toast" role="status"><button aria-label="Open welcome chat" onClick={() => { navigate(`/support?ticket=${encodeURIComponent(welcomeNotice.ticketId)}`); setWelcomeNotice(undefined); }}><strong>Welcome to kineticRouter!</strong><span>Questions about the API? We’re here to help.</span><span className="support-toast-action">Open chat</span></button><button className="icon-button" aria-label="Dismiss welcome notification" onClick={() => setWelcomeNotice(undefined)}>×</button></div>}
    {notice && <div className="support-message-toast" role="status"><button onClick={() => { navigate(`${admin ? '/admin/support' : '/support'}?ticket=${encodeURIComponent(notice.ticketId)}`); setNotice(undefined); }}><strong>New support message</strong><span>{notice.body.trim().slice(0, 100) || 'Image'}</span></button><button className="icon-button" aria-label="Dismiss message notification" onClick={() => setNotice(undefined)}>×</button></div>}
    </div>
  </SupportContext.Provider>;
}
export function useSupport() { const value = useContext(SupportContext); if (!value) throw new Error('SupportProvider is required.'); return value; }
