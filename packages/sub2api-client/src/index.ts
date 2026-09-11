import type {
  Announcement,
  ApiKey,
  CapabilityMap,
  ChannelMonitor,
  DashboardStats,
  ModelUsage,
  Paginated,
  PortalUser,
  Redemption,
  RedeemResult,
  TrendPoint,
} from '@kineticrouter/portal-contract';
import type {
  InternalApiKey, InternalGroup, InternalSubscription, InternalUsageEndpointBreakdown,
  InternalUsageError, InternalUsageEvent, InternalUsageGroupBreakdown, InternalUsageModelBreakdown,
  InternalUsageRangeStats, InternalUsageTrendPoint,
} from './internal-types.js';
export type * from './internal-types.js';
export * from './playground.js';
export * from './onboarding.js';

type JsonRecord = Record<string, unknown>;
type RequestOptions = {
  accessToken?: string;
  timeoutMs?: number;
  timezone?: string;
  language?: string;
  userUiRequest?: boolean;
};

export type TokenBundle = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type LoginResult =
  | { requires2fa: true; tempToken: string; maskedEmail?: string }
  | { requires2fa: false; tokens: TokenBundle; user: PortalUser };

export class Sub2ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly reason?: string;
  readonly metadata?: JsonRecord;

  constructor(input: {
    status: number;
    code?: string | number;
    message: string;
    reason?: string;
    metadata?: JsonRecord;
  }) {
    super(input.message);
    this.name = 'Sub2ApiError';
    this.status = input.status;
    this.code = String(input.code ?? `HTTP_${input.status}`);
    this.reason = input.reason;
    this.metadata = input.metadata;
  }
}

