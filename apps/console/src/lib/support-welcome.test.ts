import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupportWelcomeResult } from '@kineticrouter/portal-contract';
import { scheduleSupportWelcome } from './support-welcome';

const result = { created: true, message: { id: 'welcome-message', kind: 'welcome' } } as SupportWelcomeResult;
afterEach(() => { vi.useRealTimers(); });

describe('one-time welcome scheduling', () => {
  it('waits five eligible seconds, resets when hidden, and does not repeat on resume', async () => {
    vi.useFakeTimers();
    let focused = true;
    const ensure = vi.fn(async () => result), receive = vi.fn();
    const task = scheduleSupportWelcome({ eligible: () => focused, ensure, receive });
    await vi.advanceTimersByTimeAsync(4_000); expect(ensure).not.toHaveBeenCalled();
    focused = false; task.refresh();
    await vi.advanceTimersByTimeAsync(10_000); expect(ensure).not.toHaveBeenCalled();
    focused = true; task.refresh();
    await vi.advanceTimersByTimeAsync(4_999); expect(ensure).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(receive).toHaveBeenCalledExactlyOnceWith(result.message);
    task.refresh(); await vi.advanceTimersByTimeAsync(60_000); expect(ensure).toHaveBeenCalledTimes(1);
    task.stop();
  });

  it('does not announce an existing welcome from another tab or previous login', async () => {
    vi.useFakeTimers();
    const receive = vi.fn();
    const task = scheduleSupportWelcome({ eligible: () => true, ensure: async () => ({ ...result, created: false }), receive });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(receive).not.toHaveBeenCalled(); task.stop();
  });

  it('retries a temporary outage without parallel requests', async () => {
    vi.useFakeTimers();
    const ensure = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(result);
    const receive = vi.fn();
    const task = scheduleSupportWelcome({ eligible: () => true, ensure, receive });
    await vi.advanceTimersByTimeAsync(5_000); expect(ensure).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29_999); expect(ensure).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(receive).toHaveBeenCalledOnce();
    task.stop();
  });

  it('aborts on logout and ignores a response that finishes afterwards', async () => {
    vi.useFakeTimers();
    let finish!: (value: SupportWelcomeResult) => void;
    let signal!: AbortSignal;
    const receive = vi.fn();
    const ensure = vi.fn((input: AbortSignal) => { signal = input; return new Promise<SupportWelcomeResult>(resolve => { finish = resolve; }); });
    const task = scheduleSupportWelcome({ eligible: () => true, ensure, receive });
    await vi.advanceTimersByTimeAsync(5_000);
    task.refresh(); await vi.advanceTimersByTimeAsync(10_000); expect(ensure).toHaveBeenCalledTimes(1);
    task.stop(); expect(signal.aborted).toBe(true);
    finish(result); await vi.advanceTimersByTimeAsync(60_000);
    expect(receive).not.toHaveBeenCalled(); expect(ensure).toHaveBeenCalledTimes(1);
  });
});
