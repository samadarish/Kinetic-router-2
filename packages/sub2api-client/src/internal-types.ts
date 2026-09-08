import type {
  ApiKey, Group, Subscription, UsageEndpointBreakdown, UsageError, UsageEvent,
  UsageGroupBreakdown, UsageModelBreakdown, UsageRangeStats, UsageTrendPoint,
} from '@kineticrouter/portal-contract';

// These account-service values are retained for server-side consumers only.
// Public BFF serializers must explicitly select the customer contract fields.
export type InternalGroup = Group & { rateMultiplier?: string };
export type InternalApiKey = Omit<ApiKey, 'group'> & { group?: InternalGroup | null };
export type InternalSubscription = Omit<Subscription, 'group'> & { group?: InternalGroup };
export type InternalUsageRangeStats = UsageRangeStats & { standardCost: string };
export type InternalUsageTrendPoint = UsageTrendPoint & { standardCost: string };
export type InternalUsageModelBreakdown = UsageModelBreakdown & { standardCost: string };
export type InternalUsageGroupBreakdown = UsageGroupBreakdown & { standardCost: string };
export type InternalUsageEndpointBreakdown = UsageEndpointBreakdown & { standardCost: string };
export type InternalUsageEvent = UsageEvent & { totalCost: string };
export type InternalUsageError = UsageError & { errorBody?: string };