export class Sub2ApiClient {
  readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(baseUrl: string, fetcher: typeof fetch = fetch) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetcher = fetcher;
  }

  async request<T = unknown>(
    path: string,
    init: RequestInit = {},
    options: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, '')}`);
    const method = (init.method ?? 'GET').toUpperCase();
    if (method === 'GET' && !url.searchParams.has('timezone')) {
      url.searchParams.set('timezone', options.timezone ?? 'Asia/Kolkata');
    }

    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('Accept-Language', options.language ?? 'en');
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    if (options.accessToken) headers.set('Authorization', `Bearer ${options.accessToken}`);
    if (options.userUiRequest !== false) headers.set('X-User-UI-Request', '1');

    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        method,
        headers,
        redirect: 'manual',
        signal: init.signal ?? AbortSignal.timeout(options.timeoutMs ?? 12_000),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      throw new Sub2ApiError({
        status: timedOut ? 504 : 502,
        code: timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
        message: timedOut ? 'The account service took too long to respond.' : 'The account service is unavailable.',
      });
    }

    const contentType = response.headers.get('content-type') ?? '';
    const raw = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');
    const envelope = asRecord(raw);
    const envelopeCode = envelope.code;

    if (!response.ok || (envelopeCode !== undefined && Number(envelopeCode) !== 0)) {
      throw new Sub2ApiError({
        status: response.status || 502,
        code: typeof envelopeCode === 'string' || typeof envelopeCode === 'number' ? envelopeCode : undefined,
        message: stringValue(envelope.message) || stringValue(envelope.detail) || safeHttpMessage(response.status),
        reason: optionalString(envelope.reason),
        metadata: isRecord(envelope.metadata) ? envelope.metadata : undefined,
      });
    }

    return (envelope.data !== undefined ? envelope.data : raw) as T;
  }

  publicSettings() {
    return this.request<JsonRecord>('settings/public', {}, { userUiRequest: false, timeoutMs: 8_000 });
  }

  async login(input: { email: string; password: string; turnstileToken?: string }): Promise<LoginResult> {
    const data = asRecord(await this.request('auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        ...(input.turnstileToken ? { turnstile_token: input.turnstileToken } : {}),
      }),
    }, { timeoutMs: 15_000, userUiRequest: false }));

    if (booleanValue(data.requires_2fa)) {
      return {
        requires2fa: true,
        tempToken: stringValue(data.temp_token),
        maskedEmail: optionalString(data.user_email_masked),
      };
    }
    return {
      requires2fa: false,
      tokens: mapTokens(data),
      user: mapUser(asRecord(data.user)),
    };
  }

  async login2fa(input: { tempToken: string; code: string }): Promise<LoginResult> {
    const data = asRecord(await this.request('auth/login/2fa', {
      method: 'POST',
      body: JSON.stringify({ temp_token: input.tempToken, totp_code: input.code }),
    }, { timeoutMs: 15_000, userUiRequest: false }));
    return {
      requires2fa: false,
      tokens: mapTokens(data),
      user: mapUser(asRecord(data.user)),
    };
  }

  async refresh(refreshToken: string): Promise<TokenBundle> {
    const data = asRecord(await this.request('auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }, { timeoutMs: 12_000, userUiRequest: false }));
    return mapTokens(data);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.request('auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }, { timeoutMs: 8_000, userUiRequest: false });
  }
}

export function readCapabilities(settings: JsonRecord, writes: {
  keys: boolean;
  profile: boolean;
  redeem: boolean;
  announcements?: boolean;
}): CapabilityMap {
  return {
    registration: flag(settings, 'registration_enabled'),
    passwordReset: flag(settings, 'password_reset_enabled'),
    totp: flag(settings, 'totp_enabled'),
    passkeys: flag(settings, 'passkey_enabled'),
    google: flag(settings, 'google_oauth_enabled') || flag(settings, 'google_login_enabled'),
    payments: flag(settings, 'payment_enabled'),
    subscriptionPurchase: flag(settings, 'purchase_subscription_enabled'),
    modelPlaza: flag(settings, 'model_plaza_enabled'),
    availableChannels: flag(settings, 'available_channels_enabled'),
    channelMonitor: settings.channel_monitor_enabled !== false,
    // Only the installed v1 channel-monitor response has a verified adapter.
    channelMonitorMode: 'v1',
    affiliate: flag(settings, 'affiliate_enabled'),
    usageErrors: flag(settings, 'allow_user_view_error_requests'),
    promoCode: settings.promo_code_enabled !== false,
    keyWrites: writes.keys,
    profileWrites: writes.profile,
    redeemWrites: writes.redeem,
    announcementWrites: writes.announcements ?? false,
  };
}

export function mapUser(raw: JsonRecord): PortalUser {
  return {
    id: stringValue(raw.id),
    username: stringValue(raw.username) || optionalString(raw.name) || 'User',
    email: stringValue(raw.email),
    avatarUrl: optionalString(raw.avatar_url) ?? null,
    role: stringValue(raw.role) || 'user',
    status: stringValue(raw.status) || 'active',
    balance: decimalValue(raw.balance),
    concurrency: numberValue(raw.concurrency),
    createdAt: optionalString(raw.created_at),
    emailBound: optionalBoolean(raw.email_bound),
    balanceNotifyEnabled: optionalBoolean(raw.balance_notify_enabled),
    balanceNotifyThreshold: raw.balance_notify_threshold === undefined
      ? undefined
      : decimalValue(raw.balance_notify_threshold),
    runMode: optionalString(raw.run_mode),
  };
}

export function mapGroup(rawValue: unknown): InternalGroup {
  const raw = asRecord(rawValue);
  return {
    id: stringValue(raw.id),
    name: stringValue(raw.name) || 'Default',
    description: optionalString(raw.description),
    platform: optionalString(raw.platform),
    rateMultiplier: raw.rate_multiplier === undefined ? undefined : decimalValue(raw.rate_multiplier),
    subscriptionType: optionalString(raw.subscription_type),
  };
}

export function mapApiKey(rawValue: unknown): InternalApiKey {
  const raw = asRecord(rawValue);
  const key = stringValue(raw.key);
  const group = isRecord(raw.group) ? mapGroup(raw.group) : null;
  const statusRaw = stringValue(raw.status);
  const allowedStatuses = ['active', 'inactive', 'quota_exhausted', 'expired'] as const;
  const status = allowedStatuses.includes(statusRaw as (typeof allowedStatuses)[number])
    ? statusRaw as ApiKey['status']
    : 'inactive';
  return {
    id: stringValue(raw.id),
    name: stringValue(raw.name) || 'Untitled key',
    key,
    maskedKey: maskKey(key),
    status,
    groupId: raw.group_id === null ? null : optionalString(raw.group_id),
    group,
    currentConcurrency: numberValue(raw.current_concurrency),
    ipWhitelist: stringArray(raw.ip_whitelist),
    ipBlacklist: stringArray(raw.ip_blacklist),
    quota: positiveOptionalDecimal(raw.quota),
    quotaUsed: optionalDecimal(raw.quota_used),
    rateLimit5h: optionalDecimal(raw.rate_limit_5h),
    rateLimit1d: optionalDecimal(raw.rate_limit_1d),
    rateLimit7d: optionalDecimal(raw.rate_limit_7d),
    usage5h: optionalDecimal(raw.usage_5h),
    usage1d: optionalDecimal(raw.usage_1d),
    usage7d: optionalDecimal(raw.usage_7d),
    reset5hAt: optionalString(raw.reset_5h_at),
    reset1dAt: optionalString(raw.reset_1d_at),
    reset7dAt: optionalString(raw.reset_7d_at),
    expiresAt: optionalString(raw.expires_at),
    lastUsedAt: optionalString(raw.last_used_at),
    lastUsedIp: optionalString(raw.last_used_ip),
    createdAt: optionalString(raw.created_at),
  };
}

export function mapPaginated<T>(rawValue: unknown, mapper: (value: unknown) => T): Paginated<T> {
  const raw = asRecord(rawValue);
  const items = arrayValue(raw.items).map(mapper);
  const total = numberValue(raw.total, items.length);
  const page = numberValue(raw.page, 1);
  const pageSize = numberValue(raw.page_size, items.length || 20);
  const pages = numberValue(raw.pages, Math.max(1, Math.ceil(total / Math.max(pageSize, 1))));
  return { items, total, page, pageSize, pages };
}

export function mapDashboardStats(rawValue: unknown): DashboardStats {
  const raw = asRecord(rawValue);
  return {
    totalApiKeys: numberValue(raw.total_api_keys),
    activeApiKeys: numberValue(raw.active_api_keys),
    todayRequests: numberValue(raw.today_requests),
    totalRequests: numberValue(raw.total_requests),
    todayActualCost: decimalValue(raw.today_actual_cost),
    totalActualCost: decimalValue(raw.total_actual_cost),
    todayTokens: numberValue(raw.today_tokens),
    totalTokens: numberValue(raw.total_tokens),
    todayInputTokens: numberValue(raw.today_input_tokens),
    todayOutputTokens: numberValue(raw.today_output_tokens),
    todayCacheReadTokens: numberValue(raw.today_cache_read_tokens),
    todayCacheCreationTokens: numberValue(raw.today_cache_creation_tokens),
    totalInputTokens: numberValue(raw.total_input_tokens),
    totalOutputTokens: numberValue(raw.total_output_tokens),
    totalCacheReadTokens: numberValue(raw.total_cache_read_tokens),
    totalCacheCreationTokens: numberValue(raw.total_cache_creation_tokens),
    rpm: numberValue(raw.rpm),
    tpm: numberValue(raw.tpm),
    averageDurationMs: numberValue(raw.average_duration_ms),
    byPlatform: arrayValue(raw.by_platform).map((value) => {
      const item = asRecord(value);
      return {
        platform: stringValue(item.platform) || 'Other',
        totalActualCost: decimalValue(item.total_actual_cost),
        todayActualCost: decimalValue(item.today_actual_cost),
        totalRequests: numberValue(item.total_requests),
        totalTokens: numberValue(item.total_tokens),
      };
    }),
  };
}

export function mapTrend(rawValue: unknown): TrendPoint[] {
  const raw = asRecord(rawValue);
  const values = Array.isArray(rawValue) ? rawValue : arrayValue(raw.trend);
  return values.map((value, index) => {
    const item = asRecord(value);
    return {
      timestamp: stringValue(item.timestamp)
        || stringValue(item.date)
        || stringValue(item.time)
        || String(index),
      requests: numberValue(item.requests ?? item.request_count),
      tokens: numberValue(item.tokens ?? item.total_tokens),
      actualCost: decimalValue(item.actual_cost ?? item.cost),
    };
  });
}

export function mapModels(rawValue: unknown): ModelUsage[] {
  const raw = asRecord(rawValue);
  const values = Array.isArray(rawValue) ? rawValue : arrayValue(raw.models);
  return values.map((value) => {
    const item = asRecord(value);
    return {
      model: stringValue(item.model) || 'unknown',
      requests: numberValue(item.requests),
      totalTokens: numberValue(item.total_tokens),
      actualCost: decimalValue(item.actual_cost ?? item.cost),
    };
  });
}

export function calculateCacheHitRate(
  inputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
): number {
  const denominator = inputTokens + cacheReadTokens + cacheCreationTokens;
  return denominator > 0 ? (cacheReadTokens / denominator) * 100 : 0;
}

export function mapUsageRangeStats(rawValue: unknown): InternalUsageRangeStats {
  const raw = asRecord(rawValue);
  const inputTokens = numberValue(raw.total_input_tokens);
  const cacheReadTokens = numberValue(raw.total_cache_read_tokens);
  const cacheCreationTokens = numberValue(raw.total_cache_creation_tokens);
  return {
    totalRequests: numberValue(raw.total_requests),
    totalInputTokens: inputTokens,
    totalOutputTokens: numberValue(raw.total_output_tokens),
    totalCacheReadTokens: cacheReadTokens,
    totalCacheCreationTokens: cacheCreationTokens,
    totalTokens: numberValue(raw.total_tokens),
    actualCost: decimalValue(raw.total_actual_cost),
    standardCost: decimalValue(raw.total_cost),
    averageDurationMs: numberValue(raw.average_duration_ms),
    cacheHitRate: calculateCacheHitRate(inputTokens, cacheReadTokens, cacheCreationTokens),
  };
}

export function mapUsageTrend(rawValue: unknown): InternalUsageTrendPoint[] {
  const raw = asRecord(rawValue);
  const values = Array.isArray(rawValue) ? rawValue : arrayValue(raw.trend);
  return values.map((value, index) => {
    const item = asRecord(value);
    const inputTokens = numberValue(item.input_tokens);
    const cacheReadTokens = numberValue(item.cache_read_tokens);
    const cacheCreationTokens = numberValue(item.cache_creation_tokens);
    return {
      timestamp: stringValue(item.date)
        || stringValue(item.timestamp)
        || stringValue(item.time)
        || String(index),
      requests: numberValue(item.requests ?? item.request_count),
      inputTokens,
      outputTokens: numberValue(item.output_tokens),
      cacheCreationTokens,
      cacheReadTokens,
      totalTokens: numberValue(item.total_tokens),
      actualCost: decimalValue(item.actual_cost),
      standardCost: decimalValue(item.cost),
      cacheHitRate: calculateCacheHitRate(inputTokens, cacheReadTokens, cacheCreationTokens),
    };
  });
}

export function mapUsageModels(rawValue: unknown): InternalUsageModelBreakdown[] {
  const raw = asRecord(rawValue);
  const values = Array.isArray(rawValue) ? rawValue : arrayValue(raw.models);
  return values.map((value) => {
    const item = asRecord(value);
    return {
      model: stringValue(item.model) || 'unknown',
      requests: numberValue(item.requests),
      inputTokens: numberValue(item.input_tokens),
      outputTokens: numberValue(item.output_tokens),
      cacheCreationTokens: numberValue(item.cache_creation_tokens),
      cacheReadTokens: numberValue(item.cache_read_tokens),
      totalTokens: numberValue(item.total_tokens),
      actualCost: decimalValue(item.actual_cost),
      standardCost: decimalValue(item.cost),
    };
  });
}

export function mapUsageGroups(rawValue: unknown): InternalUsageGroupBreakdown[] {
  const raw = asRecord(rawValue);
  const values = Array.isArray(rawValue) ? rawValue : arrayValue(raw.groups);
  return values.map((value) => {
    const item = asRecord(value);
    return {
      groupId: stringValue(item.group_id),
      groupName: stringValue(item.group_name) || 'Ungrouped',
      requests: numberValue(item.requests),
      totalTokens: numberValue(item.total_tokens),
      actualCost: decimalValue(item.actual_cost),
      standardCost: decimalValue(item.cost),
    };
  });
}

export function mapUsageEndpoints(rawValue: unknown): InternalUsageEndpointBreakdown[] {
  const raw = asRecord(rawValue);
  const values = Array.isArray(rawValue) ? rawValue : arrayValue(raw.endpoints);
  return values.map((value) => {
    const item = asRecord(value);
    return {
      endpoint: stringValue(item.endpoint) || 'Unknown endpoint',
      requests: numberValue(item.requests),
      totalTokens: numberValue(item.total_tokens),
      actualCost: decimalValue(item.actual_cost),
      standardCost: decimalValue(item.cost),
    };
  });
}

export function mapUsageEvent(rawValue: unknown): InternalUsageEvent {
  const raw = asRecord(rawValue);
  const key = asRecord(raw.api_key);
  const group = asRecord(raw.group);
  return {
    id: stringValue(raw.id),
    createdAt: stringValue(raw.created_at),
    apiKeyName: optionalString(key.name ?? raw.key_name),
    model: stringValue(raw.model) || 'unknown',
    groupName: optionalString(group.name ?? raw.group_name),
    inboundEndpoint: optionalString(raw.inbound_endpoint),
    ipAddress: optionalString(raw.ip_address),
    requestType: optionalString(raw.request_type),
    stream: optionalBoolean(raw.stream),
    billingType: raw.billing_type === undefined ? undefined : numberValue(raw.billing_type),
    billingMode: optionalString(raw.billing_mode),
    inputTokens: numberValue(raw.input_tokens),
    outputTokens: numberValue(raw.output_tokens),
    cacheReadTokens: numberValue(raw.cache_read_tokens),
    cacheCreationTokens: numberValue(raw.cache_creation_tokens),
    actualCost: decimalValue(raw.actual_cost),
    totalCost: decimalValue(raw.total_cost),
    firstTokenMs: raw.first_token_ms === undefined ? undefined : numberValue(raw.first_token_ms),
    durationMs: raw.duration_ms === undefined ? undefined : numberValue(raw.duration_ms),
    statusCode: raw.status_code === undefined ? undefined : numberValue(raw.status_code),
  };
}

export function mapUsageError(rawValue: unknown): InternalUsageError {
  const raw = asRecord(rawValue);
  return {
    id: stringValue(raw.id),
    createdAt: stringValue(raw.created_at),
    keyName: optionalString(raw.key_name),
    model: stringValue(raw.model) || 'unknown',
    statusCode: numberValue(raw.status_code),
    category: stringValue(raw.category) || 'unknown',
    message: stringValue(raw.message) || 'Request failed',
    platform: optionalString(raw.platform),
    errorBody: optionalString(raw.error_body),
  };
}

export function mapChannel(rawValue: unknown): ChannelMonitor {
  const raw = asRecord(rawValue);
  return {
    id: stringValue(raw.id),
    name: stringValue(raw.name) || 'Channel',
    provider: stringValue(raw.provider) || 'Unknown',
    groupName: optionalString(raw.group_name),
    primaryModel: optionalString(raw.primary_model),
    primaryStatus: stringValue(raw.primary_status) || 'unknown',
    primaryLatencyMs: raw.primary_latency_ms === undefined ? undefined : numberValue(raw.primary_latency_ms),
    availability7d: raw.availability_7d === undefined ? undefined : numberValue(raw.availability_7d),
    models: arrayValue(raw.models).map((value) => {
      const item = asRecord(value);
      return {
        model: stringValue(item.model),
        latestStatus: stringValue(item.latest_status) || 'unknown',
        latestLatencyMs: item.latest_latency_ms === undefined ? undefined : numberValue(item.latest_latency_ms),
        availability7d: item.availability_7d === undefined ? undefined : numberValue(item.availability_7d),
        availability15d: item.availability_15d === undefined ? undefined : numberValue(item.availability_15d),
        availability30d: item.availability_30d === undefined ? undefined : numberValue(item.availability_30d),
      };
    }),
  };
}

export function mapSubscription(rawValue: unknown): InternalSubscription {
  const raw = asRecord(rawValue);
  const group = isRecord(raw.group) ? mapGroup(raw.group) : undefined;
  return {
    id: stringValue(raw.id),
    groupId: optionalString(raw.group_id),
    group,
    status: stringValue(raw.status) || 'unknown',
    startsAt: optionalString(raw.starts_at),
    expiresAt: optionalString(raw.expires_at),
    dailyUsageUsd: optionalDecimal(raw.daily_usage_usd),
    weeklyUsageUsd: optionalDecimal(raw.weekly_usage_usd),
    monthlyUsageUsd: optionalDecimal(raw.monthly_usage_usd),
    dailyLimitUsd: optionalDecimal(group ? asRecord(raw.group).daily_limit_usd : raw.daily_limit_usd),
    weeklyLimitUsd: optionalDecimal(group ? asRecord(raw.group).weekly_limit_usd : raw.weekly_limit_usd),
    monthlyLimitUsd: optionalDecimal(group ? asRecord(raw.group).monthly_limit_usd : raw.monthly_limit_usd),
  };
}

export function mapRedemption(rawValue: unknown): Redemption {
  const raw = asRecord(rawValue);
  return {
    id: stringValue(raw.id),
    code: optionalString(raw.code),
    type: stringValue(raw.type) || 'unknown',
    value: decimalValue(raw.value),
    validityDays: raw.validity_days === undefined ? undefined : numberValue(raw.validity_days),
    groupName: optionalString(asRecord(raw.group).name ?? raw.group_name),
    usedAt: optionalString(raw.used_at),
    notes: optionalString(raw.notes),
  };
}

export function mapRedeemResult(rawValue: unknown): RedeemResult {
  const raw = asRecord(rawValue);
  return {
    message: stringValue(raw.message) || 'Code redeemed.',
    type: stringValue(raw.type) || 'unknown',
    value: decimalValue(raw.value),
    groupName: optionalString(raw.group_name),
    validityDays: raw.validity_days === undefined ? undefined : numberValue(raw.validity_days),
    newBalance: optionalDecimal(raw.new_balance),
    newConcurrency: raw.new_concurrency === undefined ? undefined : numberValue(raw.new_concurrency),
  };
}

export function mapAnnouncement(rawValue: unknown): Announcement {
  const raw = asRecord(rawValue);
  return {
    id: stringValue(raw.id),
    title: stringValue(raw.title) || 'Service announcement',
    content: stringValue(raw.content ?? raw.message),
    level: optionalString(raw.level ?? raw.type),
    createdAt: optionalString(raw.created_at),
    notifyMode: optionalString(raw.notify_mode),
    readAt: optionalString(raw.read_at),
  };
}

export function maskKey(key: string): string {
  if (!key) return '••••••••••••';
  if (key.length <= 12) return `${key.slice(0, 3)}••••${key.slice(-3)}`;
  return `${key.slice(0, 7)}••••••••${key.slice(-4)}`;
}

export function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '';
}

export function optionalString(value: unknown): string | undefined {
  const valueString = stringValue(value);
  return valueString || undefined;
}

export function decimalValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return stringValue(value) || '0';
}

export function optionalDecimal(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return decimalValue(value);
}

function positiveOptionalDecimal(value: unknown): string | null | undefined {
  const decimal = optionalDecimal(value);
  if (decimal === null || decimal === undefined) return decimal;
  const numeric = Number(decimal);
  return Number.isFinite(numeric) && numeric > 0 ? decimal : null;
}

export function numberValue(value: unknown, fallback = 0): number {
  const converted = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(converted) ? converted : fallback;
}

export function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function optionalBoolean(value: unknown): boolean | undefined {
  return value === undefined || value === null ? undefined : booleanValue(value);
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  if (typeof value === 'string') return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function flag(settings: JsonRecord, key: string): boolean {
  return booleanValue(settings[key]);
}

function mapTokens(raw: JsonRecord): TokenBundle {
  const expiresIn = Math.max(30, numberValue(raw.expires_in, 900));
  return {
    accessToken: stringValue(raw.access_token),
    refreshToken: stringValue(raw.refresh_token),
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

function safeHttpMessage(status: number): string {
  if (status === 400) return 'The request could not be processed.';
  if (status === 401) return 'Your session is no longer valid.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested account resource was not found.';
  if (status === 409) return 'The request conflicts with the current account state.';
  if (status === 429) return 'Too many requests. Please try again shortly.';
  return status >= 500 ? 'The account service encountered an error.' : 'The request failed.';
}
