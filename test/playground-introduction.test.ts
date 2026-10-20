import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readCapabilities, Sub2ApiClient } from '@kineticrouter/sub2api-client';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createSession } from '../apps/bff/src/session-store';
import { FilePlaygroundIntroductionStore, PlaygroundIntroductionError } from '../apps/bff/src/playground-introduction';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
async function fixture() {
  const upstream = vi.fn(async () => { throw new Error('Unexpected fixture network request'); });
  const instance = createApp(undefined, { analyticsEnabled: false, client: new Sub2ApiClient('https://fixture.invalid/api/v1', upstream) });
  cleanup.push(() => Promise.all([instance.store.close(), instance.analytics.close(), instance.playgroundSettings.close(), instance.websiteSettings.close(), instance.playgroundIntroduction.close(), instance.conversations.close(), instance.authFlows.close(), instance.supportStore.close(), instance.supportRealtime.close()]));
  const login = async (id: string, role = 'user') => {
    const session = createSession({
      user: { id, role, status: 'active', username: 'Fixture', email: 'fixture@example.test', avatarUrl: null, balance: '0', concurrency: 1 },
      capabilities: readCapabilities({}, { keys: false, profile: false, redeem: false }),
      tokens: { accessToken: 'fixture-access', refreshToken: 'fixture-refresh', expiresAt: Date.now() + 3_600_000 },
    });
    await instance.store.set(session);
    return { cookie: `${config.sessionCookieName}=${session.id}`, origin: config.portalOrigin, 'x-csrf-token': session.csrfToken, 'content-type': 'application/json' };
  };
  return { ...instance, login, upstream };
}
const path = '/portal/v1/me/playground-introduction';

describe('account Playground introductions', () => {
  it.each(['user', 'admin'])('remembers a %s visit across sessions without changing another account', async role => {
    const { app, login, upstream } = await fixture();
    const headers = await login('42', role), other = await login('43', role);
    const read = async (value = headers) => (await (await app.request(path, { headers: value })).json()).data;
    expect(await read()).toEqual({ visited: false });
    for (let i = 0; i < 2; i++) {
      const result = await app.request(`${path}/visited`, { method: 'POST', headers, body: '{}' });
      expect(result.status).toBe(200);
      expect((await result.json()).data).toEqual({ visited: true });
    }
    expect(await read()).toEqual({ visited: true });
    expect(await read(other)).toEqual({ visited: false });
    expect(await read(await login('42', role))).toEqual({ visited: true });
    expect(upstream).not.toHaveBeenCalled();
  });
  it('requires authentication, console Origin, and CSRF for completion', async () => {
    const { app, login, playgroundIntroduction } = await fixture();
    const headers = await login('42');
    const save = vi.spyOn(playgroundIntroduction, 'markVisited');
    expect((await app.request(path)).status).toBe(401);
    expect((await app.request(`${path}/visited`, { method: 'POST', body: '{}' })).status).toBe(401);
    for (const changed of [{ origin: 'https://evil.invalid' }, { origin: '' }, { 'x-csrf-token': '' }]) {
      expect((await app.request(`${path}/visited`, { method: 'POST', headers: { ...headers, ...changed }, body: '{}' })).status).toBe(403);
    }
    expect(save).not.toHaveBeenCalled();
    const response = await app.request(path, { headers });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('rejects a supplied account ID, a reset, and malformed input', async () => {
    const { app, login, playgroundIntroduction } = await fixture();
    const headers = await login('42');
    for (const body of ['{"userId":"43"}', '{"visited":false}', '{invalid']) {
      expect((await app.request(`${path}/visited`, { method: 'POST', headers, body })).status).toBe(400);
    }
    expect(await playgroundIntroduction.visited('42')).toBe(false);
    expect(await playgroundIntroduction.visited('43')).toBe(false);
  });
  it('isolates storage failures from authentication and the rest of the console', async () => {
    const { app, login, playgroundIntroduction } = await fixture();
    const headers = await login('42');
    vi.spyOn(playgroundIntroduction, 'visited').mockRejectedValue(new PlaygroundIntroductionError());
    vi.spyOn(playgroundIntroduction, 'markVisited').mockRejectedValue(new PlaygroundIntroductionError());
    expect((await app.request(path, { headers })).status).toBe(503);
    expect((await app.request(`${path}/visited`, { method: 'POST', headers, body: '{}' })).status).toBe(503);
    expect((await app.request('/healthz')).status).toBe(200);
    expect((await (await app.request('/portal/v1/auth/session', { headers })).json()).data.authenticated).toBe(true);
  });
});

describe('local Playground introduction persistence', () => {
  it('retains visits across instances, serializes concurrent accounts, and preserves a corrupt file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kinetic-playground-intro-'));
    cleanup.push(async () => {
      if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('kinetic-playground-intro-')) throw new Error('Unexpected fixture directory');
      await rm(directory, { recursive: true, force: true });
    });
    const file = join(directory, 'visited.json');
    const first = new FilePlaygroundIntroductionStore(file), second = new FilePlaygroundIntroductionStore(file);
    expect(await first.visited('42')).toBe(false);
    await Promise.all([first.markVisited('42'), second.markVisited('43'), first.markVisited('42')]);
    await first.close(); await second.close();
    const restarted = new FilePlaygroundIntroductionStore(file);
    expect(await restarted.visited('42')).toBe(true);
    expect(await restarted.visited('43')).toBe(true);
    expect(await restarted.visited('44')).toBe(false);
    expect(JSON.parse(await readFile(file, 'utf8')).visited).toHaveLength(2);
    await writeFile(file, '{invalid');
    await expect(restarted.visited('42')).rejects.toBeInstanceOf(PlaygroundIntroductionError);
    await expect(restarted.markVisited('44')).rejects.toBeInstanceOf(PlaygroundIntroductionError);
    expect(await readFile(file, 'utf8')).toBe('{invalid');
  });
});
