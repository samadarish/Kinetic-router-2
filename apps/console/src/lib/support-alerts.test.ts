import { describe, expect, it } from 'vitest';
import { claimSupportAlert, isIncomingSupportMessage, readSupportPreferences, supportPreferenceKey } from './support-alerts';
import type { SupportMessage } from '@kineticrouter/portal-contract';

function storage() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
describe('support notification delivery', () => {
  it('defaults sound on for new accounts and invalid preferences, while preserving an explicit mute', () => {
    const saved = storage();
    expect(readSupportPreferences('a', saved)).toEqual({ sound: true, desktop: false });
    for (const invalid of ['broken', 'null', '{}', '{"sound":"false"}']) {
      saved.setItem(supportPreferenceKey('a'), invalid);
      expect(readSupportPreferences('a', saved).sound).toBe(true);
    }
    saved.setItem(supportPreferenceKey('a'), '{"sound":false,"desktop":true}');
    expect(readSupportPreferences('a', saved)).toEqual({ sound: false, desktop: true });
    expect(readSupportPreferences('b', saved)).toEqual({ sound: true, desktop: false });
    expect(readSupportPreferences('a', { getItem: () => { throw new Error('restricted'); } }).sound).toBe(true);
  });
  it('sounds only for incoming messages on each side', () => {
    const message = { sender: 'admin' } as SupportMessage;
    expect(isIncomingSupportMessage(message, false)).toBe(true);
    expect(isIncomingSupportMessage(message, true)).toBe(false);
    expect(isIncomingSupportMessage({ sender: 'customer' } as SupportMessage, true)).toBe(true);
  });
  it('deduplicates the same message between tabs and reconnects, scoped to account', async () => {
    const saved = storage(); let calls = 0, queue = Promise.resolve();
    const locks = { request: (_key: string, run: () => Promise<boolean>) => { const next = queue.then(run); queue = next.then(() => {}); return next; } } as unknown as Pick<LockManager, 'request'>;
    const run = async () => { calls++; };
    await Promise.all([claimSupportAlert('a', 'm1', run, saved, locks), claimSupportAlert('a', 'm1', run, saved, locks)]);
    expect(calls).toBe(1);
    await claimSupportAlert('a', 'm1', run, saved, locks); expect(calls).toBe(1);
    await claimSupportAlert('b', 'm1', run, saved, locks); expect(calls).toBe(2);
    await claimSupportAlert('a', 'm2', run, saved, locks); expect(calls).toBe(3);
  });
  it('lets another eligible tab try if playback was blocked', async () => {
    const saved = storage();
    await expect(claimSupportAlert('a', 'm1', async () => { throw new Error('blocked'); }, saved, undefined)).rejects.toThrow('blocked');
    expect(await claimSupportAlert('a', 'm1', async () => {}, saved, undefined)).toBe(true);
  });
  it('does not mark cancelled or muted queued playback as delivered', async () => {
    const saved = storage();
    expect(await claimSupportAlert('a', 'm1', async () => false, saved, undefined)).toBe(false);
    expect(await claimSupportAlert('a', 'm1', async () => {}, saved, undefined)).toBe(true);
  });
  it('recovers from restricted or corrupt browser storage', async () => {
    const saved = { getItem: () => 'invalid', setItem: () => { throw new Error('restricted'); } };
    expect(await claimSupportAlert('a', 'm1', async () => {}, saved, undefined)).toBe(true);
  });
});
