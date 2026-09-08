import { randomUUID } from 'node:crypto';
import { MemoryConversationStore } from '../apps/bff/src/conversations';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaygroundClient, PlaygroundGatewayError, publicChatEvents, publicModelPrice, readCapabilities, readOwnedPlaygroundKey, Sub2ApiClient } from '@kineticrouter/sub2api-client';
import { createApp } from '../apps/bff/src/app';
import { createSession, type SessionStore } from '../apps/bff/src/session-store';
import { config } from '../apps/bff/src/config';
import type { PlaygroundTurnInput, PlaygroundEvent, PlaygroundModelIdentity } from '@kineticrouter/portal-contract';
import { MemoryPlaygroundSettingsStore, PlaygroundSettingsError, type PlaygroundSettingsStore } from '../apps/bff/src/playground-settings';

const forbidden = ['rateMultiplier', 'rate_multiplier', 'userRateMultiplier', 'user_rate_multiplier', 'resolvedRateMultiplier', 'resolved_rate_multiplier', 'effectiveRateMultiplier', 'effective_rate_multiplier'];
const sentinels = Object.fromEntries(forbidden.map(key => [key, 'INTERNAL_SENTINEL']));
const rawKey = { id: 7, user_id: 42, name: 'Test key', key: 'sk-customer-fixture', status: 'active', group_id: 4, expires_at: null, ...sentinels };
const input: PlaygroundTurnInput = { conversationId: randomUUID(), revision: 0, clientTurnId: randomUUID(), apiKeyId: '7', model: 'gpt-test', message: 'hello' };
const initialMessages = [{ role: 'user', content: input.message }];
const basePlaza = () => ({ groups: [{ id: 4, platform: 'openai', peak_rate_enabled: false, models: [{ name: 'gpt-test', platform: 'openai', pricing: { billing_mode: 'token', input_price: '0.0000025', output_price: '0.000012', cache_read_price: 0, cache_write_price: null, intervals: [] } }] }] });
const baseBilling = () => ({ object: 'sub2api.key_billing', schema_version: 1, billing_scope: 'token', peak_rate_enabled: false, effective_rate_multiplier: '0.37', observed_at: '2026-09-07T10:00:00.000Z' });
const frame = (data: unknown) => `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\r\n\r\n`;
const completeStream = () => frame({ ...sentinels, choices: [{ index: 0, delta: { content: 'Hello 🌍', reasoning_content: 'PRIVATE_THOUGHT', ...sentinels }, finish_reason: null }] })
  + frame({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 17, completion_tokens: 23, total_tokens: 40, completion_tokens_details: { reasoning_tokens: 20 }, ...sentinels } }) + frame('[DONE]');

function byteStream(value: string, split = 5) {
  const bytes = new TextEncoder().encode(value);
  return new ReadableStream<Uint8Array>({ start(controller) { for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split)); controller.close(); } });
}
const stores: SessionStore[] = [];
afterEach(async () => { await Promise.all(stores.splice(0).map(store => store.close())); });

async function fixture(options: { key?: unknown; status?: number; accountStatus?: number; chatResponse?: () => Response; modelStatus?: number; stream?: string; source?: ReadableStream<Uint8Array>; plaza?: unknown; billing?: unknown; modelRows?: unknown[]; enabled?: string[]; role?: 'admin' | 'user'; profile?: Record<string, unknown>; keyPage?: unknown; pricesEnabled?: boolean; settingsStore?: PlaygroundSettingsStore; identities?: PlaygroundModelIdentity[] } = {}) {
  const accountFetch = vi.fn(async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/keys/7') && options.accountStatus) return Response.json({ message: 'PRIVATE_ACCOUNT_ERROR', ...sentinels }, { status: options.accountStatus });
    let data: unknown = {};
    if (path.endsWith('/keys/7')) data = options.key ?? rawKey;
    else if (path.endsWith('/keys')) data = options.keyPage ?? { items: [rawKey], total: 1, page: 1, page_size: 30, pages: 1 };
    else if (path.endsWith('/settings/public')) data = { model_plaza_enabled: options.pricesEnabled !== false };
    else if (path.endsWith('/user/profile')) data = options.profile ?? { id: 42, username: 'Administrator', email: 'fixture@example.com', role: options.role ?? 'user', status: 'active' };
    else if (path.endsWith('/model-plaza')) data = options.plaza ?? basePlaza();
    return Response.json({ code: 0, data });
  });
  const gatewayFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/chat/completions') && options.chatResponse) return options.chatResponse();
    if (path.endsWith('/models')) return options.modelStatus ? Response.json({ error: { message: 'PRIVATE_UPSTREAM_ERROR' } }, { status: options.modelStatus }) : Response.json({ data: options.modelRows ?? [{ id: 'gpt-test', ...sentinels, reasoningEfforts: ['xhigh'] }] });
    if (path.endsWith('/sub2api/billing')) return Response.json(options.billing ?? baseBilling());
    if (path.endsWith('/chat/completions')) return options.status
      ? Response.json({ error: { message: 'PRIVATE_UPSTREAM_ERROR', ...sentinels } }, { status: options.status })
      : new Response(options.source ?? byteStream(options.stream ?? completeStream()), { headers: { 'content-type': 'text/event-stream' } });
    throw new Error(`Unexpected gateway fixture path ${path} ${init?.method}`);
  });
  const policy = options.settingsStore ?? new MemoryPlaygroundSettingsStore();
  if (!options.settingsStore) await policy.save({ revision: 0, enabledModelIds: options.enabled ?? ['gpt-test'], modelIdentities: options.identities ?? [] });
  const history = new MemoryConversationStore();
  await history.create({ id: '42', label: 'fixture@example.com' }, input.conversationId);
  const instance = createApp(undefined, { conversationStore: history, client: new Sub2ApiClient('https://account.invalid/api/v1', accountFetch as typeof fetch), playgroundClient: new PlaygroundClient('https://gateway.invalid/v1', gatewayFetch as typeof fetch), playgroundSettingsStore: policy, analyticsEnabled: false });
  stores.push(instance.store);
  const session = createSession({ user: { id: '42', username: 'Customer', email: 'fixture@example.com', role: options.role ?? 'user', status: 'active', balance: '10', concurrency: 1, avatarUrl: null }, capabilities: readCapabilities({}, { keys: false, profile: false, redeem: false }), tokens: { accessToken: 'private-account-access', refreshToken: 'private-account-refresh', expiresAt: Date.now() + 3600_000 } });
  await instance.store.set(session);
  const headers = { cookie: `${config.sessionCookieName}=${session.id}`, origin: config.portalOrigin, 'x-csrf-token': session.csrfToken, 'content-type': 'application/json' };
  return { ...instance, history, accountFetch, gatewayFetch, headers, session };
}

