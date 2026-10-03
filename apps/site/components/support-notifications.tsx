'use client';

import { useEffect, useState } from 'react';
import type { SupportMessage } from '@kineticrouter/portal-contract';
import { startSupportNotifications, SUPPORT_REPLY_NOTICE_MS } from '@kineticrouter/portal-contract/support-client';
import { consolePageUrl } from '@/data/public-console-origin.mjs';
import { usePublicSession } from './use-public-session';
import { CloseIcon } from './icons';

type Notice = { ownerId: string; message: SupportMessage };

export function SupportNotifications() {
  const { session, consoleOrigin, signedOut } = usePublicSession();
  const userId = session?.user?.id, csrfToken = session?.supportNotifications?.csrfToken;
  const [welcome, setWelcome] = useState<Notice>();
  const [reply, setReply] = useState<Notice>();
  const [restart, setRestart] = useState(0);
  useEffect(() => {
    const retry = () => setRestart(value => value + 1);
    window.addEventListener('portal:sign-out-failed', retry);
    return () => window.removeEventListener('portal:sign-out-failed', retry);
  }, []);
  useEffect(() => {
    if (!userId || !csrfToken) return;
    const listener = startSupportNotifications({
      origin: consoleOrigin, csrfToken,
      receive: (message, isWelcome) => (isWelcome ? setWelcome : setReply)({ ownerId: userId, message }),
      clear: () => { setWelcome(undefined); setReply(undefined); }, unauthorized: signedOut,
    });
    return listener.stop;
  }, [userId, csrfToken, consoleOrigin, signedOut, restart]);
  useEffect(() => {
    if (!reply) return;
    const timer = setTimeout(() => setReply(undefined), SUPPORT_REPLY_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [reply]);

  return <div className="public-support-notices" aria-live="polite" aria-relevant="additions">
    {csrfToken && [welcome, reply].map((notice, index) => notice && notice.ownerId === userId && <div key={notice.message.id} className="public-support-notice">
      <a href={consolePageUrl(consoleOrigin, `/support?ticket=${encodeURIComponent(notice.message.ticketId)}`)} onClick={() => (index === 0 ? setWelcome : setReply)(undefined)}>
        <strong>{index === 0 ? 'Welcome to kineticRouter!' : 'New support message'}</strong>
        <span>{index === 0 ? 'Questions about the API? We’re here to help.' : notice.message.body.trim().slice(0, 100) || 'Image'}</span>
        <span className="public-support-action">Open chat</span>
      </a>
      <button type="button" aria-label={index === 0 ? 'Dismiss welcome notification' : 'Dismiss message notification'} onClick={() => (index === 0 ? setWelcome : setReply)(undefined)}><CloseIcon className="h-4 w-4" /></button>
    </div>)}
  </div>;
}
