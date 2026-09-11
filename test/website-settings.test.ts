import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SOCIAL_LINKS, socialLinksSchema, websiteSettingsSchema } from '@kineticrouter/portal-contract';
import { readCapabilities, Sub2ApiClient } from '@kineticrouter/sub2api-client';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createSession } from '../apps/bff/src/session-store';
import { FileWebsiteSettingsStore, MemoryWebsiteSettingsStore } from '../apps/bff/src/website-settings';
import { loadWebsiteSocialLinks } from '../apps/site/data/website-settings';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

async function fixture(role: 'admin' | 'user' = 'admin', upstreamRole = role) {
  const profile = { id: 42, username: 'Administrator', email: 'fixture@example.com', role: upstreamRole, status: 'active' };
  const upstream = vi.fn(async (url: string | URL | Request) => {
    if (!new URL(String(url)).pathname.endsWith('/user/profile')) throw new Error('Unexpected upstream request');
    return Response.json({ code: 0, data: profile });
  });
  const settings = new MemoryWebsiteSettingsStore();
  const instance = createApp(undefined, { websiteSettingsStore: settings, client: new Sub2ApiClient('https://account.invalid/api/v1', upstream as typeof fetch), analyticsEnabled: false });
  cleanup.push(() => Promise.all([instance.store.close(), instance.websiteSettings.close(), instance.playgroundSettings.close(), instance.analytics.close(), instance.conversations.close(), instance.authFlows.close()]));
  const session = createSession({
    user: { id: '42', username: 'Administrator', email: 'fixture@example.com', role, status: 'active', balance: '0', concurrency: 1, avatarUrl: null },
    capabilities: readCapabilities({}, { keys: false, profile: false, redeem: false }),
    tokens: { accessToken: 'fixture-access', refreshToken: 'fixture-refresh', expiresAt: Date.now() + 3600_000 },
  });
  await instance.store.set(session);
  const headers = { cookie: `${config.sessionCookieName}=${session.id}`, origin: config.portalOrigin, 'x-csrf-token': session.csrfToken, 'content-type': 'application/json' };
  return { ...instance, settings, headers, upstream, profile };
}

describe('website social link validation', () => {
  it('accepts the supplied profiles and invite links, and preserves intentionally hidden links', () => {
    expect(socialLinksSchema.parse(DEFAULT_SOCIAL_LINKS)).toEqual(DEFAULT_SOCIAL_LINKS);
    expect(socialLinksSchema.parse({ ...DEFAULT_SOCIAL_LINKS, x: '  ', telegram: '' })).toMatchObject({ x: '', telegram: '' });
    expect(socialLinksSchema.safeParse({ ...DEFAULT_SOCIAL_LINKS, whatsapp: 'https://wa.me/1234567890' }).success).toBe(true);
  });
  it.each(['javascript:alert(1)', 'http://x.com/kineticrouter', 'https://x.com.evil.invalid/profile', 'https://evil.invalid/x.com', 'https://user:password@x.com/profile', 'https://x.com:8443/profile', 'https://x.com/unsafe\npath', 'https://x.com\\@evil.invalid', 'https://x.com/' + 'a'.repeat(500)])('rejects unsafe social URL %s', x => {
    expect(socialLinksSchema.safeParse({ ...DEFAULT_SOCIAL_LINKS, x }).success).toBe(false);
  });
  it('rejects extra fields, missing platforms, and invalid revisions', () => {
    expect(websiteSettingsSchema.safeParse({ revision: -1, socialLinks: DEFAULT_SOCIAL_LINKS }).success).toBe(false);
    expect(websiteSettingsSchema.safeParse({ revision: 0, socialLinks: DEFAULT_SOCIAL_LINKS, secret: 'fixture-secret' }).success).toBe(false);
    expect(socialLinksSchema.safeParse({ x: DEFAULT_SOCIAL_LINKS.x }).success).toBe(false);
  });
});

