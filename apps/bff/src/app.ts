import { randomUUID } from 'node:crypto';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import {
  createApiKeySchema,
  loginInputSchema,
  passwordUpdateSchema,
  profileUpdateSchema,
  redeemInputSchema,
  totpInputSchema,
  updateApiKeySchema,
  usageSummaryQuerySchema,
  type CapabilityMap,
  type PortalUser,
} from '@kineticrouter/portal-contract';
import {
  Sub2ApiClient,
  Sub2ApiError,
  arrayValue,
  asRecord,
  mapAnnouncement,
  mapApiKey,
  mapChannel,
  mapDashboardStats,
  mapGroup,
  mapModels,
  mapPaginated,
  mapRedeemResult,
  mapRedemption,
  mapSubscription,
  mapTrend,
  mapUsageEndpoints,
  mapUsageError,
  mapUsageEvent,
  mapUsageGroups,
  mapUsageModels,
  mapUsageRangeStats,
  mapUsageTrend,
  mapUser,
  readCapabilities,
} from '@kineticrouter/sub2api-client';
import { config } from './config.js';
import { PRODUCT } from '@kineticrouter/platform-config/brand';
import { OPENAI_API_BASE_URL } from '@kineticrouter/platform-config/origins';
import { DEFAULT_THEME } from '@kineticrouter/platform-config/theme';
import { constantTimeEqual } from './crypto.js';
import { logger } from './logger.js';
import { createSession, createSessionStore, type PortalSession, type SessionStore } from './session-store.js';

