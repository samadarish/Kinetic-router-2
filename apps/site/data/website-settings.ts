import { publicWebsiteSettingsSchema, type SocialLinks } from '@kineticrouter/portal-contract';

export async function loadWebsiteSocialLinks(consoleOrigin: string, fetcher: typeof fetch = fetch): Promise<SocialLinks | null> {
  try {
    const response = await fetcher(`${consoleOrigin}/portal/v1/website`, {
      credentials: 'omit', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(1500),
      headers: { Accept: 'application/json' },
    });
    // Manual redirects work in both Node and the site's worker runtime; reject 3xx responses.
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('ok' in payload) || payload.ok !== true || !('data' in payload)) return null;
    const parsed = publicWebsiteSettingsSchema.safeParse(payload.data);
    return parsed.success ? parsed.data.socialLinks : null;
  } catch { return null; }
}