describe('website settings access and public delivery', () => {
  const path = '/portal/v1/admin/website/settings';
  const update = { revision: 0, socialLinks: { ...DEFAULT_SOCIAL_LINKS, x: 'https://x.com/updated', telegram: '' } };
  it('publishes admin edits without exposing revision or authentication data', async () => {
    const { app, headers, upstream } = await fixture();
    const before = await app.request('/portal/v1/website', { headers: { origin: 'https://kineticrouter.com' } });
    expect(before.status).toBe(200);
    expect(before.headers.get('access-control-allow-origin')).toBe('*');
    expect(before.headers.get('access-control-allow-credentials')).toBeNull();
    expect((await before.json()).data).toEqual({ socialLinks: DEFAULT_SOCIAL_LINKS });
    expect(upstream).not.toHaveBeenCalled();
    expect((await app.request(path, { headers })).status).toBe(200);
    const saved = await app.request(path, { method: 'PUT', headers, body: JSON.stringify(update) });
    expect(saved.status).toBe(200);
    expect((await saved.json()).data).toEqual({ ...update, revision: 1 });
    expect(upstream).toHaveBeenCalledTimes(2); // Admin role rechecked for the write.
    expect((await (await app.request('/portal/v1/website')).json()).data).toEqual({ socialLinks: update.socialLinks });
    expect((await app.request(path, { method: 'PUT', headers, body: JSON.stringify(update) })).status).toBe(409);
  });
  it('rejects anonymous, customer, and revoked-admin access', async () => {
    const { app, headers } = await fixture('user');
    expect((await app.request(path)).status).toBe(401);
    expect((await app.request(path, { method: 'PUT', body: JSON.stringify(update) })).status).toBe(401);
    expect((await app.request(path, { headers })).status).toBe(403);
    expect((await app.request(path, { method: 'PUT', headers, body: JSON.stringify(update) })).status).toBe(403);
    const revoked = await fixture('admin', 'user');
    expect((await revoked.app.request(path, { method: 'PUT', headers: revoked.headers, body: JSON.stringify(update) })).status).toBe(403);
  });
  it('requires the correct Origin and CSRF token and validates writes', async () => {
    const { app, headers, settings } = await fixture();
    for (const changed of [{ origin: 'https://evil.invalid' }, { 'x-csrf-token': '' }]) {
      expect((await app.request(path, { method: 'PUT', headers: { ...headers, ...changed }, body: JSON.stringify(update) })).status).toBe(403);
    }
    expect((await app.request(path, { method: 'PUT', headers, body: JSON.stringify({ ...update, socialLinks: { ...update.socialLinks, x: 'javascript:alert(1)' } }) })).status).toBe(400);
    expect((await settings.read()).revision).toBe(0);
  });
  it('reports unavailable storage without overwriting or silently returning defaults', async () => {
    const { app, settings } = await fixture();
    const { WebsiteSettingsError } = await import('../apps/bff/src/website-settings');
    vi.spyOn(settings, 'read').mockRejectedValue(new WebsiteSettingsError(503));
    const response = await app.request('/portal/v1/website');
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('WEBSITE_SETTINGS_UNAVAILABLE');
  });
});

describe('website settings persistence', () => {
  it('persists hidden links across instances and prevents concurrent overwrite', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kinetic-website-settings-'));
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, 'settings.json');
    const first = new FileWebsiteSettingsStore(file), second = new FileWebsiteSettingsStore(file);
    const original = await first.read();
    const update = { ...original, socialLinks: { ...original.socialLinks, telegram: '' } };
    const results = await Promise.allSettled([first.save(update), second.save(original)]);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as PromiseRejectedResult).reason.status).toBe(409);
    expect(await new FileWebsiteSettingsStore(file).read()).toEqual({ ...update, revision: 1 });
    await writeFile(file, '{corrupt');
    await expect(first.save({ ...original, revision: 1 })).rejects.toMatchObject({ status: 503 });
    expect(await readFile(file, 'utf8')).toBe('{corrupt');
  });
});

describe('public website settings loading', () => {
  it('renders saved changes and deliberately empty URLs instead of the original defaults', async () => {
    const socialLinks = { ...DEFAULT_SOCIAL_LINKS, x: 'https://x.com/updated', telegram: '' };
    const fetcher = vi.fn(async () => Response.json({ ok: true, data: { socialLinks } }));
    expect(await loadWebsiteSocialLinks('https://console.example.com', fetcher)).toEqual(socialLinks);
    expect(fetcher).toHaveBeenCalledWith('https://console.example.com/portal/v1/website', expect.objectContaining({ credentials: 'omit', cache: 'no-store', redirect: 'manual' }));
  });
  it('omits the row on outages or malformed responses without resurrecting removed links', async () => {
    for (const response of [Response.redirect('https://other.example.com'), Response.json({}, { status: 503 }), Response.json({ ok: true, data: {} }), Response.json({ ok: true, data: { socialLinks: { ...DEFAULT_SOCIAL_LINKS, x: 'javascript:alert(1)' } } })]) {
      expect(await loadWebsiteSocialLinks('https://console.example.com', async () => response)).toBeNull();
    }
    expect(await loadWebsiteSocialLinks('https://console.example.com', async () => { throw new Error('Unavailable'); })).toBeNull();
  });
});
