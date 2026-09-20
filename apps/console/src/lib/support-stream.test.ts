import { describe, expect, it } from 'vitest';
import { consumeSupportStream, clearSupportDrafts } from './support-stream';
import type { SupportEvent } from '@kineticrouter/portal-contract';

describe('support stream', () => {
  it('parses split frames, CRLF, comments and multi-byte text', async () => {
    const data = new TextEncoder().encode(': keepalive\r\n\r\nevent: support\r\ndata: {"type":"ready"}\r\n\r\ndata: {"type":"message","message":{"id":"one","ticketId":"ticket","sender":"admin","body":"Hello 👋"}}\n\n');
    const body = new ReadableStream<Uint8Array>({ start(controller) { for (let i = 0; i < data.length; i += 3) controller.enqueue(data.slice(i, i + 3)); controller.close(); } });
    const events: SupportEvent[] = [];
    await consumeSupportStream(body, value => events.push(value), new AbortController().signal);
    expect(events.map(value => value.type)).toEqual(['ready', 'message']);
    expect(events[1]?.message?.body).toBe('Hello 👋');
  });
  it('rejects malformed data and bounded oversized frames', async () => {
    for (const text of ['data: {"type":"bad"}\n\n', 'data: {"type":"message"}\n\n', 'x'.repeat(129 * 1024)]) {
      const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close(); } });
      await expect(consumeSupportStream(body, () => {}, new AbortController().signal)).rejects.toThrow();
    }
  });
  it('cancels an idle stream on logout without waiting for a server frame', async () => {
    let cancelled = false; const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const result = consumeSupportStream(body, () => {}, controller.signal); controller.abort(); await result;
    expect(cancelled).toBe(true);
  });
  it('reconnects a half-open connection when server keepalives stop', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    await expect(consumeSupportStream(body, () => {}, new AbortController().signal, 15)).rejects.toThrow('timed out');
    expect(cancelled).toBe(true);
  });
  it('clears account drafts while preserving unrelated storage', () => {
    const data = new Map([['kinetic-support-draft:one', 'secret'], ['theme', 'dark'], ['kinetic-support-draft:two', 'draft']]);
    const saved = { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null, removeItem: (key: string) => { data.delete(key); } } as Storage;
    clearSupportDrafts(saved); expect([...data.keys()]).toEqual(['theme']);
  });
});
