import { describe, expect, it, vi } from 'vitest';
import { PlaygroundCatalog } from '../apps/bff/src/playground-catalog';
import type { PlaygroundGateway } from '@kineticrouter/sub2api-client';

const key = { id: '7', key: 'synthetic-test-key', groupId: '4' };
const signal = new AbortController().signal;
describe('sanitized playground catalog cache', () => {
  it('strips poisoned fields, copies upstream rows, expires and evicts within its bound', async () => {
    let now = 0;
    const rows = [{ id: 'chat', name: 'Upstream label', rate_multiplier: 7 }, { id: 'bad\u0000id', name: 'Bad' }];
    const models = vi.fn(async () => rows);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway, () => now, 2);
    expect(await catalog.models('1', key, signal)).toEqual([{ id: 'chat', name: 'chat' }]);
    rows[0]!.id = 'changed';
    expect(await catalog.models('1', key, signal)).toEqual([{ id: 'chat', name: 'chat' }]);
    expect(models).toHaveBeenCalledTimes(1);
    now = 30_001;
    expect(await catalog.models('1', key, signal)).toEqual([{ id: 'changed', name: 'changed' }]);
    await catalog.models('2', key, signal); await catalog.models('3', key, signal); await catalog.models('1', key, signal);
    expect(models).toHaveBeenCalledTimes(5);
  });
  it('isolates users, keys, groups and rotated credentials', async () => {
    const models = vi.fn(async () => [{ id: 'chat', name: 'chat' }]);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway);
    for (const [user, value] of [['1', key], ['2', key], ['1', { ...key, id: '8' }], ['1', { ...key, groupId: '5' }], ['1', { ...key, key: 'rotated' }]] as const) await catalog.models(user, value, signal);
    expect(models).toHaveBeenCalledTimes(5);
    await catalog.models('1', key, signal); expect(models).toHaveBeenCalledTimes(5);
  });
  it('does not cache failed discovery', async () => {
    const models = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue([{ id: 'chat', name: 'chat' }]);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway);
    await expect(catalog.models('1', key, signal)).rejects.toThrow('Unavailable');
    await catalog.models('1', key, signal); expect(models).toHaveBeenCalledTimes(2);
  });
});
