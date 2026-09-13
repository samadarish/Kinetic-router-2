import { createHash } from 'node:crypto';
import { playgroundModelSchema, type PlaygroundModel } from '@kineticrouter/portal-contract';
import type { OwnedPlaygroundKey, PlaygroundGateway } from '@kineticrouter/sub2api-client';

const SHARED_DISCOVERY_TIMEOUT_MS = 120_000;

type CatalogOutcome = { models: PlaygroundModel[] } | { error: unknown };
type CatalogSubscriber = (outcome: CatalogOutcome) => void;
type PendingCatalog = {
  controller: AbortController;
  subscribers: Set<CatalogSubscriber>;
  timer?: ReturnType<typeof setTimeout>;
  settled: boolean;
};

/** Only sanitized catalogs are retained; credentials and responses are never cached. */
export class PlaygroundCatalog {
  private readonly entries = new Map<string, { until: number; models: PlaygroundModel[] }>();
  private readonly pending = new Map<string, PendingCatalog>();
  constructor(private readonly client: PlaygroundGateway, private readonly now = Date.now, private readonly capacity = 100) {}
  async models(userId: string, key: OwnedPlaygroundKey, signal: AbortSignal): Promise<PlaygroundModel[]> {
    signal.throwIfAborted();
    const fingerprint = createHash('sha256').update(key.key).digest('hex');
    const id = JSON.stringify([userId, key.id, key.groupId, fingerprint]);
    const cached = this.entries.get(id);
    if (cached && cached.until > this.now()) return cached.models;
    this.entries.delete(id);
    const pending = this.pending.get(id);
    if (pending) return this.subscribe(id, pending, signal);
    // Bound coordination without delaying or rejecting distinct callers.
    if (this.pending.size >= this.capacity) return this.discover(id, key.key, signal);
    const operation: PendingCatalog = { controller: new AbortController(), subscribers: new Set(), settled: false };
    this.pending.set(id, operation);
    // Joining callers inherit this fixed deadline; their own shorter deadlines still apply.
    operation.timer = setTimeout(() => this.cancel(id, operation, new DOMException('Model discovery timed out.', 'TimeoutError')), SHARED_DISCOVERY_TIMEOUT_MS);
    operation.timer.unref();
    const result = this.subscribe(id, operation, signal);
    if (!operation.settled) {
      // A single completion handler pair retains only the currently active subscribers.
      void this.discover(id, key.key, operation.controller.signal).then(
        models => this.finish(id, operation, { models }),
        error => this.finish(id, operation, { error }),
      );
    }
    return result;
  }

  private finish(id: string, pending: PendingCatalog, outcome: CatalogOutcome): void {
    if (pending.settled) return;
    pending.settled = true;
    clearTimeout(pending.timer);
    pending.timer = undefined;
    if (this.pending.get(id) === pending) this.pending.delete(id);
    for (const subscriber of pending.subscribers) subscriber(outcome);
    pending.subscribers.clear();
  }

  private cancel(id: string, pending: PendingCatalog, reason: unknown): void {
    if (pending.settled) return;
    // Release callers immediately, including when an upstream adapter ignores cancellation.
    this.finish(id, pending, { error: reason });
    pending.controller.abort(reason);
  }

  private subscribe(id: string, pending: PendingCatalog, signal: AbortSignal): Promise<PlaygroundModel[]> {
    return new Promise((resolve, reject) => {
      const subscriber: CatalogSubscriber = outcome => {
        if (!pending.subscribers.delete(subscriber)) return;
        signal.removeEventListener('abort', onAbort);
        if ('models' in outcome) resolve(outcome.models);
        else reject(outcome.error);
      };
      const onAbort = () => {
        subscriber({ error: signal.reason });
        if (!pending.subscribers.size) this.cancel(id, pending, signal.reason);
      };
      pending.subscribers.add(subscriber);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }

  private async discover(id: string, key: string, signal: AbortSignal): Promise<PlaygroundModel[]> {
    signal.throwIfAborted();
    const rows = await this.client.models(key, signal);
    // Even adapters that ignore cancellation must not cache abandoned discovery.
    signal.throwIfAborted();
    const seen = new Set<string>();
    const models = rows.flatMap(row => {
      const parsed = playgroundModelSchema.safeParse(row.id);
      if (!parsed.success || parsed.data !== row.id || seen.has(row.id)) return [];
      seen.add(row.id);
      return [{ id: row.id, name: row.id }];
    });
    const now = this.now();
    for (const [entryId, entry] of this.entries) if (entry.until <= now) this.entries.delete(entryId);
    if (this.capacity > 0) {
      if (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!);
      this.entries.set(id, { until: now + 30_000, models });
    }
    return models;
  }
}
