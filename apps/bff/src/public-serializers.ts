import type {
  Announcement, ApiKey, CapabilityMap, ChannelModelStatus, ChannelMonitor,
  DashboardStats, Group, PortalUser, RedeemResult, Redemption, Subscription,
  UsageEndpointBreakdown, UsageError, UsageEvent, UsageGroupBreakdown,
  UsageModelBreakdown, UsageRangeStats, UsageTrendPoint,
} from '@kineticrouter/portal-contract';
import type { InternalApiKey, InternalGroup, InternalSubscription } from '@kineticrouter/sub2api-client';
import { toPublicText, toPublicUpstreamMessage } from './public-errors.js';

// Public responses are deliberately constructed field by field. Types alone do
// not remove extra runtime fields added by the upstream account service.
function optionalText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : toPublicText(value, '');
}

export function publicGroup(group: InternalGroup): Group {
  return {
    id: group.id,
    name: toPublicText(group.name, 'Default'),
    description: optionalText(group.description),
    platform: optionalText(group.platform),
    subscriptionType: group.subscriptionType,
  };
}

export function publicApiKey(key: InternalApiKey): ApiKey {
  return {
    id: key.id, name: key.name, key: key.key, maskedKey: key.maskedKey, status: key.status,
    groupId: key.groupId,
    group: key.group ? publicGroup(key.group) : key.group,
    currentConcurrency: key.currentConcurrency,
    ipWhitelist: [...key.ipWhitelist], ipBlacklist: [...key.ipBlacklist],
    quota: key.quota, quotaUsed: key.quotaUsed,
    rateLimit5h: key.rateLimit5h, rateLimit1d: key.rateLimit1d, rateLimit7d: key.rateLimit7d,
    usage5h: key.usage5h, usage1d: key.usage1d, usage7d: key.usage7d,
    reset5hAt: key.reset5hAt, reset1dAt: key.reset1dAt, reset7dAt: key.reset7dAt,
    expiresAt: key.expiresAt, lastUsedAt: key.lastUsedAt, lastUsedIp: key.lastUsedIp,
    createdAt: key.createdAt,
    todayActualCost: key.todayActualCost, totalActualCost: key.totalActualCost,
  };
}

export function publicSubscription(subscription: InternalSubscription): Subscription {
  return {
    id: subscription.id, groupId: subscription.groupId,
    group: subscription.group ? publicGroup(subscription.group) : undefined,
    status: subscription.status, startsAt: subscription.startsAt, expiresAt: subscription.expiresAt,
    dailyUsageUsd: subscription.dailyUsageUsd, weeklyUsageUsd: subscription.weeklyUsageUsd,
    monthlyUsageUsd: subscription.monthlyUsageUsd,
    dailyLimitUsd: subscription.dailyLimitUsd, weeklyLimitUsd: subscription.weeklyLimitUsd,
    monthlyLimitUsd: subscription.monthlyLimitUsd,
  };
}

export function publicUsageRangeStats(stats: UsageRangeStats): UsageRangeStats {
  return {
    totalRequests: stats.totalRequests,
    totalInputTokens: stats.totalInputTokens, totalOutputTokens: stats.totalOutputTokens,
    totalCacheReadTokens: stats.totalCacheReadTokens, totalCacheCreationTokens: stats.totalCacheCreationTokens,
    totalTokens: stats.totalTokens, actualCost: stats.actualCost,
    averageDurationMs: stats.averageDurationMs, cacheHitRate: stats.cacheHitRate,
  };
}

export function publicUsageTrendPoint(point: UsageTrendPoint): UsageTrendPoint {
  return {
    timestamp: point.timestamp, requests: point.requests,
    inputTokens: point.inputTokens, outputTokens: point.outputTokens,
    cacheCreationTokens: point.cacheCreationTokens, cacheReadTokens: point.cacheReadTokens,
    totalTokens: point.totalTokens, actualCost: point.actualCost, cacheHitRate: point.cacheHitRate,
  };
}

export function publicUsageModel(model: UsageModelBreakdown): UsageModelBreakdown {
  return {
    model: model.model, requests: model.requests,
    inputTokens: model.inputTokens, outputTokens: model.outputTokens,
    cacheCreationTokens: model.cacheCreationTokens, cacheReadTokens: model.cacheReadTokens,
    totalTokens: model.totalTokens, actualCost: model.actualCost,
  };
}

export function publicUsageGroup(group: UsageGroupBreakdown): UsageGroupBreakdown {
  return {
    groupId: group.groupId, groupName: toPublicText(group.groupName, 'Ungrouped'),
    requests: group.requests, totalTokens: group.totalTokens, actualCost: group.actualCost,
  };
}

export function publicUsageEndpoint(endpoint: UsageEndpointBreakdown): UsageEndpointBreakdown {
  return {
    endpoint: endpoint.endpoint, requests: endpoint.requests,
    totalTokens: endpoint.totalTokens, actualCost: endpoint.actualCost,
  };
}

