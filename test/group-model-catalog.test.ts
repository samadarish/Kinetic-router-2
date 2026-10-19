import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupModelCatalogSchema, type GroupModelCatalog } from '@kineticrouter/portal-contract';
import { Sub2ApiClient, readCapabilities } from '@kineticrouter/sub2api-client';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createSession, type SessionStore } from '../apps/bff/src/session-store';
import { MemoryPlaygroundSettingsStore, PlaygroundSettingsError, type PlaygroundSettingsStore } from '../apps/bff/src/playground-settings';

const stores: SessionStore[] = [];
afterEach(async () => { await Promise.all(stores.splice(0).map(store => store.close())); });

async function fixture(settingsStore?: PlaygroundSettingsStore) {
  const settings = settingsStore ?? new MemoryPlaygroundSettingsStore();
  if (!settingsStore) await settings.save({ revision: 0, playgroundEnabled: false,
    enabledModelIds: ['gpt-5.4', 'openai/gpt-5.4-mini', 'kimi-k2.5', 'claude-opus-4.6', 'private-alias'],
    modelIdentities: [{ modelId: 'gpt-5.4', name: 'PRIVATE_IDENTITY', knowledgeCutoff: '2026-01' }],
  });
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path !== '/api/v1/groups/available') throw new Error(`Unexpected request: ${path}`);
    const other = new Headers(init?.headers).get('authorization') === 'Bearer other-customer-access';
    const groups = other ? [{ id: 9, name: 'Anthropic', platform: 'anthropic' }] : [
      { id: 7, name: 'OpenAI', platform: 'openai' }, { id: 12, name: 'Moonshot', platform: 'openai' }, { id: 15, name: 'Custom', platform: 'composite' },
    ];
    return Response.json({ code: 0, data: groups.map(group => ({ ...group, rate_multiplier: 999, model_routing: 'PRIVATE_ROUTING', key: 'PRIVATE_KEY' })) });
  });
  const instance = createApp(undefined, { client: new Sub2ApiClient('https://account.invalid/api/v1', fetcher), playgroundSettingsStore: settings, analyticsEnabled: false });
  stores.push(instance.store);
  const sessions = await Promise.all(['42', '84'].map(async (id, index) => {
    const session = createSession({ user: { id, username: 'Customer', email: 'fixture@example.test', role: 'user', status: 'active', balance: '0', concurrency: 1, avatarUrl: null },
      capabilities: readCapabilities({}, { keys: true, profile: false, redeem: false }),
      tokens: { accessToken: index ? 'other-customer-access' : 'first-customer-access', refreshToken: 'PRIVATE_REFRESH', expiresAt: Date.now() + 3_600_000 } });
    await instance.store.set(session);
    return session;
  }));
  const get = (index = 0) => instance.app.request('/portal/v1/groups/model-catalog', { headers: { cookie: `${config.sessionCookieName}=${sessions[index]!.id}` } });
  const data = async (index = 0): Promise<GroupModelCatalog> => groupModelCatalogSchema.parse((await (await get(index)).json()).data);
  return { ...instance, settings, fetcher, get, data };
}

describe('shared model previews for API key groups', () => {
  it('works before a first key exists, filters by company, and returns only allowlisted preview fields', async () => {
    const fx = await fixture();
    const response = await fx.get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(groupModelCatalogSchema.parse(body.data)).toEqual({ revision: 1, groups: [
      { groupId: '7', provider: 'openai', models: ['gpt-5.4', 'openai/gpt-5.4-mini'] },
      { groupId: '12', provider: 'moonshot', models: ['kimi-k2.5'] },
      { groupId: '15', provider: 'unknown', models: [] },
    ] });
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE|rate_multiplier|enabledModelIds|modelIdentities|knowledgeCutoff|private-alias|claude/);
    expect(fx.fetcher).toHaveBeenCalledTimes(1);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('never mixes catalogs across customers or includes groups the account service did not return', async () => {
    const fx = await fixture();
    expect((await fx.data(1)).groups).toEqual([{ groupId: '9', provider: 'anthropic', models: ['claude-opus-4.6'] }]);
    expect((await fx.data()).groups.map(group => group.groupId)).toEqual(['7', '12', '15']);
  });

  it('uses saved updates immediately, including an empty selection, independently of the Playground switch', async () => {
    const fx = await fixture();
    await fx.settings.save({ revision: 1, enabledModelIds: ['kimi-k2.5'], playgroundEnabled: false });
    expect((await fx.data()).groups.map(group => group.models)).toEqual([[], ['kimi-k2.5'], []]);
    await fx.settings.save({ revision: 2, enabledModelIds: [] });
    expect((await fx.data()).groups.every(group => group.models.length === 0)).toBe(true);
  });

  it('requires authentication without fetching groups', async () => {
    const fx = await fixture();
    expect((await fx.app.request('/portal/v1/groups/model-catalog')).status).toBe(401);
    expect(fx.fetcher).not.toHaveBeenCalled();
  });

  it('returns a safe unavailable response if the shared settings store fails', async () => {
    const fx = await fixture({ read: async () => { throw new PlaygroundSettingsError(503); }, save: async () => { throw new PlaygroundSettingsError(503); }, close: async () => {} });
    const response = await fx.get();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'PLAYGROUND_SETTINGS_UNAVAILABLE' } });
  });
});
