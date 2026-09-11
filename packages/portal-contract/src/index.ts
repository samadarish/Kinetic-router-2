import { z } from 'zod';
export * from './onboarding.js';
export * from './analytics.js';
export * from './playground.js';
export * from './conversations.js';
export const idSchema = z.union([z.string(), z.number()]).transform(String);
export const moneySchema = z.union([z.string(), z.number()]).transform(String);
export const dateSchema = z.string().nullable().optional();
export const loginInputSchema = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(512),
    turnstileToken: z.string().max(4096).optional(),
});
export const totpInputSchema = z.object({
    tempToken: z.string().min(1).max(4096),
    code: z.string().regex(/^\d{6}$/),
});
export const profileUpdateSchema = z.object({
    username: z.string().trim().min(1).max(100).optional(),
    avatarUrl: z.string().url().max(2048).nullable().optional(),
    balanceNotifyEnabled: z.boolean().optional(),
    balanceNotifyThreshold: z.number().min(0).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const passwordUpdateSchema = z.object({
    oldPassword: z.string().min(1).max(512),
    newPassword: z.string().min(8).max(512),
});
const ipListSchema = z.array(z.string().trim().min(1).max(64)).max(100);
const nullableNumberSchema = z.number().nonnegative().nullable();
export const createApiKeySchema = z.object({
    name: z.string().trim().min(1).max(100),
    groupId: idSchema.nullable().optional(),
    customKey: z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/).optional(),
    ipWhitelist: ipListSchema.optional(),
    ipBlacklist: ipListSchema.optional(),
    quota: nullableNumberSchema.optional(),
    expiresInDays: z.number().int().positive().max(3650).nullable().optional(),
    rateLimit5h: nullableNumberSchema.optional(),
    rateLimit1d: nullableNumberSchema.optional(),
    rateLimit7d: nullableNumberSchema.optional(),
});
export const updateApiKeySchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    groupId: idSchema.nullable().optional(),
    ipWhitelist: ipListSchema.optional(),
    ipBlacklist: ipListSchema.optional(),
    quota: nullableNumberSchema.optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    rateLimit5h: nullableNumberSchema.optional(),
    rateLimit1d: nullableNumberSchema.optional(),
    rateLimit7d: nullableNumberSchema.optional(),
    status: z.enum(['active', 'inactive']).optional(),
    resetQuota: z.boolean().optional(),
    resetRateLimitUsage: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const redeemInputSchema = z.object({
    code: z.string().trim().min(1).max(128),
});
export const paginationSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;
}, 'Enter a valid calendar date');
export const usageSummaryQuerySchema = z.object({
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
}).refine((value) => value.startDate <= value.endDate, {
    message: 'Start date must be on or before end date',
    path: ['endDate'],
}).refine((value) => {
    const difference = Date.parse(`${value.endDate}T00:00:00Z`) - Date.parse(`${value.startDate}T00:00:00Z`);
    return difference <= 365 * 86_400_000;
}, {
    message: 'Usage ranges cannot exceed 366 calendar days',
    path: ['endDate'],
});
const usageMoneySchema = moneySchema.refine((value) => Number.isFinite(Number(value)), 'Enter a finite money value');
const usageRangeStatsSchema = z.object({
    totalRequests: z.number().finite().nonnegative(),
    totalInputTokens: z.number().finite().nonnegative(),
    totalOutputTokens: z.number().finite().nonnegative(),
    totalCacheReadTokens: z.number().finite().nonnegative(),
    totalCacheCreationTokens: z.number().finite().nonnegative(),
    totalTokens: z.number().finite().nonnegative(),
    actualCost: usageMoneySchema,
    averageDurationMs: z.number().finite().nonnegative(),
    cacheHitRate: z.number().finite().min(0).max(100),
});
const usageTrendPointSchema = z.object({
    timestamp: z.string(),
    requests: z.number().finite().nonnegative(),
    inputTokens: z.number().finite().nonnegative(),
    outputTokens: z.number().finite().nonnegative(),
    cacheCreationTokens: z.number().finite().nonnegative(),
    cacheReadTokens: z.number().finite().nonnegative(),
    totalTokens: z.number().finite().nonnegative(),
    actualCost: usageMoneySchema,
    cacheHitRate: z.number().finite().min(0).max(100),
});
const usageModelBreakdownSchema = z.object({
    model: z.string(),
    requests: z.number().finite().nonnegative(),
    inputTokens: z.number().finite().nonnegative(),
    outputTokens: z.number().finite().nonnegative(),
    cacheCreationTokens: z.number().finite().nonnegative(),
    cacheReadTokens: z.number().finite().nonnegative(),
    totalTokens: z.number().finite().nonnegative(),
    actualCost: usageMoneySchema,
});
const usageDistributionBreakdownSchema = z.object({
    requests: z.number().finite().nonnegative(),
    totalTokens: z.number().finite().nonnegative(),
    actualCost: usageMoneySchema,
});
export const usageSummarySchema = z.object({
    range: z.object({
        startDate: calendarDateSchema,
        endDate: calendarDateSchema,
        granularity: z.enum(['hour', 'day']),
        timezone: z.string().min(1),
    }),
    stats: usageRangeStatsSchema,
    trend: z.array(usageTrendPointSchema),
    models: z.array(usageModelBreakdownSchema),
    groups: z.array(usageDistributionBreakdownSchema.extend({
        groupId: z.string(),
        groupName: z.string(),
    })),
    endpoints: z.array(usageDistributionBreakdownSchema.extend({
        endpoint: z.string(),
    })),
});

