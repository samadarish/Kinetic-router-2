import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaygroundClient } from '@kineticrouter/sub2api-client';
import type { PlaygroundEvent } from '@kineticrouter/portal-contract';

const input = { apiKeyId: '7', model: 'fixture-model', messages: [{ role: 'user' as const, content: 'Question' }] };
const frame = (data: unknown) => `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
const text = frame({ choices: [{ index: 0, delta: { content: 'Reply' } }] });
const complete = frame({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 13, total_tokens: 20 } }) + frame('[DONE]');
const encode = (value: string) => new TextEncoder().encode(value);
afterEach(() => vi.useRealTimers());

function fixture() {
  vi.useFakeTimers();
  let source!: ReadableStreamDefaultController<Uint8Array>;
  const cancelled = vi.fn();
  const body = new ReadableStream<Uint8Array>({ start(controller) { source = controller; }, cancel: cancelled });
  const fetcher = vi.fn<typeof fetch>(async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
  const client = new PlaygroundClient('https://gateway.invalid/v1', fetcher);
  const controller = new AbortController();
  const received: PlaygroundEvent[] = [];
  const send = async () => {
    for await (const event of await client.chat('sk-fixture', input, controller.signal)) received.push(event);
  };
  return { source, body, cancelled, fetcher, controller, received, send };
}

describe('Playground upstream inactivity watchdog', () => {
  it.each(['text', 'reasoning', 'heartbeat', 'split frame'])('accepts six minutes of %s activity without a total deadline', async kind => {
    const fx = fixture(), pending = fx.send();
    await vi.advanceTimersByTimeAsync(0);
    const activity = kind === 'text' ? [text]
      : kind === 'reasoning' ? [frame({ choices: [{ index: 0, delta: { reasoning_content: 'PRIVATE_REASONING' } }] })]
      : kind === 'heartbeat' ? [': upstream keepalive\n\n'] : [text.slice(0, 17), text.slice(17)];
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(60_000);
      fx.source.enqueue(encode(activity[i % activity.length]!));
      await vi.advanceTimersByTimeAsync(0);
      expect(fx.fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    }
    fx.source.enqueue(encode(text + complete)); await pending;
    expect(fx.received.at(-1)).toEqual({ type: 'done', finishReason: 'stop' });
    expect(fx.received).toContainEqual({ type: 'usage', usage: { inputTokens: 7, outputTokens: 13, totalTokens: 20 } });
    expect(JSON.stringify(fx.received)).not.toContain('PRIVATE_REASONING');
    expect(fx.fetcher).toHaveBeenCalledOnce(); expect(fx.cancelled).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('fails after two minutes of upstream silence without inventing completion or retrying', async () => {
    const fx = fixture(), pending = fx.send();
    const rejected = expect(pending).rejects.toMatchObject({ status: 504, code: 'STREAM_IDLE_TIMEOUT', failure: 'timeout' });
    await vi.advanceTimersByTimeAsync(0); fx.source.enqueue(encode(text)); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(119_999); expect(fx.cancelled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await rejected;
    expect(fx.received).toEqual([{ type: 'text_delta', text: 'Reply' }]);
    expect(fx.fetcher).toHaveBeenCalledOnce(); expect(fx.cancelled).toHaveBeenCalledOnce();
    expect(fx.body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['headers', 'validation body'])('bounds a stalled %s wait without a compatibility retry', async phase => {
    vi.useFakeTimers();
    const cancelled = vi.fn();
    const fetcher = vi.fn<typeof fetch>((_url, init) => phase === 'validation body'
      ? Promise.resolve(new Response(new ReadableStream({ cancel: cancelled }), { status: 400 }))
      : new Promise<Response>((_resolve, reject) => { init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }); }));
    const client = new PlaygroundClient('https://gateway.invalid/v1', fetcher);
    const rejected = expect(client.chat('sk-fixture', input, new AbortController().signal)).rejects.toMatchObject({ code: 'STREAM_IDLE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(120_000); await rejected;
    expect(fetcher).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    if (phase === 'validation body') expect(cancelled).toHaveBeenCalledOnce();
  });

  it('honors Stop without waiting for broken upstream body cancellation', async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const fetcher = vi.fn<typeof fetch>(async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
    const client = new PlaygroundClient('https://gateway.invalid/v1', fetcher), controller = new AbortController();
    const consume = async () => { for await (const _event of await client.chat('sk-fixture', input, controller.signal)) { /* Consume the stream. */ } };
    const rejected = expect(consume()).rejects.toHaveProperty('name', 'AbortError');
    await vi.advanceTimersByTimeAsync(0); controller.abort(); await rejected;
    expect(cancelled).toHaveBeenCalledOnce(); expect(body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
});
