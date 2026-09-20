import type { SupportEvent } from '@kineticrouter/portal-contract';

/** A separate transport: the ordinary JSON client has a 20-second timeout. */
export async function consumeSupportStream(body: ReadableStream<Uint8Array>, onEvent: (event: SupportEvent) => void, signal: AbortSignal, idleTimeoutMs = 45000) {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = '', data: string[] = [], size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (!signal.aborted) {
      let idle: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => { idle = setTimeout(() => reject(new Error('Support connection timed out.')), idleTimeoutMs); }),
      ]).finally(() => clearTimeout(idle));
      if (signal.aborted) return;
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 128 * 1024) throw new Error('Support connection returned an invalid response.');
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
        if (!line) {
          if (data.length) {
            const event = JSON.parse(data.join('\n')) as SupportEvent;
            if (!event || !['ready', 'message', 'tickets', 'read', 'presence'].includes(event.type)) throw new Error('Invalid support event.');
            if (event.type === 'message' && (!event.message?.id || !event.message.ticketId || !['admin', 'customer'].includes(event.message.sender))) throw new Error('Invalid support message.');
            onEvent(event);
          }
          data = []; size = 0;
        } else if (line.startsWith('data:')) {
          const value = line.slice(5).replace(/^ /, ''); size += value.length;
          if (size > 128 * 1024) throw new Error('Support event is too large.');
          data.push(value);
        }
      }
      if (chunk.done) return;
    }
  } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function clearSupportDrafts(storage: Storage | undefined) {
  try {
    if (!storage) return;
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith('kinetic-support-draft:')) storage.removeItem(key);
    }
  } catch { /* Private browsing can restrict storage. */ }
}
