'use client';

import { useEffect, useState } from 'react';
import { SOCIAL_PLATFORMS, type SocialLinks } from '@kineticrouter/portal-contract';
import { loadWebsiteSocialLinks } from '../data/website-settings';
import { usePublicSession } from './use-public-session';
import { SocialIcon } from '@kineticrouter/brand-ui';

export function FooterSocialLinks() {
  const { loaded, session, consoleOrigin } = usePublicSession();
  if (!loaded || !session?.authenticated || !session.user) return null;
  // Remount on account changes so a previous account's links cannot reappear.
  return <SignedInSocialLinks key={`${consoleOrigin}:${session.user.id}`} consoleOrigin={consoleOrigin} />;
}

function SignedInSocialLinks({ consoleOrigin }: { consoleOrigin: string }) {
  const [links, setLinks] = useState<SocialLinks | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void loadWebsiteSocialLinks(consoleOrigin, fetch, controller.signal).then(value => {
      if (active) setLinks(value);
    });
    return () => { active = false; controller.abort(); };
  }, [consoleOrigin]);
  // Keep removed links hidden if authentication or settings retrieval fails.
  if (!links) return null;
  const visible = SOCIAL_PLATFORMS.filter(({ id }) => links[id]);
  if (!visible.length) return null;
  return <nav aria-label="kineticRouter social media" className="mt-4 -ml-2 flex flex-wrap items-center gap-1">
    {visible.map(({ id, label }) => <a key={id} href={links[id]} target="_blank" rel="noopener noreferrer"
      aria-label={`kineticRouter on ${label}`} title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <SocialIcon platform={id} className="h-[18px] w-[18px]" />
    </a>)}
  </nav>;
}
