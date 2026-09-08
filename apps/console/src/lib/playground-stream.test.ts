import { describe, expect, it, vi } from 'vitest';
import { consumePlaygroundStream } from './playground-stream';
import type { PlaygroundEvent } from '@kineticrouter/portal-contract';

function stream(value: string) {
  const bytes = new TextEncoder().encode(value);
  return new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
}
describe('playground browser stream reader', () => {
  it('reads final text, exact token counts, and completion across split frames', async () => {
    const events: PlaygroundEvent[] = [];
    const values: PlaygroundEvent[] = [{ type: 'text_delta', text: 'Hello 🌍\nnext line' }, { type: 'usage', usage: { inputTokens: 7, outputTokens: 13, totalTokens: 20 } }, { type: 'done', finishReason: 'stop' }];
    await consumePlaygroundStream(stream(values.map(event => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join('')), event => events.push(event), new AbortController().signal);
    expect(events).toEqual(values);
  });
  it('does not expose unexpected metadata in malformed public events', async () => {
    const received = vi.fn();
    const body = stream('data: {"type":"text_delta","text":"answer","rateMultiplier":"private"}\n\n');
    await expect(consumePlaygroundStream(body, received, new AbortController().signal)).rejects.toThrow('The response could not be read.');
    expect(received).not.toHaveBeenCalled();
  });
  it('recognizes a terminal error without pretending it completed', async () => {
    const received = vi.fn();
    await consumePlaygroundStream(stream('data: {"type":"error","code":"STREAM_INTERRUPTED","message":"Interrupted"}\n\n'), received, new AbortController().signal);
    expect(received).toHaveBeenCalledExactlyOnceWith({ type: 'error', code: 'STREAM_INTERRUPTED', message: 'Interrupted' });
  });
  it('rejects a stream that ends before a terminal event', async () => {
    await expect(consumePlaygroundStream(stream('data: {"type":"text_delta","text":"partial"}\n\n'), () => {}, new AbortController().signal)).rejects.toThrow('interrupted');
  });
  it('stops a waiting reader when the page unmounts or a send is cancelled', async () => {
    const cancelled = vi.fn();
    const controller = new AbortController();
    const pending = consumePlaygroundStream(new ReadableStream<Uint8Array>({ cancel: cancelled }), () => {}, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(cancelled).toHaveBeenCalledTimes(1);
  });
});