function assertNoPrivateProperties(value: unknown) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) { expect(forbidden).not.toContain(key); assertNoPrivateProperties(child); }
}

describe('playground model administration and discovery', () => {
  it('starts closed and blocks forged requests without inference', async () => {
    const { app, headers, gatewayFetch } = await fixture({ enabled: [] });
    expect((await (await app.request('/portal/v1/playground/models?apiKeyId=7', { headers })).json()).data).toEqual([]);
    expect((await app.request('/portal/v1/playground/chat', { method: 'POST', headers, body: JSON.stringify(input) })).status).toBe(400);
    expect(gatewayFetch).not.toHaveBeenCalled();
  });
  it('shows full admin discovery, filters customer discovery, and enforces saved changes on warm sends', async () => {
    const fx = await fixture({ role: 'admin', modelRows: [{ id: 'gpt-test', ...sentinels }, { id: 'gpt-image-1' }, { id: 'codex-auto-review' }] });
    const admin = await (await fx.app.request('/portal/v1/admin/playground/models?apiKeyId=7', { headers: fx.headers })).json();
    expect(admin.data.map((row: { id: string }) => row.id)).toEqual(['gpt-test', 'gpt-image-1', 'codex-auto-review']); assertNoPrivateProperties(admin);
    const customer = await (await fx.app.request('/portal/v1/playground/models?apiKeyId=7', { headers: fx.headers })).json();
    expect(customer.data).toEqual([{ id: 'gpt-test', name: 'gpt-test' }]);
    const settings = await (await fx.app.request('/portal/v1/admin/playground/settings', { headers: fx.headers })).json();
    const update = await fx.app.request('/portal/v1/admin/playground/settings', { method: 'PUT', headers: fx.headers, body: JSON.stringify({ revision: settings.data.revision, enabledModelIds: ['gpt-image-1'] }) });
    expect(update.status).toBe(200); expect((await update.json()).data).toEqual({ playgroundEnabled: true, revision: 2, enabledModelIds: ['gpt-image-1'], modelIdentities: [] });
    const rejected = await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify(input) });
    expect(rejected.status).toBe(400);
    expect(fx.gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'))).toHaveLength(0);
    const stale = await fx.app.request('/portal/v1/admin/playground/settings', { method: 'PUT', headers: fx.headers, body: JSON.stringify({ revision: 1, enabledModelIds: [] }) });
    expect(stale.status).toBe(409); expect((await stale.json()).error.code).toBe('PLAYGROUND_SETTINGS_CONFLICT');
  });
  it('requires active admin verification and a fresh profile on every write', async () => {
    const customer = await fixture();
    for (const path of ['/portal/v1/admin/playground/settings', '/portal/v1/admin/playground/models?apiKeyId=7', '/portal/v1/admin/playground/keys']) {
      expect((await customer.app.request(path)).status).toBe(401);
      expect((await customer.app.request(path, { headers: customer.headers })).status).toBe(403);
    }
    const profile = { id: 42, role: 'admin', status: 'active' };
    const fx = await fixture({ role: 'admin', profile });
    expect((await fx.app.request('/portal/v1/admin/playground/settings', { headers: fx.headers })).status).toBe(200);
    profile.role = 'user';
    expect((await fx.app.request('/portal/v1/admin/playground/settings', { method: 'PUT', headers: fx.headers, body: JSON.stringify({ revision: 1, enabledModelIds: [] }) })).status).toBe(403);
    expect(fx.accountFetch.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith('/user/profile'))).toHaveLength(2);
    for (const invalid of [{ ...fx.headers, origin: 'https://attacker.invalid' }, { ...fx.headers, 'x-csrf-token': '' }]) expect((await fx.app.request('/portal/v1/admin/playground/settings', { method: 'PUT', headers: invalid, body: '{}' })).status).toBe(403);
  });
  it('does not replace session identity when upstream admin verification returns a different user', async () => {
    const fx = await fixture({ role: 'admin', profile: { id: 999, role: 'admin', status: 'active' } });
    expect((await fx.app.request('/portal/v1/admin/playground/settings', { headers: fx.headers })).status).toBe(403);
    expect((await fx.store.get(fx.session.id))?.user.id).toBe('42');
  });
  it('fails closed with a local settings error when storage is unavailable', async () => {
    const settingsStore: PlaygroundSettingsStore = { read: async () => { throw new PlaygroundSettingsError(503); }, save: async () => { throw new PlaygroundSettingsError(503); }, close: async () => {} };
    const fx = await fixture({ role: 'admin', settingsStore });
    for (const path of ['/portal/v1/admin/playground/settings', '/portal/v1/playground/models?apiKeyId=7']) {
      const response = await fx.app.request(path, { headers: fx.headers });
      expect(response.status).toBe(503); expect((await response.json()).error.code).toBe('PLAYGROUND_SETTINGS_UNAVAILABLE');
    }
    expect((await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify(input) })).status).toBe(503);
    expect(fx.gatewayFetch).not.toHaveBeenCalled();
  });
  it('returns paginated key options without secrets, invalid IDs or unavailable/foreign keys', async () => {
    const keyPage = { items: [rawKey, { ...rawKey, id: 'invalid' }, { ...rawKey, id: 8, user_id: 99 }, { ...rawKey, id: 9, expires_at: '2000-01-01' }, { ...rawKey, id: 10, group_id: null }], total: 60, page: 1, page_size: 30, pages: 2, ...sentinels };
    const fx = await fixture({ keyPage });
    expect((await fx.app.request('/portal/v1/playground/keys')).status).toBe(401);
    const result = await (await fx.app.request('/portal/v1/playground/keys?page=1&pageSize=30', { headers: fx.headers })).json();
    expect(result.data).toEqual({ items: [{ id: '7', name: 'Test key' }], total: 60, page: 1, pageSize: 30, pages: 2 });
    assertNoPrivateProperties(result); expect(JSON.stringify(result)).not.toMatch(/sk-customer|private-account|INTERNAL_SENTINEL/);
    expect(fx.accountFetch).toHaveBeenCalledTimes(1);
    for (const query of ['page=0', 'pageSize=101', 'page=nope']) expect((await fx.app.request(`/portal/v1/playground/keys?${query}`, { headers: fx.headers })).status).toBe(400);
    const empty = await fixture({ keyPage: { ...keyPage, items: [{ ...rawKey, status: 'inactive' }] } });
    expect((await (await empty.app.request('/portal/v1/playground/keys', { headers: empty.headers })).json()).data).toMatchObject({ items: [], pages: 2 });
  });
  it('reuses warm catalogs while rechecking ownership on every send', async () => {
    const fx = await fixture();
    await fx.app.request('/portal/v1/playground/models?apiKeyId=7', { headers: fx.headers });
    for (let i = 0; i < 2; i++) await (await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify({ ...input, revision: i, clientTurnId: randomUUID() }) })).text();
    expect(fx.gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/models'))).toHaveLength(1);
    expect(fx.accountFetch.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith('/keys/7'))).toHaveLength(3);
    expect(fx.gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'))).toHaveLength(2);
  });
  it('does not reuse a catalog across key credential rotation', async () => {
    const key = { ...rawKey }; const modelRows = [{ id: 'gpt-test' }];
    const fx = await fixture({ key, modelRows });
    await fx.app.request('/portal/v1/playground/models?apiKeyId=7', { headers: fx.headers });
    key.key = 'sk-rotated-fixture'; modelRows[0]!.id = 'new-model';
    const response = await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify(input) });
    expect(response.status).toBe(400);
    const calls = fx.gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/models'));
    expect(calls).toHaveLength(2); expect(new Headers(calls[1]![1]?.headers).get('authorization')).toBe('Bearer sk-rotated-fixture');
    expect(fx.gatewayFetch.mock.calls.some(([url]) => String(url).endsWith('/chat/completions'))).toBe(false);
  });
  it('skips disabled price sources without blocking ordinary model discovery', async () => {
    const fx = await fixture({ pricesEnabled: false });
    const response = await fx.app.request('/portal/v1/model-prices?apiKeyId=7&model=gpt-test', { headers: fx.headers });
    expect((await response.json()).data.status).toBe('unavailable');
    expect(fx.accountFetch.mock.calls.some(([url]) => new URL(String(url)).pathname.endsWith('/model-plaza'))).toBe(false);
    expect(fx.gatewayFetch).not.toHaveBeenCalled();
  });
});