type Variables = {
  requestId: string;
  sessionId?: string;
  session?: PortalSession;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const upstream = new Sub2ApiClient(config.sub2apiBaseUrl);
const settingsCache: { value?: Record<string, unknown>; expiresAt: number } = { expiresAt: 0 };

export function createApp(store: SessionStore = createSessionStore()) {
  const app = new Hono<{ Variables: Variables }>();

  app.use('*', secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
    },
    strictTransportSecurity: config.production ? 'max-age=31536000; includeSubDomains' : false,
    referrerPolicy: 'no-referrer',
  }));
  const standardBodyLimit = bodyLimit({ maxSize: 128 * 1024 });
  app.use('*', standardBodyLimit);
  app.use('*', async (c, next) => {
    const requestId = c.req.header('x-request-id')?.slice(0, 128) || randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    c.header('Cache-Control', 'no-store, max-age=0');
    c.header('Pragma', 'no-cache');
    await next();
  });

  app.get('/healthz', (c) => c.json({ status: 'ok' }));
  app.get('/readyz', async (c) => {
    try {
      await Promise.all([getPublicSettings(), store.ping()]);
      return c.json({ status: 'ready', upstream: 'reachable', sessions: 'ready' });
    } catch {
      return c.json({ status: 'degraded', upstream: 'unreachable' }, 503);
    }
  });

  app.options('/portal/v1/public-session', (c) => publicCorsPreflight(c));
  app.get('/portal/v1/public-session', async (c) => {
    const denied = applyCredentialedPublicCors(c);
    if (denied) return denied;
    const loaded = await loadSession(c, store);
    return success(c, loaded ? {
      authenticated: true,
      user: { id: loaded.user.id, username: loaded.user.username, avatarUrl: loaded.user.avatarUrl },
    } : { authenticated: false });
  });

  app.get('/portal/v1/config', async (c) => {
    const capabilities = await getCapabilities();
    return success(c, {
      brand: PRODUCT.name,
      apiBaseUrl: OPENAI_API_BASE_URL,
      defaultTheme: DEFAULT_THEME,
      capabilities,
      serverTimezone: config.serverTimezone,
      compatibility: {
        product: 'Sub2API',
        version: config.compatibility.version,
        revision: config.compatibility.revision,
      },
    });
  });
  app.get('/portal/v1/capabilities', async (c) => success(c, await getCapabilities()));

  app.get('/portal/v1/auth/session', async (c) => {
    const loaded = await loadSession(c, store);
    if (!loaded) {
      return success(c, { authenticated: false, capabilities: await getCapabilities() });
    }
    const capabilities = await getCapabilities();
    await updateSessionCapabilities(store, loaded.id, capabilities);
    return success(c, {
      authenticated: true,
      csrfToken: loaded.csrfToken,
      user: loaded.user,
      capabilities,
    });
  });

  const authRateLimit = loginRateLimit(store);

  app.post('/portal/v1/auth/password/login', requireOrigin, authRateLimit, async (c) => {
    const input = loginInputSchema.parse(await c.req.json());
    const result = await upstream.login(input);
    if (result.requires2fa) return success(c, result);

    const session = createSession({
      user: result.user,
      capabilities: await getCapabilities(),
      tokens: result.tokens,
    });
    await store.set(session);
    setSessionCookie(c, session.id);
    return success(c, {
      requires2fa: false,
      user: session.user,
      csrfToken: session.csrfToken,
      capabilities: session.capabilities,
    });
  });

  app.post('/portal/v1/auth/totp', requireOrigin, authRateLimit, async (c) => {
    const input = totpInputSchema.parse(await c.req.json());
    const result = await upstream.login2fa({ tempToken: input.tempToken, code: input.code });
    if (result.requires2fa) throw new Sub2ApiError({ status: 400, code: 'TOTP_REQUIRED', message: 'A valid authenticator code is required.' });
    const session = createSession({
      user: result.user,
      capabilities: await getCapabilities(),
      tokens: result.tokens,
    });
    await store.set(session);
    setSessionCookie(c, session.id);
    return success(c, {
      requires2fa: false,
      user: session.user,
      csrfToken: session.csrfToken,
      capabilities: session.capabilities,
    });
  });

  app.options('/portal/v1/auth/logout', (c) => logoutCorsPreflight(c));
  app.post('/portal/v1/auth/logout', requireLogoutOrigin, async (c) => {
    const loaded = await loadSession(c, store);
    if (loaded) {
      try {
        await upstream.logout(loaded.tokens.refreshToken);
      } catch (error) {
        logger.warn({ err: error, sessionId: loaded.id.slice(0, 8) }, 'Upstream logout revocation failed');
      } finally {
        await store.delete(loaded.id);
      }
    }
    clearSessionCookie(c);
    applyLogoutCorsHeaders(c);
    return success(c, { loggedOut: true });
  });

  app.use('/portal/v1/*', async (c, next) => {
    if (isPublicPortalPath(c.req.path)) {
      await next();
      return;
    }
    const loaded = await loadSession(c, store);
    if (!loaded) return failure(c, 401, 'AUTH_REQUIRED', 'Sign in to continue.');
    if (!SAFE_METHODS.has(c.req.method)) {
      const originResponse = await requireOrigin(c, async () => {});
      if (originResponse) return originResponse;
      const supplied = c.req.header('x-csrf-token') ?? '';
      if (!supplied || !constantTimeEqual(supplied, loaded.csrfToken)) {
        return failure(c, 403, 'CSRF_INVALID', 'The security token is missing or invalid.');
      }
    }
    c.set('sessionId', loaded.id);
    c.set('session', loaded);
    await next();
  });

  app.get('/portal/v1/dashboard', async (c) => {
    const session = requireSession(c);
    const dashboardQuery = dashboardDateQuery();
    const [profileRaw, statsRaw, trendRaw, modelsRaw] = await Promise.all([
      authRequest(c, store, (token) => upstream.request('user/profile', {}, authOptions(token))),
      authRequest(c, store, (token) => upstream.request('usage/dashboard/stats', {}, authOptions(token))),
      authRequest(c, store, (token) => upstream.request(`usage/dashboard/trend?${dashboardQuery.trend}`, {}, authOptions(token))),
      authRequest(c, store, (token) => upstream.request(`usage/dashboard/models?${dashboardQuery.models}`, {}, authOptions(token))),
    ]);
    const user = mapUser(asRecord(profileRaw));
    await updateSessionUser(store, session.id, user);
    return success(c, {
      user,
      stats: mapDashboardStats(statsRaw),
      trend: mapTrend(trendRaw),
      models: mapModels(modelsRaw),
    });
  });

  app.get('/portal/v1/me', async (c) => {
    const session = requireSession(c);
    const raw = await authRequest(c, store, (token) => upstream.request('user/profile', {}, authOptions(token)));
    const user = mapUser(asRecord(raw));
    await updateSessionUser(store, session.id, user);
    return success(c, user);
  });

  app.patch('/portal/v1/me', requireFeature('profile'), async (c) => {
    const input = profileUpdateSchema.parse(await c.req.json());
    const body = {
      ...(input.username !== undefined ? { username: input.username } : {}),
      ...(input.avatarUrl !== undefined ? { avatar_url: input.avatarUrl } : {}),
      ...(input.balanceNotifyEnabled !== undefined ? { balance_notify_enabled: input.balanceNotifyEnabled } : {}),
      ...(input.balanceNotifyThreshold !== undefined ? { balance_notify_threshold: input.balanceNotifyThreshold } : {}),
    };
    const raw = await authWrite(c, store, (token) => upstream.request('user', {
      method: 'PUT', body: JSON.stringify(body),
    }, authOptions(token)));
    const user = mapUser(asRecord(raw));
    await updateSessionUser(store, requireSession(c).id, user);
    return success(c, user);
  });

  app.put('/portal/v1/me/password', requireFeature('profile'), async (c) => {
    const input = passwordUpdateSchema.parse(await c.req.json());
    await authWrite(c, store, (token) => upstream.request('user/password', {
      method: 'PUT',
      body: JSON.stringify({ old_password: input.oldPassword, new_password: input.newPassword }),
    }, authOptions(token)));
    return success(c, { updated: true });
  });

  app.get('/portal/v1/groups', async (c) => {
    const raw = await authRequest(c, store, (token) => upstream.request('groups/available', {}, authOptions(token)));
    return success(c, arrayValue(raw).map(mapGroup));
  });

  app.get('/portal/v1/api-keys', async (c) => {
    const query = toUpstreamQuery(c, {
      page: 'page', pageSize: 'page_size', search: 'search', status: 'status', groupId: 'group_id',
      sortBy: 'sort_by', sortOrder: 'sort_order',
    }, { page: '1', page_size: '20', sort_by: 'created_at', sort_order: 'desc' });
    const raw = await authRequest(c, store, (token) => upstream.request(`keys?${query}`, {}, authOptions(token)));
    return success(c, mapPaginated(raw, mapApiKey));
  });

  app.get('/portal/v1/api-keys/:id', async (c) => {
    const raw = await authRequest(c, store, (token) => upstream.request(`keys/${encodeURIComponent(c.req.param('id'))}`, {}, authOptions(token)));
    return success(c, mapApiKey(raw));
  });

  app.post('/portal/v1/api-keys', requireFeature('keys'), async (c) => {
    const input = createApiKeySchema.parse(await c.req.json());
    const raw = await authWrite(c, store, (token) => upstream.request('keys', {
      method: 'POST', body: JSON.stringify(toCreateKeyBody(input)),
    }, authOptions(token)));
    return success(c, isObjectWithKey(raw) ? mapApiKey(raw) : raw, 201);
  });

  app.patch('/portal/v1/api-keys/:id', requireFeature('keys'), async (c) => {
    const input = updateApiKeySchema.parse(await c.req.json());
    const raw = await authWrite(c, store, (token) => upstream.request(`keys/${encodeURIComponent(c.req.param('id'))}`, {
      method: 'PUT', body: JSON.stringify(toUpdateKeyBody(input)),
    }, authOptions(token)));
    return success(c, isObjectWithKey(raw) ? mapApiKey(raw) : raw);
  });

  app.delete('/portal/v1/api-keys/:id', requireFeature('keys'), async (c) => {
    await authWrite(c, store, (token) => upstream.request(`keys/${encodeURIComponent(c.req.param('id'))}`, {
      method: 'DELETE',
    }, authOptions(token)));
    return success(c, { deleted: true });
  });

  app.get('/portal/v1/usage/summary', async (c) => {
    const fallback = defaultUsageDateRange();
    const range = usageSummaryQuerySchema.parse({
      startDate: c.req.query('startDate') || fallback.startDate,
      endDate: c.req.query('endDate') || fallback.endDate,
    });
    if (range.endDate > calendarDateInTimezone(new Date(), config.serverTimezone)) {
      throw new Sub2ApiError({ status: 400, code: 'INVALID_DATE_RANGE', message: 'Usage dates cannot be in the future.' });
    }
    const granularity = usageGranularity(range.startDate, range.endDate);
    const baseQuery = { start_date: range.startDate, end_date: range.endDate };
    const statsQuery = new URLSearchParams(baseQuery).toString();
    const modelsQuery = new URLSearchParams({ ...baseQuery, model_source: 'requested' }).toString();
    const snapshotQuery = new URLSearchParams({
      ...baseQuery,
      granularity,
      include_trend: 'true',
      include_model_stats: 'false',
      include_group_stats: 'true',
    }).toString();
    const [stats, models, snapshot] = await Promise.all([
      authRequest(c, store, (token) => upstream.request(`usage/stats?${statsQuery}`, {}, authOptions(token))),
      authRequest(c, store, (token) => upstream.request(`usage/dashboard/models?${modelsQuery}`, {}, authOptions(token))),
      authRequest(c, store, (token) => upstream.request(`usage/dashboard/snapshot-v2?${snapshotQuery}`, {}, authOptions(token))),
    ]);
    return success(c, {
      range: { ...range, granularity, timezone: config.serverTimezone },
      stats: mapUsageRangeStats(stats),
      trend: mapUsageTrend(snapshot),
      models: mapUsageModels(models),
      groups: mapUsageGroups(snapshot),
      endpoints: mapUsageEndpoints(stats),
    });
  });

  app.get('/portal/v1/usage/events', async (c) => {
    const query = toUpstreamQuery(c, {
      page: 'page', pageSize: 'page_size', startDate: 'start_date', endDate: 'end_date', apiKeyId: 'api_key_id',
      model: 'model', groupId: 'group_id', requestType: 'request_type', stream: 'stream', billingType: 'billing_type',
      billingMode: 'billing_mode', sortBy: 'sort_by', sortOrder: 'sort_order',
    }, { page: '1', page_size: '20', sort_by: 'created_at', sort_order: 'desc' });
    const raw = await authRequest(c, store, (token) => upstream.request(`usage?${query}`, {}, authOptions(token)));
    return success(c, mapPaginated(raw, mapUsageEvent));
  });

  app.get('/portal/v1/usage/errors', async (c) => {
    const query = toUpstreamQuery(c, {
      page: 'page', pageSize: 'page_size', startDate: 'start_date', endDate: 'end_date', model: 'model',
      category: 'category', apiKeyId: 'api_key_id', statusCode: 'status_code', sortBy: 'sort_by', sortOrder: 'sort_order',
    }, { page: '1', page_size: '20', sort_by: 'created_at', sort_order: 'desc' });
    const raw = await authRequest(c, store, (token) => upstream.request(`usage/errors?${query}`, {}, authOptions(token)));
    return success(c, mapPaginated(raw, mapUsageError));
  });

  app.get('/portal/v1/usage/errors/:id', async (c) => {
    const raw = await authRequest(c, store, (token) => upstream.request(`usage/errors/${encodeURIComponent(c.req.param('id'))}`, {}, authOptions(token)));
    return success(c, mapUsageError(raw));
  });

  app.get('/portal/v1/channels/status', async (c) => {
    const raw = await authRequest(c, store, (token) => upstream.request('channel-monitors', {}, authOptions(token)));
    const record = asRecord(raw);
    return success(c, arrayValue(record.items ?? raw).map(mapChannel));
  });

  app.get('/portal/v1/subscriptions', async (c) => {
    const raw = await authRequest(c, store, (token) => upstream.request('subscriptions', {}, authOptions(token)));
    const record = asRecord(raw);
    return success(c, arrayValue(record.items ?? raw).map(mapSubscription));
  });

  app.get('/portal/v1/redemptions', async (c) => {
    const raw = await authRequest(c, store, (token) => upstream.request('redeem/history', {}, authOptions(token)));
    const record = asRecord(raw);
    return success(c, arrayValue(record.items ?? raw).map(mapRedemption));
  });

  app.post('/portal/v1/redemptions', requireFeature('redeem'), async (c) => {
    const input = redeemInputSchema.parse(await c.req.json());
    const raw = await authWrite(c, store, (token) => upstream.request('redeem', {
      method: 'POST', body: JSON.stringify({ code: input.code }),
    }, authOptions(token)));
    return success(c, mapRedeemResult(raw));
  });

  app.get('/portal/v1/announcements', async (c) => {
    const unread = c.req.query('unreadOnly') === 'true' ? '?unread_only=1' : '';
    const raw = await authRequest(c, store, (token) => upstream.request(`announcements${unread}`, {}, authOptions(token)));
    const record = asRecord(raw);
    return success(c, arrayValue(record.items ?? raw).map(mapAnnouncement));
  });

  app.post('/portal/v1/announcements/:id/read', requireFeature('announcements'), async (c) => {
    await authWrite(c, store, (token) => upstream.request(`announcements/${encodeURIComponent(c.req.param('id'))}/read`, {
      method: 'POST', body: JSON.stringify({}),
    }, authOptions(token)));
    return success(c, { read: true });
  });

  app.notFound((c) => failure(c, 404, 'NOT_FOUND', 'The requested portal endpoint does not exist.'));

  app.onError((error, c) => {
    const requestId = c.get('requestId') || randomUUID();
    if (error instanceof Sub2ApiError) {
      const status = normalizeStatus(error.status);
      if (status >= 500) logger.error({ err: error, requestId, upstreamStatus: error.status }, 'Upstream request failed');
      return failure(c, status, error.code, error.message, error.reason, error.metadata);
    }
    if (error && typeof error === 'object' && 'issues' in error) {
      return failure(c, 400, 'VALIDATION_ERROR', 'Check the highlighted fields and try again.');
    }
    logger.error({ err: error, requestId }, 'Unhandled portal error');
    return failure(c, 500, 'INTERNAL_ERROR', 'The portal could not complete the request.');
  });

  return { app, store };
}

