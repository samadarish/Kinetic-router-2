import { headers } from 'next/headers';
import { SOCIAL_PLATFORMS } from '@kineticrouter/portal-contract';
import { resolvePublicConsoleOrigin } from '@/data/public-console-origin.mjs';
import { publicRequestOrigin } from '@/data/console';
import { loadWebsiteSocialLinks } from '@/data/website-settings';
import { SocialIcon } from '@kineticrouter/brand-ui';

export async function FooterSocialLinks() {
  const origin = resolvePublicConsoleOrigin(
    process.env.KINETICROUTER_CONSOLE_ORIGIN ?? process.env.NEXT_PUBLIC_KINETICROUTER_CONSOLE_ORIGIN,
    publicRequestOrigin(await headers()), process.env.NODE_ENV === 'development',
  );
  const links = await loadWebsiteSocialLinks(origin);
  // Never resurrect an administrator's removed or replaced links during an outage.
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