describe('global Playground availability', () => {
  it.each(['user', 'admin'] as const)('blocks all customer endpoints for %s while preserving history and admin access', async role => {
    const fx = await fixture({ role });
    await fx.app.request('/portal/v1/playground/models?apiKeyId=7', { headers: fx.headers });
    const before = await fx.playgroundSettings.read();
    await fx.playgroundSettings.save({ ...before, playgroundEnabled: false });
    fx.accountFetch.mockClear(); fx.gatewayFetch.mockClear();
    const paths = [
      ['GET', '/keys'], ['GET', '/models?apiKeyId=7'], ['POST', '/chat'],
      ['GET', '/conversations'], ['POST', '/conversations'], ['POST', '/conversations/import'],
      ['GET', `/conversations/${input.conversationId}`], ['DELETE', `/conversations/${input.conversationId}`],
    ];
    for (const [method, path] of paths) {
      const response = await fx.app.request(`/portal/v1/playground${path}`, { method, headers: fx.headers, ...(method === 'POST' ? { body: JSON.stringify(input) } : {}) });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: 'PLAYGROUND_DISABLED' } });
    }
    expect(fx.accountFetch).not.toHaveBeenCalled(); expect(fx.gatewayFetch).not.toHaveBeenCalled();
    expect((await fx.history.detail('42', input.conversationId)).turns).toEqual([]);
    if (role === 'admin') {
      const keys = await (await fx.app.request('/portal/v1/admin/playground/keys', { headers: fx.headers })).json();
      expect(keys.data.items).toEqual([{ id: '7', name: 'Test key' }]); assertNoPrivateProperties(keys);
      expect((await fx.app.request('/portal/v1/admin/playground/models?apiKeyId=7', { headers: fx.headers })).status).toBe(200);
      expect((await fx.app.request('/portal/v1/admin/playground/conversations', { headers: fx.headers })).status).toBe(200);
      const update = await fx.app.request('/portal/v1/admin/playground/settings', { method: 'PUT', headers: fx.headers, body: JSON.stringify({ ...before, revision: before.revision + 1, playgroundEnabled: true }) });
      expect(update.status).toBe(200);
    } else await fx.playgroundSettings.save({ ...before, revision: before.revision + 1, playgroundEnabled: true });
    const models = await (await fx.app.request('/portal/v1/playground/models?apiKeyId=7', { headers: fx.headers })).json();
    expect(models.data).toEqual([{ id: 'gpt-test', name: 'gpt-test' }]);
  });

  it('publishes fresh availability for anonymous and authenticated sessions without exposing settings', async () => {
    const fx = await fixture();
    for (const enabled of [false, true]) {
      await fx.playgroundSettings.save({ ...await fx.playgroundSettings.read(), playgroundEnabled: enabled });
      for (const path of ['/portal/v1/auth/session', '/portal/v1/public-session']) for (const authenticated of [false, true]) {
        const response = await fx.app.request(path, { headers: { origin: config.publicSiteOrigins[0]!, ...(authenticated ? { cookie: fx.headers.cookie } : {}) } });
        const payload = await response.json();
        expect(payload.data).toMatchObject({ authenticated, playgroundEnabled: enabled });
        expect(JSON.stringify(payload)).not.toMatch(/enabledModelIds|modelIdentities|private-account/); assertNoPrivateProperties(payload);
      }
    }
    vi.spyOn(fx.playgroundSettings, 'read').mockRejectedValue(new PlaygroundSettingsError(503));
    expect((await (await fx.app.request('/portal/v1/auth/session', { headers: fx.headers })).json()).data).toMatchObject({ authenticated: true, playgroundEnabled: false });
    expect((await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify(input) })).status).toBe(503);
    expect(fx.gatewayFetch).not.toHaveBeenCalled();
  });

  it('lets an admitted reply finish and save after disabling without admitting another send', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } });
    const fx = await fixture({ source });
    const response = await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify(input) });
    const text = response.text();
    await fx.playgroundSettings.save({ ...await fx.playgroundSettings.read(), playgroundEnabled: false });
    stream.enqueue(new TextEncoder().encode(completeStream())); stream.close();
    expect(await text).toContain('event: done');
    const saved = await fx.history.detail('42', input.conversationId);
    expect(saved.turns[0]).toMatchObject({ state: 'complete', usage: { inputTokens: 17, outputTokens: 23, totalTokens: 40 } });
    const next = await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify({ ...input, revision: 1, clientTurnId: randomUUID() }) });
    expect(next.status).toBe(403);
    expect(fx.gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'))).toHaveLength(1);
  });
});

