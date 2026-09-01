import { createClient, type RedisClientType } from 'redis';
import type { CapabilityMap, PortalUser } from '@kineticrouter/portal-contract';
import type { TokenBundle } from '@kineticrouter/sub2api-client';
import { config } from './config.js';
import { decryptJson, encryptJson, randomToken } from './crypto.js';
import { logger } from './logger.js';

export type PortalSession = {
  id: string;
  csrfToken: string;
  user: PortalUser;
  capabilities: CapabilityMap;
  tokens: TokenBundle;
  createdAt: number;
  updatedAt: number;
};

export interface SessionStore {
  get(id: string): Promise<PortalSession | null>;
  set(session: PortalSession): Promise<void>;
  delete(id: string): Promise<void>;
  withLock<T>(id: string, callback: () => Promise<T>): Promise<T>;
  ping(): Promise<void>;
  hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
  close(): Promise<void>;
}

class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, { session: PortalSession; expiresAt: number }>();
  private readonly locks = new Map<string, Promise<void>>();
  private readonly rateLimits = new Map<string, { count: number; expiresAt: number }>();

  async get(id: string): Promise<PortalSession | null> {
    const record = this.sessions.get(id);
    if (!record) return null;
    if (record.expiresAt <= Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    return structuredClone(record.session);
  }

  async set(session: PortalSession): Promise<void> {
    this.sessions.set(session.id, {
      session: structuredClone(session),
      expiresAt: Date.now() + config.sessionTtlSeconds * 1000,
    });
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async withLock<T>(id: string, callback: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.locks.set(id, queued);
    await previous;
    try {
      return await callback();
    } finally {
      release();
      if (this.locks.get(id) === queued) this.locks.delete(id);
    }
  }

  async close(): Promise<void> {}

  async ping(): Promise<void> {}

  async hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    const current = this.rateLimits.get(key);
    if (!current || current.expiresAt <= now) {
      this.rateLimits.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
      if (this.rateLimits.size > 5_000) {
        for (const [entryKey, entry] of this.rateLimits) if (entry.expiresAt <= now) this.rateLimits.delete(entryKey);
      }
      return false;
    }
    current.count += 1;
    return current.count > limit;
  }
}

class RedisSessionStore implements SessionStore {
  private readonly client: RedisClientType;
  private connected = false;

  constructor(url: string) {
    this.client = createClient({ url });
    this.client.on('error', (error) => logger.error({ err: error }, 'Portal Redis error'));
  }

  private async ready() {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async get(id: string): Promise<PortalSession | null> {
    await this.ready();
    const value = await this.client.get(this.sessionKey(id));
    if (!value) return null;
    try {
      return decryptJson<PortalSession>(value, config.sessionEncryptionKey);
    } catch (error) {
      logger.warn({ err: error, sessionId: id.slice(0, 8) }, 'Discarding unreadable portal session');
      await this.delete(id);
      return null;
    }
  }

  async set(session: PortalSession): Promise<void> {
    await this.ready();
    await this.client.set(
      this.sessionKey(session.id),
      encryptJson(session, config.sessionEncryptionKey),
      { EX: config.sessionTtlSeconds },
    );
  }

  async delete(id: string): Promise<void> {
    await this.ready();
    await this.client.del(this.sessionKey(id));
  }

  async withLock<T>(id: string, callback: () => Promise<T>): Promise<T> {
    await this.ready();
    const lockKey = `kr:portal:lock:${id}`;
    const token = randomToken(16);
    const deadline = Date.now() + 6_000;
    while (Date.now() < deadline) {
      const acquired = await this.client.set(lockKey, token, { NX: true, PX: 20_000 });
      if (acquired === 'OK') {
        try {
          return await callback();
        } finally {
          await this.client.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            { keys: [lockKey], arguments: [token] },
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 80 + Math.floor(Math.random() * 40)));
    }
    throw new Error('Session refresh lock timed out.');
  }

  async close(): Promise<void> {
    if (this.connected) await this.client.quit();
  }

  async ping(): Promise<void> {
    await this.ready();
    const response = await this.client.ping();
    if (response !== 'PONG') throw new Error('Portal Redis did not answer PING.');
  }

  async hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    await this.ready();
    const redisKey = `kr:portal:ratelimit:${key}`;
    const count = await this.client.incr(redisKey);
    if (count === 1) await this.client.expire(redisKey, windowSeconds);
    return count > limit;
  }

  private sessionKey(id: string) {
    return `kr:portal:session:${id}`;
  }
}

export function createSessionStore(): SessionStore {
  if (config.redisUrl) return new RedisSessionStore(config.redisUrl);
  if (config.production) throw new Error('REDIS_URL is required in production.');
  logger.warn('Using the in-memory session store for local development.');
  return new MemorySessionStore();
}

export function createSession(input: {
  user: PortalUser;
  capabilities: CapabilityMap;
  tokens: TokenBundle;
}): PortalSession {
  const now = Date.now();
  return {
    id: randomToken(),
    csrfToken: randomToken(),
    user: input.user,
    capabilities: input.capabilities,
    tokens: input.tokens,
    createdAt: now,
    updatedAt: now,
  };
}
