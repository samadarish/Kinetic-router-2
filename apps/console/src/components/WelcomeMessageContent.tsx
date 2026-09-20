import { useEffect, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SocialIcon } from '@kineticrouter/brand-ui';
import { publicWebsiteSettingsSchema, SOCIAL_PLATFORMS, type SocialLinks } from '@kineticrouter/portal-contract';
import { jsonBody, portalApi } from '../lib/api';
import { startWelcomeViewTracking } from '../lib/support-welcome-view';
import './welcome-message.css';

export async function loadWelcomeSocialLinks(signal?: AbortSignal): Promise<SocialLinks | null> {
  try {
    const result = publicWebsiteSettingsSchema.safeParse(await portalApi<unknown>('/website', { signal }, 5000));
    return result.success ? result.data.socialLinks : null;
  } catch { return null; }
}

export function WelcomeSocialLinks({ links }: { links: SocialLinks | null | undefined }) {
  if (!links) return null;
  const visible = SOCIAL_PLATFORMS.filter(({ id }) => links[id]);
  if (!visible.length) return null;
  return <nav className="support-welcome-socials" aria-label="kineticRouter social media">
    {visible.map(({ id, label }) => <a key={id} href={links[id]} target="_blank" rel="noopener noreferrer" aria-label={`kineticRouter on ${label}`}>
      <SocialIcon platform={id} width={17} height={17} /><span>{label}</span>
    </a>)}
  </nav>;
}

export function WelcomeMessageContent({ body }: { body: string }) {
  const settings = useQuery({
    queryKey: ['website', 'welcome-social-links'],
    queryFn: ({ signal }) => loadWelcomeSocialLinks(signal),
    staleTime: 0, retry: false, refetchOnMount: 'always',
  });
  return <><span className="support-message-text">{body}</span><WelcomeSocialLinks links={settings.data} /></>;
}

/** Intersection alone does not account for an unfocused tab or an overlay covering the bubble. */
export function welcomeBubbleIsVisible(bubble: HTMLElement) {
  if (!bubble.isConnected || document.visibilityState !== 'visible' || !document.hasFocus()
    || bubble.closest('[inert], [aria-hidden="true"]') || !bubble.getClientRects().length) return false;
  const style = getComputedStyle(bubble);
  if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
  if ([...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], dialog[open]')].some(dialog => dialog.getClientRects().length > 0)) return false;
  const rect = bubble.getBoundingClientRect(), scroller = bubble.closest('.support-message-scroll')?.getBoundingClientRect();
  const left = Math.max(0, rect.left, scroller?.left ?? 0), right = Math.min(innerWidth, rect.right, scroller?.right ?? innerWidth);
  const top = Math.max(0, rect.top, scroller?.top ?? 0), bottom = Math.min(innerHeight, rect.bottom, scroller?.bottom ?? innerHeight);
  if (right <= left || bottom - top < Math.min(70, rect.height)) return false;
  const covering = document.elementFromPoint(left + (right - left) / 2, top + (bottom - top) / 2);
  return covering !== null && bubble.contains(covering);
}

const acknowledged = new Set<string>();

export function WelcomeSeenTracker({ bubbleRef, ticketId, messageId, visible }: {
  bubbleRef: RefObject<HTMLDivElement | null>; ticketId: string; messageId: string; visible: boolean;
}) {
  useEffect(() => {
    const bubble = bubbleRef.current, key = `${ticketId}:${messageId}`;
    if (!bubble || !visible || acknowledged.has(key)) return;
    const tracking = startWelcomeViewTracking({
      eligible: () => welcomeBubbleIsVisible(bubble),
      recordView: async () => {
        await portalApi('/support/welcome/viewed', { method: 'POST', ...jsonBody({}) });
        acknowledged.add(key);
      },
    });
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(tracking.check, { root: bubble.closest('.support-message-scroll'), threshold: [0, .1, .25, .5, .75, 1] });
    observer?.observe(bubble);
    const mutations = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(tracking.check);
    mutations?.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'inert', 'aria-modal', 'aria-hidden'] });
    window.addEventListener('focus', tracking.check);
    window.addEventListener('blur', tracking.check);
    document.addEventListener('visibilitychange', tracking.check);
    return () => {
      tracking.dispose(); observer?.disconnect(); mutations?.disconnect();
      window.removeEventListener('focus', tracking.check); window.removeEventListener('blur', tracking.check);
      document.removeEventListener('visibilitychange', tracking.check);
    };
  }, [bubbleRef, ticketId, messageId, visible]);
  return null;
}