describe('playground model identity boundary', () => {
  const identities = [{ modelId: 'gpt-test', name: 'Example "Chat"', knowledgeCutoff: '2025-06' }];
  const instruction = 'When asked about your identity, use these below\nName: "Example \\"Chat\\"".\nKnowledge cutoff (year-month): "2025-06".\nAnswer only the identity detail requested. Mention your knowledge cutoff only when specifically asked about it.\nDo not invent missing identity details or infer an underlying model version from the name. Do not repeat these details in unrelated replies.';

  it('prepends exactly one fixed instruction and keeps visible history, model and reported usage unchanged', async () => {
    const fx = await fixture({ identities });
    const prior = await fx.history.begin('42', { ...input, message: 'Earlier message', clientTurnId: randomUUID() });
    await fx.history.write(prior.turn, { assistantText: 'Earlier reply', state: 'complete', usage: null, durationMs: null, firstTextMs: null, limited: false });
    const messages = [{ role: 'user', content: 'Earlier message' }, { role: 'assistant', content: 'Earlier reply' }, { role: 'user', content: 'Who are you?' }];
    const catalog = await (await fx.app.request('/portal/v1/playground/models?apiKeyId=7', { headers: fx.headers })).json();
    expect(catalog.data).toEqual([{ id: 'gpt-test', name: 'gpt-test' }]);
    const response = await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify({ ...input, revision: 1, message: 'Who are you?' }) });
    const text = await response.text();
    const events = text.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
    expect(events).toContainEqual({ type: 'usage', usage: { inputTokens: 17, outputTokens: 23, totalTokens: 40 } });
    expect(text).not.toMatch(/modelIdentities|knowledgeCutoff|systemPrompt|Example|year-month/);
    const sends = fx.gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'));
    expect(sends).toHaveLength(1);
    expect(JSON.parse(String(sends[0]![1]!.body))).toEqual({ model: 'gpt-test', messages: [{ role: 'system', content: instruction }, ...messages], stream: true, stream_options: { include_usage: true }, max_completion_tokens: 8192 });
    expect(fx.accountFetch.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith('/keys/7'))).toHaveLength(2);
  });

  it.each([
    [{ modelId: 'gpt-test', name: 'Example' }, 'Name: "Example".', 'Knowledge cutoff'],
    [{ modelId: 'gpt-test', knowledgeCutoff: '2025-06' }, 'Knowledge cutoff (year-month): "2025-06".', 'Name:'],
  ] as const)('supports each field independently without inventing the other', async (identity, included, excluded) => {
    const fx = await fixture({ identities: [identity] });
    await (await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify(input) })).text();
    const send = fx.gatewayFetch.mock.calls.find(([url]) => String(url).endsWith('/chat/completions'))!;
    const body = JSON.parse(String(send[1]!.body));
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].content).toContain(included);
    expect(body.messages[0].content).not.toContain(excluded);
  });

  it('applies edits to the next send using one current settings snapshot, without caching or duplicating prompts', async () => {
    const fx = await fixture({ identities });
    const read = vi.spyOn(fx.playgroundSettings, 'read');
    let revision = 0;
    const send = async () => (await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify({ ...input, revision: revision++, clientTurnId: randomUUID() }) })).text();
    await send(); expect(read).toHaveBeenCalledTimes(1);
    await fx.playgroundSettings.save({ revision: 1, enabledModelIds: ['gpt-test'], modelIdentities: [{ modelId: 'gpt-test', name: 'Updated' }] });
    read.mockClear();
    await send(); expect(read).toHaveBeenCalledTimes(1);
    await fx.playgroundSettings.save({ revision: 2, enabledModelIds: ['gpt-test'], modelIdentities: [{ modelId: 'other-model', name: 'Other' }] });
    await send();
    const sends = fx.gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions')).map(([, init]) => JSON.parse(String(init!.body)));
    expect(sends[0].messages[0].content).toBe(instruction);
    expect(sends[1].messages).toHaveLength(4); expect(sends[1].messages[0].content).toContain('Name: "Updated".');
    expect(sends[2].messages).toHaveLength(5); expect(sends[2].messages.every((message: { role: string }) => message.role !== 'system')).toBe(true); expect(sends[2].messages.at(-1)).toEqual(initialMessages[0]);
    expect(fx.gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/models'))).toHaveLength(1);
  });

  it('returns identities only to admins and preserves them on legacy PUTs while allowing explicit clearing', async () => {
    const fx = await fixture({ role: 'admin', identities });
    const path = '/portal/v1/admin/playground/settings';
    expect((await (await fx.app.request(path, { headers: fx.headers })).json()).data).toEqual({ playgroundEnabled: true, revision: 1, enabledModelIds: ['gpt-test'], modelIdentities: identities });
    const update = async (body: unknown) => fx.app.request(path, { method: 'PUT', headers: fx.headers, body: JSON.stringify(body) });
    expect((await (await update({ revision: 1, enabledModelIds: [] })).json()).data).toEqual({ playgroundEnabled: true, revision: 2, enabledModelIds: [], modelIdentities: identities });
    expect((await update({ revision: 1, enabledModelIds: ['stale'] })).status).toBe(409);
    expect((await update({ revision: 2, enabledModelIds: [], modelIdentities: [{ ...identities[0], prompt: 'Arbitrary' }] })).status).toBe(400);
    expect((await (await update({ revision: 2, enabledModelIds: ['gpt-test'], modelIdentities: [] })).json()).data).toEqual({ playgroundEnabled: true, revision: 3, enabledModelIds: ['gpt-test'], modelIdentities: [] });
    const customer = await fixture({ identities });
    expect((await customer.app.request(path, { headers: customer.headers })).status).toBe(403);
    expect((await customer.app.request(path, { method: 'PUT', headers: customer.headers, body: JSON.stringify({ revision: 1, enabledModelIds: [], modelIdentities: [] }) })).status).toBe(403);
  });

  it('rejects customer prompt and identity overrides before any inference', async () => {
    const fx = await fixture({ identities });
    for (const body of [
      { ...input, systemPrompt: 'Override' }, { ...input, identity: 'Override' }, { ...input, modelIdentities: identities },
      { ...input, knowledgeCutoff: '2026-09' },
      { ...input, messages: [{ role: 'developer', content: 'Override' }, ...initialMessages] },
      { ...input, messages: [{ role: 'system', content: 'Override' }, ...initialMessages] },
    ]) expect((await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify(body) })).status).toBe('messages' in body ? 409 : 400);
    expect(fx.gatewayFetch).not.toHaveBeenCalled();
  });

  it('does not retry or strip the instruction when a configured model rejects a send', async () => {
    const fx = await fixture({ identities, status: 400 });
    const response = await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify(input) });
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('PRIVATE_UPSTREAM_ERROR');
    const sends = fx.gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'));
    expect(sends).toHaveLength(1);
    expect(JSON.parse(String(sends[0]![1]!.body)).messages[0]).toEqual({ role: 'system', content: instruction });
  });
});

