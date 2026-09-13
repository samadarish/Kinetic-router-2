import { describe, expect, it, vi } from 'vitest';
import { CHAT_DRAFTS_KEY, PLAYGROUND_STORAGE_KEY, clearAllPlaygroundStorage, clearPlaygroundStorage } from './playground-browser-storage';

describe('lightweight Playground storage cleanup', () => {
  it('clears both private snapshots without initializing a conversation controller', () => {
    const values = new Map([[CHAT_DRAFTS_KEY, 'private drafts'], [PLAYGROUND_STORAGE_KEY, 'private legacy chat'], ['theme', 'dark']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: vi.fn(), removeItem: (key: string) => { values.delete(key); } };
    clearAllPlaygroundStorage(storage);
    expect([...values]).toEqual([['theme', 'dark']]);
  });
  it('retains current drafts when only the legacy import is cleared', () => {
    const removeItem = vi.fn(); clearPlaygroundStorage({ getItem: vi.fn(), setItem: vi.fn(), removeItem });
    expect(removeItem).toHaveBeenCalledExactlyOnceWith(PLAYGROUND_STORAGE_KEY);
  });
  it('tolerates disabled browser storage during logout', () => {
    expect(() => clearAllPlaygroundStorage(undefined)).not.toThrow();
    const removeItem = vi.fn(() => { throw new Error('Denied'); });
    expect(() => clearAllPlaygroundStorage({ getItem: vi.fn(), setItem: vi.fn(), removeItem })).not.toThrow();
    expect(removeItem.mock.calls).toHaveLength(2);
  });
});
