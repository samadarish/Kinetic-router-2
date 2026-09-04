import { createClient, type RedisClientType } from 'redis';
import type { CapabilityMap, PortalUser } from '@kineticrouter/portal-contract';
import type { TokenBundle } from '@kineticrouter/sub2api-client';
import { config } from './config.js';
import { decryptJson, encryptJson, randomToken } from './crypto.js';
import { logger } from './logger.js';

const SESSION_LOCK_LEASE_MS = 60_000;
const SESSION_LOCK_RENEW_MS = 15_000;
const SESSION_REVOCATION_TTL_SECONDS = config.sessionTtlSeconds;

export type PortalSession = {
  id: string;
  csrfToken: string;
  user: PortalUser;
  capabilities: CapabilityMap;
  tokens: TokenBundle;
  createdAt: number;
  updatedAt: number;
  revision: number;
};

export interface SessionStore {
  get(id: string): Promise<PortalSession | null>;
  set(session: PortalSession): Promise<void>;
  delete(id: string): Promise<void>;
  revoke(id: string): Promise<PortalSession | null>;
  withLock<T>(id: string, callback: () => Promise<T>, options?: { waitMs?: number }): Promise<T>;
  ping(): Promise<void>;
  hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
  close(): Promise<void>;
}

class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, { session: PortalSession; expiresAt: number }>();
  private readonly revocations = new Map<string, number>();
  private readonly locks = new Map<string, Promise<void>>();
  private readonly rateLimits = new Map<string, { count: number; expiresAt: number }>();

  async get(id: string): Promise<PortalSession | null> {
    if (this.isRevoked(id)) return null;
    const record = this.sessions.get(id);
    if (!record) return null;
    if (record.expiresAt <= Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    return normalizeSession(structuredClone(record.session));
  }

  async set(session: PortalSession): Promise<void> {
    if (this.isRevoked(session.id)) return;
    this.sessions.set(session.id, {
      session: structuredClone(session),
      expiresAt: Date.now() + config.sessionTtlSeconds * 1000,
    });
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async revoke(id: string): Promise<PortalSession | null> {
    const now = Date.now();
    const record = this.sessions.get(id);
    const session = record && record.expiresAt > now ? normalizeSession(structuredClone(record.session)) : null;
    if (!session && !this.locks.has(id)) {
      this.sessions.delete(id);
      return null;
    }
    this.revocations.set(id, now + SESSION_REVOCATION_TTL_SECONDS * 1000);
    this.sessions.delete(id);
    if (this.revocations.size > 5_000) {
      for (const [sessionId, expiresAt] of this.revocations) {
        if (expiresAt <= now) this.revocations.delete(sessionId);
      }
    }
    return session;
  }

  private isRevoked(id: string): boolean {
    const expiresAt = this.revocations.get(id);
    if (!expiresAt) return false;
    if (expiresAt > Date.now()) return true;
    this.revocations.delete(id);
    return false;
  }

  async withLock<T>(id: string, callback: () => Promise<T>, _options?: { waitMs?: number }): Promise<T> {
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
  private connection?: Promise<void>;

  constructor(url: string) {
    this.client = createClient({ url });
    this.client.on('error', (error) => logger.error({ err: error }, 'Portal Redis error'));
  }

  private async ready() {
    if (this.client.isReady) return;
    if (this.client.isOpen) return;
    const connection = this.connection ?? this.client.connect().then(() => undefined);
    this.connection = connection;
    try {
      await connection;
    } finally {
      if (this.connection === connection) this.connection = undefined;
    }
  }

  async get(id: string): Promise<PortalSession | null> {
    await this.ready();
    const [revoked, value] = await this.client.mGet([this.revocationKey(id), this.sessionKey(id)]);
    if (revoked) return null;
    if (!value) return null;
    try {
      return normalizeSession(decryptJson<PortalSession>(value, config.sessionEncryptionKey));
    } catch (error) {
      logger.warn({ err: error, sessionId: id.slice(0, 8) }, 'Discarding unreadable portal session');
      await this.delete(id);
      return null;
    }
  }

  async set(session: PortalSession): Promise<void> {
    await this.ready();
    await this.client.eval(
      "if redis.call('exists', KEYS[2]) == 1 then return 0 end; redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2]); return 1",
      {
        keys: [this.sessionKey(session.id), this.revocationKey(session.id)],
        arguments: [encryptJson(session, config.sessionEncryptionKey), String(config.sessionTtlSeconds)],
      },
    );
  }

  async delete(id: string): Promise<void> {
    await this.ready();
    await this.client.del(this.sessionKey(id));
  }

  async revoke(id: string): Promise<PortalSession | null> {
    await this.ready();
    const value = await this.client.eval(
      "local session = redis.call('get', KEYS[1]); if not session and redis.call('exists', KEYS[3]) == 0 then return nil end; redis.call('set', KEYS[2], '1', 'EX', ARGV[1]); redis.call('del', KEYS[1]); return session",
      {
        keys: [this.sessionKey(id), this.revocationKey(id), this.lockKey(id)],
        arguments: [String(SESSION_REVOCATION_TTL_SECONDS)],
      },
    );
    if (typeof value !== 'string') return null;
    try {
      return normalizeSession(decryptJson<PortalSession>(value, config.sessionEncryptionKey));
    } catch (error) {
      logger.warn({ err: error, sessionId: id.slice(0, 8) }, 'Discarding unreadable revoked portal session');
      return null;
    }
  }

  async withLock<T>(id: string, callback: () => Promise<T>, options?: { waitMs?: number }): Promise<T> {
    await this.ready();
    const lockKey = this.lockKey(id);
    const token = randomToken(16);
    const deadline = Date.now() + (options?.waitMs ?? 6_000);
    while (Date.now() < deadline) {
      const acquired = await this.client.set(lockKey, token, { NX: true, PX: SESSION_LOCK_LEASE_MS });
      if (acquired === 'OK') {
        let renewalRunning = false;
        const renewal = setInterval(() => {
          if (renewalRunning) return;
          renewalRunning = true;
          void this.client.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
            { keys: [lockKey], arguments: [token, String(SESSION_LOCK_LEASE_MS)] },
          ).catch((error) => {
            logger.warn({ err: error, sessionId: id.slice(0, 8) }, 'Portal session lock renewal failed');
          }).finally(() => {
            renewalRunning = false;
          });
        }, SESSION_LOCK_RENEW_MS);
        renewal.unref();
        try {
          return await callback();
        } finally {
          clearInterval(renewal);
          try {
            await this.client.eval(
              "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
              { keys: [lockKey], arguments: [token] },
            );
          } catch (error) {
            logger.warn({ err: error, sessionId: id.slice(0, 8) }, 'Portal session lock release failed');
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 80 + Math.floor(Math.random() * 40)));
    }
    throw new Error('Session refresh lock timed out.');
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
    this.connection = undefined;
  }

  async ping(): Promise<void> {
    await this.ready();
    const response = await this.client.ping();
    if (response !== 'PONG') throw new Error('Portal Redis did not answer PING.');
  }

  async hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    await this.ready();
    const redisKey = `kr:portal:ratelimit:${key}`;
    const count = await this.client.eval(
      "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count",
      { keys: [redisKey], arguments: [String(windowSeconds)] },
    );
    return Number(count) > limit;
  }

  private sessionKey(id: string) {
    return `kr:portal:session:${id}`;
  }

  private revocationKey(id: string) {
    return `kr:portal:revoked:${id}`;
  }

  private lockKey(id: string) {
    return `kr:portal:lock:${id}`;
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
    revision: 0,
  };
}

function normalizeSession(session: PortalSession): PortalSession {
  if (!Number.isSafeInteger(session.revision) || session.revision < 0) session.revision = 0;
  return session;
}