describe('authenticated playground BFF', () => {
  it('requires a session and protects billed sends with Origin and CSRF', async () => {
    const { app, headers, gatewayFetch } = await fixture();
    for (const path of ['/portal/v1/playground/models?apiKeyId=7', '/portal/v1/model-prices?apiKeyId=7&model=gpt-test']) expect((await app.request(path)).status).toBe(401);
    expect((await app.request('/portal/v1/playground/chat', { method: 'POST', body: JSON.stringify(input) })).status).toBe(401);
    for (const invalid of [{ ...headers, origin: 'https://attacker.invalid' }, { ...headers, 'x-csrf-token': '' }]) {
      expect((await app.request('/portal/v1/playground/chat', { method: 'POST', headers: invalid, body: JSON.stringify(input) })).status).toBe(403);
    }
    expect(gatewayFetch).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...rawKey, user_id: 43 }, 404], [{ ...rawKey, id: 8 }, 404],
    [{ ...rawKey, status: 'inactive' }, 400], [{ ...rawKey, status: 'quota_exhausted' }, 400],
    [{ ...rawKey, expires_at: '2020-01-01T00:00:00Z' }, 400], [{ ...rawKey, group_id: null }, 400],
  ])('rejects unavailable or foreign keys before inference', async (key, status) => {
    const { app, headers, gatewayFetch } = await fixture({ key });
    const response = await app.request('/portal/v1/playground/chat', { method: 'POST', headers, body: JSON.stringify(input) });
    expect(response.status).toBe(status);
    expect(gatewayFetch).not.toHaveBeenCalled();
  });

  it('allowlists models and streams final text while preserving actual aggregate tokens', async () => {
    const { app, headers, gatewayFetch } = await fixture();
    const modelResponse = await app.request('/portal/v1/playground/models?apiKeyId=7', { headers });
    const models = await modelResponse.json();
    expect(models.data).toEqual([{ id: 'gpt-test', name: 'gpt-test' }]);
    assertNoPrivateProperties(models);
    const response = await app.request('/portal/v1/playground/chat', { method: 'POST', headers, body: JSON.stringify(input) });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    const text = await response.text();
    const events = text.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
    expect(events[0]).toMatchObject({ type: 'turn_started', conversationId: input.conversationId, sequence: 1, revision: 1, includedTurns: 0, omittedTurns: 0 });
    expect(events.slice(1)).toEqual([{ type: 'text_delta', text: 'Hello 🌍' }, { type: 'usage', usage: { inputTokens: 17, outputTokens: 23, totalTokens: 40 } }, { type: 'done', finishReason: 'stop' }]);
    assertNoPrivateProperties(events);
    expect(text).not.toMatch(/PRIVATE_|reasoning|account-access|account-refresh|sk-customer/);
    const sends = gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'));
    expect(sends).toHaveLength(1);
    const init = sends[0]![1]!;
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer sk-customer-fixture');
    expect(init.redirect).toBe('manual');
    expect(JSON.parse(String(init.body))).toEqual({ model: 'gpt-test', messages: initialMessages, stream: true, stream_options: { include_usage: true }, max_completion_tokens: 8192 });
  });

  it('does not retry failed billable requests or forward upstream errors', async () => {
    const { app, headers, gatewayFetch } = await fixture({ status: 429 });
    const response = await app.request('/portal/v1/playground/chat', { method: 'POST', headers, body: JSON.stringify(input) });
    expect(response.status).toBe(429);
    expect(await response.text()).not.toContain('PRIVATE_UPSTREAM_ERROR');
    expect(gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'))).toHaveLength(1);
  });

  it.each([
    { label: 'HTTP 503', chatResponse: () => Response.json({ message: 'PRIVATE_UPSTREAM_ERROR', ...sentinels }, { status: 503 }), message: 'The model service could not complete this request. Try again shortly or choose another model.' },
    { label: 'transport failure', chatResponse: () => { throw new Error('PRIVATE_UPSTREAM_ERROR sk-secret dial tcp 10.0.0.5:1234'); }, message: 'The model service could not be reached. Try again shortly.' },
    { label: 'non-stream response', chatResponse: () => Response.json({ message: 'PRIVATE_UPSTREAM_ERROR', ...sentinels }), message: 'The model service returned an unreadable response. Try again or choose another model.' },
    { label: 'non-stream cancellation failure', chatResponse: () => new Response(new ReadableStream({ cancel() { throw new Error('PRIVATE_UPSTREAM_ERROR sk-secret'); } }), { headers: { 'content-type': 'application/json' } }), message: 'The model service returned an unreadable response. Try again or choose another model.' },
    { label: 'redirect', chatResponse: () => new Response(null, { status: 307, headers: { location: 'https://other.invalid' } }), message: 'The model service could not complete this request. Try again shortly or choose another model.' },
  ])('identifies $label as a model failure and saves the failed turn without retrying', async ({ chatResponse, message }) => {
    const fx = await fixture({ chatResponse });
    const response = await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify(input) });
    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload).toMatchObject({ ok: false, error: { code: 'PLAYGROUND_REQUEST_FAILED', message }, requestId: expect.any(String) });
    expect(JSON.stringify(payload)).not.toMatch(/PRIVATE_|sk-secret|account service|upstreamStatus|failure/);
    assertNoPrivateProperties(payload);
    expect(fx.gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'))).toHaveLength(1);
    expect(fx.gatewayFetch.mock.calls.every(([url]) => String(url).startsWith('https://gateway.invalid/'))).toBe(true);
    const saved = await fx.history.detail('42', input.conversationId);
    expect(saved.conversation.active).toBe(false);
    expect(saved.turns).toHaveLength(1);
    expect(saved.turns[0]).toMatchObject({ userText: input.message, assistantText: '', state: 'failed', usage: null });
    expect((await fx.app.request('/portal/v1/auth/session', { headers: fx.headers })).status).toBe(200);
  });

  it('keeps genuine account failures distinct and does not start a model request', async () => {
    const fx = await fixture({ accountStatus: 503 });
    const response = await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify(input) });
    expect(await response.json()).toMatchObject({ error: { code: 'ACCOUNT_SERVICE_UNAVAILABLE', message: 'The account service could not complete the request.' } });
    expect(fx.gatewayFetch).not.toHaveBeenCalled();
    expect((await fx.history.detail('42', input.conversationId)).turns).toEqual([]);
  });

  it('retains only the original HTTP status and safe failure category for server diagnostics', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: 'PRIVATE_UPSTREAM_ERROR', ...sentinels }, { status: 503 }));
    const client = new PlaygroundClient('https://gateway.invalid/v1', fetcher as typeof fetch);
    const error = await client.models('sk-secret').catch(error => error);
    expect(error).toBeInstanceOf(PlaygroundGatewayError);
    expect(error).toMatchObject({ status: 502, upstreamStatus: 503, failure: 'http' });
    expect(JSON.stringify(error)).not.toMatch(/PRIVATE_|sk-secret|rateMultiplier/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['models', 'chat'])('keeps gateway key rejection distinct from console session expiry for %s', async endpoint => {
    const { app, headers, gatewayFetch } = await fixture(endpoint === 'models' ? { modelStatus: 401 } : { status: 401 });
    const response = endpoint === 'models'
      ? await app.request('/portal/v1/playground/models?apiKeyId=7', { headers })
      : await app.request('/portal/v1/playground/chat', { method: 'POST', headers, body: JSON.stringify(input) });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'PLAYGROUND_KEY_REJECTED' } });
    expect(gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith(endpoint === 'models' ? '/models' : '/chat/completions'))).toHaveLength(1);
    expect((await app.request('/portal/v1/auth/session', { headers })).status).toBe(200);
  });

  it('rejects malformed conversations and models not listed for the selected key', async () => {
    const { app, headers, gatewayFetch } = await fixture();
    for (const body of [{ ...input, message: '' }, { ...input, message: 'x'.repeat(32001) }, { ...input, revision: -1 }, { ...input, conversationId: 'invalid' }, { ...input, reasoning_effort: 'xhigh' }, { ...input, apiKeyId: '../7' }]) {
      expect((await app.request('/portal/v1/playground/chat', { method: 'POST', headers, body: JSON.stringify(body) })).status).toBe(400);
    }
    expect(gatewayFetch).not.toHaveBeenCalled();
    expect((await app.request('/portal/v1/playground/chat', { method: 'POST', headers, body: JSON.stringify({ ...input, model: 'not-listed' }) })).status).toBe(400);
    expect(gatewayFetch.mock.calls.some(([url]) => String(url).endsWith('/chat/completions'))).toBe(false);
  });

  it('turns partial stream failure into an explicit sanitized terminal error', async () => {
    const stream = frame({ choices: [{ index: 0, delta: { content: 'Partial' } }] }) + frame({ error: { message: 'PRIVATE_UPSTREAM_ERROR' } });
    const { app, headers } = await fixture({ stream });
    const response = await app.request('/portal/v1/playground/chat', { method: 'POST', headers, body: JSON.stringify(input) });
    const text = await response.text();
    expect(text).toContain('Partial'); expect(text).toContain('STREAM_INTERRUPTED');
    expect(text).not.toContain('event: done'); expect(text).not.toContain('PRIVATE_UPSTREAM_ERROR');
  });

  it.each([{ identities: [] }, { identities: [{ modelId: 'gpt-test', name: 'Example' }] }])('propagates browser cancellation with or without model identity', async ({ identities }) => {
    const cancelled = vi.fn();
    const source = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(frame({ choices: [{ index: 0, delta: { content: 'Partial' } }] }))); }, cancel: cancelled });
    const { app, headers, gatewayFetch, history } = await fixture({ source, identities });
    const response = await app.request('/portal/v1/playground/chat', { method: 'POST', headers, body: JSON.stringify(input) });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder(); let received = '';
    while (!received.includes('text_delta')) { const frame = await reader.read(); if (frame.done) break; received += decoder.decode(frame.value); }
    await reader.cancel();
    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledTimes(1));
    const send = gatewayFetch.mock.calls.find(([url]) => String(url).endsWith('/chat/completions'));
    expect(send?.[1]?.signal?.aborted).toBe(true);
    await vi.waitFor(async () => {
      const saved = await history.detail('42', input.conversationId);
      expect(saved.turns[0]).toMatchObject({ assistantText: 'Partial', state: 'stopped' });
      expect(saved.conversation.active).toBe(false);
    });
  });

  it('enforces the existing 128 KiB limit before starting inference', async () => {
    const { app, headers, gatewayFetch } = await fixture();
    const response = await app.request('/portal/v1/playground/chat', { method: 'POST', headers, body: JSON.stringify({ ...input, message: 'x'.repeat(150_000) }) });
    expect(response.status).toBe(413);
    expect(gatewayFetch).not.toHaveBeenCalled();
  });

  it('returns exact final model prices without their internal inputs', async () => {
    const { app, headers } = await fixture();
    const response = await app.request('/portal/v1/model-prices?apiKeyId=7&model=gpt-test', { headers });
    const payload = await response.json();
    expect(payload.data).toEqual({ status: 'available', model: 'gpt-test', currency: 'USD', unit: 'million_tokens', input: '0.925', output: '4.44', cacheRead: '0', observedAt: '2026-09-07T10:00:00.000Z' });
    assertNoPrivateProperties(payload);
  });

  it('keeps chat available when an authoritative price is missing', async () => {
    const { app, headers } = await fixture({ plaza: {} });
    const response = await app.request('/portal/v1/model-prices?apiKeyId=7&model=gpt-test', { headers });
    expect((await response.json()).data.status).toBe('unavailable');
    const chat = await app.request('/portal/v1/playground/chat', { method: 'POST', headers, body: JSON.stringify(input) });
    expect(await chat.text()).toContain('event: done');
  });
});