function isPublicPortalPath(path: string) {
  return path.startsWith('/portal/v1/auth/')
    || path === '/portal/v1/config'
    || path === '/portal/v1/capabilities'
    || path === '/portal/v1/public-session';
}

function isPublicSiteOrigin(origin: string | undefined) {
  return Boolean(origin && config.publicSiteOrigins.includes(origin));
}

function applyCredentialedPublicCors(c: Context<{ Variables: Variables }>): Response | undefined {
  const origin = c.req.header('origin');
  if (origin && !isPublicSiteOrigin(origin)) return failure(c, 403, 'ORIGIN_INVALID', 'The request origin is not allowed.');
  if (origin) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin');
  }
  return undefined;
}

function publicCorsPreflight(c: Context<{ Variables: Variables }>) {
  const denied = applyCredentialedPublicCors(c);
  if (denied) return denied;
  c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Accept');
  c.header('Access-Control-Max-Age', '600');
  return c.body(null, 204);
}

function applyLogoutCorsHeaders(c: Context) {
  const origin = c.req.header('origin');
  if (isPublicSiteOrigin(origin)) {
    c.header('Access-Control-Allow-Origin', origin!);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin');
  }
}

function logoutCorsPreflight(c: Context<{ Variables: Variables }>) {
  const origin = c.req.header('origin');
  if (!origin || (origin !== config.portalOrigin && !isPublicSiteOrigin(origin))) {
    return failure(c, 403, 'ORIGIN_INVALID', 'The request origin is not allowed.');
  }
  applyLogoutCorsHeaders(c);
  c.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Accept, Content-Type');
  c.header('Access-Control-Max-Age', '600');
  return c.body(null, 204);
}

