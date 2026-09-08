import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => {
  const commands = { get: vi.fn(), eval: vi.fn() };
  return { commands, client: { isReady: true, on: vi.fn(), withCommandOptions: vi.fn(() => commands) } };
});
vi.mock('redis', () => ({ createClient: () => redis.client }));
import { RedisPlaygroundSettingsStore } from '../apps/bff/src/playground-settings';

beforeEach(() => { redis.commands.get.mockReset(); redis.commands.eval.mockReset().mockResolvedValue(1); redis.client.withCommandOptions.mockClear(); });

describe('Redis identity settings CAS protocol', () => {
  it('preserves a disabled global switch for legacy writes and re-enables it explicitly', async () => {
    const current = { revision: 4, enabledModelIds: ['chat'], modelIdentities: [{ modelId: 'chat', name: 'Example' }], playgroundEnabled: false };
    const raw = JSON.stringify(current); redis.commands.get.mockResolvedValue(raw);
    const store = new RedisPlaygroundSettingsStore('redis://fixture.invalid');
    const preserved = await store.save({ revision: 4, enabledModelIds: ['chat'] });
    expect(preserved).toEqual({ ...current, revision: 5 });
    expect(redis.commands.eval.mock.calls[0]![1].arguments).toEqual(['present', raw, JSON.stringify(preserved)]);
    expect(await store.save({ revision: 4, enabledModelIds: ['chat'], playgroundEnabled: true })).toEqual({ ...current, revision: 5, playgroundEnabled: true });
  });

  it('compares legacy raw JSON verbatim and normalizes only the saved value', async () => {
    const legacy = '{ "revision": 4, "enabledModelIds": ["chat"] }';
    redis.commands.get.mockResolvedValue(legacy);
    const store = new RedisPlaygroundSettingsStore('redis://fixture.invalid');
    expect(await store.read()).toEqual({ playgroundEnabled: true, revision: 4, enabledModelIds: ['chat'], modelIdentities: [] });
    expect(redis.commands.eval).not.toHaveBeenCalled();
    const result = await store.save({ revision: 4, enabledModelIds: ['chat'] });
    const [, options] = redis.commands.eval.mock.calls[0]!;
    expect(options.keys).toEqual(['kr:portal:settings:playground']);
    expect(options.arguments).toEqual(['present', legacy, JSON.stringify(result)]);
    expect(result).toEqual({ playgroundEnabled: true, revision: 5, enabledModelIds: ['chat'], modelIdentities: [] });
  });

  it('preserves identities on omission and clears only with an explicit empty array', async () => {
    const current = { revision: 4, enabledModelIds: ['chat'], modelIdentities: [{ modelId: 'chat', name: 'Example' }] };
    redis.commands.get.mockResolvedValue(JSON.stringify(current));
    const store = new RedisPlaygroundSettingsStore('redis://fixture.invalid');
    expect((await store.save({ revision: 4, enabledModelIds: [] })).modelIdentities).toEqual(current.modelIdentities);
    expect((await store.save({ revision: 4, enabledModelIds: [], modelIdentities: [] })).modelIdentities).toEqual([]);
  });

  it('reports a concurrent CAS failure without retrying a write', async () => {
    redis.commands.get.mockResolvedValue(null); redis.commands.eval.mockResolvedValue(0);
    const store = new RedisPlaygroundSettingsStore('redis://fixture.invalid');
    await expect(store.save({ revision: 0, enabledModelIds: [], modelIdentities: [{ modelId: 'chat', name: 'Example' }] })).rejects.toMatchObject({ status: 409 });
    expect(redis.commands.eval).toHaveBeenCalledTimes(1);
    expect(redis.commands.eval.mock.calls[0]![1].arguments.slice(0, 2)).toEqual(['missing', '']);
  });

  it('fails closed without writing corrupt data or retrying an uncertain write', async () => {
    const store = new RedisPlaygroundSettingsStore('redis://fixture.invalid');
    redis.commands.get.mockResolvedValue('{bad json');
    await expect(store.save({ revision: 0, enabledModelIds: [] })).rejects.toMatchObject({ status: 503 });
    expect(redis.commands.eval).not.toHaveBeenCalled();
    redis.commands.get.mockResolvedValue(null); redis.commands.eval.mockRejectedValue(new Error('Timeout'));
    await expect(store.save({ revision: 0, enabledModelIds: [] })).rejects.toMatchObject({ status: 503 });
    expect(redis.commands.eval).toHaveBeenCalledTimes(1);
    expect(redis.client.withCommandOptions).toHaveBeenCalledWith({ timeout: 1500 });
  });
});
