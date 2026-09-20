import { createClient, type RedisClientType } from 'redis';
import { supportPresenceSchema, type SupportEvent, type SupportPresence, type SupportPresenceMode, type SupportPresenceUpdate } from '@kineticrouter/portal-contract';
import { config } from './config.js';
import { logger } from './logger.js';

export type SupportAudience = { ownerId?: string; admins: boolean };
type Listener = { actorId: string; admin: boolean; sessionId: string; receive(event: SupportEvent): void; close(): void };
type Envelope = { event: SupportEvent; audience: SupportAudience } | { revoke: string };
export interface SupportRealtime {
  subscribe(listener: Listener): Promise<() => void>;
  publish(event: SupportEvent, audience: SupportAudience): Promise<void>;
  presence(admin?: boolean): Promise<SupportPresence>;
  heartbeat(sessionId: string, tabId: string, active: boolean): Promise<SupportPresence>;
  setMode(mode: SupportPresenceMode): Promise<SupportPresence>;
  updatePresence(input: SupportPresenceUpdate): Promise<SupportPresence>;
  revoke(sessionId: string): Promise<void>;
  health(): Promise<boolean>;
  close(): Promise<void>;
}

const PREFIX = 'kr:support:';
const CHANNEL = `${PREFIX}events`;
const HEARTBEAT_MS = 120_000;
const AWAY_MS = 300_000;
function activityTimestamp(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) && timestamp >= 0 && timestamp <= 8.64e15 ? timestamp : null;
}
function status(now: number, hasHeartbeat: boolean, lastActivity: number, mode: SupportPresenceMode, statusText: string, lastSeen: number | null): SupportPresence {
  return {
    status: mode === 'online' ? 'online' : !hasHeartbeat || mode === 'offline' ? 'offline' : mode === 'away' || now - lastActivity >= AWAY_MS ? 'away' : 'online',
    mode, statusText, lastSeenAt: lastSeen === null ? null : new Date(lastSeen).toISOString(),
  };
}
function publicPresence(presence: SupportPresence): SupportPresence {
  return { status: presence.status, statusText: presence.statusText ?? '', lastSeenAt: presence.lastSeenAt ?? null };
}

/** Shared event delivery and expiring availability; message history lives only in PostgreSQL. */
export class SupportRealtimeService implements SupportRealtime {
  private readonly listeners = new Set<Listener>();
  private readonly beats = new Map<string, number>();
  private activity = 0;
  private lastSeen: number | null = null;
  private mode: SupportPresenceMode = 'automatic';
  private statusText = '';
  private readonly client?: RedisClientType;
  private readonly subscriber?: RedisClientType;
  private connecting?: Promise<void>;
  private subscribing?: Promise<void>;
  private subscribed = false;
  private closed = false;
  private lastPresence = '';
  private maintenance?: ReturnType<typeof setInterval>;
  private maintaining = false;

  constructor(private readonly url = config.redisUrl, private readonly now: () => number = Date.now, private readonly production = config.production) {
    if (url) {
      this.client = createClient({ url, socket: { connectTimeout: 1500, reconnectStrategy: false }, disableOfflineQueue: true });
      this.subscriber = this.client.duplicate();
      for (const client of [this.client, this.subscriber]) client.on('error', error => {
        logger.warn({ err: error }, 'Support realtime connection interrupted');
        this.subscribed = false;
        this.disconnectAll();
      });
    }
  }

  private async ready() {
    if (this.closed || (!this.url && this.production)) throw new Error('Support realtime is unavailable');
    if (!this.client || this.client.isReady) return;
    if (!this.connecting) this.connecting = this.client.connect().then(() => undefined).finally(() => { this.connecting = undefined; });
    await this.connecting;
  }

  private async ensureSubscription() {
    await this.ready();
    if (!this.subscriber || this.subscribed) return;
    if (!this.subscribing) this.subscribing = (async () => {
      if (!this.subscriber!.isReady) await this.subscriber!.connect();
      await this.subscriber!.withCommandOptions({ timeout: 1500 }).subscribe(CHANNEL, value => {
        try { this.deliver(JSON.parse(value) as Envelope); }
        catch { logger.warn('Discarded invalid support event'); }
      });
      this.subscribed = true;
    })().finally(() => { this.subscribing = undefined; });
    await this.subscribing;
  }

  async subscribe(listener: Listener) {
    await this.ensureSubscription();
    if (this.closed) throw new Error('Support realtime is unavailable');
    this.listeners.add(listener);
    if (!this.maintenance) {
      this.maintenance = setInterval(() => {
        if (this.maintaining) return;
        this.maintaining = true;
        void this.notifyPresence().catch(() => this.disconnectAll()).finally(() => { this.maintaining = false; });
      }, 15_000);
      this.maintenance.unref();
    }
    return () => { this.listeners.delete(listener); this.stopUnusedTimer(); };
  }

  private deliver(envelope: Envelope) {
    if ('revoke' in envelope) {
      for (const listener of this.listeners) if (listener.sessionId === envelope.revoke) { listener.close(); this.listeners.delete(listener); }
      this.stopUnusedTimer();
      return;
    }
    for (const listener of this.listeners) {
      if (envelope.event.type !== 'presence' && !(listener.admin && envelope.audience.admins) && listener.actorId !== envelope.audience.ownerId) continue;
      const event = envelope.event.type === 'presence' && !listener.admin
        ? { ...envelope.event, presence: publicPresence(envelope.event.presence!) }
        : envelope.event;
      listener.receive(event);
    }
  }