async function getPublicSettings(): Promise<Record<string, unknown>> {
  if (settingsCache.value && settingsCache.expiresAt > Date.now()) return settingsCache.value;
  const settings = await upstream.publicSettings();
  settingsCache.value = settings;
  settingsCache.expiresAt = Date.now() + 60_000;
  return settings;
}

async function getCapabilities(): Promise<CapabilityMap> {
  return readCapabilities(await getPublicSettings(), {
    keys: config.enableKeyWrites,
    profile: config.enableProfileWrites,
    redeem: config.enableRedeemWrites,
    announcements: config.enableAnnouncementWrites,
  });
}

async function loadSession(c: Context<{ Variables: Variables }>, store: SessionStore): Promise<PortalSession | null> {
  const id = getCookie(c, config.sessionCookieName);
  if (!id) return null;
  const session = await store.get(id);
  if (!session) clearSessionCookie(c);
  return session;
}

function requireSession(c: Context<{ Variables: Variables }>): PortalSession {
  const session = c.get('session');
  if (!session) throw new Sub2ApiError({ status: 401, code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
  return session;
}

async function authRequest<T>(
  c: Context<{ Variables: Variables }>,
  store: SessionStore,
  request: (accessToken: string) => Promise<T>,
): Promise<T> {
  const current = requireSession(c);
  let active = current.tokens.expiresAt <= Date.now() + 30_000
    ? await refreshSession(store, current.id)
    : current;
  try {
    return await request(active.tokens.accessToken);
  } catch (error) {
    if (!(error instanceof Sub2ApiError) || error.status !== 401) throw error;
    active = await refreshSession(store, current.id, active.tokens.accessToken);
    return request(active.tokens.accessToken);
  }
}

async function authWrite<T>(
  c: Context<{ Variables: Variables }>,
  store: SessionStore,
  request: (accessToken: string) => Promise<T>,
): Promise<T> {
  const current = requireSession(c);
  const active = current.tokens.expiresAt <= Date.now() + 30_000
    ? await refreshSession(store, current.id)
    : current;
  return request(active.tokens.accessToken);
}

async function refreshSession(store: SessionStore, id: string, rejectedAccessToken?: string): Promise<PortalSession> {
  return store.withLock(id, async () => {
    const latest = await store.get(id);
    if (!latest) throw new Sub2ApiError({ status: 401, code: 'SESSION_EXPIRED', message: 'Your session has expired.' });
    if (rejectedAccessToken && latest.tokens.accessToken !== rejectedAccessToken) return latest;
    if (!rejectedAccessToken && latest.tokens.expiresAt > Date.now() + 30_000) return latest;
    try {
      latest.tokens = await upstream.refresh(latest.tokens.refreshToken);
      latest.updatedAt = Date.now();
      await store.set(latest);
      return latest;
    } catch (error) {
      await store.delete(id);
      throw error;
    }
  });
}

async function updateSessionUser(store: SessionStore, id: string, user: PortalUser): Promise<void> {
  await store.withLock(id, async () => {
    const current = await store.get(id);
    if (!current) return;
    current.user = user;
    current.updatedAt = Date.now();
    await store.set(current);
  });
}

async function updateSessionCapabilities(store: SessionStore, id: string, capabilities: CapabilityMap): Promise<void> {
  await store.withLock(id, async () => {
    const current = await store.get(id);
    if (!current) return;
    current.capabilities = capabilities;
    current.updatedAt = Date.now();
    await store.set(current);
  });
}

const requireOrigin: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const origin = c.req.header('origin');
  if (!origin || origin !== config.portalOrigin) {
    return failure(c, 403, 'ORIGIN_INVALID', 'The request origin is not allowed.');
  }
  await next();
};

const requireLogoutOrigin: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const origin = c.req.header('origin');
  if (!origin || (origin !== config.portalOrigin && !isPublicSiteOrigin(origin))) {
    return failure(c, 403, 'ORIGIN_INVALID', 'The request origin is not allowed.');
  }
  await next();
};

