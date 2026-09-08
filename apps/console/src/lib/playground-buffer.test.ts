import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlaygroundBuffer } from './playground-buffer';

afterEach(() => vi.useRealTimers());
describe('playground text painting', () => {
  it('paints first text immediately and batches subsequent Unicode without changing bytes', () => {
    vi.useFakeTimers(); const emit = vi.fn(); const buffer = createPlaygroundBuffer(emit);
    buffer.push('Hello '); expect(emit.mock.calls).toEqual([['Hello ']]);
    buffer.push('🌍'); buffer.push('\n  code'); buffer.push('  ');
    vi.advanceTimersByTime(49); expect(emit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); expect(emit.mock.calls).toEqual([['Hello '], ['🌍\n  code  ']]);
    buffer.dispose();
  });
  it('flushes partial text on stop or completion, once only', () => {
    vi.useFakeTimers(); const emit = vi.fn(); const buffer = createPlaygroundBuffer(emit);
    buffer.push('first'); buffer.push('last'); buffer.flush(); buffer.flush();
    vi.runAllTimers(); expect(emit.mock.calls).toEqual([['first'], ['last']]); buffer.dispose();
  });
  it('discards pending callbacks and rejects late text after a reset', () => {
    vi.useFakeTimers(); const emit = vi.fn(); const old = createPlaygroundBuffer(emit);
    old.push('old'); old.push('discard'); old.dispose();
    const next = createPlaygroundBuffer(emit); next.push('new');
    old.flush(); old.push('late'); vi.runAllTimers();
    expect(emit.mock.calls).toEqual([['old'], ['new']]); next.dispose();
  });
});