  async publish(event: SupportEvent, audience: SupportAudience) {
    const envelope = { event, audience };
    // Committed messages must remain successful even if Redis is temporarily unavailable.
    try {
      await this.ready();
      if (this.client) await this.client.withCommandOptions({ timeout: 1500 }).publish(CHANNEL, JSON.stringify(envelope));
      else this.deliver(envelope);
    } catch (error) {
      logger.warn({ err: error, type: event.type }, 'Support event delivery delayed; clients will refresh saved state');
      this.deliver(envelope);
    }
  }

  async presence(admin = false): Promise<SupportPresence> {
    await this.ready();
    const now = this.now();
    let presence: SupportPresence;
    if (this.client) {
      const client = this.client.withCommandOptions({ timeout: 1500 });
      const [count, values] = await Promise.all([
        client.zCount(`${PREFIX}heartbeats`, now - HEARTBEAT_MS + 1, '+inf'),
        client.mGet([`${PREFIX}activity`, `${PREFIX}mode`, `${PREFIX}status-text`, `${PREFIX}last-seen`]),
      ]);
      const [activity, mode, statusText, lastSeen] = values;
      const validMode = mode === 'online' || mode === 'away' || mode === 'offline' ? mode : 'automatic';
      const lastActivity = activityTimestamp(activity ?? null), savedLastSeen = activityTimestamp(lastSeen ?? null);
      // Older deployments only stored activity. Preserve that genuine timestamp when available.
      const knownLastSeen = savedLastSeen === null ? lastActivity : Math.max(savedLastSeen, lastActivity ?? savedLastSeen);
      presence = status(now, count > 0, lastActivity ?? 0, validMode, statusText ?? '', knownLastSeen);
    } else {
      for (const [key, at] of this.beats) if (at <= now - HEARTBEAT_MS) this.beats.delete(key);
      presence = status(now, this.beats.size > 0, this.activity, this.mode, this.statusText, this.lastSeen);
    }
    return admin ? presence : publicPresence(presence);
  }

  async heartbeat(sessionId: string, tabId: string, active: boolean) {
    await this.ready();
    const now = this.now();
    const key = `${sessionId}:${tabId}`;
    if (this.client) {
      await this.client.withCommandOptions({ timeout: 1500 }).eval(
        `local now = tonumber(ARGV[1]);
        redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - ARGV[2]);
        redis.call('ZADD', KEYS[1], ARGV[1], ARGV[3]);
        redis.call('PEXPIRE', KEYS[1], ARGV[2]);
        if ARGV[4] == '1' then
          local activity = tonumber(redis.call('GET', KEYS[2])) or 0;
          local lastSeen = tonumber(redis.call('GET', KEYS[3])) or 0;
          if now > activity then redis.call('SET', KEYS[2], ARGV[1], 'EX', 604800) end;
          redis.call('SET', KEYS[3], string.format('%.0f', math.max(now, activity, lastSeen)));
        end;
        return 1`,
        { keys: [`${PREFIX}heartbeats`, `${PREFIX}activity`, `${PREFIX}last-seen`], arguments: [String(now), String(HEARTBEAT_MS), key, active ? '1' : '0'] },
      );
    } else {
      this.beats.set(key, now);
      if (active) { this.activity = Math.max(this.activity, now); this.lastSeen = Math.max(this.lastSeen ?? now, now); }
    }
    return this.notifyPresence();
  }

  async setMode(mode: SupportPresenceMode) {
    return this.updatePresence({ mode });
  }

  async updatePresence(raw: SupportPresenceUpdate) {
    const input = supportPresenceSchema.parse(raw);
    await this.ready();
    if (this.client) {
      const values: Record<string, string> = {};
      if (input.mode !== undefined) values[`${PREFIX}mode`] = input.mode;
      if (input.statusText !== undefined) values[`${PREFIX}status-text`] = input.statusText;
      // MSET changes the requested preferences atomically, without expiring a manual mode.
      await this.client.withCommandOptions({ timeout: 1500 }).mSet(values);
    } else {
      if (input.mode !== undefined) this.mode = input.mode;
      if (input.statusText !== undefined) this.statusText = input.statusText;
    }
    return this.notifyPresence();
  }

  private async notifyPresence() {
    const presence = await this.presence(true);
    const serialized = JSON.stringify(presence);
    if (serialized !== this.lastPresence) {
      this.lastPresence = serialized;
      await this.publish({ type: 'presence', presence }, { admins: true });
    }
    return presence;
  }

  async revoke(sessionId: string) {
    this.deliver({ revoke: sessionId });
    for (const key of this.beats.keys()) if (key.startsWith(`${sessionId}:`)) this.beats.delete(key);
    if (this.client) {
      try {
        await this.ready();
        const client = this.client.withCommandOptions({ timeout: 1500 });
        await client.publish(CHANNEL, JSON.stringify({ revoke: sessionId }));
        const keys = (await client.zRange(`${PREFIX}heartbeats`, 0, -1)).filter(key => key.startsWith(`${sessionId}:`));
        if (keys.length) await client.zRem(`${PREFIX}heartbeats`, keys);
      } catch (error) { logger.warn({ err: error }, 'Support session stream cleanup delayed'); }
    }
    await this.notifyPresence().catch(() => {});
  }

  async health() { try { await this.ready(); if (this.client) await this.client.withCommandOptions({ timeout: 1500 }).ping(); return true; } catch { return false; } }
  private stopUnusedTimer() { if (!this.listeners.size && this.maintenance) { clearInterval(this.maintenance); this.maintenance = undefined; } }
  private disconnectAll() { for (const listener of this.listeners) listener.close(); this.listeners.clear(); this.stopUnusedTimer(); }
  async close() {
    this.closed = true;
    this.disconnectAll();
    for (const client of [this.subscriber, this.client]) if (client?.isOpen) client.destroy();
  }
}
