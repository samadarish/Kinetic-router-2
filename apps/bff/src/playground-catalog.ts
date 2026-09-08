import { createHash } from 'node:crypto';
import { playgroundModelSchema, type PlaygroundModel } from '@kineticrouter/portal-contract';
import type { OwnedPlaygroundKey, PlaygroundGateway } from '@kineticrouter/sub2api-client';

/** Only sanitized catalogs are retained; credentials and responses are never cached. */
export class PlaygroundCatalog {
  private readonly entries = new Map<string, { until: number; models: PlaygroundModel[] }>();
  constructor(private readonly client: PlaygroundGateway, private readonly now = Date.now, private readonly capacity = 100) {}
  async models(userId: string, key: OwnedPlaygroundKey, signal: AbortSignal): Promise<PlaygroundModel[]> {
    const fingerprint = createHash('sha256').update(key.key).digest('hex');
    const id = JSON.stringify([userId, key.id, key.groupId, fingerprint]);
    const cached = this.entries.get(id);
    if (cached && cached.until > this.now()) return cached.models;
    this.entries.delete(id);
    const rows = await this.client.models(key.key, signal);
    const seen = new Set<string>();
    const models = rows.flatMap(row => {
      const parsed = playgroundModelSchema.safeParse(row.id);
      if (!parsed.success || parsed.data !== row.id || seen.has(row.id)) return [];
      seen.add(row.id);
      return [{ id: row.id, name: row.id }];
    });
    for (const [entryId, entry] of this.entries) if (entry.until <= this.now()) this.entries.delete(entryId);
    if (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(id, { until: this.now() + 30_000, models });
    return models;
  }
}