export function publicUsageEvent(event: UsageEvent): UsageEvent {
  return {
    id: event.id, createdAt: event.createdAt, apiKeyName: event.apiKeyName, model: event.model,
    groupName: optionalText(event.groupName), inboundEndpoint: event.inboundEndpoint,
    ipAddress: event.ipAddress, requestType: event.requestType, stream: event.stream,
    billingType: event.billingType, billingMode: event.billingMode,
    inputTokens: event.inputTokens, outputTokens: event.outputTokens,
    cacheReadTokens: event.cacheReadTokens, cacheCreationTokens: event.cacheCreationTokens,
    actualCost: event.actualCost, firstTokenMs: event.firstTokenMs,
    durationMs: event.durationMs, statusCode: event.statusCode,
  };
}

export function publicUsageError(error: UsageError): UsageError {
  return {
    id: error.id, createdAt: error.createdAt, keyName: error.keyName, model: error.model,
    statusCode: error.statusCode, category: toPublicText(error.category, 'request_error'),
    message: toPublicUpstreamMessage(error.message, error.statusCode),
    platform: optionalText(error.platform),
  };
}

function publicChannelModel(model: ChannelModelStatus): ChannelModelStatus {
  return {
    model: model.model, latestStatus: model.latestStatus, latestLatencyMs: model.latestLatencyMs,
    availability7d: model.availability7d, availability15d: model.availability15d, availability30d: model.availability30d,
  };
}

export function publicChannel(channel: ChannelMonitor): ChannelMonitor {
  return {
    id: channel.id, name: toPublicText(channel.name, 'Channel'), provider: toPublicText(channel.provider, 'Provider'),
    groupName: optionalText(channel.groupName), primaryModel: channel.primaryModel,
    primaryStatus: channel.primaryStatus, primaryLatencyMs: channel.primaryLatencyMs,
    availability7d: channel.availability7d, models: channel.models?.map(publicChannelModel),
  };
}

export function publicRedemption(redemption: Redemption): Redemption {
  return {
    id: redemption.id, code: redemption.code, type: redemption.type, value: redemption.value,
    validityDays: redemption.validityDays, groupName: optionalText(redemption.groupName),
    usedAt: redemption.usedAt, notes: optionalText(redemption.notes),
  };
}

export function publicRedeemResult(result: RedeemResult): RedeemResult {
  return {
    message: toPublicText(result.message, 'Code redeemed.', 500),
    type: result.type, value: result.value, groupName: optionalText(result.groupName),
    validityDays: result.validityDays, newBalance: result.newBalance, newConcurrency: result.newConcurrency,
  };
}

export function publicAnnouncement(announcement: Announcement): Announcement {
  return {
    id: announcement.id, title: toPublicText(announcement.title, 'Service announcement'),
    content: toPublicText(announcement.content, ''), level: announcement.level,
    createdAt: announcement.createdAt, notifyMode: announcement.notifyMode, readAt: announcement.readAt,
  };
}

export function publicUser(user: PortalUser): PortalUser {
  return {
    id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl,
    role: user.role, status: user.status, balance: user.balance, concurrency: user.concurrency,
    createdAt: user.createdAt, emailBound: user.emailBound,
    balanceNotifyEnabled: user.balanceNotifyEnabled, balanceNotifyThreshold: user.balanceNotifyThreshold,
    runMode: user.runMode,
  };
}

export function publicDashboardStats(stats: DashboardStats): DashboardStats {
  return {
    totalApiKeys: stats.totalApiKeys, activeApiKeys: stats.activeApiKeys,
    todayRequests: stats.todayRequests, totalRequests: stats.totalRequests,
    todayActualCost: stats.todayActualCost, totalActualCost: stats.totalActualCost,
    todayTokens: stats.todayTokens, totalTokens: stats.totalTokens,
    todayInputTokens: stats.todayInputTokens, todayOutputTokens: stats.todayOutputTokens,
    todayCacheReadTokens: stats.todayCacheReadTokens, todayCacheCreationTokens: stats.todayCacheCreationTokens,
    totalInputTokens: stats.totalInputTokens, totalOutputTokens: stats.totalOutputTokens,
    totalCacheReadTokens: stats.totalCacheReadTokens, totalCacheCreationTokens: stats.totalCacheCreationTokens,
    rpm: stats.rpm, tpm: stats.tpm, averageDurationMs: stats.averageDurationMs,
    byPlatform: stats.byPlatform.map(platform => ({
      platform: platform.platform, totalActualCost: platform.totalActualCost,
      todayActualCost: platform.todayActualCost, totalRequests: platform.totalRequests, totalTokens: platform.totalTokens,
    })),
  };
}

export function publicCapabilities(capabilities: CapabilityMap): CapabilityMap {
  return {
    registration: capabilities.registration, passwordReset: capabilities.passwordReset,
    totp: capabilities.totp, passkeys: capabilities.passkeys, google: capabilities.google,
    payments: capabilities.payments, subscriptionPurchase: capabilities.subscriptionPurchase,
    modelPlaza: capabilities.modelPlaza, availableChannels: capabilities.availableChannels,
    channelMonitor: capabilities.channelMonitor, channelMonitorMode: capabilities.channelMonitorMode,
    affiliate: capabilities.affiliate, usageErrors: capabilities.usageErrors, promoCode: capabilities.promoCode,
    keyWrites: capabilities.keyWrites, profileWrites: capabilities.profileWrites,
    redeemWrites: capabilities.redeemWrites, announcementWrites: capabilities.announcementWrites,
  };
}
