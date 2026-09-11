import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from 'redis';
import { DEFAULT_SOCIAL_LINKS, websiteSettingsSchema, type WebsiteSettings } from '@kineticrouter/portal-contract';
import { config } from './config.js';

export class WebsiteSettingsError extends Error {
  constructor(readonly status: 409 | 503) {
    super(status === 409 ? 'Website settings changed. Reload the saved settings before trying again.' : 'Website settings are unavailable. Reload before saving again.');
  }
  get code() { return this.status === 409 ? 'WEBSITE_SETTINGS_CONFLICT' : 'WEBSITE_SETTINGS_UNAVAILABLE'; }
}

export interface WebsiteSettingsStore {
  read(): Promise<WebsiteSettings>;
  save(input: WebsiteSettings): Promise<WebsiteSettings>;
  close(): Promise<void>;
}
function decode(raw: string | null): WebsiteSettings {
  if (raw === null) return { revision: 0, socialLinks: { ...DEFAULT_SOCIAL_LINKS } };
  try { return websiteSettingsSchema.parse(JSON.parse(raw)); }
  catch { throw new WebsiteSettingsError(503); }
}
function nextSettings(current: WebsiteSettings, input: WebsiteSettings): WebsiteSettings {
  const valid = websiteSettingsSchema.parse(input);
  if (current.revision !== valid.revision) throw new WebsiteSettingsError(409);
  return websiteSettingsSchema.parse({ ...valid, revision: current.revision + 1 });
}
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { if (error instanceof WebsiteSettingsError) throw error; throw new WebsiteSettingsError(503); }
}

export class MemoryWebsiteSettingsStore implements WebsiteSettingsStore {
  private value = decode(null);
  async read() { return structuredClone(this.value); }
  async save(input: WebsiteSettings) { this.value = nextSettings(this.value, input); return this.read(); }
  async close() {}
}

// Development uses one process, atomic replacement, and a queue shared by file path.
const fileQueues = new Map<string, Promise<void>>();
export class FileWebsiteSettingsStore implements WebsiteSettingsStore {
  private readonly path: string;
  constructor(path: string) { this.path = resolve(path); }
  read() {
    return guarded(async () => {
      try { return decode(await readFile(this.path, 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return decode(null); throw error; }
    });
  }
  save(input: WebsiteSettings): Promise<WebsiteSettings> {
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

const SETTINGS_KEY = 'kr:portal:settings:website';
export class RedisWebsiteSettingsStore implements WebsiteSettingsStore {
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
  private commands() { return this.client.withCommandOptions({ timeout: 1500 }); }
  read() { return guarded(async () => { await this.ready(); return decode(await this.commands().get(SETTINGS_KEY)); }); }
  save(input: WebsiteSettings) {
    return guarded(async () => {
      await this.ready();
      const raw = await this.commands().get(SETTINGS_KEY);
      const next = nextSettings(decode(raw), input);
      const saved = await this.commands().eval(
        "local current = redis.call('GET', KEYS[1]); if ARGV[1] == 'missing' then if current then return 0 end elseif current ~= ARGV[2] then return 0 end; redis.call('SET', KEYS[1], ARGV[3]); return 1",
        { keys: [SETTINGS_KEY], arguments: [raw === null ? 'missing' : 'present', raw ?? '', JSON.stringify(next)] },
      );
      if (saved !== 1) throw new WebsiteSettingsError(409);
      return next;
    });
  }
  async close() { if (this.client.isOpen) this.client.destroy(); }
}

export function createWebsiteSettingsStore(): WebsiteSettingsStore {
  if (process.env.VITEST || config.nodeEnv === 'test') return new MemoryWebsiteSettingsStore();
  if (config.redisUrl) return new RedisWebsiteSettingsStore(config.redisUrl);
  if (config.production) throw new Error('Redis is required for website settings in production.');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  return new FileWebsiteSettingsStore(resolve(root, '.cache/website-settings.json'));
}
