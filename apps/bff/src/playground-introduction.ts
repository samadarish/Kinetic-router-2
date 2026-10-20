import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from 'redis';
import { config } from './config.js';

export class PlaygroundIntroductionError extends Error {
  constructor() { super('The portal could not complete the request.'); }
}

export interface PlaygroundIntroductionStore {
  visited(userId: string): Promise<boolean>;
  markVisited(userId: string): Promise<void>;
  close(): Promise<void>;
}

async function available<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch { throw new PlaygroundIntroductionError(); }
}

export class MemoryPlaygroundIntroductionStore implements PlaygroundIntroductionStore {
  private readonly accounts = new Set<string>();
  async visited(userId: string) { return this.accounts.has(userId); }
  async markVisited(userId: string) { this.accounts.add(userId); }
  async close() {}
}

// Local development is a single process; serialize merges across instances by file path.
const fileQueues = new Map<string, Promise<void>>();
export class FilePlaygroundIntroductionStore implements PlaygroundIntroductionStore {
  private readonly path: string;
  constructor(path: string) { this.path = resolve(path); }
  private async accounts(): Promise<Set<string>> {
    let raw: string;
    try { raw = await readFile(this.path, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set(); throw error; }
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
      || !('visited' in value) || !Array.isArray(value.visited)
      || !value.visited.every((id): id is string => typeof id === 'string' && id.length > 0)) throw new PlaygroundIntroductionError();
    return new Set(value.visited);
  }
  visited(userId: string) { return available(async () => (await this.accounts()).has(userId)); }
  markVisited(userId: string): Promise<void> {
    const operation = (fileQueues.get(this.path) ?? Promise.resolve()).then(() => available(async () => {
      const accounts = await this.accounts();
      if (accounts.has(userId)) return;
      accounts.add(userId);
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify({ version: 1, visited: [...accounts] }), { encoding: 'utf8', mode: 0o600, flag: 'wx', flush: true });
        await rename(temporary, this.path);
      } finally { await unlink(temporary).catch(() => {}); }
    }));
    const settled = operation.then(() => {}, () => {});
    fileQueues.set(this.path, settled);
    void settled.then(() => { if (fileQueues.get(this.path) === settled) fileQueues.delete(this.path); });
    return operation;
  }
  async close() { await fileQueues.get(this.path); }
}

export const PLAYGROUND_INTRODUCTION_KEY = 'kr:portal:onboarding:playground:visited';
export class RedisPlaygroundIntroductionStore implements PlaygroundIntroductionStore {
  private readonly client;
  private connection?: Promise<unknown>;
  constructor(url: string) {
    this.client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 1500, reconnectStrategy: false } });
    this.client.on('error', () => {});
  }
  private async ready() {
    if (this.client.isReady) return;
    if (!this.connection) this.connection = this.client.connect().finally(() => { this.connection = undefined; });
    await this.connection;
  }
  visited(userId: string) {
    return available(async () => { await this.ready(); return (await this.client.withCommandOptions({ timeout: 1500 }).sIsMember(PLAYGROUND_INTRODUCTION_KEY, userId)) === 1; });
  }
  markVisited(userId: string) {
    return available(async () => { await this.ready(); await this.client.withCommandOptions({ timeout: 1500 }).sAdd(PLAYGROUND_INTRODUCTION_KEY, userId); });
  }
  async close() { if (this.client.isOpen) this.client.destroy(); }
}

export function createPlaygroundIntroductionStore(): PlaygroundIntroductionStore {
  if (process.env.VITEST || config.nodeEnv === 'test') return new MemoryPlaygroundIntroductionStore();
  if (config.redisUrl) return new RedisPlaygroundIntroductionStore(config.redisUrl);
  if (config.production) throw new PlaygroundIntroductionError();
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  return new FilePlaygroundIntroductionStore(resolve(root, '.cache/playground-introduction.json'));
}
