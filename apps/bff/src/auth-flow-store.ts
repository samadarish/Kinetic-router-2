import { createClient } from 'redis';
import type { OAuthCookieJar } from '@kineticrouter/sub2api-client';
import { config } from './config.js';
import { decryptJson, encryptJson, randomToken } from './crypto.js';
import { logger } from './logger.js';

export type AuthFlow = {
  stage: 'authorize' | 'registration';
  state: string;
  cookies: OAuthCookieJar;
  next: string;
  expiresAt: number;
  email?: string;
  invitationRequired?: boolean;
};
export interface AuthFlowStore {
  put(flow: AuthFlow): Promise<string>;
  get(id: string): Promise<AuthFlow | null>;
  take(id: string): Promise<AuthFlow | null>;
  close(): Promise<void>;
}

export function createAuthFlowStore(redisUrl = config.redisUrl, now = Date.now): AuthFlowStore {
  const memory = new Map<string, AuthFlow>();
  const redis = redisUrl ? createClient({ url: redisUrl }) : undefined;
  redis?.on('error', () => logger.warn('OAuth transaction storage is unavailable'));
  let connection: Promise<unknown> | undefined;
  async function ready() {
    if (!redis || redis.isReady) return;
    connection ??= redis.connect().finally(() => { connection = undefined; });
    await connection;
  }
  const key = (id: string) => `kr:portal:oauth:${id}`;
  const validId = (id: string) => /^[A-Za-z0-9_-]{43}$/.test(id);
  const valid = (flow: AuthFlow | undefined | null) => flow && flow.expiresAt > now() ? flow : null;
  async function read(id: string, consume: boolean) {
    if (!validId(id)) return null;
    if (!redis) {
      const flow = valid(memory.get(id));
      if (consume || !flow) memory.delete(id);
      return flow ? structuredClone(flow) : null;
    }
    await ready();
    const value = consume ? await redis.getDel(key(id)) : await redis.get(key(id));
    if (!value) return null;
    try { return valid(decryptJson<AuthFlow>(value, config.sessionEncryptionKey)); }
    catch { return null; }
  }
  return {
    async put(flow) {
      const ttl = Math.ceil((flow.expiresAt - now()) / 1000);
      if (ttl <= 0 || ttl > 600) throw new Error('Invalid OAuth transaction expiry.');
      const id = randomToken();
      if (redis) {
        await ready();
        await redis.set(key(id), encryptJson(flow, config.sessionEncryptionKey), { EX: ttl, NX: true });
      } else {
        for (const [key, value] of memory) if (!valid(value)) memory.delete(key);
        if (memory.size >= 1000) throw new Error('OAuth transaction capacity reached.');
        memory.set(id, structuredClone(flow));
      }
      return id;
    },
    get: id => read(id, false),
    take: id => read(id, true),
    async close() { memory.clear(); if (redis?.isOpen) await redis.quit(); },
  };
}
