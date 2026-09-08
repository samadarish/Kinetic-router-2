import { playgroundEventSchema, type PlaygroundEvent } from '@kineticrouter/portal-contract';

export async function consumePlaygroundStream(body: ReadableStream<Uint8Array>, onEvent: (event: PlaygroundEvent) => void, signal: AbortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  let dataSize = 0;
  const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 256 * 1024) throw new Error('The response could not be read.');
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (!line) {
          if (data.length) {
            let event: PlaygroundEvent;
            try { event = playgroundEventSchema.parse(JSON.parse(data.join('\n'))); }
            catch { throw new Error('The response could not be read.'); }
            onEvent(event);
            if (event.type === 'done' || event.type === 'error') return;
          }
          data = []; dataSize = 0;
        } else if (line.startsWith('data:')) {
          const value = line.slice(5).replace(/^ /, '');
          dataSize += value.length;
          if (dataSize > 256 * 1024) throw new Error('The response could not be read.');
          data.push(value);
        }
      }
      if (chunk.done) throw new Error('The response was interrupted. Check Usage for any billed cost.');
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
