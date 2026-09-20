import type { SupportMessage, SupportWelcomeResult } from '@kineticrouter/portal-contract';

export const SUPPORT_WELCOME_DELAY_MS = 5_000;
const RETRY_MS = 30_000;

/** The server owns account-level uniqueness; this timer only waits for an eligible panel. */
export function scheduleSupportWelcome({ eligible, ensure, receive }: {
  eligible(): boolean;
  ensure(signal: AbortSignal): Promise<SupportWelcomeResult>;
  receive(message: SupportMessage): void;
}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false, complete = false, pending = false;

  function schedule(delay: number) {
    clearTimeout(timer);
    timer = undefined;
    if (!stopped && !complete && !pending && eligible()) timer = setTimeout(() => void run(), delay);
  }
  async function run() {
    timer = undefined;
    if (stopped || complete || pending || !eligible()) return;
    pending = true;
    try {
      const result = await ensure(controller.signal);
      if (stopped) return;
      complete = true;
      if (result.created) receive(result.message);
    } catch {
      // Support being unavailable must never interrupt authentication or the panel.
    } finally {
      pending = false;
      if (!complete) schedule(RETRY_MS);
    }
  }
  const refresh = () => schedule(SUPPORT_WELCOME_DELAY_MS);
  const stop = () => { stopped = true; clearTimeout(timer); controller.abort(); };
  refresh();
  return { refresh, stop };
}
