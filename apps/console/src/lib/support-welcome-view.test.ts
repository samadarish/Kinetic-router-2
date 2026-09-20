import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startWelcomeViewTracking } from './support-welcome-view';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('explicit welcome viewing', () => {
  it('records only after a continuous 350ms eligible dwell and stops its timer after success', async () => {
    const recordView = vi.fn().mockResolvedValue(undefined);
    const tracker = startWelcomeViewTracking({ eligible: () => true, recordView });
    await vi.advanceTimersByTimeAsync(349);
    expect(recordView).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(recordView).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    tracker.check();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(recordView).toHaveBeenCalledOnce();
    tracker.dispose();
  });

  it('restarts the full dwell when focus, actual visibility, or an uncovered conversation is lost', async () => {
    let eligible = true;
    const recordView = vi.fn().mockResolvedValue(undefined);
    const tracker = startWelcomeViewTracking({ eligible: () => eligible, recordView });
    await vi.advanceTimersByTimeAsync(300);
    eligible = false; tracker.check();
    await vi.advanceTimersByTimeAsync(2000);
    expect(recordView).not.toHaveBeenCalled();
    eligible = true; tracker.check();
    await vi.advanceTimersByTimeAsync(349);
    expect(recordView).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(recordView).toHaveBeenCalledOnce();
    tracker.dispose();
  });

  it('waits for an outstanding request, retries failures only while eligible, and stops after disposal', async () => {
    let eligible = true, reject!: (reason: Error) => void;
    const recordView = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; })).mockResolvedValue(undefined);
    const tracker = startWelcomeViewTracking({ eligible: () => eligible, recordView });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(recordView).toHaveBeenCalledOnce();
    reject(new Error('Temporary network failure'));
    await vi.advanceTimersByTimeAsync(0);
    eligible = false; tracker.check();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(recordView).toHaveBeenCalledOnce();
    eligible = true; tracker.check();
    await vi.advanceTimersByTimeAsync(350);
    expect(recordView).toHaveBeenCalledTimes(2);
    tracker.dispose();
    const cancelled = vi.fn().mockResolvedValue(undefined);
    const next = startWelcomeViewTracking({ eligible: () => true, recordView: cancelled });
    await vi.advanceTimersByTimeAsync(300); next.dispose();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(cancelled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