function requireFeature(feature: 'keys' | 'profile' | 'redeem' | 'announcements'): MiddlewareHandler<{ Variables: Variables }> {
  return async (c, next) => {
    const enabled = feature === 'keys'
      ? config.enableKeyWrites
      : feature === 'profile'
        ? config.enableProfileWrites
        : feature === 'redeem'
          ? config.enableRedeemWrites
          : config.enableAnnouncementWrites;
    if (!enabled) return failure(c, 403, 'FEATURE_DISABLED', 'This action is not enabled yet.');
    await next();
  };
}

function loginRateLimit(store: SessionStore): MiddlewareHandler<{ Variables: Variables }> {
  return async (c, next) => {
    const forwarded = config.trustProxy ? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() : undefined;
    const key = forwarded || getConnInfo(c).remote.address || 'local';
    if (await store.hitRateLimit(key, 10, 60)) return failure(c, 429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again shortly.');
    await next();
  };
}

function setSessionCookie(c: Context, id: string) {
  setCookie(c, config.sessionCookieName, id, {
    httpOnly: true,
    secure: config.production,
    sameSite: 'Lax',
    path: '/',
    maxAge: config.sessionTtlSeconds,
  });
}

function clearSessionCookie(c: Context) {
  deleteCookie(c, config.sessionCookieName, {
    secure: config.production,
    sameSite: 'Lax',
    path: '/',
  });
}

function authOptions(accessToken: string) {
  return {
    accessToken,
    timezone: config.serverTimezone,
    language: 'en',
    userUiRequest: true,
  };
}

function toUpstreamQuery(
  c: Context,
  fields: Record<string, string>,
  defaults: Record<string, string> = {},
): string {
  const params = new URLSearchParams(defaults);
  for (const [portalName, upstreamName] of Object.entries(fields)) {
    const value = c.req.query(portalName);
    if (value !== undefined && value !== '') params.set(upstreamName, value);
  }
  return params.toString();
}

function toCreateKeyBody(input: ReturnType<typeof createApiKeySchema.parse>) {
  return {
    name: input.name,
    ...(input.groupId ? { group_id: input.groupId } : {}),
    ...(input.customKey ? { custom_key: input.customKey } : {}),
    ...(input.ipWhitelist?.length ? { ip_whitelist: input.ipWhitelist } : {}),
    ...(input.ipBlacklist?.length ? { ip_blacklist: input.ipBlacklist } : {}),
    ...(input.quota !== null && input.quota !== undefined && input.quota > 0 ? { quota: input.quota } : {}),
    ...(input.expiresInDays !== null && input.expiresInDays !== undefined && input.expiresInDays > 0 ? { expires_in_days: input.expiresInDays } : {}),
    ...(input.rateLimit5h !== null && input.rateLimit5h !== undefined && input.rateLimit5h > 0 ? { rate_limit_5h: input.rateLimit5h } : {}),
    ...(input.rateLimit1d !== null && input.rateLimit1d !== undefined && input.rateLimit1d > 0 ? { rate_limit_1d: input.rateLimit1d } : {}),
    ...(input.rateLimit7d !== null && input.rateLimit7d !== undefined && input.rateLimit7d > 0 ? { rate_limit_7d: input.rateLimit7d } : {}),
  };
}

function dashboardDateQuery(days = 7) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  return {
    trend: new URLSearchParams({ start_date: startDate, end_date: endDate, granularity: 'day' }).toString(),
    models: new URLSearchParams({ start_date: startDate, end_date: endDate }).toString(),
  };
}