describe('saved Playground conversations over the BFF', () => {
  const root = '/portal/v1/playground/conversations';
  const adminRoot = '/portal/v1/admin/playground/conversations';
  async function submit(fx: Awaited<ReturnType<typeof fixture>>, turn = input) {
    const response = await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify(turn) });
    return { response, text: await response.text() };
  }
  it('returns normal-customer summaries and individual saved turns without internal fields', async () => {
    const fx = await fixture(); await submit(fx);
    const page = await (await fx.app.request(root, { headers: fx.headers })).json();
    expect(page.data.items).toHaveLength(1); expect(page.data.items[0]).toMatchObject({ id: input.conversationId, title: 'hello', turnCount: 1, active: false });
    const detail = await (await fx.app.request(`${root}/${input.conversationId}`, { headers: fx.headers })).json();
    expect(detail.data.turns[0]).toMatchObject({ userText: 'hello', usage: { inputTokens: 17, outputTokens: 23, totalTokens: 40 }, state: 'complete' });
    for (const result of [page, detail]) { assertNoPrivateProperties(result); expect(JSON.stringify(result)).not.toMatch(/ownerLabel|leaseUntil|payloadHash|private-account|sk-customer|PRIVATE_THOUGHT/); }
  });
  it('requires sessions, CSRF, active admins, and exact conversation ownership', async () => {
    const fx = await fixture(); await submit(fx);
    for (const path of [root, `${root}/${input.conversationId}`, adminRoot]) expect((await fx.app.request(path)).status).toBe(401);
    for (const method of ['POST', 'DELETE']) expect((await fx.app.request(method === 'POST' ? root : `${root}/${input.conversationId}`, { method, headers: { ...fx.headers, 'x-csrf-token': '' }, body: method === 'POST' ? JSON.stringify({ id: randomUUID() }) : undefined })).status).toBe(403);
    expect((await fx.app.request(adminRoot, { headers: fx.headers })).status).toBe(403);
    const other = createSession({ user: { ...fx.session.user, id: '43' }, capabilities: fx.session.capabilities, tokens: fx.session.tokens });
    await fx.store.set(other);
    const otherHeaders = { ...fx.headers, cookie: `${config.sessionCookieName}=${other.id}`, 'x-csrf-token': other.csrfToken };
    for (const method of ['GET', 'DELETE']) expect((await fx.app.request(`${root}/${input.conversationId}`, { method, headers: otherHeaders })).status).toBe(404);
    expect((await (await fx.app.request(root, { headers: otherHeaders })).json()).data.items).toEqual([]);
  });
  it('archives customer removals for read-only admin inspection and audits permanent purge', async () => {
    const fx = await fixture({ role: 'admin' }); await submit(fx);
    expect((await fx.app.request(`${root}/${input.conversationId}`, { method: 'DELETE', headers: fx.headers })).status).toBe(200);
    expect((await fx.app.request(`${root}/${input.conversationId}`, { headers: fx.headers })).status).toBe(404);
    const listed = await (await fx.app.request(`${adminRoot}?deleted=deleted`, { headers: fx.headers })).json();
    expect(listed.data.items).toHaveLength(1);
    const inspected = await (await fx.app.request(`${adminRoot}/${input.conversationId}`, { headers: fx.headers })).json();
    expect(inspected.data.conversation).toMatchObject({ ownerId: '42', ownerLabel: 'fixture@example.com', deletedAt: expect.any(String) });
    expect(inspected.data.turns[0].userText).toBe('hello'); assertNoPrivateProperties(inspected);
    expect((await fx.app.request(`${adminRoot}/${input.conversationId}`, { method: 'POST', headers: fx.headers, body: '{}' })).status).toBe(404);
    expect((await fx.app.request(`${adminRoot}/${input.conversationId}`, { method: 'DELETE', headers: fx.headers })).status).toBe(200);
    expect((await fx.app.request(`${adminRoot}/${input.conversationId}`, { headers: fx.headers })).status).toBe(404);
    expect(fx.history.audits.map(row => row.action)).toEqual(['list', 'inspect', 'purge']);
  });
  it('rejects duplicates and stale revisions without a second billable request', async () => {
    const fx = await fixture(); await submit(fx);
    const duplicate = await submit(fx); expect(duplicate.response.status).toBe(409); expect(duplicate.text).toContain('TURN_ALREADY_SUBMITTED');
    const stale = await submit(fx, { ...input, clientTurnId: randomUUID() }); expect(stale.response.status).toBe(409);
    expect(fx.gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'))).toHaveLength(1);
  });
  it('builds context from the selected saved chat and rejects browser-supplied history', async () => {
    const fx = await fixture(); await submit(fx);
    const id = randomUUID();
    expect((await fx.app.request(root, { method: 'POST', headers: fx.headers, body: JSON.stringify({ id }) })).status).toBe(200);
    await submit(fx, { ...input, conversationId: id, clientTurnId: randomUUID(), message: 'Separate chat' });
    await submit(fx, { ...input, revision: 1, clientTurnId: randomUUID(), message: 'Follow up' });
    const bodies = fx.gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions')).map(([, init]) => JSON.parse(String(init!.body)));
    expect(bodies[1].messages).toEqual([{ role: 'user', content: 'Separate chat' }]);
    expect(bodies[2].messages.map((message: { content: string }) => message.content)).toEqual(['hello', 'Hello 🌍', 'Follow up']);
    const old = await fx.app.request('/portal/v1/playground/chat', { method: 'POST', headers: fx.headers, body: JSON.stringify({ ...input, messages: initialMessages }) });
    expect(old.status).toBe(409); expect(await old.text()).toContain('PLAYGROUND_UPDATE_REQUIRED');
  });
  it('does not call inference if the message cannot first be committed', async () => {
    const fx = await fixture(); vi.spyOn(fx.history, 'begin').mockRejectedValue(new Error('PRIVATE_DATABASE_ERROR'));
    const result = await submit(fx); expect(result.response.status).toBe(500); expect(result.text).not.toContain('PRIVATE_DATABASE_ERROR');
    expect(fx.gatewayFetch.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'))).toHaveLength(0);
  });
  it('reports terminal storage failure instead of claiming the reply was saved', async () => {
    const fx = await fixture(); vi.spyOn(fx.history, 'write').mockRejectedValue(new Error('PRIVATE_DATABASE_ERROR'));
    const result = await submit(fx);
    expect(result.text).toContain('HISTORY_UNAVAILABLE'); expect(result.text).not.toContain('event: done'); expect(result.text).not.toContain('PRIVATE_DATABASE_ERROR');
  });
  it('imports text only and rejects invented billing or identity fields', async () => {
    const fx = await fixture(); const id = randomUUID();
    const messages = [{ role: 'user', content: 'Earlier prompt' }, { role: 'assistant', content: 'Earlier reply', model: 'gpt-test' }];
    const send = (body: unknown) => fx.app.request(`${root}/import`, { method: 'POST', headers: fx.headers, body: JSON.stringify(body) });
    expect((await send({ id, messages: [messages[0], { ...messages[1], usage: { inputTokens: 99 } }] })).status).toBe(400);
    expect((await send({ id, messages })).status).toBe(200);
    expect((await fx.history.detail(null, id)).turns[0]!.usage).toBeNull();
    expect((await fx.app.request(`${root}/${id}?before=99999999999`, { headers: fx.headers })).status).toBe(400);
    expect(fx.gatewayFetch).not.toHaveBeenCalled();
  });
});

