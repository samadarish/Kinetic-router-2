import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from 'redis';
import { playgroundSettingsSchema, type PlaygroundSettings, type PlaygroundSettingsUpdate } from '@kineticrouter/portal-contract';
import { config } from './config.js';

export class PlaygroundSettingsError extends Error {
  constructor(readonly status: 409 | 503) {
    super(status === 409 ? 'Playground settings changed. Reload the saved settings before trying again.' : 'Playground settings are unavailable. Reload before saving again.');
  }
  get code() { return this.status === 409 ? 'PLAYGROUND_SETTINGS_CONFLICT' : 'PLAYGROUND_SETTINGS_UNAVAILABLE'; }
}

export interface PlaygroundSettingsStore {
  read(): Promise<PlaygroundSettings>;
  save(input: PlaygroundSettingsUpdate): Promise<PlaygroundSettings>;
  close(): Promise<void>;
}
const empty = (): PlaygroundSettings => ({ revision: 0, enabledModelIds: [], modelIdentities: [], playgroundEnabled: true });
function decode(raw: string | null): PlaygroundSettings {
  if (raw === null) return empty();
  try { return playgroundSettingsSchema.parse(JSON.parse(raw)); }
  catch { throw new PlaygroundSettingsError(503); }
}
function nextSettings(current: PlaygroundSettings, input: PlaygroundSettingsUpdate): PlaygroundSettings {
  if (current.revision !== input.revision) throw new PlaygroundSettingsError(409);
  return playgroundSettingsSchema.parse({ revision: current.revision + 1, enabledModelIds: input.enabledModelIds, modelIdentities: input.modelIdentities ?? current.modelIdentities, playgroundEnabled: input.playgroundEnabled ?? current.playgroundEnabled });
}

/** Availability must not make account sign-in depend on the settings store. */
export async function publicPlaygroundEnabled(store: PlaygroundSettingsStore): Promise<boolean> {
  try { return (await store.read()).playgroundEnabled; }
  catch { return false; }
}
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { if (error instanceof PlaygroundSettingsError) throw error; throw new PlaygroundSettingsError(503); }
}

export class MemoryPlaygroundSettingsStore implements PlaygroundSettingsStore {
  private value = empty();
  async read() { return structuredClone(this.value); }
  async save(input: PlaygroundSettingsUpdate) { this.value = nextSettings(this.value, input); return this.read(); }
  async close() {}
}

/** Development only: one BFF process, serialized saves and atomic file replacement. */
const fileQueues = new Map<string, Promise<void>>();
export class FilePlaygroundSettingsStore implements PlaygroundSettingsStore {
  private readonly path: string;
  constructor(path: string) { this.path = resolve(path); }
  read() {
    return guarded(async () => {
      try { return decode(await readFile(this.path, 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty(); throw error; }
    });
  }
  save(input: PlaygroundSettingsUpdate): Promise<PlaygroundSettings> {
    const operation = (fileQueues.get(this.path) ?? Promise.resolve()).then(() => guarded(async () => {
      const next = nextSettings(await this.read(), input);
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(next), { encoding: 'utf8', mode: 0o600, flag: 'wx', flush: true });
        await rename(temporary, this.path);
      } finally { await unlink(temporary).catch(() => {}); }
      return next;
    }));
    const settled = operation.then(() => {}, () => {});
    fileQueues.set(this.path, settled);
    void settled.then(() => { if (fileQueues.get(this.path) === settled) fileQueues.delete(this.path); });
    return operation;
  }
  async close() { await fileQueues.get(this.path); }
}

const POLICY_KEY = 'kr:portal:settings:playground';
export class RedisPlaygroundSettingsStore implements PlaygroundSettingsStore {
  private readonly client;
  private connection?: Promise<unknown>;
  constructor(url: string) {
    this.client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 1500, reconnectStrategy: false } });
    // Errors are returned as local settings errors, without connection details.
    this.client.on('error', () => {});
  }
  private async ready() {
    if (this.client.isReady) return;
    if (!this.connection) this.connection = this.client.connect().finally(() => { this.connection = undefined; });
    await this.connection;
  }
  private commands() { return this.client.withCommandOptions({ timeout: 1500 }); }
  read() { return guarded(async () => { await this.ready(); return decode(await this.commands().get(POLICY_KEY)); }); }
  save(input: PlaygroundSettingsUpdate) {
    return guarded(async () => {
      await this.ready();
      const raw = await this.commands().get(POLICY_KEY);
      const next = nextSettings(decode(raw), input);
      const saved = await this.commands().eval(
        "local current = redis.call('GET', KEYS[1]); if ARGV[1] == 'missing' then if current then return 0 end elseif current ~= ARGV[2] then return 0 end; redis.call('SET', KEYS[1], ARGV[3]); return 1",
        { keys: [POLICY_KEY], arguments: [raw === null ? 'missing' : 'present', raw ?? '', JSON.stringify(next)] },
      );
      if (saved !== 1) throw new PlaygroundSettingsError(409);
      return next;
    });
  }
  async close() { if (this.client.isOpen) this.client.destroy(); }
}

export function createPlaygroundSettingsStore(): PlaygroundSettingsStore {
  if (process.env.VITEST || config.nodeEnv === 'test') return new MemoryPlaygroundSettingsStore();
  if (config.redisUrl) return new RedisPlaygroundSettingsStore(config.redisUrl);
  if (config.production) throw new Error('Redis is required for playground settings in production.');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  return new FilePlaygroundSettingsStore(resolve(root, '.cache/playground-settings.json'));
}