function defaultUsageDateRange() {
  const endDate = calendarDateInTimezone(new Date(), config.serverTimezone);
  const [year = 0, month = 0, day = 0] = endDate.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return {
    startDate: previous.toISOString().slice(0, 10),
    endDate,
  };
}

function calendarDateInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function usageGranularity(startDate: string, endDate: string): 'hour' | 'day' {
  const difference = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  return difference <= 86_400_000 ? 'hour' : 'day';
}

function toUpdateKeyBody(input: ReturnType<typeof updateApiKeySchema.parse>) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.groupId !== undefined ? { group_id: input.groupId } : {}),
    ...(input.ipWhitelist !== undefined ? { ip_whitelist: input.ipWhitelist } : {}),
    ...(input.ipBlacklist !== undefined ? { ip_blacklist: input.ipBlacklist } : {}),
    ...(input.quota !== undefined ? { quota: input.quota } : {}),
    ...(input.expiresAt !== undefined ? { expires_at: input.expiresAt } : {}),
    ...(input.rateLimit5h !== undefined ? { rate_limit_5h: input.rateLimit5h } : {}),
    ...(input.rateLimit1d !== undefined ? { rate_limit_1d: input.rateLimit1d } : {}),
    ...(input.rateLimit7d !== undefined ? { rate_limit_7d: input.rateLimit7d } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.resetQuota !== undefined ? { reset_quota: input.resetQuota } : {}),
    ...(input.resetRateLimitUsage !== undefined ? { reset_rate_limit_usage: input.resetRateLimitUsage } : {}),
  };
}

function isObjectWithKey(value: unknown): boolean {
  return Boolean(asRecord(value).key);
}

function success<T>(c: Context<{ Variables: Variables }>, data: T, status = 200) {
  return c.json({ ok: true as const, data, requestId: c.get('requestId') }, status as 200);
}

function failure(
  c: Context<{ Variables: Variables }>,
  status: number,
  code: string,
  message: string,
  reason?: string,
  metadata?: Record<string, unknown>,
) {
  return c.json({
    ok: false as const,
    error: { code, message, ...(reason ? { reason } : {}), ...(metadata ? { metadata } : {}) },
    requestId: c.get('requestId') || randomUUID(),
  }, status as 400);
}

function normalizeStatus(status: number): 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503 | 504 {
  if ([400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504].includes(status)) {
    return status as ReturnType<typeof normalizeStatus>;
  }
  return status >= 500 ? 502 : 400;
}