describe('upstream stream and price adapters', () => {
  it('ignores reasoning-only frames and preserves split Unicode text', async () => {
    const events: PlaygroundEvent[] = [];
    for await (const event of publicChatEvents(byteStream(frame({ choices: [{ index: 0, delta: { reasoning_content: 'secret', ...sentinels } }] }) + completeStream(), 1), new AbortController().signal)) events.push(event);
    expect(events[0]).toEqual({ type: 'text_delta', text: 'Hello 🌍' });
    expect(events).toHaveLength(3);
    expect(JSON.stringify(events)).not.toMatch(/secret|reasoning|INTERNAL/);
  });

  it.each([frame({ choices: [{ index: 0, delta: { content: 'Partial' } }] }), 'data: malformed\n\n', frame('[DONE]')])('does not invent completion at an invalid or truncated end', async stream => {
    const consume = async () => { for await (const _event of publicChatEvents(byteStream(stream), new AbortController().signal)) { /* Consume the adapter. */ } };
    await expect(consume()).rejects.toThrow();
  });

  it('cancels a waiting upstream reader immediately when the caller stops', async () => {
    const cancelled = vi.fn();
    const controller = new AbortController();
    const source = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const pending = publicChatEvents(source, controller.signal).next();
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('rejects redirects without forwarding key authorization to a new origin', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://attacker.invalid' } }));
    const client = new PlaygroundClient('https://gateway.invalid/v1', fetcher as typeof fetch);
    await expect(client.models('sk-fixture')).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('preserves small decimal and explicit zero prices exactly', () => {
    const plaza = basePlaza();
    plaza.groups[0]!.models[0]!.pricing.input_price = '0.00000000000000000017';
    const price = publicModelPrice(plaza, { ...baseBilling(), effective_rate_multiplier: '0.0003' }, readOwnedPlaygroundKey(rawKey, '42', '7'), 'gpt-test');
    expect(price).toMatchObject({ input: '0.000000000000000051', cacheRead: '0' });
    expect(publicModelPrice(basePlaza(), { ...baseBilling(), effective_rate_multiplier: 0 }, readOwnedPlaygroundKey(rawKey, '42', '7'), 'gpt-test')).toMatchObject({ input: '0', output: '0' });
  });

  it('does not guess prices for unsupported rules or malformed inputs', () => {
    const key = readOwnedPlaygroundKey(rawKey, '42', '7');
    const cases: Array<[unknown, unknown]> = [
      [basePlaza(), { ...baseBilling(), peak_rate_enabled: true }],
      [basePlaza(), { ...baseBilling(), schema_version: 2 }],
      [basePlaza(), { ...baseBilling(), effective_rate_multiplier: '-1' }],
      [basePlaza(), { ...baseBilling(), effective_rate_multiplier: '1e999999' }],
      [basePlaza(), { ...baseBilling(), observed_at: 'invalid' }],
    ];
    for (const patch of [{ time_pricing: { periods: [{ multiplier: 2 }] } }, { long_context_basis: 'marginal' }, { pricing: { ...basePlaza().groups[0]!.models[0]!.pricing, intervals: [{ min_tokens: 0, max_tokens: 1000 }] } }, { pricing: { billing_mode: 'image' } }]) {
      const plaza = basePlaza(); Object.assign(plaza.groups[0]!.models[0]!, patch); cases.push([plaza, baseBilling()]);
    }
    for (const [plaza, billing] of cases) expect(publicModelPrice(plaza, billing, key, 'gpt-test').status).toBe('unavailable');
  });
});
