import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => {
  const commands = { sIsMember: vi.fn(), sAdd: vi.fn() };
  return { commands, client: { isReady: true, isOpen: true, on: vi.fn(), destroy: vi.fn(), withCommandOptions: vi.fn(() => commands) } };
});
vi.mock('redis', () => ({ createClient: () => redis.client }));
import { PLAYGROUND_INTRODUCTION_KEY, PlaygroundIntroductionError, RedisPlaygroundIntroductionStore } from '../apps/bff/src/playground-introduction';

beforeEach(() => { redis.commands.sIsMember.mockReset(); redis.commands.sAdd.mockReset(); redis.client.destroy.mockClear(); });
describe('persistent Redis Playground visits', () => {
  it('uses an atomic persistent set shared by accounts and BFF instances', async () => {
    const visited = new Set<string>();
    redis.commands.sIsMember.mockImplementation(async (_key, id) => visited.has(id) ? 1 : 0);
    redis.commands.sAdd.mockImplementation(async (_key, id) => { visited.add(id); return 1; });
    const first = new RedisPlaygroundIntroductionStore('redis://fixture.invalid');
    expect(await first.visited('42')).toBe(false);
    await Promise.all([first.markVisited('42'), first.markVisited('42')]);
    const restarted = new RedisPlaygroundIntroductionStore('redis://fixture.invalid');
    expect(await restarted.visited('42')).toBe(true);
    expect(await restarted.visited('43')).toBe(false);
    expect(redis.commands.sAdd).toHaveBeenCalledWith(PLAYGROUND_INTRODUCTION_KEY, '42');
    expect(redis.commands.sIsMember).toHaveBeenCalledWith(PLAYGROUND_INTRODUCTION_KEY, '43');
    await first.close(); await restarted.close();
    expect(redis.client.destroy).toHaveBeenCalledTimes(2);
  });
  it('reports connection/storage failures instead of treating an account as unvisited', async () => {
    redis.commands.sIsMember.mockRejectedValue(new Error('Unavailable'));
    redis.commands.sAdd.mockRejectedValue(new Error('Unavailable'));
    const store = new RedisPlaygroundIntroductionStore('redis://fixture.invalid');
    await expect(store.visited('42')).rejects.toBeInstanceOf(PlaygroundIntroductionError);
    await expect(store.markVisited('42')).rejects.toBeInstanceOf(PlaygroundIntroductionError);
  });
});