export type ApiSuccess<T> = {
    ok: true;
    data: T;
    requestId: string;
};

export type ApiFailure = {
    ok: false;
    error: {
        code: string;
        message: string;
        reason?: string;
        metadata?: Record<string, unknown>;
    };
    requestId: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type CapabilityMap = {
    registration: boolean;
    passwordReset: boolean;
    totp: boolean;
    passkeys: boolean;
    google: boolean;
    payments: boolean;
    subscriptionPurchase: boolean;
    modelPlaza: boolean;
    availableChannels: boolean;
    channelMonitor: boolean;
    channelMonitorMode: 'v1' | 'v2';
    affiliate: boolean;
    usageErrors: boolean;
    promoCode: boolean;
    keyWrites: boolean;
    profileWrites: boolean;
    redeemWrites: boolean;
    announcementWrites: boolean;
};

export type PortalConfig = {
    brand: 'kineticRouter';
    apiBaseUrl: string;
    defaultTheme: 'dark';
    capabilities: CapabilityMap;
    serverTimezone: string;
};

export type SessionView = {
    authenticated: boolean;
    playgroundEnabled: boolean;
    csrfToken?: string;
    user?: PortalUser;
    capabilities: CapabilityMap;
};

export type PortalUser = {
    id: string;
    username: string;
    email: string;
    avatarUrl: string | null;
    role: string;
    status: string;
    balance: string;
    concurrency: number;
    createdAt?: string | null;
    emailBound?: boolean;
    balanceNotifyEnabled?: boolean;
    balanceNotifyThreshold?: string;
    runMode?: string;
};

export type Group = {
    id: string;
    name: string;
    description?: string;
    platform?: string;
    subscriptionType?: string;
};

export type ApiKeyStatus = 'active' | 'inactive' | 'quota_exhausted' | 'expired';

export type ApiKey = {
    id: string;
    name: string;
    key: string;
    maskedKey: string;
    status: ApiKeyStatus;
    groupId?: string | null;
    group?: Group | null;
    currentConcurrency: number;
    ipWhitelist: string[];
    ipBlacklist: string[];
    quota?: string | null;
    quotaUsed?: string | null;
    rateLimit5h?: string | null;
    rateLimit1d?: string | null;
    rateLimit7d?: string | null;
    usage5h?: string | null;
    usage1d?: string | null;
    usage7d?: string | null;
    reset5hAt?: string | null;
    reset1dAt?: string | null;
    reset7dAt?: string | null;
    expiresAt?: string | null;
    lastUsedAt?: string | null;
    lastUsedIp?: string | null;
    createdAt?: string | null;
    todayActualCost?: string;
    totalActualCost?: string;
};

export type ApiKeyCreateResult = ApiKey | { created: true };
export type ApiKeyUpdateResult = ApiKey | { updated: true };

export type Paginated<T> = {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    pages: number;
};

export type PlatformUsage = {
    platform: string;
    totalActualCost: string;
    todayActualCost: string;
    totalRequests: number;
    totalTokens: number;
};

export type DashboardStats = {
    totalApiKeys: number;
    activeApiKeys: number;
    todayRequests: number;
    totalRequests: number;
    todayActualCost: string;
    totalActualCost: string;
    todayTokens: number;
    totalTokens: number;
    todayInputTokens: number;
    todayOutputTokens: number;
    todayCacheReadTokens: number;
    todayCacheCreationTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
    rpm: number;
    tpm: number;
    averageDurationMs: number;
    byPlatform: PlatformUsage[];
};

export type TrendPoint = {
    timestamp: string;
    requests: number;
    tokens: number;
    actualCost: string;
};

export type ModelUsage = {
    model: string;
    requests: number;
    totalTokens: number;
    actualCost: string;
};

export type UsageRangeStats = {
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
    totalTokens: number;
    actualCost: string;
    averageDurationMs: number;
    cacheHitRate: number;
};

export type UsageTrendPoint = {
    timestamp: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    actualCost: string;
    cacheHitRate: number;
};

export type UsageModelBreakdown = {
    model: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    actualCost: string;
};

export type UsageGroupBreakdown = {
    groupId: string;
    groupName: string;
    requests: number;
    totalTokens: number;
    actualCost: string;
};

export type UsageEndpointBreakdown = {
    endpoint: string;
    requests: number;
    totalTokens: number;
    actualCost: string;
};

export type UsageSummary = {
    range: {
        startDate: string;
        endDate: string;
        granularity: 'hour' | 'day';
        timezone: string;
    };
    stats: UsageRangeStats;
    trend: UsageTrendPoint[];
    models: UsageModelBreakdown[];
    groups: UsageGroupBreakdown[];
    endpoints: UsageEndpointBreakdown[];
};

export type Dashboard = {
    user: PortalUser;
    stats: DashboardStats;
};

export type UsageEvent = {
    id: string;
    createdAt: string;
    apiKeyName?: string;
    model: string;
    groupName?: string;
    inboundEndpoint?: string;
    ipAddress?: string;
    requestType?: string;
    stream?: boolean;
    billingType?: number;
    billingMode?: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    actualCost: string;
    firstTokenMs?: number;
    durationMs?: number;
    statusCode?: number;
};

export type UsageError = {
    id: string;
    createdAt: string;
    keyName?: string;
    model: string;
    statusCode: number;
    category: string;
    message: string;
    platform?: string;
};

export type ChannelModelStatus = {
    model: string;
    latestStatus: string;
    latestLatencyMs?: number;
    availability7d?: number;
    availability15d?: number;
    availability30d?: number;
};

export type ChannelMonitor = {
    id: string;
    name: string;
    provider: string;
    groupName?: string;
    primaryModel?: string;
    primaryStatus: string;
    primaryLatencyMs?: number;
    availability7d?: number;
    models?: ChannelModelStatus[];
};

export type Subscription = {
    id: string;
    groupId?: string;
    group?: Group;
    status: string;
    startsAt?: string | null;
    expiresAt?: string | null;
    dailyUsageUsd?: string | null;
    weeklyUsageUsd?: string | null;
    monthlyUsageUsd?: string | null;
    dailyLimitUsd?: string | null;
    weeklyLimitUsd?: string | null;
    monthlyLimitUsd?: string | null;
};

export type Redemption = {
    id: string;
    code?: string;
    type: string;
    value: string;
    validityDays?: number | null;
    groupName?: string;
    usedAt?: string;
    notes?: string;
};

export type RedeemResult = {
    message: string;
    type: string;
    value: string;
    groupName?: string;
    validityDays?: number;
    newBalance?: string | null;
    newConcurrency?: number;
};

export type Announcement = {
    id: string;
    title: string;
    content: string;
    level?: string;
    createdAt?: string;
    notifyMode?: string;
    readAt?: string | null;
};

export type PublicSessionPresentation = {
    authenticated: boolean;
    playgroundEnabled: boolean;
    user?: Pick<PortalUser, 'id' | 'username' | 'avatarUrl'>;
};
export * from './website.js';
